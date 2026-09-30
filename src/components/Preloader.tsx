import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors, fonts } from '../theme';

// Start screen from the design: a slowly spinning orange→red progress ring
// around a chart glyph, faint halo circles, brand at the bottom. Drawn with
// react-native-svg so it doesn't depend on icon fonts that aren't loaded yet.

// Первый кадр продублирован в assets/src/splash-ring.svg, это нативный сплэш.
// Поменял размеры или цвета здесь, поправь SVG и прогони assets/src/rasterize.js,
// иначе при запуске кольцо сплэша и кольцо прелоадера разъедутся.
const SIZE = 220;
const C = SIZE / 2;
const RING_R = 66;
const RING_W = 9;
const CIRC = 2 * Math.PI * RING_R;
const ARC_SHARE = 0.72;

interface Props {
  // Manrope may not be loaded yet while this is on screen.
  fontsReady: boolean;
}

export function Preloader({ fontsReady }: Props) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true }),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    spinLoop.start();
    pulseLoop.start();
    return () => {
      spinLoop.stop();
      pulseLoop.stop();
    };
  }, [spin, pulse]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] });

  return (
    <View style={styles.screen}>
      <View style={styles.center}>
        <View style={{ width: SIZE, height: SIZE }}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: haloOpacity }]}>
            <Svg width={SIZE} height={SIZE}>
              <Circle cx={C} cy={C} r={106} stroke={colors.accentEnd} strokeOpacity={0.14} strokeWidth={1} fill="none" />
              <Circle cx={C} cy={C} r={90} stroke={colors.accentStart} strokeOpacity={0.12} strokeWidth={1} fill="none" />
            </Svg>
          </Animated.View>

          <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
            <Circle cx={C} cy={C} r={RING_R} stroke={colors.surfaceAlt} strokeWidth={RING_W} fill="none" />
            <Circle cx={C} cy={C} r={RING_R - RING_W - 8} fill={colors.surface} />
            <Path
              d={`M ${C - 13} ${C - 12} V ${C + 12} H ${C + 15}`}
              stroke={colors.accentEnd}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <Path
              d={`M ${C - 8} ${C + 5} L ${C - 2} ${C - 2} L ${C + 4} ${C + 3} L ${C + 12} ${C - 7}`}
              stroke={colors.accentStart}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>

          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
            <Svg width={SIZE} height={SIZE}>
              <Defs>
                <LinearGradient id="preloaderArc" x1="0" y1="1" x2="1" y2="0">
                  <Stop offset="0" stopColor={colors.accentStart} />
                  <Stop offset="1" stopColor={colors.accentEnd} />
                </LinearGradient>
              </Defs>
              <Circle
                cx={C}
                cy={C}
                r={RING_R}
                stroke="url(#preloaderArc)"
                strokeWidth={RING_W}
                strokeLinecap="round"
                strokeDasharray={`${CIRC * ARC_SHARE} ${CIRC}`}
                fill="none"
              />
            </Svg>
          </Animated.View>
        </View>
      </View>

      <View style={styles.brand}>
        <View style={styles.brandRow}>
          <View style={styles.dot} />
          <Text style={[styles.brandName, fontsReady && { fontFamily: fonts.extrabold }]}>LIVEBEAT</Text>
        </View>
        <Text style={[styles.tagline, fontsReady && { fontFamily: fonts.bold }]}>ATHLETIC ENGINE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Кольцо центрируется по всему экрану, а не по месту над подписью: так Android
  // ставит иконку нативного сплэша, и смена сплэша на прелоадер проходит без скачка.
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 56,
    alignItems: 'center',
    gap: 6,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  brandName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tagline: {
    color: colors.accentEnd,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});
