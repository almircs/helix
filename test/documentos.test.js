// Documentos: envio, criptografia no disco, leitura, vínculos, backup/restauração e exclusão.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const servers = []; const dirs = [];
after(() => { servers.forEach((s) => s.kill()); dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })); });

async function boot() {
  const PORT = 6000 + Math.floor(Math.random() * 400);
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'helyx-doc-')); dirs.push(DATA);
  const env = { ...process.env, PORT, SAUDE_DATA_DIR: DATA }; env.SAUDE_EXIGIR_LOGIN = '0';
  servers.push(spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: 'pipe' }));
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const call = async (method, url, body) => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api${url}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, headers: res.headers, data: await res.json().catch(() => null) };
  };
  const raw = (url) => fetch(`http://127.0.0.1:${PORT}/api${url}`);
  return { call, raw, DATA };
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\nCreatinina 1,48 mg/dL', 'latin1');

test('documentos ponta a ponta', async () => {
  const { call, raw, DATA } = await boot();
  const c = (await call('POST', '/consultations', { date: '2026-09-02', specialty: 'Nefrologia' })).data;
  const ex = (await call('POST', '/exams', { collection_date: '2026-09-10', results: [{ marker_name: 'Creatinina', value: '1,48' }] })).data;

  assert.equal((await call('POST', '/documents', { title: 'x', mime_type: 'application/zip', data_base64: 'AAAA' })).status, 400, 'só PDF/imagem');
  assert.equal((await call('POST', '/documents', { title: 'x', mime_type: 'application/pdf', data_base64: 'AAAA', exam_id: 9999 })).status, 400, 'vínculo inválido');

  const d = (await call('POST', '/documents', { title: 'Laudo creatinina', kind: 'laudo', doc_date: '2026-09-12', mime_type: 'application/pdf',
    original_name: 'laudo.pdf', data_base64: PDF.toString('base64'), exam_id: ex.id, consultation_id: c.id, notes: 'sigiloso' })).data;
  assert.equal(d.exam.id, ex.id); assert.equal(d.consultation.id, c.id); assert.equal(d.is_pdf, true); assert.equal(d.notes, 'sigiloso');

  // no disco fica criptografado
  const files = fs.readdirSync(path.join(DATA, 'documentos'));
  assert.equal(files.length, 1);
  const onDisk = fs.readFileSync(path.join(DATA, 'documentos', files[0]));
  assert.ok(!onDisk.includes(Buffer.from('Creatinina')), 'conteúdo não aparece em claro');

  // leitura devolve o original
  const f = await raw(`/documents/${d.id}/file`);
  assert.equal(f.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await f.arrayBuffer()), PDF);

  assert.equal((await call('GET', `/documents?exam_id=${ex.id}`)).data.length, 1);
  assert.equal((await call('GET', `/documents?consultation_id=${c.id}`)).data.length, 1);
  assert.ok((await call('GET', '/timeline')).data.some((i) => i.kind === 'documento'));
  const upd = (await call('PUT', `/documents/${d.id}`, { title: 'Laudo set/2026', exam_id: '' })).data;
  assert.equal(upd.title, 'Laudo set/2026'); assert.equal(upd.exam, null);

  // backup leva o arquivo; restaurar em outro computador traz de volta, ligado à consulta
  const backup = (await call('GET', '/backup/download')).data;
  assert.equal(backup.documentos.length, 1);
  const other = await boot();
  assert.equal((await other.call('POST', '/backup/restore', { data: backup, confirm: 'RESTAURAR' })).status, 200);
  const restored = (await other.call('GET', '/documents')).data;
  assert.equal(restored.length, 1);
  assert.equal(restored[0].consultation.date, '2026-09-02');
  assert.deepEqual(Buffer.from(await (await other.raw(`/documents/${restored[0].id}/file`)).arrayBuffer()), PDF);

  // excluir apaga o arquivo
  assert.equal((await call('DELETE', `/documents/${d.id}`)).status, 200);
  assert.equal(fs.readdirSync(path.join(DATA, 'documentos')).length, 0);
});
