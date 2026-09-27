# BLE connection + all-day monitoring

This is the most carefully engineered part of the app. Read it before changing
anything under `src/ble/` or `src/monitoring/`. Most of it is pure, unit-tested logic
— keep it that way.

## The BLE protocol used

Standard Bluetooth **Heart Rate Service** `0x180D`, characteristic **Heart Rate
Measurement** `0x2A37` (notify). The first byte is flags:
- bit 0: BPM value format (0 = uint8, 1 = uint16)
- bit 1: sensor contact detected (valid only if bit 2 set)
- bit 2: sensor contact supported
- bit 3: energy expended present (uint16, skipped)
- bit 4: RR-intervals present (uint16 each, unit 1/1024 s → ms via `raw * 1000 / 1024`)

`src/ble/hrParser.ts` (pure, tested) turns a base64 packet into
`{ bpm, rr[], contact }` where `contact` is `'detected' | 'lost' | 'unsupported'`.
It guards against truncated packets (returns bpm 0 rather than reading undefined).
**Confirmed on the owner's Magene H64: it does emit RR-intervals**, so HRV is real.

## Why the connection layer looks the way it does

`react-native-ble-plx` on Android has three traps this design works around:
1. it never removes `onDeviceDisconnected` listeners by itself;
2. it emits a disconnect event whenever *any* connect attempt for the device ends,
   including failed/timed-out ones;
3. it cancels a live connection if `connectToDevice()` is called again.

The original code registered a fresh listener on every reconnect and started an
independent retry chain from each — so every drop multiplied the chains, the chains
cancelled each other's connections, and the JS thread flooded (flapping status,
frozen UI, lost minutes, "Too many receivers"). The rewrite fixes this structurally.

## The pieces

### `src/ble/heartRate.ts` — the BLE adapter (`bleLink`)
- **One `BleManager` per JS runtime**, cached on `globalThis.__bleManager`. Each
  `new BleManager()` registers Android BroadcastReceivers; recreating it on every
  Fast Refresh leaks them until the 1000 "Too many receivers" limit. Don't change this.
- `requestBlePermissions()` — API 31+ asks BLUETOOTH_SCAN+CONNECT, older asks FINE_LOCATION.
- `scanForHeartRateDevices()` — scans filtered by the HR service UUID.
- `bleLink: BleLink` — the ONLY code that opens/closes the connection. `connect`
  does `connectToDevice(timeout) + discoverAllServicesAndCharacteristics`, and cancels
  a half-open link on discovery failure. `monitor` subscribes to `0x2A37`.

### `src/ble/connectionSupervisor.ts` — owns THE one connection (pure, tested)
A framework-free state machine created with an injected `BleLink` and `Scheduler`
(tests pass fakes; `connectionSupervisor.test.ts` is 480+ lines). Invariants:
- **at most one native connect in flight** (single-flight), at most one retry timer;
- **exactly one disconnect listener + one monitor while connected**, none otherwise;
- every callback is **tagged with the epoch it was created in** and ignored once that
  epoch ends, so a late event from an old connection can't act on the current one.

Behaviour:
- `connect(target)` — user connect; joins an in-flight attempt; switching sensors
  tears the old one down first.
- Background **retry loop** with backoff: fast retries (~1–5 s) for the first ~20
  attempts, then 30 s, and only while `shouldReconnect()` is true.
- `checkStale(ms)` — forces a reconnect when a "connected" link has been silent too
  long (a drop Android never reported); backs off while the strap stays silent.
- Capped `disconnect` and whole-`attempt` timeouts so a hung native call can't wedge
  the single-flight slot.
- `dispose()` — drops listeners/timers without touching the native connection (used
  on Fast Refresh handover).

### `src/ble/contactDetector.ts` — "is the strap really on skin?" (pure, tested)
A chest strap that loses skin contact **does not stop notifying** — the Magene H64
repeats its last BPM for ~a minute. Those packets look live, so they must be kept out
of the stats. Per-sensor detector returns a verdict each sample; loss reasons:
`no-signal` (bpm < 20), `sensor-flag` (contact-lost bit from a strap that reports it),
`no-rr` (an RR-capable strap sending no new beat and no BPM change for ~5 s),
`flatline` (an unchanged BPM for ~30 s on a strap without RR/contact reporting).

