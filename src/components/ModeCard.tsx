import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme';
import { WorkoutMode } from '../types';
import { StatusBadge } from './StatusBadge';

const CONFIG: Record<WorkoutMode, { title: string; description: string; icon: keyof typeof Ionicons.glyphMap }> = {
  outdoor: {
    title: 'На улице',
    description: 'Бег, велосипед или ходьба на открытом воздухе. Запись трека.',
    icon: 'location',
  },
  treadmill: {
    title: 'Беговая дорожка',
    description: 'Занятия в помещении. Только пульс, время и калории.',
    icon: 'barbell',
  },
};

interface Props {
  mode: WorkoutMode;
  selected: WorkoutMode;
  onSelect: (mode: WorkoutMode) => void;
  // Footer line under the divider: GPS readiness for outdoor, a plain
  // "no GPS needed" for the treadmill.
  footer: string;
  footerTone?: 'ok' | 'muted' | 'warning';
}

const FOOTER_DOT = {
  ok: colors.green,
  muted: colors.textMuted,
  warning: colors.amber,
};

export function ModeCard({ mode, selected, onSelect, footer, footerTone = 'muted' }: Props) {
  const isActive = mode === selected;
  const { title, description, icon } = CONFIG[mode];

  return (
    <TouchableOpacity
      style={[styles.card, isActive && styles.cardActive]}
      onPress={() => onSelect(mode)}
      activeOpacity={0.85}
    >
      <View style={styles.head}>
        <View style={[styles.icon, isActive && styles.iconActive]}>
          <Ionicons name={icon} size={22} color={isActive ? colors.danger : colors.textSecondary} />
        </View>
        {isActive ? <StatusBadge label="АКТИВЕН" tone="danger" /> : null}
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      <View style={styles.divider} />
      <View style={styles.footerRow}>
        <View style={[styles.footerDot, { backgroundColor: FOOTER_DOT[footerTone] }]} />
        <Text style={styles.footerText}>{footer}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardActive: {
    borderColor: colors.danger,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActive: {
    backgroundColor: 'rgba(255, 59, 92, 0.14)',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 19,
    fontWeight: '700',
  },
  description: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  footerText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
});
