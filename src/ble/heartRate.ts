import { PermissionsAndroid, Platform } from 'react-native';
import { BleError, BleManager, Device, State } from 'react-native-ble-plx';
import type { BleLink } from './connectionSupervisor';
import { base64ToBytes } from './hrParser';

export { parseHeartRateMeasurement } from './hrParser';
export type { HeartRateSample } from './hrParser';

export const HEART_RATE_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
export const HEART_RATE_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';
export const BATTERY_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb';
export const BATTERY_LEVEL_UUID = '00002a19-0000-1000-8000-00805f9b34fb';

// Reuse one BleManager across Fast Refresh reloads. Each `new BleManager()`
// registers Android BroadcastReceivers (adapter/location state); recreating it
// on every hot reload leaks them until "Too many receivers" (1000 limit).
const bleManagerRef = globalThis as unknown as { __bleManager?: BleManager };
const manager = bleManagerRef.__bleManager ?? (bleManagerRef.__bleManager = new BleManager());

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return (
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
    );
  }

  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export function waitForPoweredOn(): Promise<void> {
  return new Promise((resolve) => {
    const subscription = manager.onStateChange((state) => {
      if (state === State.PoweredOn) {
        subscription.remove();
        resolve();
      }
    }, true);
  });
}

export function scanForHeartRateDevices(
  onDeviceFound: (device: Device) => void,
  onError: (error: BleError) => void,
): () => void {
  manager.startDeviceScan([HEART_RATE_SERVICE_UUID], null, (error, device) => {
    if (error) {
      onError(error);
      return;
    }
    if (device) {
      onDeviceFound(device);
    }
  });

  return () => manager.stopDeviceScan();
}

const CONNECT_TIMEOUT_MS = 10000;

// The only code that opens or closes the strap connection. It is driven solely
// by the connection supervisor (connectionSupervisor.ts), which keeps one
// connect in flight at a time and removes every listener it registers.
export const bleLink: BleLink = {
  async connect(deviceId) {
    const device = await manager.connectToDevice(deviceId, { timeout: CONNECT_TIMEOUT_MS });
    try {
      await device.discoverAllServicesAndCharacteristics();
    } catch (error) {
      // Don't leave a half-open link behind: the next connectToDevice() would
      // cancel it and fire a disconnect event on top of the retry.
      await manager.cancelDeviceConnection(deviceId).catch(() => {});
      throw error;
    }
  },

  async disconnect(deviceId) {
    // Also aborts a connection attempt that is still pending.
    await manager.cancelDeviceConnection(deviceId).catch(() => {});
  },

  isConnected(deviceId) {
    return manager.isDeviceConnected(deviceId);
  },

  onDisconnected(deviceId, listener) {
    return manager.onDeviceDisconnected(deviceId, () => listener());
  },

  monitor(deviceId, onValue, onError) {
    return manager.monitorCharacteristicForDevice(
      deviceId,
      HEART_RATE_SERVICE_UUID,
      HEART_RATE_MEASUREMENT_UUID,
      (error, characteristic) => {
        if (error) {
          onError(error);
          return;
        }
        if (characteristic?.value) onValue(characteristic.value);
      },
    );
  },
};

export async function readBatteryLevel(deviceId: string): Promise<number | null> {
  try {
    const characteristic = await manager.readCharacteristicForDevice(
      deviceId,
      BATTERY_SERVICE_UUID,
      BATTERY_LEVEL_UUID,
    );
    if (!characteristic.value) return null;
    return base64ToBytes(characteristic.value)[0];
  } catch {
    return null;
  }
}

export async function disconnectDevice(deviceId: string): Promise<void> {
  const isConnected = await manager.isDeviceConnected(deviceId).catch(() => false);
  if (isConnected) {
    await manager.cancelDeviceConnection(deviceId);
  }
}

export function destroyBleManager(): void {
  manager.destroy();
}
