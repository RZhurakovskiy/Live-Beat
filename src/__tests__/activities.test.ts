import { WORKOUT_MODES } from '../types';
import { ACTIVITIES, activityOf, isRunDistance } from '../workout/activities';

describe('activities', () => {
  it('describes every workout mode exactly once', () => {
    expect(ACTIVITIES.map((a) => a.mode).sort()).toEqual([...WORKOUT_MODES].sort());
  });

  it('keeps the original storage keys for outdoor and treadmill', () => {
    // На телефонах уже лежат тренировки с этими ключами: переименование их потеряло бы.
    expect(activityOf('outdoor').hasGps).toBe(true);
    expect(activityOf('treadmill').hasGps).toBe(false);
  });

  it('gives GPS only to kinds that record a route', () => {
    const withGps = ACTIVITIES.filter((a) => a.hasGps).map((a) => a.mode);
    expect(withGps.sort()).toEqual(['cycling', 'outdoor']);
  });

  it('shows speed for cycling and pace for running', () => {
    expect(activityOf('cycling').speed).toBe('speed');
    expect(activityOf('cycling').splitMeters).toBe(5000);
    expect(activityOf('outdoor').speed).toBe('pace');
    expect(activityOf('gym').speed).toBeNull();
  });

  it('offers timers only in the gym and crossfit', () => {
    expect(activityOf('gym').timer).toBe('rest');
    expect(activityOf('crossfit').timer).toBe('interval');
    expect(ACTIVITIES.filter((a) => a.timer).length).toBe(2);
  });

  it('counts only running as running distance', () => {
    expect(isRunDistance('outdoor')).toBe(true);
    expect(isRunDistance('cycling')).toBe(false);
    expect(isRunDistance('treadmill')).toBe(false);
  });
});

describe('tile titles', () => {
  it('keeps every tile title short enough for a quarter-width tile', () => {
    for (const a of ACTIVITIES) expect(a.tileTitle.length).toBeLessThanOrEqual(8);
  });
});
