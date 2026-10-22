const {app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage, screen, nativeTheme, shell, dialog} = require('electron')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const {STAGES, HOUR, stageFor, nextReminderAt} = require('./task-engine')
const {loadState, saveState: writeState, normalizeState} = require('./state-store')

const EXPANDED = {width: 390, height: 690}
const COMPACT = {width: 350, height: 174}
const PRAISE = ['漂亮的一击！事情又向前推进了。', '干得好，这只怪物已经被你收服。', '任务完成，今天的你又强了一点。', '清掉一件心事，继续保持节奏。']
let win
let tray
let state
let dataPath
let quitting = false

const userDataPath = path.join(app.getPath('appData'), 'wk-sidecar')
fs.mkdirSync(userDataPath, {recursive: true})
app.setPath('userData', userDataPath)

function saveState() {
  writeState(dataPath, state)
}

function updateLoginItem() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return
  app.setLoginItemSettings({openAtLogin: state.settings.openAtLogin, path: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()]})
}

function applyAppearance() {
  nativeTheme.themeSource = state.settings.theme
  if (win && !win.isDestroyed()) {
    win.setAlwaysOnTop(state.settings.alwaysOnTop)
    win.setOpacity(state.settings.opacity)
  }
}

function publish() {
  if (win && !win.isDestroyed()) win.webContents.send('state:changed', state)
}

function mutate(change) {
  const result = change()
  saveState()
  publish()
  return result
}

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ -1) >>> 0
}

function pngChunk(type, data) {
  const tag = Buffer.from(type)
  const length = Buffer.alloc(4)
  const checksum = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  checksum.writeUInt32BE(crc32(Buffer.concat([tag, data])))
  return Buffer.concat([length, tag, data, checksum])
}

function trayImage() {
  const size = 32
  const pixels = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = y * (size * 4 + 1) + 1 + x * 4
      const body = ((x - 16) / 12) ** 2 + ((y - 17) / 11) ** 2 < 1
      const eye = y >= 14 && y <= 17 && (x >= 10 && x <= 12 || x >= 19 && x <= 21)
      const color = eye ? [27, 34, 39, 255] : body ? [117, 224, 164, 255] : [0, 0, 0, 0]
      for (let i = 0; i < 4; i++) pixels[offset + i] = color[i]
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', header), pngChunk('IDAT', zlib.deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0))])
  return nativeImage.createFromBuffer(png)
}

function showWindow() {
  if (!win || win.isDestroyed()) return
  win.show()
  win.focus()
}

function createWindow() {
  const size = state.settings.compact ? COMPACT : EXPANDED
  const saved = state.windowPosition
  const workArea = saved ? screen.getDisplayNearestPoint(saved).workArea : screen.getPrimaryDisplay().workArea
  const x = saved ? Math.min(Math.max(saved.x, workArea.x), workArea.x + workArea.width - size.width) : workArea.x + workArea.width - size.width - 20
  const y = saved ? Math.min(Math.max(saved.y, workArea.y), workArea.y + workArea.height - size.height) : workArea.y + workArea.height - size.height - 20
  win = new BrowserWindow({
    ...size,
    minWidth: size.width,
    minHeight: size.height,
    maxWidth: size.width,
    maxHeight: size.height,
    x,
    y,
    frame: false,
    resizable: false,
    alwaysOnTop: state.settings.alwaysOnTop,
    show: false,
    backgroundColor: '#192224',
    webPreferences: {preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false}
  })
  win.setOpacity(state.settings.opacity)
  win.loadFile('index.html')
  win.once('ready-to-show', showWindow)
  win.on('close', event => {
    if (!quitting) {
      event.preventDefault()
      win.hide()
    }
  })
  let moveTimer
  win.on('move', () => {
    clearTimeout(moveTimer)
    moveTimer = setTimeout(() => {
      if (!win.isDestroyed()) mutate(() => {
        const [x, y] = win.getPosition()
        state.windowPosition = {x, y}
      })
    }, 400)
  })
}

function notifyDueTasks() {
  if (!state.settings.notifications) return
  const now = Date.now()
  const due = state.tasks.filter(task => !task.completedAt && now >= nextReminderAt(task))
  if (!due.length) return
  if (Notification.isSupported()) {
    const messages = due.length > 3
      ? [{title: `${due.length} 件待办需要关注`, body: `${due[0].title} 等任务已经到期` }]
      : due.map(task => ({title: stageFor(task, now) === 4 ? '大 Boss 等你来处理' : '有待办需要你关注', body: `${task.title} · ${STAGES[stageFor(task, now)].label}`}))
    for (const message of messages) {
      const notification = new Notification(message)
      notification.on('click', showWindow)
      notification.show()
    }
  }
  for (const task of due) task.lastNotifiedAt = now
  saveState()
  publish()
}

