import { decodeWorkoutDraft, encodeWorkoutDraft, MAX_DRAFT_AGE_MS, WorkoutDraft } from '../workout/workoutDraftCodec';

const NOW = 1_800_000_000_000;

const draft: WorkoutDraft = {
  mode: 'outdoor',
  startedAt: NOW - 90 * 60 * 1000,
  hrSamples: [
    { t: NOW - 60000, bpm: 142 },
    { t: NOW - 59000, bpm: 143 },
  ],
  route: [{ lat: 56.36, lng: 44.06, t: NOW - 60000 }],
  targetZoneRange: { min: 2, max: 3 },
  pausedMs: 0,
  pausedAt: null,
  status: 'active',
  finishedAt: null,
};

describe('workout draft codec', () => {
  it('round-trips a running workout', () => {
    expect(decodeWorkoutDraft(encodeWorkoutDraft(draft), NOW)).toEqual(draft);
  });

  it('drops a draft older than a day', () => {
    const old = { ...draft, startedAt: NOW - MAX_DRAFT_AGE_MS - 1 };
    expect(decodeWorkoutDraft(encodeWorkoutDraft(old), NOW)).toBeNull();
  });

  it('rejects garbage instead of crashing the app start', () => {
    expect(decodeWorkoutDraft('not json', NOW)).toBeNull();
    expect(decodeWorkoutDraft('{"mode":"swim","startedAt":1}', NOW)).toBeNull();
    expect(decodeWorkoutDraft('null', NOW)).toBeNull();
  });

  it('skips malformed samples but keeps the valid ones', () => {
    const json = JSON.stringify({ ...draft, hrSamples: [{ t: NOW, bpm: 120 }, { t: 'x' }, null], targetZoneRange: 'bad' });
    const decoded = decodeWorkoutDraft(json, NOW)!;
    expect(decoded.hrSamples).toEqual([{ t: NOW, bpm: 120 }]);
    expect(decoded.targetZoneRange).toBeNull();
  });

  it('round-trips a workout killed while on pause', () => {
    const paused: WorkoutDraft = { ...draft, pausedMs: 12_000, pausedAt: NOW - 30_000 };
    expect(decodeWorkoutDraft(encodeWorkoutDraft(paused), NOW)).toEqual(paused);
  });

  it('reads a draft written before pause existed as never paused and active', () => {
    const { pausedMs, pausedAt, status, finishedAt, ...legacy } = draft;
    void pausedMs;
    void pausedAt;
    void status;
    void finishedAt;
    const decoded = decodeWorkoutDraft(JSON.stringify(legacy), NOW)!;
    expect(decoded.pausedMs).toBe(0);
    expect(decoded.pausedAt).toBeNull();
    expect(decoded.status).toBe('active');
    expect(decoded.finishedAt).toBeNull();
  });

  it('round-trips a finished workout waiting to be saved', () => {
    const finished: WorkoutDraft = { ...draft, status: 'finished', finishedAt: NOW - 5_000 };
    expect(decodeWorkoutDraft(encodeWorkoutDraft(finished), NOW)).toEqual(finished);
  });

  it('treats a finished draft without an end time as still active', () => {
    // Nothing to build a session from, so resuming it is the safer reading.
    const broken = JSON.stringify({ ...draft, status: 'finished', finishedAt: null });
    const decoded = decodeWorkoutDraft(broken, NOW)!;
    expect(decoded.status).toBe('active');
  });

  it('rejects an end time that cannot be true', () => {
    const future = JSON.stringify({ ...draft, status: 'finished', finishedAt: NOW + 60_000 });
    expect(decodeWorkoutDraft(future, NOW)!.status).toBe('active');

    const beforeStart = JSON.stringify({ ...draft, status: 'finished', finishedAt: draft.startedAt - 1 });
    expect(decodeWorkoutDraft(beforeStart, NOW)!.status).toBe('active');
  });

  it('discards a pause timestamp that makes no sense', () => {
    const fromFuture = JSON.stringify({ ...draft, pausedAt: NOW + 60_000 });
    expect(decodeWorkoutDraft(fromFuture, NOW)!.pausedAt).toBeNull();

    const beforeStart = JSON.stringify({ ...draft, pausedAt: draft.startedAt - 1 });
    expect(decodeWorkoutDraft(beforeStart, NOW)!.pausedAt).toBeNull();

    const negative = JSON.stringify({ ...draft, pausedMs: -5 });
    expect(decodeWorkoutDraft(negative, NOW)!.pausedMs).toBe(0);
  });
});