### `src/ble/connectionManager.ts` — the glue (app-facing API)
Creates the supervisor with hooks that write into the stores, and runs every sample
through the contact detector before it counts:
- valid sample → `sessionStore.addHrSample(bpm)` + `monitoringStore.onSample(bpm, rr)`;
- no contact / link lost → `clearLiveBpm` / `clearCurrentBpm` so the UI shows `--`
  instead of a frozen number, and nothing is recorded.
- Keeps an **in-memory BLE log** (`getBleLog()`), surfaced in the UI — release builds
  have no Metro console, so this is how the owner reads connection events from the phone.
- Survives Fast Refresh via `globalThis.__hrSupervisor` (retires the old instance,
  picks its device back up).
- Public API: `connectAndSubscribe(id, name)`, `retryConnectionNow()`,
  `recoverIfStale(ms)`, `getBleLog()`. `isSensorNeeded()` = a workout is active OR
  monitoring isn't idle → that's what keeps the reconnect loop alive.

## All-day monitoring

### Foreground service — `src/monitoring/foregroundService.ts`
Notifee ongoing notification on a **LOW-importance** channel with `onlyAlertOnce`
(so content updates are silent) and `asForegroundService: true`. Foreground-service
type `connectedDevice` is set by the config plugin `plugins/withNotifeeForegroundServiceType.js`.
The **same** notification is shared by monitoring and by a workout
(`startWorkoutForegroundService`) — whichever needs the process kept alive.

### Controller — `src/monitoring/monitoringController.ts`
`startMonitoring` (asks notification permission, starts the FGS, `store.start()`),
`pause`/`resume`/`stop`. Two timers while running:
- every **2 s**: `flushIfMinuteEnded()` (flush the minute buffer even if no new sample
  arrived) + refresh the notification text (only when it changed). The body reflects
  connection + contact state ("Подключение…", "Датчик потерян…", "Нет контакта с кожей…",
  or "Текущий пульс: N уд/мин").
- every **10 s**: watchdog → `recoverIfStale(20000)`.
On stop, if a workout is still running it hands the FGS back to the workout.

### Store & persistence — `src/store/monitoringStore.ts`, `src/db/database.ts`
`onSample` buffers samples per wall-clock minute (module-level buffer) and, on a
minute boundary, writes a `monitoring_minutes` row: avg/min/max bpm, sample_count,
`avg_hrv_ms` (RMSSD of that minute's RR list), rr_count. `lastHrvMs` is exposed for
the live screen. A start creates a `monitoring_sessions` row; stop finalizes it via
`computeSessionSummary`.

### HRV — `src/utils/hrv.ts` (pure, tested)
`rmssd(rr[])`: filter to 300–2000 ms, apply **Malik's 20% rule** (skip a beat-to-beat
change > 20% of the previous interval — ectopic/missed beats that would fake a spike),
RMS of the surviving successive differences. Returns null if no usable pair.

### Sleep detection & summary — `src/utils/monitoringStats.ts` (pure, tested)
`classifyKind`: a session ≥ 2 h whose **midpoint** falls in the night window
(22:00–10:00) is `'sleep'`, else `'day'` — no motion sensor needed (a chest strap on
the nightstand gives none; the strategy plays to its strength: clean HR + RR/HRV).
`restingBpm` = 5th percentile of per-minute average BPM. Sleep **stages**
(deep/light/REM) are intentionally out of scope — they need HRV + motion.

### Recovery — `src/db/database.ts`
`closeDanglingSessions()` runs on boot: any `monitoring_sessions` row left open by an
app kill is finalized (end = last recorded minute + 60 s), so a killed session is
still saved.

## Zones & calories (used by workouts and live views)
- `src/utils/heartRateZones.ts` — 5 zones by %max-HR; `estimateMaxHr` is gender-split
  (women: Gulati 206 − 0.88·age; men: 220 − age). Below zone 1 → `NO_ZONE_COLOR`.
  Zone colours are defined here (blue→green→yellow→orange→red).
- `src/utils/calories.ts` — Keytel et al. HR-based kcal/min (needs weight/age/gender),
  integrated over samples (gaps > 5 min skipped). Returns undefined without a profile.
