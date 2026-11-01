// Helyx no celular: este "service worker" roda dentro do navegador e faz o papel do servidor do programa
// de computador. As telas pedem /api/... normalmente; aqui as mesmas rotas respondem usando o banco SQLite
// guardado no próprio aparelho. Nada sai do celular. Também guarda os arquivos do app para funcionar sem internet.
/* global HELYX_BASE, HELYX_VERSION, HELYX_CORE, HELYX_MIGRATIONS */
self.process = { env: { SAUDE_DATA_DIR: '/dados', SAUDE_EXIGIR_LOGIN: '1' }, versions: {}, platform: 'browser', cwd: () => '/',
  nextTick: (f, ...a) => Promise.resolve().then(() => f(...a)), exit() {}, stdout: { write() {} }, on() {} };
self.Buffer = require('buffer').Buffer;
// o Buffer do navegador não conhece "base64url" (usado nos tokens de sessão)
const toStr = self.Buffer.prototype.toString;
self.Buffer.prototype.toString = function (enc, ...rest) {
  if (enc === 'base64url') return toStr.call(this, 'base64', ...rest).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return toStr.call(this, enc, ...rest);
};

const fs = require('fs');
const sqlite = require('node:sqlite');
const initSqlJs = require('sql.js/dist/sql-wasm.js');

const BASE = HELYX_BASE;
const CACHE = `helyx-${HELYX_VERSION}`;
const SESSION = '/dados/sessao.txt';

// ---------------------------------------------------------------- Instalação e arquivos do app (offline)
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(HELYX_CORE.map((p) => BASE + p))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('helyx-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function fromCache(request) {
  const hit = await caches.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  // bibliotecas grandes (leitor de PDF, reconhecimento de texto) ficam guardadas no primeiro uso
  if (res.ok && new URL(request.url).pathname.startsWith(BASE + '/vendor/')) (await caches.open(CACHE)).put(request, res.clone());
  return res;
}

// ---------------------------------------------------------------- "Servidor" local
let ready = null; let router = null; let HttpError = Error;
function boot() {
  ready ||= (async () => {
    await fs.load();
    for (const [name, sql] of Object.entries(HELYX_MIGRATIONS)) fs._files.set(`/app/server/migrations/${name}`, new TextEncoder().encode(sql));
    const wasmUrl = BASE + '/sql-wasm.wasm';
    const wasm = await (await caches.match(wasmUrl) || await fetch(wasmUrl)).arrayBuffer();
    sqlite.setSQL(await initSqlJs({ wasmBinary: wasm }));
    require('../server/db').migrate();
    router = require('../server/routes');
    HttpError = require('../server/lib/http').HttpError;
    sqlite.saveAll(); await fs.flush();
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

// Sessão de login: guardada no aparelho (o navegador não deixa este código ler cookies)
const getSession = () => (fs.existsSync(SESSION) ? fs.readFileSync(SESSION, 'utf8') : '');
const setSession = (v) => (v ? fs.writeFileSync(SESSION, v) : fs.rmSync(SESSION));

function fakeResponse() {
  const headers = new Headers(); let body = null;
  return {
    statusCode: 200, headersSent: false, writableEnded: false,
    setHeader(k, v) { if (String(k).toLowerCase() !== 'set-cookie') headers.set(k, Array.isArray(v) ? v.join(', ') : String(v)); },
    getHeader(k) { return headers.get(k); },
    end(data) { body = data == null ? null : data; this.writableEnded = true; this.headersSent = true; },
    toResponse() { return new Response(body, { status: this.statusCode, headers }); },
  };
}

async function handleApi(request) {
  await boot();
  const url = new URL(request.url);
  const pathname = url.pathname.slice(BASE.length);
  const res = fakeResponse();
  const ctx = {
    req: { method: request.method, headers: { host: url.host }, socket: { remoteAddress: 'celular' } },
    res, url: { pathname, searchParams: url.searchParams }, query: Object.fromEntries(url.searchParams),
    cookies: { sid: getSession() }, params: {}, body: null, user: null,
    json(status, data) {
      res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(data));
    },
    setCookie(name, value, opts = {}) { if (name === 'sid') setSession(opts.maxAge === 0 ? '' : value); },
  };
  try {
    const found = router.match(request.method, pathname);
    if (!found) throw new HttpError(404, 'Rota não encontrada');
    ctx.params = found.params;
    if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
      const raw = await request.text();
      try { ctx.body = raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, 'JSON inválido'); }
    }
    for (const h of found.handlers) {
      const out = await h(ctx);
      if (res.writableEnded) break;
      if (out !== undefined) { ctx.json(200, out); break; }
    }
    if (!res.writableEnded) ctx.json(204, {});
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error('[helyx]', err);
    ctx.json(status, { erro: status === 500 ? `Erro interno: ${err.message}` : err.message });
  }
  sqlite.saveAll(); await fs.flush();
  return res.toResponse();
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(BASE + '/')) return;
  if (url.pathname.startsWith(BASE + '/api/')) e.respondWith(handleApi(e.request));
  else if (e.request.method === 'GET') e.respondWith(fromCache(e.request));
});
