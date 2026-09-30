import { HrSample } from '../types';
import { MAX_SAMPLE_GAP_SEC, zoneBreakdown, zoneSecondsFromSamples, zoneShares } from '../utils/zoneTime';

const MAX_HR = 190; // зона 1 начинается с 95, зона 3 со 133, зона 5 со 171
const T0 = 1_700_000_000_000;

// По одному показанию в секунду с заданным пульсом.
function samplesAt(bpm: number, count: number, from = T0): HrSample[] {
  return Array.from({ length: count }, (_, i) => ({ t: from + i * 1000, bpm }));
}

describe('zoneSecondsFromSamples', () => {
  it('returns all zeros without a max heart rate', () => {
    expect(zoneSecondsFromSamples(samplesAt(150, 10), null)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('attributes time to the zone of the later sample', () => {
    // 140 уд/мин это 73.7% от 190, зона 3. Десять показаний дают девять промежутков.
    const seconds = zoneSecondsFromSamples(samplesAt(140, 10), MAX_HR);
    expect(seconds[3]).toBe(9);
    expect(seconds.reduce((a, b) => a + b, 0)).toBe(9);
  });

  it('puts a pulse below zone 1 into index 0', () => {
    // 80 уд/мин это 42%, ниже зоны 1.
    expect(zoneSecondsFromSamples(samplesAt(80, 5), MAX_HR)[0]).toBe(4);
  });

  it('ignores a gap longer than the dropout threshold', () => {
    const samples: HrSample[] = [
      { t: T0, bpm: 140 },
      { t: T0 + (MAX_SAMPLE_GAP_SEC + 1) * 1000, bpm: 140 },
      { t: T0 + (MAX_SAMPLE_GAP_SEC + 2) * 1000, bpm: 140 },
    ];
    // Считается только последний секундный промежуток: пропадание ремня это не время в зоне.
    expect(zoneSecondsFromSamples(samples, MAX_HR)[3]).toBe(1);
  });

  it('ignores samples that go backwards in time', () => {
    const samples: HrSample[] = [
      { t: T0 + 5000, bpm: 140 },
      { t: T0, bpm: 140 },
    ];
    expect(zoneSecondsFromSamples(samples, MAX_HR).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('needs at least two samples', () => {
    expect(zoneSecondsFromSamples(samplesAt(140, 1), MAX_HR).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('zoneBreakdown', () => {
  it('lists all five zones hardest first', () => {
    const rows = zoneBreakdown(samplesAt(140, 10), MAX_HR);
    expect(rows.map((r) => r.zone.index)).toEqual([5, 4, 3, 2, 1]);
  });

  it('splits percentages between zones', () => {
    // 10 с в зоне 3 (9 промежутков), потом 10 с в зоне 5 (10 промежутков вместе со
    // стыком, один из них переходный).
    const first = samplesAt(140, 10);
    const second = samplesAt(180, 10, T0 + 10_000);
    const rows = zoneBreakdown([...first, ...second], MAX_HR);
    const zone3 = rows.find((r) => r.zone.index === 3)!;
    const zone5 = rows.find((r) => r.zone.index === 5)!;
    expect(zone3.seconds).toBe(9);
    expect(zone5.seconds).toBe(10);
    expect(zone3.percent + zone5.percent).toBe(100);
  });

  it('does not let time below zone 1 eat the percentages', () => {
    // Половина тренировки это ходьба ниже зоны 1, а зоны, которые были, всё равно
    // дают в сумме 100%.
    const warmup = samplesAt(80, 10);
    const work = samplesAt(140, 10, T0 + 10_000);
    const rows = zoneBreakdown([...warmup, ...work], MAX_HR);
    expect(rows.find((r) => r.zone.index === 3)!.percent).toBe(100);
  });

  it('reports zeros rather than NaN when there is no data', () => {
    const rows = zoneBreakdown([], MAX_HR);
    expect(rows.every((r) => r.seconds === 0 && r.percent === 0)).toBe(true);
  });
});

describe('zoneShares', () => {
  // Статистика передаёт сюда суммы за период, итоги получают сюда же через zoneBreakdown.
  // Проценты обязаны считаться одинаково, иначе одна тренировка показывает разное на двух
  // экранах. Раньше статистика делила и на время ниже зоны 1.
  it('divides by time inside zones only, ignoring time below zone 1', () => {
    // 600 с ниже зоны 1, 300 с в зоне 2, 300 с в зоне 4.
    const rows = zoneShares([600, 0, 300, 0, 300, 0]);
    expect(rows.find((r) => r.zone.index === 2)!.percent).toBe(50);
    expect(rows.find((r) => r.zone.index === 4)!.percent).toBe(50);
  });

  it('shows all zeros when every second was below zone 1', () => {
    const rows = zoneShares([900, 0, 0, 0, 0, 0]);
    expect(rows.every((r) => r.percent === 0)).toBe(true);
  });

  it('matches zoneBreakdown for the same workout', () => {
    const samples = [...samplesAt(80, 10), ...samplesAt(140, 10, T0 + 10_000)];
    expect(zoneShares(zoneSecondsFromSamples(samples, MAX_HR))).toEqual(zoneBreakdown(samples, MAX_HR));
  });
});
