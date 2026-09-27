const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, Notification, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dataFile = () => path.join(app.getPath('userData'), 'planner-data.json');
const attachDir = () => path.join(app.getPath('userData'), 'attachments');
const attachPath = (file) => path.join(attachDir(), path.basename(file));
const icon = () => nativeImage.createFromPath(path.join(__dirname, 'src', 'icon.png'));

function writeData(data) {
  const tmp = dataFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, dataFile());
}

let win;
let tray;
let quitting = false;
let trayHintShown = false;
const activeNotifications = new Set();

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    title: 'Planner',
    icon: icon(),
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!trayHintShown && Notification.isSupported()) {
      trayHintShown = true;
      new Notification({
        title: 'Planner continua ativo',
        body: 'O Planner está na bandeja do sistema para enviar notificações. Para sair, clique com o botão direito no ícone e escolha "Sair".',
        icon: icon(),
      }).show();
    }
  });
}

function createTray() {
  tray = new Tray(icon().resize({ width: 16, height: 16 }));
  tray.setToolTip('Planner');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Planner', click: showWindow },
      { type: 'separator' },
      { label: 'Sair', click: () => { quitting = true; app.quit(); } },
    ])
  );
  tray.on('click', showWindow);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('Planner');
  app.on('second-instance', showWindow);
  app.on('before-quit', () => { quitting = true; });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
    createTray();
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

ipcMain.on('notify', (_e, { title, body, taskId }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: icon() });
  activeNotifications.add(n);
  n.on('click', () => {
    showWindow();
    win.webContents.send('open-task', taskId);
  });
  n.on('close', () => activeNotifications.delete(n));
  n.show();
});

// ---------- alertas com pergunta "Você já finalizou?" ----------

const ALERT_WIDTH = 380;
const alerts = new Map();

function layoutAlerts() {
  const area = screen.getPrimaryDisplay().workArea;
  let bottom = area.y + area.height - 12;
  for (const a of alerts.values()) {
    if (a.win.isDestroyed()) continue;
    bottom -= a.height;
    a.win.setBounds({ x: area.x + area.width - ALERT_WIDTH - 12, y: bottom, width: ALERT_WIDTH, height: a.height });
    bottom -= 10;
  }
}

ipcMain.on('alert:show', (_e, p) => {
  for (const a of alerts.values()) if (a.key === p.key) return;
  const alertWin = new BrowserWindow({
    width: ALERT_WIDTH,
    height: 200,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    icon: icon(),
    backgroundColor: '#111c33',
    webPreferences: {
      preload: path.join(__dirname, 'alert-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  alertWin.setAlwaysOnTop(true, 'screen-saver');
  const id = alertWin.webContents.id;
  const rec = { win: alertWin, taskId: p.taskId, key: p.key, kind: p.kind, timer: null, height: 200 };
  alerts.set(id, rec);
  alertWin.on('closed', () => {
    clearTimeout(rec.timer);
    alerts.delete(id);
    layoutAlerts();
  });
  if (p.expiresAt) {
    rec.timer = setTimeout(() => {
      if (!alertWin.isDestroyed()) alertWin.close();
    }, Math.max(0, p.expiresAt - Date.now()));
  }
  alertWin.loadFile(path.join(__dirname, 'src', 'alert.html'), {
    query: { heading: p.heading, task: p.task, detail: p.detail },
  });
});

ipcMain.on('alert:resize', (e, height) => {
  const rec = alerts.get(e.sender.id);
  if (!rec) return;
  rec.height = Math.ceil(height);
  layoutAlerts();
  if (!rec.win.isVisible()) rec.win.showInactive();
});

ipcMain.on('alert:answer', (e, answer) => {
  const rec = alerts.get(e.sender.id);
  if (!rec) return;
  if (answer !== 'dismiss' && win && !win.isDestroyed()) {
    win.webContents.send('alert-answer', { taskId: rec.taskId, kind: rec.kind, answer });
  }
  rec.win.close();
});

ipcMain.on('alert:close-task', (_e, taskId) => {
  for (const a of [...alerts.values()]) {
    if (a.taskId === taskId && !a.win.isDestroyed()) a.win.close();
  }
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
