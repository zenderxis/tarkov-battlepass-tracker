const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tracker', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (state) => ipcRenderer.invoke('data:save', state),
  importXlsx: () => ipcRenderer.invoke('data:importXlsx'),
  xlsxSourceExists: () => ipcRenderer.invoke('data:xlsxSourceExists'),
  copyTemplateXlsx: () => ipcRenderer.invoke('data:copyTemplateXlsx'),
  reloadApp: () => ipcRenderer.invoke('app:reload'),
  openMap: () => ipcRenderer.invoke('map:open'),
  closeMap: () => ipcRenderer.invoke('map:close'),
  minimize: () => ipcRenderer.invoke('win:minimize'),
  maximize: () => ipcRenderer.invoke('win:maximize'),
  closeWindow: () => ipcRenderer.invoke('win:close'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openBattlepassXlsx: () => ipcRenderer.invoke('shell:openXlsx'),
});
