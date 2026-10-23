const test = require('node:test')
const assert = require('node:assert/strict')
const {createReviewState, reviewCard, reviewReward, dueCards, shouldPrompt} = require('../src/shared/english-engine')

test('FSRS review advances the card and records the chosen rating', () => {
  const now = Date.now()
  const initial = createReviewState(now)
  const result = reviewCard(initial, 'good', now)
  assert.ok(result.schedule.due > now)
  assert.equal(result.schedule.reps, 1)
  assert.equal(result.log.rating, 'good')
  assert.equal(result.log.nextDueAt, result.schedule.due)
  assert.throws(() => reviewCard(initial, 'unknown', now), /无效评分/)
})

test('drafts without a meaning stay out of the review queue', () => {
  const now = Date.now()
  const schedule = createReviewState(now - 1000)
  const cards = [{id: 'draft', back: '', createdAt: now - 3600000, schedule}, {id: 'ready', back: '含义', createdAt: now - 3600000, schedule}]
  assert.deepEqual(dueCards(cards, now).map(card => card.id), ['ready'])
})

test('a card earns review XP once per local day', () => {
  const today = new Date(2026, 9, 23, 10).getTime()
  const tomorrow = new Date(2026, 9, 24, 10).getTime()
  const first = reviewReward({lastXpDay: ''}, today)
  assert.equal(first.xp, 5)
  assert.equal(reviewReward({lastXpDay: first.day}, today).xp, 0)
  assert.equal(reviewReward({lastXpDay: first.day}, tomorrow).xp, 5)
})

test('prompts respect quiet hours, spacing, and daily cap', () => {
  const now = new Date(2026, 9, 22, 12).getTime()
  const cards = [{back: '含义', createdAt: now - 3600000, schedule: createReviewState(now - 3600000)}]
  assert.equal(shouldPrompt(cards, {day: '', count: 0, lastAt: 0}, now), true)
  assert.equal(shouldPrompt(cards, {day: '', count: 0, lastAt: now - 3600000}, now), false)
  assert.equal(shouldPrompt(cards, {day: new Date(now).toLocaleDateString('en-CA'), count: 3, lastAt: 0}, now), false)
  assert.equal(shouldPrompt(cards, {day: '', count: 0, lastAt: 0}, new Date(2026, 9, 22, 23).getTime()), false)
})
