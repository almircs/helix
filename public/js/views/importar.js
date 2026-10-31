// Ler arquivo: extrai os dados de um laudo, receita, pedido ou relatório (PDF, foto, Word, Excel)
// e mostra para revisar, já comparando os exames com os anteriores. Nada é salvo sem confirmação.
import { api, html, raw, icon, toast, view, go, cached, invalidate, options, fmtDate, fmtNum, numInput, today, sitTag, trendTag } from '../lib.js';
import { ACCEPT, readForExtraction, kindOf, mimeOf, fileToBase64 } from '../reader.js';

const KIND_LABEL = { exame: 'Resultado de exame', receita: 'Receita (remédios)', pedido: 'Pedido de exames', consulta: 'Relatório de consulta' };
const DOC_KIND = { exame: 'laudo', receita: 'receita', pedido: 'pedido', consulta: 'relatorio' };
const CHANGE_GROUPS = [
  ['novos_fora', 'Passaram a ficar fora da referência', 'acima'],
  ['continuam_fora', 'Continuam fora da referência', 'pendente'],
  ['voltaram_ao_normal', 'Voltaram para dentro da referência', 'dentro'],
  ['aumentos', 'Aumentaram (variação relevante)', 'relevante'],
  ['reducoes', 'Diminuíram (variação relevante)', 'relevante'],
  ['primeiros', 'Primeira vez registrados', ''],
];

// ---------------------------------------------------------------- Cálculos (iguais aos do servidor)
function toNum(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  let s = String(v).trim().replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s); return Number.isFinite(n) ? n : null;
}
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function situation(v, min, max) {
  if (v === null || v === undefined) return null;
  if (min != null && v < min) return 'abaixo';
  if (max != null && v > max) return 'acima';
  if (min == null && max == null) return null;
  return 'dentro';
}
function trend(prev, curr, th) {
  if (prev == null || curr == null) return null;
  const diff = curr - prev; const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : (diff === 0 ? 0 : 100);
  const abs = Math.abs(pct);
  return { direction: abs >= th.stable ? (diff > 0 ? 'aumento' : 'reducao') : 'estavel', pct: Math.round(pct * 10) / 10, relevant: abs >= th.relevant };
}
function summarize(results) {
  const out = Object.fromEntries(CHANGE_GROUPS.map(([k]) => [k, []]));
  for (const r of results) {
    const fora = r.situation === 'acima' || r.situation === 'abaixo'; const p = r.prev;
    if (!p) { out.primeiros.push(r); if (fora) out.novos_fora.push(r); continue; }
    const antes = p.situation === 'acima' || p.situation === 'abaixo';
    if (fora && !antes) out.novos_fora.push(r); else if (fora && antes) out.continuam_fora.push(r);
    else if (!fora && antes && r.situation === 'dentro') out.voltaram_ao_normal.push(r);
    if (r.trend?.relevant && r.trend.direction === 'aumento') out.aumentos.push(r);
    if (r.trend?.relevant && r.trend.direction === 'reducao') out.reducoes.push(r);
  }
  return out;
}

// ---------------------------------------------------------------- Estado da tela
let S = null;

// Recalcula situação, anterior e variação de cada resultado (inclusive entre exames do mesmo arquivo)
function derive() {
  const th = S.parsed.thresholds || { stable: 3, relevant: 10 };
  const exams = [...S.exams].map((e, i) => ({ e, i })).sort((a, b) => String(a.e.collection_date).localeCompare(String(b.e.collection_date)));
  for (const { e } of exams) {
    for (const r of e.results) {
      r.num = toNum(r.value_input);
      r.situation = situation(r.num, toNum(r.ref_min_input), toNum(r.ref_max_input));
      // anterior: o mais recente entre o histórico salvo e os exames anteriores deste arquivo
      let prev = r.previous && !r.previous.unit_differs ? { value: r.previous.value, date: r.previous.date, situation: r.previous.situation, unit: r.previous.unit } : null;
      for (const { e: o } of exams) {
        if (o === e || !(String(o.collection_date) < String(e.collection_date))) continue;
        const same = o.results.find((x) => x.include && norm(x.marker_input) === norm(r.marker_input) && x.num != null);
        if (same && (!prev || o.collection_date > prev.date)) prev = { value: same.num, date: o.collection_date, situation: same.situation, unit: same.unit_input, here: true };
      }
      r.prev = r.include ? prev : null;
      r.trend = prev && r.num != null ? trend(prev.value, r.num, th) : null;
    }
  }
}

