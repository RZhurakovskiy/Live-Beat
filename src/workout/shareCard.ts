import type { WorkoutSession } from '../types';
import { formatDistanceKm, formatDuration, formatPace, formatSessionDateTime, formatSpeed } from '../utils/format';
import { zoneBreakdown } from '../utils/zoneTime';
import { activityOf } from './activities';
import { formatKcal } from '../utils/calories';

// Что написано на карточке тренировки, которую отправляют картинкой в мессенджер. Чистый
// модуль без React Native, чтобы гонять в Jest: единицы, подписи и выбор рисунка проверяются
// тестами, а сама вёрстка карточки лежит в `components/ShareCard.tsx`.

/** Одна плитка карточки. */
export interface ShareStat {
  label: string;
  value: string;
}

/** Доля зоны для полосы внизу карточки. */
export interface ShareZone {
  index: number;
  color: string;
  percent: number;
}

/**
 * - `route`: маршрут линией (вид с GPS и записанным треком);
 * - `pulse`: линия пульса (всё остальное, где есть показания);
 * - `none`: рисовать нечего.
 */
export type ShareVisual = 'route' | 'pulse' | 'none';

/** Содержимое карточки. */
export interface ShareCardData {
  title: string;
  dateText: string;
  stats: ShareStat[];
  visual: ShareVisual;
  /** Полоса зон или `null` без профиля и без пульса в зонах. */
  zones: ShareZone[] | null;
}

/**
 * Содержимое карточки по тренировке. Плитки зависят от вида: с дистанцией это дистанция, время
 * и темп (на велосипеде скорость), без неё время, пульс и калории. Калории показываются, только
 * если они посчитаны: выдумывать их нельзя.
 */
export function buildShareCard(session: WorkoutSession, maxHr: number | null): ShareCardData {
  const activity = activityOf(session.mode);
  const hasRoute = activity.hasGps && (session.route?.length ?? 0) >= 2;
  const hasDistance = activity.hasGps && (session.distanceMeters ?? 0) > 0;
  const time = formatDuration(session.durationSec);

  let stats: ShareStat[];
  if (hasDistance) {
    stats = [
      { label: 'дистанция, км', value: formatDistanceKm(session.distanceMeters) },
      { label: 'время', value: time },
      activity.speed === 'speed'
        ? { label: 'ср. км/ч', value: formatSpeed(session.avgPaceSecPerKm) }
        : { label: 'темп /км', value: formatPace(session.avgPaceSecPerKm) },
      { label: 'ср. пульс', value: String(session.avgHr) },
    ];
  } else {
    stats = [
      { label: 'время', value: time },
      { label: 'ср. пульс', value: String(session.avgHr) },
      { label: 'макс. пульс', value: String(session.maxHr) },
      session.caloriesKcal !== undefined
        ? { label: 'ккал', value: formatKcal(session.caloriesKcal) }
        : { label: 'мин. пульс', value: String(session.minHr) },
    ];
  }

  const shares = zoneBreakdown(session.hrSamples, maxHr);
  const hasZones = shares.some((s) => s.seconds > 0);
  // Зоны идут от лёгкой к тяжёлой слева направо, как на шкале активной тренировки.
  const zones = hasZones
    ? [...shares].reverse().map((s) => ({ index: s.zone.index, color: s.zone.color, percent: s.percent }))
    : null;

  return {
    title: activity.sessionTitle,
    dateText: formatSessionDateTime(session.startedAt),
    stats,
    visual: hasRoute ? 'route' : session.hrSamples.length >= 2 ? 'pulse' : 'none',
    zones,
  };
}
