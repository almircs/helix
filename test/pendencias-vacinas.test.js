// Pendências (automáticas e manuais, com ação, status e prazo) e vacinas (próximas doses na agenda e nas pendências).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 9500 + Math.floor(Math.random() * 400); // faixa própria
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'helyx-pend-'));
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

test('pendências editáveis e vacinas', async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'index.js')],
    { env: { ...process.env, PORT, SAUDE_DATA_DIR: DATA, SAUDE_EXIGIR_LOGIN: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

  // pendência automática: exame pedido numa consulta e ainda não feito
  const c = (await call('POST', '/consultations', { date: day(-10), specialty: 'Nefrologia', requests: [{ description: 'Creatinina' }] })).data;
  // vacina com dose atrasada
  const flu = (await call('POST', '/vaccines', { name: 'Influenza (gripe)', dose: 'Dose anual', applied_date: day(-370), next_date: day(-5), place: 'Posto' })).data;
  assert.equal((await call('POST', '/vaccines', { dose: 'x' })).status, 400, 'nome obrigatório');

  let p = (await call('GET', '/pendencias')).data;
  const pedido = p.open.find((x) => x.kind === 'pedido');
  assert.equal(pedido.title, 'Fazer o exame pedido: Creatinina');
  assert.equal(pedido.link, `#/consultas/${c.id}`);
  assert.ok(p.open.some((x) => x.kind === 'vacina' && x.title.startsWith('Vacina: Influenza')));

  // ação e status de uma automática
  assert.equal((await call('PUT', `/pendencias/${encodeURIComponent(pedido.key)}`, { action: 'Coleta marcada para segunda', status: 'em_andamento', due_date: day(3) })).status, 200);
  p = (await call('GET', '/pendencias')).data;
  const editado = p.open.find((x) => x.key === pedido.key);
  assert.deepEqual([editado.action, editado.status, editado.due_date], ['Coleta marcada para segunda', 'em_andamento', day(3)]);
  assert.equal((await call('PUT', `/pendencias/${encodeURIComponent(pedido.key)}`, { status: 'xyz' })).status, 400);

  // pendência manual: criar, concluir, excluir
  const m = (await call('POST', '/pendencias', { title: 'Marcar retorno com o cardiologista', due_date: day(7) })).data;
  assert.equal((await call('PUT', `/pendencias/${encodeURIComponent(m.key)}`, { status: 'concluida' })).status, 200);
  p = (await call('GET', '/pendencias')).data;
  assert.ok(p.done.some((x) => x.key === m.key && x.title === 'Marcar retorno com o cardiologista'));
  assert.equal((await call('DELETE', `/pendencias/${encodeURIComponent(pedido.key)}`)).status, 400, 'automática não se exclui');
  assert.equal((await call('DELETE', `/pendencias/${encodeURIComponent(m.key)}`)).status, 200);

  // página inicial: só a quantidade e os tipos, sem nomes
  const home = (await call('GET', '/home')).data;
  assert.equal(home.pending.count, 2);
  assert.deepEqual(home.pending.areas.sort(), ['Pedidos de exame', 'Vacinas']);
  assert.ok(!JSON.stringify(home.pending).includes('Creatinina'));

  // registrar a dose nova tira a vacina das pendências; a próxima dose vai para a agenda
  await call('POST', '/vaccines', { name: 'influenza (gripe)', dose: 'Dose anual', applied_date: day(0), next_date: day(20) });
  p = (await call('GET', '/pendencias')).data;
  const vac = p.open.filter((x) => x.kind === 'vacina');
  assert.equal(vac.length, 1, 'só a previsão do registro mais recente');
  assert.notEqual(vac[0].key, `vacina:${flu.id}`);
  assert.ok((await call('GET', `/agenda?from=${day(0)}&to=${day(30)}`)).data.some((e) => e.type === 'vacina' && e.date === day(20)));
  assert.ok((await call('GET', '/timeline?kinds=vacina')).data.some((e) => e.kind === 'vacina'));

  // quando o exame pedido é lançado, a pendência some sozinha
  await call('POST', '/exams', { collection_date: day(0), consultation_id: c.id, results: [{ marker_name: 'Creatinina', value: '1,0' }] });
  p = (await call('GET', '/pendencias')).data;
  assert.ok(!p.open.some((x) => x.kind === 'pedido'));

  // backup e restauração levam vacinas e pendências
  await call('POST', '/pendencias', { title: 'Levar exames na consulta' });
  const bk = await fetch(`http://127.0.0.1:${PORT}/api/backup/download`).then((r) => r.json());
  assert.equal((await call('POST', '/backup/restore', { confirm: 'RESTAURAR', data: bk })).status, 200);
  assert.equal((await call('GET', '/vaccines')).data.length, 2);
  assert.ok((await call('GET', '/pendencias')).data.open.some((x) => x.title === 'Levar exames na consulta'));
});
