import { create } from 'zustand';
import { getKnownDevice } from '../db/database';
import { HrSample, RoutePoint, WorkoutMode } from '../types';
import { resumedFrom } from '../workout/workoutTime';

export type BleConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// Whether the connected strap is actually reading a heart ('lost' = connected,
// but off the skin / sending a frozen value). 'unknown' until the first packet.
export type SensorContactStatus = 'unknown' | 'ok' | 'lost';

interface KnownDevice {
  id: string;
  name: string;
}

export interface TargetZoneRange {
  min: number;
  max: number;
}

export interface ActiveWorkout {
  mode: WorkoutMode;
  startedAt: number;
  hrSamples: HrSample[];
  route: RoutePoint[];
  currentBpm: number | null;
  targetZoneRange: TargetZoneRange | null;
  // Pause bookkeeping. Duration, calories and time in zones all exclude paused
  // time — see workout/workoutTime.ts.
  pausedMs: number;
  pausedAt: number | null;
}

interface SessionState {
  connectionStatus: BleConnectionStatus;
  sensorContact: SensorContactStatus;
  connectedDevice: KnownDevice | null;
  lastKnownDevice: KnownDevice | null;
  activeWorkout: ActiveWorkout | null;
  // Last good reading from the strap, workout or not. The setup checklist and
  // the mode screen show it to prove the sensor is really streaming;
  // activeWorkout.currentBpm stays the source of truth inside a workout.
  liveBpm: number | null;

  setConnectionStatus: (status: BleConnectionStatus) => void;
  setSensorContact: (contact: SensorContactStatus) => void;
  setConnectedDevice: (device: KnownDevice | null) => void;
  setLastKnownDevice: (device: KnownDevice) => void;
  loadLastKnownDevice: () => Promise<void>;

  startWorkout: (mode: WorkoutMode, targetZoneRange: TargetZoneRange | null) => void;
  // Bring back a workout that was running when the app was killed.
  restoreWorkout: (workout: Omit<ActiveWorkout, 'currentBpm'>) => void;
  pauseWorkout: () => void;
  resumeWorkout: () => void;
  addHrSample: (bpm: number) => void;
  clearCurrentBpm: () => void;
  appendRoutePoint: (point: RoutePoint) => void;
  endWorkout: () => ActiveWorkout | null;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  connectionStatus: 'disconnected',
  sensorContact: 'unknown',
  connectedDevice: null,
  lastKnownDevice: null,
  activeWorkout: null,
  liveBpm: null,

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setSensorContact: (contact) => set({ sensorContact: contact }),
  setConnectedDevice: (device) => set({ connectedDevice: device }),
  setLastKnownDevice: (device) => set({ lastKnownDevice: device }),
  loadLastKnownDevice: async () => {
    const device = await getKnownDevice();
    if (device) set({ lastKnownDevice: device });
  },

  startWorkout: (mode, targetZoneRange) =>
    set({
      activeWorkout: {
        mode,
        startedAt: Date.now(),
        hrSamples: [],
        route: [],
        currentBpm: null,
        targetZoneRange,
        pausedMs: 0,
        pausedAt: null,
      },
    }),

  restoreWorkout: (workout) => set({ activeWorkout: { ...workout, currentBpm: null } }),

  pauseWorkout: () => {
    const workout = get().activeWorkout;
    if (!workout || workout.pausedAt !== null) return;
    // currentBpm is dropped too: the number on screen must not look live while
    // nothing is being recorded.
    set({ activeWorkout: { ...workout, pausedAt: Date.now(), currentBpm: null } });
  },

  resumeWorkout: () => {
    const workout = get().activeWorkout;
    if (!workout || workout.pausedAt === null) return;
    set({ activeWorkout: { ...workout, ...resumedFrom(workout, Date.now()) } });
  },

  addHrSample: (bpm) => {
    // liveBpm tracks the strap regardless: the sensor is still streaming, it is
    // just not being recorded.
    set({ liveBpm: bpm });
    const workout = get().activeWorkout;
    if (!workout || workout.pausedAt !== null) return;
    set({
      activeWorkout: {
        ...workout,
        currentBpm: bpm,
        hrSamples: [...workout.hrSamples, { t: Date.now(), bpm }],
      },
    });
  },

  // Drop the live value (no contact / link lost) so the screen shows "--"
  // instead of the last reading frozen in place.
  clearCurrentBpm: () => {
    if (get().liveBpm !== null) set({ liveBpm: null });
    const workout = get().activeWorkout;
    if (!workout || workout.currentBpm === null) return;
    set({ activeWorkout: { ...workout, currentBpm: null } });
  },

  appendRoutePoint: (point) => {
    const workout = get().activeWorkout;
    // Location updates keep arriving while paused (the task stays registered),
    // but they must not extend the route.
    if (!workout || workout.pausedAt !== null) return;
    set({ activeWorkout: { ...workout, route: [...workout.route, point] } });
  },

  endWorkout: () => {
    const workout = get().activeWorkout;
    set({ activeWorkout: null });
    return workout;
  },
}));
