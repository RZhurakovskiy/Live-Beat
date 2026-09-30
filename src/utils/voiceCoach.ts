import { pluralRu } from './format';

// Голосовые подсказки на тренировке: что и когда сказать. Чистый модуль без React
// Native, чтобы гонять в Jest; говорит `workout/voiceCoach.ts`.
//
// На бегу на экран не смотрят (plans/archive/field-fixes.md, п. 1), поэтому темп и
// пульс доставляются голосом в наушники, как у беговых приложений.

/** Ключ флага с настройками голоса. */
export const VOICE_FLAG = 'voice_settings';

/** Настройки голоса. */
export interface VoiceSettings {
  enabled: boolean;
  /** Для тренировок без GPS: подсказка каждые N минут. На улице подсказка каждый километр. */
  everyMinutes: number;
  /** Говорить, когда пульс вышел из целевой зоны. */
  zoneAlerts: boolean;
}

/** Интервалы, из которых выбирают в настройках. */
export const VOICE_INTERVALS = [1, 5, 10] as const;

/** Настройки по умолчанию: голос выключен, пока его не включат. */
export const DEFAULT_VOICE: VoiceSettings = { enabled: false, everyMinutes: 5, zoneAlerts: true };

/** Голосовое предупреждение о зоне не чаще, чем раз в это время. Вибрация чаще, голос назойливее. */
export const ZONE_VOICE_COOLDOWN_MS = 60_000;

/** Настройки из строки флага; битая строка даёт настройки по умолчанию. */
export function decodeVoiceSettings(json: string | null): VoiceSettings {
  if (!json) return DEFAULT_VOICE;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return DEFAULT_VOICE;
    const every = raw.everyMinutes;
    return {
      enabled: raw.enabled === true,
      everyMinutes:
        typeof every === 'number' && (VOICE_INTERVALS as readonly number[]).includes(every)
          ? every
          : DEFAULT_VOICE.everyMinutes,
      zoneAlerts: raw.zoneAlerts !== false,
    };
  } catch {
    return DEFAULT_VOICE;
  }
}

/** Настройки в строку для флага. */
export function encodeVoiceSettings(settings: VoiceSettings): string {
  return JSON.stringify(settings);
}

/** Темп словами: «6 минут 12 секунд». Цифрами синтезатор читает «шесть двенадцать», это непонятно. */
export function paceWords(secPerKm: number): string {
  const total = Math.round(secPerKm);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  const minutes = pluralRu(min, 'минута', 'минуты', 'минут');
  return sec === 0 ? minutes : `${minutes} ${pluralRu(sec, 'секунда', 'секунды', 'секунд')}`;
}

/** Что происходит на тренировке в этот момент. */
export interface CoachInput {
  hasGps: boolean;
  /**
   * Шаг подсказки для тренировок с GPS: километр на бегу, пять на велосипеде (километр
   * на велосипеде проезжают за пару минут, подсказки сыпались бы без остановки).
   */
  splitMeters?: number;
  /** Темп или скорость: бег считают в мин/км, велосипед в км/ч. */
  speed?: 'pace' | 'speed';
  /** Пройдено метров (для тренировок с GPS). */
  distanceMeters: number;
  /** Время тренировки без пауз. */
  activeMs: number;
  /** Живой пульс или `null`, если его сейчас нет. */
  bpm: number | null;
  /** Номер зоны живого пульса или `null` без профиля. */
  zoneIndex: number | null;
  /** Целевая зона (номера зон) или `null`, если не задана. */
  targetRange: { min: number; max: number } | null;
  now: number;
}

/** Что коуч помнит между шагами. */
export interface CoachState {
  /** Сколько отрезков (километров, у велосипеда пятёрок) уже объявлено. */
  announcedKm: number;
  /** Активное время на последней объявленной отметке. */
  lastKmActiveMs: number;
  /** Сколько интервалов по N минут уже объявлено. */
  announcedIntervals: number;
  /** Куда пульс ушёл из целевой зоны в прошлый раз, `null`: был в зоне. */
  zoneOut: 'above' | 'below' | null;
  lastZoneVoiceAt: number;
}

/** Состояние в начале тренировки. */
export const INITIAL_COACH: CoachState = {
  announcedKm: 0,
  lastKmActiveMs: 0,
  announcedIntervals: 0,
  zoneOut: null,
  lastZoneVoiceAt: 0,
};

