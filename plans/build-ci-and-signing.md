# Сборка, CI и подпись

## Сборки на GitHub Actions, не на EAS

Владелец в России и **не может оплатить EAS**; бесплатная очередь EAS может простаивать 50+
минут. Поэтому нативные APK собираются на бесплатных hosted-раннерах GitHub.
`.github/workflows/build-android.yml`:

1. checkout → setup-node 20 → setup-java 17
2. `npm ci`
3. **`npm test`** — гейт jest; упавшие тесты блокируют APK.
4. `npx expo prebuild --platform android --clean`
5. **подставить стабильный keystore** (см. ниже) — под guard'ом, так что no-op, если его нет.
6. `./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a`
7. `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`
8. загрузить артефакты: **`livebeat-devclient-apk`** и **`livebeat-standalone-apk`**.

- `eas.json` лежит в корне как **запасной вариант**. Если EAS реально понадобится, запускай
  `npx eas-cli` напрямую — **не** добавляй `eas-cli` в `package.json` (его зависимость
  `dtrace-provider` ломала установку раньше).

## Два APK

- **dev-client** (`assembleDebug` → `livebeat-devclient-apk`): нужен доступный Metro-бандлер
  (`expo start`) — для итераций с рабочей машины.
- **standalone** (`assembleRelease` → `livebeat-standalone-apk`): JS вшит внутрь; работает
  без ПК. **Именно его владелец ставит, чтобы тестировать вдали от стола.**
- **только arm64-v8a** — сборка всех ABI давала APK ~95 МБ; только-arm64 — то, что нужно его
  телефону, и держит размер маленьким.

## Как запустить сборку

Пуш в `master` (или `main`), либо запуск воркфлоу вручную (`workflow_dispatch`).
В этом окружении **нет `gh` CLI**; чтобы проверить запуск, открой страницу Actions в браузере:
`github.com/RZhurakovskiy/magene-app-expo-react-native/actions`.

## Стабильная подпись APK (чтобы обновления не требовали удаления)

**Проблема:** `expo prebuild --clean` пересоздаёт **случайный** `debug.keystore` каждый прогон.
Так как release подписывается debug-конфигом, у каждой сборки была **другая подпись** → Android
отказывался обновлять поверх и требовал полного удаления (с потерей данных) на каждой новой сборке.

**Решение:** фиксированный keystore закоммичен в **`signing/debug.keystore`** и копируется
поверх сгенерированного `android/app/debug.keystore` после prebuild (шаг 5). Это PKCS12-keystore
(сделан OpenSSL — на dev-машине нет `keytool`) со стандартными Android debug-реквизитами:
alias `androiddebugkey`, пароль стораджа и ключа `android`, что совпадает с debug signingConfig
Expo, поэтому патчить gradle не нужно. И dev-client, и standalone подписываются **одним** ключом
→ новые сборки ставятся поверх существующего приложения и сохраняют данные.

- Сгенерированная папка `android/` в gitignore; коммитится только `signing/debug.keystore`
  (`.gitignore` блокирует `*.jks`/`*.p12`/`*.pem`, но не `*.keystore`).
- Коммитить debug-keystore безопасно/стандартно для личного sideload-приложения (его пароль
  публичный). Реальный upload-ключ для Play Store был бы отдельным секретом, никогда не коммитится.

> ⚠️ **Claude не может закоммитить keystore.** Bash-классификатор авто-аппрува блокирует коммит
> любого `*.keystore` как утечку учётных данных, даже этого публичного debug-ключа. Если keystore
> когда-либо нужно поменять, **владелец** запускает `git add … && git commit && git push` для него сам.

## Локальные проверки перед любым коммитом

```
npx tsc --noEmit      # типы
npx jest              # 4 набора, 46 тестов (на текущий момент)
```

`tsconfig.json` требует `isolatedModules`, `rootDir: "."` и
`exclude: ["node_modules","src/__tests__"]` для связки TS 6 + ts-jest. Jest закреплён на 29
(совместимость с SDK 57).
