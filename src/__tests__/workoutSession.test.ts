import { UserProfile } from '../types';
import { buildWorkoutSession, FinishedWorkout } from '../workout/workoutSession';

const START = 1_700_000_000_000;
const PROFILE: UserProfile = { weightKg: 80, age: 33, gender: 'male' };

function workout(overrides: Partial<FinishedWorkout> = {}): FinishedWorkout {
  return {
    mode: 'treadmill',
    startedAt: START,
    hrSamples: [
      { t: START + 1000, bpm: 120 },
      { t: START + 2000, bpm: 140 },
      { t: START + 3000, bpm: 130 },
    ],
    route: [],
    pausedMs: 0,
    pausedAt: null,
    ...overrides,
  };
}

describe('buildWorkoutSession', () => {
  it('summarises the pulse', () => {
    const session = buildWorkoutSession('id-1', workout(), PROFILE, START + 60_000);
    expect(session.avgHr).toBe(130);
    expect(session.maxHr).toBe(140);
    expect(session.minHr).toBe(120);
  });

  it('excludes paused time from the duration', () => {
    const session = buildWorkoutSession('id-1', workout({ pausedMs: 20_000 }), PROFILE, START + 60_000);
    expect(session.durationSec).toBe(40);
  });

  it('counts a pause still running at the moment of finishing', () => {
    const paused = workout({ pausedAt: START + 30_000 });
    expect(buildWorkoutSession('id-1', paused, PROFILE, START + 60_000).durationSec).toBe(30);
  });

  it('leaves distance, pace and route out of a treadmill workout', () => {
    const session = buildWorkoutSession('id-1', workout(), PROFILE, START + 60_000);
    expect(session.distanceMeters).toBeUndefined();
    expect(session.avgPaceSecPerKm).toBeUndefined();
    expect(session.route).toBeUndefined();
  });

  it('keeps distance and route for an outdoor workout', () => {
    const outdoor = workout({
      mode: 'outdoor',
      route: [
        { lat: 56.36, lng: 44.06, t: START + 1000 },
        { lat: 56.37, lng: 44.06, t: START + 2000 },
      ],
    });
    const session = buildWorkoutSession('id-1', outdoor, PROFILE, START + 60_000);
    expect(session.distanceMeters).toBeGreaterThan(0);
    expect(session.route).toHaveLength(2);
  });

  it('survives a workout with no pulse samples at all', () => {
    const session = buildWorkoutSession('id-1', workout({ hrSamples: [] }), PROFILE, START + 60_000);
    expect(session.avgHr).toBe(0);
    expect(session.maxHr).toBe(0);
    expect(session.minHr).toBe(0);
  });

  it('has no calories without a profile', () => {
    expect(buildWorkoutSession('id-1', workout(), null, START + 60_000).caloriesKcal).toBeUndefined();
  });

  it('keeps the pauses, closing the one that was open at the finish', () => {
    const done = [{ start: START + 5_000, end: START + 10_000 }];
    const session = buildWorkoutSession(
      'id-1',
      workout({ pauses: done, pausedMs: 5_000, pausedAt: START + 50_000 }),
      PROFILE,
      START + 60_000,
    );
    expect(session.pauses).toEqual([
      { start: START + 5_000, end: START + 10_000 },
      { start: START + 50_000, end: START + 60_000 },
    ]);
  });

  it('stores no pauses field for a workout that never paused', () => {
    expect(buildWorkoutSession('id-1', workout(), PROFILE, START + 60_000).pauses).toBeUndefined();
  });
});
