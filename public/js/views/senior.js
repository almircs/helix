// Modo sênior: letra grande, poucos botões. Mostra os remédios de hoje com "Tomei" e
// deixa avisar um familiar pelo WhatsApp (a mensagem só sai quando a pessoa toca no botão).
import { api, html, toast, view, go, rerender, today, addDays, relDay } from '../lib.js';

const WD = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const isSenior = () => { try { return localStorage.getItem('modo') === 'senior'; } catch { return false; } };
export function setSenior(on) { try { if (on) localStorage.setItem('modo', 'senior'); else localStorage.removeItem('modo'); } catch { /* sem armazenamento */ } }

// ---- Mensagens para a família (texto pronto; quem envia é a pessoa, pelo WhatsApp dela)
export function waLink(phone, text) {
  let n = String(phone || '').replace(/\D/g, '');
  if (n.length === 10 || n.length === 11) n = '55' + n; // DDD + número, sem o código do país
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
const medLabel = (d) => [d.name, d.dosage].filter(Boolean).join(' ');
export function doseMessage(fam, d) {
  const who = fam.my_name || 'Eu';
  const what = fam.include_names ? ` (${medLabel(d)})` : '';
  return d.status === 'tomado'
    ? `✅ ${who} tomou o remédio das ${d.time}${what}. Anotado às ${String(d.at || '').slice(11, 16)} no Helyx.`
    : `⚠️ ${who} anotou que NÃO tomou o remédio das ${d.time}${what}.`;
}
export function weekMessage(fam, hist) {
  const who = fam.my_name || 'Eu';
  const lines = hist.filter((h) => h.total).map((h) => {
    const d = new Date(h.date + 'T12:00:00');
    const mark = h.taken === h.total ? '✅' : h.skipped || h.missing ? '⚠️' : '';
    return `${WD[d.getDay()].slice(0, 3)} ${h.date.slice(8, 10)}/${h.date.slice(5, 7)}: ${h.taken} de ${h.total} tomados${h.skipped ? `, ${h.skipped} não tomado(s)` : ''}${h.missing ? `, ${h.missing} sem anotação` : ''} ${mark}`.trim();
  });
  return `Remédios de ${who} — últimos ${lines.length} dia(s) (Helyx)\n${lines.join('\n') || 'Nenhum remédio com horário cadastrado.'}`;
}

// Próximo compromisso (consulta, exame, retorno…) a partir de agora
async function agendaNext() {
  const items = await api(`/agenda?from=${today()}&to=${addDays(today(), 60)}`).catch(() => []);
  const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const e = items.find((x) => x.status === 'agendado' && !['receita', 'medicamento'].includes(x.type) && (x.date > today() || !x.time || x.time >= hm));
  if (!e) return null;
  const d = new Date(e.date + 'T12:00:00');
  const rel = relDay(e.date);
  return { title: e.title, when: `${rel === 'hoje' || rel === 'amanhã' ? rel[0].toUpperCase() + rel.slice(1) + ', ' : ''}${WD[d.getDay()]}, ${d.getDate()} de ${MES[d.getMonth()]}${e.time ? ' às ' + e.time : ''}` };
}

function greeting() { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }

export async function render() {
  const [day, fam, next] = await Promise.all([api('/doses'), api('/family'), agendaNext()]);
  const now = new Date();
  const hasFam = !!fam.phone;
  const famName = fam.name || 'minha família';
  // a dose "da vez": a primeira atrasada ou já na hora; senão a próxima do dia
  const current = day.doses.find((d) => d.due) || day.doses.find((d) => !d.status) || null;
  const left = day.doses.filter((d) => !d.status).length;
  const track = day.enabled;
  const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const upcoming = day.doses.find((d) => d.time >= nowHM) || null;

  const plainRow = (d) => html`<li class="sr-dose sr-plain ${d === upcoming ? 'proximo' : ''}">
    <span class="sr-time">${d.time}</span>
    <span class="sr-name"><b>${medLabel(d)}</b>${d.presentation ? html`<small>${d.presentation}</small>` : ''}</span>
    <small class="sr-state">${d === upcoming ? 'Próximo' : d.time < nowHM ? 'Já passou' : ''}</small>
  </li>`;
  const doseRow = (d) => html`<li class="sr-dose ${d.status || (d.late ? 'atrasado' : '')}">
    <span class="sr-time">${d.time}</span>
    <span class="sr-name"><b>${medLabel(d)}</b>${d.presentation ? html`<small>${d.presentation}</small>` : ''}
      <small class="sr-state">${d.status === 'tomado' ? `✓ Tomei às ${String(d.at).slice(11, 16)}` : d.status === 'pulado' ? '✗ Não tomei' : d.late ? 'Atrasado' : d.due ? 'Está na hora' : 'Mais tarde'}</small></span>
    ${d.status ? html`<button class="sr-undo" data-undo="${d.medication_id}|${d.time}">Desfazer</button>`
      : html`<button class="sr-ok" data-take="${d.medication_id}|${d.time}">Tomei</button>`}
  </li>`;

  return view(html`
  <div class="senior-page">
    <header class="sr-head">
      <h1>${greeting()}${fam.my_name ? `, ${fam.my_name}` : ''}</h1>
      <p>${WD[now.getDay()]}, ${now.getDate()} de ${MES[now.getMonth()]}</p>
    </header>

    ${day.total === 0 ? html`<section class="sr-card"><h2>Nenhum remédio com horário</h2>
        <p>Peça para alguém cadastrar os remédios com o horário (ex.: 08:00 e 20:00) em Medicamentos.</p></section>`
    : !track ? (upcoming ? html`<section class="sr-card sr-now"><span class="sr-label">Próximo remédio às ${upcoming.time}</span>
        <h2>${medLabel(upcoming)}</h2>${upcoming.presentation ? html`<p>${upcoming.presentation}</p>` : ''}</section>` : '')
    : current ? html`<section class="sr-card sr-now ${current.late ? 'atrasado' : ''}" aria-live="polite">
        <span class="sr-label">${current.late ? `Atrasado — era às ${current.time}` : current.due ? 'Está na hora' : `Próximo remédio às ${current.time}`}</span>
        <h2>${medLabel(current)}</h2>
        ${current.presentation ? html`<p>${current.presentation}</p>` : ''}
        <button class="sr-big" data-take="${current.medication_id}|${current.time}">✓ Tomei</button>
        <button class="sr-skip" data-skip="${current.medication_id}|${current.time}">Não vou tomar agora</button>
      </section>`
    : html`<section class="sr-card sr-done"><span class="sr-label">Tudo certo</span><h2>Todos os remédios de hoje foram anotados</h2>
        ${hasFam ? html`<a class="sr-big" target="_blank" rel="noopener" href="${waLink(fam.phone, `✅ ${fam.my_name || 'Eu'} tomou todos os remédios de hoje (${day.taken} de ${day.total}). — Helyx`)}">Avisar ${famName}</a>` : ''}</section>`}

    <section class="sr-card">
      <h2>Remédios de hoje <small>${track && day.total ? `${day.taken} de ${day.total} tomados${left ? ` · faltam ${left}` : ''}` : ''}</small></h2>
      <ul class="sr-list">${day.doses.map(track ? doseRow : plainRow)}</ul>
    </section>

    ${next ? html`<section class="sr-card sr-next"><span class="sr-label">Próximo compromisso</span>
      <h2>${next.when}</h2><p>${next.title}</p></section>` : ''}

    ${hasFam ? html`<section class="sr-family">
      <a class="sr-btn" href="tel:+${fam.phone.length <= 11 ? '55' + fam.phone : fam.phone}">Ligar para ${famName}</a>
      <a class="sr-btn" target="_blank" rel="noopener" href="${waLink(fam.phone, `${fam.my_name || 'Eu'} está pedindo ajuda pelo Helyx. Pode me ligar?`)}">Pedir ajuda</a>
    </section>` : html`<p class="sr-hint">Para avisar um familiar pelo WhatsApp, cadastre o contato em Configurações → Modo sênior.</p>`}

    <div class="sr-exit"><a href="#/configuracoes/senior">Ajustes</a> · <a href="#/" data-exit>Sair do modo sênior</a></div>
    <div id="srSent" class="sr-toast" hidden></div>
  </div>`, (el) => {
    const find = (key) => { const [id, t] = key.split('|'); return day.doses.find((d) => String(d.medication_id) === id && d.time === t); };
    const send = async (key, status) => {
      const d = find(key); if (!d) return;
      el.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      try {
        const res = await api('/doses', { method: 'POST', body: { medication_id: d.medication_id, date: day.date, time: d.time, status } });
        const after = res.doses.find((x) => x.medication_id === d.medication_id && x.time === d.time);
        if (status && hasFam && after) offerNotify(el, fam, after); else rerender();
      } catch (err) { toast(err.message, true); rerender(); }
    };
    el.querySelectorAll('[data-take]').forEach((b) => b.onclick = () => send(b.dataset.take, 'tomado'));
    el.querySelectorAll('[data-skip]').forEach((b) => b.onclick = () => send(b.dataset.skip, 'pulado'));
    el.querySelectorAll('[data-undo]').forEach((b) => b.onclick = () => send(b.dataset.undo, null));
    el.querySelector('[data-exit]').onclick = (e) => { e.preventDefault(); setSenior(false); go('#/'); };
  });
}

// Depois de anotar: oferece avisar o familiar (um toque abre o WhatsApp com a mensagem pronta)
function offerNotify(el, fam, d) {
  const box = el.querySelector('#srSent');
  box.hidden = false;
  box.innerHTML = html`<div class="sr-card">
    <h2>${d.status === 'tomado' ? 'Anotado! ✓' : 'Anotado'}</h2>
    <p>${d.status === 'tomado' ? `Você tomou o remédio das ${d.time}.` : `O remédio das ${d.time} ficou como não tomado.`}</p>
    <a class="sr-big" target="_blank" rel="noopener" id="srWa" href="${waLink(fam.phone, doseMessage(fam, d))}">Avisar ${fam.name || 'minha família'} no WhatsApp</a>
    <button class="sr-skip" id="srClose">Agora não</button></div>`.__raw;
  const close = () => rerender();
  box.querySelector('#srWa').addEventListener('click', () => setTimeout(close, 400));
  box.querySelector('#srClose').onclick = close;
  box.querySelector('#srWa').focus();
}

