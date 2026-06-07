import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

let battleWindow = null;
let menuWindow = null;
let tray = null;

function createBattleWindow() {
  battleWindow = new BrowserWindow({
    width: 536,
    height: 220,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-battle.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  battleWindow.loadFile(path.join(distDir, 'index.html'));
}

function createMenuWindow() {
  menuWindow = new BrowserWindow({
    width: 520,
    height: 560,
    frame: false,
    show: false,
    parent: battleWindow ?? undefined,
    modal: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-menu.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  menuWindow.loadFile(path.join(distDir, 'menu.html'));

  menuWindow.on('hide', () => {
    battleWindow?.webContents.send('menu:closed');
  });

  menuWindow.on('closed', () => {
    menuWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Auto Battle Idle');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'メニューを開く',
        click: () => {
          void openMenuWindow();
        },
      },
      {
        label: '終了',
        click: () => app.quit(),
      },
    ]),
  );
}

async function getPartyFromBattle() {
  if (!battleWindow) return [];
  return battleWindow.webContents.executeJavaScript(
    'globalThis.__getPartySnapshot?.() ?? []',
  );
}

async function openMenuWindow() {
  if (!battleWindow) return;
  if (!menuWindow) createMenuWindow();

  const party = await getPartyFromBattle();
  menuWindow.webContents.send('menu:init', party);
  menuWindow.show();
  menuWindow.focus();
}

function setupIpc() {
  ipcMain.handle('menu:open', async () => {
    await openMenuWindow();
  });

  ipcMain.on('menu:close', () => {
    menuWindow?.hide();
    battleWindow?.webContents.send('menu:closed');
  });

  ipcMain.on('menu:build-changed', (_event, partyIndex, build) => {
    battleWindow?.webContents.send('menu:build-changed', partyIndex, build);
  });
}

app.whenReady().then(() => {
  createBattleWindow();
  createTray();
  setupIpc();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
