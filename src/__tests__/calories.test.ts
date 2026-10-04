import {
  HR_FLOOR_BPM,
  HR_FULL_BPM,
  MET_LIMITS,
  activeFromTotal,
  computeActiveCalories,
  computeWorkoutCalories,
  formatKcal,
  restCalories,
  totalCalories,
} from '../utils/calories';
import { HrSample, RoutePoint, UserProfile } from '../types';

const MAN: UserProfile = { weightKg: 80, age: 35, gender: 'male' };
const T0 = 1_700_000_000_000;
const LAT = 55;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((LAT * Math.PI) / 180);

/** Маршрут прямо на восток с постоянной скоростью, точка раз в `stepSec`. */
function route(speedMs: number, durationSec: number, stepSec = 5, startSec = 0): RoutePoint[] {
  const points: RoutePoint[] = [];
  for (let s = 0; s <= durationSec; s += stepSec) {
    points.push({ lat: LAT, lng: 37 + (speedMs * s) / M_PER_DEG_LNG, t: T0 + (startSec + s) * 1000 });
  }
  return points;
}

/** Постоянный пульс раз в секунду. */
function samples(bpm: number, durationSec: number, stepSec = 1, startSec = 0): HrSample[] {
  const out: HrSample[] = [];
  for (let s = 0; s <= durationSec; s += stepSec) out.push({ t: T0 + (startSec + s) * 1000, bpm });
  return out;
}

