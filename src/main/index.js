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
  const mpvPaths = [
    'mpv',
    'C:\\Program Files\\MPV Player\\mpv.exe',
    'C:\\Program Files\\mpv\\mpv.exe',
    'C:\\Program Files (x86)\\mpv\\mpv.exe',
    join(app.getPath('userData'), 'mpv', 'mpv.exe'),
  ]

  let launched = false
  for (const mpvPath of mpvPaths) {
    try {
      const args = [
        url,
        `--title=${channelName || 'Vunches'}`,
        '--cache=yes',
        '--cache-secs=10',
        '--demuxer-max-bytes=50MiB',
        '--hwdec=auto',
        '--force-window=yes',
      ]
      const proc = spawn(mpvPath, args, {
        detached: true,
        stdio: 'ignore',
        shell: mpvPath === 'mpv',
      })
      proc.unref()
      launched = true
      break
    } catch {
      continue
    }
  }

  return { launched }
})

// --- IPC: fetch M3U (bypass CORS) ---
ipcMain.handle('fetch-url', async (_e, url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  return text
})
