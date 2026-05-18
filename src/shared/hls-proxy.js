const os = require('os')
const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawn } = require('child_process')

const DEFAULT_FFMPEG_PATH = 'C:\\Users\\ian\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe'

function findFfmpeg() {
  const candidates = [
    DEFAULT_FFMPEG_PATH,
    'ffmpeg',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
  ]
  try {
    const wingetBase = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages')
    if (fs.existsSync(wingetBase)) {
      const pkgs = fs.readdirSync(wingetBase).filter(d => d.startsWith('Gyan.FFmpeg'))
      for (const pkg of pkgs) {
        const bins = path.join(wingetBase, pkg)
        const subs = fs.readdirSync(bins)
        for (const sub of subs) {
          const ffpath = path.join(bins, sub, 'bin', 'ffmpeg.exe')
          if (fs.existsSync(ffpath)) candidates.unshift(ffpath)
        }
      }
    }
  } catch {}
  return candidates[0]
}

function getLocalLanIp(targetDeviceIp, devices = []) {
  const nets = os.networkInterfaces()
  const candidates = []
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('127.')) {
        candidates.push(iface.address)
      }
    }
  }

  if (targetDeviceIp) {
    const targetSubnet = targetDeviceIp.split('.').slice(0, 3).join('.')
    const match = candidates.find(ip => ip.startsWith(targetSubnet + '.'))
    if (match) return match
  }

  for (const device of devices) {
    const deviceSubnet = device.host.split('.').slice(0, 3).join('.')
    const match = candidates.find(ip => ip.startsWith(deviceSubnet + '.'))
    if (match) return match
  }

  candidates.sort((a, b) => {
    const score = (ip) => {
      if (ip.startsWith('192.168.0.')) return 0
      if (ip.startsWith('192.168.1.')) return 1
      if (ip.match(/^192\.168\.\d+\./)) return 2
      if (ip.startsWith('10.0.'))  return 3
      if (ip.startsWith('10.'))    return 4
      return 5
    }
    return score(a) - score(b)
  })

  return candidates[0] || null
}

function resolveRedirects(url, maxRedirects = 5) {
  return new Promise((resolve) => {
    function follow(u, count) {
      if (count > maxRedirects) return resolve(u)
      const lib = u.startsWith('https') ? require('https') : require('http')
      const req = lib.request(u, { method: 'HEAD', timeout: 5000, rejectUnauthorized: false }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location, count + 1)
        } else {
          resolve(u)
        }
      })
      req.on('error', () => resolve(u))
      req.on('timeout', () => { req.destroy(); resolve(u) })
      req.end()
    }
    follow(url, 0)
  })
}

function ensureFirewallRule() {
  const { exec } = require('child_process')
  exec('netsh advfirewall firewall show rule name="Vunches Stream Proxy"', (err, stdout) => {
    if (!err && stdout.includes('Vunches Stream Proxy')) return
    exec('netsh advfirewall firewall add rule name="Vunches Stream Proxy" dir=in action=allow protocol=TCP localport=9234',
      (e) => { if (e) console.warn('Could not add firewall rule (not admin). Chromecast proxy may be blocked.') }
    )
  })
}

class HlsProxy {
  constructor() {
    this._server = null
    this._port = null
    this._ffmpegProc = null
    this._hlsDir = null
  }

  async start(streamUrl, deviceHost, devices, ffmpegPath) {
    this.stop()

    const lanIp = getLocalLanIp(deviceHost, devices || [])
    if (!lanIp) return null

    const ffmpeg = ffmpegPath || findFfmpeg()
    if (!ffmpeg || !fs.existsSync(ffmpeg)) {
      console.warn('ffmpeg not found at', ffmpeg)
      return null
    }

    this._hlsDir = path.join(os.tmpdir(), 'vunches-hls-' + Date.now())
    fs.mkdirSync(this._hlsDir, { recursive: true })

    const m3u8Path = path.join(this._hlsDir, 'stream.m3u8')

    const finalUrl = await resolveRedirects(streamUrl)

    this._ffmpegProc = spawn(ffmpeg, [
      '-loglevel', 'warning',
      '-tls_verify', '0',
      '-i', finalUrl,
      '-c', 'copy',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '6',
      '-hls_flags', 'delete_segments+append_list',
      '-hls_segment_filename', path.join(this._hlsDir, 'seg%03d.ts'),
      m3u8Path,
    ], { detached: false, stdio: ['ignore', 'pipe', 'pipe'] })

    this._ffmpegProc.on('close', code => { this._ffmpegProc = null })
    this._ffmpegProc.stderr.on('data', d => {
      const msg = d.toString()
      if (msg.includes('Error') || msg.includes('error') || msg.includes('failed')) {
        console.error('ffmpeg:', msg.trim())
      }
    })

    await new Promise((resolve, reject) => {
      const start = Date.now()
      const check = setInterval(() => {
        if (fs.existsSync(m3u8Path)) {
          clearInterval(check)
          resolve()
        } else if (Date.now() - start > 10000) {
          clearInterval(check)
          reject(new Error('ffmpeg did not produce HLS playlist in time'))
        }
      }, 200)
    }).catch(e => {
      console.error('HLS proxy setup failed:', e.message)
      this.stop()
      return null
    })

    const server = http.createServer((req, res) => {
      const reqPath = req.url.split('?')[0]
      let filePath
      if (reqPath === '/' || reqPath === '/stream.m3u8') {
        filePath = m3u8Path
      } else if (reqPath.endsWith('.ts')) {
        filePath = path.join(this._hlsDir, path.basename(reqPath))
      } else {
        res.writeHead(404); res.end(); return
      }

      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return }
        const ct = filePath.endsWith('.m3u8') ? 'application/x-mpegurl' : 'video/mp2t'
        res.writeHead(200, {
          'Content-Type': ct,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        })
        res.end(data)
      })
    })

    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(9234, '0.0.0.0', resolve)
    }).catch(async () => {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '0.0.0.0', resolve)
      })
    })

    this._port = server.address().port
    this._server = server
    return `http://${lanIp}:${this._port}/stream.m3u8`
  }

  stop() {
    if (this._ffmpegProc) {
      try { this._ffmpegProc.kill('SIGTERM') } catch {}
      this._ffmpegProc = null
    }
    if (this._server) {
      try { this._server.close() } catch {}
      this._server = null
      this._port = null
    }
    if (this._hlsDir) {
      try { fs.rmSync(this._hlsDir, { recursive: true, force: true }) } catch {}
      this._hlsDir = null
    }
  }
}

module.exports = { HlsProxy, findFfmpeg, getLocalLanIp, resolveRedirects, ensureFirewallRule }
