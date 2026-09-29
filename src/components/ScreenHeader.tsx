import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '../theme';
import { BadgeTone, StatusBadge } from './StatusBadge';

interface Props {
  // Right-hand state pill. Omit it and the header is just the wordmark.
  badge?: string;
  badgeTone?: BadgeTone;
  badgeDot?: boolean;
  // The dot before LIVEBEAT. Onboarding frames draw it green, the training and
  // history frames orange — so it is a prop rather than a constant.
  dotColor?: string;
}

export function ScreenHeader({ badge, badgeTone = 'neutral', badgeDot = false, dotColor = colors.accentStart }: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <View style={[styles.brandDot, { backgroundColor: dotColor }]} />
        <Text style={styles.brandName}>LIVEBEAT</Text>
      </View>
      {badge ? <StatusBadge label={badge} tone={badgeTone} dot={badgeDot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  brandName: {
    color: colors.textPrimary,
    fontFamily: fonts.extrabold,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
});
