import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FilterChips } from '../components/FilterChips';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenTitle } from '../components/ScreenTitle';
import { StatusBadge } from '../components/StatusBadge';
import { WeekSummaryCard } from '../components/WeekSummaryCard';
import { getFlag, listSessionsSince, listSessionSummaries } from '../db/database';
import { TabScreenProps } from '../navigation/types';
import { useProfileStore } from '../store/profileStore';
import { colors, fonts, radii, spacing } from '../theme';
import { WorkoutSession, WorkoutSessionSummary } from '../types';
import {
  formatDistanceKm,
  formatDuration,
  formatPace,
  formatRelativeDate,
  formatTimeOfDay,
  startOfWeekMs,
} from '../utils/format';
import { decodeGoals, GOALS_FLAG, goalProgress, NO_GOALS, WeeklyGoals } from '../utils/goals';
import { estimateMaxHr } from '../utils/heartRateZones';

type Props = TabScreenProps<'History'>;

type Filter = 'all' | 'outdoor' | 'treadmill';

/**
 * Вкладка «История»: карточка «Эта неделя» (тап ведёт в статистику), чипы-фильтры
 * по режиму и плоский список тренировок. Строка открывает детали тренировки.
 */
export function HistoryScreen({ navigation }: Props) {
  // useState: список и фильтр рисуются на экране.
  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  // useState: момент, от которого считаются «Эта неделя» и «Сегодня»/«Вчера».
  // Фиксируется при каждом фокусе вкладки, а не берётся заново в каждом рендере: так
  // неделя не пересчитывается на каждой перерисовке, а подписи обновляются, когда
  // на вкладку вернулись.
  const [now, setNow] = useState(Date.now());
  // useState: цели и тренировки недели целиком (минутам в зоне нужен пульс, которого
  // нет в кратких сводках списка) рисуются полосами в карточке недели.
  const [goals, setGoals] = useState<WeeklyGoals>(NO_GOALS);
  const [weekSessions, setWeekSessions] = useState<WorkoutSession[]>([]);
  const profile = useProfileStore((s) => s.profile);

  // Список перечитывается при каждом возвращении на вкладку: так в нём сразу видны и новая
  // сохранённая тренировка, и удалённая на экране деталей.
  useFocusEffect(
    useCallback(() => {
      const focusedAt = Date.now();
      setNow(focusedAt);
      listSessionSummaries().then(setSessions);
      getFlag(GOALS_FLAG).then((json) => setGoals(decodeGoals(json)));
      listSessionsSince(startOfWeekMs(focusedAt)).then(setWeekSessions);
    }, []),
  );

  const week = useMemo(() => {
    const from = startOfWeekMs(now);
    const thisWeek = sessions.filter((s) => s.startedAt >= from);
    return {
      workouts: thisWeek.length,
      // Дистанция есть только у уличных тренировок, так что сумма уже и есть
      // «дистанция (улица)», фильтровать по режиму не нужно.
      distanceMeters: thisWeek.reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0),
      totalSeconds: thisWeek.reduce((sum, s) => sum + s.durationSec, 0),
    };
  }, [sessions, now]);

  const goalRows = useMemo(
    () => goalProgress(goals, weekSessions, profile ? estimateMaxHr(profile.age, profile.gender) : null),
    [goals, weekSessions, profile],
  );

  const counts = useMemo(
    () => ({
      all: sessions.length,
      outdoor: sessions.filter((s) => s.mode === 'outdoor').length,
      treadmill: sessions.filter((s) => s.mode === 'treadmill').length,
    }),
    [sessions],
  );

  const visible = useMemo(
    () => (filter === 'all' ? sessions : sessions.filter((s) => s.mode === filter)),
    [sessions, filter],
  );

  const isEmpty = sessions.length === 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader />
      <View style={styles.titleWrap}>
        <ScreenTitle title="История" subtitle="Все пробежки - на улице и на дорожке." />
      </View>

      {isEmpty ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="pulse" size={34} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Пока нет тренировок</Text>
          <Text style={styles.emptyText}>Ваши тренировки появятся здесь после первого забега.</Text>
          <TouchableOpacity
            style={styles.emptyAction}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Workout')}
          >
            <Text style={styles.emptyActionText}>Начать тренировку</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.accentStart} />
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <WeekSummaryCard {...week} goals={goalRows} onPress={() => navigation.navigate('Stats')} />
              <FilterChips
                chips={[
                  { value: 'all', label: 'Все', count: counts.all },
                  { value: 'outdoor', label: 'На улице', count: counts.outdoor },
                  { value: 'treadmill', label: 'Дорожка', count: counts.treadmill },
                ]}
                selected={filter}
                onSelect={setFilter}
              />
            </View>
          }
          renderItem={({ item }) => {
            const outdoor = item.mode === 'outdoor';
            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('SessionDetails', { sessionId: item.id })}
              >
                <View style={styles.rowIcon}>
                  <Ionicons
                    name={outdoor ? 'location' : 'barbell'}
                    size={18}
                    color={outdoor ? colors.green : colors.blue}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{outdoor ? 'Уличная тренировка' : 'Беговая дорожка'}</Text>
                  <Text style={styles.rowDate}>
                    {formatRelativeDate(item.startedAt, now)} · {formatTimeOfDay(item.startedAt)}
                  </Text>
                  {/* У дорожки нет ни дистанции, ни темпа, поэтому она показывает то,
                      что у неё есть, а не три прочерка. */}
                  <Text style={styles.rowMetrics}>
                    {formatDuration(item.durationSec)}
                    {outdoor
                      ? ` · ${formatDistanceKm(item.distanceMeters)} км · ${formatPace(item.avgPaceSecPerKm)}/км`
                      : `${item.caloriesKcal !== undefined ? ` · ${item.caloriesKcal} ккал` : ''} · ${item.avgHr} уд/мин`}
                  </Text>
                </View>
                <StatusBadge
                  label={outdoor ? 'GPS' : 'ЗАЛ'}
                  tone={outdoor ? 'success' : 'neutral'}
                  dot
                />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.filterEmpty}>В этой категории пока ничего нет.</Text>
          }
        />
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
  titleWrap: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  listHeader: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 15,
    fontWeight: '700',
  },
  rowDate: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 1,
  },
  rowMetrics: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  filterEmpty: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  emptyActionText: {
    color: colors.accentStart,
    fontFamily: fonts.bold,
    fontSize: 15,
    fontWeight: '700',
  },
});
