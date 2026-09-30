import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '../theme';
import { WeekBucket } from '../utils/progress';

const MAX_HEIGHT = 96;

interface Props {
  weeks: WeekBucket[];
  /** Что значит высота столбика: дистанция для бегающих на улице, время, когда дистанции нет. */
  metric: 'distance' | 'time';
}

function valueOf(week: WeekBucket, metric: Props['metric']): number {
  return metric === 'distance' ? week.distanceMeters : week.totalSeconds;
}

function labelOf(week: WeekBucket): string {
  const date = new Date(week.startMs);
  return `${date.getDate()}.${date.getMonth() + 1}`;
}

/** Столбики по неделям для статистики, текущая неделя выделена. */
export function WeeklyBars({ weeks, metric }: Props) {
  const peak = Math.max(...weeks.map((w) => valueOf(w, metric)), 0);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {weeks.map((week) => {
          const value = valueOf(week, metric);
          // У пустой недели остаётся полоска, чтобы пробел читался как «здесь пусто»,
          // а не как пропавший столбик.
          const height = peak > 0 ? Math.max(3, (value / peak) * MAX_HEIGHT) : 3;
          const isLast = week === weeks[weeks.length - 1];
          return (
            <View key={week.startMs} style={styles.column}>
              <View
                style={[
                  styles.bar,
                  { height },
                  value === 0 ? styles.barEmpty : isLast ? styles.barCurrent : null,
                ]}
              />
              <Text style={[styles.label, isLast && styles.labelCurrent]}>{labelOf(week)}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.caption}>
        {metric === 'distance' ? 'Километры по неделям' : 'Время по неделям'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: MAX_HEIGHT + 20,
    gap: spacing.xs,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  bar: {
    width: '100%',
    maxWidth: 22,
    borderRadius: 4,
    backgroundColor: colors.accentStart,
  },
  barCurrent: {
    backgroundColor: colors.accentEnd,
  },
  barEmpty: {
    backgroundColor: colors.border,
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 9,
  },
  labelCurrent: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontWeight: '700',
  },
  caption: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
});
