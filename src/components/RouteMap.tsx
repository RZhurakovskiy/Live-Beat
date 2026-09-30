import { Camera, type CameraRef, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RoutePoint } from '../types';
import { colors, fonts, radii, spacing } from '../theme';

// Бесплатные векторные тайлы OpenFreeMap по данным OSM: без ключей и без Google, чьи
// сервисы в России работают ненадёжно (tech-stack.md).
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

interface Props {
  route: RoutePoint[];
  title?: string;
  height?: number;
}

/**
 * Карта маршрута на MapLibre: линия пути, маркер старта и маркер текущего
 * положения. Камера следует за последней точкой. Используется на активной
 * тренировке и в итогах.
 */
export function RouteMap({ route, title = 'Маршрут', height = 180 }: Props) {
  // useRef, а не useState: это императивная ручка к камере карты, а не данные для
  // отрисовки. Через неё камеру двигают, перерисовывать по ней нечего.
  const cameraRef = useRef<CameraRef>(null);

  const last = route[route.length - 1];

  // Камера перескакивает к последней точке, только когда сменились её координаты:
  // зависимости это широта и долгота, а не весь маршрут.
  useEffect(() => {
    if (last) {
      cameraRef.current?.jumpTo({ center: [last.lng, last.lat] });
    }
  }, [last?.lat, last?.lng]);

  if (route.length === 0) {
    return (
      <View style={[styles.card, { height: height + 44 }]}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Ожидание GPS-сигнала…</Text>
        </View>
      </View>
    );
  }

  const coordinates: [number, number][] = route.map((point) => [point.lng, point.lat]);
  const first = coordinates[0];
  const lastCoord = coordinates[coordinates.length - 1];

  // Линия по спецификации GeoJSON это минимум две точки. Раньше источник создавался на
  // первой же точке маршрута с «линией» из одной координаты, и на активной тренировке
  // линия не появлялась вообще, хотя маркеры двигались. MapLibre обрабатывает данные
  // источника асинхронной очередью, и неудачная первая конвертация, судя по всему, так и
  // не отпускала её: следующие точки уже не применялись. На итогах этого не было, потому
  // что там карта никогда не монтируется меньше чем с двумя точками. Поэтому источник
  // создаётся только когда линия уже настоящая, а до этого на карте один маркер старта.
  const hasLine = coordinates.length >= 2;

  const lineGeoJson: GeoJSON.Feature = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={{ height, borderRadius: radii.sm, overflow: 'hidden' }}>
        <Map mapStyle={MAP_STYLE_URL} style={{ flex: 1 }}>
          <Camera ref={cameraRef} initialViewState={{ center: lastCoord, zoom: 15 }} />

          {hasLine && (
            <GeoJSONSource id="route-source" data={lineGeoJson}>
              <Layer
                id="route-line"
                type="line"
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                paint={{ 'line-color': colors.accentStart, 'line-width': 4 }}
              />
            </GeoJSONSource>
          )}

          <Marker id="start" lngLat={first}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
          </Marker>
          {/* Пока точка одна, старт и текущее положение совпадают: второй маркер лёг бы
              ровно поверх первого. */}
          {hasLine && (
            <Marker id="current" lngLat={lastCoord}>
              <View style={[styles.dot, { backgroundColor: colors.accentEnd }]} />
            </Marker>
          )}
        </Map>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  title: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
  },
});
