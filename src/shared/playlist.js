const fs = require('fs')
const path = require('path')

function parseM3u(text) {
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

function extractEpgUrlFromM3u(text) {
  const headerSnip = text.slice(0, 2000)
  return headerSnip.match(/x-tvg-url="([^"]+)"/i)?.[1]
    || headerSnip.match(/url-tvg="([^"]+)"/i)?.[1]
    || null
}

function fetchM3u(url, { signal, onProgress, cacheDir } = {}) {
  const cacheFile = cacheDir ? path.join(cacheDir, 'playlist-cache.json') : null
  const metaFile  = cacheDir ? path.join(cacheDir, 'playlist-meta.json') : null

  return new Promise((resolve, reject) => {
    let cachedMeta = null
    if (metaFile) {
      try { cachedMeta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) } catch {}
    }

    const lib = url.startsWith('https') ? require('https') : require('http')

    const doReq = (reqUrl, reqLib) => {
      const reqOpts = {
        timeout: 60000,
        rejectUnauthorized: false,
        headers: cachedMeta?.etag ? { 'If-None-Match': cachedMeta.etag } : {},
      }

      const req = reqLib.get(reqUrl, reqOpts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location
          return doReq(loc, loc.startsWith('https') ? require('https') : require('http'))
        }

        if (res.statusCode === 304 && cachedMeta) {
          onProgress?.({ stage: 'cache', message: 'Using cached playlist' })
          try {
            const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
            const tvgUrl = cachedMeta.tvgUrl || null
            onProgress?.({ stage: 'done', channelCount: cached.length, tvgUrl })
            return resolve({ channels: cached, tvgUrl })
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

        onProgress?.({ stage: 'downloading', receivedBytes: 0, totalBytes, channelCount: 0 })

        res.on('data', (chunk) => {
          chunks.push(chunk)
          receivedBytes += chunk.length
          buffer += chunk.toString('utf8')

          const matches = buffer.match(/#EXTINF/g)
          const newCount = matches ? matches.length : 0
          if (newCount !== channelCount) {
            channelCount = newCount
            onProgress?.({ stage: 'downloading', receivedBytes, totalBytes, channelCount })
          }

          if (buffer.length > 100000) buffer = buffer.slice(-2000)
        })

        res.on('end', () => {
          onProgress?.({ stage: 'parsing', receivedBytes, totalBytes, channelCount })
          const fullText = Buffer.concat(chunks).toString('utf8')

          const tvgUrl = extractEpgUrlFromM3u(fullText)

          setImmediate(() => {
            const channels = parseM3u(fullText)
            onProgress?.({ stage: 'done', channelCount: channels.length, tvgUrl })

            if (cacheFile) {
              try {
                fs.writeFileSync(cacheFile, JSON.stringify(channels))
                fs.writeFileSync(metaFile, JSON.stringify({ etag, url, cachedAt: Date.now(), tvgUrl }))
              } catch {}
            }

            resolve({ channels, tvgUrl })
          })
        })

        res.on('error', reject)
      })

      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
    }

    if (cachedMeta?.url === url && cacheFile) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
        if (cached?.length > 0) {
          onProgress?.({ stage: 'cache', message: `Loaded ${cached.length.toLocaleString()} channels from cache`, channelCount: cached.length, tvgUrl: cachedMeta.tvgUrl || null })
          resolve({ channels: cached, tvgUrl: cachedMeta.tvgUrl || null })
          setTimeout(() => { try { doReq(url, lib) } catch {} }, 1000)
          return
        }
      } catch {}
    }

    doReq(url, lib)
  })
}

function fetchXtream({ host, username, password, action }) {
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
}

function getXtreamStreamUrl({ host, username, password, streamId, streamType }) {
  const base = host.replace(/\/$/, '')
  const ext = streamType === 'live' ? 'ts' : 'mp4'
  return `${base}/${streamType}/${username}/${password}/${streamId}.${ext}`
}

function detectEpgUrl(m3uUrl) {
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

  const candidates = []

  if (m3uUrl.includes('get.php')) {
    const xmltvUrl = m3uUrl
      .replace('get.php', 'xmltv.php')
      .replace(/&type=[^&]*/g, '')
      .replace(/&output=[^&]*/g, '')
    candidates.push(xmltvUrl)
  }

  const bare = m3uUrl.replace(/\?.*$/, '')
  const base = bare.replace(/\/(get|playlist|channels|live|index)\.m3u[^/]*/i, '')
  candidates.push(
    bare.replace(/\.m3u[^?]*$/i, '.xml'),
    bare.replace(/\.m3u[^?]*$/i, '.xml.gz'),
    base + '/epg.xml.gz',
    base + '/epg.xml',
    base + '/xmltv.php',
  )

  return Promise.all(candidates.map(probe)).then(results => results.find(r => r !== null) || null)
}

function detectEpgUrlFromText(m3uUrl, m3uText) {
  if (m3uText) {
    const headerLine = m3uText.slice(0, 1000)
    const tvgUrl = headerLine.match(/x-tvg-url="([^"]+)"/i)?.[1]
      || headerLine.match(/url-tvg="([^"]+)"/i)?.[1]
    if (tvgUrl) return tvgUrl
  }

  if (m3uUrl.includes('get.php')) {
    return m3uUrl.replace('get.php', 'xmltv.php').replace(/&type=[^&]*/, '').replace(/&output=[^&]*/, '')
  }

  const base = m3uUrl.replace(/\?.*$/, '').replace(/\/(playlist|get|channels)\.m3u.*$/i, '')
  const candidates = [
    m3uUrl.replace(/\.m3u.*$/, '.xml'),
    m3uUrl.replace(/\.m3u.*$/, '.xml.gz'),
    base + '/epg.xml',
    base + '/epg.xml.gz',
    base + '/xmltv.php',
  ]
  return candidates[0]
}

module.exports = {
  parseM3u,
  extractEpgUrlFromM3u,
  fetchM3u,
  fetchXtream,
  getXtreamStreamUrl,
  detectEpgUrl,
  detectEpgUrlFromText,
}
