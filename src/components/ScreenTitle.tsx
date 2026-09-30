import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing, typography } from '../theme';

interface Props {
  title: string;
  subtitle?: string;
}

/**
 * Крупный заголовок экрана с приглушённым описанием в одну-две строки под ним:
 * «Настройка», «Поиск датчика», «Режим тренировки», «История».
 */
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
