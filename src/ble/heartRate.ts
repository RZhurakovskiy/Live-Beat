import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { BleError, BleManager, Device, State } from 'react-native-ble-plx';
import { BluetoothReadiness, readinessFromBleState } from './bluetoothState';
import type { BleLink } from './connectionSupervisor';
import { bytesToText } from './deviceInfo';
import { base64ToBytes } from './hrParser';

export { parseHeartRateMeasurement } from './hrParser';
export type { HeartRateSample } from './hrParser';

/** Heart Rate Service: стандартный сервис пульса, по нему ищем ремни при сканировании. */
export const HEART_RATE_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
/** Heart Rate Measurement: характеристика, на которую подписываемся за пульсом. */
export const HEART_RATE_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';
/** Battery Service: заряд ремня, читается для журнала датчика. */
export const BATTERY_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb';
/** Battery Level: заряд в процентах, один байт. */
export const BATTERY_LEVEL_UUID = '00002a19-0000-1000-8000-00805f9b34fb';
/** Device Information Service: отсюда берутся производитель и модель ремня. */
export const DEVICE_INFO_SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
/** Manufacturer Name String: производитель, например «Magene». */
export const MANUFACTURER_NAME_UUID = '00002a29-0000-1000-8000-00805f9b34fb';
/** Model Number String: модель, например «H64». */
export const MODEL_NUMBER_UUID = '00002a24-0000-1000-8000-00805f9b34fb';

// Один BleManager на все перезагрузки Fast Refresh. Каждый `new BleManager()`
// регистрирует на Android BroadcastReceiver'ы (состояние адаптера и геолокации), и
// если пересоздавать его при каждой горячей перезагрузке, они копятся до ошибки
// «Too many receivers» (предел 1000).
const bleManagerRef = globalThis as unknown as { __bleManager?: BleManager };
const manager = bleManagerRef.__bleManager ?? (bleManagerRef.__bleManager = new BleManager());

/**
 * Запрашивает разрешения Bluetooth. На Android 12+ это «Устройства поблизости»
 * (BLUETOOTH_SCAN и BLUETOOTH_CONNECT), на более старых версиях сканирование BLE
 * требует точной геолокации. `true`, если всё выдано.
 */
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

/**
 * То же, что `requestBlePermissions`, но только читает текущее состояние, без
 * системного диалога: для чек-листа настройки.
 */
export async function checkBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  if (Platform.Version >= 31) {
    const [scan, connect] = await Promise.all([
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN),
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT),
    ]);
    return scan && connect;
  }

  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
}

/** Включён ли Bluetooth на телефоне сейчас. Разрешений не проверяет, это отдельный вопрос. */
export async function getBluetoothReadiness(): Promise<BluetoothReadiness> {
  return readinessFromBleState(await manager.state());
}

/**
 * Следит за состоянием адаптера и сразу сообщает текущее. Возвращает функцию отписки.
 * Нужна, чтобы подпись «Bluetooth выключен» появлялась и пропадала сама, когда его включают
 * или выключают в шторке, без перезахода на экран.
 */
export function subscribeBluetoothReadiness(listener: (readiness: BluetoothReadiness) => void): () => void {
  const subscription = manager.onStateChange((state) => listener(readinessFromBleState(state)), true);
  return () => subscription.remove();
}

/** Открывает системные настройки Bluetooth, а если их нет, настройки приложения. */
export async function openBluetoothSettings(): Promise<void> {
  try {
    await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
  } catch {
    await Linking.openSettings().catch(() => {});
  }
}

/**
 * Просит включить Bluetooth системным диалогом «Включить Bluetooth?»: один тап, из
 * приложения выходить не нужно. Включить его молча Android обычному приложению не даёт,
 * поэтому это именно просьба. Если диалог не открылся, ведёт в настройки Bluetooth.
 */
export async function requestEnableBluetooth(): Promise<void> {
  try {
    await Linking.sendIntent('android.bluetooth.adapter.action.REQUEST_ENABLE');
  } catch {
    await openBluetoothSettings();
  }
}

/** Ждёт, пока Bluetooth включится. Если он уже включён, выполняется сразу. */
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

// На Android одновременно идёт только одно BLE-сканирование: второй startDeviceScan
// заменяет первый, а stopDeviceScan останавливает того, кто сейчас сканирует, а не
// только вызвавшего. Сканировать нужно и экрану сопряжения, и фоновому
// переподключению, поэтому любое сканирование идёт через этот арбитр. Иначе
// переподключение молча убивало бы сканирование экрана сопряжения, а уход с экрана
// убивал бы сканирование переподключения.
let scanOwner = 0;
let scanActive = false;

