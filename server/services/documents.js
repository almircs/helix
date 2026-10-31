// Documentos médicos (PDF, fotos): arquivo criptografado em <dados>/documentos, metadados no banco.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../config');
const { all, get, run } = require('../db');
const { encrypt, decrypt, encryptBuffer, decryptBuffer } = require('../lib/crypto');
const { HttpError } = require('../lib/http');
const audit = require('../lib/audit');

const KINDS = ['laudo', 'receita', 'pedido', 'relatorio', 'imagem', 'outro'];
const MIME_OK = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.ms-excel': 'xls',
  'text/csv': 'csv', 'text/plain': 'txt',
};
const MAX_BYTES = 25 * 1024 * 1024;
const dir = () => path.join(config.dataDir, 'documentos');
const REFS = { consultation_id: 'consultations', exam_id: 'exams', doctor_id: 'doctors', medication_id: 'medications' };

function checkRefs(userId, data) {
  for (const [f, t] of Object.entries(REFS)) {
    if (data[f] == null || data[f] === '') { data[f] = null; continue; }
    data[f] = Number(data[f]);
    if (!get(`SELECT 1 FROM ${t} WHERE id = ? AND user_id = ?`, data[f], userId)) throw new HttpError(400, `Referência inválida em ${f}`);
  }
}

function shape(r) {
  if (!r) return r;
  const o = { ...r, notes: decrypt(r.notes), ai_data: r.ai_data ? JSON.parse(decrypt(r.ai_data)) : null };
  delete o.user_id; delete o.stored_path;
  o.is_pdf = o.mime_type === 'application/pdf';
  o.is_image = String(o.mime_type || '').startsWith('image/');
  return o;
}

function withLinks(userId, d) {
  d.consultation = d.consultation_id ? get('SELECT id, date, specialty FROM consultations WHERE id = ?', d.consultation_id) : null;
  d.exam = d.exam_id ? get('SELECT id, collection_date, lab FROM exams WHERE id = ?', d.exam_id) : null;
  d.doctor = d.doctor_id ? get('SELECT id, name, specialty FROM doctors WHERE id = ?', d.doctor_id) : null;
  d.medication = d.medication_id ? get('SELECT id, name, dosage FROM medications WHERE id = ?', d.medication_id) : null;
  return d;
}

function saveFile(buf) {
  fs.mkdirSync(dir(), { recursive: true });
  const name = crypto.randomUUID() + '.bin';
  fs.writeFileSync(path.join(dir(), name), encryptBuffer(buf), { mode: 0o600 });
  return name;
}

function create(userId, body) {
  const mime = String(body.mime_type || '').toLowerCase();
  if (!MIME_OK[mime]) throw new HttpError(400, 'Envie um PDF, uma foto (JPG, PNG, WEBP), um documento do Word, uma planilha do Excel, CSV ou TXT.');
  const buf = Buffer.from(String(body.data_base64 || ''), 'base64');
  if (!buf.length) throw new HttpError(400, 'Arquivo vazio.');
  if (buf.length > MAX_BYTES) throw new HttpError(413, 'Arquivo muito grande (máximo 25 MB).');
  const data = { consultation_id: body.consultation_id, exam_id: body.exam_id, doctor_id: body.doctor_id, medication_id: body.medication_id };
  checkRefs(userId, data);
  const kind = KINDS.includes(body.kind) ? body.kind : 'outro';
  const title = String(body.title || body.original_name || 'Documento').trim().slice(0, 200);
  const docDate = /^\d{4}-\d{2}-\d{2}$/.test(body.doc_date || '') ? body.doc_date : new Date().toISOString().slice(0, 10);
  const stored = saveFile(buf);
  const r = run(`INSERT INTO documents (user_id, title, kind, doc_date, stored_path, mime_type, size_bytes, original_name, consultation_id, exam_id, doctor_id, medication_id, notes, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))`,
  userId, title, kind, docDate, stored, mime, buf.length, String(body.original_name || '').slice(0, 200) || null,
  data.consultation_id, data.exam_id, data.doctor_id, data.medication_id, encrypt(body.notes || null));
  const id = Number(r.lastInsertRowid);
  audit.log(userId, 'documento', id, 'criar', null, { title, kind, size: buf.length });
  return getOne(userId, id);
}

function getRow(userId, id) {
  const r = get('SELECT * FROM documents WHERE id = ? AND user_id = ?', Number(id), userId);
  if (!r) throw new HttpError(404, 'Documento não encontrado');
  return r;
}
const getOne = (userId, id) => withLinks(userId, shape(getRow(userId, id)));

