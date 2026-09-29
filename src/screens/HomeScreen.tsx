import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { connectAndSubscribe } from '../ble/connectionManager';
import { BottomCta } from '../components/BottomCta';
import { ModeCard } from '../components/ModeCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenTitle } from '../components/ScreenTitle';
import { TargetZoneCard } from '../components/TargetZoneCard';
import { TargetZoneRange } from '../components/TargetZonePicker';
import {
  checkLocationPermission,
  requestLocationPermissions,
  startOutdoorTracking,
} from '../location/backgroundLocation';
import { TabScreenProps } from '../navigation/types';
import { useSessionStore } from '../store/sessionStore';
import { colors, fonts, spacing } from '../theme';
import { WorkoutMode } from '../types';
import { beginWorkoutService } from '../workout/workoutService';

type Props = TabScreenProps<'Workout'>;

export function HomeScreen({ navigation }: Props) {
  const [mode, setMode] = useState<WorkoutMode>('treadmill');
  const [targetZoneRange, setTargetZoneRange] = useState<TargetZoneRange | null>(null);
  const [starting, setStarting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const connectionStatus = useSessionStore((s) => s.connectionStatus);
  const connectedDevice = useSessionStore((s) => s.connectedDevice);
  const lastKnownDevice = useSessionStore((s) => s.lastKnownDevice);
  const startWorkout = useSessionStore((s) => s.startWorkout);

  const isConnected = connectionStatus === 'connected';
  const attemptedAutoReconnect = useRef(false);

  useFocusEffect(
    useCallback(() => {
      checkLocationPermission().then(setLocationGranted);
    }, []),
  );

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

  // The app was killed while the summary was open: the workout was finished but
  // never saved, so bring that screen back instead of silently losing it.
  const pendingSession = useSessionStore((s) => s.pendingSession);
  useEffect(() => {
    if (!pendingSession) return;
    navigation.navigate('WorkoutSummary', { session: pendingSession });
  }, [pendingSession, navigation]);

  // The footer line doubles as the way back to a sensor: reconnect to the known
  // strap when there is one, otherwise open pairing.
  const handleSensorTap = async () => {
    if (isConnected) return;
    if (!lastKnownDevice) {
      navigation.navigate('ScanDevice');
      return;
    }
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
        setLocationGranted(granted);
        if (!granted) return;
        await startOutdoorTracking();
      }
      await beginWorkoutService();
      startWorkout(mode, targetZoneRange);
      navigation.navigate('ActiveWorkout');
    } finally {
      setStarting(false);
    }
  };

  const sensorFooter = isConnected
    ? 'Трансляция пульса включена'
    : reconnecting
      ? 'Подключаемся к датчику…'
      : lastKnownDevice
        ? `Нажмите, чтобы подключить ${lastKnownDevice.name}`
        : 'Датчик не подключён — нажмите, чтобы выбрать';

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        badge={isConnected ? 'ГОТОВ К СТАРТУ' : 'НЕТ ДАТЧИКА'}
        badgeTone={isConnected ? 'neutral' : 'warning'}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTitle
          title="Режим тренировки"
          subtitle="Выберите тип активности. LiveBeat автоматически настроит датчики и GPS."
        />

        <TargetZoneCard value={targetZoneRange} onChange={setTargetZoneRange} />

        <ModeCard
          mode="outdoor"
          selected={mode}
          onSelect={setMode}
          footer={locationGranted ? 'GPS подключён' : 'Нужно разрешение на геолокацию'}
          footerTone={locationGranted ? 'ok' : 'warning'}
        />
        <ModeCard mode="treadmill" selected={mode} onSelect={setMode} footer="Без GPS" footerTone="muted" />
      </ScrollView>

      <BottomCta
        label="Начать тренировку"
        onPress={handleStart}
        disabled={!isConnected}
        loading={starting}
      />
      <TouchableOpacity
        style={styles.sensorLine}
        activeOpacity={isConnected ? 1 : 0.7}
        onPress={handleSensorTap}
        disabled={isConnected || reconnecting}
      >
        <View style={[styles.sensorDot, isConnected ? styles.dotOn : styles.dotOff]} />
        <Text style={styles.sensorText}>
          {sensorFooter}
          {isConnected && connectedDevice ? ` · ${connectedDevice.name}` : ''}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  content: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  sensorLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  sensorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotOn: {
    backgroundColor: colors.green,
  },
  dotOff: {
    backgroundColor: colors.amber,
  },
  sensorText: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
});
