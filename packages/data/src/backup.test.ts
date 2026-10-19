import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { backupChunks, backupTables, exportBackup, restoreBackup, summarizeBackup } from './backup';
import { createDog, type Dog } from './dogs';
import { createEvent } from './events';
import { csvField, eventsCsv, walkGpx, walksCsv, xmlText } from './export';
import { addWalkPhoto } from './photos';
import { createPlace, setWalkPlace } from './places';
import { appendTrackPoints, finishWalk, startWalk } from './recorder';
import { START, testEnv, type TestEnv } from './test-utils';
import { addWeight } from './weights';

let env: TestEnv;
let dog: Dog;
beforeEach(() => {
  env = testEnv();
  dog = createDog(env.db, env.ctx, { name: 'Фрэнни' });
});
afterEach(() => {
  env.db.close();
});

function fill(): string {
  const place = createPlace(env.db, env.ctx, {
    name: 'Парк, "большой"',
    category: 'park',
    label: 'Парк',
    lat: 55,
    lon: 37,
  });
  const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
  appendTrackPoints(
    env.db,
    walk.id,
    Array.from({ length: 40 }, (_, i) => ({
      ts: START + i * 5000,
      lat: 55 + i * 1e-5,
      lon: 37,
      accuracyM: 5,
      altitudeM: 150 + i * 0.1,
      speedMps: 1.2,
    })),
  );
  finishWalk(env.db, env.ctx, walk.id, START + 200_000);
  setWalkPlace(env.db, env.ctx, walk.id, { placeId: place.id, placeKind: null });
  createEvent(env.db, env.ctx, {
    dogId: dog.id,
    walkId: walk.id,
    typeId: 'dog',
    ts: START + 60_000,
    lat: 55.0001,
    lon: 37,
    note: 'Лай,\nпотом "тихо" & <ок>',
    reaction: 3,
  });
  addWalkPhoto(env.db, env.ctx, walk.id, { uri: 'file:///a.jpg', takenAt: START + 30_000 });
  addWeight(env.db, env.ctx, { dogId: dog.id, weightG: 6200, measuredAt: START });
  return walk.id;
}

const dump = (db: TestEnv['db']): Record<string, unknown[]> =>
  Object.fromEntries(
    backupTables(db).map((t) => [t, db.all(`SELECT * FROM "${t}" ORDER BY rowid`)]),
  );

describe('backup', () => {
  it('everything exported comes back into an empty database exactly', () => {
    fill();
    const text = exportBackup(env.db, START + 1e6);
    const other = testEnv();
    try {
      const summary = restoreBackup(other.db, text);
      expect(summary.rows['track_point']).toBe(40);
      expect(dump(other.db)).toEqual(dump(env.db));
    } finally {
      other.db.close();
    }
  });

  it('is a JSON document in pieces; the derived cache and migrations are not in it', () => {
    fill();
    const pieces = [...backupChunks(env.db, START)];
    expect(pieces.length).toBeGreaterThan(5);
    const doc = JSON.parse(pieces.join('')) as { format: string; tables: Record<string, unknown> };
    expect(doc.format).toBe('pawquest-backup');
    expect(Object.keys(doc.tables)).not.toContain('walk_derived');
    expect(Object.keys(doc.tables)).not.toContain('schema_migrations');
    expect(Object.keys(doc.tables)).toContain('track_point');
  });

  it('a table bigger than one batch is written whole', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(
      env.db,
      walk.id,
      Array.from({ length: 4500 }, (_, i) => ({
        ts: START + i * 1000,
        lat: 55 + i * 1e-6,
        lon: 37,
      })),
    );
    const summary = summarizeBackup(exportBackup(env.db, START));
    expect(summary.rows['track_point']).toBe(4500);
  });

  it('restoring replaces what was there, and a broken or foreign file changes nothing', () => {
    fill();
    const text = exportBackup(env.db, START);
    createDog(env.db, env.ctx, { name: 'Лишняя' });
    // a cache row of a walk that the backup does not have must not block the restore
    const stray = startWalk(env.db, env.ctx, { dogId: dog.id });
    env.db.run(
      "INSERT INTO walk_derived (walk_id, kind, algo_version, fingerprint, status, json, computed_at) VALUES (?, 'dims', 1, 'x', 'ok', '{}', 'x')",
      [stray.id],
    );
    restoreBackup(env.db, text);
    expect(env.db.all('SELECT name FROM dog').map((r) => r['name'])).toEqual(['Фрэнни']);
    const before = dump(env.db);
    expect(() => restoreBackup(env.db, 'not json')).toThrow(/not a PawQuest backup/);
    expect(() => restoreBackup(env.db, '{"format":"other"}')).toThrow(/not a PawQuest backup/);
    expect(() =>
      restoreBackup(env.db, '{"format":"pawquest-backup","version":9,"tables":{}}'),
    ).toThrow(/version/);
    expect(() => restoreBackup(env.db, '{"format":"pawquest-backup","version":1}')).toThrow(
      /no tables/,
    );
    expect(() =>
      restoreBackup(
        env.db,
        '{"format":"pawquest-backup","version":1,"schemaVersion":999,"tables":{}}',
      ),
    ).toThrow(/newer version/);
    expect(dump(env.db)).toEqual(before);
  });

  it('rows that point to nothing roll the whole restore back', () => {
    fill();
    const doc = JSON.parse(exportBackup(env.db, START)) as {
      tables: Record<string, { columns: string[]; rows: unknown[][] }>;
    };
    const walkDog = doc.tables['walk_dog'];
    if (walkDog === undefined) {
      throw new Error('no walk_dog');
    }
    walkDog.rows.push(['no-such-walk', dog.id]);
    const before = dump(env.db);
    expect(() => restoreBackup(env.db, JSON.stringify(doc))).toThrow(/point to rows/);
    expect(dump(env.db)).toEqual(before);
    expect(env.db.all('PRAGMA foreign_keys')[0]?.['foreign_keys']).toBe(1);
  });

  it('unknown tables and columns in a backup are skipped, missing ones take their defaults', () => {
    fill();
    const doc = JSON.parse(exportBackup(env.db, START)) as {
      tables: Record<string, { columns: string[]; rows: unknown[][] }>;
    };
    doc.tables['from_the_future'] = { columns: ['a'], rows: [[1]] };
    doc.tables['weight_log'] = { columns: ['no_such_column'], rows: [[1]] };
    const dogTable = doc.tables['dog'];
    if (dogTable === undefined) {
      throw new Error('no dog');
    }
    dogTable.columns.push('shoe_size');
    dogTable.rows = dogTable.rows.map((r) => [...r, 42]);
    const other = testEnv();
    try {
      expect(restoreBackup(other.db, JSON.stringify(doc)).rows['dog']).toBe(1);
      expect(other.db.all('SELECT name FROM dog')[0]?.['name']).toBe('Фрэнни');
    } finally {
      other.db.close();
    }
  });
});

