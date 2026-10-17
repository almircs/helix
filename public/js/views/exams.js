import { api, html, raw, icon, fields, readForm, readRows, options, toast, view, go, cached, invalidate,
  fmtDate, fmtNum, numInput, sitTag, trendTag, today, confirmDialog, SITUATION, TREND } from '../lib.js';
import { lineChart } from '../chart.js';

const DISCLAIMER = html`<p class="small muted">As indicações “acima/abaixo” e “aumento/redução” apenas comparam números com a referência do laudo e com o resultado anterior. Não são diagnóstico — servem de apoio para a conversa com seu médico.</p>`;
const valueOf = (r) => (r.value_num != null ? fmtNum(r.value_num, 3) : r.value_text || '—');

// ---------------------------------------------------------------- Lista
export async function list({ query }) {
  const tab = query.ver === 'datas' ? 'datas' : 'marcadores';
  const [markers, exams] = await Promise.all([api('/markers'), api('/exams')]);
  const withData = markers.filter((m) => m.count > 0);
  return view(html`
    <div class="page-head"><h1>Exames</h1><div class="actions">
      ${withData.length > 1 ? html`<a class="btn" href="#/exames/comparar">Comparar</a>` : ''}
      <a class="btn primary" href="#/exames/novo">${icon('plus')}Novo exame</a></div></div>
    <div class="tabs"><a href="#/exames" class="${tab === 'marcadores' ? 'on' : ''}">Por exame (${withData.length})</a><a href="#/exames?ver=datas" class="${tab === 'datas' ? 'on' : ''}">Por data de coleta (${exams.length})</a></div>
    ${tab === 'marcadores' ? html`
      <div class="toolbar"><input type="search" id="filter" placeholder="Filtrar exames…" style="max-width:320px">
        <div class="chips" id="sitFilter"><button class="chip on" data-s="">Todos</button><button class="chip" data-s="fora">Fora da referência</button></div></div>
      <div class="card"><div class="table-wrap"><table id="mtable"><thead><tr><th>Exame</th><th class="num">Último</th><th>Data</th><th>Situação</th><th>Tendência</th><th class="num">Registros</th></tr></thead><tbody>
      ${withData.map((m) => html`<tr data-name="${m.name.toLowerCase()}" data-out="${m.last_situation === 'acima' || m.last_situation === 'abaixo' ? 1 : 0}">
        <td><a href="#/exames/marcador/${m.id}"><b>${m.name}</b></a></td>
        <td class="num"><b>${typeof m.last_value === 'number' ? fmtNum(m.last_value, 3) : m.last_value}</b> <span class="meta">${m.unit || ''}</span></td>
        <td>${fmtDate(m.last_date)}</td><td>${sitTag(m.last_situation)}</td><td>${trendTag(m.overall)}</td><td class="num">${m.count}</td></tr>`)}
      </tbody></table></div>${withData.length ? '' : html`<p class="empty">Nenhum resultado ainda. <a href="#/exames/novo">Cadastre o primeiro exame</a>.</p>`}</div>`
    : html`<div class="card"><ul class="list">${exams.map((e) => html`<li><a class="row-link grow" href="#/exames/${e.id}">
        <div class="title">${fmtDate(e.collection_date)} — ${e.lab || 'Laboratório não informado'}</div>
        <div class="meta">${e.exam_type ? e.exam_type + ' · ' : ''}${e.markers.join(', ') || 'sem resultados'}</div></a>
        <div>${e.out_of_range ? html`<span class="tag acima">${e.out_of_range} fora da ref.</span>` : ''} <span class="tag">${e.results_count} resultado(s)</span></div></li>`)}</ul>
        ${exams.length ? '' : html`<p class="empty">Nenhum exame cadastrado.</p>`}</div>`}
    ${DISCLAIMER}`, (el) => {
    const f = el.querySelector('#filter'); if (!f) return;
    let sit = '';
    const apply = () => el.querySelectorAll('#mtable tbody tr').forEach((tr) => {
      tr.hidden = !tr.dataset.name.includes(f.value.toLowerCase()) || (sit === 'fora' && tr.dataset.out !== '1');
    });
    f.oninput = apply;
    el.querySelectorAll('#sitFilter .chip').forEach((b) => b.onclick = () => {
      el.querySelectorAll('#sitFilter .chip').forEach((x) => x.classList.toggle('on', x === b)); sit = b.dataset.s; apply();
    });
  });
}

