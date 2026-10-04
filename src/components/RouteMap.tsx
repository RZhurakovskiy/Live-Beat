import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState } from 'react';
import { type NativeSyntheticEvent, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RoutePoint } from '../types';
import { routeBounds, FOLLOW_ZOOM, stepZoom } from '../utils/mapView';
import { PlannedPoint } from '../utils/plannedRoute';
import { colors, fonts, radii, spacing } from '../theme';

// Бесплатные векторные тайлы OpenFreeMap по данным OSM: без ключей и без Google, чьи
// сервисы в России работают ненадёжно (tech-stack.md).
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** Отступ от краёв, с которым маршрут вписывается в окно карты. */
const FIT_PADDING = { top: 36, right: 52, bottom: 36, left: 36 };

interface Props {
  route: RoutePoint[];
  title?: string;
  height?: number;
  /** Загруженный маршрут, по которому бегут: пунктир под записываемым треком. */
  planned?: PlannedPoint[];
  /**
   * Идёт тренировка: карта следит за последней точкой, пока человек сам её не сдвинул.
   * Без этого (итоги, детали) камера сразу вписывает весь маршрут в окно.
   */
  live?: boolean;
}

interface SurfaceProps extends Omit<Props, 'title' | 'height'> {
  /** Карта на весь экран: кнопки крупнее, сверху «закрыть», с учётом вырезов экрана. */
  fullscreen?: boolean;
  onExpand?: () => void;
  onClose?: () => void;
}

/** Круглая кнопка поверх карты. Крупнее 32 в маленьком окне не влезает, на весь экран 44. */
function ControlButton({
  icon,
  label,
  onPress,
  active = false,
  size = 32,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  size?: number;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.7}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={[styles.control, { width: size, height: size, borderRadius: size / 2 }, active && styles.controlActive]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.55)} color={active ? colors.accentStart : colors.textPrimary} />
    </TouchableOpacity>
  );
}

/**
 * Сама карта с линией, маркерами и кнопками. Вынесена из `RouteMap`, потому что та же карта
 * показывается и в карточке, и в окне на весь экран; у каждой своя камера и своё состояние слежения.
 */
