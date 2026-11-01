// Vacinas: doses tomadas e próximas doses (que aparecem na agenda e nas pendências).
import { api, html, raw, icon, fields, readForm, toast, view, go, fmtDate, today, relDay, askConfirm } from '../lib.js';

// Vacinas comuns em adultos (sugestões; dá para digitar qualquer nome)
const COMMON = ['Influenza (gripe)', 'COVID-19', 'Hepatite B', 'Hepatite A', 'dT (difteria e tétano)', 'dTpa (difteria, tétano e coqueluche)', 'Febre amarela',
  'Tríplice viral (sarampo, caxumba, rubéola)', 'Pneumocócica 13', 'Pneumocócica 20', 'Pneumocócica 23', 'Herpes zóster', 'HPV', 'Meningocócica ACWY',
  'Meningocócica B', 'Varicela (catapora)', 'Vírus sincicial respiratório (VSR)', 'Dengue', 'Raiva'];
const DOSES = ['Dose única', '1ª dose', '2ª dose', '3ª dose', 'Reforço', 'Dose anual'];

export async function render({ query }) {
  const list = await api('/vaccines');
  const editing = query.editar === 'nova' ? { applied_date: today(), name: query.nome || '' } : list.find((v) => String(v.id) === query.editar) || null;
  const t = today();
  // próxima dose: só a do registro mais recente de cada vacina
  const latest = new Map();
  for (const v of [...list].sort((a, b) => String(b.applied_date || '').localeCompare(String(a.applied_date || '')))) {
    const k = v.name.toLowerCase(); if (!latest.has(k)) latest.set(k, v);
  }
  const next = [...latest.values()].filter((v) => v.next_date).sort((a, b) => a.next_date.localeCompare(b.next_date));
  const byName = new Map();
  for (const v of list) { const k = v.name; if (!byName.has(k)) byName.set(k, []); byName.get(k).push(v); }

  return view(html`
    <div class="page-head"><div><h1>Vacinas</h1><p class="muted" style="margin:0">Registre as doses tomadas e a data da próxima. A próxima dose entra na agenda e vira pendência perto da data.</p></div>
      <a class="btn primary" href="#/vacinas?editar=nova">${icon('plus')}Registrar vacina</a></div>
    ${editing ? html`<form id="vform" class="card" style="margin-bottom:1rem"><h2>${editing.id ? 'Editar vacina' : 'Registrar vacina'}</h2><div class="form-grid">
        <div><label for="f_name">Vacina *</label><input id="f_name" name="name" list="vacList" value="${editing.name || ''}" required placeholder="Ex.: Influenza (gripe)"></div>
        <div><label for="f_dose">Dose</label><input id="f_dose" name="dose" list="doseList" value="${editing.dose || ''}" placeholder="1ª dose, reforço…"></div>
        ${fields([
          { name: 'applied_date', label: 'Data em que tomou', type: 'date', hint: 'deixe vazio se ainda vai tomar' },
          { name: 'next_date', label: 'Próxima dose / reforço', type: 'date' },
          { name: 'place', label: 'Local', placeholder: 'Posto de saúde, clínica, farmácia' },
          { name: 'lot', label: 'Lote' },
          { name: 'notes', label: 'Observações', type: 'textarea', full: true, placeholder: 'Reações, fabricante…' },
        ], editing)}</div>
        <datalist id="vacList">${COMMON.map((n) => html`<option value="${n}">`)}</datalist>
        <datalist id="doseList">${DOSES.map((n) => html`<option value="${n}">`)}</datalist>
        <div class="form-actions"><button class="btn primary">Salvar</button><a class="btn" href="#/vacinas">Cancelar</a>
          ${editing.id ? html`<button type="button" class="btn danger" id="vdel">${icon('trash')}Excluir</button>` : ''}</div></form>` : ''}
    ${next.length ? html`<div class="card" style="margin-bottom:1rem"><h2>Próximas doses</h2><ul class="list">${next.map((v) => html`<li>
      <div class="grow"><div class="title">${v.name}</div><div class="meta">${fmtDate(v.next_date)} · ${relDay(v.next_date)}</div></div>
      ${v.next_date < t ? html`<span class="tag acima">atrasada</span>` : ''}
      <a class="btn small" href="#/vacinas?editar=nova&nome=${encodeURIComponent(v.name)}">Registrar dose</a></li>`)}</ul></div>` : ''}
    <div class="card"><h2>Carteira de vacinação</h2>
      ${list.length ? html`<div class="vac-groups">${[...byName].map(([name, doses]) => html`<div class="vac-group"><h3>${name}</h3><ul class="list">
        ${doses.map((v) => html`<li><div class="grow"><div class="title">${v.dose || 'Dose'} ${v.applied_date ? html`— ${fmtDate(v.applied_date)}` : html`<span class="tag pendente">a tomar</span>`}</div>
          <div class="meta">${[v.place, v.lot ? 'lote ' + v.lot : null, v.next_date ? 'próxima: ' + fmtDate(v.next_date) : null].filter(Boolean).join(' · ')}</div></div>
          <a class="btn small" href="#/vacinas?editar=${v.id}">${icon('edit')}Editar</a></li>`)}</ul></div>`)}</div>`
        : html`<p class="empty">Nenhuma vacina registrada. Comece pela última vacina da gripe ou da COVID-19.</p>`}</div>
  `, (el) => {
    const f = el.querySelector('#vform'); if (!f) return;
    f.querySelector('[name=name]').focus();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = readForm(f);
      if (!body.applied_date && !body.next_date) { toast('Informe a data em que tomou ou a data da próxima dose.', true); return; }
      try {
        await api(editing.id ? `/vaccines/${editing.id}` : '/vaccines', { method: editing.id ? 'PUT' : 'POST', body });
        toast('Vacina salva'); go('#/vacinas');
      } catch (err) { toast(err.message, true); }
    };
    el.querySelector('#vdel')?.addEventListener('click', async () => {
      if (!await askConfirm({ title: 'Excluir este registro de vacina?', message: `${editing.name}${editing.dose ? ' — ' + editing.dose : ''}`, button: 'Excluir', danger: true })) return;
      await api(`/vaccines/${editing.id}`, { method: 'DELETE' }); toast('Registro excluído'); go('#/vacinas');
    });
  });
}
