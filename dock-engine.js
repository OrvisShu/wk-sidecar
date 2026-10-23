const HANDLE_SIZE = Object.freeze({width: 28, height: 88})
const SNAP_DISTANCE = 20

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

function edgeForBounds(bounds, workArea) {
  const left = Math.abs(bounds.x - workArea.x)
  const right = Math.abs(bounds.x + bounds.width - workArea.x - workArea.width)
  if (Math.min(left, right) > SNAP_DISTANCE) return null
  return left <= right ? 'left' : 'right'
}

function expandedPosition(edge, workArea, size, y) {
  return {
    x: edge === 'left' ? workArea.x : workArea.x + workArea.width - size.width,
    y: clamp(y, workArea.y, workArea.y + workArea.height - size.height)
  }
}

function handlePosition(edge, workArea, size, expandedY) {
  return {
    x: edge === 'left' ? workArea.x : workArea.x + workArea.width - HANDLE_SIZE.width,
    y: clamp(expandedY + Math.round((size.height - HANDLE_SIZE.height) / 2), workArea.y, workArea.y + workArea.height - HANDLE_SIZE.height)
  }
}

module.exports = {HANDLE_SIZE, edgeForBounds, expandedPosition, handlePosition}
