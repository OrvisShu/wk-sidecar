const fs = require('fs')

const DEFAULT_SETTINGS = Object.freeze({
  notifications: true,
  alwaysOnTop: true,
  compact: false,
  theme: 'system',
  opacity: 1,
  openAtLogin: false,
  edgeAutoHide: true,
  englishShortcut: 'Control+Shift+E',
  englishReminders: true
})

function defaults() {
  return {tasks: [], cards: [], reviewReminder: {day: '', count: 0, lastAt: 0}, xp: 0, completedCount: 0, settings: {...DEFAULT_SETTINGS}, windowPosition: null, windowDock: null}
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
  for (const key of ['notifications', 'alwaysOnTop', 'compact', 'openAtLogin', 'englishReminders', 'edgeAutoHide']) {
    if (typeof raw[key] === 'boolean') settings[key] = raw[key]
  }
  if (['system', 'dark', 'light'].includes(raw.theme)) settings.theme = raw.theme
  if (Number.isFinite(raw.opacity)) settings.opacity = Math.max(0.65, Math.min(1, raw.opacity))
  if (['Control+Shift+E', 'Control+Alt+E', 'Alt+Shift+E'].includes(raw.englishShortcut)) settings.englishShortcut = raw.englishShortcut
  const scheduleNumbers = ['due', 'stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'reps', 'lapses', 'learning_steps', 'state']
  const cards = Array.isArray(saved.cards) ? saved.cards.filter(card => card && typeof card.id === 'string' && typeof card.front === 'string' && typeof card.back === 'string' && Number.isFinite(card.createdAt) && card.schedule && scheduleNumbers.every(key => Number.isFinite(card.schedule[key])) && (card.schedule.last_review == null || Number.isFinite(card.schedule.last_review))).map(card => ({
    id: card.id,
    front: card.front.slice(0, 300),
    back: card.back.slice(0, 500),
    example: typeof card.example === 'string' ? card.example.slice(0, 500) : '',
    createdAt: card.createdAt,
    updatedAt: Number.isFinite(card.updatedAt) ? card.updatedAt : card.createdAt,
    schedule: Object.fromEntries([...scheduleNumbers, 'last_review'].map(key => [key, card.schedule[key] ?? null])),
    reviews: Array.isArray(card.reviews) ? card.reviews.filter(log => log && ['again', 'hard', 'good', 'easy'].includes(log.rating) && Number.isFinite(log.reviewedAt) && Number.isFinite(log.nextDueAt)).slice(-100).map(log => ({rating: log.rating, reviewedAt: log.reviewedAt, nextDueAt: log.nextDueAt, earnedXp: Number.isInteger(log.earnedXp) && log.earnedXp >= 0 && log.earnedXp <= 5 ? log.earnedXp : 0})) : [],
    earnedXp: Number.isInteger(card.earnedXp) && card.earnedXp >= 0 ? card.earnedXp : 0,
    lastXpDay: typeof card.lastXpDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(card.lastXpDay) ? card.lastXpDay : ''
  })) : []
  const reminder = saved.reviewReminder && typeof saved.reviewReminder === 'object' ? saved.reviewReminder : {}
  const reviewReminder = {day: typeof reminder.day === 'string' ? reminder.day : '', count: Number.isInteger(reminder.count) && reminder.count >= 0 ? reminder.count : 0, lastAt: Number.isFinite(reminder.lastAt) ? reminder.lastAt : 0}
  const position = saved.windowPosition
  const windowPosition = position && Number.isFinite(position.x) && Number.isFinite(position.y) ? {x: position.x, y: position.y} : null
  const completed = tasks.filter(task => task.completedAt)
  return {
    tasks,
    cards,
    reviewReminder,
    xp: completed.reduce((total, task) => total + (task.earnedXp || 20), 0) + cards.reduce((total, card) => total + card.earnedXp, 0),
    completedCount: completed.length,
    settings,
    windowPosition,
    windowDock: settings.edgeAutoHide && ['left', 'right'].includes(saved.windowDock) ? saved.windowDock : null
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
