const { app, BrowserWindow, ipcMain } = require('electron')
const { join } = require('path')

const config = require('../shared/config')
const { MdnsDiscovery } = require('../shared/mdns')
const { HlsProxy, ensureFirewallRule } = require('../shared/hls-proxy')
const { CastClient } = require('../shared/cast-client')
const { playStream } = require('../shared/mpv')
const { fetchM3u, detectEpgUrl, fetchXtream, getXtreamStreamUrl } = require('../shared/playlist')
const { fetchEpg } = require('../shared/epg')
const { fetchAllCatalogs, loadAllCatalogs, searchAllCatalogs, fetchAllMeta, fetchAllStreams } = require('../shared/stremio-client')
const { TorrentManager } = require('../shared/torrent-manager')

const mdns = new MdnsDiscovery()
const hlsProxy = new HlsProxy()
const cast = new CastClient({ hlsProxy })
const torrent = new TorrentManager()

let win = null
let discoveredDevices = []

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
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

// ─── mDNS Discovery → IPC ─────────────────────────────────────────────────────

mdns.on('device', (device) => {
  discoveredDevices = mdns.getDevices()
  win?.webContents.send('cast-devices-updated', discoveredDevices)
})

mdns.on('error', (e) => {
  console.error('mDNS error:', e.message)
})

// ─── Cast Client → IPC ────────────────────────────────────────────────────────

cast.on('status', (status) => {
  win?.webContents.send('cast-media-status', status)
})

cast.on('error', (message) => {
  win?.webContents.send('cast-error', message)
})

cast.on('disconnected', () => {
  win?.webContents.send('cast-disconnected')
})

cast.on('reconnecting', () => {
  win?.webContents.send('cast-reconnecting')
})

cast.on('reconnected', () => {
  win?.webContents.send('cast-reconnected')
})

// ─── IPC: Store (via shared config) ───────────────────────────────────────────

ipcMain.handle('store-get', (_e, k) => config.get(k))
ipcMain.handle('store-set', (_e, k, v) => { config.set(k, v) })
ipcMain.handle('store-delete', (_e, k) => { config.delete(k) })

// ─── IPC: Cast ────────────────────────────────────────────────────────────────

ipcMain.handle('cast-start-discovery', () => {
  mdns.start()
  return discoveredDevices
})
ipcMain.handle('cast-stop-discovery', () => mdns.stop())
ipcMain.handle('cast-get-devices', () => mdns.getDevices())

