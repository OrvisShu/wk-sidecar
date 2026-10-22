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
    state.cards.push({id: 'word', front: 'take notes', back: '记笔记', example: '', createdAt: now, updatedAt: now, schedule: result.schedule, reviews: [result.log]})
    state.settings.englishShortcut = 'Control+Alt+E'
    saveState(file, state)
    const restored = loadState(file)
    assert.equal(restored.cards[0].schedule.due, result.schedule.due)
    assert.equal(restored.cards[0].reviews[0].rating, 'hard')
    assert.equal(restored.settings.englishShortcut, 'Control+Alt+E')
  } finally {
    fs.rmSync(directory, {recursive: true, force: true})
  }
})
