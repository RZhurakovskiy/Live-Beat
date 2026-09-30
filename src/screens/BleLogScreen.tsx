import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useSyncExternalStore } from 'react';
import { FlatList, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BleLogEntry,
  clearBleLog,
  getBleLog,
  getBleLogEntries,
  subscribeBleLog,
} from '../ble/bleLog';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radii, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'BleLog'>;

function accentFor(message: string): string {
  if (message.startsWith('connected to') || message.startsWith('battery:') || message.startsWith('model:')) {
    return colors.green;
  }
  if (message.includes('not advertising')) return colors.blue;
  if (message.includes('no skin contact') || message.includes('error') || message.includes('fail')) {
    return colors.accentStart;
  }
  return colors.textMuted;
}

/**
 * Журнал датчика: события подключения, контакта и заряда. У релизной сборки нет
 * Metro-консоли, так что это единственный способ посмотреть, что было с датчиком,
 * прямо с телефона. Можно поделиться текстом и очистить.
 */
export function BleLogScreen({ navigation }: Props) {
  const entries = useSyncExternalStore(subscribeBleLog, getBleLogEntries);

  // Новые сверху: на телефоне интересна всегда последняя строка.
  const rows = useMemo(() => [...entries].reverse(), [entries]);

  const share = () => {
    Share.share({ message: getBleLog() }).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Журнал датчика</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={share} accessibilityLabel="Поделиться журналом">
            <Ionicons name="share-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={clearBleLog} accessibilityLabel="Очистить журнал">
            <Ionicons name="trash-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.hint}>
        Журнал подключения к датчику. «connecting» / «failed» - попытки соединения,
        «is not advertising» - датчик пропал из эфира (выключился или вне зоны), «no skin
        contact» - ремень не читает сердце. «battery» приходит через 5 с после подключения,
        «model» там же, но один раз для каждого нового ремня.
      </Text>

      <FlatList
        data={rows}
        keyExtractor={(item: BleLogEntry) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Журнал пуст - подключи датчик</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: accentFor(item.message) }]} />
            <Text style={styles.time}>{new Date(item.ts).toLocaleTimeString('ru-RU')}</Text>
            <Text style={styles.message} selectable>
              {item.message}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
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
  hint: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: spacing.md,
  },
  list: {
    gap: spacing.xs,
    paddingBottom: spacing.xl,
  },
  empty: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
  },
  time: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  message: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
});
