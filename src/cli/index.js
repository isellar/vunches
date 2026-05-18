#!/usr/bin/env node

const path = require('path')

const config = require('../shared/config')
const { MdnsDiscovery } = require('../shared/mdns')
const { HlsProxy } = require('../shared/hls-proxy')
const { CastClient } = require('../shared/cast-client')
const { playStream } = require('../shared/mpv')
const { fetchM3u, fetchXtream, getXtreamStreamUrl } = require('../shared/playlist')
const { fetchEpg } = require('../shared/epg')

const hlsProxy = new HlsProxy()
const cast = new CastClient({ hlsProxy })

const CACHE_DIR = config.getDataDir()

function parseArgs(raw) {
  const args = {}
  const positional = []
  let i = 0
  while (i < raw.length) {
    if (raw[i].startsWith('--')) {
      const key = raw[i].slice(2)
      if (key.includes('=')) {
        const [k, v] = key.split('=', 2)
        args[k] = v
      } else if (i + 1 < raw.length && !raw[i + 1].startsWith('--')) {
        args[key] = raw[i + 1]
        i++
      } else {
        args[key] = true
      }
    } else {
      positional.push(raw[i])
    }
    i++
  }
  return { args, positional }
}

function print(...msg) { console.log(...msg) }

function pad(s, len) { return s.padEnd(len) }

function fuzzyFind(channels, query) {
  if (!query) return channels
  const q = query.toLowerCase()
  return channels.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.id.toLowerCase().includes(q) ||
    (c.tvgId && c.tvgId.toLowerCase().includes(q))
  )
}

