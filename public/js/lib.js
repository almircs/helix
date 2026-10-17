// Utilitários do front-end: HTML seguro, API, formatação, formulários.

// ---------- HTML com escape automático
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const raw = (s) => ({ __raw: String(s ?? '') });
function part(v) {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  if (typeof v === 'object' && '__raw' in v) return v.__raw;
  return esc(v);
}
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return raw(out);
}

// ---------- API
export class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method, credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) { location.hash = '#/entrar'; }
    throw new ApiError(res.status, data.erro || 'Algo deu errado. Tente novamente.');
  }
  return data;
}

// ---------- Datas e números (pt-BR)
const pad = (n) => String(n).padStart(2, '0');
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => new Date(String(s).slice(0, 10) + 'T12:00:00');
export const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); };
export const fmtDate = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const fmtLongDate = (s) => { const d = parseISO(s); return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`; };
export const fmtNum = (n, max = 2) => (n === null || n === undefined || n === '' ? '' : typeof n === 'number' ? n.toLocaleString('pt-BR', { maximumFractionDigits: max }) : String(n));
// valor numérico para campos de edição: vírgula decimal, sem separador de milhar
export const numInput = (n) => (n === null || n === undefined || n === '' ? '' : typeof n === 'number' ? n.toLocaleString('pt-BR', { maximumFractionDigits: 6, useGrouping: false }) : String(n));
export const daysUntil = (s) => Math.round((parseISO(s) - parseISO(today())) / 864e5);
export function relDay(s) {
  const n = daysUntil(s);
  if (n === 0) return 'hoje'; if (n === 1) return 'amanhã'; if (n === -1) return 'ontem';
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
}

// ---------- Rótulos
export const SITUATION = { acima: 'Acima da referência', abaixo: 'Abaixo da referência', dentro: 'Dentro da referência' };
export const SITUATION_SHORT = { acima: 'Acima', abaixo: 'Abaixo', dentro: 'Normal' };
export const TREND = { aumento: 'Aumento', reducao: 'Redução', estavel: 'Estável' };
export const EVENT_TYPES = { consulta: 'Consulta', exame: 'Exame', retorno: 'Retorno', vacina: 'Vacina', procedimento: 'Procedimento', medicamento: 'Tomar medicamento', receita: 'Renovar receita', outro: 'Outro' };
export const sitTag = (s) => (s ? html`<span class="tag ${s}">${SITUATION_SHORT[s]}</span>` : '');
export function trendTag(t) {
  if (!t) return '';
  const arrow = t.direction === 'aumento' ? '↑' : t.direction === 'reducao' ? '↓' : '→';
  return html`<span class="tag ${t.relevant ? 'relevante' : ''}" title="Comparado ao resultado anterior">${arrow} ${TREND[t.direction]} ${t.direction !== 'estavel' ? `(${fmtNum(t.pct, 1)}%)` : ''}${t.relevant ? ' · relevante' : ''}</span>`;
}
export const statusTag = (s) => (s ? html`<span class="tag ${s}">${s[0].toUpperCase() + s.slice(1)}</span>` : '');

// ---------- Toast
let toastTimer;
export function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'show' + (isError ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, isError ? 5000 : 2600);
}

// ---------- Formulários
// field: { name, label, type: text|date|time|number|textarea|select|checkbox|email|tel, options: [[v,l]], full, required, hint, placeholder }
export function fields(list, values = {}) {
  return list.map((f) => {
    const v = values[f.name] ?? f.value ?? '';
    const id = 'f_' + f.name;
    const req = f.required ? raw(' required') : '';
    const lab = html`<label for="${id}">${f.label}${f.required ? ' *' : ''} ${f.hint ? html`<span class="hint">${f.hint}</span>` : ''}</label>`;
    let input;
    if (f.type === 'textarea') input = html`<textarea id="${id}" name="${f.name}" placeholder="${f.placeholder || ''}"${req}>${v}</textarea>`;
    else if (f.type === 'select') input = html`<select id="${id}" name="${f.name}"${req}>${(f.options || []).map(([ov, ol]) => html`<option value="${ov}"${String(ov) === String(v ?? '') ? raw(' selected') : ''}>${ol}</option>`)}</select>`;
    else if (f.type === 'checkbox') return html`<div class="${f.full ? 'full' : ''}"><label class="check"><input type="checkbox" name="${f.name}"${v ? raw(' checked') : ''}> ${f.label}</label></div>`;
    else input = html`<input id="${id}" name="${f.name}" type="${f.type === 'number' ? 'text' : f.type || 'text'}" ${f.type === 'number' ? raw('inputmode="decimal"') : ''} value="${f.type === 'number' ? numInput(v) : v}" placeholder="${f.placeholder || ''}"${req}>`;
    return html`<div class="${f.full ? 'full' : ''}">${lab}${input}</div>`;
  });
}
export function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.closest('[data-rows]')) continue;
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return out;
}
export function readRows(container) {
  return [...container.querySelectorAll('.row')].map((row) => {
    const o = {};
    row.querySelectorAll('[data-k]').forEach((el) => { o[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; });
    return o;
  });
}
export const options = (rows, value = 'id', label = 'name', empty = '— selecione —') => [['', empty], ...rows.map((r) => [r[value], typeof label === 'function' ? label(r) : r[label]])];

// ---------- Ícones (traço simples)
const P = {
  dashboard: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z',
  agenda: 'M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  exames: 'M9 2h6M10 2v6L4.5 18.5A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.8-2.5L14 8V2M7 14h10',
  consultas: 'M6 3v6a4 4 0 0 0 8 0V3M10 13v3a5 5 0 0 0 10 0v-2M20 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  medicamentos: 'M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7',
  saude: 'M3 12h4l3-8 4 16 3-8h4',
  tempo: 'M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  documentos: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5',
  relatorios: 'M4 20h16M7 16V10M12 16V5M17 16v-4',
  ia: 'M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z',
  config: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  menu: 'M3 6h18M3 12h18M3 18h18',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 18l-6-6 6-6',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 16v-4M12 8h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
};
export const icon = (name) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || ''}"/></svg>`);

export function confirmDialog(msg) { return window.confirm(msg); }

// Uma view retorna { __raw, mount(el) }: o HTML e a função que liga os eventos
export function view(markup, mount) { return { __raw: markup.__raw ?? markup, mount }; }
export const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
export const go = (hash) => { if (location.hash === hash) rerender(); else location.hash = hash; };

// Cache simples de listas auxiliares (médicos, consultas) para os formulários
const cache = {};
export async function cached(key, path, fresh = false) {
  if (fresh || !cache[key]) cache[key] = api(path);
  try { return await cache[key]; } catch (e) { delete cache[key]; throw e; }
}
export const invalidate = (...keys) => keys.forEach((k) => delete cache[k]);
