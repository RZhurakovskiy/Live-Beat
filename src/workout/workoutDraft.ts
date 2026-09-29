import { AppState } from 'react-native';
import { clearWorkoutDraft, loadWorkoutDraft, saveWorkoutDraft } from '../db/database';
import { startOutdoorTracking } from '../location/backgroundLocation';
import { useProfileStore } from '../store/profileStore';
import { ActiveWorkout, useSessionStore } from '../store/sessionStore';
import { generateId } from '../utils/id';
import { decodeWorkoutDraft, encodeWorkoutDraft, WorkoutDraft } from './workoutDraftCodec';
import { buildWorkoutSession } from './workoutSession';

const SAVE_INTERVAL_MS = 10000;

let lastSavedAt = 0;
let saving = false;
let started = false;
// Set once the workout is over and the draft holds the finished copy. Blocks
// the autosave from overwriting or clearing it while the summary is open.
let finalized = false;

function toDraft(workout: ActiveWorkout): WorkoutDraft {
  return {
    mode: workout.mode,
    startedAt: workout.startedAt,
    hrSamples: workout.hrSamples,
    route: workout.route,
    targetZoneRange: workout.targetZoneRange,
    pausedMs: workout.pausedMs,
    pausedAt: workout.pausedAt,
    status: 'active',
    finishedAt: null,
  };
}

async function saveNow(): Promise<void> {
  const workout = useSessionStore.getState().activeWorkout;
  if (!workout || saving || finalized) return;
  saving = true;
  lastSavedAt = Date.now();
  try {
    await saveWorkoutDraft(encodeWorkoutDraft(toDraft(workout)));
    // Finished or discarded while this save was in flight: don't leave a
    // draft behind that would bring an already saved workout back.
    if (!finalized && useSessionStore.getState().activeWorkout?.startedAt !== workout.startedAt) {
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
    if (isNew) finalized = false;
    if (isNew || Date.now() - lastSavedAt >= SAVE_INTERVAL_MS) void saveNow();
  });

  AppState.addEventListener('change', (next) => {
    if (next !== 'active') void saveNow();
  });
}

// Called when the workout ends. The session is not in the database yet — it is
// saved or discarded from the summary screen — so the draft has to survive as
// the only copy until then.
export async function markDraftFinished(finishedAt: number): Promise<void> {
  const workout = useSessionStore.getState().activeWorkout;
  if (!workout) return;
  finalized = true;
  await saveWorkoutDraft(
    encodeWorkoutDraft({ ...toDraft(workout), status: 'finished', finishedAt }),
  ).catch(() => {});
}

export type DraftRestore = { kind: 'none' } | { kind: 'active' } | { kind: 'finished' };

// On app start: bring back a workout the app was killed in the middle of — or,
// if it was already finished, the session waiting to be saved.
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
  if (draft.mode === 'outdoor') startOutdoorTracking().catch(() => {});
  return { kind: 'active' };
}

export function discardWorkoutDraft(): Promise<void> {
  finalized = false;
  return clearWorkoutDraft().catch(() => {});
}
