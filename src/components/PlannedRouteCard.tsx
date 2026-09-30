import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePlannedRouteStore } from '../store/plannedRouteStore';
import { colors, fonts, spacing } from '../theme';
import { formatDistanceKm } from '../utils/format';
import { plannedDistanceMeters } from '../utils/plannedRoute';
import { SectionCard } from './SectionCard';

/**
 * Карточка «Маршрут» на экране режима для видов с GPS: загрузить GPX-файл (например, из
 * Strava или навигатора) и бежать по нему. На карте тренировки он лежит пунктиром.
 */
export function PlannedRouteCard() {
  const route = usePlannedRouteStore((s) => s.route);
  const loaded = usePlannedRouteStore((s) => s.loaded);
  const load = usePlannedRouteStore((s) => s.load);
  const pickFromFile = usePlannedRouteStore((s) => s.pickFromFile);
  const clear = usePlannedRouteStore((s) => s.clear);
  // useState: пока выбирают и разбирают файл, вместо шеврона крутится индикатор.
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const handlePick = async () => {
    setBusy(true);
    try {
      const result = await pickFromFile();
      if (!result.ok && !result.canceled) Alert.alert('Не удалось загрузить маршрут', result.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard label="МАРШРУТ">
      {route ? (
        <View style={styles.row}>
          <Ionicons name="map-outline" size={20} color={colors.blue} />
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {route.name}
            </Text>
            <Text style={styles.description}>{formatDistanceKm(plannedDistanceMeters(route))} км · пунктир на карте</Text>
          </View>
          <TouchableOpacity onPress={() => clear()} hitSlop={12}>
            <Text style={styles.action}>Убрать</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={handlePick} disabled={busy}>
          <Ionicons name="map-outline" size={20} color={colors.textSecondary} />
          <View style={styles.text}>
            <Text style={styles.title}>Загрузить маршрут GPX</Text>
            <Text style={styles.description}>Необязательно. Линия маршрута будет видна на карте тренировки.</Text>
          </View>
          {busy ? (
            <ActivityIndicator color={colors.accentStart} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          )}
        </TouchableOpacity>
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  text: {
    flex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 15,
    fontWeight: '600',
  },
  description: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  action: {
    color: colors.accentStart,
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700',
  },
});
