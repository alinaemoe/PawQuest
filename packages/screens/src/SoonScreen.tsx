import { AppText, Avatar, Screen, useI18n } from '@pawquest/rn-ui';
import { View } from 'react-native';

import type { IconName } from '@pawquest/rn-ui';

export interface SoonScreenProps {
  readonly icon: IconName;
  readonly title: string;
  readonly text: string;
}

/** A calm empty state for tabs that arrive in a later phase (G-05: one phrase, no empty charts). */
export function SoonScreen({ icon, title, text }: SoonScreenProps) {
  const i18n = useI18n();
  return (
    <Screen>
      <AppText variant="numBig">{title}</AppText>
      <View style={{ alignItems: 'center', gap: 16, paddingVertical: 48 }}>
        <Avatar icon={icon} size={88} />
        <AppText variant="eyebrow">{i18n.t('soon.title')}</AppText>
        <AppText variant="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
          {text}
        </AppText>
      </View>
    </Screen>
  );
}