// ---------------------------------------------------------------- Formulário
function resultRow(r = {}) {
  return html`<div class="row">
    <div class="marker"><label>Exame / marcador</label><input data-k="marker_name" list="markerList" value="${r.marker_name || ''}" placeholder="Ex.: Creatinina" required></div>
    <div><label>Resultado</label><input data-k="value" inputmode="decimal" value="${r.value_num != null ? numInput(r.value_num) : r.value_text || ''}" placeholder="1,57"></div>
    <div><label>Unidade</label><input data-k="unit" value="${r.unit || ''}" placeholder="mg/dL"></div>
    <div><label>Ref. mínima</label><input data-k="ref_min" inputmode="decimal" value="${numInput(r.ref_min)}"></div>
    <div><label>Ref. máxima</label><input data-k="ref_max" inputmode="decimal" value="${numInput(r.ref_max)}"></div>
    <div><input type="hidden" data-k="id" value="${r.id || ''}"><input type="hidden" data-k="ref_text" value="${r.ref_text || ''}">
      <button type="button" class="btn icon ghost danger" data-remove aria-label="Remover linha">${icon('trash')}</button></div>
  </div>`;
}

export async function form({ params, query }) {
  const id = params[0];
  const [exam, doctors, consultations, markers] = await Promise.all([
    id ? api(`/exams/${id}`) : Promise.resolve({ collection_date: today(), results: [], consultation_id: query.consulta || '' }),
    cached('doctors', '/doctors'), api('/consultations'), api('/markers'),
  ]);
  // Pré-preenche linhas a partir dos exames pedidos numa consulta
  if (!id && query.consulta) {
    const c = await api(`/consultations/${query.consulta}`);
    exam.results = c.requests.filter((r) => r.status === 'pendente').map((r) => {
      const m = markers.find((k) => k.id === r.marker_id) || {};
      return { marker_name: r.description, unit: m.unit, ref_min: m.ref_min, ref_max: m.ref_max };
    });
    exam.requested_by_doctor_id = c.doctor_id;
  }
  if (!exam.results.length) exam.results = [{}];
  return view(html`
    <a class="back" href="${id ? '#/exames/' + id : '#/exames'}">${icon('back')}Voltar</a>
    <h1>${id ? 'Editar exame' : 'Novo exame'}</h1>
    <form id="examForm">
      <fieldset><legend>Dados da coleta</legend><div class="form-grid">
        ${fields([
          { name: 'collection_date', label: 'Data da coleta', type: 'date', required: true },
          { name: 'result_date', label: 'Data do resultado', type: 'date' },
          { name: 'lab', label: 'Laboratório', placeholder: 'Nome do laboratório' },
          { name: 'exam_type', label: 'Tipo de exame', type: 'select', options: [['', '—'], ...['Sangue', 'Urina', 'Fezes', 'Imagem', 'Cardiológico', 'Outro'].map((x) => [x, x])] },
          { name: 'requested_by_doctor_id', label: 'Médico solicitante', type: 'select', options: options(doctors, 'id', (d) => `${d.name}${d.specialty ? ' — ' + d.specialty : ''}`, '— não informado —') },
          { name: 'consultation_id', label: 'Pedido na consulta de', type: 'select', hint: 'liga o exame à consulta', options: options(consultations.filter((c) => c.status !== 'cancelada'), 'id', (c) => `${fmtDate(c.date)} — ${c.specialty || 'consulta'}${c.requests_pending ? ` (${c.requests_pending} pendente)` : ''}`, '— automático / nenhuma —') },
          { name: 'reason', label: 'Motivo / indicação', type: 'textarea', full: true },
        ], exam)}
      </div></fieldset>
      <fieldset><legend>Resultados</legend>
        <p class="small muted">Um exame pode ter vários resultados. A referência é a que vem no laudo; ao escolher um exame já cadastrado, unidade e referência são preenchidas.</p>
        <div class="rows" data-rows id="rows">${exam.results.map(resultRow)}</div>
        <button type="button" class="btn small" id="addRow">${icon('plus')}Adicionar resultado</button>
        <datalist id="markerList">${markers.map((m) => html`<option value="${m.name}">`)}</datalist>
      </fieldset>
      <fieldset><legend>Observações</legend>${fields([{ name: 'notes', label: 'Observação', type: 'textarea', full: true }], exam)}
        <p class="small muted">O anexo do PDF/imagem do laudo chega com o módulo de Documentos (próxima etapa).</p></fieldset>
      <div class="form-actions"><button class="btn primary">Salvar exame</button><a class="btn" href="${id ? '#/exames/' + id : '#/exames'}">Cancelar</a></div>
    </form>`, (el) => {
    const rows = el.querySelector('#rows');
    const byName = new Map(markers.map((m) => [m.name.toLowerCase(), m]));
    const wire = (row) => {
      row.querySelector('[data-remove]').onclick = () => { if (rows.children.length > 1) row.remove(); else row.querySelectorAll('input').forEach((i) => { i.value = ''; }); };
      row.querySelector('[data-k=marker_name]').onchange = (e) => {
        const m = byName.get(e.target.value.trim().toLowerCase()); if (!m) return;
        const set = (k, v) => { const i = row.querySelector(`[data-k=${k}]`); if (!i.value && v != null) i.value = numInput(v); };
        set('unit', m.unit); set('ref_min', m.ref_min); set('ref_max', m.ref_max);
      };
    };
    rows.querySelectorAll('.row').forEach(wire);
    el.querySelector('#addRow').onclick = () => {
      rows.insertAdjacentHTML('beforeend', resultRow().__raw); const r = rows.lastElementChild; wire(r); r.querySelector('input').focus();
    };
    el.querySelector('#examForm').onsubmit = async (e) => {
      e.preventDefault();
      const body = { ...readForm(e.target), results: readRows(rows).filter((r) => r.marker_name.trim()) };
      try {
        const saved = await api(id ? `/exams/${id}` : '/exams', { method: id ? 'PUT' : 'POST', body });
        invalidate('markers'); toast('Exame salvo'); go(`#/exames/${saved.id}`);
      } catch (err) { toast(err.message, true); }
    };
  });
}

