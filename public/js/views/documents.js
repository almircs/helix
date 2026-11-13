import { api, html, icon, fields, readForm, options, toast, view, go, cached, fmtDate, today, confirmDialog } from '../lib.js';
import { ACCEPT, kindOf, mimeOf } from '../reader.js';

export const KINDS = { laudo: 'Laudo / resultado', receita: 'Receita', pedido: 'Pedido de exame', relatorio: 'Relatório médico', imagem: 'Imagem de exame', outro: 'Outro' };
const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const blobCache = new Map();

async function fileUrl(id) {
  if (blobCache.has(id)) return blobCache.get(id);
  const res = await fetch(`/api/documents/${id}/file`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Não foi possível abrir o arquivo.');
  const url = URL.createObjectURL(await res.blob());
  blobCache.set(id, url);
  return url;
}

function linksText(d) {
  return [
    d.consultation && `Consulta ${fmtDate(d.consultation.date)}${d.consultation.specialty ? ' · ' + d.consultation.specialty : ''}`,
    d.exam && `Exame ${fmtDate(d.exam.collection_date)}`,
    d.doctor && d.doctor.name,
    d.medication && d.medication.name,
  ].filter(Boolean);
}

const OFFICE_LABEL = { docx: 'Word', doc: 'Word', xlsx: 'Excel', xls: 'Excel', csv: 'CSV', txt: 'TXT' };
const badgeOf = (d) => (d.is_pdf ? 'PDF' : d.is_image ? 'foto' : OFFICE_LABEL[(d.original_name || '').toLowerCase().split('.').pop()] || 'arquivo');

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(file);
  });
}

async function linkOptions() {
  const [consultations, exams, doctors, meds] = await Promise.all([api('/consultations'), api('/exams'), cached('doctors', '/doctors', true), api('/medications')]);
  return {
    consultation_id: options(consultations, 'id', (c) => `${fmtDate(c.date)} — ${c.specialty || 'consulta'}${c.doctor_name ? ' · ' + c.doctor_name : ''}`, '— nenhuma —'),
    exam_id: options(exams, 'id', (e) => `${fmtDate(e.collection_date)} — ${e.lab || 'exames'}${e.markers.length ? ' (' + e.markers.slice(0, 3).join(', ') + ')' : ''}`, '— nenhum —'),
    doctor_id: options(doctors, 'id', (d) => `${d.name}${d.specialty ? ' — ' + d.specialty : ''}`, '— nenhum —'),
    medication_id: options(meds, 'id', (m) => `${m.name} ${m.dosage || ''}`.trim(), '— nenhum —'),
  };
}
const linkFields = (o) => [
  { name: 'consultation_id', label: 'Consulta', type: 'select', options: o.consultation_id },
  { name: 'exam_id', label: 'Exame', type: 'select', options: o.exam_id },
  { name: 'doctor_id', label: 'Médico', type: 'select', options: o.doctor_id },
  { name: 'medication_id', label: 'Medicamento', type: 'select', options: o.medication_id },
];

