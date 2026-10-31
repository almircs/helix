// A página inicial (/api/home) não pode conter nada que identifique a saúde do usuário.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const PORT = 6500 + Math.floor(Math.random() * 400);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'helyx-priv-'));
let server;
after(() => { server && server.kill(); fs.rmSync(DATA, { recursive: true, force: true }); });

test('página inicial só tem datas, horários e contagens', async () => {
  const env = { ...process.env, SAUDE_DATA_DIR: DATA }; env.SAUDE_EXIGIR_LOGIN = '0';
  execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'scripts', 'demo.js')], { env });
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'index.js')], { env: { ...env, PORT }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const res = await fetch(`http://127.0.0.1:${PORT}/api/home`);
  const text = await res.text();
  const h = JSON.parse(text);
  for (const proibido of ['Valsartana', 'Vitamina', 'Creatinina', 'Potássio', 'Renina', 'Nefrologia', 'Dra.', 'Ana Exemplo', 'Clínica', 'Laboratório', 'Coleta', 'Retorno', 'Vacina', 'mg', 'acima', 'abaixo'])
    assert.ok(!text.includes(proibido), `não deveria conter "${proibido}"`);
  assert.equal(h.exams.tracked, 6);
  assert.equal(h.week.length, 7);
  assert.ok(h.today_meds.times.includes('08:00'));
  assert.ok(h.pending.count >= 1);
});
