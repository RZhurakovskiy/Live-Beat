// Форма маршрута и линия пульса в координатах рисунка. Нужна карточке тренировки: она рисует
// маршрут линией без карты, поэтому не зависит от тайлов и сети, а снимок получается один и
// тот же везде. Чистый модуль без React Native, чтобы гонять в Jest.

/** Точка на рисунке. */
export interface Pt {
  x: number;
  y: number;
}

/** Широта и долгота. */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Не больше `max` элементов, равномерно, с первым и последним. Маршрут в полсотни километров
 * это тысячи точек, а на рисунке в пару сотен пикселей их больше не видно, зато они тормозят
 * отрисовку.
 */
export function downsample<T>(items: T[], max: number): T[] {
  if (items.length <= max || max < 2) return items.length <= max ? items : items.slice(0, max);
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
  return out;
}

/**
 * Маршрут в рамку `width` на `height` с полем `padding` со всех сторон. Пропорции сохраняются:
 * долгота сжимается на косинус широты, иначе на севере маршрут был бы растянут вширь. Маршрут
 * стоит по центру. Точка или маршрут на месте (все точки совпали) ложатся в центр.
 */
export function projectRoute(points: LatLng[], width: number, height: number, padding: number): Pt[] {
  if (points.length === 0) return [];
  const meanLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const kx = Math.cos((meanLat * Math.PI) / 180);

  const raw = points.map((p) => ({ x: p.lng * kx, y: -p.lat }));
  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);
  if (spanX === 0 && spanY === 0) return points.map(() => ({ x: width / 2, y: height / 2 }));

  const scale = Math.min(spanX > 0 ? innerW / spanX : Infinity, spanY > 0 ? innerH / spanY : Infinity);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  return raw.map((p) => ({ x: offsetX + (p.x - minX) * scale, y: offsetY + (p.y - minY) * scale }));
}

/**
 * Линия значений (пульс) в рамку: по x равномерно, по y от минимума до максимума, больший
 * пульс выше. Постоянный ряд идёт ровно посередине.
 */
export function sparkline(values: number[], width: number, height: number, padding: number): Pt[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const innerH = Math.max(0, height - padding * 2);
  return values.map((v, i) => ({
    x: values.length === 1 ? width / 2 : padding + (i / (values.length - 1)) * Math.max(0, width - padding * 2),
    y: range === 0 ? height / 2 : padding + (1 - (v - min) / range) * innerH,
  }));
}

/** Точки в строку пути SVG: `M x y L x y …`. Пустой список даёт пустую строку. */
export function toPath(points: Pt[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}
