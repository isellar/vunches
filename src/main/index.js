const { app, BrowserWindow, ipcMain } = require('electron')
const { join } = require('path')
const { spawn } = require('child_process')
const os = require('os')
const dgram = require('dgram')

// ─── Store ────────────────────────────────────────────────────────────────────

let store
async function getStore() {
  if (!store) {
    const { default: Store } = await import('electron-store')
    store = new Store()
  }
  return store
}

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0f0f0f', symbolColor: '#ffffff', height: 36 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// ─── mDNS Discovery ───────────────────────────────────────────────────────────
// Custom UDP multicast scanner — works on Windows by binding to the correct
// Wi-Fi/LAN interface rather than relying on OS multicast routing.

const MDNS_ADDR = '224.0.0.251'
const MDNS_PORT = 5353

// DNS PTR query for _googlecast._tcp.local
const CAST_QUERY = Buffer.from([
  0x00, 0x00, // ID: 0
  0x00, 0x00, // Flags: standard query
  0x00, 0x01, // QDCOUNT: 1
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ANCOUNT, NSCOUNT, ARCOUNT
  // QNAME: _googlecast._tcp.local
  0x0b,
  0x5f, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x63, 0x61, 0x73, 0x74, // _googlecast
  0x04, 0x5f, 0x74, 0x63, 0x70, // _tcp
  0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c, // local
  0x00, // root
  0x00, 0x0c, // QTYPE: PTR
  0x00, 0x01, // QCLASS: IN
])

let mdnsSocket = null
let discoveredDevices = []
let castWindow = null
let discoveryInterval = null

function getLocalInterfaces() {
  const nets = os.networkInterfaces()
  const addrs = []
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4') addrs.push(iface.address)
    }
  }
  return addrs
}

// Cached local IPs — refresh every 30s in case network changes
let _cachedLocalIPs = null
let _localIPsTime = 0
function _localIPs() {
  const now = Date.now()
  if (!_cachedLocalIPs || now - _localIPsTime > 30000) {
    _cachedLocalIPs = getLocalInterfaces()
    _localIPsTime = now
  }
  return _cachedLocalIPs
}

// Parse DNS TXT records — they are length-prefixed strings, not null-terminated
// Returns { fn, id, md, ... } from Chromecast TXT records
function parseDnsTxtRecords(msg) {
  const result = {}
  // Scan the entire packet for TXT record data
  // TXT records look like: [total_len][key_len][key=value]...
  // We look for known Chromecast TXT keys: fn, id, md, rs, ve, ca, st
  const known = ['fn=', 'id=', 'md=', 'rs=', 've=', 'ca=', 'st=', 'bs=', 'nf=']
  for (let i = 0; i < msg.length - 3; i++) {
    for (const key of known) {
      if (i + key.length > msg.length) continue
      const chunk = msg.slice(i, i + key.length).toString('utf8')
      if (chunk === key) {
        // Read backwards to find the length byte, then read the value
        let end = i + key.length
        while (end < msg.length && msg[end] !== 0 && (msg[end] >= 0x20 || msg[end] === 0x09)) {
          end++
        }
        const val = msg.slice(i + key.length, end).toString('utf8').trim()
        if (val) result[key.slice(0, -1)] = val
        break
      }
    }
  }
  return result
}

