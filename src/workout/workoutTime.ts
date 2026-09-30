// Время тренировки, которую можно ставить на паузу. Чистый модуль без React Native,
// чтобы гонять его в Jest: экран, итоги и черновик должны сходиться в одном
// определении «сколько длилась тренировка», и время на паузе в него не входит.

/** Всё, что нужно для подсчёта времени тренировки с паузами. */
export interface PausableWorkout {
  startedAt: number;
  // Время, уже проведённое в законченных паузах.
  pausedMs: number;
  // Начало паузы, которая идёт сейчас, или null, если тренировка идёт.
  pausedAt: number | null;
}

/** Стоит ли тренировка на паузе. */
export function isPaused(workout: PausableWorkout): boolean {
  return workout.pausedAt !== null;
}

/** Сколько тренировка идёт на момент `now`, без пауз, в миллисекундах. */
export function workoutElapsedMs(workout: PausableWorkout, now: number): number {
  const wall = now - workout.startedAt;
  const currentPause = workout.pausedAt === null ? 0 : now - workout.pausedAt;
  return Math.max(0, wall - workout.pausedMs - currentPause);
}

/** То же в целых секундах. */
export function workoutElapsedSec(workout: PausableWorkout, now: number): number {
  return Math.floor(workoutElapsedMs(workout, now) / 1000);
}

/** Снимает паузу: её длительность добавляется к накопленному времени пауз. */
export function resumedFrom(workout: PausableWorkout, now: number): { pausedMs: number; pausedAt: null } {
  if (workout.pausedAt === null) return { pausedMs: workout.pausedMs, pausedAt: null };
  return { pausedMs: workout.pausedMs + Math.max(0, now - workout.pausedAt), pausedAt: null };
}
