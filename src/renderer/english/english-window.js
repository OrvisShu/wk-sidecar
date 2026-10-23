const $ = id => document.getElementById(id)
const params = new URLSearchParams(location.search)
const mode = params.get('mode') || 'capture'
const cardId = params.get('id') || ''
let currentCard = null
let state = null

function dueCards() {
  return state.cards.filter(card => card.back.trim() && card.schedule.due <= Date.now()).sort((a, b) => a.schedule.due - b.schedule.due)
}

function showMessage(message) { $('message').textContent = message }

function renderReview() {
  const due = dueCards()
  currentCard = due[0] || null
  $('reviewCount').textContent = `待复习 ${due.length} 张`
  $('emptyReview').hidden = Boolean(currentCard)
  $('reviewFront').hidden = !currentCard
  $('revealButton').hidden = !currentCard
  $('reviewAnswer').hidden = true
  $('ratings').hidden = true
  if (currentCard) $('reviewFront').textContent = currentCard.front
}

function render() {
  if (!state) return
  const light = state.settings.theme === 'light' || state.settings.theme === 'system' && !matchMedia('(prefers-color-scheme: dark)').matches
  document.body.classList.toggle('light', light)
  if (mode === 'review') renderReview()
}

$('closeButton').addEventListener('click', () => window.sidecar.hideEnglish())
$('cancelButton').addEventListener('click', () => window.sidecar.hideEnglish())
document.addEventListener('keydown', event => { if (event.key === 'Escape') window.sidecar.hideEnglish() })
$('cardForm').addEventListener('submit', async event => {
  event.preventDefault()
  const input = {front: $('front').value.trim(), back: $('back').value.trim(), example: $('example').value.trim()}
  if (!input.front) return
  try {
    if (mode === 'edit') await window.sidecar.updateEnglish(cardId, input)
    else await window.sidecar.addEnglish(input)
    if (mode === 'capture') $('cardForm').reset()
    await window.sidecar.hideEnglish()
  } catch (error) { showMessage(error.message) }
})
$('revealButton').addEventListener('click', () => {
  if (!currentCard) return
  $('reviewBack').textContent = currentCard.back
  $('reviewExample').textContent = currentCard.example
  $('reviewExample').hidden = !currentCard.example
  $('reviewAnswer').hidden = false
  $('revealButton').hidden = true
  $('ratings').hidden = false
})
document.querySelectorAll('[data-rating]').forEach(button => button.addEventListener('click', async () => {
  if (!currentCard) return
  const id = currentCard.id
  try {
    const result = await window.sidecar.reviewEnglish(id, button.dataset.rating)
    showMessage(`${result.xp ? `+${result.xp} XP · ` : ''}下次复习：${new Intl.DateTimeFormat('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}).format(result.nextDueAt)}`)
  } catch (error) { showMessage(error.message) }
}))

if (mode === 'review') {
  $('heading').textContent = '英语复习'
  $('cardForm').hidden = true
  $('reviewPane').hidden = false
} else if (mode === 'edit') {
  $('heading').textContent = '编辑卡片'
  $('saveButton').textContent = '保存修改'
}
window.sidecar.onStateChanged(next => { state = next; render() })
window.sidecar.onEnglishOpened(() => {
  if (mode === 'capture') {
    $('cardForm').reset()
    showMessage('')
    $('front').focus()
  } else if (mode === 'review') render()
})
window.sidecar.getState().then(initial => {
  state = initial
  if (mode === 'edit') {
    const card = state.cards.find(item => item.id === cardId)
    if (!card) { showMessage('卡片不存在'); return }
    $('front').value = card.front
    $('back').value = card.back
    $('example').value = card.example
  }
  render()
  if (mode !== 'review') $('front').focus()
}).catch(error => showMessage(error.message))
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render)
