import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing, typography } from '../theme';
import { GradientButton } from './GradientButton';

// The mockups draw no "finish" control anywhere on the active workout — holding
// the button only pauses. So the pause is where the decision is made: continue
// or finish. That also means a workout can never be ended by one stray tap.
interface Props {
  elapsed: string;
  onResume: () => void;
  onFinish: () => void;
  finishing?: boolean;
}

export function PauseOverlay({ elapsed, onResume, onFinish, finishing }: Props) {
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="pause" size={30} color={colors.textPrimary} />
        </View>
        <Text style={styles.title}>Пауза</Text>
        <Text style={styles.elapsed}>{elapsed}</Text>
        <Text style={styles.hint}>Пульс и маршрут сейчас не записываются.</Text>

        <View style={styles.actions}>
          <GradientButton label="Продолжить" onPress={onResume} />
          <GradientButton label="Завершить тренировку" onPress={onFinish} variant="outline" loading={finishing} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 10, 11, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  elapsed: {
    color: colors.textPrimary,
    fontFamily: fonts.extrabold,
    fontSize: 40,
    fontWeight: '800',
  },
  hint: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
  },
});
