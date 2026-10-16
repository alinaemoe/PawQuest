import { AppText, Button, Card, Chip, Screen, useI18n } from '@pawquest/rn-ui';
import { Image, Pressable, View, useWindowDimensions } from 'react-native';

import type { PhotoThumb } from './PhotoViews';

export interface AlbumSection {
  readonly key: string;
  readonly title: string;
  readonly subtitle: string;
  readonly photos: readonly PhotoThumb[];
}

export interface AlbumMemory {
  readonly yearsAgo: number;
  readonly photos: readonly PhotoThumb[];
}

export interface PhotoAlbumScreenProps {
  readonly total: number;
  /** Pictures taken on today's date in earlier years. */
  readonly memories: readonly AlbumMemory[];
  /** Pictures by walk, newest walk first. */
  readonly sections: readonly AlbumSection[];
  readonly onBack: () => void;
  readonly onOpen: (id: string) => void;
  readonly onImport: () => void;
}

const GAP = 6;
const SIDE = 16;

function Grid(props: {
  readonly photos: readonly PhotoThumb[];
  readonly onOpen: (id: string) => void;
}) {
  const i18n = useI18n();
  const { width } = useWindowDimensions();
  const size = Math.floor((width - SIDE * 2 - GAP * 2) / 3);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
      {props.photos.map((photo, index) => (
        <Pressable
          key={photo.id}
          accessibilityRole="imagebutton"
          accessibilityLabel={i18n.t('photo.open', { n: index + 1, total: props.photos.length })}
          onPress={() => {
            props.onOpen(photo.id);
          }}
        >
          <Image
            source={{ uri: photo.uri }}
            style={{ width: size, height: size, borderRadius: 12, backgroundColor: '#0002' }}
          />
        </Pressable>
      ))}
    </View>
  );
}

/** Dog -> Photo album: every picture from the walks, grouped by walk, with "on this day". */
export function PhotoAlbumScreen(props: PhotoAlbumScreenProps) {
  const i18n = useI18n();
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Chip size="sm" label={i18n.t('common.back')} onPress={props.onBack} />
      </View>
      <AppText variant="numBig">{i18n.t('album.title')}</AppText>
      <AppText variant="muted">{i18n.t('album.hint')}</AppText>
      <Button
        label={i18n.t('album.fromGallery')}
        tone="ghost"
        icon="plus"
        onPress={props.onImport}
      />

      {props.total === 0 ? (
        <Card variant="soft">
          <AppText weight={600}>{i18n.t('album.emptyTitle')}</AppText>
          <AppText variant="muted">{i18n.t('album.emptyText')}</AppText>
        </Card>
      ) : null}

      {props.memories.map((memory) => (
        <Card key={memory.yearsAgo} variant="soft">
          <AppText variant="eyebrow">
            {i18n.t('album.memories')} · {i18n.t('album.yearsAgo', { n: memory.yearsAgo })}
          </AppText>
          <Grid photos={memory.photos} onOpen={props.onOpen} />
        </Card>
      ))}

      {props.sections.map((section) => (
        <View key={section.key} style={{ gap: 8 }}>
          <View>
            <AppText weight={600}>{section.title}</AppText>
            <AppText variant="muted">{section.subtitle}</AppText>
          </View>
          <Grid photos={section.photos} onOpen={props.onOpen} />
        </View>
      ))}
    </Screen>
  );
}
