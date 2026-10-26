const path = require('path')
const {packager} = require('@electron/packager')

packager({
  dir: path.join(__dirname, '..'),
  name: 'WK Sidecar',
  platform: 'win32',
  arch: 'x64',
  out: path.join(__dirname, '..', 'release'),
  overwrite: true,
  prune: true,
  asar: true,
  icon: path.join(__dirname, '..', 'assets', 'icon'),
  ignore: [/^\/release(\/|$)/, /^\/test(\/|$)/, /^\/scripts(\/|$)/, /^\/\.vscode(\/|$)/, /^\/\.ccgui(\/|$)/]
}).then(paths => {
  for (const output of paths) console.log(`Packaged: ${output}`)
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
