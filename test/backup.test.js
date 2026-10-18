// Backup em arquivo (.helyx) e restauração — inclusive em outro computador (outra chave).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const servers = []; const dirs = [];
after(() => { servers.forEach((s) => s.kill()); dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })); });

async function boot() {
  const PORT = 5500 + Math.floor(Math.random() * 400);
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'helyx-bk-')); dirs.push(DATA);
  const env = { ...process.env, PORT, SAUDE_DATA_DIR: DATA }; delete env.SAUDE_EXIGIR_LOGIN;
  const s = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: 'pipe' });
  servers.push(s);
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  return async (method, url, body) => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api${url}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, headers: res.headers, data: await res.json().catch(() => null) };
  };
}

test('backup → apagar → restaurar mantém tudo e as ligações', async () => {
  const call = await boot();
  await call('PUT', '/profile', { full_name: 'Carlos Teste', allergies: 'Dipirona' });
  const doc = (await call('POST', '/doctors', { name: 'Dra. A', specialty: 'Nefrologia' })).data;
  const c1 = (await call('POST', '/consultations', { date: '2026-06-02', doctor_id: doc.id, diagnoses: 'sigiloso', requests: [{ description: 'Creatinina' }] })).data;
  await call('POST', '/consultations', { date: '2026-09-02', is_return: true, previous_id: c1.id });
  await call('POST', '/exams', { collection_date: '2026-08-10', results: [{ marker_name: 'Creatinina', value: '1,48', ref_min: '0,7', ref_max: '1,3' }] });
  const med = (await call('POST', '/medications', { name: 'Valsartana', dosage: '320 mg', start_date: '2026-01-01', marker_names: ['Creatinina'] })).data;
  await call('PUT', `/medications/${med.id}`, { dosage: '160 mg', effective_date: '2026-09-15', change_reason: 'ajuste' });
  await call('POST', '/measurements', { type: 'pressao', measured_at: '2026-10-01 08:00', value1: 130, value2: 85 });
  await call('POST', '/events', { type: 'vacina', title: 'Gripe', starts_at: '2026-11-06' });

  const dl = await call('GET', '/backup/download');
  assert.match(dl.headers.get('content-disposition'), /helyx-backup-.*\.helyx/);
  const file = dl.data;
  assert.equal(file.formato, 'helyx');

  // backup guardado no computador aparece na lista
  assert.equal((await call('POST', '/backup')).status, 200);
  assert.ok((await call('GET', '/backup/list')).data.length >= 1);

  // apaga tudo
  await call('POST', '/account/delete', { confirm: 'EXCLUIR' });
  assert.equal((await call('GET', '/exams')).data.length, 0);

  // restaura em OUTRO computador (nova chave de criptografia)
  const other = await boot();
  assert.equal((await other('POST', '/backup/restore', { data: file })).status, 400, 'pede confirmação');
  assert.equal((await other('POST', '/backup/restore', { data: { formato: 'outro' }, confirm: 'RESTAURAR' })).status, 400);
  const prev = (await other('POST', '/backup/preview', { data: file })).data;
  assert.equal(prev.consultas, 2);
  const r = await other('POST', '/backup/restore', { data: file, confirm: 'RESTAURAR' });
  assert.equal(r.status, 200, JSON.stringify(r.data));

  const prof = (await other('GET', '/profile')).data;
  assert.equal(prof.full_name, 'Carlos Teste');
  assert.equal(prof.allergies, 'Dipirona');
  const cons = (await other('GET', '/consultations')).data;
  assert.equal(cons.length, 2);
  const first = (await other('GET', `/consultations/${cons.find((c) => c.date === '2026-06-02').id}`)).data;
  assert.equal(first.diagnoses, 'sigiloso');
  assert.equal(first.doctor.name, 'Dra. A');
  assert.equal(first.requests[0].status, 'realizado');
  assert.equal(first.returns.length, 1, 'ligação de retorno preservada');
  const meds = (await other('GET', '/medications')).data;
  const full = (await other('GET', `/medications/${meds[0].id}`)).data;
  assert.equal(full.versions.length, 2);
  assert.equal(full.versions[1].change_reason, 'ajuste');
  assert.deepEqual(full.markers.map((m) => m.name), ['Creatinina']);
  const mk = (await other('GET', '/markers')).data.find((m) => m.name === 'Creatinina');
  assert.equal((await other('GET', `/markers/${mk.id}/history`)).data.points[0].situation, 'acima');
  assert.equal((await other('GET', '/measurements')).data.length, 1);
  assert.equal((await other('GET', '/events')).data.filter((e) => e.source === 'evento').length, 1);

  // restaurar de novo não duplica, e a cópia "antes de restaurar" foi criada
  await other('POST', '/backup/restore', { data: file, confirm: 'RESTAURAR' });
  assert.equal((await other('GET', '/consultations')).data.length, 2);
  const list = (await other('GET', '/backup/list')).data;
  assert.ok(list.some((b) => b.kind === 'antes de restaurar'));
  // restaurar a partir de uma cópia guardada
  const rl = await other('POST', '/backup/restore', { name: list[list.length - 1].name, confirm: 'RESTAURAR' });
  assert.equal(rl.status, 200);
});
