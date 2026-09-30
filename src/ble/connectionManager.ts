import { ToastAndroid } from 'react-native';
import { isDeviceModelRead, saveDeviceModel, saveKnownDevice } from '../db/database';
import { useSessionStore } from '../store/sessionStore';
import { logBle } from './bleLog';
import { ConnectionSupervisor, createConnectionSupervisor, LinkTarget } from './connectionSupervisor';
import { ContactDetector, createContactDetector } from './contactDetector';
import { deviceDisplayName } from './deviceInfo';
import { bleLink, readBatteryLevel, readDeviceInfo } from './heartRate';
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

/**
 * Заряд и модель датчика читаются не в момент подключения, а когда связь устоится.
 * К поднятию связи они не относятся: заряд это диагностика, модель косметика.
 * Лишнее GATT-чтение поверх подписки на пульс в самый хрупкий момент связи на ремне
 * с уставшей батарейкой легко роняет только что поднятое соединение
 * (`field-issues-h64.md`, п. F и G). Если связь упала раньше, чтение отменяется.
 */
const SETTLED_READ_DELAY_MS = 5000;
let settledReadTimer: ReturnType<typeof setTimeout> | null = null;

function cancelSettledReads(): void {
  if (settledReadTimer !== null) {
    clearTimeout(settledReadTimer);
    settledReadTimer = null;
  }
}

function scheduleSettledReads(deviceId: string): void {
  cancelSettledReads();
  settledReadTimer = setTimeout(() => {
    settledReadTimer = null;
    readSettledInfo(deviceId).catch(() => {});
  }, SETTLED_READ_DELAY_MS);
}

/** Чтения идут по очереди, чтобы на ремень шёл один запрос за раз. */
async function readSettledInfo(deviceId: string): Promise<void> {
  // Слабая батарейка задолго до отказа ремня проявляется пропусками ударов и
  // нестабильным контактом, поэтому заряд пишется в журнал.
  const level = await readBatteryLevel(deviceId);
  logBle(level != null ? `battery: ${level}%` : 'battery: not reported');
  await identifyDevice(deviceId);
}

/**
 * Разово узнаёт модель датчика и показывает её вместо имени из эфира: Magene H64
 * называет себя серийным номером вроде «25643-209». Модель читается один раз на
 * ремень и запоминается в `known_device`, дальше имя берётся оттуда. Ремень без
 * модели так и остаётся под своим именем, это нормальный исход.
 *
 * Спиннера «ждём название» нет, но смену имени сообщает тост: иначе номер молча
 * превращался бы в название, и было бы непонятно, что произошло.
 */
async function identifyDevice(deviceId: string): Promise<void> {
  if (await isDeviceModelRead(deviceId)) return;
  const info = await readDeviceInfo(deviceId);
  if (info.kind === 'failed') return; // ответа нет: прочитаем при следующем подключении
  const model = info.kind === 'read' ? deviceDisplayName(info.manufacturer, info.model) : null;
  await saveDeviceModel(deviceId, model ?? '');
  logBle(model ? `model: ${model}` : 'model: not reported');

  const store = useSessionStore.getState();
  if (!model || store.lastKnownDevice?.id !== deviceId || store.lastKnownDevice.name === model) return;
  const renamed = { id: deviceId, name: model };
  store.setLastKnownDevice(renamed);
  if (store.connectedDevice?.id === deviceId) store.setConnectedDevice(renamed);
  ToastAndroid.show(`Датчик опознан: ${model}`, ToastAndroid.LONG);
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
      // Тот же ремень остаётся под именем, под которым он уже известен: там может
      // быть опознанная модель, а супервизор носит имя из эфира. Иначе каждое
      // переподключение возвращало бы серийный номер.
      const device = store.lastKnownDevice?.id === target.id ? store.lastKnownDevice : target;
      store.setSensorContact('unknown');
      store.setConnectedDevice(device);
      store.setLastKnownDevice(device);
      saveKnownDevice(device).catch(() => {});
      scheduleSettledReads(target.id);
    },

    onLinkDown: () => {
      const store = useSessionStore.getState();
      store.setConnectedDevice(null);
      store.setSensorContact('unknown');
      cancelSettledReads();
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