function startDiscovery(win) {
  castWindow = win
  discoveredDevices = []

  // Close existing sockets
  if (mdnsSocket) {
    if (Array.isArray(mdnsSocket)) {
      mdnsSocket.forEach(s => { try { s.close() } catch {} })
    } else {
      try { mdnsSocket.close() } catch {}
    }
    mdnsSocket = null
  }
  if (discoveryInterval) {
    clearInterval(discoveryInterval)
    discoveryInterval = null
  }

  const localIPs = _localIPs()
  // Bind on all non-loopback, non-VPN interfaces
  // Prefer 192.168.x.x / 10.0.x.x LAN addresses
  const bindAddrs = getLocalInterfaces().filter(ip =>
    !ip.startsWith('127.') &&
    !ip.startsWith('172.') &&  // WSL2/Docker/Hyper-V virtual switches
    !ip.startsWith('10.5.')    // NordVPN / other VPN ranges
  )

  if (!bindAddrs.length) {
    // Last resort: try any non-loopback
    bindAddrs.push(...getLocalInterfaces().filter(ip => !ip.startsWith('127.')))
  }

  console.log('mDNS binding on:', bindAddrs)

  const sockets = []
  mdnsSocket = sockets

  function handleMessage(msg, rinfo) {
    const srcIp = rinfo.address
    if (localIPs.includes(srcIp)) return
    if (discoveredDevices.find(d => d.host === srcIp)) return

    // Must respond on port 5353 to be an mDNS responder
    const txt = parseDnsTxtRecords(msg)
    // Only accept if it looks like a real Chromecast (has fn= or md= with Cast)
    const name = txt.fn || txt.md || null
    if (!name) {
      // Could still be a Chromecast — probe port 8009
      probeChromecast(srcIp, `Device (${srcIp})`)
      return
    }
    addDevice(srcIp, name)
  }

  function addDevice(ip, name) {
    if (discoveredDevices.find(d => d.host === ip)) return
    discoveredDevices.push({ name, host: ip, port: 8009 })
    console.log('Discovered:', name, ip)
    castWindow?.webContents.send('cast-devices-updated', discoveredDevices)
  }

  // TCP probe: try connecting to port 8009 (Chromecast control port)
  function probeChromecast(ip, fallbackName) {
    if (discoveredDevices.find(d => d.host === ip)) return
    const net = require('net')
    const sock = net.createConnection({ host: ip, port: 8009, timeout: 1500 })
    sock.on('connect', () => {
      sock.destroy()
      // Fetch friendly name from Chromecast info endpoint
      fetchChromecastInfo(ip, fallbackName)
    })
    sock.on('error', () => {})
    sock.on('timeout', () => sock.destroy())
  }

  // Chromecast devices expose device info at port 8008/eureka_info
  function fetchChromecastInfo(ip, fallbackName) {
    if (discoveredDevices.find(d => d.host === ip)) return
    const http = require('http')
    const req = http.get(`http://${ip}:8008/setup/eureka_info?options=detail`, { timeout: 2000 }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const info = JSON.parse(Buffer.concat(chunks).toString())
          const name = info.name || info.device_info?.name || fallbackName
          addDevice(ip, name)
        } catch {
          addDevice(ip, fallbackName)
        }
      })
    })
    req.on('error', () => addDevice(ip, fallbackName))
    req.on('timeout', () => { req.destroy(); addDevice(ip, fallbackName) })
  }

  // Create one socket per interface
  bindAddrs.forEach(bindAddr => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    sockets.push(sock)
    sock.on('error', e => console.error('mDNS error on', bindAddr, e.message))
    sock.on('message', handleMessage)
    sock.bind(MDNS_PORT, () => {
      try { sock.addMembership(MDNS_ADDR, bindAddr) } catch {}
      sock.send(CAST_QUERY, MDNS_PORT, MDNS_ADDR)
    })
  })

  // Re-query every 10s, also probe subnet on first run
  const sendQuery = () => {
    sockets.forEach(sock => {
      try { sock.send(CAST_QUERY, MDNS_PORT, MDNS_ADDR) } catch {}
    })
  }

  // Subnet scan: probe .1–.254 on the LAN for port 8009
  const lanAddr = bindAddrs.find(ip => ip.startsWith('192.168.'))
  if (lanAddr) {
    const subnet = lanAddr.split('.').slice(0, 3).join('.')
    setTimeout(() => {
      for (let i = 1; i <= 254; i++) {
        const ip = `${subnet}.${i}`
        if (!localIPs.includes(ip)) probeChromecast(ip, `Chromecast (${ip})`)
      }
    }, 2000) // slight delay so mDNS has a chance first
  }

  sendQuery()
  discoveryInterval = setInterval(sendQuery, 10000)
}

function stopDiscovery() {
  if (discoveryInterval) { clearInterval(discoveryInterval); discoveryInterval = null }
  if (mdnsSocket) {
    const socks = Array.isArray(mdnsSocket) ? mdnsSocket : [mdnsSocket]
    socks.forEach(s => { try { s.close() } catch {} })
    mdnsSocket = null
  }
}

// ─── HLS Transcoding Proxy for Chromecast ────────────────────────────────────
// Chromecast's Default Media Receiver doesn't support raw MPEG-TS over HTTP.
// We use ffmpeg to transcode TS→HLS (segmented) and serve it locally.
// The Chromecast loads application/x-mpegurl from our machine.

const FFMPEG_PATH = 'C:\\Users\\ian\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe'

let proxyServer = null
let proxyPort = null
let proxyStreamUrl = null
let ffmpegProc = null
let hlsDir = null

function findFfmpeg() {
  // Check common locations
  const candidates = [
    FFMPEG_PATH,
    'ffmpeg',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
  ]
  // Also search WinGet packages folder
  try {
    const wingetBase = require('path').join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages')
    const fs = require('fs')
    if (fs.existsSync(wingetBase)) {
      const pkgs = fs.readdirSync(wingetBase).filter(d => d.startsWith('Gyan.FFmpeg'))
      for (const pkg of pkgs) {
        const bins = require('path').join(wingetBase, pkg)
        // Walk one level deeper for versioned folder
        const subs = fs.readdirSync(bins)
        for (const sub of subs) {
          const ffpath = require('path').join(bins, sub, 'bin', 'ffmpeg.exe')
          if (fs.existsSync(ffpath)) candidates.unshift(ffpath)
        }
      }
    }
  } catch {}
  return candidates[0]
}

function getLocalLanIp(targetDeviceIp) {
  const nets = os.networkInterfaces()
  const candidates = []
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('127.')) {
        candidates.push(iface.address)
      }
    }
  }

  // Best match: same /24 subnet as the target Chromecast device
  if (targetDeviceIp) {
    const targetSubnet = targetDeviceIp.split('.').slice(0, 3).join('.')
    const match = candidates.find(ip => ip.startsWith(targetSubnet + '.'))
    if (match) return match
  }

  // Fallback: same subnet as any discovered Chromecast
  for (const device of discoveredDevices) {
    const deviceSubnet = device.host.split('.').slice(0, 3).join('.')
    const match = candidates.find(ip => ip.startsWith(deviceSubnet + '.'))
    if (match) return match
  }

  // Last resort: sort by likelihood of being a real LAN interface
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