const resultsOf = (e) => e.results.filter((r) => r.include && r.marker_input.trim());

// ---------------------------------------------------------------- Partes da tela
function sourceBox() {
  const p = S.parsed;
  return html`<div class="card imp-head">
    <div class="imp-file">${icon('documentos')}<div><b>${S.fileName || 'Documento'}</b>
      <div class="meta">${p.source?.ocr ? 'lido por reconhecimento de texto' : 'texto lido do arquivo'}${S.pages ? ` · ${S.pages} página(s)` : ''}</div></div>
      ${S.docId ? '' : html`<button class="btn small" id="other">Ler outro arquivo</button>`}</div>
    <div class="imp-kind"><span class="small muted">Este arquivo é:</span>
      <div class="seg" role="group" aria-label="Tipo de documento">${Object.entries(KIND_LABEL).map(([k, l]) => html`<button type="button" class="${S.kind === k ? 'on' : ''}" data-kind="${k}">${l}</button>`)}</div></div>
    ${p.source?.ocr ? html`<div class="alert aviso" style="margin-top:.8rem">${icon('alert')}<div>Este arquivo foi lido por <b>reconhecimento de texto</b> (foto ou PDF escaneado), que pode trocar letras e números. Confira cada valor com o documento antes de salvar.</div></div>` : ''}
  </div>`;
}

function prevCell(r) {
  if (!r.prev) return r.previous?.unit_differs ? html`<span class="meta">anterior em outra unidade (${r.previous.unit})</span>` : html`<span class="meta">primeiro registro</span>`;
  return html`${r.trend ? trendTag(r.trend) : ''}<div class="meta">antes: ${fmtNum(r.prev.value, 3)} ${r.prev.unit || ''} em ${fmtDate(r.prev.date)}${r.prev.here ? ' (neste arquivo)' : ''}</div>`;
}

function resultRow(x, i, r) {
  return html`<tr data-x="${x}" data-i="${i}" class="${r.include ? '' : 'off'}">
    <td><input type="checkbox" data-k="include" ${r.include ? raw('checked') : ''} aria-label="Incluir"></td>
    <td><input data-k="marker_input" list="impMarkers" value="${r.marker_input}" aria-label="Exame">${r.known ? '' : html`<span class="tag" title="Não está no seu histórico nem na lista de exames conhecidos">novo</span>`}</td>
    <td><input data-k="value_input" class="num" inputmode="decimal" value="${r.value_input}" aria-label="Resultado"></td>
    <td><input data-k="unit_input" value="${r.unit_input}" aria-label="Unidade" style="width:7.5em"></td>
    <td class="imp-ref"><input data-k="ref_min_input" inputmode="decimal" value="${r.ref_min_input}" aria-label="Referência mínima" placeholder="mín."><span>a</span><input data-k="ref_max_input" inputmode="decimal" value="${r.ref_max_input}" aria-label="Referência máxima" placeholder="máx.">
      ${r.ref_from_history ? html`<div class="meta">referência do seu histórico</div>` : r.ref_text ? html`<div class="meta">${r.ref_text}</div>` : ''}</td>
    <td data-cell="sit">${sitTag(r.situation) || html`<span class="meta">—</span>`}</td>
    <td data-cell="prev">${prevCell(r)}</td>
  </tr>`;
}

