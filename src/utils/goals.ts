import type { WorkoutSession } from '../types';
import { zoneSecondsFromSamples } from './zoneTime';

// Цели на неделю: сколько тренировок, сколько километров, сколько минут в зоне 2. Цели
// задаются в настройках, прогресс виден в карточке «Эта неделя». Чистый модуль без
// React Native, чтобы гонять в Jest.

/** Ключ флага, под которым цели лежат в базе. */
export const GOALS_FLAG = 'weekly_goals';

/** Цели на неделю. `null`: цель не задана. */
export interface WeeklyGoals {
  workouts: number | null;
  km: number | null;
  /**
   * Минут в зоне 2 «Жиросжигание». Именно зона 2, а не «2 и выше»: это цель про
   * спокойную базовую работу, и тяжёлые интервалы её подменять не должны.
   */
  zone2Minutes: number | null;
}

/** Цели по умолчанию: ни одной. */
export const NO_GOALS: WeeklyGoals = { workouts: null, km: null, zone2Minutes: null };

/** Прогресс одной цели для карточки. */
export interface GoalProgress {
  key: keyof WeeklyGoals;
  label: string;
  target: number;
  actual: number;
  /** Доля от 0 до 1, для полосы. */
  fraction: number;
  done: boolean;
}

/** Правдоподобное значение цели или `null`: ноль, минус и мусор значат «цели нет». */
function goalValue(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? value : null;
}

/** Цели из строки флага. Битая или пустая строка даёт «целей нет». */
export function decodeGoals(json: string | null): WeeklyGoals {
  if (!json) return NO_GOALS;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return NO_GOALS;
    return {
      workouts: goalValue(raw.workouts, 50),
      km: goalValue(raw.km, 1000),
      zone2Minutes: goalValue(raw.zone2Minutes, 5000),
    };
  } catch {
    return NO_GOALS;
  }
}

/** Цели в строку для флага. */
export function encodeGoals(goals: WeeklyGoals): string {
  return JSON.stringify(goals);
}

/** Задана ли хоть одна цель. */
export function hasGoals(goals: WeeklyGoals): boolean {
  return goals.workouts !== null || goals.km !== null || goals.zone2Minutes !== null;
}

/**
 * Прогресс по заданным целям за неделю. `sessions`: тренировки этой недели целиком
 * (минутам в зоне нужен пульс). Без профиля (`maxHr` null) зоны не считаются, и цель по
 * зоне пропускается, а не показывает вечный ноль.
 */
export function goalProgress(goals: WeeklyGoals, sessions: WorkoutSession[], maxHr: number | null): GoalProgress[] {
  const rows: GoalProgress[] = [];
  const add = (key: keyof WeeklyGoals, label: string, target: number, actual: number) => {
    rows.push({ key, label, target, actual, fraction: Math.min(1, actual / target), done: actual >= target });
  };

  if (goals.workouts !== null) add('workouts', 'Тренировки', goals.workouts, sessions.length);
  if (goals.km !== null) {
    const meters = sessions.reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0);
    add('km', 'Километры', goals.km, Math.round(meters / 100) / 10);
  }
  if (goals.zone2Minutes !== null && maxHr) {
    const seconds = sessions.reduce((sum, s) => sum + zoneSecondsFromSamples(s.hrSamples, maxHr)[2], 0);
    add('zone2Minutes', 'Минут в зоне 2', goals.zone2Minutes, Math.floor(seconds / 60));
  }
  return rows;
}
