// Helyx — casca da aplicação, rotas e autenticação.
import { api, html, icon, toast, fields, readForm } from './lib.js';
import * as dash from './views/dashboard.js';
import * as agenda from './views/agenda.js';
import * as exams from './views/exams.js';
import * as cons from './views/consultations.js';
import * as meds from './views/medications.js';
import * as health from './views/health.js';
import * as timeline from './views/timeline.js';
import * as settings from './views/settings.js';
import * as misc from './views/misc.js';
import * as docs from './views/documents.js';
import { startReminders } from './reminders.js';

const app = document.getElementById('app');
let me = null;

const NAV = [
  ['#/', 'Dashboard', 'dashboard'],
  ['#/agenda', 'Agenda', 'agenda'],
  ['#/exames', 'Exames', 'exames'],
  ['#/consultas', 'Consultas', 'consultas'],
  ['#/medicamentos', 'Medicamentos', 'medicamentos'],
  ['#/linha-do-tempo', 'Linha do tempo', 'tempo'],
  ['#/saude', 'Saúde', 'saude'],
  ['#/documentos', 'Documentos', 'documentos'],
  ['#/relatorios', 'Relatórios', 'relatorios'],
  ['#/ia', 'IA', 'ia', true],
  ['#/configuracoes', 'Configurações', 'config'],
];

// [padrão, view, chave de menu]
const ROUTES = [
  [/^\/$/, dash.render, '#/'],
  [/^\/agenda$/, agenda.render, '#/agenda'],
  [/^\/exames$/, exams.list, '#/exames'],
  [/^\/exames\/novo$/, exams.form, '#/exames'],
  [/^\/exames\/comparar$/, exams.compare, '#/exames'],
  [/^\/exames\/marcador\/(\d+)$/, exams.marker, '#/exames'],
  [/^\/exames\/(\d+)\/editar$/, exams.form, '#/exames'],
  [/^\/exames\/(\d+)$/, exams.detail, '#/exames'],
  [/^\/consultas$/, cons.list, '#/consultas'],
  [/^\/consultas\/nova$/, cons.form, '#/consultas'],
  [/^\/consultas\/(\d+)\/editar$/, cons.form, '#/consultas'],
  [/^\/consultas\/(\d+)$/, cons.detail, '#/consultas'],
  [/^\/medicamentos$/, meds.list, '#/medicamentos'],
  [/^\/medicamentos\/novo$/, meds.form, '#/medicamentos'],
  [/^\/medicamentos\/(\d+)\/editar$/, meds.form, '#/medicamentos'],
  [/^\/medicamentos\/(\d+)$/, meds.detail, '#/medicamentos'],
  [/^\/linha-do-tempo$/, timeline.render, '#/linha-do-tempo'],
  [/^\/saude$/, health.render, '#/saude'],
  [/^\/busca$/, misc.search, null],
  [/^\/documentos$/, docs.list, '#/documentos'],
  [/^\/documentos\/(\d+)$/, docs.detail, '#/documentos'],
  [/^\/relatorios$/, misc.reports, '#/relatorios'],
  [/^\/ia$/, misc.placeholder('ia'), '#/ia'],
  [/^\/configuracoes(?:\/(\w+))?$/, settings.render, '#/configuracoes'],
];

function shell() {
  app.innerHTML = html`
    <div class="shell">
      <aside class="side" id="side">
        <a class="brand" href="#/"><img src="/icon.png" alt="">Helyx</a>
        <nav aria-label="Menu principal"><ul class="nav">
          ${NAV.map(([href, label, ic, soon]) => html`<li><a href="${href}" data-nav="${href}">${icon(ic)}${label}${soon ? html`<span class="soon">em breve</span>` : ''}</a></li>`)}
        </ul></nav>
      </aside>
      <div class="main">
        <header class="top">
          <button class="btn icon ghost menu-btn" id="menuBtn" aria-label="Abrir menu">${icon('menu')}</button>
          <form class="search" id="searchForm" role="search">${icon('search')}
            <input type="search" name="q" id="searchInput" placeholder="Buscar: creatinina 2026, valsartana, nefrologia…" aria-label="Busca">
          </form>
          <button class="btn icon ghost" id="logoutBtn" title="Sair" aria-label="Sair">${icon('logout')}</button>
        </header>
        <main class="content" id="content" tabindex="-1"></main>
      </div>
    </div>`.__raw;
  const side = document.getElementById('side');
  const close = () => { side.classList.remove('open'); document.querySelector('.scrim')?.remove(); };
  document.getElementById('menuBtn').onclick = () => {
    side.classList.add('open');
    const s = document.createElement('div'); s.className = 'scrim'; s.onclick = close; document.body.append(s);
  };
  side.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  document.getElementById('searchForm').onsubmit = (e) => {
    e.preventDefault();
    const q = document.getElementById('searchInput').value.trim();
    if (q) location.hash = '#/busca?q=' + encodeURIComponent(q);
  };
  document.getElementById('logoutBtn').onclick = async () => { await api('/auth/logout', { method: 'POST' }); location.hash = '#/entrar'; location.reload(); };
}

