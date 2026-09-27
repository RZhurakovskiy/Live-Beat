# Build, CI & signing

## Builds are GitHub Actions, not EAS

The owner is in Russia and **cannot pay for EAS**; the free EAS queue can stall 50+
minutes. So native APKs are built on GitHub's free hosted runners.
`.github/workflows/build-android.yml`:

1. checkout → setup-node 20 → setup-java 17
2. `npm ci`
3. **`npm test`** — jest gate; failing tests block the APK.
4. `npx expo prebuild --platform android --clean`
5. **copy the stable keystore** (see below) — guarded, so it's a no-op if absent.
6. `./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a`
7. `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`
8. upload artifacts: **`livebeat-devclient-apk`** and **`livebeat-standalone-apk`**.

- `eas.json` exists at the root as a **fallback only**. If EAS is ever truly needed,
  run `npx eas-cli` directly — do **not** add `eas-cli` to `package.json` (its
  `dtrace-provider` dep broke the install before).

## The two APKs

- **dev-client** (`assembleDebug` → `livebeat-devclient-apk`): needs a Metro bundler
  (`expo start`) reachable — for iterating from the dev machine.
- **standalone** (`assembleRelease` → `livebeat-standalone-apk`): JS is bundled in;
  runs with no PC. **This is what the owner installs to test away from the desk.**
- **arm64-v8a only** — building all ABIs made the APK ~95 MB; arm64-only is what his
  phone needs and keeps it small.

## Triggering a build

Push to `master` (or `main`), or run the workflow manually (`workflow_dispatch`).
There is **no `gh` CLI** in this environment; to check a run, read the Actions page in
a browser: `github.com/RZhurakovskiy/magene-app-expo-react-native/actions`.

## Stable APK signing (so updates don't force an uninstall)

**Problem:** `expo prebuild --clean` regenerates a **random** `debug.keystore` every
run. Since the release build is signed with the debug signingConfig, every build had a
**different signature** → Android refused to update-install and forced a full uninstall
(losing the user's data) on every new build.

**Fix:** a fixed keystore is committed at **`signing/debug.keystore`** and copied over
the generated `android/app/debug.keystore` after prebuild (step 5). It's a PKCS12
keystore (made with OpenSSL — the dev box has no `keytool`) using the standard Android
debug credentials: alias `androiddebugkey`, store & key password `android`, which match
the Expo debug signingConfig, so no gradle patching is needed. Both dev-client and
standalone are then signed with the **same** key → new builds install over the existing
app and keep its data.

- The generated `android/` folder is gitignored; only `signing/debug.keystore` is
  committed (`.gitignore` blocks `*.jks`/`*.p12`/`*.pem` but not `*.keystore`).
- Committing a debug keystore is safe/standard for a sideloaded personal app (its
  password is public). A real Play Store upload key would be a separate secret, never
  committed.

> ⚠️ **Claude cannot commit the keystore.** The Bash auto-approval classifier blocks
> committing any `*.keystore` file as credential leakage, even this public debug key.
> If the keystore ever needs to change, the **owner** must run the `git add … && git
> commit && git push` for it himself.

## Local checks before any commit

```
npx tsc --noEmit      # types
npx jest              # 6 suites, 55 tests (as of now)
```

`tsconfig.json` needs `isolatedModules`, `rootDir: "."`, and
`exclude: ["node_modules","src/__tests__"]` for the TS 6 + ts-jest combo. Jest is
pinned to 29 (SDK 57 compatibility).
