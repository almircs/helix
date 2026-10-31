import { api, html, icon, fields, readForm, options, toast, view, go, cached, fmtDate, fmtNum, today, statusTag, sitTag, confirmDialog } from '../lib.js';
import { lineChart } from '../chart.js';

export async function list({ query }) {
  const meds = await api('/medications');
  const st = query.status || 'ativo';
  const shown = meds.filter((m) => st === 'todos' || m.status === st);
  const count = (s) => meds.filter((m) => m.status === s).length;
  return view(html`
    <div class="page-head"><h1>Medicamentos</h1><div class="actions"><a class="btn" href="#/importar?para=receita&voltar=${encodeURIComponent('#/medicamentos')}">${icon('documentos')}Ler receita</a><a class="btn primary" href="#/medicamentos/novo">${icon('plus')}Novo medicamento</a></div></div>
    <div class="chips" style="margin-bottom:1rem">${[['ativo', `Em uso (${count('ativo')})`], ['suspenso', `Suspensos (${count('suspenso')})`], ['encerrado', `Encerrados (${count('encerrado')})`], ['todos', 'Todos']].map(([v, l]) => html`<button class="chip ${st === v ? 'on' : ''}" data-s="${v}">${l}</button>`)}</div>
    <div class="card"><ul class="list">${shown.map((m) => html`<li><a class="row-link grow" href="#/medicamentos/${m.id}">
      <div class="title">${m.name} ${m.dosage || ''}</div>
      <div class="meta">${[m.active_ingredient, m.frequency, m.schedule, m.start_date ? 'desde ' + fmtDate(m.start_date) : null].filter(Boolean).join(' · ')}</div>
      ${m.markers.length ? html`<div class="meta">Acompanhar: ${m.markers.join(', ')}</div>` : ''}</a>
      <div>${m.versions_count > 1 ? html`<span class="tag">${m.versions_count - 1} alteração(ões)</span>` : ''} ${statusTag(m.status)}</div></li>`)}</ul>
      ${shown.length ? '' : html`<p class="empty">Nenhum medicamento nesta lista.</p>`}</div>`, (el) => {
    el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => go(`#/medicamentos?status=${b.dataset.s}`));
  });
}

