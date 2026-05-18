const http = require('http')
const https = require('https')

function request(url, { method = 'GET', signal, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const doReq = (reqUrl, reqLib) => {
      const parsed = new URL(reqUrl)
      const opts = {
        method,
        timeout,
        rejectUnauthorized: false,
        headers: method === 'HEAD' ? {} : { 'Accept': 'application/json' },
      }

      const req = reqLib.request(reqUrl, opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = resolveUrl(res.headers.location, parsed.origin)
          return doReq(loc, loc.startsWith('https') ? https : http)
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new StremioError(`HTTP ${res.statusCode}`, res.statusCode))
        }

        if (method === 'HEAD') {
          resolve({ statusCode: res.statusCode, headers: res.headers })
          return
        }

        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          try {
            resolve(JSON.parse(body))
          } catch {
            reject(new StremioError('Invalid JSON response'))
          }
        })
        res.on('error', (e) => reject(new StremioError(e.message)))
      })

      req.on('error', (e) => reject(new StremioError(e.message)))
      req.on('timeout', () => { req.destroy(); reject(new StremioError('Request timed out')) })

      if (signal) {
        signal.addEventListener('abort', () => { req.destroy(); reject(new StremioError('Aborted')) })
      }

      req.end()
    }

    const lib = url.startsWith('https') ? https : http
    doReq(url, lib)
  })
}

function resolveUrl(url, base) {
  try {
    return new URL(url, base).toString()
  } catch {
    return url
  }
}

// ─── Manifest ──────────────────────────────────────────────────────────────────

async function fetchManifest(transportUrl) {
  // Normalize: strip trailing slash and /manifest.json if present
  let base = transportUrl.replace(/\/+$/, '')
  if (base.endsWith('/manifest.json')) base = base.slice(0, -'/manifest.json'.length)

  const manifestUrl = base + '/manifest.json'
  const manifest = await request(manifestUrl)

  if (!manifest.id || !manifest.name || !manifest.version) {
    throw new StremioError('Invalid manifest: missing required fields')
  }

  manifest._transportUrl = base

  return manifest
}

// ─── Resource Helpers ───────────────────────────────────────────────────────────

function supportsResource(manifest, resource) {
  if (typeof resource === 'string') {
    const res = manifest.resources || []
    return res.some(r => (typeof r === 'string' ? r : r.name) === resource)
  }
  return (manifest.resources || []).some(r => {
    if (typeof r === 'string') return r === resource.name
    if (r.name !== resource.name) return false
    if (resource.types?.length && r.types?.length) {
      if (!resource.types.some(t => r.types.includes(t))) return false
    }
    if (resource.idPrefix && r.idPrefixes?.length) {
      if (!r.idPrefixes.includes(resource.idPrefix)) return false
    }
    return true
  })
}

function supportsIdPrefix(manifest, id) {
  if (!manifest.idPrefixes?.length) return true
  return manifest.idPrefixes.some(p => id.startsWith(p))
}

async function fetchCatalog(transportUrl, type, catalogId, extra = {}) {
  const params = new URLSearchParams()
  if (extra.search) params.set('search', extra.search)
  if (typeof extra.skip === 'number') params.set('skip', String(extra.skip))

  const query = params.toString()
  const url = `${transportUrl}/catalog/${encodeURIComponent(type)}/${encodeURIComponent(catalogId)}.json${query ? '?' + query : ''}`

  const result = await request(url)
  return { transportUrl, metas: result.metas || [] }
}

async function fetchMeta(transportUrl, type, id) {
  const url = `${transportUrl}/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`
  const result = await request(url)
  return { transportUrl, meta: result.meta || null }
}

async function fetchStreams(transportUrl, type, id) {
  const url = `${transportUrl}/stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`
  const result = await request(url)
  return { transportUrl, streams: result.streams || [] }
}

async function fetchSubtitles(transportUrl, type, id) {
  const url = `${transportUrl}/subtitles/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`
  const result = await request(url)
  return { transportUrl, subtitles: result.subtitles || [] }
}

// ─── Merged Operations ──────────────────────────────────────────────────────────

function mergeMetas(metasList) {
  const map = new Map()
  for (const entry of metasList) {
    for (const meta of entry) {
      const key = meta.id
      if (!map.has(key)) {
        map.set(key, meta)
      } else {
        const existing = map.get(key)
        for (const k of Object.keys(meta)) {
          if (existing[k] == null && meta[k] != null) existing[k] = meta[k]
        }
      }
    }
  }
  return Array.from(map.values())
}

async function fetchAllCatalogs(addonUrls, type, catalogId, extra = {}) {
  const manifests = await Promise.allSettled(
    addonUrls.map(u => fetchManifest(u))
  )

  const capable = []
  for (const r of manifests) {
    if (r.status !== 'fulfilled') continue
    const m = r.value
    if (!supportsResource(m, { name: 'catalog', types: [type] })) continue
    const catalog = (m.catalogs || []).find(c => c.type === type && c.id === catalogId)
    if (!catalog) continue
    capable.push({ transportUrl: m._transportUrl, manifest: m })
  }

  const results = await Promise.allSettled(
    capable.map(({ transportUrl }) => fetchCatalog(transportUrl, type, catalogId, extra))
  )

  const allMetas = []
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.metas.length) {
      allMetas.push(r.value.metas)
    }
  }

  return {
    metas: mergeMetas(allMetas),
    hasMore: results.some(r => r.status === 'fulfilled' && r.value.metas.length >= (catalogId === 'default' ? 50 : 20)),
  }
}

