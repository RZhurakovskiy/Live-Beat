# Redesign brief (the next big task)

The owner designed new screens in Figma and wants the app **rebuilt to match them** —
a real, structural redesign, not another reskin. What has shipped so far is only a
colour + font reskin, which he found too subtle ("не понял что поменялось"). Take this
seriously and build to the mockups.

## ⚠️ The mockups are currently missing — get them first

As of 2026-09-25 the **`references/` folder does not exist in the project** — the Figma
mockups were lost when the project was moved to this folder (`references/` is gitignored,
so it never came through git, and the old `magene-tracker` folder was deleted). **Before
starting the redesign, ask the owner to re-export his Figma screens into
`references/`** (or paste them into the chat). Do not invent the design from the summary
below — it's only a partial description of one screen seen earlier.

## The mockups (expected filenames)

They should live in **`references/`** (gitignored — read the image files directly from
disk once restored):

- `welcome-screen.jpg` — onboarding/welcome.
- `screen-setup-initial.jpg`, `screen-setup-completed.jpg` — a **setup screen as a
  checklist** (the two states: nothing done yet vs. all done).
- `screen-1.jpg` … `screen-5.jpg` — the main app screens (mode selection, live workout
  with zone-coloured BPM, results, etc.).

**Read every image before designing** — don't work from this summary alone. What's
known from `welcome-screen.jpg`: dark background, small "● LIVEBEAT" wordmark top-left,
a large rounded hero image, big "LIVEBEAT" title, a bold subhead ("Тренируйся с пульсом
в реальном времени"), muted supporting line, and a full-width orange→red gradient
"Начать →" button. The owner noted the wrist-watch photo in that hero is slightly
off-brand for a **chest strap** and is fine with an abstract pulse graphic instead —
which is exactly what the shipped animated `Preloader` does. Decide with him whether the
welcome uses the Preloader-style graphic or a hero image.

## Likely mockup → screen mapping (confirm against the images)

- welcome → a proper welcome/onboarding entry (today the closest thing is `Preloader`).
- setup-initial/completed → a **unified setup checklist** merging what today is spread
  across Profile + BLE pairing (ScanDevice) + monitoring background permissions.
- screen-1..5 → Home/mode-select, ActiveWorkout (zone-coloured BPM, big), summary/stats,
  monitoring. Match the real screen list in `workout-and-features.md`.

## Rules for the redesign (important)

- **UI / layout / styling only.** Do **NOT** rewrite the tested core: BLE
  (`connectionSupervisor`, `contactDetector`, `connectionManager`, `heartRate`),
  monitoring, HRV, calories, zones, workout draft. Keep the Zustand store contracts and
  the navigation param list working. If a screen needs new data, add a selector — don't
  reshape the stores casually.
- **Use the design system** in `src/theme.ts` (palette, `fonts` = Manrope, `spacing`,
  `radii`, `gradients`, `typography`) and the shared components. Extend the tokens if the
  mockups need new ones; don't hardcode colours.
- **Manrope per-style** (RN 0.86 has no global font override — see
  `conventions-and-status.md`).
- Keep it **Android-first** and phone-width; test on the real device with the owner.
- After each meaningful change: `npx tsc --noEmit` + `npx jest` clean, then a build
  (`build-ci-and-signing.md`) so he can install and react. He iterates by feel on
  hardware — expect several rounds; show him, don't guess silently.
- It's still a **throwaway prototype** — be faithful to the mockups and pragmatic;
  don't over-abstract, but do build the reusable theme/components cleanly since a clean
  rebuild will reuse them.

## Suggested approach

1. Read all `references/*.jpg`.
2. Confirm the mockup→screen mapping and any ambiguities with the owner.
3. Build screen by screen, starting with the ones he sees first (welcome → setup →
   home/mode-select → active workout), pushing a build per milestone so he can test.
