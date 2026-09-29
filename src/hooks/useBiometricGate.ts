import { useNavigation } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

export function useBiometricGate() {
  const navigation = useNavigation();
  const [unlocked, setUnlocked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setUnlocked(false);

      (async () => {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (!hasHardware || !isEnrolled) {
          if (!cancelled) setUnlocked(true);
          return;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Разблокируйте историю тренировок',
          cancelLabel: 'Отмена',
        });

        if (cancelled) return;

        if (result.success) {
          setUnlocked(true);
        } else if (navigation.canGoBack()) {
          navigation.goBack();
        }
        // History is a tab now, so there may be nothing to go back to. The
        // screen then stays blank and re-prompts when the tab is focused again.
      })();

      return () => {
        cancelled = true;
      };
    }, [navigation]),
  );

  return unlocked;
}
