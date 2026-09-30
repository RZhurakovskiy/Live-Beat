import { Gender } from '../types';

/**
 * Максимальный пульс по возрасту: для женщин формула Гулати (206 - 0.88 × возраст),
 * для мужчин классическая 220 - возраст.
 */
export function estimateMaxHr(age: number, gender: Gender): number {
  return Math.round(gender === 'female' ? 206 - 0.88 * age : 220 - age);
}

/** Зона пульса: номер, название, границы в процентах от максимального пульса и цвет. */
export interface HrZone {
  index: number;
  label: string;
  minPercent: number;
  maxPercent: number;
  color: string;
}

/**
 * Цвет пульса вне зон. С тех пор как зона 1 открыта снизу, живой пульс в неё попадает всегда,
 * и цвет остаётся страховкой для нулевого или испорченного значения.
 */
export const NO_ZONE_COLOR = '#6B6B76';

/**
 * Пять зон пульса от лёгкой к максимальной. Пятая сверху не ограничена, первая снизу тоже:
 * она начинается с 0%, как у Strava. Раньше зона 1 начиналась с 50%, и прогулка или йога
 * целиком уходили «ниже зоны 1», а карточка зон писала «мало данных»
 * (`plans/archive/field-fixes.md`, п. 20).
 */
export const ZONES: HrZone[] = [
  { index: 1, label: 'Разминка', minPercent: 0, maxPercent: 60, color: '#5AC8FA' },
  { index: 2, label: 'Жиросжигание', minPercent: 60, maxPercent: 70, color: '#3DDC97' },
  { index: 3, label: 'Выносливость', minPercent: 70, maxPercent: 80, color: '#FFD166' },
  { index: 4, label: 'Силовая выносливость', minPercent: 80, maxPercent: 90, color: '#FF8A3D' },
  { index: 5, label: 'Максимальная', minPercent: 90, maxPercent: Infinity, color: '#FF3B5C' },
];

/** Зона пульса и процент от максимального. Для пульса 0 и меньше `zone` равна `null`. */
export interface HrZoneResult {
  zone: HrZone | null;
  percent: number;
}

/** Определяет зону для пульса при данном максимальном пульсе. */
export function getHrZone(bpm: number, maxHr: number): HrZoneResult {
  const percent = (bpm / maxHr) * 100;
  // Зона 1 начинается с 0%, так что вне зон остаётся только нулевой или отрицательный пульс:
  // это не показание сердца, а сбой, и зоны ему приписывать нельзя.
  if (!(percent > ZONES[0].minPercent)) return { zone: null, percent };
  const zone = ZONES.find((z) => percent < z.maxPercent) ?? ZONES[ZONES.length - 1];
  return { zone, percent };
}
