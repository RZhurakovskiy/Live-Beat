import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActiveWorkoutScreen } from '../screens/ActiveWorkoutScreen';
import { BleLogScreen } from '../screens/BleLogScreen';
import { ScanDeviceScreen } from '../screens/ScanDeviceScreen';
import { SessionDetailsScreen } from '../screens/SessionDetailsScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { WorkoutSummaryScreen } from '../screens/WorkoutSummaryScreen';
import { TabNavigator } from './TabNavigator';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="ScanDevice" component={ScanDeviceScreen} options={{ presentation: 'modal' }} />
      {/* A running workout covers the tabs: you must not be able to swipe or tab away from it. */}
      <Stack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="SessionDetails" component={SessionDetailsScreen} />
      <Stack.Screen name="Stats" component={StatsScreen} />
      <Stack.Screen name="BleLog" component={BleLogScreen} />
    </Stack.Navigator>
  );
}
