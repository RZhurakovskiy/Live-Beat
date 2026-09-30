import type { WorkoutSessionSummary } from '../types';
import { isRunDistance } from '../workout/activities';
import { startOfWeekMs } from './format';

// Сводка текущей недели: карточка «Эта неделя» в истории и виджет на рабочем столе
// считают её одной функцией, чтобы цифры не расходились. Чистый модуль без React Native.

/** Итоги недели с понедельника. */
export interface WeekSummary {
  workouts: number;
  /** Километры бега и ходьбы на улице, без велосипеда. */
  distanceMeters: number;
  totalSeconds: number;
}

/** Итоги недели, в которую попадает `now`. */
export function weekSummary(sessions: WorkoutSessionSummary[], now: number): WeekSummary {
  const from = startOfWeekMs(now);
  const thisWeek = sessions.filter((s) => s.startedAt >= from);
  return {
    workouts: thisWeek.length,
    // «Дистанция (улица)» это бег и ходьба: велосипедные километры в той же сумме
    // заглушили бы беговые.
    distanceMeters: thisWeek.reduce((sum, s) => sum + (isRunDistance(s.mode) ? (s.distanceMeters ?? 0) : 0), 0),
    totalSeconds: thisWeek.reduce((sum, s) => sum + s.durationSec, 0),
  };
}
