import { recoverIfStale } from '../ble/connectionManager';
import {
  requestNotificationPermission,
  startWorkoutForegroundService,
  stopWorkoutForegroundService,
} from './foregroundService';

// Android иногда рвёт BLE-связь, не сообщая об этом: соединение вроде бы живо, а
// пакеты не приходят. Этот сторож такое замечает и запускает один цикл
// переподключения. Раньше он принадлежал суточному мониторингу; теперь ремень
// нужен только тренировке, поэтому сторож работает, пока она идёт.
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
  } catch {
    // тренировка всё равно идёт, просто без дополнительной защиты
  }
}

/** Останавливает сторож и foreground-сервис, когда тренировка закончена. */
export async function endWorkoutService(): Promise<void> {
  stopWatchdog();
  await stopWorkoutForegroundService().catch(() => {});
}
