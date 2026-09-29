import {
  BleLink,
  ConnectionSupervisor,
  createConnectionSupervisor,
  LinkStatus,
  LinkSubscription,
  LinkTarget,
  Scheduler,
} from '../ble/connectionSupervisor';

// Lets every pending promise continuation run (the fakes below only use microtasks).
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

class FakeScheduler implements Scheduler {
  private time = 0;
  private seq = 0;
  private timers = new Map<number, { at: number; callback: () => void }>();

  setTimeout(callback: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.timers.set(id, { at: this.time + ms, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  now(): number {
    return this.time;
  }

  pendingTimers(): number {
    return this.timers.size;
  }

  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    await flush();
    for (;;) {
      let nextId: number | null = null;
      let nextAt = Infinity;
      for (const [id, timer] of this.timers) {
        if (timer.at <= end && timer.at < nextAt) {
          nextId = id;
          nextAt = timer.at;
        }
      }
      if (nextId === null) break;
      const timer = this.timers.get(nextId)!;
      this.timers.delete(nextId);
      this.time = timer.at;
      timer.callback();
      await flush();
    }
    this.time = end;
    await flush();
  }
}

// Mimics react-native-ble-plx on Android closely enough to reproduce the old
// failure: disconnect listeners stay registered until removed, a failed or
// cancelled attempt still emits a disconnection event, and connecting to a
// device that is already connected cancels that connection first.
//
// It also costs real time to fail. ble-plx does not reject quickly for a strap
// that is not advertising: the connect sits there until its own timeout expires
// and only then reports "Operation was cancelled". That detail is the whole
// bug — a fake that fails instantly makes a blind retry loop look like it
// recovers the moment the strap returns, while on the phone it just burned the
// timeout over and over and never came back.
class FakeLink implements BleLink {
  reachable = new Set<string>(['strap-1', 'strap-2']);
  // Devices whose connect/discovery never answers (seen after an abrupt drop).
  hanging = new Set<string>();
  connectedIds = new Set<string>();
  connectCalls: string[] = [];
  disconnectCalls: string[] = [];
  scanCalls: string[] = [];
  inFlight = 0;
  maxInFlight = 0;
  // ble-plx's own connect timeout (CONNECT_TIMEOUT_MS in heartRate.ts).
  connectTimeoutMs = 10000;
  private seq = 0;
  private disconnectListeners = new Map<number, { id: string; listener: () => void }>();
  private monitors = new Map<number, { id: string; onValue: (v: string) => void; onError: (e: unknown) => void }>();

  constructor(private readonly scheduler: FakeScheduler) {}

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.scheduler.setTimeout(resolve, ms));
  }

