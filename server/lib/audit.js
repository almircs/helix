// Registro de alterações. O conteúdo (antes/depois) é gravado criptografado.
const { run, all } = require('../db');
const { encrypt, decrypt } = require('./crypto');

function log(userId, entity, entityId, action, before, after) {
  const data = before || after ? encrypt(JSON.stringify({ antes: before, depois: after })) : null;
  run('INSERT INTO audit_log (user_id, entity, entity_id, action, data) VALUES (?, ?, ?, ?, ?)',
    userId, entity, entityId ?? null, action, data);
}

function list(userId, limit = 200) {
  return all('SELECT * FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT ?', userId, limit)
    .map((r) => ({ ...r, data: r.data ? JSON.parse(decrypt(r.data)) : null }));
}

module.exports = { log, list };
