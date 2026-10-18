// Backup em arquivo (.helyx) e restauração.
// O arquivo traz os dados legíveis (decifrados); na restauração tudo é gravado de novo
// com a chave de criptografia DESTE computador — por isso funciona em outra máquina.
const fs = require('node:fs');
const path = require('node:path');
const { all, get, run, tx } = require('../db');
const { encrypt } = require('../lib/crypto');
const { HttpError } = require('../lib/http');
const audit = require('../lib/audit');
const backup = require('../lib/backup');
const M = require('../models');
const { exportAll, localDate } = require('./overview');

const FORMATS = ['helyx', 'prontuario-pessoal'];

function insert(table, userId, row, cols, enc = []) {
  const keys = cols.filter((c) => row[c] !== undefined);
  const vals = keys.map((k) => (enc.includes(k) ? encrypt(row[k] ?? null) : row[k] ?? null));
  const withUser = userId != null;
  const r = run(`INSERT INTO ${table} (${withUser ? 'user_id, ' : ''}${keys.join(', ')}) VALUES (${withUser ? '?, ' : ''}${keys.map(() => '?').join(', ')})`,
    ...(withUser ? [userId] : []), ...vals);
  return Number(r.lastInsertRowid);
}
const fieldsOf = (res) => Object.keys(res.fields);
const keepDates = (cols) => [...cols, 'created_at', 'updated_at'];

function wipe(userId) {
  // Ordem respeita as chaves estrangeiras
  run('DELETE FROM exam_results WHERE user_id = ?', userId);
  run('DELETE FROM exam_requests WHERE user_id = ?', userId);
  run('DELETE FROM events WHERE user_id = ?', userId);
  run('DELETE FROM measurements WHERE user_id = ?', userId);
  run('DELETE FROM documents WHERE user_id = ?', userId);
  run('DELETE FROM medications WHERE user_id = ?', userId);   // versões e marcadores vão junto (CASCADE)
  run('DELETE FROM exams WHERE user_id = ?', userId);
  run('UPDATE consultations SET previous_id = NULL WHERE user_id = ?', userId);
  run('DELETE FROM consultations WHERE user_id = ?', userId);
  run('DELETE FROM markers WHERE user_id = ?', userId);
  run('DELETE FROM doctors WHERE user_id = ?', userId);
}

function summary(d) {
  return {
    consultas: d.consultas?.length || 0, exames: d.exames?.length || 0, resultados: d.resultados?.length || 0,
    medicamentos: d.medicamentos?.length || 0, medicoes: d.medicoes?.length || 0, agenda: d.agenda?.length || 0, medicos: d.medicos?.length || 0,
  };
}

function validate(d) {
  if (!d || typeof d !== 'object' || !FORMATS.includes(d.formato)) throw new HttpError(400, 'Este arquivo não é um backup do Helyx.');
  for (const k of ['consultas', 'exames', 'resultados', 'marcadores', 'medicamentos']) if (d[k] && !Array.isArray(d[k])) throw new HttpError(400, 'Backup corrompido.');
}

