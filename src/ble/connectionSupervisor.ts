// Супервизор соединения с пульсометром. Владеет единственным BLE-соединением с
// ремнём и всем, что на нём висит (слушатель разрыва и подписка на пульс), так
// что остальное приложение с BLE-менеджером напрямую не разговаривает.
//
// Зачем он нужен: react-native-ble-plx на Android
//   - сам никогда не снимает слушателей onDeviceDisconnected;
//   - шлёт событие разрыва, когда заканчивается *любая* попытка подключения к
//     устройству, в том числе неудачная или оборванная по таймауту;
//   - рвёт живое соединение, если снова вызвать connectToDevice().
// Прежний код вешал нового слушателя на каждое (пере)подключение и от каждого
// запускал свою цепочку повторов. Каждый обрыв множил цепочки, они рвали
// соединения друг друга, и через какое-то время JS-поток захлёбывался: статус
// мигал, интерфейс замирал, терялись минуты записи, а после возвращения ремня
// связь так и не восстанавливалась.
//
// Что здесь гарантируется:
//   - одновременно не больше одного нативного подключения и одного таймера повтора;
//   - пока связь есть, ровно один слушатель разрыва и одна подписка на пульс,
//     без связи ни одного;
//   - каждый коллбэк помечен эпохой, в которой он создан, и игнорируется, когда
//     она закончилась, поэтому запоздалые события старого соединения не могут
//     повлиять на текущее.

/** Состояние связи с ремнём, как его показывает интерфейс. */
export type LinkStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Подписка, которую можно снять: слушатель разрыва или подписка на пульс. */
export interface LinkSubscription {
  remove(): void;
}

/** Ремень, к которому подключаемся: ID (на Android это MAC-адрес) и имя для журнала. */
export interface LinkTarget {
  id: string;
  name: string;
}

/**
 * Та часть BLE-стека, что нужна супервизору. Настоящая реализация лежит в
 * heartRate.ts, тесты подставляют подделку.
 */
export interface BleLink {
  connect(deviceId: string): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  isConnected(deviceId: string): Promise<boolean>;
  onDisconnected(deviceId: string, listener: () => void): LinkSubscription;
  monitor(deviceId: string, onValue: (value: string) => void, onError: (error: unknown) => void): LinkSubscription;
  /**
   * `true`, как только ремень замечен в эфире, `false`, если он молчит `timeoutMs`.
   * Прямое подключение Android к запомненному адресу, пока ремень не рекламирует
   * себя, не завершается никогда, а только сжигает таймаут подключения, и
   * возвращение ремня тоже не замечает. Поэтому цикл повторов слушает эфир, а не
   * гадает. Необязателен: без него остаётся простое «подключиться и надеяться».
   */
  waitForDevice?(deviceId: string, timeoutMs: number): Promise<boolean>;
}

/** Коллбэки, через которые супервизор сообщает приложению о событиях связи. */
export interface SupervisorHooks {
  onStatus(status: LinkStatus): void;
  onConnected(target: LinkTarget): void;
  /** Связи с `target` больше нет: она оборвалась, мы её разорвали или сменили ремень. */
  onLinkDown(target: LinkTarget): void;
  onValue(value: string, target: LinkTarget): void;
  /** Восстанавливать ли оборванную связь в фоне. */
  shouldReconnect(): boolean;
  log?(message: string, error?: unknown): void;
}

