import { saveKnownDevice } from '../db/database';
import { useSessionStore } from '../store/sessionStore';
import { logBle } from './bleLog';
import { ConnectionSupervisor, createConnectionSupervisor, LinkTarget } from './connectionSupervisor';
import { ContactDetector, createContactDetector } from './contactDetector';
import { bleLink, readBatteryLevel } from './heartRate';
import { parseHeartRateMeasurement } from './hrParser';

const MIN_VALID_BPM = 20;

// Only a running workout needs the strap; outside one the reconnect loop stops
// so a strap left in a drawer can't keep the radio busy.
function isSensorNeeded(): boolean {
  return useSessionStore.getState().activeWorkout !== null;
}

// Contact knowledge (does this strap send RR / report contact) is per sensor.
let contactDetector: ContactDetector = createContactDetector({ minValidBpm: MIN_VALID_BPM });
let contactDeviceId: string | null = null;

// The battery level is a diagnostic, not part of bringing the link up. Reading
// it straight from onConnected put an extra GATT read on top of the notification
// subscription at the one moment the link is most fragile — on a strap with a
// tired coin cell that is a good way to lose the connection you just made. It
// waits until the strap has settled instead, and is dropped if the link goes
// down first.
const BATTERY_READ_DELAY_MS = 5000;
let batteryReadTimer: ReturnType<typeof setTimeout> | null = null;

function cancelBatteryRead(): void {
  if (batteryReadTimer !== null) {
    clearTimeout(batteryReadTimer);
    batteryReadTimer = null;
  }
}

function scheduleBatteryRead(deviceId: string): void {
  cancelBatteryRead();
  batteryReadTimer = setTimeout(() => {
    batteryReadTimer = null;
    readBatteryLevel(deviceId).then((level) => {
      logBle(level != null ? `battery: ${level}%` : 'battery: not reported');
    });
  }, BATTERY_READ_DELAY_MS);
}

function clearLiveReadings(): void {
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
    clearLiveReadings();
    return;
  }

  session.addHrSample(sample.bpm);
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
      scheduleBatteryRead(target.id);
    },

    onLinkDown: () => {
      const store = useSessionStore.getState();
      store.setConnectedDevice(null);
      store.setSensorContact('unknown');
      cancelBatteryRead();
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
// workout is running the reconnect loop keeps trying regardless.
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
