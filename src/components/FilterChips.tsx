import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme';

/** Один чип: значение, подпись и, если чип фильтрует список, счётчик. */
export interface FilterChip<T extends string> {
  value: T;
  label: string;
  /** Нет, когда чип просто выбор, а не фильтр над списком. */
  count?: number;
}

interface Props<T extends string> {
  chips: FilterChip<T>[];
  selected: T;
  onSelect: (value: T) => void;
}

/** Горизонтальный ряд чипов, выбран ровно один: фильтры истории, период статистики. */
export function FilterChips<T extends string>({ chips, selected, onSelect }: Props<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chips.map((chip) => {
        const active = chip.value === selected;
        return (
          <TouchableOpacity
            key={chip.value}
            style={[styles.chip, active && styles.chipActive]}
            activeOpacity={0.85}
            onPress={() => onSelect(chip.value)}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {chip.count === undefined ? chip.label : `${chip.label} ${chip.count}`}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    borderRadius: radii.button,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.textPrimary,
  },
  label: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 13,
    fontWeight: '600',
  },
  labelActive: {
    color: colors.background,
  },
});
