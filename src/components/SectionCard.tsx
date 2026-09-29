import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme';
import { BadgeTone, StatusBadge } from './StatusBadge';

// The rounded surface block every mockup is built from. `active` outlines it in
// the accent colour (selected training mode), `complete` in green (a finished
// setup section).
type Variant = 'plain' | 'active' | 'complete';

interface Props {
  children: ReactNode;
  variant?: Variant;
  // Optional small heading row: a label on the left, an optional badge right.
  label?: string;
  badge?: string;
  badgeTone?: BadgeTone;
  style?: ViewStyle;
}

const BORDERS: Record<Variant, string | undefined> = {
  plain: undefined,
  active: colors.danger,
  complete: colors.green,
};

export function SectionCard({ children, variant = 'plain', label, badge, badgeTone = 'neutral', style }: Props) {
  const borderColor = BORDERS[variant];
  return (
    <View style={[styles.card, borderColor ? { borderColor, borderWidth: 1.5 } : null, style]}>
      {(label || badge || variant === 'complete') && (
        <View style={styles.head}>
          {label ? <Text style={[styles.label, variant === 'plain' ? null : { color: borderColor }]}>{label}</Text> : <View />}
          {/* A finished section is marked by a check; a badge, when given,
              says something the check can't and wins the slot. */}
          {badge ? (
            <StatusBadge label={badge} tone={badgeTone} />
          ) : variant === 'complete' ? (
            <Ionicons name="checkmark-circle-outline" size={22} color={colors.green} />
          ) : null}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg + 4,
    gap: spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
