import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import {
  PHOTO_EVENT_WINDOW_MS,
  WALK_PHOTO_SLACK_MS,
  allPhotoUris,
  walkShots,
  addPhoto,
  addWalkPhoto,
  listPhotos,
  listWalkPhotos,
  nearestEventId,
  removePhoto,
  restorePhoto,
  walkAround,
} from './photos';
import { START, testEnv, type TestEnv } from './test-utils';
import { softDelete } from './trash';
import { createManualWalk } from './walks';

let env: TestEnv;
let dog: Dog;
let walkId: string;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Луна' });
  walkId = createManualWalk(env.db, env.ctx, {
    dogId: dog.id,
    startedAt: START,
    durationS: 1800,
  }).id;
});
afterEach(() => {
  env.db.close();
});

const event = (at: number, forWalk: string | null = walkId) =>
  createEvent(env.db, env.ctx, {
    dogId: dog.id,
    walkId: forWalk,
    typeId: 'dog',
    ts: at,
    tzOffsetMin: 0,
    incomplete: false,
  });

const photo = { uri: 'file:///photos/a.jpg', width: 1200, height: 900, bytes: 150_000 };

describe('addPhoto and listPhotos', () => {
  it('stores everything it is given and reads it back', () => {
    const saved = addPhoto(
      env.db,
      env.ctx,
      { table: 'walk', id: walkId },
      {
        ...photo,
        takenAt: START + 5_000,
        lat: 55.75,
        lon: 37.61,
      },
    );
    expect(saved).toMatchObject({
      ownerTable: 'walk',
      ownerId: walkId,
      uri: photo.uri,
      width: 1200,
      height: 900,
      bytes: 150_000,
      takenAt: START + 5_000,
      lat: 55.75,
      lon: 37.61,
    });
    expect(listPhotos(env.db, 'walk', walkId)).toEqual([saved]);
  });

  it('missing details are null and the time defaults to now', () => {
    const saved = addPhoto(
      env.db,
      env.ctx,
      { table: 'walk', id: walkId },
      { uri: 'file:///x.jpg' },
    );
    expect(saved).toMatchObject({ width: null, height: null, bytes: null, lat: null, lon: null });
    expect(saved.takenAt).toBe(env.ctx.now());
  });

  it('refuses a photo without a stored location', () => {
    expect(() => addPhoto(env.db, env.ctx, { table: 'walk', id: walkId }, { uri: '  ' })).toThrow(
      RangeError,
    );
  });

  it('lists oldest first and keeps owners apart', () => {
    const late = addPhoto(
      env.db,
      env.ctx,
      { table: 'walk', id: walkId },
      { uri: 'file:///2.jpg', takenAt: START + 9_000 },
    );
    const early = addPhoto(
      env.db,
      env.ctx,
      { table: 'walk', id: walkId },
      { uri: 'file:///1.jpg', takenAt: START + 1_000 },
    );
    addPhoto(env.db, env.ctx, { table: 'walk', id: 'another' }, { uri: 'file:///3.jpg' });
    expect(listPhotos(env.db, 'walk', walkId).map((p) => p.id)).toEqual([early.id, late.id]);
  });
});

describe('nearestEventId', () => {
  it('finds the event closest in time within the window', () => {
    const near = event(START + 100_000);
    event(START + 400_000);
    expect(nearestEventId(env.db, walkId, START + 130_000)).toBe(near.id);
    expect(nearestEventId(env.db, walkId, START + 70_000)).toBe(near.id);
  });

  it('is inclusive at the window edge and null just outside', () => {
    const e = event(START + 100_000);
    expect(nearestEventId(env.db, walkId, START + 100_000 + PHOTO_EVENT_WINDOW_MS)).toBe(e.id);
    expect(nearestEventId(env.db, walkId, START + 100_000 + PHOTO_EVENT_WINDOW_MS + 1)).toBeNull();
  });

  it('picks the closer of two, and the earlier one on a tie', () => {
    const first = event(START + 100_000);
    const second = event(START + 160_000);
    expect(nearestEventId(env.db, walkId, START + 140_000)).toBe(second.id);
    expect(nearestEventId(env.db, walkId, START + 130_000)).toBe(first.id);
  });

  it('ignores deleted events, events of other walks and events outside any walk', () => {
    const gone = event(START + 100_000);
    softDelete(env.db, env.ctx, 'event', gone.id);
    const other = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START,
      durationS: 60,
    });
    event(START + 100_000, other.id);
    event(START + 100_000, null);
    expect(nearestEventId(env.db, walkId, START + 100_000)).toBeNull();
  });

  it('a walk without events has none', () => {
    expect(nearestEventId(env.db, walkId, START)).toBeNull();
  });
});