  async connect(id: string): Promise<void> {
    this.connectCalls.push(id);
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (this.connectedIds.has(id)) await this.disconnect(id);
      await Promise.resolve();
      if (this.hanging.has(id)) await new Promise<void>(() => {});
      if (!this.reachable.has(id)) {
        // Not advertising: the native call does not fail fast, it sits there
        // until its timeout and only then reports a cancelled operation —
        // exactly the line the phone log is full of.
        await this.wait(this.connectTimeoutMs);
        this.emitDisconnectEvent(id);
        throw new Error('Operation was cancelled');
      }
      this.connectedIds.add(id);
    } finally {
      this.inFlight -= 1;
    }
  }

  async disconnect(id: string): Promise<void> {
    this.disconnectCalls.push(id);
    if (this.connectedIds.delete(id)) {
      this.failMonitors(id);
      this.emitDisconnectEvent(id);
    }
  }

  async isConnected(id: string): Promise<boolean> {
    return this.connectedIds.has(id);
  }

  // Listening for the strap's advertisement. A field rather than a prototype
  // method so a test can clear it and model a link that cannot scan.
  waitForDevice?: (id: string, timeoutMs: number) => Promise<boolean> = async (id, timeoutMs) => {
    this.scanCalls.push(id);
    // A strap that is on the air shows up almost at once; ruling one out takes
    // the whole listening window.
    if (this.reachable.has(id)) return true;
    await this.wait(timeoutMs);
    return this.reachable.has(id);
  };

  onDisconnected(id: string, listener: () => void): LinkSubscription {
    const key = ++this.seq;
    this.disconnectListeners.set(key, { id, listener });
    return { remove: () => void this.disconnectListeners.delete(key) };
  }

  monitor(id: string, onValue: (v: string) => void, onError: (e: unknown) => void): LinkSubscription {
    const key = ++this.seq;
    this.monitors.set(key, { id, onValue, onError });
    return { remove: () => void this.monitors.delete(key) };
  }

  emitDisconnectEvent(id: string): void {
    for (const entry of [...this.disconnectListeners.values()]) {
      if (entry.id === id) entry.listener();
    }
  }

  failMonitors(id: string): void {
    for (const [key, entry] of [...this.monitors]) {
      if (entry.id !== id) continue;
      this.monitors.delete(key);
      entry.onError(new Error('Device disconnected'));
    }
  }

  // The strap drops off (out of range / skin contact lost and it powered down).
  drop(id: string, monitorsFirst = false): void {
    this.connectedIds.delete(id);
    if (monitorsFirst) {
      this.failMonitors(id);
      this.emitDisconnectEvent(id);
    } else {
      this.emitDisconnectEvent(id);
      this.failMonitors(id);
    }
  }

  send(id: string, value: string): void {
    for (const entry of [...this.monitors.values()]) {
      if (entry.id === id) entry.onValue(value);
    }
  }

  monitorCallbacks(id: string) {
    return [...this.monitors.values()].filter((m) => m.id === id);
  }

  listenerCount(id?: string): number {
    const matches = (entry: { id: string }) => id === undefined || entry.id === id;
    return (
      [...this.disconnectListeners.values()].filter(matches).length + [...this.monitors.values()].filter(matches).length
    );
  }
}

const STRAP: LinkTarget = { id: 'strap-1', name: 'H64' };
const OTHER: LinkTarget = { id: 'strap-2', name: 'Other' };

function setup() {
  const scheduler = new FakeScheduler();
  const link = new FakeLink(scheduler);
  const statuses: LinkStatus[] = [];
  const values: string[] = [];
  const state = { needed: true, connectedEvents: 0, linkDownEvents: 0 };
  const supervisor: ConnectionSupervisor = createConnectionSupervisor(
    link,
    {
      onStatus: (status) => statuses.push(status),
      onConnected: () => {
        state.connectedEvents += 1;
      },
      onLinkDown: () => {
        state.linkDownEvents += 1;
      },
      onValue: (value) => values.push(value),
      shouldReconnect: () => state.needed,
    },
    scheduler,
  );
  return { link, scheduler, statuses, values, state, supervisor };
}

