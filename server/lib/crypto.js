// Criptografia de campos sensíveis (AES-256-GCM) e hash de senhas (scrypt).
const crypto = require('node:crypto');
const fs = require('node:fs');
const config = require('../config');

function loadKey() {
  if (process.env.SAUDE_CHAVE) {
    const k = Buffer.from(process.env.SAUDE_CHAVE, 'hex');
    if (k.length !== 32) throw new Error('SAUDE_CHAVE deve ter 64 caracteres hexadecimais');
    return k;
  }
  if (!fs.existsSync(config.keyPath)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(config.keyPath, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    console.log('[cripto] nova chave gerada em', config.keyPath, '— guarde-a junto com os backups.');
  }
  return Buffer.from(fs.readFileSync(config.keyPath, 'utf8').trim(), 'hex');
}
const KEY = loadKey();
const PREFIX = 'enc1:';

function encrypt(value) {
  if (value === null || value === undefined || value === '') return value ?? null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(String(value), 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

function decrypt(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

// Senhas: scrypt com sal aleatório
const SCRYPT = { N: 16384, r: 8, p: 1 };
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(expected, got);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

module.exports = { encrypt, decrypt, hashPassword, verifyPassword, sha256, randomToken };

// Arquivos (documentos): mesmo AES-256-GCM, em binário — [iv 12][tag 16][dados]
function encryptBuffer(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([Buffer.from('HLX1'), iv, c.getAuthTag(), ct]);
}
function decryptBuffer(buf) {
  if (buf.subarray(0, 4).toString() !== 'HLX1') throw new Error('Arquivo de documento inválido');
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(4, 16));
  d.setAuthTag(buf.subarray(16, 32));
  return Buffer.concat([d.update(buf.subarray(32)), d.final()]);
}
module.exports.encryptBuffer = encryptBuffer;
module.exports.decryptBuffer = decryptBuffer;
