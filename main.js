const {app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage, screen, nativeTheme, shell, dialog, globalShortcut} = require('electron')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const {STAGES, HOUR, stageFor, nextReminderAt} = require('./task-engine')
const {loadState, saveState: writeState, normalizeState} = require('./state-store')
const {createReviewState, reviewCard, reviewReward, dueCards, shouldPrompt} = require('./english-engine')
const {HANDLE_SIZE, edgeForBounds, expandedPosition, handlePosition} = require('./dock-engine')

const EXPANDED = {width: 390, height: 690}
const COMPACT = {width: 350, height: 174}
const PRAISE = ['漂亮的一击！事情又向前推进了。', '干得好，这只怪物已经被你收服。', '任务完成，今天的你又强了一点。', '清掉一件心事，继续保持节奏。']
let win
let tray
let englishWin
let dockWin
let dockHandleEdge = null
let dockRevealed = false
let dockCollapseTimer
let moveTimer
let programmaticPosition = null
let manuallyHidden = false
let shortcutRegistered = false
let state
let dataPath
let quitting = false

const userDataPath = !app.isPackaged && process.env.WK_SIDECAR_DEV_DATA_DIR
  ? path.resolve(process.env.WK_SIDECAR_DEV_DATA_DIR)
  : path.join(app.getPath('appData'), 'wk-sidecar')
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
  if (englishWin && !englishWin.isDestroyed()) englishWin.setOpacity(state.settings.opacity)
  if (dockWin && !dockWin.isDestroyed()) {
    dockWin.setAlwaysOnTop(state.settings.alwaysOnTop)
    dockWin.setOpacity(state.settings.opacity)
  }
}

function publish() {
  if (win && !win.isDestroyed()) win.webContents.send('state:changed', state)
  if (englishWin && !englishWin.isDestroyed()) englishWin.webContents.send('state:changed', state)
  if (dockWin && !dockWin.isDestroyed()) dockWin.webContents.send('state:changed', state)
}

function showEnglishWindow(mode = 'capture', id = '') {
  const query = new URLSearchParams({mode, id}).toString()
  if (englishWin && !englishWin.isDestroyed()) {
    if (englishWin.webContents.getURL().includes(query)) {
      englishWin.show()
      englishWin.focus()
      return
    }
    englishWin.close()
  }
  englishWin = new BrowserWindow({
    width: 430,
    height: mode === 'review' ? 420 : 450,
    minWidth: 430,
    minHeight: mode === 'review' ? 420 : 450,
    frame: false,
    resizable: false,
    title: mode === 'review' ? '英语复习' : mode === 'edit' ? '编辑英语卡片' : '速记英语',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#192224',
    webPreferences: {preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false}
  })
  englishWin.setOpacity(state.settings.opacity)
  englishWin.loadFile('english.html', {query: {mode, id}})
  englishWin.once('ready-to-show', () => { englishWin.show(); englishWin.focus() })
  const created = englishWin
  englishWin.on('closed', () => { if (englishWin === created) englishWin = null })
}

