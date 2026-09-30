/** Режим тренировки: дорожка (только пульс) или улица (пульс и GPS-маршрут). */
export type WorkoutMode = 'treadmill' | 'outdoor';
/** Пол из профиля, нужен для расчёта калорий. */
export type Gender = 'male' | 'female';

/** Профиль пользователя: по нему считаются калории и максимальный пульс для зон. */
export interface UserProfile {
  weightKg: number;
  age: number;
  gender: Gender;
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
