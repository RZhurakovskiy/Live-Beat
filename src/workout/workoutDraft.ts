import { AppState } from 'react-native';
import { clearWorkoutDraft, loadWorkoutDraft, saveWorkoutDraft } from '../db/database';
import { startOutdoorTracking } from '../location/backgroundLocation';
import { ActiveWorkout, useSessionStore } from '../store/sessionStore';
import { decodeWorkoutDraft, encodeWorkoutDraft } from './workoutDraftCodec';

const SAVE_INTERVAL_MS = 10000;

let lastSavedAt = 0;
let saving = false;
let started = false;

function toDraft(workout: ActiveWorkout) {
  return {
    mode: workout.mode,
    startedAt: workout.startedAt,
    hrSamples: workout.hrSamples,
    route: workout.route,
    targetZoneRange: workout.targetZoneRange,
    pausedMs: workout.pausedMs,
    pausedAt: workout.pausedAt,
  };
}

async function saveNow(): Promise<void> {
  const workout = useSessionStore.getState().activeWorkout;
  if (!workout || saving) return;
  saving = true;
  lastSavedAt = Date.now();
  try {
    await saveWorkoutDraft(encodeWorkoutDraft(toDraft(workout)));
    // Finished or discarded while this save was in flight: don't leave a
    // draft behind that would bring an already saved workout back.
    if (useSessionStore.getState().activeWorkout?.startedAt !== workout.startedAt) {
      await clearWorkoutDraft();
    }
  } catch {
    // a failed save is retried on the next change
  } finally {
    saving = false;
  }
}

// Keeps the database copy of the running workout at most ~10 s behind, and
// writes it right away when the app goes to the background (the moment
// Android is most likely to kill it).
export function startWorkoutDraftAutosave(): void {
  if (started) return;
  started = true;

  useSessionStore.subscribe((state, previous) => {
    const workout = state.activeWorkout;
    if (!workout || workout === previous.activeWorkout) return;
    const isNew = !previous.activeWorkout || previous.activeWorkout.startedAt !== workout.startedAt;
    if (isNew || Date.now() - lastSavedAt >= SAVE_INTERVAL_MS) void saveNow();
  });

  AppState.addEventListener('change', (next) => {
    if (next !== 'active') void saveNow();
  });
}

// On app start: bring back a workout the app was killed in the middle of.
// Returns true when a workout was restored.
export async function restoreWorkoutDraft(): Promise<boolean> {
  if (useSessionStore.getState().activeWorkout) return false;
  const json = await loadWorkoutDraft().catch(() => null);
  if (!json) return false;

  const draft = decodeWorkoutDraft(json, Date.now());
  if (!draft) {
    await clearWorkoutDraft().catch(() => {});
    return false;
  }

  useSessionStore.getState().restoreWorkout(draft);
  if (draft.mode === 'outdoor') startOutdoorTracking().catch(() => {});
  return true;
}

export function discardWorkoutDraft(): Promise<void> {
  return clearWorkoutDraft().catch(() => {});
}
