// Cópias de segurança no celular: o banco inteiro guardado no armazenamento do aparelho (sem VACUUM INTO,
// que grava direto em disco). Guarda só as últimas 3, porque o espaço do celular é menor; o backup que vale
// de verdade é o arquivo .helyx salvo pela pessoa (Configurações → Backup).
const path = require('path');
const fs = require('fs');
const config = require('../../server/config');
const { db } = require('../../server/db');

const KEEP = 3;
const dir = () => path.join(config.dataDir, 'backups');

function list() {
  return fs.readdirSync(dir()).filter((n) => fs.existsSync(path.join(dir(), n, 'saude.db'))).sort().reverse();
}

function backupNow(label) {
  const name = label || new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
  const target = path.join(dir(), name);
  fs.writeFileSync(path.join(target, 'saude.db'), db.exportBytes());
  for (const old of list().slice(KEEP)) fs.rmSync(path.join(dir(), old));
  return target;
}

// No celular não há cópia automática diária (o aparelho não fica com o programa aberto)
const autoBackup = () => null;

module.exports = { backupNow, autoBackup, list, dir };
