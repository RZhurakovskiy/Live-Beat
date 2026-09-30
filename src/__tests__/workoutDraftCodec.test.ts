import { decodePauses, decodeWorkoutDraft, encodeWorkoutDraft, MAX_DRAFT_AGE_MS, WorkoutDraft } from '../workout/workoutDraftCodec';

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
  pauses: [],
  interval: null,
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
    // Тренировку не из чего собрать, так что безопаснее продолжить её как идущую.
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

describe('pauses in the draft', () => {
  it('round-trips finished pauses', () => {
    const withPauses: WorkoutDraft = {
      ...draft,
      pausedMs: 20_000,
      pauses: [
        { start: NOW - 80 * 60 * 1000, end: NOW - 80 * 60 * 1000 + 5_000 },
        { start: NOW - 40 * 60 * 1000, end: NOW - 40 * 60 * 1000 + 15_000 },
      ],
    };
    expect(decodeWorkoutDraft(encodeWorkoutDraft(withPauses), NOW)).toEqual(withPauses);
  });

  it('reads a draft without pauses as an empty list', () => {
    const { pauses, ...legacy } = draft;
    void pauses;
    expect(decodeWorkoutDraft(JSON.stringify(legacy), NOW)!.pauses).toEqual([]);
  });
});

describe('decodePauses', () => {
  const START = NOW - 60_000;
  it('drops broken, reversed and out-of-range intervals and sorts the rest', () => {
    const raw = [
      { start: START + 30_000, end: START + 35_000 },
      { start: START + 10_000, end: START + 12_000 },
      { start: START + 20_000, end: START + 19_000 },
      { start: START - 1, end: START + 1_000 },
      { start: START + 40_000, end: NOW + 1 },
      { start: 'x', end: 1 },
      null,
    ];
    expect(decodePauses(raw, START, NOW)).toEqual([
      { start: START + 10_000, end: START + 12_000 },
      { start: START + 30_000, end: START + 35_000 },
    ]);
  });

  it('returns an empty list for anything that is not an array', () => {
    expect(decodePauses(undefined, START, NOW)).toEqual([]);
    expect(decodePauses('x', START, NOW)).toEqual([]);
  });
});

describe('interval timer in the draft', () => {
  it('survives the app being killed', () => {
    const crossfit: WorkoutDraft = { ...draft, mode: 'crossfit', interval: { preset: 'tabata', workSec: 20, restSec: 10, rounds: 8 } };
    expect(decodeWorkoutDraft(encodeWorkoutDraft(crossfit), NOW)).toEqual(crossfit);
  });

  it('drops a broken timer but keeps the workout', () => {
    const json = JSON.stringify({ ...draft, interval: { preset: 'tabata', workSec: 0, restSec: 10, rounds: 8 } });
    expect(decodeWorkoutDraft(json, NOW)!.interval).toBeNull();
  });
});
