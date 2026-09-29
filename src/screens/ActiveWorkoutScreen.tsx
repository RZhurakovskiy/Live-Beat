import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientButton } from '../components/GradientButton';
import { HeartRateChart } from '../components/HeartRateChart';
import { RouteMap } from '../components/RouteMap';
import { StatTile } from '../components/StatTile';
import { ZoneLegend } from '../components/ZoneLegend';
import { stopOutdoorTracking } from '../location/backgroundLocation';
import { RootStackParamList } from '../navigation/types';
import { useProfileStore } from '../store/profileStore';
import { useSessionStore } from '../store/sessionStore';
import { colors, fonts, radii, spacing, typography } from '../theme';
import { WorkoutSession } from '../types';
import { computeCaloriesFromSamples } from '../utils/calories';
import { formatDistanceKm, formatDuration, formatPace } from '../utils/format';
import { generateId } from '../utils/id';
import { paceSecPerKm, totalRouteDistanceMeters } from '../utils/geo';
import { estimateMaxHr, getHrZone, NO_ZONE_COLOR } from '../utils/heartRateZones';
import { insertSession } from '../db/database';
import { discardWorkoutDraft } from '../workout/workoutDraft';
import { endWorkoutService } from '../workout/workoutService';
import { workoutElapsedSec } from '../workout/workoutTime';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveWorkout'>;

const STATUS_LABEL: Record<string, string> = {
  disconnected: 'Датчик отключен',
  connecting: 'Подключение…',
  connected: '',
  reconnecting: 'Переподключение к датчику…',
};

const ALERT_COOLDOWN_MS = 20000;
const PATTERN_ABOVE = [0, 120, 80, 120];
const PATTERN_BELOW = [0, 400];