async function loadAllCatalogs(addonUrls, types = ['movie', 'series']) {
  const manifests = await Promise.allSettled(
    addonUrls.map(u => fetchManifest(u))
  )

  const manifestMap = new Map()
  const manifestErrors = []
  for (const r of manifests) {
    if (r.status !== 'fulfilled') {
      manifestErrors.push(r.reason?.message || 'Unknown error')
      continue
    }
    manifestMap.set(r.value._transportUrl, r.value)
  }

  if (manifestMap.size === 0) {
    return { metas: [], error: manifestErrors.length ? manifestErrors.join('; ') : 'No valid addons found' }
  }

  const requests = []
  for (const [transportUrl, m] of manifestMap) {
    for (const cat of (m.catalogs || [])) {
      if (!types.includes(cat.type)) continue
      if (!supportsResource(m, { name: 'catalog', types: [cat.type] })) continue
      requests.push({
        transportUrl,
        type: cat.type,
        catalogId: cat.id,
        extra: { skip: 0 },
      })
    }
  }

  const results = await Promise.allSettled(
    requests.map(r => fetchCatalog(r.transportUrl, r.type, r.catalogId, r.extra))
  )

  const allMetas = []
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.metas.length) {
      allMetas.push(r.value.metas)
    }
  }

  return { metas: mergeMetas(allMetas) }
}

async function searchAllCatalogs(addonUrls, query, types = ['movie', 'series']) {
  const manifests = await Promise.allSettled(
    addonUrls.map(u => fetchManifest(u))
  )

  const searches = []
  for (const r of manifests) {
    if (r.status !== 'fulfilled') continue
    const m = r.value
    for (const type of types) {
      const catalog = (m.catalogs || []).find(c =>
        c.type === type && (c.extra || []).some(e => e.name === 'search'))
      if (!catalog) continue
      searches.push(fetchCatalog(m._transportUrl, type, catalog.id, { search: query }))
    }
  }

  const results = await Promise.allSettled(searches)
  const allMetas = []
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.metas.length) {
      allMetas.push(r.value.metas)
    }
  }

  return { metas: mergeMetas(allMetas) }
}

async function fetchAllMeta(addonUrls, type, id) {
  const manifests = await Promise.allSettled(
    addonUrls.map(u => fetchManifest(u))
  )

  const capable = []
  for (const r of manifests) {
    if (r.status !== 'fulfilled') continue
    const m = r.value
    if (!supportsIdPrefix(m, id)) continue
    if (!supportsResource(m, { name: 'meta', types: [type] })) continue
    capable.push(m._transportUrl)
  }

  const results = await Promise.allSettled(
    capable.map(url => fetchMeta(url, type, id))
  )

  let meta = null
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value.meta) continue
    if (!meta) {
      meta = r.value.meta
    } else {
      for (const k of Object.keys(r.value.meta)) {
        if (meta[k] == null && r.value.meta[k] != null) meta[k] = r.value.meta[k]
      }
    }
  }

  return { meta }
}

async function fetchAllStreams(addonUrls, type, id) {
  const manifests = await Promise.allSettled(
    addonUrls.map(u => fetchManifest(u))
  )

  const capable = []
  for (const r of manifests) {
    if (r.status !== 'fulfilled') continue
    const m = r.value
    if (!supportsIdPrefix(m, id)) continue
    if (!supportsResource(m, { name: 'stream', types: [type] })) continue
    capable.push({ transportUrl: m._transportUrl, name: m.name })
  }

  const results = await Promise.allSettled(
    capable.map(({ transportUrl }) => fetchStreams(transportUrl, type, id))
  )

  const streams = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status !== 'fulfilled' || !r.value.streams.length) continue
    const src = capable[i]
    for (const s of r.value.streams) {
      streams.push({
        ...s,
        _transportUrl: src.transportUrl,
        _addonName: src.name,
      })
    }
  }

  // Sort: direct URL > infoHash > other, then by quality name
  const qualityScore = (s) => {
    const q = (s.name || '').toLowerCase()
    if (q.includes('4k') || q.includes('2160')) return 100
    if (q.includes('1080') || q.includes('fhd')) return 90
    if (q.includes('720') || q.includes('hd')) return 80
    if (q.includes('480') || q.includes('sd')) return 60
    return 50
  }

  streams.sort((a, b) => {
    const aD = a.url ? 1 : a.infoHash ? 0 : -1
    const bD = b.url ? 1 : b.infoHash ? 0 : -1
    if (aD !== bD) return bD - aD
    return qualityScore(b) - qualityScore(a)
  })

  return { streams }
}

// ─── Error ──────────────────────────────────────────────────────────────────────

class StremioError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.name = 'StremioError'
    this.statusCode = statusCode
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────────

module.exports = {
  request,
  fetchManifest,
  fetchCatalog,
  fetchMeta,
  fetchStreams,
  fetchSubtitles,
  fetchAllCatalogs,
  loadAllCatalogs,
  searchAllCatalogs,
  fetchAllMeta,
  fetchAllStreams,
  supportsResource,
  supportsIdPrefix,
  StremioError,
}
