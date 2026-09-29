import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme';
import { ZONES } from '../utils/heartRateZones';
import { TargetZonePicker, TargetZoneRange } from './TargetZonePicker';

interface Props {
  value: TargetZoneRange | null;
  onChange: (value: TargetZoneRange | null) => void;
}

// Collapsed it reads like every other section card: colour dot, zone name,
// chevron. Tapping expands the existing picker in place — the mockups have no
// screen for this, so it stays on the one screen where it is chosen.
export function TargetZoneCard({ value, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);

  const zones = value ? ZONES.filter((z) => z.index >= value.min && z.index <= value.max) : [];
  const summary = value
    ? zones.length === 1
      ? `Зона ${zones[0].index} · ${zones[0].label}`
      : `Зоны ${value.min}–${value.max}`
    : 'Не задана';
  const dotColor = zones.length > 0 ? zones[zones.length - 1].color : colors.textMuted;

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.head} activeOpacity={0.85} onPress={() => setExpanded((v) => !v)}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>ЦЕЛЕВАЯ ЗОНА ПУЛЬСА</Text>
          <Text style={styles.value}>{summary}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          <TargetZonePicker value={value} onChange={onChange} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  value: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  body: {
    marginTop: spacing.md,
  },
});