async function startStreamProxy(streamUrl, deviceHost) {
  const path = require('path')
  const fs   = require('fs')
  const http = require('http')
  const os2  = require('os')

  // Stop any existing proxy/ffmpeg
  stopStreamProxy()

  const lanIp = getLocalLanIp(deviceHost)
  if (!lanIp) { console.warn('HLS proxy: no LAN IP'); return null }

  const ffmpeg = findFfmpeg()
  if (!ffmpeg || !fs.existsSync(ffmpeg)) {
    console.warn('ffmpeg not found at', ffmpeg)
    return null
  }

  // Create temp dir for HLS segments
  hlsDir = path.join(os2.tmpdir(), 'vunches-hls-' + Date.now())
  fs.mkdirSync(hlsDir, { recursive: true })

  const m3u8Path = path.join(hlsDir, 'stream.m3u8')
  proxyStreamUrl = streamUrl

  console.log('HLS proxy: starting ffmpeg transcoder...')
  console.log('HLS dir:', hlsDir)

  // Resolve redirects first so ffmpeg gets the final URL directly
  const finalUrl = await resolveRedirects(streamUrl)
  console.log('HLS proxy: final stream URL:', finalUrl.slice(0, 80))

  // Start ffmpeg: read from IPTV stream, output HLS segments
  ffmpegProc = spawn(ffmpeg, [
    '-loglevel', 'warning',
    '-tls_verify', '0',          // skip TLS cert check
    '-i', finalUrl,              // input: resolved stream URL
    '-c', 'copy',                // copy codec — no re-encode, very fast
    '-f', 'hls',
    '-hls_time', '2',            // 2-second segments
    '-hls_list_size', '6',       // keep 6 segments in playlist
    '-hls_flags', 'delete_segments+append_list',
    '-hls_segment_filename', path.join(hlsDir, 'seg%03d.ts'),
    m3u8Path,
  ], { detached: false, stdio: ['ignore', 'pipe', 'pipe'] })

  ffmpegProc.stdout.on('data', d => process.stdout.write(d))
  ffmpegProc.stderr.on('data', d => {
    const msg = d.toString()
    if (msg.includes('Error') || msg.includes('error') || msg.includes('failed')) {
      console.error('ffmpeg:', msg.trim())
    }
  })
  ffmpegProc.on('close', code => {
    console.log('ffmpeg exited with code', code)
    ffmpegProc = null
  })

  // Wait for the m3u8 playlist to appear (up to 10s)
  await new Promise((resolve, reject) => {
    const start = Date.now()
    const check = setInterval(() => {
      if (fs.existsSync(m3u8Path)) {
        clearInterval(check)
        console.log('HLS playlist ready:', m3u8Path)
        resolve()
      } else if (Date.now() - start > 10000) {
        clearInterval(check)
        reject(new Error('ffmpeg did not produce HLS playlist in time'))
      }
    }, 200)
  }).catch(e => {
    console.error('HLS proxy setup failed:', e.message)
    stopStreamProxy()
    return null
  })

  // Start HTTP server to serve HLS files
  const server = http.createServer((req, res) => {
    const reqPath = req.url.split('?')[0]
    let filePath
    if (reqPath === '/' || reqPath === '/stream.m3u8') {
      filePath = m3u8Path
    } else if (reqPath.endsWith('.ts')) {
      filePath = path.join(hlsDir, path.basename(reqPath))
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
    // Port 9234 taken — try random
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '0.0.0.0', resolve)
    })
  })

  proxyPort = server.address().port
  proxyServer = server
  const proxyUrl = `http://${lanIp}:${proxyPort}/stream.m3u8`
  console.log('HLS proxy ready:', proxyUrl)
  return proxyUrl
}

function stopStreamProxy() {
  if (ffmpegProc) {
    try { ffmpegProc.kill('SIGTERM') } catch {}
    ffmpegProc = null
  }
  if (proxyServer) {
    try { proxyServer.close() } catch {}
    proxyServer = null
    proxyPort = null
    proxyStreamUrl = null
  }
  if (hlsDir) {
    try {
      const fs = require('fs')
      fs.rmSync(hlsDir, { recursive: true, force: true })
    } catch {}
    hlsDir = null
  }
}

// Ensure firewall rule exists for fixed proxy port on startup
function ensureFirewallRule() {
  const { exec } = require('child_process')
  // Check if rule already exists first
  exec('netsh advfirewall firewall show rule name="Vunches Stream Proxy"', (err, stdout) => {
    if (!err && stdout.includes('Vunches Stream Proxy')) return // already exists
    // Try to add — will silently fail if not admin, but rule may have been added before
    exec('netsh advfirewall firewall add rule name="Vunches Stream Proxy" dir=in action=allow protocol=TCP localport=9234',
      (e) => { if (e) console.warn('Could not add firewall rule (not admin). Chromecast proxy may be blocked.') }
    )
  })
}

// ─── Chromecast Client ────────────────────────────────────────────────────────

const CLIENT_ID = 'sender-0'
const DEFAULT_APP_ID = 'CC1AD845'
const MEDIA_NS = 'urn:x-cast:com.google.cast.media'
const RECEIVER_NS = 'urn:x-cast:com.google.cast.receiver'
const CONN_NS = 'urn:x-cast:com.google.cast.tp.connection'
const HB_NS = 'urn:x-cast:com.google.cast.tp.heartbeat'

let activeClient = null
let reconnectTimer = null
let currentCastOpts = null  // { host, port, url, title, aggressive }

function clearReconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
}

let hasPlayedSuccessfully = false  // only retry if we actually played once

function connectAndPlay(opts) {
  // Kill any existing castv2 client cleanly
  clearReconnect()
  if (activeClient) {
    try { activeClient.close() } catch {}
    activeClient = null
  }
  currentCastOpts = opts
  hasPlayedSuccessfully = false
  return _connect(opts)
}

