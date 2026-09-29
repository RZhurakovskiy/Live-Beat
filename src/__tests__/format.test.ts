import { formatRelativeDate, formatTotalTime, startOfWeekMs } from '../utils/format';

// Local time is what the user sees, so the fixtures are built with the local
// Date constructor rather than UTC strings.
function at(year: number, month: number, day: number, hour = 12, minute = 0): number {
  return new Date(year, month, day, hour, minute, 0, 0).getTime();
}

describe('startOfWeekMs', () => {
  it('returns Monday 00:00 of the same week', () => {
    // 2026-09-30 is a Wednesday.
    const start = new Date(startOfWeekMs(at(2026, 8, 30, 15, 42)));
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(28);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it('treats Sunday as the end of the week, not the start', () => {
    // 2026-10-04 is a Sunday: its week still starts on Monday the 28th.
    const start = new Date(startOfWeekMs(at(2026, 9, 4, 23, 59)));
    expect(start.getDate()).toBe(28);
    expect(start.getMonth()).toBe(8);
  });

  it('is idempotent on a Monday at midnight', () => {
    const monday = at(2026, 8, 28, 0, 0);
    expect(startOfWeekMs(monday)).toBe(monday);
  });
});

describe('formatRelativeDate', () => {
  const now = at(2026, 8, 30, 12, 0);

  it('says «Сегодня» for any time of the same day', () => {
    expect(formatRelativeDate(at(2026, 8, 30, 6, 15), now)).toBe('Сегодня');
    expect(formatRelativeDate(at(2026, 8, 30, 23, 50), now)).toBe('Сегодня');
  });

  it('says «Вчера» for the previous day', () => {
    expect(formatRelativeDate(at(2026, 8, 29, 22, 0), now)).toBe('Вчера');
  });

  it('falls back to the date further back', () => {
    expect(formatRelativeDate(at(2026, 8, 22, 19, 40), now)).toBe('22 сентября');
  });

  it('crosses a month boundary without calling it yesterday', () => {
    const firstOfOctober = at(2026, 9, 1, 9, 0);
    expect(formatRelativeDate(at(2026, 8, 30, 9, 0), firstOfOctober)).toBe('Вчера');
    expect(formatRelativeDate(at(2026, 8, 29, 9, 0), firstOfOctober)).toBe('29 сентября');
  });
});

describe('formatTotalTime', () => {
  it('drops the hours when there are none', () => {
    expect(formatTotalTime(48 * 60)).toBe('48 мин');
  });

  it('reads as hours and minutes', () => {
    expect(formatTotalTime(2 * 3600 + 48 * 60)).toBe('2 ч 48 мин');
  });

  it('handles zero', () => {
    expect(formatTotalTime(0)).toBe('0 мин');
  });
});
