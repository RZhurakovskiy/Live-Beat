import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ZONES } from '../utils/heartRateZones';
import { colors, fonts, radii, spacing } from '../theme';

export interface TargetZoneRange {
  min: number;
  max: number;
}

interface Props {
  value: TargetZoneRange | null;
  onChange: (value: TargetZoneRange | null) => void;
}

export function TargetZonePicker({ value, onChange }: Props) {
  const toggle = (index: number) => {
    if (!value) {
      onChange({ min: index, max: index });
      return;
    }
    if (index >= value.min && index <= value.max) {
      onChange(null);
      return;
    }
    onChange({ min: Math.min(value.min, index), max: Math.max(value.max, index) });
  };

  const activeZone = value ? ZONES.find((z) => z.index === value.max) : null;

  return (
    <View>
      <View style={styles.row}>
        {ZONES.map((zone) => {
          const isActive = !!value && zone.index >= value.min && zone.index <= value.max;
          return (
            <TouchableOpacity
              key={zone.index}
              style={[styles.chip, { backgroundColor: isActive ? zone.color : `${zone.color}26` }]}
              onPress={() => toggle(zone.index)}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{zone.index}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.hint}>
        {value
          ? `Сигнал, если пульс выйдет за пределы зон ${value.min}–${value.max}${
              value.min === value.max ? ` (${activeZone?.label})` : ''
            }`
          : 'Не задано - сигналов не будет'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    height: 40,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 14,
  },
  chipTextActive: {
    color: '#0B0B10',
  },
  hint: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 11,
    marginTop: spacing.sm,
    lineHeight: 15,
  },
});