export function ActiveWorkoutScreen({ navigation }: Props) {
  useKeepAwake();
  const workout = useSessionStore((s) => s.activeWorkout);
  const connectionStatus = useSessionStore((s) => s.connectionStatus);
  const sensorContact = useSessionStore((s) => s.sensorContact);
  const endWorkout = useSessionStore((s) => s.endWorkout);
  const profile = useProfileStore((s) => s.profile);
  const [now, setNow] = useState(Date.now());
  const [finishing, setFinishing] = useState(false);
  const outOfRangeRef = useRef(false);
  const lastAlertAtRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const durationSec = workout ? workoutElapsedSec(workout, now) : 0;
  const isOutdoor = workout?.mode === 'outdoor';
  const distanceMeters = isOutdoor ? totalRouteDistanceMeters(workout!.route) : undefined;
  const pace = isOutdoor ? paceSecPerKm(distanceMeters ?? 0, durationSec) : undefined;
  const calories = workout ? computeCaloriesFromSamples(workout.hrSamples, profile) : undefined;

  const maxHr = profile ? estimateMaxHr(profile.age, profile.gender) : null;
  // No live reading (not started yet, strap off the skin, link lost) is not
  // "0 bpm": no zone, and no "pulse below target" alerts for it.
  const liveBpm = workout?.currentBpm ?? null;
  const zoneResult = maxHr && liveBpm !== null ? getHrZone(liveBpm, maxHr) : null;
  const zoneColor = zoneResult?.zone?.color ?? (zoneResult ? NO_ZONE_COLOR : colors.accentStart);

  const targetRange = workout?.targetZoneRange ?? null;
  const currentZoneIndex = zoneResult?.zone?.index ?? 0;
  const inTargetRange =
    !targetRange || liveBpm === null || (currentZoneIndex >= targetRange.min && currentZoneIndex <= targetRange.max);
  const targetDirection: 'above' | 'below' | null = !targetRange || inTargetRange
    ? null
    : currentZoneIndex > targetRange.max
      ? 'above'
      : 'below';

  useEffect(() => {
    if (!targetRange || !workout) return;

    if (inTargetRange) {
      outOfRangeRef.current = false;
      return;
    }

    const nowMs = Date.now();
    const justLeftRange = !outOfRangeRef.current;
    const cooldownElapsed = nowMs - lastAlertAtRef.current > ALERT_COOLDOWN_MS;
    if (justLeftRange || cooldownElapsed) {
      Vibration.vibrate(targetDirection === 'above' ? PATTERN_ABOVE : PATTERN_BELOW);
      lastAlertAtRef.current = nowMs;
    }
    outOfRangeRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, inTargetRange, targetDirection, targetRange, !!workout]);

  if (!workout) return null;

  const handleFinish = async () => {
    setFinishing(true);
    try {
      if (isOutdoor) await stopOutdoorTracking();

      const bpmValues = workout.hrSamples.map((s) => s.bpm);
      const session: WorkoutSession = {
        id: generateId(),
        mode: workout.mode,
        startedAt: workout.startedAt,
        endedAt: Date.now(),
        durationSec,
        avgHr: bpmValues.length ? Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length) : 0,
        maxHr: bpmValues.length ? Math.max(...bpmValues) : 0,
        minHr: bpmValues.length ? Math.min(...bpmValues) : 0,
        hrSamples: workout.hrSamples,
        distanceMeters,
        avgPaceSecPerKm: pace,
        route: isOutdoor ? workout.route : undefined,
        caloriesKcal: calories,
      };

      await insertSession(session);
      await discardWorkoutDraft();
      endWorkout();
      endWorkoutService();
      navigation.replace('WorkoutSummary', { session });
    } finally {
      setFinishing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.modeLabel}>{isOutdoor ? 'Улица · GPS' : 'Беговая дорожка'}</Text>

      {connectionStatus !== 'connected' && (
        <Text style={styles.statusBanner}>{STATUS_LABEL[connectionStatus]}</Text>
      )}

      {connectionStatus === 'connected' && sensorContact === 'lost' && (
        <Text style={styles.statusBanner}>Нет контакта с кожей — пульс не записывается</Text>
      )}

      <View style={styles.bpmBlock}>
        <Text style={[styles.bpmValue, { color: zoneColor }]}>{workout.currentBpm ?? '--'}</Text>
        <Text style={styles.bpmUnit}>УД/МИН</Text>
        {zoneResult && (
          <View
            style={[
              styles.zonePill,
              { backgroundColor: zoneColor },
              targetDirection && styles.zonePillAlert,
            ]}
          >
            <Text style={styles.zoneText}>
              {zoneResult.zone ? zoneResult.zone.label.toUpperCase() : 'НИЖЕ ЗОН'}
            </Text>
            <Text style={styles.zonePercent}>{Math.round(zoneResult.percent)}% от макс</Text>
          </View>
        )}
        {targetDirection && (
          <Text style={styles.targetWarning}>
            {targetDirection === 'above' ? '↓ Пульс выше цели, сбавь темп' : '↑ Пульс ниже цели, добавь темп'}
          </Text>
        )}
      </View>

      {zoneResult && (
        <ZoneLegend activeIndex={zoneResult.zone?.index ?? null} />
      )}

      <HeartRateChart samples={workout.hrSamples} color={zoneColor} />

      {isOutdoor && <RouteMap route={workout.route} title="Трек" height={140} />}

      <View style={styles.statsRow}>
        <StatTile icon="time-outline" value={formatDuration(durationSec)} label="время" />
        <StatTile icon="flame-outline" value={calories !== undefined ? String(calories) : '—'} label="ккал" />
      </View>

      {isOutdoor && (
        <View style={styles.statsRow}>
          <StatTile icon="navigate-outline" value={formatDistanceKm(distanceMeters)} label="км" />
          <StatTile icon="speedometer-outline" value={formatPace(pace)} label="темп /км" />
        </View>
      )}

      <GradientButton label="Завершить тренировку" onPress={handleFinish} loading={finishing} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  modeLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
    textAlign: 'center',
  },
  statusBanner: {
    color: colors.accentStart,
    fontFamily: fonts.semibold,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  bpmBlock: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  bpmValue: {
    color: colors.accentStart,
    fontFamily: fonts.extrabold,
    fontSize: typography.hero.fontSize,
    fontWeight: typography.hero.fontWeight,
  },
  bpmUnit: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  zonePill: {
    marginTop: spacing.sm,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  zoneText: {
    color: '#0B0B10',
    fontFamily: fonts.extrabold,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  zonePercent: {
    color: '#0B0B10',
    fontFamily: fonts.semibold,
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.75,
    marginTop: 1,
  },
  zonePillAlert: {
    borderWidth: 2,
    borderColor: colors.danger,
  },
  targetWarning: {
    color: colors.danger,
    fontFamily: fonts.bold,
    fontSize: 12,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
