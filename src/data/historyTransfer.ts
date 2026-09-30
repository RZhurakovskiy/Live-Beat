import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { insertSession, listSessionIds, listSessionsSince } from '../db/database';
import { useProfileStore } from '../store/profileStore';
import {
  buildHistoryFile,
  historyFileName,
  historyParseErrorText,
  parseHistoryFile,
  planImport,
} from '../utils/historyFile';

// Выгрузка и загрузка всей истории файлом. Формат и его проверка лежат в чистом
// `utils/historyFile.ts` с тестами, здесь только работа с файлами, базой и «Поделиться».

/** Итог выгрузки: сколько тренировок ушло в файл, или почему выгрузить не вышло. */
export type ExportResult = { ok: true; count: number } | { ok: false; message: string };

/**
 * Выгружает все тренировки и профиль в файл и открывает системное «Поделиться»: файл
 * можно отправить себе в мессенджер, сохранить на диск или в облако.
 */
export async function exportHistory(): Promise<ExportResult> {
  if (!(await Sharing.isAvailableAsync())) {
    return { ok: false, message: 'На этом телефоне недоступно «Поделиться».' };
  }
  const now = Date.now();
  const sessions = await listSessionsSince(0);
  const profile = useProfileStore.getState().profile;

  const file = new File(Paths.cache, historyFileName(now));
  file.create({ overwrite: true });
  file.write(buildHistoryFile(sessions, profile, now));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Сохранить историю' });
  return { ok: true, count: sessions.length };
}

/**
 * Итог загрузки. `canceled`: файл не выбрали, говорить ничего не надо.
 */
export type ImportResult =
  | { ok: true; added: number; duplicates: number; skipped: number; profileRestored: boolean }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; message: string };

/**
 * Даёт выбрать файл истории и добавляет из него тренировки. Уже известные пропускаются,
 * ничего существующего не перезаписывается. Профиль из файла берётся, только если
 * своего на телефоне ещё нет: иначе загрузка старого бэкапа молча откатила бы вес и
 * возраст, а с ними зоны всей истории.
 */
export async function importHistory(): Promise<ImportResult> {
  // Любой тип файла: мессенджеры и облака часто отдают JSON как
  // application/octet-stream, и фильтр по типу спрятал бы нужный файл. Что это
  // действительно файл истории, проверяет разбор.
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled) return { ok: false, canceled: true };

  let text: string;
  try {
    text = await picked.result.text();
  } catch {
    return { ok: false, canceled: false, message: 'Не удалось прочитать файл.' };
  }

  const parsed = parseHistoryFile(text);
  if (!parsed.ok) return { ok: false, canceled: false, message: historyParseErrorText(parsed.error) };

  const plan = planImport(await listSessionIds(), parsed.sessions);
  for (const session of plan.toInsert) {
    await insertSession(session);
  }

  const profileStore = useProfileStore.getState();
  const profileRestored = !profileStore.profile && parsed.profile !== null;
  if (profileRestored && parsed.profile) await profileStore.updateProfile(parsed.profile);

  return {
    ok: true,
    added: plan.toInsert.length,
    duplicates: plan.duplicates,
    skipped: parsed.skipped,
    profileRestored,
  };
}
