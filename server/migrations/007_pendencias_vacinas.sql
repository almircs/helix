-- Pendências: as automáticas (pedido de exame, exame fora da referência, receita, vacina) são calculadas;
-- aqui ficam a ação em andamento, o status e o prazo que a pessoa definiu para elas, e as pendências manuais.
CREATE TABLE pendencias (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source     TEXT,                  -- 'pedido:12', 'fora:3', 'receita:5', 'vacina:2'; NULL = criada pela pessoa
  title      TEXT,                  -- (C) só nas manuais
  action     TEXT,                  -- (C) o que está sendo feito
  status     TEXT NOT NULL DEFAULT 'pendente',   -- pendente | em_andamento | concluida | cancelada
  due_date   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, source)
);

-- Vacinas tomadas e próximas doses
CREATE TABLE vaccines (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  dose         TEXT,               -- 1ª dose, 2ª dose, reforço, dose única, anual…
  applied_date TEXT,
  next_date    TEXT,               -- próxima dose / reforço
  lot          TEXT,
  place        TEXT,               -- posto, clínica, farmácia
  notes        TEXT,               -- (C)
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_vaccines_user ON vaccines(user_id, name);
