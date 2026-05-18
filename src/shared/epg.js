const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

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

function parseXmltv(xml) {
  const epg = {}

  const chanRe = /<channel\s+id="([^"]+)"[^>]*>/g
  let m
  while ((m = chanRe.exec(xml)) !== null) {
    const id = m[1].trim()
    if (!epg[id]) epg[id] = []
  }

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

function fetchEpg(url, { signal, onProgress, cacheDir } = {}) {
  const cacheFile = cacheDir ? path.join(cacheDir, 'epg-cache.json') : null
  const metaFile  = cacheDir ? path.join(cacheDir, 'epg-meta.json') : null

  return new Promise((resolve, reject) => {
    let cachedMeta = null
    if (metaFile) {
      try { cachedMeta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) } catch {}
    }

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
          onProgress?.({ stage: 'cache', message: 'EPG up to date' })
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

        onProgress?.({ stage: 'downloading', receivedBytes: 0, totalBytes })

        const chunks = []
        const dataStream = isGzip ? res.pipe(zlib.createGunzip()) : res

        res.on('data', (chunk) => {
          receivedBytes += chunk.length
          onProgress?.({ stage: 'downloading', receivedBytes, totalBytes })
        })

        dataStream.on('data', (chunk) => chunks.push(chunk))
        dataStream.on('end', () => {
          onProgress?.({ stage: 'parsing' })
          const xml = Buffer.concat(chunks).toString('utf8')
          setImmediate(() => {
            const epg = parseXmltv(xml)
            const channelCount = Object.keys(epg).length
            onProgress?.({ stage: 'done', channelCount })
            if (cacheFile) {
              try {
                fs.writeFileSync(cacheFile, JSON.stringify(epg))
                fs.writeFileSync(metaFile, JSON.stringify({ etag, url, cachedAt: Date.now() }))
              } catch {}
            }
            resolve(epg)
          })
        })
        dataStream.on('error', reject)
        res.on('error', reject)
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('EPG request timed out')) })
    }

    if (cachedMeta?.url === url && cacheFile) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
        if (cached && Object.keys(cached).length > 0) {
          onProgress?.({ stage: 'cache', channelCount: Object.keys(cached).length })
          resolve(cached)
          setTimeout(() => { try { doReq(url, lib) } catch {} }, 1500)
          return
        }
      } catch {}
    }

    doReq(url, lib)
  })
}

module.exports = { parseXmltv, fetchEpg, parseXmltvDate }
