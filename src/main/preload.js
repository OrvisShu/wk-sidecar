const {contextBridge, ipcRenderer} = require('electron')

contextBridge.exposeInMainWorld('sidecar', {
  canOpenAtLogin: process.platform === 'win32' || process.platform === 'darwin',
  getState: () => ipcRenderer.invoke('state:get'),
  getShortcutStatus: () => ipcRenderer.invoke('english:shortcut-status'),
  hideEnglish: () => ipcRenderer.invoke('english:hide'),
  openEnglish: (mode, id) => ipcRenderer.invoke('english:open', mode, id),
  addEnglish: input => ipcRenderer.invoke('english:add', input),
  updateEnglish: (id, input) => ipcRenderer.invoke('english:update', id, input),
  deleteEnglish: id => ipcRenderer.invoke('english:delete', id),
  reviewEnglish: (id, rating) => ipcRenderer.invoke('english:review', id, rating),
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
  setDock: edge => ipcRenderer.invoke('window:dock', edge),
  revealDock: () => ipcRenderer.invoke('window:dock-reveal'),
  leaveDock: () => ipcRenderer.invoke('window:dock-leave'),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  onEnglishOpened: callback => ipcRenderer.on('english:opened', callback),
  onStateChanged: callback => ipcRenderer.on('state:changed', (_event, state) => callback(state))
})
