import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalmDownCard } from '../components/CalmDownCard';
import { HeartRateChart } from '../components/HeartRateChart';
import { RecoveryCard } from '../components/RecoveryCard';
import { RouteMap } from '../components/RouteMap';
import { ScreenTitle } from '../components/ScreenTitle';
import { SessionZonesCard } from '../components/SessionZonesCard';
import { SplitsCard } from '../components/SplitsCard';
import { StatTile } from '../components/StatTile';
import { deleteSession, getSessionById } from '../db/database';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, spacing } from '../theme';
import { WorkoutSession } from '../types';
import { formatDistanceKm, formatDuration, formatPace, formatSessionDateTime, formatSpeed } from '../utils/format';
import { buildGpx, gpxFileName } from '../utils/gpx';
import { describeConfig, workBands } from '../utils/intervals';
import { refreshWeekWidget } from '../widget/widgetTaskHandler';
import { activityOf } from '../workout/activities';

type Props = NativeStackScreenProps<RootStackParamList, 'SessionDetails'>;

/**
 * Сохранённая тренировка: показатели, график пульса, зоны, карта маршрута. Для уличной
 * есть экспорт в GPX, для любой удаление с подтверждением.
 */
export function SessionDetailsScreen({ route, navigation }: Props) {
  // useState: загруженная тренировка рисуется на экране; пока её нет, крутилка.
  const [session, setSession] = useState<WorkoutSession | null>(null);

  useFocusEffect(
    useCallback(() => {
      getSessionById(route.params.sessionId).then(setSession);
    }, [route.params.sessionId]),
  );

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accentStart} />
        </View>
      </SafeAreaView>
    );
  }

  const activity = activityOf(session.mode);
  const hasGps = activity.hasGps;
  const hasRoute = hasGps && (session.route?.length ?? 0) > 0;

  const handleShareGpx = async () => {
    if (!(await Sharing.isAvailableAsync())) return;
    const file = new File(Paths.cache, gpxFileName(session));
    file.create({ overwrite: true });
    file.write(buildGpx(session));
    await Sharing.shareAsync(file.uri, { mimeType: 'application/gpx+xml', dialogTitle: 'Поделиться маршрутом' });
  };

  // Тот же диалог, что у «Отбросить» на итогах: подтверждения достаточно, чтобы не удалить
  // случайным тапом. После удаления возвращаемся в историю, она сама перечитает список
  // при фокусе.
  const handleDelete = () => {
    Alert.alert(
      'Удалить тренировку?',
      'Она пропадёт из истории, статистики и рекордов. Отменить это действие нельзя.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            await deleteSession(session.id);
            refreshWeekWidget();
            navigation.goBack();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Экран открывается из истории, а не вкладкой, поэтому кнопка «назад» здесь нужна:
          на вкладках её роль играет таб-бар, а отсюда без неё не уйти. */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {hasRoute && (
            <TouchableOpacity onPress={handleShareGpx} accessibilityLabel="Поделиться маршрутом">
              <Ionicons name="share-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleDelete} accessibilityLabel="Удалить тренировку">
            <Ionicons name="trash-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTitle
          title={activity.sessionTitle}
          subtitle={formatSessionDateTime(session.startedAt)}
        />

        <View style={styles.row}>
          <StatTile icon="time-outline" value={formatDuration(session.durationSec)} label="время" />
          <StatTile
            icon="flame-outline"
            value={session.caloriesKcal !== undefined ? String(session.caloriesKcal) : '—'}
            label="ккал"
          />
        </View>

        {hasGps && (
          <View style={styles.row}>
            <StatTile icon="navigate-outline" value={formatDistanceKm(session.distanceMeters)} label="км" />
            {activity.speed === 'speed' ? (
              <StatTile icon="speedometer-outline" value={formatSpeed(session.avgPaceSecPerKm)} label="ср. км/ч" />
            ) : (
              <StatTile icon="speedometer-outline" value={formatPace(session.avgPaceSecPerKm)} label="темп /км" />
            )}
          </View>
        )}

        <View style={styles.row}>
          <StatTile icon="heart-outline" value={String(session.avgHr)} label="средний" />
          <StatTile icon="trending-up-outline" value={String(session.maxHr)} label="макс" />
          <StatTile icon="trending-down-outline" value={String(session.minHr)} label="мин" />
        </View>

        <HeartRateChart
          samples={session.hrSamples}
          title={session.interval ? `Пульс · работа подсвечена (${describeConfig(session.interval)})` : 'Сохранённый пульс'}
          bands={
            session.interval
              ? workBands(session.interval, session.startedAt, session.pauses ?? [], session.endedAt)
              : undefined
          }
        />

        {/* Те же зоны, что на итогах: итоги показываются один раз до «Сохранить», и без
            этой карточки после сохранения разбивку было не посмотреть. */}
        <SessionZonesCard samples={session.hrSamples} />

        {activity.caloriesNote && <Text style={styles.caloriesNote}>{activity.caloriesNote}</Text>}

        {activity.showsCalmDown && <CalmDownCard samples={session.hrSamples} />}

        {hasGps && <RouteMap route={session.route ?? []} title="Сохранённый маршрут" height={200} />}

        {hasGps && <SplitsCard session={session} />}

        {session.recovery && <RecoveryCard state={{ state: 'done', recovery: session.recovery }} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  caloriesNote: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
