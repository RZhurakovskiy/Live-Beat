import type { HrRecovery, HrSample } from '../types';

// Пульс восстановления: насколько пульс упал за минуту после конца нагрузки. Чистый
// модуль без React Native, чтобы гонять в Jest.
//
// Отсчёт идёт от начала последней паузы, а не от «Завершить»: тренировку заканчивают
// только с паузы (оверлей «Продолжить / Завершить»), и нагрузка кончается в тот момент,
// когда человек остановился и поставил паузу. Пока он решает, что нажать, пульс уже
// падает, и эти секунды тоже часть минуты восстановления.

/** Длина измерения. */
export const RECOVERY_WINDOW_MS = 60_000;
/** Пульс «в конце» и «через минуту» усредняется по окну такой ширины, чтобы один выброс не решал. */
export const RECOVERY_AVG_MS = 5_000;
/** Если к этому моменту нет показаний около отметки в минуту, измерить не вышло (ремень сняли, связь пропала). */
export const RECOVERY_GIVE_UP_MS = 75_000;

/**
 * Замер восстановления: начало (момент паузы), пульс в конце нагрузки и показания
 * ремня после неё. Живёт в сторе, пока тренировка на паузе и пока открыты итоги.
 */
export interface RecoveryProbe {
  startedAt: number;
  /** Средний пульс последних секунд перед паузой или `null`, если их не было. */
  fromBpm: number | null;
  samples: HrSample[];
}

/** Что показать на экране итогов. */
export type RecoveryState =
  | { state: 'measuring'; remainingSec: number; currentBpm: number | null }
  | { state: 'done'; recovery: HrRecovery }
  | { state: 'unavailable' };

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Средний пульс последних секунд тренировки перед `at`: исходная точка замера. */
export function bpmBefore(samples: HrSample[], at: number): number | null {
  return average(samples.filter((s) => s.t <= at && s.t > at - RECOVERY_AVG_MS).map((s) => s.bpm));
}

/** Состояние замера на момент `now`. */
export function recoveryState(probe: RecoveryProbe, now: number): RecoveryState {
  if (probe.fromBpm === null) return { state: 'unavailable' };

  const mark = probe.startedAt + RECOVERY_WINDOW_MS;
  if (now < mark) {
    const last = probe.samples[probe.samples.length - 1];
    return {
      state: 'measuring',
      remainingSec: Math.ceil((mark - now) / 1000),
      currentBpm: last && now - last.t < RECOVERY_AVG_MS ? last.bpm : null,
    };
  }

  // Пульс «через минуту»: среднее по окну около отметки, а если в окне пусто, ближайшее
  // показание в пределах запаса.
  const inWindow = probe.samples.filter((s) => Math.abs(s.t - mark) <= RECOVERY_AVG_MS / 2).map((s) => s.bpm);
  let toBpm = average(inWindow);
  if (toBpm === null) {
    const near = probe.samples
      .filter((s) => s.t >= mark - RECOVERY_AVG_MS && s.t <= probe.startedAt + RECOVERY_GIVE_UP_MS)
      .sort((a, b) => Math.abs(a.t - mark) - Math.abs(b.t - mark))[0];
    toBpm = near ? near.bpm : null;
  }

  if (toBpm === null) {
    // Показаний около отметки пока нет: подождём до предела, дальше сдаёмся.
    if (now < probe.startedAt + RECOVERY_GIVE_UP_MS) {
      return { state: 'measuring', remainingSec: 0, currentBpm: null };
    }
    return { state: 'unavailable' };
  }
  return { state: 'done', recovery: { fromBpm: probe.fromBpm, toBpm } };
}

/** Показания старше предела замеру уже не нужны, в пробу их не пишем. */
export function probeAccepts(probe: RecoveryProbe, t: number): boolean {
  return t >= probe.startedAt && t <= probe.startedAt + RECOVERY_GIVE_UP_MS;
}