function registerEnglishShortcut(accelerator) {
  const old = state.settings.englishShortcut
  if (shortcutRegistered) globalShortcut.unregister(old)
  const success = globalShortcut.register(accelerator, () => showEnglishWindow('capture'))
  if (!success && shortcutRegistered && accelerator !== old) globalShortcut.register(old, () => showEnglishWindow('capture'))
  shortcutRegistered = success || globalShortcut.isRegistered(old)
  return success
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

function moveMainWindow(position) {
  const [x, y] = win.getPosition()
  if (x === position.x && y === position.y) return
  programmaticPosition = position
  win.setPosition(position.x, position.y)
  setTimeout(() => { if (programmaticPosition === position) programmaticPosition = null }, 150)
}

function closeDockHandle() {
  if (dockWin && !dockWin.isDestroyed()) dockWin.close()
  dockWin = null
  dockHandleEdge = null
}

function ensureDockHandle() {
  if (!state.windowDock || !win || win.isDestroyed()) return
  const bounds = win.getBounds()
  const workArea = screen.getDisplayMatching(bounds).workArea
  const position = handlePosition(state.windowDock, workArea, bounds, bounds.y)
  if (dockWin && !dockWin.isDestroyed() && dockHandleEdge === state.windowDock) {
    dockWin.setPosition(position.x, position.y)
    return
  }
  closeDockHandle()
  dockHandleEdge = state.windowDock
  dockWin = new BrowserWindow({
    ...HANDLE_SIZE,
    ...position,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: state.settings.alwaysOnTop,
    show: false,
    backgroundColor: '#192224',
    webPreferences: {preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false}
  })
  dockWin.setOpacity(state.settings.opacity)
  const created = dockWin
  dockWin.loadFile('dock.html', {query: {edge: state.windowDock}})
  dockWin.once('ready-to-show', () => {
    if (dockWin === created && state.windowDock && !dockRevealed && !manuallyHidden) created.showInactive()
  })
  dockWin.on('closed', () => { if (dockWin === created) { dockWin = null; dockHandleEdge = null } })
}

function collapseDock() {
  if (!state.windowDock || manuallyHidden || !win || win.isDestroyed()) return
  clearTimeout(dockCollapseTimer)
  dockRevealed = false
  win.hide()
  ensureDockHandle()
  if (dockWin && !dockWin.isDestroyed() && !dockWin.webContents.isLoading()) dockWin.showInactive()
}

function revealDock(focus = false) {
  if (!win || win.isDestroyed()) return
  clearTimeout(dockCollapseTimer)
  dockRevealed = true
  if (dockWin && !dockWin.isDestroyed()) dockWin.hide()
  if (focus) { win.show(); win.focus() }
  else win.showInactive()
}

function scheduleDockCollapse() {
  if (!state.windowDock || !dockRevealed || manuallyHidden) return
  clearTimeout(dockCollapseTimer)
  dockCollapseTimer = setTimeout(() => {
    if (moveTimer) { scheduleDockCollapse(); return }
    if (!win || win.isDestroyed()) return
    const cursor = screen.getCursorScreenPoint()
    const bounds = win.getBounds()
    if (cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width && cursor.y >= bounds.y && cursor.y < bounds.y + bounds.height) return
    collapseDock()
  }, 450)
}

function showWindow() {
  if (!win || win.isDestroyed()) return
  manuallyHidden = false
  if (state.windowDock) revealDock(true)
  else { win.show(); win.focus() }
}

function hideToTray() {
  manuallyHidden = true
  clearTimeout(dockCollapseTimer)
  win.hide()
  if (dockWin && !dockWin.isDestroyed()) dockWin.hide()
}

function dockWindow(edge) {
  clearTimeout(moveTimer)
  moveTimer = null
  const bounds = win.getBounds()
  const workArea = screen.getDisplayMatching(bounds).workArea
  const position = expandedPosition(edge, workArea, bounds, bounds.y)
  state.windowDock = edge
  state.windowPosition = position
  dockRevealed = true
  moveMainWindow(position)
  ensureDockHandle()
  revealDock()
  scheduleDockCollapse()
  saveState()
  publish()
}

function undockWindow(moveInside = false) {
  const edge = state.windowDock
  if (!edge) return
  clearTimeout(dockCollapseTimer)
  state.windowDock = null
  dockRevealed = false
  closeDockHandle()
  if (moveInside) {
    const bounds = win.getBounds()
    const workArea = screen.getDisplayMatching(bounds).workArea
    const x = edge === 'left' ? workArea.x + 24 : workArea.x + workArea.width - bounds.width - 24
    moveMainWindow({x, y: bounds.y})
    state.windowPosition = {x, y: bounds.y}
    showWindow()
  }
}

function repositionDock() {
  if (!state.windowDock || !win || win.isDestroyed()) return
  const saved = state.windowPosition || win.getBounds()
  const workArea = screen.getDisplayNearestPoint(saved).workArea
  const position = expandedPosition(state.windowDock, workArea, win.getBounds(), saved.y)
  moveMainWindow(position)
  state.windowPosition = position
  ensureDockHandle()
  saveState()
}

function createWindow() {
  const size = state.settings.compact ? COMPACT : EXPANDED
  const saved = state.windowPosition
  const workArea = saved ? screen.getDisplayNearestPoint(saved).workArea : screen.getPrimaryDisplay().workArea
  const initial = state.windowDock
    ? expandedPosition(state.windowDock, workArea, size, saved?.y ?? workArea.y + workArea.height - size.height - 20)
    : {
        x: saved ? Math.min(Math.max(saved.x, workArea.x), workArea.x + workArea.width - size.width) : workArea.x + workArea.width - size.width - 20,
        y: saved ? Math.min(Math.max(saved.y, workArea.y), workArea.y + workArea.height - size.height) : workArea.y + workArea.height - size.height - 20
      }
  win = new BrowserWindow({
    ...size,
    minWidth: size.width,
    minHeight: size.height,
    maxWidth: size.width,
    maxHeight: size.height,
    ...initial,
    frame: false,
    resizable: false,
    alwaysOnTop: state.settings.alwaysOnTop,
    show: false,
    backgroundColor: '#192224',
    webPreferences: {preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false}
  })
  win.setOpacity(state.settings.opacity)
  win.loadFile('index.html')
  win.once('ready-to-show', () => {
    if (state.windowDock) ensureDockHandle()
    else showWindow()
  })
  win.on('close', event => {
    if (!quitting) {
      event.preventDefault()
      hideToTray()
    }
  })
  win.on('blur', scheduleDockCollapse)
  win.on('move', () => {
    const [x, y] = win.getPosition()
    if (programmaticPosition?.x === x && programmaticPosition?.y === y) return
    if (state.windowDock && !dockRevealed) return
    clearTimeout(dockCollapseTimer)
    clearTimeout(moveTimer)
    moveTimer = setTimeout(() => {
      moveTimer = null
      if (win.isDestroyed()) return
      const bounds = win.getBounds()
      const workArea = screen.getDisplayMatching(bounds).workArea
      const edge = state.settings.edgeAutoHide ? edgeForBounds(bounds, workArea) : null
      if (edge) dockWindow(edge)
      else mutate(() => {
        if (state.windowDock) undockWindow()
        state.windowPosition = {x: bounds.x, y: bounds.y}
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

function notifyEnglishReview() {
  if (!state.settings.englishReminders) return
  const now = Date.now()
  if (!shouldPrompt(state.cards, state.reviewReminder, now)) return
  const count = dueCards(state.cards, now).length
  if (Notification.isSupported()) {
    const notification = new Notification({title: `有 ${count} 张英语卡片待复习`, body: '准备好时点开，花一点时间回想。'})
    notification.on('click', () => showEnglishWindow('review'))
    notification.show()
  }
  mutate(() => {
    const day = new Date(now).toLocaleDateString('en-CA')
    state.reviewReminder = {day, count: state.reviewReminder.day === day ? state.reviewReminder.count + 1 : 1, lastAt: now}
  })
}

function registerIpc() {
  ipcMain.handle('state:get', () => state)
  ipcMain.handle('english:shortcut-status', () => shortcutRegistered)
  ipcMain.handle('english:open', (_event, mode, id = '') => {
    if (!['capture', 'review', 'edit'].includes(mode) || mode === 'edit' && !state.cards.some(card => card.id === id)) throw new Error('无效窗口类型')
    showEnglishWindow(mode, id)
  })
  ipcMain.handle('english:add', (_event, input) => {
    const front = typeof input?.front === 'string' ? input.front.trim() : ''
    const back = typeof input?.back === 'string' ? input.back.trim() : ''
    const example = typeof input?.example === 'string' ? input.example.trim() : ''
    if (!front || front.length > 300 || back.length > 500 || example.length > 500) throw new Error('请输入英语内容，文本长度不超过限制')
    return mutate(() => {
      const now = Date.now()
      const card = {id: crypto.randomUUID(), front, back, example, createdAt: now, updatedAt: now, schedule: createReviewState(now), reviews: [], earnedXp: 0, lastXpDay: ''}
      state.cards.unshift(card)
      return card
    })
  })
  ipcMain.handle('english:update', (_event, id, input) => {
    const front = typeof input?.front === 'string' ? input.front.trim() : ''
    const back = typeof input?.back === 'string' ? input.back.trim() : ''
    const example = typeof input?.example === 'string' ? input.example.trim() : ''
    if (!front || front.length > 300 || back.length > 500 || example.length > 500) throw new Error('请输入英语内容，文本长度不超过限制')
    return mutate(() => {
      const card = state.cards.find(item => item.id === id)
      if (!card) throw new Error('卡片不存在')
      Object.assign(card, {front, back, example, updatedAt: Date.now()})
      return card
    })
  })
  ipcMain.handle('english:delete', (_event, id) => mutate(() => {
    const index = state.cards.findIndex(item => item.id === id)
    if (index < 0) throw new Error('卡片不存在')
    const [card] = state.cards.splice(index, 1)
    state.xp = Math.max(0, state.xp - card.earnedXp)
  }))
  ipcMain.handle('english:review', (_event, id, rating) => mutate(() => {
    const card = state.cards.find(item => item.id === id)
    if (!card || !card.back.trim() || card.schedule.due > Date.now()) throw new Error('卡片暂不可复习')
    const result = reviewCard(card.schedule, rating)
    const reward = reviewReward(card, result.log.reviewedAt)
    card.schedule = result.schedule
    card.reviews.push({...result.log, earnedXp: reward.xp})
    card.reviews = card.reviews.slice(-100)
    card.earnedXp += reward.xp
    if (reward.xp) card.lastXpDay = reward.day
    state.xp += reward.xp
    return {nextDueAt: result.schedule.due, xp: reward.xp}
  }))
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
    const booleanSetting = ['notifications', 'alwaysOnTop', 'openAtLogin', 'englishReminders', 'edgeAutoHide'].includes(key) && typeof value === 'boolean'
    const themeSetting = key === 'theme' && ['system', 'dark', 'light'].includes(value)
    const opacitySetting = key === 'opacity' && typeof value === 'number' && Number.isFinite(value) && value >= 0.65 && value <= 1
    const shortcutSetting = key === 'englishShortcut' && ['Control+Shift+E', 'Control+Alt+E', 'Alt+Shift+E'].includes(value)
    if (!booleanSetting && !themeSetting && !opacitySetting && !shortcutSetting) throw new Error('无效设置')
    if (shortcutSetting && value !== state.settings.englishShortcut && !registerEnglishShortcut(value)) throw new Error('快捷键被其他程序占用，请选择其他组合')
    return mutate(() => {
      state.settings[key] = value
      if (key === 'edgeAutoHide' && !value) undockWindow(true)
      if (key === 'openAtLogin') updateLoginItem()
      if (['alwaysOnTop', 'theme', 'opacity'].includes(key)) applyAppearance()
    })
  })
  ipcMain.handle('window:dock', (_event, edge) => {
    if (edge !== null && !['left', 'right'].includes(edge)) throw new Error('无效贴边方向')
    if (edge && !state.settings.edgeAutoHide) throw new Error('请先开启贴边自动隐藏')
    if (edge) dockWindow(edge)
    else mutate(() => undockWindow(true))
  })
  ipcMain.handle('window:dock-reveal', () => {
    if (!state.windowDock || manuallyHidden) return
    revealDock()
  })
  ipcMain.handle('window:dock-leave', () => scheduleDockCollapse())
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
    const confirmation = await dialog.showMessageBox(win, {type: 'warning', buttons: ['取消', '导入'], defaultId: 0, cancelId: 0, title: '导入待办数据', message: `将用导入文件中的 ${imported.tasks.length} 条任务和 ${imported.cards.length} 张英语卡片替换当前内容。当前数据会另存一份快照。`})
    if (confirmation.response !== 1) return false
    fs.copyFileSync(dataPath, `${dataPath}.before-import-${Date.now()}.json`)
    mutate(() => {
      state.tasks = imported.tasks
      state.cards = imported.cards
      state.reviewReminder = imported.reviewReminder
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
      clearTimeout(moveTimer)
      moveTimer = null
      win.setMinimumSize(Math.min(COMPACT.width, EXPANDED.width), Math.min(COMPACT.height, EXPANDED.height))
      win.setMaximumSize(Math.max(COMPACT.width, EXPANDED.width), Math.max(COMPACT.height, EXPANDED.height))
      win.setSize(size.width, size.height)
      const bounds = win.getBounds()
      const workArea = screen.getDisplayMatching(bounds).workArea
      const position = state.windowDock
        ? expandedPosition(state.windowDock, workArea, size, bounds.y)
        : {x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - size.width), y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - size.height)}
      moveMainWindow(position)
      state.windowPosition = position
      if (state.windowDock) ensureDockHandle()
    })
  })
  ipcMain.handle('window:hide', () => hideToTray())
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
    screen.on('display-metrics-changed', repositionDock)
    screen.on('display-removed', repositionDock)
    registerEnglishShortcut(state.settings.englishShortcut)
    tray = new Tray(trayImage())
    tray.setToolTip('打怪待办')
    tray.setContextMenu(Menu.buildFromTemplate([
      {label: '打开打怪待办', click: showWindow},
      {label: '退出', click: () => { quitting = true; app.quit() }}
    ]))
    tray.on('double-click', showWindow)
    notifyDueTasks()
    notifyEnglishReview()
    setInterval(notifyDueTasks, 30 * 1000)
    setInterval(notifyEnglishReview, 60 * 1000)
    app.on('activate', showWindow)
  })
}

app.on('will-quit', () => globalShortcut.unregisterAll())
