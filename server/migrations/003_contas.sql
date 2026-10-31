-- Contas com senha: o perfil usado até agora sem login (o primeiro usuário) ainda não tem
-- senha escolhida pela pessoa. No primeiro acesso ela define usuário e senha e mantém os dados.
ALTER TABLE users ADD COLUMN password_set INTEGER NOT NULL DEFAULT 1;
UPDATE users SET password_set = 0 WHERE id = (SELECT MIN(id) FROM users);
