// Teste rápido rodando DENTRO do Electron (mesmo motor do programa instalado).
// Uso: ELECTRON_RUN_AS_NODE=1 npx electron test/electron-smoke.js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

process.env.SAUDE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'saude-smoke-'));

(async () => {
  let driver = 'node:sqlite';
  try { require('node:sqlite'); } catch { driver = 'better-sqlite3'; }
  console.log(`Electron ${process.versions.electron} · Node ${process.versions.node} · banco: ${driver}`);

  const { start } = require('../server/index.js');
  const { server, url } = await start({ host: '127.0.0.1', port: 0 });
  let cookie = '';
  const call = async (method, p, body) => {
    const r = await fetch(url + '/api' + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  assert.equal((await call('GET', '/auth/me')).data.login, false, 'abre sem login');
  const c = (await call('POST', '/consultations', { date: '2026-09-02', diagnoses: 'x', requests: [{ description: 'Creatinina' }] })).data;
  const e = (await call('POST', '/exams', { collection_date: '2026-09-10', results: [{ marker_name: 'Creatinina', value: '1,4', ref_min: '0,7', ref_max: '1,3' }] })).data;
  assert.equal(e.results[0].situation, 'acima');
  assert.equal((await call('GET', `/consultations/${c.id}`)).data.requests[0].status, 'realizado');
  const m = (await call('POST', '/medications', { name: 'Teste', dosage: '1 mg' })).data;
  assert.equal((await call('PUT', `/medications/${m.id}`, { dosage: '2 mg' })).data.versions.length, 2);
  assert.ok((await call('GET', '/dashboard')).data.alerts.length > 0);
  assert.equal((await call('POST', '/backup')).status, 200);
  const html = await (await fetch(url + '/')).text();
  assert.match(html, /Helyx/);
  server.close();
  console.log('OK — servidor, banco, criptografia e backup funcionando dentro do Electron');
  process.exit(0);
})().catch((err) => { console.error('FALHOU:', err); process.exit(1); });
