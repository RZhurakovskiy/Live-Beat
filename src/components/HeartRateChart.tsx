import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { HrSample } from '../types';
import { colors, fonts, radii, spacing } from '../theme';

interface Props {
  samples: HrSample[];
  title?: string;
  height?: number;
  color?: string;
  /**
   * Отрезки времени, подсвеченные полосами под линией: работа интервального таймера.
   * Настенное время, как у показаний.
   */
  bands?: { from: number; to: number }[];
}

const VIEW_WIDTH = 300;

/** Линия пульса и заливка под ней в координатах SVG. Меньше двух точек: `null`. */
function buildPaths(samples: HrSample[], width: number, height: number) {
  if (samples.length < 2) return null;

  const bpmValues = samples.map((s) => s.bpm);
  const minBpm = Math.min(...bpmValues);
  const maxBpm = Math.max(...bpmValues);
  const range = Math.max(maxBpm - minBpm, 1);
  const padding = 6;

  const points = samples.map((sample, i) => {
    const x = (i / (samples.length - 1)) * width;
    const y = padding + (1 - (sample.bpm - minBpm) / range) * (height - padding * 2);
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height} L 0 ${height} Z`;

  return { linePath, areaPath };
}

/**
 * Координата x момента `t`. По оси x график идёт по номеру показания, а не по времени,
 * поэтому момент переводится в номер первого показания не раньше него.
 */
function xForTime(samples: HrSample[], t: number, width: number): number {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return (lo / (samples.length - 1)) * width;
}

/**
 * График пульса: линия с градиентной заливкой, по высоте растянут от минимума до
 * максимума. Самописный SVG, а не react-native-gifted-charts: у той подтверждённый
 * баг бесконечной перерисовки на часто обновляемых живых данных (tech-stack.md).
 */
export function HeartRateChart({
  samples,
  title = 'Пульс за тренировку',
  height = 120,
  color = colors.accentStart,
  bands,
}: Props) {
  const paths = useMemo(() => buildPaths(samples, VIEW_WIDTH, height), [samples, height]);
  const bandRects = useMemo(() => {
    if (!bands?.length || samples.length < 2) return [];
    return bands
      .map((b) => {
        const x1 = xForTime(samples, b.from, VIEW_WIDTH);
        const x2 = xForTime(samples, b.to, VIEW_WIDTH);
        return { x: x1, width: Math.max(0, x2 - x1) };
      })
      .filter((r) => r.width > 0);
  }, [bands, samples]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={{ height }}>
        {paths ? (
          <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_WIDTH} ${height}`} preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="hrFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.35} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {bandRects.map((r, i) => (
              <Rect key={i} x={r.x} y={0} width={r.width} height={height} fill={colors.danger} opacity={0.12} />
            ))}
            <Path d={paths.areaPath} fill="url(#hrFill)" stroke="none" />
            <Path d={paths.linePath} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Собираем данные…</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  title: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
});
