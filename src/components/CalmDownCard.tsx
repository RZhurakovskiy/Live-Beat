import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing, typography } from '../theme';
import { HrSample } from '../types';
import { calmDown } from '../utils/calmDown';
import { SectionCard } from './SectionCard';

interface Props {
  samples: HrSample[];
}

/**
 * Карточка «Пульс к концу практики» для йоги: средний пульс первых трёх минут против
 * последних. Если пульс не опустился, так и пишет, без оценок. Короткая практика
 * карточку не показывает: сравнивать нечего.
 */
export function CalmDownCard({ samples }: Props) {
  const result = useMemo(() => calmDown(samples), [samples]);
  if (!result) return null;
  const { startBpm, endBpm, delta } = result;

  return (
    <SectionCard label="ПУЛЬС К КОНЦУ ПРАКТИКИ">
      <View style={styles.row}>
        <Text style={styles.big}>
          {startBpm} → <Text style={delta < 0 ? styles.down : undefined}>{endBpm}</Text>
        </Text>
        <Text style={styles.delta}>{delta < 0 ? `−${Math.abs(delta)} уд/мин` : delta > 0 ? `+${delta} уд/мин` : 'без изменений'}</Text>
      </View>
      <Text style={styles.note}>
        {delta < 0
          ? 'Средний пульс первых трёх минут против последних. Пульс опустился к концу практики.'
          : 'Средний пульс первых трёх минут против последних. К концу практики пульс не опустился.'}
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
  down: {
    color: colors.green,
  },
  delta: {
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
