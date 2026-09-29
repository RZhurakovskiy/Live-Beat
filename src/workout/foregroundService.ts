import notifee, { AndroidImportance, AuthorizationStatus } from '@notifee/react-native';

// The channel and notification ids stay as they were when this service also
// carried the daily monitoring: changing them would leave a dead channel behind
// in the system settings of phones that already have the app installed.
const CHANNEL_ID = 'monitoring';
const NOTIFICATION_ID = 'monitoring-fgs';

try {
  notifee.registerForegroundService(() => new Promise(() => {}));
} catch {
  // Notifee native module unavailable — the workout still runs, rest of app still boots.
}

let channelReady = false;

async function ensureChannel(): Promise<void> {
  if (channelReady) return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Тренировка',
    importance: AndroidImportance.LOW,
  });
  channelReady = true;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
}

const WORKOUT_TITLE = 'Идёт тренировка';
const WORKOUT_BODY = 'Пульс записывается в фоне';

// Keeps the app process (and with it the BLE subscription) alive for the length
// of a workout: without it Android freely kills the app in the background.
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

export async function stopWorkoutForegroundService(): Promise<void> {
  await notifee.stopForegroundService();
  await notifee.cancelNotification(NOTIFICATION_ID);
}
