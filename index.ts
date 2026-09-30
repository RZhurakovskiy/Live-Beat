import { registerRootComponent } from 'expo';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import App from './App';
import { widgetTaskHandler } from './src/widget/widgetTaskHandler';

// registerRootComponent вызывает AppRegistry.registerComponent('main', () => App) и
// готовит окружение одинаково, запущено ли приложение в Expo Go или в нативной сборке.
registerRootComponent(App);
// Виджет «Эта неделя» на рабочем столе: система зовёт этот обработчик в фоне, даже когда
// приложение закрыто.
registerWidgetTaskHandler(widgetTaskHandler);
