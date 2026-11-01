// Linha do tempo, agenda, dashboard, busca e exportação.
const { all, get } = require('../db');
const { decrypt } = require('../lib/crypto');
const { consultations, exams, medications, measurements, events, doctors, markers, PROFILE_ENCRYPTED, MEASUREMENT_TYPES } = require('../models');
const { resultsOf, listMarkers, markerHistory } = require('./exams');
const { listMedications } = require('./medications');

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return localDate(d); };
const br = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const fmtNum = (n) => (n == null ? '' : String(Math.round(n * 100) / 100).replace('.', ','));

// ---------------------------------------------------------------- Linha do tempo
function timeline(userId, q = {}) {
  const from = q.from || '0000-01-01', to = q.to || '9999-12-31';
  const kinds = q.kinds ? new Set(String(q.kinds).split(',')) : null;
  const want = (k) => !kinds || kinds.has(k);
  const items = [];

  if (want('exame')) for (const e of all('SELECT * FROM exams WHERE user_id = ? AND collection_date BETWEEN ? AND ?', userId, from, to)) {
    const res = resultsOf(userId, e.id);
    items.push({ date: e.collection_date, kind: 'exame', id: e.id, link: `#/exames/${e.id}`,
      title: e.title ? `${e.title}${e.lab ? ' — ' + e.lab : ''}` : `Exames${e.lab ? ' — ' + e.lab : ''}${e.exam_type ? ' (' + e.exam_type + ')' : ''}`,
      lines: res.length ? res.map((r) => ({ text: `${r.marker_name}: ${r.value_num != null ? fmtNum(r.value_num) : (r.value_text || '—')} ${r.unit || ''}`.trim(), flag: r.situation === 'acima' || r.situation === 'abaixo' ? r.situation : null }))
        : String(decrypt(e.conclusion) || '').split('\n').filter(Boolean).slice(0, 4).map((text) => ({ text })),
      flag: res.some((r) => r.situation === 'acima' || r.situation === 'abaixo') ? 'alerta' : null });
  }
  if (want('consulta')) for (const c of all('SELECT * FROM consultations WHERE user_id = ? AND date BETWEEN ? AND ?', userId, from, to)) {
    const d = c.doctor_id ? get('SELECT name FROM doctors WHERE id = ?', c.doctor_id) : null;
    const reqs = all('SELECT description, status FROM exam_requests WHERE consultation_id = ?', c.id);
    items.push({ date: c.date, time: c.time, kind: c.is_return ? 'retorno' : 'consulta', id: c.id, link: `#/consultas/${c.id}`, status: c.status,
      title: `${c.is_return ? 'Retorno' : 'Consulta'}${c.specialty ? ' — ' + c.specialty : ''}${d ? ' · ' + d.name : ''}`,
      lines: [
        ...(c.status !== 'realizada' ? [{ text: c.status === 'agendada' ? 'Agendada' : 'Cancelada' }] : []),
        ...(reqs.length ? [{ text: `Exames solicitados: ${reqs.map((r) => r.description + (r.status === 'realizado' ? ' ✓' : '')).join(', ')}` }] : []),
        ...(decrypt(c.diagnoses) ? [{ text: `Diagnóstico informado: ${decrypt(c.diagnoses)}` }] : []),
      ] });
  }
  if (want('medicamento')) for (const v of all(`SELECT v.*, m.name FROM medication_versions v JOIN medications m ON m.id = v.medication_id
      WHERE m.user_id = ? AND v.effective_date BETWEEN ? AND ?`, userId, from, to)) {
    const reason = decrypt(v.change_reason);
    items.push({ date: v.effective_date, kind: 'medicamento', id: v.medication_id, link: `#/medicamentos/${v.medication_id}`,
      title: `${v.version === 1 ? 'Início' : 'Alteração'}: ${v.name}${v.dosage ? ' ' + v.dosage : ''}`,
      lines: [{ text: [v.frequency, v.schedule, v.status].filter(Boolean).join(' · ') }, ...(reason && v.version > 1 ? [{ text: `Motivo: ${reason}` }] : [])] });
  }
  if (want('agenda')) for (const ev of all("SELECT * FROM events WHERE user_id = ? AND substr(starts_at,1,10) BETWEEN ? AND ? AND consultation_id IS NULL", userId, from, to)) {
    items.push({ date: ev.starts_at.slice(0, 10), time: ev.starts_at.slice(11, 16) || null, kind: ev.type === 'vacina' || ev.type === 'procedimento' ? ev.type : 'agenda',
      id: ev.id, link: `#/agenda?evento=${ev.id}`, status: ev.status, title: ev.title, lines: ev.location ? [{ text: ev.location }] : [] });
  }
  if (want('documento')) for (const d of all('SELECT id, title, kind, doc_date FROM documents WHERE user_id = ? AND doc_date BETWEEN ? AND ?', userId, from, to)) {
    items.push({ date: d.doc_date, kind: 'documento', id: d.id, link: `#/documentos/${d.id}`, title: d.title, lines: [{ text: { laudo: 'Laudo / resultado', receita: 'Receita', pedido: 'Pedido de exame', relatorio: 'Relatório médico', imagem: 'Imagem de exame' }[d.kind] || 'Documento' }] });
  }
  if (want('medicao')) {
    const byDay = new Map();
    for (const m of all('SELECT * FROM measurements WHERE user_id = ? AND substr(measured_at,1,10) BETWEEN ? AND ? ORDER BY measured_at', userId, from, to)) {
      const day = m.measured_at.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(m);
    }
    for (const [day, ms] of byDay) items.push({ date: day, kind: 'medicao', link: '#/saude', title: `Medições (${ms.length})`,
      lines: ms.slice(0, 4).map((m) => ({ text: `${MEASUREMENT_TYPES[m.type]?.label || m.label}: ${m.type === 'pressao' ? `${fmtNum(m.value1)}/${fmtNum(m.value2)}` : fmtNum(m.value1)} ${m.unit || ''}` })) });
  }
  const order = { consulta: 1, retorno: 1, exame: 2, documento: 2, medicamento: 3, agenda: 4, vacina: 4, procedimento: 4, medicao: 5 };
  items.sort((a, b) => b.date.localeCompare(a.date) || (order[a.kind] - order[b.kind]) || String(a.time || '').localeCompare(String(b.time || '')));
  return items;
}

