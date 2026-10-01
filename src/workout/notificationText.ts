import { formatDuration } from '../utils/format';
import { getHrZone } from '../utils/heartRateZones';
import { workoutElapsedSec } from './workoutTime';

// Текст уведомления тренировки: время, живой пульс и зона. Уведомление держит процесс живым,
// пока идёт тренировка, а с телефоном в кармане или на дорожке в шторку смотрят чаще, чем
// на экран. Чистый модуль без React Native, чтобы гонять в Jest.

/** Что нужно знать о тренировке и связи, чтобы собрать текст. */
export interface NotificationState {
  workout: {
    startedAt: number;
    pausedMs: number;
    pausedAt: number | null;
    currentBpm: number | null;
  } | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  sensorContact: 'unknown' | 'ok' | 'lost';
  /** Максимальный пульс из профиля или `null`, если профиль не заполнен. */
  maxHr: number | null;
}

/** Заголовок и текст уведомления. */
export interface NotificationText {
  title: string;
  body: string;
}

/** Уведомление до первого обновления и когда тренировки нет. */
export const IDLE_NOTIFICATION: NotificationText = {
  title: 'Идёт тренировка',
  body: 'Пульс записывается в фоне',
};

/**
 * Текст по состоянию тренировки. Причина важнее числа: пока связи нет или нет контакта с
 * кожей, пульса в уведомлении нет, как и на экране тренировки, чтобы застывшее значение не
 * выглядело живым.
 */
export function notificationFromState(state: NotificationState, now: number): NotificationText {
  const { workout } = state;
  if (!workout) return IDLE_NOTIFICATION;

  const time = formatDuration(workoutElapsedSec(workout, now));
  if (workout.pausedAt !== null) {
    return { title: `Пауза · ${time}`, body: 'Тренировка на паузе, пульс не записывается' };
  }

  const title = `Тренировка · ${time}`;
  if (state.connectionStatus !== 'connected') {
    return { title, body: 'Датчик потерян, переподключаемся…' };
  }
  if (state.sensorContact === 'lost') {
    return { title, body: 'Нет контакта с кожей, пульс не записывается' };
  }

  const bpm = workout.currentBpm;
  if (bpm === null) return { title, body: 'Ждём пульс…' };

  const zone = state.maxHr ? getHrZone(bpm, state.maxHr).zone : null;
  return { title, body: zone ? `Пульс ${bpm} · Зона ${zone.index} ${zone.label}` : `Пульс ${bpm}` };
}

/** Тот же текст, но равны ли два уведомления: обновлять шторку без изменений незачем. */
export function sameNotification(a: NotificationText | null, b: NotificationText): boolean {
  return !!a && a.title === b.title && a.body === b.body;
}
