// In-memory diagnostics log. Release builds have no Metro console, so this is
// the only way to read connection and RR events from the phone. Kept in its own
// module (no RN imports) so any layer that wants to record an event can
// write to it without importing each other.

const LOG_LIMIT = 500;

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

export function logBle(message: string, error?: unknown): void {
  const detail = error instanceof Error ? `: ${error.message}` : error ? `: ${String(error)}` : '';
  // A new array every time: the log screen subscribes through
  // useSyncExternalStore, which only re-renders when the reference changes.
  entries = [...entries, { id: nextId++, ts: Date.now(), message: `${message}${detail}` }];
  if (entries.length > LOG_LIMIT) entries = entries.slice(entries.length - LOG_LIMIT);
  console.log(`[ble] ${message}${detail}`);
  notify();
}

export function getBleLogEntries(): BleLogEntry[] {
  return entries;
}

export function formatBleLogEntry(entry: BleLogEntry): string {
  return `${new Date(entry.ts).toLocaleTimeString('ru-RU')} ${entry.message}`;
}

export function getBleLog(): string {
  return entries.length > 0 ? entries.map(formatBleLogEntry).join('\n') : 'Журнал пуст';
}

export function clearBleLog(): void {
  entries = [];
  notify();
}

export function subscribeBleLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
