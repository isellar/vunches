const os = require('os')
const dgram = require('dgram')
const net = require('net')
const http = require('http')
const { EventEmitter } = require('events')

const MDNS_ADDR = '224.0.0.251'
const MDNS_PORT = 5353

const CAST_QUERY = Buffer.from([
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x01,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x0b,
  0x5f, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x63, 0x61, 0x73, 0x74,
  0x04, 0x5f, 0x74, 0x63, 0x70,
  0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c,
  0x00,
  0x00, 0x0c,
  0x00, 0x01,
])

function getLocalInterfaces() {
  const nets = os.networkInterfaces()
  const addrs = []
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4') addrs.push(iface.address)
    }
  }
  return addrs
}

function parseDnsTxtRecords(msg) {
  const result = {}
  const known = ['fn=', 'id=', 'md=', 'rs=', 've=', 'ca=', 'st=', 'bs=', 'nf=']
  for (let i = 0; i < msg.length - 3; i++) {
    for (const key of known) {
      if (i + key.length > msg.length) continue
      const chunk = msg.slice(i, i + key.length).toString('utf8')
      if (chunk === key) {
        let end = i + key.length
        while (end < msg.length && msg[end] !== 0 && (msg[end] >= 0x20 || msg[end] === 0x09)) {
          end++
        }
        const val = msg.slice(i + key.length, end).toString('utf8').trim()
        if (val) result[key.slice(0, -1)] = val
        break
      }
    }
  }
  return result
}

class MdnsDiscovery extends EventEmitter {
  constructor() {
    super()
    this._sockets = null
    this._interval = null
    this._devices = []
  }

  getDevices() {
    return [...this._devices]
  }

  start() {
    this._devices = []

    if (this._sockets) {
      const socks = Array.isArray(this._sockets) ? this._sockets : [this._sockets]
      socks.forEach(s => { try { s.close() } catch {} })
      this._sockets = null
    }
    if (this._interval) {
      clearInterval(this._interval)
      this._interval = null
    }

    const localIPs = getLocalInterfaces()

    const bindAddrs = getLocalInterfaces().filter(ip =>
      !ip.startsWith('127.') &&
      !ip.startsWith('172.') &&
      !ip.startsWith('10.5.')
    )

    if (!bindAddrs.length) {
      bindAddrs.push(...getLocalInterfaces().filter(ip => !ip.startsWith('127.')))
    }

    const _addDevice = (ip, name) => {
      if (this._devices.find(d => d.host === ip)) return
      const device = { name, host: ip, port: 8009 }
      this._devices.push(device)
      this.emit('device', device)
    }

    const _probeChromecast = (ip, fallbackName) => {
      if (this._devices.find(d => d.host === ip)) return
      const sock = net.createConnection({ host: ip, port: 8009, timeout: 1500 })
      sock.on('connect', () => {
        sock.destroy()
        fetchChromecastInfo(ip, fallbackName)
      })
      sock.on('error', () => {})
      sock.on('timeout', () => sock.destroy())
    }

    const fetchChromecastInfo = (ip, fallbackName) => {
      if (this._devices.find(d => d.host === ip)) return
      const req = http.get(`http://${ip}:8008/setup/eureka_info?options=detail`, { timeout: 2000 }, res => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          try {
            const info = JSON.parse(Buffer.concat(chunks).toString())
            const name = info.name || info.device_info?.name || fallbackName
            _addDevice(ip, name)
          } catch {
            _addDevice(ip, fallbackName)
          }
        })
      })
      req.on('error', () => _addDevice(ip, fallbackName))
      req.on('timeout', () => { req.destroy(); _addDevice(ip, fallbackName) })
    }

    const handleMessage = (msg, rinfo) => {
      const srcIp = rinfo.address
      if (localIPs.includes(srcIp)) return
      if (this._devices.find(d => d.host === srcIp)) return

      const txt = parseDnsTxtRecords(msg)
      const name = txt.fn || txt.md || null
      if (!name) {
        _probeChromecast(srcIp, `Device (${srcIp})`)
        return
      }
      _addDevice(srcIp, name)
    }

    const sockets = []
    this._sockets = sockets

    bindAddrs.forEach(bindAddr => {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      sockets.push(sock)
      sock.on('error', e => this.emit('error', e))
      sock.on('message', handleMessage)
      sock.bind(MDNS_PORT, () => {
        try { sock.addMembership(MDNS_ADDR, bindAddr) } catch {}
        sock.send(CAST_QUERY, MDNS_PORT, MDNS_ADDR)
      })
    })

    const sendQuery = () => {
      sockets.forEach(sock => {
        try { sock.send(CAST_QUERY, MDNS_PORT, MDNS_ADDR) } catch {}
      })
    }

    const lanAddr = bindAddrs.find(ip => ip.startsWith('192.168.'))
    if (lanAddr) {
      const subnet = lanAddr.split('.').slice(0, 3).join('.')
      setTimeout(() => {
        for (let i = 1; i <= 254; i++) {
          const ip = `${subnet}.${i}`
          if (!localIPs.includes(ip)) _probeChromecast(ip, `Chromecast (${ip})`)
        }
      }, 2000)
    }

    sendQuery()
    this._interval = setInterval(sendQuery, 10000)
  }

  stop() {
    if (this._interval) { clearInterval(this._interval); this._interval = null }
    if (this._sockets) {
      const socks = Array.isArray(this._sockets) ? this._sockets : [this._sockets]
      socks.forEach(s => { try { s.close() } catch {} })
      this._sockets = null
    }
  }
}

module.exports = { MdnsDiscovery }
