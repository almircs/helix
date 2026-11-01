// Helyx — casca da aplicação, rotas e autenticação.
import { api, html, icon, toast, fields, readForm, showRecoveryCode, capsLockHint } from './lib.js';
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
import * as importar from './views/importar.js';
import * as pendencias from './views/pendencias.js';
import * as vacinas from './views/vacinas.js';
import { startReminders } from './reminders.js';

const app = document.getElementById('app');
let me = null;

const NAV = [
  ['#/', 'Início', 'dashboard'],
  ['#/agenda', 'Agenda', 'agenda'],
  ['#/exames', 'Exames', 'exames'],
  ['#/consultas', 'Consultas', 'consultas'],
  ['#/medicamentos', 'Medicamentos', 'medicamentos'],
  ['#/linha-do-tempo', 'Linha do tempo', 'tempo'],
  ['#/saude', 'Saúde', 'saude'],
  ['#/vacinas', 'Vacinas', 'vacinas'],
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
  [/^\/exames\/categorias$/, exams.categories, '#/exames'],
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
  [/^\/importar$/, importar.render, null],
  [/^\/pendencias$/, pendencias.render, null],
  [/^\/vacinas$/, vacinas.render, '#/vacinas'],
  [/^\/documentos$/, docs.list, '#/documentos'],
  [/^\/documentos\/(\d+)$/, docs.detail, '#/documentos'],
  [/^\/relatorios$/, misc.reports, '#/relatorios'],
  [/^\/ia$/, misc.placeholder('ia'), '#/ia'],
  [/^\/configuracoes(?:\/(\w+))?$/, settings.render, '#/configuracoes'],
];

const WEEK = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTH = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function shell() {
  const d = new Date();
  app.innerHTML = html`
    <div class="shell">
      <header class="apphead">
        <a class="brand" href="#/"><img src="/icon.png" alt=""><span><b>Helyx</b><small>Saúde pessoal · ${WEEK[d.getDay()]}, ${d.getDate()} de ${MONTH[d.getMonth()]}</small></span></a>
        <form class="search" id="searchForm" role="search">${icon('search')}
          <input type="search" name="q" id="searchInput" placeholder="Buscar em exames, remédios, consultas…" aria-label="Busca">
        </form>
        <span class="safe-pill"><i></i>${window.HELYX_MOBILE ? 'Dados só neste aparelho' : 'Dados só neste computador'}</span>
        <span class="who" id="who"></span>
        <button class="btn icon ghost" id="logoutBtn" title="Sair / trocar de usuário" aria-label="Sair">${icon('logout')}</button>
      </header>
      <nav class="topnav" aria-label="Menu principal">
        <div class="topnav-links">
          ${NAV.filter(([, , , soon]) => !soon).map(([href, label]) => html`<a href="${href}" data-nav="${href}">${label}</a>`)}
        </div>
        <details class="launch" id="launch">
          <summary class="btn primary">${icon('plus')}Lançar</summary>
          <div class="launch-menu">
            <a href="#/importar" class="launch-read">Ler arquivo (PDF, foto, Word, Excel)</a>
            <a href="#/exames/novo">Exame</a><a href="#/consultas/nova">Consulta</a><a href="#/medicamentos/novo">Medicamento</a>
            <a href="#/saude">Medição</a><a href="#/vacinas?editar=nova">Vacina</a><a href="#/documentos?novo=1">Documento</a><a href="#/agenda?novo=outro">Compromisso</a><a href="#/pendencias">Pendência</a>
          </div>
        </details>
      </nav>
      <main class="content" id="content" tabindex="-1"></main>
    </div>`.__raw;
  const launch = document.getElementById('launch');
  launch.addEventListener('click', (e) => { if (e.target.closest('.launch-menu a')) launch.open = false; });
  document.addEventListener('click', (e) => { if (!launch.contains(e.target)) launch.open = false; });
  document.getElementById('searchForm').onsubmit = (e) => {
    e.preventDefault();
    const q = document.getElementById('searchInput').value.trim();
    if (q) location.hash = '#/busca?q=' + encodeURIComponent(q);
  };
  document.getElementById('logoutBtn').onclick = async () => { await api('/auth/logout', { method: 'POST' }); location.hash = '#/entrar'; location.reload(); };
}

