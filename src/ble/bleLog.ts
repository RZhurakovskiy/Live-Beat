// Журнал датчика в памяти. У релизной сборки нет Metro-консоли, так что это
// единственный способ посмотреть события подключения и контакта прямо с телефона.
// Модуль отдельный и без импортов React Native: писать в него может любой слой, и
// слоям не приходится импортировать друг друга.

const LOG_LIMIT = 500;

/** Одна запись журнала: порядковый номер, время и текст события. */
export interface BleLogEntry {
  id: number;
  ts: number;
  message: string;
}

let nextId = 1;
let entries: BleLogEntry[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Пишет событие в журнал и в консоль. Если передана ошибка, её текст дописывается к событию. */
export function logBle(message: string, error?: unknown): void {
  const detail = error instanceof Error ? `: ${error.message}` : error ? `: ${String(error)}` : '';
  // Каждый раз новый массив: экран журнала подписан через useSyncExternalStore,
  // а он перерисовывает только при смене ссылки.
  entries = [...entries, { id: nextId++, ts: Date.now(), message: `${message}${detail}` }];
  if (entries.length > LOG_LIMIT) entries = entries.slice(entries.length - LOG_LIMIT);
  console.log(`[ble] ${message}${detail}`);
  notify();
}

/** Текущие записи, от старых к новым. Ссылка меняется при каждом изменении журнала. */
export function getBleLogEntries(): BleLogEntry[] {
  return entries;
}

/** Запись одной строкой: время по-русски и текст события. */
export function formatBleLogEntry(entry: BleLogEntry): string {
  return `${new Date(entry.ts).toLocaleTimeString('ru-RU')} ${entry.message}`;
}

/** Весь журнал текстом, для кнопки «Поделиться» на экране журнала. */
export function getBleLog(): string {
  return entries.length > 0 ? entries.map(formatBleLogEntry).join('\n') : 'Журнал пуст';
}

/** Очищает журнал. */
export function clearBleLog(): void {
  entries = [];
  notify();
}

/** Подписка на изменения журнала. Возвращает функцию отписки. */
export function subscribeBleLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
