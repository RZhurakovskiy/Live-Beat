import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing, typography } from '../theme';
import { HrRecovery } from '../types';
import { RecoveryState } from '../utils/recovery';
import { SectionCard } from './SectionCard';

interface Props {
  /** Готовый результат (детали сохранённой тренировки) или живой замер (итоги). */
  state: RecoveryState | { state: 'done'; recovery: HrRecovery };
}

/**
 * Карточка «Пульс восстановления»: насколько пульс упал за минуту после конца нагрузки.
 * На итогах показывает обратный отсчёт и живой пульс, пока идёт замер.
 */
export function RecoveryCard({ state }: Props) {
  if (state.state === 'unavailable') {
    return (
      <SectionCard label="ПУЛЬС ВОССТАНОВЛЕНИЯ">
        <Text style={styles.note}>Не удалось измерить: датчик не передавал пульс в эту минуту.</Text>
      </SectionCard>
    );
  }

  if (state.state === 'measuring') {
    return (
      <SectionCard label="ПУЛЬС ВОССТАНОВЛЕНИЯ" badge="ИЗМЕРЕНИЕ" badgeTone="warning">
        <View style={styles.row}>
          <Text style={styles.big}>{state.remainingSec > 0 ? `0:${String(state.remainingSec).padStart(2, '0')}` : '…'}</Text>
          <Text style={styles.live}>{state.currentBpm !== null ? `${state.currentBpm} уд/мин` : '--'}</Text>
        </View>
        <Text style={styles.note}>
          Не снимайте датчик минуту после остановки. Если сохранить раньше, этот показатель не запишется.
        </Text>
      </SectionCard>
    );
  }

  const { fromBpm, toBpm } = state.recovery;
  const drop = fromBpm - toBpm;
  return (
    <SectionCard label="ПУЛЬС ВОССТАНОВЛЕНИЯ">
      <View style={styles.row}>
        <Text style={[styles.big, drop > 0 && styles.good]}>{drop > 0 ? `−${drop}` : `${Math.abs(drop)}`}</Text>
        <Text style={styles.live}>
          {fromBpm} → {toBpm} уд/мин
        </Text>
      </View>
      <Text style={styles.note}>
        {drop > 0
          ? 'На столько ударов упал пульс за минуту после остановки. Чем больше, тем быстрее восстановление.'
          : 'За минуту после остановки пульс не упал.'}
      </Text>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  big: {
    ...typography.title,
    color: colors.textPrimary,
  },
  good: {
    color: colors.green,
  },
  live: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 14,
    fontWeight: '600',
  },
  note: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
});
