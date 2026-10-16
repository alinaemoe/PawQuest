import {
  addWalkPhoto,
  allPhotoUris,
  listWalks,
  removePhoto,
  walkShots,
  WALK_PHOTO_SLACK_MS,
  type Photo,
  type SqlDb,
  type Walk,
} from '@pawquest/data';
import type { Ctx } from '@pawquest/data';
import * as MediaLibrary from 'expo-media-library/legacy';

const PHOTO_ACCESS: MediaLibrary.GranularPermission[] = ['photo'];

export type GalleryAccess = 'granted' | 'denied';

/** Whether pictures can be read from the gallery; asks the owner once if `ask` is set. */
export async function galleryAccess(ask: boolean): Promise<GalleryAccess> {
  try {
    const current = await MediaLibrary.getPermissionsAsync(false, PHOTO_ACCESS);
    if (current.granted) {
      return 'granted';
    }
    if (!ask || !current.canAskAgain) {
      return 'denied';
    }
    const answer = await MediaLibrary.requestPermissionsAsync(false, PHOTO_ACCESS);
    return answer.granted ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

function walkEnd(walk: Walk): number {
  return walk.endedAt ?? walk.startedAt + (walk.durationS ?? 0) * 1000;
}

/**
 * Links the gallery pictures taken during a walk to it: the ones taken in the phone's own camera
 * app while the walk was going. Nothing is copied, the app keeps only links.
 */
export async function linkWalkPhotos(db: SqlDb, ctx: Ctx, walk: Walk): Promise<Photo[]> {
  const start = walk.startedAt - WALK_PHOTO_SLACK_MS;
  const end = walkEnd(walk) + WALK_PHOTO_SLACK_MS;
  const page = await MediaLibrary.getAssetsAsync({
    mediaType: 'photo',
    createdAfter: start,
    createdBefore: end,
    sortBy: [[MediaLibrary.SortBy.creationTime, true]],
    first: 200,
  });
  const shots = walkShots(
    page.assets.map((a) => ({
      uri: a.uri,
      filename: a.filename,
      takenAt: a.creationTime,
      width: a.width,
      height: a.height,
    })),
    allPhotoUris(db),
    walk.startedAt,
    walkEnd(walk),
  );
  return shots.map((shot) =>
    addWalkPhoto(db, ctx, walk.id, {
      uri: shot.uri,
      width: shot.width,
      height: shot.height,
      takenAt: shot.takenAt,
    }),
  );
}

/** Looks for the pictures of every finished walk of the last days. */
export async function linkRecentWalkPhotos(
  db: SqlDb,
  ctx: Ctx,
  dogId: string,
  days: number,
): Promise<Photo[]> {
  const now = Date.now();
  const found: Photo[] = [];
  for (const walk of listWalks(db, dogId, now - days * 86_400_000, now + 1)) {
    found.push(...(await linkWalkPhotos(db, ctx, walk)));
  }
  return found;
}

/**
 * Hides the links whose picture was deleted from the gallery (only when the gallery can be read,
 * and only when it says for sure that the picture is gone).
 */
export async function pruneMissingPhotos(
  db: SqlDb,
  ctx: Ctx,
  photos: readonly { readonly id: string; readonly uri: string }[],
): Promise<number> {
  if ((await galleryAccess(false)) !== 'granted') {
    return 0;
  }
  let hidden = 0;
  for (const photo of photos) {
    const id = /^content:\/\/media\/.*\/(\d+)$/.exec(photo.uri)?.[1];
    if (id === undefined) {
      continue;
    }
    try {
      const info = (await MediaLibrary.getAssetInfoAsync(id)) as unknown;
      if (info === null || info === undefined) {
        removePhoto(db, ctx, photo.id);
        hidden += 1;
      }
    } catch {
      // an error is not proof that the picture is gone
    }
  }
  return hidden;
}
