// Cópias de segurança: uma automática por dia (guarda as últimas 30) e cópia manual pela tela.
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const { db } = require('../db');

const dir = () => path.join(config.dataDir, 'backups');

function backupNow(label) {
  const name = label || new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
  const target = path.join(dir(), name);
  fs.mkdirSync(target, { recursive: true });
  const file = path.join(target, 'saude.db');
  if (fs.existsSync(file)) fs.rmSync(file);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  if (fs.existsSync(config.keyPath)) fs.copyFileSync(config.keyPath, path.join(target, 'chave.key'));
  return target;
}

function list() {
  if (!fs.existsSync(dir())) return [];
  return fs.readdirSync(dir()).filter((n) => fs.existsSync(path.join(dir(), n, 'saude.db'))).sort().reverse();
}

function autoBackup(keep = 30) {
  const today = 'auto-' + new Date().toISOString().slice(0, 10);
  const hasData = db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0;
  if (!hasData || list().includes(today)) return null;
  const made = backupNow(today);
  const autos = list().filter((n) => n.startsWith('auto-'));
  for (const old of autos.slice(keep)) fs.rmSync(path.join(dir(), old), { recursive: true, force: true });
  return made;
}

module.exports = { backupNow, autoBackup, list, dir };
