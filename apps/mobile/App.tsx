import { AppProviders } from './src/app/AppContext';
import { Root } from './src/app/Root';

export default function App() {
  return (
    <AppProviders>
      <Root />
    </AppProviders>
  );
}
