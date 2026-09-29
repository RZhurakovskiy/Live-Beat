// Owns the one BLE connection to the heart-rate strap and everything hanging
// off it (disconnect listener + notification monitor), so the rest of the app
// never talks to the BLE manager directly.
//
// Why this exists: react-native-ble-plx on Android
//   - never removes onDeviceDisconnected listeners by itself,
//   - emits a disconnection event whenever *any* connection attempt for the
//     device ends, including attempts that failed or timed out,
//   - cancels a live connection when connectToDevice() is called again.
// The previous code registered a new listener on every (re)connect and started
// an independent retry chain from each one, so every drop multiplied the
// chains, the chains kept cancelling each other's connections, and after a
// while the JS thread was flooded (flapping status, frozen UI, lost minutes,
// no recovery after the strap came back).
//
// Invariants kept here:
//   - at most one native connect in flight, at most one retry timer;
//   - exactly one disconnect listener and one monitor while connected, none
//     otherwise;
//   - every callback is tagged with the epoch it was created in and ignored
//     once that epoch is over, so late events from an old connection can't
//     act on the current one.

export type LinkStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface LinkSubscription {
  remove(): void;
}

export interface LinkTarget {
  id: string;
  name: string;
}

// The slice of the BLE stack the supervisor needs. Real implementation lives in
// heartRate.ts; tests pass a fake.
export interface BleLink {
  connect(deviceId: string): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  isConnected(deviceId: string): Promise<boolean>;
  onDisconnected(deviceId: string, listener: () => void): LinkSubscription;
  monitor(deviceId: string, onValue: (value: string) => void, onError: (error: unknown) => void): LinkSubscription;
  // Resolves true once the device is seen advertising, false if it stays off
  // the air for timeoutMs. Android's direct connect to a remembered address
  // never completes while the peripheral is not advertising — it only burns the
  // connect timeout — and it cannot notice the strap coming back either, so the
  // retry loop listens for it on the air instead of guessing.
  // Optional: a link without it keeps the plain connect-and-hope behaviour.
  waitForDevice?(deviceId: string, timeoutMs: number): Promise<boolean>;
}

export interface SupervisorHooks {
  onStatus(status: LinkStatus): void;
  onConnected(target: LinkTarget): void;
  // The link to `target` is gone (dropped, torn down or replaced).
  onLinkDown(target: LinkTarget): void;
  onValue(value: string, target: LinkTarget): void;
  // Whether a dropped link should be re-established in the background.
  shouldReconnect(): boolean;
  log?(message: string, error?: unknown): void;
}

export interface Scheduler {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export interface SupervisorOptions {
  retryDelayMs(failures: number): number;
  disconnectTimeoutMs: number;
  maxStaleThresholdMs: number;
  // Hard cap on one whole attempt (connect + service discovery). ble-plx only
  // times out the connection itself; a discovery that never answers after an
  // abrupt drop would otherwise block the single-flight attempt forever.
  attemptTimeoutMs: number;
  // Cap on the "is it really down?" check done on a disconnect event.
  isConnectedTimeoutMs: number;
  // Blind reconnects to try before switching to "scan first, connect only when
  // the strap is really on the air". The first few are worth trying blind: a
  // strap that dropped for a moment is usually still advertising and reconnects
  // faster without waiting for a scan.
  scanAfterFailures: number;
  // How long to listen for the strap before giving the attempt up.
  scanTimeoutMs: number;
}

// Quick retries for the first ~5 minutes (a strap that slipped usually comes
// back soon), then a slower cadence so a strap left in a drawer overnight
// doesn't keep the radio busy all night.
const FAST_RETRY_ATTEMPTS = 20;

export const DEFAULT_SUPERVISOR_OPTIONS: SupervisorOptions = {
  retryDelayMs: (failures) => (failures > FAST_RETRY_ATTEMPTS ? 30000 : Math.min(1000 * Math.max(failures, 1), 5000)),
  disconnectTimeoutMs: 3000,
  maxStaleThresholdMs: 5 * 60 * 1000,
  attemptTimeoutMs: 25000,
  isConnectedTimeoutMs: 3000,
  scanAfterFailures: 3,
  scanTimeoutMs: 10000,
};

class AttemptTimeoutError extends Error {}

const realScheduler: Scheduler = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export interface SupervisorSnapshot {
  status: LinkStatus;
  connected: boolean;
  subscriptions: number;
  attemptInFlight: boolean;
  retryScheduled: boolean;
  failures: number;
}

export interface ConnectionSupervisor {
  // User-initiated connect. Resolves once connected; rejects if this attempt
  // fails (the background retry loop keeps going when shouldReconnect()).
  // Calling it while already connected to the same device is a no-op.
  connect(target: LinkTarget): Promise<void>;
  // Forces a reconnect when a "connected" link has been silent for too long
  // (a drop Android never reported). Backs off while the strap stays silent.
  checkStale(staleMs: number): Promise<void>;
  // Drops all listeners and timers without touching the native connection.
  dispose(): void;
  getTarget(): LinkTarget | null;
  isConnected(): boolean;
  snapshot(): SupervisorSnapshot;
}

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
  // Set when a link went down: cancel whatever the native side still holds for
  // the device before the next connect, so a half-closed GATT can't block it.
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

