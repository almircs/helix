// Exames, resultados, marcadores e o vínculo automático com pedidos de consultas.
const { all, get, run, tx } = require('../db');
const { exams, markers } = require('../models');
const { encrypt, decrypt } = require('../lib/crypto');
const { toNumber } = require('../lib/resource');
const { HttpError } = require('../lib/http');
const audit = require('../lib/audit');
const { analyzeSeries, situation, refLabel, trend, summarizeChanges } = require('./analysis');

function findOrCreateMarker(userId, name, defaults = {}) {
  name = String(name || '').trim();
  if (!name) throw new HttpError(400, 'Informe o nome do exame/marcador.');
  const found = get('SELECT * FROM markers WHERE user_id = ? AND name = ? COLLATE NOCASE', userId, name);
  if (found) {
    // completa unidade/referência do catálogo se ainda não houver
    const patch = {};
    for (const k of ['unit', 'ref_min', 'ref_max', 'ref_text']) if (found[k] == null && defaults[k] != null) patch[k] = defaults[k];
    if (Object.keys(patch).length) markers.update(userId, found.id, patch);
    return found.id;
  }
  return markers.create(userId, { name, unit: defaults.unit, ref_min: defaults.ref_min, ref_max: defaults.ref_max, ref_text: defaults.ref_text, category: defaults.category }).id;
}

function parseValue(v) {
  if (v === null || v === undefined || String(v).trim() === '') return { value_num: null, value_text: null };
  const s = String(v).trim();
  if (/^[<>]=?\s*/.test(s)) return { value_num: null, value_text: s }; // ex.: "< 0,5"
  try { const n = toNumber(s); if (n !== null) return { value_num: n, value_text: null }; } catch { /* texto */ }
  return { value_num: null, value_text: s };
}

function saveExam(userId, body, id = null) {
  return tx(() => {
    const exam = id ? exams.update(userId, id, body) : exams.create(userId, body);
    if (Array.isArray(body.results)) {
      const existing = new Map(all('SELECT * FROM exam_results WHERE exam_id = ? AND user_id = ?', exam.id, userId).map((r) => [r.id, r]));
      const keep = new Set();
      for (const r of body.results) {
        if (!r || !String(r.marker_name || '').trim()) continue;
        const ref = { unit: r.unit || null, ref_min: toNumber(r.ref_min), ref_max: toNumber(r.ref_max), ref_text: r.ref_text || null };
        const markerId = findOrCreateMarker(userId, r.marker_name, { ...ref, category: body.exam_type });
        const val = parseValue(r.value);
        const row = [markerId, val.value_num, val.value_text, ref.unit, ref.ref_min, ref.ref_max, ref.ref_text, encrypt(r.notes || null)];
        if (r.id && existing.has(Number(r.id))) {
          run('UPDATE exam_results SET marker_id=?, value_num=?, value_text=?, unit=?, ref_min=?, ref_max=?, ref_text=?, notes=? WHERE id=? AND user_id=?', ...row, Number(r.id), userId);
          keep.add(Number(r.id));
        } else {
          const ins = run('INSERT INTO exam_results (marker_id, value_num, value_text, unit, ref_min, ref_max, ref_text, notes, exam_id, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)', ...row, exam.id, userId);
          keep.add(Number(ins.lastInsertRowid));
        }
      }
      for (const [rid] of existing) if (!keep.has(rid)) run('DELETE FROM exam_results WHERE id = ?', rid);
      audit.log(userId, 'exame', exam.id, 'resultados', null, { quantidade: keep.size });
    }
    linkRequests(userId, exam.id);
    return getExam(userId, exam.id);
  });
}

// Consulta → Exames solicitados → Exames realizados: marca pedidos pendentes como realizados
function linkRequests(userId, examId) {
  const exam = get('SELECT * FROM exams WHERE id = ?', examId);
  const markerIds = all('SELECT DISTINCT marker_id FROM exam_results WHERE exam_id = ?', examId).map((r) => r.marker_id);
  for (const mid of markerIds) {
    const req = get(`SELECT r.id FROM exam_requests r JOIN consultations c ON c.id = r.consultation_id
      WHERE r.user_id = ? AND r.marker_id = ? AND r.status = 'pendente' AND c.date <= ?
      ORDER BY (r.consultation_id = ?) DESC, c.date DESC LIMIT 1`,
      userId, mid, exam.collection_date, exam.consultation_id ?? -1);
    if (req) run("UPDATE exam_requests SET status = 'realizado', fulfilled_exam_id = ? WHERE id = ?", examId, req.id);
  }
  // Se o exame não tinha consulta e atendeu a um pedido, vincula à consulta solicitante
  if (!exam.consultation_id) {
    const r = get('SELECT consultation_id FROM exam_requests WHERE fulfilled_exam_id = ? LIMIT 1', examId);
    if (r) run('UPDATE exams SET consultation_id = ? WHERE id = ?', r.consultation_id, examId);
  }
}

function resultsOf(userId, examId) {
  return all(`SELECT r.*, m.name AS marker_name FROM exam_results r JOIN markers m ON m.id = r.marker_id
    WHERE r.exam_id = ? AND r.user_id = ? ORDER BY m.name`, examId, userId)
    .map((r) => {
      const o = { ...r, notes: decrypt(r.notes), situation: situation(r.value_num, r.ref_min, r.ref_max), ref_label: refLabel(r.ref_min, r.ref_max, r.ref_text) };
      delete o.user_id; return o;
    });
}

