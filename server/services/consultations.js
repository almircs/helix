// Consultas e exames solicitados.
const { all, get, run, tx } = require('../db');
const { consultations } = require('../models');
const { findOrCreateMarker } = require('./exams');
const audit = require('../lib/audit');

function saveConsultation(userId, body, id = null) {
  return tx(() => {
    const c = id ? consultations.update(userId, id, body) : consultations.create(userId, body);
    if (Array.isArray(body.requests)) {
      const existing = new Map(all('SELECT * FROM exam_requests WHERE consultation_id = ? AND user_id = ?', c.id, userId).map((r) => [r.id, r]));
      const keep = new Set();
      for (const r of body.requests) {
        const desc = String(r?.description || '').trim();
        if (!desc) continue;
        const markerId = findOrCreateMarker(userId, desc);
        const status = ['pendente', 'realizado', 'cancelado'].includes(r.status) ? r.status : 'pendente';
        if (r.id && existing.has(Number(r.id))) {
          run('UPDATE exam_requests SET description = ?, marker_id = ?, status = ? WHERE id = ?', desc, markerId, status, Number(r.id));
          keep.add(Number(r.id));
        } else {
          const ins = run('INSERT INTO exam_requests (user_id, consultation_id, marker_id, description, status) VALUES (?,?,?,?,?)', userId, c.id, markerId, desc, status);
          keep.add(Number(ins.lastInsertRowid));
        }
      }
      for (const [rid] of existing) if (!keep.has(rid)) run('DELETE FROM exam_requests WHERE id = ?', rid);
      audit.log(userId, 'consulta', c.id, 'exames solicitados', null, { quantidade: keep.size });
    }
    return getConsultation(userId, c.id);
  });
}

function getConsultation(userId, id) {
  const c = consultations.get(userId, id);
  c.doctor = c.doctor_id ? get('SELECT id, name, specialty, phone FROM doctors WHERE id = ?', c.doctor_id) : null;
  c.requests = all(`SELECT r.id, r.description, r.status, r.marker_id, r.fulfilled_exam_id, x.collection_date AS fulfilled_date
    FROM exam_requests r LEFT JOIN exams x ON x.id = r.fulfilled_exam_id WHERE r.consultation_id = ? ORDER BY r.id`, c.id);
  c.exams = all('SELECT id, collection_date, lab, exam_type FROM exams WHERE consultation_id = ? AND user_id = ? ORDER BY collection_date', c.id, userId);
  c.medications = all('SELECT id, name, dosage, status FROM medications WHERE consultation_id = ? AND user_id = ?', c.id, userId);
  c.medication_changes = all(`SELECT v.medication_id, v.version, v.dosage, v.status, m.name FROM medication_versions v
    JOIN medications m ON m.id = v.medication_id WHERE v.consultation_id = ? AND m.user_id = ?`, c.id, userId);
  c.previous = c.previous_id ? get('SELECT id, date, specialty FROM consultations WHERE id = ?', c.previous_id) : null;
  c.returns = all('SELECT id, date, status, specialty FROM consultations WHERE previous_id = ? AND user_id = ? ORDER BY date', c.id, userId);
  c.events = all('SELECT id, type, title, starts_at, status FROM events WHERE consultation_id = ? AND user_id = ? ORDER BY starts_at', c.id, userId);
  return c;
}

function listConsultations(userId, q = {}) {
  const where = []; const p = [];
  if (q.status) { where.push('status = ?'); p.push(q.status); }
  if (q.specialty) { where.push('specialty = ? COLLATE NOCASE'); p.push(q.specialty); }
  return consultations.list(userId, where.join(' AND '), p, 'date DESC, time DESC').map((c) => ({
    ...c,
    doctor_name: c.doctor_id ? get('SELECT name FROM doctors WHERE id = ?', c.doctor_id)?.name : null,
    requests_pending: get("SELECT COUNT(*) n FROM exam_requests WHERE consultation_id = ? AND status = 'pendente'", c.id).n,
    requests_total: get('SELECT COUNT(*) n FROM exam_requests WHERE consultation_id = ?', c.id).n,
  }));
}

module.exports = { saveConsultation, getConsultation, listConsultations };