function restore(userId, d) {
  validate(d);
  // Cópia de segurança do estado atual antes de substituir
  saveFile(userId, `antes-de-restaurar-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}`);
  tx(() => {
    wipe(userId);
    const map = { doc: new Map(), con: new Map(), mk: new Map(), ex: new Map(), med: new Map() };
    const m = (k, id) => (id == null ? null : map[k].get(Number(id)) ?? null);

    if (d.perfil) {
      const p = d.perfil; const set = {};
      for (const f of M.PROFILE_FIELDS) if (f in p) set[f] = M.PROFILE_ENCRYPTED.includes(f) ? encrypt(p[f] ?? null) : p[f] ?? null;
      const cols = Object.keys(set);
      if (!get('SELECT 1 FROM profiles WHERE user_id = ?', userId)) run('INSERT INTO profiles (user_id) VALUES (?)', userId);
      if (cols.length) run(`UPDATE profiles SET ${cols.map((c) => c + ' = ?').join(', ')} WHERE user_id = ?`, ...cols.map((c) => set[c]), userId);
    }
    for (const r of d.medicos || []) map.doc.set(r.id, insert('doctors', userId, r, keepDates(fieldsOf(M.doctors)), M.doctors.encrypted));
    for (const r of d.consultas || []) map.con.set(r.id, insert('consultations', userId, { ...r, doctor_id: m('doc', r.doctor_id), previous_id: null }, keepDates(fieldsOf(M.consultations)), M.consultations.encrypted));
    for (const r of d.consultas || []) if (r.previous_id) run('UPDATE consultations SET previous_id = ? WHERE id = ?', m('con', r.previous_id), m('con', r.id));
    for (const r of d.marcadores || []) map.mk.set(r.id, insert('markers', userId, r, fieldsOf(M.markers)));
    for (const r of d.exames || []) map.ex.set(r.id, insert('exams', userId, { ...r, requested_by_doctor_id: m('doc', r.requested_by_doctor_id), consultation_id: m('con', r.consultation_id) }, keepDates(fieldsOf(M.exams)), M.exams.encrypted));
    for (const r of d.resultados || []) {
      if (!m('ex', r.exam_id) || !m('mk', r.marker_id)) continue;
      insert('exam_results', userId, { ...r, exam_id: m('ex', r.exam_id), marker_id: m('mk', r.marker_id) }, ['exam_id', 'marker_id', 'value_num', 'value_text', 'unit', 'ref_min', 'ref_max', 'ref_text', 'notes'], ['notes']);
    }
    for (const r of d.exames_solicitados || []) {
      if (!m('con', r.consultation_id)) continue;
      insert('exam_requests', userId, { ...r, consultation_id: m('con', r.consultation_id), marker_id: m('mk', r.marker_id), fulfilled_exam_id: m('ex', r.fulfilled_exam_id) }, ['consultation_id', 'marker_id', 'description', 'status', 'fulfilled_exam_id']);
    }
    for (const r of d.medicamentos || []) map.med.set(r.id, insert('medications', userId, { ...r, doctor_id: m('doc', r.doctor_id), consultation_id: m('con', r.consultation_id) }, keepDates(fieldsOf(M.medications)), M.medications.encrypted));
    for (const r of d.medicamentos_versoes || []) {
      if (!m('med', r.medication_id)) continue;
      insert('medication_versions', null, { ...r, medication_id: m('med', r.medication_id), consultation_id: m('con', r.consultation_id), snapshot: r.snapshot ?? '{}' },
        ['medication_id', 'version', 'effective_date', 'dosage', 'schedule', 'frequency', 'status', 'change_reason', 'consultation_id', 'snapshot', 'created_at'], ['change_reason', 'snapshot']);
    }
    for (const r of d.medicamentos_marcadores || []) if (m('med', r.medication_id) && m('mk', r.marker_id))
      run('INSERT OR IGNORE INTO medication_markers (medication_id, marker_id) VALUES (?, ?)', m('med', r.medication_id), m('mk', r.marker_id));
    for (const r of d.medicoes || []) insert('measurements', userId, r, [...fieldsOf(M.measurements), 'created_at'], M.measurements.encrypted);
    for (const r of d.agenda || []) insert('events', userId, { ...r, consultation_id: m('con', r.consultation_id), exam_id: m('ex', r.exam_id), medication_id: m('med', r.medication_id) }, keepDates(fieldsOf(M.events)), M.events.encrypted);
  });
  const s = summary(d);
  audit.log(userId, 'dados', null, 'restaurar backup', null, { de: d.exportado_em, ...s });
  return { ok: true, ...s };
}

// ---- Arquivos .helyx guardados no computador (cópias automáticas e manuais)
const fileName = (userId) => `dados-${userId}.helyx`;

function saveFile(userId, label) {
  const target = backup.backupNow(label);                     // banco + chave (cópia técnica)
  fs.writeFileSync(path.join(target, fileName(userId)), JSON.stringify(exportAll(userId)), { mode: 0o600 });
  return target;
}

function autoForAllUsers() {
  const made = backup.autoBackup();
  if (!made) return null;
  for (const u of all('SELECT id FROM users')) fs.writeFileSync(path.join(made, fileName(u.id)), JSON.stringify(exportAll(u.id)), { mode: 0o600 });
  return made;
}

function listFiles(userId) {
  return backup.list().filter((n) => fs.existsSync(path.join(backup.dir(), n, fileName(userId)))).map((n) => {
    const file = path.join(backup.dir(), n, fileName(userId));
    let info = {};
    try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); info = { exportado_em: d.exportado_em, ...summary(d) }; } catch { info = { erro: true }; }
    return { name: n, kind: n.startsWith('auto-') ? 'automática' : n.startsWith('antes-de-restaurar') ? 'antes de restaurar' : 'manual', size: fs.statSync(file).size, ...info };
  });
}

function restoreLocal(userId, name) {
  if (!/^[\w.-]+$/.test(String(name))) throw new HttpError(400, 'Cópia inválida.');
  const file = path.join(backup.dir(), name, fileName(userId));
  if (!fs.existsSync(file)) throw new HttpError(404, 'Cópia não encontrada.');
  return restore(userId, JSON.parse(fs.readFileSync(file, 'utf8')));
}

const downloadName = () => `helyx-backup-${localDate()}.helyx`;

module.exports = { restore, saveFile, autoForAllUsers, listFiles, restoreLocal, downloadName, summary, validate };
