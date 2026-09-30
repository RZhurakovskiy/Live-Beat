import { HrSample } from '../types';
import { getHrZone, HrZone, ZONES } from './heartRateZones';

/**
 * Разрыв между показаниями длиннее этого значит, что ремень пропадал, а не что
 * сердце пять минут держалось в одной зоне. Такое время не относится ни к одной зоне.
 */
export const MAX_SAMPLE_GAP_SEC = 300;

/**
 * Секунды в каждой зоне. Индекс 0 это «ниже зоны 1», индексы 1..5 это зоны, так что
 * массив можно индексировать прямо номером зоны. Без максимального пульса все нули.
 */
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

/** Строка разбивки по зонам: зона, секунды в ней и её доля. */
export interface ZoneShare {
  zone: HrZone;
  seconds: number;
  // Доля от времени внутри зон. Время ниже зоны 1 не считается, иначе разминка
  // съедала бы проценты настоящей работы.
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

/** Строки карточки «Зоны пульса» одной тренировки, самая тяжёлая зона первой, как на макетах итогов. */
export function zoneBreakdown(samples: HrSample[], maxHr: number | null): ZoneShare[] {
  return zoneShares(zoneSecondsFromSamples(samples, maxHr));
}
