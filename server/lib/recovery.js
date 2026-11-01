// Recuperação de senha sem internet (nada sai do computador):
// 1) Código de recuperação: mostrado uma única vez ao criar a conta ou definir a senha; guardado só como hash.
// 2) Recuperar pelo computador: um código temporário é gravado num arquivo dentro da pasta de dados do
//    Helyx. Quem consegue abrir essa pasta tem acesso ao computador — o mesmo nível de acesso que já dá
//    acesso ao banco e à chave de criptografia.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../config');
const { get, run } = require('../db');
const { hashPassword, verifyPassword } = require('./crypto');
const { HttpError } = require('./http');
const audit = require('./audit');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I/L, que se confundem
const randomCode = (len) => Array.from({ length: len }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
const group = (s) => s.match(/.{1,4}/g).join('-');
const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const FILE = () => path.join(config.dataDir, 'RECUPERAR-SENHA.txt');
const pending = new Map(); // userId → { hash, expires, tries }
const MINUTES = 15;

// Novo código de recuperação (o anterior deixa de valer). Devolve o código para mostrar uma única vez.
function newRecoveryCode(userId) {
  const code = randomCode(16);
  run("UPDATE users SET recovery_hash = ?, recovery_created_at = datetime('now') WHERE id = ?", hashPassword(code), userId);
  audit.log(userId, 'usuario', userId, 'novo código de recuperação', null, null);
  return group(code);
}

function findUser(username) {
  const u = get('SELECT * FROM users WHERE email = ? AND password_set = 1', String(username || '').trim());
  if (!u) throw new HttpError(404, 'Usuário não encontrado. Confira como ele foi escrito.');
  return u;
}

function setNewPassword(userId, password, how) {
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), userId);
  run('DELETE FROM sessions WHERE user_id = ?', userId); // encerra acessos abertos com a senha antiga
  audit.log(userId, 'usuario', userId, 'senha redefinida', null, { como: how });
}

// 1) Com o código de recuperação
function byCode(username, code, password, validatePassword) {
  const u = findUser(username);
  validatePassword(password);
  if (!u.recovery_hash || !verifyPassword(clean(code), u.recovery_hash)) throw new HttpError(401, 'Código de recuperação incorreto.');
  setNewPassword(u.id, password, 'código de recuperação');
  return u.id;
}

// 2) Pelo computador: grava o código temporário num arquivo da pasta de dados
function startComputer(username) {
  const u = findUser(username);
  const code = randomCode(8);
  pending.set(u.id, { hash: hashPassword(code), expires: Date.now() + MINUTES * 60e3, tries: 0 });
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(FILE(), [
    'Helyx — recuperação de senha', '',
    `Usuário: ${u.email}`, `Código: ${group(code)}`, '',
    `Digite este código na tela "Esqueci minha senha" do Helyx em até ${MINUTES} minutos.`,
    'Se você não pediu para recuperar a senha, apague este arquivo.', '',
  ].join('\r\n'), { mode: 0o600 });
  audit.log(u.id, 'usuario', u.id, 'pedido de recuperação pelo computador', null, null);
  return { file: FILE(), folder: config.dataDir, minutes: MINUTES };
}

function finishComputer(username, code, password, validatePassword) {
  const u = findUser(username);
  const p = pending.get(u.id);
  if (!p || p.expires < Date.now()) { pending.delete(u.id); throw new HttpError(410, 'O código expirou. Peça um novo.'); }
  validatePassword(password);
  if (!verifyPassword(clean(code), p.hash)) {
    if (++p.tries >= 5) { pending.delete(u.id); removeFile(); throw new HttpError(429, 'Muitas tentativas. Peça um novo código.'); }
    throw new HttpError(401, 'Código incorreto. Confira o arquivo RECUPERAR-SENHA.txt.');
  }
  pending.delete(u.id); removeFile();
  setNewPassword(u.id, password, 'pelo computador');
  return u.id;
}

function removeFile() { try { fs.rmSync(FILE(), { force: true }); } catch { /* */ } }

// Abre a pasta de dados no programa instalado (o servidor roda dentro do Electron)
function openFolder() {
  if (!process.versions.electron) return { opened: false, folder: config.dataDir };
  try { require('electron').shell.openPath(config.dataDir); return { opened: true, folder: config.dataDir }; } catch { return { opened: false, folder: config.dataDir }; }
}

module.exports = { newRecoveryCode, byCode, startComputer, finishComputer, openFolder, FILE };
