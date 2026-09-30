import { WorkoutSessionSummary } from '../types';
import {
  MIN_COMPARABLE_METERS,
  paceEfficiency,
  personalRecords,
  weeklyBuckets,
} from '../utils/progress';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
// Среда: граница недели не совпадает с моментом тестовых данных.
const NOW = new Date(2026, 8, 30, 12, 0, 0, 0).getTime();

let counter = 0;
function session(overrides: Partial<WorkoutSessionSummary> = {}): WorkoutSessionSummary {
  counter += 1;
  return {
    id: `s${counter}`,
    mode: 'outdoor',
    startedAt: NOW,
    durationSec: 1800,
    avgHr: 150,
    distanceMeters: 5000,
    avgPaceSecPerKm: 360,
    ...overrides,
  };
}

describe('paceEfficiency', () => {
  it('returns null when there are too few runs', () => {
    expect(paceEfficiency([session(), session(), session()])).toBeNull();
  });

  it('ignores treadmill workouts entirely', () => {
    const treadmill = Array.from({ length: 6 }, () =>
      session({ mode: 'treadmill', avgPaceSecPerKm: undefined, distanceMeters: undefined }),
    );
    expect(paceEfficiency(treadmill)).toBeNull();
  });

  it('ignores runs too short to be comparable', () => {
    const shortRuns = Array.from({ length: 6 }, () =>
      session({ distanceMeters: MIN_COMPARABLE_METERS - 1 }),
    );
    expect(paceEfficiency(shortRuns)).toBeNull();
  });

  it('reports a dropping pulse at the same pace as progress', () => {
    const runs = [
      session({ startedAt: NOW - 40 * DAY, avgHr: 158 }),
      session({ startedAt: NOW - 30 * DAY, avgHr: 156 }),
      session({ startedAt: NOW - 10 * DAY, avgHr: 150 }),
      session({ startedAt: NOW - 2 * DAY, avgHr: 148 }),
    ];
    const result = paceEfficiency(runs)!;
    expect(result.earlierAvgHr).toBe(157);
    expect(result.recentAvgHr).toBe(149);
    expect(result.deltaBpm).toBe(-8);
    expect(result.sessionCount).toBe(4);
  });

  it('compares inside one pace band, not across them', () => {
    // Четыре лёгкие пробежки по 7:00/км и две быстрые. Быстрая пара не должна тянуть
    // сравнение за собой, а в ответе должна быть полоса, где тренировок больше.
    const easy = [
      session({ startedAt: NOW - 40 * DAY, avgPaceSecPerKm: 420, avgHr: 150 }),
      session({ startedAt: NOW - 30 * DAY, avgPaceSecPerKm: 425, avgHr: 150 }),
      session({ startedAt: NOW - 20 * DAY, avgPaceSecPerKm: 422, avgHr: 144 }),
      session({ startedAt: NOW - 10 * DAY, avgPaceSecPerKm: 428, avgHr: 144 }),
    ];
    const fast = [
      session({ startedAt: NOW - 35 * DAY, avgPaceSecPerKm: 300, avgHr: 175 }),
      session({ startedAt: NOW - 5 * DAY, avgPaceSecPerKm: 305, avgHr: 176 }),
    ];
    const result = paceEfficiency([...easy, ...fast])!;
    expect(result.sessionCount).toBe(4);
    expect(result.paceFrom).toBe(420);
    expect(result.deltaBpm).toBe(-6);
  });

  it('leaves the middle run out of an odd-sized band', () => {
    const runs = [
      session({ startedAt: NOW - 50 * DAY, avgHr: 160 }),
      session({ startedAt: NOW - 40 * DAY, avgHr: 160 }),
      session({ startedAt: NOW - 30 * DAY, avgHr: 100 }), // middle, ignored
      session({ startedAt: NOW - 20 * DAY, avgHr: 150 }),
      session({ startedAt: NOW - 10 * DAY, avgHr: 150 }),
    ];
    const result = paceEfficiency(runs)!;
    expect(result.earlierAvgHr).toBe(160);
    expect(result.recentAvgHr).toBe(150);
  });
});

describe('weeklyBuckets', () => {
  it('returns the requested number of weeks, oldest first', () => {
    const buckets = weeklyBuckets([], NOW, 8);
    expect(buckets).toHaveLength(8);
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i].startMs).toBeGreaterThan(buckets[i - 1].startMs);
    }
  });

  it('puts a workout into the week it happened in', () => {
    const buckets = weeklyBuckets([session({ startedAt: NOW })], NOW, 4);
    expect(buckets[3].workouts).toBe(1);
    expect(buckets[3].distanceMeters).toBe(5000);
    expect(buckets.slice(0, 3).every((b) => b.workouts === 0)).toBe(true);
  });

  it('keeps empty weeks so a gap is visible', () => {
    const buckets = weeklyBuckets([session({ startedAt: NOW - 2 * WEEK })], NOW, 4);
    expect(buckets[1].workouts).toBe(1);
    expect(buckets[2].workouts).toBe(0);
    expect(buckets[3].workouts).toBe(0);
  });

  it('drops anything older than the window', () => {
    const buckets = weeklyBuckets([session({ startedAt: NOW - 20 * WEEK })], NOW, 4);
    expect(buckets.every((b) => b.workouts === 0)).toBe(true);
  });
});

describe('personalRecords', () => {
  it('is all nulls with no history', () => {
    const records = personalRecords([]);
    expect(records.longestDistanceMeters).toBeNull();
    expect(records.longestDurationSec).toBeNull();
    expect(records.bestPaceSecPerKm).toBeNull();
  });

  it('picks the longest distance and duration', () => {
    const records = personalRecords([
      session({ id: 'a', distanceMeters: 5000, durationSec: 1800 }),
      session({ id: 'b', distanceMeters: 12000, durationSec: 1500 }),
      session({ id: 'c', distanceMeters: 3000, durationSec: 4200 }),
    ]);
    expect(records.longestDistanceMeters!.sessionId).toBe('b');
    expect(records.longestDurationSec!.sessionId).toBe('c');
  });

  it('refuses a pace set over a distance too short to count', () => {
    // Иначе спринт на 200 м по 3:00/км навсегда занял бы рекорд.
    const records = personalRecords([
      session({ id: 'sprint', distanceMeters: 200, avgPaceSecPerKm: 180 }),
      session({ id: 'real', distanceMeters: 5000, avgPaceSecPerKm: 330 }),
    ]);
    expect(records.bestPaceSecPerKm!.sessionId).toBe('real');
  });

  it('counts a treadmill workout for duration but not for distance', () => {
    const records = personalRecords([
      session({ id: 'gym', mode: 'treadmill', distanceMeters: undefined, avgPaceSecPerKm: undefined, durationSec: 5400 }),
      session({ id: 'run', distanceMeters: 8000, durationSec: 2400 }),
    ]);
    expect(records.longestDurationSec!.sessionId).toBe('gym');
    expect(records.longestDistanceMeters!.sessionId).toBe('run');
  });
});
