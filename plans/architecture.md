# Архитектура

## Форма приложения

Однопроцессное приложение на Expo/React Native. Нет бэкенда, нет сетевых запросов, кроме
тайлов карты — всё (данные пульса, тренировки, мониторинг, профиль) хранится на устройстве
в SQLite. Состояние держат три стора Zustand; экраны на них подписаны; тонкий слой BLE
кормит семплы в сторы; слой SQLite сохраняет то, что важно.

```
   BLE-датчик (Magene H64)
        │  нотификации Heart Rate Measurement (0x2A37)
        ▼
  src/ble/heartRate.ts  ── BleLink (единственный код, трогающий BleManager)
        ▼
  src/ble/connectionSupervisor.ts  ── владеет ОДНИМ соединением: single-flight
        │                             connect, один disconnect-листенер, цикл ретраев
        ▼
  src/ble/connectionManager.ts  ── связывает supervisor → сторы; прогоняет каждый семпл
        │                          через контакт-детектор; ведёт BLE-лог
        ├─────────────► useSessionStore   (живая тренировка, статус соединения, контакт)
        └─────────────► useMonitoringStore (суточная сессия мониторинга + поминутный буфер)
                              │
                              ▼
                     src/db/database.ts (expo-sqlite)  ── sessions, minutes, drafts…
                              ▲
   Экраны (src/screens/*) подписаны на сторы, читают/пишут через db,
   навигация через native-stack react-navigation (src/navigation).
```

## Слои и где что лежит

```
App.tsx                     Точка входа: грузим шрифты+БД+профиль, восстанавливаем
                            черновик тренировки, показываем Preloader, монтируем навигатор.
src/
  ble/                      Стек Bluetooth Low Energy (см. ble-and-monitoring.md)
    heartRate.ts            Синглтон BleManager, скан, разрешения, реализация BleLink
    connectionSupervisor.ts Чистая машина состояний, владеющая одним соединением (юнит-тесты)
    connectionManager.ts    Склейка: supervisor + контакт-детектор → сторы + BLE-лог
    contactDetector.ts      Чистая логика «датчик реально на коже?» (юнит-тесты)
    hrParser.ts             Чистый парсер пакета HR Measurement (юнит-тесты)
  monitoring/
    foregroundService.ts    Notifee foreground-сервис (мониторинг + тренировка)
    monitoringController.ts  start/stop/pause мониторинга; таймеры уведомления + stale
    oem.ts, flags.ts        MIUI-диплинки автозапуска; ключи флагов онбординга
  location/
    backgroundLocation.ts   expo-location + task-manager, GPS foreground-сервис
  workout/
    workoutService.ts       Старт/стоп foreground-сервиса тренировки
    workoutDraft.ts         Автосохранение + восстановление тренировки после убийства приложения
    workoutDraftCodec.ts    Кодек + валидация JSON черновика (юнит-тесты)
  store/
    sessionStore.ts         Zustand: соединение, контакт датчика, активная тренировка
    monitoringStore.ts      Zustand: статус мониторинга, текущий bpm, ВСР за последнюю минуту
    profileStore.ts         Zustand: профиль пользователя (вес/возраст/пол)
  db/database.ts            expo-sqlite: схема + все запросы
  screens/*.tsx             По одному файлу на экран (см. workout-and-features.md)
  navigation/               RootNavigator + RootStackParamList
  components/               Общий UI (Preloader, GradientButton, StatTile, графики…)
  utils/                    Чистые хелперы: hrv, heartRateZones, calories, geo, gpx,
                            format, statsAggregation, monitoringStats, id
  types.ts                 Основные доменные типы (WorkoutSession, HrSample, профиль…)
  theme.ts                 Токены дизайна (colors, fonts, spacing, radii, typography)
  __tests__/               Jest-наборы для чистых модулей
```

## Состояние (сторы Zustand)

