const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tracker', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (state) => ipcRenderer.invoke('data:save', state),
  factoryReset: () => ipcRenderer.invoke('data:factoryReset'),
  importCosts: () => ipcRenderer.invoke('data:importCosts'),
  xlsxSourceExists: () => ipcRenderer.invoke('data:xlsxSourceExists'),
  createStarterSheet: (format) => ipcRenderer.invoke('data:createStarterSheet', format),
  exportSheet: (format, costsById) => ipcRenderer.invoke('data:exportSheet', { format, costsById }),
  reloadApp: () => ipcRenderer.invoke('app:reload'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  openMap: () => ipcRenderer.invoke('map:open'),
  closeMap: () => ipcRenderer.invoke('map:close'),
  minimize: () => ipcRenderer.invoke('win:minimize'),
  maximize: () => ipcRenderer.invoke('win:maximize'),
  closeWindow: () => ipcRenderer.invoke('win:close'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openBattlepassXlsx: () => ipcRenderer.invoke('shell:openXlsx'),
  openBackupsFolder: () => ipcRenderer.invoke('shell:openBackupsFolder'),
  backupNow: () => ipcRenderer.invoke('data:backupNow'),
});
