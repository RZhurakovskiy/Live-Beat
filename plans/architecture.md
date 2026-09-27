# Architecture

## Shape of the app

A single-process Expo/React Native app. No backend, no network calls except the map
tiles — everything (HR data, workouts, monitoring, profile) lives on-device in
SQLite. State is held in three Zustand stores; screens subscribe to them; a thin BLE
layer feeds samples into the stores; a SQLite layer persists what matters.

```
   BLE strap (Magene H64)
        │  Heart Rate Measurement notifications (0x2A37)
        ▼
  src/ble/heartRate.ts  ── BleLink (the only code that touches BleManager)
        ▼
  src/ble/connectionSupervisor.ts  ── owns THE one connection: single-flight
        │                             connect, one disconnect listener, retry loop
        ▼
  src/ble/connectionManager.ts  ── wires supervisor → stores; runs each sample
        │                          through the contact detector; keeps a BLE log
        ├─────────────► useSessionStore   (live workout, connection status, contact)
        └─────────────► useMonitoringStore (all-day monitoring session + per-minute buffer)
                              │
                              ▼
                     src/db/database.ts (expo-sqlite)  ── sessions, minutes, drafts…
                              ▲
   Screens (src/screens/*) subscribe to stores, read/write via db,
   navigate via react-navigation native stack (src/navigation).
```

## Layers and where things live

```
App.tsx                     Entry: load fonts+db+profile, restore workout draft,
                            show Preloader, then mount the navigator.
src/
  ble/                      Bluetooth Low Energy stack (see ble-and-monitoring.md)
    heartRate.ts            BleManager singleton, scan, permissions, the BleLink impl
    connectionSupervisor.ts Pure state machine that owns one connection (unit-tested)
    connectionManager.ts    Glue: supervisor + contact detector → stores + BLE log
    contactDetector.ts      Pure "is the strap really on skin?" logic (unit-tested)
    hrParser.ts             Pure parser for the HR Measurement packet (unit-tested)
  monitoring/
    foregroundService.ts    Notifee foreground-service notification (monitoring + workout)
    monitoringController.ts  start/stop/pause monitoring; notification + stale timers
    monitoringController…    (also flags/oem helpers under monitoring/)
    oem.ts, flags.ts        MIUI autostart deep-links; onboarding flag keys
  location/
    backgroundLocation.ts   expo-location + task-manager GPS foreground service
  workout/
    workoutService.ts       Start/stop the workout foreground service
    workoutDraft.ts         Autosave + restore a running workout across app kills
    workoutDraftCodec.ts    Encode/decode + validate the draft JSON (unit-tested)
  store/
    sessionStore.ts         Zustand: connection, sensor contact, active workout
    monitoringStore.ts      Zustand: monitoring status, current bpm, last-minute HRV
    profileStore.ts         Zustand: user profile (weight/age/gender)
  db/database.ts            expo-sqlite: schema + all queries
  screens/*.tsx             One file per screen (see workout-and-features.md)
  navigation/               RootNavigator + RootStackParamList
  components/               Shared UI (Preloader, GradientButton, StatTile, charts…)
  utils/                    Pure helpers: hrv, heartRateZones, calories, geo, gpx,
                            format, statsAggregation, monitoringStats, id
  types.ts                 Core domain types (WorkoutSession, HrSample, profile…)
  theme.ts                 Design tokens (colors, fonts, spacing, radii, typography)
  __tests__/               Jest suites for the pure modules
```

## State (Zustand stores)

**`useSessionStore`** (`src/store/sessionStore.ts`) — everything about the live link
and the current workout:
- `connectionStatus`: `'disconnected' | 'connecting' | 'connected' | 'reconnecting'`
- `sensorContact`: `'unknown' | 'ok' | 'lost'` — is the strap actually reading a heart
  (a connected strap off the skin sends a *frozen* value; contact detection catches it).
- `connectedDevice`, `lastKnownDevice`
- `activeWorkout`: `{ mode, startedAt, hrSamples[], route[], currentBpm, targetZoneRange }`
- actions: `startWorkout`, `restoreWorkout` (from a draft), `addHrSample`,
  `clearCurrentBpm` (blank the live value when contact/link is lost), `appendRoutePoint`,
  `endWorkout`.

**`useMonitoringStore`** (`src/store/monitoringStore.ts`) — the all-day session:
- `status`: `'idle' | 'active' | 'paused'`, `startedAt`, `sessionId`, `currentBpm`,
  `lastHrvMs` (RMSSD of the last completed minute, shown on the monitoring screen).
- A **module-level** buffer accumulates samples per wall-clock minute and flushes a
  `monitoring_minutes` row on each minute boundary (not on a timer).
- `onSample(bpm, rr)`, `start`, `pause`, `resume`, `stop`, plus `clearLiveBpm`.

**`useProfileStore`** (`src/store/profileStore.ts`) — `{ weightKg, age, gender }`,
loaded on boot; used for calories and gender-split max-HR zones.

## SQLite schema (`pulse.db`, via expo-sqlite async API)

- `sessions` — finished workouts (mode, times, avg/min/max HR, distance, pace,
  `hr_samples` JSON, `route` JSON, `calories_kcal`).
- `profile` — single row (id=1): weight/age/gender.
- `known_device` — single row (id=1): last paired strap id+name (auto-reconnect).
- `monitoring_minutes` — PK `minute_ts`; avg/min/max bpm, sample_count, `avg_hrv_ms`,
  `rr_count`. The per-minute time series behind both live and saved monitoring views.
- `monitoring_sessions` — one row per start→stop; finalized with kind
  (`sleep`/`day`), avg/min/max/resting bpm, minutes_tracked, avg_hrv_ms, has_rr.
- `workout_draft` — single row (id=1): JSON snapshot of the running workout, rewritten
  every ~10 s so a killed app can resume (see workout-and-features.md).
- `app_flags` — key/value (e.g. the monitoring-onboarding-done flag).

Schema is created idempotently in `initDatabase()`, with a few `ALTER TABLE … ADD
COLUMN` guarded by try/catch for columns added after the first release (migration
style used here — additive, never destructive, because real installs carry data).

## Entry point (`App.tsx`)

On boot: `initDatabase()` → in parallel load profile, load last known device, close
any monitoring session left dangling by a kill, and restore a workout draft; then
start the draft autosave. The animated **`Preloader`** (SVG, from the design) stays
up until db+fonts are ready and a minimum ~1.4 s has passed. Dark navigation theme;
`SafeAreaProvider` + `GestureHandlerRootView` + `NavigationContainer`.

## Testable-core principle

All non-trivial logic lives in **RN-import-free** modules so it runs under Node/Jest:
`hrParser`, `hrv`, `contactDetector`, `connectionSupervisor` (via injected
`BleLink`/`Scheduler` fakes), `workoutDraftCodec`, `monitoringStats`. CI runs the
tests **before** the gradle build, so failing logic blocks the APK. Keep new logic
in pure modules the same way.
