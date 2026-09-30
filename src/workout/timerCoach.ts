import { Vibration } from 'react-native';
import { ActiveWorkout, useSessionStore } from '../store/sessionStore';
import { phaseAnnouncement, phaseAt, restRemainingMs } from '../utils/intervals';
import { say } from './voiceCoach';
import { workoutElapsedMs } from './workoutTime';

// Сигналы таймеров: смена фазы интервалов (кроссфит) и конец отдыха (зал). Вибрация
// плюс голос. Голос здесь не зависит от переключателя голосовых подсказок: таймер
// включают ради сигнала, и без звука он бесполезен, если телефон лежит на полу.
//
// Проверка идёт на каждое изменение тренировки (пульс с ремня приходит и при
// заблокированном экране, когда таймеры JS на Android могут засыпать) и раз в секунду
// по таймеру (на случай, если ремень замолчал, а экран включён).

const PATTERN_WORK = [0, 600];
const PATTERN_REST = [0, 150, 100, 150];
const PATTERN_DONE = [0, 150, 100, 150, 100, 150];

/** Первое появление тренировки раньше этого считается её началом: первую фазу объявляем. */
const START_GRACE_MS = 3000;

let started = false;
let workoutKey: number | null = null;
// Номер последней объявленной фазы. `null`: тренировку ещё не видели.
let lastPhaseIndex: number | null = null;

function check(workout: ActiveWorkout | null): void {
  if (!workout) {
    workoutKey = null;
    lastPhaseIndex = null;
    return;
  }
  if (workout.startedAt !== workoutKey) {
    workoutKey = workout.startedAt;
    lastPhaseIndex = null;
  }
  if (workout.pausedAt !== null) return;
  const activeMs = workoutElapsedMs(workout, Date.now());

  if (workout.interval) {
    const phase = phaseAt(workout.interval, activeMs);
    if (lastPhaseIndex === null) {
      // Тренировку восстановили после выгрузки посреди интервалов: текущую фазу не
      // объявляем задним числом, только следующие. В самом начале объявляем первую.
      lastPhaseIndex = activeMs < START_GRACE_MS ? -1 : phase.index;
    }
    if (phase.index > lastPhaseIndex) {
      lastPhaseIndex = phase.index;
      Vibration.vibrate(phase.kind === 'work' ? PATTERN_WORK : phase.kind === 'rest' ? PATTERN_REST : PATTERN_DONE);
      say(phaseAnnouncement(workout.interval, phase));
    }
  }

  if (workout.restTimer && restRemainingMs(workout.restTimer, activeMs) <= 0) {
    Vibration.vibrate(PATTERN_WORK);
    say('Отдых окончен. Подход.');
    useSessionStore.getState().stopRest();
  }
}

/** Подписывается на стор и заводит секундную проверку. Вызывается один раз при старте. */
export function startTimerCoach(): void {
  if (started) return;
  started = true;
  useSessionStore.subscribe((state, previous) => {
    if (state.activeWorkout !== previous.activeWorkout) check(state.activeWorkout);
  });
  setInterval(() => check(useSessionStore.getState().activeWorkout), 1000);
}
