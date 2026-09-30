import type { IntervalSettings, PauseInterval } from '../types';
import { pluralRu } from './format';

// Интервальный таймер (кроссфит) и таймер отдыха (зал). Чистый модуль без React Native,
// чтобы гонять в Jest.
//
// Часы таймера это активное время тренировки, то есть без пауз. Поэтому пауза тренировки
// сама ставит таймер на паузу, а фаза в любой момент вычисляется из одного числа, без
// собственного состояния, которое могло бы разойтись с тренировкой или потеряться при
// выгрузке приложения.

/** Пресет интервального таймера. */
export type IntervalPreset = IntervalSettings['preset'];

/**
 * Настройка интервалов (тип хранения лежит в `types.ts`). Все пресеты сводятся к одной
 * форме:
 * - Tabata: 20 с работы, 10 с отдыха, 8 раундов;
 * - EMOM: каждую минуту новый раунд, отдыха нет (отдых это остаток минуты после работы);
 * - AMRAP: один длинный раунд работы на время;
 * - свои: работа, отдых, раунды.
 */
export type IntervalConfig = IntervalSettings;

/** Готовые пресеты. `minutes` задаёт длину EMOM и AMRAP. */
export function presetConfig(preset: Exclude<IntervalPreset, 'custom'>, minutes = 10): IntervalConfig {
  switch (preset) {
    case 'tabata':
      return { preset, workSec: 20, restSec: 10, rounds: 8 };
    case 'emom':
      return { preset, workSec: 60, restSec: 0, rounds: minutes };
    case 'amrap':
      return { preset, workSec: minutes * 60, restSec: 0, rounds: 1 };
  }
}

/** Названия пресетов для экрана. */
export const PRESET_TITLES: Record<IntervalPreset, string> = {
  tabata: 'Tabata',
  emom: 'EMOM',
  amrap: 'AMRAP',
  custom: 'Свои',
};

/** Правдоподобная ли настройка: без нулевых раундов и суточных интервалов. */
export function isValidConfig(c: IntervalConfig): boolean {
  return (
    Number.isInteger(c.workSec) &&
    Number.isInteger(c.restSec) &&
    Number.isInteger(c.rounds) &&
    c.workSec >= 5 &&
    c.workSec <= 3600 &&
    c.restSec >= 0 &&
    c.restSec <= 3600 &&
    c.rounds >= 1 &&
    c.rounds <= 100
  );
}

/** Настройка из черновика, базы или файла, или `null`, если она битая. */
export function decodeIntervalConfig(raw: unknown): IntervalConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (c.preset !== 'tabata' && c.preset !== 'emom' && c.preset !== 'amrap' && c.preset !== 'custom') return null;
  const config = { preset: c.preset, workSec: c.workSec, restSec: c.restSec, rounds: c.rounds } as IntervalConfig;
  return isValidConfig(config) ? config : null;
}

/** Общая длина интервалов. Отдыха после последнего раунда нет: там уже финиш. */
export function totalIntervalMs(c: IntervalConfig): number {
  return (c.rounds * (c.workSec + c.restSec) - c.restSec) * 1000;
}

/** Фаза таймера в момент активного времени. */
export interface Phase {
  kind: 'work' | 'rest' | 'done';
  /** Номер раунда с единицы; у `done` последний раунд. */
  round: number;
  /** Сколько осталось до конца фазы. У `done` ноль. */
  remainingMs: number;
  /**
   * Порядковый номер фазы: растёт на каждой смене. По нему коуч понимает, что фаза
   * сменилась, даже если между двумя проверками прошло несколько фаз.
   */
  index: number;
}

/** Фаза в момент `activeMs` от старта тренировки. */
export function phaseAt(c: IntervalConfig, activeMs: number): Phase {
  const period = (c.workSec + c.restSec) * 1000;
  const t = Math.max(0, activeMs);
  if (t >= totalIntervalMs(c)) return { kind: 'done', round: c.rounds, remainingMs: 0, index: c.rounds * 2 };
  const round = Math.floor(t / period);
  const inRound = t - round * period;
  const work = c.workSec * 1000;
  if (inRound < work) return { kind: 'work', round: round + 1, remainingMs: work - inRound, index: round * 2 };
  return { kind: 'rest', round: round + 1, remainingMs: period - inRound, index: round * 2 + 1 };
}

/** Что сказать при входе в фазу. */
export function phaseAnnouncement(c: IntervalConfig, phase: Phase): string {
  if (phase.kind === 'done') return 'Интервалы завершены.';
  if (phase.kind === 'rest') return 'Отдых.';
  if (c.preset === 'emom') return `Минута ${phase.round}.`;
  if (c.rounds === 1) return 'Работа.';
  return phase.round === c.rounds ? `Последний раунд. Работа.` : `Раунд ${phase.round}. Работа.`;
}

/** Короткое описание настройки: «20 с / 10 с × 8». */
export function describeConfig(c: IntervalConfig): string {
  if (c.preset === 'emom') return `каждую минуту, ${pluralRu(c.rounds, 'минута', 'минуты', 'минут')}`;
  if (c.preset === 'amrap') return `${pluralRu(Math.round(c.workSec / 60), 'минута', 'минуты', 'минут')} на время`;
  return `${c.workSec} с / ${c.restSec} с × ${c.rounds}`;
}

/**
 * Момент настенного времени, когда активное время тренировки достигло `activeMs`.
 * Обратная к подсчёту активного времени: паузы до этого момента сдвигают его вперёд.
 */
export function wallAtActive(activeMs: number, startedAt: number, pauses: PauseInterval[]): number {
  let wall = startedAt + activeMs;
  for (const p of pauses) {
    if (p.start < wall) wall += p.end - p.start;
    else break;
  }
  return wall;
}

/**
 * Отрезки работы в настенном времени, чтобы подсветить их на графике пульса. Обрезаются
 * по концу тренировки: если её закончили раньше, чем кончились интервалы.
 */
export function workBands(
  c: IntervalConfig,
  startedAt: number,
  pauses: PauseInterval[],
  endedAt: number,
): { from: number; to: number }[] {
  const bands: { from: number; to: number }[] = [];
  const period = (c.workSec + c.restSec) * 1000;
  for (let r = 0; r < c.rounds; r++) {
    const from = wallAtActive(r * period, startedAt, pauses);
    if (from >= endedAt) break;
    const to = Math.min(wallAtActive(r * period + c.workSec * 1000, startedAt, pauses), endedAt);
    bands.push({ from, to });
  }
  return bands;
}

// ---------------------------------------------------------------------------
// Таймер отдыха в зале
// ---------------------------------------------------------------------------

/** Длительности отдыха на кнопках. */
export const REST_OPTIONS_SEC = [60, 90, 120] as const;

/** Идущий отдых: когда начат (по активному времени) и сколько длится. */
export interface RestTimer {
  startActiveMs: number;
  durationSec: number;
}

/** Сколько отдыха осталось, мс. Ноль или меньше значит «отдых окончен». */
export function restRemainingMs(rest: RestTimer, activeMs: number): number {
  return rest.startActiveMs + rest.durationSec * 1000 - activeMs;
}