function changesCard(e, x) {
  const ch = summarize(resultsOf(e));
  const compared = resultsOf(e).filter((r) => r.prev).length;
  const item = (r) => html`<li><b>${r.marker_input}</b> ${r.value_input} ${r.unit_input}
    ${r.prev ? html`<span class="meta">· antes ${fmtNum(r.prev.value, 3)} em ${fmtDate(r.prev.date)}${r.trend && r.trend.direction !== 'estavel' ? ` (${r.trend.pct > 0 ? '+' : ''}${fmtNum(r.trend.pct, 1)}%)` : ''}</span>` : ''}</li>`;
  const groups = CHANGE_GROUPS.filter(([k]) => ch[k].length);
  return html`<div class="card imp-changes" data-changes="${x}">
    <h2>Alterações em relação aos exames anteriores</h2>
    ${compared ? html`<p class="small muted">${compared} resultado(s) comparado(s) com o exame anterior do mesmo tipo.</p>` : html`<p class="small muted">Nenhum destes exames tem resultado anterior para comparar.</p>`}
    ${groups.length ? html`<div class="imp-groups">${groups.map(([k, label, cls]) => html`<div class="imp-group ${k}"><h3><span class="tag ${cls}">${ch[k].length}</span> ${label}</h3><ul>${ch[k].map(item)}</ul></div>`)}</div>`
      : html`<p class="empty">Sem alterações: tudo dentro da referência e sem variações relevantes.</p>`}
    <p class="small muted">Comparação apenas numérica com a referência do laudo e com o resultado anterior. Não é diagnóstico — leve as dúvidas ao seu médico.</p>
  </div>`;
}

function linkFields({ doctor = true, consultation = true } = {}) {
  const d = S.parsed.doctor;
  const docOpts = options(S.doctors, 'id', (x) => `${x.name}${x.specialty ? ' — ' + x.specialty : ''}`, '— não informado —');
  if (d?.name && !d.id) docOpts.push(['__novo', `+ Cadastrar ${d.name}${d.crm ? ' (CRM ' + d.crm + ')' : ''}`]);
  const consOpts = options(S.consultations.filter((c) => c.status !== 'cancelada'), 'id', (c) => `${fmtDate(c.date)} — ${c.specialty || 'consulta'}${c.doctor_name ? ' · ' + c.doctor_name : ''}`, '— nenhuma —');
  return html`${doctor ? html`<div><label for="impDoctor">Médico</label><select id="impDoctor" data-common="doctor">${docOpts.map(([v, l]) => html`<option value="${v}" ${String(v) === String(S.common.doctor) ? raw('selected') : ''}>${l}</option>`)}</select></div>` : ''}
    ${consultation ? html`<div><label for="impCons">Consulta ligada</label><select id="impCons" data-common="consultation">${consOpts.map(([v, l]) => html`<option value="${v}" ${String(v) === String(S.common.consultation) ? raw('selected') : ''}>${l}</option>`)}</select></div>` : ''}`;
}

function examReview() {
  if (!S.exams.length) S.exams.push(blankExam());
  derive();
  return html`
    <div class="card"><h2>Ligações</h2><div class="form-grid">${linkFields()}</div></div>
    ${S.exams.map((e, x) => html`<div class="card imp-exam" data-exam="${x}">
      <h2>${S.exams.length > 1 ? `Exame ${x + 1} de ${S.exams.length}` : 'Exame'} <span class="tag">${resultsOf(e).length} resultado(s)</span></h2>
      <div class="form-grid">
        <div><label>Data da coleta *</label><input type="date" data-e="collection_date" value="${e.collection_date || ''}" required></div>
        <div><label>Data do resultado</label><input type="date" data-e="result_date" value="${e.result_date || ''}"></div>
        <div><label>Laboratório</label><input data-e="lab" value="${e.lab || ''}"></div>
      </div>
      ${e.existing_exam_id ? html`<div class="note" style="margin-top:.6rem">Já existe um exame cadastrado nesta data (<a href="#/exames/${e.existing_exam_id}">abrir</a>). Salvar criará outro registro.</div>` : ''}
      <div class="table-wrap" style="margin-top:.8rem"><table class="imp-table">
        <thead><tr><th></th><th>Exame</th><th class="num">Resultado</th><th>Unidade</th><th>Referência</th><th>Situação</th><th>Comparado ao anterior</th></tr></thead>
        <tbody>${e.results.map((r, i) => resultRow(x, i, r))}</tbody></table></div>
      <button type="button" class="btn small" data-add-result="${x}">${icon('plus')}Adicionar resultado</button>
    </div>
    ${changesCard(e, x)}`)}
    <datalist id="impMarkers">${S.markers.map((m) => html`<option value="${m.name}">`)}</datalist>`;
}

