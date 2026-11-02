// Controle de doses: doses do dia a partir dos horários, "tomei"/"não tomei", resumo, familiar e backup.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 9900 + Math.floor(Math.random() * 90); // faixa própria
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'helyx-senior-'));
let server;
after(async () => {
  if (server) { server.kill(); await new Promise((r) => (server.exitCode !== null ? r() : server.once('exit', r))); }
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* Windows */ }
});
const call = async (method, url, body) => {
  const res = await fetch(`http://127.0.0.1:${PORT}/api${url}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test('controle de doses, família e backup', async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'index.js')],
    { env: { ...process.env, PORT, SAUDE_DATA_DIR: DATA, SAUDE_EXIGIR_LOGIN: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 300; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

  const a = (await call('POST', '/medications', { name: 'Losartana', dosage: '50 mg', frequency: '2 vezes ao dia', schedule: '08:00 e 20h', start_date: day(-10) })).data;
  await call('POST', '/medications', { name: 'Vitamina D', frequency: '1 vez por semana', schedule: '09:00', start_date: day(-10) }); // semanal: fora do dia
  await call('POST', '/medications', { name: 'Antigo', schedule: '07:00', status: 'suspenso' });                                        // suspenso: fora

  let d = (await call('GET', '/doses')).data;
  assert.equal(d.enabled, false, 'controle de doses começa desligado');
  assert.equal((await call('GET', '/home')).data.doses_today, null);
  assert.equal((await call('PUT', '/doses/settings', { enabled: true })).data.enabled, true);
  d = (await call('GET', '/doses')).data;
  assert.equal(d.enabled, true);
  assert.deepEqual(d.doses.map((x) => `${x.time} ${x.name}`), ['08:00 Losartana', '20:00 Losartana']);
  assert.equal(d.total, 2); assert.equal(d.taken, 0);

  // anotar, trocar e desfazer
  d = (await call('POST', '/doses', { medication_id: a.id, time: '08:00', status: 'tomado' })).data;
  assert.equal(d.taken, 1);
  assert.match(d.doses[0].at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  d = (await call('POST', '/doses', { medication_id: a.id, time: '20:00', status: 'pulado' })).data;
  assert.equal(d.skipped, 1);
  d = (await call('POST', '/doses', { medication_id: a.id, time: '20:00', status: null })).data;
  assert.equal(d.skipped, 0);
  assert.equal((await call('POST', '/doses', { medication_id: a.id, time: '13:00', status: 'tomado' })).status, 400, 'horário que não existe');
  assert.equal((await call('POST', '/doses', { medication_id: a.id, time: '08:00', date: day(1), status: 'tomado' })).status, 400, 'dia futuro');
  assert.equal((await call('POST', '/doses', { medication_id: 9999, time: '08:00', status: 'tomado' })).status, 404);
  // ontem: dose sem anotação aparece como atrasada
  await call('POST', '/doses', { medication_id: a.id, time: '08:00', date: day(-1), status: 'tomado' });
  const ontem = (await call('GET', `/doses?date=${day(-1)}`)).data;
  assert.equal(ontem.doses.find((x) => x.time === '20:00').late, true);

  const hist = (await call('GET', '/doses/history?days=7')).data;
  assert.equal(hist.length, 2, 'começa no primeiro dia anotado (ontem)');
  assert.deepEqual([hist[1].total, hist[1].taken, hist[1].missing], [2, 1, 1]);

  // familiar que acompanha
  assert.equal((await call('PUT', '/family', { name: 'Ana', phone: '123' })).status, 400);
  const fam = (await call('PUT', '/family', { name: 'Ana', phone: '(31) 99999-8888', include_names: false })).data;
  assert.deepEqual([fam.name, fam.phone, fam.include_names], ['Ana', '31999998888', false]);

  // página inicial: só contagem de doses, sem o nome do remédio
  const home = (await call('GET', '/home')).data;
  assert.deepEqual(home.doses_today, { total: 2, taken: 1, skipped: 0 });
  assert.ok(!JSON.stringify(home).includes('Losartana'));

  // backup leva as doses e o familiar; restaurar devolve tudo
  const bk = (await call('GET', '/backup/download')).data;
  assert.equal(bk.doses.length, 2);
  assert.equal(bk.familia.phone, '31999998888');
  await call('PUT', '/family', {});
  assert.equal((await call('GET', '/family')).data.phone, '');
  assert.equal((await call('POST', '/backup/restore', { data: bk, confirm: 'RESTAURAR' })).status, 200);
  assert.equal((await call('GET', '/family')).data.name, 'Ana');
  d = (await call('GET', '/doses')).data;
  assert.equal(d.enabled, true, 'a opção volta com o backup');
  assert.equal(d.taken, 1, 'dose de hoje voltou com o remédio novo (id remapeado)');
});
