import { listWalkPhotos, removePhoto, restorePhoto } from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import { PhotoStrip, PhotoViewer } from '@pawquest/screens';
import { useMemo, useState } from 'react';

import { useApp } from './AppContext';

/** The pictures of one walk: a strip of thumbnails and a full-screen viewer with delete + undo. */
export function WalkPhotos({ walkId }: { walkId: string }) {
  const { db, ctx, i18n, version, bump } = useApp();
  const toast = useToast();
  const [openAt, setOpenAt] = useState<number | null>(null);
  const photos = useMemo(
    () => listWalkPhotos(db, walkId).map((p) => ({ id: p.id, uri: p.uri })),
    [db, walkId, version],
  );
  return (
    <>
      <PhotoStrip photos={photos} onOpen={setOpenAt} />
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
