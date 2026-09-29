import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '../theme';
import { GradientButton } from './GradientButton';

// The action block pinned to the bottom of a screen: one gradient button, an
// optional outline button under it, an optional muted footer line.
interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  footer?: string;
}

export function BottomCta({
  label,
  onPress,
  disabled,
  loading,
  secondaryLabel,
  onSecondaryPress,
  footer,
}: Props) {
  return (
    <View style={styles.wrap}>
      <GradientButton label={label} onPress={onPress} disabled={disabled} loading={loading} />
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
