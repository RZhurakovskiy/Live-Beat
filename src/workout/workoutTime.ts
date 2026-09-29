// Elapsed time of a workout that can be paused. Pure and RN-free so it runs
// under Jest: the screen, the summary and the draft all have to agree on one
// definition of "how long was this workout", and that definition excludes the
// time spent on pause.

export interface PausableWorkout {
  startedAt: number;
  // Time already spent in finished pauses.
  pausedMs: number;
  // Start of the pause currently in progress, or null when running.
  pausedAt: number | null;
}

export function isPaused(workout: PausableWorkout): boolean {
  return workout.pausedAt !== null;
}

export function workoutElapsedMs(workout: PausableWorkout, now: number): number {
  const wall = now - workout.startedAt;
  const currentPause = workout.pausedAt === null ? 0 : now - workout.pausedAt;
  return Math.max(0, wall - workout.pausedMs - currentPause);
}

export function workoutElapsedSec(workout: PausableWorkout, now: number): number {
  return Math.floor(workoutElapsedMs(workout, now) / 1000);
}

// Closing the pause: fold it into the accumulated total.
export function resumedFrom(workout: PausableWorkout, now: number): { pausedMs: number; pausedAt: null } {
  if (workout.pausedAt === null) return { pausedMs: workout.pausedMs, pausedAt: null };
  return { pausedMs: workout.pausedMs + Math.max(0, now - workout.pausedAt), pausedAt: null };
}
