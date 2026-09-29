import { WorkoutSession } from '../types';

export type RootStackParamList = {
  Home: undefined;
  ScanDevice: undefined;
  ActiveWorkout: undefined;
  WorkoutSummary: { session: WorkoutSession };
  History: undefined;
  SessionDetails: { sessionId: string };
  Profile: undefined;
  Stats: undefined;
  BleLog: undefined;
};
