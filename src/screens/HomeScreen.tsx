import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { connectAndSubscribe } from '../ble/connectionManager';
import { BottomCta } from '../components/BottomCta';
import { ActivityGrid } from '../components/ActivityGrid';
import { ModeCard } from '../components/ModeCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenTitle } from '../components/ScreenTitle';
import { TargetZoneCard } from '../components/TargetZoneCard';
import { TargetZoneRange } from '../components/TargetZonePicker';
import {
  checkLocationReadiness,
  LocationReadiness,
  openLocationSettings,
  requestLocationPermissions,
  startOutdoorTracking,
} from '../location/backgroundLocation';
import { TabScreenProps } from '../navigation/types';
import { useSessionStore } from '../store/sessionStore';
import { colors, fonts, spacing } from '../theme';
import { WorkoutMode } from '../types';
import { activityOf } from '../workout/activities';
import { beginWorkoutService } from '../workout/workoutService';

type Props = TabScreenProps<'Workout'>;

const OUTDOOR_FOOTER: Record<LocationReadiness, { text: string; tone: 'ok' | 'warning' }> = {
  'no-permission': { text: 'Нужно разрешение на геолокацию', tone: 'warning' },
  'services-off': { text: 'Геолокация на телефоне выключена', tone: 'warning' },
  ready: { text: 'GPS включён', tone: 'ok' },
};

/**
 * Вкладка «Тренировка»: выбор режима, целевая зона и старт. Без подключённого
 * датчика старт недоступен; строка внизу ведёт к датчику. При монтировании один
 * раз пробует подключиться к знакомому ремню, а после выгрузки приложения
 * возвращает на недоконченную тренировку или на её итоги.
 */
export function HomeScreen({ navigation }: Props) {
  // useState: всё это видно на экране (выбранный режим, зона, загрузка на кнопке,
  // строка датчика, футер карточки вида с GPS), смена обязана его перерисовать.
  const [mode, setMode] = useState<WorkoutMode>('treadmill');
  const [targetZoneRange, setTargetZoneRange] = useState<TargetZoneRange | null>(null);
  const [starting, setStarting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [locationState, setLocationState] = useState<LocationReadiness>('no-permission');
  const connectionStatus = useSessionStore((s) => s.connectionStatus);
  const connectedDevice = useSessionStore((s) => s.connectedDevice);
  const lastKnownDevice = useSessionStore((s) => s.lastKnownDevice);
  const startWorkout = useSessionStore((s) => s.startWorkout);

  const isConnected = connectionStatus === 'connected';
  const activity = activityOf(mode);
  // useRef, а не useState: одноразовый предохранитель «уже пробовали подключиться».
  // На экране он не виден. Состояние дало бы лишнюю перерисовку, а попав в
  // зависимости эффекта, перезапускало бы его от собственной записи.
  const attemptedAutoReconnect = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const refresh = () => {
        checkLocationReadiness().then(setLocationState);
      };
      refresh();
      // Геолокацию включают в шторке или в системных настройках, не уходя с экрана.
      // `focus` приходит, когда закрыли шторку, `change` при возврате из настроек.
      const focusSub = AppState.addEventListener('focus', refresh);
      const changeSub = AppState.addEventListener('change', (state) => {
        if (state === 'active') refresh();
      });
      return () => {
        focusSub.remove();
        changeSub.remove();
      };
    }, []),
  );

  // Один раз пробуем подключиться к знакомому ремню, без повторов: вне тренировки
  // цикл повторов не работает, чтобы забытый в ящике ремень не занимал радио.
  useEffect(() => {
    if (attemptedAutoReconnect.current) return;
    if (connectionStatus === 'disconnected' && lastKnownDevice) {
      attemptedAutoReconnect.current = true;
      connectAndSubscribe(lastKnownDevice.id, lastKnownDevice.name).catch(() => {});
    }
  }, [connectionStatus, lastKnownDevice]);

  // Тренировка восстановлена после выгрузки приложения: сразу возвращаемся в неё.
  const hasActiveWorkout = useSessionStore((s) => s.activeWorkout !== null);
  useEffect(() => {
    if (!hasActiveWorkout) return;
    beginWorkoutService();
    navigation.navigate('ActiveWorkout');
  }, [hasActiveWorkout, navigation]);

  // Приложение выгрузили, пока были открыты итоги: тренировка закончена, но не
  // сохранена. Возвращаем тот экран, а не теряем её молча.
  const pendingSession = useSessionStore((s) => s.pendingSession);
  useEffect(() => {
    if (!pendingSession) return;
    navigation.navigate('WorkoutSummary', { session: pendingSession });
  }, [pendingSession, navigation]);

  // Строка внизу заодно путь обратно к датчику: есть знакомый ремень, подключаемся к
  // нему, нет, открываем сопряжение.
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
      if (activity.hasGps) {
        const granted = await requestLocationPermissions();
        const readiness = granted ? await checkLocationReadiness() : 'no-permission';
        setLocationState(readiness);
        if (readiness === 'no-permission') {
          Alert.alert(
            'Нет доступа к геолокации',
            'Без него маршрут не запишется. Разрешите доступ к местоположению в настройках приложения, в любом режиме.',
            [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Открыть настройки', onPress: () => Linking.openSettings().catch(() => {}) },
            ],
          );
          return;
        }
        if (readiness === 'services-off') {
          Alert.alert(
            'Геолокация выключена',
            'Разрешение есть, но на телефоне выключена сама геолокация, и маршрут не запишется. Включите её в шторке или в настройках, затем начните тренировку.',
            [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Открыть настройки', onPress: () => openLocationSettings() },
            ],
          );
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

  const sensorFooter = isConnected
    ? 'Трансляция пульса включена'
    : reconnecting
      ? 'Подключаемся к датчику…'
      : lastKnownDevice
        ? `Нажмите, чтобы подключить ${lastKnownDevice.name}`
        : 'Датчик не подключён - нажмите, чтобы выбрать';

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

        <ActivityGrid selected={mode} onSelect={setMode} />
        <ModeCard
          activity={activity}
          footer={activity.hasGps ? OUTDOOR_FOOTER[locationState].text : 'Без GPS'}
          footerTone={activity.hasGps ? OUTDOOR_FOOTER[locationState].tone : 'muted'}
        />
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
