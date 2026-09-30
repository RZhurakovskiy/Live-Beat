import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HeartRateChart } from '../components/HeartRateChart';
import { HoldButton } from '../components/HoldButton';
import { PauseOverlay } from '../components/PauseOverlay';
import { RouteMap } from '../components/RouteMap';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateBanner } from '../components/StateBanner';
import { StatTile } from '../components/StatTile';
import { ZoneLegend } from '../components/ZoneLegend';

import { stopOutdoorTracking } from '../location/backgroundLocation';
import { RootStackScreenProps } from '../navigation/types';
import { useProfileStore } from '../store/profileStore';
import { useSessionStore } from '../store/sessionStore';
import { BannerTone, colors, fonts, radii, spacing, typography } from '../theme';
import { computeCaloriesFromSamples } from '../utils/calories';
import { formatDistanceKm, formatDuration, formatPace } from '../utils/format';
import { paceSecPerKm, totalRouteDistanceMeters } from '../utils/geo';
import { estimateMaxHr, getHrZone, NO_ZONE_COLOR } from '../utils/heartRateZones';
import { generateId } from '../utils/id';
import { markDraftFinished } from '../workout/workoutDraft';
import { buildWorkoutSession } from '../workout/workoutSession';
import { endWorkoutService } from '../workout/workoutService';
import { workoutElapsedSec } from '../workout/workoutTime';

type Props = RootStackScreenProps<'ActiveWorkout'>;

const ALERT_COOLDOWN_MS = 20000;
const PATTERN_ABOVE = [0, 120, 80, 120];
const PATTERN_BELOW = [0, 400];

// Only one banner shows at a time, in this order of severity: a lost link beats
// a lost skin contact, and both beat a missing GPS fix.
type BannerKey = 'sensor-lost' | 'no-contact' | 'gps-waiting';

const BANNERS: Record<
  BannerKey,
  { tone: BannerTone; title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  'sensor-lost': {
    tone: 'warning',
    title: 'Датчик потерян - переподключаемся…',
    subtitle: 'Убедитесь, что датчик находится в радиусе действия',
    icon: 'warning-outline',
  },
  'no-contact': {
    tone: 'danger',
    title: 'Нет контакта с кожей - пульс не записывается',
    subtitle: 'Поправьте нагрудный ремень',
    icon: 'alert-circle-outline',
  },
  'gps-waiting': {
    tone: 'info',
    title: 'Ожидание GPS-сигнала…',
    subtitle: 'Маршрут начнёт записываться после обнаружения спутников',
    icon: 'location-outline',
  },
};

