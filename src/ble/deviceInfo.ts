// Имя датчика для показа. Чистые функции без BLE, чтобы их можно было проверить тестами.

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const HAS_LETTER = /[A-Za-zА-Яа-яЁё]/;

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
}

// Длина UTF-8 последовательности по первому байту. 0 значит, что с этого байта
// символ начаться не может: это продолжение без начала или байт, которого в UTF-8 нет.
function sequenceLength(first: number): number {
  if (first < 0x80) return 1;
  if (first >= 0xc2 && first < 0xe0) return 2;
  if (first >= 0xe0 && first < 0xf0) return 3;
  if (first >= 0xf0 && first < 0xf5) return 4;
  return 0;
}

// Биты кода в первом байте последовательности длиной 1..4.
const LEAD_BITS = [0, 0x7f, 0x1f, 0x0f, 0x07];

/**
 * Строка из GATT-характеристики: байты UTF-8 в текст. Нулевые байты, которыми
 * некоторые датчики добивают поле до фиксированной длины, и управляющие символы
 * отбрасываются. Битая последовательность превращается в «�», а не роняет чтение.
 *
 * Свой декодер, а не TextDecoder: в Hermes его может не быть, а строки тут короткие.
 */
export function bytesToText(bytes: Uint8Array): string {
  let text = '';
  let i = 0;
  while (i < bytes.length) {
    const size = sequenceLength(bytes[i]);
    let code = bytes[i] & LEAD_BITS[size];
    let valid = size > 0 && i + size <= bytes.length;
    for (let k = 1; valid && k < size; k++) {
      const next = bytes[i + k];
      if ((next & 0xc0) !== 0x80) valid = false;
      else code = (code << 6) | (next & 0x3f);
    }
    if (valid) {
      text += String.fromCodePoint(code);
      i += size;
    } else {
      text += '�';
      i += 1;
    }
  }
  return clean(text);
}

/**
 * Название датчика из Device Information Service: производитель плюс модель,
 * например «Magene» и «H64» дают «Magene H64». Если модель уже начинается с
 * производителя, он не дублируется. Без модели `null`: одно имя производителя
 * ничем не лучше того, как ремень называет себя сам.
 */
export function deviceDisplayName(manufacturer: string | null, model: string | null): string | null {
  const maker = clean(manufacturer);
  const name = clean(model);
  if (!name) return null;
  if (!maker || name.toLowerCase().startsWith(maker.toLowerCase())) return name;
  return `${maker} ${name}`;
}

/**
 * Имя из эфира при сканировании. У ble-plx их два: `name` и `localName` из
 * рекламного пакета, и они бывают разными. Берётся то, где есть буквы: «H64» или
 * «Magene» читается лучше, чем голый серийный номер вроде «25643-209».
 */
export function pickAdvertisedName(name: string | null, localName: string | null): string | null {
  const candidates = [clean(name), clean(localName)].filter((value) => value.length > 0);
  return candidates.find((value) => HAS_LETTER.test(value)) ?? candidates[0] ?? null;
}
