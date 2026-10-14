import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';

// Web only: the prototype fonts (the mobile app will bundle them with expo-font later).
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=Unbounded:wght@500;600&family=JetBrains+Mono:wght@500&display=swap';
  document.head.appendChild(link);
}

registerRootComponent(App);
