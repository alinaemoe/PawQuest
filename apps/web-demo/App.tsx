import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { AppProviders } from '../mobile/src/app/AppContext';
import { Root } from '../mobile/src/app/Root';
import { RewardsPreview } from './src/RewardsPreview';
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
  const preview =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('preview');
  return <AppProviders>{preview === 'rewards' ? <RewardsPreview /> : <Root />}</AppProviders>;
}