// ---------------------------------------------------------------- Detalhe
export async function detail({ params }) {
  const e = await api(`/exams/${params[0]}`);
  return view(html`
    <a class="back" href="#/exames?ver=datas">${icon('back')}Exames</a>
    <div class="page-head"><div><h1>Exames de ${fmtDate(e.collection_date)}</h1>
      <p class="muted" style="margin:0">${[e.lab, e.exam_type, e.result_date ? 'resultado em ' + fmtDate(e.result_date) : null].filter(Boolean).join(' · ')}</p></div>
      <div class="actions"><a class="btn" href="#/exames/${e.id}/editar">${icon('edit')}Editar</a><button class="btn danger" id="del">${icon('trash')}Excluir</button></div></div>
    ${e.consultation || e.fulfilled_requests.length ? html`<div class="note" style="margin-bottom:1rem">
      ${e.consultation ? html`Solicitado na <a href="#/consultas/${e.consultation.id}">consulta de ${fmtDate(e.consultation.date)}${e.consultation.specialty ? ' (' + e.consultation.specialty + ')' : ''}</a>. ` : ''}
      ${e.fulfilled_requests.length ? html`Atende ao(s) pedido(s): ${e.fulfilled_requests.map((r) => r.description).join(', ')}.` : ''}</div>` : ''}
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Exame</th><th class="num">Resultado</th><th>Referência</th><th>Situação</th><th>Comparado ao anterior</th></tr></thead>
      <tbody>${e.results.map((r) => html`<tr>
        <td><a href="#/exames/marcador/${r.marker_id}"><b>${r.marker_name}</b></a>${r.notes ? html`<div class="meta">${r.notes}</div>` : ''}</td>
        <td class="num"><b>${valueOf(r)}</b> <span class="meta">${r.unit || ''}</span></td>
        <td>${r.ref_label || '—'}</td><td>${sitTag(r.situation) || '—'}</td>
        <td>${r.previous ? html`${trendTag(r.previous)} <div class="meta">antes: ${fmtNum(r.previous.value, 3)} em ${fmtDate(r.previous.date)}</div>` : html`<span class="meta">primeiro registro</span>`}</td></tr>`)}
      </tbody></table></div></div>
    <div class="grid g2" style="margin-top:1rem"><div class="card"><h2>Informações</h2><dl class="kv">
      <dt>Médico solicitante</dt><dd>${e.doctor ? e.doctor.name : '—'}</dd>
      <dt>Motivo</dt><dd>${e.reason || '—'}</dd><dt>Observação</dt><dd>${e.notes || '—'}</dd></dl></div></div>
    ${DISCLAIMER}`, (el) => {
    el.querySelector('#del').onclick = async () => {
      if (!confirmDialog('Excluir este exame e todos os seus resultados? Esta ação fica registrada no histórico de alterações.')) return;
      await api(`/exams/${e.id}`, { method: 'DELETE' }); toast('Exame excluído'); go('#/exames?ver=datas');
    };
  });
}

