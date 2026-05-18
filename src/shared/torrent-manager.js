const http = require('http')
const { EventEmitter } = require('events')
const { getDataDir } = require('./config')
const path = require('path')
const fs = require('fs')

const VIDEO_TYPES = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.flv', '.wmv']

let WebTorrent = null

async function getWebTorrent() {
  if (WebTorrent) return WebTorrent
  WebTorrent = (await import('webtorrent')).default
  return WebTorrent
}

function isVideoFile(name) {
  const ext = path.extname(name || '').toLowerCase()
  return VIDEO_TYPES.includes(ext)
}

class TorrentManager extends EventEmitter {
  constructor(opts = {}) {
    super()
    this.streams = new Map()
    this.client = null
    this._ready = null
    this._initClient(opts)
  }

  async _initClient(opts) {
    try {
      const WT = await getWebTorrent()
      const dataDir = getDataDir()
      const torrentDir = path.join(dataDir, 'torrents')
      if (!fs.existsSync(torrentDir)) fs.mkdirSync(torrentDir, { recursive: true })

      this.client = new WT({
        tracker: { rtcConfig: null },
        dht: true,
        path: torrentDir,
      })

      this.client.on('error', (err) => {
        console.error('WebTorrent error:', err.message)
      })

      this.client.on('warning', (err) => {
        console.warn('WebTorrent warning:', err.message)
      })
    } catch (e) {
      console.error('Failed to init WebTorrent client:', e.message)
    }
  }

  async _ensureClient() {
    if (this.client) return
    if (!this._ready) {
      this._ready = (async () => {
        const WT = await getWebTorrent()
        const dataDir = getDataDir()
        const torrentDir = path.join(dataDir, 'torrents')
        if (!fs.existsSync(torrentDir)) fs.mkdirSync(torrentDir, { recursive: true })

        this.client = new WT({
          tracker: { rtcConfig: null },
          dht: true,
          path: torrentDir,
        })

        this.client.on('error', (err) => {
          console.error('WebTorrent error:', err.message)
        })

        this.client.on('warning', (err) => {
          console.warn('WebTorrent warning:', err.message)
        })
      })()
    }
    await this._ready
  }

  async createStream(infoHash, fileIdx) {
    await this._ensureClient()
    if (!this.client) {
      throw new Error('WebTorrent client not available')
    }

    const magnetURI = `magnet:?xt=urn:btih:${infoHash}`

    return new Promise((resolve, reject) => {
      const torrent = this.client.add(magnetURI, { announce: [] }, (torrent) => {
        let file
        if (typeof fileIdx === 'number' && torrent.files[fileIdx]) {
          file = torrent.files[fileIdx]
        } else {
          // Try to find a video file
          const sorted = [...torrent.files].sort((a, b) => b.length - a.length)
          file = sorted.find(f => isVideoFile(f.name)) || sorted[0]
        }

        if (!file) {
          torrent.destroy()
          return reject(new Error('No playable file found in torrent'))
        }

        const fileIndex = torrent.files.indexOf(file)
        const server = this._createStreamServer(file, torrent)
        const url = `http://127.0.0.1:${server.address().port}/`

        const streamRef = {
          infoHash,
          fileIdx: fileIndex,
          url,
          torrent,
          file,
          server,
          destroy: () => {
            clearInterval(timer)
            server.close()
            torrent.destroy()
          }
        }

        this.streams.set(url, streamRef)

        // Progress events
        const timer = setInterval(() => {
          if (torrent.progress === 1) clearInterval(timer)
          this.emit('progress', {
            infoHash,
            progress: torrent.progress,
            downloadSpeed: torrent.downloadSpeed,
            uploadSpeed: torrent.uploadSpeed,
            peers: torrent.numPeers,
            downloaded: torrent.downloaded,
            total: torrent.length || file.length,
          })
        }, 1000)

        torrent.on('done', () => {
          clearInterval(timer)
          this.emit('progress', {
            infoHash,
            progress: 1,
            downloadSpeed: torrent.downloadSpeed,
            uploadSpeed: torrent.uploadSpeed,
            peers: torrent.numPeers,
            downloaded: torrent.downloaded,
            total: torrent.length || file.length,
          })
        })

        torrent.on('error', (err) => {
          clearInterval(timer)
          this.emit('streamError', { infoHash, url, error: err.message })
        })

        resolve({ url })
      })

      torrent.on('error', (err) => {
        reject(new Error(`Torrent error: ${err.message}`))
      })

      // Timeout if no peers found in 30s
      const timeout = setTimeout(() => {
        if (torrent.progress === 0) {
          reject(new Error('No peers found for torrent'))
          torrent.destroy()
        }
      }, 30000)

      torrent.once('download', () => clearTimeout(timeout))
    })
  }

  _createStreamServer(file, torrent) {
    const server = http.createServer((req, res) => {
      const fileSize = file.length
      const contentType = getContentType(file.name)

      // Handle Range requests (for seeking)
      const range = req.headers.range
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
        const chunkSize = end - start + 1

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
        })

        const stream = file.createReadStream({ start, end })
        stream.on('error', () => { if (!res.headersSent) res.writeHead(500); res.end() })
        stream.pipe(res)
        return
      }

      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Connection': 'keep-alive',
      })

      const stream = file.createReadStream()
      stream.on('error', () => { if (!res.headersSent) res.writeHead(500); res.end() })
      stream.pipe(res)
    })

    server.listen(0, '127.0.0.1')
    server.on('error', () => {})

    return server
  }

  destroyStream(url) {
    const stream = this.streams.get(url)
    if (stream) {
      stream.destroy()
      this.streams.delete(url)
    }
  }

  destroyStreamByInfoHash(infoHash) {
    for (const [url, stream] of this.streams) {
      if (stream.infoHash === infoHash) {
        stream.destroy()
        this.streams.delete(url)
      }
    }
  }

  status() {
    const statuses = []
    for (const [url, stream] of this.streams) {
      statuses.push({
        url,
        infoHash: stream.infoHash,
        fileIdx: stream.fileIdx,
        progress: stream.torrent.progress,
        downloadSpeed: stream.torrent.downloadSpeed,
        uploadSpeed: stream.torrent.uploadSpeed,
        peers: stream.torrent.numPeers,
        downloaded: stream.torrent.downloaded,
        total: stream.torrent.length || stream.file.length,
        name: stream.file.name,
        size: stream.file.length,
      })
    }
    return statuses
  }

  destroyAll() {
    for (const [_url, stream] of this.streams) {
      try { stream.destroy() } catch {}
    }
    this.streams.clear()
  }

  destroy() {
    this.destroyAll()
    if (this.client) {
      try { this.client.destroy() } catch {}
      this.client = null
    }
  }
}

function getContentType(filename) {
  const ext = path.extname(filename || '').toLowerCase()
  const types = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.m4v': 'video/mp4',
    '.flv': 'video/x-flv',
    '.wmv': 'video/x-ms-wmv',
  }
  return types[ext] || 'video/mp4'
}

module.exports = { TorrentManager }
