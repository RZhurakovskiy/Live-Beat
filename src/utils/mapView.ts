// Чистая геометрия для карты маршрута: границы, в которые вписывается трек, и шаг зума. Без
// React Native, чтобы гонять в Jest; сама карта и жесты лежат в `components/RouteMap.tsx`.

/** Точка в градусах, подходит и `RoutePoint`, и точке загруженного маршрута. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Границы в порядке MapLibre: запад, юг, восток, север. */
export type Bounds = [west: number, south: number, east: number, north: number];

/** Зум, дальше которого кнопки не уходят: ниже карта бесполезна, выше тайлов нет. */
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;
/** Зум, с которого живая карта следит за бегуном: видно улицу и повороты. */
export const FOLLOW_ZOOM = 16;

/** Минимальная сторона границ в градусах (около 200 м): точку или короткий отрезок не приближаем до пикселей. */
const MIN_SPAN_DEG = 0.0018;

/**
 * Границы, в которые целиком вписывается трек (и загруженный маршрут, если он есть). Из одной
 * точки или очень короткого отрезка получается коробка минимального размера, иначе камера
 * приблизилась бы до размытых тайлов. Без точек `null`.
 */
export function routeBounds(...lists: Array<ReadonlyArray<LatLng> | undefined>): Bounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const list of lists) {
    for (const p of list ?? []) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      west = Math.min(west, p.lng);
      east = Math.max(east, p.lng);
      south = Math.min(south, p.lat);
      north = Math.max(north, p.lat);
    }
  }
  if (!Number.isFinite(west)) return null;

  const padX = Math.max(0, (MIN_SPAN_DEG - (east - west)) / 2);
  const padY = Math.max(0, (MIN_SPAN_DEG - (north - south)) / 2);
  return [west - padX, south - padY, east + padX, north + padY];
}

/**
 * Зум после нажатия «+» или «−» (`delta` обычно ±1), не выходя за пределы. Неизвестный текущий
 * зум (карта ещё не сообщила) считается стартовым.
 */
export function stepZoom(current: number | null, delta: number): number {
  const base = current !== null && Number.isFinite(current) ? current : FOLLOW_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, base + delta));
}
