import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '../theme';
import { GradientButton } from './GradientButton';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /**
   * Некоторые экраны заканчиваются тихим действием, а не призывом: «Отмена» при
   * поиске датчика обведена, а не залита градиентом.
   */
  variant?: 'filled' | 'outline';
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  footer?: string;
}

/**
 * Блок действий, прижатый к низу экрана: одна главная кнопка, под ней по желанию
 * обведённая вторичная и приглушённая строка-подпись.
 */
export function BottomCta({
  label,
  onPress,
  disabled,
  loading,
  variant = 'filled',
  secondaryLabel,
  onSecondaryPress,
  footer,
}: Props) {
  return (
    <View style={styles.wrap}>
      <GradientButton label={label} onPress={onPress} disabled={disabled} loading={loading} variant={variant} />
      {secondaryLabel && onSecondaryPress ? (
        <GradientButton label={secondaryLabel} onPress={onSecondaryPress} variant="outline" />
      ) : null}
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  footer: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
