import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, radii } from '../theme';

const SIZE = 180;
const RINGS = 3;
const CYCLE_MS = 2400;

/**
 * Радар на время поиска датчика: кольца расходятся из центра и гаснут. Заменил
 * системную крутилку, которая стояла на экране раньше.
 */
export function ScanPulse() {
  // useRef, а не useState: по Animated.Value на кольцо, одни и те же на всех рендерах,
  // иначе анимация перезапускалась бы с каждой перерисовкой. Перерисовка не нужна,
  // кольца двигает нативный драйвер.
  const progress = useRef(Array.from({ length: RINGS }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = progress.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          // Кольца стартуют со сдвигом, чтобы выходили из центра друг за другом.
          Animated.delay((CYCLE_MS / RINGS) * index),
          Animated.timing(value, {
            toValue: 1,
            duration: CYCLE_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [progress]);

  return (
    <View style={styles.wrap}>
      {progress.map((value, index) => (
        <Animated.View
          key={index}
          style={[
            styles.ring,
            {
              opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
              transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
            },
          ]}
        />
      ))}
      <View style={styles.core}>
        <Ionicons name="bluetooth" size={30} color={colors.green} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.green,
  },
  core: {
    width: 76,
    height: 76,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
