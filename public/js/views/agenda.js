import { api, html, icon, fields, readForm, toast, view, go, today, addDays, parseISO, isoDate, fmtDate, fmtLongDate,
  MONTHS, MONTHS_SHORT, WEEKDAYS, EVENT_TYPES, statusTag, confirmDialog } from '../lib.js';
import { askPermission } from '../reminders.js';

const MODES = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano']];

function range(mode, d) {
  const x = parseISO(d);
  if (mode === 'dia') return [d, d];
  if (mode === 'semana') { const s = addDays(d, -x.getDay()); return [s, addDays(s, 6)]; }
  if (mode === 'ano') return [`${x.getFullYear()}-01-01`, `${x.getFullYear()}-12-31`];
  const first = new Date(x.getFullYear(), x.getMonth(), 1); const start = addDays(isoDate(first), -first.getDay());
  return [start, addDays(start, 41)];
}
function shift(mode, d, n) {
  const x = parseISO(d);
  if (mode === 'dia') return addDays(d, n);
  if (mode === 'semana') return addDays(d, 7 * n);
  if (mode === 'ano') return `${x.getFullYear() + n}-01-01`;
  return isoDate(new Date(x.getFullYear(), x.getMonth() + n, 1));
}
function title(mode, d, [a, b]) {
  const x = parseISO(d);
  if (mode === 'dia') return fmtLongDate(d);
  if (mode === 'semana') return `${fmtDate(a)} a ${fmtDate(b)}`;
  if (mode === 'ano') return String(x.getFullYear());
  return `${MONTHS[x.getMonth()][0].toUpperCase() + MONTHS[x.getMonth()].slice(1)} de ${x.getFullYear()}`;
}
const evHref = (e) => (e.source === 'consulta' ? `#/consultas/${e.id}` : e.source === 'medicamento' ? `#/medicamentos/${e.id}` : null);

function eventList(items) {
  if (!items.length) return html`<p class="empty">Nenhum compromisso.</p>`;
  return html`<ul class="list">${items.map((e) => html`<li><div class="grow">
    ${evHref(e) ? html`<a class="title" href="${evHref(e)}">${e.title}</a>` : html`<a class="title" href="#" data-edit="${e.id}">${e.title}</a>`}
    <div class="meta">${EVENT_TYPES[e.type] || e.type} · ${fmtDate(e.date)}${e.time ? ' às ' + e.time : ''}${e.location ? ' · ' + e.location : ''}</div></div>${statusTag(e.status)}</li>`)}</ul>`;
}

function eventForm(ev, consultations) {
  return html`<div class="card" id="evCard" style="margin-bottom:1rem"><h2>${ev.id ? 'Editar compromisso' : 'Novo compromisso'}</h2>
    <form id="evForm"><div class="form-grid">
      ${fields([
        { name: 'type', label: 'Tipo', type: 'select', options: Object.entries(EVENT_TYPES) },
        { name: 'title', label: 'Descrição', required: true, placeholder: 'Ex.: Coleta de sangue' },
        { name: 'date', label: 'Data', type: 'date', required: true }, { name: 'time', label: 'Horário', type: 'time' },
        { name: 'location', label: 'Local' },
        { name: 'remind_minutes', label: 'Lembrar com antecedência', type: 'select', options: [['', 'padrão'], ['0', 'na hora'], ['30', '30 min'], ['60', '1 hora'], ['120', '2 horas'], ['1440', '1 dia']] },
        { name: 'status', label: 'Situação', type: 'select', options: [['agendado', 'Agendado'], ['concluido', 'Concluído'], ['cancelado', 'Cancelado']] },
        { name: 'consultation_id', label: 'Ligado à consulta', type: 'select', options: [['', '— nenhuma —'], ...consultations.map((c) => [c.id, `${fmtDate(c.date)} — ${c.specialty || 'consulta'}`])] },
        { name: 'notes', label: 'Observações', type: 'textarea', full: true },
      ], ev)}
    </div><div class="form-actions"><button class="btn primary">Salvar</button><button type="button" class="btn" id="evCancel">Cancelar</button>
      ${ev.id ? html`<button type="button" class="btn danger" id="evDel">${icon('trash')}Excluir</button>` : ''}</div></form></div>`;
}

