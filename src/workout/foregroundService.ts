import notifee, { AndroidImportance, AuthorizationStatus } from '@notifee/react-native';

const CHANNEL_ID = 'monitoring';
const NOTIFICATION_ID = 'monitoring-fgs';
const TITLE = 'Мониторинг пульса активен';

try {
  notifee.registerForegroundService(() => new Promise(() => {}));
} catch {
  // Notifee native module unavailable — monitoring degrades gracefully, rest of app still boots.
}

let channelReady = false;

async function ensureChannel(): Promise<void> {
  if (channelReady) return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Мониторинг пульса',
    importance: AndroidImportance.LOW,
  });
  channelReady = true;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
}

function bodyFor(bpm: number | null): string {
  return bpm ? `Текущий пульс: ${bpm} уд/мин` : 'Ожидание данных с датчика…';
}

export async function startMonitoringForegroundService(bpm: number | null): Promise<void> {
  await ensureChannel();
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: TITLE,
    body: bodyFor(bpm),
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

export async function updateMonitoringNotification(body: string): Promise<void> {
  await ensureChannel();
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: TITLE,
    body,
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

const WORKOUT_TITLE = 'Идёт тренировка';
const WORKOUT_BODY = 'Пульс записывается в фоне';

// Keeps the app process alive during a workout, like monitoring does. Shares
// the one foreground-service notification with monitoring.
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

export async function stopMonitoringForegroundService(): Promise<void> {
  await notifee.stopForegroundService();
  await notifee.cancelNotification(NOTIFICATION_ID);
}