describe('computeActiveCalories: GPS, по скорости', () => {
  it('walking 4.4 km/h for an hour at 80 kg gives about 176 active kcal (ACSM)', () => {
    // v = 73.3 м/мин, VO2 = 10.83, активная часть 7.33 мл/кг/мин, 2.93 ккал/мин, 176 за час.
    const kcal = computeActiveCalories({
      mode: 'outdoor',
      hrSamples: samples(112, 3600),
      route: route(4.4 / 3.6, 3600),
      profile: MAN,
    });
    expect(kcal).toBeGreaterThan(170);
    expect(kcal).toBeLessThan(182);
  });

  it('does not depend on heart rate: a hot, stressed pulse gives the same kcal while walking', () => {
    const calm = computeActiveCalories({ mode: 'outdoor', hrSamples: samples(100, 1800), route: route(1.2, 1800), profile: MAN });
    const racing = computeActiveCalories({ mode: 'outdoor', hrSamples: samples(170, 1800), route: route(1.2, 1800), profile: MAN });
    expect(racing).toBe(calm);
  });

  it('stays far below the old heart-rate estimate for the forest walk (about 1069)', () => {
    // 1:55:25 при 4.4 км/ч и пульсе 112: раньше 1069, теперь около 340.
    const kcal = computeActiveCalories({
      mode: 'outdoor',
      hrSamples: samples(112, 6925),
      route: route(4.4 / 3.6, 6925),
      profile: MAN,
    });
    expect(kcal).toBeGreaterThan(320);
    expect(kcal).toBeLessThan(360);
  });

  it('running 10 km/h for an hour at 80 kg gives about 760 active kcal', () => {
    // v = 166.7 м/мин, VO2 = 36.8, активная 33.3, 13.3 ккал/мин, 800 за час; с поправкой
    // на «перемещение вместо пути» допускаем разброс.
    const kcal = computeActiveCalories({ mode: 'outdoor', hrSamples: samples(160, 3600), route: route(10 / 3.6, 3600), profile: MAN });
    expect(kcal).toBeGreaterThan(780);
    expect(kcal).toBeLessThan(820);
  });

  it('counts standing still as rest, even with GPS jitter', () => {
    const jitter: RoutePoint[] = [];
    for (let s = 0; s <= 1800; s += 1) {
      // дрожь ±3 м вокруг одной точки
      const dx = (s % 2 === 0 ? 3 : -3) / M_PER_DEG_LNG;
      jitter.push({ lat: LAT, lng: 37 + dx, t: T0 + s * 1000 });
    }
    const kcal = computeActiveCalories({ mode: 'outdoor', hrSamples: samples(115, 1800), route: jitter, profile: MAN });
    expect(kcal).toBe(0);
  });

  it('does not count time spent in manual pauses', () => {
    const full = computeActiveCalories({ mode: 'outdoor', hrSamples: samples(112, 3600), route: route(1.2, 3600), profile: MAN });
    const paused = computeActiveCalories({
      mode: 'outdoor',
      hrSamples: samples(112, 3600),
      route: route(1.2, 3600),
      pauses: [{ start: T0 + 1800_000, end: T0 + 2700_000 }],
      profile: MAN,
    });
    expect(paused).toBeCloseTo((full as number) * 0.75, -1);
  });

  it('scales with weight', () => {
    const light = computeActiveCalories({ mode: 'outdoor', hrSamples: samples(112, 3600), route: route(1.2, 3600), profile: { ...MAN, weightKg: 60 } });
    const heavy = computeActiveCalories({ mode: 'outdoor', hrSamples: samples(112, 3600), route: route(1.2, 3600), profile: { ...MAN, weightKg: 90 } });
    expect((heavy as number) / (light as number)).toBeCloseTo(1.5, 1);
  });

  it('blends smoothly between walking and running speeds', () => {
    const kcalAt = (kmh: number) =>
      computeActiveCalories({ mode: 'outdoor', hrSamples: samples(140, 600), route: route(kmh / 3.6, 600), profile: MAN }) as number;
    const slow = kcalAt(5.5);
    const mid = kcalAt(7);
    const fast = kcalAt(8.5);
    expect(mid).toBeGreaterThan(slow);
    expect(fast).toBeGreaterThan(mid);
    // нет скачка на границах переключения формул
    expect(kcalAt(6.1) - kcalAt(5.9)).toBeLessThan(6);
    expect(kcalAt(8.1) - kcalAt(7.9)).toBeLessThan(8);
  });

  it('treats a GPS jump faster than a human as unknown and falls back to heart rate for that stretch', () => {
    const pts = route(1.2, 600);
    // скачок на 2 км за 30 секунд в середине
    const jumped: RoutePoint[] = pts.map((p) => (p.t >= T0 + 300_000 ? { ...p, lng: p.lng + 2000 / M_PER_DEG_LNG } : p));
    const kcal = computeActiveCalories({ mode: 'outdoor', hrSamples: samples(150, 600), route: jumped, profile: MAN }) as number;
    const clean = computeActiveCalories({ mode: 'outdoor', hrSamples: samples(150, 600), route: pts, profile: MAN }) as number;
    // скачок не раздувает расход на бегу: итог в пределах разумного для 10 минут
    expect(kcal).toBeLessThan(clean + 80);
  });

  it('fills a long GPS gap from heart rate instead of dropping it', () => {
    const before = route(1.2, 600);
    const after = route(1.2, 600, 5, 1800); // дыра 20 минут между 600 и 1800 с
    const gappy = computeActiveCalories({
      mode: 'outdoor',
      hrSamples: samples(130, 2400),
      route: [...before, ...after],
      profile: MAN,
    }) as number;
    const withoutHr = computeActiveCalories({
      mode: 'outdoor',
      hrSamples: samples(60, 2400),
      route: [...before, ...after],
      profile: MAN,
    }) as number;
    expect(gappy).toBeGreaterThan(withoutHr);
  });

  it('uses heart rate for the stretch before the first GPS fix', () => {
    const withWait = computeActiveCalories({
      mode: 'outdoor',
      hrSamples: samples(130, 900),
      route: route(1.2, 600, 5, 300), // GPS поймали на пятой минуте, маршрут и пульс кончаются вместе
      profile: MAN,
    }) as number;
    const noWait = computeActiveCalories({
      mode: 'outdoor',
      hrSamples: samples(130, 600),
      route: route(1.2, 600, 5, 0),
      profile: MAN,
    }) as number;
    expect(withWait).toBeGreaterThan(noWait);
  });
});

