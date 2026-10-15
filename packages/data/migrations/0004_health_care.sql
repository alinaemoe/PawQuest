-- Health care (docs/17-health-care.md): care records get preventive-treatment and vet-visit
-- details, and routines live in care_plan. Nothing here interprets or recommends anything.
ALTER TABLE care_item ADD COLUMN subtype TEXT;
ALTER TABLE care_item ADD COLUMN product TEXT;
ALTER TABLE care_item ADD COLUMN dose TEXT;
ALTER TABLE care_item ADD COLUMN visit_reason TEXT
  CHECK (visit_reason IN ('checkup', 'vaccination', 'problem', 'followup', 'other'));
ALTER TABLE care_item ADD COLUMN clinic TEXT;
ALTER TABLE care_item ADD COLUMN findings TEXT;
ALTER TABLE care_item ADD COLUMN prescription TEXT;
ALTER TABLE care_item ADD COLUMN cost_minor INTEGER;
ALTER TABLE care_item ADD COLUMN plan_id TEXT;

CREATE TABLE care_plan (
  id TEXT PRIMARY KEY,
  dog_id TEXT NOT NULL REFERENCES dog(id) ON DELETE CASCADE,
  template_key TEXT,
  kind TEXT NOT NULL
    CHECK (kind IN ('vaccination', 'parasite', 'vet_visit', 'grooming', 'medication', 'other')),
  subtype TEXT,
  title TEXT NOT NULL,
  interval_days INTEGER CHECK (interval_days IS NULL OR interval_days > 0),
  interval_months INTEGER CHECK (interval_months IS NULL OR interval_months > 0),
  season_from_month INTEGER CHECK (season_from_month BETWEEN 1 AND 12),
  season_to_month INTEGER CHECK (season_to_month BETWEEN 1 AND 12),
  remind_days_before TEXT NOT NULL DEFAULT '[7,0]',
  default_product TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  CHECK (interval_days IS NOT NULL OR interval_months IS NOT NULL)
);
CREATE INDEX idx_care_plan_dog ON care_plan(dog_id, enabled);
CREATE INDEX idx_care_item_dog_kind ON care_item(dog_id, kind, done_at);
CREATE INDEX idx_care_item_plan ON care_item(plan_id, done_at);
