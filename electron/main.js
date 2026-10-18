// Helyx — programa de computador (Windows e Mac).
// Abre o servidor local dentro do próprio programa e mostra a interface numa janela.
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');

const APP_NAME = 'Helyx';
app.setName(APP_NAME);

// Registro de funcionamento em <pasta do usuário>/Helyx/helyx.log — ajuda a descobrir problemas
const fs = require('node:fs');
function logFile() { try { return path.join(app.getPath('userData'), 'helyx.log'); } catch { return null; } }
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map((a) => (a instanceof Error ? a.stack : typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}\n`;
  try { process.stdout.write(line); } catch { /* sem console */ }
  try { const f = logFile(); if (f) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.appendFileSync(f, line); } } catch { /* ignora */ }
}
let fatalShown = false;
function fatal(where, err) {
  log('ERRO', where, err);
  if (fatalShown) return; fatalShown = true;
  try { dialog.showErrorBox(`${APP_NAME} — não foi possível abrir`, `${where}\n\n${err && err.message ? err.message : err}\n\nDetalhes em: ${logFile()}`); } catch { /* */ }
  app.exit(1);
}
process.on('uncaughtException', (e) => fatal('Erro inesperado', e));
process.on('unhandledRejection', (e) => fatal('Erro inesperado', e));
const os = require('node:os');
log('iniciando', { versao: app.getVersion(), electron: process.versions.electron, node: process.versions.node, so: process.platform, arq: process.arch, windows: os.release(), versao_so: os.version ? os.version() : '' });

// Modo de compatibilidade: se a abertura anterior não chegou até a tela (o motor gráfico caiu
// por driver de vídeo ou antivírus), esta abertura desliga a aceleração gráfica e o sandbox.
// Uma única janela aberta por vez
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { log('já existe uma janela aberta; encerrando esta'); app.quit(); }
const markerFile = () => path.join(app.getPath('userData'), 'abrindo.txt');
let compat = process.argv.includes('--compat') || process.env.HELYX_COMPAT === '1';
if (gotLock) try {
  const m = markerFile();
  if (fs.existsSync(m)) { compat = true; log('a abertura anterior não terminou — usando modo de compatibilidade'); }
  fs.mkdirSync(path.dirname(m), { recursive: true });
  fs.writeFileSync(m, new Date().toISOString());
} catch (e) { log('marcador', e); }
if (compat) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('no-sandbox');
  log('modo de compatibilidade ligado');
}
app.on('child-process-gone', (_e, d) => log('processo interno encerrou', d));
app.on('render-process-gone', (_e, _w, d) => log('janela caiu', d));
if (process.platform === 'win32') app.setAppUserModelId('br.helyx.app');


let win = null;
let baseUrl = null;

function dataDir() { return path.join(app.getPath('userData'), 'dados'); }

// Versões até a 1.0.1 se chamavam "Prontuário Pessoal": traz os dados da pasta antiga na primeira abertura.
// Cópia arquivo por arquivo (fs.cpSync pode derrubar o processo no Windows com caminhos acentuados).
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, ent.name), b = path.join(to, ent.name);
    if (ent.isDirectory()) copyDir(a, b);
    else if (ent.isFile()) fs.copyFileSync(a, b);
  }
}
function migrateOldData() {
  const target = dataDir();
  if (fs.existsSync(path.join(target, 'saude.db'))) return;
  const old = path.join(app.getPath('appData'), 'Prontuário Pessoal', 'dados');
  if (!fs.existsSync(path.join(old, 'saude.db'))) return;
  log('copiando dados da versão anterior de', old);
  const tmp = target + '-copiando';
  fs.rmSync(tmp, { recursive: true, force: true });
  copyDir(old, tmp);
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(tmp, target);
  log('dados da versão anterior copiados');
}

async function startServer() {
  log('verificando dados da versão anterior');
  try { migrateOldData(); } catch (e) { log('falha ao migrar dados antigos', e); }
  process.env.SAUDE_DATA_DIR = dataDir();
  log('pasta de dados', dataDir());
  let driver = 'node:sqlite'; try { require('node:sqlite'); } catch (e) { driver = 'better-sqlite3 (' + e.code + ')'; }
  log('banco de dados via', driver);
  const { start } = require('../server/index.js');
  // Porta fixa; se estiver ocupada ou bloqueada pelo Windows, usa qualquer porta livre
  try { return await start({ host: '127.0.0.1', port: 47321 }); }
  catch (e) { log('porta 47321 indisponível:', e.code); return start({ host: '127.0.0.1', port: 0 }); }
}

function isInternal(url) { return baseUrl && url.startsWith(baseUrl); }

function createWindow() {
  win = new BrowserWindow({
    width: 1300, height: 880, minWidth: 380, minHeight: 500,
    title: APP_NAME, backgroundColor: '#f3f6f6', show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: process.platform === 'win32',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: !compat, spellcheck: true, plugins: true },
  });
  // Mostra a janela quando a página estiver pronta — ou após 4 s, para nunca ficar invisível
  const reveal = () => { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); };
  win.once('ready-to-show', reveal);
  setTimeout(reveal, 4000);
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('falha ao carregar a página', code, desc, url);
    reveal();
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="font-family:system-ui;padding:2rem"><h2>O Helyx não conseguiu abrir a tela inicial</h2><p>${desc} (${code})</p><p>Detalhes em: ${logFile()}</p></body>`));
  });
  win.webContents.on('render-process-gone', (_e, d) => log('janela encerrada', d));
  win.webContents.on('did-finish-load', () => {
    log('tela carregada', win.webContents.getURL());
    try { fs.rmSync(markerFile(), { force: true }); } catch { /* */ }
  });
  // Downloads (backup, exportação): pergunta onde salvar
  win.webContents.session.on('will-download', (_e, item) => {
    item.setSaveDialogOptions({ title: 'Salvar backup do Helyx', defaultPath: path.join(app.getPath('documents'), item.getFilename()),
      filters: item.getFilename().endsWith('.helyx') ? [{ name: 'Backup do Helyx', extensions: ['helyx'] }] : [] });
    item.once('done', (_ev, state) => {
      if (state === 'completed') dialog.showMessageBox(win, { type: 'info', title: APP_NAME, message: 'Backup salvo.', detail: item.getSavePath() });
    });
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!isInternal(url)) { e.preventDefault(); shell.openExternal(url); } });
  win.on('page-title-updated', (e) => e.preventDefault());
  win.loadURL(baseUrl + '/');
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const go = (hash) => () => win && win.loadURL(baseUrl + '/' + hash);
  const template = [
    ...(isMac ? [{ label: APP_NAME, submenu: [
      { role: 'about', label: `Sobre o ${APP_NAME}` }, { type: 'separator' },
      { role: 'hide', label: 'Ocultar' }, { role: 'hideOthers', label: 'Ocultar outros' }, { role: 'unhide', label: 'Mostrar todos' },
      { type: 'separator' }, { role: 'quit', label: `Sair do ${APP_NAME}` }] }] : []),
    { label: 'Arquivo', submenu: [
      { label: 'Fazer backup…', accelerator: 'CmdOrCtrl+S', click: () => win && win.webContents.downloadURL(baseUrl + '/api/backup/download') },
      { label: 'Restaurar backup…', click: go('#/configuracoes/backup') },
      { type: 'separator' },
      { label: 'Imprimir…', accelerator: 'CmdOrCtrl+P', click: () => win && win.webContents.print() },
      { type: 'separator' },
      { label: 'Abrir pasta dos dados e cópias', click: () => shell.openPath(dataDir()) },
      { type: 'separator' },
      isMac ? { role: 'close', label: 'Fechar janela' } : { role: 'quit', label: 'Sair' }] },
    { label: 'Editar', submenu: [
      { role: 'undo', label: 'Desfazer' }, { role: 'redo', label: 'Refazer' }, { type: 'separator' },
      { role: 'cut', label: 'Recortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' }] },
    { label: 'Ir para', submenu: [
      { label: 'Dashboard', accelerator: 'CmdOrCtrl+1', click: go('#/') },
      { label: 'Agenda', accelerator: 'CmdOrCtrl+2', click: go('#/agenda') },
      { label: 'Exames', accelerator: 'CmdOrCtrl+3', click: go('#/exames') },
      { label: 'Consultas', accelerator: 'CmdOrCtrl+4', click: go('#/consultas') },
      { label: 'Medicamentos', accelerator: 'CmdOrCtrl+5', click: go('#/medicamentos') },
      { label: 'Linha do tempo', accelerator: 'CmdOrCtrl+6', click: go('#/linha-do-tempo') }] },
    { label: 'Exibir', submenu: [
      { role: 'reload', label: 'Recarregar' }, { type: 'separator' },
      { role: 'zoomIn', label: 'Aumentar letras', accelerator: 'CmdOrCtrl+=' }, { role: 'zoomOut', label: 'Diminuir letras' }, { role: 'resetZoom', label: 'Tamanho normal' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Tela cheia' }] },
    { label: 'Ajuda', submenu: [
      { label: 'Onde ficam meus dados?', click: () => dialog.showMessageBox(win, { type: 'info', title: APP_NAME,
        message: 'Seus dados ficam somente neste computador.',
        detail: `Pasta: ${dataDir()}\n\nO programa faz uma cópia automática por dia (subpasta "backups"). Para guardar fora do computador, copie essa pasta inteira — ela inclui a chave de criptografia.` }) },
      { label: `Versão ${app.getVersion()}`, enabled: false }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });

app.whenReady().then(async () => {
  log('motor gráfico pronto');
  try {
    const { url } = await startServer();
    baseUrl = url;
    log('servidor interno em', url);
  } catch (e) { fatal('Não foi possível iniciar o banco de dados ou o servidor interno.', e); return; }
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
