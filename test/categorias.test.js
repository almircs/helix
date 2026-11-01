// Categorias dos exames: criar, renomear, ordenar, mover, excluir (sem apagar exames), sugerir e backup.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 9000 + Math.floor(Math.random() * 400); // faixa própria
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'helyx-cat-'));
let server;
after(async () => {
  if (server) { server.kill(); await new Promise((r) => (server.exitCode !== null ? r() : server.once('exit', r))); }
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* Windows */ }
});
const call = async (method, url, body) => {
  const res = await fetch(`http://127.0.0.1:${PORT}/api${url}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};

test('categorias dos exames de imagem', async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'index.js')],
    { env: { ...process.env, PORT, SAUDE_DATA_DIR: DATA, SAUDE_EXIGIR_LOGIN: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

  const rins = (await call('POST', '/exam-categories', { name: 'Rins' })).data;
  const cor = (await call('POST', '/exam-categories', { name: 'Coração' })).data;
  assert.equal((await call('POST', '/exam-categories', { name: 'rins' })).status, 409, 'nome repetido');
  assert.equal((await call('PUT', `/exam-categories/${cor.id}`, { name: 'Coração e vasos' })).status, 200);
  const ordem = (await call('POST', '/exam-categories/order', { ids: [cor.id, rins.id] })).data;
  assert.deepEqual(ordem.map((c) => c.name), ['Coração e vasos', 'Rins']);

  const tc = (await call('POST', '/exams', { collection_date: '2026-08-20', title: 'Tomografia do abdômen total', conclusion: 'Nefrolitíase.', results: [], category_id: rins.id })).data;
  const eco = (await call('POST', '/exams', { collection_date: '2026-09-01', title: 'Ecocardiograma', conclusion: 'Normal.', results: [] })).data;
  assert.equal((await call('GET', `/exams/${tc.id}`)).data.category.name, 'Rins');

  // mover vários de uma vez e mover de volta para "sem categoria"
  assert.equal((await call('POST', '/exam-categories/move', { exam_ids: [tc.id, eco.id], category_id: cor.id })).data.moved, 2);
  assert.equal((await call('GET', '/exam-categories')).data.find((c) => c.id === cor.id).exams, 2);
  await call('POST', '/exam-categories/move', { exam_ids: [tc.id], category_id: rins.id });

  // sugestão ao ler um laudo: a indicação "cálculo renal" leva para a categoria Rins da pessoa
  const text = 'TOMOGRAFIA COMPUTADORIZADA DO ABDÔMEN TOTAL\nIndicação clínica: Verificar cálculo renal.\nAspectos observados:\nRins com cálculos.\nImpressão:\nNefrolitíase bilateral.';
  assert.deepEqual((await call('POST', '/extract', { text })).data.imaging.category, { name: 'Rins', id: rins.id });
  const eco2 = 'ECOCARDIOGRAMA TRANSTORÁCICO\nIndicação: avaliação cardíaca.\nAchados:\nVentrículo esquerdo normal.\nConclusão:\nExame normal.';
  assert.deepEqual((await call('POST', '/extract', { text: eco2 })).data.imaging.category, { name: 'Coração e vasos', id: cor.id });

  // sugeridas: cria as que faltam, sem repetir
  const todas = (await call('POST', '/exam-categories/suggested', { names: ['Próstata', 'Tireoide'] })).data;
  assert.deepEqual(todas.map((c) => c.name), ['Coração e vasos', 'Rins', 'Próstata', 'Tireoide']);

  // backup e restauração mantêm as categorias e a ligação dos exames
  const bk = await fetch(`http://127.0.0.1:${PORT}/api/backup/download`).then((r) => r.json());
  assert.equal((await call('POST', '/backup/restore', { confirm: 'RESTAURAR', data: bk })).status, 200);
  const exams = (await call('GET', '/exams')).data;
  const cats = (await call('GET', '/exam-categories')).data;
  const catOf = (title) => cats.find((c) => c.id === exams.find((e) => e.title === title).category_id)?.name;
  assert.equal(catOf('Tomografia do abdômen total'), 'Rins');
  assert.equal(catOf('Ecocardiograma'), 'Coração e vasos');

  // excluir a categoria não apaga os exames
  const corNovo = cats.find((c) => c.name === 'Coração e vasos');
  assert.equal((await call('DELETE', `/exam-categories/${corNovo.id}`)).status, 200);
  const depois = (await call('GET', '/exams')).data;
  assert.equal(depois.length, 2);
  assert.equal(depois.find((e) => e.title === 'Ecocardiograma').category_id, null);
});