export async function form({ params, query }) {
  const id = params[0];
  const [m, doctors, consultations, markers] = await Promise.all([
    id ? api(`/medications/${id}`) : Promise.resolve({ status: 'ativo', start_date: today(), consultation_id: query.consulta || '', markers: [] }),
    cached('doctors', '/doctors'), api('/consultations'), api('/markers'),
  ]);
  const consOpts = options(consultations, 'id', (c) => `${fmtDate(c.date)} — ${c.specialty || 'consulta'}`, '— nenhuma —');
  return view(html`
    <a class="back" href="${id ? '#/medicamentos/' + id : '#/medicamentos'}">${icon('back')}Voltar</a>
    <h1>${id ? 'Alterar ' + m.name : 'Novo medicamento'}</h1>
    ${id ? html`<div class="note" style="margin-bottom:1rem">Mudanças em dose, horário, frequência ou situação criam uma nova versão no histórico. Nada do que foi registrado antes é apagado.</div>` : ''}
    <form id="mform">
      <fieldset><legend>Medicamento</legend><div class="form-grid">
        ${fields([
          { name: 'name', label: 'Nome', required: true, placeholder: 'Ex.: Valsartana' }, { name: 'active_ingredient', label: 'Princípio ativo' },
          { name: 'dosage', label: 'Dosagem', placeholder: 'Ex.: 320 mg' }, { name: 'presentation', label: 'Apresentação', placeholder: 'Ex.: comprimido' },
          { name: 'frequency', label: 'Frequência', placeholder: 'Ex.: 1 vez ao dia' }, { name: 'schedule', label: 'Horário(s)', placeholder: 'Ex.: 08:00' },
          { name: 'start_date', label: 'Data de início', type: 'date' }, { name: 'end_date', label: 'Término previsto', type: 'date' },
          { name: 'status', label: 'Situação', type: 'select', options: [['ativo', 'Ativo'], ['suspenso', 'Suspenso'], ['encerrado', 'Encerrado']] },
          { name: 'doctor_id', label: 'Médico que prescreveu', type: 'select', options: options(doctors, 'id', 'name', '— não informado —') },
          { name: 'consultation_id', label: 'Prescrito na consulta de', type: 'select', options: consOpts },
          { name: 'reason', label: 'Motivo do uso' }, { name: 'notes', label: 'Observações', type: 'textarea', full: true },
        ], m)}
      </div></fieldset>
      ${id ? html`<fieldset><legend>Sobre esta alteração</legend><div class="form-grid">
        ${fields([
          { name: 'effective_date', label: 'A partir de', type: 'date', value: today() },
          { name: 'change_consultation_id', label: 'Decidida na consulta de', type: 'select', options: consOpts },
          { name: 'change_reason', label: 'Motivo da alteração', type: 'textarea', full: true, placeholder: 'Ex.: ajuste de dose orientado pela nefrologista' },
        ])}</div></fieldset>` : ''}
      <fieldset><legend>Exames para acompanhar durante o uso</legend>
        <p class="small muted">Escolha os exames que você e seu médico querem observar. O sistema mostra a sequência no tempo — não afirma que o remédio causou alterações.</p>
        <div class="chips" id="mk">${markers.map((k) => html`<button type="button" class="chip ${m.markers.some((x) => x.id === k.id) ? 'on' : ''}" data-id="${k.id}">${k.name}</button>`)}</div>
        <div style="display:flex;gap:.5rem;margin-top:.75rem;max-width:420px"><input id="newMk" placeholder="Outro exame (ex.: Pressão arterial)"><button type="button" class="btn" id="addMk">Adicionar</button></div>
      </fieldset>
      <div class="form-actions"><button class="btn primary">Salvar</button><a class="btn" href="${id ? '#/medicamentos/' + id : '#/medicamentos'}">Cancelar</a></div>
    </form>`, (el) => {
    const extra = [];
    el.querySelectorAll('#mk .chip').forEach((b) => b.onclick = () => b.classList.toggle('on'));
    el.querySelector('#addMk').onclick = () => {
      const i = el.querySelector('#newMk'); const v = i.value.trim(); if (!v) return;
      extra.push(v); el.querySelector('#mk').insertAdjacentHTML('beforeend', html`<button type="button" class="chip on" data-new="${v}">${v}</button>`.__raw); i.value = '';
    };
    el.querySelector('#mform').onsubmit = async (e) => {
      e.preventDefault();
      const body = { ...readForm(e.target),
        marker_ids: [...el.querySelectorAll('#mk .chip.on[data-id]')].map((b) => Number(b.dataset.id)),
        marker_names: [...el.querySelectorAll('#mk .chip.on[data-new]')].map((b) => b.dataset.new) };
      try {
        const saved = await api(id ? `/medications/${id}` : '/medications', { method: id ? 'PUT' : 'POST', body });
        toast('Medicamento salvo'); go(`#/medicamentos/${saved.id}`);
      } catch (err) { toast(err.message, true); }
    };
  });
}

