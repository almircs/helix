// "Disco" do Helyx no celular: arquivos guardados na memória e gravados no IndexedDB do aparelho.
// Implementa só o que o servidor usa (existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync…).
const { Buffer } = require('buffer');

const files = new Map();   // caminho → Uint8Array
const dirty = new Set();   // caminhos alterados desde a última gravação
const removed = new Set();
const norm = (p) => ('/' + String(p).replace(/\\/g, '/')).replace(/\/+/g, '/').replace(/\/$/, '') || '/';

// ---------- IndexedDB
const DB = 'helyx-dados'; const STORE = 'arquivos';
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function load() {
  const db = await idb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly'); const st = tx.objectStore(STORE);
    const req = st.openCursor();
    req.onsuccess = () => { const c = req.result; if (c) { files.set(c.key, new Uint8Array(c.value)); c.continue(); } };
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function flush() {
  if (!dirty.size && !removed.size) return;
  const db = await idb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); const st = tx.objectStore(STORE);
    for (const p of removed) st.delete(p);
    for (const p of dirty) if (files.has(p)) st.put(files.get(p), p);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  dirty.clear(); removed.clear(); db.close();
}

// ---------- API no estilo node:fs (síncrona, na memória)
const toBytes = (data, enc) => (typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data));
function writeFileSync(p, data) { const k = norm(p); files.set(k, toBytes(data)); dirty.add(k); removed.delete(k); }
function readFileSync(p, opts) {
  const k = norm(p);
  if (!files.has(k)) { const e = new Error(`ENOENT: arquivo não encontrado: ${k}`); e.code = 'ENOENT'; throw e; }
  const enc = typeof opts === 'string' ? opts : opts?.encoding;
  const b = files.get(k);
  return enc ? new TextDecoder().decode(b) : Buffer.from(b);
}
const isDir = (k) => { const pre = k === '/' ? '/' : k + '/'; for (const f of files.keys()) if (f.startsWith(pre)) return true; return false; };
const existsSync = (p) => { const k = norm(p); return files.has(k) || isDir(k); };
function rmSync(p) {
  const k = norm(p); const pre = k + '/';
  for (const f of [...files.keys()]) if (f === k || f.startsWith(pre)) { files.delete(f); dirty.delete(f); removed.add(f); }
}
function readdirSync(p, opts) {
  const pre = norm(p) + '/'; const names = new Map();
  for (const f of files.keys()) if (f.startsWith(pre)) { const rest = f.slice(pre.length); const name = rest.split('/')[0]; names.set(name, rest.includes('/')); }
  if (opts?.withFileTypes) return [...names].map(([name, dir]) => ({ name, isDirectory: () => dir, isFile: () => !dir }));
  return [...names.keys()];
}
function statSync(p) { const k = norm(p); return { size: files.get(k)?.length || 0, isFile: () => files.has(k), isDirectory: () => isDir(k) }; }
function copyFileSync(a, b) { writeFileSync(b, files.get(norm(a)) || new Uint8Array()); }
const mkdirSync = () => {};
const appendFileSync = (p, s) => writeFileSync(p, Buffer.concat([files.has(norm(p)) ? Buffer.from(files.get(norm(p))) : Buffer.alloc(0), Buffer.from(String(s))]));

module.exports = { load, flush, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, statSync, copyFileSync, mkdirSync, appendFileSync, _files: files };
