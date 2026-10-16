import { AppText, Button, Chip, useI18n } from '@pawquest/rn-ui';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface PhotoThumb {
  readonly id: string;
  readonly uri: string;
}

export interface PhotoStripProps {
  readonly photos: readonly PhotoThumb[];
  readonly onOpen: (index: number) => void;
}

/** A row of small pictures; a tap opens the viewer on that one. Nothing is shown without photos. */
export function PhotoStrip({ photos, onOpen }: PhotoStripProps) {
  const i18n = useI18n();
  if (photos.length === 0) {
    return null;
  }
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="eyebrow">{i18n.t('photo.title')}</AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {photos.map((photo, index) => (
          <Pressable
            key={photo.id}
            accessibilityRole="imagebutton"
            accessibilityLabel={i18n.t('photo.open', { n: index + 1, total: photos.length })}
            onPress={() => {
              onOpen(index);
            }}
          >
            <Image
              source={{ uri: photo.uri }}
              style={{ width: 76, height: 76, borderRadius: 14, backgroundColor: '#0002' }}
            />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export interface PhotoViewerProps {
  readonly photos: readonly PhotoThumb[];
  /** The index to open on, or null when the viewer is closed. */
  readonly openAt: number | null;
  readonly onClose: () => void;
  readonly onRemove: (id: string) => void;
}

/** One picture at a time on black, with the neighbours one tap away and a delete button. */
export function PhotoViewer({ photos, openAt, onClose, onRemove }: PhotoViewerProps) {
  const i18n = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(openAt ?? 0);
  useEffect(() => {
    if (openAt !== null) {
      setIndex(openAt);
    }
  }, [openAt]);
  const safeIndex = Math.min(index, Math.max(0, photos.length - 1));
  const photo = photos[safeIndex];
  return (
    <Modal
      visible={openAt !== null && photo !== undefined}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: '#000',
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 12,
          }}
        >
          <Chip label={i18n.t('common.close')} onPress={onClose} />
          <AppText style={{ color: '#fff' }}>
            {String(safeIndex + 1)} / {String(photos.length)}
          </AppText>
        </View>
        {photo === undefined ? null : (
          <Image
            source={{ uri: photo.uri }}
            resizeMode="contain"
            style={{ width, height: height * 0.68 }}
            accessibilityLabel={i18n.t('photo.title')}
          />
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, padding: 12 }}>
          <Chip
            label="‹"
            onPress={() => {
              setIndex((current) => Math.max(0, current - 1));
            }}
          />
          <Chip
            label="›"
            onPress={() => {
              setIndex((current) => Math.min(photos.length - 1, current + 1));
            }}
          />
        </View>
        {photo === undefined ? null : (
          <View style={{ paddingHorizontal: 16 }}>
            <Button
              label={i18n.t('photo.delete')}
              tone="ghost"
              icon="trash"
              onPress={() => {
                onRemove(photo.id);
              }}
            />
          </View>
        )}
      </View>
    </Modal>
  );
}
