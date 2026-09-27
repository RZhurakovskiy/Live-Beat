# Tech stack & why

## Runtime / toolchain

- **Expo SDK 57** (managed workflow with `expo prebuild` for native builds).
- **React Native 0.86.3**, **React 19.2.3**, **New Architecture (Fabric) enabled**, **Hermes**.
- **TypeScript ~6.0** (strict). Jest **29** + ts-jest (pinned to 29 to match SDK 57;
  jest 30 was flagged by `expo-doctor`).
- Native builds produced by **GitHub Actions**, arm64-v8a only (see `build-ci-and-signing.md`).

> ⚠️ **RN 0.86 is not the RN in most training data.** Notably, `Text` is a plain
> function component (Flow `component(...)`), **not** `forwardRef` — so the classic
> global-font monkey-patch (`Text.render = …`) does **not** work here. Fonts are
> applied per-style instead. Verify version-sensitive assumptions against the
> installed packages before relying on them.

## Libraries and the reason each is here

| Library | Role | Why this one |
|---|---|---|
| `react-native-ble-plx` ^3.5 | BLE central (connect strap, subscribe to HR) | Standard, maintained BLE lib. Its Android quirks are the whole reason `connectionSupervisor.ts` exists — see `ble-and-monitoring.md`. |
| `@maplibre/maplibre-react-native` ^11 | Outdoor route map | **NOT Google Maps / `react-native-maps`.** Google Play Services + Maps API keys are unreliable/hard to obtain in Russia. MapLibre + free OpenFreeMap OSM vector tiles needs no key and no Google dependency. |
| `@notifee/react-native` ^9 | Foreground-service notification | Keeps the JS process (and the BLE subscription) alive for all-day monitoring and during workouts. Type `connectedDevice` set via a local config plugin. RN Directory marks it "Unmaintained" — a metadata quirk; it's excluded in `package.json` → `expo.doctor`. Don't "fix" it. |
| `expo-sqlite` ~57 | On-device storage | Async API. All persistence. |
| `zustand` ^5 | State management | Light stores; also used *outside React* (the BLE layer and draft autosave call `useStore.getState()` / `.subscribe()` directly). |
| `@react-navigation/native` + `native-stack` ^7 | Navigation | Native stack; all screens use custom headers (`headerShown:false`). |
| `react-native-svg` 15 | Charts + Preloader | The HR chart and the animated splash are hand-drawn SVG. |
| `expo-location` + `expo-task-manager` ~57 | GPS route in outdoor mode | Background location via a registered task + its own foreground service. |
| `expo-local-authentication` ~57 | Biometric gate on history/stats | Protects saved health data behind fingerprint/face. |
| `expo-file-system` + `expo-sharing` ~57 | GPX export | Write a `.gpx` for an outdoor session and share it. |
| `expo-device` + `expo-intent-launcher` ~57 | MIUI autostart deep-links | The owner's phone is Xiaomi/MIUI, which kills background apps aggressively; onboarding deep-links to autostart + battery settings. |
| `@expo-google-fonts/manrope` ^0.4 | App font (Manrope) | Loaded at runtime via `useFonts` (no native rebuild to change fonts). Applied per text style via `src/theme.ts` `fonts`. |
| `expo-linear-gradient` ~57 | The orange→red accent gradient (buttons, ring) | Brand accent. |
| `react-native-gesture-handler`, `react-native-screens`, `react-native-safe-area-context` | Navigation/gesture/safe-area substrate | Standard RN nav deps. |
| `expo-keep-awake` | Keep screen on during an active workout | — |

## Things that were deliberately removed / avoided

- **`react-native-gifted-charts`** — had a confirmed upstream infinite-re-render bug
  ("Maximum update depth exceeded") on frequently-updating live data. Replaced with a
  small hand-rolled SVG chart in `src/components/HeartRateChart.tsx`. Don't re-add it
  for live charts.
- **`eas-cli` as a devDependency** — broke the build (dtrace-provider). If EAS is ever
  needed as a fallback, use `npx eas-cli` directly; do not add it to `package.json`.
- **Google Maps / Play-Services-dependent libs** — avoided for the RU constraint above.

## Config plugins (local, in `plugins/`)

- `withNotifeeForegroundServiceType.js` — sets
  `foregroundServiceType="connectedDevice"` on Notifee's foreground service in the
  generated `AndroidManifest`, required for an all-day BLE foreground service.

## app.json highlights

- `android.package = com.pulsetracker.app` (kept stable on purpose — see conventions).
- Adaptive + monochrome icons; dark `userInterfaceStyle`.
- Permissions: Bluetooth (scan/connect/admin), fine+coarse+background location,
  foreground service (+location +connectedDevice), POST_NOTIFICATIONS, biometric, vibrate.
- Plugins: `react-native-ble-plx` (background disabled, `neverForLocation`),
  `expo-sqlite`, `expo-location`, the local Notifee plugin, and a native splash.
