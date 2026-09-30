import { StyleSheet, View } from 'react-native';
import { ZONES } from '../utils/heartRateZones';
import { radii, spacing } from '../theme';

interface Props {
  activeIndex: number | null;
}

/** Полоса из пяти зон на активной тренировке, текущая зона подсвечена. */
export function ZoneLegend({ activeIndex }: Props) {
  return (
    <View style={styles.row}>
      {ZONES.map((zone) => {
        const isActive = zone.index === activeIndex;
        return (
          <View
            key={zone.index}
            style={[
              styles.segment,
              { backgroundColor: isActive ? zone.color : `${zone.color}33` },
              isActive && styles.segmentActive,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    height: 8,
    borderRadius: radii.sm,
  },
  segmentActive: {
    height: 14,
  },
});
