import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent вызывает AppRegistry.registerComponent('main', () => App) и
// готовит окружение одинаково, запущено ли приложение в Expo Go или в нативной сборке.
registerRootComponent(App);