async function loadChannels(opts = {}) {
  const sources = config.get('sources') || []
  const activeId = opts.source || config.get('activeSourceId')

  if (!sources.length) throw new Error('No playlist sources configured. Use "vunches sources add" first.')
  if (!activeId) throw new Error('No active source. Use "vunches sources use <id>" first.')

  const source = sources.find(s => s.id === activeId)
  if (!source) throw new Error(`Active source "${activeId}" not found.`)

  if (source.type === 'xtream') {
    let stop = false
    const spinner = ['|', '/', '-', '\\']
    let si = 0
    const timer = setInterval(() => {
      process.stderr.write('\r' + spinner[si++ % 4] + ' Fetching channels...')
    }, 200)
    try {
      const categories = await fetchXtream({ ...source, action: 'get_live_categories' })
      const streams = await fetchXtream({ ...source, action: 'get_live_streams' })
      const channels = streams.map(s => ({
        id: String(s.stream_id),
        name: s.name,
        url: getXtreamStreamUrl({ ...source, streamId: s.stream_id, streamType: 'live' }),
        tvgId: s.epg_channel_id || '',
        tvgLogo: s.stream_icon || '',
        group: { title: s.category_name || '' },
      }))
      clearInterval(timer)
      process.stderr.write('\r' + ' '.repeat(30) + '\r')
      return { channels, source }
    } catch (e) {
      clearInterval(timer)
      throw e
    }
  }

  return new Promise((resolve, reject) => {
    let last = ''
    fetchM3u(source.url, {
      cacheDir: CACHE_DIR,
      onProgress: (p) => {
        if (p.stage === 'cache') return
        if (p.stage === 'done') return
        const msg = p.stage === 'parsing'
          ? 'Parsing channels...'
          : `Downloading... ${p.channelCount || 0} channels${p.totalBytes ? ` (${Math.round(p.receivedBytes / p.totalBytes * 100)}%)` : ''}`
        if (msg !== last) {
          process.stderr.write('\r' + msg + ' '.repeat(20))
          last = msg
        }
      }
    }).then(result => {
      process.stderr.write('\r' + ' '.repeat(50) + '\r')
      resolve({ channels: result.channels, source })
    }).catch(reject)
  })
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdDevices() {
  const mdns = new MdnsDiscovery()
  print('Scanning for Chromecast devices...\n')

  mdns.on('device', (d) => {
    print(`  ${d.name}`)
    print(`    Host: ${d.host}:${d.port}`)
    print('')
  })
  mdns.on('error', (e) => {})

  mdns.start()

  await new Promise(resolve => setTimeout(resolve, 10000))
  mdns.stop()

  const devices = mdns.getDevices()
  if (!devices.length) {
    print('No Chromecast devices found.')
  } else {
    print(`Found ${devices.length} device(s).`)
  }
}

async function cmdChannels(query, opts = {}) {
  const { channels, source } = await loadChannels(opts)
  let filtered = fuzzyFind(channels, query || opts.search || '')

  if (opts.category) {
    const cat = opts.category.toLowerCase()
    filtered = filtered.filter(c => c.group?.title?.toLowerCase().includes(cat))
  }

  const limit = parseInt(opts.limit) || filtered.length
  filtered = filtered.slice(0, limit)

  print(`Source: ${source.name || source.url}`)
  print(`Total: ${channels.length.toLocaleString()} channels`)
  if (query) print(`Search: "${query}" → ${filtered.length} results`)
  if (opts.category) print(`Category: "${opts.category}"`)
  print('')

  for (const c of filtered) {
    const group = c.group?.title ? ` [${c.group.title}]` : ''
    print(`  ${c.name}${group}`)
    if (opts.verbose) {
      if (c.tvgId) print(`    tvg-id: ${c.tvgId}`)
      print(`    url: ${c.url.slice(0, 100)}${c.url.length > 100 ? '...' : ''}`)
    }
  }
}

async function cmdWatch(name, opts = {}) {
  const { channels } = await loadChannels(opts)
  const matches = fuzzyFind(channels, name)
  if (!matches.length) {
    print(`No channel found matching "${name}"`)
    process.exit(1)
  }

  const ch = matches[0]
  if (matches.length > 1 && ch.name.toLowerCase() !== name.toLowerCase()) {
    print(`Multiple matches for "${name}", using closest: "${ch.name}"`)
  }

  print(`Launching: ${ch.name}`)
  const result = await playStream(ch.url, ch.name)
  if (!result.launched) {
    print(`Error: ${result.error}`)
    process.exit(1)
  }
}

async function cmdCast(name, opts = {}) {
  const { channels } = await loadChannels(opts)
  const matches = fuzzyFind(channels, name)
  if (!matches.length) {
    print(`No channel found matching "${name}"`)
    process.exit(1)
  }

  const ch = matches[0]
  if (matches.length > 1 && ch.name.toLowerCase() !== name.toLowerCase()) {
    print(`Multiple matches for "${name}", using closest: "${ch.name}"`)
  }

  let device
  if (opts.device) {
    const mdns = new MdnsDiscovery()
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 6000)
      mdns.on('device', (d) => {
        if (d.name.toLowerCase().includes(opts.device.toLowerCase()) || d.host === opts.device) {
          device = d
          clearTimeout(timer)
          mdns.stop()
          resolve()
        }
      })
      mdns.start()
    })
    if (!device) {
      print(`Device "${opts.device}" not found on network.`)
      process.exit(1)
    }
  } else {
    const saved = config.get('selectedDevice')
    if (saved) {
      device = saved
    } else {
      const mdns = new MdnsDiscovery()
      print('No device specified. Scanning for Chromecasts...')
      await new Promise(async (resolve) => {
        let found = false
        const timer = setTimeout(resolve, 6000)
        mdns.on('device', (d) => {
          if (!found) {
            found = true
            device = d
            clearTimeout(timer)
            mdns.stop()
            resolve()
          }
        })
        mdns.start()
      })
      if (!device) {
        print('No Chromecast devices found. Use --device <name> to specify.')
        process.exit(1)
      }
    }
  }

  print(`Casting: ${ch.name} → ${device.name} (${device.host})`)

  cast.on('status', (s) => {
    if (s?.playerState) print(`Status: ${s.playerState}`)
  })
  cast.on('error', (msg) => print(`Cast error: ${msg}`))
  cast.on('disconnected', () => print('Disconnected from Chromecast'))
  cast.on('reconnecting', () => print('Reconnecting...'))
  cast.on('reconnected', () => print('Reconnected'))

  try {
    await cast.play({
      host: device.host,
      port: device.port || 8009,
      url: ch.url,
      title: ch.name,
      aggressive: opts.aggressive || false,
    })
    print('Press Ctrl+C to stop casting')
  } catch (e) {
    print(`Failed to cast: ${e.message}`)
    process.exit(1)
  }
}

