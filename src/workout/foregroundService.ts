import notifee, { AndroidImportance, AuthorizationStatus } from '@notifee/react-native';

// Foreground-сервис тренировки на Notifee: постоянное уведомление, которое держит
// процесс приложения живым, пока идёт тренировка.

// ID канала и уведомления остались с тех времён, когда этот же сервис нёс ещё и
// суточный мониторинг: если их сменить, на телефонах, где приложение уже стоит, в
// системных настройках останется мёртвый канал.
const CHANNEL_ID = 'monitoring';
const NOTIFICATION_ID = 'monitoring-fgs';

// Задача сервиса сама не завершается никогда: сервис живёт до вызова
// stopWorkoutForegroundService, а не до конца этой задачи.
try {
  notifee.registerForegroundService(() => new Promise(() => {}));
} catch {
  // Нативного модуля Notifee нет: тренировка всё равно идёт, остальное приложение запускается.
}

let channelReady = false;

/** Создаёт канал уведомлений тренировки, один раз за запуск приложения. */
async function ensureChannel(): Promise<void> {
  if (channelReady) return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Тренировка',
    importance: AndroidImportance.LOW,
  });
  channelReady = true;
}

/** Запрашивает разрешение на уведомления. `true`, если выдано. */
export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
}

/** Выдано ли разрешение на уведомления. Только читает, без системного диалога: для чек-листа настройки. */
export async function checkNotificationPermission(): Promise<boolean> {
  try {
    const settings = await notifee.getNotificationSettings();
    return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
  } catch {
    return false;
  }
}

const WORKOUT_TITLE = 'Идёт тренировка';
const WORKOUT_BODY = 'Пульс записывается в фоне';

/**
 * Показывает уведомление тренировки и поднимает с ним foreground-сервис. Он держит
 * процесс приложения (а с ним и подписку на пульс) живым всю тренировку: без него
 * Android спокойно выгружает приложение в фоне.
 */
export async function startWorkoutForegroundService(): Promise<void> {
  await ensureChannel();
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: WORKOUT_TITLE,
    body: WORKOUT_BODY,
    android: {
      channelId: CHANNEL_ID,
      asForegroundService: true,
      ongoing: true,
      onlyAlertOnce: true,
      color: '#FF3B5C',
      pressAction: { id: 'default' },
    },
  });
}

/** Останавливает foreground-сервис и убирает уведомление. */
export async function stopWorkoutForegroundService(): Promise<void> {
  await notifee.stopForegroundService();
  await notifee.cancelNotification(NOTIFICATION_ID);
}
