const {contextBridge, ipcRenderer} = require('electron')

contextBridge.exposeInMainWorld('sidecar', {
  canOpenAtLogin: process.platform === 'win32' || process.platform === 'darwin',
  getState: () => ipcRenderer.invoke('state:get'),
  addTask: input => ipcRenderer.invoke('task:add', input),
  completeTask: id => ipcRenderer.invoke('task:complete', id),
  undoTask: id => ipcRenderer.invoke('task:undo', id),
  deleteTask: id => ipcRenderer.invoke('task:delete', id),
  snoozeTask: id => ipcRenderer.invoke('task:snooze', id),
  setSetting: (key, value) => ipcRenderer.invoke('setting:set', key, value),
  openDataFolder: () => ipcRenderer.invoke('data:open-folder'),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  setCompact: value => ipcRenderer.invoke('window:compact', value),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  onStateChanged: callback => ipcRenderer.on('state:changed', (_event, state) => callback(state))
})
