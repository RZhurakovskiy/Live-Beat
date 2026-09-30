import { HrSample } from '../types';
import {
  bpmBefore,
  probeAccepts,
  RECOVERY_GIVE_UP_MS,
  RECOVERY_WINDOW_MS,
  recoveryState,
  RecoveryProbe,
} from '../utils/recovery';

const T0 = 1_700_000_000_000;

function samples(from: number, to: number, bpmAt: (t: number) => number): HrSample[] {
  const out: HrSample[] = [];
  for (let t = from; t <= to; t += 1000) out.push({ t, bpm: bpmAt(t) });
  return out;
}

function probe(extra: Partial<RecoveryProbe> = {}): RecoveryProbe {
  return { startedAt: T0, fromBpm: 165, samples: [], ...extra };
}

describe('bpmBefore', () => {
  it('averages the last seconds before the pause', () => {
    const s = [...samples(T0 - 20_000, T0 - 6_000, () => 100), ...samples(T0 - 4_000, T0, () => 170)];
    expect(bpmBefore(s, T0)).toBe(170);
  });
  it('is null when the strap was silent at the end', () => {
    expect(bpmBefore(samples(T0 - 30_000, T0 - 10_000, () => 150), T0)).toBeNull();
  });
});

describe('recoveryState', () => {
  // Пульс падает на полудар в секунду: за минуту со 165 до 135.
  const falling = samples(T0, T0 + 70_000, (t) => Math.round(165 - (t - T0) / 2000));

  it('counts down while the minute is not over', () => {
    const p = probe({ samples: falling.filter((s) => s.t <= T0 + 20_000) });
    const state = recoveryState(p, T0 + 20_000);
    expect(state).toEqual({ state: 'measuring', remainingSec: 40, currentBpm: 155 });
  });

  it('reports the drop after a minute', () => {
    const state = recoveryState(probe({ samples: falling }), T0 + RECOVERY_WINDOW_MS + 5_000);
    expect(state.state).toBe('done');
    if (state.state !== 'done') return;
    expect(state.recovery.fromBpm).toBe(165);
    expect(Math.abs(state.recovery.toBpm - 135)).toBeLessThanOrEqual(1);
  });

  it('is unavailable without a pulse at the end of the effort', () => {
    expect(recoveryState(probe({ fromBpm: null, samples: falling }), T0 + 70_000)).toEqual({ state: 'unavailable' });
  });

  it('waits a little for a late reading, then gives up', () => {
    const early = falling.filter((s) => s.t <= T0 + 30_000);
    expect(recoveryState(probe({ samples: early }), T0 + 62_000).state).toBe('measuring');
    expect(recoveryState(probe({ samples: early }), T0 + RECOVERY_GIVE_UP_MS + 1).state).toBe('unavailable');
  });

  it('uses the nearest reading when the window around the mark is empty', () => {
    const gap = [...samples(T0, T0 + 50_000, () => 150), { t: T0 + 64_000, bpm: 128 }];
    const state = recoveryState(probe({ samples: gap }), T0 + 70_000);
    expect(state).toEqual({ state: 'done', recovery: { fromBpm: 165, toBpm: 128 } });
  });

  it('does not show a stale number as live while measuring', () => {
    const p = probe({ samples: [{ t: T0 + 1_000, bpm: 160 }] });
    const state = recoveryState(p, T0 + 30_000);
    expect(state.state === 'measuring' && state.currentBpm).toBeNull();
  });
});

describe('probeAccepts', () => {
  it('takes readings only inside the measuring window', () => {
    const p = probe();
    expect(probeAccepts(p, T0 - 1)).toBe(false);
    expect(probeAccepts(p, T0 + 30_000)).toBe(true);
    expect(probeAccepts(p, T0 + RECOVERY_GIVE_UP_MS + 1)).toBe(false);
  });
});
