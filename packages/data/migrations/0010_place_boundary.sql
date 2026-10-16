-- Контур места (D-62, spike S8): настоящая граница парка или леса вместо круга. Хранится кольцо
-- вершин, откуда оно взято (карта или нарисовано владельцем). Радиус и центр места остаются:
-- они считаются по контуру и нужны старым участкам кода как запасной вариант.
ALTER TABLE place ADD COLUMN boundary TEXT;
ALTER TABLE place ADD COLUMN boundary_source TEXT CHECK (boundary_source IN ('osm','drawn'));
