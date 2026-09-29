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
import './src/location/backgroundLocation';
import './src/workout/foregroundService';
import { getFlag, initDatabase } from './src/db/database';
import { ONBOARDING_DONE_FLAG } from './src/onboarding';
import { restoreWorkoutDraft, startWorkoutDraftAutosave } from './src/workout/workoutDraft';
import { RootNavigator } from './src/navigation/RootNavigator';
import type { RootStackParamList } from './src/navigation/types';
import { useProfileStore } from './src/store/profileStore';
import { useSessionStore } from './src/store/sessionStore';
import { colors } from './src/theme';

// Keep the start screen up at least this long so it reads as a screen, not a flicker.
const MIN_PRELOADER_MS = 1400;

const navigationTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.background },
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [minTimePassed, setMinTimePassed] = useState(false);
  // Decided once, before the navigator mounts: a fresh install opens on the
  // intro, an existing one goes straight to the tabs.
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
          restoreWorkoutDraft().catch(() => false),
          getFlag(ONBOARDING_DONE_FLAG)
            .then((seen) => setInitialRoute(seen ? 'Tabs' : 'Welcome'))
            .catch(() => {}),
        ]),
      )
      .finally(() => {
        startWorkoutDraftAutosave();
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