// Telas de acesso: entrar, criar conta e primeiro acesso (dar usuário e senha aos dados já existentes)
const AUTH = {
  login: { title: 'Entrar', button: 'Entrar', text: 'Cada pessoa tem a própria conta. Os dados ficam guardados neste computador, protegidos por senha e criptografia.' },
  register: { title: 'Criar conta', button: 'Criar conta', text: 'Uma conta nova começa vazia. Cada pessoa vê só os próprios exames, consultas e remédios.' },
  setup: { title: 'Proteja seus dados com senha', button: 'Criar meu acesso', text: 'A partir desta versão, o Helyx pede usuário e senha. Os exames, consultas, remédios e documentos que já estão no programa ficam na sua conta.' },
};
function authView(mode, state = {}) {
  const c = AUTH[mode];
  const isLogin = mode === 'login';
  app.innerHTML = html`
    <div class="auth"><div class="card">
      <div class="brand"><img src="/icon.png" alt="">Helyx</div>
      <h1 style="text-align:center">${c.title}</h1>
      <p class="muted small" style="text-align:center">${c.text}</p>
      <form id="authForm" class="stack" style="margin-top:1rem">
        ${!isLogin ? fields([{ name: 'full_name', label: 'Seu nome' }]) : ''}
        ${fields([{ name: 'email', label: 'Usuário ou e-mail', required: true, hint: isLogin ? '' : 'ex.: carlos' },
          { name: 'password', label: 'Senha', type: 'password', required: true, hint: isLogin ? '' : 'mín. 8 caracteres, com letras e números' }])}
        ${!isLogin ? fields([{ name: 'password2', label: 'Repita a senha', type: 'password', required: true }]) : ''}
        <button class="btn primary" style="width:100%">${c.button}</button>
      </form>
      ${mode === 'setup' ? '' : html`<p class="small" style="text-align:center;margin-top:1rem">${isLogin
        ? html`<a href="#/recuperar">Esqueci minha senha</a> · Outra pessoa vai usar o Helyx? <a href="#/cadastro">Criar conta</a>`
        : state.has_users ? html`Já tem conta? <a href="#/entrar">Entrar</a>` : ''}</p>`}
    </div></div>`.__raw;
  const form = document.getElementById('authForm');
  form.querySelector('[name=email]').autocomplete = 'username';
  form.querySelector('[name=email]').autocapitalize = 'none';
  form.querySelector('[name=password]').autocomplete = isLogin ? 'current-password' : 'new-password';
  form.querySelector('[name=email]').focus();
  form.querySelectorAll('[type=password]').forEach(capsLockHint);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = readForm(form);
    if (!isLogin && body.password !== body.password2) { toast('As duas senhas não são iguais.', true); return; }
    delete body.password2;
    try {
      const r = await api(isLogin ? '/auth/login' : mode === 'setup' ? '/auth/setup' : '/auth/register', { method: 'POST', body });
      if (r.recovery_code) await showRecoveryCode(r.recovery_code, { title: 'Conta criada', intro: `Usuário: ${body.email}. Sua senha foi cadastrada.` });
      location.hash = '#/'; location.reload(); // recomeça limpo, já na conta certa
    } catch (err) { toast(err.message, true); }
  };
}

