import { linkedBlock } from './documents.js';
import { api, html, icon, fields, readForm, readRows, options, toast, view, go, cached, invalidate,
  fmtDate, fmtLongDate, today, statusTag, confirmDialog, relDay } from '../lib.js';

export async function list({ query }) {
  const items = await api('/consultations');
  const t = today();
  const upcoming = items.filter((c) => c.status === 'agendada' && c.date >= t).reverse();
  const past = items.filter((c) => !(c.status === 'agendada' && c.date >= t));
  const specs = [...new Set(items.map((c) => c.specialty).filter(Boolean))].sort();
  const spec = query.esp || '';
  const row = (c) => html`<li><a class="row-link grow" href="#/consultas/${c.id}">
      <div class="title">${fmtDate(c.date)}${c.time ? ' · ' + c.time : ''} — ${c.is_return ? 'Retorno' : 'Consulta'}${c.specialty ? ' de ' + c.specialty : ''}</div>
      <div class="meta">${[c.doctor_name, c.location, c.diagnoses].filter(Boolean).join(' · ') || '—'}</div></a>
      <div>${c.requests_total ? html`<span class="tag ${c.requests_pending ? 'pendente' : 'realizado'}">${c.requests_total - c.requests_pending}/${c.requests_total} exames feitos</span>` : ''} ${c.status !== 'realizada' ? statusTag(c.status) : ''}</div></li>`;
  return view(html`
    <div class="page-head"><h1>Consultas</h1><div class="actions"><a class="btn" href="#/importar?para=consulta&voltar=${encodeURIComponent('#/consultas')}">${icon('documentos')}Ler pedido ou relatório</a><a class="btn primary" href="#/consultas/nova">${icon('plus')}Nova consulta</a></div></div>
    ${upcoming.length ? html`<div class="card" style="margin-bottom:1rem"><h2>Agendadas</h2><ul class="list">${upcoming.map(row)}</ul></div>` : ''}
    <div class="card"><h2>Histórico</h2>
      ${specs.length > 1 ? html`<div class="chips" style="margin-bottom:.5rem"><button class="chip ${!spec ? 'on' : ''}" data-e="">Todas</button>${specs.map((s) => html`<button class="chip ${spec === s ? 'on' : ''}" data-e="${s}">${s}</button>`)}</div>` : ''}
      <ul class="list">${past.filter((c) => !spec || c.specialty === spec).map(row)}</ul>
      ${past.length ? '' : html`<p class="empty">Nenhuma consulta registrada.</p>`}</div>`, (el) => {
    el.querySelectorAll('[data-e]').forEach((b) => b.onclick = () => go(b.dataset.e ? `#/consultas?esp=${encodeURIComponent(b.dataset.e)}` : '#/consultas'));
  });
}

const reqRow = (r = {}) => html`<div class="row simple">
  <div><label>Exame solicitado</label><input data-k="description" list="markerList" value="${r.description || ''}" placeholder="Ex.: Renina"></div>
  <div><label>Situação</label><select data-k="status">${['pendente', 'realizado', 'cancelado'].map((s) => html`<option value="${s}" ${r.status === s ? 'selected' : ''}>${s}</option>`)}</select></div>
  <div><input type="hidden" data-k="id" value="${r.id || ''}"><button type="button" class="btn icon ghost danger" data-remove aria-label="Remover">${icon('trash')}</button></div></div>`;

