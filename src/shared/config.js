const path = require('path')
const fs   = require('fs')

function getDataDir() {
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(process.env.USERPROFILE || '~', 'AppData', 'Roaming')
    return path.join(appdata, 'vunches')
  }
  if (process.platform === 'darwin') {
    return path.join(process.env.HOME || '~', 'Library', 'Application Support', 'vunches')
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || '~', '.config'), 'vunches')
}

function getConfigPath() {
  const dir = getDataDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'config.json')
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeConfig(data) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(data, null, 2))
}

function get(key) {
  return readConfig()[key]
}

function set(key, value) {
  const cfg = readConfig()
  cfg[key] = value
  writeConfig(cfg)
}

function remove(key) {
  const cfg = readConfig()
  delete cfg[key]
  writeConfig(cfg)
}

function getAll() {
  return readConfig()
}

module.exports = { get, set, delete: remove, getAll, getDataDir, getConfigPath }
