// Recuperação e redefinição de senha sem internet: código de recuperação e "pelo computador"
// (código temporário gravado num arquivo da pasta de dados).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 8500 + Math.floor(Math.random() * 400); // faixa própria
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'helyx-rec-'));
let server;
after(async () => {
  if (server) { server.kill(); await new Promise((r) => (server.exitCode !== null ? r() : server.once('exit', r))); }
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* Windows */ }
});

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api${url}`, { method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc && sc.startsWith('sid=')) cookie = sc.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };
}

test('código de recuperação, recuperação pelo computador e redefinição', async () => {
  const env = { ...process.env, PORT, SAUDE_DATA_DIR: DATA }; delete env.SAUDE_EXIGIR_LOGIN;
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: 'pipe' });
  for (let i = 0; i < 300; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

  // ao criar a conta, aparece o código de recuperação (uma única vez)
  const a = client();
  const reg = await a('POST', '/auth/register', { email: 'carlos', password: 'senha1234' });
  assert.equal(reg.status, 200);
  assert.match(reg.data.recovery_code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await a('POST', '/exams', { collection_date: '2026-10-01', results: [{ marker_name: 'Creatinina', value: '1,2' }] });
  assert.equal((await a('GET', '/auth/me')).data.has_recovery, true);

  // esqueceu a senha: código errado não serve; o certo cria a senha nova e gera outro código
  const b = client();
  assert.equal((await b('POST', '/auth/recover/code', { email: 'carlos', code: 'AAAA-BBBB-CCCC-DDDD', password: 'nova12345' })).status, 401);
  const rec = await b('POST', '/auth/recover/code', { email: 'carlos', code: reg.data.recovery_code.toLowerCase(), password: 'nova12345' });
  assert.equal(rec.status, 200);
  assert.notEqual(rec.data.recovery_code, reg.data.recovery_code);
  assert.equal((await b('GET', '/exams')).data.length, 1, 'os dados continuam');
  assert.equal((await a('GET', '/exams')).status, 401, 'sessões antigas encerradas');
  assert.equal((await b('POST', '/auth/recover/code', { email: 'carlos', code: reg.data.recovery_code, password: 'outra1234' })).status, 401, 'código antigo não vale mais');
  assert.equal((await client()('POST', '/auth/login', { email: 'carlos', password: 'senha1234' })).status, 401, 'senha antiga não vale');

  // pelo computador: o código vai para um arquivo na pasta de dados
  const c = client();
  assert.equal((await c('POST', '/auth/recover/computer/start', { email: 'ninguem' })).status, 404);
  const st = await c('POST', '/auth/recover/computer/start', { email: 'carlos' });
  assert.equal(st.status, 200);
  const file = path.join(DATA, 'RECUPERAR-SENHA.txt');
  const code = fs.readFileSync(file, 'utf8').match(/Código: ([A-Z2-9-]+)/)[1];
  assert.equal((await c('POST', '/auth/recover/computer/finish', { email: 'carlos', code: 'XXXX-XXXX', password: 'pc123456' })).status, 401);
  assert.equal((await c('POST', '/auth/recover/computer/finish', { email: 'carlos', code, password: 'pc123456' })).status, 200);
  assert.ok(!fs.existsSync(file), 'o arquivo é apagado depois de usado');
  assert.equal((await c('POST', '/auth/recover/computer/finish', { email: 'carlos', code, password: 'pc999999' })).status, 410, 'código só vale uma vez');
  assert.equal((await client()('POST', '/auth/login', { email: 'carlos', password: 'pc123456' })).status, 200);

  // redefinir senha e gerar novo código, já dentro do programa
  assert.equal((await c('POST', '/auth/recovery-code', { password: 'errada123' })).status, 401);
  assert.match((await c('POST', '/auth/recovery-code', { password: 'pc123456' })).data.recovery_code, /^[A-Z2-9-]{19}$/);
  assert.equal((await c('POST', '/auth/password', { current: 'pc123456', password: 'final1234' })).status, 200);
  assert.equal((await client()('POST', '/auth/login', { email: 'carlos', password: 'final1234' })).status, 200);
});