function medsReview(title = 'Remédios encontrados') {
  return html`<div class="card"><h2>${title} <span class="tag">${S.meds.filter((m) => m.include).length}</span></h2>
    ${S.meds.length ? '' : html`<p class="empty">Nenhum remédio encontrado no texto. Adicione abaixo, se quiser.</p>`}
    <div class="imp-meds">${S.meds.map((m, i) => html`<div class="imp-med ${m.include ? '' : 'off'}" data-m="${i}">
      <label class="check"><input type="checkbox" data-mk="include" ${m.include ? raw('checked') : ''}> Cadastrar</label>
      <div class="form-grid">
        <div><label>Nome</label><input data-mk="name" value="${m.name || ''}"></div>
        <div><label>Dose</label><input data-mk="dosage" value="${m.dosage || ''}" placeholder="50 mg"></div>
        <div><label>Forma</label><input data-mk="presentation" value="${m.presentation || ''}" placeholder="comprimido"></div>
        <div><label>Frequência</label><input data-mk="frequency" value="${m.frequency || ''}" placeholder="1x ao dia"></div>
        <div><label>Horários</label><input data-mk="schedule" value="${m.schedule || ''}" placeholder="08:00, 20:00"></div>
        <div><label>Início</label><input type="date" data-mk="start_date" value="${m.start_date || ''}"></div>
        <div class="full"><label>Como tomar</label><input data-mk="instructions" value="${m.instructions || ''}"></div>
      </div>
      ${m.existing ? html`<p class="small muted">Já está na sua lista: <a href="#/medicamentos/${m.existing.id}">${m.existing.name} ${m.existing.dosage || ''}</a>. Para mudar a dose, use “Registrar alteração” no remédio.</p>` : ''}
    </div>`)}</div>
    <button type="button" class="btn small" id="addMed">${icon('plus')}Adicionar remédio</button></div>`;
}

function requestsReview() {
  return html`<div class="card"><h2>Exames pedidos <span class="tag">${S.requests.filter((r) => r.include).length}</span></h2>
    ${S.requests.length ? '' : html`<p class="empty">Nenhum exame encontrado no texto. Adicione abaixo, se quiser.</p>`}
    <ul class="list imp-reqs">${S.requests.map((r, i) => html`<li data-q="${i}"><input type="checkbox" data-qk="include" ${r.include ? raw('checked') : ''} aria-label="Incluir"><input data-qk="description" value="${r.description}" class="grow" list="impMarkers"></li>`)}</ul>
    <button type="button" class="btn small" id="addReq">${icon('plus')}Adicionar exame</button>
    <datalist id="impMarkers">${S.markers.map((m) => html`<option value="${m.name}">`)}</datalist></div>`;
}

function consultFields(withDetails) {
  const c = S.consult;
  const f = (k, label, type = 'text') => html`<div class="${type === 'textarea' ? 'full' : ''}"><label>${label}</label>${type === 'textarea'
    ? html`<textarea data-c="${k}">${c[k] || ''}</textarea>` : html`<input type="${type}" data-c="${k}" value="${c[k] || ''}">`}</div>`;
  return html`<div class="form-grid">${f('date', 'Data da consulta *', 'date')}${f('specialty', 'Especialidade')}${linkFields({ consultation: false })}
    ${withDetails ? html`${f('reason', 'Motivo', 'textarea')}${f('symptoms', 'Sintomas / história', 'textarea')}${f('diagnoses', 'Diagnósticos', 'textarea')}${f('conduct', 'Conduta', 'textarea')}${f('recommendations', 'Orientações', 'textarea')}` : ''}</div>`;
}

