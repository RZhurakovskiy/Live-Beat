import type { HrSample } from '../types';

// Спад пульса к концу спокойной практики (йога): средний пульс первых минут против
// последних (шавасана). Честный признак расслабления без ВСР, которую H64 посчитать не
// даёт (plans/archive/field-issues-h64.md). Чистый модуль без React Native.

/** Длина окна в начале и в конце практики. */
export const CALM_WINDOW_MS = 3 * 60_000;
/**
 * Практика короче этого не сравнивается: окна начала и конца перекрылись бы, и «спад»
 * был бы сравнением пульса с самим собой.
 */
export const MIN_CALM_SESSION_MS = 8 * 60_000;

/** Пульс в начале и в конце практики. `delta` отрицательная, если пульс опустился. */
export interface CalmDown {
  startBpm: number;
  endBpm: number;
  delta: number;
}

function average(samples: HrSample[]): number | null {
  if (samples.length === 0) return null;
  return Math.round(samples.reduce((sum, s) => sum + s.bpm, 0) / samples.length);
}

/**
 * Спад пульса или `null`, если практика короткая или в одном из окон нет показаний.
 * Окна берутся по первому и последнему показанию, а не по старту и финишу: пока ремень
 * не поймал пульс или человек уже снимал его, данных там нет.
 */
export function calmDown(samples: HrSample[]): CalmDown | null {
  if (samples.length < 2) return null;
  const first = samples[0].t;
  const last = samples[samples.length - 1].t;
  if (last - first < MIN_CALM_SESSION_MS) return null;

  const startBpm = average(samples.filter((s) => s.t < first + CALM_WINDOW_MS));
  const endBpm = average(samples.filter((s) => s.t > last - CALM_WINDOW_MS));
  if (startBpm === null || endBpm === null) return null;
  return { startBpm, endBpm, delta: endBpm - startBpm };
}
