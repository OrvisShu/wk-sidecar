const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {defaults, normalizeState, loadState, saveState} = require('../state-store')
const {createReviewState, reviewCard} = require('../english-engine')

test('saved preferences and completed task progress survive a restart', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-sidecar-store-'))
  try {
    const file = path.join(directory, 'tasks.json')
    const state = defaults()
    state.settings = {...state.settings, theme: 'light', opacity: 0.75, alwaysOnTop: false, openAtLogin: true}
    state.windowPosition = {x: 120, y: 240}
    state.tasks.push({id: 'task-1', title: '写周报', createdAt: 100, dueAt: 200, completedAt: 300, earnedXp: 20, snoozedUntil: null, lastNotifiedAt: null})
    saveState(file, state)
    const restored = loadState(file)
    assert.equal(restored.settings.theme, 'light')
    assert.equal(restored.settings.opacity, 0.75)
    assert.equal(restored.settings.openAtLogin, true)
    assert.deepEqual(restored.windowPosition, {x: 120, y: 240})
    assert.equal(restored.xp, 20)
    assert.equal(restored.completedCount, 1)
  } finally {
    fs.rmSync(directory, {recursive: true, force: true})
  }
})

test('an invalid primary file recovers the last valid backup', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-sidecar-store-'))
  try {
    const file = path.join(directory, 'tasks.json')
    const state = defaults()
    state.settings.theme = 'light'
    saveState(file, state)
    state.settings.theme = 'dark'
    saveState(file, state)
    fs.writeFileSync(file, '{broken', 'utf8')
    const originalError = console.error
    console.error = () => {}
    let restored
    try { restored = loadState(file) } finally { console.error = originalError }
    assert.equal(restored.settings.theme, 'light')
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).settings.theme, 'light')
    assert.ok(fs.readdirSync(directory).some(name => name.includes('.corrupt-')))
  } finally {
    fs.rmSync(directory, {recursive: true, force: true})
  }
})

test('malformed preferences are replaced with safe values', () => {
  const normalized = normalizeState({tasks: [], settings: {theme: 'unknown', opacity: 0.1, notifications: 'yes', openAtLogin: true}})
  assert.equal(normalized.settings.theme, 'system')
  assert.equal(normalized.settings.opacity, 0.65)
  assert.equal(normalized.settings.notifications, true)
  assert.equal(normalized.settings.openAtLogin, true)
})

test('edge docking restores only when automatic hiding is enabled', () => {
  const saved = {tasks: [], windowPosition: {x: 0, y: 120}, windowDock: 'left', settings: {edgeAutoHide: true}}
  assert.equal(normalizeState(saved).windowDock, 'left')
  assert.deepEqual(normalizeState(saved).windowPosition, {x: 0, y: 120})
  saved.settings.edgeAutoHide = false
  assert.equal(normalizeState(saved).windowDock, null)
  saved.settings.edgeAutoHide = true
  saved.windowDock = 'top'
  assert.equal(normalizeState(saved).windowDock, null)
})

test('a missing primary file can be restored from backup', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-sidecar-store-'))
  try {
    const file = path.join(directory, 'tasks.json')
    const state = defaults()
    state.settings.theme = 'dark'
    saveState(file, state)
    state.settings.theme = 'light'
    saveState(file, state)
    fs.rmSync(file)
    assert.equal(loadState(file).settings.theme, 'dark')
    assert.ok(fs.existsSync(file))
  } finally {
    fs.rmSync(directory, {recursive: true, force: true})
  }
})

test('English cards keep their FSRS schedule through persistence', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-sidecar-store-'))
  try {
    const file = path.join(directory, 'tasks.json')
    const state = defaults()
    const now = Date.now()
    const result = reviewCard(createReviewState(now), 'hard', now)
    state.tasks.push({id: 'task', title: '写周报', createdAt: now, dueAt: now + 1000, completedAt: now + 2000, earnedXp: 20})
    state.cards.push({id: 'word', front: 'take notes', back: '记笔记', example: '', createdAt: now, updatedAt: now, schedule: result.schedule, reviews: [{...result.log, earnedXp: 5}], earnedXp: 5, lastXpDay: new Date(now).toLocaleDateString('en-CA')})
    state.settings.englishShortcut = 'Control+Alt+E'
    saveState(file, state)
    const restored = loadState(file)
    assert.equal(restored.cards[0].schedule.due, result.schedule.due)
    assert.equal(restored.cards[0].reviews[0].rating, 'hard')
    assert.equal(restored.cards[0].reviews[0].earnedXp, 5)
    assert.equal(restored.cards[0].earnedXp, 5)
    assert.equal(restored.xp, 25)
    assert.equal(restored.settings.englishShortcut, 'Control+Alt+E')
  } finally {
    fs.rmSync(directory, {recursive: true, force: true})
  }
})

test('older English cards do not invent XP when restored', () => {
  const now = Date.now()
  const card = {id: 'old', front: 'hello', back: '你好', createdAt: now, schedule: createReviewState(now), reviews: []}
  const restored = normalizeState({tasks: [], cards: [card], xp: 999})
  assert.equal(restored.cards[0].earnedXp, 0)
  assert.equal(restored.cards[0].lastXpDay, '')
  assert.equal(restored.xp, 0)
})

test('capping review history does not erase earlier English XP', () => {
  const now = Date.now()
  const reviews = Array.from({length: 101}, (_, index) => ({rating: 'good', reviewedAt: now + index, nextDueAt: now + index + 1000, earnedXp: 5}))
  const card = {id: 'long-lived', front: 'persist', back: '坚持', createdAt: now, schedule: createReviewState(now), reviews, earnedXp: 505, lastXpDay: new Date(now).toLocaleDateString('en-CA')}
  const restored = normalizeState({tasks: [], cards: [card]})
  assert.equal(restored.cards[0].reviews.length, 100)
  assert.equal(restored.cards[0].earnedXp, 505)
  assert.equal(restored.xp, 505)
})
