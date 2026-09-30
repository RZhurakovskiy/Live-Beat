import { HrSample } from '../types';
import { getHrZone } from '../utils/heartRateZones';
import { MAX_SAMPLE_GAP_SEC, zoneBreakdown, zoneSecondsFromSamples, zoneShares } from '../utils/zoneTime';

const MAX_HR = 190; // зона 1 от нуля до 113, зона 2 со 114, зона 3 со 133, зона 5 со 171
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

  it('puts a low pulse into zone 1, which is open from zero', () => {
    // 80 уд/мин это 42%. Раньше это было «ниже зоны 1», теперь зона 1, как у Strava.
    const seconds = zoneSecondsFromSamples(samplesAt(80, 5), MAX_HR);
    expect(seconds[1]).toBe(4);
    expect(seconds[0]).toBe(0);
  });

  it('keeps a zero pulse out of every zone', () => {
    // Нулевой пульс это сбой, а не отдых, и зоны 1 он не получает.
    expect(zoneSecondsFromSamples(samplesAt(0, 5), MAX_HR)[1]).toBe(0);
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

  it('counts a slow warmup as zone 1 in the percentages', () => {
    // Половина тренировки это ходьба на 80 уд/мин, половина работа в зоне 3. Разминка
    // теперь зона 1 и получает свою долю (п. 20 в plans/archive/field-fixes.md).
    const warmup = samplesAt(80, 10);
    const work = samplesAt(140, 10, T0 + 10_000);
    const rows = zoneBreakdown([...warmup, ...work], MAX_HR);
    const zone1 = rows.find((r) => r.zone.index === 1)!;
    const zone3 = rows.find((r) => r.zone.index === 3)!;
    expect(zone1.seconds).toBe(9);
    expect(zone3.seconds).toBe(10);
    expect(zone1.percent + zone3.percent).toBe(100);
  });

  it('shows a calm walk as 100% zone 1 instead of no data', () => {
    // Сама ловушка п. 20: весь пульс низкий, а карточка писала «мало данных».
    const rows = zoneBreakdown(samplesAt(85, 600), MAX_HR);
    expect(rows.some((r) => r.seconds > 0)).toBe(true);
    expect(rows.find((r) => r.zone.index === 1)!.percent).toBe(100);
  });

  it('reports zeros rather than NaN when there is no data', () => {
    const rows = zoneBreakdown([], MAX_HR);
    expect(rows.every((r) => r.seconds === 0 && r.percent === 0)).toBe(true);
  });
});

describe('zoneShares', () => {
  // Статистика передаёт сюда суммы за период, итоги получают сюда же через zoneBreakdown.
  // Проценты обязаны считаться одинаково, иначе одна тренировка показывает разное на двух
  // экранах.
  it('divides by time inside zones, ignoring time outside every zone', () => {
    // 600 с вне зон (сбойный нулевой пульс), 300 с в зоне 2, 300 с в зоне 4.
    const rows = zoneShares([600, 0, 300, 0, 300, 0]);
    expect(rows.find((r) => r.zone.index === 2)!.percent).toBe(50);
    expect(rows.find((r) => r.zone.index === 4)!.percent).toBe(50);
  });

  it('shows all zeros when every second was outside the zones', () => {
    const rows = zoneShares([900, 0, 0, 0, 0, 0]);
    expect(rows.every((r) => r.percent === 0)).toBe(true);
  });

  it('matches zoneBreakdown for the same workout', () => {
    // Смесь низкого пульса и работы, чтобы сверка шла и по зоне 1.
    const samples = [...samplesAt(80, 10), ...samplesAt(140, 10, T0 + 10_000)];
    expect(zoneShares(zoneSecondsFromSamples(samples, MAX_HR))).toEqual(zoneBreakdown(samples, MAX_HR));
  });
});

describe('getHrZone', () => {
  it('puts any live pulse into a zone, the lowest into zone 1', () => {
    expect(getHrZone(40, MAX_HR).zone?.index).toBe(1);
    expect(getHrZone(113, MAX_HR).zone?.index).toBe(1);
    expect(getHrZone(114, MAX_HR).zone?.index).toBe(2);
  });

  it('keeps a zero pulse outside the zones', () => {
    expect(getHrZone(0, MAX_HR).zone).toBeNull();
  });
});
