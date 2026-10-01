// Заряд нагрудного ремня для главного экрана. Чистый модуль без React Native, чтобы гонять
// в Jest. Ремни с батарейкой-таблеткой (CR2032, как у Magene H64) показывают процент грубо:
// долго «почти полно», потом быстро падает. Поэтому предупреждаем заранее и без драмы.

/** Ниже этого заряда ремню пора менять батарейку. */
export const LOW_BATTERY_PERCENT = 20;
/** Ниже этого ремень вот-вот начнёт терять удары и связь. */
export const CRITICAL_BATTERY_PERCENT = 10;

/** Как показывать заряд: `ok` спокойно, `low` жёлтым с подсказкой, `critical` красным. */
export type BatteryTone = 'ok' | 'low' | 'critical';

/** Что нарисовать на главной. */
export interface BatteryInfo {
  percent: number;
  tone: BatteryTone;
  /** Подсказка под строкой датчика; у `ok` её нет. */
  hint: string | null;
}

/**
 * Заряд в показ. `null`, если ремень заряд не отдал или отдал бессмыслицу (не число, ниже нуля
 * или выше ста): показывать тогда нечего, а выдумывать процент нельзя.
 */
export function batteryInfo(percent: number | null): BatteryInfo | null {
  if (percent === null || !Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  const value = Math.round(percent);
  if (value <= CRITICAL_BATTERY_PERCENT) {
    return { percent: value, tone: 'critical', hint: 'Батарейка датчика почти села: замените её до тренировки' };
  }
  if (value <= LOW_BATTERY_PERCENT) {
    return { percent: value, tone: 'low', hint: 'Батарейка датчика садится: скоро её пора заменить' };
  }
  return { percent: value, tone: 'ok', hint: null };
}