describe('addWalkPhoto and listWalkPhotos', () => {
  it('goes to the event when one is close, otherwise to the walk', () => {
    const e = event(START + 100_000);
    const nearEvent = addWalkPhoto(env.db, env.ctx, walkId, { ...photo, takenAt: START + 110_000 });
    const farAway = addWalkPhoto(env.db, env.ctx, walkId, { ...photo, takenAt: START + 900_000 });
    expect(nearEvent).toMatchObject({ ownerTable: 'event', ownerId: e.id });
    expect(farAway).toMatchObject({ ownerTable: 'walk', ownerId: walkId });
  });

  it('lists the walk and its events together in time order, without removed ones', () => {
    const e = event(START + 100_000);
    const a = addWalkPhoto(env.db, env.ctx, walkId, { ...photo, takenAt: START + 50_000 }); // walk
    const b = addWalkPhoto(env.db, env.ctx, walkId, { ...photo, takenAt: START + 105_000 }); // event
    const c = addWalkPhoto(env.db, env.ctx, walkId, { ...photo, takenAt: START + 900_000 }); // walk
    removePhoto(env.db, env.ctx, c.id);
    expect(listWalkPhotos(env.db, walkId).map((p) => p.id)).toEqual([a.id, b.id]);
    expect(b.ownerId).toBe(e.id);
  });

  it('photos of a deleted event are not shown with the walk', () => {
    const e = event(START + 100_000);
    addWalkPhoto(env.db, env.ctx, walkId, { ...photo, takenAt: START + 100_000 });
    softDelete(env.db, env.ctx, 'event', e.id);
    expect(listWalkPhotos(env.db, walkId)).toEqual([]);
  });
});

describe('removePhoto and restorePhoto', () => {
  it('hides a photo and brings it back', () => {
    const saved = addPhoto(env.db, env.ctx, { table: 'walk', id: walkId }, photo);
    expect(removePhoto(env.db, env.ctx, saved.id)).toBe(true);
    expect(removePhoto(env.db, env.ctx, saved.id)).toBe(false); // already removed
    expect(listPhotos(env.db, 'walk', walkId)).toEqual([]);
    expect(restorePhoto(env.db, saved.id)).toBe(true);
    expect(restorePhoto(env.db, saved.id)).toBe(false); // not removed any more
    expect(listPhotos(env.db, 'walk', walkId)).toHaveLength(1);
  });

  it('a missing photo is reported, not thrown', () => {
    expect(removePhoto(env.db, env.ctx, 'nope')).toBe(false);
    expect(restorePhoto(env.db, 'nope')).toBe(false);
  });
});

describe('walkAround', () => {
  it('finds the walk a picture was taken in, with a little slack at both ends', () => {
    const end = START + 1800_000;
    expect(walkAround(env.db, dog.id, START + 600_000)?.id).toBe(walkId);
    expect(walkAround(env.db, dog.id, START - WALK_PHOTO_SLACK_MS)?.id).toBe(walkId);
    expect(walkAround(env.db, dog.id, end + WALK_PHOTO_SLACK_MS)?.id).toBe(walkId);
    expect(walkAround(env.db, dog.id, START - WALK_PHOTO_SLACK_MS - 1)).toBeNull();
    expect(walkAround(env.db, dog.id, end + WALK_PHOTO_SLACK_MS + 1)).toBeNull();
  });

  it('takes the walk that started nearest when slack makes two overlap', () => {
    const second = createManualWalk(env.db, env.ctx, {
      dogId: dog.id,
      startedAt: START + 1800_000 + 600_000,
      durationS: 600,
    });
    expect(walkAround(env.db, dog.id, START + 1800_000 + 500_000)?.id).toBe(second.id);
    expect(walkAround(env.db, dog.id, START + 1200_000)?.id).toBe(walkId);
  });

  it('ignores the walks of other dogs and removed walks', () => {
    const other = createDog(env.db, env.ctx, { name: 'Рекс' });
    expect(walkAround(env.db, other.id, START + 600_000)).toBeNull();
    softDelete(env.db, env.ctx, 'walk', walkId);
    expect(walkAround(env.db, dog.id, START + 600_000)).toBeNull();
  });
});

describe('allPhotoUris and walkShots', () => {
  const shot = (name: string, at: number) => ({
    uri: `content://media/${name}`,
    filename: `${name}.jpg`,
    takenAt: at,
  });

  it('knows every stored location, removed pictures included', () => {
    const kept = addPhoto(env.db, env.ctx, { table: 'walk', id: walkId }, { uri: 'content://a' });
    const gone = addPhoto(env.db, env.ctx, { table: 'walk', id: walkId }, { uri: 'content://b' });
    removePhoto(env.db, env.ctx, gone.id);
    expect(allPhotoUris(env.db)).toEqual(new Set(['content://a', 'content://b']));
    expect(kept.uri).toBe('content://a');
  });

  it('keeps pictures taken within the walk and the slack, oldest first', () => {
    const list = [
      shot('late', START + 1900_000),
      shot('inside', START + 600_000),
      shot('before', START - WALK_PHOTO_SLACK_MS),
      shot('too-early', START - WALK_PHOTO_SLACK_MS - 1),
      shot('too-late', START + 1800_000 + WALK_PHOTO_SLACK_MS + 1),
    ];
    expect(walkShots(list, new Set(), START, START + 1800_000).map((s) => s.filename)).toEqual([
      'before.jpg',
      'inside.jpg',
      'late.jpg',
    ]);
  });

  it('leaves out known pictures and screenshots', () => {
    const list = [
      shot('a', START + 1000),
      shot('b', START + 2000),
      { uri: 'content://s', filename: 'Screenshot_20261016.jpg', takenAt: START + 3000 },
      { uri: 'content://r', filename: 'screen-record.jpg', takenAt: START + 4000 },
    ];
    expect(
      walkShots(list, new Set(['content://media/a']), START, START + 60_000).map((s) => s.uri),
    ).toEqual(['content://media/b']);
  });

  it('nothing in, nothing out', () => {
    expect(walkShots([], new Set(), START, START + 1)).toEqual([]);
  });
});
