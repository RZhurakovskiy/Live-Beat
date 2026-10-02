import { UserProfile, WorkoutSession } from '../types';
import { isRunDistance } from '../workout/activities';
import { profileMaxHr } from './heartRateZones';
import { zoneSecondsFromSamples } from './zoneTime';

/** Итоги за период для экрана статистики. */
export interface PeriodStats {
  sessionCount: number;
  totalDurationSec: number;
  /** Километры бега и ходьбы на улице. */
  totalDistanceMeters: number;
  /** Километры на велосипеде, отдельно: в одной сумме они заглушили бы беговые. */
  rideDistanceMeters: number;
  totalCalories: number;
  avgHr: number;
  zoneSeconds: number[]; // индекс 0: вне зон, индексы 1..5: зоны
}

/**
 * Складывает тренировки за период: время, дистанция, калории, средний пульс
 * (взвешенный по длительности, чтобы короткая тренировка не весила как длинная) и
 * время в зонах. Без профиля зоны не считаются: не от чего взять максимальный пульс.
 */
export function aggregateSessions(sessions: WorkoutSession[], profile: UserProfile | null): PeriodStats {
  const zoneSeconds = [0, 0, 0, 0, 0, 0];
  let totalDurationSec = 0;
  let totalDistanceMeters = 0;
  let rideDistanceMeters = 0;
  let totalCalories = 0;
  let hrWeightedSum = 0;

  const maxHr = profile ? profileMaxHr(profile) : null;

  for (const session of sessions) {
    totalDurationSec += session.durationSec;
    if (isRunDistance(session.mode)) totalDistanceMeters += session.distanceMeters ?? 0;
    else if (session.mode === 'cycling') rideDistanceMeters += session.distanceMeters ?? 0;
    totalCalories += session.caloriesKcal ?? 0;
    hrWeightedSum += session.avgHr * session.durationSec;

    const sessionZones = zoneSecondsFromSamples(session.hrSamples, maxHr);
    for (let i = 0; i < zoneSeconds.length; i++) zoneSeconds[i] += sessionZones[i];
  }

  return {
    sessionCount: sessions.length,
    totalDurationSec,
    totalDistanceMeters,
    rideDistanceMeters,
    totalCalories: Math.round(totalCalories),
    avgHr: totalDurationSec > 0 ? Math.round(hrWeightedSum / totalDurationSec) : 0,
    zoneSeconds,
  };
}
