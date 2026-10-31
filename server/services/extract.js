// Leitura de dados de arquivos (laudos, receitas, pedidos, relatórios, planilhas) — tudo neste computador.
// PDF e fotos são lidos pela tela (pdf.js e reconhecimento de texto), que envia só o texto;
// Word, Excel, CSV e TXT são lidos aqui. O resultado é uma sugestão: nada é gravado sem revisão.
const { all, get } = require('../db');
const { HttpError } = require('../lib/http');
const { docxText, xlsxRows } = require('../lib/extract/office');
const { docText, xlsRows } = require('../lib/extract/legacy');
const { parseDocument } = require('../lib/extract/parse');
const { normalize } = require('../lib/extract/catalog');
const { situation, trend, refLabel, summarizeChanges } = require('./analysis');
const { previousResult } = require('./exams');
const docs = require('./documents');

const MAX_BYTES = 25 * 1024 * 1024;

function fileKind(name = '', mime = '') {
  const ext = String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  mime = String(mime).toLowerCase();
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff'].includes(ext)) return 'image';
  if (ext === 'docx' || mime.includes('wordprocessingml')) return 'docx';
  if (ext === 'doc' || mime === 'application/msword') return 'doc';
  if (ext === 'xlsx' || mime.includes('spreadsheetml')) return 'xlsx';
  if (ext === 'xls' || mime === 'application/vnd.ms-excel') return 'xls';
  if (ext === 'csv' || mime === 'text/csv') return 'csv';
  if (ext === 'txt' || mime === 'text/plain') return 'txt';
  return null;
}

// Texto em UTF-8; se não for válido, Windows-1252 (arquivos salvos no Excel/Bloco de Notas antigos)
function decodeText(buf) {
  const s = buf.toString('utf8');
  return s.includes('�') ? buf.toString('latin1') : s.replace(/^﻿/, '');
}

function csvRows(text) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === sep && !q) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}

function readFileContent(buf, kind) {
  try {
    if (kind === 'docx') return { text: docxText(buf) };
    if (kind === 'doc') return { text: docText(buf) };
    if (kind === 'xlsx') return { sheets: xlsxRows(buf) };
    if (kind === 'xls') return { sheets: xlsRows(buf) };
    if (kind === 'csv') return { sheets: [{ name: 'CSV', rows: csvRows(decodeText(buf)) }] };
    if (kind === 'txt') return { text: decodeText(buf) };
  } catch (e) {
    throw new HttpError(400, `Não foi possível ler este arquivo (${e.message}). Se ele abre normalmente no computador, salve uma cópia em PDF e tente de novo.`);
  }
  throw new HttpError(400, 'Formato não suportado. Use PDF, foto, Word (.doc/.docx), Excel (.xls/.xlsx), CSV ou TXT.');
}

// Unidades equivalentes ficam iguais: /µL = /mm³, µg = mcg, µUI = uUI
const unitKey = (u) => String(u || '').toLowerCase().replace(/\s+/g, '').replace(/µ|\u03bc|mc(?=g)/g, 'u').replace(/³/g, '3').replace(/\/mm3$/, '/ul');

