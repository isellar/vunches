const { EventEmitter } = require('events')

const CLIENT_ID = 'sender-0'
const DEFAULT_APP_ID = 'CC1AD845'
const MEDIA_NS = 'urn:x-cast:com.google.cast.media'
const RECEIVER_NS = 'urn:x-cast:com.google.cast.receiver'
const CONN_NS = 'urn:x-cast:com.google.cast.tp.connection'
const HB_NS = 'urn:x-cast:com.google.cast.tp.heartbeat'

function detectStreamType(url) {
  const lower = url.toLowerCase()

  if (lower.includes('.m3u8') || lower.includes('type=m3u') || lower.includes('output=hls')) {
    return Promise.resolve({ contentType: 'application/x-mpegurl', streamType: 'LIVE' })
  }
  if (lower.includes('.mp4') || lower.includes('output=mp4')) {
    return Promise.resolve({ contentType: 'video/mp4', streamType: 'BUFFERED' })
  }
  if (lower.includes('.ts') || lower.includes('output=ts') || lower.includes('type=ts')) {
    return Promise.resolve({ contentType: 'video/mp2t', streamType: 'LIVE' })
  }

  const fallback = { contentType: 'video/mp2t', streamType: 'LIVE' }
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? require('https') : require('http')
      const req = lib.request(url, {
        method: 'GET',
        timeout: 4000,
        rejectUnauthorized: false,
        headers: { Range: 'bytes=0-512' },
      }, (res) => {
        const ct = (res.headers['content-type'] || '').toLowerCase()
        res.destroy()
        if (ct.includes('mpegurl') || ct.includes('x-mpegurl')) {
          resolve({ contentType: 'application/x-mpegurl', streamType: 'LIVE' })
        } else if (ct.includes('mp4')) {
          resolve({ contentType: 'video/mp4', streamType: 'BUFFERED' })
        } else {
          resolve(fallback)
        }
      })
      req.on('error', () => resolve(fallback))
      req.on('timeout', () => { req.destroy(); resolve(fallback) })
      req.end()
    } catch {
      resolve(fallback)
    }
  })
}

class CastClient extends EventEmitter {
  constructor({ hlsProxy }) {
    super()
    this._hlsProxy = hlsProxy || null
    this._client = null
    this._reconnectTimer = null
    this._currentOpts = null
    this._hasPlayedSuccessfully = false
  }

  get isActive() {
    return !!this._client
  }

  async play(opts) {
    this._clearReconnect()
    if (this._client) {
      try { this._client.close() } catch {}
      this._client = null
    }
    this._currentOpts = opts
    this._hasPlayedSuccessfully = false
    return this._connect(opts)
  }

