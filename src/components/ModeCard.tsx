import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme';
import { Activity } from '../workout/activities';
import { StatusBadge } from './StatusBadge';

interface Props {
  activity: Activity;
  /** Строка под разделителем: готовность GPS для видов с GPS, простое «Без GPS» для остальных. */
  footer: string;
  footerTone?: 'ok' | 'muted' | 'warning';
}

const FOOTER_DOT = {
  ok: colors.green,
  muted: colors.textMuted,
  warning: colors.amber,
};

/**
 * Крупная карточка выбранного вида тренировки: иконка, название, пояснение и строка
 * готовности. Выбирают вид в сетке над ней (`ActivityGrid`), так что карточка всегда
 * про выбранный вид, обведена красным и помечена «ВЫБРАН».
 */
export function ModeCard({ activity, footer, footerTone = 'muted' }: Props) {
  const { title, description } = activity;
  const icon = activity.icon as keyof typeof Ionicons.glyphMap;

  return (
    <View style={[styles.card, styles.cardActive]}>
      <View style={styles.head}>
        <View style={[styles.icon, styles.iconActive]}>
          <Ionicons name={icon} size={22} color={colors.danger} />
        </View>
        <StatusBadge label="ВЫБРАН" tone="danger" />
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      <View style={styles.divider} />
      <View style={styles.footerRow}>
        <View style={[styles.footerDot, { backgroundColor: FOOTER_DOT[footerTone] }]} />
        <Text style={styles.footerText}>{footer}</Text>
      </View>
    </View>
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