// ---------------------------------------------------------------- Agenda
function agenda(userId, from, to) {
  const out = [];
  for (const ev of events.list(userId, 'substr(starts_at,1,10) BETWEEN ? AND ?', [from, to], 'starts_at')) {
    out.push({ source: 'evento', id: ev.id, type: ev.type, title: ev.title, date: ev.starts_at.slice(0, 10), time: ev.starts_at.slice(11, 16) || null,
      status: ev.status, location: ev.location, notes: ev.notes, remind_minutes: ev.remind_minutes, consultation_id: ev.consultation_id,
      exam_id: ev.exam_id, medication_id: ev.medication_id });
  }
  const linked = new Set(out.filter((e) => e.consultation_id).map((e) => e.consultation_id));
  for (const c of all('SELECT * FROM consultations WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date, time', userId, from, to)) {
    if (linked.has(c.id)) continue;
    const d = c.doctor_id ? get('SELECT name FROM doctors WHERE id = ?', c.doctor_id) : null;
    out.push({ source: 'consulta', id: c.id, type: c.is_return ? 'retorno' : 'consulta', date: c.date, time: c.time,
      title: `${c.is_return ? 'Retorno' : 'Consulta'}${c.specialty ? ' — ' + c.specialty : ''}${d ? ' · ' + d.name : ''}`,
      status: c.status === 'agendada' ? 'agendado' : c.status === 'realizada' ? 'concluido' : 'cancelado', location: c.location });
  }
  for (const m of all("SELECT * FROM medications WHERE user_id = ? AND status = 'ativo' AND end_date BETWEEN ? AND ?", userId, from, to)) {
    out.push({ source: 'medicamento', id: m.id, type: 'receita', date: m.end_date, title: `Término previsto: ${m.name}`, status: 'agendado' });
  }
  out.sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
  return out;
}

