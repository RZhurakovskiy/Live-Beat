import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatTile } from '../components/StatTile';
import { listSessionsSince } from '../db/database';
import { RootStackParamList } from '../navigation/types';
import { useProfileStore } from '../store/profileStore';
import { colors, fonts, radii, spacing } from '../theme';
import { WorkoutSession } from '../types';
import { formatDistanceKm, formatDuration } from '../utils/format';
import { ZONES } from '../utils/heartRateZones';
import { aggregateSessions, PeriodStats } from '../utils/statsAggregation';

type Props = NativeStackScreenProps<RootStackParamList, 'Stats'>;

type Period = '7d' | '30d';

const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '30d': 30 };
const PERIOD_LABEL: Record<Period, string> = { '7d': '7 дней', '30d': '30 дней' };

export function StatsScreen({ navigation }: Props) {
  const profile = useProfileStore((s) => s.profile);
  const [period, setPeriod] = useState<Period>('7d');
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);

  useFocusEffect(
    useCallback(() => {
      const sinceMs = Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000;
      listSessionsSince(sinceMs).then(setSessions);
    }, [period]),
  );

  const stats: PeriodStats = useMemo(() => aggregateSessions(sessions, profile), [sessions, profile]);
  const totalZoneSeconds = stats.zoneSeconds.reduce((a, b) => a + b, 0);
  const hasDistance = sessions.some((s) => s.mode === 'outdoor');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Статистика</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.periodRow}>
        {(['7d', '30d'] as Period[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodChip, period === p && styles.periodChipActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodText, period === p && styles.periodTextActive]}>{PERIOD_LABEL[p]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {stats.sessionCount === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Нет тренировок за этот период</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ gap: spacing.md }}>
          <View style={styles.row}>
            <StatTile icon="barbell-outline" value={String(stats.sessionCount)} label="тренировок" />
            <StatTile icon="time-outline" value={formatDuration(stats.totalDurationSec)} label="время" />
          </View>
          <View style={styles.row}>
            {hasDistance && (
              <StatTile icon="navigate-outline" value={formatDistanceKm(stats.totalDistanceMeters)} label="км" />
            )}
            <StatTile icon="flame-outline" value={String(stats.totalCalories)} label="ккал" />
            <StatTile icon="heart-outline" value={String(stats.avgHr)} label="средний пульс" />
          </View>

          {profile && totalZoneSeconds > 0 && (
            <View style={styles.zoneCard}>
              <Text style={styles.zoneCardTitle}>Время в зонах пульса</Text>
              <View style={styles.zoneBar}>
                {stats.zoneSeconds.map((seconds, index) => {
                  if (seconds <= 0) return null;
                  const zone = ZONES.find((z) => z.index === index);
                  const flexValue = seconds / totalZoneSeconds;
                  return (
                    <View
                      key={index}
                      style={{ flex: flexValue, backgroundColor: zone?.color ?? colors.textMuted, height: '100%' }}
                    />
                  );
                })}
              </View>
              {stats.zoneSeconds.map((seconds, index) => {
                if (seconds <= 0) return null;
                const zone = ZONES.find((z) => z.index === index);
                return (
                  <View key={index} style={styles.zoneLegendRow}>
                    <View style={[styles.zoneDot, { backgroundColor: zone?.color ?? colors.textMuted }]} />
                    <Text style={styles.zoneLegendLabel}>{zone ? zone.label : 'Ниже зон'}</Text>
                    <Text style={styles.zoneLegendTime}>{formatDuration(Math.round(seconds))}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {!profile && (
            <TouchableOpacity style={styles.profileHint} onPress={() => navigation.navigate('Tabs', { screen: 'Settings' })}>
              <Ionicons name="information-circle-outline" size={18} color={colors.accentStart} />
              <Text style={styles.profileHintText}>Заполни профиль, чтобы видеть разбивку по пульсовым зонам</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 17,
    fontWeight: '700',
  },
  periodRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  periodChip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  periodChipActive: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.accentStart,
  },
  periodText: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 13,
  },
  periodTextActive: {
    color: colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  zoneCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  zoneCardTitle: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  zoneBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: radii.sm,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  zoneLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  zoneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  zoneLegendLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  zoneLegendTime: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 13,
    fontWeight: '600',
  },
  profileHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  profileHintText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
});
