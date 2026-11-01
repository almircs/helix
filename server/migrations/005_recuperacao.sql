-- Código de recuperação de senha (só o hash; o código aparece uma única vez para a pessoa anotar)
ALTER TABLE users ADD COLUMN recovery_hash TEXT;
ALTER TABLE users ADD COLUMN recovery_created_at TEXT;
