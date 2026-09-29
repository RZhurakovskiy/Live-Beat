import { WorkoutSessionSummary } from '../types';
import { startOfWeekMs } from './format';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Pulse at a comparable pace
// ---------------------------------------------------------------------------

// Two runs are only comparable if they were run at roughly the same pace, so
// sessions are bucketed by pace before anything is compared.
export const PACE_BUCKET_SEC = 15;
// Below this the comparison is noise dressed up as a trend.
export const MIN_SESSIONS_PER_HALF = 2;
// A short dash gives an absurd pace; it is not a run to compare against.
export const MIN_COMPARABLE_METERS = 1000;

export interface PaceEfficiency {
  // The pace band the comparison was made in, sec/km.
  paceFrom: number;
  paceTo: number;
  earlierAvgHr: number;
  recentAvgHr: number;
  // Negative means the pulse dropped at the same pace — the real sign of
  // getting fitter that this data can honestly show.
  deltaBpm: number;
  sessionCount: number;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Does the pulse drop at the same pace? Outdoor sessions only — a treadmill
 * has no pace to compare. Returns null when there is not enough comparable
 * data, which is the common case early on and must be shown as "not yet",
 * never as a number.
 */
export function paceEfficiency(sessions: WorkoutSessionSummary[]): PaceEfficiency | null {
  const usable = sessions
    .filter(
      (s) =>
        s.mode === 'outdoor' &&
        s.avgHr > 0 &&
        s.avgPaceSecPerKm != null &&
        Number.isFinite(s.avgPaceSecPerKm) &&
        (s.distanceMeters ?? 0) >= MIN_COMPARABLE_METERS,
    )
    .sort((a, b) => a.startedAt - b.startedAt);

  if (usable.length < MIN_SESSIONS_PER_HALF * 2) return null;

  // Group by pace band and take the band the owner actually runs in most.
  const buckets = new Map<number, WorkoutSessionSummary[]>();
  for (const session of usable) {
    const key = Math.floor(session.avgPaceSecPerKm! / PACE_BUCKET_SEC);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(session);
  }

  let best: { key: number; items: WorkoutSessionSummary[] } | null = null;
  for (const [key, items] of buckets) {
    if (!best || items.length > best.items.length) best = { key, items };
  }
  if (!best || best.items.length < MIN_SESSIONS_PER_HALF * 2) return null;

  // Oldest half against newest half. With an odd count the middle session is
  // left out rather than counted twice.
  const half = Math.floor(best.items.length / 2);
  const earlier = best.items.slice(0, half);
  const recent = best.items.slice(best.items.length - half);

  const earlierAvgHr = Math.round(mean(earlier.map((s) => s.avgHr)));
  const recentAvgHr = Math.round(mean(recent.map((s) => s.avgHr)));

  return {
    paceFrom: best.key * PACE_BUCKET_SEC,
    paceTo: (best.key + 1) * PACE_BUCKET_SEC,
    earlierAvgHr,
    recentAvgHr,
    deltaBpm: recentAvgHr - earlierAvgHr,
    sessionCount: best.items.length,
  };
}

// ---------------------------------------------------------------------------
// Week by week
// ---------------------------------------------------------------------------

export interface WeekBucket {
  startMs: number;
  workouts: number;
  distanceMeters: number;
  totalSeconds: number;
}

/** The last `weeks` weeks, oldest first, including empty ones. */
export function weeklyBuckets(
  sessions: WorkoutSessionSummary[],
  nowMs: number,
  weeks: number,
): WeekBucket[] {
  const currentWeekStart = startOfWeekMs(nowMs);
  const buckets: WeekBucket[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    buckets.push({
      startMs: currentWeekStart - i * WEEK_MS,
      workouts: 0,
      distanceMeters: 0,
      totalSeconds: 0,
    });
  }

  const firstStart = buckets[0].startMs;
  for (const session of sessions) {
    if (session.startedAt < firstStart) continue;
    const index = Math.floor((session.startedAt - firstStart) / WEEK_MS);
    if (index < 0 || index >= buckets.length) continue;
    const bucket = buckets[index];
    bucket.workouts += 1;
    bucket.distanceMeters += session.distanceMeters ?? 0;
    bucket.totalSeconds += session.durationSec;
  }

  return buckets;
}

// ---------------------------------------------------------------------------
// Personal records
// ---------------------------------------------------------------------------

export interface PersonalRecord {
  value: number;
  sessionId: string;
  at: number;
}

export interface PersonalRecords {
  longestDistanceMeters: PersonalRecord | null;
  longestDurationSec: PersonalRecord | null;
  // Lowest sec/km, so smaller is better.
  bestPaceSecPerKm: PersonalRecord | null;
}

export function personalRecords(sessions: WorkoutSessionSummary[]): PersonalRecords {
  let distance: PersonalRecord | null = null;
  let duration: PersonalRecord | null = null;
  let pace: PersonalRecord | null = null;

  for (const s of sessions) {
    const meters = s.distanceMeters ?? 0;
    if (meters > 0 && (!distance || meters > distance.value)) {
      distance = { value: meters, sessionId: s.id, at: s.startedAt };
    }
    if (s.durationSec > 0 && (!duration || s.durationSec > duration.value)) {
      duration = { value: s.durationSec, sessionId: s.id, at: s.startedAt };
    }
    // A 200 m dash would otherwise take the pace record forever.
    if (
      s.avgPaceSecPerKm != null &&
      Number.isFinite(s.avgPaceSecPerKm) &&
      s.avgPaceSecPerKm > 0 &&
      meters >= MIN_COMPARABLE_METERS &&
      (!pace || s.avgPaceSecPerKm < pace.value)
    ) {
      pace = { value: s.avgPaceSecPerKm, sessionId: s.id, at: s.startedAt };
    }
  }

  return { longestDistanceMeters: distance, longestDurationSec: duration, bestPaceSecPerKm: pace };
}
