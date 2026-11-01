// Laudos descritivos (tomografia, ultrassom…): separação das partes do laudo e comparação da conclusão
// com a do exame anterior do mesmo tipo. Texto fictício.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseDocument } = require('../server/lib/extract/parse');

const cabecalho = (pag) => `Rua Exemplo, 100\tCNPJ: 00.000.000/0001-00
Nome\tData de Nascimento\t${pag} / 2
MARIA DA SILVA\t03/04/1960 (66 anos)
Solicitante\tData Entrada\tPedido
JOAO PEREIRA LIMA - CRM-SP 12345\t${'20/08/2026'} 999-TC01
Data Impressão: 31/10/26 21:28`;
const LAUDO = (calculo, extra) => `${cabecalho(1)}
RELATORIO
TOMOGRAFIA COMPUTADORIZADA DO ABDÔMEN TOTAL
Indicação clínica: Controle de cálculo renal.
Técnica do exame:
Liberado: 24/08/2026
Aquisição volumétrica sem contraste.
Aspectos observados:
Fígado de dimensões preservadas.
Rins tópicos. Cálculo no rim esquerdo que
mede ${calculo}.
Este é um exame baseado em imagens cuja finalidade é auxiliar o médico.
${cabecalho(2)}
Bexiga sem alterações.
Impressão:
Nefrolitíase à esquerda, maior cálculo com ${calculo}.
Hipertrofia prostática.
${extra}
Fulano De Tal BeltranoFulano De Tal Beltrano
CRM-SP 99999 RQE 1234
Este é um exame baseado em imagens cuja finalidade é auxiliar o médico.`;

test('separa as partes de um laudo de tomografia', () => {
  const p = parseDocument({ text: LAUDO('6,2 mm', 'Pequena hérnia umbilical.') });
  assert.equal(p.kind, 'imagem');
  assert.equal(p.date, '2026-08-20', 'data de entrada, não a de nascimento');
  assert.equal(p.result_date, '2026-08-24');
  assert.deepEqual(p.doctor, { name: 'Joao Pereira Lima', crm: '12345/SP' });
  const im = p.imaging;
  assert.equal(im.title, 'Tomografia computadorizada do abdômen total');
  assert.equal(im.reason, 'Controle de cálculo renal.');
  assert.match(im.findings, /Cálculo no rim esquerdo que mede 6,2 mm\./, 'junta a frase quebrada');
  assert.match(im.findings, /Bexiga sem alterações/, 'continua na página 2');
  assert.doesNotMatch(im.findings, /Nome Data|Impressão:|Este é um exame/);
  assert.deepEqual(im.conclusion.split('\n'), ['Nefrolitíase à esquerda, maior cálculo com 6,2 mm.', 'Hipertrofia prostática.', 'Pequena hérnia umbilical.']);
});

let server; let DATA;
after(async () => {
  if (server) { server.kill(); await new Promise((r) => (server.exitCode !== null ? r() : server.once('exit', r))); }
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* Windows */ }
});

test('compara a conclusão com o laudo anterior do mesmo tipo', async () => {
  const PORT = 7500 + Math.floor(Math.random() * 400);
  DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'helyx-img-'));
  const env = { ...process.env, PORT, SAUDE_DATA_DIR: DATA, SAUDE_EXIGIR_LOGIN: '0' };
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const call = async (method, url, body) => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api${url}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  // laudo anterior, salvo sem resultados numéricos
  const antes = await call('POST', '/exams', { collection_date: '2025-08-10', exam_type: 'Imagem', title: 'Tomografia do abdômen', results: [],
    conclusion: 'Nefrolitíase à esquerda, maior cálculo com 5,0 mm.\nHipertrofia prostática.\nEsteatose hepática leve.' });
  assert.equal(antes.status, 200, JSON.stringify(antes.data));

  const { data } = await call('POST', '/extract', { text: LAUDO('6,2 mm', 'Pequena hérnia umbilical.') });
  assert.equal(data.kind, 'imagem');
  const cmp = data.imaging.compare;
  assert.equal(cmp.previous.id, antes.data.id);
  assert.deepEqual(cmp.novos.map((x) => x.text), ['Pequena hérnia umbilical']);
  assert.deepEqual(cmp.nao_citados.map((x) => x.text), ['Esteatose hepática leve']);
  const calc = cmp.mantidos.find((x) => /Nefrolit/.test(x.text));
  assert.deepEqual([calc.changed, calc.measures_before, calc.measures_now], [true, '5,0 mm', '6,2 mm']);

  // salvo, o exame mostra a mesma comparação
  const im = data.imaging;
  const salvo = (await call('POST', '/exams', { collection_date: data.date, exam_type: 'Imagem', title: im.title, conclusion: im.conclusion, findings: im.findings, results: [] })).data;
  const full = (await call('GET', `/exams/${salvo.id}`)).data;
  assert.equal(full.conclusion, im.conclusion);
  assert.equal(full.imaging_compare.previous.id, antes.data.id);
  assert.ok((await call('GET', '/timeline')).data.some((x) => x.title.startsWith('Tomografia computadorizada')));
});