function list(userId, q = {}) {
  const w = []; const p = [];
  for (const f of Object.keys(REFS)) if (q[f]) { w.push(`${f} = ?`); p.push(Number(q[f])); }
  if (q.kind) { w.push('kind = ?'); p.push(q.kind); }
  return all(`SELECT * FROM documents WHERE user_id = ? ${w.length ? 'AND ' + w.join(' AND ') : ''} ORDER BY doc_date DESC, id DESC`, userId, ...p)
    .map((r) => withLinks(userId, shape(r)));
}

function update(userId, id, body) {
  getRow(userId, id);
  const data = {};
  for (const f of Object.keys(REFS)) if (f in body) data[f] = body[f];
  checkRefs(userId, data);
  if ('title' in body) data.title = String(body.title || 'Documento').trim().slice(0, 200);
  if ('kind' in body) data.kind = KINDS.includes(body.kind) ? body.kind : 'outro';
  if ('doc_date' in body && /^\d{4}-\d{2}-\d{2}$/.test(body.doc_date)) data.doc_date = body.doc_date;
  if ('notes' in body) data.notes = encrypt(body.notes || null);
  for (const f of Object.keys(REFS)) if (!(f in body)) delete data[f];
  const cols = Object.keys(data);
  if (cols.length) run(`UPDATE documents SET ${cols.map((c) => c + ' = ?').join(', ')}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`, ...cols.map((c) => data[c]), Number(id), userId);
  audit.log(userId, 'documento', Number(id), 'alterar', null, { campos: cols });
  return getOne(userId, id);
}

function setAI(userId, id, status, aiData) {
  run("UPDATE documents SET ai_status = ?, ai_data = ?, ai_at = datetime('now') WHERE id = ? AND user_id = ?", status, aiData ? encrypt(JSON.stringify(aiData)) : null, Number(id), userId);
}

function readFile(userId, id) {
  const r = getRow(userId, id);
  const file = path.join(dir(), path.basename(r.stored_path));
  if (!fs.existsSync(file)) throw new HttpError(404, 'O arquivo deste documento não foi encontrado no computador.');
  return { buffer: decryptBuffer(fs.readFileSync(file)), mime: r.mime_type, name: r.original_name || `${r.title}.${MIME_OK[r.mime_type] || 'bin'}` };
}

function remove(userId, id) {
  const r = getRow(userId, id);
  run('DELETE FROM documents WHERE id = ? AND user_id = ?', r.id, userId);
  try { fs.rmSync(path.join(dir(), path.basename(r.stored_path)), { force: true }); } catch { /* */ }
  audit.log(userId, 'documento', r.id, 'excluir', { title: r.title }, null);
  return { ok: true };
}

// Para backup: documentos com o conteúdo em base64 (decifrado)
function exportAll(userId) {
  return all('SELECT * FROM documents WHERE user_id = ?', userId).map((r) => {
    let data_base64 = null;
    try { data_base64 = readFile(userId, r.id).buffer.toString('base64'); } catch { /* arquivo ausente */ }
    const o = shape(r); delete o.consultation; return { ...o, data_base64 };
  });
}
function wipeFiles(userId) {
  for (const r of all('SELECT stored_path FROM documents WHERE user_id = ?', userId)) {
    try { fs.rmSync(path.join(dir(), path.basename(r.stored_path)), { force: true }); } catch { /* */ }
  }
}
function importOne(userId, d, links) {
  if (!d.data_base64) return null;
  const stored = saveFile(Buffer.from(d.data_base64, 'base64'));
  const r = run(`INSERT INTO documents (user_id, title, kind, doc_date, stored_path, mime_type, size_bytes, original_name, consultation_id, exam_id, doctor_id, medication_id, notes, ai_status, ai_data, ai_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, COALESCE(?, datetime('now')), ?)`,
  userId, d.title || 'Documento', d.kind || 'outro', d.doc_date || null, stored, d.mime_type, d.size_bytes || null, d.original_name || null,
  links.consultation_id, links.exam_id, links.doctor_id, links.medication_id, encrypt(d.notes || null),
  d.ai_status || null, d.ai_data ? encrypt(JSON.stringify(d.ai_data)) : null, d.ai_at || null, d.created_at || null, d.updated_at || null);
  return Number(r.lastInsertRowid);
}

module.exports = { create, list, getOne, update, remove, readFile, setAI, exportAll, wipeFiles, importOne, KINDS, MIME_OK };
