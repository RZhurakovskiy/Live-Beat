import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
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
