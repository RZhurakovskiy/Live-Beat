import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Device } from 'react-native-ble-plx';
import { connectAndSubscribe } from '../ble/connectionManager';
import { pickAdvertisedName } from '../ble/deviceInfo';
import { requestBlePermissions, scanForHeartRateDevices, waitForPoweredOn } from '../ble/heartRate';
import { BottomCta } from '../components/BottomCta';
import { ScanPulse } from '../components/ScanPulse';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenTitle } from '../components/ScreenTitle';
import { SignalBars } from '../components/SignalBars';
import { RootStackScreenProps } from '../navigation/types';
import { useSessionStore } from '../store/sessionStore';
import { colors, fonts, radii, spacing } from '../theme';

type Props = RootStackScreenProps<'ScanDevice'>;

// Ремень, которым пользуется владелец. Макет помечает его как рекомендуемый.
const RECOMMENDED = /magene/i;

interface Found {
  id: string;
  name: string;
  rssi: number | null;
}

type Phase = 'scanning' | 'found' | 'error';

/**
 * Сопряжение с датчиком, модальный экран. Три состояния: поиск (радар), найдено
 * (список с уровнем сигнала), ошибка. Тап по строке выбирает ремень, подключает
 * нижняя кнопка.
 */
export function ScanDeviceScreen({ navigation }: Props) {
  // useState: список, выбор, загрузка и ошибка рисуются на экране.
  const [devices, setDevices] = useState<Found[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // useRef, а не useState: здесь хранится функция остановки сканирования, а не
  // данные для отрисовки. Её читает `stop`, созданный один раз через useCallback без
  // зависимостей; состояние он видел бы таким, каким оно было в первом рендере, то
  // есть null, и остановить сканирование не смог бы.
  const stopScan = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    stopScan.current?.();
    stopScan.current = null;
  }, []);

  const startScan = useCallback(async () => {
    setError(null);
    const permitted = await requestBlePermissions();
    if (!permitted) {
      setError('Нет разрешения на использование Bluetooth');
      return;
    }
    await waitForPoweredOn();

    stopScan.current = scanForHeartRateDevices(
      (device: Device) => {
        // Знакомый ремень показываем под уже опознанной моделью, как везде в приложении,
        // остальные под лучшим из имён, что пришли в эфире.
        const known = useSessionStore.getState().lastKnownDevice;
        const name =
          known?.id === device.id ? known.name : (pickAdvertisedName(device.name, device.localName) ?? 'Пульсометр');
        setDevices((prev) => {
          const entry: Found = { id: device.id, name, rssi: device.rssi };
          const index = prev.findIndex((d) => d.id === device.id);
          // Повторные рекламные пакеты несут свежий RSSI, поэтому запись заменяется,
          // а не пропускается: так полоски сигнала остаются живыми.
          if (index === -1) return [...prev, entry];
          const next = [...prev];
          next[index] = entry;
          return next;
        });
      },
      () => setError('Ошибка сканирования Bluetooth'),
    );
  }, []);

  useEffect(() => {
    startScan();
    return stop;
  }, [startScan, stop]);

  // Первый найденный ремень выбирается сам, чтобы кнопка подключения работала сразу.
  // Рекомендуемый перехватывает выбор, если появится позже.
  useEffect(() => {
    if (devices.length === 0) return;
    const recommended = devices.find((d) => RECOMMENDED.test(d.name));
    setSelectedId((current) => {
      if (recommended) return recommended.id;
      return current ?? devices[0].id;
    });
  }, [devices]);

  const handleConnect = async () => {
    const device = devices.find((d) => d.id === selectedId);
    if (!device) return;
    // Сначала останавливаем сканирование: на Android идущий поиск делает
    // подключение медленнее и ненадёжнее.
    stop();
    setConnecting(true);
    setError(null);
    try {
      await connectAndSubscribe(device.id, device.name);
      navigation.goBack();
    } catch {
      setError('Не удалось подключиться');
    } finally {
      setConnecting(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    startScan();
  };

  const handlePickAnother = () => {
    setError(null);
    setDevices([]);
    setSelectedId(null);
    startScan();
  };

  const phase: Phase = error ? 'error' : devices.length > 0 ? 'found' : 'scanning';

  const SUBTITLE: Record<Phase, string> = {
    scanning: 'Ищем пульсометры в радиусе действия Bluetooth. Поднесите датчик ближе.',
    found: 'Выберите датчик для подключения. Мы рекомендуем использовать Magene H64 для максимальной точности.',
    error: 'Возникла проблема при установлении связи с пульсометром.',
  };

  const BADGE: Record<Phase, { label: string; tone: 'neutral' | 'success' | 'danger' }> = {
    scanning: { label: 'ПОИСК', tone: 'neutral' },
    found: { label: 'НАЙДЕНО', tone: 'success' },
    error: { label: 'ОШИБКА', tone: 'danger' },
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader dotColor={colors.green} badge={BADGE[phase].label} badgeTone={BADGE[phase].tone} />

      <View style={styles.titleWrap}>
        <ScreenTitle title="Поиск датчика" subtitle={SUBTITLE[phase]} />
      </View>

      {phase === 'scanning' && (
        <View style={styles.center}>
          <ScanPulse />
          <Text style={styles.centerTitle}>Поиск устройств поблизости…</Text>
          <Text style={styles.centerHint}>Убедитесь, что датчик включён и находится рядом</Text>
        </View>
      )}

      {phase === 'error' && (
        <View style={styles.center}>
          <View style={styles.errorCircle}>
            <Ionicons name="alert" size={34} color={colors.danger} />
          </View>
          <Text style={styles.errorTitle}>{error}</Text>
          <Text style={styles.centerHint}>
            Проверьте, что датчик включён, находится близко к телефону, и попробуйте снова.
          </Text>
        </View>
      )}

      {phase === 'found' && (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {devices.map((device) => {
            const selected = device.id === selectedId;
            return (
              <TouchableOpacity
                key={device.id}
                style={[styles.row, selected && styles.rowSelected]}
                activeOpacity={0.85}
                onPress={() => setSelectedId(device.id)}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="heart" size={18} color={selected ? colors.green : colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, selected && styles.rowNameSelected]}>{device.name}</Text>
                  <Text style={styles.rowId}>ID: {device.id}</Text>
                </View>
                <SignalBars rssi={device.rssi} color={selected ? colors.green : colors.textSecondary} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {phase === 'scanning' && (
        <BottomCta label="Отмена" variant="outline" onPress={() => navigation.goBack()} />
      )}

      {phase === 'found' && (
        <BottomCta
          label="Подключить"
          onPress={handleConnect}
          disabled={selectedId === null}
          loading={connecting}
        />
      )}

      {phase === 'error' && (
        <BottomCta
          label="Повторить"
          onPress={handleRetry}
          secondaryLabel="Выбрать другой датчик"
          onSecondaryPress={handlePickAnother}
        />
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
  },
  titleWrap: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  centerTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 16,
    fontWeight: '700',
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  centerHint: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  errorCircle: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  errorTitle: {
    color: colors.danger,
    fontFamily: fonts.bold,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  list: {
    flexGrow: 1,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: spacing.md,
  },
  rowSelected: {
    borderColor: colors.green,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 15,
    fontWeight: '700',
  },
  rowNameSelected: {
    color: colors.green,
  },
  rowId: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
});
