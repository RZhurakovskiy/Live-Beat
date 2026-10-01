import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme';
import { WorkoutMode } from '../types';
import { ACTIVITIES } from '../workout/activities';

interface Props {
  selected: WorkoutMode;
  onSelect: (mode: WorkoutMode) => void;
}

/**
 * Сетка видов тренировок на экране режима: по плитке на вид, выбранный обведён. На два
 * вида хватало двух крупных карточек, на семь они не помещались бы, поэтому выбор здесь
 * компактный, а подробности выбранного вида показывает `ModeCard` под сеткой.
 */
export function ActivityGrid({ selected, onSelect }: Props) {
  return (
    <View style={styles.grid}>
      {ACTIVITIES.map((activity) => {
        const active = activity.mode === selected;
        return (
          <TouchableOpacity
            key={activity.mode}
            style={[styles.tile, active && styles.tileActive]}
            activeOpacity={0.85}
            onPress={() => onSelect(activity.mode)}
            accessibilityState={{ selected: active }}
          >
            <Ionicons
              name={activity.icon as keyof typeof Ionicons.glyphMap}
              size={20}
              color={active ? colors.danger : colors.textSecondary}
            />
            {/* Подпись плитки не растёт вместе с системным шрифтом: плитка узкая, и
                подпись «Кроссфит» обрезалась бы многоточием. Если и так не влезла, ужмётся. */}
            <Text
              style={[styles.label, active && styles.labelActive]}
              numberOfLines={1}
              allowFontScaling={false}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {activity.tileTitle}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    // Четыре плитки в ряд с зазорами: 7 видов ложатся в два ряда. Без flexGrow, иначе
    // три плитки второго ряда растянулись бы шире первых четырёх.
    width: '23%',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.button,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tileActive: {
    borderColor: colors.danger,
  },
  label: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 12,
    fontWeight: '600',
  },
  labelActive: {
    color: colors.textPrimary,
  },
});