  _clearReconnect() {
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null }
  }

  _connect({ host, port, url, title, aggressive }) {
    return new Promise(async (resolve, reject) => {
      if (this._client) {
        this._clearReconnect()
        try { this._client.close() } catch {}
        this._client = null
      }

      let proxyUrl = null
      if (this._hlsProxy) {
        proxyUrl = await this._hlsProxy.start(url, host)
      }
      const castUrl = proxyUrl || url

      const { contentType, streamType } = await detectStreamType(url)

      const castv2 = require('castv2')
      const client = new castv2.Client()
      this._client = client

      const timeout = setTimeout(() => {
        this.emit('error', 'Connection timed out')
        reject(new Error('Connection timed out'))
        try { client.close() } catch {}
      }, 20000)

      client.connect({ host, port: port || 8009 }, () => {
        const mkChan = (ns, dest = 'receiver-0') =>
          client.createChannel(CLIENT_ID, dest, ns, 'JSON')

        const conn = mkChan(CONN_NS)
        const hb   = mkChan(HB_NS)
        const recv = mkChan(RECEIVER_NS)

        conn.send({ type: 'CONNECT' })
        const hbTimer = setInterval(() => { try { hb.send({ type: 'PING' }) } catch {} }, 5000)
        client._hbTimer = hbTimer

        let reqId = 1
        let appLaunched = false

        recv.send({ type: 'LAUNCH', appId: DEFAULT_APP_ID, requestId: reqId++ })

        recv.on('message', (data) => {
          if (data.type === 'LAUNCH_ERROR') {
            clearTimeout(timeout)
            reject(new Error('Chromecast app failed to launch'))
            return
          }
          if (data.type !== 'RECEIVER_STATUS') return

          const appInfo = data.status?.applications?.[0]
          if (!appInfo || appInfo.appId !== DEFAULT_APP_ID || appLaunched) return
          appLaunched = true

          const dest = appInfo.transportId || appInfo.sessionId

          const mconn = mkChan(CONN_NS, dest)
          const media = mkChan(MEDIA_NS, dest)

          mconn.send({ type: 'CONNECT' })

          setTimeout(() => {
            const loadReqId = reqId++
            media.send({
              type: 'LOAD',
              requestId: loadReqId,
              sessionId: appInfo.sessionId,
              media: {
                contentId: castUrl,
                contentType: castUrl.includes('.m3u8') ? 'application/x-mpegurl' : 'video/mp2t',
                streamType: 'LIVE',
                metadata: { type: 0, metadataType: 0, title: title || 'Vunches' },
              },
              autoplay: true,
              currentTime: 0,
              activeTrackIds: [],
              repeatMode: 'REPEAT_OFF',
            })
          }, 1000)

          client._media = media
          client._recv  = recv
          client._reqId = reqId

          let loadResolved = false
          media.on('message', (m) => {
            if (!loadResolved && m.type === 'LOAD_FAILED') {
              loadResolved = true
              clearTimeout(timeout)
              this._currentOpts = null
              this.emit('error', 'Stream could not be loaded by the Chromecast')
              reject(new Error('Stream could not be loaded by the Chromecast'))
              return
            }

            if (!loadResolved && m.type === 'MEDIA_STATUS' && m.status?.[0]) {
              const ps = m.status[0].playerState
              if (ps === 'PLAYING' || ps === 'BUFFERING' || ps === 'PAUSED') {
                loadResolved = true
                this._hasPlayedSuccessfully = true
                clearTimeout(timeout)
                this.emit('status', { playerState: ps })
                resolve({ ok: true })
              } else if (ps === 'IDLE' && m.status[0].idleReason === 'ERROR') {
                loadResolved = true
                clearTimeout(timeout)
                this._currentOpts = null
                this.emit('error', 'Stream failed to load on the Chromecast')
                reject(new Error('Stream failed to load on the Chromecast'))
              }
            }

            if (m.type === 'MEDIA_STATUS') {
              this.emit('status', m.status?.[0] || null)
            }
          })
        })
      })

      client.on('error', (e) => {
        clearTimeout(timeout)
        clearInterval(client._hbTimer)
        this._client = null
        this.emit('error', e.message)
        if (this._hasPlayedSuccessfully) {
          this._handleDisconnect()
        } else {
          this._currentOpts = null
          reject(e)
        }
      })

      client.on('close', () => {
        clearInterval(client._hbTimer)
        if (this._client === client) this._client = null
        this.emit('disconnected')
        if (this._hasPlayedSuccessfully) {
          this._handleDisconnect()
        } else {
          this._currentOpts = null
        }
      })
    })
  }

  _handleDisconnect() {
    this._clearReconnect()
    if (!this._currentOpts) return
    if (!this._currentOpts.aggressive) {
      this._currentOpts = null
      return
    }
    this.emit('reconnecting')
    this._reconnectTimer = setTimeout(() => {
      if (!this._currentOpts) return
      this._connect(this._currentOpts)
        .then(() => this.emit('reconnected'))
        .catch((e) => {
          this.emit('error', e.message)
          this._handleDisconnect()
        })
    }, 3000)
  }

  _sendMediaCmd(type, extra = {}) {
    if (!this._client?._media) return false
    this._client._media.send({ type, requestId: this._client._reqId++, mediaSessionId: 1, ...extra })
    return true
  }

  pause() {
    return this._sendMediaCmd('PAUSE')
  }

  resume() {
    return this._sendMediaCmd('PLAY')
  }

  stop() {
    this._currentOpts = null
    this._hasPlayedSuccessfully = false
    this._clearReconnect()
    if (this._hlsProxy) this._hlsProxy.stop()
    this._sendMediaCmd('STOP')
    try { clearInterval(this._client?._hbTimer); this._client?.close() } catch {}
    this._client = null
  }

  setVolume(level) {
    if (!this._client) return false
    const recv = this._client.createChannel(CLIENT_ID, 'receiver-0', RECEIVER_NS, 'JSON')
    recv.send({ type: 'SET_VOLUME', volume: { level: Math.max(0, Math.min(1, level)) }, requestId: 99 })
    return true
  }

  destroy() {
    this.stop()
    this.removeAllListeners()
  }
}

module.exports = { CastClient, detectStreamType }
