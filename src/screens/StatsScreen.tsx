import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FilterChips } from '../components/FilterChips';
import { ScreenTitle } from '../components/ScreenTitle';
import { SectionCard } from '../components/SectionCard';
import { StatTile } from '../components/StatTile';
import { WeeklyBars } from '../components/WeeklyBars';
import { ZoneTimeRow } from '../components/ZoneTimeRow';
import { listSessionsSince, listSessionSummaries } from '../db/database';
import { RootStackScreenProps } from '../navigation/types';
import { useProfileStore } from '../store/profileStore';
import { colors, fonts, spacing } from '../theme';
import { WorkoutSession, WorkoutSessionSummary } from '../types';
import { formatDistanceKm, formatDuration, formatPace, formatSessionDate, formatTotalTime } from '../utils/format';
import { paceEfficiency, personalRecords, weeklyBuckets } from '../utils/progress';
import { aggregateSessions } from '../utils/statsAggregation';
import { zoneShares } from '../utils/zoneTime';

type Props = RootStackScreenProps<'Stats'>;

type Period = '7d' | '30d';
const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '30d': 30 };
const WEEKS_SHOWN = 8;

/**
 * Статистика и прогресс: итоги за 7 или 30 дней, время в зонах и три блока
 * прогресса (пульс на сравнимом темпе, динамика по неделям, личные рекорды).
 * Открывается из карточки «Эта неделя» в истории.
 */
