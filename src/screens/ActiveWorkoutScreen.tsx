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
import { formatDistanceKm, formatDuration, formatPace, formatSpeed } from '../utils/format';
import { activityOf } from '../workout/activities';
import { paceSecPerKm, totalRouteDistanceMeters } from '../utils/geo';
import { estimateMaxHr, getHrZone, NO_ZONE_COLOR } from '../utils/heartRateZones';
import { generateId } from '../utils/id';
import { markDraftFinished } from '../workout/workoutDraft';
import { buildWorkoutSession } from '../workout/workoutSession';
import { endWorkoutService } from '../workout/workoutService';
import { workoutElapsedSec } from '../workout/workoutTime';

type Props = RootStackScreenProps<'ActiveWorkout'>;

// Вибро-сигнал целевой зоны: сразу, как пульс вышел из зоны, и дальше не чаще раза в
// 20 с. Выше зоны два коротких импульса, ниже один длинный, чтобы различать без
// взгляда на экран.
const ALERT_COOLDOWN_MS = 20000;
const PATTERN_ABOVE = [0, 120, 80, 120];
const PATTERN_BELOW = [0, 400];

// Баннер показывается один, по старшинству: потеря связи важнее потери контакта с
// кожей, а обе важнее ожидания GPS.
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

/**
 * Экран идущей тренировки: крупный пульс и зона, карта (улица) или график пульса
 * (дорожка), плитки показателей, кнопка паузы с удержанием. Держит экран включённым,
 * подаёт вибро-сигнал целевой зоны и показывает баннеры состояний, каждый со своей
 * деградацией содержимого.
 */
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
  // useState: часы экрана. Тикают раз в секунду и обязаны перерисовывать таймер и
  // пересчитывать зону, поэтому это состояние, а не ref.
  const [now, setNow] = useState(Date.now());
  // useState: пока тренировка завершается, кнопка на оверлее паузы показывает загрузку.
  const [finishing, setFinishing] = useState(false);
  // useRef, а не useState: учёт кулдауна вибро-сигнала, на экране его не видно.
  // Эффект ниже читает и меняет эти значения на каждом тике часов. Будь они
  // состоянием, каждая запись перерисовывала бы экран, на который смотрят на бегу,
  // а эффекту пришлось бы зависеть от них и перезапускаться от собственных записей.
  const outOfRangeRef = useRef(false);
  const lastAlertAtRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const durationSec = workout ? workoutElapsedSec(workout, now) : 0;
  const activity = activityOf(workout?.mode ?? 'outdoor');
  const hasGps = !!workout && activity.hasGps;
  const showsSpeed = activity.speed === 'speed';
  const paused = workout?.pausedAt != null;
  const distanceMeters = hasGps ? totalRouteDistanceMeters(workout!.route) : undefined;
  const pace = hasGps ? paceSecPerKm(distanceMeters ?? 0, durationSec) : undefined;
  const calories = workout ? computeCaloriesFromSamples(workout.hrSamples, profile) : undefined;

  const samples = workout?.hrSamples;
  // Средний пульс с начала тренировки. Макеты показывают его на активном экране, а
  // раньше он считался только в итогах.
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
    // Зависимость `!!workout`, а не `workout`: эффекту важно, идёт ли тренировка, а
    // объект тренировки новый на каждом пакете пульса.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, inTargetRange, targetDirection, targetRange, paused, !!workout]);

  if (!workout) return null;

  const linkDown = connectionStatus !== 'connected';
  const noContact = !linkDown && sensorContact === 'lost';
  // На улице, а в треке ещё ни одной точки: спутники пока не найдены.
  const gpsWaiting = hasGps && workout.route.length === 0;
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
      if (hasGps) await stopOutdoorTracking();

      const endedAt = Date.now();
      const session = buildWorkoutSession(generateId(), workout, profile, endedAt);

      // Здесь тренировка в базу НЕ пишется: это происходит, когда её подтвердят на
      // экране итогов. До тех пор черновик с пометкой «закончена» единственная копия,
      // поэтому его надо записать до того, как тренировка очистится из стора.
      await markDraftFinished(endedAt);
      endWorkout();
      endWorkoutService();
      navigation.replace('WorkoutSummary', { session });
    } finally {
      setFinishing(false);
    }
  };

  const gpsBadge = hasGps
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
          {/* Нет контакта: показывать нечего вообще. Потеряна связь: последнее
              записанное число, приглушённое, чтобы оно не читалось как живое. */}
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

          {hasGps ? (
            gpsWaiting ? (
              // Коротко: что случилось и почему, уже объяснил баннер сверху, а бейдж в
              // шапке повторяет «GPS · Поиск». Длинная фраза здесь была третьим повтором
              // и к тому же переносилась, оставляя «GPS» одиноким у левого края.
              <View style={styles.mapPlaceholder}>
                <Ionicons name="map-outline" size={30} color={colors.textMuted} />
                <Text style={styles.mapPlaceholderText}>Ждём спутники</Text>
              </View>
            ) : (
              <RouteMap route={workout.route} title={activity.sessionTitle} height={160} />
            )
          ) : (
            <HeartRateChart samples={workout.hrSamples} color={zoneColor} title="Пульс за тренировку" />
          )}

          <View style={styles.tiles}>
            <StatTile icon="time-outline" value={formatDuration(durationSec)} label="время" />
            {hasGps ? (
              <StatTile icon="navigate-outline" value={formatDistanceKm(distanceMeters)} label="дистанция" />
            ) : (
              <StatTile icon="flame-outline" value={calories !== undefined ? String(calories) : '—'} label="калории" />
            )}
          </View>

          {/* Без контакта с кожей производные числа были бы устаревшими, поэтому
              макеты их убирают, а не показывают застывшее значение. */}
          {!noContact && (
            <View style={styles.tiles}>
              <StatTile icon="heart-outline" value={avgBpm != null ? String(avgBpm) : '—'} label="ср. пульс" />
              {hasGps ? (
                showsSpeed ? (
                  <StatTile icon="speedometer-outline" value={formatSpeed(pace)} label="км/ч" />
                ) : (
                  <StatTile icon="speedometer-outline" value={formatPace(pace)} label="темп /км" />
                )
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
