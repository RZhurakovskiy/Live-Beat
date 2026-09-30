import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '../theme';
import { WorkoutSession } from '../types';
import { formatDuration, formatPace, formatSpeed } from '../utils/format';
import { computeSplits } from '../utils/splits';
import { activityOf } from '../workout/activities';
import { SectionCard } from './SectionCard';

interface Props {
  session: WorkoutSession;
}

/**
 * Карточка «Сплиты» тренировки с GPS: по строке на отрезок (километр на бегу, пять
 * километров со скоростью на велосипеде) с временем, темпом или скоростью и
 * средним пульсом. Самый быстрый отрезок подсвечен. Общая для итогов и деталей, как и
 * карточка зон, чтобы оба экрана считали одинаково.
 *
 * Меньше одного полного отрезка карточка не показывается: один неполный отрезок
 * ничего не добавляет к общему темпу.
 */
export function SplitsCard({ session }: Props) {
  const activity = activityOf(session.mode);
  const step = activity.splitMeters;
  const showsSpeed = activity.speed === 'speed';
  const splits = useMemo(
    () =>
      computeSplits({
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        route: session.route ?? [],
        hrSamples: session.hrSamples,
        pauses: session.pauses,
        splitMeters: step,
      }),
    [session, step],
  );

  const full = splits.filter((s) => s.distanceMeters === step);
  if (full.length === 0) return null;
  const fastest = Math.min(...full.map((s) => s.paceSecPerKm));

  return (
    <SectionCard label="СПЛИТЫ">
      <View style={styles.row}>
        <Text style={[styles.head, styles.km]}>КМ</Text>
        <Text style={[styles.head, styles.cell]}>ВРЕМЯ</Text>
        <Text style={[styles.head, styles.cell]}>{showsSpeed ? 'КМ/Ч' : 'ТЕМП'}</Text>
        <Text style={[styles.head, styles.cell]}>ПУЛЬС</Text>
      </View>
      {splits.map((s) => {
        const isFull = s.distanceMeters === step;
        const isFastest = isFull && s.paceSecPerKm === fastest && full.length > 1;
        // Полный отрезок подписан километром, на котором кончился: «5», «10» у
        // велосипеда. Неполный последний подписан своей длиной.
        const km = isFull ? String((s.index * step) / 1000) : (s.distanceMeters / 1000).toFixed(2);
        return (
          <View key={s.index} style={styles.row}>
            <Text style={[styles.value, styles.km]}>{km}</Text>
            <Text style={[styles.value, styles.cell]}>{formatDuration(s.durationSec)}</Text>
            <Text style={[styles.value, styles.cell, isFastest && styles.fastest]}>
              {showsSpeed ? formatSpeed(s.paceSecPerKm) : formatPace(s.paceSecPerKm)}
            </Text>
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
