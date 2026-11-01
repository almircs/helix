// Categorias dos exames (Coração, Rins, Próstata…): lista agrupada com filtro, mover um ou vários
// exames, e a página para criar, renomear, ordenar e excluir categorias.
import { api, html, raw, icon, toast, view, go, fmtDate, askConfirm } from '../lib.js';

export const loadCategories = () => api('/exam-categories');

// <select> de categoria; "__novo:Nome" cria a categoria sugerida ao salvar
export function categorySelect(cats, value, { id = '', attrs = '', suggestion = null } = {}) {
  const opts = [['', '— sem categoria —'], ...cats.map((c) => [String(c.id), c.name])];
  if (suggestion && !suggestion.id) opts.push([`__novo:${suggestion.name}`, `+ Criar “${suggestion.name}”`]);
  if (String(value || '').startsWith('__novo:') && !suggestion) opts.push([String(value), `+ Criar “${String(value).slice(7)}”`]);
  const sel = value ? String(value) : suggestion ? (suggestion.id ? String(suggestion.id) : `__novo:${suggestion.name}`) : '';
  return html`<select ${id ? raw(`id="${id}"`) : ''} ${raw(attrs)}>${opts.map(([v, l]) => html`<option value="${v}" ${v === sel ? raw('selected') : ''}>${l}</option>`)}</select>`;
}

// Converte o valor do <select> em id (criando a categoria nova, se for o caso)
export async function resolveCategory(value) {
  if (!value) return null;
  if (!String(value).startsWith('__novo:')) return Number(value);
  try { return (await api('/exam-categories', { method: 'POST', body: { name: value.slice(7) } })).id; }
  catch (err) { // já existe com esse nome: usa a existente
    const c = (await loadCategories()).find((x) => x.name.toLowerCase() === value.slice(7).toLowerCase());
    if (c) return c.id; throw err;
  }
}

// ---------------------------------------------------------------- Quadro de laudos na lista de exames
export function imagingSection(exams, cats, filter = '') {
  const laudos = exams.filter((e) => e.title);
  if (!laudos.length) return '';
  const groups = [...cats.map((c) => ({ id: String(c.id), name: c.name, items: laudos.filter((e) => String(e.category_id) === String(c.id)) })),
    { id: 'sem', name: 'Sem categoria', items: laudos.filter((e) => !e.category_id || !cats.some((c) => c.id === e.category_id)) }];
  const shown = groups.filter((g) => g.items.length && (!filter || filter === g.id));
  return html`<div class="card cat-section">
    <div class="page-head" style="margin-bottom:.4rem"><h2 style="margin:0">Exames de imagem e outros laudos</h2>
      <a class="btn small" href="#/exames/categorias">${icon('edit')}Categorias</a></div>
    <div class="chips" style="margin-bottom:.8rem"><button class="chip ${filter ? '' : 'on'}" data-cat="">Todas (${laudos.length})</button>
      ${groups.filter((g) => g.items.length).map((g) => html`<button class="chip ${filter === g.id ? 'on' : ''}" data-cat="${g.id}">${g.name} (${g.items.length})</button>`)}</div>
    ${shown.map((g) => html`<div class="cat-group"><h3>${g.name} <span class="meta">${g.items.length}</span></h3>
      <ul class="list">${g.items.map((e) => html`<li>
        <input type="checkbox" data-pick="${e.id}" aria-label="Selecionar">
        <a class="row-link grow" href="#/exames/${e.id}"><div class="title">${e.title}</div><div class="meta">${fmtDate(e.collection_date)}${e.lab ? ' · ' + e.lab : ''}</div></a>
        ${categorySelect(cats, e.category_id, { attrs: `data-move="${e.id}" aria-label="Mover para a categoria" class="cat-move"` })}</li>`)}</ul></div>`)}
    <div class="cat-bulk" id="catBulk" hidden><span id="catBulkN"></span>
      ${categorySelect(cats, '', { id: 'catBulkTo', attrs: 'aria-label="Mover para"' })}<button class="btn small primary" id="catBulkGo">Mover selecionados</button></div>
  </div>`;
}

export function wireImagingSection(el, reload) {
  const box = el.querySelector('.cat-section'); if (!box) return;
  box.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => reload(b.dataset.cat));
  box.querySelectorAll('[data-move]').forEach((s) => s.onchange = async () => {
    try { await api('/exam-categories/move', { method: 'POST', body: { exam_ids: [Number(s.dataset.move)], category_id: s.value || null } }); toast('Exame movido'); reload(); }
    catch (err) { toast(err.message, true); }
  });
  const bulk = box.querySelector('#catBulk');
  const picked = () => [...box.querySelectorAll('[data-pick]:checked')].map((c) => Number(c.dataset.pick));
  box.querySelectorAll('[data-pick]').forEach((c) => c.onchange = () => {
    const n = picked().length; bulk.hidden = !n; box.querySelector('#catBulkN').textContent = `${n} selecionado(s) →`;
  });
  box.querySelector('#catBulkGo').onclick = async () => {
    try { const r = await api('/exam-categories/move', { method: 'POST', body: { exam_ids: picked(), category_id: box.querySelector('#catBulkTo').value || null } }); toast(`${r.moved} exame(s) movido(s)`); reload(); }
    catch (err) { toast(err.message, true); }
  };
}

