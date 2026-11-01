// Micro-framework HTTP sem dependências: roteamento, JSON, cookies, arquivos estáticos.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
  '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.gz': 'application/octet-stream',
};

// Bibliotecas de leitura de PDF e de reconhecimento de texto, servidas do próprio programa (sem internet)
function pkgDir(name, sub = '') {
  try { return path.join(path.dirname(require.resolve(`${name}/package.json`)), sub); } catch { return null; }
}
const VENDOR = {
  // versão "legacy": funciona no motor do Electron, que é mais antigo que os navegadores atuais
  pdfjs: () => pkgDir('pdfjs-dist', 'legacy/build'),
  'pdfjs-wasm': () => pkgDir('pdfjs-dist', 'wasm'),
  'pdfjs-cmaps': () => pkgDir('pdfjs-dist', 'cmaps'),
  'pdfjs-fonts': () => pkgDir('pdfjs-dist', 'standard_fonts'),
  tesseract: () => pkgDir('tesseract.js', 'dist'),
  'tesseract-core': () => pkgDir('tesseract.js-core'),
  'tesseract-lang': () => pkgDir('@tesseract.js-data/por', '4.0.0_best_int'),
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' blob: data:; frame-src 'self' blob:; object-src 'self' blob:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
};

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Conteúdo muito grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

class Router {
  constructor() { this.routes = []; }
  add(method, pattern, ...handlers) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handlers });
  }
  get(p, ...h) { this.add('GET', p, ...h); }
  post(p, ...h) { this.add('POST', p, ...h); }
  put(p, ...h) { this.add('PUT', p, ...h); }
  delete(p, ...h) { this.add('DELETE', p, ...h); }
  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { handlers: r.handlers, params };
      }
    }
    return null;
  }
}

function createServer({ router, staticDir, onError }) {
  return http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const url = new URL(req.url, 'http://local');
    const ctx = {
      req, res, url, query: Object.fromEntries(url.searchParams),
      cookies: parseCookies(req.headers.cookie), params: {}, body: null, user: null,
      json(status, data) {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(data));
      },
      setCookie(name, value, opts = {}) {
        const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
        if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
        if (opts.secure) parts.push('Secure');
        const prev = res.getHeader('Set-Cookie') || [];
        res.setHeader('Set-Cookie', [...[].concat(prev), parts.join('; ')]);
      },
    };
    try {
      if (url.pathname.startsWith('/api/')) {
        const found = router.match(req.method, url.pathname);
        if (!found) throw new HttpError(404, 'Rota não encontrada');
        ctx.params = found.params;
        if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
          // Proteção CSRF: só aceita JSON da própria origem
          const ct = req.headers['content-type'] || '';
          const raw = await readBody(req, (url.pathname.startsWith('/api/backup/') || url.pathname === '/api/documents' || url.pathname === '/api/extract' || url.pathname === '/api/auth/import-account') ? 200 * 1024 * 1024 : undefined);
          if (raw.length) {
            if (!ct.includes('application/json')) throw new HttpError(415, 'Envie JSON');
            try { ctx.body = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'JSON inválido'); }
          } else ctx.body = {};
          const origin = req.headers.origin;
          if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Origem não permitida');
        }
        for (const h of found.handlers) {
          const out = await h(ctx);
          if (res.writableEnded) return;
          if (out !== undefined) { ctx.json(200, out); return; }
        }
        if (!res.writableEnded) ctx.json(204, {});
        return;
      }
      serveStatic(staticDir, url.pathname, res);
    } catch (err) {
      if (onError && !(err instanceof HttpError)) onError(err);
      const status = err instanceof HttpError ? err.status : 500;
      if (!res.headersSent) ctx.json(status, { erro: status === 500 ? 'Erro interno' : err.message });
      else res.end();
    }
  });
}

function serveStatic(root, pathname, res) {
  let rel = decodeURIComponent(pathname);
  const vendor = rel.match(/^\/vendor\/([\w-]+)(\/.+)$/);
  if (vendor) {
    const base = VENDOR[vendor[1]]?.();
    if (!base) { res.statusCode = 404; res.end('Não encontrado'); return; }
    root = base; rel = vendor[2];
  } else if (rel === '/' || !path.extname(rel)) rel = '/index.html'; // SPA
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(path.normalize(root) + path.sep)) { res.statusCode = 403; res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; res.end('Não encontrado'); return; }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', rel === '/index.html' ? 'no-cache' : 'public, max-age=300');
    fs.createReadStream(file).pipe(res);
  });
}

module.exports = { Router, createServer, HttpError };
