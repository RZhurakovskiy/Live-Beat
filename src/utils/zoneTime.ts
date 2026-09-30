import { HrSample } from '../types';
import { getHrZone, HrZone, ZONES } from './heartRateZones';

// A gap longer than this means the strap dropped out rather than that the heart
// stayed in one zone for five minutes — that time belongs to no zone at all.
export const MAX_SAMPLE_GAP_SEC = 300;

// Seconds spent in each zone. Index 0 is "below zone 1", 1..5 are the zones, so
// the array can be indexed by zone number directly.
export function zoneSecondsFromSamples(samples: HrSample[], maxHr: number | null): number[] {
  const seconds = [0, 0, 0, 0, 0, 0];
  if (!maxHr) return seconds;

  for (let i = 1; i < samples.length; i++) {
    const dtSec = (samples[i].t - samples[i - 1].t) / 1000;
    if (dtSec <= 0 || dtSec > MAX_SAMPLE_GAP_SEC) continue;
    const { zone } = getHrZone(samples[i].bpm, maxHr);
    seconds[zone?.index ?? 0] += dtSec;
  }
  return seconds;
}

export interface ZoneShare {
  zone: HrZone;
  seconds: number;
  // Share of the time spent inside zones — time below zone 1 is not counted,
  // otherwise a warm-up would eat the percentages of the real work.
  percent: number;
}

/**
 * Доли зон из готового массива секунд (индекс 0 это «ниже зоны 1», 1..5 это зоны).
 * Порядок: сначала самая тяжёлая зона, как на макетах.
 *
 * Единственное место, где считается процент зоны. Им пользуются и итоги одной тренировки,
 * и статистика за период: раньше статистика делила на всё время вместе с разминкой ниже
 * зоны 1, а итоги только на время внутри зон, и одна и та же тренировка показывала разные
 * проценты на двух экранах.
 */
export function zoneShares(seconds: number[]): ZoneShare[] {
  const inZones = seconds.slice(1).reduce((sum, value) => sum + value, 0);

  return [...ZONES].reverse().map((zone) => ({
    zone,
    seconds: Math.round(seconds[zone.index]),
    percent: inZones > 0 ? Math.round((seconds[zone.index] / inZones) * 100) : 0,
  }));
}

// Rows for the "Зоны пульса" card of a single workout, hardest zone first,
// the way the summary mockups draw it.
export function zoneBreakdown(samples: HrSample[], maxHr: number | null): ZoneShare[] {
  return zoneShares(zoneSecondsFromSamples(samples, maxHr));
}
