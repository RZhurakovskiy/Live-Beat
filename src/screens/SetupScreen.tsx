import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  checkBlePermissions,
  requestBlePermissions,
  requestEnableBluetooth,
  subscribeBluetoothReadiness,
} from '../ble/heartRate';
import { BottomCta } from '../components/BottomCta';
import { GoalsSection } from '../components/GoalsSection';
import { HistoryDataSection } from '../components/HistoryDataSection';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenTitle } from '../components/ScreenTitle';
import { SectionCard } from '../components/SectionCard';
import { VoiceSection } from '../components/VoiceSection';
import {
  checkLocationPermission,
  checkLocationReadiness,
  openLocationSettings,
  requestLocationPermissions,
} from '../location/backgroundLocation';
import { RootStackParamList } from '../navigation/types';
import { useProfileStore } from '../store/profileStore';
import { useSessionStore } from '../store/sessionStore';
import { colors, fonts, radii, spacing } from '../theme';
import { Gender } from '../types';
import { checkNotificationPermission, requestNotificationPermission } from '../workout/foregroundService';

type PermissionKey = 'bluetooth' | 'notifications' | 'location';

/**
 * Состояние строки разрешения.
 * - `granted`: выдано, строка без действия;
 * - `missing`: не выдано, по тапу системный запрос;
 * - `refused`: запросили, а разрешения так и нет. Повторный запрос Android может уже
 *   не показать, и кнопка «Разрешить» ничего бы не делала, поэтому она ведёт в
 *   настройки приложения.
 */
type PermissionState = 'granted' | 'missing' | 'refused';

interface PermissionRow {
  key: PermissionKey;
  title: string;
  description: string;
  /** Подпись вместо описания после отказа: где именно это разрешение искать. */
  refusedHint: string;
  /**
   * Что показать, когда разрешение есть, а сама функция выключена на телефоне. Разрешение и
   * включённый Bluetooth или геолокация это разные вещи, а включить их за пользователя
   * приложение молча не может. Зелёное «Разрешено» читалось бы как «всё готово», и потом
   * пульсометр не находился бы, а маршрут не записывался без видимой причины.
   */
  off?: { hint: string; action: string; run: () => void };
  check: () => Promise<boolean>;
  request: () => Promise<boolean>;
}

const PERMISSIONS: PermissionRow[] = [
  {
    key: 'bluetooth',
    title: 'Bluetooth',
    description: 'Необходим для сопряжения со спортивными датчиками.',
    // С Android 12 это разрешение в настройках называется «Устройства поблизости».
    refusedHint:
      Platform.OS === 'android' && Platform.Version >= 31
        ? 'Не выдано. В настройках Android это «Устройства поблизости».'
        : 'Не выдано. Разрешить можно в настройках Android.',
    off: {
      hint: 'Разрешено, но Bluetooth выключен. Включите его в шторке Android.',
      action: 'Включить',
      // Системное окно «Включить Bluetooth?». Разрешение на Bluetooth здесь уже выдано,
      // а без него на Android 12+ это окно могло бы не показаться.
      run: () => {
        requestEnableBluetooth();
      },
    },
    check: checkBlePermissions,
    request: requestBlePermissions,
  },
  {
    key: 'notifications',
    title: 'Уведомления',
    description: 'Держит вас в курсе зон интенсивности пульса.',
    refusedHint: 'Не выдано. Разрешить можно в настройках Android.',
    check: checkNotificationPermission,
    request: requestNotificationPermission,
  },
  {
    key: 'location',
    title: 'Геолокация GPS',
    description: 'Требуется для точной записи маршрутов пробежек.',
    refusedHint: 'Не выдано. В настройках Android разрешите геолокацию в любом режиме.',
    off: {
      hint: 'Разрешено, но геолокация выключена. Включите её в шторке Android.',
      action: 'Настройки',
      // Окна «Включить геолокацию?» у Android нет, его рисуют сервисы Google, а с ними проект
      // сознательно не связан. Поэтому только экран настроек геолокации.
      run: () => {
        openLocationSettings();
      },
    },
    check: checkLocationPermission,
    request: requestLocationPermissions,
  },
];

interface Props {
  /** Экран показан шагом интро (с кнопкой «Готово»), а не вкладкой «Настройки». */
  onboarding?: boolean;
}

/**
 * Чек-лист настройки: профиль, системные разрешения и датчик с живым пульсом.
 * Один и тот же экран служит вкладкой «Настройки» и шагом интро.
 */