export async function render({ query }) {
  const mode = MODES.some(([m]) => m === query.modo) ? query.modo : 'mes';
  const d = query.d || today();
  const [a, b] = range(mode, d);
  const [items, consultations] = await Promise.all([api(`/agenda?from=${a}&to=${b}`), api('/consultations')]);
  const byDay = new Map();
  for (const e of items) { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); }
  const nav = (dd, m = mode) => `#/agenda?modo=${m}&d=${dd}`;

  let editing = null;
  if (query.evento) editing = await api(`/events/${query.evento}`).then((e) => ({ ...e, date: e.starts_at.slice(0, 10), time: e.starts_at.slice(11, 16) })).catch(() => null);
  else if (query.novo) editing = { type: query.novo in EVENT_TYPES ? query.novo : 'outro', date: query.data || (d < today() ? today() : d), status: 'agendado', consultation_id: query.consulta || '',
    title: query.novo === 'exame' ? 'Coleta de exames' : '' };

  let body;
  if (mode === 'mes') {
    const month = parseISO(d).getMonth();
    body = html`<div class="cal">${WEEKDAYS.map((w) => html`<div class="dow">${w.slice(0, 3)}</div>`)}
      ${Array.from({ length: 42 }, (_, i) => addDays(a, i)).map((day) => html`<div class="day ${parseISO(day).getMonth() !== month ? 'other' : ''} ${day === today() ? 'today' : ''}" data-day="${day}">
        <span class="n">${parseISO(day).getDate()}</span>${(byDay.get(day) || []).map((e) => html`<span class="ev ${e.type} ${e.status}" title="${(e.time || '') + ' ' + e.title}">${e.time ? e.time + ' ' : ''}${e.title}</span>`)}</div>`)}</div>`;
  } else if (mode === 'ano') {
    const y = parseISO(d).getFullYear();
    body = html`<div class="year">${MONTHS.map((mn, i) => {
      const evs = items.filter((e) => Number(e.date.slice(5, 7)) === i + 1);
      return html`<div class="m" data-month="${y}-${String(i + 1).padStart(2, '0')}-01"><b>${mn[0].toUpperCase() + mn.slice(1)}</b>
        <span class="meta">${evs.length ? `${evs.length} compromisso(s)` : 'livre'}</span>
        ${evs.slice(0, 3).map((e) => html`<div class="small">${e.date.slice(8)}/${MONTHS_SHORT[i]} · ${e.title}</div>`)}</div>`;
    })}</div>`;
  } else {
    const days = mode === 'dia' ? [d] : Array.from({ length: 7 }, (_, i) => addDays(a, i));
    body = html`<div class="stack">${days.map((day) => html`<div class="card"><h2>${fmtLongDate(day)}${day === today() ? ' · hoje' : ''}
      <button class="btn small" data-new="${day}">${icon('plus')}</button></h2>${eventList(byDay.get(day) || [])}</div>`)}</div>`;
  }

  return view(html`
    <div class="page-head"><h1>Agenda</h1><div class="actions">
      ${'Notification' in window && Notification.permission === 'default' ? html`<button class="btn" id="notif">${icon('bell')}Ativar lembretes</button>` : ''}
      <a class="btn primary" href="${nav(d)}&novo=outro">${icon('plus')}Novo compromisso</a></div></div>
    ${editing ? eventForm(editing, consultations) : ''}
    <div class="toolbar">
      <div class="seg">${MODES.map(([m, l]) => html`<button class="${m === mode ? 'on' : ''}" data-mode="${m}">${l}</button>`)}</div>
      <div class="seg"><button data-go="${shift(mode, d, -1)}" aria-label="Anterior">‹</button><button data-go="${today()}">Hoje</button><button data-go="${shift(mode, d, 1)}" aria-label="Próximo">›</button></div>
      <b style="font-size:1.1rem">${title(mode, d, [a, b])}</b>
    </div>
    ${body}
    ${mode === 'mes' && items.length ? html`<div class="card" style="margin-top:1rem"><h2>Compromissos do período</h2>${eventList(items.filter((e) => parseISO(e.date).getMonth() === parseISO(d).getMonth()))}</div>` : ''}
    <p class="small muted" style="margin-top:1rem">Consultas agendadas e términos previstos de medicamentos aparecem aqui automaticamente. Os lembretes aparecem enquanto o sistema estiver aberto no navegador.</p>`, (el) => {
    el.querySelectorAll('[data-mode]').forEach((x) => x.onclick = () => go(nav(d, x.dataset.mode)));
    el.querySelectorAll('[data-go]').forEach((x) => x.onclick = () => go(nav(x.dataset.go)));
    el.querySelectorAll('[data-day]').forEach((x) => x.onclick = () => go(nav(x.dataset.day, 'dia')));
    el.querySelectorAll('[data-month]').forEach((x) => x.onclick = () => go(nav(x.dataset.month, 'mes')));
    el.querySelectorAll('[data-new]').forEach((x) => x.onclick = () => go(`${nav(d)}&novo=outro&data=${x.dataset.new}`));
    el.querySelectorAll('[data-edit]').forEach((x) => x.onclick = (e) => { e.preventDefault(); go(`${nav(d)}&evento=${x.dataset.edit}`); });
    el.querySelector('#notif')?.addEventListener('click', async () => { const r = await askPermission(); toast(r === 'granted' ? 'Lembretes ativados' : 'Permissão não concedida'); });
    const f = el.querySelector('#evForm');
    if (f) {
      f.querySelector('[name=title]').focus();
      el.querySelector('#evCancel').onclick = () => go(nav(d));
      el.querySelector('#evDel')?.addEventListener('click', async () => {
        if (!confirmDialog('Excluir este compromisso?')) return;
        await api(`/events/${editing.id}`, { method: 'DELETE' }); toast('Compromisso excluído'); go(nav(d));
      });
      f.onsubmit = async (e) => {
        e.preventDefault();
        const v = readForm(f);
        const body = { ...v, starts_at: v.time ? `${v.date} ${v.time}` : v.date };
        delete body.date; delete body.time;
        try {
          await api(editing.id ? `/events/${editing.id}` : '/events', { method: editing.id ? 'PUT' : 'POST', body });
          toast('Compromisso salvo'); go(nav(v.date));
        } catch (err) { toast(err.message, true); }
      };
    }
  });
}
