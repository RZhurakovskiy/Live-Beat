import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme';
import { formatTotalTime } from '../utils/format';
import { GoalProgress } from '../utils/goals';
import { StatusBadge } from './StatusBadge';

interface Props {
  workouts: number;
  distanceMeters: number;
  totalSeconds: number;
  /** Прогресс по целям недели, если они заданы в настройках. */
  goals?: GoalProgress[];
  /** Тап открывает полную статистику: эта карточка её краткая версия. */
  onPress: () => void;
}

/** Карточка «Эта неделя» в истории: тренировки, дистанция на улице и общее время. */
export function WeekSummaryCard({ workouts, distanceMeters, totalSeconds, goals = [], onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.head}>
        <Text style={styles.title}>Эта неделя</Text>
        {workouts > 0 ? <StatusBadge label="АКТИВНО" tone="success" /> : null}
      </View>

      <View style={styles.figures}>
        <View style={styles.figure}>
          <Text style={styles.figureLabel}>ТРЕНИРОВОК</Text>
          <Text style={styles.figureValue}>{workouts}</Text>
        </View>
        <View style={styles.figure}>
          <Text style={styles.figureLabel}>ДИСТАНЦИЯ (УЛИЦА)</Text>
          <Text style={styles.figureValue}>
            {(distanceMeters / 1000).toFixed(1)} <Text style={styles.figureUnit}>км</Text>
          </Text>
        </View>
      </View>

      {goals.length > 0 && (
        <View style={styles.goals}>
          {goals.map((g) => (
            <View key={g.key} style={styles.goal}>
              <View style={styles.goalHead}>
                <Text style={styles.goalLabel}>{g.label}</Text>
                <Text style={[styles.goalValue, g.done && styles.goalDone]}>
                  {g.actual} / {g.target}
                </Text>
              </View>
              <View style={styles.goalTrack}>
                <View
                  style={[
                    styles.goalFill,
                    { width: `${Math.round(g.fraction * 100)}%`, backgroundColor: g.done ? colors.green : colors.accentStart },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.divider} />

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>Общее время</Text>
        <Text style={styles.footerValue}>{formatTotalTime(totalSeconds)}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 17,
    fontWeight: '700',
  },
  figures: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  figure: {
    flex: 1,
    gap: spacing.xs,
  },
  figureLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  figureValue: {
    color: colors.textPrimary,
    fontFamily: fonts.extrabold,
    fontSize: 26,
    fontWeight: '800',
  },
  figureUnit: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textSecondary,
  },
  goals: {
    gap: spacing.sm,
  },
  goal: {
    gap: spacing.xs,
  },
  goalHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  goalLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  goalValue: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 13,
    fontWeight: '700',
  },
  goalDone: {
    color: colors.green,
  },
  goalTrack: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  goalFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  footerValue: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 15,
    fontWeight: '700',
  },
});
