import { saveKnownDevice } from '../db/database';
import { useMonitoringStore } from '../store/monitoringStore';
import { useSessionStore } from '../store/sessionStore';
import { logBle } from './bleLog';
import { ConnectionSupervisor, createConnectionSupervisor, LinkTarget } from './connectionSupervisor';
import { ContactDetector, createContactDetector } from './contactDetector';
import { bleLink, readBatteryLevel } from './heartRate';
import { parseHeartRateMeasurement, type SensorContact } from './hrParser';
import { createRrDeduper } from './rrStream';

const MIN_VALID_BPM = 20;

function isSensorNeeded(): boolean {
  return useSessionStore.getState().activeWorkout !== null || useMonitoringStore.getState().status !== 'idle';
}

// Contact knowledge (does this strap send RR / report contact) is per sensor.
let contactDetector: ContactDetector = createContactDetector({ minValidBpm: MIN_VALID_BPM });
let contactDeviceId: string | null = null;

// Strips RR-intervals the strap re-sends, so they can't flatten RMSSD.
const rrDeduper = createRrDeduper();

// How many RR-carrying packets between two RR-quality lines in the log.
const RR_REPORT_EVERY = 60;
const RR_SAMPLE_SIZE = 8;
let rrPackets = 0;
let rrRecent: number[] = [];
// New intervals that equal 60000 / displayed BPM (±1 bpm). Real beat-to-beat
// data hits that only now and then; an interval derived from the averaged
// pulse hits it every time.
let rrFromBpm = 0;

function reportRrQuality(bpm: number, fresh: number[], contact: SensorContact): void {
  rrPackets += 1;
  for (const rr of fresh) {
    if (Math.abs(Math.round(60000 / rr) - bpm) <= 1) rrFromBpm += 1;
  }
  rrRecent = [...rrRecent, ...fresh].slice(-RR_SAMPLE_SIZE);
  if (rrPackets < RR_REPORT_EVERY) return;

  const { accepted, dropped } = rrDeduper.stats();
  logBle(
    `rr: ${accepted} new, ${dropped} repeats over ${rrPackets} packets at ~${bpm} bpm, ` +
      `${rrFromBpm}/${accepted} = 60000/bpm, contact ${contact}, last [${rrRecent.join(' ')}]`,
  );
  rrDeduper.resetStats();
  rrPackets = 0;
  rrFromBpm = 0;
}

// The beat chain is broken (no contact, link down): whatever comes next is not
// the successor of the last interval, so neither the deduper nor the HRV
// calculation may pair them up.
function breakRrStream(): void {
  rrDeduper.reset();
  useMonitoringStore.getState().markRrGap();
}

function clearLiveReadings(): void {
  useMonitoringStore.getState().clearLiveBpm();
  useSessionStore.getState().clearCurrentBpm();
}

function handleMeasurement(value: string): void {
  const sample = parseHeartRateMeasurement(value);
  const verdict = contactDetector.push(sample, Date.now());

  const session = useSessionStore.getState();
  const contact = verdict.hasContact ? 'ok' : 'lost';
  if (session.sensorContact !== contact) {
    logBle(verdict.hasContact ? 'skin contact ok' : `no skin contact (${verdict.reason})`);
    session.setSensorContact(contact);
  }

  if (!verdict.hasContact) {
    // The strap is not on the skin (or reads nothing): what it sends now is a
    // frozen or empty value, so keep it out of the live view and the records.
    // The dropped packet also breaks the beat chain, so the next interval must
    // not be diffed against one from before the gap.
    breakRrStream();
    clearLiveReadings();
    return;
  }

  const rr = rrDeduper.push(sample.rr);
  if (sample.rr.length > 0) reportRrQuality(sample.bpm, rr, sample.contact);

  session.addHrSample(sample.bpm);
  useMonitoringStore.getState().onSample(sample.bpm, rr);
}

function createSupervisor(): ConnectionSupervisor {
  return createConnectionSupervisor(bleLink, {
    onStatus: (status) => {
      logBle(`status: ${status}`);
      useSessionStore.getState().setConnectionStatus(status);
    },

    onConnected: (target) => {
      if (contactDeviceId !== target.id) {
        contactDetector = createContactDetector({ minValidBpm: MIN_VALID_BPM });
        contactDeviceId = target.id;
      }
      contactDetector.onConnected(Date.now());

      const store = useSessionStore.getState();
      store.setSensorContact('unknown');
      store.setConnectedDevice(target);
      store.setLastKnownDevice(target);
      saveKnownDevice(target).catch(() => {});
      // A weak coin cell shows up as dropped beats and flaky contact long
      // before the strap stops working, so the level goes into the log.
      readBatteryLevel(target.id).then((level) => {
        logBle(level != null ? `battery: ${level}%` : 'battery: not reported');
      });
    },

    onLinkDown: () => {
      const store = useSessionStore.getState();
      store.setConnectedDevice(null);
      store.setSensorContact('unknown');
      breakRrStream();
      clearLiveReadings();
    },

    onValue: handleMeasurement,
    shouldReconnect: isSensorNeeded,
    log: logBle,
  });
}

// One supervisor per JS runtime. On a Fast Refresh the previous instance still
// owns listeners on the shared BleManager, so retire it and pick its device up.
const supervisorRef = globalThis as unknown as { __hrSupervisor?: ConnectionSupervisor };
const previousSupervisor = supervisorRef.__hrSupervisor;
const resumeTarget: LinkTarget | null = previousSupervisor?.isConnected() ? previousSupervisor.getTarget() : null;
previousSupervisor?.dispose();
const supervisor = createSupervisor();
supervisorRef.__hrSupervisor = supervisor;
if (resumeTarget) supervisor.connect(resumeTarget).catch(() => {});

// Connects to the strap (or joins a connection already in progress). A no-op
// when that strap is already connected. Rejects if the attempt fails; while a
// workout or monitoring is running the reconnect loop keeps trying regardless.
export function connectAndSubscribe(deviceId: string, deviceName: string): Promise<void> {
  return supervisor.connect({ id: deviceId, name: deviceName });
}

// "Try again now" from the UI: skips the backoff wait of the reconnect loop.
export function retryConnectionNow(): void {
  const device = useSessionStore.getState().lastKnownDevice;
  if (!device) return;
  logBle('manual retry');
  supervisor.connect(device).catch(() => {});
}

// Catches "silent" BLE drops where Android never reports a disconnect: if a
// connected strap has sent nothing for staleMs, force one reconnect cycle.
export function recoverIfStale(staleMs: number): Promise<void> {
  return supervisor.checkStale(staleMs);
}
