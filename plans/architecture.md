# Архитектура

## Форма приложения

Однопроцессное приложение на Expo/React Native. Нет бэкенда, нет сетевых запросов, кроме
тайлов карты — всё (данные пульса, тренировки, профиль) хранится на устройстве
в SQLite. Состояние держат два стора Zustand; экраны на них подписаны; тонкий слой BLE
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
  src/ble/connectionManager.ts  ── связывает supervisor → стор; прогоняет каждый семпл
        │                          через контакт-детектор; ведёт BLE-лог
        └─────────────► useSessionStore   (живая тренировка, статус соединения, контакт)
                              │
                              ▼
                     src/db/database.ts (expo-sqlite)  ── sessions, profile, draft…
                              ▲
   Экраны (src/screens/*) подписаны на сторы, читают/пишут через db,
   навигация через native-stack react-navigation (src/navigation).
```

## Слои и где что лежит

```
App.tsx                     Точка входа: грузим шрифты+БД+профиль, восстанавливаем
                            черновик тренировки, показываем Preloader, монтируем навигатор.
src/
  ble/                      Стек Bluetooth Low Energy (см. ble.md)
    heartRate.ts            Синглтон BleManager, скан, разрешения, реализация BleLink
    connectionSupervisor.ts Чистая машина состояний, владеющая одним соединением (юнит-тесты)
    connectionManager.ts    Склейка: supervisor + контакт-детектор → сторы + BLE-лог
    contactDetector.ts      Чистая логика «датчик реально на коже?» (юнит-тесты)
    hrParser.ts             Чистый парсер пакета HR Measurement (юнит-тесты)
    bleLog.ts               Диагностический лог в памяти + подписка (экран «Журнал датчика»)
  location/
    backgroundLocation.ts   expo-location + task-manager, GPS foreground-сервис
  workout/
    foregroundService.ts    Notifee foreground-сервис тренировки
    workoutService.ts       Старт/стоп сервиса + watchdog «тихого» обрыва BLE
    workoutDraft.ts         Автосохранение + восстановление тренировки после убийства приложения
    workoutDraftCodec.ts    Кодек + валидация JSON черновика (юнит-тесты)
    workoutTime.ts          Время тренировки за вычетом пауз (юнит-тесты)
    workoutSession.ts       Сборка сохраняемой сессии — одна на все пути (юнит-тесты)
    voiceCoach.ts           Голосовой коуч: слушает стор и говорит (решает utils/voiceCoach.ts)
    activities.ts           Виды тренировок и их свойства (юнит-тесты)
  store/
    sessionStore.ts         Zustand: соединение, контакт датчика, активная тренировка
    profileStore.ts         Zustand: профиль пользователя (вес/возраст/пол)
  db/database.ts            expo-sqlite: схема + все запросы
  data/historyTransfer.ts   Выгрузка/загрузка всей истории файлом (файлы, «Поделиться»)
  onboarding.ts             Ключ флага «интро пройдено»
  screens/*.tsx             По одному файлу на экран (см. workout-and-features.md)
  navigation/               RootNavigator (стек) + TabNavigator (3 вкладки) + типы
  components/               Общий UI: каркас экрана, блоки, графики (см. workout-and-features.md)
  utils/                    Чистые хелперы: heartRateZones, zoneTime, calories, geo, gpx,
                            format, statsAggregation, progress, id,
                            historyFile (формат файла истории), splits (сплиты по км),
                            recovery (пульс восстановления), goals (цели недели),
                            voiceCoach (что и когда говорить), calmDown (спад пульса на
                            йоге) — все с тестами
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

Плюс `liveBpm` — последнее показание датчика вне зависимости от тренировки (нужно чек-листу
настройки и экрану режима), и `pendingSession` — завершённая тренировка, ждущая сохранения
на экране итогов после перезапуска приложения.

**`useProfileStore`** (`src/store/profileStore.ts`) — `{ weightKg, age, gender }`,
грузится на старте; нужен для калорий и зон с раздельным по полу максимумом пульса.

## Схема SQLite (`pulse.db`, асинхронный API expo-sqlite)

- `sessions` — завершённые тренировки (режим, времена, средний/мин/макс пульс, дистанция,
  темп, `hr_samples` JSON, `route` JSON, `calories_kcal`).
- `profile` — одна строка (id=1): вес/возраст/пол.
- `known_device` — одна строка (id=1): id+имя последнего датчика (авто-переподключение).
- `workout_draft` — одна строка (id=1): JSON-снимок идущей тренировки, переписывается
  каждые ~10 с, чтобы убитое приложение могло восстановиться (см. workout-and-features.md).
- `app_flags` — ключ/значение; generic-хелперы `getFlag`/`setFlag` пригодятся новому онбордингу.

Схема создаётся идемпотентно в `initDatabase()`, с несколькими `ALTER TABLE … ADD COLUMN`
под try/catch для колонок, добавленных после первого релиза (стиль миграций здесь —
аддитивный, никогда не деструктивный, потому что на реальных установках лежат данные).

Таблиц `monitoring_minutes` / `monitoring_sessions` больше нет: суточный мониторинг удалён
29.09.2026. Они **не дропаются** — на уже установленных телефонах остаются со своими данными,
просто ничто их не создаёт и не читает.

## Точка входа (`App.tsx`)

На старте: `initDatabase()` → параллельно грузим профиль, последнее известное устройство и
восстанавливаем черновик тренировки; затем запускаем автосейв черновика. Анимированный **`Preloader`** (SVG, из дизайна) висит,
пока не готовы БД+шрифты и не прошло минимум ~1.4 с. Тёмная тема навигации;
`SafeAreaProvider` + `GestureHandlerRootView` + `NavigationContainer`.

## Принцип «тестируемого ядра»

Вся нетривиальная логика живёт в модулях **без импортов RN**, чтобы работать под Node/Jest:
`hrParser`, `contactDetector`, `connectionSupervisor` (через инъекцию фейков
`BleLink`/`Scheduler`), `workoutDraftCodec`, `workoutTime`, `workoutSession`, `zoneTime`,
`format`, `progress`. CI гоняет тесты **до**
сборки gradle, так что сломанная логика блокирует APK. Держи новую логику в чистых модулях
так же.
