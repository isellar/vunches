const path = require('path')
const fs = require('fs')
const config = require('./config')

// mDNS/UDP multicast is lossy — a single short discovery burst can miss real
// devices. This cache lets the CLI reuse whatever the GUI (or `vunches daemon`)
// has already discovered instead of re-scanning cold on every invocation.
const DEFAULT_TTL_MS = 45000

function getCachePath() {
  const dir = config.getDataDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'devices.json')
}

function readCache() {
  try {
    const data = JSON.parse(fs.readFileSync(getCachePath(), 'utf8'))
    if (!data || !Array.isArray(data.devices) || typeof data.updatedAt !== 'number') return null
    return data
  } catch {
    return null
  }
}

function writeCache(devices) {
  const data = { devices, updatedAt: Date.now() }
  try {
    fs.writeFileSync(getCachePath(), JSON.stringify(data, null, 2))
  } catch {}
  return data
}

function isFresh(cache, ttlMs = DEFAULT_TTL_MS) {
  return !!cache && Array.isArray(cache.devices) && cache.devices.length > 0 &&
    (Date.now() - cache.updatedAt) < ttlMs
}

module.exports = { getCachePath, readCache, writeCache, isFresh, DEFAULT_TTL_MS }