// ---------------------------------------------------------------- Dashboard
function dashboard(userId) {
  const today = localDate();
  const upcoming = agenda(userId, today, addDays(today, 365)).filter((e) => e.status === 'agendado');
  const next = (types) => upcoming.find((e) => types.includes(e.type)) || null;

  const meds = listMedications(userId, { status: 'ativo' });

  const mk = listMarkers(userId).filter((m) => m.count > 0).sort((a, b) => String(b.last_date).localeCompare(String(a.last_date)));
  const latestResults = mk.slice(0, 10).map((m) => {
    const pts = markerHistory(userId, m.id).points;
    const last = pts[pts.length - 1] || {};
    return { marker_id: m.id, name: m.name, value: m.last_value, unit: m.unit, date: m.last_date, situation: m.last_situation,
      trend: last.trend || null, ref_label: last.ref_label || '', ref_min: last.ref_min ?? null, ref_max: last.ref_max ?? null,
      recent: pts.slice(-8).map((p) => ({ x: p.date, y: p.value_num, s: p.situation })) };
  });
  const outOfRange = mk.filter((m) => m.last_situation === 'acima' || m.last_situation === 'abaixo').length;

  const indicators = Object.keys(MEASUREMENT_TYPES).filter((t) => t !== 'outro').map((t) => {
    const rows = all('SELECT * FROM measurements WHERE user_id = ? AND type = ? ORDER BY measured_at DESC LIMIT 10', userId, t);
    return rows.length ? { type: t, label: MEASUREMENT_TYPES[t].label, unit: rows[0].unit || MEASUREMENT_TYPES[t].unit, last: rows[0], recent: rows.reverse().map((r) => ({ at: r.measured_at, v1: r.value1, v2: r.value2 })) } : null;
  }).filter(Boolean);

  const alerts = [];
  for (const r of all(`SELECT r.description, c.date, c.specialty, c.id FROM exam_requests r JOIN consultations c ON c.id = r.consultation_id
      WHERE r.user_id = ? AND r.status = 'pendente' ORDER BY c.date`, userId))
    alerts.push({ level: 'info', kind: 'exame_pendente', text: `Exame pendente: ${r.description} (pedido na consulta de ${br(r.date)}${r.specialty ? ', ' + r.specialty : ''})`, link: `#/consultas/${r.id}` });
  for (const e of upcoming.filter((e) => e.date <= addDays(today, 7) && ['consulta', 'retorno', 'exame', 'procedimento', 'vacina'].includes(e.type)))
    alerts.push({ level: 'aviso', kind: 'proximo', text: `${e.title} em ${br(e.date)}${e.time ? ' às ' + e.time : ''}`, link: e.source === 'consulta' ? `#/consultas/${e.id}` : '#/agenda' });
  for (const m of meds.filter((m) => m.end_date && m.end_date >= today && m.end_date <= addDays(today, 15)))
    alerts.push({ level: 'aviso', kind: 'medicamento_termino', text: `${m.name}: término previsto em ${br(m.end_date)} — verifique a receita`, link: `#/medicamentos/${m.id}` });
  for (const r of latestResults.concat(mk.slice(10).map((m) => ({ marker_id: m.id, name: m.name, value: m.last_value, unit: m.unit, date: m.last_date, situation: m.last_situation }))))
    if (r.situation === 'acima' || r.situation === 'abaixo')
      alerts.push({ level: 'atencao', kind: 'fora_referencia', text: `${r.name} ${r.situation} da referência no último resultado (${br(r.date)})`, link: `#/exames/marcador/${r.marker_id}` });

  const p = get('SELECT full_name FROM profiles WHERE user_id = ?', userId);
  return {
    name: p?.full_name || null, today,
    next: { consulta: next(['consulta']), exame: next(['exame']), retorno: next(['retorno']) },
    upcoming: upcoming.slice(0, 8), medications: meds.map(({ id, name, dosage, schedule, frequency, end_date }) => ({ id, name, dosage, schedule, frequency, end_date })),
    latest_results: latestResults, indicators, alerts,
    counts: { exams: get('SELECT COUNT(*) n FROM exams WHERE user_id = ?', userId).n, consultations: get('SELECT COUNT(*) n FROM consultations WHERE user_id = ?', userId).n,
      markers: mk.length, out_of_range: outOfRange, active_meds: meds.length,
      pending_requests: get("SELECT COUNT(*) n FROM exam_requests WHERE user_id = ? AND status = 'pendente'", userId).n,
      upcoming_30: upcoming.filter((e) => e.date <= addDays(today, 30)).length },
  };
}

