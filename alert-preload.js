const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertApi', {
  answer: (answer) => ipcRenderer.send('alert:answer', answer),
  resize: (height) => ipcRenderer.send('alert:resize', height),
});
