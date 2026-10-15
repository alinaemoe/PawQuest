-- Built-in event types (docs/04-walks.md, "События — типы по умолчанию"). Labels come from i18n
-- (`label_key`); users add their own types as ordinary rows with `builtin = 0`.
INSERT INTO event_type
  (id, label_key, kind, color, icon, starts_recovery_timer, slot, sort_order, builtin, archived, created_at, updated_at)
VALUES
  ('dog',      'event.dog',      'trigger', 'dog',    'dog',     0, 0,    0, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('person',   'event.person',   'trigger', 'person', 'person',  0, 1,    1, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('child',    'event.child',    'trigger', 'child',  'child',   0, 2,    2, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('animal',   'event.animal',   'trigger', 'animal', 'animal',  0, 3,    3, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('success',  'event.success',  'outcome', 'ok',     'star',    0, 4,    4, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('hard',     'event.hard',     'outcome', 'hard',   'diamond', 1, 5,    5, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('exercise', 'event.exercise', 'action',  'ex',     'square',  0, NULL, 6, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('bike',     'event.bike',     'trigger', 'muted',  'bike',    0, NULL, 7, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('noise',    'event.noise',    'trigger', 'muted',  'noise',   0, NULL, 8, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('cat',      'event.cat',      'trigger', 'muted',  'animal',  0, NULL, 9, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('pickup',   'event.pickup',   'action',  'muted',  'pickup',  0, NULL, 10, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('mark',     'event.mark',     'physio',  'muted',  'drop',    0, NULL, 11, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('toilet',   'event.toilet',   'physio',  'muted',  'drop',    0, NULL, 12, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('play',     'event.play',     'action',  'muted',  'disc',    0, NULL, 13, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('note',     'event.note',     'note',    'muted',  'note',    0, NULL, 14, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('treat',    'event.treat',    'action',  'muted',  'cookie',  0, NULL, 15, 1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
