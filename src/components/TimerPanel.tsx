import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii, spacing, typography } from '../theme';
import { IntervalSettings } from '../types';
import { formatDuration } from '../utils/format';
import { phaseAt, REST_OPTIONS_SEC, RestTimer, restRemainingMs } from '../utils/intervals';

interface IntervalProps {
  interval: IntervalSettings;
  activeMs: number;
}

/**
 * Интервальный таймер на экране тренировки: фаза крупно, сколько осталось, раунд. Сами
 * сигналы (вибрация и голос) подаёт `workout/timerCoach.ts`, панель только показывает.
 */
export function IntervalPanel({ interval, activeMs }: IntervalProps) {
  const phase = phaseAt(interval, activeMs);
  const tone = phase.kind === 'work' ? colors.danger : phase.kind === 'rest' ? colors.blue : colors.green;
  const title = phase.kind === 'work' ? 'РАБОТА' : phase.kind === 'rest' ? 'ОТДЫХ' : 'ГОТОВО';

  return (
    <View style={[styles.panel, { borderColor: tone }]}>
      <View style={styles.head}>
        <Text style={[styles.phase, { color: tone }]}>{title}</Text>
        {phase.kind !== 'done' && (
          <Text style={styles.round}>
            {interval.preset === 'emom' ? 'минута' : 'раунд'} {phase.round} / {interval.rounds}
          </Text>
        )}
      </View>
      <Text style={styles.time}>
        {phase.kind === 'done' ? 'Интервалы завершены' : formatDuration(Math.ceil(phase.remainingMs / 1000))}
      </Text>
    </View>
  );
}

interface RestProps {
  rest: RestTimer | null;
  activeMs: number;
  onStart: (durationSec: number) => void;
  onStop: () => void;
}

/**
 * Таймер отдыха в зале: три кнопки длительности, после подхода одно нажатие. Идущий
 * отдых показывается обратным отсчётом; конец отдыха сигналит `workout/timerCoach.ts`.
 */
export function RestPanel({ rest, activeMs, onStart, onStop }: RestProps) {
  if (rest) {
    const remaining = Math.max(0, restRemainingMs(rest, activeMs));
    return (
      <View style={[styles.panel, { borderColor: colors.blue }]}>
        <View style={styles.head}>
          <Text style={[styles.phase, { color: colors.blue }]}>ОТДЫХ</Text>
          <TouchableOpacity onPress={onStop} hitSlop={12}>
            <Text style={styles.stop}>Хватит</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.time}>{formatDuration(Math.ceil(remaining / 1000))}</Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.round}>ОТДЫХ МЕЖДУ ПОДХОДАМИ</Text>
      <View style={styles.buttons}>
        {REST_OPTIONS_SEC.map((sec) => (
          <TouchableOpacity key={sec} style={styles.button} activeOpacity={0.85} onPress={() => onStart(sec)}>
            <Text style={styles.buttonLabel}>{sec} с</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  phase: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  round: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  time: {
    ...typography.title,
    color: colors.textPrimary,
  },
  stop: {
    color: colors.accentStart,
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700',
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radii.button,
    backgroundColor: colors.surfaceAlt,
  },
  buttonLabel: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 15,
    fontWeight: '700',
  },
});
