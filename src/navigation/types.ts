import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WorkoutSession } from '../types';

// Destinations you switch between. The mockups draw no back buttons anywhere,
// so moving between these is the tab bar's job, not a back chevron's.
export type TabParamList = {
  Workout: undefined;
  History: undefined;
  Settings: undefined;
};

// Everything that covers the tabs full-screen: onboarding, the pairing modal,
// and the workout flow (you must not be able to tab away from a running
// workout).
export type RootStackParamList = {
  Welcome: undefined;
  // The setup checklist as a step of the intro. The same screen is also the
  // Settings tab, just without the closing button.
  Setup: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  ScanDevice: undefined;
  ActiveWorkout: undefined;
  WorkoutSummary: { session: WorkoutSession };
  SessionDetails: { sessionId: string };
  Stats: undefined;
  BleLog: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

// A tab screen also needs to push stack screens (ActiveWorkout, ScanDevice…),
// so its navigation prop is the composition of both navigators.
export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
