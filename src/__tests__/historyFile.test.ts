import { WorkoutSession } from '../types';
import {
  buildHistoryFile,
  decodeProfile,
  decodeSession,
  HISTORY_FORMAT,
  HISTORY_VERSION,
  historyFileName,
  parseHistoryFile,
  planImport,
} from '../utils/historyFile';

const T0 = 1_700_000_000_000;

function session(id: string, extra: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id,
    mode: 'outdoor',
    startedAt: T0,
    endedAt: T0 + 600_000,
    durationSec: 600,
    avgHr: 140,
    maxHr: 170,
    minHr: 100,
    hrSamples: [
      { t: T0, bpm: 120 },
      { t: T0 + 1000, bpm: 125 },
    ],
    distanceMeters: 1500,
    avgPaceSecPerKm: 400,
    route: [
      { lat: 55.7, lng: 37.6, t: T0 },
      { lat: 55.71, lng: 37.61, t: T0 + 1000 },
    ],
    caloriesKcal: 120,
    ...extra,
  };
}

const PROFILE = { weightKg: 80, age: 35, gender: 'male' as const };

describe('buildHistoryFile / parseHistoryFile', () => {
  it('round-trips sessions and profile unchanged', () => {
    const sessions = [session('a'), session('b', { mode: 'treadmill', route: undefined, distanceMeters: undefined })];
    const parsed = parseHistoryFile(buildHistoryFile(sessions, PROFILE, T0));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.sessions).toEqual(sessions);
    expect(parsed.profile).toEqual(PROFILE);
    expect(parsed.skipped).toBe(0);
  });

  it('writes the format tag and version', () => {
    const raw = JSON.parse(buildHistoryFile([], null, T0));
    expect(raw.format).toBe(HISTORY_FORMAT);
    expect(raw.version).toBe(HISTORY_VERSION);
    expect(raw.exportedAt).toBe(T0);
  });

  it('rejects text that is not JSON', () => {
    expect(parseHistoryFile('<gpx>')).toEqual({ ok: false, error: 'not-json' });
  });

  it('rejects JSON that is not a history file', () => {
    expect(parseHistoryFile(JSON.stringify({ sessions: [] }))).toEqual({ ok: false, error: 'wrong-format' });
    expect(parseHistoryFile('[]')).toEqual({ ok: false, error: 'wrong-format' });
    expect(parseHistoryFile('null')).toEqual({ ok: false, error: 'wrong-format' });
  });

  it('refuses a file from a newer app version instead of misreading it', () => {
    const json = JSON.stringify({ format: HISTORY_FORMAT, version: HISTORY_VERSION + 1, sessions: [] });
    expect(parseHistoryFile(json)).toEqual({ ok: false, error: 'newer-version' });
  });

  it('skips broken sessions one by one and keeps the rest', () => {
    const json = JSON.stringify({
      format: HISTORY_FORMAT,
      version: HISTORY_VERSION,
      profile: null,
      sessions: [session('good'), { id: 'broken' }, null, session('bad-mode', { mode: 'swimming' as never })],
    });
    const parsed = parseHistoryFile(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.sessions.map((s) => s.id)).toEqual(['good']);
    expect(parsed.skipped).toBe(3);
  });
});

describe('decodeSession', () => {
  it('drops broken samples and route points but keeps the session', () => {
    const raw = {
      ...session('x'),
      hrSamples: [{ t: T0, bpm: 120 }, { t: 'x', bpm: 1 }, null],
      route: [{ lat: 1, lng: 2, t: T0 }, { lat: 'a' }],
    };
    const decoded = decodeSession(raw)!;
    expect(decoded.hrSamples).toHaveLength(1);
    expect(decoded.route).toHaveLength(1);
  });

  it('rejects a session that ends before it starts', () => {
    expect(decodeSession(session('x', { endedAt: T0 - 1 }))).toBeNull();
  });

  it('rejects a session without samples array or id', () => {
    expect(decodeSession({ ...session('x'), hrSamples: 'nope' })).toBeNull();
    expect(decodeSession({ ...session('x'), id: '' })).toBeNull();
  });

  it('turns an empty route into no route', () => {
    expect(decodeSession(session('x', { route: [] }))!.route).toBeUndefined();
  });

  it('ignores fields it does not know', () => {
    const decoded = decodeSession({ ...session('x'), somethingNew: 42 })!;
    expect('somethingNew' in decoded).toBe(false);
  });
});

describe('decodeSession, fields added after version 1', () => {
  it('carries pauses and pulse recovery through the file', () => {
    const withExtras = session('x', {
      pauses: [{ start: T0 + 10_000, end: T0 + 20_000 }],
      recovery: { fromBpm: 160, toBpm: 128 },
    });
    const parsed = parseHistoryFile(buildHistoryFile([withExtras], null, T0));
    expect(parsed.ok && parsed.sessions[0]).toEqual(withExtras);
  });

  it('carries the interval timer of a crossfit workout', () => {
    const crossfit = session('c', {
      mode: 'crossfit',
      route: undefined,
      distanceMeters: undefined,
      avgPaceSecPerKm: undefined,
      interval: { preset: 'custom', workSec: 40, restSec: 20, rounds: 5 },
    });
    const parsed = parseHistoryFile(buildHistoryFile([crossfit], null, T0));
    expect(parsed.ok && parsed.sessions[0]).toEqual(crossfit);
  });

  it('drops a pause outside the workout and a half-filled recovery', () => {
    const decoded = decodeSession({
      ...session('x'),
      pauses: [{ start: T0 - 5, end: T0 + 1 }],
      recovery: { fromBpm: 150 },
    })!;
    expect(decoded.pauses).toBeUndefined();
    expect(decoded.recovery).toBeUndefined();
  });
});

describe('decodeProfile', () => {
  it('accepts a plausible profile', () => {
    expect(decodeProfile(PROFILE)).toEqual(PROFILE);
  });

  it('rejects implausible values', () => {
    expect(decodeProfile({ ...PROFILE, weightKg: 0 })).toBeNull();
    expect(decodeProfile({ ...PROFILE, age: 200 })).toBeNull();
    expect(decodeProfile({ ...PROFILE, gender: 'x' })).toBeNull();
    expect(decodeProfile(null)).toBeNull();
  });
});

describe('planImport', () => {
  it('skips sessions the phone already has, without overwriting', () => {
    const plan = planImport(['a'], [session('a', { avgHr: 999 }), session('b')]);
    expect(plan.toInsert.map((s) => s.id)).toEqual(['b']);
    expect(plan.duplicates).toBe(1);
  });

  it('counts duplicates inside the file once', () => {
    const plan = planImport([], [session('a'), session('a'), session('b')]);
    expect(plan.toInsert.map((s) => s.id)).toEqual(['a', 'b']);
    expect(plan.duplicates).toBe(1);
  });

  it('importing the same file twice adds nothing the second time', () => {
    const first = planImport([], [session('a'), session('b')]);
    const second = planImport(first.toInsert.map((s) => s.id), [session('a'), session('b')]);
    expect(second.toInsert).toHaveLength(0);
    expect(second.duplicates).toBe(2);
  });
});

describe('historyFileName', () => {
  it('puts the local date into the name', () => {
    const name = historyFileName(new Date(2026, 8, 30, 21, 0).getTime());
    expect(name).toBe('livebeat-history-2026-09-30.json');
  });
});
