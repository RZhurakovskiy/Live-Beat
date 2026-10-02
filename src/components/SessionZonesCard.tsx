import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useProfileStore } from '../store/profileStore';
import { colors, fonts } from '../theme';
import { HrSample } from '../types';
import { profileMaxHr } from '../utils/heartRateZones';
import { zoneBreakdown } from '../utils/zoneTime';
import { SectionCard } from './SectionCard';
import { ZoneTimeRow } from './ZoneTimeRow';

interface Props {
  samples: HrSample[];
}

/**
 * Карточка «Зоны пульса» одной тренировки. Общая для итогов сразу после финиша и для
 * деталей сохранённой тренировки из истории, чтобы оба экрана считали и показывали
 * одинаково.
 *
 * Максимальный пульс берётся из текущего профиля, а не из профиля на момент тренировки:
 * в сессии он не хранится. Если профиль поменять, зоны старых тренировок пересчитаются.
 */
export function SessionZonesCard({ samples }: Props) {
  const profile = useProfileStore((s) => s.profile);
  const maxHr = profile ? profileMaxHr(profile) : null;
  const zones = useMemo(() => zoneBreakdown(samples, maxHr), [samples, maxHr]);
  const hasZoneData = zones.some((z) => z.seconds > 0);

  return (
    <SectionCard label="ЗОНЫ ПУЛЬСА">
      {hasZoneData ? (
        zones.map((row) => (
          <ZoneTimeRow
            key={row.zone.index}
            index={row.zone.index}
            label={row.zone.label}
            color={row.zone.color}
            seconds={row.seconds}
            percent={row.percent}
          />
        ))
      ) : (
        <Text style={styles.empty}>
          {profile
            ? 'Слишком мало данных пульса, чтобы разложить по зонам.'
            : 'Заполните профиль в настройках - зоны считаются от максимального пульса.'}
        </Text>
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
});