describe('connection supervisor', () => {
  it('connects once and holds exactly one disconnect listener and one monitor', async () => {
    const { link, supervisor, statuses } = setup();
    await supervisor.connect(STRAP);

    expect(supervisor.isConnected()).toBe(true);
    expect(link.connectCalls).toEqual(['strap-1']);
    expect(link.listenerCount()).toBe(2);
    expect(statuses).toEqual(['connecting', 'connected']);
  });

  it('does nothing when asked to connect to the strap it is already connected to', async () => {
    const { link, supervisor, state } = setup();
    await supervisor.connect(STRAP);
    await supervisor.connect(STRAP);
    await supervisor.connect(STRAP);

    expect(link.connectCalls).toHaveLength(1);
    expect(link.disconnectCalls).toHaveLength(0);
    expect(state.linkDownEvents).toBe(0);
  });

  it('shares one attempt between concurrent connect calls', async () => {
    const { link, supervisor } = setup();
    await Promise.all([supervisor.connect(STRAP), supervisor.connect(STRAP), supervisor.connect(STRAP)]);

    expect(link.connectCalls).toHaveLength(1);
    expect(link.listenerCount()).toBe(2);
  });

  it('reconnects once after a drop and ends with a single listener pair', async () => {
    const { link, scheduler, supervisor, statuses } = setup();
    await supervisor.connect(STRAP);

    link.drop('strap-1');
    await scheduler.advance(2000);

    expect(supervisor.isConnected()).toBe(true);
    expect(link.connectCalls).toHaveLength(2);
    expect(link.listenerCount()).toBe(2);
    expect(statuses).toEqual(['connecting', 'connected', 'reconnecting', 'connected']);
  });

  it('never multiplies connections or listeners over many drops (the old reconnect storm)', async () => {
    const { link, scheduler, supervisor } = setup();
    await supervisor.connect(STRAP);

    for (let i = 0; i < 30; i++) {
      link.drop('strap-1', i % 2 === 1);
      await scheduler.advance(2000);
      expect(supervisor.isConnected()).toBe(true);
    }

    expect(link.connectCalls).toHaveLength(31);
    expect(link.maxInFlight).toBe(1);
    expect(link.listenerCount()).toBe(2);
    expect(scheduler.pendingTimers()).toBe(0);
  });

  it('keeps retrying one attempt at a time while the strap is away, then reconnects', async () => {
    const { link, scheduler, supervisor, statuses } = setup();
    await supervisor.connect(STRAP);

    link.reachable.delete('strap-1');
    link.drop('strap-1');
    await scheduler.advance(60000);

    expect(supervisor.isConnected()).toBe(false);
    expect(statuses[statuses.length - 1]).toBe('reconnecting');
    expect(link.maxInFlight).toBe(1);
    expect(link.listenerCount()).toBe(0);
    expect(scheduler.pendingTimers()).toBe(1);

    link.reachable.add('strap-1');
    await scheduler.advance(6000);

    expect(supervisor.isConnected()).toBe(true);
    expect(link.listenerCount()).toBe(2);
    expect(statuses[statuses.length - 1]).toBe('connected');
  });

  // The field failure this guards: the strap dropped, and every retry spent the
  // full connect timeout on a device that was not on the air. A direct connect
  // to a remembered address cannot succeed then and cannot notice the strap
  // coming back either, so the loop span forever and only re-pairing by hand
  // (which scans first) brought the sensor back.
  it('stops hammering connect once the strap is off the air and listens for it instead', async () => {
    const { link, scheduler, supervisor } = setup();
    await supervisor.connect(STRAP);

    link.reachable.delete('strap-1');
    link.drop('strap-1');
    await scheduler.advance(60000);

    const blindAttempts = link.connectCalls.length;
    const scansSoFar = link.scanCalls.length;
    expect(blindAttempts).toBeLessThanOrEqual(5);
    expect(scansSoFar).toBeGreaterThan(0);

    // Hours of absence must not add a single further blind connect.
    await scheduler.advance(30 * 60 * 1000);
    expect(link.connectCalls.length).toBe(blindAttempts);
    expect(link.scanCalls.length).toBeGreaterThan(scansSoFar);
    expect(link.maxInFlight).toBe(1);
    expect(link.listenerCount()).toBe(0);
  });

  it('reconnects on its own once the strap starts advertising again', async () => {
    const { link, scheduler, supervisor, state } = setup();
    await supervisor.connect(STRAP);

    link.reachable.delete('strap-1');
    link.drop('strap-1');
    await scheduler.advance(10 * 60 * 1000);
    expect(supervisor.isConnected()).toBe(false);

    // The strap is back on the chest: no user action, no re-pairing.
    link.reachable.add('strap-1');
    await scheduler.advance(45000);

    expect(supervisor.isConnected()).toBe(true);
    expect(link.listenerCount()).toBe(2);
    expect(state.connectedEvents).toBe(2);
  });

  it('falls back to blind retries when the link cannot scan', async () => {
    const { link, scheduler, supervisor } = setup();
    link.waitForDevice = undefined;
    await supervisor.connect(STRAP);

    link.reachable.delete('strap-1');
    link.drop('strap-1');
    await scheduler.advance(60000);

    expect(link.scanCalls).toHaveLength(0);
    const blindAttempts = link.connectCalls.length;
    expect(blindAttempts).toBeGreaterThanOrEqual(3);

    // No way to ask the air, so it keeps paying the connect timeout per cycle.
    await scheduler.advance(60000);
    expect(link.connectCalls.length).toBeGreaterThan(blindAttempts);
    expect(link.maxInFlight).toBe(1);

    link.reachable.add('strap-1');
    await scheduler.advance(30000);
    expect(supervisor.isConnected()).toBe(true);
  });

  it('slows down after a long outage but still reconnects when the strap returns', async () => {
    const { link, scheduler, supervisor } = setup();
    await supervisor.connect(STRAP);

    link.reachable.delete('strap-1');
    link.drop('strap-1');
    await scheduler.advance(10 * 60 * 1000);
    const attemptsSoFar = link.connectCalls.length;
    await scheduler.advance(60000);
    expect(link.connectCalls.length - attemptsSoFar).toBeLessThanOrEqual(2);

    link.reachable.add('strap-1');
    await scheduler.advance(31000);
    expect(supervisor.isConnected()).toBe(true);
  });

  it('stops retrying once the sensor is no longer needed', async () => {
    const { link, scheduler, supervisor, statuses, state } = setup();
    await supervisor.connect(STRAP);

    link.reachable.delete('strap-1');
    link.drop('strap-1');
    await scheduler.advance(3000);
    state.needed = false;
    await scheduler.advance(10000);
    const attempts = link.connectCalls.length;
    await scheduler.advance(60000);

    expect(statuses[statuses.length - 1]).toBe('disconnected');
    expect(link.connectCalls.length).toBe(attempts);
    expect(scheduler.pendingTimers()).toBe(0);
  });

  it('does not reconnect after a drop when nothing needs the sensor', async () => {
    const { link, scheduler, supervisor, statuses, state } = setup();
    state.needed = false;
    await supervisor.connect(STRAP);

    link.drop('strap-1');
    await scheduler.advance(10000);

    expect(link.connectCalls).toHaveLength(1);
    expect(statuses[statuses.length - 1]).toBe('disconnected');
    expect(scheduler.pendingTimers()).toBe(0);
  });

  it('ignores a disconnection event while the strap is in fact still connected', async () => {
    const { link, scheduler, supervisor, state } = setup();
    await supervisor.connect(STRAP);

    link.emitDisconnectEvent('strap-1');
    await scheduler.advance(5000);

    expect(supervisor.isConnected()).toBe(true);
    expect(link.connectCalls).toHaveLength(1);
    expect(state.linkDownEvents).toBe(0);
    expect(link.listenerCount()).toBe(2);
  });

  it('drops late values from a connection that has already been replaced', async () => {
    const { link, scheduler, supervisor, values } = setup();
    await supervisor.connect(STRAP);
    const oldMonitor = link.monitorCallbacks('strap-1')[0];

    link.drop('strap-1');
    await scheduler.advance(2000);
    oldMonitor.onValue('late');
    link.send('strap-1', 'fresh');

    expect(values).toEqual(['fresh']);
  });

  it('resets the link when notifications fail on a connection that is still up', async () => {
    const { link, scheduler, supervisor } = setup();
    await supervisor.connect(STRAP);

    link.monitorCallbacks('strap-1')[0].onError(new Error('notification failed'));
    await scheduler.advance(2000);

    expect(link.disconnectCalls).toEqual(['strap-1']);
    expect(link.connectCalls).toHaveLength(2);
    expect(supervisor.isConnected()).toBe(true);
    expect(link.listenerCount()).toBe(2);
  });

  it('forces a reconnect when a connected strap goes silent, backing off while it stays silent', async () => {
    const { link, scheduler, supervisor } = setup();
    await supervisor.connect(STRAP);

    await scheduler.advance(25000);
    await supervisor.checkStale(20000);
    await scheduler.advance(1000);
    expect(link.connectCalls).toHaveLength(2);
    expect(supervisor.isConnected()).toBe(true);

    // Still silent: the next forced reconnect needs 40 s of silence, not 20 s.
    await scheduler.advance(25000);
    await supervisor.checkStale(20000);
    expect(link.connectCalls).toHaveLength(2);
    await scheduler.advance(20000);
    await supervisor.checkStale(20000);
    await scheduler.advance(1000);
    expect(link.connectCalls).toHaveLength(3);

    // Data flowing again: no forced reconnects at all.
    for (let i = 0; i < 60; i++) {
      link.send('strap-1', `v${i}`);
      await scheduler.advance(1000);
      await supervisor.checkStale(20000);
    }
    expect(link.connectCalls).toHaveLength(3);
  });

  it('retries immediately when the user asks during a backoff wait', async () => {
    const { link, scheduler, supervisor } = setup();
    await supervisor.connect(STRAP);

    link.reachable.delete('strap-1');
    link.drop('strap-1');
    // Past the first failed attempt (1 s wait + a 10 s connect timeout) and
    // into the backoff that follows it, with nothing in flight.
    await scheduler.advance(11500);
    expect(scheduler.pendingTimers()).toBe(1);

    link.reachable.add('strap-1');
    await supervisor.connect(STRAP);

    expect(supervisor.isConnected()).toBe(true);
    expect(scheduler.pendingTimers()).toBe(0);
  });

  it('rejects a failed connect but keeps the retry loop going while the sensor is needed', async () => {
    const { link, scheduler, supervisor, statuses } = setup();
    link.reachable.delete('strap-1');

    const failed = expect(supervisor.connect(STRAP)).rejects.toThrow('Operation was cancelled');
    // Just past the connect timeout, before the scheduled retry fires.
    await scheduler.advance(link.connectTimeoutMs + 500);
    await failed;
    expect(statuses[statuses.length - 1]).toBe('reconnecting');
    expect(scheduler.pendingTimers()).toBe(1);

    link.reachable.add('strap-1');
    await scheduler.advance(2000);
    expect(supervisor.isConnected()).toBe(true);
  });

  it('ends up disconnected after a failed connect when nothing needs the sensor', async () => {
    const { link, scheduler, supervisor, statuses, state } = setup();
    state.needed = false;
    link.reachable.delete('strap-1');

    const failed = expect(supervisor.connect(STRAP)).rejects.toThrow('Operation was cancelled');
    await scheduler.advance(link.connectTimeoutMs + 1000);
    await failed;
    expect(statuses).toEqual(['connecting', 'disconnected']);
    expect(scheduler.pendingTimers()).toBe(0);
  });

  it('disconnects the old strap before switching to another one', async () => {
    const { link, supervisor } = setup();
    await supervisor.connect(STRAP);
    await supervisor.connect(OTHER);

    expect(link.disconnectCalls).toEqual(['strap-1']);
    expect(link.listenerCount('strap-1')).toBe(0);
    expect(link.listenerCount('strap-2')).toBe(2);
    expect(supervisor.getTarget()).toEqual(OTHER);
  });

  it('abandons an attempt that never answers and keeps retrying', async () => {
    const { link, scheduler, supervisor } = setup();
    await supervisor.connect(STRAP);

    link.hanging.add('strap-1');
    link.drop('strap-1');
    await scheduler.advance(90000);

    // Without a deadline the first hung attempt would block every retry.
    expect(link.connectCalls.length).toBeGreaterThanOrEqual(4);
    expect(supervisor.isConnected()).toBe(false);
    expect(scheduler.pendingTimers()).toBeGreaterThanOrEqual(1);

    link.hanging.delete('strap-1');
    await scheduler.advance(40000);
    expect(supervisor.isConnected()).toBe(true);
    expect(link.listenerCount()).toBe(2);
  });

  it('cancels what is left of a dropped link before connecting again', async () => {
    const { link, scheduler, supervisor } = setup();
    await supervisor.connect(STRAP);

    link.drop('strap-1');
    await scheduler.advance(2000);

    expect(link.disconnectCalls).toEqual(['strap-1']);
    expect(supervisor.isConnected()).toBe(true);
  });

  it('lets go of everything on dispose', async () => {
    const { link, scheduler, supervisor } = setup();
    await supervisor.connect(STRAP);
    supervisor.dispose();

    link.drop('strap-1');
    await scheduler.advance(30000);

    expect(link.listenerCount()).toBe(0);
    expect(link.connectCalls).toHaveLength(1);
    expect(scheduler.pendingTimers()).toBe(0);
  });
});