export function SetupScreen({ onboarding = false }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const profile = useProfileStore((s) => s.profile);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const connectedDevice = useSessionStore((s) => s.connectedDevice);
  const liveBpm = useSessionStore((s) => s.liveBpm);

  // useState: поля ввода управляемые, их значения рисуются в TextInput. В базу профиль
  // уходит только по onBlur, а не на каждое нажатие клавиши.
  const [weight, setWeight] = useState(profile ? String(profile.weightKg) : '');
  const [age, setAge] = useState(profile ? String(profile.age) : '');
  const [gender, setGender] = useState<Gender>(profile?.gender ?? 'male');

  // Профиль может появиться не из этих полей, а из загруженного файла истории. Пустые
  // поля тогда подхватывают его; уже набранное не трогаем.
  useEffect(() => {
    if (!profile) return;
    setWeight((prev) => prev || String(profile.weightKg));
    setAge((prev) => prev || String(profile.age));
    setGender(profile.gender);
  }, [profile]);
  // useState: статусы рисуются в строках разрешений и решают, что делает кнопка.
  const [permissions, setPermissions] = useState<Record<PermissionKey, PermissionState>>({
    bluetooth: 'missing',
    notifications: 'missing',
    location: 'missing',
  });
  // useState: подпись у строк «Bluetooth» и «Геолокация» зависит не только от разрешения, но и
  // от того, включены ли они на телефоне. Их меняют в шторке, и строка должна перерисоваться.
  const [bluetoothOff, setBluetoothOff] = useState(false);
  const [locationOff, setLocationOff] = useState(false);

  // Bluetooth включают и выключают в шторке, не уходя с экрана: подпись следит за ним сама.
  useEffect(() => subscribeBluetoothReadiness((readiness) => setBluetoothOff(readiness === 'off')), []);

  // Разрешения меняют и в системных настройках, поэтому состояние перечитывается
  // при каждом фокусе экрана и при возврате в приложение: из настроек пользователь
  // возвращается на этот же экран, и фокус навигации при этом не меняется. Заодно
  // проверяется, включена ли геолокация: событий об этом нет, остаётся перечитывать.
  const refreshPermissions = useCallback(() => {
    checkLocationReadiness().then((readiness) => setLocationOff(readiness === 'services-off'));
    Promise.all(PERMISSIONS.map((p) => p.check().catch(() => false))).then((results) =>
      setPermissions((prev) => {
        const next = { ...prev };
        PERMISSIONS.forEach((p, i) => {
          // Отказ помним, пока жив экран: иначе кнопка снова стала бы «Разрешить»
          // и снова ничего бы не делала.
          next[p.key] = results[i] ? 'granted' : prev[p.key] === 'refused' ? 'refused' : 'missing';
        });
        return next;
      }),
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshPermissions();
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') refreshPermissions();
      });
      return () => sub.remove();
    }, [refreshPermissions]),
  );

  const weightValue = Number(weight.replace(',', '.'));
  const ageValue = Number(age);
  const profileValid = weightValue > 0 && weightValue < 300 && ageValue > 0 && ageValue < 120;
  const permissionsDone = PERMISSIONS.every((p) => permissions[p.key] === 'granted');
  // Какие из выданных разрешений на деле не работают, потому что функция выключена.
  const radioOff: Record<PermissionKey, boolean> = {
    bluetooth: bluetoothOff,
    notifications: false,
    location: locationOff,
  };
  const anyRadioOff = permissionsDone && (bluetoothOff || locationOff);
  const sensorDone = connectedDevice !== null;

  // Сохраняется по уходу из поля, а не кнопкой: в макете в этой секции кнопки
  // сохранения нет, обратная связь это зелёная галочка.
  const persistProfile = () => {
    if (!profileValid) return;
    updateProfile({ weightKg: weightValue, age: ageValue, gender });
  };

  const handleGenderChange = (next: Gender) => {
    setGender(next);
    if (profileValid) updateProfile({ weightKg: weightValue, age: ageValue, gender: next });
  };

  const handlePermission = async (row: PermissionRow) => {
    if (permissions[row.key] === 'refused') {
      Linking.openSettings().catch(() => {});
      return;
    }
    const ok = await row.request().catch(() => false);
    setPermissions((prev) => ({ ...prev, [row.key]: ok ? 'granted' : 'refused' }));
    // Только что выданное разрешение ещё не значит, что функция включена: проверяем сразу,
    // чтобы строка не показала зелёное «Разрешено» там, где геолокация выключена.
    refreshPermissions();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader dotColor={colors.green} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTitle
          title="Настройка"
          subtitle="Все данные сохраняются и обрабатываются исключительно локально на вашем смартфоне."
        />

        <SectionCard
          label="1. ЛИЧНЫЙ ПРОФИЛЬ"
          variant={profileValid ? 'complete' : 'plain'}
        >
          <View style={styles.fieldRow}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>ВЕС</Text>
              <TextInput
                style={styles.input}
                value={weight}
                onChangeText={setWeight}
                onBlur={persistProfile}
                keyboardType="decimal-pad"
                placeholder="Укажите кг"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>ВОЗРАСТ</Text>
              <TextInput
                style={styles.input}
                value={age}
                onChangeText={setAge}
                onBlur={persistProfile}
                keyboardType="number-pad"
                placeholder="Лет"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>ПОЛ</Text>
          <View style={styles.fieldRow}>
            {(['male', 'female'] as const).map((value) => (
              <TouchableOpacity
                key={value}
                style={[styles.segment, gender === value && styles.segmentActive]}
                onPress={() => handleGenderChange(value)}
              >
                <Text style={[styles.segmentLabel, gender === value && styles.segmentLabelActive]}>
                  {value === 'male' ? 'Мужской' : 'Женский'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SectionCard>

        <SectionCard
          label="2. РАЗРЕШЕНИЯ СИСТЕМЫ"
          variant={permissionsDone && !anyRadioOff ? 'complete' : 'plain'}
        >
          {/* Статус вместо тумблера: действие одностороннее. Приложение может только
              попросить разрешение, отозвать его можно лишь в настройках Android, а
              тумблер обещал бы, что его можно выключить. Зелёная рамка и галочка секции
              тоже только когда всё реально включено, а не просто разрешено. */}
          {PERMISSIONS.map((row, index) => {
            const state = permissions[row.key];
            const off = state === 'granted' && radioOff[row.key] ? row.off : undefined;
            return (
              <View key={row.key} style={[styles.permission, index > 0 && styles.permissionDivider]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.permissionTitle}>{row.title}</Text>
                  <Text style={[styles.permissionDescription, off && styles.permissionDescriptionOff]}>
                    {state === 'refused' ? row.refusedHint : off ? off.hint : row.description}
                  </Text>
                </View>
                {off ? (
                  <TouchableOpacity hitSlop={12} activeOpacity={0.7} style={styles.permissionOff} onPress={off.run}>
                    <Ionicons name="alert-circle" size={16} color={colors.amber} />
                    <Text style={styles.permissionAction}>{off.action}</Text>
                  </TouchableOpacity>
                ) : state === 'granted' ? (
                  <View style={styles.permissionGranted}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                    <Text style={styles.permissionGrantedLabel}>Разрешено</Text>
                  </View>
                ) : (
                  <TouchableOpacity hitSlop={12} activeOpacity={0.7} onPress={() => handlePermission(row)}>
                    <Text style={styles.permissionAction}>{state === 'refused' ? 'Настройки' : 'Разрешить'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
          <Text style={styles.permissionNote}>Отозвать разрешение можно только в настройках Android.</Text>
        </SectionCard>

        <SectionCard
          label="3. МОНИТОРИНГ ЧСС"
          variant={sensorDone ? 'complete' : 'plain'}
          badge={sensorDone ? 'АКТИВЕН' : 'НЕАКТИВЕН'}
          badgeTone={sensorDone ? 'success' : 'danger'}
        >
          <TouchableOpacity
            style={styles.sensorRow}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('ScanDevice')}
          >
            <View style={styles.sensorIcon}>
              <Ionicons
                name={sensorDone ? 'heart' : 'heart-outline'}
                size={20}
                color={sensorDone ? colors.green : colors.textSecondary}
              />
            </View>
            {connectedDevice ? (
              <>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sensorName}>{connectedDevice.name}</Text>
                  <Text style={styles.sensorId}>ID: {connectedDevice.id}</Text>
                </View>
                <Text style={styles.sensorBpm}>{liveBpm != null ? `${liveBpm} bpm` : '—'}</Text>
              </>
            ) : (
              <>
                <Text style={styles.sensorConnect}>Подключить пульсометр</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.textSecondary} />
              </>
            )}
          </TouchableOpacity>
          {/* Диагностика этого датчика, поэтому она стоит рядом с датчиком, а не в
              общей куче несвязанных ссылок. */}
          {!onboarding && (
            <TouchableOpacity
              style={styles.extraRow}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('BleLog')}
            >
              <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.extraLabel}>Журнал датчика</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </SectionCard>

        {!onboarding && <VoiceSection />}

        {!onboarding && <GoalsSection />}

        {!onboarding && <HistoryDataSection />}
      </ScrollView>

      {onboarding && (
        <BottomCta
          label="Готово"
          onPress={() => navigation.replace('Tabs')}
          footer={
            profileValid && permissionsDone && sensorDone
              ? undefined
              : 'Можно закончить настройку позже во вкладке «Настройки»'
          }
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
    paddingBottom: spacing.lg,
  },
  content: {
    gap: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  field: {
    flex: 1,
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 15,
    fontWeight: '600',
  },
  segment: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.button,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  segmentActive: {
    borderColor: colors.green,
  },
  segmentLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentLabelActive: {
    color: colors.textPrimary,
  },
  permission: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  permissionDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  permissionTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 15,
    fontWeight: '600',
  },
  permissionDescription: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  // Описание, когда разрешение есть, а функция выключена: янтарным, чтобы бросалось в глаза.
  permissionDescriptionOff: {
    color: colors.amber,
  },
  permissionOff: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  permissionGranted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  permissionGrantedLabel: {
    color: colors.green,
    fontFamily: fonts.semibold,
    fontSize: 13,
    fontWeight: '600',
  },
  permissionAction: {
    color: colors.accentStart,
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700',
  },
  permissionNote: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  sensorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.sm,
    padding: spacing.md,
  },
  sensorIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sensorName: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 15,
    fontWeight: '700',
  },
  sensorId: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
  sensorBpm: {
    color: colors.green,
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700',
  },
  sensorConnect: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 15,
    fontWeight: '600',
  },
  extraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  extraLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 15,
    fontWeight: '600',
  },
});
