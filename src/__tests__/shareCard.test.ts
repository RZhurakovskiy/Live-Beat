import { HrSample, RoutePoint, WorkoutSession } from '../types';
import { buildShareCard } from '../workout/shareCard';

const T0 = new Date(2026, 8, 30, 8, 15).getTime();
const MAX_HR = 190;

function samples(bpm: number, seconds: number): HrSample[] {
  return Array.from({ length: seconds + 1 }, (_, i) => ({ t: T0 + i * 1000, bpm }));
}

const ROUTE: RoutePoint[] = [
  { lat: 55.0, lng: 37.0, t: T0 },
  { lat: 55.01, lng: 37.0, t: T0 + 60_000 },
];

function session(extra: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'x',
    mode: 'outdoor',
    startedAt: T0,
    endedAt: T0 + 2_295_000,
    durationSec: 2295,
    avgHr: 146,
    maxHr: 178,
    minHr: 90,
    hrSamples: samples(140, 600),
    distanceMeters: 6420,
    avgPaceSecPerKm: 357,
    route: ROUTE,
    caloriesKcal: 485,
    ...extra,
  };
}

describe('buildShareCard, running with a route', () => {
  it('shows distance, time, pace and pulse with units in the labels', () => {
    const card = buildShareCard(session(), MAX_HR);
    expect(card.title).toBe('Уличная тренировка');
    expect(card.stats).toEqual([
      { label: 'дистанция, км', value: '6.42' },
      { label: 'время', value: '38:15' },
      { label: 'темп /км', value: '5:57' },
      { label: 'ср. пульс', value: '146' },
    ]);
    expect(card.visual).toBe('route');
  });
});

describe('buildShareCard, cycling', () => {
  it('shows speed instead of pace', () => {
    const card = buildShareCard(session({ mode: 'cycling', avgPaceSecPerKm: 150, distanceMeters: 40_000 }), MAX_HR);
    expect(card.title).toBe('Велосипед');
    expect(card.stats[2]).toEqual({ label: 'ср. км/ч', value: '24.0' });
  });
});

describe('buildShareCard, without GPS', () => {
  const gym = session({ mode: 'gym', route: undefined, distanceMeters: undefined, avgPaceSecPerKm: undefined });

  it('shows time, pulse and calories', () => {
    const card = buildShareCard(gym, MAX_HR);
    expect(card.stats.map((s) => s.label)).toEqual(['время', 'ср. пульс', 'макс. пульс', 'ккал']);
    expect(card.visual).toBe('pulse');
  });

  it('does not invent calories that were never counted', () => {
    const card = buildShareCard({ ...gym, caloriesKcal: undefined }, MAX_HR);
    expect(card.stats[3]).toEqual({ label: 'мин. пульс', value: '90' });
  });
});

describe('buildShareCard, visual', () => {
  it('falls back to the pulse line when an outdoor workout has no track', () => {
    expect(buildShareCard(session({ route: [] }), MAX_HR).visual).toBe('pulse');
  });

  it('draws nothing when there is neither a track nor a pulse', () => {
    expect(buildShareCard(session({ route: undefined, hrSamples: [] }), MAX_HR).visual).toBe('none');
  });

  it('ignores a distance of zero and shows the no-GPS tiles', () => {
    const card = buildShareCard(session({ distanceMeters: 0 }), MAX_HR);
    expect(card.stats[0].label).toBe('время');
  });
});

describe('buildShareCard, zones', () => {
  it('lists the five zones from easy to hard with percentages', () => {
    const zones = buildShareCard(session({ hrSamples: samples(140, 600) }), MAX_HR).zones!;
    expect(zones.map((z) => z.index)).toEqual([1, 2, 3, 4, 5]);
    expect(zones.find((z) => z.index === 3)!.percent).toBe(100);
  });

  it('has no zone bar without a profile', () => {
    expect(buildShareCard(session(), null).zones).toBeNull();
  });
});

describe('buildShareCard, text', () => {
  it('puts the date in words and uses no long dashes', () => {
    const card = buildShareCard(session(), MAX_HR);
    expect(card.dateText).toContain('2026');
    const text = JSON.stringify(card.stats) + card.title;
    expect(text).not.toContain('—');
  });
});