/** Таймеры и часы. В приложении настоящие, в тестах их двигают вручную. */
export interface Scheduler {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

/** Паузы и таймауты супервизора. Значения по умолчанию в `DEFAULT_SUPERVISOR_OPTIONS`. */
export interface SupervisorOptions {
  /** Пауза перед следующей попыткой в зависимости от числа неудач подряд. */
  retryDelayMs(failures: number): number;
  /** Сколько максимум ждать нативного отключения, дальше идём, не дожидаясь. */
  disconnectTimeoutMs: number;
  /**
   * Потолок порога тишины в `checkStale`: после каждого восстановления, за которым
   * ремень так и не заговорил, порог удваивается, но не выше этого.
   */
  maxStaleThresholdMs: number;
  /**
   * Жёсткий предел на всю попытку (подключение и обнаружение сервисов). ble-plx
   * ограничивает по времени только само подключение, а обнаружение сервисов после
   * резкого обрыва может не ответить никогда и навсегда заблокировать единственную
   * попытку.
   */
  attemptTimeoutMs: number;
  /** Предел на проверку «правда ли связь упала» при событии разрыва. */
  isConnectedTimeoutMs: number;
  /**
   * Сколько раз подключаться вслепую, прежде чем перейти к «сначала найти ремень в
   * эфире и подключаться, только когда он там». Первые попытки вслепую оправданы:
   * ремень, пропавший на мгновение, обычно ещё в эфире и без сканирования
   * подключается быстрее.
   */
  scanAfterFailures: number;
  /** Сколько слушать эфир в поисках ремня, прежде чем признать попытку неудачной. */
  scanTimeoutMs: number;
}

// Первые ~5 минут частые повторы (соскользнувший ремень обычно скоро возвращается),
// потом реже, чтобы забытый на ночь в ящике ремень не занимал радио до утра.
const FAST_RETRY_ATTEMPTS = 20;

/** Настройки, с которыми супервизор работает в приложении. */
export const DEFAULT_SUPERVISOR_OPTIONS: SupervisorOptions = {
  retryDelayMs: (failures) => (failures > FAST_RETRY_ATTEMPTS ? 30000 : Math.min(1000 * Math.max(failures, 1), 5000)),
  disconnectTimeoutMs: 3000,
  maxStaleThresholdMs: 5 * 60 * 1000,
  attemptTimeoutMs: 25000,
  isConnectedTimeoutMs: 3000,
  scanAfterFailures: 3,
  scanTimeoutMs: 10000,
};

/** Попытка не уложилась в `attemptTimeoutMs`. */
class AttemptTimeoutError extends Error {}

// Настоящие таймеры и часы, для приложения.
const realScheduler: Scheduler = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

/** Снимок внутреннего состояния для отладки и тестов. В приложении сейчас не используется. */
export interface SupervisorSnapshot {
  status: LinkStatus;
  connected: boolean;
  subscriptions: number;
  attemptInFlight: boolean;
  retryScheduled: boolean;
  failures: number;
}

/** Единственная точка управления связью с ремнём. */
export interface ConnectionSupervisor {
  /**
   * Подключение по действию пользователя. Выполняется, когда связь поднята, и
   * отклоняется, если эта попытка не удалась (фоновый цикл повторов при этом
   * продолжает работать, если `shouldReconnect()`). Если уже подключены к этому же
   * ремню, ничего не делает.
   */
  connect(target: LinkTarget): Promise<void>;
  /**
   * Принудительно переподключает, если «подключённый» ремень слишком долго молчит:
   * это обрыв, о котором Android не сообщил. Пока ремень продолжает молчать, порог
   * растёт.
   */
  checkStale(staleMs: number): Promise<void>;
  /** Снимает всех слушателей и таймеры, не трогая нативное соединение. */
  dispose(): void;
  getTarget(): LinkTarget | null;
  isConnected(): boolean;
  snapshot(): SupervisorSnapshot;
}

/**
 * Создаёт супервизор поверх `link`. `scheduler` и `options` подменяются в тестах,
 * чтобы управлять временем вручную.
 */
export function createConnectionSupervisor(
  link: BleLink,
  hooks: SupervisorHooks,
  scheduler: Scheduler = realScheduler,
  options: Partial<SupervisorOptions> = {},
): ConnectionSupervisor {
  const opts: SupervisorOptions = { ...DEFAULT_SUPERVISOR_OPTIONS, ...options };

  let target: LinkTarget | null = null;
  let status: LinkStatus = 'disconnected';
  let epoch = 0;
  let connected = false;
  let attempt: Promise<boolean> | null = null;
  let retryTimer: unknown = null;
  let failures = 0;
  let lastError: unknown = null;
  let subscriptions: LinkSubscription[] = [];
  let lastValueAt = 0;
  let staleRecoveries = 0;
  let disposed = false;
  // Ставится, когда связь упала: перед следующим подключением отменяем всё, что
  // нативная сторона ещё держит для ремня, чтобы полузакрытый GATT его не заблокировал.
  let resetBeforeConnect = false;

  const log = (message: string, error?: unknown) => hooks.log?.(message, error);

  function setStatus(next: LinkStatus) {
    if (next === status) return;
    status = next;
    hooks.onStatus(next);
  }

  function removeSubscriptions() {
    const current = subscriptions;
    subscriptions = [];
    for (const subscription of current) {
      try {
        subscription.remove();
      } catch (error) {
        log('failed to remove a BLE subscription', error);
      }
    }
  }

  function cancelRetry() {
    if (retryTimer !== null) {
      scheduler.clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  /** Отключает ремень, но ждёт этого не дольше `disconnectTimeoutMs`: нативная сторона может не ответить. */
  async function disconnectCapped(deviceId: string): Promise<void> {
    let handle: unknown = null;
    const cap = new Promise<void>((resolve) => {
      handle = scheduler.setTimeout(resolve, opts.disconnectTimeoutMs);
    });
    try {
      await Promise.race([
        link.disconnect(deviceId).then(
          () => undefined,
          () => undefined,
        ),
        cap,
      ]);
    } finally {
      if (handle !== null) scheduler.clearTimeout(handle);
    }
  }

  /** Отклоняет `promise` ошибкой `error()`, если он не выполнился за `ms`. */
  function withDeadline<T>(promise: Promise<T>, ms: number, error: () => Error): Promise<T> {
    let handle: unknown = null;
    const deadline = new Promise<never>((_, reject) => {
      handle = scheduler.setTimeout(() => reject(error()), ms);
    });
    return Promise.race([promise, deadline]).finally(() => {
      if (handle !== null) scheduler.clearTimeout(handle);
    });
  }

  /**
   * Завершает текущую эпоху соединения: всё, что для неё создано (слушатели,
   * коллбэки подписки, таймер повтора), больше ничего не может сделать.
   * Возвращает, была ли связь поднята.
   */
  function endEpoch() {
    epoch += 1;
    cancelRetry();
    removeSubscriptions();
    const wasConnected = connected;
    connected = false;
    return wasConnected;
  }

  /** Пакет пульса от ремня. Засчитывается, только если пришёл в текущей эпохе. */
  function handleValue(valueEpoch: number, value: string) {
    if (valueEpoch !== epoch || !connected || !target) return;
    lastValueAt = scheduler.now();
    staleRecoveries = 0;
    try {
      hooks.onValue(value, target);
    } catch (error) {
      log('heart-rate sample handler threw', error);
    }
  }

  /** Связь пропала: пришло событие разрыва или ошибка подписки. Запускает цикл повторов. */
  async function handleLinkLost(linkEpoch: number, reason: 'disconnected' | 'monitor-error', error?: unknown) {
    if (linkEpoch !== epoch || !connected || !target) return;

    if (reason === 'disconnected') {
      // Событие может относиться к более ранней, уже законченной попытке
      // подключения, поэтому действуем, только если ремень правда отвалился.
      let stillUp = false;
      try {
        stillUp = await withDeadline(
          link.isConnected(target.id),
          opts.isConnectedTimeoutMs,
          () => new Error('isConnected timed out'),
        );
      } catch {
        stillUp = false;
      }
      if (linkEpoch !== epoch || !connected || !target) return;
      if (stillUp) {
        log('ignored a disconnection event while the device is still connected');
        return;
      }
    }

    const lostTarget = target;
    endEpoch();
    // Какой бы ни была причина, следующая попытка начнётся с отмены того, что
    // осталось от этой связи на нативной стороне: подписка могла умереть и на живой связи.
    resetBeforeConnect = true;
    log(`link to ${lostTarget.name} lost (${reason})`, error);
    hooks.onLinkDown(lostTarget);
    startRetryLoop();
  }

  /**
   * Одна попытка целиком: сброс остатков прошлой связи, при необходимости поиск
   * ремня в эфире, подключение и подписки. `true`, если связь поднята.
   */
  async function attemptBody(current: LinkTarget, myEpoch: number): Promise<boolean> {
    removeSubscriptions();
    if (resetBeforeConnect || failures > 0) {
      resetBeforeConnect = false;
      await disconnectCapped(current.id);
      if (myEpoch !== epoch || disposed) return false;
    }
    // Номер берётся до попытки, чтобы строки «connecting» и «failed» одной попытки
    // в журнале несли один и тот же номер.
    const attemptNo = failures + 1;
    const label = attemptNo > 1 ? ` (attempt ${attemptNo})` : '';

    // После нескольких неудачных попыток вслепую ремень, скорее всего, не в эфире
    // (вне зоны, села батарейка, выключен). Подключаться к нему всё равно значит
    // каждый цикл сжигать таймаут и так и не восстановиться: прямое подключение не
    // видит, что ремень вернулся. Прослушивание эфира видит и ничего не стоит, пока
    // ремня нет.
    if (link.waitForDevice && failures >= opts.scanAfterFailures) {
      let seen = false;
      try {
        seen = await link.waitForDevice(current.id, opts.scanTimeoutMs);
      } catch (error) {
        log(`scan for ${current.name} failed`, error);
      }
      if (myEpoch !== epoch || disposed) return false;
      if (!seen) {
        failures += 1;
        lastError = new Error('Датчик не в эфире');
        log(`${current.name} is not advertising${label}, waited ${opts.scanTimeoutMs / 1000}s`);
        return false;
      }
    }

    log(`connecting to ${current.name}${label}`);
    try {
      await withDeadline(
        link.connect(current.id),
        opts.attemptTimeoutMs,
        () => new AttemptTimeoutError(`connection attempt took longer than ${opts.attemptTimeoutMs / 1000}s`),
      );
    } catch (error) {
      if (myEpoch === epoch) {
        failures += 1;
        lastError = error;
        log(`connect to ${current.name} failed${label}`, error);
        // Зависшую попытку бросаем и отменяем нативно, чтобы она не висела дальше.
        if (error instanceof AttemptTimeoutError) resetBeforeConnect = true;
      }
      return false;
    }

    if (myEpoch !== epoch || disposed) {
      // Пока подключались, выбрали другой ремень: не оставляем соединение,
      // которое никто не слушает.
      if (!target || target.id !== current.id) await disconnectCapped(current.id);
      return false;
    }

    try {
      subscriptions.push(
        link.onDisconnected(current.id, () => {
          void handleLinkLost(myEpoch, 'disconnected');
        }),
      );
      subscriptions.push(
        link.monitor(
          current.id,
          (value) => handleValue(myEpoch, value),
          (error) => {
            void handleLinkLost(myEpoch, 'monitor-error', error);
          },
        ),
      );
    } catch (error) {
      removeSubscriptions();
      failures += 1;
      lastError = error;
      log(`subscribing to ${current.name} failed`, error);
      await disconnectCapped(current.id);
      return false;
    }

    connected = true;
    failures = 0;
    lastError = null;
    lastValueAt = scheduler.now();
    log(`connected to ${current.name}`);
    hooks.onConnected(current);
    setStatus('connected');
    return true;
  }

  /** Попытка всегда одна: пока она идёт, все вызывающие получают её же. */
  function runAttempt(): Promise<boolean> {
    if (attempt) return attempt;
    const current = target;
    if (!current || disposed) return Promise.resolve(false);
    const myEpoch = epoch;
    const promise = (async () => {
      await null; // чтобы `attempt` был присвоен до того, как начнёт выполняться тело
      try {
        return await attemptBody(current, myEpoch);
      } finally {
        attempt = null;
      }
    })();
    attempt = promise;
    return promise;
  }

  /** Ставит следующую попытку через `delayMs`, заменяя уже стоящую. */
  function scheduleRetry(delayMs: number) {
    cancelRetry();
    const myEpoch = epoch;
    retryTimer = scheduler.setTimeout(() => {
      retryTimer = null;
      void retryTick(myEpoch);
    }, delayMs);
  }

  /** Срабатывание таймера повтора: ещё одна попытка или остановка, если ремень больше не нужен. */
  async function retryTick(myEpoch: number) {
    if (myEpoch !== epoch || connected || !target || disposed) return;
    if (!hooks.shouldReconnect()) {
      setStatus('disconnected');
      return;
    }
    setStatus('reconnecting');
    const ok = await runAttempt();
    if (ok || myEpoch !== epoch || connected || disposed) return;
    scheduleRetry(opts.retryDelayMs(failures));
  }

  /** Запускает фоновый цикл повторов после обрыва, если ремень ещё нужен. */
  function startRetryLoop() {
    if (disposed) return;
    if (!hooks.shouldReconnect()) {
      setStatus('disconnected');
      return;
    }
    setStatus('reconnecting');
    scheduleRetry(opts.retryDelayMs(Math.max(failures, 1)));
  }

  return {
    async connect(next) {
      if (disposed) throw new Error('connection supervisor disposed');

      if (target && target.id !== next.id) {
        // Смена ремня: сначала закрываем всё, что относится к старому.
        const previous = target;
        const inFlight = attempt;
        const wasConnected = endEpoch();
        target = next;
        failures = 0;
        if (wasConnected) hooks.onLinkDown(previous);
        await disconnectCapped(previous.id);
        if (inFlight) await inFlight;
        if (target !== next) throw new Error('Подключение отменено: выбран другой датчик');
      } else {
        target = next;
      }

      if (connected) return;

      // Действие пользователя отменяет паузу, в которой сейчас ждёт фоновый цикл.
      cancelRetry();
      if (!attempt) setStatus(status === 'reconnecting' ? 'reconnecting' : 'connecting');
      const myEpoch = epoch;
      const ok = await runAttempt();
      if (ok || connected) return;

      if (myEpoch === epoch && target === next && !disposed) {
        if (hooks.shouldReconnect()) {
          setStatus('reconnecting');
          scheduleRetry(opts.retryDelayMs(failures));
        } else if (!attempt && retryTimer === null) {
          setStatus('disconnected');
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Не удалось подключиться к датчику');
    },

    async checkStale(staleMs) {
      if (!connected || !target || attempt || disposed) return;
      if (!hooks.shouldReconnect()) return;
      const threshold = Math.min(staleMs * 2 ** staleRecoveries, opts.maxStaleThresholdMs);
      const silentFor = scheduler.now() - lastValueAt;
      if (silentFor < threshold) return;

      staleRecoveries += 1;
      const staleTarget = target;
      endEpoch();
      log(`no data from ${staleTarget.name} for ${Math.round(silentFor / 1000)}s, reconnecting`);
      hooks.onLinkDown(staleTarget);
      setStatus('reconnecting');
      const myEpoch = epoch;
      await disconnectCapped(staleTarget.id);
      if (myEpoch !== epoch || connected || attempt || target !== staleTarget) return;
      startRetryLoop();
    },

    dispose() {
      disposed = true;
      endEpoch();
    },

    getTarget: () => target,
    isConnected: () => connected,
    snapshot: () => ({
      status,
      connected,
      subscriptions: subscriptions.length,
      attemptInFlight: attempt !== null,
      retryScheduled: retryTimer !== null,
      failures,
    }),
  };
}
