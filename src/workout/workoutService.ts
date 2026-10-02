import { recoverIfStale } from '../ble/connectionManager';
import { useProfileStore } from '../store/profileStore';
import { useSessionStore } from '../store/sessionStore';
import { profileMaxHr } from '../utils/heartRateZones';
import {
  requestNotificationPermission,
  startWorkoutForegroundService,
  stopWorkoutForegroundService,
  updateWorkoutNotification,
} from './foregroundService';
import { NotificationText, notificationFromState, sameNotification } from './notificationText';

// Android иногда рвёт BLE-связь, не сообщая об этом: соединение вроде бы живо, а
// пакеты не приходят. Этот сторож такое замечает и запускает один цикл
// переподключения. Раньше он принадлежал суточному мониторингу; теперь ремень
// нужен только тренировке, поэтому сторож работает, пока она идёт.
const WATCHDOG_INTERVAL_MS = 10000;
const STALE_AFTER_MS = 20000;

let watchdog: ReturnType<typeof setInterval> | null = null;

// Живой пульс в уведомлении обновляется раз в пару секунд, и только если текст изменился:
// чаще шторке незачем, а каждое обновление стоит работы системе.
const NOTIFICATION_INTERVAL_MS = 2000;
let notificationTimer: ReturnType<typeof setInterval> | null = null;
// Последний показанный текст: сравнивать с ним дешевле, чем дёргать уведомление зря.
let lastNotification: NotificationText | null = null;

function refreshNotification(): void {
  const session = useSessionStore.getState();
  const profile = useProfileStore.getState().profile;
  const text = notificationFromState(
    {
      workout: session.activeWorkout,
      connectionStatus: session.connectionStatus,
      sensorContact: session.sensorContact,
      maxHr: profile ? profileMaxHr(profile) : null,
    },
    Date.now(),
  );
  if (sameNotification(lastNotification, text)) return;
  lastNotification = text;
  updateWorkoutNotification(text.title, text.body).catch(() => {});
}

function startNotificationUpdates(): void {
  if (notificationTimer !== null) return;
  lastNotification = null;
  notificationTimer = setInterval(refreshNotification, NOTIFICATION_INTERVAL_MS);
}

function stopNotificationUpdates(): void {
  if (notificationTimer === null) return;
  clearInterval(notificationTimer);
  notificationTimer = null;
  lastNotification = null;
}

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

/**
 * Запускает всё, что должно работать, пока идёт тренировка: сторож тихих обрывов
 * связи и foreground-сервис. Без сервиса Android спокойно выгружает приложение в
 * фоне (низкий заряд, энергосбережение), а вместе с ним и тренировку.
 */
export async function beginWorkoutService(): Promise<void> {
  // Не зависит от разрешения на уведомления: связь тренировки без сервиса тоже надо сторожить.
  startWatchdog();
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;
    await startWorkoutForegroundService();
    startNotificationUpdates();
  } catch {
    // тренировка всё равно идёт, просто без дополнительной защиты
  }
}

/** Останавливает сторож и foreground-сервис, когда тренировка закончена. */
export async function endWorkoutService(): Promise<void> {
  stopWatchdog();
  stopNotificationUpdates();
  await stopWorkoutForegroundService().catch(() => {});
}
