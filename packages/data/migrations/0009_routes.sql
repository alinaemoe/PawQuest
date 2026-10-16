-- Маршруты (D-61, D-62, A-27): привычные пешие пути между местами. Хранится только сам путь
-- (упрощённая линия) и имя; проходы считаются из треков, когда нужны.
CREATE TABLE route (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('path','loop')),
  geometry TEXT NOT NULL,                 -- JSON [[lat, lon], ...], около 100 точек
  length_m REAL NOT NULL,
  start_place_id TEXT REFERENCES place(id) ON DELETE SET NULL,
  end_place_id TEXT REFERENCES place(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX idx_route_deleted ON route(deleted_at);
