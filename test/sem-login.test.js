// Modo sem senha (SAUDE_EXIGIR_LOGIN=0): o programa abre direto num perfil único deste computador.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 5000 + Math.floor(Math.random() * 400);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'saude-semlogin-'));
let server;
const env = { ...process.env, PORT, SAUDE_DATA_DIR: DATA };
env.SAUDE_EXIGIR_LOGIN = '0';

async function call(method, url, body) {
  const res = await fetch(`http://127.0.0.1:${PORT}/api${url}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}

before(async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error('servidor não subiu');
});
after(() => { server.kill(); fs.rmSync(DATA, { recursive: true, force: true }); });

test('abre sem login e grava no perfil local', async () => {
  const me = await call('GET', '/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.login, false);
  assert.equal((await call('POST', '/exams', { collection_date: '2026-10-01', results: [{ marker_name: 'Creatinina', value: '1,2' }] })).status, 200);
  assert.equal((await call('GET', '/exams')).data.length, 1);
  assert.equal((await call('GET', '/auth/me')).data.id, me.data.id, 'sempre o mesmo perfil');
});

test('excluir tudo funciona sem senha e recomeça vazio', async () => {
  assert.equal((await call('POST', '/account/delete', { confirm: 'errado' })).status, 400);
  assert.equal((await call('POST', '/account/delete', { confirm: 'EXCLUIR' })).status, 200);
  assert.equal((await call('GET', '/exams')).data.length, 0);
});
