import type { HrSample, RoutePoint, WorkoutMode } from '../types';

// A workout in progress lives in memory until "Завершить тренировку". If
// Android kills the app before that (low battery, battery saver, OEM task
// killers) everything recorded so far is gone, so the running workout is also
// written to the database as a draft and restored on the next start.

export interface WorkoutDraft {
  mode: WorkoutMode;
  startedAt: number;
  hrSamples: HrSample[];
  route: RoutePoint[];
  targetZoneRange: { min: number; max: number } | null;
  // Pause state, so a workout killed while paused comes back paused instead of
  // silently counting the time the app was gone. Absent in drafts written
  // before pause existed, hence the defaults in decode.
  pausedMs: number;
  pausedAt: number | null;
}

// A draft older than this is a leftover, not a workout to resume.
export const MAX_DRAFT_AGE_MS = 24 * 60 * 60 * 1000;

export function encodeWorkoutDraft(draft: WorkoutDraft): string {
  return JSON.stringify(draft);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function decodeWorkoutDraft(json: string, now: number): WorkoutDraft | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;

  if (d.mode !== 'treadmill' && d.mode !== 'outdoor') return null;
  if (!isNumber(d.startedAt) || now - d.startedAt > MAX_DRAFT_AGE_MS || d.startedAt > now) return null;

  const hrSamples = Array.isArray(d.hrSamples)
    ? d.hrSamples.filter((s): s is HrSample => !!s && isNumber(s.t) && isNumber(s.bpm))
    : [];
  const route = Array.isArray(d.route)
    ? d.route.filter((p): p is RoutePoint => !!p && isNumber(p.lat) && isNumber(p.lng) && isNumber(p.t))
    : [];
  const zone = d.targetZoneRange as { min?: unknown; max?: unknown } | null | undefined;
  const targetZoneRange = zone && isNumber(zone.min) && isNumber(zone.max) ? { min: zone.min, max: zone.max } : null;

  // Drafts written before pause existed carry neither field: such a workout was
  // never paused, so zero and null are the right answers, not a parse failure.
  const pausedMs = isNumber(d.pausedMs) && d.pausedMs >= 0 ? d.pausedMs : 0;
  const pausedAt = isNumber(d.pausedAt) && d.pausedAt >= d.startedAt && d.pausedAt <= now ? d.pausedAt : null;

  return { mode: d.mode, startedAt: d.startedAt, hrSamples, route, targetZoneRange, pausedMs, pausedAt };
}
