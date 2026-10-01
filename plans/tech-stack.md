# Стек технологий и почему

## Рантайм / тулчейн

- **Expo SDK 57** (managed workflow с `expo prebuild` для нативных сборок).
- **React Native 0.86.3**, **React 19.2.3**, **включена New Architecture (Fabric)**, **Hermes**.
- **TypeScript ~6.0** (strict). Jest **29** + ts-jest (закреплён на 29 под SDK 57;
  jest 30 ругался `expo-doctor`).
- Нативные сборки делает **GitHub Actions**, только arm64-v8a (см. `build-ci-and-signing.md`).

> ⚠️ **RN 0.86 — это не тот RN, что в большинстве обучающих данных.** В частности, `Text`
> здесь — обычный функциональный компонент (Flow `component(...)`), **а не** `forwardRef` —
> поэтому классический глобальный патч шрифта (`Text.render = …`) тут **не работает**.
> Шрифт задаётся по-стилево, в каждом стиле. Проверяй версионно-зависимые допущения по
> установленным пакетам, прежде чем на них полагаться.

## Библиотеки и зачем каждая

| Библиотека | Роль | Почему именно она |
|---|---|---|
| `react-native-ble-plx` ^3.5 | BLE-центральный (коннект датчика, подписка на пульс) | Стандартная поддерживаемая BLE-либа. Её Android-причуды — вся причина, почему существует `connectionSupervisor.ts` (см. `ble.md`). |
| `@maplibre/maplibre-react-native` ^11 | Карта уличного маршрута | **НЕ Google Maps / `react-native-maps`.** Google Play Services + ключи Maps API в России ненадёжны/труднодоступны. MapLibre + бесплатные векторные тайлы OpenFreeMap (OSM) не требуют ключа и вообще зависимости от Google. |
| `@notifee/react-native` ^9 | Уведомление foreground-сервиса | Держит JS-процесс (и подписку BLE) живым на время тренировки. Тип `connectedDevice` ставится локальным config-плагином. RN Directory помечает её «Unmaintained» — это причуда метаданных; исключено в `package.json` → `expo.doctor`. Не «чини». |
| `expo-sqlite` ~57 | Хранилище на устройстве | Асинхронный API. Вся персистентность. |
| `zustand` ^5 | Управление состоянием | Лёгкие сторы; используются и *вне React* (слой BLE и автосейв черновика зовут `useStore.getState()` / `.subscribe()` напрямую). |
| `@react-navigation/native` + `native-stack` ^7 | Навигация | Нативный стек; у всех экранов свои хедеры (`headerShown:false`). |
| `react-native-svg` 15 | Графики + Preloader | HR-график и анимированный сплэш нарисованы вручную SVG. |
| `expo-location` + `expo-task-manager` ~57 | GPS-маршрут в уличном режиме | Фоновая геолокация через зарегистрированную задачу + собственный foreground-сервис. |
| `expo-file-system` + `expo-sharing` ~57 | Экспорт GPX | Пишет `.gpx` для уличной сессии и делится им. |
| `@expo-google-fonts/manrope` ^0.4 | Шрифт приложения (Manrope) | Грузится в рантайме через `useFonts` (без нативной пересборки для смены шрифтов). Применяется по-стилево через `src/theme.ts` `fonts`. |
| `expo-linear-gradient` ~57 | Акцентный градиент оранжевый→красный (кнопки, кольцо) | Брендовый акцент. |
| `react-native-gesture-handler`, `react-native-screens`, `react-native-safe-area-context` | Подложка навигации/жестов/safe-area | Стандартные зависимости RN-навигации. |
| `expo-keep-awake` | Не гасить экран во время активной тренировки | — |
| `react-native-view-shot` 5.1 | Карточка тренировки картинкой | Снимает собранный из обычных вью блок в PNG. Карта MapLibre в снимок не попадает, поэтому маршрут на карточке рисуется SVG по точкам. Нативная, нужна сборка в CI. |
| `react-native-android-widget` 0.22 | Виджет «Эта неделя» на рабочий стол | Expo сам виджеты не умеет. Библиотека рисует виджет своими примитивами (`FlexWidget`, `TextWidget`), подключается config-плагином (`app.json`), обработчик регистрируется в `index.ts`. |
| `expo-speech` ~57 | Голосовые подсказки на тренировке | Системный синтезатор Android (TTS), без сети и без ключей. Русский голос должен быть установлен на телефоне; настройки это проверяют и подсказывают, где его поставить. Манифест (`queries` на `TTS_SERVICE`) библиотека добавляет сама. Звук таймеров (веха 5) идёт через неё же, отдельная аудиобиблиотека не нужна. |

## Что намеренно удалено / чего избегаем

- **`react-native-gifted-charts`** — подтверждённый апстрим-баг бесконечного ре-рендера
  («Maximum update depth exceeded») на часто обновляющихся живых данных. Заменён маленьким
  самописным SVG-графиком в `src/components/HeartRateChart.tsx`. Не возвращай её для живых
  графиков.
- **`eas-cli` как devDependency** — ломала установку (dtrace-provider). Если EAS когда-либо
  понадобится как запасной вариант, используй `npx eas-cli` напрямую; не добавляй в `package.json`.
- **Google Maps / либы, зависящие от Play Services** — избегаем из-за российского ограничения выше.

## Config-плагины (локальные, в `plugins/`)

- `withNotifeeForegroundServiceType.js` — ставит
  `foregroundServiceType="connectedDevice"` на foreground-сервис Notifee в сгенерированном
  `AndroidManifest`: с Android 14 тип foreground-сервиса обязателен, а сервис тренировки
  держит связь с BLE-ремнём.

## Ключевое из app.json

- `android.package = com.pulsetracker.app` (намеренно оставлен стабильным — см. conventions).
- Adaptive + monochrome иконки; тёмный `userInterfaceStyle`.
- Разрешения: Bluetooth (scan/connect/admin), fine+coarse+background геолокация,
  foreground service (+location +connectedDevice), POST_NOTIFICATIONS, вибрация.
  Биометрии нет: `expo-local-authentication` и разрешения `USE_BIOMETRIC` / `USE_FINGERPRINT`
  удалены вместе с гейтом на истории (30.09.2026, `archive/field-fixes.md` п. 11). Не возвращать.
- Плагины: `react-native-ble-plx` (фон выключен, `neverForLocation`),
  `expo-sqlite`, `expo-location`, локальный Notifee-плагин и нативный сплэш.
- Нативный сплэш (`expo-splash-screen`): фон `#0A0A0B`, картинка `splash-ring.png` шириной
  220 dp. Это первый кадр `Preloader`, исходник `assets/src/splash-ring.svg`: меняешь
  геометрию или цвета прелоадера, перерисуй и его (`archive/field-fixes.md`, п. 8).
- `backgroundColor: #0A0A0B` на верхнем уровне: через `expo-system-ui` это фон окна, без
  светлой вспышки до первого кадра React.