**`useSessionStore`** (`src/store/sessionStore.ts`) — всё про живой линк и текущую тренировку:
- `connectionStatus`: `'disconnected' | 'connecting' | 'connected' | 'reconnecting'`
- `sensorContact`: `'unknown' | 'ok' | 'lost'` — реально ли датчик читает сердце
  (подключённый датчик вне кожи шлёт *застывшее* значение; контакт-детектор это ловит).
- `connectedDevice`, `lastKnownDevice`
- `activeWorkout`: `{ mode, startedAt, hrSamples[], route[], currentBpm, targetZoneRange }`
- экшены: `startWorkout`, `restoreWorkout` (из черновика), `addHrSample`,
  `clearCurrentBpm` (обнулить живое значение при потере контакта/линка), `appendRoutePoint`,
  `endWorkout`.

**`useMonitoringStore`** (`src/store/monitoringStore.ts`) — суточная сессия:
- `status`: `'idle' | 'active' | 'paused'`, `startedAt`, `sessionId`, `currentBpm`,
  `lastHrvMs` (RMSSD за последнюю завершённую минуту, показывается на экране мониторинга).
- **Буфер на уровне модуля** копит семплы по минутам стенных часов и сбрасывает строку
  `monitoring_minutes` на границе минуты (не по таймеру).
- `onSample(bpm, rr)`, `start`, `pause`, `resume`, `stop`, а также `clearLiveBpm` и
  `flushIfMinuteEnded` (дозаписать буфер, когда минута кончилась, даже если новый семпл не пришёл).

**`useProfileStore`** (`src/store/profileStore.ts`) — `{ weightKg, age, gender }`,
грузится на старте; нужен для калорий и зон с раздельным по полу максимумом пульса.

## Схема SQLite (`pulse.db`, асинхронный API expo-sqlite)

- `sessions` — завершённые тренировки (режим, времена, средний/мин/макс пульс, дистанция,
  темп, `hr_samples` JSON, `route` JSON, `calories_kcal`).
- `profile` — одна строка (id=1): вес/возраст/пол.
- `known_device` — одна строка (id=1): id+имя последнего датчика (авто-переподключение).
- `monitoring_minutes` — PK `minute_ts`; средний/мин/макс bpm, sample_count, `avg_hrv_ms`,
  `rr_count`. Поминутный ряд, лежащий в основе живого и сохранённого вида мониторинга.
- `monitoring_sessions` — по строке на каждый старт→стоп; финализируется с видом
  (`sleep`/`day`), средним/мин/макс/покойным пульсом, minutes_tracked, avg_hrv_ms, has_rr.
- `workout_draft` — одна строка (id=1): JSON-снимок идущей тренировки, переписывается
  каждые ~10 с, чтобы убитое приложение могло восстановиться (см. workout-and-features.md).
- `app_flags` — ключ/значение (напр. флаг «онбординг мониторинга пройден»).

Схема создаётся идемпотентно в `initDatabase()`, с несколькими `ALTER TABLE … ADD COLUMN`
под try/catch для колонок, добавленных после первого релиза (стиль миграций здесь —
аддитивный, никогда не деструктивный, потому что на реальных установках лежат данные).

## Точка входа (`App.tsx`)

На старте: `initDatabase()` → параллельно грузим профиль, последнее известное устройство,
закрываем повисшую после убийства сессию мониторинга и восстанавливаем черновик тренировки;
затем запускаем автосейв черновика. Анимированный **`Preloader`** (SVG, из дизайна) висит,
пока не готовы БД+шрифты и не прошло минимум ~1.4 с. Тёмная тема навигации;
`SafeAreaProvider` + `GestureHandlerRootView` + `NavigationContainer`.

## Принцип «тестируемого ядра»

Вся нетривиальная логика живёт в модулях **без импортов RN**, чтобы работать под Node/Jest:
`hrParser`, `hrv`, `contactDetector`, `connectionSupervisor` (через инъекцию фейков
`BleLink`/`Scheduler`), `workoutDraftCodec`, `monitoringStats`. CI гоняет тесты **до**
сборки gradle, так что сломанная логика блокирует APK. Держи новую логику в чистых модулях
так же.
