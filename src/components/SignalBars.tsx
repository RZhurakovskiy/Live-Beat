import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

const BARS = 4;

// RSSI is dBm and negative: closer to zero is stronger. Bucketing into four
// steps keeps the bars from twitching on every advertisement packet.
export function barsForRssi(rssi: number | null): number {
  if (rssi == null) return 0;
  if (rssi >= -60) return 4;
  if (rssi >= -70) return 3;
  if (rssi >= -80) return 2;
  return 1;
}

interface Props {
  rssi: number | null;
  color?: string;
}

export function SignalBars({ rssi, color = colors.green }: Props) {
  const filled = barsForRssi(rssi);
  return (
    <View style={styles.row}>
      {Array.from({ length: BARS }, (_, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            { height: 5 + index * 3 },
            index < filled ? { backgroundColor: color } : styles.barEmpty,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    width: 3,
    borderRadius: 1.5,
  },
  barEmpty: {
    backgroundColor: colors.border,
  },
});