// ---------------------------------------------------------------- Lista + envio
export async function list({ query }) {
  const filter = query.tipo || '';
  const [docs, opts] = await Promise.all([api('/documents'), linkOptions()]);
  const shown = docs.filter((d) => !filter || d.kind === filter);
  const preset = { kind: query.tipo_novo || (query.exam_id ? 'laudo' : query.medication_id ? 'receita' : 'laudo'), doc_date: today(),
    consultation_id: query.consultation_id || '', exam_id: query.exam_id || '', doctor_id: query.doctor_id || '', medication_id: query.medication_id || '' };
  const back = query.voltar || '';
  return view(html`
    <div class="page-head"><div><h1>Documentos</h1><p class="muted" style="margin:0">Laudos, receitas, pedidos e imagens, guardados criptografados neste computador.</p></div></div>

    <div class="drop" id="drop" tabindex="0" role="button" aria-label="Adicionar documento">
      ${icon('documentos')}<div><b>Arraste um arquivo aqui</b><span class="muted"> ou clique para escolher</span>
      <div class="small muted">PDF, foto, Word, Excel, CSV ou TXT · até 25 MB cada</div></div>
      <input type="file" id="file" accept="${ACCEPT}" multiple hidden>
    </div>

    <form id="upForm" class="card" hidden style="margin-bottom:1rem">
      <h2>Novo documento</h2>
      <div id="picked" class="small muted" style="margin-bottom:.75rem"></div>
      <div class="form-grid">
        ${fields([
          { name: 'title', label: 'Título', required: true, placeholder: 'Ex.: Hemograma e creatinina' },
          { name: 'kind', label: 'Tipo', type: 'select', options: Object.entries(KINDS) },
          { name: 'doc_date', label: 'Data do documento', type: 'date' },
        ], preset)}
        <div></div>
        ${fields(linkFields(opts), preset)}
        ${fields([{ name: 'notes', label: 'Observações', type: 'textarea', full: true }], preset)}
      </div>
      <div class="form-actions"><button class="btn primary" id="saveBtn">Guardar documento</button><button type="button" class="btn" id="cancelUp">Cancelar</button></div>
    </form>

    <div class="chips" style="margin-bottom:1rem">
      <button class="chip ${!filter ? 'on' : ''}" data-k="">Todos (${docs.length})</button>
      ${Object.entries(KINDS).filter(([k]) => docs.some((d) => d.kind === k)).map(([k, l]) => html`<button class="chip ${filter === k ? 'on' : ''}" data-k="${k}">${l} (${docs.filter((d) => d.kind === k).length})</button>`)}
    </div>
    ${shown.length ? html`<div class="doc-grid">${shown.map((d) => html`<a class="doc-card" href="#/documentos/${d.id}">
        <span class="doc-thumb" data-thumb="${d.is_image ? d.id : ''}">${d.is_image ? '' : html`<span class="pdf-badge">${badgeOf(d)}</span>`}</span>
        <span class="doc-info"><b>${d.title}</b><small>${KINDS[d.kind] || d.kind} · ${fmtDate(d.doc_date)}</small>
        ${linksText(d).length ? html`<small class="doc-links">${linksText(d).join(' · ')}</small>` : ''}</span></a>`)}</div>`
      : html`<div class="card"><p class="empty">${docs.length ? 'Nenhum documento deste tipo.' : 'Nenhum documento ainda. Comece guardando o último laudo de exame ou a receita atual.'}</p></div>`}
  `, (el) => {
    const drop = el.querySelector('#drop'); const input = el.querySelector('#file'); const form = el.querySelector('#upForm');
    let files = [];
    const pick = (list) => {
      files = [...list].filter((f) => kindOf(f) && kindOf(f) !== 'heic' && /^(application|image\/(jpeg|png|webp|gif)|text\/)/.test(mimeOf(f)));
      if (!files.length) { toast('Escolha um PDF, uma foto (JPG, PNG, WEBP), um arquivo do Word ou do Excel, CSV ou TXT.', true); return; }
      const big = files.find((f) => f.size > 25 * 1048576); if (big) { toast(`${big.name} passa de 25 MB.`, true); return; }
      form.hidden = false; drop.hidden = true;
      el.querySelector('#picked').textContent = files.map((f) => `${f.name} (${fmtSize(f.size)})`).join(' · ');
      const t = form.querySelector('[name=title]');
      if (!t.value) t.value = files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') : '';
      t.placeholder = files.length > 1 ? 'Deixe vazio para usar o nome de cada arquivo' : t.placeholder;
      t.required = files.length === 1; t.focus();
    };
    drop.onclick = () => input.click();
    drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
    input.onchange = () => pick(input.files);
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => pick(e.dataTransfer.files));
    el.querySelector('#cancelUp').onclick = () => { form.hidden = true; drop.hidden = false; files = []; input.value = ''; };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const meta = readForm(form); const btn = el.querySelector('#saveBtn'); btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        let last;
        for (const f of files) {
          last = await api('/documents', { method: 'POST', body: { ...meta, title: files.length > 1 && !meta.title ? f.name.replace(/\.[^.]+$/, '') : meta.title || f.name,
            original_name: f.name, mime_type: mimeOf(f), data_base64: await fileToBase64(f) } });
        }
        toast(files.length > 1 ? `${files.length} documentos guardados` : 'Documento guardado');
        go(back ? decodeURIComponent(back) : files.length === 1 ? `#/documentos/${last.id}` : '#/documentos');
      } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = 'Guardar documento'; }
    };
    el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => go(b.dataset.k ? `#/documentos?tipo=${b.dataset.k}` : '#/documentos'));
    el.querySelectorAll('[data-thumb]').forEach(async (t) => {
      if (!t.dataset.thumb) return;
      try { t.style.backgroundImage = `url("${await fileUrl(Number(t.dataset.thumb))}")`; } catch { /* sem miniatura */ }
    });
    if (query.novo) { drop.focus(); drop.classList.add('over'); setTimeout(() => drop.classList.remove('over'), 1500); }
  });
}

