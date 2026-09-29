import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientButton } from '../components/GradientButton';
import { StatTile } from '../components/StatTile';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radii, spacing } from '../theme';
import { formatDistanceKm, formatDuration, formatPace, formatSessionDateTime } from '../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutSummary'>;

export function WorkoutSummaryScreen({ route, navigation }: Props) {
  const { session } = route.params;
  const isOutdoor = session.mode === 'outdoor';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.iconCircle}>
        <Ionicons name="checkmark" size={32} color="#fff" />
      </View>
      <Text style={styles.title}>Тренировка завершена</Text>
      <Text style={styles.subtitle}>
        {formatSessionDateTime(session.startedAt)} · {isOutdoor ? 'Улица' : 'Беговая дорожка'}
      </Text>

      <View style={styles.grid}>
        <View style={styles.row}>
          <StatTile icon="time-outline" value={formatDuration(session.durationSec)} label="время" />
          <StatTile
            icon="flame-outline"
            value={session.caloriesKcal !== undefined ? String(session.caloriesKcal) : '—'}
            label="ккал"
          />
        </View>
        {isOutdoor && (
          <View style={styles.row}>
            <StatTile icon="navigate-outline" value={formatDistanceKm(session.distanceMeters)} label="км" />
            <StatTile icon="speedometer-outline" value={formatPace(session.avgPaceSecPerKm)} label="темп /км" />
          </View>
        )}
        <View style={styles.row}>
          <StatTile icon="heart-outline" value={String(session.avgHr)} label="средний" />
          <StatTile icon="trending-up-outline" value={String(session.maxHr)} label="макс" />
          <StatTile icon="trending-down-outline" value={String(session.minHr)} label="мин" />
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <GradientButton
        label="Готово"
        onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.accentStart,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  grid: {
    width: '100%',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
