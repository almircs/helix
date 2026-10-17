-- Prontuário Pessoal — esquema inicial
-- Campos marcados (C) são gravados criptografados (AES-256-GCM) pela aplicação.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);

-- 1:1 com users
CREATE TABLE profiles (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name          TEXT,
  birth_date         TEXT,
  sex                TEXT,
  weight_kg          REAL,
  height_cm          REAL,
  blood_type         TEXT,
  allergies          TEXT,  -- (C)
  conditions         TEXT,  -- (C)
  emergency_contacts TEXT,  -- (C)
  notes              TEXT,  -- (C)
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE doctors (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  specialty    TEXT,
  crm          TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  is_reference INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,  -- (C)
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE consultations (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,
  time            TEXT,
  specialty       TEXT,
  doctor_id       INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  location        TEXT,
  status          TEXT NOT NULL DEFAULT 'realizada',   -- agendada | realizada | cancelada
  is_return       INTEGER NOT NULL DEFAULT 0,
  previous_id     INTEGER REFERENCES consultations(id) ON DELETE SET NULL, -- retorno de qual consulta
  reason          TEXT,  -- (C)
  symptoms        TEXT,  -- (C)
  diagnoses       TEXT,  -- (C)
  conduct         TEXT,  -- (C)
  prescribed      TEXT,  -- (C)
  recommendations TEXT,  -- (C)
  notes           TEXT,  -- (C)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Catálogo de marcadores (Creatinina, Potássio, Pressão arterial...) por usuário
CREATE TABLE markers (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  unit       TEXT,
  ref_min    REAL,
  ref_max    REAL,
  ref_text   TEXT,
  category   TEXT,
  UNIQUE (user_id, name COLLATE NOCASE)
);

-- Exames solicitados numa consulta (o elo Consulta → Exame)
CREATE TABLE exam_requests (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consultation_id  INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  marker_id        INTEGER REFERENCES markers(id) ON DELETE SET NULL,
  description      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pendente',   -- pendente | realizado | cancelado
  fulfilled_exam_id INTEGER REFERENCES exams(id) ON DELETE SET NULL
);

CREATE TABLE exams (
  id                     INTEGER PRIMARY KEY,
  user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_date        TEXT NOT NULL,
  result_date            TEXT,
  lab                    TEXT,
  exam_type              TEXT,                         -- Sangue, Urina, Imagem...
  requested_by_doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  consultation_id        INTEGER REFERENCES consultations(id) ON DELETE SET NULL,
  reason                 TEXT,  -- (C)
  notes                  TEXT,  -- (C)
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE exam_results (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id    INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  marker_id  INTEGER NOT NULL REFERENCES markers(id) ON DELETE RESTRICT,
  value_num  REAL,
  value_text TEXT,
  unit       TEXT,
  ref_min    REAL,   -- referência do laudo (pode diferir entre laboratórios)
  ref_max    REAL,
  ref_text   TEXT,
  notes      TEXT    -- (C)
);

CREATE TABLE medications (
  id                INTEGER PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  active_ingredient TEXT,
  dosage            TEXT,
  presentation      TEXT,
  schedule          TEXT,
  frequency         TEXT,
  start_date        TEXT,
  end_date          TEXT,
  doctor_id         INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  consultation_id   INTEGER REFERENCES consultations(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'ativo',   -- ativo | suspenso | encerrado
  reason            TEXT,  -- (C)
  notes             TEXT,  -- (C)
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Histórico imutável: cada alteração gera uma nova versão; nada é sobrescrito
CREATE TABLE medication_versions (
  id              INTEGER PRIMARY KEY,
  medication_id   INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  effective_date  TEXT NOT NULL,
  dosage          TEXT,
  schedule        TEXT,
  frequency       TEXT,
  status          TEXT NOT NULL,
  change_reason   TEXT,  -- (C)
  consultation_id INTEGER REFERENCES consultations(id) ON DELETE SET NULL,
  snapshot        TEXT NOT NULL,  -- (C) JSON completo da versão
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (medication_id, version)
);

-- Medicamento ↔ marcadores a acompanhar (relação, nunca causalidade)
CREATE TABLE medication_markers (
  medication_id INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  marker_id     INTEGER NOT NULL REFERENCES markers(id) ON DELETE CASCADE,
  PRIMARY KEY (medication_id, marker_id)
);

CREATE TABLE measurements (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,   -- pressao | fc | peso | glicemia | temperatura | saturacao | outro
  label       TEXT,
  measured_at TEXT NOT NULL,   -- 'YYYY-MM-DD HH:MM'
  value1      REAL NOT NULL,   -- sistólica, ou valor único
  value2      REAL,            -- diastólica
  unit        TEXT,
  notes       TEXT,  -- (C)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE events (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,   -- consulta | exame | retorno | vacina | procedimento | medicamento | receita | outro
  title           TEXT NOT NULL,
  starts_at       TEXT NOT NULL,   -- 'YYYY-MM-DD HH:MM' ou 'YYYY-MM-DD'
  location        TEXT,
  status          TEXT NOT NULL DEFAULT 'agendado',  -- agendado | concluido | cancelado
  remind_minutes  INTEGER,
  consultation_id INTEGER REFERENCES consultations(id) ON DELETE SET NULL,
  exam_id         INTEGER REFERENCES exams(id) ON DELETE SET NULL,
  medication_id   INTEGER REFERENCES medications(id) ON DELETE SET NULL,
  notes           TEXT,  -- (C)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Preparada para o módulo de documentos (etapa 2)
CREATE TABLE documents (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  kind            TEXT,            -- laudo | receita | pedido | relatorio | imagem | outro
  doc_date        TEXT,
  stored_path     TEXT NOT NULL,   -- arquivo criptografado em data/documentos
  mime_type       TEXT,
  size_bytes      INTEGER,
  consultation_id INTEGER REFERENCES consultations(id) ON DELETE SET NULL,
  exam_id         INTEGER REFERENCES exams(id) ON DELETE SET NULL,
  doctor_id       INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  medication_id   INTEGER REFERENCES medications(id) ON DELETE SET NULL,
  notes           TEXT,  -- (C)
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Registro de alterações (quem, quando, o quê; antes/depois criptografados)
CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  at         TEXT NOT NULL DEFAULT (datetime('now')),
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  action     TEXT NOT NULL,   -- criar | alterar | excluir | login | exportar ...
  data       TEXT             -- (C) JSON {antes, depois}
);

CREATE INDEX idx_results_marker   ON exam_results(user_id, marker_id);
CREATE INDEX idx_results_exam     ON exam_results(exam_id);
CREATE INDEX idx_exams_date       ON exams(user_id, collection_date);
CREATE INDEX idx_consult_date     ON consultations(user_id, date);
CREATE INDEX idx_events_start     ON events(user_id, starts_at);
CREATE INDEX idx_meas_type        ON measurements(user_id, type, measured_at);
CREATE INDEX idx_medver_med       ON medication_versions(medication_id);
CREATE INDEX idx_requests_consult ON exam_requests(consultation_id);
CREATE INDEX idx_audit_user       ON audit_log(user_id, at);
