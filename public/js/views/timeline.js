import { api, html, view, go, fmtLongDate, today, relDay } from '../lib.js';

const KINDS = [['consulta', 'Consultas'], ['exame', 'Exames'], ['medicamento', 'Medicamentos'], ['documento', 'Documentos'], ['vacina', 'Vacinas'], ['agenda', 'Agenda'], ['medicao', 'Medições']];
const LABEL = { consulta: 'Consulta', retorno: 'Retorno', exame: 'Exame', medicamento: 'Medicamento', agenda: 'Compromisso', vacina: 'Vacina', procedimento: 'Procedimento', medicao: 'Medições', documento: 'Documento' };

export async function render({ query }) {
  const active = new Set((query.tipos || 'consulta,exame,medicamento,documento,vacina,agenda').split(','));
  const period = query.periodo || 'tudo';
  const from = period === '12m' ? new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10) : period === '6m' ? new Date(Date.now() - 182 * 864e5).toISOString().slice(0, 10) : '';
  const items = await api(`/timeline?kinds=${[...active].join(',')}${from ? '&from=' + from : ''}`);
  const t = today();
  const future = items.filter((i) => i.date > t).reverse();
  const past = items.filter((i) => i.date <= t);
  const group = (arr) => { const m = new Map(); for (const i of arr) { if (!m.has(i.date)) m.set(i.date, []); m.get(i.date).push(i); } return [...m]; };
  const day = ([date, its], isFuture) => html`<div class="tl-day ${isFuture ? 'future' : ''}"><div class="tl-date">${fmtLongDate(date)} <span class="meta">· ${relDay(date)}</span></div>
    ${its.map((i) => html`<a class="tl-item" href="${i.link}"><div class="kind ${i.kind}">${LABEL[i.kind] || i.kind}${i.time ? ' · ' + i.time : ''}</div>
      <div class="title">${i.title}</div>${i.lines?.length ? html`<ul>${i.lines.filter((l) => l.text).map((l) => html`<li class="${l.flag || ''}">${l.text}${l.flag ? ` (${l.flag} da ref.)` : ''}</li>`)}</ul>` : ''}</a>`)}</div>`;
  const q = (tipos, per) => `#/linha-do-tempo?tipos=${[...tipos].join(',')}${per !== 'tudo' ? '&periodo=' + per : ''}`;
  return view(html`
    <div class="page-head"><div><h1>Linha do tempo</h1><p class="muted" style="margin:0">Tudo o que aconteceu, em ordem. Clique num item para ver os detalhes.</p></div></div>
    <div class="toolbar"><div class="chips">${KINDS.map(([k, l]) => html`<button class="chip ${active.has(k) ? 'on' : ''}" data-k="${k}">${l}</button>`)}</div>
      <span class="spacer"></span>
      <div class="seg">${[['tudo', 'Tudo'], ['12m', '12 meses'], ['6m', '6 meses']].map(([v, l]) => html`<button class="${period === v ? 'on' : ''}" data-p="${v}">${l}</button>`)}</div></div>
    ${future.length ? html`<h2>Próximos</h2><div class="tl">${group(future).map((g) => day(g, true))}</div>` : ''}
    <h2>Histórico</h2>
    ${past.length ? html`<div class="tl">${group(past).map((g) => day(g, false))}</div>` : html`<p class="empty">Nada registrado neste período.</p>`}`, (el) => {
    el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
      const s = new Set(active); s.has(b.dataset.k) ? s.delete(b.dataset.k) : s.add(b.dataset.k);
      if (s.size) go(q(s, period));
    });
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => go(q(active, b.dataset.p)));
  });
}