// ---------------------------------------------------------------- Página inicial discreta
// Só datas, horários e contagens: nada que identifique exames, remédios, médicos ou especialidades.
const DAILY_EXCLUDE = /seman|mens|m[êe]s|quinzen|anual/i;
function medTimes(m) {
  if (!m.schedule || DAILY_EXCLUDE.test(m.frequency || '')) return [];
  return [...String(m.schedule).matchAll(/(\d{1,2})\s*[:hH]\s*(\d{2})?/g)].map((x) => `${x[1].padStart(2, '0')}:${x[2] || '00'}`);
}
function home(userId) {
  const today = localDate();
  const ag = agenda(userId, today, addDays(today, 60)).filter((e) => e.status === 'agendado');
  const appts = ag.filter((e) => e.type !== 'receita');
  const meds = listMedications(userId, { status: 'ativo' });
  const times = [...new Set(meds.flatMap(medTimes))].sort();
  const mk = listMarkers(userId).filter((m) => m.count > 0);
  const outOfRange = mk.filter((m) => m.last_situation === 'acima' || m.last_situation === 'abaixo').length;
  const pendingReq = get("SELECT COUNT(*) n FROM exam_requests WHERE user_id = ? AND status = 'pendente'", userId).n;
  const ending = meds.filter((m) => m.end_date && m.end_date >= today && m.end_date <= addDays(today, 15)).length;
  const pend = [];
  if (outOfRange) pend.push('Exames');
  if (pendingReq) pend.push('Pedidos de exame');
  if (ending) pend.push('Medicamentos');
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const items = [
      ...appts.filter((e) => e.date === date).map((e) => ({ time: e.time || null, kind: 'compromisso' })),
      ...ag.filter((e) => e.date === date && e.type === 'receita').map(() => ({ time: null, kind: 'receita' })),
      ...times.map((t) => ({ time: t, kind: 'remedio' })),
    ].sort((a, b) => String(a.time || '99').localeCompare(String(b.time || '99')));
    return { date, items };
  });
  const lastExam = get('SELECT MAX(collection_date) d FROM exams WHERE user_id = ?', userId).d;
  const lastMeas = get('SELECT MAX(measured_at) d, COUNT(*) n FROM measurements WHERE user_id = ?', userId);
  const nextCons = get("SELECT MIN(date) d FROM consultations WHERE user_id = ? AND status = 'agendada' AND date >= ?", userId, today).d;
  const lastFile = get("SELECT MAX(at) d FROM audit_log WHERE user_id = ? AND entity = 'dados' AND action = 'baixar backup'", userId).d;
  const autos = require('../lib/backup').list().filter((n) => n.startsWith('auto-'));
  const n = appts[0] || null;
  return {
    today,
    next: n ? { date: n.date, time: n.time || null, more: appts.filter((e) => e !== n && e.date <= addDays(today, 30)).length } : null,
    today_meds: { count: meds.filter((m) => medTimes(m).length).length, times },
    pending: { count: (outOfRange ? 1 : 0) + (pendingReq ? 1 : 0) + ending, areas: pend },
    exams: { tracked: mk.length, last: lastExam },
    consultations: { total: get('SELECT COUNT(*) n FROM consultations WHERE user_id = ?', userId).n, next: nextCons },
    medications: { active: meds.length },
    measurements: { total: lastMeas.n, last: lastMeas.d },
    documents: { total: get('SELECT COUNT(*) n FROM documents WHERE user_id = ?', userId).n },
    week,
    backup: { last_auto: autos[0] ? autos[0].slice(5) : null, last_file: lastFile || null },
    empty: mk.length + meds.length + appts.length === 0 && !lastMeas.n,
  };
}

