// Contas com senha (padrão a partir da 1.5.0): quem usava o programa sem senha faz o primeiro acesso,
// escolhe usuário e senha e continua com os mesmos dados; outras pessoas criam contas separadas.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'helyx-contas-'));
let server;
after(async () => {
  if (server) { server.kill(); await new Promise((r) => (server.exitCode !== null ? r() : server.once('exit', r))); }
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* Windows pode segurar o arquivo por instantes */ }
});

async function boot(extraEnv) {
  if (server) { server.kill(); await new Promise((r) => (server.exitCode !== null ? r() : server.once('exit', r))); }
  const PORT = 7000 + Math.floor(Math.random() * 400);
  const env = { ...process.env, PORT, SAUDE_DATA_DIR: DATA, ...extraEnv };
  if (!('SAUDE_EXIGIR_LOGIN' in extraEnv)) delete env.SAUDE_EXIGIR_LOGIN;
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: 'pipe' });
  for (let i = 0; i < 300; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  // cada "navegador" guarda o próprio cookie de sessão
  return () => {
    let cookie = '';
    return async (method, url, body) => {
      const res = await fetch(`http://127.0.0.1:${PORT}/api${url}`, { method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.get('set-cookie'); if (sc && sc.startsWith('sid=')) cookie = sc.split(';')[0];
      return { status: res.status, data: await res.json().catch(() => null) };
    };
  };
}

test('primeiro acesso mantém os dados e cada conta vê só os seus', async () => {
  // versão antiga: sem senha, dados no perfil único
  let browser = await boot({ SAUDE_EXIGIR_LOGIN: '0' });
  const old = browser();
  assert.equal((await old('POST', '/exams', { collection_date: '2026-10-01', results: [{ marker_name: 'Creatinina', value: '1,2' }] })).status, 200);

  // nova versão: login ligado por padrão
  browser = await boot({});
  const carlos = browser();
  assert.equal((await carlos('GET', '/exams')).status, 401, 'sem entrar não vê nada');
  assert.deepEqual((await carlos('GET', '/auth/state')).data, { login: true, setup: true, has_users: true });
  assert.equal((await carlos('POST', '/auth/setup', { email: 'carlos', password: 'curta' })).status, 400);
  assert.equal((await carlos('POST', '/auth/setup', { email: 'carlos', password: 'senha1234', full_name: 'Carlos Almir' })).status, 200);
  assert.equal((await carlos('GET', '/exams')).data.length, 1, 'os dados de antes ficaram na conta');
  assert.equal((await carlos('GET', '/auth/me')).data.name, 'Carlos Almir');
  assert.equal((await carlos('GET', '/auth/state')).data.setup, false);
  assert.equal((await carlos('POST', '/auth/setup', { email: 'outro', password: 'senha1234' })).status, 409, 'primeiro acesso só uma vez');

  // esposa cria a própria conta e não vê os dados do Carlos
  const esposa = browser();
  assert.equal((await esposa('POST', '/auth/register', { email: 'carlos', password: 'senha1234' })).status, 409, 'usuário repetido');
  assert.equal((await esposa('POST', '/auth/register', { email: 'maria', password: 'senha5678', full_name: 'Maria' })).status, 200);
  assert.equal((await esposa('GET', '/exams')).data.length, 0);
  await esposa('POST', '/exams', { collection_date: '2026-10-05', results: [{ marker_name: 'Glicose', value: '90' }] });
  assert.equal((await carlos('GET', '/exams')).data.length, 1);

  // entrar de novo, com usuário em maiúsculas e senha errada
  const outra = browser();
  assert.equal((await outra('POST', '/auth/login', { email: 'carlos', password: 'errada123' })).status, 401);
  assert.equal((await outra('POST', '/auth/login', { email: 'CARLOS', password: 'senha1234' })).status, 200);
  assert.equal((await outra('GET', '/exams')).data[0].markers[0], 'Creatinina');
});
