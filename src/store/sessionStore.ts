import { create } from 'zustand';
import { getKnownDevice } from '../db/database';
import { HrSample, IntervalSettings, PauseInterval, RoutePoint, WorkoutMode, WorkoutSession } from '../types';
import type { RestTimer } from '../utils/intervals';
import { bpmBefore, probeAccepts, RecoveryProbe } from '../utils/recovery';
import { pausesUntil, resumedFrom } from '../workout/workoutTime';

/** Состояние связи с ремнём, то же, что у супервизора соединения. */
export type BleConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Читает ли подключённый ремень сердце на самом деле. `lost`: связь есть, но ремень
 * не на коже или шлёт застывшее значение. `unknown` до первого пакета.
 */
export type SensorContactStatus = 'unknown' | 'ok' | 'lost';

interface KnownDevice {
  id: string;
  name: string;
}

/** Целевая зона пульса, границы в ударах в минуту. */
export interface TargetZoneRange {
  min: number;
  max: number;
}

/** Идущая тренировка. Живёт в памяти, в базу попадает черновиком (см. workoutDraft.ts). */
export interface ActiveWorkout {
  mode: WorkoutMode;
  startedAt: number;
  hrSamples: HrSample[];
  route: RoutePoint[];
  currentBpm: number | null;
  targetZoneRange: TargetZoneRange | null;
  // Учёт пауз. Длительность, калории и время в зонах считаются без времени на
  // паузе, см. workout/workoutTime.ts.
  pausedMs: number;
  pausedAt: number | null;
  // Законченные паузы по отдельности, а не только их сумма: сплиты по километрам
  // вычитают паузу из того километра, на который она пришлась.
  pauses: PauseInterval[];
  /** Интервальный таймер (кроссфит) или `null`. Его часы это активное время тренировки. */
  interval: IntervalSettings | null;
  /**
   * Идущий отдых между подходами (зал) или `null`. В черновик не пишется: после выгрузки
   * приложения отдых, скорее всего, давно кончился.
   */
  restTimer: RestTimer | null;
}

interface SessionState {
  connectionStatus: BleConnectionStatus;
  sensorContact: SensorContactStatus;
  connectedDevice: KnownDevice | null;
  lastKnownDevice: KnownDevice | null;
  activeWorkout: ActiveWorkout | null;
  /**
   * Последнее хорошее показание ремня, в тренировке или без неё. Чек-лист настройки
   * и экран выбора режима показывают его как доказательство, что ремень правда
   * передаёт пульс. Внутри тренировки источник истины `activeWorkout.currentBpm`.
   */
  liveBpm: number | null;
  /**
   * Заряд ремня в процентах или `null`, если ещё не прочитан или ремень его не отдаёт.
   * Читается один раз через несколько секунд после подключения, главный экран показывает его
   * и предупреждает, когда батарейка садится.
   */
  batteryPercent: number | null;
  /**
   * Законченная тренировка, которая ждёт на экране итогов, сохранят её или
   * отбросят. Заполняется, только когда приложение перезапустилось в этом
   * состоянии: в обычном потоке сессия едет параметром навигации.
   */
  pendingSession: WorkoutSession | null;
  /**
   * Замер пульса восстановления. Начинается с паузой (нагрузка кончилась), сбрасывается,
   * если тренировку продолжили, и переживает «Завершить»: экран итогов дожидается конца
   * минуты и кладёт результат в сессию. См. utils/recovery.ts.
   */
  recoveryProbe: RecoveryProbe | null;

  setConnectionStatus: (status: BleConnectionStatus) => void;
  setSensorContact: (contact: SensorContactStatus) => void;
  setConnectedDevice: (device: KnownDevice | null) => void;
  setBatteryPercent: (percent: number | null) => void;
  setLastKnownDevice: (device: KnownDevice) => void;
  loadLastKnownDevice: () => Promise<void>;

  startWorkout: (mode: WorkoutMode, targetZoneRange: TargetZoneRange | null, interval?: IntervalSettings | null) => void;
  /** Возвращает тренировку, которая шла, когда приложение выгрузили. */
  restoreWorkout: (workout: Omit<ActiveWorkout, 'currentBpm' | 'restTimer'>) => void;
  /** Запускает отдых между подходами; повторный вызов начинает отдых заново. */
  startRest: (durationSec: number, activeMs: number) => void;
  stopRest: () => void;
  pauseWorkout: () => void;
  resumeWorkout: () => void;
  addHrSample: (bpm: number) => void;
  clearCurrentBpm: () => void;
  appendRoutePoint: (point: RoutePoint) => void;
  endWorkout: () => ActiveWorkout | null;
  setPendingSession: (session: WorkoutSession | null) => void;
  clearRecoveryProbe: () => void;
}

