// Médicos: cadastrar, editar e excluir, e ver rápido com quem já consultou e quando.
import { api, html, icon, fields, readForm, toast, view, go, invalidate, fmtDate, confirmDialog, today } from '../lib.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function list({ query }) {
  const [docs, cons] = await Promise.all([api('/doctors'), api('/consultations')]);
  const editing = query.editar === 'novo' ? {} : docs.find((d) => String(d.id) === query.editar) || null;
  // consultas de cada médico, da mais recente para a mais antiga
  const byDoc = new Map();
  for (const c of cons) {
    if (!c.doctor_id) continue;
    if (!byDoc.has(c.doctor_id)) byDoc.set(c.doctor_id, []);
    byDoc.get(c.doctor_id).push(c);
  }
  for (const l of byDoc.values()) l.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  // conta como já consultada: realizada, ou com data passada e não cancelada
  const done = (l) => l.filter((c) => c.status === 'realizada' || (c.date < today() && !['cancelada', 'a_agendar'].includes(c.status)));
  const statusTxt = { agendada: 'agendada', a_agendar: 'a agendar', realizada: 'realizada', cancelada: 'cancelada' };

  return view(html`
    <div class="page-head"><div><h1>Médicos</h1><p class="muted" style="margin:0">Com quem você já consultou e quando.</p></div>
      <div class="actions"><a class="btn" href="#/consultas">${icon('consultas')}Consultas</a><a class="btn primary" href="#/medicos?editar=novo">${icon('plus')}Novo médico</a></div></div>
    ${editing ? html`<div class="card" style="margin-bottom:1rem"><h2>${editing.id ? 'Editar médico' : 'Novo médico'}</h2><form id="dform"><div class="form-grid">
      ${fields([
        { name: 'name', label: 'Nome', required: true }, { name: 'specialty', label: 'Especialidade' }, { name: 'crm', label: 'CRM' },
        { name: 'phone', label: 'Telefone', type: 'tel' }, { name: 'email', label: 'E-mail', type: 'email' }, { name: 'address', label: 'Endereço / local de atendimento' },
        { name: 'is_reference', label: 'Médico de referência', type: 'checkbox' }, { name: 'notes', label: 'Observações', type: 'textarea', full: true },
      ], editing)}</div>
      <div class="form-actions" style="position:static;background:none"><button class="btn primary">Salvar</button><a class="btn" href="#/medicos">Cancelar</a></div></form></div>` : ''}
    <div class="card">
      <input type="search" id="docSearch" class="doc-search" placeholder="Buscar médico pelo nome, especialidade ou CRM…" aria-label="Buscar médico">
      ${docs.length ? html`<ul class="list doc-list">${docs.map((d) => {
        const l = byDoc.get(d.id) || []; const r = done(l);
        return html`<li class="doc-item" data-q="${norm([d.name, d.specialty, d.crm].join(' '))}"><details>
          <summary><div class="grow"><div class="title">${d.name} ${d.is_reference ? html`<span class="tag ativo">referência</span>` : ''}</div>
            <div class="meta">${[d.specialty, d.crm ? 'CRM ' + d.crm : null].filter(Boolean).join(' · ') || 'Sem especialidade'}</div>
            <div class="doc-seen ${r.length ? 'yes' : ''}">${r.length ? `Já consultou: ${r.length} vez(es) · última em ${fmtDate(r[0].date)}` : l.some((c) => c.status === 'agendada' && c.date >= today()) ? `Consulta marcada para ${fmtDate(l.filter((c) => c.status === 'agendada' && c.date >= today()).at(-1).date)}` : l.length ? 'Ainda sem consulta realizada' : 'Nenhuma consulta com este médico'}</div></div></summary>
          ${l.length ? html`<ul class="doc-cons">${l.map((c) => html`<li><a href="#/consultas/${c.id}"><b>${fmtDate(c.date)}</b> · ${c.is_return ? 'Retorno' : 'Consulta'}${c.specialty ? ' — ' + c.specialty : ''} <span class="muted">(${statusTxt[c.status] || c.status})</span></a></li>`)}</ul>` : ''}
          ${d.phone || d.address ? html`<p class="small muted">${[d.phone, d.address].filter(Boolean).join(' · ')}</p>` : ''}
          <div class="doc-actions"><a class="btn small" href="#/medicos?editar=${d.id}">${icon('edit')}Editar</a><button type="button" class="btn small danger" data-del="${d.id}" data-name="${d.name}">${icon('trash')}Excluir</button></div>
        </details></li>`;
      })}</ul><p class="empty" id="docNone" hidden>Nenhum médico encontrado com esse nome.</p>`
      : html`<p class="empty">Nenhum médico cadastrado. Toque em <b>Novo médico</b>.</p>`}
    </div>`, (el) => {
    const s = el.querySelector('#docSearch');
    s.oninput = () => {
      const q = norm(s.value.trim()); let n = 0;
      el.querySelectorAll('.doc-item').forEach((li) => { const show = !q || li.dataset.q.includes(q); li.hidden = !show; if (show) n++; });
      const none = el.querySelector('#docNone'); if (none) none.hidden = n > 0;
    };
    if (!editing) s.focus({ preventScroll: true });
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!confirmDialog(`Excluir ${b.dataset.name}? As consultas e exames ligados a este médico continuam cadastrados, só que sem o nome dele.`)) return;
      try { await api(`/doctors/${b.dataset.del}`, { method: 'DELETE' }); invalidate('doctors'); toast('Médico excluído'); go('#/medicos'); } catch (err) { toast(err.message, true); }
    });
    const f = el.querySelector('#dform'); if (!f) return;
    f.querySelector('[name=name]').focus();
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api(editing.id ? `/doctors/${editing.id}` : '/doctors', { method: editing.id ? 'PUT' : 'POST', body: readForm(f) });
        invalidate('doctors'); toast('Médico salvo'); go('#/medicos');
      } catch (err) { toast(err.message, true); }
    };
  });
}
