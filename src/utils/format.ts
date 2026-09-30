/** Длительность как «мм:сс», а от часа как «ч:мм:сс»: для таймера и карточек. */
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** Темп «м:сс» на километр. Без темпа отдаёт длинный прочерк, заглушку карточки. */
export function formatPace(secPerKm: number | undefined): string {
  if (!secPerKm || !Number.isFinite(secPerKm)) return '—';
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.round(secPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Дистанция в километрах с двумя знаками. Без дистанции тоже прочерк-заглушка. */
export function formatDistanceKm(meters: number | undefined): string {
  if (!meters) return '—';
  return (meters / 1000).toFixed(2);
}

/** Дата вида «22 сентября». */
export function formatSessionDate(timestampMs: number): string {
  const date = new Date(timestampMs);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/** Дата с годом и время: для экрана одной тренировки. */
export function formatSessionDateTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  const datePart = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const timePart = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${datePart}, ${timePart}`;
}

/**
 * Понедельник 00:00 той недели, в которую попадает момент. Неделя здесь
 * начинается с понедельника, а не с воскресенья: «Эта неделя» должна значить то,
 * что она значит у нас.
 */
export function startOfWeekMs(nowMs: number): number {
  const date = new Date(nowMs);
  date.setHours(0, 0, 0, 0);
  const weekday = (date.getDay() + 6) % 7; // понедельник = 0
  date.setDate(date.getDate() - weekday);
  return date.getTime();
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/**
 * «Сегодня», «Вчера» или «22 сентября»: строку истории читают по тому, когда это
 * было, а не по календарной дате.
 */
export function formatRelativeDate(timestampMs: number, nowMs: number): string {
  const date = new Date(timestampMs);
  const now = new Date(nowMs);
  if (isSameDay(date, now)) return 'Сегодня';

  const yesterday = new Date(nowMs);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Вчера';

  return formatSessionDate(timestampMs);
}

/** «2 ч 48 мин» для итогов за период, где «мм:сс» читалось бы плохо. */
export function formatTotalTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes} мин`;
  return `${hours} ч ${minutes} мин`;
}

/** Время суток вида «08:15». */
export function formatTimeOfDay(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Русское число с существительным: «1 тренировка», «3 тренировки», «5 тренировок».
 * Формы передаются для 1, 2 и 5; 11–14 берут форму для 5.
 */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  let word = many;
  if (abs < 11 || abs > 14) {
    if (last === 1) word = one;
    else if (last >= 2 && last <= 4) word = few;
  }
  return `${n} ${word}`;
}