export async function form({ params, query }) {
  const id = params[0];
  const [c, doctors, all, markers] = await Promise.all([
    id ? api(`/consultations/${id}`) : Promise.resolve({ date: query.data || today(), status: query.data && query.data > today() ? 'agendada' : 'realizada', requests: [], previous_id: query.retorno || '', is_return: !!query.retorno }),
    cached('doctors', '/doctors', true), api('/consultations'), api('/markers'),
  ]);
  if (!id && query.retorno) {
    const prev = all.find((x) => String(x.id) === String(query.retorno));
    if (prev) Object.assign(c, { specialty: prev.specialty, doctor_id: prev.doctor_id, location: prev.location, status: 'agendada' });
  }
  if (!c.requests.length) c.requests = [{}];
  const specs = [...new Set([...doctors.map((d) => d.specialty), ...all.map((x) => x.specialty)].filter(Boolean))].sort();
  return view(html`
    <a class="back" href="${id ? '#/consultas/' + id : '#/consultas'}">${icon('back')}Voltar</a>
    <h1>${id ? 'Editar consulta' : 'Nova consulta'}</h1>
    <form id="cform">
      <fieldset><legend>Quando e com quem</legend><div class="form-grid">
        ${fields([
          { name: 'date', label: 'Data', type: 'date', required: true }, { name: 'time', label: 'Horário', type: 'time' },
          { name: 'status', label: 'Situação', type: 'select', options: [['realizada', 'Realizada'], ['agendada', 'Agendada'], ['cancelada', 'Cancelada']] },
          { name: 'specialty', label: 'Especialidade', placeholder: 'Ex.: Nefrologia' },
          { name: 'doctor_id', label: 'Médico', type: 'select', hint: html`<a href="#/configuracoes/medicos">cadastrar médico</a>`, options: options(doctors, 'id', (d) => `${d.name}${d.specialty ? ' — ' + d.specialty : ''}`, '— não informado —') },
          { name: 'location', label: 'Local' },
          { name: 'is_return', label: 'É um retorno', type: 'checkbox' },
          { name: 'previous_id', label: 'Retorno da consulta de', type: 'select', options: options(all.filter((x) => String(x.id) !== String(id)), 'id', (x) => `${fmtDate(x.date)} — ${x.specialty || 'consulta'}`, '— nenhuma —') },
        ], c)}
        <datalist id="specList">${specs.map((s) => html`<option value="${s}">`)}</datalist>
      </div></fieldset>
      <fieldset><legend>O que aconteceu</legend><div class="form-grid">
        ${fields([
          { name: 'reason', label: 'Motivo da consulta', type: 'textarea' }, { name: 'symptoms', label: 'Sintomas relatados', type: 'textarea' },
          { name: 'diagnoses', label: 'Diagnósticos informados pelo médico', type: 'textarea' }, { name: 'conduct', label: 'Condutas', type: 'textarea' },
          { name: 'prescribed', label: 'Medicamentos prescritos', type: 'textarea', hint: 'cadastre também em Medicamentos para acompanhar' },
          { name: 'recommendations', label: 'Recomendações', type: 'textarea' },
          { name: 'notes', label: 'Observações', type: 'textarea', full: true },
        ], c)}
      </div></fieldset>
      <fieldset><legend>Exames solicitados</legend>
        <p class="small muted">Quando você cadastrar o resultado desses exames, o sistema marca o pedido como realizado e liga tudo na linha do tempo.</p>
        <div class="rows" data-rows id="reqs">${c.requests.map(reqRow)}</div>
        <button type="button" class="btn small" id="addReq">${icon('plus')}Adicionar exame</button>
        <datalist id="markerList">${markers.map((m) => html`<option value="${m.name}">`)}</datalist>
      </fieldset>
      <div class="form-actions"><button class="btn primary">Salvar consulta</button><a class="btn" href="${id ? '#/consultas/' + id : '#/consultas'}">Cancelar</a></div>
    </form>`, (el) => {
    el.querySelector('[name=specialty]').setAttribute('list', 'specList');
    const reqs = el.querySelector('#reqs');
    const wire = (row) => { row.querySelector('[data-remove]').onclick = () => (reqs.children.length > 1 ? row.remove() : row.querySelector('input').value = ''); };
    reqs.querySelectorAll('.row').forEach(wire);
    el.querySelector('#addReq').onclick = () => { reqs.insertAdjacentHTML('beforeend', reqRow().__raw); wire(reqs.lastElementChild); reqs.lastElementChild.querySelector('input').focus(); };
    el.querySelector('[name=doctor_id]').onchange = (e) => {
      const d = doctors.find((x) => String(x.id) === e.target.value); const s = el.querySelector('[name=specialty]');
      if (d?.specialty && !s.value) s.value = d.specialty;
    };
    el.querySelector('#cform').onsubmit = async (e) => {
      e.preventDefault();
      const body = { ...readForm(e.target), requests: readRows(reqs).filter((r) => r.description.trim()) };
      try {
        const saved = await api(id ? `/consultations/${id}` : '/consultations', { method: id ? 'PUT' : 'POST', body });
        invalidate('consultations'); toast('Consulta salva'); go(`#/consultas/${saved.id}`);
      } catch (err) { toast(err.message, true); }
    };
  });
}

