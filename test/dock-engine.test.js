const test = require('node:test')
const assert = require('node:assert/strict')
const {HANDLE_SIZE, edgeForBounds, expandedPosition, handlePosition} = require('../src/shared/dock-engine')

test('detects the nearest left or right work area edge', () => {
  const area = {x: -1920, y: 0, width: 1920, height: 1040}
  assert.equal(edgeForBounds({x: -1905, y: 100, width: 390, height: 690}, area), 'left')
  assert.equal(edgeForBounds({x: -390, y: 100, width: 390, height: 690}, area), 'right')
  assert.equal(edgeForBounds({x: -1000, y: 100, width: 390, height: 690}, area), null)
})

test('keeps the expanded window and handle inside the chosen display', () => {
  const area = {x: 1920, y: 80, width: 1280, height: 900}
  const size = {width: 390, height: 690}
  assert.deepEqual(expandedPosition('left', area, size, 9999), {x: 1920, y: 290})
  assert.deepEqual(expandedPosition('right', area, size, -100), {x: 2810, y: 80})
  assert.deepEqual(handlePosition('right', area, size, 290), {x: 3200 - HANDLE_SIZE.width, y: 591})
})