describe('computeActiveCalories: велосипед', () => {
  it('18 km/h for an hour at 80 kg uses MET 6.8 (about 464 active kcal)', () => {
    const kcal = computeActiveCalories({ mode: 'cycling', hrSamples: samples(140, 3600), route: route(18 / 3.6, 3600), profile: MAN });
    expect(kcal).toBeGreaterThan(455);
    expect(kcal).toBeLessThan(475);
  });

  it('20 km/h falls into the next band, MET 8.0 (560 active kcal per hour)', () => {
    const kcal = computeActiveCalories({ mode: 'cycling', hrSamples: samples(140, 3600), route: route(20 / 3.6, 3600), profile: MAN });
    expect(kcal).toBeGreaterThan(550);
    expect(kcal).toBeLessThan(570);
  });

  it('pushing the bike at walking speed is not counted as cycling', () => {
    const kcal = computeActiveCalories({ mode: 'cycling', hrSamples: samples(100, 600), route: route(0.1, 600), profile: MAN });
    expect(kcal).toBe(0);
  });

  it('allows downhill speeds that would be a GPS jump on foot', () => {
    const fast = computeActiveCalories({ mode: 'cycling', hrSamples: samples(130, 600), route: route(18, 600), profile: MAN }) as number;
    expect(fast).toBeGreaterThan(100);
  });
});

describe('computeActiveCalories: по пульсу', () => {
  it('counts nothing at or below the floor heart rate', () => {
    const kcal = computeActiveCalories({ mode: 'other', hrSamples: samples(HR_FLOOR_BPM, 3600), profile: MAN });
    expect(kcal).toBe(0);
  });

  it('ramps in smoothly up to the full-weight threshold', () => {
    const at = (bpm: number) => computeActiveCalories({ mode: 'other', hrSamples: samples(bpm, 600), profile: MAN }) as number;
    const a = at(HR_FLOOR_BPM + 5);
    const b = at(HR_FLOOR_BPM + 15);
    const c = at(HR_FULL_BPM);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    // нет скачка на пороге
    expect(at(HR_FLOOR_BPM + 1)).toBeLessThan(5);
  });

  it('is lower for women with the same profile and pulse', () => {
    const man = computeActiveCalories({ mode: 'other', hrSamples: samples(150, 1800), profile: MAN }) as number;
    const woman = computeActiveCalories({ mode: 'other', hrSamples: samples(150, 1800), profile: { ...MAN, gender: 'female' } }) as number;
    expect(woman).toBeLessThan(man);
  });

  it('skips a gap between pulse readings longer than five minutes', () => {
    const joined = [...samples(150, 300), ...samples(150, 300, 1, 900)]; // дыра 10 минут
    const kcal = computeActiveCalories({ mode: 'other', hrSamples: joined, profile: MAN }) as number;
    const solid = computeActiveCalories({ mode: 'other', hrSamples: samples(150, 1200), profile: MAN }) as number;
    expect(kcal).toBeLessThan(solid);
  });

  it('does not count time in manual pauses', () => {
    const full = computeActiveCalories({ mode: 'other', hrSamples: samples(150, 1200), profile: MAN }) as number;
    const paused = computeActiveCalories({
      mode: 'other',
      hrSamples: samples(150, 1200),
      pauses: [{ start: T0 + 300_000, end: T0 + 900_000 }],
      profile: MAN,
    }) as number;
    expect(paused).toBeCloseTo(full * 0.5, -1);
  });

  it('uses heart rate for an outdoor mode that has no route', () => {
    const kcal = computeActiveCalories({ mode: 'outdoor', hrSamples: samples(150, 600), route: [], profile: MAN });
    expect(kcal).toBeGreaterThan(0);
  });
});

describe('computeActiveCalories: нет данных', () => {
  it('returns undefined without a profile', () => {
    expect(computeActiveCalories({ mode: 'outdoor', hrSamples: samples(120, 60), route: route(1.2, 60), profile: null })).toBeUndefined();
  });

  it('returns undefined when there is nothing to count', () => {
    expect(computeActiveCalories({ mode: 'gym', hrSamples: [], profile: MAN })).toBeUndefined();
    expect(computeActiveCalories({ mode: 'gym', hrSamples: samples(120, 0), profile: MAN })).toBeUndefined();
  });

  it('formats the value with an approximately sign', () => {
    expect(formatKcal(337)).toBe('≈337');
  });
});