// ---------------------------------------------------------------- Busca global
function search(userId, q) {
  const raw = String(q || '').trim();
  if (!raw) return { query: raw, groups: [] };
  const years = [...raw.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => m[0]);
  const words = raw.replace(/\b(19|20)\d{2}\b/g, ' ').toLowerCase()
    .replace(/\b(mostre|mostrar|todos|todas|os|as|de|do|da|e|resultados?|me|quais|exames?\s+de)\b/g, ' ')
    .split(/\s+/).filter((w) => w.length > 1);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const match = (...fields) => {
    const hay = norm(fields.join(' '));
    return words.length === 0 || words.every((w) => hay.includes(norm(w)));
  };
  const inYears = (date) => !years.length || years.includes(String(date).slice(0, 4));
  const groups = [];

  const mk = markers.list(userId, '', [], 'name').filter((m) => words.length && match(m.name, m.category));
  if (mk.length) groups.push({ title: 'Resultados de exames', items: mk.flatMap((m) => {
    const h = markerHistory(userId, m.id);
    return h.points.filter((p) => inYears(p.date)).map((p) => ({ title: `${m.name}: ${p.value_num != null ? fmtNum(p.value_num) : p.value_text} ${p.unit || ''}`.trim(), date: p.date, extra: p.situation, link: `#/exames/marcador/${m.id}` }));
  }).sort((a, b) => b.date.localeCompare(a.date)) });

  const meds = medications.list(userId).filter((m) => match(m.name, m.active_ingredient, m.reason, m.notes));
  if (meds.length) groups.push({ title: 'Medicamentos', items: meds.map((m) => ({ title: `${m.name} ${m.dosage || ''}`.trim(), date: m.start_date, extra: m.status, link: `#/medicamentos/${m.id}` })) });

  const docs = doctors.list(userId).filter((d) => match(d.name, d.specialty, d.crm));
  if (docs.length) groups.push({ title: 'Médicos', items: docs.map((d) => ({ title: d.name, extra: d.specialty, link: '#/configuracoes/medicos' })) });

  const cons = consultations.list(userId, '', [], 'date DESC').filter((c) => inYears(c.date)).filter((c) => {
    const d = c.doctor_id ? get('SELECT name FROM doctors WHERE id = ?', c.doctor_id)?.name : '';
    return match(c.specialty, d, c.location, c.reason, c.symptoms, c.diagnoses, c.conduct, c.prescribed, c.recommendations, c.notes);
  });
  if (cons.length && words.length) groups.push({ title: 'Consultas', items: cons.map((c) => ({ title: `Consulta${c.specialty ? ' — ' + c.specialty : ''}`, date: c.date, extra: c.diagnoses || c.reason, link: `#/consultas/${c.id}` })) });

  const ex = exams.list(userId, '', [], 'collection_date DESC').filter((e) => inYears(e.collection_date) && words.length && match(e.title, e.lab, e.exam_type, e.reason, e.findings, e.conclusion, e.notes));
  if (ex.length) groups.push({ title: 'Exames (laboratório/tipo)', items: ex.map((e) => ({ title: e.title || `Exames${e.lab ? ' — ' + e.lab : ''}`, date: e.collection_date, extra: e.conclusion ? e.conclusion.split('\n')[0] : null, link: `#/exames/${e.id}` })) });

  const ev = events.list(userId, '', [], 'starts_at DESC').filter((e) => inYears(e.starts_at) && words.length && match(e.title, e.location, e.notes, e.type));
  if (ev.length) groups.push({ title: 'Agenda', items: ev.map((e) => ({ title: e.title, date: e.starts_at.slice(0, 10), extra: e.status, link: '#/agenda' })) });

  if (!words.length && years.length) groups.push({ title: 'Eventos no período', items: timeline(userId, { from: `${Math.min(...years)}-01-01`, to: `${Math.max(...years)}-12-31` }).map((t) => ({ title: t.title, date: t.date, link: t.link })) });
  return { query: raw, years, words, groups };
}

// ---------------------------------------------------------------- Exportação completa (decifrada)
function exportAll(userId) {
  const prof = get('SELECT * FROM profiles WHERE user_id = ?', userId) || {};
  for (const f of PROFILE_ENCRYPTED) prof[f] = decrypt(prof[f]);
  delete prof.user_id;
  const dec = (rows, fields) => rows.map((r) => { const o = { ...r }; for (const f of fields) o[f] = decrypt(o[f]); delete o.user_id; return o; });
  return {
    formato: 'helyx', versao: 1, exportado_em: new Date().toISOString(),
    perfil: prof,
    medicos: doctors.list(userId, '', [], 'id'),
    consultas: consultations.list(userId, '', [], 'date'),
    exames_solicitados: all('SELECT * FROM exam_requests WHERE user_id = ?', userId).map(({ user_id, ...r }) => r),
    marcadores: markers.list(userId, '', [], 'name'),
    categorias_exames: all('SELECT id, name, position, created_at FROM exam_categories WHERE user_id = ?', userId),
    exames: exams.list(userId, '', [], 'collection_date'),
    resultados: dec(all('SELECT * FROM exam_results WHERE user_id = ?', userId), ['notes']),
    medicamentos: medications.list(userId, '', [], 'id'),
    medicamentos_versoes: dec(all('SELECT v.* FROM medication_versions v JOIN medications m ON m.id = v.medication_id WHERE m.user_id = ?', userId), ['change_reason', 'snapshot']),
    medicamentos_marcadores: all('SELECT mm.* FROM medication_markers mm JOIN medications m ON m.id = mm.medication_id WHERE m.user_id = ?', userId),
    medicoes: measurements.list(userId, '', [], 'measured_at'),
    agenda: events.list(userId, '', [], 'starts_at'),
    documentos: require('./documents').exportAll(userId),
  };
}

module.exports = { timeline, agenda, dashboard, home, search, exportAll, localDate, addDays };
