const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dataFile = () => path.join(app.getPath('userData'), 'planner-data.json');
const attachDir = () => path.join(app.getPath('userData'), 'attachments');
const attachPath = (file) => path.join(attachDir(), path.basename(file));

function writeData(data) {
  const tmp = dataFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, dataFile());
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    title: 'Planner',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}

ipcMain.handle('data:load', () => {
  try {
    return JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
  } catch {
    return null;
  }
});

ipcMain.handle('data:save', (_e, data) => {
  writeData(data);
  return true;
});

ipcMain.on('data:save-sync', (e, data) => {
  try {
    writeData(data);
  } catch {}
  e.returnValue = true;
});

ipcMain.handle('attach:pick', async (e) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Adicionar anexos',
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled) return [];
  fs.mkdirSync(attachDir(), { recursive: true });
  return result.filePaths.map((src) => {
    const name = path.basename(src);
    const file = crypto.randomUUID() + path.extname(name);
    fs.copyFileSync(src, attachPath(file));
    return {
      id: crypto.randomUUID(),
      name,
      file,
      size: fs.statSync(src).size,
      addedAt: new Date().toISOString(),
    };
  });
});

ipcMain.handle('attach:open', (_e, file) => shell.openPath(attachPath(file)));
ipcMain.handle('attach:reveal', (_e, file) => shell.showItemInFolder(attachPath(file)));
ipcMain.handle('attach:delete', (_e, file) => {
  try {
    fs.unlinkSync(attachPath(file));
  } catch {}
});
