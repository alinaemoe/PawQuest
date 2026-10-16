import { addWalkPhoto, getWalk, listAlbum, photosOnThisDay, walkAround } from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import { PhotoAlbumScreen, PhotoViewer, type AlbumSection } from '@pawquest/screens';
import { useMemo, useState } from 'react';

import { useApp } from './AppContext';
import { pickFromGallery } from './photoCapture';

/** Dog -> Photo album: all pictures by walk, "on this day", and adding from the gallery by time. */
export function AlbumContainer({ dogId, onBack }: { dogId: string; onBack: () => void }) {
  const { db, ctx, i18n, version, bump } = useApp();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);

  const data = useMemo(() => {
    const now = Date.now();
    const album = listAlbum(db, dogId);
    const byWalk = new Map<string, typeof album>();
    for (const photo of album) {
      const key = photo.walkId ?? 'none';
      byWalk.set(key, [...(byWalk.get(key) ?? []), photo]);
    }
    const sections: AlbumSection[] = [...byWalk.entries()].map(([walkId, list]) => {
      const walk = getWalk(db, walkId);
      const first = list[list.length - 1];
      const at = walk?.startedAt ?? first?.takenAt ?? now;
      return {
        key: walkId,
        title: `${i18n.formatLongDate(at)} · ${i18n.formatTime(at)}`,
        subtitle: [
          i18n.t('album.count', { n: list.length }),
          walk?.distanceM == null ? null : i18n.formatDistance(walk.distanceM),
        ]
          .filter((part) => part !== null)
          .join(' · '),
        photos: list.map((p) => ({ id: p.id, uri: p.uri })),
      };
    });
    const memories = photosOnThisDay(album, now, -new Date(now).getTimezoneOffset()).map((g) => ({
      yearsAgo: g.yearsAgo,
      photos: g.photos.map((p) => ({ id: p.id, uri: p.uri })),
    }));
    return {
      total: album.length,
      sections,
      memories,
      flat: album.map((p) => ({ id: p.id, uri: p.uri })),
    };
  }, [db, dogId, i18n, version]);

  const openAt = openId === null ? -1 : data.flat.findIndex((p) => p.id === openId);

  return (
    <>
      <PhotoAlbumScreen
        total={data.total}
        memories={data.memories}
        sections={data.sections}
        onBack={onBack}
        onOpen={setOpenId}
        onImport={() => {
          void (async () => {
            const picked = await pickFromGallery(() => ctx.newId());
            if (picked.length === 0) {
              return;
            }
            let added = 0;
            for (const photo of picked) {
              const takenAt = photo.takenAt;
              const walk = takenAt === null ? null : walkAround(db, dogId, takenAt);
              if (walk !== null && takenAt !== null) {
                addWalkPhoto(db, ctx, walk.id, { ...photo, takenAt });
                added += 1;
              }
            }
            bump();
            const skipped = picked.length - added;
            toast.show({
              message:
                added === 0
                  ? i18n.t('album.importedNone')
                  : skipped === 0
                    ? i18n.t('album.imported', { added })
                    : i18n.t('album.importedSkipped', { added, skipped }),
              durationMs: 4000,
            });
          })();
        }}
      />
      <PhotoViewer
        photos={data.flat}
        openAt={openAt >= 0 ? openAt : null}
        onClose={() => {
          setOpenId(null);
        }}
        onRemove={() => undefined}
        canRemove={false}
      />
    </>
  );
}
