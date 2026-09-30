import { HrSample, IntervalSettings, PauseInterval, RoutePoint, UserProfile, WorkoutMode, WorkoutSession } from '../types';
import { computeCaloriesFromSamples } from '../utils/calories';
import { paceSecPerKm, totalRouteDistanceMeters } from '../utils/geo';
import { activityOf } from './activities';
import { pausesUntil, workoutElapsedSec } from './workoutTime';

/**
 * Всё, что нужно, чтобы превратить законченную тренировку в сохраняемую сессию.
 * Подходят и идущая тренировка из стора, и черновик из базы.
 */
export interface FinishedWorkout {
  mode: WorkoutMode;
  startedAt: number;
  hrSamples: HrSample[];
  route: RoutePoint[];
  pausedMs: number;
  pausedAt: number | null;
  /** Законченные паузы. Нет у тренировок, восстановленных из старого черновика. */
  pauses?: PauseInterval[];
  /** Настройка интервального таймера, если он был. */
  interval?: IntervalSettings | null;
}

/**
 * Собирает сессию из законченной тренировки: длительность без пауз, пульс,
 * дистанция и темп для видов с GPS (у велосипеда тот же темп, скорость из него
 * считается при показе), калории. Чистая функция, чтобы кнопка «Завершить» и
 * восстановление тренировки, выгруженной на экране итогов, не могли разойтись:
 * они обязаны давать одну и ту же сессию.
 */
export function buildWorkoutSession(
  id: string,
  workout: FinishedWorkout,
  profile: UserProfile | null,
  endedAt: number,
): WorkoutSession {
  const isOutdoor = activityOf(workout.mode).hasGps;
  const durationSec = workoutElapsedSec(workout, endedAt);
  const distanceMeters = isOutdoor ? totalRouteDistanceMeters(workout.route) : undefined;
  const bpm = workout.hrSamples.map((s) => s.bpm);
  const pauses = pausesUntil(workout.pauses ?? [], workout.pausedAt, endedAt);

  return {
    id,
    mode: workout.mode,
    startedAt: workout.startedAt,
    endedAt,
    durationSec,
    avgHr: bpm.length ? Math.round(bpm.reduce((a, b) => a + b, 0) / bpm.length) : 0,
    maxHr: bpm.length ? Math.max(...bpm) : 0,
    minHr: bpm.length ? Math.min(...bpm) : 0,
    hrSamples: workout.hrSamples,
    distanceMeters,
    avgPaceSecPerKm: isOutdoor ? paceSecPerKm(distanceMeters ?? 0, durationSec) : undefined,
    route: isOutdoor ? workout.route : undefined,
    caloriesKcal: computeCaloriesFromSamples(workout.hrSamples, profile),
    pauses: pauses.length > 0 ? pauses : undefined,
    interval: workout.interval ?? undefined,
  };
}
