import {
  isPaused,
  PausableWorkout,
  resumedFrom,
  workoutElapsedMs,
  workoutElapsedSec,
} from '../workout/workoutTime';

const START = 1_000_000;

function workout(overrides: Partial<PausableWorkout> = {}): PausableWorkout {
  return { startedAt: START, pausedMs: 0, pausedAt: null, ...overrides };
}

describe('workoutElapsedMs', () => {
  it('is wall time while the workout has never been paused', () => {
    expect(workoutElapsedMs(workout(), START + 30_000)).toBe(30_000);
  });

  it('subtracts time from finished pauses', () => {
    expect(workoutElapsedMs(workout({ pausedMs: 10_000 }), START + 30_000)).toBe(20_000);
  });

  it('freezes while a pause is in progress', () => {
    const paused = workout({ pausedAt: START + 20_000 });
    expect(workoutElapsedMs(paused, START + 25_000)).toBe(20_000);
    // Ten more seconds of standing still change nothing.
    expect(workoutElapsedMs(paused, START + 35_000)).toBe(20_000);
  });

  it('counts several pauses', () => {
    const w = workout({ pausedMs: 5_000, pausedAt: START + 40_000 });
    expect(workoutElapsedMs(w, START + 60_000)).toBe(35_000);
  });

  it('never goes negative on a clock that moved backwards', () => {
    expect(workoutElapsedMs(workout(), START - 5_000)).toBe(0);
  });

  it('floors to whole seconds', () => {
    expect(workoutElapsedSec(workout(), START + 1_999)).toBe(1);
  });
});

describe('isPaused', () => {
  it('follows pausedAt', () => {
    expect(isPaused(workout())).toBe(false);
    expect(isPaused(workout({ pausedAt: START + 1 }))).toBe(true);
  });
});

describe('resumedFrom', () => {
  it('folds the running pause into the total', () => {
    const w = workout({ pausedMs: 3_000, pausedAt: START + 10_000 });
    expect(resumedFrom(w, START + 14_000)).toEqual({ pausedMs: 7_000, pausedAt: null });
  });

  it('leaves a running workout alone', () => {
    const w = workout({ pausedMs: 3_000 });
    expect(resumedFrom(w, START + 14_000)).toEqual({ pausedMs: 3_000, pausedAt: null });
  });

  it('ignores a pause that appears to end before it started', () => {
    const w = workout({ pausedMs: 1_000, pausedAt: START + 10_000 });
    expect(resumedFrom(w, START + 9_000)).toEqual({ pausedMs: 1_000, pausedAt: null });
  });
});
