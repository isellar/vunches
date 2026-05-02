const { app, BrowserWindow, ipcMain, shell } = require('electron')
const { join } = require('path')
const { spawn } = require('child_process')

let Store
async function getStore() {
  if (!Store) {
    const mod = await import('electron-store')
    Store = mod.default
  }
  return Store
}

let store

async function getStoreInstance() {
  const S = await getStore()
  if (!store) store = new S()
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
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  await getStoreInstance()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// --- IPC: persistent store ---
ipcMain.handle('store-get', async (_e, key) => {
  const s = await getStoreInstance()
  return s.get(key)
})
ipcMain.handle('store-set', async (_e, key, value) => {
  const s = await getStoreInstance()
  s.set(key, value)
})
ipcMain.handle('store-delete', async (_e, key) => {
  const s = await getStoreInstance()
  s.delete(key)
})

// --- IPC: play stream via mpv ---
ipcMain.handle('play-stream', (_e, url, channelName) => {
  const mpvPaths = [
    'mpv',
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

  if (!launched) {
    shell.openExternal(url)
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
