// Leitura de dados de arquivos: interpretação de laudos, receitas e pedidos; Word e Excel (novos e antigos);
// comparação com os exames anteriores e as alterações em separado. Amostras fictícias em test/amostras.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseDocument } = require('../server/lib/extract/parse');
const { docxText, xlsxRows } = require('../server/lib/extract/office');
const { docText, xlsRows } = require('../server/lib/extract/legacy');

const AMOSTRAS = path.join(__dirname, 'amostras');
const amostra = (n) => fs.readFileSync(path.join(AMOSTRAS, n));
const byName = (results) => Object.fromEntries(results.map((r) => [r.marker_name, r]));

const LAUDO = `LABORATÓRIO EXEMPLO ANÁLISES CLÍNICAS
Paciente: Maria da Silva          Data de nascimento: 03/04/1960
Médico solicitante: Dr. João Pereira Lima   CRM 12345/SP
Data da coleta: 10/09/2026      Liberado em: 12/09/2026
CREATININA ......................: 1,48 mg/dL       Valores de referência: 0,60 a 1,10 mg/dL
Resultado anterior: 1,20 mg/dL em 10/03/2026
GLICOSE
Resultado: 95 mg/dL
Valor de referência: 70 a 99 mg/dL
Leucócitos        6.800 /mm³           3.500 a 10.500
COLESTEROL TOTAL: 210 mg/dL   Desejável: < 190 mg/dL
LDL colesterol: 130 mg/dL    Ótimo < 100; Desejável 100-129
TSH - HORMÔNIO TIREOESTIMULANTE   2,35 µUI/mL   0,27 a 4,20
Anti-HCV   Não reagente`;

test('interpreta um laudo de laboratório em texto', () => {
  const p = parseDocument({ text: LAUDO });
  assert.equal(p.kind, 'exame');
  assert.equal(p.date, '2026-09-10');
  assert.equal(p.result_date, '2026-09-12');
  assert.match(p.lab, /EXEMPLO/);
  assert.deepEqual(p.doctor, { name: 'João Pereira Lima', crm: '12345/SP' });
  const r = byName(p.exams[0].results);
  assert.deepEqual([r.Creatinina.value, r.Creatinina.unit, r.Creatinina.ref_min, r.Creatinina.ref_max], [1.48, 'mg/dL', 0.6, 1.1]);
  assert.equal(r.Glicose.value, 95, 'valor na linha de baixo');
  assert.equal(r['Leucócitos'].value, 6800, 'ponto como separador de milhar');
  assert.equal(r['Colesterol total'].ref_max, 190);
  assert.equal(r['LDL colesterol'].ref_max, 100, 'vale a primeira faixa do texto');
  assert.equal(r.TSH.value, 2.35);
  assert.equal(r['Anti-HCV'].value_text, 'Não reagente');
  assert.equal(p.exams[0].results.filter((x) => x.marker_name === 'Creatinina').length, 1, 'ignora o "resultado anterior" do laudo');
});

test('leucograma: lê o valor absoluto e a faixa da contagem, não a porcentagem', () => {
  const p = parseDocument({ text: `Leucócitos   100 %   6.800 /mm³   3.500 a 10.500 /mm³
Neutrófilos  58,0 %  3.944 /mm³   40 a 70 %   1.600 a 7.700 /mm³
Linfócitos   30,0 %  2.040 /mm³   20 a 50     900 a 3.400
Hemoglobina glicada  6,1 %  43 mmol/mol  4,0 a 5,6 %` });
  const r = byName(p.exams[0].results);
  assert.deepEqual([r['Leucócitos'].value, r['Leucócitos'].unit, r['Leucócitos'].ref_min, r['Leucócitos'].ref_max], [6800, '/mm³', 3500, 10500]);
  assert.deepEqual([r['Neutrófilos'].value, r['Neutrófilos'].ref_min, r['Neutrófilos'].ref_max], [3944, 1600, 7700]);
  assert.deepEqual([r['Linfócitos'].value, r['Linfócitos'].ref_min, r['Linfócitos'].ref_max], [2040, 900, 3400]);
  assert.deepEqual([r['Hemoglobina glicada'].value, r['Hemoglobina glicada'].unit], [6.1, '%'], 'porcentagem sem contagem continua em %');
});

test('usa o nome que a pessoa já tem para o mesmo exame', () => {
  const p = parseDocument({ text: 'Vitamina D (25-OH)  18,5 ng/mL  Suficiente: > 20', userMarkers: [{ name: 'Vitamina D 25 hidroxi' }] });
  assert.equal(p.exams[0].results[0].marker_name, 'Vitamina D 25 hidroxi');
  assert.equal(p.exams[0].results[0].ref_min, 20);
});

test('interpreta receita e pedido de exames', () => {
  const rec = parseDocument({ text: `RECEITUÁRIO\nUso oral\n1) Losartana potássica 50 mg ------ 30 comprimidos\n   Tomar 1 comprimido de 12/12 horas\n2) Vitamina D3 50.000 UI - 8 cápsulas\n   Tomar 1 cápsula por semana\nDra. Ana Souza - Cardiologista - CRM-SP 54321\nSão Paulo, 02 de setembro de 2026` });
  assert.equal(rec.kind, 'receita');
  assert.equal(rec.date, '2026-09-02');
  assert.equal(rec.specialty, 'Cardiologia');
  assert.deepEqual(rec.medications.map((m) => [m.name, m.dosage, m.frequency]), [['Losartana potássica', '50 mg', 'a cada 12 horas'], ['Vitamina D3', '50.000 UI', '1x por semana']]);

  const ped = parseDocument({ text: 'Dr. João Pereira Lima CRM 12345/SP\nSolicito:\n- Hemograma completo\n- Creatinina, Ureia, Potássio\n- TSH e T4 livre\nData: 02/09/2026' });
  assert.equal(ped.kind, 'pedido');
  assert.deepEqual(ped.requests, ['Hemograma completo', 'Creatinina', 'Ureia', 'Potássio', 'TSH', 'T4 livre']);
});

