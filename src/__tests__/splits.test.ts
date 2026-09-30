import { HrSample, RoutePoint } from '../types';
import { activeMsAt, computeSplits, MIN_LAST_SPLIT_METERS } from '../utils/splits';

const T0 = 1_700_000_000_000;
// Метров в одном градусе широты при радиусе Земли из geo.ts.
const M_PER_DEG = (2 * Math.PI * 6371000) / 360;

/** Маршрут строго на север: точка каждые `step` метров, каждые `secPerStep` секунд. */
function straightRoute(meters: number, step = 100, secPerStep = 36): RoutePoint[] {
  const points: RoutePoint[] = [];
  for (let d = 0, i = 0; d <= meters + 1e-6; d += step, i++) {
    points.push({ lat: 55 + d / M_PER_DEG, lng: 37, t: T0 + i * secPerStep * 1000 });
  }
  return points;
}

function pulse(bpm: number, from: number, to: number): HrSample[] {
  const out: HrSample[] = [];
  for (let t = from; t <= to; t += 1000) out.push({ t, bpm });
  return out;
}

describe('activeMsAt', () => {
  const pauses = [
    { start: T0 + 10_000, end: T0 + 20_000 },
    { start: T0 + 40_000, end: T0 + 45_000 },
  ];
  it('subtracts finished pauses', () => {
    expect(activeMsAt(T0 + 30_000, T0, pauses)).toBe(20_000);
    expect(activeMsAt(T0 + 60_000, T0, pauses)).toBe(45_000);
  });
  it('counts a pause only up to the moment asked', () => {
    expect(activeMsAt(T0 + 15_000, T0, pauses)).toBe(10_000);
  });
  it('is plain elapsed time without pauses', () => {
    expect(activeMsAt(T0 + 7_000, T0, [])).toBe(7_000);
  });
});

describe('computeSplits', () => {
  it('splits an even 6:00/km run into equal kilometres', () => {
    const route = straightRoute(3000);
    const endedAt = route[route.length - 1].t;
    const splits = computeSplits({ startedAt: T0, endedAt, route, hrSamples: [] });
    expect(splits).toHaveLength(3);
    for (const s of splits) {
      expect(s.distanceMeters).toBe(1000);
      expect(s.durationSec).toBe(360);
      expect(s.paceSecPerKm).toBeCloseTo(360, 0);
    }
  });

  it('adds the last partial kilometre with its own pace', () => {
    const route = straightRoute(2500);
    const endedAt = route[route.length - 1].t;
    const splits = computeSplits({ startedAt: T0, endedAt, route, hrSamples: [] });
    expect(splits).toHaveLength(3);
    expect(splits[2].distanceMeters).toBe(500);
    expect(splits[2].durationSec).toBe(180);
    expect(splits[2].paceSecPerKm).toBeCloseTo(360, 0);
  });

  it('drops a tail too short to be a split', () => {
    const route = straightRoute(1000 + MIN_LAST_SPLIT_METERS - 10, 10, 3.6);
    const splits = computeSplits({ startedAt: T0, endedAt: route[route.length - 1].t, route, hrSamples: [] });
    expect(splits).toHaveLength(1);
  });

  it('takes a manual pause out of the kilometre it fell into', () => {
    // Второй километр: пауза 60 с посреди него. Точки на паузе не пишутся, поэтому
    // после паузы время маршрута сдвинуто на эти 60 с.
    const base = straightRoute(2000);
    const pauseStart = T0 + 540_000;
    const route = base.map((p) => (p.t > pauseStart ? { ...p, t: p.t + 60_000 } : p));
    const endedAt = route[route.length - 1].t;
    const pauses = [{ start: pauseStart, end: pauseStart + 60_000 }];
    const splits = computeSplits({ startedAt: T0, endedAt, route, hrSamples: [], pauses });
    expect(splits[1].durationSec).toBe(360);
  });

  it('keeps a stop without pause inside the split, like the overall pace does', () => {
    const base = straightRoute(2000);
    const stopAt = T0 + 540_000;
    const route = base.map((p) => (p.t > stopAt ? { ...p, t: p.t + 60_000 } : p));
    const splits = computeSplits({ startedAt: T0, endedAt: route[route.length - 1].t, route, hrSamples: [] });
    expect(splits[1].durationSec).toBe(420);
  });

  it('sums to the workout duration, counting time before the first GPS fix', () => {
    // GPS поймался через 30 с после старта: это время уходит в первый километр.
    const route = straightRoute(2300).map((p) => ({ ...p, t: p.t + 30_000 }));
    const endedAt = route[route.length - 1].t + 10_000;
    const splits = computeSplits({ startedAt: T0, endedAt, route, hrSamples: [] });
    const total = splits.reduce((sum, s) => sum + s.durationSec, 0);
    expect(total).toBe((endedAt - T0) / 1000);
    expect(splits[0].durationSec).toBe(390);
  });

  it('averages the pulse inside each kilometre', () => {
    const route = straightRoute(2000);
    const endedAt = route[route.length - 1].t;
    const hrSamples = [...pulse(140, T0 + 1000, T0 + 360_000), ...pulse(160, T0 + 361_000, endedAt)];
    const splits = computeSplits({ startedAt: T0, endedAt, route, hrSamples });
    expect(splits[0].avgBpm).toBe(140);
    expect(splits[1].avgBpm).toBe(160);
  });

  it('reports no pulse for a kilometre without samples', () => {
    const route = straightRoute(1000);
    const splits = computeSplits({ startedAt: T0, endedAt: route[route.length - 1].t, route, hrSamples: [] });
    expect(splits[0].avgBpm).toBeNull();
  });

  it('returns nothing for a route shorter than two points', () => {
    expect(computeSplits({ startedAt: T0, endedAt: T0 + 1000, route: straightRoute(0), hrSamples: [] })).toEqual([]);
  });

  it('handles a single segment that covers several kilometres', () => {
    // Пропадание GPS: две точки на расстоянии 2.5 км. Границы интерполируются внутри.
    const route: RoutePoint[] = [
      { lat: 55, lng: 37, t: T0 },
      { lat: 55 + 2500 / M_PER_DEG, lng: 37, t: T0 + 900_000 },
    ];
    const splits = computeSplits({ startedAt: T0, endedAt: T0 + 900_000, route, hrSamples: [] });
    expect(splits.map((s) => s.durationSec)).toEqual([360, 360, 180]);
  });
});