// ---------------------------------------------------------------- Página "Categorias"
export async function manage() {
  const [cats, suggested] = await Promise.all([loadCategories(), api('/exam-categories/suggested')]);
  const missing = suggested.filter((n) => !cats.some((c) => c.name.toLowerCase() === n.toLowerCase()));
  return view(html`
    <a class="back" href="#/exames">${icon('back')}Exames</a>
    <h1>Categorias dos exames</h1>
    <p class="muted">Organize os laudos por região ou órgão (Coração, Rins, Próstata, Tireoide…). Excluir uma categoria não apaga exames: eles ficam sem categoria.</p>
    <div class="grid g2">
      <div class="card"><h2>Suas categorias</h2>
        ${cats.length ? html`<ul class="list cat-list">${cats.map((c, i) => html`<li data-id="${c.id}">
          <input value="${c.name}" data-rename="${c.id}" aria-label="Nome da categoria" class="grow">
          <span class="meta" style="white-space:nowrap">${c.exams} exame(s)</span>
          <button class="btn icon ghost" data-up="${c.id}" ${i === 0 ? raw('disabled') : ''} title="Subir" aria-label="Subir">↑</button>
          <button class="btn icon ghost" data-down="${c.id}" ${i === cats.length - 1 ? raw('disabled') : ''} title="Descer" aria-label="Descer">↓</button>
          <button class="btn icon ghost danger" data-del="${c.id}" title="Excluir" aria-label="Excluir">${icon('trash')}</button></li>`)}</ul>`
          : html`<p class="empty">Nenhuma categoria ainda. Crie uma abaixo ou use as sugeridas.</p>`}
        <form id="newCat" class="cat-new"><input name="name" placeholder="Nova categoria (ex.: Fígado)" required aria-label="Nova categoria"><button class="btn primary">${icon('plus')}Criar</button></form>
        <p class="small muted">Para renomear, edite o nome e clique fora do campo.</p>
      </div>
      <div class="card"><h2>Sugestões</h2>
        ${missing.length ? html`<p class="small muted">Clique para criar. O Helyx também sugere a categoria quando lê um laudo.</p>
          <div class="chips">${missing.map((n) => html`<button class="chip" data-sug="${n}">+ ${n}</button>`)}</div>
          <button class="btn small" id="allSug" style="margin-top:.8rem">Criar todas</button>` : html`<p class="empty">Você já tem todas as categorias sugeridas.</p>`}
      </div>
    </div>`, (el) => {
    const again = () => go('#/exames/categorias');
    const run = async (fn, msg) => { try { await fn(); if (msg) toast(msg); again(); } catch (err) { toast(err.message, true); } };
    el.querySelector('#newCat').onsubmit = (e) => { e.preventDefault(); run(() => api('/exam-categories', { method: 'POST', body: { name: e.target.name.value } }), 'Categoria criada'); };
    el.querySelectorAll('[data-rename]').forEach((i) => i.onchange = () => run(() => api(`/exam-categories/${i.dataset.rename}`, { method: 'PUT', body: { name: i.value } }), 'Categoria renomeada'));
    const order = cats.map((c) => c.id);
    const swap = (id, d) => { const i = order.indexOf(Number(id)); [order[i], order[i + d]] = [order[i + d], order[i]]; run(() => api('/exam-categories/order', { method: 'POST', body: { ids: order } })); };
    el.querySelectorAll('[data-up]').forEach((b) => b.onclick = () => swap(b.dataset.up, -1));
    el.querySelectorAll('[data-down]').forEach((b) => b.onclick = () => swap(b.dataset.down, 1));
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      const c = cats.find((x) => x.id === Number(b.dataset.del));
      if (!await askConfirm({ title: `Excluir “${c.name}”?`, message: c.exams ? `Os ${c.exams} exame(s) desta categoria não são apagados: ficam sem categoria.` : 'Esta categoria não tem exames.', button: 'Excluir', danger: true })) return;
      run(() => api(`/exam-categories/${c.id}`, { method: 'DELETE' }), 'Categoria excluída');
    });
    el.querySelectorAll('[data-sug]').forEach((b) => b.onclick = () => run(() => api('/exam-categories/suggested', { method: 'POST', body: { names: [b.dataset.sug] } }), 'Categoria criada'));
    el.querySelector('#allSug')?.addEventListener('click', () => run(() => api('/exam-categories/suggested', { method: 'POST', body: {} }), 'Categorias criadas'));
  });
}
