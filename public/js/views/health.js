import { api, html, icon, fields, readForm, toast, view, go, fmtDate, fmtNum, today, confirmDialog } from '../lib.js';
import { lineChart } from '../chart.js';

const TYPES = { pressao: ['Pressão arterial', 'mmHg'], fc: ['Frequência cardíaca', 'bpm'], peso: ['Peso', 'kg'], glicemia: ['Glicemia', 'mg/dL'], temperatura: ['Temperatura', '°C'], saturacao: ['Saturação', '%'], outro: ['Outro', ''] };
const nowTime = () => new Date().toTimeString().slice(0, 5);
const show = (m) => (m.type === 'pressao' ? `${fmtNum(m.value1)}/${fmtNum(m.value2)}` : fmtNum(m.value1, 2));

export async function render({ query }) {
  const type = query.tipo in TYPES ? query.tipo : 'pressao';
  const rows = await api(`/measurements?type=${type}`);
  const asc = [...rows].reverse();
  const [label, unit] = TYPES[type];
  const series = type === 'pressao'
    ? [{ name: 'Sistólica', points: asc.map((r) => ({ x: r.measured_at.slice(0, 10), y: r.value1 })) }, { name: 'Diastólica', points: asc.map((r) => ({ x: r.measured_at.slice(0, 10), y: r.value2 })) }]
    : [{ name: label, points: asc.map((r) => ({ x: r.measured_at.slice(0, 10), y: r.value1 })) }];
  return view(html`
    <div class="page-head"><div><h1>Saúde — medições</h1><p class="muted" style="margin:0">Registre medições feitas em casa ou na farmácia.</p></div></div>
    <div class="chips" style="margin-bottom:1rem">${Object.entries(TYPES).map(([k, [l]]) => html`<button class="chip ${k === type ? 'on' : ''}" data-t="${k}">${l}</button>`)}</div>
    <div class="grid g2">
      <div class="card"><h2>Nova medição — ${label}</h2>
        <form id="mform"><div class="form-grid">
          ${fields([
            { name: 'date', label: 'Data', type: 'date', value: today(), required: true }, { name: 'time', label: 'Horário', type: 'time', value: nowTime() },
            ...(type === 'pressao' ? [{ name: 'value1', label: 'Sistólica (máxima)', type: 'number', required: true, placeholder: '120' }, { name: 'value2', label: 'Diastólica (mínima)', type: 'number', required: true, placeholder: '80' }]
              : [{ name: 'value1', label: `Valor${unit ? ' (' + unit + ')' : ''}`, type: 'number', required: true }, ...(type === 'outro' ? [{ name: 'label', label: 'Indicador', required: true }, { name: 'unit', label: 'Unidade' }] : [])]),
            { name: 'notes', label: 'Observação', placeholder: 'Ex.: em repouso, após café', full: true },
          ])}</div>
          <div class="form-actions"><button class="btn primary">${icon('plus')}Registrar</button></div></form></div>
      <div class="card"><h2>Evolução</h2>${rows.length ? lineChart({ unit, series, height: 240 }) : html`<p class="empty">Sem medições ainda.</p>`}</div>
    </div>
    <div class="card" style="margin-top:1rem"><h2>Registros</h2>${rows.length ? html`<div class="table-wrap"><table>
      <thead><tr><th>Data</th><th>Hora</th>${type === 'outro' ? html`<th>Indicador</th>` : ''}<th class="num">Valor</th><th>Observação</th><th></th></tr></thead>
      <tbody>${rows.map((r) => html`<tr><td>${fmtDate(r.measured_at.slice(0, 10))}</td><td>${r.measured_at.slice(11)}</td>${type === 'outro' ? html`<td>${r.label}</td>` : ''}
        <td class="num"><b>${show(r)}</b> <span class="meta">${r.unit || unit}</span></td><td>${r.notes || ''}</td>
        <td><button class="btn small ghost danger" data-del="${r.id}" aria-label="Excluir">${icon('trash')}</button></td></tr>`)}</tbody></table></div>` : html`<p class="empty">Nenhum registro.</p>`}</div>
    <p class="small muted">Os valores são apenas registrados e organizados. Converse com seu médico sobre metas e valores de referência para você.</p>`, (el) => {
    el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => go(`#/saude?tipo=${b.dataset.t}`));
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!confirmDialog('Excluir esta medição?')) return;
      await api(`/measurements/${b.dataset.del}`, { method: 'DELETE' }); go(`#/saude?tipo=${type}`);
    });
    el.querySelector('#mform').onsubmit = async (e) => {
      e.preventDefault();
      const v = readForm(e.target);
      try {
        await api('/measurements', { method: 'POST', body: { type, measured_at: `${v.date}${v.time ? ' ' + v.time : ''}`, value1: v.value1, value2: v.value2, label: v.label, unit: v.unit || unit, notes: v.notes } });
        toast('Medição registrada'); go(`#/saude?tipo=${type}`);
      } catch (err) { toast(err.message, true); }
    };
  });
}