async function cmdStop() {
  cast.stop()
  hlsProxy.stop()
  print('Cast stopped.')
}

async function cmdPause() {
  if (cast.pause()) print('Paused.')
  else print('No active cast session.')
}

async function cmdResume() {
  if (cast.resume()) print('Resumed.')
  else print('No active cast session.')
}

async function cmdVolume(level) {
  const vol = Math.max(0, Math.min(100, parseInt(level) || 50))
  cast.setVolume(vol / 100)
  print(`Volume set to ${vol}%`)
}

async function cmdSources(command, opts = {}) {
  const sources = config.get('sources') || []
  const activeId = config.get('activeSourceId')

  if (!command) {
    if (!sources.length) {
      print('No sources configured.')
      print('Add one with: vunches sources add --type m3u --url <url> --name <name>')
      print('Or:           vunches sources add --type xtream --host <url> --user <u> --pass <p> --name <name>')
      return
    }
    print('Playlist sources:')
    print('')
    for (const s of sources) {
      const marker = s.id === activeId ? '►' : ' '
      const typeBadge = s.type === 'xtream' ? '[XC]' : '[M3U]'
      const url = s.type === 'xtream' ? s.host : s.url
      print(` ${marker} ${typeBadge} ${s.name || url}`)
      print(`     id: ${s.id}`)
      print(`     url: ${url}`)
      print('')
    }
    return
  }

  if (command === 'list') return cmdSources(null, opts)

  if (command === 'add') {
    if (!opts.name) { print('--name is required'); process.exit(1) }
    if (opts.type === 'xtream') {
      if (!opts.host || !opts.user || !opts.pass) { print('--host, --user, --pass required for xtream'); process.exit(1) }
      print('Validating Xtream credentials...')
      try {
        const info = await fetchXtream({ host: opts.host, username: opts.user, password: opts.pass, action: 'get_user_info' })
        const id = `xc-${Date.now()}`
        sources.push({ id, name: opts.name, type: 'xtream', host: opts.host, username: opts.user, password: opts.pass })
        config.set('sources', sources)
        print(`Added: ${opts.name} (${info.user_info?.username || opts.user}, ${info.server_info?.url || opts.host})`)
      } catch (e) {
        print(`Invalid credentials: ${e.message}`)
        process.exit(1)
      }
    } else {
      if (!opts.url) { print('--url is required for M3U sources'); process.exit(1) }
      const id = `m3u-${Date.now()}`
      sources.push({ id, name: opts.name, url: opts.url, type: 'm3u' })
      config.set('sources', sources)
      print(`Added: ${opts.name}`)
      print(`  URL: ${opts.url}`)
    }
    return
  }

  if (command === 'use') {
    const id = opts.id
    if (!id) { print('Usage: vunches sources use <id>'); process.exit(1) }
    const found = sources.find(s => s.id === id)
    if (!found) { print(`Source "${id}" not found.`); process.exit(1) }
    config.set('activeSourceId', id)
    print(`Active source: ${found.name || found.url}`)
    return
  }

  if (command === 'remove') {
    const id = opts.id
    if (!id) { print('Usage: vunches sources remove <id>'); process.exit(1) }
    const idx = sources.findIndex(s => s.id === id)
    if (idx < 0) { print(`Source "${id}" not found.`); process.exit(1) }
    const removed = sources.splice(idx, 1)[0]
    config.set('sources', sources)
    if (activeId === id) config.delete('activeSourceId')
    print(`Removed: ${removed.name || removed.url}`)
    return
  }

  print(`Unknown subcommand: ${command}`)
  print('Usage: vunches sources [list|add|use|remove]')
}

async function cmdReload() {
  print('Reloading playlist...')
  await loadChannels()
  print('Done.')
}