function authView(mode) {
  const isLogin = mode === 'login';
  app.innerHTML = html`
    <div class="auth"><div class="card">
      <div class="brand"><img src="/icon.png" alt="">Helyx</div>
      <h1 style="text-align:center">${isLogin ? 'Entrar' : 'Criar conta'}</h1>
      <p class="muted small" style="text-align:center">Seus dados de saúde ficam guardados neste computador, protegidos por senha e criptografia.</p>
      <form id="authForm" class="stack" style="margin-top:1rem">
        ${!isLogin ? fields([{ name: 'full_name', label: 'Seu nome' }]) : ''}
        ${fields([{ name: 'email', label: 'E-mail', type: 'email', required: true }, { name: 'password', label: 'Senha', type: 'password', required: true, hint: isLogin ? '' : 'mín. 8 caracteres, com letras e números' }])}
        <button class="btn primary" style="width:100%">${isLogin ? 'Entrar' : 'Criar conta'}</button>
      </form>
      <p class="small" style="text-align:center;margin-top:1rem">${isLogin ? html`Primeira vez? <a href="#/cadastro">Criar conta</a>` : html`Já tem conta? <a href="#/entrar">Entrar</a>`}</p>
    </div></div>`.__raw;
  const form = document.getElementById('authForm');
  form.querySelector('[name=password]').autocomplete = isLogin ? 'current-password' : 'new-password';
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(isLogin ? '/auth/login' : '/auth/register', { method: 'POST', body: readForm(form) });
      me = await api('/auth/me'); location.hash = '#/'; route();
    } catch (err) { toast(err.message, true); }
  };
}

let renderId = 0;
async function route() {
  const hash = location.hash.slice(1) || '/';
  const [path, qs] = hash.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  if (path === '/entrar' || path === '/cadastro') {
    const info = await api('/auth/me').catch(() => null);
    if (info && !info.login) { me = info; location.hash = '#/'; return; } // login desligado
    me = null; return authView(path === '/entrar' ? 'login' : 'register');
  }
  if (!me) {
    try { me = await api('/auth/me'); } catch { location.hash = '#/entrar'; return; }
  }
  if (!document.getElementById('content')) { shell(); startReminders(); if (!me.login) document.getElementById('logoutBtn').style.display = 'none'; }
  const content = document.getElementById('content');
  const found = ROUTES.find(([re]) => re.test(path));
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', found && a.dataset.nav === found[2]));
  if (!found) { content.innerHTML = '<h1>Página não encontrada</h1>'; return; }
  const id = ++renderId;
  content.innerHTML = '<p class="muted">Carregando…</p>';
  try {
    const params = path.match(found[0]).slice(1);
    const out = await found[1]({ params, query, el: content, isCurrent: () => id === renderId });
    if (id !== renderId) return;
    if (out !== undefined) content.innerHTML = out.__raw ?? out;
    if (out?.mount) out.mount(content);
    window.scrollTo(0, 0);
    content.focus({ preventScroll: true });
  } catch (err) {
    if (id !== renderId) return;
    content.innerHTML = html`<div class="card"><h2>Não foi possível abrir esta página</h2><p class="muted">${err.message}</p><a class="btn" href="#/">Voltar ao início</a></div>`.__raw;
  }
}

settings.applyTheme();
window.addEventListener('hashchange', route);
route();
