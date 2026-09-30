import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '../theme';
import { formatDuration } from '../utils/format';

interface Props {
  index: number;
  label: string;
  color: string;
  seconds: number;
  percent: number;
}

/**
 * Строка разбивки времени по одной зоне пульса. Используется в итогах тренировки и в
 * статистике, чтобы оба экрана выглядели и ломались одинаково.
 *
 * Название занимает всю ширину, а время с процентом стоит справа от полосы, а не в строке с
 * названием. Так решил владелец после полевого теста: «Зона 4 · Силовая выносливость» не
 * помещалась в одну строку со временем и выдавливала его за край экрана. Строк при этом
 * по-прежнему две, так что карточка не стала выше.
 */
export function ZoneTimeRow({ index, label, color, seconds, percent }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.name}>
        Зона {index} · {label}
      </Text>
      <View style={styles.barLine}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${percent}%`, backgroundColor: color }]} />
        </View>
        <Text style={styles.value}>
          {formatDuration(seconds)} ({percent}%)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.xs + 2,
  },
  name: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 13,
    fontWeight: '600',
  },
  barLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  track: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: {
    height: 5,
    borderRadius: 3,
  },
  // Одинаковая минимальная ширина у всех строк держит полосы одной длины: иначе у строки
  // «00:00 (0%)» полоса была бы длиннее, чем у «14:30 (38%)», и сравнивать их на глаз
  // стало бы нельзя. Если значение не влезает (час с лишним, крупный шрифт в системе),
  // оно раздвигает место, а не обрезается.
  value: {
    minWidth: 92,
    flexShrink: 0,
    textAlign: 'right',
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
});