// ---------------------------------------------------------------- Detalhe
export async function detail({ params }) {
  const [d, opts] = await Promise.all([api(`/documents/${params[0]}`), linkOptions()]);
  return view(html`
    <a class="back" href="#/documentos">${icon('back')}Documentos</a>
    <div class="page-head"><div><h1>${d.title}</h1><p class="muted" style="margin:0">${KINDS[d.kind] || d.kind} · ${fmtDate(d.doc_date)} · ${fmtSize(d.size_bytes || 0)}</p></div>
      <div class="actions"><a class="btn primary" href="#/importar?doc=${d.id}">${icon('documentos')}Extrair dados</a><a class="btn" href="/api/documents/${d.id}/file?baixar=1" download>${icon('download')}Baixar</a><button class="btn danger" id="del">${icon('trash')}Excluir</button></div></div>
    <div class="doc-detail">
      <div class="card doc-view" id="viewer"><p class="muted">Abrindo…</p></div>
      <form class="card" id="meta"><h2>Informações</h2>
        <div class="stack">${fields([
          { name: 'title', label: 'Título', required: true },
          { name: 'kind', label: 'Tipo', type: 'select', options: Object.entries(KINDS) },
          { name: 'doc_date', label: 'Data do documento', type: 'date' },
          ...linkFields(opts),
          { name: 'notes', label: 'Observações', type: 'textarea' },
        ], d)}</div>
        <div class="form-actions"><button class="btn primary">Salvar</button></div>
        ${linksText(d).length ? html`<p class="small muted">Ligado a: ${[
          d.consultation && html`<a href="#/consultas/${d.consultation.id}">consulta de ${fmtDate(d.consultation.date)}</a>`,
          d.exam && html`<a href="#/exames/${d.exam.id}">exame de ${fmtDate(d.exam.collection_date)}</a>`,
          d.medication && html`<a href="#/medicamentos/${d.medication.id}">${d.medication.name}</a>`,
          d.doctor && html`<span>${d.doctor.name}</span>`].filter(Boolean).map((x, i) => html`${i ? ', ' : ''}${x}`)}</p>` : ''}
      </form>
    </div>`, async (el) => {
    el.querySelector('#meta').onsubmit = async (e) => {
      e.preventDefault();
      try { await api(`/documents/${d.id}`, { method: 'PUT', body: readForm(e.target) }); toast('Documento salvo'); go(`#/documentos/${d.id}`); } catch (err) { toast(err.message, true); }
    };
    el.querySelector('#del').onclick = async () => {
      if (!confirmDialog('Excluir este documento? O arquivo será apagado deste computador.')) return;
      await api(`/documents/${d.id}`, { method: 'DELETE' }); blobCache.delete(d.id); toast('Documento excluído'); go('#/documentos');
    };
    const box = el.querySelector('#viewer');
    try {
      const url = await fileUrl(d.id);
      box.innerHTML = d.is_pdf ? html`<iframe src="${url}" title="${d.title}"></iframe>`.__raw : d.is_image ? html`<img src="${url}" alt="${d.title}">`.__raw
        : html`<div class="empty"><p>Arquivo ${badgeOf(d)} — a visualização não está disponível aqui.</p><p>Use <b>Baixar</b> para abrir no programa do computador, ou <b>Extrair dados</b> para ler o conteúdo.</p></div>`.__raw;
    } catch (err) { box.innerHTML = html`<p class="empty">${err.message}</p>`.__raw; }
  });
}

// Bloco reutilizado em consultas, exames e medicamentos
export async function linkedBlock(field, id, label) {
  const docs = await api(`/documents?${field}=${id}`);
  const here = encodeURIComponent(location.hash);
  return html`<div class="card"><h2>Documentos <a href="#/documentos?novo=1&${field}=${id}&voltar=${here}">${icon('plus')} anexar</a></h2>
    ${docs.length ? html`<ul class="list">${docs.map((d) => html`<li><a class="row-link grow" href="#/documentos/${d.id}"><div class="title">${d.title}</div>
      <div class="meta">${KINDS[d.kind] || d.kind} · ${fmtDate(d.doc_date)}</div></a><span class="tag">${badgeOf(d)}</span></li>`)}</ul>`
      : html`<p class="empty">Nenhum documento ${label}.</p>`}</div>`;
}
