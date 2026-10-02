import type { UserProfile } from '../types';
import {
  estimateMaxHr,
  getHrZone,
  isValidMaxHr,
  MAX_MAX_HR,
  MIN_MAX_HR,
  profileMaxHr,
} from '../utils/heartRateZones';

const MAN: UserProfile = { weightKg: 80, age: 40, gender: 'male' };

describe('estimateMaxHr', () => {
  it('uses 220 minus age for men', () => {
    expect(estimateMaxHr(40, 'male')).toBe(180);
  });

  it('uses the Gulati formula for women', () => {
    // 206 - 0.88 * 40 = 170.8
    expect(estimateMaxHr(40, 'female')).toBe(171);
  });
});

describe('isValidMaxHr', () => {
  it('accepts whole numbers inside the bounds, edges included', () => {
    expect(isValidMaxHr(MIN_MAX_HR)).toBe(true);
    expect(isValidMaxHr(190)).toBe(true);
    expect(isValidMaxHr(MAX_MAX_HR)).toBe(true);
  });

  it('rejects typos, fractions and things that are not numbers', () => {
    expect(isValidMaxHr(19)).toBe(false);
    expect(isValidMaxHr(MIN_MAX_HR - 1)).toBe(false);
    expect(isValidMaxHr(MAX_MAX_HR + 1)).toBe(false);
    expect(isValidMaxHr(180.5)).toBe(false);
    expect(isValidMaxHr(NaN)).toBe(false);
    expect(isValidMaxHr('190')).toBe(false);
    expect(isValidMaxHr(null)).toBe(false);
    expect(isValidMaxHr(undefined)).toBe(false);
  });
});

describe('profileMaxHr', () => {
  it('falls back to the formula when the user gave no maximum', () => {
    expect(profileMaxHr(MAN)).toBe(180);
    expect(profileMaxHr({ ...MAN, gender: 'female' })).toBe(171);
  });

  it('uses the maximum the user entered', () => {
    expect(profileMaxHr({ ...MAN, maxHrBpm: 192 })).toBe(192);
  });

  it('ignores an implausible entered maximum instead of building zones on it', () => {
    expect(profileMaxHr({ ...MAN, maxHrBpm: 19 })).toBe(180);
    expect(profileMaxHr({ ...MAN, maxHrBpm: 400 })).toBe(180);
  });
});

describe('zones follow the chosen maximum', () => {
  it('moves a pulse to another zone when the own maximum differs from the formula', () => {
    // 150 уд/мин: от формульных 180 это 83% (зона 4), от своих 200 это 75% (зона 3).
    expect(getHrZone(150, profileMaxHr(MAN)).zone?.index).toBe(4);
    expect(getHrZone(150, profileMaxHr({ ...MAN, maxHrBpm: 200 })).zone?.index).toBe(3);
  });
});