export function StatsScreen({ navigation }: Props) {
  const profile = useProfileStore((s) => s.profile);
  // useState: период выбран чипами, тренировки загружаются из базы, и всё это
  // рисуется на экране.
  const [period, setPeriod] = useState<Period>('7d');
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [all, setAll] = useState<WorkoutSessionSummary[]>([]);
  // useState: момент, от которого считаются недели. Фиксируется при фокусе экрана,
  // как в истории, чтобы столбики не пересчитывались на каждой перерисовке.
  const [now, setNow] = useState(Date.now());

  useFocusEffect(
    useCallback(() => {
      const nowMs = Date.now();
      setNow(nowMs);
      listSessionsSince(nowMs - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000).then(setSessions);
      // Блоки прогресса смотрят на всю историю, а не на выбранный период.
      listSessionSummaries().then(setAll);
    }, [period]),
  );

  const stats = useMemo(() => aggregateSessions(sessions, profile), [sessions, profile]);
  const totalZoneSeconds = stats.zoneSeconds.reduce((a, b) => a + b, 0);

  const weeks = useMemo(() => weeklyBuckets(all, now, WEEKS_SHOWN), [all, now]);
  const efficiency = useMemo(() => paceEfficiency(all), [all]);
  const records = useMemo(() => personalRecords(all), [all]);
  const hasOutdoor = all.some((s) => s.mode === 'outdoor');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTitle title="Статистика" subtitle="Как меняются объём и форма от недели к неделе." />

        <FilterChips
          chips={[
            { value: '7d', label: '7 дней' },
            { value: '30d', label: '30 дней' },
          ]}
          selected={period}
          onSelect={setPeriod}
        />

        <View style={styles.tiles}>
          <StatTile icon="barbell-outline" value={String(stats.sessionCount)} label="тренировок" />
          <StatTile icon="time-outline" value={formatTotalTime(stats.totalDurationSec)} label="всего" />
        </View>
        <View style={styles.tiles}>
          <StatTile
            icon="navigate-outline"
            value={stats.totalDistanceMeters > 0 ? (stats.totalDistanceMeters / 1000).toFixed(1) : '—'}
            label="км (улица)"
          />
          <StatTile icon="flame-outline" value={String(stats.totalCalories)} label="ккал" />
        </View>

        <SectionCard label="ДИНАМИКА">
          <WeeklyBars weeks={weeks} metric={hasOutdoor ? 'distance' : 'time'} />
        </SectionCard>

        {/* Единственный честный признак роста формы, который дают эти данные: тот
            же темп при более низком пульсе. Пока сравнивать не с чем, блок говорит
            «пока рано» и никогда не показывает выдуманное число. */}
        <SectionCard label="ПУЛЬС НА ОДНОМ ТЕМПЕ">
          {efficiency ? (
            <>
              <View style={styles.efficiencyRow}>
                <View style={styles.efficiencySide}>
                  <Text style={styles.efficiencyLabel}>Раньше</Text>
                  <Text style={styles.efficiencyValue}>{efficiency.earlierAvgHr}</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color={colors.textMuted} />
                <View style={styles.efficiencySide}>
                  <Text style={styles.efficiencyLabel}>Сейчас</Text>
                  <Text
                    style={[
                      styles.efficiencyValue,
                      efficiency.deltaBpm < 0 ? styles.better : efficiency.deltaBpm > 0 ? styles.worse : null,
                    ]}
                  >
                    {efficiency.recentAvgHr}
                  </Text>
                </View>
              </View>
              <Text style={styles.efficiencyNote}>
                {efficiency.deltaBpm < 0
                  ? `Пульс упал на ${Math.abs(efficiency.deltaBpm)} уд/мин на том же темпе - форма растёт.`
                  : efficiency.deltaBpm > 0
                    ? `Пульс вырос на ${efficiency.deltaBpm} уд/мин. Бывает от усталости, жары или недосыпа.`
                    : 'Пульс на этом темпе держится на месте.'}
              </Text>
              <Text style={styles.efficiencyHint}>
                Темп {formatPace(efficiency.paceFrom)}–{formatPace(efficiency.paceTo)}/км,
                {' '}{efficiency.sessionCount} пробежек. На малой выборке цифра шумит.
              </Text>
            </>
          ) : (
            <Text style={styles.empty}>
              Нужно хотя бы четыре уличные пробежки в похожем темпе, чтобы было что сравнивать.
            </Text>
          )}
        </SectionCard>

        <SectionCard label="ЛИЧНЫЕ РЕКОРДЫ">
          {records.longestDistanceMeters || records.longestDurationSec || records.bestPaceSecPerKm ? (
            <>
              {records.longestDistanceMeters && (
                <RecordRow
                  icon="navigate-outline"
                  label="Самая длинная дистанция"
                  value={`${formatDistanceKm(records.longestDistanceMeters.value)} км`}
                  at={records.longestDistanceMeters.at}
                />
              )}
              {records.longestDurationSec && (
                <RecordRow
                  icon="time-outline"
                  label="Самая долгая тренировка"
                  value={formatDuration(records.longestDurationSec.value)}
                  at={records.longestDurationSec.at}
                />
              )}
              {records.bestPaceSecPerKm && (
                <RecordRow
                  icon="speedometer-outline"
                  label="Лучший темп"
                  value={`${formatPace(records.bestPaceSecPerKm.value)}/км`}
                  at={records.bestPaceSecPerKm.at}
                />
              )}
            </>
          ) : (
            <Text style={styles.empty}>Рекорды появятся после первой сохранённой тренировки.</Text>
          )}
        </SectionCard>

        <SectionCard label={`ВРЕМЯ В ЗОНАХ · ${PERIOD_DAYS[period]} ДН.`}>
          {totalZoneSeconds > 0 ? (
            zoneShares(stats.zoneSeconds).map((row) => (
              <ZoneTimeRow
                key={row.zone.index}
                index={row.zone.index}
                label={row.zone.label}
                color={row.zone.color}
                seconds={row.seconds}
                percent={row.percent}
              />
            ))
          ) : (
            <Text style={styles.empty}>
              {profile
                ? 'За этот период нет данных пульса.'
                : 'Заполните профиль - зоны считаются от максимального пульса.'}
            </Text>
          )}
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function RecordRow({
  icon,
  label,
  value,
  at,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  at: number;
}) {
  return (
    <View style={styles.recordRow}>
      <Ionicons name={icon} size={18} color={colors.accentStart} />
      <View style={{ flex: 1 }}>
        <Text style={styles.recordLabel}>{label}</Text>
        <Text style={styles.recordDate}>{formatSessionDate(at)}</Text>
      </View>
      <Text style={styles.recordValue}>{value}</Text>
    </View>
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
    marginBottom: spacing.sm,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  efficiencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  efficiencySide: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  efficiencyLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  efficiencyValue: {
    color: colors.textPrimary,
    fontFamily: fonts.extrabold,
    fontSize: 34,
    fontWeight: '800',
  },
  better: {
    color: colors.green,
  },
  worse: {
    color: colors.amber,
  },
  efficiencyNote: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    textAlign: 'center',
  },
  efficiencyHint: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  recordLabel: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 14,
    fontWeight: '600',
  },
  recordDate: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 11,
    marginTop: 1,
  },
  recordValue: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 15,
    fontWeight: '700',
  },
  empty: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
  },
});