// Detect stream type by URL pattern first (fast), then header probe
function detectStreamType(url) {
  const lower = url.toLowerCase()

  // Fast path: URL pattern matching
  if (lower.includes('.m3u8') || lower.includes('type=m3u') || lower.includes('output=hls')) {
    return Promise.resolve({ contentType: 'application/x-mpegurl', streamType: 'LIVE' })
  }
  if (lower.includes('.mp4') || lower.includes('output=mp4')) {
    return Promise.resolve({ contentType: 'video/mp4', streamType: 'BUFFERED' })
  }
  if (lower.includes('.ts') || lower.includes('output=ts') || lower.includes('type=ts')) {
    return Promise.resolve({ contentType: 'video/mp2t', streamType: 'LIVE' })
  }

  // Probe headers for ambiguous URLs
  const fallback = { contentType: 'video/mp2t', streamType: 'LIVE' }
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? require('https') : require('http')
      const req = lib.request(url, {
        method: 'GET',
        timeout: 4000,
        rejectUnauthorized: false,
        headers: { Range: 'bytes=0-512' },
      }, (res) => {
        const ct = (res.headers['content-type'] || '').toLowerCase()
        res.destroy()
        if (ct.includes('mpegurl') || ct.includes('x-mpegurl')) {
          resolve({ contentType: 'application/x-mpegurl', streamType: 'LIVE' })
        } else if (ct.includes('mp4')) {
          resolve({ contentType: 'video/mp4', streamType: 'BUFFERED' })
        } else {
          resolve(fallback)
        }
      })
      req.on('error', () => resolve(fallback))
      req.on('timeout', () => { req.destroy(); resolve(fallback) })
      req.end()
    } catch {
      resolve(fallback)
    }
  })
}

function _connect({ host, port, url, title, aggressive }) {
  return new Promise(async (resolve, reject) => {
    // Clean up existing client
    if (activeClient) {
      clearReconnect()
      try { activeClient.close() } catch {}
      activeClient = null
    }

    // Start local proxy — Chromecast fetches from our machine instead of the IPTV server directly
    // This bypasses TLS cert issues and auth-in-URL problems
    const proxyUrl = await startStreamProxy(url, host)
    const castUrl = proxyUrl || url  // fall back to direct if proxy fails
    console.log('Cast URL:', proxyUrl ? `proxy → ${proxyUrl}` : `direct → ${url.slice(0, 80)}`)

    // Detect stream type before connecting so the Chromecast knows what to expect
    const { contentType, streamType } = await detectStreamType(url)
    console.log('Cast stream type:', contentType, streamType)

    const castv2 = require('castv2')
    const client = new castv2.Client()
    activeClient = client

    const timeout = setTimeout(() => {
      reject(new Error('Connection timed out'))
      try { client.close() } catch {}
    }, 20000)

    client.connect({ host, port: port || 8009 }, () => {
      const mkChan = (ns, dest = 'receiver-0') =>
        client.createChannel(CLIENT_ID, dest, ns, 'JSON')

      const conn = mkChan(CONN_NS)
      const hb   = mkChan(HB_NS)
      const recv = mkChan(RECEIVER_NS)

      conn.send({ type: 'CONNECT' })
      const hbTimer = setInterval(() => { try { hb.send({ type: 'PING' }) } catch {} }, 5000)
      client._hbTimer = hbTimer

      let reqId = 1
      let appLaunched = false

      recv.send({ type: 'LAUNCH', appId: DEFAULT_APP_ID, requestId: reqId++ })

      recv.on('message', (data) => {
        console.log('Receiver msg:', data.type, data.status?.applications?.[0]?.statusText)

        if (data.type === 'LAUNCH_ERROR') {
          clearTimeout(timeout)
          reject(new Error('Chromecast app failed to launch'))
          return
        }
        if (data.type !== 'RECEIVER_STATUS') return

        const appInfo = data.status?.applications?.[0]
        if (!appInfo || appInfo.appId !== DEFAULT_APP_ID || appLaunched) return
        appLaunched = true

        const dest = appInfo.transportId || appInfo.sessionId
        console.log('App launched, transport:', dest)

        const mconn = mkChan(CONN_NS, dest)
        const media = mkChan(MEDIA_NS, dest)

        mconn.send({ type: 'CONNECT' })

        // Small delay to let the media session establish before sending LOAD
        setTimeout(() => {
          const loadReqId = reqId++
          console.log('Sending LOAD, contentType:', contentType, 'url:', castUrl.slice(0, 80))
          media.send({
            type: 'LOAD',
            requestId: loadReqId,
            sessionId: appInfo.sessionId,
            media: {
              contentId: castUrl,
              contentType: castUrl.includes('.m3u8') ? 'application/x-mpegurl' : 'video/mp2t',
              streamType: 'LIVE',
              metadata: { type: 0, metadataType: 0, title: title || 'Vunches' },
            },
            autoplay: true,
            currentTime: 0,
            // Give the Chromecast more time to buffer before declaring failure
            activeTrackIds: [],
            repeatMode: 'REPEAT_OFF',
          })
        }, 1000) // 1s delay — wait for proxy to have data flowing before Chromecast connects

        client._media = media
        client._recv  = recv
        client._reqId = reqId

        let loadResolved = false
        media.on('message', (m) => {
          console.log('Media msg:', m.type, m.status?.[0]?.playerState, m.status?.[0]?.idleReason, m.detailedErrorCode || '')
          castWindow?.webContents.send('cast-media-status', m)

          if (!loadResolved && m.type === 'LOAD_FAILED') {
            loadResolved = true
            clearTimeout(timeout)
            currentCastOpts = null
            reject(new Error('Stream could not be loaded by the Chromecast. The TV may not be able to reach this URL directly.'))
            return
          }

          // Resolve once media confirms it's loading or playing
          if (!loadResolved && m.type === 'MEDIA_STATUS' && m.status?.[0]) {
            const ps = m.status[0].playerState
            if (ps === 'PLAYING' || ps === 'BUFFERING' || ps === 'PAUSED') {
              loadResolved = true
              hasPlayedSuccessfully = true  // mark that we had a real session
              clearTimeout(timeout)
              resolve({ ok: true })
            } else if (ps === 'IDLE' && m.status[0].idleReason === 'ERROR') {
              loadResolved = true
              clearTimeout(timeout)
              currentCastOpts = null
              reject(new Error('Stream failed to load on the Chromecast. The TV may not be able to reach this stream URL directly.'))
            }
          }
        })
      })
    })

    client.on('error', (e) => {
      clearTimeout(timeout)
      clearInterval(client._hbTimer)
      activeClient = null
      console.error('Cast client error:', e.message)
      castWindow?.webContents.send('cast-error', e.message)
      // Only retry if we had a successful play session — not on initial connect failure
      if (hasPlayedSuccessfully) {
        _handleDisconnect()
      } else {
        currentCastOpts = null
        reject(e)
      }
    })

    client.on('close', () => {
      clearInterval(client._hbTimer)
      if (activeClient === client) activeClient = null
      castWindow?.webContents.send('cast-disconnected')
      // Only retry if we had a real playing session drop
      if (hasPlayedSuccessfully) {
        _handleDisconnect()
      } else {
        currentCastOpts = null
      }
    })
  })
}

