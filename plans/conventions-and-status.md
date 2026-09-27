# Conventions, design system & current status

## Hard rules (do not break)

1. **No "Claude"/Anthropic attribution in git commits.** No co-author line, no
   "Generated with…". Firm, repeated instruction from the owner. Applies to every
   commit and PR body.
2. **GitHub Actions, not EAS** for builds (see `build-ci-and-signing.md`).
3. **Android-only. Free. No monetization** — never propose paywalls/ads/subscriptions.
4. **Keep `applicationId` `com.pulsetracker.app`** and the SQLite db name `pulse.db`.
   Changing either makes the phone treat it as a different app (fresh data / can't
   update in place).
5. **The "Pulse" strings in the code are intentional** — the app was renamed LiveBeat
   only in the visible branding; the package id, `pulse.db`, the location task name
   `pulse-background-location-task`, and the `Ionicons name="pulse"` icon were kept on
   purpose. Don't "fix" them to LiveBeat.
6. **Agent/planning files are gitignored** and must stay out of commits:
   `CLAUDE.md`, `AGENTS.md`, `AGENT_PLAN.md`, `DESIGN_PLAN.md`, `references/`.
   (`plans/` — this folder — is *not* ignored; it's meant to be committed.)
7. **Don't gut the tested core for cosmetics.** The BLE/monitoring/HRV/workout logic
   is deliberately structured and unit-tested; a UI change should not rewrite it.

## Design system (`src/theme.ts`)

- **Palette** (semantic tokens): dark base (`background #0A0A0B`, `surface`,
  `surfaceAlt`, `border`), accent gradient orange→red (`accentStart #FF8A3D` →
  `accentEnd #FF3B5C`), `green #2FD673` (success/logo dot), blues for zone-1/recovery,
  and text tokens (`textPrimary/textSecondary/textMuted`).
- **Font: Manrope**, loaded at runtime via `@expo-google-fonts/manrope` + `useFonts`
  in `App.tsx` (no rebuild to change fonts). Weights exposed as `fonts.regular…extrabold`.
  ⚠️ On **RN 0.86** `Text` is a plain function component, so there is **no global
  font override** — every text style sets `fontFamily` explicitly (see `AppText.tsx`
  and the per-screen styles). Keep doing it per-style.
- **Tokens** also cover `spacing`, `radii`, `typography`, `gradients`. Use these, not
  ad-hoc numbers/colours.
- Zone colours live in `src/utils/heartRateZones.ts` (blue→green→yellow→orange→red).

## Testing & quality gate

- Jest **29** + ts-jest. Pure logic modules only (no RN imports) so they run in Node:
  `hrParser`, `hrv`, `contactDetector`, `connectionSupervisor` (injected fakes),
  `workoutDraftCodec`, `monitoringStats`. **6 suites / 55 tests** currently.
- Before committing: `npx tsc --noEmit` and `npx jest` both clean. CI re-runs the tests
  before the gradle build.
- DB migrations are **additive only** (`ALTER TABLE … ADD COLUMN` guarded by try/catch)
  because real installs carry data.

## Current status (as of the latest build)

- **Reskin shipped:** the Manrope font + the semantic palette are applied across all
  screens and shared components. The animated **Preloader / welcome screen** (from the
  `welcome-screen.jpg` mockup) is built (`src/components/Preloader.tsx`) + a native splash.
- **Reliability shipped by the owner:** the connection supervisor, contact detector,
  crash-safe workout draft, workout foreground service, and an in-app BLE log.
- **Notification:** the monitoring notification updates live (~2 s, silent) and reflects
  connection/contact state.
- **Signing:** stable keystore in place → updates install over the app without an uninstall.

## Open items

1. **FULL Figma redesign is still pending — this is the main next task.** What shipped
   so far is a *reskin* (colours + font), **not** the structural redesign to match the
   owner's mockups. The owner was clear he wants the screens rebuilt to look like his
   Figma screens. **See `redesign-brief.md`.**
2. **Monitoring "self-stop" diagnostic** — the owner saw a monitoring session end after
   ~30 min. Unresolved whether it was an accidental "Стоп" tap or MIUI killing the
   process. Depending on his answer: add a confirm dialog to the Stop button, and/or
   push the MIUI autostart/battery onboarding harder. Ask him before implementing.

## Owner context (how to work with him)

Self-taught developer (day job Vue+Node), learning React Native through this build. He
makes the calls and tests on real hardware; explain the *why*, treat him as engineer/PM.
He's building this as a free personal-health tool and is emotionally invested in it —
be straight with him, don't over-claim, and don't propose charging for it.
