import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WorkoutSession } from '../types';

/**
 * Разделы, между которыми переключаются вкладками. В макетах нигде нет кнопок
 * «назад», так что переход между ними работа панели вкладок, а не шеврона.
 */
export type TabParamList = {
  Workout: undefined;
  History: undefined;
  Settings: undefined;
};

/**
 * Всё, что накрывает вкладки на весь экран: интро, модалка сопряжения и поток
 * тренировки (уйти вкладкой от идущей тренировки нельзя).
 */
export type RootStackParamList = {
  Welcome: undefined;
  // Чек-лист настройки как шаг интро. Тот же экран служит и вкладкой «Настройки»,
  // только без кнопки завершения.
  Setup: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  ScanDevice: undefined;
  ActiveWorkout: undefined;
  WorkoutSummary: { session: WorkoutSession };
  SessionDetails: { sessionId: string };
  Stats: undefined;
  BleLog: undefined;
};

/** Пропсы экрана из стека. */
export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

/**
 * Пропсы экрана-вкладки. Вкладке нужно открывать и экраны стека (ActiveWorkout,
 * ScanDevice и другие), поэтому её навигация это композиция обоих навигаторов.
 */
export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
