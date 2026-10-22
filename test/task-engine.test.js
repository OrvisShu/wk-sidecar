const test = require('node:test')
const assert = require('node:assert/strict')
const {HOUR, stageFor, nextReminderAt, levelProgress} = require('../task-engine')

test('a pending task evolves at the due time and each overdue milestone', () => {
  const dueAt = 1_000_000_000
  const task = {dueAt, completedAt: null}
  assert.equal(stageFor(task, dueAt - 1), 0)
  assert.equal(stageFor(task, dueAt), 1)
  assert.equal(stageFor(task, dueAt + HOUR), 2)
  assert.equal(stageFor(task, dueAt + 6 * HOUR), 3)
  assert.equal(stageFor(task, dueAt + 24 * HOUR), 4)
  task.completedAt = dueAt + 25 * HOUR
  assert.equal(stageFor(task, dueAt + 30 * HOUR), 0)
})

test('reminders wait for due time, snooze, and the hourly repeat', () => {
  const dueAt = Date.now() + HOUR
  const task = {dueAt, completedAt: null, lastNotifiedAt: null, snoozedUntil: null}
  assert.equal(nextReminderAt(task), dueAt)
  task.lastNotifiedAt = dueAt
  assert.equal(nextReminderAt(task), dueAt + HOUR)
  task.snoozedUntil = dueAt + 2 * HOUR
  assert.equal(nextReminderAt(task), dueAt + 2 * HOUR)
  task.completedAt = dueAt
  assert.equal(nextReminderAt(task), null)
})

test('experience progress crosses level thresholds', () => {
  assert.deepEqual(levelProgress(0), {level: 1, current: 0, required: 100})
  assert.deepEqual(levelProgress(100), {level: 2, current: 0, required: 300})
  assert.deepEqual(levelProgress(420), {level: 3, current: 20, required: 500})
})
