const {createEmptyCard, fsrs, Rating} = require('ts-fsrs')

const scheduler = fsrs()
const RATINGS = Object.freeze({again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy})
const REVIEW_XP = 5

function createReviewState(now = Date.now()) {
  return serializeCard(createEmptyCard(new Date(now)))
}

function serializeCard(card) {
  return {...card, due: card.due.getTime(), last_review: card.last_review?.getTime() ?? null}
}

function restoreCard(card) {
  return {...card, due: new Date(card.due), last_review: card.last_review == null ? undefined : new Date(card.last_review)}
}

function reviewCard(card, rating, now = Date.now()) {
  if (!Object.hasOwn(RATINGS, rating)) throw new Error('无效评分')
  const result = scheduler.next(restoreCard(card), new Date(now), RATINGS[rating])
  return {schedule: serializeCard(result.card), log: {rating, reviewedAt: now, nextDueAt: result.card.due.getTime()}}
}

function reviewReward(card, now = Date.now()) {
  const day = new Date(now).toLocaleDateString('en-CA')
  return {day, xp: card.lastXpDay === day ? 0 : REVIEW_XP}
}

function dueCards(cards, now = Date.now()) {
  return cards.filter(card => card.back.trim() && card.schedule.due <= now).sort((a, b) => a.schedule.due - b.schedule.due)
}

function shouldPrompt(cards, reminder, now = Date.now()) {
  const hour = new Date(now).getHours()
  if (hour >= 22 || hour < 9) return false
  const day = new Date(now).toLocaleDateString('en-CA')
  const count = reminder.day === day ? reminder.count : 0
  if (count >= 3 || now - reminder.lastAt < 3 * 60 * 60 * 1000) return false
  return dueCards(cards, now).some(card => now - card.createdAt >= 30 * 60 * 1000)
}

module.exports = {createReviewState, reviewCard, reviewReward, dueCards, shouldPrompt}