export async function detail({ params }) {
  const c = await api(`/consultations/${params[0]}`);
  const docBlock = await linkedBlock('consultation_id', c.id, 'ligado a esta consulta');
  const pending = c.requests.filter((r) => r.status === 'pendente');
  const field = (label, v) => (v ? html`<dt>${label}</dt><dd>${v}</dd>` : '');
  return view(html`
    <a class="back" href="#/consultas">${icon('back')}Consultas</a>
    <div class="page-head"><div><h1>${c.is_return ? 'Retorno' : 'Consulta'}${c.specialty ? ' — ' + c.specialty : ''}</h1>
      <p class="muted" style="margin:0">${fmtLongDate(c.date)}${c.time ? ' às ' + c.time : ''} ${c.status !== 'realizada' ? statusTag(c.status) : ''} ${c.status === 'agendada' ? '(' + relDay(c.date) + ')' : ''}</p></div>
      <div class="actions"><a class="btn" href="#/importar?para=pedido&consulta=${c.id}&voltar=${encodeURIComponent('#/consultas/' + c.id)}">${icon('documentos')}Ler arquivo</a><a class="btn" href="#/consultas/${c.id}/editar">${icon('edit')}Editar</a><a class="btn" href="#/consultas/nova?retorno=${c.id}">${icon('plus')}Agendar retorno</a><button class="btn danger" id="del">${icon('trash')}</button></div></div>

    <div class="card" style="margin-bottom:1rem"><h2>Sequência desta consulta</h2>
      <div class="flow">
        ${c.previous ? html`<a class="step" href="#/consultas/${c.previous.id}"><b>Consulta anterior</b>${fmtDate(c.previous.date)}</a><span class="arrow">→</span>` : ''}
        <div class="step" style="background:var(--primary-soft)"><b>Esta consulta</b>${fmtDate(c.date)}</div><span class="arrow">→</span>
        <div class="step"><b>Exames pedidos</b>${c.requests.length ? `${c.requests.length - pending.length} de ${c.requests.length} realizados` : 'nenhum'}</div><span class="arrow">→</span>
        <div class="step"><b>Resultados</b>${c.exams.length ? c.exams.map((e) => fmtDate(e.collection_date)).join(', ') : '—'}</div><span class="arrow">→</span>
        <div class="step"><b>Medicamentos</b>${c.medications.length + c.medication_changes.length ? [...c.medications.map((m) => `${m.name} (novo)`), ...c.medication_changes.map((m) => `${m.name} ${m.dosage || ''} (alterado)`)].join(', ') : '—'}</div>
        ${c.returns.length ? html`<span class="arrow">→</span>${c.returns.map((r) => html`<a class="step" href="#/consultas/${r.id}"><b>Retorno</b>${fmtDate(r.date)} ${r.status === 'agendada' ? '(agendado)' : ''}</a>`)}` : ''}
      </div></div>

    <div class="grid g2">
      <div class="card"><h2>Registro</h2><dl class="kv">
        ${field('Médico', c.doctor ? c.doctor.name + (c.doctor.phone ? ' · ' + c.doctor.phone : '') : null)}${field('Local', c.location)}
        ${field('Motivo', c.reason)}${field('Sintomas relatados', c.symptoms)}${field('Diagnósticos informados', c.diagnoses)}
        ${field('Condutas', c.conduct)}${field('Prescrição', c.prescribed)}${field('Recomendações', c.recommendations)}${field('Observações', c.notes)}
      </dl>${[c.reason, c.symptoms, c.diagnoses, c.conduct, c.prescribed, c.recommendations, c.notes, c.location, c.doctor].some(Boolean) ? '' : html`<p class="empty">Nada registrado ainda.</p>`}</div>
      <div class="stack">
        <div class="card"><h2>Exames solicitados</h2>
          ${c.requests.length ? html`<ul class="list">${c.requests.map((r) => html`<li><div class="grow"><div class="title">${r.description}</div>${r.fulfilled_exam_id ? html`<a class="meta" href="#/exames/${r.fulfilled_exam_id}">feito em ${fmtDate(r.fulfilled_date)}</a>` : ''}</div>${statusTag(r.status)}</li>`)}</ul>` : html`<p class="empty">Nenhum exame solicitado.</p>`}
          ${pending.length ? html`<a class="btn small primary" href="#/exames/novo?consulta=${c.id}">${icon('plus')}Lançar resultados</a> <a class="btn small" href="#/agenda?novo=exame&consulta=${c.id}">Agendar coleta</a>` : ''}
        </div>
        ${docBlock}
        ${c.events.length ? html`<div class="card"><h2>Na agenda</h2><ul class="list">${c.events.map((e) => html`<li><div class="grow"><div class="title">${e.title}</div><div class="meta">${fmtDate(e.starts_at.slice(0, 10))} ${e.starts_at.slice(11)}</div></div>${statusTag(e.status)}</li>`)}</ul></div>` : ''}
      </div>
    </div>`, (el) => {
    el.querySelector('#del').onclick = async () => {
      if (!confirmDialog('Excluir esta consulta? Os exames ligados a ela continuam cadastrados.')) return;
      await api(`/consultations/${c.id}`, { method: 'DELETE' }); toast('Consulta excluída'); go('#/consultas');
    };
  });
}
