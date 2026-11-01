// "Já uso o Helyx em outro aparelho": o backup leva a conta (usuário e senha embaralhada) e,
// em outro aparelho, cria a mesma conta — só com a senha certa — e traz os dados.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const servers = []; const dirs = [];
after(async () => {
  for (const s of servers) { s.kill(); await new Promise((r) => (s.exitCode !== null ? r() : s.once('exit', r))); }
  for (const d of dirs) try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* Windows */ }
});

async function boot(port) {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'helyx-trazer-')); dirs.push(DATA);
  const env = { ...process.env, PORT: port, SAUDE_DATA_DIR: DATA }; delete env.SAUDE_EXIGIR_LOGIN;
  servers.push(spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: 'pipe' }));
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  return () => {
    let cookie = '';
    return async (method, url, body) => {
      const res = await fetch(`http://127.0.0.1:${port}/api${url}`, { method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.get('set-cookie'); if (sc && sc.startsWith('sid=')) cookie = sc.split(';')[0];
      return { status: res.status, data: await res.json().catch(() => null) };
    };
  };
}

test('trazer a conta e os dados de outro aparelho pelo backup', async () => {
  const base = 10000 + Math.floor(Math.random() * 400); // faixa própria
  const computador = (await boot(base))();
  await computador('POST', '/auth/register', { email: 'carlos', password: 'senha1234', full_name: 'Carlos' });
  await computador('POST', '/exams', { collection_date: '2026-10-01', results: [{ marker_name: 'Creatinina', value: '1,2' }] });
  const backup = (await computador('GET', '/backup/download')).data;
  assert.equal(backup.conta.usuario, 'carlos');
  assert.match(backup.conta.senha_hash, /^scrypt\$/, 'só a senha embaralhada, nunca a senha em si');
  assert.ok(!JSON.stringify(backup).includes('senha1234'));

  const novoAparelho = await boot(base + 1);
  const celular = novoAparelho();
  assert.equal((await celular('POST', '/auth/import-account', { data: backup, password: 'errada123' })).status, 401);
  const r = await celular('POST', '/auth/import-account', { data: backup, password: 'senha1234' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.usuario, 'carlos');
  assert.equal((await celular('GET', '/exams')).data.length, 1, 'dados trazidos e já entrou na conta');
  assert.equal((await celular('POST', '/auth/import-account', { data: backup, password: 'senha1234' })).status, 409, 'não duplica a conta');
  assert.equal((await novoAparelho()('POST', '/auth/login', { email: 'carlos', password: 'senha1234' })).status, 200, 'mesmo usuário e senha');

  // backup antigo, sem a conta: cria uma conta nova com o usuário e a senha informados
  const antigo = { ...backup, conta: null };
  assert.equal((await novoAparelho()('POST', '/auth/import-account', { data: antigo, password: 'nova12345' })).status, 400, 'precisa do usuário');
  const a2 = await novoAparelho()('POST', '/auth/import-account', { data: antigo, email: 'esposa', password: 'nova12345' });
  assert.equal(a2.status, 200);
  assert.equal((await novoAparelho()('POST', '/auth/login', { email: 'esposa', password: 'nova12345' })).status, 200);
});