// ---------------------------------------------------------------- Evolução de um marcador
async function medMarks(markerId) {
  const meds = await api('/medications');
  const related = meds.filter((m) => m.markers.length);
  const out = [];
  for (const m of related) {
    const full = await api(`/medications/${m.id}`);
    if (!full.markers.some((k) => k.id === Number(markerId))) continue;
    for (const v of full.versions) out.push({ x: v.effective_date, label: `${full.name}: ${v.version === 1 ? 'início' : 'alteração'} ${v.dosage || ''} ${v.status !== 'ativo' ? v.status : ''}`.trim(), short: full.name.slice(0, 3), med: full });
  }
  return out;
}

export async function marker({ params, query }) {
  const range = query.periodo || 'tudo';
  const from = range === '12m' ? new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10) : range === '6m' ? new Date(Date.now() - 182 * 864e5).toISOString().slice(0, 10) : '';
  const [h, marks] = await Promise.all([api(`/markers/${params[0]}/history${from ? '?from=' + from : ''}`), medMarks(params[0])]);
  const m = h.marker; const s = h.summary;
  const last = h.points[h.points.length - 1];
  const band = last && (last.ref_min != null || last.ref_max != null) ? { min: last.ref_min, max: last.ref_max } : null;
  const visibleMarks = marks.filter((k) => !from || k.x >= from);
  return view(html`
    <a class="back" href="#/exames">${icon('back')}Exames</a>
    <div class="page-head"><div><h1>${m.name}</h1><p class="muted" style="margin:0">${m.unit || ''}${band ? ' · referência ' + (last.ref_label || '') : ''}</p></div>
      <div class="actions"><div class="seg" role="group" aria-label="Período">${[['tudo', 'Tudo'], ['12m', '12 meses'], ['6m', '6 meses']].map(([v, l]) => html`<button class="${range === v ? 'on' : ''}" data-p="${v}">${l}</button>`)}</div>
      <a class="btn" href="#/exames/comparar?m=${m.id}">Comparar</a></div></div>
    <div class="grid g4" style="margin-bottom:1rem">
      <div class="card"><div class="meta">Último</div><div class="stat">${last ? valueOf(last) : '—'}</div><div class="meta">${last ? fmtDate(last.date) : ''} ${sitTag(last?.situation)}</div></div>
      <div class="card"><div class="meta">Do primeiro ao último</div><div class="stat">${s.overall ? `${s.overall.pct > 0 ? '+' : ''}${fmtNum(s.overall.pct, 1)}%` : '—'}</div><div>${trendTag(s.overall)}</div></div>
      <div class="card"><div class="meta">Menor / maior</div><div class="stat">${s.min != null ? `${fmtNum(s.min, 3)} / ${fmtNum(s.max, 3)}` : '—'}</div></div>
      <div class="card"><div class="meta">Fora da referência</div><div class="stat">${s.out_of_range} <span class="small muted">de ${s.count}</span></div></div>
    </div>
    <div class="card"><h2>Evolução</h2>${lineChart({ unit: m.unit, band, marks: visibleMarks, series: [{ name: m.name, points: h.points.map((p) => ({ x: p.date, y: p.value_num, flag: p.situation, unit: p.unit })) }] })}</div>
    <div class="card" style="margin-top:1rem"><h2>Histórico</h2><div class="table-wrap"><table>
      <thead><tr><th>Data</th><th class="num">Resultado</th><th>Referência</th><th>Situação</th><th>Variação</th><th>Laboratório</th></tr></thead>
      <tbody>${[...h.points].reverse().map((p) => html`<tr><td><a href="#/exames/${p.exam_id}">${fmtDate(p.date)}</a></td><td class="num"><b>${valueOf(p)}</b> <span class="meta">${p.unit || ''}</span></td>
        <td>${p.ref_label || '—'}</td><td>${sitTag(p.situation) || '—'}</td><td>${p.trend ? trendTag(p.trend) : html`<span class="meta">—</span>`}</td><td>${p.lab || ''}</td></tr>`)}</tbody></table></div></div>
    ${visibleMarks.length ? html`<div class="card" style="margin-top:1rem"><h2>Medicamentos acompanhados por este exame</h2>
      <ul class="list">${visibleMarks.map((k) => html`<li><div class="grow"><a href="#/medicamentos/${k.med.id}" class="title">${k.label}</a><div class="meta">${fmtDate(k.x)}</div></div></li>`)}</ul>
      <p class="small muted">As linhas tracejadas no gráfico marcam quando o medicamento começou ou foi alterado. É apenas uma referência de tempo, não indica causa.</p></div>` : ''}
    ${DISCLAIMER}`, (el) => {
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => go(`#/exames/marcador/${m.id}${b.dataset.p === 'tudo' ? '' : '?periodo=' + b.dataset.p}`));
  });
}

