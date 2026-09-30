import { HrSample, WorkoutSession } from '../types';
import { decodeGoals, encodeGoals, goalProgress, hasGoals, NO_GOALS } from '../utils/goals';

const T0 = 1_700_000_000_000;
const MAX_HR = 190; // зона 2: 114–132 уд/мин

function samples(bpm: number, seconds: number): HrSample[] {
  return Array.from({ length: seconds + 1 }, (_, i) => ({ t: T0 + i * 1000, bpm }));
}

function session(extra: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'x',
    mode: 'outdoor',
    startedAt: T0,
    endedAt: T0 + 1_800_000,
    durationSec: 1800,
    avgHr: 120,
    maxHr: 130,
    minHr: 100,
    hrSamples: [],
    ...extra,
  };
}

describe('decodeGoals / encodeGoals', () => {
  it('round-trips goals', () => {
    const goals = { workouts: 3, km: 15, zone2Minutes: 90 };
    expect(decodeGoals(encodeGoals(goals))).toEqual(goals);
  });

  it('treats missing, zero, negative and absurd values as no goal', () => {
    expect(decodeGoals(JSON.stringify({ workouts: 0, km: -5, zone2Minutes: 1e9 }))).toEqual(NO_GOALS);
    expect(decodeGoals(JSON.stringify({ km: 'много' }))).toEqual(NO_GOALS);
  });

  it('survives garbage and an empty flag', () => {
    expect(decodeGoals(null)).toEqual(NO_GOALS);
    expect(decodeGoals('{oops')).toEqual(NO_GOALS);
    expect(decodeGoals('null')).toEqual(NO_GOALS);
  });

  it('knows whether any goal is set', () => {
    expect(hasGoals(NO_GOALS)).toBe(false);
    expect(hasGoals({ ...NO_GOALS, km: 10 })).toBe(true);
  });
});

describe('goalProgress', () => {
  it('shows only the goals that are set', () => {
    const rows = goalProgress({ ...NO_GOALS, workouts: 3 }, [session()], MAX_HR);
    expect(rows.map((r) => r.key)).toEqual(['workouts']);
    expect(rows[0]).toMatchObject({ target: 3, actual: 1, done: false });
    expect(rows[0].fraction).toBeCloseTo(1 / 3);
  });

  it('sums the distance of the week in kilometres', () => {
    const rows = goalProgress({ ...NO_GOALS, km: 10 }, [session({ distanceMeters: 6230 }), session({ distanceMeters: 4000 })], MAX_HR);
    expect(rows[0]).toMatchObject({ actual: 10.2, done: true, fraction: 1 });
  });

  it('counts minutes in zone 2 only', () => {
    // 10 минут в зоне 2 и 10 минут в зоне 4: к цели идут только первые.
    const easy = session({ hrSamples: samples(120, 600) });
    const hard = session({ hrSamples: samples(160, 600) });
    const rows = goalProgress({ ...NO_GOALS, zone2Minutes: 60 }, [easy, hard], MAX_HR);
    expect(rows[0]).toMatchObject({ actual: 10, done: false });
  });

  it('skips the zone goal without a profile instead of showing zero forever', () => {
    const rows = goalProgress({ workouts: 2, km: null, zone2Minutes: 60 }, [session()], null);
    expect(rows.map((r) => r.key)).toEqual(['workouts']);
  });

  it('caps the bar at full when the goal is exceeded', () => {
    const rows = goalProgress({ ...NO_GOALS, workouts: 1 }, [session(), session()], MAX_HR);
    expect(rows[0].fraction).toBe(1);
    expect(rows[0].done).toBe(true);
  });
});

describe('goalProgress and cycling', () => {
  it('does not count ride kilometres towards the running goal', () => {
    const rows = goalProgress(
      { ...NO_GOALS, km: 10 },
      [session({ distanceMeters: 5000 }), session({ mode: 'cycling', distanceMeters: 30_000 })],
      MAX_HR,
    );
    expect(rows[0].actual).toBe(5);
  });
});
