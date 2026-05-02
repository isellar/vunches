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

function parseFriendlyName(msg) {
  // Extract fn= from TXT record in the mDNS response
  const str = msg.toString('binary')
  const fnMatch = str.match(/fn=([^\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f]+)/)
  if (fnMatch) return fnMatch[1].replace(/[^\x20-\x7e]/g, '').trim()

  // Fallback: extract first readable label from PTR response
  const readable = []
  let i = 12
  while (i < str.length) {
    const len = str.charCodeAt(i)
    if (len === 0 || len > 63) break
    const label = str.slice(i + 1, i + 1 + len).replace(/[^\x20-\x7e]/g, '')
    if (label && !label.startsWith('_')) readable.push(label)
    i += 1 + len
  }
  return readable[0] || null
}

function startDiscovery(win) {
  castWindow = win
  discoveredDevices = []

  // Close existing socket
  if (mdnsSocket) {
    try { mdnsSocket.close() } catch {}
    mdnsSocket = null
  }
  if (discoveryInterval) {
    clearInterval(discoveryInterval)
    discoveryInterval = null
  }

  const interfaces = getLocalInterfaces()
  if (!interfaces.length) return

  // Prefer Wi-Fi / non-VPN interface (largest subnet = most local)
  // Filter out likely VPN ranges (10.x when there's also a 192.168.x)
  const hasLocal = interfaces.some(ip => ip.startsWith('192.168.') || ip.startsWith('10.0.'))
  const bindAddr = interfaces.find(ip => ip.startsWith('192.168.'))
    || interfaces.find(ip => ip.startsWith('10.0.'))
    || interfaces[0]

  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  mdnsSocket = sock

  sock.on('error', (e) => console.error('mDNS socket error:', e.message))

  sock.on('message', (msg, rinfo) => {
    const srcIp = rinfo.address
    // Ignore our own machine's responses (check all interfaces, cached)
    if (_localIPs().includes(srcIp)) return
    if (discoveredDevices.find(d => d.host === srcIp)) return

    const name = parseFriendlyName(msg) || `Chromecast (${srcIp})`
    discoveredDevices.push({ name, host: srcIp, port: 8009 })
    console.log('Discovered Chromecast:', name, srcIp)
    castWindow?.webContents.send('cast-devices-updated', discoveredDevices)
  })

  sock.bind(MDNS_PORT, () => {
    try {
      sock.addMembership(MDNS_ADDR, bindAddr)
      sock.setMulticastInterface(bindAddr)
    } catch (e) {
      console.error('mDNS membership error:', e.message)
    }

    // Send query immediately and every 10s
    const sendQuery = () => {
      sock.send(CAST_QUERY, MDNS_PORT, MDNS_ADDR, (e) => {
        if (e) console.error('mDNS query error:', e.message)
      })
    }
    sendQuery()
    discoveryInterval = setInterval(sendQuery, 10000)
  })
}

function stopDiscovery() {
  if (discoveryInterval) { clearInterval(discoveryInterval); discoveryInterval = null }
  if (mdnsSocket) { try { mdnsSocket.close() } catch {}; mdnsSocket = null }
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

function connectAndPlay(opts) {
  currentCastOpts = opts
  return _connect(opts)
}

function _connect({ host, port, url, title, aggressive }) {
  return new Promise((resolve, reject) => {
    // Clean up existing client
    if (activeClient) {
      clearReconnect()
      try { activeClient.close() } catch {}
      activeClient = null
    }

    const castv2 = require('castv2')
    const client = new castv2.Client()
    activeClient = client

    const timeout = setTimeout(() => {
      reject(new Error('Connection timed out'))
      try { client.close() } catch {}
    }, 10000)

    client.connect({ host, port: port || 8009 }, () => {
      clearTimeout(timeout)

      const mkChan = (ns, dest = 'receiver-0') =>
        client.createChannel(CLIENT_ID, dest, ns, 'JSON')

      const conn = mkChan(CONN_NS)
      const hb   = mkChan(HB_NS)
      const recv = mkChan(RECEIVER_NS)

      conn.send({ type: 'CONNECT' })
      const hbTimer = setInterval(() => { try { hb.send({ type: 'PING' }) } catch {} }, 5000)
      client._hbTimer = hbTimer

      let reqId = 1
      recv.send({ type: 'LAUNCH', appId: DEFAULT_APP_ID, requestId: reqId++ })

      let resolved = false

      recv.on('message', (data) => {
        if (data.type === 'LAUNCH_ERROR') {
          if (!resolved) { resolved = true; clearTimeout(timeout); reject(new Error('Launch failed')) }
          return
        }
        if (data.type !== 'RECEIVER_STATUS') return
        const appInfo = data.status?.applications?.[0]
        if (!appInfo || appInfo.appId !== DEFAULT_APP_ID) return
        if (resolved) return
        resolved = true

        const dest = appInfo.transportId || appInfo.sessionId
        const mconn = mkChan(CONN_NS, dest)
        const media = mkChan(MEDIA_NS, dest)

        mconn.send({ type: 'CONNECT' })
        media.send({
          type: 'LOAD',
          requestId: reqId++,
          sessionId: appInfo.sessionId,
          media: {
            contentId: url,
            contentType: 'video/mp2t',
            streamType: 'LIVE',
            metadata: { type: 0, metadataType: 0, title: title || 'Vunches' },
          },
          autoplay: true,
          currentTime: 0,
        })

        client._media  = media
        client._recv   = recv
        client._reqId  = reqId

        media.on('message', (m) => {
          castWindow?.webContents.send('cast-media-status', m)
        })

        resolve({ ok: true })
      })
    })

    client.on('error', (e) => {
      clearTimeout(timeout)
      clearInterval(client._hbTimer)
      activeClient = null
      castWindow?.webContents.send('cast-error', e.message)
      _handleDisconnect()
      if (!currentCastOpts) reject(e)
    })

    client.on('close', () => {
      clearInterval(client._hbTimer)
      if (activeClient === client) activeClient = null
      castWindow?.webContents.send('cast-disconnected')
      _handleDisconnect()
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
  clearReconnect()
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
  const win = createWindow()
  registerHandlers(win)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopDiscovery()
  stopCast()
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
