// Testes de ponta a ponta da API. Rodar: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 4500 + Math.floor(Math.random() * 400);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'saude-test-'));
let server; let cookie = '';

async function call(method, url, body, useCookie = true) {
  const res = await fetch(`http://127.0.0.1:${PORT}/api${url}`, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(useCookie && cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get('set-cookie'); if (sc && sc.startsWith('sid=') && useCookie) cookie = sc.split(';')[0];
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
}

before(async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT, SAUDE_DATA_DIR: DATA }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error('servidor não subiu');
});
after(() => { server.kill(); fs.rmSync(DATA, { recursive: true, force: true }); });

test('autenticação e controle de acesso', async () => {
  assert.equal((await call('GET', '/dashboard')).status, 401);
  assert.equal((await call('POST', '/auth/register', { email: 'a@a.com', password: 'curta' })).status, 400);
  assert.equal((await call('POST', '/auth/register', { email: 'a@a.com', password: 'senha1234', full_name: 'Ana' })).status, 200);
  assert.equal((await call('GET', '/auth/me')).data.email, 'a@a.com');
});

test('fluxo completo: consulta → pedido → exame → resultado → medicamento', async () => {
  const doc = (await call('POST', '/doctors', { name: 'Dra. Teste', specialty: 'Nefrologia' })).data;
  const c = (await call('POST', '/consultations', { date: '2026-09-02', specialty: 'Nefrologia', doctor_id: doc.id, diagnoses: 'texto sigiloso', requests: [{ description: 'Renina' }, { description: 'Creatinina' }] })).data;
  assert.equal(c.requests.length, 2);
  assert.ok(c.requests.every((r) => r.status === 'pendente'));

  await call('POST', '/exams', { collection_date: '2026-05-23', results: [{ marker_name: 'Creatinina', value: '1,57', unit: 'mg/dL', ref_min: '0,7', ref_max: '1,3' }] });
  const e = (await call('POST', '/exams', { collection_date: '2026-09-10', results: [{ marker_name: 'creatinina', value: '1,48' }, { marker_name: 'Renina', value: '< 0,5', unit: 'ng/mL/h' }] })).data;
  const cre = e.results.find((r) => r.marker_name === 'Creatinina');
  assert.equal(cre.value_num, 1.48);
  assert.equal(cre.situation, null); // sem referência neste laudo → usa catálogo só no histórico
  assert.equal(cre.previous.direction, 'reducao');
  assert.equal(e.results.find((r) => r.marker_name === 'Renina').value_text, '< 0,5');
  assert.equal(e.consultation_id, c.id, 'exame vinculado automaticamente à consulta solicitante');

  const c2 = (await call('GET', `/consultations/${c.id}`)).data;
  assert.ok(c2.requests.every((r) => r.status === 'realizado'));

  const h = (await call('GET', `/markers/${cre.marker_id}/history`)).data;
  assert.deepEqual(h.points.map((p) => p.situation), ['acima', 'acima']);
  assert.equal(h.summary.out_of_range, 2);

  const m = (await call('POST', '/medications', { name: 'Valsartana', dosage: '320 mg', start_date: '2026-01-01', marker_names: ['Creatinina', 'Potássio'] })).data;
  assert.equal(m.versions.length, 1);
  const m2 = (await call('PUT', `/medications/${m.id}`, { dosage: '160 mg', effective_date: '2026-09-15', change_reason: 'ajuste' })).data;
  assert.equal(m2.versions.length, 2);
  assert.equal(m2.versions[0].dosage, '320 mg', 'histórico preservado');
  const rel = (await call('GET', `/medications/${m.id}/related`)).data;
  assert.match(rel.aviso, /temporal/);
  assert.equal(rel.around[1].markers.find((k) => k.marker === 'Creatinina').before.value, 1.48);

  const tl = (await call('GET', '/timeline')).data;
  assert.ok(tl.some((i) => i.kind === 'consulta') && tl.some((i) => i.kind === 'exame') && tl.some((i) => i.kind === 'medicamento'));
  const s = (await call('GET', '/search?q=creatinina 2026')).data;
  assert.equal(s.groups[0].items.length, 2);
});

test('agenda, medições e dashboard', async () => {
  const today = new Date(); const d = today.toISOString().slice(0, 10);
  assert.equal((await call('POST', '/events', { type: 'exame', title: 'Coleta', starts_at: `${d} 23:59` })).status, 200);
  assert.equal((await call('POST', '/events', { type: 'exame', title: 'X', starts_at: 'amanhã' })).status, 400);
  assert.equal((await call('POST', '/measurements', { type: 'pressao', measured_at: `${d} 08:00`, value1: '130', value2: '85' })).status, 200);
  const dash = (await call('GET', '/dashboard')).data;
  assert.ok(dash.indicators.find((i) => i.type === 'pressao'));
  assert.ok(dash.alerts.some((a) => a.kind === 'fora_referencia'));
});

test('isolamento entre usuários e criptografia', async () => {
  const mine = cookie;
  cookie = '';
  await call('POST', '/auth/register', { email: 'b@b.com', password: 'outra1234' });
  assert.equal((await call('GET', '/consultations/1')).status, 404);
  assert.equal((await call('POST', '/exams', { collection_date: '2026-01-01', consultation_id: 1 })).status, 400);
  assert.equal((await call('GET', '/exams')).data.length, 0);
  cookie = mine;
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(DATA, 'saude.db'));
  const row = db.prepare('SELECT diagnoses FROM consultations WHERE id = 1').get();
  assert.match(row.diagnoses, /^enc1:/);
  assert.ok(!row.diagnoses.includes('sigiloso'));
  db.close();
});

test('exportação e exclusão de conta', async () => {
  const exp = (await call('GET', '/export')).data;
  assert.equal(exp.consultas[0].diagnoses, 'texto sigiloso');
  assert.equal((await call('POST', '/account/delete', { password: 'errada000', confirm: 'EXCLUIR' })).status, 401);
  assert.equal((await call('POST', '/account/delete', { password: 'senha1234', confirm: 'EXCLUIR' })).status, 200);
  assert.equal((await call('POST', '/auth/login', { email: 'a@a.com', password: 'senha1234' })).status, 401);
});
