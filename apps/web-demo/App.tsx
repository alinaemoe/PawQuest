import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { AppProviders } from '../mobile/src/app/AppContext';
import { Root } from '../mobile/src/app/Root';
import { initRuntime } from './src/runtime';

/** The real app over the demo database. */
export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    initRuntime()
      .then(() => {
        setReady(true);
      })
      .catch((e: unknown) => {
        setError(String(e));
      });
  }, []);
  if (error !== null) {
    return <Text>{error}</Text>;
  }
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Загружаю демо…</Text>
      </View>
    );
  }
  return (
    <AppProviders>
      <Root />
    </AppProviders>
  );
}
