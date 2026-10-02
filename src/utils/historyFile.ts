import { isWorkoutMode, type HrRecovery, type HrSample, type RoutePoint, type UserProfile, type WorkoutSession } from '../types';
import { decodePauses } from '../workout/workoutDraftCodec';
import { isValidMaxHr } from './heartRateZones';
import { decodeIntervalConfig } from './intervals';

// Формат файла, в который выгружается вся история: бэкап, перенос на новый телефон и
// безболезненная смена ключа подписи перед RuStore (без него сборка на новом ключе
// ставится только после удаления приложения, и история пропала бы). Здесь только
// формат и его проверка, без React Native, чтобы гонять в Jest. Чтение и запись
// файла лежат в `data/historyTransfer.ts`.

/** Метка формата: по ней чужой JSON отличается от нашего файла. */
export const HISTORY_FORMAT = 'livebeat-history';

/**
 * Версия формата. Поднимается, только если старое приложение прочитало бы новый файл
 * неправильно. Новые необязательные поля тренировки версию не поднимают: старый
 * разборщик их просто не видит.
 */
export const HISTORY_VERSION = 1;

/** Содержимое файла истории. */
export interface HistoryFile {
  format: typeof HISTORY_FORMAT;
  version: number;
  exportedAt: number;
  profile: UserProfile | null;
  sessions: WorkoutSession[];
}

/** Разобранный файл: тренировки, прошедшие проверку, профиль и сколько записей отброшено. */
export interface ParsedHistory {
  ok: true;
  profile: UserProfile | null;
  sessions: WorkoutSession[];
  /** Записей тренировок, которые не прошли проверку и не будут импортированы. */
  skipped: number;
}

/**
 * Почему файл не читается целиком:
 * - `not-json`: это вообще не JSON;
 * - `wrong-format`: JSON, но не файл истории LiveBeat;
 * - `newer-version`: файл из более новой версии приложения, которую эта не понимает.
 */
export interface HistoryParseError {
  ok: false;
  error: 'not-json' | 'wrong-format' | 'newer-version';
}

/** Собирает файл истории из всех тренировок и профиля. */
export function buildHistoryFile(sessions: WorkoutSession[], profile: UserProfile | null, now: number): string {
  const file: HistoryFile = {
    format: HISTORY_FORMAT,
    version: HISTORY_VERSION,
    exportedAt: now,
    profile,
    sessions,
  };
  return JSON.stringify(file);
}

