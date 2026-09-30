import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { BannerTone, banners, colors, fonts, spacing } from '../theme';

interface Props {
  tone: BannerTone;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}

/**
 * Полоса во всю ширину над шапкой активной тренировки: что не так и что с этим
 * делать. Показывается по одной за раз, см. BANNERS в ActiveWorkoutScreen.
 */
export function StateBanner({ tone, title, subtitle, icon }: Props) {
  const palette = banners[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.background }]}>
      <Ionicons name={icon} size={22} color={palette.icon} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },
});
