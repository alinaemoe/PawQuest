import { registerRootComponent } from 'expo';

// The background task must be defined before anything else runs (also in headless background JS).
import './src/spike/gpsTask';
// The notification action listener must exist before any screen (spike S5).
import './src/spike/notif';
import App from './App';

registerRootComponent(App);
