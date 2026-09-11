const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const MPV_CANDIDATES = process.platform === 'win32'
  ? [
      'C:\\Program Files\\MPV Player\\mpv.exe',
      'C:\\Program Files (x86)\\MPV Player\\mpv.exe',
      'mpv',
    ]
  : [
      '/usr/bin/mpv',
      '/usr/local/bin/mpv',
      '/snap/bin/mpv',
      'mpv',
    ]

function findMpv() {
  for (const candidate of MPV_CANDIDATES) {
    if (candidate.startsWith('/') ? fs.existsSync(candidate) : true) return candidate
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
  // stderr must be a real file fd, not a pipe: a pipe's read end closes when this
  // process exits (or stops reading), and mpv's next stderr write then gets SIGPIPE
  // and dies — a few seconds into an otherwise-successful detached playback.
  const logPath = path.join(os.tmpdir(), `vunches-mpv-${process.pid}-${Date.now()}.log`)
  const readLog = () => { try { return fs.readFileSync(logPath, 'utf8') } catch { return '' } }
  const cleanupLog = () => { try { fs.unlinkSync(logPath) } catch {} }

  return new Promise((resolve) => {
    const errFd = fs.openSync(logPath, 'w')
    const proc = spawn(MPV, args, { detached: true, stdio: ['ignore', 'ignore', errFd] })
    fs.closeSync(errFd)
    const timer = setTimeout(() => {
      proc.unref()
      cleanupLog()
      resolve({ launched: true })
    }, 3000)
    proc.on('error', (e) => {
      clearTimeout(timer)
      cleanupLog()
      resolve({ launched: false, error: e.message })
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        const err = readLog()
        cleanupLog()
        resolve({ launched: true, error: err || `exit code ${code}` })
      }
    })
  })
}

module.exports = { playStream, findMpv }