describe('полные калории', () => {
  it('rest burns about 1.05 kcal per kg per hour', () => {
    expect(restCalories(80, 3600)).toBeCloseTo(84, 5);
    expect(restCalories(60, 1800)).toBeCloseTo(31.5, 5);
    expect(restCalories(80, -5)).toBe(0);
  });

  it('total is active plus rest for the whole workout time', () => {
    const input = { mode: 'outdoor' as const, hrSamples: samples(112, 3600), route: route(4.4 / 3.6, 3600), profile: MAN };
    const active = computeActiveCalories(input) as number;
    const total = computeWorkoutCalories({ ...input, durationSec: 3600 }) as number;
    expect(total).toBe(Math.round(active + 84));
    expect(total).toBeGreaterThan(255);
    expect(total).toBeLessThan(270);
  });

  it('puts the forest walk (1:55) in the same range as Zepp showed, 400-600', () => {
    const total = computeWorkoutCalories({
      mode: 'outdoor',
      hrSamples: samples(112, 6925),
      route: route(4.4 / 3.6, 6925),
      durationSec: 6925,
      profile: MAN,
    }) as number;
    expect(total).toBeGreaterThan(470);
    expect(total).toBeLessThan(530);
  });

  it('active-from-total undoes total-from-active, within rounding, and never goes below zero', () => {
    const total = totalCalories(337.4, 80, 6925);
    expect(Math.abs(activeFromTotal(total, 80, 6925) - 337)).toBeLessThanOrEqual(1);
    expect(activeFromTotal(100, 80, 36000)).toBe(0);
  });

  it('returns undefined without a profile or data, like the active version', () => {
    expect(computeWorkoutCalories({ mode: 'gym', hrSamples: [], durationSec: 600, profile: MAN })).toBeUndefined();
    expect(computeWorkoutCalories({ mode: 'gym', hrSamples: samples(120, 60), durationSec: 60, profile: null })).toBeUndefined();
  });
});

describe('границы MET для зала, кроссфита и йоги', () => {
  const kcalPerHour = (mode: 'gym' | 'crossfit' | 'yoga' | 'other', bpm: number) =>
    computeActiveCalories({ mode, hrSamples: samples(bpm, 3600), profile: MAN }) as number;
  // активные ккал в час при полных MET: (MET - 1.05) * 80
  const activeAt = (met: number) => (met - 1.05) * 80;

  it('caps strength work at 6 MET, where raw Keytel gave about 810 kcal per hour at pulse 150', () => {
    expect(kcalPerHour('other', 150)).toBeGreaterThan(780);
    expect(kcalPerHour('gym', 150)).toBeCloseTo(activeAt(MET_LIMITS.gym!.max), 0);
    expect(kcalPerHour('gym', 150)).toBeLessThan(400);
  });

  it('caps crossfit at 11 MET and raises it to at least 5 MET once the pulse is up', () => {
    expect(kcalPerHour('crossfit', 125)).toBeGreaterThanOrEqual(activeAt(MET_LIMITS.crossfit!.min) - 1);
    expect(kcalPerHour('crossfit', 190)).toBeLessThanOrEqual(activeAt(MET_LIMITS.crossfit!.max) + 1);
  });

  it('does not invent effort for gym or crossfit while the pulse is at rest', () => {
    expect(kcalPerHour('gym', 80)).toBe(0);
    expect(kcalPerHour('crossfit', HR_FLOOR_BPM)).toBe(0);
  });

  it('keeps yoga at least at 2.3 MET even with a calm pulse, and at most 4 MET', () => {
    expect(kcalPerHour('yoga', 70)).toBeCloseTo(activeAt(MET_LIMITS.yoga!.min), 0);
    expect(kcalPerHour('yoga', 170)).toBeCloseTo(activeAt(MET_LIMITS.yoga!.max), 0);
  });

  it('leaves other activities unbounded', () => {
    expect(MET_LIMITS.other).toBeUndefined();
    expect(MET_LIMITS.treadmill).toBeUndefined();
  });

  it('lifts a low estimate for gym work to the 3.5 MET floor once the pulse is up', () => {
    expect(kcalPerHour('gym', 100)).toBeGreaterThanOrEqual(kcalPerHour('other', 100));
  });
});