test('lê Word (.docx e .doc) e Excel (.xlsx e .xls)', () => {
  for (const text of [docxText(amostra('laudo.docx')), docText(amostra('laudo.doc'))]) {
    const p = parseDocument({ text });
    assert.equal(p.exams[0].collection_date, '2026-10-15');
    assert.deepEqual(p.exams[0].results.map((r) => [r.marker_name, r.value]), [['Creatinina', 1.62], ['Potássio', 4.8], ['Glicose', 92], ['Hemoglobina glicada', 6.1], ['Ureia', 48]]);
  }
  for (const sheets of [xlsxRows(amostra('historico.xlsx')), xlsRows(amostra('historico.xls'))]) {
    const p = parseDocument({ sheets });
    assert.deepEqual(p.exams.map((e) => e.collection_date), ['2026-03-10', '2026-06-12'], 'uma coluna de datas vira um exame');
    assert.deepEqual(p.exams[1].results.map((r) => [r.marker_name, r.value, r.unit]), [['Creatinina', 1.35, 'mg/dL'], ['Potássio', 5.3, 'mEq/L'], ['Hemoglobina', 12.4, 'g/dL'], ['Vitamina D', 26.5, 'ng/mL']]);
  }
});

// ---------------------------------------------------------------- Pela API, com histórico
let server; let DATA;
after(async () => {
  if (server) { server.kill(); await new Promise((r) => (server.exitCode !== null ? r() : server.once('exit', r))); }
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* Windows pode segurar o arquivo por instantes */ }
});

test('compara com os exames anteriores e separa as alterações', async () => {
  const PORT = 6500 + Math.floor(Math.random() * 400);
  DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'helyx-ext-'));
  const env = { ...process.env, PORT, SAUDE_DATA_DIR: DATA }; env.SAUDE_EXIGIR_LOGIN = '0';
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const call = async (method, url, body) => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api${url}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
  };

  // histórico: creatinina e glicose já fora, ureia normal
  await call('POST', '/exams', { collection_date: '2026-06-01', results: [
    { marker_name: 'Creatinina', value: '1,20', unit: 'mg/dL', ref_min: '0,6', ref_max: '1,1' },
    { marker_name: 'Glicose', value: '120', unit: 'mg/dL', ref_min: '70', ref_max: '99' },
    { marker_name: 'Ureia', value: '35', unit: 'mg/dL', ref_min: '15', ref_max: '40' }] });

  const docx = { name: 'laudo.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data_base64: amostra('laudo.docx').toString('base64') };
  const { status, data } = await call('POST', '/extract', { file: docx });
  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(data.kind, 'exame');
  const ex = data.exams[0];
  const r = byName(ex.results);
  assert.equal(r.Creatinina.previous.value, 1.2);
  assert.equal(r.Creatinina.previous.direction, 'aumento');
  const names = (k) => ex.changes[k].map((x) => x.marker_name).sort();
  assert.deepEqual(names('novos_fora'), ['Hemoglobina glicada', 'Ureia']);
  assert.deepEqual(names('continuam_fora'), ['Creatinina']);
  assert.deepEqual(names('voltaram_ao_normal'), ['Glicose']);
  assert.deepEqual(names('aumentos'), ['Creatinina', 'Ureia']);
  assert.deepEqual(names('reducoes'), ['Glicose']);
  assert.deepEqual(names('primeiros'), ['Hemoglobina glicada', 'Potássio']);

  // depois de salvo, o exame mostra as mesmas alterações em separado
  const saved = (await call('POST', '/exams', { collection_date: ex.collection_date, results: ex.results.map((x) => ({ marker_name: x.marker_name, value: String(x.value).replace('.', ','), unit: x.unit, ref_min: x.ref_min, ref_max: x.ref_max })) })).data;
  const full = (await call('GET', `/exams/${saved.id}`)).data;
  assert.deepEqual(full.changes.continuam_fora.map((x) => x.marker_name), ['Creatinina']);
  assert.deepEqual(full.changes.voltaram_ao_normal.map((x) => x.marker_name), ['Glicose']);

  // documento guardado (.xls) também pode ser lido
  const doc = (await call('POST', '/documents', { title: 'Histórico', mime_type: 'application/vnd.ms-excel', original_name: 'historico.xls', data_base64: amostra('historico.xls').toString('base64') })).data;
  const fromDoc = (await call('POST', '/extract', { document_id: doc.id })).data;
  assert.equal(fromDoc.exams.length, 2);

  // texto vindo da tela (PDF/foto) e formatos não suportados
  assert.equal((await call('POST', '/extract', { text: 'Losartana 50 mg\nTomar 1 comprimido ao dia\nReceituário' })).data.kind, 'receita');
  assert.equal((await call('POST', '/extract', { file: { name: 'x.zip', mime_type: 'application/zip', data_base64: 'AAAA' } })).status, 400);
  assert.equal((await call('POST', '/extract', { text: '   ' })).status, 422);

  // bibliotecas de leitura servidas pelo próprio programa
  const lib = await fetch(`http://127.0.0.1:${PORT}/vendor/pdfjs/pdf.min.mjs`);
  assert.equal(lib.status, 200); assert.match(lib.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/vendor/tesseract-lang/por.traineddata.gz`)).status, 200);
  assert.notEqual((await fetch(`http://127.0.0.1:${PORT}/vendor/pdfjs/..%2F..%2Fpackage.json`)).status, 200);
});
