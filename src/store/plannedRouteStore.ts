import { File } from 'expo-file-system';
import { create } from 'zustand';
import { getFlag, setFlag } from '../db/database';
import { decodePlannedRoute, parseGpx, PLANNED_ROUTE_FLAG, PlannedRoute } from '../utils/plannedRoute';

/** Итог загрузки файла: маршрут, отмена выбора или текст ошибки. */
export type LoadRouteResult = { ok: true; route: PlannedRoute } | { ok: false; canceled: true } | { ok: false; canceled: false; message: string };

interface PlannedRouteState {
  route: PlannedRoute | null;
  /** Маршрут уже прочитан из базы (даже если его там нет). */
  loaded: boolean;
  load: () => Promise<void>;
  /** Даёт выбрать GPX-файл и делает его текущим маршрутом. */
  pickFromFile: () => Promise<LoadRouteResult>;
  clear: () => Promise<void>;
}

/**
 * Стор загруженного маршрута: экран режима его выбирает, карта тренировки рисует
 * пунктиром. Маршрут один, хранится во флаге и живёт, пока его не уберут.
 */
export const usePlannedRouteStore = create<PlannedRouteState>((set) => ({
  route: null,
  loaded: false,

  load: async () => {
    const route = decodePlannedRoute(await getFlag(PLANNED_ROUTE_FLAG).catch(() => null));
    set({ route, loaded: true });
  },

  pickFromFile: async () => {
    // Любой тип: GPX из мессенджера приходит как application/octet-stream.
    const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
    if (picked.canceled) return { ok: false, canceled: true };
    let text: string;
    try {
      text = await picked.result.text();
    } catch {
      return { ok: false, canceled: false, message: 'Не удалось прочитать файл.' };
    }
    const fallback = (picked.result.name ?? 'Маршрут').replace(/\.gpx$/i, '');
    const route = parseGpx(text, fallback);
    if (!route) return { ok: false, canceled: false, message: 'В файле нет маршрута. Нужен GPX с треком.' };
    await setFlag(PLANNED_ROUTE_FLAG, JSON.stringify(route));
    set({ route });
    return { ok: true, route };
  },

  clear: async () => {
    await setFlag(PLANNED_ROUTE_FLAG, '');
    set({ route: null });
  },
}));
