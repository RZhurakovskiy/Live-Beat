import * as Speech from 'expo-speech';
import { getFlag, setFlag } from '../db/database';
import { useProfileStore } from '../store/profileStore';
import { ActiveWorkout, useSessionStore } from '../store/sessionStore';
import { haversineDistanceMeters } from '../utils/geo';
import { estimateMaxHr, getHrZone } from '../utils/heartRateZones';
import {
  catchUpState,
  CoachInput,
  coachStep,
  CoachState,
  decodeVoiceSettings,
  DEFAULT_VOICE,
  encodeVoiceSettings,
  VOICE_FLAG,
  VoiceSettings,
} from '../utils/voiceCoach';
import { workoutElapsedMs } from './workoutTime';

// Голосовой коуч: слушает идущую тренировку и проговаривает километры, интервалы и выход
// из целевой зоны. Что и когда говорить, решает чистый `utils/voiceCoach.ts`.
//
// Работает от изменений стора (новый пульс, новая точка маршрута), а не от таймера: при
// заблокированном экране таймеры JS на Android могут засыпать, а пульс с ремня и точки
// GPS приходят и тогда, процесс держит foreground-сервис тренировки.

let settings: VoiceSettings = DEFAULT_VOICE;
let started = false;

// Состояние текущей тренировки. Сбрасывается, когда начинается другая (другой startedAt).
let workoutKey: number | null = null;
let coach: CoachState | null = null;
// Дистанция считается нарастающим итогом по новым точкам, а не заново по всему маршруту
// на каждый пакет пульса.
let routeCounted = 0;
let meters = 0;

/** Текущие настройки голоса. */
export function getVoiceSettings(): VoiceSettings {
  return settings;
}

/** Меняет настройки и сохраняет их в базу. */
export async function saveVoiceSettings(next: VoiceSettings): Promise<void> {
  settings = next;
  // Голос включили посреди тренировки: пусть начнёт с текущего места, а не с нуля.
  coach = null;
  await setFlag(VOICE_FLAG, encodeVoiceSettings(next));
}

/** Проговаривает фразу по-русски. Очередь ведёт сам синтезатор Android. */
export function say(text: string): void {
  Speech.speak(text, { language: 'ru-RU' });
}

/**
 * Есть ли на телефоне русский голос. `null`: синтезатор список не отдал, судить не о
 * чем. Без русского голоса Android молчит или читает кириллицу чужим голосом.
 */
export async function hasRussianVoice(): Promise<boolean | null> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    if (voices.length === 0) return null;
    return voices.some((v) => v.language.toLowerCase().startsWith('ru'));
  } catch {
    return null;
  }
}

function inputFor(workout: ActiveWorkout, now: number): CoachInput {
  const route = workout.route;
  if (route.length < routeCounted) {
    routeCounted = 0;
    meters = 0;
  }
  for (let i = Math.max(1, routeCounted); i < route.length; i++) {
    meters += haversineDistanceMeters(route[i - 1], route[i]);
  }
  routeCounted = route.length;

  const profile = useProfileStore.getState().profile;
  const maxHr = profile ? estimateMaxHr(profile.age, profile.gender) : null;
  const bpm = workout.currentBpm;
  return {
    hasGps: workout.mode === 'outdoor',
    distanceMeters: meters,
    activeMs: workoutElapsedMs(workout, now),
    bpm,
    zoneIndex: bpm !== null && maxHr ? (getHrZone(bpm, maxHr).zone?.index ?? null) : null,
    targetRange: workout.targetZoneRange,
    now,
  };
}

function onWorkoutChange(workout: ActiveWorkout | null): void {
  if (!workout) {
    workoutKey = null;
    coach = null;
    return;
  }
  if (workout.startedAt !== workoutKey) {
    workoutKey = workout.startedAt;
    coach = null;
    routeCounted = 0;
    meters = 0;
  }
  // На паузе молчим: ничего не пишется, и подсказки только сбивали бы.
  if (!settings.enabled || workout.pausedAt !== null) return;

  const input = inputFor(workout, Date.now());
  if (!coach) {
    coach = catchUpState(input, settings);
    return;
  }
  const out = coachStep(coach, input, settings);
  coach = out.state;
  out.phrases.forEach(say);
}

/**
 * Загружает настройки и подписывается на стор. Вызывается один раз при старте
 * приложения, как и автосохранение черновика.
 */
export function startVoiceCoach(): void {
  if (started) return;
  started = true;
  getFlag(VOICE_FLAG)
    .then((json) => {
      settings = decodeVoiceSettings(json);
    })
    .catch(() => {});
  useSessionStore.subscribe((state, previous) => {
    if (state.activeWorkout !== previous.activeWorkout) onWorkoutChange(state.activeWorkout);
  });
}
