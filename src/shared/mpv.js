const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const MPV_CANDIDATES = [
  'C:\\Program Files\\MPV Player\\mpv.exe',
  'C:\\Program Files (x86)\\MPV Player\\mpv.exe',
  'mpv',
]

function findMpv() {
  for (const candidate of MPV_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate
  }
  return MPV_CANDIDATES[0]
}

function playStream(url, name, mpvPath) {
  const MPV = mpvPath || findMpv()
  const args = [
    url,
    `--title=${name || 'Vunches'}`,
    '--cache=yes',
    '--cache-secs=10',
    '--demuxer-max-bytes=50MiB',
    '--hwdec=auto',
    '--force-window=immediate',
    '--ontop=no',
    '--tls-verify=no',
  ]
  return new Promise((resolve) => {
    const proc = spawn(MPV, args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let errOut = ''
    proc.stderr.on('data', (d) => { errOut += d.toString() })
    const timer = setTimeout(() => {
      proc.stderr.destroy()
      proc.unref()
      resolve({ launched: true })
    }, 3000)
    proc.on('error', (e) => {
      clearTimeout(timer)
      resolve({ launched: false, error: e.message })
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) resolve({ launched: true, error: errOut || `exit code ${code}` })
    })
  })
}

module.exports = { playStream, findMpv }
