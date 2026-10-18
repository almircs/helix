-- Documentos com leitura por IA e configurações por usuário
ALTER TABLE documents ADD COLUMN original_name TEXT;
ALTER TABLE documents ADD COLUMN ai_status TEXT;          -- null | lido | lancado | erro
ALTER TABLE documents ADD COLUMN ai_data TEXT;            -- (C) JSON extraído pela IA
ALTER TABLE documents ADD COLUMN ai_at TEXT;
ALTER TABLE documents ADD COLUMN updated_at TEXT;

CREATE TABLE settings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  value   TEXT,                                        -- (C)
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_docs_user ON documents(user_id, doc_date);