function getExam(userId, id) {
  const e = exams.get(userId, id);
  e.results = resultsOf(userId, e.id);
  e.doctor = e.requested_by_doctor_id ? get('SELECT id, name, specialty FROM doctors WHERE id = ?', e.requested_by_doctor_id) : null;
  e.consultation = e.consultation_id ? get('SELECT id, date, specialty FROM consultations WHERE id = ?', e.consultation_id) : null;
  e.fulfilled_requests = all('SELECT id, description, consultation_id FROM exam_requests WHERE fulfilled_exam_id = ?', e.id);
  // compara cada resultado com o anterior do mesmo marcador
  for (const r of e.results) {
    const prev = previousResult(userId, r.marker_id, e.collection_date);
    if (prev && r.value_num != null) r.previous = { ...prev, ...trend(prev.value, r.value_num) };
  }
  e.changes = summarizeChanges(e.results);
  return e;
}

// Último resultado numérico do marcador antes da data, com a situação em relação à referência da época
function previousResult(userId, markerId, beforeDate) {
  const p = get(`SELECT r.value_num, r.unit, COALESCE(r.ref_min, m.ref_min) ref_min, COALESCE(r.ref_max, m.ref_max) ref_max, x.collection_date, x.id exam_id
    FROM exam_results r JOIN exams x ON x.id = r.exam_id JOIN markers m ON m.id = r.marker_id
    WHERE r.user_id = ? AND r.marker_id = ? AND x.collection_date < ? AND r.value_num IS NOT NULL
    ORDER BY x.collection_date DESC LIMIT 1`, userId, markerId, beforeDate || '9999-12-31');
  if (!p) return null;
  return { value: p.value_num, date: p.collection_date, unit: p.unit, exam_id: p.exam_id, situation: situation(p.value_num, p.ref_min, p.ref_max) };
}

function listExams(userId, q = {}) {
  const where = []; const p = [];
  if (q.from) { where.push('collection_date >= ?'); p.push(q.from); }
  if (q.to) { where.push('collection_date <= ?'); p.push(q.to); }
  return exams.list(userId, where.join(' AND '), p, 'collection_date DESC, id DESC').map((e) => {
    const res = resultsOf(userId, e.id);
    return { ...e, results_count: res.length, out_of_range: res.filter((r) => r.situation === 'acima' || r.situation === 'abaixo').length,
      markers: res.map((r) => r.marker_name) };
  });
}

function removeExam(userId, id) { return tx(() => {
  run("UPDATE exam_requests SET status='pendente', fulfilled_exam_id=NULL WHERE fulfilled_exam_id = ? AND user_id = ?", Number(id), userId);
  return exams.remove(userId, id);
}); }

function markerHistory(userId, markerId, q = {}) {
  const m = markers.get(userId, markerId);
  const where = ['r.user_id = ?', 'r.marker_id = ?']; const p = [userId, m.id];
  if (q.from) { where.push('x.collection_date >= ?'); p.push(q.from); }
  if (q.to) { where.push('x.collection_date <= ?'); p.push(q.to); }
  const rows = all(`SELECT r.id, r.exam_id, r.value_num, r.value_text, r.unit, r.ref_min, r.ref_max, r.ref_text, x.collection_date AS date, x.lab
    FROM exam_results r JOIN exams x ON x.id = r.exam_id WHERE ${where.join(' AND ')} ORDER BY x.collection_date ASC, r.id ASC`, ...p);
  const series = analyzeSeries(rows.map((r) => ({ ...r, ref_min: r.ref_min ?? m.ref_min, ref_max: r.ref_max ?? m.ref_max, ref_text: r.ref_text ?? m.ref_text, unit: r.unit || m.unit })));
  return { marker: m, ...series };
}

function listMarkers(userId) {
  return markers.list(userId, '', [], 'name COLLATE NOCASE').map((m) => {
    const h = markerHistory(userId, m.id);
    const last = h.points[h.points.length - 1];
    return { ...m, count: h.points.length, last_value: last ? (last.value_num ?? last.value_text) : null, last_date: last?.date || null,
      last_situation: last?.situation || null, overall: h.summary.overall || null, unit: m.unit || last?.unit || null };
  });
}

function mergeMarker(userId, fromId, intoId) {
  return tx(() => {
    markers.get(userId, fromId); markers.get(userId, intoId);
    run('UPDATE exam_results SET marker_id = ? WHERE marker_id = ? AND user_id = ?', Number(intoId), Number(fromId), userId);
    run('UPDATE exam_requests SET marker_id = ? WHERE marker_id = ? AND user_id = ?', Number(intoId), Number(fromId), userId);
    run('INSERT OR IGNORE INTO medication_markers (medication_id, marker_id) SELECT medication_id, ? FROM medication_markers WHERE marker_id = ?', Number(intoId), Number(fromId));
    return markers.remove(userId, fromId);
  });
}

module.exports = { saveExam, getExam, listExams, removeExam, markerHistory, listMarkers, findOrCreateMarker, mergeMarker, resultsOf, previousResult };
