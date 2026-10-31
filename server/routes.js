// Todas as rotas da API (prefixo /api).
const { Router, HttpError } = require('./lib/http');
const auth = require('./lib/auth');
const audit = require('./lib/audit');
const { get, run, tx } = require('./db');
const { encrypt, decrypt } = require('./lib/crypto');
const M = require('./models');
const examsSvc = require('./services/exams');
const consSvc = require('./services/consultations');
const medsSvc = require('./services/medications');
const ov = require('./services/overview');
const ai = require('./services/ai');

const r = new Router();
const A = auth.requireAuth;
const uid = (ctx) => ctx.user.id;

// ---------- Autenticação
r.post('/api/auth/register', auth.register);
r.post('/api/auth/login', auth.login);
r.post('/api/auth/logout', auth.logout);
r.get('/api/auth/state', () => auth.state());
r.post('/api/auth/setup', auth.setup);
r.get('/api/auth/me', A, (ctx) => ({ id: ctx.user.id, email: ctx.user.email, login: auth.requireLogin(),
  name: get('SELECT full_name FROM profiles WHERE user_id = ?', ctx.user.id)?.full_name || null }));
r.post('/api/auth/password', A, auth.changePassword);

// ---------- Perfil
r.get('/api/profile', A, (ctx) => {
  const p = get('SELECT * FROM profiles WHERE user_id = ?', uid(ctx)) || {};
  for (const f of M.PROFILE_ENCRYPTED) p[f] = decrypt(p[f]);
  delete p.user_id;
  p.reference_doctors = M.doctors.list(uid(ctx), 'is_reference = 1', [], 'name');
  return p;
});
r.put('/api/profile', A, (ctx) => {
  const before = get('SELECT * FROM profiles WHERE user_id = ?', uid(ctx));
  const data = {};
  for (const f of M.PROFILE_FIELDS) if (f in ctx.body) {
    let v = ctx.body[f]; if (typeof v === 'string') v = v.trim(); if (v === '') v = null;
    if ((f === 'weight_kg' || f === 'height_cm') && v != null) v = require('./lib/resource').toNumber(v);
    if (f === 'birth_date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, 'Data de nascimento inválida');
    data[f] = M.PROFILE_ENCRYPTED.includes(f) ? encrypt(v) : v;
  }
  const cols = Object.keys(data);
  if (!before) run('INSERT INTO profiles (user_id) VALUES (?)', uid(ctx));
  if (cols.length) run(`UPDATE profiles SET ${cols.map((c) => c + ' = ?').join(', ')}, updated_at = datetime('now') WHERE user_id = ?`, ...cols.map((c) => data[c]), uid(ctx));
  audit.log(uid(ctx), 'perfil', uid(ctx), 'alterar', null, { campos: cols });
  return { ok: true };
});

// ---------- CRUD simples
function crud(base, res, { list, getOne } = {}) {
  r.get(`/api/${base}`, A, (ctx) => (list ? list(ctx) : res.list(uid(ctx))));
  r.get(`/api/${base}/:id`, A, (ctx) => (getOne ? getOne(ctx) : res.get(uid(ctx), ctx.params.id)));
  r.post(`/api/${base}`, A, (ctx) => res.create(uid(ctx), ctx.body));
  r.put(`/api/${base}/:id`, A, (ctx) => res.update(uid(ctx), ctx.params.id, ctx.body));
  r.delete(`/api/${base}/:id`, A, (ctx) => res.remove(uid(ctx), ctx.params.id));
}
crud('doctors', M.doctors, { list: (ctx) => M.doctors.list(uid(ctx), '', [], 'name COLLATE NOCASE') });
crud('measurements', M.measurements, { list: (ctx) => {
  const w = []; const p = [];
  if (ctx.query.type) { w.push('type = ?'); p.push(ctx.query.type); }
  if (ctx.query.from) { w.push('measured_at >= ?'); p.push(ctx.query.from); }
  return M.measurements.list(uid(ctx), w.join(' AND '), p, 'measured_at DESC');
} });
crud('events', M.events, { list: (ctx) => ov.agenda(uid(ctx), ctx.query.from || '0000-01-01', ctx.query.to || '9999-12-31') });

// ---------- Marcadores (catálogo e evolução)
r.get('/api/markers', A, (ctx) => examsSvc.listMarkers(uid(ctx)));
r.get('/api/markers/:id/history', A, (ctx) => examsSvc.markerHistory(uid(ctx), ctx.params.id, ctx.query));
r.put('/api/markers/:id', A, (ctx) => M.markers.update(uid(ctx), ctx.params.id, ctx.body));
r.post('/api/markers/:id/merge', A, (ctx) => examsSvc.mergeMarker(uid(ctx), ctx.params.id, ctx.body.into_id));
r.get('/api/compare', A, (ctx) => String(ctx.query.markers || '').split(',').filter(Boolean).slice(0, 6)
  .map((id) => examsSvc.markerHistory(uid(ctx), id, ctx.query)));

// ---------- Exames
r.get('/api/exams', A, (ctx) => examsSvc.listExams(uid(ctx), ctx.query));
r.get('/api/exams/:id', A, (ctx) => examsSvc.getExam(uid(ctx), ctx.params.id));
r.post('/api/exams', A, (ctx) => examsSvc.saveExam(uid(ctx), ctx.body));
r.put('/api/exams/:id', A, (ctx) => examsSvc.saveExam(uid(ctx), ctx.body, ctx.params.id));
r.delete('/api/exams/:id', A, (ctx) => examsSvc.removeExam(uid(ctx), ctx.params.id));

// ---------- Consultas
r.get('/api/consultations', A, (ctx) => consSvc.listConsultations(uid(ctx), ctx.query));
r.get('/api/consultations/:id', A, (ctx) => consSvc.getConsultation(uid(ctx), ctx.params.id));
r.post('/api/consultations', A, (ctx) => consSvc.saveConsultation(uid(ctx), ctx.body));
r.put('/api/consultations/:id', A, (ctx) => consSvc.saveConsultation(uid(ctx), ctx.body, ctx.params.id));
r.delete('/api/consultations/:id', A, (ctx) => M.consultations.remove(uid(ctx), ctx.params.id));
r.get('/api/exam-requests', A, (ctx) => require('./db').all(`SELECT r.id, r.description, r.status, r.consultation_id, c.date, c.specialty
  FROM exam_requests r JOIN consultations c ON c.id = r.consultation_id WHERE r.user_id = ? AND r.status = 'pendente' ORDER BY c.date DESC`, uid(ctx)));

// ---------- Medicamentos
r.get('/api/medications', A, (ctx) => medsSvc.listMedications(uid(ctx), ctx.query));
r.get('/api/medications/:id', A, (ctx) => medsSvc.getMedication(uid(ctx), ctx.params.id));
r.get('/api/medications/:id/related', A, (ctx) => medsSvc.related(uid(ctx), ctx.params.id));
r.post('/api/medications', A, (ctx) => medsSvc.createMedication(uid(ctx), ctx.body));
r.put('/api/medications/:id', A, (ctx) => medsSvc.updateMedication(uid(ctx), ctx.params.id, ctx.body));
r.put('/api/medications/:id/markers', A, (ctx) => { medsSvc.setMarkers(uid(ctx), M.medications.get(uid(ctx), ctx.params.id).id, ctx.body.marker_names || [], ctx.body.marker_ids || []); return medsSvc.getMedication(uid(ctx), ctx.params.id); });
r.delete('/api/medications/:id', A, (ctx) => medsSvc.removeMedication(uid(ctx), ctx.params.id));

// ---------- Documentos
const docs = require('./services/documents');
r.get('/api/documents', A, (ctx) => docs.list(uid(ctx), ctx.query));
r.get('/api/documents/:id', A, (ctx) => docs.getOne(uid(ctx), ctx.params.id));
r.post('/api/documents', A, (ctx) => docs.create(uid(ctx), ctx.body));
r.put('/api/documents/:id', A, (ctx) => docs.update(uid(ctx), ctx.params.id, ctx.body));
r.delete('/api/documents/:id', A, (ctx) => docs.remove(uid(ctx), ctx.params.id));
r.get('/api/documents/:id/file', A, (ctx) => {
  const f = docs.readFile(uid(ctx), ctx.params.id);
  const res = ctx.res;
  res.statusCode = 200;
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'");
  res.setHeader('Content-Disposition', `${ctx.query.baixar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.end(f.buffer);
});

// ---------- Leitura de dados de arquivos (laudos, receitas, pedidos, planilhas)
r.post('/api/extract', A, (ctx) => require('./services/extract').analyze(uid(ctx), ctx.body));

// ---------- Visões integradas
r.get('/api/dashboard', A, (ctx) => ov.dashboard(uid(ctx)));
r.get('/api/home', A, (ctx) => ov.home(uid(ctx)));
r.get('/api/timeline', A, (ctx) => ov.timeline(uid(ctx), ctx.query));
r.get('/api/agenda', A, (ctx) => ov.agenda(uid(ctx), ctx.query.from, ctx.query.to));
r.get('/api/search', A, (ctx) => ov.search(uid(ctx), ctx.query.q));
r.get('/api/meta', A, () => ({ measurement_types: M.MEASUREMENT_TYPES }));

// ---------- IA (preparado para a etapa 4)
r.get('/api/ai/context', A, (ctx) => ai.buildContext(uid(ctx), { months: Number(ctx.query.months) || 12, specialty: ctx.query.specialty }));
r.post('/api/ai/ask', A, (ctx) => ai.ask(uid(ctx), ctx.body.question));

// ---------- Privacidade: exportação, registro de alterações, exclusão total
r.get('/api/export', A, (ctx) => {
  audit.log(uid(ctx), 'dados', null, 'exportar', null, null);
  ctx.res.setHeader('Content-Disposition', `attachment; filename="prontuario-${ov.localDate()}.json"`);
  return ov.exportAll(uid(ctx));
});
r.get('/api/system', A, (ctx) => {
  const cfg = require('./config');
  return { data_dir: cfg.dataDir, backups_dir: require('./lib/backup').dir(), backups: require('./services/restore').listFiles(ctx.user.id).map((b) => b.name).slice(0, 10), desktop: !!process.versions.electron };
});
const restoreSvc = require('./services/restore');
r.post('/api/backup', A, (ctx) => {
  const target = restoreSvc.saveFile(uid(ctx));
  audit.log(uid(ctx), 'dados', null, 'backup', null, null);
  return { ok: true, path: target };
});
r.get('/api/backup/list', A, (ctx) => restoreSvc.listFiles(uid(ctx)));
r.get('/api/backup/download', A, (ctx) => {
  audit.log(uid(ctx), 'dados', null, 'baixar backup', null, null);
  ctx.res.setHeader('Content-Disposition', `attachment; filename="${restoreSvc.downloadName()}"`);
  return ov.exportAll(uid(ctx));
});
r.post('/api/backup/preview', A, (ctx) => { restoreSvc.validate(ctx.body.data); return { exportado_em: ctx.body.data.exportado_em, ...restoreSvc.summary(ctx.body.data) }; });
r.post('/api/backup/restore', A, (ctx) => {
  if (ctx.body.confirm !== 'RESTAURAR') throw new HttpError(400, 'Confirme digitando RESTAURAR.');
  return ctx.body.name ? restoreSvc.restoreLocal(uid(ctx), ctx.body.name) : restoreSvc.restore(uid(ctx), ctx.body.data);
});
r.get('/api/audit', A, (ctx) => audit.list(uid(ctx), Number(ctx.query.limit) || 200));
r.post('/api/account/delete', A, (ctx) => {
  if (auth.requireLogin() && !auth.verifyPasswordOf(uid(ctx), ctx.body.password)) throw new HttpError(401, 'Senha incorreta.');
  if (ctx.body.confirm !== 'EXCLUIR') throw new HttpError(400, 'Digite EXCLUIR para confirmar.');
  require('./services/documents').wipeFiles(uid(ctx));
  tx(() => {
    run('DELETE FROM exam_results WHERE user_id = ?', uid(ctx));
    run('DELETE FROM users WHERE id = ?', uid(ctx)); // ON DELETE CASCADE remove o restante
  });
  ctx.setCookie('sid', '', { maxAge: 0 });
  return { ok: true };
});

module.exports = r;
