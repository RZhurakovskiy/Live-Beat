import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '../theme';
import { WorkoutSession } from '../types';
import { formatDuration, formatPace } from '../utils/format';
import { computeSplits } from '../utils/splits';
import { SectionCard } from './SectionCard';

interface Props {
  session: WorkoutSession;
}

/**
 * Карточка «Сплиты» уличной тренировки: по строке на километр с временем, темпом и
 * средним пульсом. Самый быстрый километр подсвечен. Общая для итогов и деталей, как и
 * карточка зон, чтобы оба экрана считали одинаково.
 *
 * Меньше одного полного километра карточка не показывается: один неполный отрезок
 * ничего не добавляет к общему темпу.
 */
export function SplitsCard({ session }: Props) {
  const splits = useMemo(
    () =>
      computeSplits({
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        route: session.route ?? [],
        hrSamples: session.hrSamples,
        pauses: session.pauses,
      }),
    [session],
  );

  const full = splits.filter((s) => s.distanceMeters === 1000);
  if (full.length === 0) return null;
  const fastest = Math.min(...full.map((s) => s.paceSecPerKm));

  return (
    <SectionCard label="СПЛИТЫ">
      <View style={styles.row}>
        <Text style={[styles.head, styles.km]}>КМ</Text>
        <Text style={[styles.head, styles.cell]}>ВРЕМЯ</Text>
        <Text style={[styles.head, styles.cell]}>ТЕМП</Text>
        <Text style={[styles.head, styles.cell]}>ПУЛЬС</Text>
      </View>
      {splits.map((s) => {
        const isFastest = s.distanceMeters === 1000 && s.paceSecPerKm === fastest && full.length > 1;
        const km = s.distanceMeters === 1000 ? String(s.index) : (s.distanceMeters / 1000).toFixed(2);
        return (
          <View key={s.index} style={styles.row}>
            <Text style={[styles.value, styles.km]}>{km}</Text>
            <Text style={[styles.value, styles.cell]}>{formatDuration(s.durationSec)}</Text>
            <Text style={[styles.value, styles.cell, isFastest && styles.fastest]}>{formatPace(s.paceSecPerKm)}</Text>
            <Text style={[styles.value, styles.cell]}>{s.avgBpm ?? '—'}</Text>
          </View>
        );
      })}
      {session.pauses?.length ? (
        <Text style={styles.note}>Время сплитов без ручных пауз.</Text>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  km: {
    width: 48,
  },
  cell: {
    flex: 1,
    textAlign: 'right',
  },
  head: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  value: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 14,
    fontWeight: '600',
  },
  fastest: {
    color: colors.green,
  },
  note: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: spacing.xs,
  },
});
