// Helyx — programa de computador (Windows e Mac).
// Abre o servidor local dentro do próprio programa e mostra a interface numa janela.
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');

const APP_NAME = 'Helyx';
app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('br.helyx.app');

// Uma única janela aberta por vez
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
let baseUrl = null;

function dataDir() { return path.join(app.getPath('userData'), 'dados'); }

// Versões até a 1.0.1 se chamavam "Prontuário Pessoal": traz os dados da pasta antiga na primeira abertura
function migrateOldData() {
  const fs = require('node:fs');
  const target = dataDir();
  if (fs.existsSync(path.join(target, 'saude.db'))) return;
  const old = path.join(app.getPath('appData'), 'Prontuário Pessoal', 'dados');
  if (!fs.existsSync(path.join(old, 'saude.db'))) return;
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(old, target, { recursive: true });
}

async function startServer() {
  try { migrateOldData(); } catch (e) { console.error('[migração] ', e); }
  process.env.SAUDE_DATA_DIR = dataDir();
  const { start } = require('../server/index.js');
  try { return await start({ host: '127.0.0.1', port: 47321 }); }
  catch (e) { if (e.code === 'EADDRINUSE') return start({ host: '127.0.0.1', port: 0 }); throw e; }
}

function isInternal(url) { return baseUrl && url.startsWith(baseUrl); }

function createWindow() {
  win = new BrowserWindow({
    width: 1300, height: 880, minWidth: 380, minHeight: 500,
    title: APP_NAME, backgroundColor: '#f2f5fa', show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: process.platform === 'win32',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  win.once('ready-to-show', () => win.show());
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

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(async () => {
  try {
    const { url } = await startServer();
    baseUrl = url;
  } catch (e) {
    dialog.showErrorBox(APP_NAME, `Não foi possível iniciar o programa.\n\n${e.message}`);
    app.quit(); return;
  }
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
