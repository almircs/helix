// Monta o Helyx para celular (iPhone e Android): um app web instalável (PWA) que funciona sem internet,
// com os dados só no aparelho. Uso: node mobile/build.js [--base /helyx-celular] [--out dist-celular]
// A pasta gerada é publicada no repositório público helyx-celular (GitHub Pages). Não leva nenhum dado.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const BASE = arg('--base', '/helyx-celular').replace(/\/$/, '');
const OUT = path.resolve(ROOT, arg('--out', 'dist-celular'));
const pkg = require(path.join(ROOT, 'package.json'));
const VERSION = `${pkg.version}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
const nm = (p) => path.join(ROOT, 'node_modules', p);

// Mantém a pasta .git (o clone do helyx-celular) e troca todo o resto
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f !== '.git') fs.rmSync(path.join(OUT, f), { recursive: true, force: true });

// ---------------------------------------------------------------- Telas (public/) com os caminhos dentro de BASE
const ABS = /(["'`(])\/(api|js|css|vendor|icon\.png|favicon\.png|manifest\.webmanifest)\b/g;
function copyPublic(dir = '') {
  for (const e of fs.readdirSync(path.join(ROOT, 'public', dir), { withFileTypes: true })) {
    if (e.name.startsWith('__')) continue; // amostras temporárias de teste
    const rel = path.join(dir, e.name); const src = path.join(ROOT, 'public', rel); const dst = path.join(OUT, rel);
    if (e.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); copyPublic(rel); continue; }
    // caminhos dentro de BASE; e "neste computador" vira "neste aparelho"
    if (/\.(js|css|html|webmanifest)$/.test(e.name)) fs.writeFileSync(dst, fs.readFileSync(src, 'utf8').replace(ABS, `$1${BASE}/$2`).replace(/neste computador/g, 'neste aparelho'));
    else fs.copyFileSync(src, dst);
  }
}
copyPublic();

// index.html: abre pelo boot.js (registra o "servidor" do aparelho antes de carregar as telas)
const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' blob: data:; frame-src 'self' blob:; object-src 'self' blob:; base-uri 'self'; form-action 'self'";
let index = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8')
  .replace(`<script type="module" src="${BASE}/js/app.js"></script>`, `<script src="${BASE}/boot.js"></script>`)
  .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="apple-mobile-web-app-capable" content="yes">\n  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Helyx">\n  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="apple-touch-icon" href="${BASE}/icon.png">`)
  .replace('<div class="boot">Carregando…</div>', '<div class="boot">Abrindo o Helyx…</div>');
if (!index.includes('boot.js')) throw new Error('index.html: não achei o script do app');
fs.writeFileSync(path.join(OUT, 'index.html'), index);

fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify({
  name: 'Helyx', short_name: 'Helyx', description: 'Gestão pessoal de saúde — os dados ficam só neste aparelho.',
  start_url: `${BASE}/`, scope: `${BASE}/`, display: 'standalone', orientation: 'portrait',
  background_color: '#0b2a2e', theme_color: '#12393c', lang: 'pt-BR',
  icons: [{ src: `${BASE}/icon.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
}, null, 2));

fs.writeFileSync(path.join(OUT, 'boot.js'), `// Helyx no celular: liga o "servidor" do aparelho (service worker) e depois abre as telas.
window.HELYX_MOBILE = true;
(function () {
  var BASE = ${JSON.stringify(BASE)};
  function start() { import(BASE + '/js/app.js'); }
  if (!('serviceWorker' in navigator)) {
    document.querySelector('.boot').textContent = 'Este navegador não consegue rodar o Helyx. Use o Safari (iPhone) ou o Chrome (Android).';
    return;
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  navigator.serviceWorker.register(BASE + '/sw.js', { scope: BASE + '/' });
  if (navigator.serviceWorker.controller) start();
  else navigator.serviceWorker.addEventListener('controllerchange', function () { start(); }, { once: true });
})();
`);

// ---------------------------------------------------------------- Bibliotecas de leitura (PDF e fotos) e SQLite
function copy(from, to) {
  const s = nm(from); const d = path.join(OUT, to);
  fs.mkdirSync(path.dirname(d), { recursive: true });
  fs.cpSync(s, d, { recursive: true });
}
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) copy(`pdfjs-dist/legacy/build/${f}`, `vendor/pdfjs/${f}`);
copy('pdfjs-dist/cmaps', 'vendor/pdfjs-cmaps');
copy('pdfjs-dist/standard_fonts', 'vendor/pdfjs-fonts');
copy('pdfjs-dist/wasm', 'vendor/pdfjs-wasm');
for (const f of ['tesseract.min.js', 'worker.min.js']) copy(`tesseract.js/dist/${f}`, `vendor/tesseract/${f}`);
for (const f of fs.readdirSync(nm('tesseract.js-core')).filter((n) => /-lstm\.wasm\.js$/.test(n))) copy(`tesseract.js-core/${f}`, `vendor/tesseract-core/${f}`);
copy('@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz', 'vendor/tesseract-lang/por.traineddata.gz');
copy('sql.js/dist/sql-wasm.wasm', 'sql-wasm.wasm');

// ---------------------------------------------------------------- Servidor adaptado (service worker)
const migrations = Object.fromEntries(fs.readdirSync(path.join(ROOT, 'server/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => [f, fs.readFileSync(path.join(ROOT, 'server/migrations', f), 'utf8')]));
// arquivos guardados na instalação (o resto, como as bibliotecas de leitura, fica guardado no primeiro uso)
const list = (dir) => fs.readdirSync(path.join(OUT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const core = ['/', ...list('').map((f) => '/' + f.replace(/\\/g, '/')).filter((f) => !f.startsWith('/vendor/') && !f.startsWith('/.git'))];

const shim = (f) => path.join(__dirname, 'shims', f);
const empty = shim('empty.js');
fs.writeFileSync(empty, 'module.exports = {};\n');
const ALIAS = {
  'node:fs': shim('fs.js'), fs: shim('fs.js'), 'node:crypto': shim('crypto.js'), crypto: shim('crypto.js'),
  'node:sqlite': shim('sqlite.js'), 'node:zlib': shim('zlib.js'), 'node:path': require.resolve('path-browserify'), path: require.resolve('path-browserify'),
  'node:http': empty, http: empty, 'node:child_process': empty, 'node:os': empty, electron: empty, 'better-sqlite3': empty,
};
esbuild.build({
  entryPoints: [path.join(__dirname, 'sw.js')], bundle: true, format: 'iife', platform: 'browser', target: ['safari15', 'chrome100'],
  outfile: path.join(OUT, 'sw.js'), minify: true, legalComments: 'none', logLevel: 'warning',
  define: {
    HELYX_BASE: JSON.stringify(BASE), HELYX_VERSION: JSON.stringify(VERSION), HELYX_CORE: JSON.stringify(core),
    HELYX_MIGRATIONS: JSON.stringify(migrations), __dirname: JSON.stringify('/app/server'),
  },
  plugins: [{
    name: 'helyx-celular',
    setup(b) {
      b.onResolve({ filter: /.*/ }, (a) => (ALIAS[a.path] ? { path: ALIAS[a.path] } : undefined));
      // cópias de segurança: versão para o celular
      b.onResolve({ filter: /lib\/backup$/ }, (a) => (a.importer.includes(`${path.sep}server${path.sep}`) ? { path: shim('backup.js') } : undefined));
    },
  }],
}).then(() => {
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  fs.writeFileSync(path.join(OUT, 'README.md'), readme());
  fs.mkdirSync(path.join(OUT, '.github/workflows'), { recursive: true });
  fs.writeFileSync(path.join(OUT, '.github/workflows/pages.yml'), PAGES);
  const size = list('').reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(`Helyx ${VERSION} para celular em ${OUT} (${(size / 1048576).toFixed(1)} MB, base ${BASE})`);
}).catch((e) => { console.error(e); process.exit(1); });

function readme() {
  return `# Helyx para celular

Versão do Helyx que se instala no **iPhone**, no **iPad** e no **Android** pela Tela de Início.
Os dados ficam **só no aparelho**; nada é enviado para a internet.

**Endereço:** https://almircs.github.io${BASE}/

**iPhone / iPad**
1. Abra o endereço no **Safari**.
2. Toque em **Compartilhar** (quadrado com seta para cima) → **Adicionar à Tela de Início** → **Adicionar**.
3. Abra o Helyx pelo ícone na Tela de Início.

**Android**
1. Abra o endereço no **Chrome**.
2. Toque no menu **⋮** → **Instalar app** (ou **Adicionar à tela inicial**).

**Trazer os dados do computador:** no programa do computador, *Configurações → Backup → Baixar backup* (arquivo .helyx).
No celular, crie sua conta e use *Configurações → Backup → Restaurar* com esse arquivo.

Os arquivos desta pasta são gerados por \`mobile/build.js\` do repositório principal do Helyx. Versão ${VERSION}.
`;
}

const PAGES = `name: Publicar Helyx para celular
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  publicar:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
        with:
          enablement: true
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - id: deploy
        uses: actions/deploy-pages@v4
`;
