import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomCta } from '../components/BottomCta';
import { RecoveryCard } from '../components/RecoveryCard';
import { RouteMap } from '../components/RouteMap';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenTitle } from '../components/ScreenTitle';
import { SessionZonesCard } from '../components/SessionZonesCard';
import { SplitsCard } from '../components/SplitsCard';
import { StatTile } from '../components/StatTile';
import { insertSession } from '../db/database';
import { RootStackScreenProps } from '../navigation/types';
import { useSessionStore } from '../store/sessionStore';
import { colors, fonts, radii, spacing } from '../theme';
import { formatDistanceKm, formatDuration, formatPace, formatSessionDateTime } from '../utils/format';
import { recoveryState } from '../utils/recovery';
import { discardWorkoutDraft } from '../workout/workoutDraft';

type Props = RootStackScreenProps<'WorkoutSummary'>;

/**
 * Итоги тренировки и разбивка по зонам. Тренировки здесь ещё нет в базе: она лежит
 * в законченном черновике, пока не нажата одна из двух кнопок. Поэтому «Отбросить»
 * вообще возможно: «Сохранить тренировку» пишет её в базу, «Отбросить» выкидывает
 * (с подтверждением).
 */
export function WorkoutSummaryScreen({ route, navigation }: Props) {
  const { session } = route.params;
  const isOutdoor = session.mode === 'outdoor';
  const setPendingSession = useSessionStore((s) => s.setPendingSession);
  const probe = useSessionStore((s) => s.recoveryProbe);
  const clearRecoveryProbe = useSessionStore((s) => s.clearRecoveryProbe);
  // useState: пока сохраняем или отбрасываем, кнопки показывают загрузку.
  const [busy, setBusy] = useState(false);
  // useState: часы замера восстановления, от них перерисовывается обратный отсчёт.
  const [now, setNow] = useState(() => Date.now());

  // Замера нет, если приложение перезапустилось на этом экране: показаний за минуту
  // после остановки уже не вернуть, и карточка не показывается вовсе.
  const recovery = probe ? recoveryState(probe, now) : null;
  const measuring = recovery?.state === 'measuring';

  useEffect(() => {
    if (!measuring) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [measuring]);

  const leave = () => {
    setPendingSession(null);
    clearRecoveryProbe();
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      // Пульс восстановления попадает в сессию, только если минута уже прошла.
      await insertSession(recovery?.state === 'done' ? { ...session, recovery: recovery.recovery } : session);
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

        {/* Дата под названием, а не рядом: полная дата «30 сентября 2026 г., 08:04»
            длинная и в одной строке не оставляла места подписи. */}
        <View style={styles.activityRow}>
          <Ionicons name={isOutdoor ? 'location' : 'barbell'} size={18} color={colors.accentStart} />
          <View style={styles.activityText}>
            <Text style={styles.activityLabel}>{isOutdoor ? 'Уличная тренировка' : 'Беговая дорожка'}</Text>
            <Text style={styles.activityDate}>{formatSessionDateTime(session.startedAt)}</Text>
          </View>
        </View>

        {isOutdoor && (
          <View style={styles.tiles}>
            <StatTile icon="speedometer-outline" value={formatPace(session.avgPaceSecPerKm)} label="темп /км" />
            <StatTile icon="trending-up-outline" value={String(session.maxHr)} label="макс. пульс" />
          </View>
        )}

        {recovery && <RecoveryCard state={recovery} />}

        {isOutdoor && <SplitsCard session={session} />}

        <SessionZonesCard samples={session.hrSamples} />
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
  activityText: {
    flex: 1,
    gap: 2,
  },
  activityLabel: {
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
});
