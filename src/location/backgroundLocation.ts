import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Linking } from 'react-native';
import { useSessionStore } from '../store/sessionStore';

export const LOCATION_TASK_NAME = 'pulse-background-location-task';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations: Location.LocationObject[] } | undefined)?.locations;
  if (!locations?.length) return;

  const appendRoutePoint = useSessionStore.getState().appendRoutePoint;
  for (const location of locations) {
    appendRoutePoint({
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      t: location.timestamp,
    });
  }
});

export async function requestLocationPermissions(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return false;

  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === 'granted';
}

// Read-only, for the setup checklist: no system dialog, just the current state.
export async function checkLocationPermission(): Promise<boolean> {
  const foreground = await Location.getForegroundPermissionsAsync().catch(() => null);
  return foreground?.status === 'granted';
}

/**
 * Готова ли геолокация к уличной тренировке.
 * - `no-permission`: приложению не выдано разрешение;
 * - `services-off`: разрешение есть, но геолокация выключена на самом телефоне;
 * - `ready`: можно стартовать.
 *
 * Разрешение и переключатель геолокации это разные вещи: разрешение выдают один раз,
 * а переключатель пользователь щёлкает в шторке когда угодно. Трекинг с выключенной
 * геолокацией стартует без ошибки, но точки не приходят никогда.
 */
export type LocationReadiness = 'no-permission' | 'services-off' | 'ready';

/**
 * Проверяет готовность геолокации без системных диалогов.
 * Разрешения проверяются те же, что требует `requestLocationPermissions`, иначе
 * футер обещал бы готовность, а старт всё равно упирался бы в разрешение.
 */
export async function checkLocationReadiness(): Promise<LocationReadiness> {
  const [foreground, background] = await Promise.all([
    Location.getForegroundPermissionsAsync().catch(() => null),
    Location.getBackgroundPermissionsAsync().catch(() => null),
  ]);
  if (foreground?.status !== 'granted' || background?.status !== 'granted') return 'no-permission';
  // Упала сама проверка: старт не блокируем, пусть лучше будет «Ожидание GPS».
  const servicesOn = await Location.hasServicesEnabledAsync().catch(() => true);
  return servicesOn ? 'ready' : 'services-off';
}

/** Открывает системный экран геолокации, а если его нет, настройки приложения. */
export async function openLocationSettings(): Promise<void> {
  try {
    await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
  } catch {
    await Linking.openSettings().catch(() => {});
  }
}

export async function startOutdoorTracking(): Promise<void> {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (alreadyStarted) return;

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 3000,
    distanceInterval: 5,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'LiveBeat записывает тренировку',
      notificationBody: 'Отслеживание маршрута на улице активно',
    },
  });
}

export async function stopOutdoorTracking(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