export function ActiveWorkoutScreen({ navigation }: Props) {
  useKeepAwake();
  const workout = useSessionStore((s) => s.activeWorkout);
  const connectionStatus = useSessionStore((s) => s.connectionStatus);
  const sensorContact = useSessionStore((s) => s.sensorContact);
  const connectedDevice = useSessionStore((s) => s.connectedDevice);
  const endWorkout = useSessionStore((s) => s.endWorkout);
  const pauseWorkout = useSessionStore((s) => s.pauseWorkout);
  const resumeWorkout = useSessionStore((s) => s.resumeWorkout);
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
  const paused = workout?.pausedAt != null;
  const distanceMeters = isOutdoor ? totalRouteDistanceMeters(workout!.route) : undefined;
  const pace = isOutdoor ? paceSecPerKm(distanceMeters ?? 0, durationSec) : undefined;
  const calories = workout ? computeCaloriesFromSamples(workout.hrSamples, profile) : undefined;

  const samples = workout?.hrSamples;
  // Average pulse so far. The mockups put it on the active screen, where it was
  // never computed — only in the summary.
  const avgBpm = useMemo(() => {
    if (!samples?.length) return null;
    return Math.round(samples.reduce((sum, s) => sum + s.bpm, 0) / samples.length);
  }, [samples]);
  const lastRecordedBpm = samples?.length ? samples[samples.length - 1].bpm : null;

  const maxHr = profile ? estimateMaxHr(profile.age, profile.gender) : null;
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
    if (!targetRange || !workout || paused) return;

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
  }, [now, inTargetRange, targetDirection, targetRange, paused, !!workout]);

  if (!workout) return null;

  const linkDown = connectionStatus !== 'connected';
  const noContact = !linkDown && sensorContact === 'lost';
  // Outdoor with nothing on the track yet: the fix has not arrived.
  const gpsWaiting = isOutdoor && workout.route.length === 0;
  const banner: BannerKey | null = paused
    ? null
    : linkDown
      ? 'sensor-lost'
      : noContact
        ? 'no-contact'
        : gpsWaiting
          ? 'gps-waiting'
          : null;

  const handleFinish = async () => {
    setFinishing(true);
    try {
      if (isOutdoor) await stopOutdoorTracking();

      const endedAt = Date.now();
      const session = buildWorkoutSession(generateId(), workout, profile, endedAt);

      // The session is NOT written to the database here — that happens when the
      // summary screen is confirmed. Until then the draft, now marked finished,
      // is the only copy, so it must be written before the workout is cleared.
      await markDraftFinished(endedAt);
      endWorkout();
      endWorkoutService();
      navigation.replace('WorkoutSummary', { session });
    } finally {
      setFinishing(false);
    }
  };

  const gpsBadge = isOutdoor
    ? gpsWaiting
      ? { label: 'GPS · Поиск', tone: 'warning' as const }
      : { label: 'GPS · Сильный', tone: 'success' as const }
    : undefined;

  return (
    <SafeAreaView style={styles.safe}>
      {banner && <StateBanner {...BANNERS[banner]} />}

      <View style={styles.body}>
        <ScreenHeader badge={gpsBadge?.label} badgeTone={gpsBadge?.tone} badgeDot={!!gpsBadge} />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* No contact means there is no number to show at all; a lost link
              means the last recorded one, dimmed, so it never reads as live. */}
          <View style={styles.bpmBlock}>
            {noContact ? (
              <View style={styles.bpmPlaceholder} />
            ) : (
              <Text style={[styles.bpmValue, linkDown && styles.bpmStale]}>
                {liveBpm ?? lastRecordedBpm ?? '--'}
              </Text>
            )}
            <Text style={styles.bpmUnit}>BPM</Text>

            {noContact ? (
              <View style={[styles.zonePill, styles.zonePillMuted]}>
                <Text style={styles.zoneTextMuted}>Вне зон интенсивности</Text>
              </View>
            ) : zoneResult ? (
              <View
                style={[
                  styles.zonePill,
                  { backgroundColor: `${zoneColor}26` },
                  linkDown && styles.zonePillMuted,
                ]}
              >
                <View style={[styles.zoneDot, { backgroundColor: linkDown ? colors.textMuted : zoneColor }]} />
                <Text style={[styles.zoneText, { color: linkDown ? colors.textMuted : zoneColor }]}>
                  {zoneResult.zone ? `Зона ${zoneResult.zone.index} · ${zoneResult.zone.label}` : 'Вне зон интенсивности'}
                </Text>
              </View>
            ) : null}

            {connectedDevice && !linkDown && (
              <View style={styles.deviceRow}>
                <Ionicons name="bluetooth" size={13} color={colors.textMuted} />
                <Text style={styles.deviceText}>{connectedDevice.name} подключён</Text>
              </View>
            )}

            {targetDirection && !noContact && (
              <Text style={styles.targetWarning}>
                {targetDirection === 'above' ? '↓ Пульс выше цели, сбавь темп' : '↑ Пульс ниже цели, добавь темп'}
              </Text>
            )}
          </View>

          {zoneResult && <ZoneLegend activeIndex={zoneResult.zone?.index ?? null} />}

          {isOutdoor ? (
            gpsWaiting ? (
              // Коротко: что случилось и почему, уже объяснил баннер сверху, а бейдж в
              // шапке повторяет «GPS · Поиск». Длинная фраза здесь была третьим повтором
              // и к тому же переносилась, оставляя «GPS» одиноким у левого края.
              <View style={styles.mapPlaceholder}>
                <Ionicons name="map-outline" size={30} color={colors.textMuted} />
                <Text style={styles.mapPlaceholderText}>Ждём спутники</Text>
              </View>
            ) : (
              <RouteMap route={workout.route} title="Уличная тренировка" height={160} />
            )
          ) : (
            <HeartRateChart samples={workout.hrSamples} color={zoneColor} title="Пульс за тренировку" />
          )}

          <View style={styles.tiles}>
            <StatTile icon="time-outline" value={formatDuration(durationSec)} label="время" />
            {isOutdoor ? (
              <StatTile icon="navigate-outline" value={formatDistanceKm(distanceMeters)} label="дистанция" />
            ) : (
              <StatTile icon="flame-outline" value={calories !== undefined ? String(calories) : '—'} label="калории" />
            )}
          </View>

          {/* Without skin contact the derived numbers would be stale, so the
              mockups drop them rather than show a frozen value. */}
          {!noContact && (
            <View style={styles.tiles}>
              <StatTile icon="heart-outline" value={avgBpm != null ? String(avgBpm) : '—'} label="ср. пульс" />
              {isOutdoor ? (
                <StatTile icon="speedometer-outline" value={formatPace(pace)} label="темп /км" />
              ) : (
                <StatTile
                  icon="pulse-outline"
                  value={zoneResult?.zone ? `Зона ${zoneResult.zone.index}` : '—'}
                  label="текущая зона"
                />
              )}
            </View>
          )}
        </ScrollView>

        <HoldButton label="УДЕРЖИВАЙТЕ ДЛЯ ПАУЗЫ" icon="pause" onHold={pauseWorkout} />
      </View>

      {paused && (
        <PauseOverlay
          elapsed={formatDuration(durationSec)}
          onResume={resumeWorkout}
          onFinish={handleFinish}
          finishing={finishing}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  content: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  bpmBlock: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  bpmValue: {
    ...typography.hero,
    color: colors.textPrimary,
    fontSize: 88,
    lineHeight: 96,
  },
  bpmStale: {
    color: colors.textMuted,
  },
  bpmPlaceholder: {
    width: 120,
    height: 26,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.xxl,
    marginBottom: spacing.lg,
  },
  bpmUnit: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: -spacing.sm,
  },
  zonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  zonePillMuted: {
    backgroundColor: colors.surfaceAlt,
  },
  zoneDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  zoneText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700',
  },
  zoneTextMuted: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  deviceText: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  targetWarning: {
    color: colors.amber,
    fontFamily: fonts.semibold,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  mapPlaceholder: {
    height: 160,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  // Выравнивание и отступы остаются страховкой: если на узком экране или с крупным
  // системным шрифтом текст всё же перенесётся, строки встанут по центру, а не к краю.
  mapPlaceholderText: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
