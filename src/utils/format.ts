export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function formatPace(secPerKm: number | undefined): string {
  if (!secPerKm || !Number.isFinite(secPerKm)) return '—';
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.round(secPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatDistanceKm(meters: number | undefined): string {
  if (!meters) return '—';
  return (meters / 1000).toFixed(2);
}

export function formatSessionDate(timestampMs: number): string {
  const date = new Date(timestampMs);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function formatSessionDateTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  const datePart = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const timePart = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${datePart}, ${timePart}`;
}

// Monday 00:00 of the week the moment belongs to. Weeks start on Monday here,
// not Sunday — «Эта неделя» has to mean what it means locally.
export function startOfWeekMs(nowMs: number): number {
  const date = new Date(nowMs);
  date.setHours(0, 0, 0, 0);
  const weekday = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - weekday);
  return date.getTime();
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

// «Сегодня» / «Вчера» / «22 сентября» — a history row is read by when it was,
// not by its calendar date.
export function formatRelativeDate(timestampMs: number, nowMs: number): string {
  const date = new Date(timestampMs);
  const now = new Date(nowMs);
  if (isSameDay(date, now)) return 'Сегодня';

  const yesterday = new Date(nowMs);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Вчера';

  return formatSessionDate(timestampMs);
}

// «2 ч 48 мин» for totals, where mm:ss would be unreadable.
export function formatTotalTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes} мин`;
  return `${hours} ч ${minutes} мин`;
}

export function formatTimeOfDay(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

