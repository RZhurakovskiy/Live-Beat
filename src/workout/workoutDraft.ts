import { AppState } from 'react-native';
import { clearWorkoutDraft, loadWorkoutDraft, saveWorkoutDraft } from '../db/database';
import { startOutdoorTracking } from '../location/backgroundLocation';
import { useProfileStore } from '../store/profileStore';
import { ActiveWorkout, useSessionStore } from '../store/sessionStore';
import { generateId } from '../utils/id';
import { decodeWorkoutDraft, encodeWorkoutDraft, WorkoutDraft } from './workoutDraftCodec';
import { activityOf } from './activities';
import { buildWorkoutSession } from './workoutSession';

// Черновик идущей тренировки в базе: он переживает выгрузку приложения посреди
// тренировки. Сам формат и его проверка в workoutDraftCodec.ts.

const SAVE_INTERVAL_MS = 10000;

let lastSavedAt = 0;
let saving = false;
let started = false;
// Ставится, когда тренировка закончена и в черновике лежит её итоговая копия. Не
// даёт автосохранению перезаписать или стереть его, пока открыт экран итогов.
let finalized = false;

/** Идущая тренировка в формате черновика. */
function toDraft(workout: ActiveWorkout): WorkoutDraft {
  return {
    mode: workout.mode,
    startedAt: workout.startedAt,
    hrSamples: workout.hrSamples,
    route: workout.route,
    targetZoneRange: workout.targetZoneRange,
    pausedMs: workout.pausedMs,
    pausedAt: workout.pausedAt,
    pauses: workout.pauses,
    interval: workout.interval,
    status: 'active',
    finishedAt: null,
  };
}

/** Пишет черновик прямо сейчас, если тренировка идёт и предыдущая запись уже закончилась. */
async function saveNow(): Promise<void> {
  const workout = useSessionStore.getState().activeWorkout;
  if (!workout || saving || finalized) return;
  saving = true;
  lastSavedAt = Date.now();
  try {
    await saveWorkoutDraft(encodeWorkoutDraft(toDraft(workout)));
    // Тренировку закончили или отбросили, пока шла эта запись: не оставляем
    // черновик, который вернул бы уже сохранённую тренировку.
    if (!finalized && useSessionStore.getState().activeWorkout?.startedAt !== workout.startedAt) {
      await clearWorkoutDraft();
    }
  } catch {
    // неудачная запись повторится при следующем изменении
  } finally {
    saving = false;
  }
}

/**
 * Держит копию идущей тренировки в базе с отставанием не больше ~10 с и пишет её
 * сразу, когда приложение уходит в фон: именно тогда Android скорее всего его
 * выгрузит. Вызывается один раз при старте приложения.
 */
export function startWorkoutDraftAutosave(): void {
  if (started) return;
  started = true;

  useSessionStore.subscribe((state, previous) => {
    const workout = state.activeWorkout;
    if (!workout || workout === previous.activeWorkout) return;
    const isNew = !previous.activeWorkout || previous.activeWorkout.startedAt !== workout.startedAt;
    if (isNew) finalized = false;
    if (isNew || Date.now() - lastSavedAt >= SAVE_INTERVAL_MS) void saveNow();
  });

  AppState.addEventListener('change', (next) => {
    if (next !== 'active') void saveNow();
  });
}

/**
 * Вызывается, когда тренировка закончена. В базе её ещё нет (сохраняют или
 * отбрасывают её на экране итогов), поэтому до тех пор черновик остаётся
 * единственной копией.
 */
export async function markDraftFinished(finishedAt: number): Promise<void> {
  const workout = useSessionStore.getState().activeWorkout;
  if (!workout) return;
  finalized = true;
  await saveWorkoutDraft(
    encodeWorkoutDraft({ ...toDraft(workout), status: 'finished', finishedAt }),
  ).catch(() => {});
}

/**
 * Что нашлось при старте: ничего, недоконченная тренировка (`active`) или
 * законченная, но ещё не сохранённая (`finished`).
 */
export type DraftRestore = { kind: 'none' } | { kind: 'active' } | { kind: 'finished' };

/**
 * При старте приложения возвращает тренировку, посреди которой приложение
 * выгрузили, а если она уже была закончена, то тренировку, ждущую сохранения на
 * экране итогов. Уличной тренировке заново запускает запись маршрута.
 */
export async function restoreWorkoutDraft(): Promise<DraftRestore> {
  if (useSessionStore.getState().activeWorkout) return { kind: 'none' };
  const json = await loadWorkoutDraft().catch(() => null);
  if (!json) return { kind: 'none' };

  const draft = decodeWorkoutDraft(json, Date.now());
  if (!draft) {
    await clearWorkoutDraft().catch(() => {});
    return { kind: 'none' };
  }

  if (draft.status === 'finished' && draft.finishedAt !== null) {
    finalized = true;
    const session = buildWorkoutSession(
      generateId(),
      draft,
      useProfileStore.getState().profile,
      draft.finishedAt,
    );
    useSessionStore.getState().setPendingSession(session);
    return { kind: 'finished' };
  }

  useSessionStore.getState().restoreWorkout(draft);
  if (activityOf(draft.mode).hasGps) startOutdoorTracking().catch(() => {});
  return { kind: 'active' };
}

/** Стирает черновик. Вызывается с экрана итогов, когда тренировку сохранили или отбросили. */
export function discardWorkoutDraft(): Promise<void> {
  finalized = false;
  return clearWorkoutDraft().catch(() => {});
}