// Esqueci minha senha: com o código de recuperação ou pelo computador (arquivo na pasta de dados)
function recoverView(how = 'codigo') {
  const pcStep = how === 'computador';
  app.innerHTML = html`
    <div class="auth"><div class="card">
      <div class="brand"><img src="/icon.png" alt="">Helyx</div>
      <h1 style="text-align:center">Recuperar a senha</h1>
      ${window.HELYX_MOBILE ? '' : html`<div class="tabs"><a href="#/recuperar" class="${pcStep ? '' : 'on'}">Tenho o código de recuperação</a><a href="#/recuperar?como=computador" class="${pcStep ? 'on' : ''}">Pelo computador</a></div>`}
      ${pcStep ? html`<p class="muted small">O Helyx grava um código num arquivo dentro da pasta de dados dele, neste computador. Abra o arquivo, copie o código e crie a nova senha. Seus dados continuam todos lá.</p>
        <form id="pcStart" class="stack">${fields([{ name: 'email', label: 'Usuário ou e-mail', required: true }])}<button class="btn" style="width:100%">Gerar código no computador</button></form>
        <div id="pcInfo" class="note" hidden></div>`
        : html`<p class="muted small">Use o código de recuperação que apareceu quando você criou a conta (ex.: K7QF-9MXA-…).</p>`}
      <form id="recForm" class="stack" style="margin-top:1rem" ${pcStep ? 'hidden' : ''}>
        ${pcStep ? '' : fields([{ name: 'email', label: 'Usuário ou e-mail', required: true }])}
        ${fields([{ name: 'code', label: pcStep ? 'Código do arquivo RECUPERAR-SENHA.txt' : 'Código de recuperação', required: true },
          { name: 'password', label: 'Nova senha', type: 'password', required: true, hint: 'mín. 8 caracteres, com letras e números' },
          { name: 'password2', label: 'Repita a nova senha', type: 'password', required: true }])}
        <button class="btn primary" style="width:100%">Criar nova senha</button>
      </form>
      <p class="small" style="text-align:center;margin-top:1rem"><a href="#/entrar">Voltar para entrar</a></p>
    </div></div>`.__raw;
  const form = document.getElementById('recForm');
  form.querySelectorAll('[type=password]').forEach(capsLockHint);
  form.querySelector('[name=code]').autocomplete = 'off';
  let username = '';
  document.getElementById('pcStart')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    username = readForm(e.target).email;
    try {
      const r = await api('/auth/recover/computer/start', { method: 'POST', body: { email: username } });
      const info = document.getElementById('pcInfo');
      info.hidden = false;
      info.innerHTML = html`Código gravado. Abra o arquivo <b>RECUPERAR-SENHA.txt</b> na pasta:<br><code>${r.folder}</code><br>
        <button type="button" class="btn small" id="openFolder" style="margin-top:.5rem">Abrir a pasta</button>
        <div class="small muted" style="margin-top:.4rem">Vale por ${r.minutes} minutos. No programa instalado, a pasta também abre pelo menu Arquivo → Abrir pasta dos dados.</div>`.__raw;
      document.getElementById('openFolder').onclick = async () => {
        const o = await api('/auth/recover/open-folder', { method: 'POST' }).catch(() => ({}));
        if (!o.opened) toast('Abra a pasta indicada pelo Explorador de Arquivos.');
      };
      form.hidden = false; form.querySelector('[name=code]').focus();
    } catch (err) { toast(err.message, true); }
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = readForm(form);
    if (body.password !== body.password2) { toast('As duas senhas não são iguais.', true); return; }
    delete body.password2;
    if (pcStep) body.email = username;
    try {
      const r = await api(pcStep ? '/auth/recover/computer/finish' : '/auth/recover/code', { method: 'POST', body });
      await showRecoveryCode(r.recovery_code, { title: 'Senha redefinida', intro: 'Sua nova senha foi cadastrada. O código de recuperação antigo deixou de valer; este é o novo.' });
      location.hash = '#/'; location.reload();
    } catch (err) { toast(err.message, true); }
  };
}

let renderId = 0;
async function route() {
  const hash = location.hash.slice(1) || '/';
  const [path, qs] = hash.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  if (path === '/recuperar') { me = null; return recoverView(query.como === 'computador' ? 'computador' : 'codigo'); }
  if (path === '/entrar' || path === '/cadastro') {
    const state = await api('/auth/state').catch(() => ({ login: true }));
    if (!state.login) { location.hash = '#/'; return; } // login desligado
    const info = await api('/auth/me').catch(() => null);
    if (info && path === '/entrar') { location.hash = '#/'; return; } // já entrou
    me = null;
    if (state.setup) return authView('setup', state);
    return authView(path === '/cadastro' || !state.has_users ? 'register' : 'login', state);
  }
  if (!me) {
    try { me = await api('/auth/me'); } catch { location.hash = '#/entrar'; return; }
  }
  if (!document.getElementById('content')) {
    shell(); startReminders();
    if (!me.login) document.getElementById('logoutBtn').style.display = 'none';
    else document.getElementById('who').textContent = (me.name || me.email || '').split(' ')[0];
  }
  const content = document.getElementById('content');
  const found = ROUTES.find(([re]) => re.test(path));
  document.querySelectorAll('[data-nav]').forEach((a) => { const on = found && a.dataset.nav === found[2]; a.classList.toggle('active', on); if (on) a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
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

// O programa instalado (Electron) não mostra o balão de aviso dos formulários: sem isto, um campo
// obrigatório vazio ou um e-mail sem "@" faz o botão Salvar parecer não funcionar. Mostra o motivo.
let invalidShown = false;
document.addEventListener('invalid', (e) => {
  const el = e.target;
  el.classList.add('invalid');
  el.addEventListener('input', () => el.classList.remove('invalid'), { once: true });
  if (invalidShown) return;
  invalidShown = true; setTimeout(() => { invalidShown = false; }, 400);
  const label = (el.labels?.[0]?.childNodes[0]?.textContent || el.getAttribute('aria-label') || el.name || 'Campo').replace(/\s*\*\s*$/, '').trim();
  toast(el.validity.valueMissing ? `Preencha o campo “${label}”.` : `${label}: ${el.validationMessage}`, true);
  el.focus();
}, true);
window.addEventListener('hashchange', route);
route();
