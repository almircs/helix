// Modo Simples: versão enxuta para idosos e pessoas pouco ligadas em tecnologia.
// Quem cuida configura tudo na versão completa; aqui a pessoa só confirma o remédio, vê a próxima consulta,
// guarda a foto de um exame e fala com a família. Fica ligado só neste aparelho (localStorage).
import { api, html, icon, toast, view, go, today, addDays, parseISO, fmtDate, daysUntil, WEEKDAYS, MONTHS } from '../lib.js';
import { waLink, doseMessage } from '../doses.js';

const KEY = 'modoSimples';
export function isOn() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }
export function turnOn() { try { localStorage.setItem(KEY, '1'); } catch { /* sem armazenamento */ } }
export function turnOff() { try { localStorage.removeItem(KEY); } catch { /* sem armazenamento */ } }

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const longDay = (iso) => { const d = parseISO(iso); return `${cap(WEEKDAYS[d.getDay()])}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`; };
const when = (iso) => { const n = daysUntil(iso); return n === 0 ? 'Hoje' : n === 1 ? 'Amanhã' : `Daqui a ${n} dias`; };
const back = html`<a class="s-back" href="#/">${icon('back')}Voltar ao início</a>`;
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
      <main class="s-content" id="content" tabindex="-1"></main>
    </div>`.__raw;
}

// ---------------------------------------------------------------- Início
async function home() {
  const [day, visits, fam] = await Promise.all([api('/doses').catch(() => ({ doses: [] })), nextVisits(), api('/family').catch(() => ({}))]);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const v = visits[0];
  const missing = (day.doses || []).filter((d) => !d.status && d.due).length;
  const meds = day.enabled && day.total
    ? (day.taken === day.total ? 'Todos tomados hoje ✓' : `${day.taken} de ${day.total} tomados hoje${missing ? ` · ${missing} para tomar agora` : ''}`)
    : 'Ver os remédios do dia';
  return view(html`
    <h1 class="s-title">${greet}!</h1>
    <div class="s-grid">
      <a class="s-big c1 ${missing ? 'alerta' : ''}" href="#/s/remedios">${icon('medicamentos')}<span><b>Meus remédios de hoje</b><small>${meds}</small></span></a>
      <a class="s-big c2" href="#/s/consulta">${icon('agenda')}<span><b>Próxima consulta</b><small>${v ? `${when(v.date)}${v.time ? ', às ' + v.time : ''}` : 'Nada marcado'}</small></span></a>
      <a class="s-big c3" href="#/s/exame">${icon('documentos')}<span><b>Guardar um exame</b><small>Tirar uma foto do papel</small></span></a>
      <a class="s-big c4" href="#/s/familia">${icon('user')}<span><b>Falar com a família</b><small>${fam.phone ? (fam.name || 'Familiar') : 'Ninguém cadastrado ainda'}</small></span></a>
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
    return html`${back}<h1 class="s-title">Remédios de hoje</h1>
      <div class="s-card"><p>O controle de remédios está desligado.</p><p class="s-hint">Quem cuida de você pode ligá-lo na versão completa, em Configurações → Controle de doses.</p></div>`;
  }
  const doses = day.doses || [];
  return view(html`${back}<h1 class="s-title">Remédios de hoje</h1>
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

// ---------------------------------------------------------------- Próxima consulta
async function visit() {
  const visits = await nextVisits();
  const v = visits[0];
  if (!v) return html`${back}<h1 class="s-title">Próxima consulta</h1><div class="s-card"><p>Nenhuma consulta ou exame marcado.</p></div>`;
  const after = visits.slice(1, 4);
  return html`${back}<h1 class="s-title">Próxima consulta</h1>
    <div class="s-card s-visit">
      <p class="s-when">${when(v.date)}</p>
      <p class="s-date">${longDay(v.date)}${v.time ? html`<br>às <b>${v.time}</b>` : ''}</p>
      <p class="s-what">${v.title}</p>
      ${v.location ? html`<p class="s-where">📍 ${v.location}</p>` : ''}
    </div>
    ${after.length ? html`<h2 class="s-h2">Depois</h2><ul class="s-after">${after.map((e) => html`<li><b>${fmtDate(e.date).slice(0, 5)}${e.time ? ' · ' + e.time : ''}</b><span>${e.title}</span></li>`)}</ul>` : ''}`;
}

// ---------------------------------------------------------------- Guardar exame (foto)
// Reduz a foto para no máximo 2000 px (ocupa menos espaço); se não conseguir, guarda a original
async function shrink(file) {
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    return blob || file;
  } catch { return file; }
}
const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = () => reject(new Error('Não foi possível ler a foto.'));
  r.readAsDataURL(blob);
});

async function exam() {
  return view(html`${back}<h1 class="s-title">Guardar um exame</h1>
    <div id="sPick">
      <p class="s-sub">Coloque o papel do exame sobre a mesa, com boa luz, e tire uma foto.</p>
      <label class="s-btn ok s-wide">📷 Tirar foto<input type="file" accept="image/*" capture="environment" hidden data-photo></label>
      <label class="s-btn ghost s-wide">Escolher uma foto já tirada<input type="file" accept="image/*" hidden data-photo></label>
    </div>
    <div id="sPreview" hidden>
      <img id="sImg" class="s-photo" alt="Foto escolhida">
      <button type="button" class="s-btn ok s-wide" id="sSave">✓ Guardar este exame</button>
      <button type="button" class="s-btn ghost s-wide" id="sAgain">Tirar outra foto</button>
    </div>`, (el) => {
    let file = null;
    const pick = el.querySelector('#sPick'); const prev = el.querySelector('#sPreview'); const img = el.querySelector('#sImg');
    el.querySelectorAll('[data-photo]').forEach((inp) => inp.onchange = () => {
      const f = inp.files[0]; inp.value = '';
      if (!f) return;
      if (/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name)) { toast('Esta foto está num formato que o Helyx não lê. Use o botão “Tirar foto”.', true); return; }
      file = f; img.src = URL.createObjectURL(f); pick.hidden = true; prev.hidden = false;
    });
    el.querySelector('#sAgain').onclick = () => { file = null; prev.hidden = true; pick.hidden = false; };
    el.querySelector('#sSave').onclick = async (e) => {
      if (!file) return;
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const blob = await shrink(file);
        const jpeg = blob.type === 'image/jpeg';
        await api('/documents', { method: 'POST', body: { kind: 'laudo', title: `Exame (foto) ${fmtDate(today())}`,
          notes: 'Guardado pelo Modo Simples', original_name: jpeg ? `exame-${today()}.jpg` : file.name,
          mime_type: blob.type || 'image/jpeg', data_base64: await toBase64(blob) } });
        toast('Exame guardado ✓');
        go('#/');
      } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = '✓ Guardar este exame'; }
    };
  });
}

// ---------------------------------------------------------------- Família
async function family() {
  const fam = await api('/family').catch(() => ({}));
  if (!fam.phone) {
    return html`${back}<h1 class="s-title">Falar com a família</h1>
      <div class="s-card"><p>Ninguém cadastrado ainda.</p><p class="s-hint">Quem cuida de você pode cadastrar um familiar na versão completa, em Configurações → Controle de doses.</p></div>`;
  }
  const tel = String(fam.phone).replace(/\D/g, '');
  return html`${back}<h1 class="s-title">Falar com ${fam.name || 'a família'}</h1>
    <a class="s-btn whats s-wide" target="_blank" rel="noopener" href="${waLink(fam.phone, '')}">💬 Mandar mensagem no WhatsApp</a>
    <a class="s-btn ghost s-wide" href="tel:${tel}">📞 Ligar</a>`;
}

// [caminho, tela]; qualquer outro caminho volta para o início
export const ROUTES = [['/', home], ['/s/remedios', meds], ['/s/consulta', visit], ['/s/exame', exam], ['/s/familia', family]];