// ---------------------------------------------------------------- Comparação
export async function compare({ query }) {
  const markers = (await api('/markers')).filter((m) => m.count > 0);
  const selected = new Set(String(query.m || '').split(',').filter(Boolean).map(Number));
  const hist = selected.size ? await api(`/compare?markers=${[...selected].join(',')}`) : [];
  // tabela combinada por data
  const dates = [...new Set(hist.flatMap((h) => h.points.map((p) => p.date)))].sort().reverse();
  return view(html`
    <a class="back" href="#/exames">${icon('back')}Exames</a>
    <h1>Comparar exames</h1>
    <p class="muted">Escolha dois ou mais exames para ver a evolução lado a lado.</p>
    <div class="chips" style="margin-bottom:1rem">${markers.map((m) => html`<button class="chip ${selected.has(m.id) ? 'on' : ''}" data-id="${m.id}">${m.name}</button>`)}</div>
    ${hist.length ? html`
      <div class="grid ${hist.length > 1 ? 'g2' : ''}">${hist.map((h) => {
        const last = h.points[h.points.length - 1];
        return html`<div class="card"><h2><a href="#/exames/marcador/${h.marker.id}">${h.marker.name}</a> <span class="small muted">${h.marker.unit || ''}</span></h2>
          ${lineChart({ height: 250, width: 460, unit: h.marker.unit, band: last ? { min: last.ref_min, max: last.ref_max } : null, series: [{ name: h.marker.name, points: h.points.map((p) => ({ x: p.date, y: p.value_num, flag: p.situation })) }] })}
          <p class="small">${h.summary.overall ? html`Do primeiro ao último: ${trendTag(h.summary.overall)}` : 'Apenas um resultado.'} · ${h.summary.out_of_range} de ${h.summary.count} fora da referência</p></div>`;
      })}</div>
      <div class="card" style="margin-top:1rem"><h2>Resultados por data</h2><div class="table-wrap"><table>
        <thead><tr><th>Data</th>${hist.map((h) => html`<th class="num">${h.marker.name}</th>`)}</tr></thead>
        <tbody>${dates.map((d) => html`<tr><td>${fmtDate(d)}</td>${hist.map((h) => { const p = h.points.find((x) => x.date === d); return html`<td class="num">${p ? html`${valueOf(p)} ${p.situation === 'acima' ? '↑' : p.situation === 'abaixo' ? '↓' : ''}` : html`<span class="meta">—</span>`}</td>`; })}</tr>`)}</tbody>
      </table></div><p class="small muted">↑ acima e ↓ abaixo da referência do laudo.</p></div>` : html`<div class="card"><p class="empty">Selecione os exames acima.</p></div>`}
    ${DISCLAIMER}`, (el) => {
    el.querySelectorAll('.chip[data-id]').forEach((b) => b.onclick = () => {
      const id = Number(b.dataset.id); selected.has(id) ? selected.delete(id) : selected.add(id);
      go(`#/exames/comparar?m=${[...selected].join(',')}`);
    });
  });
}

export { SITUATION, TREND, raw };
