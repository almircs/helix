// Substituto de node:crypto no celular: AES-256-GCM e scrypt da biblioteca @noble (os mesmos formatos do
// programa de computador, então o backup e as senhas são compatíveis), SHA-256 e números aleatórios seguros.
const { Buffer } = require('buffer');
const { gcm } = require('@noble/ciphers/aes.js');
const { scrypt } = require('@noble/hashes/scrypt.js');
const { sha256 } = require('@noble/hashes/sha2.js');

const randomBytes = (n) => Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(n)));
const toU8 = (x) => (typeof x === 'string' ? new TextEncoder().encode(x) : new Uint8Array(x.buffer ? x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength) : x));

// GCM em partes (update/final) como no Node: junta tudo e cifra no final
function createCipheriv(alg, key, iv) {
  if (alg !== 'aes-256-gcm') throw new Error(`Cifra não suportada: ${alg}`);
  const parts = []; let tag = null;
  return {
    update(data, enc) { parts.push(toU8(typeof data === 'string' && enc ? data : data)); return Buffer.alloc(0); },
    final() { const out = gcm(toU8(key), toU8(iv)).encrypt(concat(parts)); tag = out.slice(out.length - 16); return Buffer.from(out.slice(0, out.length - 16)); },
    getAuthTag() { return Buffer.from(tag); },
  };
}
function createDecipheriv(alg, key, iv) {
  if (alg !== 'aes-256-gcm') throw new Error(`Cifra não suportada: ${alg}`);
  const parts = []; let tag = null;
  return {
    setAuthTag(t) { tag = toU8(t); },
    update(data) { parts.push(toU8(data)); return Buffer.alloc(0); },
    final() { return Buffer.from(gcm(toU8(key), toU8(iv)).decrypt(concat([...parts, tag]))); },
  };
}
function concat(arrs) { const n = arrs.reduce((s, a) => s + a.length, 0); const out = new Uint8Array(n); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; }

function scryptSync(password, salt, keylen, { N = 16384, r = 8, p = 1 } = {}) {
  return Buffer.from(scrypt(toU8(password), toU8(salt), { N, r, p, dkLen: keylen }));
}
function createHash(alg) {
  if (alg !== 'sha256') throw new Error(`Hash não suportado: ${alg}`);
  const parts = [];
  return { update(d) { parts.push(toU8(d)); return this; }, digest(enc) { const h = Buffer.from(sha256(concat(parts))); return enc ? h.toString(enc) : h; } };
}
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }
const randomUUID = () => globalThis.crypto.randomUUID();
function randomInt(min, max) {
  if (max === undefined) { max = min; min = 0; }
  const range = max - min; const lim = Math.floor(0x100000000 / range) * range;
  let x; do { x = globalThis.crypto.getRandomValues(new Uint32Array(1))[0]; } while (x >= lim);
  return min + (x % range);
}

module.exports = { randomBytes, createCipheriv, createDecipheriv, scryptSync, createHash, timingSafeEqual, randomUUID, randomInt };
