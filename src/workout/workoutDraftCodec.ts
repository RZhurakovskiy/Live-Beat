import type { HrSample, RoutePoint, WorkoutMode } from '../types';

// Идущая тренировка живёт в памяти до «Завершить тренировку». Если Android выгрузит
// приложение раньше (низкий заряд, энергосбережение, «убийцы» задач у
// производителей), всё записанное пропадёт. Поэтому идущая тренировка ещё и пишется
// в базу черновиком и восстанавливается при следующем запуске. Здесь формат
// черновика и его проверка, без React Native, чтобы гонять в Jest.

/** Черновик тренировки в том виде, в каком он лежит в базе. */
export interface WorkoutDraft {
  mode: WorkoutMode;
  startedAt: number;
  hrSamples: HrSample[];
  route: RoutePoint[];
  targetZoneRange: { min: number; max: number } | null;
  // Состояние паузы: тренировка, выгруженная на паузе, возвращается на паузе, а не
  // засчитывает молча время, пока приложения не было. В черновиках, записанных до
  // появления паузы, этих полей нет, отсюда значения по умолчанию в декодере.
  pausedMs: number;
  pausedAt: number | null;
  // `finished` значит, что тренировка закончена и ждёт на экране итогов, сохранят
  // её или отбросят. Без этого приложение, выгруженное на том экране, воскресило
  // бы законченную тренировку как идущую, с тикающим таймером.
  status: 'active' | 'finished';
  finishedAt: number | null;
}

/** Черновик старше этого считается мусором, а не тренировкой, которую надо продолжить. */
export const MAX_DRAFT_AGE_MS = 24 * 60 * 60 * 1000;

/** Черновик в строку для базы. */
export function encodeWorkoutDraft(draft: WorkoutDraft): string {
  return JSON.stringify(draft);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Строку из базы обратно в черновик. `null`, если черновик битый, слишком старый
 * или из будущего. Отдельные битые точки пульса и маршрута отбрасываются, а не
 * губят весь черновик.
 */
export function decodeWorkoutDraft(json: string, now: number): WorkoutDraft | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;

  if (d.mode !== 'treadmill' && d.mode !== 'outdoor') return null;
  if (!isNumber(d.startedAt) || now - d.startedAt > MAX_DRAFT_AGE_MS || d.startedAt > now) return null;

  const hrSamples = Array.isArray(d.hrSamples)
    ? d.hrSamples.filter((s): s is HrSample => !!s && isNumber(s.t) && isNumber(s.bpm))
    : [];
  const route = Array.isArray(d.route)
    ? d.route.filter((p): p is RoutePoint => !!p && isNumber(p.lat) && isNumber(p.lng) && isNumber(p.t))
    : [];
  const zone = d.targetZoneRange as { min?: unknown; max?: unknown } | null | undefined;
  const targetZoneRange = zone && isNumber(zone.min) && isNumber(zone.max) ? { min: zone.min, max: zone.max } : null;

  // В черновиках, записанных до появления паузы, нет ни одного из этих полей. Такая
  // тренировка никогда не стояла на паузе, так что ноль и null здесь верный ответ,
  // а не ошибка разбора.
  const pausedMs = isNumber(d.pausedMs) && d.pausedMs >= 0 ? d.pausedMs : 0;
  const pausedAt = isNumber(d.pausedAt) && d.pausedAt >= d.startedAt && d.pausedAt <= now ? d.pausedAt : null;

  // Законченным черновик считается, только если у него есть и правдоподобное время
  // окончания: иначе тренировку не из чего собрать, и безопаснее продолжить её как
  // идущую.
  const finishedAt =
    isNumber(d.finishedAt) && d.finishedAt >= d.startedAt && d.finishedAt <= now ? d.finishedAt : null;
  const status: 'active' | 'finished' = d.status === 'finished' && finishedAt !== null ? 'finished' : 'active';

  return {
    mode: d.mode,
    startedAt: d.startedAt,
    hrSamples,
    route,
    targetZoneRange,
    pausedMs,
    pausedAt,
    status,
    finishedAt: status === 'finished' ? finishedAt : null,
  };
}