function enrichExam(userId, exam) {
  for (const r of exam.results) {
    const m = get('SELECT * FROM markers WHERE user_id = ? AND name = ? COLLATE NOCASE', userId, r.marker_name);
    r.marker_id = m?.id || null;
    // sem referência no laudo: usa a já cadastrada para esse exame
    if (m && r.ref_min == null && r.ref_max == null && !r.ref_text && (m.ref_min != null || m.ref_max != null)) {
      r.ref_min = m.ref_min; r.ref_max = m.ref_max; r.ref_from_history = true;
    }
    if (!r.unit && m?.unit) r.unit = m.unit;
    r.situation = situation(r.value, r.ref_min, r.ref_max);
    r.ref_label = refLabel(r.ref_min, r.ref_max, r.ref_text);
    const prev = m ? previousResult(userId, m.id, exam.collection_date) : null;
    if (prev) {
      r.previous = prev;
      if (prev.unit && r.unit && unitKey(prev.unit) !== unitKey(r.unit)) prev.unit_differs = true;
      // diferença de mais de 20 vezes: quase sempre um dos dois foi lido ou digitado errado (ex.: % no lugar de /µL)
      else if (r.value && prev.value && (r.value / prev.value > 20 || prev.value / r.value > 20)) prev.mismatch = true;
      else if (r.value != null) Object.assign(prev, trend(prev.value, r.value));
    }
  }
  exam.changes = summarizeChanges(exam.results);
  if (exam.collection_date) {
    const same = get('SELECT id FROM exams WHERE user_id = ? AND collection_date = ? ORDER BY id LIMIT 1', userId, exam.collection_date);
    if (same) exam.existing_exam_id = same.id;
  }
  return exam;
}

function analyze(userId, body = {}) {
  let { text = '' } = body;
  let sheets = null; let source = { kind: 'texto', name: body.name || null };
  if (body.document_id && !text) {
    const f = docs.readFile(userId, body.document_id);
    source = { kind: fileKind(f.name, f.mime), name: f.name, document_id: Number(body.document_id) };
    if (source.kind === 'pdf' || source.kind === 'image') throw new HttpError(400, 'PDF e fotos são lidos pela tela do programa.');
    ({ text = '', sheets = null } = readFileContent(f.buffer, source.kind));
  } else if (body.file && !text) {
    const buf = Buffer.from(String(body.file.data_base64 || ''), 'base64');
    if (!buf.length) throw new HttpError(400, 'Arquivo vazio.');
    if (buf.length > MAX_BYTES) throw new HttpError(413, 'Arquivo muito grande (máximo 25 MB).');
    source = { kind: fileKind(body.file.name, body.file.mime_type), name: body.file.name || null };
    if (source.kind === 'pdf' || source.kind === 'image') throw new HttpError(400, 'PDF e fotos são lidos pela tela do programa.');
    ({ text = '', sheets = null } = readFileContent(buf, source.kind));
  } else if (body.document_id) source.document_id = Number(body.document_id);
  if (body.source_kind) source.kind = body.source_kind;
  if (body.ocr) source.ocr = true;
  if (!String(text).trim() && !(sheets && sheets.length)) throw new HttpError(422, 'Não encontramos texto neste arquivo. Se for uma foto, tente uma imagem mais nítida e reta.');

  const userMarkers = all('SELECT name, unit FROM markers WHERE user_id = ?', userId);
  const parsed = parseDocument({ text: String(text).slice(0, 400000), sheets, userMarkers });
  parsed.exams = parsed.exams.sort((a, b) => String(a.collection_date).localeCompare(String(b.collection_date))).map((e) => enrichExam(userId, e));

  // médico já cadastrado com o mesmo nome
  if (parsed.doctor?.name) {
    const n = normalize(parsed.doctor.name);
    const d = all('SELECT id, name, specialty FROM doctors WHERE user_id = ?', userId).find((x) => normalize(x.name).includes(n) || n.includes(normalize(x.name)));
    if (d) { parsed.doctor.id = d.id; parsed.doctor.name = d.name; parsed.specialty ||= d.specialty; }
  }
  // remédios que já estão na lista
  const meds = all("SELECT id, name, dosage, status FROM medications WHERE user_id = ? AND status != 'encerrado'", userId);
  for (const m of parsed.medications) {
    const n = normalize(m.name).split(' ')[0];
    const same = meds.find((x) => normalize(x.name).split(' ')[0] === n);
    if (same) m.existing = same;
  }
  parsed.source = source;
  const cfg = require('../config');
  parsed.thresholds = { stable: cfg.stableChangePct, relevant: cfg.relevantChangePct };
  parsed.text = parsed.text.slice(0, 50000);
  return parsed;
}

module.exports = { analyze, fileKind, readFileContent, csvRows };