/** Запускает сканирование через арбитр. Возвращённая функция останавливает только своё сканирование. */
function startScan(onDeviceFound: (device: Device) => void, onError: (error: BleError) => void): () => void {
  const me = ++scanOwner;
  scanActive = true;
  try {
    manager.startDeviceScan([HEART_RATE_SERVICE_UUID], null, (error, device) => {
      if (me !== scanOwner) return; // нас сменили: эти результаты уже чужие
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
    if (me !== scanOwner) return; // радио уже у другого, остановка оборвала бы его сканирование
    scanOwner += 1;
    scanActive = false;
    manager.stopDeviceScan();
  };
}

/** Ищет ремни с Heart Rate Service для экрана сопряжения. Возвращает функцию остановки. */
export function scanForHeartRateDevices(
  onDeviceFound: (device: Device) => void,
  onError: (error: BleError) => void,
): () => void {
  return startScan(onDeviceFound, onError);
}

// Таймаут одного нативного подключения. Всю попытку целиком ограничивает супервизор.
const CONNECT_TIMEOUT_MS = 10000;

/**
 * Единственный код, который открывает и закрывает соединение с ремнём. Управляет
 * им только супервизор (connectionSupervisor.ts): он держит не больше одного
 * подключения за раз и снимает всех слушателей, которых повесил.
 */
export const bleLink: BleLink = {
  async connect(deviceId) {
    const device = await manager.connectToDevice(deviceId, { timeout: CONNECT_TIMEOUT_MS });
    try {
      await device.discoverAllServicesAndCharacteristics();
    } catch (error) {
      // Не оставляем полуоткрытую связь: следующий connectToDevice() отменил бы её
      // и выстрелил событием разрыва поверх повторной попытки.
      await manager.cancelDeviceConnection(deviceId).catch(() => {});
      throw error;
    }
  },

  async disconnect(deviceId) {
    // Заодно отменяет попытку подключения, которая ещё не завершилась.
    await manager.cancelDeviceConnection(deviceId).catch(() => {});
  },

  isConnected(deviceId) {
    return manager.isDeviceConnected(deviceId);
  },

  onDisconnected(deviceId, listener) {
    return manager.onDeviceDisconnected(deviceId, () => listener());
  },

  // «Этот ремень сейчас в эфире?» Экран сопряжения сканирует, чтобы перечислить
  // ремни, а здесь вопрос про один конкретный. Так цикл повторов не тратит 10 с
  // таймаута подключения на ремень, которого нет, и, что важнее, замечает момент,
  // когда он вернулся. connectToDevice этого не замечает никогда.
  waitForDevice(deviceId, timeoutMs) {
    // Сейчас сканирует экран сопряжения. Второе сканирование заменило бы его и
    // съело бы результаты ровно тогда, когда пользователь ищет ремень, поэтому
    // радио оставляем экрану, а эта попытка идёт вслепую.
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
      // Сканирование может упасть синхронно: тогда finish() уже отработал, а
      // останавливать ему было ещё нечего.
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

/** Заряд ремня в процентах. `null`, если ремень его не отдаёт или чтение не удалось. */
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

/**
 * Что ремень ответил про модель.
 * - `read`: прочитали; пустые поля пришли пустыми;
 * - `absent`: у ремня нет Device Information Service или характеристики модели.
 *   Сервис необязательный, у дешёвых датчиков его часто нет. Это окончательный ответ;
 * - `failed`: сбой или обрыв посреди чтения. Ответа нет, читать заново при следующем
 *   подключении.
 */
export type DeviceInfoResult =
  | { kind: 'read'; manufacturer: string | null; model: string | null }
  | { kind: 'absent' }
  | { kind: 'failed' };

/** Читает строковую характеристику Device Information Service. Пустое значение даёт `null`, сбой бросает. */
async function readText(deviceId: string, characteristicUuid: string): Promise<string | null> {
  const characteristic = await manager.readCharacteristicForDevice(
    deviceId,
    DEVICE_INFO_SERVICE_UUID,
    characteristicUuid,
  );
  const text = characteristic.value ? bytesToText(base64ToBytes(characteristic.value)) : '';
  return text || null;
}

/**
 * Производитель и модель из Device Information Service.
 *
 * Есть ли у ремня сервис и характеристики, видно по списку, обнаруженному при
 * подключении: это локальный кэш ble-plx, по радио при этом ничего не идёт. Поэтому
 * «модели нет» отличается от сбоя чтения, и сбой не записывается как окончательный
 * ответ. Чтения идут по очереди, чтобы на ремень шёл один запрос за раз.
 */
export async function readDeviceInfo(deviceId: string): Promise<DeviceInfoResult> {
  try {
    const services = await manager.servicesForDevice(deviceId);
    if (!services.some((s) => s.uuid.toLowerCase() === DEVICE_INFO_SERVICE_UUID)) return { kind: 'absent' };
    const characteristics = await manager.characteristicsForDevice(deviceId, DEVICE_INFO_SERVICE_UUID);
    const has = (uuid: string) => characteristics.some((c) => c.uuid.toLowerCase() === uuid);
    if (!has(MODEL_NUMBER_UUID)) return { kind: 'absent' };

    const manufacturer = has(MANUFACTURER_NAME_UUID) ? await readText(deviceId, MANUFACTURER_NAME_UUID) : null;
    const model = await readText(deviceId, MODEL_NUMBER_UUID);
    return { kind: 'read', manufacturer, model };
  } catch {
    return { kind: 'failed' };
  }
}

/** Отключает ремень, если он подключён. Сейчас нигде не используется: связью управляет супервизор. */
export async function disconnectDevice(deviceId: string): Promise<void> {
  const isConnected = await manager.isDeviceConnected(deviceId).catch(() => false);
  if (isConnected) {
    await manager.cancelDeviceConnection(deviceId);
  }
}

/** Уничтожает BleManager. Сейчас нигде не используется. */
export function destroyBleManager(): void {
  manager.destroy();
}
