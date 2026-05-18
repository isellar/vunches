# CLI Feature Plan

## Architecture Decision

The main process (`src/main/index.js`, 1353 lines) is a monolith mixing Electron-specific code (window, IPC, dialogs) with pure Node.js logic (mDNS, CASTV2, ffmpeg proxy, playlist/EPG parsing, mpv spawning). The approach is:

1. **Extract all pure-Node.js logic into shared modules** under `src/shared/`
2. **Create a CLI entry point** (`src/cli/index.js`) that imports those modules — plain Node.js, no Electron overhead
3. **Refactor the Electron main process** to import from those modules instead of having inline code
4. **Replace `electron-store`** with the shared config module everywhere — one `config.json` on disk, shared by GUI and CLI

---

## Phase 1: Extract Shared Modules [DONE]

| Module | Contents |
|---|---|
| `src/shared/config.js` | JSON-file-based persistence. API: `get(k)`, `set(k,v)`, `delete(k)`, `getAll()`. Stores to `%APPDATA%/vunches/config.json` — same path `electron-store` used. GUI and CLI share the same file. |
| `src/shared/mdns.js` | Chromecast mDNS discovery as an `EventEmitter`. `start()`/`stop()`/`getDevices()`. Emits `'device'` events. Pure Node.js (dgram, net, http). |
| `src/shared/cast-client.js` | CASTV2 protocol as an `EventEmitter`. `play(opts)`, `pause()`, `resume()`, `stop()`, `setVolume(n)`. Emits `'status'`, `'error'`, `'disconnected'`, `'reconnecting'`, `'reconnected'`. Takes an `hlsProxy` instance. |
| `src/shared/hls-proxy.js` | ffmpeg HLS transcoding proxy. `start(url, deviceHost, devices)` / `stop()`. No Electron dependency. |
| `src/shared/playlist.js` | `parseM3u(text)`, `fetchM3u(url, {cacheDir, onProgress})`, `fetchXtream(opts)`, `getXtreamStreamUrl(opts)`, `detectEpgUrl(m3uUrl)`. ETag caching, M3U parsing, Xtream Codes API. |
| `src/shared/epg.js` | `parseXmltv(xml)`, `fetchEpg(url, {cacheDir, onProgress})`. ETag caching, XMLTV parsing. |
| `src/shared/mpv.js` | `playStream(url, name)` — spawns mpv as detached process. |

---

## Phase 2: Refactor Electron Main Process

Replace all inline implementations in `src/main/index.js` with imports from `src/shared/`:

- **mDNS discovery**: `new MdnsDiscovery()` → emits events → forwarded to renderer via IPC
- **HLS proxy**: `new HlsProxy()` instance → shared with cast-client
- **CASTV2 client**: `new CastClient({ hlsProxy })` → emits events → forwarded to renderer via IPC
- **MPV**: `playStream(url, name)` from shared/mpv
- **Playlist/EPG**: `fetchM3u()`, `fetchEpg()` from shared modules, passing `app.getPath('userData')` as `cacheDir`
- **Store IPC**: `config.get/set/delete` from shared/config replaces electron-store
- **Xtream IPC**: delegates to `fetchXtream()` / `getXtreamStreamUrl()` from shared/playlist

**Store/IPC changes:** `electron-store` is removed entirely. The main process's `store-get`, `store-set`, `store-delete` IPC handlers now call `shared/config.js`. The preload/renderer API is unchanged — `window.electron.store.get/set/delete` still works the same. Both GUI and CLI read/write the same `%APPDATA%/vunches/config.json`.

---

## Phase 3: CLI Entry Point

New file: `src/cli/index.js` — plain Node.js script with manual argument parsing. Added to `package.json`:
```json
"bin": { "vunches": "src/cli/index.js" }
```

### Commands

| Command | What it does |
|---|---|
| `vunches devices` | Discover and list Chromecast devices on the LAN |
| `vunches channels` | List channels from active source. `--search <q>`, `--category <cat>`, `--limit <n>` |
| `vunches watch <name>` | Fuzzy-find channel by name, launch mpv with stream URL |
| `vunches cast <name>` | Cast channel to Chromecast. `--device <name>` to pick device |
| `vunches stop` | Stop current cast session |
| `vunches pause` / `vunches resume` | Media control on active cast |
| `vunches volume <0-100>` | Set cast device volume |
| `vunches sources` | List all saved playlist sources with IDs and types |
| `vunches sources add --type m3u --url <u> --name <n>` | Add M3U source |
| `vunches sources add --type xtream --host <u> --user <u> --pass <p> --name <n>` | Add Xtream source |
| `vunches sources use <id>` | Set active source |
| `vunches sources remove <id>` | Remove a saved source |
| `vunches reload` | Re-fetch and re-parse active playlist |
| `vunches favorites [list\|add\|remove]` | Manage favorite channels |
| `vunches config` | View current config |
| `vunches recent` | Show recently watched channels |

All commands load config from `%APPDATA%/vunches/config.json` — the same file the GUI uses. Sources, favorites, and settings are always in sync.

### CLI source management

Full CRUD via `vunches sources add|remove|list|use`. A source added via CLI appears in the GUI next launch and vice versa. The CLI also supports adding Xtream Codes sources with credential validation.

---

## Key Design Decisions

- **Shared config directory**: CLI reads/writes the same JSON files the GUI uses, so sources/favorites/settings stay in sync without Electron
- **No Electron dependency in CLI**: CLI imports only pure Node.js + shared modules
- **Channel lookup by fuzzy name**: `vunches watch "cnn"` finds the closest matching channel (case-insensitive substring match)
- **Device auto-selection**: `vunches cast` without `--device` uses the last saved device from GUI, or auto-discovers and picks the first one
- **Stream window**: `vunches watch` opens mpv in its own window (same as GUI click behavior)
- **electron-store removed**: Shared `config.js` replaces it; IPC API unchanged for renderer

---

## Files

**New:**
- `src/shared/config.js` [DONE]
- `src/shared/mdns.js` [DONE]
- `src/shared/cast-client.js` [DONE]
- `src/shared/hls-proxy.js` [DONE]
- `src/shared/playlist.js` [DONE]
- `src/shared/epg.js` [DONE]
- `src/shared/mpv.js` [DONE]
- `src/cli/index.js`

**Modified:**
- `src/main/index.js` [TODO]
- `package.json` (`bin` entry, remove `electron-store` dep) [TODO]
