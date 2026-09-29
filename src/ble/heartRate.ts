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

// Android runs one BLE scan at a time: a second startDeviceScan supersedes the
// first, and stopDeviceScan stops whoever is scanning, not just the caller.
// Both the pairing screen and the background reconnect need to scan, so every
// scan goes through here — otherwise a reconnect would silently kill the
// pairing screen's scan, and the screen's cleanup would kill the reconnect's.
let scanOwner = 0;
let scanActive = false;

function startScan(onDeviceFound: (device: Device) => void, onError: (error: BleError) => void): () => void {
  const me = ++scanOwner;
  scanActive = true;
  try {
    manager.startDeviceScan([HEART_RATE_SERVICE_UUID], null, (error, device) => {
      if (me !== scanOwner) return; // superseded: these results belong to someone else
      if (error) {
        onError(error);
        return;
      }
      if (device) {
        onDeviceFound(device);
      }
    });
  } catch (error) {
    onError(error as BleError);
  }

  return () => {
    if (me !== scanOwner) return; // someone else owns the radio; stopping would cut their scan short
    scanOwner += 1;
    scanActive = false;
    manager.stopDeviceScan();
  };
}

export function scanForHeartRateDevices(
  onDeviceFound: (device: Device) => void,
  onError: (error: BleError) => void,
): () => void {
  return startScan(onDeviceFound, onError);
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

  // "Is this exact strap on the air right now?" The pairing screen scans to
  // list straps; this asks about one, so the reconnect loop doesn't spend a
  // 10 s connect timeout on a strap that isn't there — and, more importantly,
  // actually notices the moment it comes back. connectToDevice never does.
  waitForDevice(deviceId, timeoutMs) {
    // The pairing screen is scanning right now. Starting a second scan would
    // supersede it and swallow its results just as the user is looking for the
    // strap, so leave it the radio and let this attempt go ahead blind.
    if (scanActive) return Promise.resolve(true);

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let stopScan: (() => void) | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const finish = (found: boolean) => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        stopScan?.();
        resolve(found);
      };

      timer = setTimeout(() => finish(false), timeoutMs);
      const stop = startScan(
        (device) => {
          if (device.id === deviceId) finish(true);
        },
        () => finish(false),
      );
      // The scan can fail synchronously, in which case finish() already ran and
      // had nothing to stop yet.
      if (settled) stop();
      else stopScan = stop;
    });
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