function _handleDisconnect() {
  clearReconnect()
  if (!currentCastOpts) return
  if (!currentCastOpts.aggressive) {
    currentCastOpts = null
    return
  }
  // Aggressive mode: retry after 3 seconds
  console.log('Cast disconnected — reconnecting in 3s (aggressive mode)')
  castWindow?.webContents.send('cast-reconnecting')
  reconnectTimer = setTimeout(() => {
    if (!currentCastOpts) return
    _connect(currentCastOpts)
      .then(() => castWindow?.webContents.send('cast-reconnected'))
      .catch((e) => {
        castWindow?.webContents.send('cast-error', e.message)
        _handleDisconnect() // keep retrying
      })
  }, 3000)
}

function sendMediaCmd(type, extra = {}) {
  if (!activeClient?._media) return false
  activeClient._media.send({ type, requestId: activeClient._reqId++, mediaSessionId: 1, ...extra })
  return true
}

function stopCast() {
  currentCastOpts = null
  hasPlayedSuccessfully = false
  clearReconnect()
  stopStreamProxy()
  sendMediaCmd('STOP')
  try { clearInterval(activeClient?._hbTimer); activeClient?.close() } catch {}
  activeClient = null
}

// ─── IPC: Cast ────────────────────────────────────────────────────────────────

