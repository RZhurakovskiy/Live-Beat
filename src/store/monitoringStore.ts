import { create } from 'zustand';
import { logBle } from '../ble/bleLog';
import { createMonitoringSession, finalizeMonitoringSession, insertMonitoringMinute } from '../db/database';
import { generateId } from '../utils/id';
import { minuteHrv } from '../utils/hrv';

export type MonitoringStatus = 'idle' | 'active' | 'paused';

function minuteStart(ts: number): number {
  return Math.floor(ts / 60000) * 60000;
}

let bufferMinuteTs = 0;
let bufferSamples: number[] = [];
let bufferFirstAt = 0;
let bufferLastAt = 0;
// RR-intervals of the current minute, split into uninterrupted beat runs.
let bufferRr: number[][] = [[]];

function resetBuffers(): void {
  bufferSamples = [];
  bufferRr = [[]];
}

// Time the buffered packets stand for. The first packet's intervals cover the
// time before it arrived, so one average packet interval is added on top.
function bufferElapsedMs(packets: number, firstAt: number, lastAt: number): number {
  if (packets < 2) return 0;
  const span = lastAt - firstAt;
  return span + span / (packets - 1);
}

async function flushBuffer(): Promise<void> {
  if (bufferSamples.length === 0) return;
  const samples = bufferSamples;
  const segments = bufferRr;
  const minuteTs = bufferMinuteTs;
  const elapsedMs = bufferElapsedMs(samples.length, bufferFirstAt, bufferLastAt);
  resetBuffers();

  const sum = samples.reduce((a, b) => a + b, 0);
  const avgBpm = Math.round(sum / samples.length);
  const rrCount = segments.reduce((total, segment) => total + segment.length, 0);
  const { hrvMs: hrv, coverage } = minuteHrv(segments, elapsedMs);
  const coveragePct = Math.round(coverage * 100);
  useMonitoringStore.setState({ lastHrvMs: hrv, lastRrCoveragePct: coveragePct });

  // The numbers needed to tell a real HRV reading from a sensor artefact:
  // rrCount should track avgBpm (one interval per beat), and the intervals
  // should add up to the elapsed time (coverage ~100%).
  logBle(
    `minute: ${avgBpm} bpm, ${samples.length} packets, ${rrCount} rr in ${segments.length} runs, ` +
      `coverage ${coveragePct}%, hrv ${hrv ?? '—'}`,
  );

  try {
    await insertMonitoringMinute({
      minuteTs,
      avgBpm,
      minBpm: Math.min(...samples),
      maxBpm: Math.max(...samples),
      sampleCount: samples.length,
      avgHrvMs: hrv,
      rrCount,
    });
  } catch {
    // never let a persistence hiccup break live monitoring
  }
}

interface MonitoringState {
  status: MonitoringStatus;
  startedAt: number | null;
  sessionId: string | null;
  currentBpm: number | null;
  lastHrvMs: number | null; // RMSSD of the last completed minute
  // Share of the last minute's time covered by received RR-intervals. Below
  // MIN_RR_COVERAGE the strap skipped beats and lastHrvMs stays null.
  lastRrCoveragePct: number | null;

  onSample: (bpm: number, rr: number[]) => void;
  // The beat stream was interrupted: the next interval is not the successor of
  // the last one, so it must start a new run for the RMSSD calculation.
  markRrGap: () => void;
  // No valid reading right now (link lost / no skin contact): show "--".
  clearLiveBpm: () => void;
  // Persist the buffered minute once it's over, even if no newer sample comes
  // along to trigger it (strap off the body, link down, app about to be killed).
  flushIfMinuteEnded: () => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<void>;
}

export const useMonitoringStore = create<MonitoringState>((set, get) => ({
  status: 'idle',
  startedAt: null,
  sessionId: null,
  currentBpm: null,
  lastHrvMs: null,
  lastRrCoveragePct: null,

  onSample: (bpm, rr) => {
    const { status } = get();
    if (status === 'idle') return;
    set({ currentBpm: bpm });
    if (status !== 'active') return;

    const now = Date.now();
    const m = minuteStart(now);
    if (bufferSamples.length > 0 && m !== bufferMinuteTs) {
      flushBuffer();
    }
    if (bufferSamples.length === 0) {
      bufferMinuteTs = m;
      bufferFirstAt = now;
    }
    bufferLastAt = now;
    bufferSamples.push(bpm);
    if (rr.length > 0) bufferRr[bufferRr.length - 1].push(...rr);
  },

  markRrGap: () => {
    if (bufferRr[bufferRr.length - 1].length > 0) bufferRr.push([]);
  },

  clearLiveBpm: () => {
    if (get().currentBpm !== null) set({ currentBpm: null });
  },

  flushIfMinuteEnded: () => {
    if (bufferSamples.length > 0 && minuteStart(Date.now()) !== bufferMinuteTs) {
      flushBuffer();
    }
  },

  start: () => {
    resetBuffers();
    bufferMinuteTs = minuteStart(Date.now());
    const id = generateId();
    const startedAt = Date.now();
    set({ status: 'active', startedAt, sessionId: id, lastHrvMs: null, lastRrCoveragePct: null });
    createMonitoringSession(id, startedAt).catch(() => {});
  },

  pause: () => {
    flushBuffer();
    set({ status: 'paused' });
  },

  resume: () => {
    resetBuffers();
    bufferMinuteTs = minuteStart(Date.now());
    set({ status: 'active', lastHrvMs: null, lastRrCoveragePct: null });
  },

  stop: async () => {
    await flushBuffer();
    const { sessionId } = get();
    if (sessionId) {
      await finalizeMonitoringSession(sessionId, Date.now()).catch(() => {});
    }
    set({
      status: 'idle',
      startedAt: null,
      sessionId: null,
      currentBpm: null,
      lastHrvMs: null,
      lastRrCoveragePct: null,
    });
  },
}));
