// Login, sessões e controle de acesso.
const { get, run } = require('../db');
const config = require('../config');
const { hashPassword, verifyPassword, sha256, randomToken } = require('./crypto');
const { HttpError } = require('./http');
const audit = require('./audit');

const COOKIE = 'sid';
const attempts = new Map(); // limitação de tentativas por e-mail+IP

function checkRate(key) {
  const now = Date.now();
  const a = attempts.get(key) || { n: 0, until: 0, first: now };
  if (a.until > now) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
  return a;
}
function failRate(key, a) {
  a.n++;
  if (a.n >= 5) { a.until = Date.now() + 5 * 60 * 1000; a.n = 0; }
  attempts.set(key, a);
}

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, 'A senha deve ter letras e números.');
}

function createSession(ctx, userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + config.sessionHours * 3600e3).toISOString();
  run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, expires);
  run("DELETE FROM sessions WHERE expires_at < datetime('now')");
  ctx.setCookie(COOKIE, token, { maxAge: config.sessionHours * 3600, secure: config.secureCookies });
}

// Usuário: um nome curto (ex.: carlos) ou um e-mail, sem espaços
function validateUsername(u) {
  u = String(u || '').trim();
  if (!/^[^\s]{3,60}$/.test(u)) throw new HttpError(400, 'Escolha um usuário com 3 a 60 caracteres, sem espaços (pode ser um nome curto ou um e-mail).');
  return u;
}

function register(ctx) {
  if (!config.allowRegistration) throw new HttpError(403, 'Cadastro desativado neste servidor.');
  const { password, full_name } = ctx.body;
  const email = validateUsername(ctx.body.email);
  validatePassword(password);
  if (get('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'Este usuário já existe. Escolha outro.');
  const r = run('INSERT INTO users (email, password_hash) VALUES (?, ?)', email, hashPassword(password));
  const userId = Number(r.lastInsertRowid);
  run('INSERT INTO profiles (user_id, full_name) VALUES (?, ?)', userId, full_name || null);
  audit.log(userId, 'usuario', userId, 'criar', null, { email });
  createSession(ctx, userId);
  return { ok: true };
}

function login(ctx) {
  const { email, password } = ctx.body;
  const key = `${String(email).toLowerCase()}|${ctx.req.socket.remoteAddress}`;
  const a = checkRate(key);
  const user = email && get('SELECT * FROM users WHERE email = ? AND password_set = 1', String(email).trim());
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) {
    failRate(key, a);
    throw new HttpError(401, 'Usuário ou senha incorretos.');
  }
  attempts.delete(key);
  createSession(ctx, user.id);
  audit.log(user.id, 'sessao', null, 'login', null, null);
  return { ok: true };
}

function logout(ctx) {
  const t = ctx.cookies[COOKIE];
  if (t) run('DELETE FROM sessions WHERE token_hash = ?', sha256(t));
  ctx.setCookie(COOKIE, '', { maxAge: 0, secure: config.secureCookies });
  return { ok: true };
}

// Situação do acesso, sem dados pessoais: se o login está ligado, se os dados já existentes
// ainda esperam o primeiro acesso (criar usuário e senha) e se já há alguma conta
function state() {
  return {
    login: config.requireLogin,
    setup: config.requireLogin && !!get('SELECT 1 FROM users WHERE password_set = 0 LIMIT 1'),
    has_users: !!get('SELECT 1 FROM users LIMIT 1'),
  };
}

// Primeiro acesso: os dados usados até agora sem senha passam a ser da conta criada aqui
function setup(ctx) {
  const u = get('SELECT id FROM users WHERE password_set = 0 ORDER BY id LIMIT 1');
  if (!u) throw new HttpError(409, 'O primeiro acesso já foi feito. Entre com seu usuário e senha.');
  const email = validateUsername(ctx.body.email);
  validatePassword(ctx.body.password);
  if (get('SELECT id FROM users WHERE email = ? AND id != ?', email, u.id)) throw new HttpError(409, 'Este usuário já existe. Escolha outro.');
  run('UPDATE users SET email = ?, password_hash = ?, password_set = 1 WHERE id = ?', email, hashPassword(ctx.body.password), u.id);
  const name = String(ctx.body.full_name || '').trim();
  if (name) {
    if (get('SELECT 1 FROM profiles WHERE user_id = ?', u.id)) run('UPDATE profiles SET full_name = ? WHERE user_id = ?', name, u.id);
    else run('INSERT INTO profiles (user_id, full_name) VALUES (?, ?)', u.id, name);
  }
  audit.log(u.id, 'usuario', u.id, 'primeiro acesso', null, { email });
  createSession(ctx, u.id);
  return { ok: true };
}

// Perfil local usado quando o login está desligado: o primeiro usuário do banco (criado se não existir)
function localUser() {
  let u = get('SELECT id, email FROM users ORDER BY id LIMIT 1');
  if (!u) {
    const r = run('INSERT INTO users (email, password_hash, password_set) VALUES (?, ?, 0)', 'local@prontuario', hashPassword(randomToken()));
    const id = Number(r.lastInsertRowid);
    run('INSERT INTO profiles (user_id) VALUES (?)', id);
    audit.log(id, 'usuario', id, 'criar', null, { modo: 'sem login' });
    u = { id, email: 'local@prontuario' };
  }
  return u;
}

function requireAuth(ctx) {
  const t = ctx.cookies[COOKIE];
  if (!config.requireLogin) {
    const s = t && get('SELECT s.user_id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE token_hash = ?', sha256(t));
    const u = s ? { id: s.user_id, email: s.email } : localUser();
    ctx.user = { id: u.id, email: u.email, local: !s };
    return;
  }
  if (!t) throw new HttpError(401, 'Faça login para continuar.');
  const s = get(`SELECT s.*, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE token_hash = ?`, sha256(t));
  const now = Date.now();
  if (!s || new Date(s.expires_at).getTime() < now ||
      now - new Date(s.last_seen + 'Z').getTime() > config.idleMinutes * 60e3) {
    if (s) run('DELETE FROM sessions WHERE token_hash = ?', s.token_hash);
    throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
  }
  run("UPDATE sessions SET last_seen = datetime('now') WHERE token_hash = ?", s.token_hash);
  ctx.user = { id: s.user_id, email: s.email };
}

function changePassword(ctx) {
  const { current, password } = ctx.body;
  const user = get('SELECT * FROM users WHERE id = ?', ctx.user.id);
  if (!verifyPassword(String(current || ''), user.password_hash)) throw new HttpError(401, 'Senha atual incorreta.');
  validatePassword(password);
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), user.id);
  run('DELETE FROM sessions WHERE user_id = ?', user.id);
  createSession(ctx, user.id);
  audit.log(user.id, 'usuario', user.id, 'alterar senha', null, null);
  return { ok: true };
}

module.exports = { register, login, logout, requireAuth, changePassword, state, setup, requireLogin: () => config.requireLogin, verifyPasswordOf: (id, pw) => {
  const u = get('SELECT password_hash FROM users WHERE id = ?', id);
  return u && verifyPassword(String(pw || ''), u.password_hash);
} };
