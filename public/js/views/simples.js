// Modo Simples: versão enxuta para idosos e pessoas pouco ligadas em tecnologia.
// Tela inicial com Consultas e Exames (abrem as telas da versão completa, sem os menus) e Meus remédios (botão Tomei). Fica ligado só neste aparelho (localStorage).
import { api, html, icon, toast, view, go, today, addDays, fmtDate, daysUntil, WEEKDAYS, MONTHS } from '../lib.js';
import { waLink, doseMessage } from '../doses.js';

const KEY = 'modoSimples';
export function isOn() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }
export function turnOn() { try { localStorage.setItem(KEY, '1'); } catch { /* sem armazenamento */ } }
export function turnOff() { try { localStorage.removeItem(KEY); } catch { /* sem armazenamento */ } }

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const when = (iso) => { const n = daysUntil(iso); return n === 0 ? 'Hoje' : n === 1 ? 'Amanhã' : `Daqui a ${n} dias`; };
const VISIT = ['consulta', 'retorno', 'exame', 'procedimento', 'vacina'];

async function nextVisits() {
  const items = await api(`/agenda?from=${today()}&to=${addDays(today(), 365)}`).catch(() => []);
  return items.filter((e) => e.status === 'agendado' && VISIT.includes(e.type));
}

// Casca: só o nome do app e a data, sem menus
export function shell(app) {
  const d = new Date();
  app.innerHTML = html`
    <div class="simples">
      <header class="s-head"><img src="/icon.png" alt=""><div><b>Helyx</b><span>${cap(WEEKDAYS[d.getDay()])}, ${d.getDate()} de ${MONTHS[d.getMonth()]}</span></div></header>
      <a class="s-back" id="sBack" href="#/" hidden>${icon('back')}Voltar ao início</a>
      <main class="s-content" id="content" tabindex="-1"></main>
    </div>`.__raw;
}

// ---------------------------------------------------------------- Início
async function home() {
  const [day, visits, h] = await Promise.all([api('/doses').catch(() => ({ doses: [] })), nextVisits(), api('/home').catch(() => ({}))]);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const v = visits[0];
  const missing = (day.doses || []).filter((d) => !d.status && d.due).length;
  const meds = day.enabled && day.total
    ? (day.taken === day.total ? 'Todos tomados hoje ✓' : `${day.taken} de ${day.total} tomados hoje${missing ? ` · ${missing} para tomar agora` : ''}`)
    : 'Ver os remédios do dia';
  const ex = h.exams || {};
  return view(html`
    <h1 class="s-title">${greet}!</h1>
    <div class="s-grid">
      <a class="s-big c2" href="#/consultas">${icon('consultas')}<span><b>Consultas</b><small>${v ? `Próxima: ${when(v.date).toLowerCase()}${v.time ? ', às ' + v.time : ''}` : 'Nenhuma marcada'}</small></span></a>
      <a class="s-big c3" href="#/exames">${icon('exames')}<span><b>Exames</b><small>${ex.tracked ? `${ex.tracked} acompanhado(s)${ex.last ? ' · último ' + fmtDate(ex.last).slice(0, 5) : ''}` : 'Lançar o primeiro'}</small></span></a>
      <a class="s-big s-small c1 ${missing ? 'alerta' : ''}" href="#/s/remedios">${icon('medicamentos')}<span><b>Meus remédios</b><small>${meds}</small></span></a>
    </div>
    <button type="button" class="s-full" id="sFull">Usar a versão completa</button>`, (el) => {
    el.querySelector('#sFull').onclick = () => {
      if (!window.confirm('Mostrar a versão completa do Helyx, com todos os menus?\n\nDá para voltar ao Modo Simples em Configurações → Modo Simples.')) return;
      turnOff(); location.hash = '#/'; location.reload();
    };
  });
}

// ---------------------------------------------------------------- Remédios do dia
async function meds() {
  const [day, fam] = await Promise.all([api('/doses').catch(() => ({ doses: [] })), api('/family').catch(() => ({}))]);
  if (!day.enabled) {
    return html`<h1 class="s-title">Remédios de hoje</h1>
      <div class="s-card"><p>O controle de remédios está desligado.</p><p class="s-hint">Quem cuida de você pode ligá-lo na versão completa, em Configurações → Controle de doses.</p></div>`;
  }
  const doses = day.doses || [];
  return view(html`<h1 class="s-title">Remédios de hoje</h1>
    ${doses.length ? html`<p class="s-sub">${day.taken === day.total ? 'Todos tomados. Muito bem!' : `${day.taken} de ${day.total} tomados`}</p>
      <ul class="s-doses">${doses.map((d) => html`<li class="${d.status === 'tomado' ? 'ok' : d.status ? 'skip' : d.due ? 'due' : ''}">
        <div class="s-dose-head"><span class="s-time">${d.time}</span><span class="s-name">${d.name}${d.dosage ? html`<small>${d.dosage}</small>` : ''}</span></div>
        ${d.status ? html`<p class="s-done">${d.status === 'tomado' ? `✓ Tomado${d.at ? ' às ' + String(d.at).slice(11, 16) : ''}` : '✗ Marcado como não tomado'}</p>
          <div class="s-row">${fam.phone ? html`<a class="s-btn whats" target="_blank" rel="noopener" href="${waLink(fam.phone, doseMessage(fam, d))}">Avisar ${fam.name || 'a família'}</a>` : ''}
            <button type="button" class="s-btn ghost" data-dose="${d.medication_id}|${d.time}|">Desfazer</button></div>`
        : html`<div class="s-row"><button type="button" class="s-btn ok" data-dose="${d.medication_id}|${d.time}|tomado">✓ Tomei</button>
            <button type="button" class="s-btn ghost" data-dose="${d.medication_id}|${d.time}|pulado">Não tomei</button></div>`}
      </li>`)}</ul>`
    : html`<div class="s-card"><p>Nenhum remédio com horário para hoje.</p><p class="s-hint">Os horários são cadastrados por quem cuida de você, na versão completa.</p></div>`}`, (el) => {
    el.querySelectorAll('[data-dose]').forEach((b) => b.onclick = async () => {
      const [medication_id, time, status] = b.dataset.dose.split('|');
      b.disabled = true;
      try {
        await api('/doses', { method: 'POST', body: { medication_id: Number(medication_id), date: day.date, time, status: status || null } });
        toast(status === 'tomado' ? 'Remédio marcado como tomado ✓' : status ? 'Anotado: não tomado' : 'Desfeito');
        go(location.hash);
      } catch (err) { toast(err.message, true); b.disabled = false; }
    });
  });
}

// [caminho, tela] próprias do Modo Simples; Consultas, Exames e o resto abrem as telas da versão completa, sem os menus
export const ROUTES = [['/', home], ['/s/remedios', meds]];