/** Имя файла с датой выгрузки: несколько бэкапов в одной папке не перепутать. */
export function historyFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `livebeat-history-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function optionalNumber(value: unknown): number | undefined {
  return isNumber(value) ? value : undefined;
}

/** Профиль из файла или `null`, если его нет или он неправдоподобен. */
export function decodeProfile(raw: unknown): UserProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (!isNumber(p.weightKg) || p.weightKg <= 0 || p.weightKg >= 300) return null;
  if (!isNumber(p.age) || p.age <= 0 || p.age >= 120) return null;
  if (p.gender !== 'male' && p.gender !== 'female') return null;
  // Свой максимум пульса необязателен и в файлах из более ранних версий его нет. Неправдоподобный
  // отбрасывается, а профиль остаётся: зоны тогда считаются по формуле, как у человека без него.
  return {
    weightKg: p.weightKg,
    age: p.age,
    gender: p.gender,
    ...(isValidMaxHr(p.maxHrBpm) ? { maxHrBpm: p.maxHrBpm } : {}),
  };
}

/**
 * Одна тренировка из файла или `null`, если она непригодна. Отдельные битые точки
 * пульса и маршрута отбрасываются, а не губят всю тренировку, как и в черновике.
 *
 * Неизвестный режим тоже даёт `null`: файл мог прийти из более новой версии с видом
 * тренировки, которого эта версия не умеет показывать.
 */
export function decodeSession(raw: unknown): WorkoutSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;

  if (typeof s.id !== 'string' || s.id.length === 0) return null;
  if (!isWorkoutMode(s.mode)) return null;
  if (!isNumber(s.startedAt) || !isNumber(s.endedAt) || s.endedAt < s.startedAt) return null;
  if (!isNumber(s.durationSec) || s.durationSec < 0) return null;
  if (!isNumber(s.avgHr) || !isNumber(s.maxHr) || !isNumber(s.minHr)) return null;
  if (!Array.isArray(s.hrSamples)) return null;

  const hrSamples = s.hrSamples.filter(
    (x): x is HrSample => !!x && typeof x === 'object' && isNumber(x.t) && isNumber(x.bpm),
  );
  const route = Array.isArray(s.route)
    ? s.route.filter(
        (p): p is RoutePoint => !!p && typeof p === 'object' && isNumber(p.lat) && isNumber(p.lng) && isNumber(p.t),
      )
    : undefined;

  const pauses = decodePauses(s.pauses, s.startedAt, s.endedAt);
  const r = s.recovery as Record<string, unknown> | undefined;
  const recovery: HrRecovery | undefined =
    r && typeof r === 'object' && isNumber(r.fromBpm) && isNumber(r.toBpm)
      ? { fromBpm: r.fromBpm, toBpm: r.toBpm }
      : undefined;

  return {
    id: s.id,
    mode: s.mode,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    durationSec: s.durationSec,
    avgHr: s.avgHr,
    maxHr: s.maxHr,
    minHr: s.minHr,
    hrSamples,
    distanceMeters: optionalNumber(s.distanceMeters),
    avgPaceSecPerKm: optionalNumber(s.avgPaceSecPerKm),
    route: route && route.length > 0 ? route : undefined,
    caloriesKcal: optionalNumber(s.caloriesKcal),
    pauses: pauses.length > 0 ? pauses : undefined,
    recovery,
    interval: decodeIntervalConfig(s.interval) ?? undefined,
  };
}

/** Разбирает файл истории. Битые тренировки отбрасываются поштучно и считаются. */
export function parseHistoryFile(json: string): ParsedHistory | HistoryParseError {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'not-json' };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'wrong-format' };
  const f = raw as Record<string, unknown>;
  if (f.format !== HISTORY_FORMAT || !isNumber(f.version) || !Array.isArray(f.sessions)) {
    return { ok: false, error: 'wrong-format' };
  }
  if (f.version > HISTORY_VERSION) return { ok: false, error: 'newer-version' };

  const sessions: WorkoutSession[] = [];
  let skipped = 0;
  for (const item of f.sessions) {
    const session = decodeSession(item);
    if (session) sessions.push(session);
    else skipped++;
  }
  return { ok: true, profile: decodeProfile(f.profile), sessions, skipped };
}

/** Что сделает импорт: какие тренировки добавить и сколько уже есть на телефоне. */
export interface ImportPlan {
  toInsert: WorkoutSession[];
  duplicates: number;
}

/**
 * Решает, что импортировать. Тренировка с уже известным `id` пропускается, а не
 * перезаписывается: повторный импорт того же файла ничего не удваивает и не затирает
 * то, что на телефоне. Дубли внутри самого файла тоже считаются один раз.
 */
export function planImport(existingIds: Iterable<string>, sessions: WorkoutSession[]): ImportPlan {
  const seen = new Set(existingIds);
  const toInsert: WorkoutSession[] = [];
  let duplicates = 0;
  for (const session of sessions) {
    if (seen.has(session.id)) {
      duplicates++;
      continue;
    }
    seen.add(session.id);
    toInsert.push(session);
  }
  return { toInsert, duplicates };
}

/** Текст ошибки разбора для диалога. */
export function historyParseErrorText(error: HistoryParseError['error']): string {
  switch (error) {
    case 'not-json':
      return 'Файл повреждён или это не файл истории.';
    case 'wrong-format':
      return 'Это не файл истории LiveBeat.';
    case 'newer-version':
      return 'Файл выгружен более новой версией LiveBeat. Обновите приложение и повторите.';
  }
}