/** Куда пульс вышел из целевой зоны, или `null`, если он в ней (или судить не о чем). */
export function zoneDirection(
  zoneIndex: number | null,
  targetRange: { min: number; max: number } | null,
): 'above' | 'below' | null {
  if (!targetRange || zoneIndex === null) return null;
  if (zoneIndex > targetRange.max) return 'above';
  if (zoneIndex < targetRange.min) return 'below';
  return null;
}

/**
 * Один шаг: что сказать сейчас и новое состояние. Вызывается на каждое изменение
 * тренировки (новый пульс, новая точка), а не по таймеру: при заблокированном экране
 * таймеры JS на Android могут засыпать, а данные с ремня и GPS приходят всегда.
 */
export function coachStep(
  state: CoachState,
  input: CoachInput,
  settings: VoiceSettings,
): { state: CoachState; phrases: string[] } {
  if (!settings.enabled) return { state, phrases: [] };
  const phrases: string[] = [];
  let next = state;

  if (input.hasGps) {
    const step = input.splitMeters ?? 1000;
    const done = Math.floor(input.distanceMeters / step);
    if (done > next.announcedKm) {
      // Темп последнего отрезка, а не средний: он и говорит, как бежится сейчас. Если
      // отрезков набежало сразу несколько (пропадал GPS), время делится поровну.
      const km = (done * step) / 1000;
      const secPerKm = (input.activeMs - next.lastKmActiveMs) / 1000 / (((done - next.announcedKm) * step) / 1000);
      const parts =
        input.speed === 'speed'
          ? [
              `${pluralRu(km, 'километр', 'километра', 'километров')}.`,
              `Скорость ${pluralRu(Math.round(3600 / secPerKm), 'километр', 'километра', 'километров')} в час.`,
            ]
          : [`Километр ${km}.`, `Темп ${paceWords(secPerKm)}.`];
      if (input.bpm !== null) parts.push(`Пульс ${input.bpm}.`);
      phrases.push(parts.join(' '));
      next = { ...next, announcedKm: done, lastKmActiveMs: input.activeMs };
    }
  } else {
    const interval = Math.floor(input.activeMs / (settings.everyMinutes * 60_000));
    if (interval > next.announcedIntervals) {
      const minutes = interval * settings.everyMinutes;
      const parts = [`${pluralRu(minutes, 'минута', 'минуты', 'минут')}.`];
      if (input.bpm !== null) parts.push(`Пульс ${input.bpm}.`);
      if (input.zoneIndex !== null && input.bpm !== null) parts.push(`Зона ${input.zoneIndex}.`);
      phrases.push(parts.join(' '));
      next = { ...next, announcedIntervals: interval };
    }
  }

  // Без живого пульса о зоне судить не по чему: молчим и помним прежнюю сторону.
  if (settings.zoneAlerts && input.bpm !== null) {
    const direction = zoneDirection(input.zoneIndex, input.targetRange);
    // Сразу при выходе из зоны или смене стороны, дальше не чаще раза в минуту.
    const justLeft = direction !== null && direction !== next.zoneOut;
    const cooledDown = input.now - next.lastZoneVoiceAt >= ZONE_VOICE_COOLDOWN_MS;
    if (direction !== null && (justLeft || cooledDown)) {
      phrases.push(direction === 'above' ? 'Выше целевой зоны, сбавьте.' : 'Ниже целевой зоны, прибавьте.');
      next = { ...next, lastZoneVoiceAt: input.now };
    }
    if (direction !== next.zoneOut) next = { ...next, zoneOut: direction };
  }

  return { state: next, phrases };
}

/**
 * Состояние «всё уже сказано» на текущий момент. Нужно, когда коуч впервые видит
 * тренировку не с нуля: её восстановили после выгрузки приложения или голос включили
 * посреди бега. Без этого он разом проговорил бы все пройденные километры.
 */
export function catchUpState(input: CoachInput, settings: VoiceSettings): CoachState {
  return {
    ...INITIAL_COACH,
    announcedKm: input.hasGps ? Math.floor(input.distanceMeters / (input.splitMeters ?? 1000)) : 0,
    lastKmActiveMs: input.activeMs,
    announcedIntervals: Math.floor(input.activeMs / (settings.everyMinutes * 60_000)),
  };
}
