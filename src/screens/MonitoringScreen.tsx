import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientButton } from '../components/GradientButton';
import { HeartRateChart } from '../components/HeartRateChart';
import { StatTile } from '../components/StatTile';
import { connectAndSubscribe, retryConnectionNow } from '../ble/connectionManager';
import { getFlag, listMonitoringMinutesBetween, MonitoringMinute } from '../db/database';
import { MONITORING_ONBOARDING_FLAG } from '../monitoring/flags';
import { pauseMonitoring, resumeMonitoring, startMonitoring, stopMonitoring } from '../monitoring/monitoringController';
import { RootStackParamList } from '../navigation/types';
import { useMonitoringStore } from '../store/monitoringStore';
import { useProfileStore } from '../store/profileStore';
import { useSessionStore } from '../store/sessionStore';
import { colors, fonts, radii, spacing, typography } from '../theme';
import { formatDuration } from '../utils/format';
import { estimateMaxHr, getHrZone, NO_ZONE_COLOR } from '../utils/heartRateZones';

type Props = NativeStackScreenProps<RootStackParamList, 'Monitoring'>;

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function MonitoringScreen({ navigation }: Props) {
  const status = useMonitoringStore((s) => s.status);
  const currentBpm = useMonitoringStore((s) => s.currentBpm);
  const startedAt = useMonitoringStore((s) => s.startedAt);
  const lastHrvMs = useMonitoringStore((s) => s.lastHrvMs);
  const profile = useProfileStore((s) => s.profile);
  const connectionStatus = useSessionStore((s) => s.connectionStatus);
  const sensorContact = useSessionStore((s) => s.sensorContact);
  const lastKnownDevice = useSessionStore((s) => s.lastKnownDevice);

  const [now, setNow] = useState(Date.now());
  const [todayMinutes, setTodayMinutes] = useState<MonitoringMinute[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getFlag(MONITORING_ONBOARDING_FLAG).then((done) => {
        if (!cancelled && done !== 'true') navigation.replace('MonitoringOnboarding');
      });
      return () => {
        cancelled = true;
      };
    }, [navigation]),
  );

  const refreshToday = useCallback(() => {
    listMonitoringMinutesBetween(startOfToday(), startOfToday() + 24 * 60 * 60 * 1000).then(setTodayMinutes);
  }, []);

  useFocusEffect(useCallback(() => refreshToday(), [refreshToday]));

  useEffect(() => {
    if (status === 'idle') return;
    // Duration ticks every second; the (heavier) data refresh stays on a slower cadence.
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(refreshToday, 5000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [status, refreshToday]);

  const isConnected = connectionStatus === 'connected';

  const maxHr = profile ? estimateMaxHr(profile.age, profile.gender) : null;
  const zoneResult = maxHr && currentBpm ? getHrZone(currentBpm, maxHr) : null;
  const zoneColor = zoneResult?.zone?.color ?? (zoneResult ? NO_ZONE_COLOR : colors.accentStart);

  const todayStats = useMemo(() => {
    if (todayMinutes.length === 0) return null;
    let weighted = 0;
    let samples = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const m of todayMinutes) {
      weighted += m.avgBpm * m.sampleCount;
      samples += m.sampleCount;
      min = Math.min(min, m.minBpm);
      max = Math.max(max, m.maxBpm);
    }
    return { avg: Math.round(weighted / samples), min, max, minutes: todayMinutes.length };
  }, [todayMinutes]);

  const chartSamples = useMemo(
    () => todayMinutes.map((m) => ({ t: m.minuteTs, bpm: m.avgBpm })),
    [todayMinutes],
  );

  const elapsedSec = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;

  const handleStart = async () => {
    setNotice(null);
    if (!isConnected) {
      if (lastKnownDevice) {
        setBusy(true);
        try {
          await connectAndSubscribe(lastKnownDevice.id, lastKnownDevice.name);
        } catch {
          setBusy(false);
          navigation.navigate('ScanDevice');
          return;
        }
        setBusy(false);
      } else {
        navigation.navigate('ScanDevice');
        return;
      }
    }
    setBusy(true);
    try {
      const ok = await startMonitoring();
      if (!ok) setNotice('Нужно разрешение на уведомления, чтобы фоновый мониторинг не выключался');
    } finally {
      setBusy(false);
    }
  };

  const openBleLog = () => navigation.navigate('BleLog');

  const handleStop = async () => {
    setBusy(true);
    const finishedSessionId = useMonitoringStore.getState().sessionId;
    try {
      await stopMonitoring();
      refreshToday();
      if (finishedSessionId) {
        navigation.navigate('MonitoringSession', { sessionId: finishedSessionId });
      }
    } finally {
      setBusy(false);
    }
  };

  const statusLabel =
    status === 'active'
      ? `Активно · ${formatDuration(elapsedSec)}`
      : status === 'paused'
        ? 'На паузе'
        : 'Не запущено';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Суточный мониторинг</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={openBleLog} accessibilityLabel="Журнал подключения датчика">
            <Ionicons name="document-text-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('MonitoringHistory')}>
            <Ionicons name="time-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: status === 'active' ? colors.success : status === 'paused' ? colors.accentStart : colors.textMuted },
          ]}
        />
        <Text style={styles.statusText}>{statusLabel}</Text>
      </View>

      {status !== 'idle' && connectionStatus !== 'connected' && (
        <TouchableOpacity onPress={retryConnectionNow} onLongPress={openBleLog}>
          <Text style={styles.connBanner}>
            {connectionStatus === 'reconnecting'
              ? 'Датчик потерян — переподключаемся…'
              : connectionStatus === 'connecting'
                ? 'Подключение к датчику…'
                : 'Датчик отключён'}
          </Text>
          <Text style={styles.connHint}>Нажми, чтобы повторить подключение сейчас</Text>
        </TouchableOpacity>
      )}

      {status !== 'idle' && connectionStatus === 'connected' && sensorContact === 'lost' && (
        <Text style={styles.connBanner}>Нет контакта с кожей — пульс не записывается</Text>
      )}

      <View style={styles.bpmBlock}>
        <Text style={[styles.bpmValue, { color: zoneColor }]}>{currentBpm ?? '--'}</Text>
        <Text style={styles.bpmUnit}>УД/МИН</Text>
      </View>

      {status !== 'idle' && (
        <View style={styles.hrvRow}>
          <Ionicons name="pulse-outline" size={15} color={colors.blue} />
          <Text style={styles.hrvValue}>{lastHrvMs != null ? `${lastHrvMs} мс` : '—'}</Text>
          <Text style={styles.hrvLabel}>
            {lastHrvMs != null ? 'ВСР · за последнюю минуту' : 'ВСР · считаем за минуту…'}
          </Text>
        </View>
      )}

      {todayStats && (
        <View style={styles.statsRow}>
          <StatTile icon="heart-outline" value={String(todayStats.avg)} label="средний" />
          <StatTile icon="trending-down-outline" value={String(todayStats.min)} label="мин" />
          <StatTile icon="trending-up-outline" value={String(todayStats.max)} label="макс" />
        </View>
      )}

      <HeartRateChart samples={chartSamples} title="Пульс за сегодня" color={zoneColor} />

      {notice && <Text style={styles.notice}>{notice}</Text>}

      <View style={{ flex: 1 }} />

      {status === 'idle' && <GradientButton label="Начать мониторинг" onPress={handleStart} loading={busy} />}

      {status === 'active' && (
        <View style={styles.buttonRow}>
          <GradientButton label="Пауза" onPress={pauseMonitoring} variant="outline" style={styles.flexBtn} />
          <GradientButton label="Стоп" onPress={handleStop} loading={busy} style={styles.flexBtn} />
        </View>
      )}

      {status === 'paused' && (
        <View style={styles.buttonRow}>
          <GradientButton label="Продолжить" onPress={resumeMonitoring} variant="outline" style={styles.flexBtn} />
          <GradientButton label="Стоп" onPress={handleStop} loading={busy} style={styles.flexBtn} />
        </View>
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
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 17,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 13,
    fontWeight: '600',
  },
  connBanner: {
    color: colors.accentStart,
    fontFamily: fonts.semibold,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  connHint: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },
  bpmBlock: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  bpmValue: {
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
  hrvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: -spacing.xs,
  },
  hrvValue: {
    color: colors.blue,
    fontFamily: fonts.bold,
    fontSize: 15,
    fontWeight: '700',
  },
  hrvLabel: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  notice: {
    color: colors.accentStart,
    fontSize: 12,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flexBtn: {
    flex: 1,
  },
});
