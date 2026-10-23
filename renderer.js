const $ = id => document.getElementById(id)
const icons = name => `node_modules/lucide-static/icons/${name}.svg`
const {HOUR, STAGES, stageFor, levelProgress} = window.taskEngine
const stageLabels = STAGES.map(stage => stage.label)
let state = null
let selectedDue = 'hour'
let activeTab = 'pending'
let toastTimer
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')

function relativeTime(timestamp) {
  const delta = timestamp - Date.now()
  const minutes = Math.ceil(Math.abs(delta) / 60000)
  if (delta < 0) return `逾期 ${minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时`}`
  if (minutes < 60) return `${minutes} 分钟后提醒`
  if (minutes < 24 * 60) return `${Math.ceil(minutes / 60)} 小时后提醒`
  return new Intl.DateTimeFormat('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}).format(timestamp)
}

function dueAtForSelection() {
  const now = new Date()
  if (selectedDue === 'hour') return Date.now() + HOUR
  if (selectedDue === 'three') return Date.now() + 3 * HOUR
  if (selectedDue === 'tomorrow') {
    now.setDate(now.getDate() + 1)
    now.setHours(9, 0, 0, 0)
    return now.getTime()
  }
  return new Date($('customDue').value).getTime()
}

function showToast(message, undoId = null) {
  const toast = $('toast')
  toast.replaceChildren()
  const label = document.createElement('span')
  label.textContent = message
  toast.append(label)
  if (undoId) {
    const undo = document.createElement('button')
    undo.textContent = '撤销'
    undo.addEventListener('click', async () => {
      try { await window.sidecar.undoTask(undoId); toast.classList.remove('visible') }
      catch (error) { showToast(error.message) }
    })
    toast.append(undo)
  }
  toast.classList.add('visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 6000)
}

function renderEncounter(pending) {
  const featured = [...pending].sort((a, b) => stageFor(b) - stageFor(a) || a.dueAt - b.dueAt)[0]
  const stage = featured ? stageFor(featured) : 0
  $('encounter').dataset.stage = stage
  $('stageName').textContent = featured ? (stage ? stageLabels[stage] : '正在孵化') : '当前平静'
  $('encounterTitle').textContent = featured ? (stage === 4 ? '最终首领出现！' : stage >= 2 ? '这件事正在变强。' : stage === 1 ? '小怪出现了。' : '今天，先迈出一步。') : '今天，先迈出一步。'
  $('encounterNote').textContent = featured ? featured.title : '记下一件事，让它有一个开始。'
  $('compactMonster').dataset.stage = stage
  $('compactMonster').textContent = stage === 4 ? '♛' : stage >= 2 ? '◆' : '✦'
  $('compactLabel').textContent = featured ? stageLabels[stage] : '任务清零'
  $('compactTitle').textContent = featured ? featured.title : '今天也有好状态'
  $('compactMeta').textContent = featured ? `${relativeTime(featured.dueAt)} · 还有 ${pending.length} 件待办` : '随时记录一件待办'
}

function makeIconButton(name, label, action) {
  const button = document.createElement('button')
  button.type = 'button'
  button.title = label
  button.setAttribute('aria-label', label)
  const image = document.createElement('img')
  image.src = icons(name)
  image.alt = ''
  button.append(image)
  button.addEventListener('click', action)
  return button
}

function taskRow(task) {
  const done = Boolean(task.completedAt)
  const stage = stageFor(task)
  const row = document.createElement('div')
  row.className = `task-item${done ? ' done' : ''}`
  const complete = document.createElement('button')
  complete.className = 'complete-button'
  complete.title = done ? '已完成' : '完成任务'
  complete.setAttribute('aria-label', complete.title)
  const check = document.createElement('img')
  check.src = icons('check')
  check.alt = ''
  complete.append(check)
  complete.disabled = done
  if (!done) complete.addEventListener('click', async () => {
    try {
      const result = await window.sidecar.completeTask(task.id)
      showToast(`${result.message} +${result.xp} XP`, task.id)
    } catch (error) { showToast(error.message) }
  })

  const info = document.createElement('div')
  info.className = 'task-info'
  const title = document.createElement('div')
  title.className = 'task-title'
  title.textContent = task.title
  const meta = document.createElement('div')
  meta.className = `task-meta${stage === 4 && !done ? ' boss' : stage > 0 && !done ? ' urgent' : ''}`
  const clock = document.createElement('img')
  clock.src = icons(done ? 'check' : 'clock-3')
  clock.alt = ''
  const time = document.createElement('span')
  time.textContent = done ? `完成于 ${new Intl.DateTimeFormat('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}).format(task.completedAt)} · +${task.earnedXp || 20} XP` : `${relativeTime(task.dueAt)} · ${stageLabels[stage]}`
  meta.append(clock, time)
  info.append(title, meta)

  const actions = document.createElement('div')
  actions.className = 'task-actions'
  if (!done) actions.append(makeIconButton('alarm-clock', '延后提醒 30 分钟', async () => {
    try { await window.sidecar.snoozeTask(task.id); showToast('已延后 30 分钟提醒') }
    catch (error) { showToast(error.message) }
  }))
  actions.append(makeIconButton('trash-2', '删除任务', async () => {
    if (!window.confirm(`删除“${task.title}”？`)) return
    try { await window.sidecar.deleteTask(task.id); showToast('任务已删除') }
    catch (error) { showToast(error.message) }
  }))
  row.append(complete, info, actions)
  return row
}

function renderTasks(pending, done) {
  $('pendingCount').textContent = pending.length
  const cards = state.cards || []
  const dueCount = cards.filter(card => card.back.trim() && card.schedule.due <= Date.now()).length
  $('englishDueCount').textContent = dueCount
  $('sortLabel').textContent = activeTab === 'pending' ? '按提醒时间' : activeTab === 'done' ? '最近完成' : `${cards.length} 张卡片`
  $('englishToolbar').hidden = activeTab !== 'english'
  document.querySelector('.quick-add').hidden = activeTab !== 'pending'
  $('pendingTab').classList.toggle('active', activeTab === 'pending')
  $('doneTab').classList.toggle('active', activeTab === 'done')
  $('englishTab').classList.toggle('active', activeTab === 'english')
  $('pendingTab').setAttribute('aria-selected', activeTab === 'pending')
  $('doneTab').setAttribute('aria-selected', activeTab === 'done')
  $('englishTab').setAttribute('aria-selected', activeTab === 'english')
  const list = $('taskList')
  list.replaceChildren()
  if (activeTab === 'english') {
    const query = $('englishSearch')?.value.trim().toLocaleLowerCase() || ''
    const filtered = cards.filter(card => [card.front, card.back, card.example].some(value => value.toLocaleLowerCase().includes(query))).sort((a, b) => a.schedule.due - b.schedule.due)
    if (!filtered.length) {
      const empty = document.createElement('div')
      empty.className = 'empty-state'
      const strong = document.createElement('strong')
      strong.textContent = query ? '没有找到卡片' : '还没有英语卡片'
      empty.append(strong)
      list.append(empty)
    } else filtered.forEach(card => list.append(englishRow(card)))
    return
  }
  const tasks = activeTab === 'pending' ? pending : done
  if (!tasks.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    const icon = document.createElement('img')
    icon.src = icons(activeTab === 'pending' ? 'sparkles' : 'archive')
    icon.alt = ''
    const title = document.createElement('strong')
    title.textContent = activeTab === 'pending' ? '目前没有待办' : '还没有完成记录'
    const note = document.createElement('span')
    note.textContent = activeTab === 'pending' ? '从上方记下一件要做的事' : '完成任务后，战绩会留在这里'
    empty.append(icon, title, note)
    list.append(empty)
    return
  }
  tasks.forEach(task => list.append(taskRow(task)))
}

function englishRow(card) {
  const row = document.createElement('div')
  row.className = 'task-item english-item'
  const info = document.createElement('div')
  info.className = 'task-info'
  const front = document.createElement('div')
  front.className = 'task-title'
  front.textContent = card.front
  const meta = document.createElement('div')
  meta.className = 'task-meta'
  meta.textContent = !card.back.trim() ? '待补释义' : card.schedule.due <= Date.now() ? '现在可复习' : `下次 ${new Intl.DateTimeFormat('zh-CN', {month: 'numeric', day: 'numeric'}).format(card.schedule.due)}`
  const meaning = document.createElement('div')
  meaning.className = 'english-meaning'
  meaning.textContent = card.back
  info.append(front, meaning, meta)
  const actions = document.createElement('div')
  actions.className = 'task-actions'
  actions.append(makeIconButton('pencil', '编辑卡片', () => window.sidecar.openEnglish('edit', card.id).catch(error => showToast(error.message))))
  actions.append(makeIconButton('trash-2', '删除卡片', async () => {
    if (!window.confirm(`删除“${card.front}”？`)) return
    try { await window.sidecar.deleteEnglish(card.id); showToast('卡片已删除') }
    catch (error) { showToast(error.message) }
  }))
  row.append(info, actions)
  return row
}

function render() {
  if (!state) return
  const pending = state.tasks.filter(task => !task.completedAt).sort((a, b) => a.dueAt - b.dueAt)
  const done = state.tasks.filter(task => task.completedAt).sort((a, b) => b.completedAt - a.completedAt)
  const progress = levelProgress(state.xp)
  $('level').textContent = progress.level
  $('xpText').textContent = `${progress.current} / ${progress.required} XP`
  $('xpFill').style.width = `${100 * progress.current / progress.required}%`
  $('contextCount').textContent = activeTab === 'english' ? state.cards.length : state.completedCount
  $('contextLabel').textContent = activeTab === 'english' ? '卡片' : '已完成'
  document.body.classList.toggle('light', state.settings.theme === 'light' || (state.settings.theme === 'system' && !systemTheme.matches))
  $('app').classList.toggle('compact', state.settings.compact)
  $('app').dataset.view = activeTab
  $('pinButton').classList.toggle('is-off', !state.settings.alwaysOnTop)
  $('pinButton').title = state.settings.alwaysOnTop ? '取消置顶' : '窗口置顶'
  $('pinToggle').checked = state.settings.alwaysOnTop
  $('edgeAutoHideToggle').checked = state.settings.edgeAutoHide
  document.querySelectorAll('.dock-options button').forEach(button => {
    button.classList.toggle('active', button.dataset.dock === (state.windowDock || 'none'))
    button.disabled = !state.settings.edgeAutoHide
  })
  $('notificationToggle').checked = state.settings.notifications
  $('englishReminderToggle').checked = state.settings.englishReminders
  $('englishShortcut').value = state.settings.englishShortcut
  $('loginToggle').checked = state.settings.openAtLogin
  $('opacitySlider').value = Math.round(state.settings.opacity * 100)
  $('opacityValue').textContent = `${Math.round(state.settings.opacity * 100)}%`
  document.querySelectorAll('.theme-options button').forEach(button => button.classList.toggle('active', button.dataset.theme === state.settings.theme))
  renderEncounter(pending)
  renderTasks(pending, done)
}

document.querySelectorAll('.due-option').forEach(button => button.addEventListener('click', () => {
  selectedDue = button.dataset.due
  document.querySelectorAll('.due-option').forEach(option => option.classList.toggle('active', option === button))
  $('customDue').hidden = selectedDue !== 'custom'
  if (selectedDue === 'custom' && !$('customDue').value) {
    const date = new Date(Date.now() + HOUR)
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
    $('customDue').value = date.toISOString().slice(0, 16)
  }
}))

$('addForm').addEventListener('submit', async event => {
  event.preventDefault()
  const title = $('taskInput').value.trim()
  const dueAt = dueAtForSelection()
  if (!title) return
  if (!Number.isFinite(dueAt) || dueAt <= Date.now()) { showToast('请选择未来的提醒时间'); return }
  try {
    await window.sidecar.addTask({title, dueAt})
    $('taskInput').value = ''
    activeTab = 'pending'
    render()
    showToast('已记下，行动开始。')
  } catch (error) { showToast(error.message) }
})

$('pendingTab').addEventListener('click', () => { activeTab = 'pending'; render() })
$('doneTab').addEventListener('click', () => { activeTab = 'done'; render() })
$('englishTab').addEventListener('click', () => { activeTab = 'english'; render() })
$('captureEnglish').addEventListener('click', () => window.sidecar.openEnglish('capture').catch(error => showToast(error.message)))
$('reviewEnglish').addEventListener('click', () => window.sidecar.openEnglish('review').catch(error => showToast(error.message)))
$('englishSearch').addEventListener('input', render)
$('compactButton').addEventListener('click', () => window.sidecar.setCompact(true).catch(error => showToast(error.message)))
$('expandButton').addEventListener('click', () => window.sidecar.setCompact(false).catch(error => showToast(error.message)))
$('hideButton').addEventListener('click', () => window.sidecar.hideWindow())
$('pinButton').addEventListener('click', () => window.sidecar.setSetting('alwaysOnTop', !state.settings.alwaysOnTop).catch(error => showToast(error.message)))
$('settingsButton').addEventListener('click', () => $('settingsDialog').showModal())
$('closeSettings').addEventListener('click', () => $('settingsDialog').close())
$('settingsDialog').addEventListener('click', event => { if (event.target === $('settingsDialog')) $('settingsDialog').close() })
$('notificationToggle').addEventListener('change', event => window.sidecar.setSetting('notifications', event.target.checked).catch(error => showToast(error.message)))
$('englishReminderToggle').addEventListener('change', event => window.sidecar.setSetting('englishReminders', event.target.checked).catch(error => showToast(error.message)))
$('englishShortcut').addEventListener('change', async event => {
  try {
    await window.sidecar.setSetting('englishShortcut', event.target.value)
    $('shortcutStatus').textContent = '快捷键已更新'
  } catch (error) {
    $('englishShortcut').value = state.settings.englishShortcut
    $('shortcutStatus').textContent = error.message
  }
})
$('pinToggle').addEventListener('change', event => window.sidecar.setSetting('alwaysOnTop', event.target.checked).catch(error => showToast(error.message)))
$('edgeAutoHideToggle').addEventListener('change', event => window.sidecar.setSetting('edgeAutoHide', event.target.checked).catch(error => showToast(error.message)))
document.querySelectorAll('.dock-options button').forEach(button => button.addEventListener('click', async () => {
  $('settingsDialog').close()
  try { await window.sidecar.setDock(button.dataset.dock === 'none' ? null : button.dataset.dock) }
  catch (error) { showToast(error.message) }
}))
$('loginToggle').disabled = !window.sidecar.canOpenAtLogin
$('loginToggle').addEventListener('change', event => window.sidecar.setSetting('openAtLogin', event.target.checked).catch(error => showToast(error.message)))
document.querySelectorAll('.theme-options button').forEach(button => button.addEventListener('click', () => window.sidecar.setSetting('theme', button.dataset.theme).catch(error => showToast(error.message))))
$('opacitySlider').addEventListener('input', event => {
  $('opacityValue').textContent = `${event.target.value}%`
  window.sidecar.setSetting('opacity', Number(event.target.value) / 100).catch(error => showToast(error.message))
})
$('openDataFolder').addEventListener('click', async () => {
  try {
    const error = await window.sidecar.openDataFolder()
    if (error) showToast(error)
  } catch (error) { showToast(error.message) }
})
$('exportData').addEventListener('click', async () => {
  try { if (await window.sidecar.exportData()) showToast('数据已导出') }
  catch (error) { showToast(error.message) }
})
$('importData').addEventListener('click', async () => {
  try { if (await window.sidecar.importData()) showToast('数据已导入') }
  catch (error) { showToast('导入失败，请检查文件格式') }
})
systemTheme.addEventListener('change', render)
document.getElementById('app').addEventListener('mouseleave', () => window.sidecar.leaveDock())
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n' && !state?.settings.compact) {
    event.preventDefault()
    if ($('settingsDialog').open) $('settingsDialog').close()
    $('taskInput').focus()
  }
})

window.sidecar.onStateChanged(nextState => { state = nextState; render() })
window.sidecar.getState().then(async initialState => {
  state = initialState
  render()
  $('shortcutStatus').textContent = await window.sidecar.getShortcutStatus() ? '' : '当前快捷键未注册，请选择其他组合'
}).catch(error => showToast(error.message))
setInterval(render, 30 * 1000)
