import { UserProfile, WorkoutSession } from '../types';
import { estimateMaxHr } from './heartRateZones';
import { zoneSecondsFromSamples } from './zoneTime';

export interface PeriodStats {
  sessionCount: number;
  totalDurationSec: number;
  totalDistanceMeters: number;
  totalCalories: number;
  avgHr: number;
  zoneSeconds: number[]; // index 0 = below zone 1, index 1..5 = zones
}

export function aggregateSessions(sessions: WorkoutSession[], profile: UserProfile | null): PeriodStats {
  const zoneSeconds = [0, 0, 0, 0, 0, 0];
  let totalDurationSec = 0;
  let totalDistanceMeters = 0;
  let totalCalories = 0;
  let hrWeightedSum = 0;

  const maxHr = profile ? estimateMaxHr(profile.age, profile.gender) : null;

  for (const session of sessions) {
    totalDurationSec += session.durationSec;
    totalDistanceMeters += session.distanceMeters ?? 0;
    totalCalories += session.caloriesKcal ?? 0;
    hrWeightedSum += session.avgHr * session.durationSec;

    const sessionZones = zoneSecondsFromSamples(session.hrSamples, maxHr);
    for (let i = 0; i < zoneSeconds.length; i++) zoneSeconds[i] += sessionZones[i];
  }

  return {
    sessionCount: sessions.length,
    totalDurationSec,
    totalDistanceMeters,
    totalCalories: Math.round(totalCalories),
    avgHr: totalDurationSec > 0 ? Math.round(hrWeightedSum / totalDurationSec) : 0,
    zoneSeconds,
  };
}