function registerIpc() {
  ipcMain.handle('state:get', () => state)
  ipcMain.handle('task:add', (_event, input) => {
    const title = typeof input?.title === 'string' ? input.title.trim() : ''
    const dueAt = Number(input?.dueAt)
    if (!title || title.length > 120 || !Number.isFinite(dueAt) || dueAt <= Date.now() || dueAt > Date.now() + 365 * 24 * HOUR) throw new Error('请输入任务和有效的提醒时间')
    return mutate(() => {
      const task = {id: crypto.randomUUID(), title, createdAt: Date.now(), dueAt, completedAt: null, snoozedUntil: null, lastNotifiedAt: null}
      state.tasks.unshift(task)
      return task
    })
  })
  ipcMain.handle('task:complete', (_event, id) => mutate(() => {
    const task = state.tasks.find(item => item.id === id && !item.completedAt)
    if (!task) throw new Error('任务不存在')
    task.completedAt = Date.now()
    task.earnedXp = 20
    state.xp += 20
    state.completedCount += 1
    return {message: PRAISE[Math.floor(Math.random() * PRAISE.length)], xp: 20}
  }))
  ipcMain.handle('task:undo', (_event, id) => mutate(() => {
    const task = state.tasks.find(item => item.id === id && item.completedAt)
    if (!task) throw new Error('任务不存在')
    state.xp = Math.max(0, state.xp - (task.earnedXp || 20))
    state.completedCount = Math.max(0, state.completedCount - 1)
    task.completedAt = null
    task.earnedXp = null
    task.snoozedUntil = Date.now() + 10 * 60 * 1000
  }))
  ipcMain.handle('task:delete', (_event, id) => mutate(() => {
    const index = state.tasks.findIndex(item => item.id === id)
    if (index < 0) throw new Error('任务不存在')
    const [task] = state.tasks.splice(index, 1)
    if (task.completedAt) {
      state.xp = Math.max(0, state.xp - (task.earnedXp || 20))
      state.completedCount = Math.max(0, state.completedCount - 1)
    }
  }))
  ipcMain.handle('task:snooze', (_event, id) => mutate(() => {
    const task = state.tasks.find(item => item.id === id && !item.completedAt)
    if (!task) throw new Error('任务不存在')
    task.snoozedUntil = Date.now() + 30 * 60 * 1000
  }))
  ipcMain.handle('setting:set', (_event, key, value) => {
    const booleanSetting = ['notifications', 'alwaysOnTop', 'openAtLogin'].includes(key) && typeof value === 'boolean'
    const themeSetting = key === 'theme' && ['system', 'dark', 'light'].includes(value)
    const opacitySetting = key === 'opacity' && typeof value === 'number' && Number.isFinite(value) && value >= 0.65 && value <= 1
    if (!booleanSetting && !themeSetting && !opacitySetting) throw new Error('无效设置')
    return mutate(() => {
      state.settings[key] = value
      if (key === 'openAtLogin') updateLoginItem()
      if (['alwaysOnTop', 'theme', 'opacity'].includes(key)) applyAppearance()
    })
  })
  ipcMain.handle('data:open-folder', () => shell.openPath(path.dirname(dataPath)))
  ipcMain.handle('data:export', async () => {
    const result = await dialog.showSaveDialog(win, {title: '导出待办数据', defaultPath: `打怪待办-${new Date().toISOString().slice(0, 10)}.json`, filters: [{name: 'JSON 文件', extensions: ['json']}]})
    if (result.canceled || !result.filePath) return false
    fs.writeFileSync(result.filePath, JSON.stringify(state, null, 2), 'utf8')
    return true
  })
  ipcMain.handle('data:import', async () => {
    const result = await dialog.showOpenDialog(win, {title: '导入待办数据', properties: ['openFile'], filters: [{name: 'JSON 文件', extensions: ['json']}]})
    if (result.canceled || !result.filePaths[0]) return false
    const imported = normalizeState(JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8')))
    const confirmation = await dialog.showMessageBox(win, {type: 'warning', buttons: ['取消', '导入'], defaultId: 0, cancelId: 0, title: '导入待办数据', message: `将用导入文件中的 ${imported.tasks.length} 条任务替换当前任务和经验。当前数据会另存一份快照。`})
    if (confirmation.response !== 1) return false
    fs.copyFileSync(dataPath, `${dataPath}.before-import-${Date.now()}.json`)
    mutate(() => {
      state.tasks = imported.tasks
      state.xp = imported.xp
      state.completedCount = imported.completedCount
    })
    return true
  })
  ipcMain.handle('window:compact', (_event, compact) => {
    if (typeof compact !== 'boolean') throw new Error('无效窗口状态')
    return mutate(() => {
      state.settings.compact = compact
      const size = compact ? COMPACT : EXPANDED
      win.setMinimumSize(Math.min(COMPACT.width, EXPANDED.width), Math.min(COMPACT.height, EXPANDED.height))
      win.setMaximumSize(Math.max(COMPACT.width, EXPANDED.width), Math.max(COMPACT.height, EXPANDED.height))
      win.setSize(size.width, size.height)
      const bounds = win.getBounds()
      const workArea = screen.getDisplayMatching(bounds).workArea
      win.setPosition(Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - size.width), Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - size.height))
    })
  })
  ipcMain.handle('window:hide', () => win.hide())
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.orvis.worksidecar')
    dataPath = path.join(app.getPath('userData'), 'tasks.json')
    state = loadState(dataPath)
    saveState()
    nativeTheme.themeSource = state.settings.theme
    updateLoginItem()
    registerIpc()
    createWindow()
    tray = new Tray(trayImage())
    tray.setToolTip('打怪待办')
    tray.setContextMenu(Menu.buildFromTemplate([
      {label: '打开打怪待办', click: showWindow},
      {label: '退出', click: () => { quitting = true; app.quit() }}
    ]))
    tray.on('double-click', showWindow)
    notifyDueTasks()
    setInterval(notifyDueTasks, 30 * 1000)
    app.on('activate', showWindow)
  })
}
