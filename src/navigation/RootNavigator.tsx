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

// Чек-лист настройки как шаг интро: тот же экран, что вкладка «Настройки», плюс
// кнопка, которая закрывает интро.
function OnboardingSetup() {
  return <SetupScreen onboarding />;
}

interface Props {
  /** `Welcome` на свежей установке, `Tabs`, когда интро уже видели. */
  initialRouteName: keyof RootStackParamList;
}

/** Корневой стек: интро, вкладки и всё, что открывается поверх них. У всех экранов свои шапки. */
export function RootNavigator({ initialRouteName }: Props) {
  return (
    <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Setup" component={OnboardingSetup} />
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="ScanDevice" component={ScanDeviceScreen} options={{ presentation: 'modal' }} />
      {/* Идущая тренировка накрывает вкладки: уйти от неё жестом или вкладкой нельзя. */}
      <Stack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="SessionDetails" component={SessionDetailsScreen} />
      <Stack.Screen name="Stats" component={StatsScreen} />
      <Stack.Screen name="BleLog" component={BleLogScreen} />
    </Stack.Navigator>
  );
}
