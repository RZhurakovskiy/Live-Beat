import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkBlePermissions, requestBlePermissions } from '../ble/heartRate';
import { BottomCta } from '../components/BottomCta';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenTitle } from '../components/ScreenTitle';
import { SectionCard } from '../components/SectionCard';
import { checkLocationPermission, requestLocationPermissions } from '../location/backgroundLocation';
import { RootStackParamList } from '../navigation/types';
import { useProfileStore } from '../store/profileStore';
import { useSessionStore } from '../store/sessionStore';
import { colors, fonts, radii, spacing } from '../theme';
import { Gender } from '../types';
import { checkNotificationPermission, requestNotificationPermission } from '../workout/foregroundService';

type PermissionKey = 'bluetooth' | 'notifications' | 'location';

interface PermissionRow {
  key: PermissionKey;
  title: string;
  description: string;
  check: () => Promise<boolean>;
  request: () => Promise<boolean>;
}

const PERMISSIONS: PermissionRow[] = [
  {
    key: 'bluetooth',
    title: 'Bluetooth',
    description: 'Необходим для сопряжения со спортивными датчиками.',
    check: checkBlePermissions,
    request: requestBlePermissions,
  },
  {
    key: 'notifications',
    title: 'Уведомления',
    description: 'Держит вас в курсе зон интенсивности пульса.',
    check: checkNotificationPermission,
    request: requestNotificationPermission,
  },
  {
    key: 'location',
    title: 'Геолокация GPS',
    description: 'Требуется для точной записи маршрутов пробежек.',
    check: checkLocationPermission,
    request: requestLocationPermissions,
  },
];

const EXTRAS: { route: 'Stats' | 'BleLog'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { route: 'Stats', label: 'Статистика', icon: 'bar-chart-outline' },
  { route: 'BleLog', label: 'Журнал датчика', icon: 'document-text-outline' },
];

interface Props {
  // Shown as a step of the intro (with a "done" button) rather than as the
  // Settings tab.
  onboarding?: boolean;
}

export function SetupScreen({ onboarding = false }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const profile = useProfileStore((s) => s.profile);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const connectedDevice = useSessionStore((s) => s.connectedDevice);
  const liveBpm = useSessionStore((s) => s.liveBpm);

  const [weight, setWeight] = useState(profile ? String(profile.weightKg) : '');
  const [age, setAge] = useState(profile ? String(profile.age) : '');
  const [gender, setGender] = useState<Gender>(profile?.gender ?? 'male');
  const [granted, setGranted] = useState<Record<PermissionKey, boolean>>({
    bluetooth: false,
    notifications: false,
    location: false,
  });

  // Permissions can change in system settings while the app sits in the
  // background, so the state is re-read every time the screen is focused.
  const refreshPermissions = useCallback(() => {
    Promise.all(PERMISSIONS.map((p) => p.check().catch(() => false))).then(([bluetooth, notifications, location]) =>
      setGranted({ bluetooth, notifications, location }),
    );
  }, []);

  useFocusEffect(refreshPermissions);

  const weightValue = Number(weight.replace(',', '.'));
  const ageValue = Number(age);
  const profileValid = weightValue > 0 && weightValue < 300 && ageValue > 0 && ageValue < 120;
  const permissionsDone = granted.bluetooth && granted.notifications && granted.location;
  const sensorDone = connectedDevice !== null;

  // Saved on blur rather than behind a button: the mockup has no save control
  // in this section, the green check is the feedback.
  const persistProfile = () => {
    if (!profileValid) return;
    updateProfile({ weightKg: weightValue, age: ageValue, gender });
  };

  const handleGenderChange = (next: Gender) => {
    setGender(next);
    if (profileValid) updateProfile({ weightKg: weightValue, age: ageValue, gender: next });
  };

  const handlePermission = async (row: PermissionRow) => {
    if (granted[row.key]) return; // an app cannot revoke its own permission
    const ok = await row.request().catch(() => false);
    setGranted((prev) => ({ ...prev, [row.key]: ok }));
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
          variant={permissionsDone ? 'complete' : 'plain'}
        >
          {PERMISSIONS.map((row, index) => (
            <View key={row.key} style={[styles.permission, index > 0 && styles.permissionDivider]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.permissionTitle}>{row.title}</Text>
                <Text style={styles.permissionDescription}>{row.description}</Text>
              </View>
              <Switch
                value={granted[row.key]}
                onValueChange={() => handlePermission(row)}
                // Android gives no way to take a permission back from inside the
                // app, so a granted switch is locked on instead of pretending.
                disabled={granted[row.key]}
                trackColor={{ false: colors.surfaceAlt, true: colors.green }}
                thumbColor="#fff"
              />
            </View>
          ))}
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
        </SectionCard>

        {/* Statistics and the sensor log used to hang off the mode screen; the
            mockups leave no room for them there. Settings is the right home for
            the log, and a temporary one for statistics — stage 9 decides
            whether it belongs under History instead. */}
        {!onboarding && (
          <SectionCard label="ЕЩЁ">
            {EXTRAS.map((extra, index) => (
              <TouchableOpacity
                key={extra.route}
                style={[styles.extraRow, index > 0 && styles.permissionDivider]}
                activeOpacity={0.85}
                onPress={() => navigation.navigate(extra.route)}
              >
                <Ionicons name={extra.icon} size={20} color={colors.textSecondary} />
                <Text style={styles.extraLabel}>{extra.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </SectionCard>
        )}
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
    borderRadius: radii.sm,
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
