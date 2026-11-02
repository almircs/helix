-- Modo sênior: cada dose do dia anotada como tomada ou não tomada (o horário vem do medicamento).
CREATE TABLE medication_doses (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medication_id INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,          -- dia da dose (YYYY-MM-DD)
  time          TEXT NOT NULL,          -- horário previsto (HH:MM)
  status        TEXT NOT NULL,          -- tomado | pulado
  at            TEXT NOT NULL,          -- quando foi anotado (YYYY-MM-DD HH:MM, hora local)
  UNIQUE (user_id, medication_id, date, time)
);
CREATE INDEX idx_doses_user_date ON medication_doses(user_id, date);
