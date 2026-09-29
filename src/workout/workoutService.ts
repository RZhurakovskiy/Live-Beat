import { recoverIfStale } from '../ble/connectionManager';
import {
  requestNotificationPermission,
  startWorkoutForegroundService,
  stopWorkoutForegroundService,
} from './foregroundService';

// Android sometimes drops a BLE link without reporting it: the connection still
// looks up, but no packets arrive. This watchdog notices and forces one
// reconnect cycle. It used to belong to the daily monitoring; now the workout is
// the only thing that needs the strap, so it runs for the length of a workout.
const WATCHDOG_INTERVAL_MS = 10000;
const STALE_AFTER_MS = 20000;

let watchdog: ReturnType<typeof setInterval> | null = null;

function startWatchdog(): void {
  if (watchdog !== null) return;
  watchdog = setInterval(() => {
    recoverIfStale(STALE_AFTER_MS).catch(() => {});
  }, WATCHDOG_INTERVAL_MS);
}

function stopWatchdog(): void {
  if (watchdog === null) return;
  clearInterval(watchdog);
  watchdog = null;
}

// Foreground service for a workout: without it Android freely kills the app in
// the background (low battery, battery saver), taking the workout with it.
export async function beginWorkoutService(): Promise<void> {
  // Independent of the notification permission: a workout without the service
  // still wants its link watched.
  startWatchdog();
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;
    await startWorkoutForegroundService();
  } catch {
    // the workout still runs, just without the extra protection
  }
}

export async function endWorkoutService(): Promise<void> {
  stopWatchdog();
  await stopWorkoutForegroundService().catch(() => {});
}
