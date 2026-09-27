const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  saveSync: (data) => ipcRenderer.sendSync('data:save-sync', data),
  pickAttachments: () => ipcRenderer.invoke('attach:pick'),
  openAttachment: (file) => ipcRenderer.invoke('attach:open', file),
  revealAttachment: (file) => ipcRenderer.invoke('attach:reveal', file),
  deleteAttachment: (file) => ipcRenderer.invoke('attach:delete', file),
  notify: (payload) => ipcRenderer.send('notify', payload),
  onOpenTask: (cb) => ipcRenderer.on('open-task', (_e, id) => cb(id)),
});
