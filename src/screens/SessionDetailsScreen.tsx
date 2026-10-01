import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalmDownCard } from '../components/CalmDownCard';
import { HeartRateChart } from '../components/HeartRateChart';
import { RecoveryCard } from '../components/RecoveryCard';
import { RouteMap } from '../components/RouteMap';
import { ScreenTitle } from '../components/ScreenTitle';
import { SessionZonesCard } from '../components/SessionZonesCard';
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH, ShareCard } from '../components/ShareCard';
import { SplitsCard } from '../components/SplitsCard';
import { StatTile } from '../components/StatTile';
import { deleteSession, getSessionById } from '../db/database';
import { RootStackParamList } from '../navigation/types';
import { useProfileStore } from '../store/profileStore';
import { colors, fonts, spacing } from '../theme';
import { WorkoutSession } from '../types';
import { formatDistanceKm, formatDuration, formatPace, formatSessionDateTime, formatSpeed } from '../utils/format';
import { estimateMaxHr } from '../utils/heartRateZones';
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
  // useState: карточка для снимка существует на экране только пока её снимают, иначе она
  // зря рисовалась бы (маршрут в сотни точек) при каждом открытии деталей.
  const [cardVisible, setCardVisible] = useState(false);
  // useRef, а не useState: это ручка к виду, который снимает `captureRef`, а не данные для
  // отрисовки. Перерисовывать по ней нечего.
  const cardRef = useRef<View>(null);
  const profile = useProfileStore((s) => s.profile);

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

  /**
   * Снимает карточку тренировки в картинку и открывает «Поделиться». Карточку монтируем на
   * миг за пределами экрана, ждём, пока она разложится, снимаем и убираем.
   */
  const handleShareCard = async () => {
    if (cardVisible || !(await Sharing.isAvailableAsync())) return;
    setCardVisible(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile', width: 1080, height: 1440 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Поделиться тренировкой' });
    } catch {
      Alert.alert('Не удалось сделать картинку', 'Попробуйте ещё раз.');
    } finally {
      setCardVisible(false);
    }
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
          <TouchableOpacity onPress={handleShareCard} accessibilityLabel="Поделиться карточкой тренировки">
            <Ionicons name="image-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
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

      {/* Карточка для снимка: за левым краем экрана, чтобы её не видно, но она разложена и
          рисуется. collapsable={false} не даёт Android убрать вид, который снимают. */}
      {cardVisible && (
        <View
          ref={cardRef}
          collapsable={false}
          style={{ position: 'absolute', left: -(SHARE_CARD_WIDTH + 100), top: 0, width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT }}
        >
          <ShareCard session={session} maxHr={profile ? estimateMaxHr(profile.age, profile.gender) : null} />
        </View>
      )}
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