function registerHandlers(win) {
  castWindow = win

  ipcMain.handle('cast-start-discovery', () => {
    startDiscovery(win)
    return discoveredDevices
  })
  ipcMain.handle('cast-stop-discovery', () => stopDiscovery())
  ipcMain.handle('cast-get-devices', () => discoveredDevices)

  ipcMain.handle('cast-play', async (_e, opts) => {
    try {
      await connectAndPlay(opts)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('cast-pause',  () => sendMediaCmd('PAUSE'))
  ipcMain.handle('cast-resume', () => sendMediaCmd('PLAY'))
  ipcMain.handle('cast-stop',   () => { stopCast(); return true })
  ipcMain.handle('cast-set-volume', (_e, level) => {
    if (!activeClient) return false
    const recv = activeClient.createChannel(CLIENT_ID, 'receiver-0', RECEIVER_NS, 'JSON')
    recv.send({ type: 'SET_VOLUME', volume: { level: Math.max(0, Math.min(1, level)) }, requestId: 99 })
    return true
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  await getStore()
  ensureFirewallRule()
  const win = createWindow()
  registerHandlers(win)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopDiscovery()
  stopCast()
  stopStreamProxy()
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Store ───────────────────────────────────────────────────────────────

ipcMain.handle('store-get',    async (_e, k)   => { const s = await getStore(); return s.get(k) })
ipcMain.handle('store-set',    async (_e, k, v) => { const s = await getStore(); s.set(k, v) })
ipcMain.handle('store-delete', async (_e, k)   => { const s = await getStore(); s.delete(k) })

// ─── IPC: Xtream Codes ────────────────────────────────────────────────────────

ipcMain.handle('xtream-fetch', async (_e, { host, username, password, action }) => {
  const baseUrl = host.replace(/\/$/, '')
  const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=${action}`
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http')
    const req = lib.get(url, { timeout: 30000, rejectUnauthorized: false }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode}`))
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
        catch { reject(new Error('Invalid JSON response from server')) }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
  })
})

ipcMain.handle('xtream-get-stream-url', (_e, { host, username, password, streamId, streamType }) => {
  const base = host.replace(/\/$/, '')
  // streamType: 'live' | 'movie' | 'series'
  const ext = streamType === 'live' ? 'ts' : 'mp4'
  return `${base}/${streamType}/${username}/${password}/${streamId}.${ext}`
})

// ─── IPC: Export / Import ─────────────────────────────────────────────────────

ipcMain.handle('export-data', async (event) => {
  const { dialog } = require('electron')
  const fs = require('fs')
  const win = BrowserWindow.fromWebContents(event.sender)
  const s = await getStore()

  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    sources: s.get('sources') || [],
    favorites: s.get('favorites') || [],
    epgUrl: s.get('epgUrl') || '',
    selectedDevice: s.get('selectedDevice') || null,
    aggressiveReconnect: s.get('aggressiveReconnect') || false,
  }

  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: 'Export Vunches Settings',
    defaultPath: `vunches-backup-${new Date().toISOString().slice(0,10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (canceled || !filePath) return { ok: false }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
  return { ok: true, filePath }
})

ipcMain.handle('import-data', async (event) => {
  const { dialog } = require('electron')
  const fs = require('fs')
  const win = BrowserWindow.fromWebContents(event.sender)

  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: 'Import Vunches Settings',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths.length) return { ok: false }

  try {
    const raw = fs.readFileSync(filePaths[0], 'utf8')
    const data = JSON.parse(raw)
    if (!data.version) throw new Error('Invalid backup file')
    const s = await getStore()
    if (data.sources?.length)   s.set('sources', data.sources)
    if (data.favorites?.length) s.set('favorites', data.favorites)
    if (data.epgUrl)            s.set('epgUrl', data.epgUrl)
    if (data.selectedDevice)    s.set('selectedDevice', data.selectedDevice)
    if (data.aggressiveReconnect != null) s.set('aggressiveReconnect', data.aggressiveReconnect)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ─── IPC: MPV ─────────────────────────────────────────────────────────────────

ipcMain.handle('play-stream', (_e, url, channelName) => {
  const MPV = 'C:\\Program Files\\MPV Player\\mpv.exe'
  const args = [
    url,
    `--title=${channelName || 'Vunches'}`,
    '--cache=yes', '--cache-secs=10', '--demuxer-max-bytes=50MiB',
    '--hwdec=auto', '--force-window=immediate', '--ontop=no', '--tls-verify=no',
  ]
  return new Promise((resolve) => {
    const proc = spawn(MPV, args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let errOut = ''
    proc.stderr.on('data', (d) => { errOut += d.toString() })
    const timer = setTimeout(() => { proc.stderr.destroy(); proc.unref(); resolve({ launched: true }) }, 3000)
    proc.on('error', (e) => { clearTimeout(timer); resolve({ launched: false, error: e.message }) })
    proc.on('close', (code) => { clearTimeout(timer); if (code !== 0) resolve({ launched: true, error: errOut || `exit code ${code}` }) })
  })
})

// ─── EPG URL Auto-detection ───────────────────────────────────────────────────

function detectEpgUrl(m3uUrl, m3uText) {
  // 1. Parse x-tvg-url from the M3U header line
  // e.g. #EXTM3U x-tvg-url="http://provider.com/epg.xml"
  if (m3uText) {
    const headerLine = m3uText.slice(0, 1000) // only check top of file
    const tvgUrl = headerLine.match(/x-tvg-url="([^"]+)"/i)?.[1]
      || headerLine.match(/url-tvg="([^"]+)"/i)?.[1]
    if (tvgUrl) return tvgUrl
  }

  // 2. Xtream Codes pattern: get.php?username=X&password=Y -> xmltv.php?username=X&password=Y
  if (m3uUrl.includes('get.php')) {
    return m3uUrl.replace('get.php', 'xmltv.php').replace(/&type=[^&]*/,'').replace(/&output=[^&]*/,'')
  }

  // 3. Common suffix patterns
  const base = m3uUrl.replace(/\?.*$/, '').replace(/\/(playlist|get|channels)\.m3u.*$/i, '')
  const candidates = [
    m3uUrl.replace(/\.m3u.*$/, '.xml'),
    m3uUrl.replace(/\.m3u.*$/, '.xml.gz'),
    base + '/epg.xml',
    base + '/epg.xml.gz',
    base + '/xmltv.php',
  ]
  return candidates[0] // return best guess; we'll probe them
}

ipcMain.handle('detect-epg-url', async (_e, m3uUrl) => {
  // Quick HEAD probe to check if a URL returns valid XML/gzip
  const probe = (url) => new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? require('https') : require('http')
      const req = lib.request(url, { method: 'HEAD', timeout: 5000, rejectUnauthorized: false }, (res) => {
        const ct = res.headers['content-type'] || ''
        const ok = res.statusCode >= 200 && res.statusCode < 300
          && (ct.includes('xml') || ct.includes('gzip') || ct.includes('octet') || url.endsWith('.gz'))
        resolve(ok ? url : null)
      })
      req.on('error', () => resolve(null))
      req.on('timeout', () => { req.destroy(); resolve(null) })
      req.end()
    } catch { resolve(null) }
  })

  // Build candidates in priority order
  const candidates = []

  // Xtream Codes
  if (m3uUrl.includes('get.php')) {
    const xmltvUrl = m3uUrl
      .replace('get.php', 'xmltv.php')
      .replace(/&type=[^&]*/g, '')
      .replace(/&output=[^&]*/g, '')
    candidates.push(xmltvUrl)
  }

  // Suffix-based guesses
  const bare = m3uUrl.replace(/\?.*$/, '')
  const base = bare.replace(/\/(get|playlist|channels|live|index)\.m3u[^/]*/i, '')
  candidates.push(
    bare.replace(/\.m3u[^?]*$/i, '.xml'),
    bare.replace(/\.m3u[^?]*$/i, '.xml.gz'),
    base + '/epg.xml.gz',
    base + '/epg.xml',
    base + '/xmltv.php',
  )

  // Probe all candidates in parallel
  const results = await Promise.all(candidates.map(probe))
  const found = results.find(r => r !== null) || null
  return found
})

// ─── IPC: Fetch URL (raw, used by settings validation) ───────────────────────

ipcMain.handle('fetch-url', (_e, url) => {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http')
    const doReq = (u, l) => {
      const req = l.get(u, { timeout: 30000, rejectUnauthorized: false }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location
          return doReq(loc, loc.startsWith('https') ? require('https') : require('http'))
        }
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode}`))
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        res.on('error', reject)
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
    }
    doReq(url, lib)
  })
})