async function cmdFavorites(command, opts = {}) {
  const favorites = config.get('favorites') || []

  if (!command || command === 'list') {
    if (!favorites.length) {
      print('No favorites.')
      return
    }
    print('Favorites:')
    for (const f of favorites) print(`  ${f}`)
    return
  }

  if (command === 'add') {
    const url = opts.url
    if (!url) { print('Usage: vunches favorites add --url <channel-url>'); process.exit(1) }
    if (favorites.includes(url)) { print('Already in favorites.'); return }
    favorites.push(url)
    config.set('favorites', favorites)
    print('Added to favorites.')
    return
  }

  if (command === 'remove') {
    const url = opts.url
    if (!url) { print('Usage: vunches favorites remove --url <channel-url>'); process.exit(1) }
    const idx = favorites.indexOf(url)
    if (idx < 0) { print('Not in favorites.'); return }
    favorites.splice(idx, 1)
    config.set('favorites', favorites)
    print('Removed from favorites.')
    return
  }

  print(`Unknown subcommand: ${command}`)
  print('Usage: vunches favorites [list|add|remove]')
}

async function cmdRecent() {
  const recent = config.get('recentlyWatched') || []
  if (!recent.length) {
    print('No recently watched channels.')
    return
  }
  print('Recently watched:')
  for (let i = recent.length - 1; i >= 0; i--) {
    print(`  ${recent[i]}`)
  }
}

async function cmdConfig() {
  const all = config.getAll()
  const safe = { ...all }
  if (safe.sources) {
    safe.sources = safe.sources.map(s => {
      const { password, ...rest } = s
      return rest
    })
  }
  print(JSON.stringify(safe, null, 2))
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function showHelp() {
  print('Vunches CLI — IPTV streamer')
  print('')
  print('Usage: vunches <command> [options]')
  print('')
  print('Commands:')
  print('  devices                  Discover Chromecast devices on the network')
  print('  channels [query]         List/search channels (--category, --limit, --verbose)')
  print('  watch <name>             Open a stream in mpv')
  print('  cast <name>              Cast to a Chromecast (--device <name>)')
  print('  stop                     Stop current cast')
  print('  pause                    Pause cast')
  print('  resume                   Resume cast')
  print('  volume <0-100>           Set cast volume')
  print('  sources                  List playlist sources')
  print('  sources add [options]    Add a source (--type m3u|xtream --name ...)')
  print('  sources use <id>         Set active source')
  print('  sources remove <id>      Remove a source')
  print('  reload                   Reload current playlist')
  print('  favorites                List favorites')
  print('  favorites add|remove     Manage favorites (--url <url>)')
  print('  recent                   Show recently watched channels')
  print('  config                   Show current configuration')
  print('')
  print('Options:')
  print('  --source <id>            Use a specific source for this command')
  print('  --device <name>          Target a specific Chromecast device')
  print('  --category <name>        Filter channels by category')
  print('  --limit <n>              Limit number of results')
  print('  --verbose                Show extra details (tvg-id, stream URL)')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const raw = process.argv.slice(2)
  if (!raw.length) return showHelp()

  const { args, positional } = parseArgs(raw)
  const cmd = positional[0] || ''
  const rest = positional.slice(1)
  args._ = rest.length === 1 ? rest[0] : rest.join(' ')

  try {
    switch (cmd) {
      case 'devices':  return await cmdDevices()
      case 'channels': return await cmdChannels(rest[0], args)
      case 'watch':    return await cmdWatch(rest[0] || '', args)
      case 'cast':     return await cmdCast(rest[0] || '', args)
      case 'stop':     return await cmdStop()
      case 'pause':    return await cmdPause()
      case 'resume':   return await cmdResume()
      case 'volume':   return await cmdVolume(rest[0] || '50')
      case 'sources': {
        const subcmd = rest[0]
        const subargs = { ...args }
        if (rest.length > 1) subargs.id = rest[1]
        return await cmdSources(subcmd, subargs)
      }
      case 'reload':   return await cmdReload()
      case 'favorites': {
        const subcmd = rest[0]
        const subargs = { ...args }
        return await cmdFavorites(subcmd, subargs)
      }
      case 'recent':   return await cmdRecent()
      case 'config':   return await cmdConfig()
      default: return showHelp()
    }
  } catch (e) {
    print(`Error: ${e.message}`)
    process.exit(1)
  }
}

main().catch(e => { print(`Error: ${e.message}`); process.exit(1) })
