-- Проекты обучения (флагман: «Фризби»), см. 15-learning-projects-frisbee.md
CREATE TABLE project (
  id TEXT PRIMARY KEY,
  dog_id TEXT NOT NULL REFERENCES dog(id) ON DELETE CASCADE,
  skill_id TEXT REFERENCES skill(id) ON DELETE SET NULL,
  program_key TEXT,                         -- 'frisbee_from_zero' | NULL для пользовательских
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','done')),
  started_at TEXT NOT NULL, finished_at TEXT,
  current_stage_id TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE project_stage (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL, criterion TEXT, hint TEXT,
  params TEXT,                              -- JSON: distance/height/…
  achieved_at TEXT,
  UNIQUE (project_id, position)
);
ALTER TABLE training_session ADD COLUMN project_id TEXT REFERENCES project(id) ON DELETE SET NULL;
ALTER TABLE training_session ADD COLUMN engagement INTEGER CHECK (engagement BETWEEN 1 AND 5);
ALTER TABLE training_attempt ADD COLUMN meta TEXT;       -- JSON: {height_cm, distance_m, surface, disc}
CREATE INDEX idx_session_project ON training_session(project_id, started_at);

-- Питание и вкусняшки, см. 16-nutrition-weight.md
CREATE TABLE food_item (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  grp TEXT NOT NULL CHECK (grp IN ('dried','raw','meat','commercial','main','custom')),
  form TEXT CHECK (form IN ('dry','raw','cooked','ready')),
  unit TEXT NOT NULL DEFAULT 'g' CHECK (unit IN ('g','piece')),
  kcal_per_100g REAL,
  avg_piece_g REAL,
  kcal_source TEXT CHECK (kcal_source IN ('reference','package','user')),
  notes TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE food_log (
  id TEXT PRIMARY KEY,
  dog_id TEXT NOT NULL REFERENCES dog(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES food_item(id),
  ts TEXT NOT NULL, tz_offset_min INTEGER NOT NULL DEFAULT 0,
  amount_g REAL, pieces REAL,
  kcal_est REAL,                            -- снимок на момент записи (A-28)
  context TEXT CHECK (context IN ('walk','training','home','other')),
  walk_id TEXT REFERENCES walk(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES training_session(id) ON DELETE SET NULL,
  note TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX idx_foodlog_dog_ts ON food_log(dog_id, ts);

-- Вес: уточнение условий измерения
ALTER TABLE weight_log ADD COLUMN conditions TEXT;     -- 'morning' | 'before_meal' | 'after_walk' | 'other'

-- Мягкие карточки «актуальность данных» (G-22): показ/скрытие
CREATE TABLE prompt_state (
  key TEXT PRIMARY KEY,                     -- 'weight' | 'profile' | 'care_due:<id>' | 'photo_month'
  last_shown_at TEXT, hidden_until TEXT
);

-- День отдыха для серии (A-21)
CREATE TABLE rest_day (day TEXT PRIMARY KEY, created_at TEXT NOT NULL);

-- Типы событий: добавляются как данные (child, treat, throw): см. 04-walks.md §4.3
