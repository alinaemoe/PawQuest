-- Слой производных (docs/21, D-63): то, что считается из фактов и может быть пересчитано. Одна
-- строка на прогулку и вид; algo_version говорит, каким правилом посчитано, fingerprint, из каких
-- данных (трек, места, погода, события). Устаревшее пересчитывается, ошибка не теряет остальное.
CREATE TABLE walk_derived (
  walk_id TEXT NOT NULL REFERENCES walk(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('structure','dims')),
  algo_version INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok','error')),
  json TEXT,
  error TEXT,
  computed_at TEXT NOT NULL,
  PRIMARY KEY (walk_id, kind)
);
CREATE INDEX idx_derived_status ON walk_derived(kind, status);
