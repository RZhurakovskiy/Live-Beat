import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Linking } from 'react-native';
import { useSessionStore } from '../store/sessionStore';

// Запись маршрута уличной тренировки: фоновая задача геолокации со своим
// foreground-сервисом и проверки разрешений и переключателя геолокации.

/**
 * Имя фоновой задачи геолокации. «pulse» в нём осталось от прежнего названия
 * приложения и не меняется намеренно, как и `pulse.db` (conventions-and-status.md).
 */
export const LOCATION_TASK_NAME = 'pulse-background-location-task';

// Задача регистрируется при импорте модуля, до любого экрана: Android может
// разбудить её сам, когда приложение в фоне. Каждая пришедшая точка дописывается
// в маршрут идущей тренировки.
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

/**
 * Запрашивает разрешения на геолокацию: сначала обычное, затем фоновое. `true`,
 * только если выданы оба. На Android 11+ фоновое разрешение выдаётся не в диалоге,
 * а на экране настроек приложения.
 */
export async function requestLocationPermissions(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return false;

  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === 'granted';
}

/**
 * Выдано ли всё, что просит `requestLocationPermissions`: обычное и фоновое
 * разрешение. Без системного диалога, только текущее состояние.
 *
 * Проверять надо ровно то же, что требует старт, иначе чек-лист настройки и футер
 * карточки «На улице» показывали бы «разрешено», а старт всё равно упирался бы в
 * фоновое разрешение.
 */
export async function checkLocationPermission(): Promise<boolean> {
  const [foreground, background] = await Promise.all([
    Location.getForegroundPermissionsAsync().catch(() => null),
    Location.getBackgroundPermissionsAsync().catch(() => null),
  ]);
  return foreground?.status === 'granted' && background?.status === 'granted';
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

/** Проверяет готовность геолокации без системных диалогов. */
export async function checkLocationReadiness(): Promise<LocationReadiness> {
  if (!(await checkLocationPermission())) return 'no-permission';
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

/**
 * Запускает запись маршрута с максимальной точностью: точка примерно раз в 3 с, но
 * только если сдвинулись хотя бы на 5 м. У записи свой foreground-сервис с
 * уведомлением, так что маршрут пишется и с погасшим экраном. Если запись уже идёт,
 * ничего не делает.
 */
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

/** Останавливает запись маршрута, если она идёт. */
export async function stopOutdoorTracking(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
