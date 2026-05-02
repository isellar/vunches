const { app, BrowserWindow, ipcMain } = require('electron')
const { join } = require('path')
const { spawn } = require('child_process')

let store

async function getStore() {
  if (!store) {
    const { default: Store } = await import('electron-store')
    store = new Store()
  }
  return store
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f0f0f',
      symbolColor: '#ffffff',
      height: 40,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // electron-vite sets ELECTRON_RENDERER_URL in dev mode
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await getStore()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// --- IPC: persistent store ---
ipcMain.handle('store-get', async (_e, key) => {
  const s = await getStore()
  return s.get(key)
})
ipcMain.handle('store-set', async (_e, key, value) => {
  const s = await getStore()
  s.set(key, value)
})
ipcMain.handle('store-delete', async (_e, key) => {
  const s = await getStore()
  s.delete(key)
})

// --- IPC: play stream via mpv ---
ipcMain.handle('play-stream', (_e, url, channelName) => {
  const MPV = 'C:\\Program Files\\MPV Player\\mpv.exe'

  const args = [
    url,
    `--title=${channelName || 'Vunches'}`,
    '--cache=yes',
    '--cache-secs=10',
    '--demuxer-max-bytes=50MiB',
    '--hwdec=auto',
    '--force-window=immediate',
    '--ontop=no',
  ]

  return new Promise((resolve) => {
    const proc = spawn(MPV, args, {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    // Capture stderr briefly to surface any mpv errors
    let errOut = ''
    proc.stderr.on('data', (d) => { errOut += d.toString() })

    // Give mpv 3 seconds to either error out or start successfully
    const timer = setTimeout(() => {
      proc.stderr.destroy()
      proc.unref()
      resolve({ launched: true })
    }, 3000)

    proc.on('error', (e) => {
      clearTimeout(timer)
      console.error('mpv spawn error:', e.message)
      resolve({ launched: false, error: e.message })
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        console.error('mpv exited with code', code, errOut)
        // code 2 = bad stream/URL; launched=true so we don't show the mpv banner,
        // but error is set so the renderer can mark the stream dead
        resolve({ launched: true, error: errOut || `exit code ${code}` })
      }
    })
  })
})

// --- IPC: fetch M3U (bypass CORS) ---
ipcMain.handle('fetch-url', (_e, url) => {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http')
    const request = lib.get(url, { timeout: 30000 }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        ipcMain.emit('fetch-url', null, res.headers.location)
        const lib2 = res.headers.location.startsWith('https') ? require('https') : require('http')
        lib2.get(res.headers.location, { timeout: 30000 }, (res2) => {
          const chunks = []
          res2.on('data', (c) => chunks.push(c))
          res2.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
          res2.on('error', reject)
        }).on('error', reject)
        return
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      res.on('error', reject)
    })
    request.on('error', reject)
    request.on('timeout', () => { request.destroy(); reject(new Error('Request timed out')) })
  })
})
