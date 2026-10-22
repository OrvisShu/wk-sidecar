;(function () {
const STAGES = [
  {name: '平静', label: '待办萌芽', tone: 'calm'},
  {name: '躁动', label: '小怪出现', tone: 'alert'},
  {name: '成长', label: '怪物成长', tone: 'warning'},
  {name: '暴走', label: '怪物暴走', tone: 'danger'},
  {name: '首领', label: '大 Boss', tone: 'boss'}
]

const HOUR = 60 * 60 * 1000
const STAGE_DELAYS = [0, HOUR, 6 * HOUR, 24 * HOUR]

function stageFor(task, now = Date.now()) {
  if (task.completedAt || now < task.dueAt) return 0
  const overdue = now - task.dueAt
  return 1 + STAGE_DELAYS.slice(1).filter(delay => overdue >= delay).length
}

function nextReminderAt(task) {
  if (task.completedAt) return null
  const stage = stageFor(task)
  const stageTime = stage === 0 ? task.dueAt : task.dueAt + STAGE_DELAYS[stage - 1]
  const repeatTime = task.lastNotifiedAt ? task.lastNotifiedAt + HOUR : 0
  return Math.max(stageTime, repeatTime, task.snoozedUntil || 0)
}

function levelFor(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1
}

function levelProgress(xp) {
  const level = levelFor(xp)
  const floor = (level - 1) ** 2 * 100
  const ceiling = level ** 2 * 100
  return {level, current: xp - floor, required: ceiling - floor}
}

const engine = {STAGES, HOUR, stageFor, nextReminderAt, levelFor, levelProgress}
if (typeof module !== 'undefined' && module.exports) module.exports = engine
if (typeof window !== 'undefined') window.taskEngine = engine
})()
