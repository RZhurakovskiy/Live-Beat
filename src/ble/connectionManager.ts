import { ToastAndroid } from 'react-native';
import { isDeviceModelRead, saveDeviceModel, saveKnownDevice } from '../db/database';
import { useSessionStore } from '../store/sessionStore';
import { logBle } from './bleLog';
import { ConnectionSupervisor, createConnectionSupervisor, LinkTarget } from './connectionSupervisor';
import { ContactDetector, createContactDetector } from './contactDetector';
import { deviceDisplayName } from './deviceInfo';
import { bleLink, readBatteryLevel, readDeviceInfo } from './heartRate';
import { parseHeartRateMeasurement } from './hrParser';

// Связка BLE-слоя с приложением: супервизор соединения, детектор контакта и сторы.
// Экраны и сервис тренировки работают с ремнём только через функции этого модуля.

const MIN_VALID_BPM = 20;

/**
 * Нужен ли сейчас ремень. Он нужен только идущей тренировке: вне её цикл повторов
 * останавливается, чтобы забытый в ящике ремень не занимал радио.
 */
function isSensorNeeded(): boolean {
  return useSessionStore.getState().activeWorkout !== null;
}

// Знание о контакте (шлёт ли ремень RR, сообщает ли о контакте) своё у каждого ремня.
let contactDetector: ContactDetector = createContactDetector({ minValidBpm: MIN_VALID_BPM });
let contactDeviceId: string | null = null;

/**
 * Заряд и модель датчика читаются не в момент подключения, а когда связь устоится.
 * К поднятию связи они не относятся: заряд это диагностика, модель косметика.
 * Лишнее GATT-чтение поверх подписки на пульс в самый хрупкий момент связи на ремне
 * с уставшей батарейкой легко роняет только что поднятое соединение
 * (`plans/archive/field-issues-h64.md`, п. F и G). Если связь упала раньше, чтение отменяется.
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

/** Убирает с экрана текущий пульс, чтобы вместо застывшего числа было «--». */
function clearLiveReadings(): void {
  useSessionStore.getState().clearCurrentBpm();
}

/**
 * Пакет пульса от ремня: разбор, вердикт детектора контакта и запись. В тренировку
 * и на экран попадает только пакет с контактом.
 */
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
    // Ремень не на коже или ничего не читает: сейчас он шлёт застывшее или пустое
    // значение, его нельзя ни показывать, ни записывать.
    clearLiveReadings();
    return;
  }

  session.addHrSample(sample.bpm);
}

/** Супервизор с коллбэками, которые переносят события связи в сторы и журнал. */
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

// Один супервизор на JS-рантайм. После Fast Refresh прежний экземпляр всё ещё
// держит слушателей на общем BleManager, поэтому его снимаем, а его ремень подхватываем.
const supervisorRef = globalThis as unknown as { __hrSupervisor?: ConnectionSupervisor };
const previousSupervisor = supervisorRef.__hrSupervisor;
const resumeTarget: LinkTarget | null = previousSupervisor?.isConnected() ? previousSupervisor.getTarget() : null;
previousSupervisor?.dispose();
const supervisor = createSupervisor();
supervisorRef.__hrSupervisor = supervisor;
if (resumeTarget) supervisor.connect(resumeTarget).catch(() => {});

/**
 * Подключается к ремню (или присоединяется к уже идущему подключению). Если этот
 * ремень уже подключён, ничего не делает. Отклоняется, если попытка не удалась;
 * пока идёт тренировка, цикл повторов всё равно продолжает пытаться.
 */
export function connectAndSubscribe(deviceId: string, deviceName: string): Promise<void> {
  return supervisor.connect({ id: deviceId, name: deviceName });
}

/**
 * «Попробовать сейчас» из интерфейса: пропускает паузу, в которой ждёт цикл
 * повторов. Сейчас нигде не используется.
 */
export function retryConnectionNow(): void {
  const device = useSessionStore.getState().lastKnownDevice;
  if (!device) return;
  logBle('manual retry');
  supervisor.connect(device).catch(() => {});
}

/**
 * Ловит «тихие» обрывы BLE, о которых Android так и не сообщает: если подключённый
 * ремень ничего не присылал `staleMs`, запускает один цикл переподключения.
 * Вызывается сторожем в workoutService.ts, пока идёт тренировка.
 */
export function recoverIfStale(staleMs: number): Promise<void> {
  return supervisor.checkStale(staleMs);
}
