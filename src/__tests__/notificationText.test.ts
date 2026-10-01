import { IDLE_NOTIFICATION, NotificationState, notificationFromState, sameNotification } from '../workout/notificationText';

const START = 1_700_000_000_000;
const NOW = START + 32 * 60_000 + 15_000; // 32:15
const MAX_HR = 190;

function state(extra: Partial<NotificationState> = {}, workout: Partial<NonNullable<NotificationState['workout']>> = {}): NotificationState {
  return {
    workout: { startedAt: START, pausedMs: 0, pausedAt: null, currentBpm: 148, ...workout },
    connectionStatus: 'connected',
    sensorContact: 'ok',
    maxHr: MAX_HR,
    ...extra,
  };
}

describe('notificationFromState', () => {
  it('shows time, live pulse and zone', () => {
    expect(notificationFromState(state(), NOW)).toEqual({
      title: 'Тренировка · 32:15',
      body: 'Пульс 148 · Зона 3 Выносливость',
    });
  });

  it('shows the pulse alone without a profile', () => {
    expect(notificationFromState(state({ maxHr: null }), NOW).body).toBe('Пульс 148');
  });

  it('puts a low pulse into zone 1, which is open from zero', () => {
    expect(notificationFromState(state({}, { currentBpm: 70 }), NOW).body).toBe('Пульс 70 · Зона 1 Разминка');
  });

  it('waits for the first pulse', () => {
    expect(notificationFromState(state({}, { currentBpm: null }), NOW).body).toBe('Ждём пульс…');
  });

  it('names the lost link instead of showing a stale number', () => {
    expect(notificationFromState(state({ connectionStatus: 'reconnecting' }), NOW).body).toBe(
      'Датчик потерян, переподключаемся…',
    );
    expect(notificationFromState(state({ connectionStatus: 'disconnected' }), NOW).body).toContain('потерян');
  });

  it('names a missing skin contact', () => {
    expect(notificationFromState(state({ sensorContact: 'lost' }), NOW).body).toBe(
      'Нет контакта с кожей, пульс не записывается',
    );
  });

  it('puts a lost link before a lost contact', () => {
    const both = state({ connectionStatus: 'reconnecting', sensorContact: 'lost' });
    expect(notificationFromState(both, NOW).body).toContain('потерян');
  });

  it('counts the time without pauses and says so while paused', () => {
    const paused = state({}, { pausedMs: 60_000, pausedAt: START + 20 * 60_000 });
    expect(notificationFromState(paused, NOW)).toEqual({
      title: 'Пауза · 19:00',
      body: 'Тренировка на паузе, пульс не записывается',
    });
    const resumed = state({}, { pausedMs: 60_000 });
    expect(notificationFromState(resumed, NOW).title).toBe('Тренировка · 31:15');
  });

  it('falls back to the plain text without a workout', () => {
    expect(notificationFromState({ ...state(), workout: null }, NOW)).toEqual(IDLE_NOTIFICATION);
  });

  it('uses no long dashes in user-facing text', () => {
    const texts = [IDLE_NOTIFICATION, notificationFromState(state(), NOW), notificationFromState(state({ sensorContact: 'lost' }), NOW)];
    for (const t of texts) expect(`${t.title}${t.body}`).not.toContain('—');
  });
});

describe('sameNotification', () => {
  it('detects an unchanged notification', () => {
    const text = { title: 'a', body: 'b' };
    expect(sameNotification({ title: 'a', body: 'b' }, text)).toBe(true);
    expect(sameNotification({ title: 'a', body: 'c' }, text)).toBe(false);
    expect(sameNotification(null, text)).toBe(false);
  });
});
