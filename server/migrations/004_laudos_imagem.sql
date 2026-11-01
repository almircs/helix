-- Laudos descritivos (tomografia, ultrassom, ressonância, raio-X…): nome do exame, achados e conclusão.
ALTER TABLE exams ADD COLUMN title TEXT;
ALTER TABLE exams ADD COLUMN findings TEXT;    -- (C) achados / descrição do laudo
ALTER TABLE exams ADD COLUMN conclusion TEXT;  -- (C) impressão / conclusão
