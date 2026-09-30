import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HistoryScreen } from '../screens/HistoryScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { SetupScreen } from '../screens/SetupScreen';
import { colors, fonts } from '../theme';
import { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

// Тот же экран, что шаг интро, но без кнопки завершения. Объявлен на уровне
// модуля, чтобы переключение вкладок не монтировало его заново.
function SettingsTab() {
  return <SetupScreen />;
}

const ICONS: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
  Workout: 'pulse',
  History: 'time-outline',
  Settings: 'settings-outline',
};

/** Нижние вкладки: «Тренировка», «История», «Настройки». */
export function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accentStart,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.semibold,
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ color, size }) => <Ionicons name={ICONS[route.name]} size={size - 2} color={color} />,
      })}
    >
      <Tab.Screen name="Workout" component={HomeScreen} options={{ title: 'Тренировка' }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ title: 'История' }} />
      <Tab.Screen name="Settings" component={SettingsTab} options={{ title: 'Настройки' }} />
    </Tab.Navigator>
  );
}