describe('CSV', () => {
  it('quotes what has to be quoted', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField(null)).toBe('');
    expect(csvField(3.5)).toBe('3.5');
  });

  it('walks: a header and a line for each finished walk, the place name in quotes', () => {
    fill();
    const csv = walksCsv(env.db, dog.id);
    expect(csv.startsWith('﻿walk_id,started_at')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(',gps,Парк большой,');
    expect(lines[1]).toContain(',gps,');
  });

  it("events: the type in the owner's language, the note with a line break kept in quotes", () => {
    fill();
    const csv = eventsCsv(env.db, dog.id, (id) => `Тип ${id}`);
    expect(csv).toContain('Тип dog');
    expect(csv).toContain('"Лай,\nпотом ""тихо"" & <ок>"');
    expect(csv.split('\r\n')[0]).toContain('recovery_s');
  });
});

describe('GPX', () => {
  it('a track with elevation and time, a waypoint for the event, text escaped', () => {
    const id = fill();
    const gpx = walkGpx(env.db, id, (t) => `Событие <${t}>`);
    expect(gpx).not.toBeNull();
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx?.match(/<trkpt /g)).toHaveLength(40);
    expect(gpx).toContain('<ele>150</ele>');
    expect(gpx).toContain('<wpt lat="55.0001"');
    expect(gpx).toContain('<name>Событие &lt;dog&gt;</name>');
    expect(gpx).toContain('<desc>Лай,\nпотом &quot;тихо&quot; &amp; &lt;ок&gt;</desc>');
    expect(gpx?.match(/<trkseg>/g)).toHaveLength(1);
  });

  it('a pause or a long gap starts a new segment; a walk that is not there gives nothing', () => {
    const walk = startWalk(env.db, env.ctx, { dogId: dog.id });
    appendTrackPoints(env.db, walk.id, [
      { ts: START, lat: 55, lon: 37 },
      { ts: START + 5000, lat: 55.0001, lon: 37 },
      { ts: START + 600_000, lat: 55.0002, lon: 37 },
      { ts: START + 605_000, lat: 55.0003, lon: 37 },
    ]);
    finishWalk(env.db, env.ctx, walk.id, START + 700_000);
    expect(walkGpx(env.db, walk.id, String)?.match(/<trkseg>/g)).toHaveLength(2);
    env.db.run(
      "INSERT INTO walk_segment (id, walk_id, kind, started_at, ended_at) VALUES ('p1', ?, 'paused', ?, ?)",
      [walk.id, new Date(START + 1000).toISOString(), new Date(START + 4000).toISOString()],
    );
    expect(walkGpx(env.db, walk.id, String)?.match(/<trkseg>/g)).toHaveLength(3);
    env.db.run(
      "INSERT INTO walk_segment (id, walk_id, kind, started_at, ended_at) VALUES ('p2', ?, 'paused', ?, NULL)",
      [walk.id, new Date(START + 650_000).toISOString()],
    );
    createEvent(env.db, env.ctx, {
      dogId: dog.id,
      walkId: walk.id,
      typeId: 'hard',
      ts: START + 2000,
      lat: 55,
      lon: 37,
    });
    env.db.run('UPDATE walk SET title = ? WHERE id = ?', ['Утро & парк', walk.id]);
    const gpx = walkGpx(env.db, walk.id, String) ?? '';
    expect(gpx).toContain('<name>Утро &amp; парк</name>');
    expect(gpx).toContain('<wpt lat="55"');
    expect(gpx).not.toContain('<desc>');
    expect(walkGpx(env.db, 'nope', String)).toBeNull();
    expect(xmlText('a&b<c>"d"')).toBe('a&amp;b&lt;c&gt;&quot;d&quot;');
  });
});
