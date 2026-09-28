import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { connectAndSubscribe } from '../ble/connectionManager';
import { GradientButton } from '../components/GradientButton';
import { ModeSelector } from '../components/ModeToggle';
import { TargetZonePicker, TargetZoneRange } from '../components/TargetZonePicker';
import { requestLocationPermissions, startOutdoorTracking } from '../location/backgroundLocation';
import { beginWorkoutService } from '../workout/workoutService';
import { RootStackParamList } from '../navigation/types';
import { useProfileStore } from '../store/profileStore';
import { useSessionStore } from '../store/sessionStore';
import { colors, fonts, radii, spacing, typography } from '../theme';
import { WorkoutMode } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const STATUS_LABEL: Record<string, string> = {
  disconnected: 'Пульсометр не подключен',
  connecting: 'Подключение…',
  connected: 'Пульсометр подключен',
  reconnecting: 'Переподключение…',
};

export function HomeScreen({ navigation }: Props) {
  const [mode, setMode] = useState<WorkoutMode>('treadmill');
  const [targetZoneRange, setTargetZoneRange] = useState<TargetZoneRange | null>(null);
  const [starting, setStarting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const connectionStatus = useSessionStore((s) => s.connectionStatus);
  const connectedDevice = useSessionStore((s) => s.connectedDevice);
  const lastKnownDevice = useSessionStore((s) => s.lastKnownDevice);
  const startWorkout = useSessionStore((s) => s.startWorkout);
  const profile = useProfileStore((s) => s.profile);

  const isConnected = connectionStatus === 'connected';
  const canQuickReconnect = connectionStatus === 'disconnected' && lastKnownDevice !== null;
  const attemptedAutoReconnect = useRef(false);

  useEffect(() => {
    if (attemptedAutoReconnect.current) return;
    if (connectionStatus === 'disconnected' && lastKnownDevice) {
      attemptedAutoReconnect.current = true;
      connectAndSubscribe(lastKnownDevice.id, lastKnownDevice.name).catch(() => {});
    }
  }, [connectionStatus, lastKnownDevice]);

  // A workout restored after the app was killed: go straight back to it.
  const hasActiveWorkout = useSessionStore((s) => s.activeWorkout !== null);
  useEffect(() => {
    if (!hasActiveWorkout) return;
    beginWorkoutService();
    navigation.navigate('ActiveWorkout');
  }, [hasActiveWorkout, navigation]);

  const handleQuickReconnect = async () => {
    if (!lastKnownDevice) return;
    setReconnecting(true);
    try {
      await connectAndSubscribe(lastKnownDevice.id, lastKnownDevice.name);
    } catch {
      navigation.navigate('ScanDevice');
    } finally {
      setReconnecting(false);
    }
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      if (mode === 'outdoor') {
        const granted = await requestLocationPermissions();
        if (!granted) {
          setStarting(false);
          return;
        }
        await startOutdoorTracking();
      }
      await beginWorkoutService();
      startWorkout(mode, targetZoneRange);
      navigation.navigate('ActiveWorkout');
    } finally {
      setStarting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <Ionicons name="heart" size={22} color={colors.accentStart} />
          <Text style={styles.brandText}>LIVEBEAT</Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity onPress={() => navigation.navigate('Stats')}>
            <Ionicons name="bar-chart-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
            <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('History')}>
            <Ionicons name="time-outline" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {!profile && (
        <TouchableOpacity style={styles.profileHint} onPress={() => navigation.navigate('Profile')}>
          <Ionicons name="information-circle-outline" size={18} color={colors.accentStart} />
          <Text style={styles.profileHintText}>Укажи вес, возраст и пол — тогда посчитаем калории и пульсовые зоны</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.statusCard}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('ScanDevice')}
      >
        <View style={[styles.statusDot, isConnected ? styles.dotConnected : styles.dotDisconnected]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>{STATUS_LABEL[connectionStatus]}</Text>
          {connectedDevice && <Text style={styles.statusSubtitle}>{connectedDevice.name}</Text>}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      {canQuickReconnect && (
        <GradientButton
          label={`Переподключиться к ${lastKnownDevice!.name}`}
          onPress={handleQuickReconnect}
          loading={reconnecting}
          variant="outline"
          style={styles.reconnectButton}
        />
      )}

      <Text style={styles.sectionLabel}>РЕЖИМ ТРЕНИРОВКИ</Text>
      <ModeSelector selected={mode} onSelect={setMode} />

      {profile && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>ЦЕЛЕВАЯ ЗОНА ПУЛЬСА</Text>
          <TargetZonePicker value={targetZoneRange} onChange={setTargetZoneRange} />
        </>
      )}

      <View style={styles.spacer} />

      <GradientButton
        label="Начать тренировку"
        onPress={handleStart}
        disabled={!isConnected}
        loading={starting}
      />
      {!isConnected && <Text style={styles.hint}>Подключите пульсометр, чтобы начать</Text>}

      <TouchableOpacity
        style={styles.monitoringCard}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('Monitoring')}
      >
        <View style={styles.monitoringIcon}>
          <Ionicons name="pulse" size={20} color={colors.accentStart} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.monitoringTitle}>Суточный мониторинг</Text>
          <Text style={styles.monitoringSubtitle}>Отслеживать пульс весь день в фоне</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.monitoringCard}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('BleLog')}
      >
        <View style={styles.monitoringIcon}>
          <Ionicons name="document-text-outline" size={20} color={colors.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.monitoringTitle}>Журнал датчика</Text>
          <Text style={styles.monitoringSubtitle}>Подключения, контакт с кожей и качество RR</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>
      </ScrollView>
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
  },
  scrollContent: {
    flexGrow: 1,
  },
  spacer: {
    flexGrow: 1,
    minHeight: spacing.xl,
  },
  monitoringCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  monitoringIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monitoringTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 15,
  },
  monitoringSubtitle: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandText: {
    color: colors.textPrimary,
    fontFamily: fonts.extrabold,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  profileHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  profileHintText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  reconnectButton: {
    marginBottom: spacing.xl,
    minHeight: 44,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotConnected: {
    backgroundColor: colors.success,
  },
  dotDisconnected: {
    backgroundColor: colors.textMuted,
  },
  statusTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: typography.body.fontSize,
  },
  statusSubtitle: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  hint: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
