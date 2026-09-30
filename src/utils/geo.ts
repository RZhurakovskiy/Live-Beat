import { RoutePoint } from '../types';

const EARTH_RADIUS_METERS = 6371000;

/** Расстояние между двумя точками в метрах, по формуле гаверсинусов. */
export function haversineDistanceMeters(a: RoutePoint, b: RoutePoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/** Длина маршрута: сумма отрезков между соседними точками. */
export function totalRouteDistanceMeters(route: RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    total += haversineDistanceMeters(route[i - 1], route[i]);
  }
  return total;
}

/**
 * Темп в секундах на километр. Вызывающие передают время тренировки без пауз, но
 * с остановками вроде светофора: темп по общему времени это намеренно, так честно
 * для рекордов (field-fixes.md, п. 1). Без дистанции `undefined`.
 */
export function paceSecPerKm(distanceMeters: number, durationSec: number): number | undefined {
  if (distanceMeters <= 0) return undefined;
  return durationSec / (distanceMeters / 1000);
}
