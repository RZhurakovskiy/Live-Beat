import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listSessionSummaries } from '../db/database';
import { useBiometricGate } from '../hooks/useBiometricGate';
import { TabScreenProps } from '../navigation/types';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenTitle } from '../components/ScreenTitle';
import { colors, fonts, radii, spacing } from '../theme';
import { WorkoutSessionSummary } from '../types';
import { formatDistanceKm, formatDuration, formatMonthYear, formatSessionDate } from '../utils/format';

type Props = TabScreenProps<'History'>;

function groupByMonth(sessions: WorkoutSessionSummary[]) {
  const groups = new Map<string, WorkoutSessionSummary[]>();
  for (const session of sessions) {
    const key = formatMonthYear(session.startedAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(session);
  }
  return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
}

export function HistoryScreen({ navigation }: Props) {
  const unlocked = useBiometricGate();
  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!unlocked) return;
      listSessionSummaries().then(setSessions);
    }, [unlocked]),
  );

  const sections = useMemo(() => groupByMonth(sessions), [sessions]);

  if (!unlocked) return <SafeAreaView style={styles.safe} />;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader />
      <View style={styles.titleWrap}>
        <ScreenTitle title="История" subtitle="Все пробежки — на улице и на дорожке." />
      </View>

      {/* Statistics is the deep version of the «Эта неделя» card the mockup
          puts at the top of this screen. Stage 8 builds that card and this
          link folds into it. */}
      <TouchableOpacity
        style={styles.statsLink}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('Stats')}
      >
        <Ionicons name="bar-chart-outline" size={18} color={colors.accentStart} />
        <Text style={styles.statsLinkText}>Статистика и прогресс</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: spacing.sm }}
        ListEmptyComponent={<Text style={styles.empty}>Пока нет сохранённых тренировок</Text>}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('SessionDetails', { sessionId: item.id })}
          >
            <View style={styles.iconWrap}>
              <Ionicons
                name={item.mode === 'outdoor' ? 'location' : 'walk'}
                size={18}
                color={colors.accentStart}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {formatSessionDate(item.startedAt)} · {item.mode === 'outdoor' ? 'Улица' : 'Дорожка'}
              </Text>
              <Text style={styles.rowSubtitle}>
                {formatDuration(item.durationSec)}
                {item.distanceMeters ? ` · ${formatDistanceKm(item.distanceMeters)} км` : ''}
                {' · '}
                {item.avgHr} уд/мин
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      />
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
  titleWrap: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  statsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  statsLinkText: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  empty: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 14,
  },
  rowSubtitle: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
});
