import { haversineDistanceMeters } from './geo';

// Маршрут, загруженный из GPX-файла, чтобы бежать или ехать по нему: на карте тренировки
// он лежит пунктиром под записываемым треком. Пошаговой навигации нет, это решение
// (plans/roadmap.md, веха 7). Чистый модуль без React Native, чтобы гонять в Jest.

/** Ключ флага, под которым лежит загруженный маршрут. */
export const PLANNED_ROUTE_FLAG = 'planned_route';

/**
 * Предел точек. Экспорт из Strava или навигатора бывает на десятки тысяч точек, а для
 * линии на маленькой карте столько не нужно: лишнее только тормозит отрисовку.
 */
export const MAX_PLANNED_POINTS = 1500;

/** Точка маршрута без времени. */
export interface PlannedPoint {
  lat: number;
  lng: number;
}

/** Загруженный маршрут: название из файла и точки. */
export interface PlannedRoute {
  name: string;
  points: PlannedPoint[];
}

function attr(tag: string, name: string): number | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`).exec(tag);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? value : null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Точки маршрута из текста GPX: точки трека (`trkpt`), а если их нет, точки маршрута
 * (`rtept`). Разбор регулярными выражениями, без XML-парсера: в Hermes нет DOMParser, а
 * тащить библиотеку ради двух тегов незачем. `null`, если в файле нет ни одной
 * годной точки: значит, это не маршрут.
 */
export function parseGpx(xml: string, fallbackName: string): PlannedRoute | null {
  const collect = (tag: string) => {
    const out: PlannedPoint[] = [];
    const re = new RegExp(`<${tag}\\b[^>]*>`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const lat = attr(m[0], 'lat');
      const lng = attr(m[0], 'lon');
      if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) out.push({ lat, lng });
    }
    return out;
  };

  let points = collect('trkpt');
  if (points.length < 2) points = collect('rtept');
  if (points.length < 2) return null;

  const nameMatch = /<name>([\s\S]*?)<\/name>/.exec(xml);
  const name = nameMatch ? decodeEntities(nameMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '')).trim() : '';
  return { name: name || fallbackName, points: thinPoints(points, MAX_PLANNED_POINTS) };
}

/** Прореживает точки равномерно до `max`, сохраняя первую и последнюю. */
export function thinPoints(points: PlannedPoint[], max: number): PlannedPoint[] {
  if (points.length <= max) return points;
  const out: PlannedPoint[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

/** Длина маршрута в метрах. */
export function plannedDistanceMeters(route: PlannedRoute): number {
  let total = 0;
  for (let i = 1; i < route.points.length; i++) {
    total += haversineDistanceMeters({ ...route.points[i - 1], t: 0 }, { ...route.points[i], t: 0 });
  }
  return total;
}

/** Маршрут из флага или `null`, если его нет или он битый. */
export function decodePlannedRoute(json: string | null): PlannedRoute | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json);
    if (!raw || typeof raw.name !== 'string' || !Array.isArray(raw.points)) return null;
    const points = raw.points.filter(
      (p: unknown): p is PlannedPoint =>
        !!p &&
        typeof p === 'object' &&
        typeof (p as PlannedPoint).lat === 'number' &&
        typeof (p as PlannedPoint).lng === 'number',
    );
    return points.length >= 2 ? { name: raw.name, points } : null;
  } catch {
    return null;
  }
}
