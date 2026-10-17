// Medicamentos com histórico imutável de versões e relação temporal com exames.
const { all, get, run, tx } = require('../db');
const { medications, markers } = require('../models');
const { encrypt, decrypt } = require('../lib/crypto');
const { HttpError } = require('../lib/http');
const { findOrCreateMarker, markerHistory } = require('./exams');

const TRACKED = ['name', 'dosage', 'schedule', 'frequency', 'status', 'presentation', 'active_ingredient', 'end_date'];
const today = () => new Date().toISOString().slice(0, 10);

function addVersion(med, { effective_date, change_reason, consultation_id }) {
  const n = (get('SELECT MAX(version) v FROM medication_versions WHERE medication_id = ?', med.id).v || 0) + 1;
  run(`INSERT INTO medication_versions (medication_id, version, effective_date, dosage, schedule, frequency, status, change_reason, consultation_id, snapshot)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    med.id, n, effective_date || med.start_date || today(), med.dosage, med.schedule, med.frequency, med.status,
    encrypt(change_reason || (n === 1 ? 'Início do uso' : null)), consultation_id ?? null, encrypt(JSON.stringify(med)));
}

function setMarkers(userId, medId, names = [], ids = []) {
  run('DELETE FROM medication_markers WHERE medication_id = ?', medId);
  const set = new Set(ids.map(Number).filter((id) => get('SELECT 1 FROM markers WHERE id = ? AND user_id = ?', id, userId)));
  for (const n of names) if (String(n).trim()) set.add(findOrCreateMarker(userId, n));
  for (const mid of set) run('INSERT OR IGNORE INTO medication_markers (medication_id, marker_id) VALUES (?, ?)', medId, mid);
}

function createMedication(userId, body) {
  return tx(() => {
    const med = medications.create(userId, { status: 'ativo', ...body });
    addVersion(med, { effective_date: med.start_date, change_reason: body.change_reason, consultation_id: med.consultation_id });
    if (body.marker_names || body.marker_ids) setMarkers(userId, med.id, body.marker_names || [], body.marker_ids || []);
    return getMedication(userId, med.id);
  });
}

function updateMedication(userId, id, body) {
  return tx(() => {
    const before = medications.get(userId, id);
    const after = medications.update(userId, id, body);
    const changed = TRACKED.some((k) => k in body && (before[k] ?? null) !== (after[k] ?? null));
    if (changed) {
      if (body.effective_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.effective_date)) throw new HttpError(400, 'Data da alteração inválida');
      const cid = Number(body.change_consultation_id) || null;
      if (cid && !get('SELECT 1 FROM consultations WHERE id = ? AND user_id = ?', cid, userId)) throw new HttpError(400, 'Consulta inválida');
      addVersion(after, { effective_date: body.effective_date || today(), change_reason: body.change_reason, consultation_id: cid });
    }
    if (body.marker_names || body.marker_ids) setMarkers(userId, after.id, body.marker_names || [], body.marker_ids || []);
    return getMedication(userId, after.id);
  });
}

function versionsOf(medId) {
  return all('SELECT * FROM medication_versions WHERE medication_id = ? ORDER BY version', medId).map((v) => ({
    ...v, change_reason: decrypt(v.change_reason), snapshot: undefined,
  }));
}

function getMedication(userId, id) {
  const m = medications.get(userId, id);
  m.versions = versionsOf(m.id);
  m.markers = all('SELECT k.id, k.name, k.unit FROM medication_markers mm JOIN markers k ON k.id = mm.marker_id WHERE mm.medication_id = ? ORDER BY k.name', m.id);
  m.doctor = m.doctor_id ? get('SELECT id, name, specialty FROM doctors WHERE id = ?', m.doctor_id) : null;
  m.consultation = m.consultation_id ? get('SELECT id, date, specialty FROM consultations WHERE id = ?', m.consultation_id) : null;
  return m;
}

function listMedications(userId, q = {}) {
  const where = q.status ? 'status = ?' : ''; const p = q.status ? [q.status] : [];
  return medications.list(userId, where, p, "CASE status WHEN 'ativo' THEN 0 WHEN 'suspenso' THEN 1 ELSE 2 END, name COLLATE NOCASE").map((m) => ({
    ...m, versions_count: get('SELECT COUNT(*) n FROM medication_versions WHERE medication_id = ?', m.id).n,
    markers: all('SELECT k.name FROM medication_markers mm JOIN markers k ON k.id = mm.marker_id WHERE mm.medication_id = ?', m.id).map((r) => r.name),
  }));
}

/**
 * Relação TEMPORAL entre o medicamento e os exames acompanhados.
 * Mostra apenas a sequência dos fatos (alterações do remédio e resultados) — sem inferir causa.
 */
function related(userId, id) {
  const med = getMedication(userId, id);
  const series = med.markers.map((mk) => markerHistory(userId, mk.id));
  const timeline = [
    ...med.versions.map((v) => ({ date: v.effective_date, kind: 'medicamento', text: v.version === 1
      ? `Início: ${med.name} ${v.dosage || ''}`.trim()
      : `Alteração: ${[v.dosage, v.frequency, v.status !== 'ativo' ? v.status : null].filter(Boolean).join(' · ')}`, reason: v.change_reason })),
    ...series.flatMap((s) => s.points.map((p) => ({ date: p.date, kind: 'resultado', marker: s.marker.name, value: p.value_num ?? p.value_text, unit: p.unit, situation: p.situation, exam_id: p.exam_id }))),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'medicamento' ? -1 : 1));

  // Para cada alteração: último valor antes x primeiro valor depois (comparação descritiva)
  const around = med.versions.map((v) => ({
    version: v.version, date: v.effective_date, dosage: v.dosage, status: v.status,
    markers: series.map((s) => {
      const nums = s.points.filter((p) => p.value_num != null);
      const before = [...nums].reverse().find((p) => p.date < v.effective_date) || null;
      const after = nums.find((p) => p.date >= v.effective_date) || null;
      return { marker: s.marker.name, unit: s.marker.unit, before: before && { date: before.date, value: before.value_num }, after: after && { date: after.date, value: after.value_num } };
    }),
  }));
  return { medication: med, series, timeline, around,
    aviso: 'Relação apenas temporal: mostra o que aconteceu antes e depois de cada alteração. Não indica que o medicamento causou qualquer mudança — avalie com seu médico.' };
}

function removeMedication(userId, id) { return medications.remove(userId, id); }

module.exports = { createMedication, updateMedication, getMedication, listMedications, related, removeMedication, setMarkers };