function reviewBody() {
  if (S.kind === 'exame') return examReview();
  if (S.kind === 'receita') return html`<div class="card"><h2>Ligações</h2><div class="form-grid">${linkFields()}</div></div>${medsReview()}`;
  if (S.kind === 'pedido') {
    return html`<div class="card"><h2>De qual consulta é este pedido?</h2>
      <div class="form-grid">${linkFields({ doctor: false })}</div>
      <div id="newCons" ${S.common.consultation ? raw('hidden') : ''}><p class="small muted" style="margin:.8rem 0 .4rem">Sem consulta escolhida, será criada uma nova:</p>${consultFields(false)}</div></div>
      ${requestsReview()}`;
  }
  return html`<div class="card"><h2>Consulta</h2>${consultFields(true)}</div>${medsReview('Remédios receitados')}${requestsReview()}`;
}

function review() {
  const canPreview = S.file && (kindOf(S.file) === 'pdf' || kindOf(S.file) === 'image');
  return html`${sourceBox()}
    <div class="imp-layout ${canPreview ? 'with-preview' : ''}">
      <div class="imp-main">
        <div id="impBody">${reviewBody()}</div>
        <details class="card imp-textbox"><summary>Ver o texto lido do arquivo</summary><pre class="imp-text">${S.parsed.text || '(vazio)'}</pre></details>
        <div class="form-actions">
          ${S.file && !S.docId ? html`<label class="check"><input type="checkbox" id="keepFile" checked> Guardar o arquivo em Documentos</label>` : ''}
          <button type="button" class="btn primary" id="save">Salvar</button><a class="btn" href="${S.back}">Cancelar</a>
        </div>
      </div>
      ${canPreview ? html`<aside class="card imp-preview"><h2>Documento original <button type="button" class="btn small ghost" id="hidePreview">Ocultar</button></h2>${kindOf(S.file) === 'pdf'
        ? html`<iframe src="${S.previewUrl}" title="Documento original"></iframe>` : html`<img src="${S.previewUrl}" alt="Documento original">`}</aside>` : ''}
    </div>`;
}

// ---------------------------------------------------------------- Montagem do estado a partir da leitura
function blankResult(r = {}) {
  return { ...r, include: true, known: r.known ?? true, marker_input: r.marker_name || '', value_input: r.value != null ? numInput(r.value) : (r.value_text || ''),
    unit_input: r.unit || '', ref_min_input: numInput(r.ref_min), ref_max_input: numInput(r.ref_max) };
}
function blankExam() { return { collection_date: S.parsed?.date || today(), results: [blankResult()] }; }

function buildState(parsed, extra) {
  const date = parsed.date || today();
  return {
    ...extra, parsed, kind: extra.forceKind || parsed.kind,
    exams: parsed.exams.map((e) => ({ ...e, collection_date: e.collection_date || date, results: e.results.map(blankResult) })),
    // remédios e pedidos só vêm marcados quando o arquivo parece mesmo uma receita, pedido ou relatório
    meds: parsed.medications.map((m) => ({ ...m, include: !m.existing && ['receita', 'consulta'].includes(parsed.kind), start_date: date })),
    requests: parsed.requests.map((d) => ({ description: d, include: ['pedido', 'consulta'].includes(parsed.kind) })),
    consult: { date, specialty: parsed.specialty || '', ...parsed.sections },
    common: { doctor: parsed.doctor?.id || (parsed.doctor?.name ? '__novo' : ''), consultation: extra.consultationId || '' },
  };
}

// ---------------------------------------------------------------- Salvar
async function doctorId() {
  if (S.common.doctor !== '__novo') return S.common.doctor || null;
  const d = S.parsed.doctor;
  const saved = await api('/doctors', { method: 'POST', body: { name: d.name, crm: d.crm || null, specialty: S.consult.specialty || S.parsed.specialty || null } });
  invalidate('doctors'); S.common.doctor = saved.id; return saved.id;
}

async function attachFile(links, title, date) {
  if (S.docId) { await api(`/documents/${S.docId}`, { method: 'PUT', body: links }); return; }
  if (!S.file || !document.getElementById('keepFile')?.checked) return;
  await api('/documents', { method: 'POST', body: { ...links, title, kind: DOC_KIND[S.kind], doc_date: date || today(),
    original_name: S.file.name, mime_type: mimeOf(S.file), data_base64: await fileToBase64(S.file) } });
}

