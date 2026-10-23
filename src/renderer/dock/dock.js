const edge = new URLSearchParams(location.search).get('edge') === 'right' ? 'right' : 'left'
document.body.classList.toggle('right', edge === 'right')
document.getElementById('arrow').src = `../../../node_modules/lucide-static/icons/chevron-${edge === 'left' ? 'right' : 'left'}.svg`

function render(state) {
  const light = state.settings.theme === 'light' || state.settings.theme === 'system' && !matchMedia('(prefers-color-scheme: dark)').matches
  document.body.classList.toggle('light', light)
}

document.body.addEventListener('mouseenter', () => window.sidecar.revealDock())
document.getElementById('reveal').addEventListener('click', () => window.sidecar.revealDock())
window.sidecar.onStateChanged(render)
window.sidecar.getState().then(render)
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => window.sidecar.getState().then(render))
