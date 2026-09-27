# LiveBeat — project context pack

Start here. This `plans/` folder is a self-contained onboarding pack for an agent
(or human) picking up the project in a fresh chat. Read it before touching code so
you understand the *why*, not just the *what*. It reflects the codebase as of the
current `master`.

## What LiveBeat is

A personal **Android** heart-rate tracker built with **Expo / React Native** for a
**Magene H64** BLE chest strap (works with any standard BLE Heart Rate Service
sensor). Two jobs:

1. **Live workout tracking** — treadmill (indoor) and outdoor (GPS route) modes,
   with pulse zones, calories, and a target-zone vibration alert.
2. **All-day background monitoring** — continuous HR + HRV (RMSSD) logging, with
   overnight runs auto-classified as sleep, kept alive by a foreground service.

## Who it's for / how to work on it

- **Platform:** Android only. There is no iOS target — don't add one.
- **Owner:** a solo, self-taught developer (day job: Vue + Node). He directs every
  product and architecture decision and validates on real hardware. Treat him as
  the engineer/PM: explain the *why* of changes, don't just hand him code.
- **Distribution:** the finished app will be given away **free**, on principle
  ("won't charge money for health"). **Never propose monetization, paywalls, ads,
  or subscriptions.**
- **Stage:** this is a **deliberate throwaway prototype** — built to trial the
  technology and let the owner verify HR/HRV/sleep tracking on himself, then be
  rebuilt cleanly ("staged rocket" development; Brooks' "plan to throw one away").
  So: invest in reusable, well-tested patterns; don't gold-plate throwaway UI.

## Read in this order

0. **`getting-started.md`** — how to install, run on the phone, test, and trigger a build
   (start here if you need to *run* it; needs a real Android device + the strap).
1. **`architecture.md`** — layers, data flow, directory map, state stores, DB schema.
2. **`tech-stack.md`** — every library and *why* it was chosen (several are
   Russia-specific constraints that look wrong if you don't know the reason).
3. **`ble-and-monitoring.md`** — the BLE connection subsystem (the most carefully
   engineered part) and the all-day HR/HRV/sleep monitoring.
4. **`workout-and-features.md`** — workouts, zones, calories, GPX export, crash-safe
   draft persistence, stats, screens and navigation.
5. **`build-ci-and-signing.md`** — the GitHub Actions build pipeline and the stable
   APK signing that lets updates install without an uninstall.
6. **`conventions-and-status.md`** — hard rules, the design system, and the current
   open items. **Read the rules section before you commit anything.**

## The three rules you must not break

1. **Git commits must NOT contain any "Claude" / Anthropic co-author or attribution
   line.** This is a firm, repeated instruction from the owner. No exceptions.
2. **Builds use GitHub Actions, not EAS** (the owner is in Russia and cannot pay for
   EAS). Don't migrate the pipeline to EAS.
3. **Keep the app free and Android-only**, and keep the package id
   `com.pulsetracker.app` (see `conventions-and-status.md` for why the "Pulse"
   name lingers in the code on purpose).

## Coordinates

- **Repo:** `github.com/RZhurakovskiy/magene-app-expo-react-native` (public), branch `master`.
- **Local path:** `C:\Users\Роман\Desktop\magene-app-expo-react-native`.
- **App name:** LiveBeat · **package:** `com.pulsetracker.app` · **Expo slug:** `magene-tracker` · **SQLite db:** `pulse.db`.