// ─── IPC: Load Playlist (streaming fetch + parse with progress) ───────────────

function parseM3uIncremental(text) {
  const channels = []
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line.startsWith('#EXTINF')) { i++; continue }

    const tvgId    = line.match(/tvg-id="([^"]*)"/)?.[1]    || ''
    const tvgName  = line.match(/tvg-name="([^"]*)"/)?.[1]  || ''
    const tvgLogo  = line.match(/tvg-logo="([^"]*)"/)?.[1]  || ''
    const groupTitle = line.match(/group-title="([^"]*)"/)?.[1] || ''
    const commaIdx = line.lastIndexOf(',')
    const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : tvgName || 'Unknown'

    let url = ''
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim()
      if (next && !next.startsWith('#')) { url = next; i = j; break }
    }
    if (url) {
      channels.push({
        id: `${tvgId || name}-${url}`,
        name: name || tvgName || 'Unknown Channel',
        url, tvgId, tvgLogo,
        group: { title: groupTitle },
      })
    }
    i++
  }
  return channels
}

ipcMain.handle('load-playlist', (event, url) => {
  const path = require('path')
  const fs   = require('fs')
  const win  = BrowserWindow.fromWebContents(event.sender)

  const cacheDir  = app.getPath('userData')
  const cacheFile = path.join(cacheDir, 'playlist-cache.json')
  const metaFile  = path.join(cacheDir, 'playlist-meta.json')

  const sendProgress = (data) => {
    try { win?.webContents.send('playlist-progress', data) } catch {}
  }

  return new Promise((resolve, reject) => {
    // ── Check cache first ──────────────────────────────────────────────────
    let cachedMeta = null
    try { cachedMeta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) } catch {}

    const lib = url.startsWith('https') ? require('https') : require('http')

    const doReq = (reqUrl, reqLib) => {
      const reqOpts = {
        timeout: 60000,
        rejectUnauthorized: false,
        headers: cachedMeta?.etag ? { 'If-None-Match': cachedMeta.etag } : {},
      }

      const req = reqLib.get(reqUrl, reqOpts, (res) => {
        // Redirect
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location
          return doReq(loc, loc.startsWith('https') ? require('https') : require('http'))
        }

        // 304 Not Modified — serve from cache
        if (res.statusCode === 304 && cachedMeta) {
          sendProgress({ stage: 'cache', message: 'Using cached playlist' })
          try {
            const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
            sendProgress({ stage: 'done', channelCount: cached.length, tvgUrl: cachedMeta.tvgUrl || null })
            return resolve({ channels: cached, tvgUrl: cachedMeta.tvgUrl || null })
          } catch {}
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`))
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
        const etag = res.headers['etag'] || null
        let receivedBytes = 0
        let buffer = ''
        let channelCount = 0
        const chunks = []

        sendProgress({ stage: 'downloading', receivedBytes: 0, totalBytes, channelCount: 0 })

        res.on('data', (chunk) => {
          chunks.push(chunk)
          receivedBytes += chunk.length
          buffer += chunk.toString('utf8')

          // Count #EXTINF lines seen so far for a live channel count
          const matches = buffer.match(/#EXTINF/g)
          const newCount = matches ? matches.length : 0
          if (newCount !== channelCount) {
            channelCount = newCount
            sendProgress({ stage: 'downloading', receivedBytes, totalBytes, channelCount })
          }

          // Keep buffer from growing unbounded — only keep last 2kb for counting
          if (buffer.length > 100000) buffer = buffer.slice(-2000)
        })

        res.on('end', () => {
          sendProgress({ stage: 'parsing', receivedBytes, totalBytes, channelCount })
          const fullText = Buffer.concat(chunks).toString('utf8')

          // Extract x-tvg-url from M3U header
          const headerSnip = fullText.slice(0, 2000)
          const tvgUrl = headerSnip.match(/x-tvg-url="([^"]+)"/i)?.[1]
            || headerSnip.match(/url-tvg="([^"]+)"/i)?.[1]
            || null

          // Parse in next tick so progress event renders first
          setImmediate(() => {
            try {
              const channels = parseM3uIncremental(fullText)
              sendProgress({ stage: 'done', channelCount: channels.length, tvgUrl })

              // Write cache
              try {
                fs.writeFileSync(cacheFile, JSON.stringify(channels))
                fs.writeFileSync(metaFile, JSON.stringify({ etag, url, cachedAt: Date.now(), tvgUrl }))
              } catch {}

              resolve({ channels, tvgUrl })
            } catch (e) {
              reject(e)
            }
          })
        })

        res.on('error', reject)
      })

      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
    }

    // Try loading from cache immediately while fetching in background
    if (cachedMeta?.url === url) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
        if (cached?.length > 0) {
          sendProgress({ stage: 'cache', message: `Loaded ${cached.length.toLocaleString()} channels from cache`, channelCount: cached.length, tvgUrl: cachedMeta.tvgUrl || null })
          resolve({ channels: cached, tvgUrl: cachedMeta.tvgUrl || null })
          setTimeout(() => {
            try { doReq(url, lib) } catch {}
          }, 1000)
          return
        }
      } catch {}
    }

    doReq(url, lib)
  })
})

// ─── IPC: Load EPG (XMLTV) ────────────────────────────────────────────────────

ipcMain.handle('load-epg', (event, url) => {
  const path = require('path')
  const fs   = require('fs')
  const zlib = require('zlib')
  const win  = BrowserWindow.fromWebContents(event.sender)

  const cacheFile = path.join(app.getPath('userData'), 'epg-cache.json')
  const metaFile  = path.join(app.getPath('userData'), 'epg-meta.json')

  const sendProgress = (data) => {
    try { win?.webContents.send('epg-progress', data) } catch {}
  }

  return new Promise((resolve, reject) => {
    let cachedMeta = null
    try { cachedMeta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) } catch {}

    const lib = url.startsWith('https') ? require('https') : require('http')

    const doReq = (reqUrl, reqLib) => {
      const reqOpts = {
        timeout: 120000,
        rejectUnauthorized: false,
        headers: cachedMeta?.etag ? { 'If-None-Match': cachedMeta.etag } : {},
      }

      const req = reqLib.get(reqUrl, reqOpts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location
          return doReq(loc, loc.startsWith('https') ? require('https') : require('http'))
        }
        if (res.statusCode === 304 && cachedMeta) {
          sendProgress({ stage: 'cache', message: 'EPG up to date' })
          try {
            const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
            return resolve(cached)
          } catch {}
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`))
        }

        const isGzip = res.headers['content-encoding'] === 'gzip' || reqUrl.endsWith('.gz')
        const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
        const etag = res.headers['etag'] || null
        let receivedBytes = 0

        sendProgress({ stage: 'downloading', receivedBytes: 0, totalBytes })

        const chunks = []
        const dataStream = isGzip ? res.pipe(zlib.createGunzip()) : res

        res.on('data', (chunk) => {
          receivedBytes += chunk.length
          sendProgress({ stage: 'downloading', receivedBytes, totalBytes })
        })

        dataStream.on('data', (chunk) => chunks.push(chunk))
        dataStream.on('end', () => {
          sendProgress({ stage: 'parsing' })
          const xml = Buffer.concat(chunks).toString('utf8')
          setImmediate(() => {
            try {
              const epg = parseXmltvFast(xml)
              const channelCount = Object.keys(epg).length
              sendProgress({ stage: 'done', channelCount })
              try {
                fs.writeFileSync(cacheFile, JSON.stringify(epg))
                fs.writeFileSync(metaFile, JSON.stringify({ etag, url, cachedAt: Date.now() }))
              } catch {}
              resolve(epg)
            } catch (e) { reject(e) }
          })
        })
        dataStream.on('error', reject)
        res.on('error', reject)
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('EPG request timed out')) })
    }

    // Serve cache immediately then background-refresh
    if (cachedMeta?.url === url) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
        if (cached && Object.keys(cached).length > 0) {
          sendProgress({ stage: 'cache', channelCount: Object.keys(cached).length })
          resolve(cached)
          setTimeout(() => { try { doReq(url, lib) } catch {} }, 1500)
          return
        }
      } catch {}
    }

    doReq(url, lib)
  })
})

