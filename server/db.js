// Banco de dados SQLite embutido no Node (node:sqlite) + migrações versionadas.
// Usa o SQLite nativo do Node (node:sqlite). Se o ambiente não o tiver (algumas versões
// do Electron), usa o better-sqlite3, que tem a mesma interface para o que usamos aqui.
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

function openDatabase(file) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(file);
  } catch (e) {
    if (e.code !== 'ERR_UNKNOWN_BUILTIN_MODULE' && e.code !== 'MODULE_NOT_FOUND' && !/sqlite/i.test(e.message)) throw e;
    const Better = require('better-sqlite3');
    return new Better(file);
  }
}

fs.mkdirSync(config.dataDir, { recursive: true });
const db = openDatabase(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT (datetime(\'now\')))');
  const done = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name));
  const dir = path.join(__dirname, 'migrations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    tx(() => {
      db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    });
    console.log(`[db] migração aplicada: ${file}`);
  }
}

// Transação simples (node:sqlite não tem helper próprio)
let depth = 0;
function tx(fn) {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  finally { depth--; }
}

const all = (sql, ...p) => db.prepare(sql).all(...p).map((r) => ({ ...r }));
const get = (sql, ...p) => { const r = db.prepare(sql).get(...p); return r ? { ...r } : undefined; };
const run = (sql, ...p) => db.prepare(sql).run(...p);

module.exports = { db, migrate, tx, all, get, run };
