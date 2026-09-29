import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme';
import { formatTotalTime } from '../utils/format';
import { StatusBadge } from './StatusBadge';

interface Props {
  workouts: number;
  distanceMeters: number;
  totalSeconds: number;
  // Tapping opens the full statistics — this card is its shallow version.
  onPress: () => void;
}

export function WeekSummaryCard({ workouts, distanceMeters, totalSeconds, onPress }: Props) {
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