function parseXmltvFast(xml) {
  const epg = {}

  // Channels
  const chanRe = /<channel\s+id="([^"]+)"[^>]*>/g
  let m
  while ((m = chanRe.exec(xml)) !== null) {
    const id = m[1].trim()
    if (!epg[id]) epg[id] = []
  }

  // Programmes
  const progRe = /<programme\s[^>]*start="([^"]+)"[^>]*stop="([^"]+)"[^>]*channel="([^"]+)"[^>]*>([\s\S]*?)<\/programme>/g
  const titleRe = /<title[^>]*>([^<]+)<\/title>/
  const descRe  = /<desc[^>]*>([^<]+)<\/desc>/

  while ((m = progRe.exec(xml)) !== null) {
    const start   = parseXmltvDate(m[1])
    const stop    = parseXmltvDate(m[2])
    const channel = m[3].trim()
    const inner   = m[4]
    const title   = (titleRe.exec(inner) || [])[1]?.trim() || ''
    const desc    = (descRe.exec(inner)  || [])[1]?.trim() || ''
    if (!epg[channel]) epg[channel] = []
    epg[channel].push({ title, desc, start, stop })
  }

  for (const id of Object.keys(epg)) {
    epg[id].sort((a, b) => a.start - b.start)
  }
  return epg
}

function parseXmltvDate(str) {
  const s    = str.trim()
  const base = s.slice(0, 14)
  const tz   = s.slice(15).trim() || '+0000'
  const year = +base.slice(0,4), month = +base.slice(4,6), day = +base.slice(6,8)
  const h    = +base.slice(8,10), min   = +base.slice(10,12), sec = +base.slice(12,14)
  const tzSign = tz[0] === '-' ? -1 : 1
  const tzH = parseInt(tz.slice(1,3),10), tzM = parseInt(tz.slice(3,5),10)
  return Date.UTC(year, month-1, day, h, min, sec) - tzSign*(tzH*60+tzM)*60000
}
