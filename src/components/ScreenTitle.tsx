import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing, typography } from '../theme';

// Large screen title with a muted one-or-two-line description under it —
// «Настройка», «Поиск датчика», «Режим тренировки», «История».
interface Props {
  title: string;
  subtitle?: string;
}

export function ScreenTitle({ title, subtitle }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs + 2,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
});
