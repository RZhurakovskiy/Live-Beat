import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme';

// The pill in the top-right corner of every screen: ПОИСК, НАЙДЕНО, ОШИБКА,
// ГОТОВ К СТАРТУ, GPS · Сильный, ТРЕНИРОВКА ЗАВЕРШЕНА…
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

interface Props {
  label: string;
  tone?: BadgeTone;
  // Small leading dot. The mockups use it on live-state badges (GPS · Сильный)
  // and leave it off static ones (ГОТОВ К СТАРТУ).
  dot?: boolean;
  style?: ViewStyle;
}

const TONES: Record<BadgeTone, { background: string; text: string }> = {
  neutral: { background: colors.surfaceAlt, text: colors.textSecondary },
  success: { background: 'rgba(47, 214, 115, 0.14)', text: colors.green },
  warning: { background: 'rgba(255, 178, 61, 0.16)', text: colors.amber },
  danger: { background: 'rgba(255, 59, 92, 0.16)', text: colors.danger },
};

export function StatusBadge({ label, tone = 'neutral', dot = false, style }: Props) {
  const palette = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.background }, style]}>
      {dot && <View style={[styles.dot, { backgroundColor: palette.text }]} />}
      <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});
