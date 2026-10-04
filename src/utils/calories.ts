import { HrSample, PauseInterval, RoutePoint, UserProfile, WorkoutMode } from '../types';
import { activityOf } from '../workout/activities';
import { haversineDistanceMeters } from './geo';

// Калории тренировки. Главным числом показываем ПОЛНЫЕ: весь расход за время тренировки, с покоем
// (около 1 ккал на кг в час), так считают Zepp и большинство приложений, и с ними сравнивают.
// Активные, то есть сверх покоя, считаются внутри и показываются в деталях («из них активных»).
//
// Метод выбирается по тому, какой сигнал надёжнее для вида тренировки:
// - с GPS (бег, ходьба, велосипед): по скорости и весу. Пульс на таких нагрузках растёт от
//   жары, кофе и остановок сильнее, чем расход, и оценка по нему завышала вдвое. По скорости
//   считает и Strava (скорость, вес, время в движении), а не по пульсу;
// - без GPS (зал, йога, дорожка, прочее): по пульсу, формула Keytel с 2005 года. Скорости у
//   нас нет, и это грубая оценка: на низком пульсе формула завышает, поэтому ниже порога расход
//   считается покоем, а между порогами нарастает плавно. У зала, кроссфита и йоги результат
//   зажат в границы MET из справочника (`MET_LIMITS`): на силовой пульс растёт от напряжения, и
//   формула без границ завышала вдвое.
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

/** Расход покоя, ккал на кг в час (3,5 мл/кг/мин × 5 ккал/л × 60 мин). */
const REST_KCAL_PER_KG_HOUR = REST_VO2 * KCAL_PER_ML_O2 * 60;

/**
 * Границы полного расхода в MET для видов без скорости (Compendium of Physical Activities, коды
 * 02054, 02050, 02034-02040, 02150, 02160): оценка по пульсу не выходит за них. `alwaysFloor`:
 * нижняя граница действует и на низком пульсе (йога: на спокойной практике пульс низкий, а
 * расход всё равно около 2,3 MET); у зала и кроссфита только при пульсе от порога, иначе человек,
 * сидящий в паузе между подходами, «качал бы» 3,5 MET.
 */
interface MetLimit {
  min: number;
  max: number;
  alwaysFloor: boolean;
}
export const MET_LIMITS: Partial<Record<WorkoutMode, MetLimit>> = {
  gym: { min: 3.5, max: 6.0, alwaysFloor: false },
  crossfit: { min: 5.0, max: 11.0, alwaysFloor: false },
  yoga: { min: 2.3, max: 4.0, alwaysFloor: true },
};

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

/** Активные ккал в минуту по пульсу с границами MET вида, если они у него есть. */
function boundedHrKcalPerMin(bpm: number, profile: UserProfile, limit: MetLimit | undefined): number {
  const net = hrKcalPerMin(bpm, profile);
  if (!limit) return net;
  const hasEffort = bpm > HR_FLOOR_BPM;
  // Полный расход в MET (ккал на кг в час) = активный + покой.
  const grossMet = (net / profile.weightKg) * 60 + REST_KCAL_PER_KG_HOUR;
  let bounded = Math.min(limit.max, grossMet);
  if (hasEffort || limit.alwaysFloor) bounded = Math.max(limit.min, bounded);
  return (Math.max(0, bounded - REST_KCAL_PER_KG_HOUR) * profile.weightKg) / 60;
}

/** Активные ккал по пульсу в промежутке [from, to] (мс с эпохи). */
function hrKcalBetween(
  samples: HrSample[],
  profile: UserProfile,
  from: number,
  to: number,
  pauses: PauseInterval[],
  limit?: MetLimit,
): number {
  let kcal = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = Math.max(samples[i - 1].t, from);
    const b = Math.min(samples[i].t, to);
    if (b <= a) continue;
    if (samples[i].t - samples[i - 1].t > MAX_HR_GAP_MS) continue;
    kcal += boundedHrKcalPerMin(samples[i].bpm, profile, limit) * (activeMs(a, b, pauses) / 60000);
  }
  return kcal;
}

/**
 * Активные калории тренировки без округления, то есть сверх покоя. Без профиля или без данных
 * `undefined`, а не ноль. Вид с GPS считается по скорости, остальное и дыры в маршруте по пульсу.
 * Показывают обычно полные (`computeWorkoutCalories`), эту берут, чтобы дополнить их или сложить.
 */
export function computeActiveCalories(input: CalorieInput): number | undefined {
  const { mode, hrSamples, route, profile } = input;
  if (!profile) return undefined;
  const pauses = input.pauses ?? [];
  const hasRoute = activityOf(mode).hasGps && !!route && route.length >= 2;
  if (!hasRoute && hrSamples.length < 2) return undefined;

  if (!hasRoute) {
    const first = hrSamples[0].t;
    const last = hrSamples[hrSamples.length - 1].t;
    return hrKcalBetween(hrSamples, profile, first, last, pauses, MET_LIMITS[mode]);
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

  return kcal;
}

/** Расход покоя за время тренировки: то, что тело тратило бы и без неё. */
export function restCalories(weightKg: number, durationSec: number): number {
  return REST_KCAL_PER_KG_HOUR * weightKg * (Math.max(0, durationSec) / 3600);
}

/** Полные калории из активных: плюс покой за время тренировки, округлённо. */
export function totalCalories(active: number, weightKg: number, durationSec: number): number {
  return Math.round(active + restCalories(weightKg, durationSec));
}

/** Активные калории из полных, например для строки «из них активных». Не меньше нуля. */
export function activeFromTotal(total: number, weightKg: number, durationSec: number): number {
  return Math.max(0, Math.round(total - restCalories(weightKg, durationSec)));
}

/**
 * Полные калории тренировки: активные плюс покой за время без пауз (`durationSec` из сессии).
 * Так показывает Zepp, и с этим числом сравнивают. Без профиля или без данных `undefined`.
 */
export function computeWorkoutCalories(input: CalorieInput & { durationSec: number }): number | undefined {
  const active = computeActiveCalories(input);
  if (active === undefined || !input.profile) return undefined;
  return totalCalories(active, input.profile.weightKg, input.durationSec);
}
