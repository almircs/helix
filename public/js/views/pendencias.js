// Pendências: o que pede uma providência, com a ação em andamento, o status e o prazo de cada uma.
// As automáticas vêm dos dados (pedido de exame, exame fora da referência, receita, vacina); dá para criar outras.
import { api, html, raw, icon, toast, view, go, fmtDate, today, askConfirm } from '../lib.js';

export const STATUS = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' };
const KIND = { pedido: 'Pedido de exame', fora: 'Exame fora da referência', receita: 'Receita', vacina: 'Vacina', manual: 'Minha pendência' };
const TAG = { pendente: 'pendente', em_andamento: 'relevante', concluida: 'dentro', cancelada: 'cancelada' };

function item(p) {
  const late = p.due_date && p.due_date < today() && p.status !== 'concluida' && p.status !== 'cancelada';
  return html`<li class="pend" data-key="${p.key}">
    <div class="pend-main">
      <div class="pend-head"><span class="tag ${TAG[p.status]}">${STATUS[p.status]}</span><span class="meta">${KIND[p.kind]}</span>
        ${late ? html`<span class="tag acima">prazo vencido</span>` : ''}</div>
      <div class="title">${p.link ? html`<a href="${p.link}">${p.title}</a>` : p.title}</div>
      ${p.detail ? html`<div class="meta">${p.detail}</div>` : ''}
    </div>
    <div class="pend-edit form-grid">
      <div class="full"><label>Ação em andamento</label><input data-f="action" value="${p.action}" placeholder="Ex.: coleta marcada no laboratório para dia 12"></div>
      <div><label>Status</label><select data-f="status">${Object.entries(STATUS).map(([v, l]) => html`<option value="${v}" ${v === p.status ? raw('selected') : ''}>${l}</option>`)}</select></div>
      <div><label>Prazo</label><input type="date" data-f="due_date" value="${p.due_date || ''}"></div>
    </div>
    ${p.auto ? '' : html`<button class="btn icon ghost danger" data-del title="Excluir" aria-label="Excluir pendência">${icon('trash')}</button>`}
  </li>`;
}

export async function render({ query }) {
  const { open, done } = await api('/pendencias');
  const showDone = query.ver === 'resolvidas';
  return view(html`
    <div class="page-head"><div><h1>Pendências</h1><p class="muted" style="margin:0">O que pede uma providência. Anote o que está sendo feito, mude o status e defina um prazo.</p></div></div>
    <form id="newPend" class="card pend-new">
      <input name="title" placeholder="Nova pendência (ex.: marcar retorno com o cardiologista)" required aria-label="Nova pendência">
      <input type="date" name="due_date" aria-label="Prazo" title="Prazo">
      <button class="btn primary">${icon('plus')}Adicionar</button>
    </form>
    <div class="tabs"><a href="#/pendencias" class="${showDone ? '' : 'on'}">Abertas (${open.length})</a><a href="#/pendencias?ver=resolvidas" class="${showDone ? 'on' : ''}">Concluídas e canceladas (${done.length})</a></div>
    <div class="card">${(showDone ? done : open).length ? html`<ul class="list pend-list">${(showDone ? done : open).map(item)}</ul>`
      : html`<p class="empty">${showDone ? 'Nada concluído ainda.' : 'Nenhuma pendência aberta. Tudo em dia!'}</p>`}</div>
    <p class="small muted">As pendências automáticas somem sozinhas quando o problema se resolve (por exemplo, quando o exame pedido é lançado). Para as que você não quer acompanhar, use o status <b>Cancelada</b>.</p>
  `, (el) => {
    el.querySelector('#newPend').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/pendencias', { method: 'POST', body: { title: e.target.title.value, due_date: e.target.due_date.value || null } }); toast('Pendência adicionada'); go('#/pendencias'); }
      catch (err) { toast(err.message, true); }
    };
    el.querySelectorAll('.pend').forEach((li) => {
      const key = li.dataset.key;
      li.querySelectorAll('[data-f]').forEach((f) => f.onchange = async () => {
        try {
          await api(`/pendencias/${encodeURIComponent(key)}`, { method: 'PUT', body: { [f.dataset.f]: f.value } });
          if (f.dataset.f === 'status') { toast(`Status: ${STATUS[f.value]}`); go(`#/pendencias${showDone ? '?ver=resolvidas' : ''}`); } else toast('Salvo');
        } catch (err) { toast(err.message, true); }
      });
      li.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!await askConfirm({ title: 'Excluir esta pendência?', message: li.querySelector('.title').textContent, button: 'Excluir', danger: true })) return;
        try { await api(`/pendencias/${encodeURIComponent(key)}`, { method: 'DELETE' }); toast('Pendência excluída'); go(location.hash); } catch (err) { toast(err.message, true); }
      });
    });
  });
}
