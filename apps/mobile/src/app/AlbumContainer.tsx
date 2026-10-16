import { getWalk, listAlbum, photosOnThisDay } from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import { PhotoAlbumScreen, PhotoViewer, type AlbumSection } from '@pawquest/screens';
import { useEffect, useMemo, useState } from 'react';

import { useApp } from './AppContext';
import { galleryAccess, linkRecentWalkPhotos, pruneMissingPhotos } from './galleryPhotos';

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

  useEffect(() => {
    void pruneMissingPhotos(db, ctx, data.flat).then((hidden) => {
      if (hidden > 0) {
        bump();
      }
    });
    // once, when the album opens
  }, []);

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
            if ((await galleryAccess(true)) !== 'granted') {
              toast.show({ message: i18n.t('photo.galleryDenied'), durationMs: 4000 });
              return;
            }
            const found = await linkRecentWalkPhotos(db, ctx, dogId, 60);
            bump();
            toast.show({
              message:
                found.length === 0
                  ? i18n.t('album.importedNone')
                  : i18n.t('album.imported', { n: found.length }),
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
