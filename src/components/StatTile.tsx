import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}

/** Плитка показателя: иконка, крупное значение и подпись. */
export function StatTile({ icon, value, label }: Props) {
  return (
    <View style={styles.tile}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} style={styles.icon} />
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'flex-start',
    gap: 4,
  },
  icon: {
    marginBottom: 2,
  },
  value: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 11,
    fontWeight: '600',
  },
});
