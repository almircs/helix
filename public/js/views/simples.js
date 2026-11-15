// Modo Simples: versão enxuta para idosos e pessoas pouco ligadas em tecnologia.
// Tela inicial com Consultas e Exames (abrem as telas da versão completa, sem os menus) e Medicamentos (as mesmas telas, com Tomei e Avisar). Fica ligado só neste aparelho (localStorage).
import { api, html, icon, view, today, addDays, fmtDate, daysUntil, WEEKDAYS, MONTHS } from '../lib.js';

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
      <a class="s-big s-small c1 ${missing ? 'alerta' : ''}" href="#/medicamentos">${icon('medicamentos')}<span><b>Medicamentos</b><small>${meds}</small></span></a>
    </div>
    <button type="button" class="s-full" id="sFull">Usar a versão completa</button>`, (el) => {
    el.querySelector('#sFull').onclick = () => {
      if (!window.confirm('Mostrar a versão completa do Helyx, com todos os menus?\n\nDá para voltar ao Modo Simples em Configurações → Modo Simples.')) return;
      turnOff(); location.hash = '#/'; location.reload();
    };
  });
}

// [caminho, tela] próprias do Modo Simples; Consultas, Exames, Medicamentos e o resto abrem as telas da versão completa, sem os menus
export const ROUTES = [['/', home]];
