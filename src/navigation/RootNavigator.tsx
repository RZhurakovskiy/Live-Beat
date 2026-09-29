import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActiveWorkoutScreen } from '../screens/ActiveWorkoutScreen';
import { BleLogScreen } from '../screens/BleLogScreen';
import { ScanDeviceScreen } from '../screens/ScanDeviceScreen';
import { SessionDetailsScreen } from '../screens/SessionDetailsScreen';
import { SetupScreen } from '../screens/SetupScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { WorkoutSummaryScreen } from '../screens/WorkoutSummaryScreen';
import { TabNavigator } from './TabNavigator';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

// The setup checklist as an intro step: same screen as the Settings tab, plus
// the button that closes the onboarding.
function OnboardingSetup() {
  return <SetupScreen onboarding />;
}

interface Props {
  // 'Welcome' on a fresh install, 'Tabs' once the intro has been seen.
  initialRouteName: keyof RootStackParamList;
}

export function RootNavigator({ initialRouteName }: Props) {
  return (
    <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Setup" component={OnboardingSetup} />
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
