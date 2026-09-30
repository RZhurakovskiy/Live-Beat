import {
  decodeIntervalConfig,
  describeConfig,
  IntervalConfig,
  isValidConfig,
  phaseAnnouncement,
  phaseAt,
  presetConfig,
  restRemainingMs,
  totalIntervalMs,
  wallAtActive,
  workBands,
} from '../utils/intervals';
import { activeMsAt } from '../utils/splits';

const T0 = 1_700_000_000_000;
const TABATA = presetConfig('tabata');

describe('presets', () => {
  it('builds the classic Tabata, EMOM and AMRAP', () => {
    expect(TABATA).toEqual({ preset: 'tabata', workSec: 20, restSec: 10, rounds: 8 });
    expect(presetConfig('emom', 12)).toEqual({ preset: 'emom', workSec: 60, restSec: 0, rounds: 12 });
    expect(presetConfig('amrap', 15)).toEqual({ preset: 'amrap', workSec: 900, restSec: 0, rounds: 1 });
  });

  it('lasts four minutes minus the last rest for Tabata', () => {
    expect(totalIntervalMs(TABATA)).toBe(230_000);
  });

  it('describes a config in a few words', () => {
    expect(describeConfig(TABATA)).toBe('20 с / 10 с × 8');
    expect(describeConfig(presetConfig('emom', 10))).toBe('каждую минуту, 10 минут');
    expect(describeConfig(presetConfig('amrap', 12))).toBe('12 минут на время');
  });
});

describe('phaseAt', () => {
  it('walks through work and rest phases', () => {
    expect(phaseAt(TABATA, 0)).toEqual({ kind: 'work', round: 1, remainingMs: 20_000, index: 0 });
    expect(phaseAt(TABATA, 25_000)).toEqual({ kind: 'rest', round: 1, remainingMs: 5_000, index: 1 });
    expect(phaseAt(TABATA, 30_000)).toMatchObject({ kind: 'work', round: 2, index: 2 });
    expect(phaseAt(TABATA, 225_000)).toMatchObject({ kind: 'work', round: 8, remainingMs: 5_000 });
  });

  it('is done after the last work phase, without a trailing rest', () => {
    expect(phaseAt(TABATA, 230_000)).toMatchObject({ kind: 'done', round: 8, index: 16 });
    expect(phaseAt(TABATA, 10_000_000).kind).toBe('done');
  });

  it('gives EMOM a new round every minute', () => {
    const emom = presetConfig('emom', 3);
    expect(phaseAt(emom, 61_000)).toMatchObject({ kind: 'work', round: 2 });
    expect(phaseAt(emom, 180_000).kind).toBe('done');
  });
});

describe('phaseAnnouncement', () => {
  it('says what the phase is', () => {
    expect(phaseAnnouncement(TABATA, phaseAt(TABATA, 30_000))).toBe('Раунд 2. Работа.');
    expect(phaseAnnouncement(TABATA, phaseAt(TABATA, 21_000))).toBe('Отдых.');
    expect(phaseAnnouncement(TABATA, phaseAt(TABATA, 210_000))).toBe('Последний раунд. Работа.');
    expect(phaseAnnouncement(TABATA, phaseAt(TABATA, 300_000))).toBe('Интервалы завершены.');
    const emom = presetConfig('emom', 5);
    expect(phaseAnnouncement(emom, phaseAt(emom, 120_500))).toBe('Минута 3.');
    const amrap = presetConfig('amrap', 10);
    expect(phaseAnnouncement(amrap, phaseAt(amrap, 0))).toBe('Работа.');
  });
});

describe('config validation', () => {
  it('rejects zero rounds, tiny work and broken input', () => {
    expect(isValidConfig({ preset: 'custom', workSec: 30, restSec: 15, rounds: 0 })).toBe(false);
    expect(isValidConfig({ preset: 'custom', workSec: 2, restSec: 15, rounds: 3 })).toBe(false);
    expect(decodeIntervalConfig({ preset: 'yoga', workSec: 30, restSec: 15, rounds: 3 })).toBeNull();
    expect(decodeIntervalConfig(null)).toBeNull();
  });

  it('accepts a sensible custom config', () => {
    const custom: IntervalConfig = { preset: 'custom', workSec: 90, restSec: 60, rounds: 6 };
    expect(decodeIntervalConfig(custom)).toEqual(custom);
  });
});

describe('wallAtActive', () => {
  const pauses = [
    { start: T0 + 10_000, end: T0 + 20_000 },
    { start: T0 + 40_000, end: T0 + 45_000 },
  ];

  it('is the inverse of active time', () => {
    for (const active of [0, 5_000, 10_000, 15_000, 30_000, 35_000, 60_000]) {
      expect(activeMsAt(wallAtActive(active, T0, pauses), T0, pauses)).toBe(active);
    }
  });

  it('shifts past the pauses that came before', () => {
    expect(wallAtActive(15_000, T0, pauses)).toBe(T0 + 25_000);
    expect(wallAtActive(35_000, T0, pauses)).toBe(T0 + 50_000);
  });
});

describe('workBands', () => {
  it('marks the work phases on the wall clock', () => {
    const custom: IntervalConfig = { preset: 'custom', workSec: 30, restSec: 30, rounds: 3 };
    expect(workBands(custom, T0, [], T0 + 1_000_000)).toEqual([
      { from: T0, to: T0 + 30_000 },
      { from: T0 + 60_000, to: T0 + 90_000 },
      { from: T0 + 120_000, to: T0 + 150_000 },
    ]);
  });

  it('moves the bands by a pause and cuts them at the finish', () => {
    const custom: IntervalConfig = { preset: 'custom', workSec: 30, restSec: 30, rounds: 3 };
    const pauses = [{ start: T0 + 40_000, end: T0 + 100_000 }];
    expect(workBands(custom, T0, pauses, T0 + 130_000)).toEqual([
      { from: T0, to: T0 + 30_000 },
      { from: T0 + 120_000, to: T0 + 130_000 },
    ]);
  });
});

describe('restRemainingMs', () => {
  it('counts down on the active clock', () => {
    const rest = { startActiveMs: 100_000, durationSec: 90 };
    expect(restRemainingMs(rest, 100_000)).toBe(90_000);
    expect(restRemainingMs(rest, 190_000)).toBe(0);
    expect(restRemainingMs(rest, 200_000)).toBeLessThan(0);
  });
});