/**
 * Стор связи с ремнём и идущей тренировки. Используется и вне React: BLE-слой и
 * автосохранение черновика зовут `getState()` и `subscribe()` напрямую.
 */
export const useSessionStore = create<SessionState>((set, get) => ({
  connectionStatus: 'disconnected',
  sensorContact: 'unknown',
  connectedDevice: null,
  lastKnownDevice: null,
  activeWorkout: null,
  liveBpm: null,
  batteryPercent: null,
  pendingSession: null,
  recoveryProbe: null,

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setSensorContact: (contact) => set({ sensorContact: contact }),
  setConnectedDevice: (device) => set({ connectedDevice: device }),
  setBatteryPercent: (percent) => set({ batteryPercent: percent }),
  setLastKnownDevice: (device) => set({ lastKnownDevice: device }),
  loadLastKnownDevice: async () => {
    const device = await getKnownDevice();
    if (device) set({ lastKnownDevice: device });
  },

  startWorkout: (mode, targetZoneRange, interval = null) =>
    set({
      recoveryProbe: null,
      activeWorkout: {
        mode,
        startedAt: Date.now(),
        hrSamples: [],
        route: [],
        currentBpm: null,
        targetZoneRange,
        pausedMs: 0,
        pausedAt: null,
        pauses: [],
        interval,
        restTimer: null,
      },
    }),

  // Замер восстановления после выгрузки не продолжается: показаний за время, пока
  // приложения не было, нет.
  restoreWorkout: (workout) =>
    set({ activeWorkout: { ...workout, currentBpm: null, restTimer: null }, recoveryProbe: null }),

  startRest: (durationSec, activeMs) => {
    const workout = get().activeWorkout;
    if (!workout) return;
    set({ activeWorkout: { ...workout, restTimer: { startActiveMs: activeMs, durationSec } } });
  },

  stopRest: () => {
    const workout = get().activeWorkout;
    if (!workout || !workout.restTimer) return;
    set({ activeWorkout: { ...workout, restTimer: null } });
  },

  pauseWorkout: () => {
    const workout = get().activeWorkout;
    if (!workout || workout.pausedAt !== null) return;
    // currentBpm тоже сбрасывается: число на экране не должно выглядеть живым,
    // пока ничего не записывается.
    const now = Date.now();
    set({
      activeWorkout: { ...workout, pausedAt: now, currentBpm: null },
      recoveryProbe: { startedAt: now, fromBpm: bpmBefore(workout.hrSamples, now), samples: [] },
    });
  },

  resumeWorkout: () => {
    const workout = get().activeWorkout;
    if (!workout || workout.pausedAt === null) return;
    const now = Date.now();
    set({
      activeWorkout: {
        ...workout,
        ...resumedFrom(workout, now),
        pauses: pausesUntil(workout.pauses, workout.pausedAt, now),
      },
      recoveryProbe: null,
    });
  },

  addHrSample: (bpm) => {
    // liveBpm следит за ремнём в любом случае: на паузе ремень по-прежнему
    // передаёт пульс, просто он не записывается.
    set({ liveBpm: bpm });
    const now = Date.now();
    const probe = get().recoveryProbe;
    if (probe && probeAccepts(probe, now)) {
      set({ recoveryProbe: { ...probe, samples: [...probe.samples, { t: now, bpm }] } });
    }
    const workout = get().activeWorkout;
    if (!workout || workout.pausedAt !== null) return;
    set({
      activeWorkout: {
        ...workout,
        currentBpm: bpm,
        hrSamples: [...workout.hrSamples, { t: now, bpm }],
      },
    });
  },

  // Сбрасывает живое значение (нет контакта или связь пропала), чтобы на экране
  // было «--», а не застывшее последнее показание.
  clearCurrentBpm: () => {
    if (get().liveBpm !== null) set({ liveBpm: null });
    const workout = get().activeWorkout;
    if (!workout || workout.currentBpm === null) return;
    set({ activeWorkout: { ...workout, currentBpm: null } });
  },

  appendRoutePoint: (point) => {
    const workout = get().activeWorkout;
    // Точки продолжают приходить и на паузе (задача геолокации остаётся
    // зарегистрированной), но удлинять маршрут они не должны.
    if (!workout || workout.pausedAt !== null) return;
    set({ activeWorkout: { ...workout, route: [...workout.route, point] } });
  },

  endWorkout: () => {
    const workout = get().activeWorkout;
    set({ activeWorkout: null });
    return workout;
  },

  setPendingSession: (session) => set({ pendingSession: session }),
  clearRecoveryProbe: () => set({ recoveryProbe: null }),
}));
