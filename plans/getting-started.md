# Getting started (run & verify locally)

Practical day-1 workflow. For *what* the code is, read `architecture.md` first.

## Prerequisites

- **Node 20** (matches CI).
- **A real Android phone.** There is no iOS target, and the core features — BLE strap,
  foreground service, GPS, biometrics — **do not work on an emulator**. You need the
  actual **Magene H64** (or any BLE Heart Rate Service strap) to test HR/monitoring.
- Windows dev box here has **no `keytool`/Java on PATH** and **no `gh` CLI** (OpenSSL is
  available). Builds happen in CI, not locally (see `build-ci-and-signing.md`).

## Install

```
npm ci
```

## Two ways to run on the phone

1. **Dev client + Metro (fast iteration):** install the `livebeat-devclient-apk`
   (from a CI run's artifacts), then on the dev box run:
   ```
   npx expo start --dev-client
   ```
   Open the dev client on the phone (same network) and it loads the JS from Metro.
   Hot reload works. The BLE manager and supervisor are kept on `globalThis` so a Fast
   Refresh doesn't leak receivers or drop the connection.
2. **Standalone (no PC):** install the `livebeat-standalone-apk` — JS is bundled in, runs
   on its own. This is what the owner installs to test away from the desk.

> `npx expo run:android` also works only if a full local Android SDK/Gradle toolchain is
> set up; the supported path here is the CI build + dev client above.

## Quality checks (run before every commit)

```
npx tsc --noEmit     # types clean
npx jest             # currently 6 suites / 55 tests, all green
```

CI (`.github/workflows/build-android.yml`) re-runs `npm test` before the gradle build,
so a red test blocks the APK.

## Trigger a build

Push to `master` (or run the workflow manually). Watch it at
`github.com/RZhurakovskiy/magene-app-expo-react-native/actions`; download the APK from
the run's **Artifacts**. There's no `gh` here — check status in a browser. Signing is
stable, so a new standalone installs over the old app without an uninstall (details:
`build-ci-and-signing.md`).

## What you can and can't verify without hardware

- **Pure logic** (parsing, HRV, contact detection, connection state machine, draft
  codec, stats) is fully covered by Jest — verify these in Node, no device needed.
- **Anything touching BLE, the foreground service, GPS, or biometrics** must be tested on
  the real phone with the strap. Don't claim these work from types/tests alone.

## Committing

- No "Claude"/Anthropic attribution in commit messages (see `conventions-and-status.md`).
- You cannot commit `signing/debug.keystore` (the Bash classifier blocks keystores) — the
  owner does that himself if it ever changes.
