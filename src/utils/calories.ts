import { HrSample, PauseInterval, RoutePoint, UserProfile, WorkoutMode } from '../types';
import { activityOf } from '../workout/activities';
import { haversineDistanceMeters } from './geo';

// Калории тренировки. Показываем АКТИВНЫЕ: то, что тренировка добавила сверх покоя. Покой
// (около 1 ккал на кг в час) тело тратит и без неё, а в итоге тренировки он раздувает цифру.
//
// Метод выбирается по тому, какой сигнал надёжнее для вида тренировки:
// - с GPS (бег, ходьба, велосипед): по скорости и весу. Пульс на таких нагрузках растёт от
//   жары, кофе и остановок сильнее, чем расход, и оценка по нему завышала вдвое. По скорости
//   считает и Strava (скорость, вес, время в движении), а не по пульсу;
// - без GPS (зал, йога, дорожка, прочее): по пульсу, формула Keytel с 2005 года. Скорости у
//   нас нет, и это грубая оценка: на низком пульсе формула завышает, поэтому ниже порога расход
//   считается покоем, а между порогами нарастает плавно.
// Куски тренировки с GPS, где скорость определить нельзя (пропал сигнал), добираются по пульсу.
//
// Где что взято:
// - ходьба и бег: уравнения ACSM для VO₂ (мл O₂ на кг в минуту) = 0,1·v + 3,5 для ходьбы,
//   0,2·v + 3,5 для бега, v в м/мин; на скоростях между ними плавный переход. Подъёмов не
//   учитываем (высоты в маршруте нет), на тропе с набором высоты это занижает;
// - велосипед: MET по скорости из Compendium of Physical Activities (коды 01010-01060);
// - 1 л O₂ ≈ 5 ккал, покой 3,5 мл/кг/мин, 1 MET = 3,5 мл/кг/мин.
// Погрешность таких оценок 10-20 %, поэтому в интерфейсе стоит «≈».

/** Покой, мл O₂ на кг в минуту (1 MET). */
const REST_VO2 = 3.5;
/** Ккал на мл O₂. */
const KCAL_PER_ML_O2 = 0.005;

/** Окно, по которому считается скорость: дольше шума GPS, короче манёвра. */
const WINDOW_MS = 30_000;
/** Окно длиннее считается дырой в маршруте: скорость по нему ничего не говорит. */
const MAX_WINDOW_MS = 10 * 60_000;
/** Дыра до первой и после последней точки маршрута, меньше которой не заводим отдельный кусок. */
const EDGE_GAP_MS = 60_000;
/** Медленнее считаем стоянкой: шум GPS у стоящего человека не должен давать «скорость». */
const STANDING_M_PER_MIN = 10;
/** Быстрее пешком и бегом невозможно: это скачок GPS, считаем по пульсу. */
const MAX_FOOT_M_PER_MIN = 500;
/** На велосипеде потолок выше: спуск. */
const MAX_BIKE_M_PER_MIN = 1500;
/** До первой скорости (м/мин) считаем ходьбой, с второй бегом, между ними плавный переход. */
const WALK_MAX_M_PER_MIN = 100;
const RUN_MIN_M_PER_MIN = 134;

/** Ниже этого пульса расход по пульсу считаем покоем: формула Keytel там не определена. */
export const HR_FLOOR_BPM = 90;
/** С этого пульса оценка по пульсу берётся целиком, между порогами нарастает линейно. */
export const HR_FULL_BPM = 120;
/** Промежуток между показаниями пульса длиннее считается потерей связи и пропускается. */
const MAX_HR_GAP_MS = 5 * 60_000;

/** Всё, что нужно расчёту. */
export interface CalorieInput {
  mode: WorkoutMode;
  hrSamples: HrSample[];
  /** Маршрут, если вид с GPS. */
  route?: RoutePoint[];
  /** Ручные паузы: время в них не считается. */
  pauses?: PauseInterval[];
  /** Без профиля (вес) калории не считаются. */
  profile: UserProfile | null;
}

/** Подпись калорий: знак «примерно» перед числом. */
export function formatKcal(kcal: number): string {
  return `≈${kcal}`;
}

/** Активные ккал в минуту по VO₂ (мл/кг/мин, полный) и весу. */
function netKcalPerMin(vo2: number, weightKg: number): number {
  return Math.max(0, vo2 - REST_VO2) * weightKg * KCAL_PER_ML_O2;
}

/** VO₂ пешком и бегом по скорости, мл/кг/мин. */
function footVo2(metersPerMin: number): number {
  const walk = 0.1 * metersPerMin + REST_VO2;
  const run = 0.2 * metersPerMin + REST_VO2;
  if (metersPerMin <= WALK_MAX_M_PER_MIN) return walk;
  if (metersPerMin >= RUN_MIN_M_PER_MIN) return run;
  const k = (metersPerMin - WALK_MAX_M_PER_MIN) / (RUN_MIN_M_PER_MIN - WALK_MAX_M_PER_MIN);
  return walk + (run - walk) * k;
}

/** MET велосипеда по скорости, км/ч (Compendium, коды 01010-01060). */
function cyclingMet(kmh: number): number {
  if (kmh < 16.1) return 4.0;
  if (kmh < 19.3) return 6.8;
  if (kmh < 22.5) return 8.0;
  if (kmh < 25.8) return 10.0;
  if (kmh < 32.2) return 12.0;
  return 16.8;
}

