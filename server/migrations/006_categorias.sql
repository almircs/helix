-- Categorias dos exames (região/órgão: Coração, Rins, Próstata…), criadas e organizadas pela pessoa
CREATE TABLE exam_categories (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name COLLATE NOCASE)
);
ALTER TABLE exams ADD COLUMN category_id INTEGER REFERENCES exam_categories(id) ON DELETE SET NULL;
CREATE INDEX idx_exams_category ON exams(user_id, category_id);
