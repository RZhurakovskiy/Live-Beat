import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Preloader } from './src/components/Preloader';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// Импорты ради побочного эффекта: при запуске, до любого экрана, регистрируют фоновую
// задачу геолокации и foreground-сервис Notifee. Android может поднять их сам, пока
// приложение в фоне, и к этому моменту они уже должны быть объявлены.
import './src/location/backgroundLocation';
import './src/workout/foregroundService';
import { getFlag, initDatabase } from './src/db/database';
import { ONBOARDING_DONE_FLAG } from './src/onboarding';
import { startVoiceCoach } from './src/workout/voiceCoach';
import { restoreWorkoutDraft, startWorkoutDraftAutosave } from './src/workout/workoutDraft';
import { RootNavigator } from './src/navigation/RootNavigator';
import type { RootStackParamList } from './src/navigation/types';
import { useProfileStore } from './src/store/profileStore';
import { useSessionStore } from './src/store/sessionStore';
import { colors } from './src/theme';

// Прелоадер держится хотя бы столько, чтобы читаться как экран, а не как мелькание.
const MIN_PRELOADER_MS = 1400;

// Тёмная тема навигации с нашим фоном, чтобы при переходах не проступал фон по умолчанию.
const navigationTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.background },
};

/**
 * Корень приложения. Пока открывается база, грузятся профиль, известный датчик,
 * черновик тренировки и шрифты, на экране прелоадер; потом навигатор.
 */
export default function App() {
  // useState: от этих флагов зависит, что нарисовано, прелоадер или приложение.
  const [ready, setReady] = useState(false);
  const [minTimePassed, setMinTimePassed] = useState(false);
  // Решается один раз, до монтирования навигатора: свежая установка открывается на
  // интро, остальные сразу на вкладках. Состояние, потому что значение приходит из
  // базы асинхронно и должно попасть в рендер навигатора.
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList>('Tabs');
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const loadProfile = useProfileStore((s) => s.loadProfile);
  const loadLastKnownDevice = useSessionStore((s) => s.loadLastKnownDevice);

  useEffect(() => {
    initDatabase()
      .then(() =>
        Promise.all([
          loadProfile(),
          loadLastKnownDevice(),
          restoreWorkoutDraft().catch(() => ({ kind: 'none' as const })),
          getFlag(ONBOARDING_DONE_FLAG)
            .then((seen) => setInitialRoute(seen ? 'Tabs' : 'Welcome'))
            .catch(() => {}),
        ]),
      )
      .finally(() => {
        startWorkoutDraftAutosave();
        startVoiceCoach();
        setReady(true);
      });
  }, [loadProfile, loadLastKnownDevice]);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimePassed(true), MIN_PRELOADER_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!ready || !fontsLoaded || !minTimePassed) {
    return (
      <>
        <Preloader fontsReady={fontsLoaded} />
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <NavigationContainer theme={navigationTheme}>
          <RootNavigator initialRouteName={initialRoute} />
        </NavigationContainer>
        <StatusBar style="light" />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
