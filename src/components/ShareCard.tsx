import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, fonts, spacing } from '../theme';
import { WorkoutSession } from '../types';
import { downsample, projectRoute, sparkline, toPath } from '../utils/routeShape';
import { buildShareCard } from '../workout/shareCard';

/** Размер карточки в dp. Снимок увеличивается до 1080 на 1440 пикселей. */
export const SHARE_CARD_WIDTH = 360;
export const SHARE_CARD_HEIGHT = 480;

const VISUAL_WIDTH = SHARE_CARD_WIDTH - spacing.lg * 2;
const VISUAL_HEIGHT = 150;
const PADDING = 14;
// Точек на рисунке хватает с запасом: больше глаз не различит, а отрисовка медленнее.
const MAX_POINTS = 240;

interface Props {
  session: WorkoutSession;
  /** Максимальный пульс из профиля для полосы зон, `null` без профиля. */
  maxHr: number | null;
}

/**
 * Карточка тренировки для отправки картинкой: маршрут линией (или линия пульса), четыре
 * показателя и полоса зон. Маршрут рисуется без карты, поэтому не зависит от тайлов и сети и
 * на снимке выходит одинаково везде. Рендерится невидимо только на время снимка
 * (`SessionDetailsScreen`), а на экране её нет.
 */
export function ShareCard({ session, maxHr }: Props) {
  const card = useMemo(() => buildShareCard(session, maxHr), [session, maxHr]);

  const path = useMemo(() => {
    if (card.visual === 'route') {
      const pts = projectRoute(downsample(session.route ?? [], MAX_POINTS), VISUAL_WIDTH, VISUAL_HEIGHT, PADDING);
      return { d: toPath(pts), first: pts[0], last: pts[pts.length - 1] };
    }
    if (card.visual === 'pulse') {
      const values = downsample(session.hrSamples, MAX_POINTS).map((s) => s.bpm);
      const pts = sparkline(values, VISUAL_WIDTH, VISUAL_HEIGHT, PADDING);
      return { d: toPath(pts), first: null, last: null };
    }
    return null;
  }, [card.visual, session.route, session.hrSamples]);

  return (
    // collapsable={false}: иначе Android может схлопнуть этот вид, и снимать будет нечего.
    <View style={styles.card} collapsable={false}>
      <View style={styles.head}>
        <View style={styles.brand}>
          <View style={styles.dot} />
          <Text style={styles.brandText}>LIVEBEAT</Text>
        </View>
        <Text style={styles.date}>{card.dateText}</Text>
      </View>

      <Text style={styles.title}>{card.title}</Text>

      <View style={styles.visual}>
        {path ? (
          <Svg width={VISUAL_WIDTH} height={VISUAL_HEIGHT}>
            <Path
              d={path.d}
              fill="none"
              stroke={colors.accentStart}
              strokeWidth={card.visual === 'route' ? 3.5 : 2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {path.first && <Circle cx={path.first.x} cy={path.first.y} r={5} fill={colors.green} />}
            {path.last && <Circle cx={path.last.x} cy={path.last.y} r={5} fill={colors.accentEnd} />}
          </Svg>
        ) : (
          <Text style={styles.noVisual}>Нет данных для рисунка</Text>
        )}
      </View>

      <View style={styles.stats}>
        {card.stats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {card.zones && (
        <View style={styles.zones}>
          <View style={styles.zoneBar}>
            {card.zones.map((z) =>
              z.percent > 0 ? <View key={z.index} style={{ flex: z.percent, backgroundColor: z.color }} /> : null,
            )}
          </View>
          <View style={styles.zoneLegend}>
            {card.zones.map((z) => (
              <Text key={z.index} style={[styles.zoneText, { color: z.color }]}>
                З{z.index} {z.percent}%
              </Text>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentStart,
  },
  brandText: {
    color: colors.textPrimary,
    fontFamily: fonts.extrabold,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  date: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 11,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extrabold,
    fontSize: 26,
    fontWeight: '800',
  },
  visual: {
    height: VISUAL_HEIGHT,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  noVisual: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  stat: {
    width: (VISUAL_WIDTH - spacing.sm) / 2,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  statValue: {
    color: colors.textPrimary,
    fontFamily: fonts.extrabold,
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
  },
  zones: {
    gap: spacing.xs,
  },
  zoneBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  zoneLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  zoneText: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    fontWeight: '600',
  },
});
