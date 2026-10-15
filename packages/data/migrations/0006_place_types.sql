-- pq:foreign-keys-off
-- New place types (square, alley, shop, grooming, home, guests; D-62). The type list is a CHECK
-- constraint, which SQLite cannot alter, so the table is rebuilt the documented way: create the new
-- table, copy every row, drop the old one, rename. Foreign keys are switched off for the duration
-- by the migration runner (the marker above); otherwise dropping `place` would run the
-- ON DELETE SET NULL of walks, events and sessions and wipe their place links.
CREATE TABLE place_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('park','meadow','yard','district','forest','waterfront','dog_area','quiet_street','busy_street','vet','other','square','alley','shop','grooming','home','guests')),
  parent_id TEXT REFERENCES place(id) ON DELETE SET NULL,   -- район/зона (необязательно)
  name_norm TEXT NOT NULL,         -- нормализованное имя для поиска дубликатов (A-24)
  lat REAL NOT NULL, lon REAL NOT NULL,
  radius_m REAL NOT NULL DEFAULT 60,
  geohash8 TEXT NOT NULL,
  color TEXT, icon TEXT, notes TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

INSERT INTO place_new
  (id, name, category, parent_id, name_norm, lat, lon, radius_m, geohash8, color, icon, notes, is_demo, created_at, updated_at, deleted_at)
SELECT
  id, name, category, parent_id, name_norm, lat, lon, radius_m, geohash8, color, icon, notes, is_demo, created_at, updated_at, deleted_at
FROM place;

DROP TABLE place;
ALTER TABLE place_new RENAME TO place;

CREATE INDEX idx_place_geohash ON place(geohash8);
CREATE INDEX idx_place_name_norm ON place(name_norm);
