import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

// Drizzle mirror of the tables the code queries. The SQL files in migrations/ are the source of
// truth; schema.test.ts compares every table here with the migrated database column by column.

export const dog = sqliteTable('dog', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  photoUri: text('photo_uri'),
  birthDate: text('birth_date'),
  approxAgeMonths: integer('approx_age_months'),
  sex: text('sex', { enum: ['female', 'male', 'unknown'] }),
  size: text('size', { enum: ['small', 'medium', 'large', 'giant'] }),
  breed: text('breed'),
  notes: text('notes'),
  archived: integer('archived').notNull().default(0),
  isDemo: integer('is_demo').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const place = sqliteTable(
  'place',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    category: text('category', {
      enum: [
        'park',
        'meadow',
        'yard',
        'district',
        'forest',
        'waterfront',
        'dog_area',
        'quiet_street',
        'busy_street',
        'vet',
        'other',
        'square',
        'alley',
        'shop',
        'grooming',
        'home',
        'guests',
      ],
    })
      .notNull()
      .default('other'),
    parentId: text('parent_id').references((): AnySQLiteColumn => place.id, {
      onDelete: 'set null',
    }),
    nameNorm: text('name_norm').notNull(),
    lat: real('lat').notNull(),
    lon: real('lon').notNull(),
    radiusM: real('radius_m').notNull().default(60),
    geohash8: text('geohash8').notNull(),
    color: text('color'),
    icon: text('icon'),
    notes: text('notes'),
    isDemo: integer('is_demo').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('idx_place_geohash').on(t.geohash8), index('idx_place_name_norm').on(t.nameNorm)],
);

export const walk = sqliteTable(
  'walk',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    status: text('status', { enum: ['active', 'paused', 'completed', 'discarded'] }).notNull(),
    mode: text('mode', { enum: ['gps', 'no_gps', 'manual', 'imported'] })
      .notNull()
      .default('gps'),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at'),
    tzOffsetMin: integer('tz_offset_min').notNull().default(0),
    durationS: integer('duration_s'),
    movingS: integer('moving_s'),
    pausedS: integer('paused_s'),
    distanceM: real('distance_m'),
    placeId: text('place_id').references(() => place.id, { onDelete: 'set null' }),
    placeKind: text('place_kind'),
    mood: integer('mood'),
    distraction: integer('distraction'),
    notes: text('notes'),
    summaryPending: integer('summary_pending').notNull().default(0),
    isDemo: integer('is_demo').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
    rideS: integer('ride_s').notNull().default(0),
  },
  (t) => [
    index('idx_walk_started').on(t.startedAt),
    index('idx_walk_place').on(t.placeId),
    index('idx_walk_status').on(t.status),
  ],
);

export const trackPoint = sqliteTable(
  'track_point',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    walkId: text('walk_id')
      .notNull()
      .references(() => walk.id, { onDelete: 'cascade' }),
    ts: text('ts').notNull(),
    lat: real('lat').notNull(),
    lon: real('lon').notNull(),
    accuracyM: real('accuracy_m'),
    altitudeM: real('altitude_m'),
    speedMps: real('speed_mps'),
    excluded: integer('excluded').notNull().default(0),
  },
  (t) => [index('idx_track_walk_ts').on(t.walkId, t.ts)],
);

export const SCHEMA_TABLES = { dog, place, walk, trackPoint } as const;
