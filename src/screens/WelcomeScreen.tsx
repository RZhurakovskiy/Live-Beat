import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomCta } from '../components/BottomCta';
import { ScreenHeader } from '../components/ScreenHeader';
import { setFlag } from '../db/database';
import { ONBOARDING_DONE_FLAG } from '../onboarding';
import { RootStackScreenProps } from '../navigation/types';
import { colors, fonts, gradients, radii, spacing, typography } from '../theme';

type Props = RootStackScreenProps<'Welcome'>;

/** Интро на свежей установке. «Начать» ведёт на чек-лист настройки. */
export function WelcomeScreen({ navigation }: Props) {
  const handleStart = () => {
    // Запоминаем сразу: флаг значит «интро видели», а не «настройку закончили»,
    // законченность чек-лист отслеживает сам.
    setFlag(ONBOARDING_DONE_FLAG, 'true').catch(() => {});
    navigation.replace('Setup');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader dotColor={colors.green} />

      {/* В макете в этой карточке фото бегуна. Пока его нет, здесь градиент и знак
          бренда той же формы и того же веса на экране, так что потом <Image>
          встанет на место, ничего не сдвинув вокруг. */}
      <View style={styles.hero}>
        <LinearGradient
          colors={gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroFill}
        >
          <Ionicons name="pulse" size={72} color="rgba(255,255,255,0.92)" />
        </LinearGradient>
      </View>

      <View style={styles.copy}>
        <Text style={styles.brand}>LIVEBEAT</Text>
        <Text style={styles.slogan}>Тренируйся с пульсом в реальном времени</Text>
        <Text style={styles.description}>
          Подключи пульсометр и получай точные зоны, калории и аналитику прямо во время тренировки.
        </Text>
      </View>

      <BottomCta label="Начать" onPress={handleStart} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  hero: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    aspectRatio: 1,
    marginTop: spacing.sm,
  },
  heroFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: spacing.sm,
  },
  brand: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 32,
    letterSpacing: 0.5,
  },
  slogan: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
});
