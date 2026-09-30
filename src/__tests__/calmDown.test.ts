import { HrSample } from '../types';
import { calmDown, MIN_CALM_SESSION_MS } from '../utils/calmDown';

const T0 = 1_700_000_000_000;

function practice(minutes: number, bpmAt: (minute: number) => number): HrSample[] {
  const out: HrSample[] = [];
  for (let s = 0; s <= minutes * 60; s += 5) out.push({ t: T0 + s * 1000, bpm: bpmAt(s / 60) });
  return out;
}

describe('calmDown', () => {
  it('shows how far the pulse dropped by the end', () => {
    // Первые минуты около 92, шавасана около 68.
    const result = calmDown(practice(60, (m) => (m < 5 ? 92 : m > 55 ? 68 : 80)));
    expect(result).toEqual({ startBpm: 92, endBpm: 68, delta: -24 });
  });

  it('reports a rise honestly, without judging it', () => {
    const result = calmDown(practice(30, (m) => (m < 5 ? 80 : 95)));
    expect(result?.delta).toBe(15);
  });

  it('refuses to compare a practice too short for two separate windows', () => {
    const short = practice(MIN_CALM_SESSION_MS / 60_000 - 1, () => 80);
    expect(calmDown(short)).toBeNull();
  });

  it('counts the windows from the first and last reading, not the start button', () => {
    // Ремень поймал пульс только на пятой минуте: окно начала сдвигается туда.
    const late = practice(40, (m) => (m < 9 ? 100 : 70)).filter((s) => s.t >= T0 + 5 * 60_000);
    expect(calmDown(late)?.startBpm).toBe(100);
  });

  it('needs samples', () => {
    expect(calmDown([])).toBeNull();
  });
});
