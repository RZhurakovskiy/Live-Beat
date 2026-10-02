/**
 * Все режимы тренировки. Список, а не только тип: по нему черновик и файл истории
 * проверяют, что режим из базы или файла приложению известен.
 */
export const WORKOUT_MODES = ['treadmill', 'outdoor', 'cycling', 'gym', 'crossfit', 'yoga', 'other'] as const;

/** Вид тренировки. Чем виды отличаются, описано в `workout/activities.ts`. */
export type WorkoutMode = (typeof WORKOUT_MODES)[number];

/** Проверяет, что значение из базы или файла это известный режим тренировки. */
export function isWorkoutMode(value: unknown): value is WorkoutMode {
  return typeof value === 'string' && (WORKOUT_MODES as readonly string[]).includes(value);
}
/** Пол из профиля, нужен для расчёта калорий. */
export type Gender = 'male' | 'female';

/** Профиль пользователя: по нему считаются калории и максимальный пульс для зон. */
export interface UserProfile {
  weightKg: number;
  age: number;
  gender: Gender;
  /**
   * Максимальный пульс, который пользователь указал сам (из теста, от тренера, с другого
   * прибора). Необязательный: если его нет, максимум считается по формуле от возраста и
   * пола, см. `profileMaxHr` в `utils/heartRateZones.ts`.
   */
  maxHrBpm?: number;
}

/** Одно показание пульса: время (мс с эпохи) и удары в минуту. */
export interface HrSample {
  t: number;
  bpm: number;
}

/** Точка маршрута: координаты и время (мс с эпохи). */
export interface RoutePoint {
  lat: number;
  lng: number;
  t: number;
}

/** Ручная пауза тренировки: начало и конец, мс с эпохи. */
export interface PauseInterval {
  start: number;
  end: number;
}

/**
 * Пульс восстановления: пульс в момент финиша и через минуту после него. Разница
 * показывает, как быстро сердце успокаивается; с ростом тренированности она растёт.
 */
export interface HrRecovery {
  fromBpm: number;
  toBpm: number;
}

/**
 * Сохранённая тренировка целиком. Дистанция, темп и маршрут есть только у уличной.
 * Длительность без пауз.
 */
export interface WorkoutSession {
  id: string;
  mode: WorkoutMode;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  avgHr: number;
  maxHr: number;
  minHr: number;
  hrSamples: HrSample[];
  distanceMeters?: number;
  avgPaceSecPerKm?: number;
  route?: RoutePoint[];
  caloriesKcal?: number;
  /**
   * Ручные паузы. Нужны сплитам по километрам: время сплита считается без пауз. У
   * тренировок, записанных до появления этого поля, пауз нет, и сплиты у них по
   * настенному времени.
   */
  pauses?: PauseInterval[];
  /** Пульс восстановления, если его успели измерить на экране итогов. */
  recovery?: HrRecovery;
  /**
   * Настройка интервального таймера (кроссфит). Сами фазы не хранятся: они однозначно
   * восстанавливаются из настройки, старта и пауз (`utils/intervals.ts`).
   */
  interval?: IntervalSettings;
}

/**
 * Настройка интервального таймера в том виде, в каком она хранится. Пресеты и расчёт
 * фаз в `utils/intervals.ts`.
 */
export interface IntervalSettings {
  preset: 'tabata' | 'emom' | 'amrap' | 'custom';
  workSec: number;
  restSec: number;
  rounds: number;
}

/** Краткая сводка тренировки для списка истории, без пульса и маршрута. */
export interface WorkoutSessionSummary {
  id: string;
  mode: WorkoutMode;
  startedAt: number;
  durationSec: number;
  avgHr: number;
  distanceMeters?: number;
  avgPaceSecPerKm?: number;
  caloriesKcal?: number;
}
