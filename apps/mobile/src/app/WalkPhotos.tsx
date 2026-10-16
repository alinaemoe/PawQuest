import { getWalk, listWalkPhotos, removePhoto, restorePhoto } from '@pawquest/data';
import { Chip, useToast } from '@pawquest/rn-ui';
import { PhotoStrip, PhotoViewer } from '@pawquest/screens';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useApp } from './AppContext';
import { galleryAccess, linkWalkPhotos, pruneMissingPhotos } from './galleryPhotos';

export interface WalkPhotosProps {
  readonly walkId: string;
  /** Look in the gallery as soon as the walk is shown (the summary right after a walk). */
  readonly autoFind?: boolean;
}

/**
 * The pictures of one walk: a strip of thumbnails, a viewer with delete + undo, and the search of
 * the gallery for pictures taken during the walk (links only, nothing is copied).
 */
export function WalkPhotos({ walkId, autoFind = false }: WalkPhotosProps) {
  const { db, ctx, i18n, version, bump } = useApp();
  const toast = useToast();
  const [openAt, setOpenAt] = useState<number | null>(null);
  const photos = useMemo(
    () => listWalkPhotos(db, walkId).map((p) => ({ id: p.id, uri: p.uri })),
    [db, walkId, version],
  );

  const find = async (ask: boolean, quiet: boolean): Promise<void> => {
    const walk = getWalk(db, walkId);
    if (walk?.status !== 'completed') {
      return;
    }
    if ((await galleryAccess(ask)) !== 'granted') {
      if (!quiet) {
        toast.show({ message: i18n.t('photo.galleryDenied'), durationMs: 4000 });
      }
      return;
    }
    const added = await linkWalkPhotos(db, ctx, walk);
    if (added.length > 0) {
      bump();
      toast.show({
        message: i18n.t('photo.found', { n: added.length }),
        actionLabel: i18n.t('common.undo'),
        durationMs: 6000,
        onAction: () => {
          for (const photo of added) {
            removePhoto(db, ctx, photo.id);
          }
          bump();
        },
      });
    } else if (!quiet) {
      toast.show({ message: i18n.t('photo.foundNone'), durationMs: 3000 });
    }
  };

  useEffect(() => {
    void pruneMissingPhotos(db, ctx, photos).then((hidden) => {
      if (hidden > 0) {
        bump();
      }
    });
    if (autoFind) {
      void find(true, true);
    }
    // once, when the walk is shown
  }, []);

  return (
    <>
      <PhotoStrip photos={photos} onOpen={setOpenAt} />
      <View style={{ flexDirection: 'row' }}>
        <Chip
          size="sm"
          label={i18n.t('photo.find')}
          onPress={() => {
            void find(true, false);
          }}
        />
      </View>
      <PhotoViewer
        photos={photos}
        openAt={openAt}
        onClose={() => {
          setOpenAt(null);
        }}
        onRemove={(id) => {
          removePhoto(db, ctx, id);
          if (photos.length <= 1) {
            setOpenAt(null);
          }
          bump();
          toast.show({
            message: i18n.t('photo.deleted'),
            actionLabel: i18n.t('common.undo'),
            durationMs: 6000,
            onAction: () => {
              restorePhoto(db, id);
              bump();
            },
          });
        }}
      />
    </>
  );
}