async function saveMeds(base) {
  const ids = [];
  for (const m of S.meds.filter((x) => x.include && x.name.trim())) {
    const saved = await api('/medications', { method: 'POST', body: { name: m.name, dosage: m.dosage, presentation: m.presentation, frequency: m.frequency,
      schedule: m.schedule, start_date: m.start_date || null, notes: [m.instructions, m.continuous ? 'Uso contínuo' : null].filter(Boolean).join(' · ') || null, status: 'ativo', ...base } });
    ids.push(saved.id);
  }
  return ids;
}

async function save() {
  const doctor_id = await doctorId();
  const consultation_id = S.common.consultation || null;
  if (S.kind === 'exame') {
    const exams = S.exams.filter((e) => resultsOf(e).length);
    if (!exams.length) throw new Error('Inclua pelo menos um resultado.');
    if (exams.some((e) => !e.collection_date)) throw new Error('Informe a data da coleta.');
    const saved = [];
    for (const e of exams) {
      saved.push(await api('/exams', { method: 'POST', body: { collection_date: e.collection_date, result_date: e.result_date || null, lab: e.lab || null,
        requested_by_doctor_id: doctor_id, consultation_id,
        results: resultsOf(e).map((r) => ({ marker_name: r.marker_input.trim(), value: r.value_input, unit: r.unit_input, ref_min: r.ref_min_input, ref_max: r.ref_max_input, ref_text: r.ref_text || null })) } }));
    }
    const last = saved[saved.length - 1];
    await attachFile({ exam_id: last.id, consultation_id }, `Laudo${last.lab ? ' ' + last.lab : ''} ${fmtDate(last.collection_date)}`, last.collection_date);
    invalidate('markers');
    toast(saved.length > 1 ? `${saved.length} exames salvos` : 'Exame salvo');
    return saved.length > 1 ? '#/exames?ver=datas' : `#/exames/${last.id}`;
  }
  if (S.kind === 'receita') {
    const ids = await saveMeds({ doctor_id, consultation_id });
    if (!ids.length) throw new Error('Marque pelo menos um remédio para cadastrar.');
    await attachFile({ medication_id: ids[0], consultation_id }, `Receita ${fmtDate(S.meds[0]?.start_date || today())}`, S.meds[0]?.start_date);
    toast(ids.length > 1 ? `${ids.length} remédios cadastrados` : 'Remédio cadastrado');
    return ids.length > 1 ? '#/medicamentos' : `#/medicamentos/${ids[0]}`;
  }
  const requests = S.requests.filter((r) => r.include && r.description.trim()).map((r) => ({ description: r.description.trim() }));
  let cid = consultation_id;
  if (S.kind === 'pedido' && cid) {
    const c = await api(`/consultations/${cid}`);
    await api(`/consultations/${cid}`, { method: 'PUT', body: { requests: [...c.requests.map((r) => ({ id: r.id, description: r.description, status: r.status })), ...requests] } });
  } else {
    if (!S.consult.date) throw new Error('Informe a data da consulta.');
    const body = { date: S.consult.date, specialty: S.consult.specialty || null, doctor_id, status: S.consult.date > today() ? 'agendada' : 'realizada', requests };
    if (S.kind === 'consulta') for (const k of ['reason', 'symptoms', 'diagnoses', 'conduct', 'recommendations']) body[k] = S.consult[k] || null;
    cid = (await api('/consultations', { method: 'POST', body })).id;
  }
  if (S.kind === 'consulta') await saveMeds({ doctor_id, consultation_id: cid, start_date: S.consult.date });
  await attachFile({ consultation_id: cid }, `${S.kind === 'pedido' ? 'Pedido de exames' : 'Relatório'} ${fmtDate(S.consult.date || today())}`, S.consult.date);
  toast(S.kind === 'pedido' ? 'Pedido salvo na consulta' : 'Consulta salva');
  return `#/consultas/${cid}`;
}