ipcMain.handle('cast-play', async (_e, opts) => {
  try {
    await cast.play(opts)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('cast-pause', () => cast.pause())
ipcMain.handle('cast-resume', () => cast.resume())
ipcMain.handle('cast-stop', () => { cast.stop(); return true })
ipcMain.handle('cast-set-volume', (_e, level) => cast.setVolume(level))

// ─── IPC: MPV ─────────────────────────────────────────────────────────────────

ipcMain.handle('play-stream', (_e, url, name) => playStream(url, name))

// ─── IPC: Xtream Codes ────────────────────────────────────────────────────────

ipcMain.handle('xtream-fetch', async (_e, opts) => fetchXtream(opts))
ipcMain.handle('xtream-get-stream-url', (_e, opts) => getXtreamStreamUrl(opts))

// ─── IPC: Export / Import ─────────────────────────────────────────────────────

ipcMain.handle('export-data', async (event) => {
  const { dialog } = require('electron')
  const fs = require('fs')
  const w = BrowserWindow.fromWebContents(event.sender)

  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    sources: config.get('sources') || [],
    favorites: config.get('favorites') || [],
    epgUrl: config.get('epgUrl') || '',
    selectedDevice: config.get('selectedDevice') || null,
    aggressiveReconnect: config.get('aggressiveReconnect') || false,
  }

  const { filePath, canceled } = await dialog.showSaveDialog(w, {
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
  const w = BrowserWindow.fromWebContents(event.sender)

  const { filePaths, canceled } = await dialog.showOpenDialog(w, {
    title: 'Import Vunches Settings',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths.length) return { ok: false }

  try {
    const raw = fs.readFileSync(filePaths[0], 'utf8')
    const data = JSON.parse(raw)
    if (!data.version) throw new Error('Invalid backup file')
    if (data.sources?.length)   config.set('sources', data.sources)
    if (data.favorites?.length) config.set('favorites', data.favorites)
    if (data.epgUrl)            config.set('epgUrl', data.epgUrl)
    if (data.selectedDevice)    config.set('selectedDevice', data.selectedDevice)
    if (data.aggressiveReconnect != null) config.set('aggressiveReconnect', data.aggressiveReconnect)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ─── IPC: Fetch URL ────────────────────────────────────────────────────────────

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

// ─── IPC: Load Playlist ──────────────────────────────────────────────────────

ipcMain.handle('load-playlist', (event, url) => {
  const w = BrowserWindow.fromWebContents(event.sender)
  const cacheDir = app.getPath('userData')

  const sendProgress = (data) => {
    try { w?.webContents.send('playlist-progress', data) } catch {}
  }

  return fetchM3u(url, { cacheDir, onProgress: sendProgress })
    .then(result => ({ channels: result.channels, tvgUrl: result.tvgUrl }))
})

// ─── IPC: Load EPG ────────────────────────────────────────────────────────────

ipcMain.handle('load-epg', (event, url) => {
  const w = BrowserWindow.fromWebContents(event.sender)
  const cacheDir = app.getPath('userData')

  const sendProgress = (data) => {
    try { w?.webContents.send('epg-progress', data) } catch {}
  }

  return fetchEpg(url, { cacheDir, onProgress: sendProgress })
})

// ─── EPG URL Auto-detection ───────────────────────────────────────────────────

ipcMain.handle('detect-epg-url', async (_e, m3uUrl) => detectEpgUrl(m3uUrl))

// ─── IPC: Stremio ──────────────────────────────────────────────────────────────

ipcMain.handle('stremio-load-all', async (_e, { addonUrls, types }) => {
  try {
    return await loadAllCatalogs(addonUrls, types)
  } catch (e) {
    return { metas: [], error: e.message }
  }
})

ipcMain.handle('stremio-load-catalog', async (_e, { addonUrls, type, catalogId, skip }) => {
  try {
    return await fetchAllCatalogs(addonUrls, type, catalogId, { skip })
  } catch (e) {
    return { metas: [], hasMore: false, error: e.message }
  }
})

ipcMain.handle('stremio-search', async (_e, { addonUrls, query, types }) => {
  try {
    return await searchAllCatalogs(addonUrls, query, types)
  } catch (e) {
    return { metas: [], error: e.message }
  }
})

ipcMain.handle('stremio-get-meta', async (_e, { addonUrls, type, id }) => {
  try {
    return await fetchAllMeta(addonUrls, type, id)
  } catch (e) {
    return { meta: null, error: e.message }
  }
})

ipcMain.handle('stremio-get-streams', async (_e, { addonUrls, type, id }) => {
  try {
    return await fetchAllStreams(addonUrls, type, id)
  } catch (e) {
    return { streams: [], error: e.message }
  }
})

// ─── IPC: Torrent ──────────────────────────────────────────────────────────────

ipcMain.handle('torrent-create-stream', async (_e, { infoHash, fileIdx }) => {
  try {
    const result = await torrent.createStream(infoHash, fileIdx)
    return { ok: true, url: result.url }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('torrent-destroy-stream', (_e, { url }) => {
  torrent.destroyStream(url)
  return true
})

ipcMain.handle('torrent-destroy-info-hash', (_e, { infoHash }) => {
  torrent.destroyStreamByInfoHash(infoHash)
  return true
})

ipcMain.handle('torrent-status', () => torrent.status())

torrent.on('progress', (status) => {
  win?.webContents.send('torrent-progress', status)
})

torrent.on('streamError', (err) => {
  win?.webContents.send('torrent-error', err)
})

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  ensureFirewallRule()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  mdns.stop()
  cast.stop()
  hlsProxy.stop()
  torrent.destroy()
  if (process.platform !== 'darwin') app.quit()
})
