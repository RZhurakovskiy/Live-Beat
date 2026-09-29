import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomCta } from '../components/BottomCta';
import { RouteMap } from '../components/RouteMap';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenTitle } from '../components/ScreenTitle';
import { SectionCard } from '../components/SectionCard';
import { StatTile } from '../components/StatTile';
import { insertSession } from '../db/database';
import { RootStackScreenProps } from '../navigation/types';
import { useProfileStore } from '../store/profileStore';
import { useSessionStore } from '../store/sessionStore';
import { colors, fonts, radii, spacing } from '../theme';
import { formatDistanceKm, formatDuration, formatPace, formatSessionDateTime } from '../utils/format';
import { estimateMaxHr } from '../utils/heartRateZones';
import { zoneBreakdown } from '../utils/zoneTime';
import { discardWorkoutDraft } from '../workout/workoutDraft';

type Props = RootStackScreenProps<'WorkoutSummary'>;

// The workout is not in the database yet: it lives in the finished draft until
// one of these two buttons is pressed. That is what makes "Отбросить" possible.
export function WorkoutSummaryScreen({ route, navigation }: Props) {
  const { session } = route.params;
  const isOutdoor = session.mode === 'outdoor';
  const profile = useProfileStore((s) => s.profile);
  const setPendingSession = useSessionStore((s) => s.setPendingSession);
  const [busy, setBusy] = useState(false);

  const maxHr = profile ? estimateMaxHr(profile.age, profile.gender) : null;
  const zones = useMemo(() => zoneBreakdown(session.hrSamples, maxHr), [session.hrSamples, maxHr]);
  const hasZoneData = zones.some((z) => z.seconds > 0);

  const leave = () => {
    setPendingSession(null);
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await insertSession(session);
      await discardWorkoutDraft();
      leave();
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = () => {
    Alert.alert(
      'Отбросить тренировку?',
      'Она не попадёт в историю. Отменить это действие нельзя.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отбросить',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await discardWorkoutDraft();
              leave();
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader badge="ТРЕНИРОВКА ЗАВЕРШЕНА" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTitle title="Отличная работа!" />

        <View style={styles.tiles}>
          {isOutdoor ? (
            <StatTile icon="navigate-outline" value={formatDistanceKm(session.distanceMeters)} label="дистанция" />
          ) : (
            <StatTile
              icon="flame-outline"
              value={session.caloriesKcal !== undefined ? String(session.caloriesKcal) : '—'}
              label="калории"
            />
          )}
          <StatTile icon="time-outline" value={formatDuration(session.durationSec)} label="время" />
        </View>

        <View style={styles.tiles}>
          <StatTile icon="heart-outline" value={String(session.avgHr)} label="ср. пульс" />
          {isOutdoor ? (
            <StatTile
              icon="flame-outline"
              value={session.caloriesKcal !== undefined ? String(session.caloriesKcal) : '—'}
              label="калории"
            />
          ) : (
            <StatTile icon="trending-up-outline" value={String(session.maxHr)} label="макс. пульс" />
          )}
        </View>

        {isOutdoor && session.route && session.route.length > 1 && (
          <RouteMap route={session.route} title="Уличная тренировка" height={170} />
        )}

        <View style={styles.activityRow}>
          <Ionicons name={isOutdoor ? 'location' : 'barbell'} size={18} color={colors.accentStart} />
          <Text style={styles.activityLabel}>{isOutdoor ? 'Уличная тренировка' : 'Беговая дорожка'}</Text>
          <Text style={styles.activityDate}>{formatSessionDateTime(session.startedAt)}</Text>
        </View>

        {isOutdoor && (
          <View style={styles.tiles}>
            <StatTile icon="speedometer-outline" value={formatPace(session.avgPaceSecPerKm)} label="темп /км" />
            <StatTile icon="trending-up-outline" value={String(session.maxHr)} label="макс. пульс" />
          </View>
        )}

        <SectionCard label="ЗОНЫ ПУЛЬСА">
          {hasZoneData ? (
            zones.map((row) => (
              <View key={row.zone.index} style={styles.zoneRow}>
                <View style={styles.zoneHead}>
                  <Text style={styles.zoneName}>
                    Зона {row.zone.index} · {row.zone.label}
                  </Text>
                  <Text style={styles.zoneValue}>
                    {formatDuration(row.seconds)} ({row.percent}%)
                  </Text>
                </View>
                <View style={styles.zoneTrack}>
                  <View style={[styles.zoneFill, { width: `${row.percent}%`, backgroundColor: row.zone.color }]} />
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.zoneEmpty}>
              {profile
                ? 'Слишком мало данных пульса, чтобы разложить по зонам.'
                : 'Заполните профиль в настройках — зоны считаются от максимального пульса.'}
            </Text>
          )}
        </SectionCard>
      </ScrollView>

      <BottomCta
        label="Сохранить тренировку"
        onPress={handleSave}
        loading={busy}
        secondaryLabel="Отбросить"
        onSecondaryPress={handleDiscard}
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
    paddingBottom: spacing.lg,
  },
  content: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  activityLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 14,
    fontWeight: '600',
  },
  activityDate: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  zoneRow: {
    gap: spacing.xs + 2,
  },
  zoneHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zoneName: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 13,
    fontWeight: '600',
  },
  zoneValue: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  zoneTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  zoneFill: {
    height: 5,
    borderRadius: 3,
  },
  zoneEmpty: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
});
