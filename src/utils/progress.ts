import { WorkoutSessionSummary } from '../types';
import { isRunDistance } from '../workout/activities';
import { startOfWeekMs } from './format';

// Блоки прогресса на экране статистики: пульс на сравнимом темпе, динамика по
// неделям и личные рекорды. Чистые функции над сводками тренировок.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Пульс на сравнимом темпе
// ---------------------------------------------------------------------------

/**
 * Ширина полосы темпа, с/км. Две пробежки сравнимы, только если бежали примерно в
 * одном темпе, поэтому перед любым сравнением тренировки раскладываются по полосам.
 */
export const PACE_BUCKET_SEC = 15;
/** Меньше тренировок в каждой половине, и сравнение становится шумом под видом тренда. */
export const MIN_SESSIONS_PER_HALF = 2;
/** Короткий рывок даёт нелепый темп: это не пробежка, с которой стоит сравнивать. */
export const MIN_COMPARABLE_METERS = 1000;

/** Итог сравнения пульса на одном темпе: ранние тренировки против последних. */
export interface PaceEfficiency {
  // Полоса темпа, в которой шло сравнение, с/км.
  paceFrom: number;
  paceTo: number;
  earlierAvgHr: number;
  recentAvgHr: number;
  // Отрицательное значит, что на том же темпе пульс упал: это и есть честный
  // признак роста формы, который можно увидеть по этим данным.
  deltaBpm: number;
  sessionCount: number;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Падает ли пульс на том же темпе? Только бег и ходьба на улице: у дорожки нет темпа
 * для сравнения, а велосипед на том же «темпе» нагружает сердце совсем иначе. `null`, если сравнимых данных мало. Поначалу так почти всегда, и
 * показывать это надо как «пока рано», а не числом.
 */
export function paceEfficiency(sessions: WorkoutSessionSummary[]): PaceEfficiency | null {
  const usable = sessions
    .filter(
      (s) =>
        isRunDistance(s.mode) &&
        s.avgHr > 0 &&
        s.avgPaceSecPerKm != null &&
        Number.isFinite(s.avgPaceSecPerKm) &&
        (s.distanceMeters ?? 0) >= MIN_COMPARABLE_METERS,
    )
    .sort((a, b) => a.startedAt - b.startedAt);

  if (usable.length < MIN_SESSIONS_PER_HALF * 2) return null;

  // Раскладываем по полосам темпа и берём ту, в которой владелец бегает чаще всего.
  const buckets = new Map<number, WorkoutSessionSummary[]>();
  for (const session of usable) {
    const key = Math.floor(session.avgPaceSecPerKm! / PACE_BUCKET_SEC);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(session);
  }

  let best: { key: number; items: WorkoutSessionSummary[] } | null = null;
  for (const [key, items] of buckets) {
    if (!best || items.length > best.items.length) best = { key, items };
  }
  if (!best || best.items.length < MIN_SESSIONS_PER_HALF * 2) return null;

  // Старшая половина против младшей. При нечётном числе средняя тренировка
  // выпадает, а не считается дважды.
  const half = Math.floor(best.items.length / 2);
  const earlier = best.items.slice(0, half);
  const recent = best.items.slice(best.items.length - half);

  const earlierAvgHr = Math.round(mean(earlier.map((s) => s.avgHr)));
  const recentAvgHr = Math.round(mean(recent.map((s) => s.avgHr)));

  return {
    paceFrom: best.key * PACE_BUCKET_SEC,
    paceTo: (best.key + 1) * PACE_BUCKET_SEC,
    earlierAvgHr,
    recentAvgHr,
    deltaBpm: recentAvgHr - earlierAvgHr,
    sessionCount: best.items.length,
  };
}

// ---------------------------------------------------------------------------
// Динамика по неделям
// ---------------------------------------------------------------------------

/** Итоги одной недели: начало недели, число тренировок, дистанция бега и время. */
export interface WeekBucket {
  startMs: number;
  workouts: number;
  distanceMeters: number;
  totalSeconds: number;
}

/** Последние `weeks` недель, от старых к новым, пустые тоже. */
export function weeklyBuckets(
  sessions: WorkoutSessionSummary[],
  nowMs: number,
  weeks: number,
): WeekBucket[] {
  const currentWeekStart = startOfWeekMs(nowMs);
  const buckets: WeekBucket[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    buckets.push({
      startMs: currentWeekStart - i * WEEK_MS,
      workouts: 0,
      distanceMeters: 0,
      totalSeconds: 0,
    });
  }

  const firstStart = buckets[0].startMs;
  for (const session of sessions) {
    if (session.startedAt < firstStart) continue;
    const index = Math.floor((session.startedAt - firstStart) / WEEK_MS);
    if (index < 0 || index >= buckets.length) continue;
    const bucket = buckets[index];
    bucket.workouts += 1;
    // Километры только бега: велосипедные в той же сумме заглушили бы беговые.
    if (isRunDistance(session.mode)) bucket.distanceMeters += session.distanceMeters ?? 0;
    bucket.totalSeconds += session.durationSec;
  }

  return buckets;
}

// ---------------------------------------------------------------------------
// Личные рекорды
// ---------------------------------------------------------------------------

/** Рекорд: значение, тренировка, на которой он поставлен, и когда. */
export interface PersonalRecord {
  value: number;
  sessionId: string;
  at: number;
}

/** Личные рекорды. `null`, пока подходящих тренировок нет. */
export interface PersonalRecords {
  /** Самый длинный забег (бег и ходьба на улице). */
  longestDistanceMeters: PersonalRecord | null;
  /** Самая долгая тренировка любого вида. */
  longestDurationSec: PersonalRecord | null;
  // Наименьшие с/км, то есть чем меньше, тем лучше. Только бег.
  bestPaceSecPerKm: PersonalRecord | null;
  /** Самая длинная поездка на велосипеде. */
  longestRideMeters: PersonalRecord | null;
  /** Лучшая средняя скорость на велосипеде, хранится темпом (с/км): меньше значит быстрее. */
  bestRidePaceSecPerKm: PersonalRecord | null;
}

/** Поездка короче этого не претендует на рекорд скорости: спуск с горки не рекорд. */
export const MIN_RIDE_RECORD_METERS = 5000;

/**
 * Рекорды отдельно для бега и велосипеда: на велосипеде километры и скорость другого
 * порядка, и общий «лучший темп» навсегда заняла бы поездка. Длительность общая для всех
 * видов. Лучший темп бега засчитывается на дистанции от километра.
 */
export function personalRecords(sessions: WorkoutSessionSummary[]): PersonalRecords {
  let distance: PersonalRecord | null = null;
  let duration: PersonalRecord | null = null;
  let pace: PersonalRecord | null = null;
  let ride: PersonalRecord | null = null;
  let ridePace: PersonalRecord | null = null;

  for (const s of sessions) {
    const meters = s.distanceMeters ?? 0;
    if (s.durationSec > 0 && (!duration || s.durationSec > duration.value)) {
      duration = { value: s.durationSec, sessionId: s.id, at: s.startedAt };
    }
    const validPace = s.avgPaceSecPerKm != null && Number.isFinite(s.avgPaceSecPerKm) && s.avgPaceSecPerKm > 0;
    if (s.mode === 'cycling') {
      if (meters > 0 && (!ride || meters > ride.value)) ride = { value: meters, sessionId: s.id, at: s.startedAt };
      if (validPace && meters >= MIN_RIDE_RECORD_METERS && (!ridePace || s.avgPaceSecPerKm! < ridePace.value)) {
        ridePace = { value: s.avgPaceSecPerKm!, sessionId: s.id, at: s.startedAt };
      }
      continue;
    }
    if (!isRunDistance(s.mode)) continue;
    if (meters > 0 && (!distance || meters > distance.value)) {
      distance = { value: meters, sessionId: s.id, at: s.startedAt };
    }
    // Иначе рывок на 200 м навсегда занял бы рекорд темпа.
    if (
      s.avgPaceSecPerKm != null &&
      Number.isFinite(s.avgPaceSecPerKm) &&
      s.avgPaceSecPerKm > 0 &&
      meters >= MIN_COMPARABLE_METERS &&
      (!pace || s.avgPaceSecPerKm < pace.value)
    ) {
      pace = { value: s.avgPaceSecPerKm, sessionId: s.id, at: s.startedAt };
    }
  }

  return {
    longestDistanceMeters: distance,
    longestDurationSec: duration,
    bestPaceSecPerKm: pace,
    longestRideMeters: ride,
    bestRidePaceSecPerKm: ridePace,
  };
}
