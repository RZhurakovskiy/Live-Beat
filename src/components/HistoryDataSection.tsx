import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { exportHistory, importHistory } from '../data/historyTransfer';
import { colors, fonts, spacing } from '../theme';
import { pluralRu } from '../utils/format';
import { SectionCard } from './SectionCard';

const trainings = (n: number) => pluralRu(n, 'тренировка', 'тренировки', 'тренировок');

/**
 * Секция «Данные» в настройках: выгрузить всю историю в файл и загрузить её обратно.
 * Нужна для бэкапа, переезда на новый телефон и смены ключа подписи перед RuStore,
 * после которой приложение ставится только начисто.
 */
export function HistoryDataSection() {
  // useState: пока идёт выгрузка или загрузка, кнопки заблокированы и крутится индикатор.
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const handleExport = async () => {
    setBusy('export');
    try {
      const result = await exportHistory();
      if (!result.ok) Alert.alert('Не удалось выгрузить', result.message);
    } catch {
      Alert.alert('Не удалось выгрузить', 'Не получилось записать файл.');
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    setBusy('import');
    try {
      const result = await importHistory();
      if (result.ok) {
        const lines = [`Добавлено: ${trainings(result.added)}.`];
        if (result.duplicates > 0) lines.push(`Уже были на телефоне: ${result.duplicates}.`);
        if (result.skipped > 0) lines.push(`Повреждены и пропущены: ${result.skipped}.`);
        if (result.profileRestored) lines.push('Профиль восстановлен из файла.');
        Alert.alert('История загружена', lines.join('\n'));
      } else if (!result.canceled) {
        Alert.alert('Не удалось загрузить', result.message);
      }
    } catch {
      Alert.alert('Не удалось загрузить', 'Не получилось прочитать или сохранить тренировки.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard label="ДАННЫЕ">
      <Row
        icon="share-outline"
        title="Выгрузить историю"
        description="Все тренировки и профиль в один файл: бэкап или перенос на новый телефон."
        loading={busy === 'export'}
        disabled={busy !== null}
        onPress={handleExport}
      />
      <View style={styles.divider} />
      <Row
        icon="download-outline"
        title="Загрузить историю"
        description="Добавить тренировки из файла. То, что уже есть на телефоне, не перезаписывается."
        loading={busy === 'import'}
        disabled={busy !== null}
        onPress={handleImport}
      />
    </SectionCard>
  );
}

interface RowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}

/** Строка-действие секции: иконка, название, пояснение, справа индикатор или шеврон. */
function Row({ icon, title, description, loading, disabled, onPress }: RowProps) {
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.85} disabled={disabled} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.textSecondary} />
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.accentStart} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: {
    flex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 15,
    fontWeight: '600',
  },
  description: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
});