export async function detail({ params }) {
  const r = await api(`/medications/${params[0]}/related`);
  const docBlock = await (await import('./documents.js')).linkedBlock('medication_id', params[0], 'ligado a este medicamento (anexe a receita)');
  const m = r.medication;
  const marks = m.versions.map((v) => ({ x: v.effective_date, label: v.version === 1 ? `início ${v.dosage || ''}` : `alteração: ${v.dosage || ''} ${v.status}`, short: v.version === 1 ? 'início' : v.dosage || 'alt.' }));
  return view(html`
    <a class="back" href="#/medicamentos">${icon('back')}Medicamentos</a>
    <div class="page-head"><div><h1>${m.name} ${m.dosage || ''}</h1>
      <p class="muted" style="margin:0">${[m.active_ingredient, m.presentation, m.frequency, m.schedule].filter(Boolean).join(' · ')} ${statusTag(m.status)}</p></div>
      <div class="actions"><a class="btn primary" href="#/medicamentos/${m.id}/editar">${icon('edit')}Registrar alteração</a><button class="btn danger" id="del">${icon('trash')}</button></div></div>
    <div class="grid g2">
      <div class="card"><h2>Informações</h2><dl class="kv">
        <dt>Início</dt><dd>${fmtDate(m.start_date) || '—'}</dd><dt>Término previsto</dt><dd>${fmtDate(m.end_date) || '—'}</dd>
        <dt>Prescrito por</dt><dd>${m.doctor ? m.doctor.name : '—'}</dd>
        <dt>Consulta</dt><dd>${m.consultation ? html`<a href="#/consultas/${m.consultation.id}">${fmtDate(m.consultation.date)} ${m.consultation.specialty || ''}</a>` : '—'}</dd>
        <dt>Motivo</dt><dd>${m.reason || '—'}</dd><dt>Observações</dt><dd>${m.notes || '—'}</dd></dl></div>
      <div class="card"><h2>Histórico de alterações</h2><ul class="list">${[...m.versions].reverse().map((v) => html`<li><div class="grow">
        <div class="title">${fmtDate(v.effective_date)} — ${v.version === 1 ? 'Início' : 'Alteração ' + (v.version - 1)}</div>
        <div class="meta">${[v.dosage, v.frequency, v.schedule].filter(Boolean).join(' · ')}</div>${v.change_reason ? html`<div class="meta">Motivo: ${v.change_reason}</div>` : ''}</div>${statusTag(v.status)}</li>`)}</ul></div>
    </div>
    <div style="margin-top:1rem">${docBlock}</div>
    <div class="card" style="margin-top:1rem"><h2>Exames acompanhados</h2>
      <div class="note" style="margin-bottom:1rem">${r.aviso}</div>
      ${r.series.length ? html`<div class="grid ${r.series.length > 1 ? 'g2' : ''}">${r.series.map((s) => {
        const last = s.points[s.points.length - 1];
        return html`<div><h3><a href="#/exames/marcador/${s.marker.id}">${s.marker.name}</a> <span class="small muted">${s.marker.unit || ''}</span></h3>
          ${s.points.length ? lineChart({ height: 250, width: 460, unit: s.marker.unit, marks, band: last ? { min: last.ref_min, max: last.ref_max } : null, series: [{ name: s.marker.name, points: s.points.map((p) => ({ x: p.date, y: p.value_num, flag: p.situation })) }] }) : html`<p class="empty">Ainda sem resultados.</p>`}</div>`;
      })}</div>` : html`<p class="empty">Nenhum exame relacionado. <a href="#/medicamentos/${m.id}/editar">Escolher exames para acompanhar</a>.</p>`}
    </div>
    ${r.around.length > 1 && r.series.length ? html`<div class="card" style="margin-top:1rem"><h2>Antes e depois de cada alteração</h2><div class="table-wrap"><table>
      <thead><tr><th>Alteração</th>${r.series.map((s) => html`<th>${s.marker.name}</th>`)}</tr></thead>
      <tbody>${r.around.slice(1).map((a) => html`<tr><td><b>${fmtDate(a.date)}</b><div class="meta">${a.dosage || ''} ${a.status}</div></td>
        ${a.markers.map((k) => html`<td>${k.before ? html`antes: <b>${fmtNum(k.before.value, 3)}</b> <span class="meta">(${fmtDate(k.before.date)})</span>` : html`<span class="meta">sem valor antes</span>`}<br>
          ${k.after ? html`depois: <b>${fmtNum(k.after.value, 3)}</b> <span class="meta">(${fmtDate(k.after.date)})</span>` : html`<span class="meta">sem valor depois ainda</span>`}</td>`)}</tr>`)}</tbody></table></div></div>` : ''}
    ${r.timeline.length ? html`<div class="card" style="margin-top:1rem"><h2>Sequência no tempo</h2><ul class="list">${[...r.timeline].reverse().map((t) => html`<li><div class="grow">
      <div class="title">${t.kind === 'medicamento' ? t.text : html`${t.marker}: ${typeof t.value === 'number' ? fmtNum(t.value, 3) : t.value} ${t.unit || ''}`}</div>
      <div class="meta">${fmtDate(t.date)}${t.reason && t.kind === 'medicamento' ? ' · ' + t.reason : ''}</div></div>
      ${t.kind === 'resultado' ? sitTag(t.situation) : html`<span class="tag">medicamento</span>`}</li>`)}</ul></div>` : ''}`, (el) => {
    el.querySelector('#del').onclick = async () => {
      if (!confirmDialog(`Excluir ${m.name} e todo o seu histórico? Se ele apenas deixou de ser usado, prefira "Registrar alteração" e marque como encerrado.`)) return;
      await api(`/medications/${m.id}`, { method: 'DELETE' }); toast('Medicamento excluído'); go('#/medicamentos');
    };
  });
}