function MapSurface({ route, planned, live = false, fullscreen = false, onExpand, onClose }: SurfaceProps) {
  const insets = useSafeAreaInsets();
  // useRef, а не useState: это императивная ручка к камере карты, а не данные для
  // отрисовки. Через неё камеру двигают, перерисовывать по ней нечего.
  const cameraRef = useRef<CameraRef>(null);
  // useRef, а не useState: последний зум, о котором сообщила карта. Нужен только кнопкам «+» и «−»,
  // на экране его нет, а перерисовка на каждый кадр щипка тормозила бы карту.
  const zoomRef = useRef<number | null>(null);
  // useState: от него зависит вид кнопки «ко мне» и работа эффекта слежения. Начинается включённым
  // на живой карте; любой жест пользователя выключает, кнопка «ко мне» включает снова.
  const [following, setFollowing] = useState(live);

  const hasPlanned = (planned?.length ?? 0) >= 2;
  const last = route[route.length - 1];

  // Живая карта следит за последней точкой, только пока слежение включено: раньше камера
  // возвращалась на каждой новой точке и отбрасывала карту, которую человек пытался сдвинуть.
  useEffect(() => {
    if (!live || !following || !last) return;
    cameraRef.current?.jumpTo({ center: [last.lng, last.lat] });
  }, [live, following, last?.lat, last?.lng]);

  const coordinates: [number, number][] = route.map((point) => [point.lng, point.lat]);
  const first = coordinates[0];
  const lastCoord = coordinates[coordinates.length - 1];
  const plannedCoords: [number, number][] = hasPlanned ? planned!.map((p) => [p.lng, p.lat]) : [];
  const center = lastCoord ?? plannedCoords[0];
  const bounds = routeBounds(route, hasPlanned ? planned : undefined);

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

  const handleRegionChange = (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    zoomRef.current = event.nativeEvent.zoom;
    // Двигают камеру и кнопки «+» и «−», и слежение, но у них userInteraction ложный: выключаем
    // слежение только от пальца.
    if (event.nativeEvent.userInteraction) setFollowing(false);
  };

  const zoomBy = (delta: number) => {
    cameraRef.current?.zoomTo(stepZoom(zoomRef.current, delta), { duration: 250 });
  };

  const recenter = () => {
    if (live && last) {
      setFollowing(true);
      cameraRef.current?.easeTo({
        center: [last.lng, last.lat],
        zoom: Math.max(zoomRef.current ?? FOLLOW_ZOOM, 15),
        duration: 300,
      });
    } else if (bounds) {
      cameraRef.current?.fitBounds(bounds, { padding: FIT_PADDING, duration: 400 });
    }
  };

  const buttonSize = fullscreen ? 44 : 32;
  // На весь экран кнопки отступают от выреза сверху, в карточке карта и так внутри.
  const edgeTop = fullscreen ? insets.top + spacing.md : spacing.sm;

  return (
    <View style={styles.surface}>
      <Map
        mapStyle={MAP_STYLE_URL}
        style={{ flex: 1 }}
        // Поворот и наклон на маленькой карте только мешают: палец, который хотел сдвинуть, крутит её.
        touchRotate={false}
        touchPitch={false}
        onRegionDidChange={handleRegionChange}
      >
        <Camera
          ref={cameraRef}
          initialViewState={
            live || !bounds
              ? { center, zoom: FOLLOW_ZOOM }
              : { bounds, padding: FIT_PADDING }
          }
        />

        {/* Маршрут объявлен раньше трека, чтобы трек рисовался поверх него. */}
        {hasPlanned && (
          <GeoJSONSource
            id="planned-source"
            data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: plannedCoords } }}
          >
            <Layer
              id="planned-line"
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{ 'line-color': colors.blue, 'line-width': 4, 'line-opacity': 0.7, 'line-dasharray': [1.5, 1.5] }}
            />
          </GeoJSONSource>
        )}

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

        {first && (
          <Marker id="start" lngLat={first}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
          </Marker>
        )}
        {/* Пока точка одна, старт и текущее положение совпадают: второй маркер лёг бы
            ровно поверх первого. */}
        {hasLine && (
          <Marker id="current" lngLat={lastCoord}>
            <View style={[styles.dot, { backgroundColor: colors.accentEnd }]} />
          </Marker>
        )}
      </Map>

      {/* Кнопки лежат поверх карты и перехватывают нажатия сами; остальная карта работает пальцами. */}
      <View style={[styles.controlsRight, { top: edgeTop }]} pointerEvents="box-none">
        <ControlButton icon="add" label="Приблизить карту" onPress={() => zoomBy(1)} size={buttonSize} />
        <ControlButton icon="remove" label="Отдалить карту" onPress={() => zoomBy(-1)} size={buttonSize} />
        <ControlButton
          icon={live ? 'locate' : 'scan-outline'}
          label={live ? 'Показать моё положение' : 'Показать весь маршрут'}
          onPress={recenter}
          active={live && following}
          size={buttonSize}
        />
      </View>

      <View style={[styles.controlsLeft, { top: edgeTop }]} pointerEvents="box-none">
        {fullscreen ? (
          <ControlButton icon="close" label="Закрыть карту" onPress={() => onClose?.()} size={buttonSize} />
        ) : (
          <ControlButton icon="expand" label="Карта на весь экран" onPress={() => onExpand?.()} size={buttonSize} />
        )}
      </View>
    </View>
  );
}

/**
 * Карта маршрута на MapLibre: линия пути, маркер старта и маркер текущего положения. Используется
 * на активной тренировке и в итогах. Кнопки «+», «−» и «ко мне» заменяют щипок, который в
 * маленьком окне внутри прокручиваемого экрана срабатывает плохо, а кнопка в углу открывает ту же
 * карту на весь экран.
 */
export function RouteMap({ route, title = 'Маршрут', height = 180, planned, live = false }: Props) {
  // useState: окно на весь экран открывается и закрывается кнопкой, от этого зависит отрисовка.
  const [expanded, setExpanded] = useState(false);

  const hasPlanned = (planned?.length ?? 0) >= 2;

  // Без точек трека карта показывается, только если есть маршрут: его видно ещё до того,
  // как нашлись спутники, и можно добежать до старта.
  if (route.length === 0 && !hasPlanned) {
    return (
      <View style={[styles.card, { height: height + 44 }]}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Ожидание GPS-сигнала…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={{ height, borderRadius: radii.sm, overflow: 'hidden' }}>
        <MapSurface route={route} planned={planned} live={live} onExpand={() => setExpanded(true)} />
      </View>

      <Modal visible={expanded} animationType="fade" statusBarTranslucent onRequestClose={() => setExpanded(false)}>
        <View style={styles.fullscreen}>
          <MapSurface route={route} planned={planned} live={live} fullscreen onClose={() => setExpanded(false)} />
        </View>
      </Modal>
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
  surface: {
    flex: 1,
  },
  fullscreen: {
    flex: 1,
    backgroundColor: colors.background,
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
  controlsRight: {
    position: 'absolute',
    right: spacing.sm,
    gap: 6,
  },
  controlsLeft: {
    position: 'absolute',
    left: spacing.sm,
    gap: 6,
  },
  control: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,21,23,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  controlActive: {
    borderColor: colors.accentStart,
  },
});