  function withDeadline<T>(promise: Promise<T>, ms: number, error: () => Error): Promise<T> {
    let handle: unknown = null;
    const deadline = new Promise<never>((_, reject) => {
      handle = scheduler.setTimeout(() => reject(error()), ms);
    });
    return Promise.race([promise, deadline]).finally(() => {
      if (handle !== null) scheduler.clearTimeout(handle);
    });
  }

  // Ends the current connection epoch: from here on nothing created for it
  // (listeners, monitor callbacks, a retry timer) may act any more.
  function endEpoch() {
    epoch += 1;
    cancelRetry();
    removeSubscriptions();
    const wasConnected = connected;
    connected = false;
    return wasConnected;
  }

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

  async function handleLinkLost(linkEpoch: number, reason: 'disconnected' | 'monitor-error', error?: unknown) {
    if (linkEpoch !== epoch || !connected || !target) return;

    if (reason === 'disconnected') {
      // The event may belong to an earlier, already finished connection
      // attempt; only act when the device really is down.
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
    // Whatever the reason, the next attempt starts by cancelling what's left
    // of this link natively (notifications may have died on a link that is up).
    resetBeforeConnect = true;
    log(`link to ${lostTarget.name} lost (${reason})`, error);
    hooks.onLinkDown(lostTarget);
    startRetryLoop();
  }

  async function attemptBody(current: LinkTarget, myEpoch: number): Promise<boolean> {
    removeSubscriptions();
    if (resetBeforeConnect || failures > 0) {
      resetBeforeConnect = false;
      await disconnectCapped(current.id);
      if (myEpoch !== epoch || disposed) return false;
    }
    // Numbered before the attempt so the "connecting" and "failed" lines of one
    // attempt carry the same number.
    const attemptNo = failures + 1;
    const label = attemptNo > 1 ? ` (attempt ${attemptNo})` : '';

    // Once blind reconnects have failed a few times the strap is most likely
    // off the air (out of range, coin cell flat, powered down). Connecting to
    // it anyway just burns the connect timeout every cycle and never recovers,
    // because a direct connect cannot see the strap come back. Listening for
    // its advertisement does, and it costs nothing when the strap is gone.
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
        // A hung attempt is abandoned: cancel it natively so it can't linger.
        if (error instanceof AttemptTimeoutError) resetBeforeConnect = true;
      }
      return false;
    }

    if (myEpoch !== epoch || disposed) {
      // Superseded while connecting (another device was picked): don't leave
      // a connection behind that nobody listens to.
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

  // Single-flight: while an attempt runs, everyone gets that same attempt.
  function runAttempt(): Promise<boolean> {
    if (attempt) return attempt;
    const current = target;
    if (!current || disposed) return Promise.resolve(false);
    const myEpoch = epoch;
    const promise = (async () => {
      await null; // make sure `attempt` is assigned before the body runs
      try {
        return await attemptBody(current, myEpoch);
      } finally {
        attempt = null;
      }
    })();
    attempt = promise;
    return promise;
  }

  function scheduleRetry(delayMs: number) {
    cancelRetry();
    const myEpoch = epoch;
    retryTimer = scheduler.setTimeout(() => {
      retryTimer = null;
      void retryTick(myEpoch);
    }, delayMs);
  }

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
        // Switching sensors: finish everything that belongs to the old one first.
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

      // A user action skips whatever backoff wait the background loop is in.
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
