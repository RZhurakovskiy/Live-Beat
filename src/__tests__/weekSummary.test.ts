import { WorkoutSessionSummary } from '../types';
import { weekSummary } from '../utils/weekSummary';

// Среда 30 сентября 2026; неделя началась в понедельник 28-го.
const NOW = new Date(2026, 8, 30, 12, 0).getTime();
const MONDAY = new Date(2026, 8, 28, 0, 0).getTime();

function s(extra: Partial<WorkoutSessionSummary>): WorkoutSessionSummary {
  return { id: 'x', mode: 'outdoor', startedAt: NOW, durationSec: 1800, avgHr: 140, ...extra };
}

describe('weekSummary', () => {
  it('counts only this week, from Monday', () => {
    const week = weekSummary([s({ startedAt: MONDAY + 1000 }), s({ startedAt: MONDAY - 1000 })], NOW);
    expect(week.workouts).toBe(1);
    expect(week.totalSeconds).toBe(1800);
  });

  it('sums running distance and leaves rides out', () => {
    const week = weekSummary(
      [s({ distanceMeters: 5000 }), s({ mode: 'cycling', distanceMeters: 20_000 }), s({ mode: 'gym' })],
      NOW,
    );
    expect(week.distanceMeters).toBe(5000);
    expect(week.workouts).toBe(3);
  });

  it('is all zeros for an empty week', () => {
    expect(weekSummary([], NOW)).toEqual({ workouts: 0, distanceMeters: 0, totalSeconds: 0 });
  });
});
