import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { BatteryTone, batteryInfo } from '../ble/battery';
import { colors, fonts, spacing } from '../theme';

interface Props {
  percent: number | null;
}

const TONE_COLOR: Record<BatteryTone, string> = {
  ok: colors.textMuted,
  low: colors.amber,
  critical: colors.danger,
};

/**
 * Заряд нагрудного ремня под строкой датчика на главной: значок, процент и, когда батарейка
 * садится, подсказка её заменить. Если ремень заряд не отдал, ничего не рисует.
 */
export function SensorBattery({ percent }: Props) {
  const info = batteryInfo(percent);
  if (!info) return null;
  const color = TONE_COLOR[info.tone];
  const icon = info.tone === 'critical' ? 'battery-dead' : info.percent > 60 ? 'battery-full' : 'battery-half';

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={[styles.text, { color }]}>Заряд датчика {info.percent}%</Text>
      </View>
      {info.hint && <Text style={[styles.hint, { color }]}>{info.hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  text: {
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    textAlign: 'center',
  },
});
