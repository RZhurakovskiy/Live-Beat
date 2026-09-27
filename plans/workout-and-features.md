# Features, screens & navigation

## Navigation (`src/navigation/`)

Native stack, all screens `headerShown:false` (each screen draws its own header).
Initial route **Home**. `RootStackParamList` (`types.ts`) is the source of truth for
screen names and params:

| Screen | Param | Notes |
|---|---|---|
| `Home` | — | Landing / dashboard. |
| `ScanDevice` | — | Modal. Pair a strap. |
| `ActiveWorkout` | — | `gestureEnabled:false` (can't swipe away mid-workout). |
| `WorkoutSummary` | `{ session }` | `gestureEnabled:false`. |
| `History` | — | Biometric-gated. |
| `SessionDetails` | `{ sessionId }` | Biometric-gated; GPX export. |
| `Profile` | — | Modal. weight/age/gender. |
| `Stats` | — | 7d/30d aggregates. |
| `Monitoring` | — | Live all-day monitoring. |
| `MonitoringOnboarding` | — | One-time background-permission setup. |
| `MonitoringHistory` | — | Biometric-gated list of monitoring sessions. |
| `MonitoringSession` | `{ sessionId }` | Biometric-gated; sleep/day detail + HRV. |

## Screens

- **HomeScreen** — brand header; connection status card (tap → ScanDevice); quick
  "reconnect to last strap" button; auto-reconnect to the last known device on mount;
  workout **mode selector** (treadmill/outdoor); **target zone picker** (if profile
  set); "Начать тренировку" (disabled until connected); and a card into daily Monitoring.
- **ScanDeviceScreen** — scans for HR-service devices, connect on tap.
- **ActiveWorkoutScreen** — live zone-coloured BPM, zone pill (% of max), **target-zone
  vibration alert** (vibrates when HR leaves the chosen zone band, with a cooldown),
  `ZoneLegend`, live HR chart, route map (outdoor), stat tiles (time, kcal, and km +
  pace outdoors). Holds the screen awake (`expo-keep-awake`) and runs the workout
  foreground service. Finish → persist a `WorkoutSession` → replace with WorkoutSummary.
- **WorkoutSummaryScreen** — success card + final stat tiles; "Готово" resets to Home.
- **HistoryScreen** — workouts grouped by month; row → SessionDetails.
- **SessionDetailsScreen** — saved workout: stats, HR chart, route map; **GPX share**
  for outdoor sessions (`utils/gpx.ts` + expo-file-system + expo-sharing).
- **StatsScreen** — 7-day / 30-day totals (count, time, distance, kcal, avg HR) and a
  **time-in-zones** bar (`utils/statsAggregation.ts`).
- **ProfileScreen** — weight/age/gender; needed for calories and zones.
- **MonitoringScreen** — start/pause/stop daily monitoring; live BPM (zone-coloured),
  per-minute HRV readout ("ВСР · за последнюю минуту"), today's stats + chart,
  connection/contact banner. First visit redirects to MonitoringOnboarding.
- **MonitoringOnboardingScreen** — OEM-aware (Xiaomi/MIUI) steps to allow background
  running: autostart + battery "no restrictions" via `monitoring/oem.ts` deep-links.
- **MonitoringHistoryScreen** / **MonitoringSessionScreen** — list + detail of saved
  monitoring sessions (sleep/day), resting HR, HRV, per-minute charts.

## Workout modes

- **treadmill** — HR only.
- **outdoor** — HR + GPS route. `src/location/backgroundLocation.ts` registers a
  TaskManager task (`pulse-background-location-task`) and starts
  `Location.startLocationUpdatesAsync` with its **own** foreground service; each fix is
  appended to `activeWorkout.route` via the store. Route drawn by `RouteMap` (MapLibre
  + OpenFreeMap tiles). Distance/pace from `utils/geo.ts`.

## Crash-safe workout persistence (`src/workout/`)

Android can kill the app mid-workout (battery saver, low memory). To not lose a run:
- **`workoutDraft.ts`** — `startWorkoutDraftAutosave()` subscribes to the session store
  and writes the running workout to the `workout_draft` table at most every ~10 s, and
  immediately when the app goes to background (the moment a kill is most likely).
- **`restoreWorkoutDraft()`** (called in `App.tsx` on boot) — brings a killed workout
  back into the store and, for outdoor, restarts GPS tracking.
- **`workoutDraftCodec.ts`** (pure, tested) — encode/decode + validate the draft JSON;
  a malformed or stale draft is dropped.
- **`workoutService.ts`** — `beginWorkoutService()` / `endWorkoutService()` own the
  workout foreground service (endWorkout leaves it running if monitoring still needs it).

## Security / privacy

- History, session details, and monitoring history/detail are gated by
  **`useBiometricGate()`** (`src/hooks/useBiometricGate.ts`): fingerprint/face on focus;
  if the device has no biometrics enrolled it passes through; on failure it navigates back.
- All data is on-device (SQLite). No accounts, no analytics, no network except map tiles.

## Shared UI components (`src/components/`)

`Preloader` (animated SVG splash), `GradientButton`, `StatTile`, `HeartRateChart`
(hand-rolled SVG), `RouteMap` (MapLibre), `ModeToggle`, `TargetZonePicker`,
`ZoneLegend`, `AppText` (applies a Manrope weight). All pull tokens from `src/theme.ts`.
