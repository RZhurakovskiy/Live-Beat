import type { HrSample, PauseInterval, RoutePoint } from '../types';
import { haversineDistanceMeters } from './geo';

// Сплиты по километрам уличной тренировки: сколько занял каждый километр, какой был
// темп и средний пульс. Чистый модуль без React Native, чтобы гонять в Jest.
//
// Время сплита считается без ручных пауз: паузу ставят руками ровно затем, чтобы время
// исключить. Остановки без паузы (светофор) остаются внутри сплита, как и в общем темпе:
// автоматически их никто не вычитает (plans/archive/field-fixes.md, п. 1).

/** Последний неполный отрезок короче этого не показывается: это шум GPS в конце, а не отрезок. */
export const MIN_LAST_SPLIT_METERS = 50;

/** Один сплит. */
export interface Split {
  /** Номер отрезка с единицы. */
  index: number;
  /** Длина отрезка: полная у всех, кроме последнего неполного. */
  distanceMeters: number;
  /** Время отрезка без пауз, в секундах. */
  durationSec: number;
  /** Темп отрезка в секундах на километр. */
  paceSecPerKm: number;
  /** Средний пульс по показаниям внутри отрезка или `null`, если их нет. */
  avgBpm: number | null;
}

/** Всё, что нужно для сплитов, из сохранённой тренировки. */
export interface SplitInput {
  startedAt: number;
  endedAt: number;
  route: RoutePoint[];
  hrSamples: HrSample[];
  pauses?: PauseInterval[];
  /** Длина сплита: километр на бегу, пять на велосипеде. */
  splitMeters?: number;
}

/**
 * Активное время на момент `t`: сколько миллисекунд прошло от старта без пауз. Паузы
 * отсортированы и не пересекаются (так их пишет стор).
 */
export function activeMsAt(t: number, startedAt: number, pauses: PauseInterval[]): number {
  let paused = 0;
  for (const p of pauses) {
    if (p.start >= t) break;
    paused += Math.min(p.end, t) - p.start;
  }
  return Math.max(0, t - startedAt - paused);
}

function averageBpm(samples: HrSample[], from: number, to: number): number | null {
  let sum = 0;
  let count = 0;
  for (const s of samples) {
    if (s.t > from && s.t <= to) {
      sum += s.bpm;
      count++;
    }
  }
  return count > 0 ? Math.round(sum / count) : null;
}

/**
 * Сплиты тренировки. Границы километров находятся по накопленной дистанции маршрута,
 * момент пересечения интерполируется между соседними точками. Первый сплит начинается
 * со старта тренировки, последний (неполный) заканчивается её концом, так что сумма
 * времени сплитов равна длительности тренировки, и темпы сходятся с общим.
 */
export function computeSplits(input: SplitInput): Split[] {
  const { route, startedAt, endedAt, hrSamples } = input;
  const pauses = input.pauses ?? [];
  const step = input.splitMeters ?? 1000;
  if (route.length < 2) return [];

  // Моменты (настенное время), в которые пройден очередной километр.
  const crossings: number[] = [];
  let covered = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const segment = haversineDistanceMeters(a, b);
    if (segment <= 0) continue;
    while (covered + segment >= (crossings.length + 1) * step) {
      const need = (crossings.length + 1) * step - covered;
      crossings.push(a.t + ((b.t - a.t) * need) / segment);
    }
    covered += segment;
  }

  const splits: Split[] = [];
  let prevWall = startedAt;
  const push = (wallEnd: number, distanceMeters: number) => {
    const durationSec = (activeMsAt(wallEnd, startedAt, pauses) - activeMsAt(prevWall, startedAt, pauses)) / 1000;
    splits.push({
      index: splits.length + 1,
      distanceMeters,
      durationSec: Math.round(durationSec),
      paceSecPerKm: durationSec / (distanceMeters / 1000),
      avgBpm: averageBpm(hrSamples, prevWall, wallEnd),
    });
    prevWall = wallEnd;
  };

  for (const wall of crossings) push(wall, step);

  const rest = covered - crossings.length * step;
  if (rest >= MIN_LAST_SPLIT_METERS) push(Math.max(endedAt, prevWall), Math.round(rest));

  return splits;
}
