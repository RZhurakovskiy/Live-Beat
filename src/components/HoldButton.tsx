import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme';

const SIZE = 84;
export const HOLD_MS = 800;

interface Props {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onHold: () => void;
}

// Round button that fires only after being held. The filling ring is the timer
// itself, so what you see is exactly how long is left — a plain onLongPress
// would give no feedback at all on a screen you glance at while moving.
export function HoldButton({ label, icon, onHold }: Props) {
  const fill = useRef(new Animated.Value(0)).current;
  const completed = useRef(false);

  const start = () => {
    completed.current = false;
    fill.setValue(0);
    Animated.timing(fill, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || completed.current) return;
      completed.current = true;
      Vibration.vibrate(30);
      onHold();
    });
  };

  const cancel = () => {
    if (completed.current) return;
    fill.stopAnimation(() => {
      Animated.timing(fill, {
        toValue: 0,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPressIn={start} onPressOut={cancel} style={styles.button}>
        <Animated.View
          style={[
            styles.fill,
            {
              opacity: fill.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
              transform: [{ scale: fill }],
            },
          ]}
        />
        <Ionicons name={icon} size={30} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.md,
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: 'rgba(255, 59, 92, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: radii.pill,
    backgroundColor: colors.danger,
  },
});
