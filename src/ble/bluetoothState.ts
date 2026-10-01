// Готовность Bluetooth к работе, как её видит приложение. Чистый модуль без React Native,
// чтобы гонять в Jest. Разрешение на Bluetooth и включённый адаптер это разные вещи: можно
// выдать приложению все разрешения и всё равно держать Bluetooth выключенным в шторке, а
// включить его за пользователя Android обычному приложению с 12-й версии не даёт.

/**
 * - `ready`: адаптер включён;
 * - `off`: адаптер выключен, пользователю нужно его включить;
 * - `unauthorized`: у приложения нет разрешения (выдаётся в настройках приложения);
 * - `unsupported`: Bluetooth LE на устройстве нет;
 * - `unknown`: состояние ещё определяется (адаптер перезапускается или система не ответила).
 */
export type BluetoothReadiness = 'ready' | 'off' | 'unauthorized' | 'unsupported' | 'unknown';

/**
 * Состояние адаптера из `react-native-ble-plx` (его `State`, строка) в готовность. Передаётся
 * строкой, а не enum библиотеки, чтобы модуль не тянул её в тесты.
 */
export function readinessFromBleState(state: string): BluetoothReadiness {
  switch (state) {
    case 'PoweredOn':
      return 'ready';
    case 'PoweredOff':
      return 'off';
    case 'Unauthorized':
      return 'unauthorized';
    case 'Unsupported':
      return 'unsupported';
    // `Resetting` это миг между выключением и включением: показывать «выключен» на нём значило
    // бы мигать сообщением, поэтому он считается неопределённым.
    default:
      return 'unknown';
  }
}

/** Подпись на главной, пока Bluetooth выключен. */
export const BLUETOOTH_OFF_FOOTER = 'Bluetooth выключен - нажмите, чтобы включить';
