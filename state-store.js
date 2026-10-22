const fs = require('fs')

const DEFAULT_SETTINGS = Object.freeze({
  notifications: true,
  alwaysOnTop: true,
  compact: false,
  theme: 'system',
  opacity: 1,
  openAtLogin: false
})

function defaults() {
  return {tasks: [], xp: 0, completedCount: 0, settings: {...DEFAULT_SETTINGS}, windowPosition: null}
}

function normalizeState(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !Array.isArray(saved.tasks)) throw new Error('Invalid data file')
  const tasks = saved.tasks.filter(task => task && typeof task.id === 'string' && typeof task.title === 'string' && Number.isFinite(task.dueAt) && Number.isFinite(task.createdAt)).map(task => ({
    id: task.id,
    title: task.title.slice(0, 120),
    createdAt: task.createdAt,
    dueAt: task.dueAt,
    completedAt: Number.isFinite(task.completedAt) ? task.completedAt : null,
    earnedXp: Number.isFinite(task.earnedXp) && task.earnedXp > 0 ? task.earnedXp : null,
    snoozedUntil: Number.isFinite(task.snoozedUntil) ? task.snoozedUntil : null,
    lastNotifiedAt: Number.isFinite(task.lastNotifiedAt) ? task.lastNotifiedAt : null
  }))
  const raw = saved.settings && typeof saved.settings === 'object' ? saved.settings : {}
  const settings = {...DEFAULT_SETTINGS}
  for (const key of ['notifications', 'alwaysOnTop', 'compact', 'openAtLogin']) {
    if (typeof raw[key] === 'boolean') settings[key] = raw[key]
  }
  if (['system', 'dark', 'light'].includes(raw.theme)) settings.theme = raw.theme
  if (Number.isFinite(raw.opacity)) settings.opacity = Math.max(0.65, Math.min(1, raw.opacity))
  const position = saved.windowPosition
  const windowPosition = position && Number.isFinite(position.x) && Number.isFinite(position.y) ? {x: position.x, y: position.y} : null
  const completed = tasks.filter(task => task.completedAt)
  return {
    tasks,
    xp: completed.reduce((total, task) => total + (task.earnedXp || 20), 0),
    completedCount: completed.length,
    settings,
    windowPosition
  }
}

function loadState(file) {
  if (!fs.existsSync(file)) {
    const backup = `${file}.bak`
    if (!fs.existsSync(backup)) return defaults()
    try {
      const recovered = normalizeState(JSON.parse(fs.readFileSync(backup, 'utf8')))
      fs.copyFileSync(backup, file)
      return recovered
    } catch (error) {
      console.error('Could not recover missing task data:', error)
      return defaults()
    }
  }
  try {
    return normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch (error) {
    console.error('Could not read task data, trying backup:', error)
    const backup = `${file}.bak`
    let recovered
    try { recovered = normalizeState(JSON.parse(fs.readFileSync(backup, 'utf8'))) }
    catch (backupError) { console.error('Could not recover task data:', backupError) }
    fs.renameSync(file, `${file}.corrupt-${Date.now()}`)
    if (recovered) fs.copyFileSync(backup, file)
    return recovered || defaults()
  }
}

function saveState(file, state) {
  const temp = `${file}.tmp`
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8')
  if (fs.existsSync(file)) {
    try {
      normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')))
      fs.copyFileSync(file, `${file}.bak`)
    } catch (error) {
      console.error('Previous task data was invalid; backup kept:', error)
    }
  }
  fs.renameSync(temp, file)
}

module.exports = {DEFAULT_SETTINGS, defaults, normalizeState, loadState, saveState}
