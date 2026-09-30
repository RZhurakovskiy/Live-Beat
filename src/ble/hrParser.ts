/**
 * Биты Sensor Contact из флагов Heart Rate Measurement (биты 1-2): `detected` или
 * `lost`, когда ремень сообщает о контакте с кожей, `unsupported`, когда он этого
 * не умеет. Тогда контакт приходится выводить из самих данных (см. contactDetector.ts).
 */
export type SensorContact = 'detected' | 'lost' | 'unsupported';

/** Разобранный пакет пульса. */
export interface HeartRateSample {
  bpm: number;
  rr: number[]; // RR-интервалы в мс, пусто, если ремень их не шлёт
  contact: SensorContact;
}

/** Значение характеристики из ble-plx (строка base64) в байты. Посторонние символы пропускаются. */
export function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = chars.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/**
 * Разбирает пакет Heart Rate Measurement (0x2A37). Байт 0 это флаги:
 * - бит 0: формат пульса (0 = uint8, 1 = uint16);
 * - бит 1: Sensor Contact Status (1 = контакт есть), смысл имеет, только если выставлен бит 2;
 * - бит 2: Sensor Contact Support (1 = ремень сообщает о контакте);
 * - бит 3: есть поле Energy Expended (uint16);
 * - бит 4: есть один или несколько RR-интервалов (по uint16, в единицах 1/1024 с).
 */
export function parseHeartRateMeasurement(base64Value: string): HeartRateSample {
  const bytes = base64ToBytes(base64Value);
  const flags = bytes[0];

  const contactSupported = (flags & 0x04) !== 0;
  const contactDetected = (flags & 0x02) !== 0;
  const contact: SensorContact = contactSupported ? (contactDetected ? 'detected' : 'lost') : 'unsupported';

  const minLength = (flags & 0x01) === 1 ? 3 : 2;
  if (bytes.length < minLength) {
    // Обрезанный пакет: отдаём «нет показаний», а не неопределённый пульс.
    return { bpm: 0, rr: [], contact };
  }

  let offset: number;
  let bpm: number;
  if ((flags & 0x01) === 1) {
    bpm = bytes[1] | (bytes[2] << 8);
    offset = 3;
  } else {
    bpm = bytes[1];
    offset = 2;
  }

  if ((flags & 0x08) !== 0) {
    offset += 2; // есть поле Energy Expended, пропускаем
  }

  const rr: number[] = [];
  if ((flags & 0x10) !== 0) {
    for (let i = offset; i + 1 < bytes.length; i += 2) {
      const raw = bytes[i] | (bytes[i + 1] << 8);
      rr.push(Math.round((raw / 1024) * 1000));
    }
  }

  return { bpm, rr, contact };
}
