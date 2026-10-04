import type { WorkoutMode } from '../types';

// Виды тренировок и чем они отличаются. Экраны спрашивают свойства вида («есть ли GPS»,
// «темп или скорость»), а не сравнивают строки режима: иначе каждый новый вид пришлось бы
// дописывать в десяток `mode === 'outdoor'` по всему коду. Чистый модуль без React Native.
//
// Ключи режимов в базе не меняются: `outdoor` и `treadmill` были с самого начала, и
// сохранённые тренировки должны читаться как прежде.

/** Описание вида тренировки. */
export interface Activity {
  mode: WorkoutMode;
  /** Название на карточке выбора: «На улице». */
  title: string;
  /**
   * Короткое название для плитки в сетке выбора: плитка в четверть ширины экрана, и
   * «На улице» или «Кроссфит» при крупном системном шрифте в неё не помещаются.
   */
  tileTitle: string;
  /** Название тренировки в истории, итогах и деталях: «Уличная тренировка». */
  sessionTitle: string;
  /** Пояснение на карточке выбора. */
  description: string;
  /** Имя иконки Ionicons. Строкой, чтобы модуль не тянул React Native. */
  icon: string;
  /** Пишется ли GPS-маршрут: дистанция, карта, экспорт GPX, сплиты. */
  hasGps: boolean;
  /**
   * Как показывать быстроту: темп (мин/км) для бега, скорость (км/ч) для велосипеда,
   * `null` для тренировок без GPS.
   */
  speed: 'pace' | 'speed' | null;
  /** Длина сплита и шаг голосовой подсказки: километр на бегу, пять на велосипеде. */
  splitMeters: number;
  /** Таймер, который предлагается на этом виде. */
  timer: 'rest' | 'interval' | null;
  /** Бейдж в строке истории. */
  badge: string;
  /**
   * Пометка к калориям: каким методом они посчитаны. На силовой пульс растёт от напряжения и
   * задержки дыхания, а не только от работы, и формула по пульсу там заметно ошибается.
   */
  caloriesNote: string | null;
  /** Показывать спад пульса к концу практики (йога). */
  showsCalmDown: boolean;
}

const GPS_NOTE = 'Активные калории, без расхода покоя: по скорости и весу. Это оценка, а не измерение.';
const HR_NOTE = 'Активные калории, без расхода покоя: по пульсу. Это оценка, а не измерение.';
const STRENGTH_NOTE = 'Активные калории по пульсу. На силовой нагрузке это приблизительно.';

/** Все виды в том порядке, в каком они стоят на экране выбора. */
export const ACTIVITIES: Activity[] = [
  {
    mode: 'outdoor',
    title: 'На улице',
    tileTitle: 'Улица',
    sessionTitle: 'Уличная тренировка',
    description: 'Бег или ходьба на открытом воздухе. Запись трека, темп, сплиты.',
    icon: 'location',
    hasGps: true,
    speed: 'pace',
    splitMeters: 1000,
    timer: null,
    badge: 'GPS',
    caloriesNote: GPS_NOTE,
    showsCalmDown: false,
  },
  {
    mode: 'treadmill',
    title: 'Дорожка',
    tileTitle: 'Дорожка',
    sessionTitle: 'Беговая дорожка',
    description: 'Бег в помещении. Пульс, время и калории.',
    icon: 'walk',
    hasGps: false,
    speed: null,
    splitMeters: 1000,
    timer: null,
    badge: 'ЗАЛ',
    caloriesNote: HR_NOTE,
    showsCalmDown: false,
  },
  {
    mode: 'cycling',
    title: 'Велосипед',
    tileTitle: 'Вело',
    sessionTitle: 'Велосипед',
    description: 'Поездка с записью трека. Скорость вместо темпа.',
    icon: 'bicycle',
    hasGps: true,
    speed: 'speed',
    splitMeters: 5000,
    timer: null,
    badge: 'GPS',
    caloriesNote: GPS_NOTE,
    showsCalmDown: false,
  },
  {
    mode: 'gym',
    title: 'Зал',
    tileTitle: 'Зал',
    sessionTitle: 'Силовая в зале',
    description: 'Силовая тренировка. Таймер отдыха между подходами.',
    icon: 'barbell',
    hasGps: false,
    speed: null,
    splitMeters: 1000,
    timer: 'rest',
    badge: 'ЗАЛ',
    caloriesNote: STRENGTH_NOTE,
    showsCalmDown: false,
  },
  {
    mode: 'crossfit',
    title: 'Кроссфит',
    tileTitle: 'Кроссфит',
    sessionTitle: 'Кроссфит / интервалы',
    description: 'Интервальный таймер: Tabata, EMOM, AMRAP, свои интервалы.',
    icon: 'flash',
    hasGps: false,
    speed: null,
    splitMeters: 1000,
    timer: 'interval',
    badge: 'ЗАЛ',
    caloriesNote: STRENGTH_NOTE,
    showsCalmDown: false,
  },
  {
    mode: 'yoga',
    title: 'Йога',
    tileTitle: 'Йога',
    sessionTitle: 'Йога',
    description: 'Спокойная практика. Покажем, как опустился пульс к концу.',
    icon: 'leaf',
    hasGps: false,
    speed: null,
    splitMeters: 1000,
    timer: null,
    badge: 'ЙОГА',
    caloriesNote: 'Активные калории по пульсу. На низкой нагрузке оценка грубая.',
    showsCalmDown: true,
  },
  {
    mode: 'other',
    title: 'Прочее',
    tileTitle: 'Прочее',
    sessionTitle: 'Тренировка',
    description: 'Единоборства, игры, растяжка. Пульс, время, калории.',
    icon: 'ellipsis-horizontal-circle',
    hasGps: false,
    speed: null,
    splitMeters: 1000,
    timer: null,
    badge: 'ПУЛЬС',
    caloriesNote: HR_NOTE,
    showsCalmDown: false,
  },
];

const BY_MODE = new Map(ACTIVITIES.map((a) => [a.mode, a]));

/** Описание вида по режиму. */
export function activityOf(mode: WorkoutMode): Activity {
  return BY_MODE.get(mode) ?? ACTIVITIES[0];
}

/**
 * Считается ли дистанция этого вида «бегом»: в недельную карточку, цели по километрам,
 * динамику и рекорды дистанции и темпа. Велосипед сюда не входит: километры на нём
 * даются в разы легче, и смешанная сумма ничего не говорила бы ни о беге, ни о езде.
 */
export function isRunDistance(mode: WorkoutMode): boolean {
  return mode === 'outdoor';
}
