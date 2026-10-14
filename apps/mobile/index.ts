import { registerRootComponent } from 'expo';

// The background task must be defined before anything else runs (also in headless background JS).
import './src/spike/gpsTask';
import App from './App';

registerRootComponent(App);