/** Активные ккал в минуту по скорости для вида тренировки. */
function speedKcalPerMin(mode: WorkoutMode, metersPerMin: number, weightKg: number): number {
  if (metersPerMin < STANDING_M_PER_MIN) return 0;
  if (mode === 'cycling') {
    const met = cyclingMet((metersPerMin * 60) / 1000);
    return Math.max(0, met - 1) * weightKg / 60;
  }
  return netKcalPerMin(footVo2(metersPerMin), weightKg);
}

/** Активные ккал в минуту по пульсу: Keytel за вычетом покоя, с плавным входом между порогами. */
function hrKcalPerMin(bpm: number, profile: UserProfile): number {
  if (bpm <= HR_FLOOR_BPM) return 0;
  const { weightKg, age, gender } = profile;
  // Keytel даёт кДж в минуту; делим на 4,184.
  const kJPerMin =
    gender === 'female'
      ? -20.4022 + 0.4472 * bpm - 0.1263 * weightKg + 0.074 * age
      : -55.0969 + 0.6309 * bpm + 0.1988 * weightKg + 0.2017 * age;
  const restKcalPerMin = (REST_VO2 * weightKg * KCAL_PER_ML_O2);
  const net = Math.max(0, kJPerMin) / 4.184 - restKcalPerMin;
  const ramp = Math.min(1, (bpm - HR_FLOOR_BPM) / (HR_FULL_BPM - HR_FLOOR_BPM));
  return Math.max(0, net) * ramp;
}

/** Сколько миллисекунд отрезка [from, to] лежит вне пауз. */
function activeMs(from: number, to: number, pauses: PauseInterval[]): number {
  let ms = Math.max(0, to - from);
  for (const p of pauses) {
    const overlap = Math.min(to, p.end) - Math.max(from, p.start);
    if (overlap > 0) ms -= overlap;
  }
  return Math.max(0, ms);
}

/** Активные ккал по пульсу в промежутке [from, to] (мс с эпохи). */
function hrKcalBetween(samples: HrSample[], profile: UserProfile, from: number, to: number, pauses: PauseInterval[]): number {
  let kcal = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = Math.max(samples[i - 1].t, from);
    const b = Math.min(samples[i].t, to);
    if (b <= a) continue;
    if (samples[i].t - samples[i - 1].t > MAX_HR_GAP_MS) continue;
    kcal += hrKcalPerMin(samples[i].bpm, profile) * (activeMs(a, b, pauses) / 60000);
  }
  return kcal;
}

/**
 * Активные калории тренировки. Без профиля или без данных `undefined`, а не ноль.
 * Вид с GPS считается по скорости, остальное и дыры в маршруте по пульсу.
 */
export function computeWorkoutCalories(input: CalorieInput): number | undefined {
  const { mode, hrSamples, route, profile } = input;
  if (!profile) return undefined;
  const pauses = input.pauses ?? [];
  const hasRoute = activityOf(mode).hasGps && !!route && route.length >= 2;
  if (!hasRoute && hrSamples.length < 2) return undefined;

  if (!hasRoute) {
    const first = hrSamples[0].t;
    const last = hrSamples[hrSamples.length - 1].t;
    return Math.round(hrKcalBetween(hrSamples, profile, first, last, pauses));
  }

  const points = route as RoutePoint[];
  const maxSpeed = mode === 'cycling' ? MAX_BIKE_M_PER_MIN : MAX_FOOT_M_PER_MIN;
  let kcal = 0;
  // Куски, где по скорости считать нельзя: добираем их по пульсу.
  const unknown: Array<[number, number]> = [];

  let start = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[start].t;
    const isLast = i === points.length - 1;
    if (dt < WINDOW_MS && !isLast) continue;
    if (dt > 0) {
      const t0 = points[start].t;
      const t1 = points[i].t;
      if (dt > MAX_WINDOW_MS) {
        unknown.push([t0, t1]);
      } else if (dt >= 5000) {
        // Перемещение между концами окна, а не длина пути: шум GPS у стоящего человека
        // за полминуты даёт десятки метров пути, но почти нулевое перемещение.
        const metersPerMin = haversineDistanceMeters(points[start], points[i]) / (dt / 60000);
        if (metersPerMin > maxSpeed) {
          unknown.push([t0, t1]);
        } else {
          kcal += speedKcalPerMin(mode, metersPerMin, profile.weightKg) * (activeMs(t0, t1, pauses) / 60000);
        }
      }
    }
    start = i;
  }

  // До первой и после последней точки маршрута (ждали GPS, сигнал пропал в конце).
  if (hrSamples.length >= 2) {
    const firstSample = hrSamples[0].t;
    const lastSample = hrSamples[hrSamples.length - 1].t;
    const firstPoint = points[0].t;
    const lastPoint = points[points.length - 1].t;
    if (firstPoint - firstSample > EDGE_GAP_MS) unknown.push([firstSample, firstPoint]);
    if (lastSample - lastPoint > EDGE_GAP_MS) unknown.push([lastPoint, lastSample]);
    for (const [from, to] of unknown) {
      kcal += hrKcalBetween(hrSamples, profile, from, to, pauses);
    }
  }

  return Math.round(kcal);
}