// ---------------------------------------------------------------- Página
export async function render({ query }) {
  const back = query.voltar ? decodeURIComponent(query.voltar) : query.doc ? `#/documentos/${query.doc}` : '#/';
  const [doctors, consultations, markers] = await Promise.all([cached('doctors', '/doctors', true), api('/consultations'), api('/markers')]);
  const ctx = { back, doctors, consultations, markers, docId: query.doc ? Number(query.doc) : null, consultationId: query.consulta || '', forceKind: KIND_LABEL[query.para] ? query.para : null };

  return view(html`
    <a class="back" href="${back}">${icon('back')}Voltar</a>
    <div class="page-head"><div><h1>Ler arquivo</h1><p class="muted" style="margin:0">Laudos, receitas, pedidos e relatórios: o Helyx lê o arquivo e mostra os dados para você conferir antes de salvar.</p></div></div>
    <div id="imp">
      ${query.doc ? '' : html`<div class="drop" id="drop" tabindex="0" role="button" aria-label="Escolher arquivo">
        ${icon('documentos')}<div><b>Arraste o arquivo aqui</b><span class="muted"> ou clique para escolher</span>
        <div class="small muted">PDF, foto (JPG, PNG), Word (.doc, .docx), Excel (.xls, .xlsx), CSV ou TXT · até 25 MB</div>
        <div class="small muted">A leitura é feita neste computador. Nada é enviado para a internet.</div></div>
        <input type="file" id="file" accept="${ACCEPT}" hidden></div>`}
      <div id="progress" class="card imp-progress" hidden><b id="progText">Lendo…</b><div class="imp-bar"><i id="progBar"></i></div>
        <p class="small muted">Fotos e PDFs escaneados levam mais tempo: o texto é reconhecido na própria imagem.</p></div>
    </div>`, (el) => {
    const box = el.querySelector('#imp');
    const progress = (msg, p) => {
      el.querySelector('#progress').hidden = false;
      if (typeof msg === 'number') { p = msg; msg = null; }
      if (msg) el.querySelector('#progText').textContent = msg;
      if (typeof p === 'number') el.querySelector('#progBar').style.width = `${Math.round(Math.max(0.03, Math.min(1, p)) * 100)}%`;
    };

    async function run(file) {
      const drop = el.querySelector('#drop'); if (drop) drop.hidden = true;
      try {
        const payload = await readForExtraction(file, progress);
        progress('Procurando os dados…', 0.95);
        const parsed = await api('/extract', { method: 'POST', body: { ...payload, document_id: ctx.docId || undefined } });
        if (S?.previewUrl) URL.revokeObjectURL(S.previewUrl);
        S = buildState(parsed, { ...ctx, file, fileName: file.name, pages: payload.pages, previewUrl: URL.createObjectURL(file) });
        show();
      } catch (err) {
        el.querySelector('#progress').hidden = true;
        if (drop) drop.hidden = false;
        toast(err.message, true);
      }
    }

    function show() {
      box.innerHTML = review().__raw;
      wire();
    }

    function refreshDerived() {
      if (S.kind !== 'exame') return;
      derive();
      box.querySelectorAll('tr[data-x]').forEach((tr) => {
        const r = S.exams[tr.dataset.x].results[tr.dataset.i];
        tr.classList.toggle('off', !r.include);
        tr.querySelector('[data-cell=sit]').innerHTML = (sitTag(r.situation) || html`<span class="meta">—</span>`).__raw;
        tr.querySelector('[data-cell=prev]').innerHTML = prevCell(r).__raw;
      });
      S.exams.forEach((e, x) => {
        const c = box.querySelector(`[data-changes="${x}"]`); if (c) c.outerHTML = changesCard(e, x).__raw;
        const t = box.querySelector(`[data-exam="${x}"] h2 .tag`); if (t) t.textContent = `${resultsOf(e).length} resultado(s)`;
      });
    }

    function wire() {
      box.querySelector('#hidePreview')?.addEventListener('click', () => {
        box.querySelector('.imp-layout').classList.remove('with-preview'); box.querySelector('.imp-preview').remove();
      });
      box.querySelector('#other')?.addEventListener('click', () => go(`#/importar${location.hash.includes('?') ? '?' + location.hash.split('?')[1] : ''}`));
      box.querySelectorAll('[data-kind]').forEach((b) => b.onclick = () => { S.kind = b.dataset.kind; show(); });
      const body = box.querySelector('#impBody');
      // resultados de exame
      body.addEventListener('change', (ev) => {
        const t = ev.target;
        const tr = t.closest('tr[data-x]');
        if (tr && t.dataset.k) { const r = S.exams[tr.dataset.x].results[tr.dataset.i]; r[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value; refreshDerived(); return; }
        const ex = t.closest('[data-exam]');
        if (ex && t.dataset.e) { S.exams[ex.dataset.exam][t.dataset.e] = t.value; refreshDerived(); return; }
        if (t.dataset.common) {
          S.common[t.dataset.common] = t.value;
          const nc = box.querySelector('#newCons'); if (nc && t.dataset.common === 'consultation') nc.hidden = !!t.value;
          return;
        }
        if (t.dataset.c) { S.consult[t.dataset.c] = t.value; return; }
        const md = t.closest('[data-m]');
        if (md && t.dataset.mk) { const m = S.meds[md.dataset.m]; m[t.dataset.mk] = t.type === 'checkbox' ? t.checked : t.value; md.classList.toggle('off', !m.include); return; }
        const q = t.closest('[data-q]');
        if (q && t.dataset.qk) { S.requests[q.dataset.q][t.dataset.qk] = t.type === 'checkbox' ? t.checked : t.value; }
      });
      body.addEventListener('input', (ev) => {
        const t = ev.target; const tr = t.closest('tr[data-x]');
        if (tr && t.dataset.k && t.type !== 'checkbox') S.exams[tr.dataset.x].results[tr.dataset.i][t.dataset.k] = t.value;
        else if (t.dataset.c) S.consult[t.dataset.c] = t.value;
        else if (t.dataset.mk && t.type !== 'checkbox') S.meds[t.closest('[data-m]').dataset.m][t.dataset.mk] = t.value;
        else if (t.dataset.qk && t.type !== 'checkbox') S.requests[t.closest('[data-q]').dataset.q][t.dataset.qk] = t.value;
      });
      body.addEventListener('click', (ev) => {
        const add = ev.target.closest('[data-add-result]');
        if (add) { S.exams[add.dataset.addResult].results.push(blankResult({ known: true })); show(); }
        if (ev.target.closest('#addMed')) { S.meds.push({ name: '', include: true, start_date: S.parsed.date || today() }); show(); }
        if (ev.target.closest('#addReq')) { S.requests.push({ description: '', include: true }); show(); }
      });
      box.querySelector('#save').onclick = async (ev) => {
        const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Salvando…';
        try { const to = await save(); if (S.previewUrl) URL.revokeObjectURL(S.previewUrl); S = null; go(to); }
        catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = 'Salvar'; }
      };
    }

    if (ctx.docId) {
      (async () => {
        try {
          progress('Abrindo o documento…', 0.02);
          const d = await api(`/documents/${ctx.docId}`);
          const res = await fetch(`/api/documents/${ctx.docId}/file`, { credentials: 'same-origin' });
          if (!res.ok) throw new Error('Não foi possível abrir o arquivo deste documento.');
          const name = d.original_name || `${d.title}.${(d.mime_type || '').split('/')[1] || 'bin'}`;
          ctx.forceKind ||= Object.entries(DOC_KIND).find(([, v]) => v === d.kind)?.[0] || null;
          ctx.consultationId ||= d.consultation_id || '';
          await run(new File([await res.blob()], name, { type: d.mime_type }));
        } catch (err) { toast(err.message, true); el.querySelector('#progress').hidden = true; }
      })();
      return;
    }
    const drop = el.querySelector('#drop'); const input = el.querySelector('#file');
    drop.onclick = () => input.click();
    drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
    input.onchange = () => { if (input.files[0]) run(input.files[0]); };
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) run(e.dataTransfer.files[0]); });
  });
}

