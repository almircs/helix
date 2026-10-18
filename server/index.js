// Helyx — servidor
// Pode ser iniciado pelo terminal (node server/index.js) ou pelo programa de computador (electron/main.js).
const path = require('node:path');

function start({ port, host } = {}) {
  const config = require('./config');
  const { migrate } = require('./db');
  const { createServer } = require('./lib/http');
  migrate();
  try { require('./services/restore').autoForAllUsers(); } catch (e) { console.error('[backup] falhou:', e.message); }
  const router = require('./routes');
  const server = createServer({ router, staticDir: path.join(__dirname, '..', 'public'), onError: (e) => console.error('[erro]', e) });
  port = port ?? config.port; host = host ?? config.host;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${server.address().port}`;
      resolve({ server, url, dataDir: config.dataDir });
    });
  });
}

module.exports = { start };

if (require.main === module) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    console.error(`É necessário o Node.js 22.13 ou mais novo (você tem ${process.versions.node}). Baixe em https://nodejs.org`);
    process.exit(1);
  }
  start().then(({ url, dataDir }) => {
    console.log(`\n  Helyx rodando em ${url}\n  Dados em: ${dataDir}\n  Para encerrar: Ctrl+C\n`);
    if (process.env.SAUDE_ABRIR_NAVEGADOR === '1') {
      const { exec } = require('node:child_process');
      exec(process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`);
    }
  }).catch((e) => { console.error(e.code === 'EADDRINUSE' ? 'A porta já está em uso — o programa talvez já esteja aberto.' : e); process.exit(1); });
}
