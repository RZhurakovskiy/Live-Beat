import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, GestureResponderEvent, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { colors, fonts, gradients, radii, spacing, typography } from '../theme';

interface Props {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'filled' | 'outline';
  style?: ViewStyle;
}

/**
 * Кнопка приложения: залитая градиентом бренда или обведённая (`outline`). Пока
 * идёт `loading`, вместо подписи крутилка, и кнопка не нажимается.
 */
export function GradientButton({ label, onPress, disabled, loading, variant = 'filled', style }: Props) {
  if (variant === 'outline') {
    return (
      <TouchableOpacity
        style={[styles.outline, style]}
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.75}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.outlineLabel}>{label}</Text>}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || loading} activeOpacity={0.85} style={style}>
      <LinearGradient
        colors={gradients.accent}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.filled, disabled && styles.disabled]}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.filledLabel}>{label}</Text>}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  filled: {
    minHeight: 56,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  disabled: {
    opacity: 0.5,
  },
  filledLabel: {
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  outline: {
    minHeight: 56,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  outlineLabel: {
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    textAlign: 'center',
  },
});
