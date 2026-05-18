# Stremio Addon Integration — Implementation Plan

## Overview

Add VOD (Video on Demand) support via Stremio community addons. Users can browse
catalogs of movies and series from any Stremio-compatible addon, select content,
pick a stream source (HTTP or torrent), and play it — all within the existing
mpv/Cast playback infrastructure.

Stremio addons fit into the existing source model: each set of addon URLs is a
source of `type: "stremio"`, sitting alongside `m3u` and `xtream` sources.
When the active source is stremio, the sidebar switches from channel categories
to content type filters (All / Movies / Series), and the main panel shows a
poster grid instead of a channel list.

### Key Design Decisions

- **Torrent streaming is critical** — Phase 1 includes WebTorrent
- **No `stremio-addon-client` dependency** — custom lightweight HTTP protocol client
- **Catalogs merged across addons** — same IMDB ID = same item, stream sources combined
- **Shared modules** — protocol client and torrent manager live in `src/shared/` so the CLI can use them
- **Source-level integration** — "Stremio" is a source type, managed via the same Sources tab in Settings, persisted via `shared/config.js`

---

## Architecture

```
One "Stremio" source → contains N addon manifest URLs
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         Torrentio       Superflix        Comet
    (torrent-based)   (HTTP direct)   (torrent/HTTP)
              │               │               │
              └───────────────┴───────────────┘
                              │
                    merged catalog grid
                    merged stream sources
```

### Data Flow

```
[User browses "Movies"]
  → All configured addons queried for /catalog/movie/{id}.json
  → Results merged by IMDB ID (deduplication)
  → Poster grid displayed

[User clicks a movie]
  → /meta/movie/{ttId}.json fetched from all capable addons
  → Metadata merged (poster, description, cast, rating)
  → Detail view shown with "Play" button

[User clicks "Play"]
  → /stream/movie/{ttId}.json fetched from all capable addons
  → Streams grouped by addon, sorted by quality
  → User picks or auto-selects best stream
  → If url: direct playback via mpv/Cast
  → If infoHash: torrent manager downloads + serves via local HTTP → mpv/Cast

[User clicks a series]
  → /meta/series/{ttId}.json fetched → videos[] contains seasons/episodes
  → Season picker → episode grid
  → When episode selected → /stream/series/{ttId}:{season}:{episode}.json
  → Stream selection + playback as above
```

---

## Phase 1: Core Infrastructure (Shared Modules)

### 1a. `src/shared/stremio-client.js` — Addon Protocol Client

Custom HTTP client for the Stremio addon protocol. No dependencies beyond Node.js
built-ins (`http`/`https`).

```js
// HTTP transport only (legacy /stremio/v1 and IPFS not needed for Phase 1)
module.exports = {
  fetchManifest(transportUrl) → manifest
  // GET {transportUrl}/manifest.json → returns StremioManifest
  // Validates: id, version, name, resources, types, catalogs

  fetchCatalog(transportUrl, type, id, extra?) → { metas[] }
  // GET {transportUrl}/catalog/{type}/{id}.json?skip=N&search=Q

  fetchMeta(transportUrl, type, id) → { meta }
  // GET {transportUrl}/meta/{type}/{id}.json

  fetchStreams(transportUrl, type, id) → { streams[] }
  // GET {transportUrl}/stream/{type}/{id}.json

  fetchSubtitles(transportUrl, type, id) → { subtitles[] }
  // GET {transportUrl}/subtitles/{type}/{id}.json
}
```

**Protocol types** (shared with renderer via IPC):

```ts
type StremioManifest = {
  id: string; name: string; version: string;
  description: string;
  resources: Array<string | {name:string; types:string[]; idPrefixes?:string[]}>;
  types: string[];           // ["movie", "series", "channel", "tv"]
  catalogs: Array<{type:string; id:string; name:string; extra?:Array<{name:string; isRequired:boolean}>}>;
  idPrefixes?: string[];     // e.g. ["tt"] for IMDB
  behaviorHints?: { adult?:boolean; configurable?:boolean; configurationRequired?:boolean; };
}

type StremioMetaPreview = {
  id: string; type: string; name: string;
  poster?: string; posterShape?: 'poster'|'landscape'|'square';
  genres?: string[]; releaseInfo?: string; description?: string;
  imdbRating?: string; year?: string;
}

type StremioMeta = StremioMetaPreview & {
  background?: string; logo?: string;
  director?: string[]; cast?: string[];
  runtime?: string; country?: string;
  videos?: Array<{id:string; title:string; season:number; episode:number; released?:string; thumbnail?:string}>;
  links?: Array<{name:string; category:string; url:string}>;
  behaviorHints?: { defaultVideoId?: string };
}

type StremioStream = {
  name?: string; description?: string;
  url?: string;              // Direct HTTP(S) stream
  ytId?: string;             // YouTube video ID
  infoHash?: string;         // Torrent info hash
  fileIdx?: number;          // File index within torrent
  externalUrl?: string;      // Deep link
  subtitles?: Array<{url:string; lang:string}>;
  behaviorHints?: {
    notWebReady?: boolean; bingeGroup?: string;
    proxyHeaders?: { request?: Record<string,string> };
    videoHash?: string; videoSize?: number; filename?: string;
  };
}
```

### 1b. `src/shared/torrent-manager.js` — WebTorrent Streaming

```js
const WebTorrent = require('webtorrent')

class TorrentManager {
  constructor(opts) {
    // client = new WebTorrent({ dht: true, tracker: true })
  }

  createStream(infoHash, fileIdx, opts?) → { url, onProgress, destroy }
  // - Adds magnet/infohash to WebTorrent client
  // - Selects file by fileIdx (or largest video file)
  // - Serves file via local HTTP (web seeding built into webtorrent)
  // - Returns local playback URL: http://127.0.0.1:{port}/
  // - Emits progress events: { downloadSpeed, uploadSpeed, progress, peers }

  destroyStream(url)
  // - Removes torrent, closes HTTP server

  status() → [{ infoHash, progress, downloadSpeed, peers }]

  destroy()
  // - Destroys the WebTorrent client entirely
}
```

**Design notes:**
- WebTorrent's built-in video streaming supports Range requests — mpv and Chromecast can seek
- Sequential piece download for smooth playback start
- Doesn't write to disk by default (in-memory), or uses temp dir with cleanup

### 1c. Source model extension

The existing source type gains a `stremio` variant:

```js
// Persisted in config.json under key "sources":
{
  id: "1700000000000",
  name: "My Stremio Addons",
  type: "stremio",
  addons: [
    "https://torrentio.strem.fun/manifest.json",
    "https://comet.elfhosted.com/manifest.json",
    "https://vidsrc.xyz/manifest.json",
  ]
}
```

The `sources` array in `config.json` can contain a mix of `m3u`, `xtream`, and `stremio` sources. Only one is active at a time via `activeSourceId`.

---

## Phase 2: Main Process IPC Handlers

### 2a. New handlers in `src/main/index.js`

The main process is already refactored to import shared modules. Add these IPC handlers:

```js
const { fetchManifest, fetchCatalog, fetchMeta, fetchStreams } = require('../shared/stremio-client')
const { TorrentManager } = require('../shared/torrent-manager')

const torrent = new TorrentManager()

// ─── Stremio Handlers ─────────────────────────────────────────────────────

ipcMain.handle('stremio-load-catalog', async (_e, { addonUrls, type, skip = 0 }) => {
  // 1. Fetch manifests for all addon URLs (in parallel)
  // 2. Filter addons that support catalog for the requested type
  // 3. Fetch catalog from each (in parallel), passing skip for pagination
  // 4. Merge results, deduplicate by IMDB ID (tt*)
  // 5. Return { metas: [...], hasMore: bool }
})

ipcMain.handle('stremio-search', async (_e, { addonUrls, query, types }) => {
  // 1. Fetch manifests for all addon URLs (in parallel)
  // 2. Filter addons that support search in their catalogs
  // 3. Query /catalog/{type}/{id}/search={query}.json from each
  // 4. Merge + deduplicate results
  // 5. Return { metas: [...] }
})

ipcMain.handle('stremio-get-meta', async (_e, { addonUrls, type, id }) => {
  // 1. Filter addons capable of meta for this type/idPrefix
  // 2. Fetch meta from all capable addons (parallel)
  // 3. Deep-merge metadata (later results override nulls from earlier)
  // 4. Return { meta }
})

ipcMain.handle('stremio-get-streams', async (_e, { addonUrls, type, id }) => {
  // 1. Filter addons capable of streams for this type/idPrefix
  // 2. Fetch streams from all capable addons (parallel)
  // 3. Group by addon name + sort by quality
  // 4. Return { streams: [{ transportUrl, manifestName, stream }] }
})

// ─── Torrent Handlers ────────────────────────────────────────────────────

ipcMain.handle('torrent-create-stream', async (_e, { infoHash, fileIdx }) => {
  const result = torrent.createStream(infoHash, fileIdx)
  // Forward progress events to renderer
  result.onProgress = (status) => {
    win.webContents.send('torrent-progress', { infoHash, ...status })
  }
  return { url: result.url }
})

ipcMain.handle('torrent-destroy-stream', async (_e, { url }) => {
  torrent.destroyStream(url)
})

ipcMain.handle('torrent-status', async () => {
  return torrent.status()
})
```

### 2b. Preload bridge additions (`src/preload/index.js`)

```js
// stremio methods
stremioLoadCatalog:   (opts) => ipcRenderer.invoke('stremio-load-catalog', opts),
stremioSearch:        (opts) => ipcRenderer.invoke('stremio-search', opts),
stremioGetMeta:       (opts) => ipcRenderer.invoke('stremio-get-meta', opts),
stremioGetStreams:    (opts) => ipcRenderer.invoke('stremio-get-streams', opts),

// torrent methods
torrentCreateStream:  (opts) => ipcRenderer.invoke('torrent-create-stream', opts),
torrentDestroyStream: (opts) => ipcRenderer.invoke('torrent-destroy-stream', opts),
torrentStatus:        ()     => ipcRenderer.invoke('torrent-status'),

// torrent events
onTorrentProgress:    (cb) => ipcRenderer.on('torrent-progress', (_e, d) => cb(d)),
offTorrentProgress:   ()   => ipcRenderer.removeAllListeners('torrent-progress'),
```

---

## Phase 3: Store Changes (`src/renderer/store/useStore.js`)

Extend the Zustand store with VOD state:

```js
// --- VOD ---
vodCatalog: [],          // merged catalog metas (StremioMetaPreview[])
vodSelected: null,       // currently viewed full meta (StremioMeta)
vodStreams: [],          // available streams: [{ transportUrl, manifestName, ...StremioStream }]
vodHistory: [],          // recently watched VOD: [{ id, type, name, poster, progress, timestamp }]
vodContentType: 'all',   // 'all' | 'movie' | 'series'
vodSkip: 0,              // pagination offset
vodHasMore: true,
vodSearch: '',
vodTorrentStatus: {},    // { [infoHash]: { progress, speed, peers } }
vodView: 'catalog',      // 'catalog' | 'detail' | 'stream-picker'

// Actions
setVodCatalog:       (metas)      => set({ vodCatalog: metas }),
appendVodCatalog:    (metas)      => set(s => ({ vodCatalog: [...s.vodCatalog, ...metas] })),
setVodSelected:      (meta)       => set({ vodSelected: meta }),
setVodStreams:       (streams)    => set({ vodStreams: streams }),
setVodContentType:   (type)       => set({ vodContentType: type, vodSkip: 0, vodCatalog: [] }),
setVodSkip:          (skip)       => set({ vodSkip: skip }),
setVodHasMore:       (hasMore)    => set({ vodHasMore: hasMore }),
setVodSearch:        (query)      => set({ vodSearch: query }),
setVodView:          (view)       => set({ vodView: view }),
updateTorrentStatus: (infoHash, status) => set(s => ({
  vodTorrentStatus: { ...s.vodTorrentStatus, [infoHash]: status }
})),

addVodToHistory: (item) => {
  const { vodHistory } = get()
  const filtered = vodHistory.filter(h => h.id !== item.id)
  set({ vodHistory: [item, ...filtered].slice(0, 50) })
  window.electron?.store.set('vodHistory', get().vodHistory)
},

setVodHistory: (vodHistory) => set({ vodHistory }),

// Derived
getFilteredCatalog: () => {
  const { vodCatalog, vodContentType, vodSearch } = get()
  let list = vodCatalog
  if (vodContentType !== 'all') {
    list = list.filter(m => m.type === vodContentType)
  }
  if (vodSearch.trim()) {
    const q = vodSearch.toLowerCase()
    list = list.filter(m => m.name?.toLowerCase().includes(q))
  }
  return list
},
```

The store persists `vodHistory` to `config.json` via `config.set()` (same as favorites/recentlyWatched already do).

---

## Phase 4: Renderer UI Components

### 4a. `CatalogBrowser.jsx` — VOD poster grid

Replaces `ChannelList` in the main panel when active source type is `stremio`.

- Responsive grid: 3-6 columns based on window width
- Each card: poster image, title, year, type badge (Movie / Series)
- Hover: play button overlay, quick info in tooltip
- Click → set `vodSelected` → switch to detail view
- Pagination: Load More button at the bottom, or intersection observer for infinite scroll
- Loading state: skeleton cards during catalog fetch
- Empty state: "No content found" when catalog is empty
- Error state: "Addon unreachable" with retry button

### 4b. `ContentDetail.jsx` — Metadata + episode picker

Full-screen or slide-in detail overlay when a catalog item is clicked.

- Backdrop: background fanart with gradient fade
- Top: poster, logo (if provided), title, year, rating, runtime
- Genres, cast, director as tag chips
- Synopsis paragraph
- For movies: large "Play" button → fetches streams → opens StreamPicker
- For series: season selector tabs (season 1, 2, 3...) + episode thumbnail grid
  - Each episode: thumbnail, title, number, air date
  - Click episode → fetches streams for `{id}:{season}:{episode}` → StreamPicker
- Back button returns to catalog grid

### 4c. `StreamPicker.jsx` — Stream source selection

Modal or slide-up panel showing available stream sources for the selected video.

- Grouped by addon name (e.g., "Torrentio", "Superflix", "Comet")
- Each entry shows:
  - Addon name + icon
  - Quality label (1080p, 720p, SD) from stream `name`
  - File size if available (`behaviorHints.videoSize`)
  - Source type icon (cloud for HTTP, magnet for torrent, YouTube for ytId)
- Best quality auto-selected by default
- "Play" button → starts playback
- "Cancel" → return to detail view

### 4d. Source loading logic (`App.jsx`)

When `activeSource.type === 'stremio'`:

```js
// In App.jsx boot sequence:
if (source.type === 'stremio') {
  // 1. Fetch manifests for all addon URLs (one-time, cached in memory)
  // 2. Fetch initial catalog (default: all types, skip=0)
  // 3. Set channels=[] (no live channels)
  // 4. Set vodView='catalog'
}
```

### 4e. Sidebar integration (`Sidebar.jsx`)

When `activeSource.type === 'stremio'`:
- Replace group-title categories with VOD filters: All | Movies | Series
- "Continue Watching" section above filters if `vodHistory` is non-empty
- "Favorites" still works (bookmarked VOD items)
- The existing "All / Favorites / Recent" section becomes VOD-specific

### 4f. Settings changes (`Settings.jsx`)

**Sources tab:** Add "Add Stremio" button in the add-source section. The Stremio source form:
- Source name input
- Dynamic list of addon URL inputs with add/remove buttons
- Default addon suggestions (Torrentio, Comet, Superflix) as quick-add chips
- Validate manifest URL on blur (green check / red X)
- Same edit/delete behavior as M3U/Xtream sources

---

## Phase 5: Playback Integration

VOD playback reuses the existing playback infrastructure — same mpv process for
local playback, same Chromecast pipeline for casting.

```js
// playVodStream() — combines all stream types into the existing playback flow:
async function playVodStream(stream) {
  let playUrl

  if (stream.url) {
    // Direct HTTP(S) — same as M3U channel playback
    playUrl = stream.url
  } else if (stream.infoHash) {
    // Torrent — create stream, get local URL
    const result = await window.electron.torrentCreateStream({
      infoHash: stream.infoHash,
      fileIdx: stream.fileIdx || 0,
    })
    playUrl = result.url
  } else if (stream.ytId) {
    // YouTube — mpv can play YouTube natively
    playUrl = `https://www.youtube.com/watch?v=${stream.ytId}`
  } else if (stream.externalUrl) {
    playUrl = stream.externalUrl
  }

  if (playUrl) {
    // Use existing playStream for mpv
    await window.electron.playStream(playUrl, vodSelected.name)
    // Or existing cast.play for Chromecast
    // await window.electron.cast.play({ url: playUrl, ... })
  }
}
```

### Torrent status overlay

During torrent-based playback, show a mini status bar or overlay:
- Download progress bar
- Speed (MB/s)
- Peer count
- This uses the `torrent-progress` IPC events forwarded to the store's `vodTorrentStatus`

### Continue Watching

Track playback position for VOD items:
- When user starts playing → add to `vodHistory` with timestamp
- When user stops → note progress (auto-detect from mpv if possible, or manual)
- "Continue Watching" row shows items with partial progress

---

## Phase 6: CLI Commands

Since both `shared/stremio-client.js` and `shared/torrent-manager.js` are
pure Node.js (no Electron), the CLI can use them directly.

### New CLI commands:

| Command | What it does |
|---|---|
| `vunches vod browse [type]` | Browse catalog. `--type movie|series|all` (default all), `--limit N` (default 20), `--skip N` |
| `vunches vod search <query>` | Search across all addon catalogs. `--type movie|series` |
| `vunches vod detail <id>` | Show full metadata for a movie/series (poster, description, cast, episodes) |
| `vunches vod streams <id> [s:e]` | List available streams for a video. For series, pass season:episode |
| `vunches vod play <id> [s:e]` | Play best available stream. `--addon <name>` to prefer a specific addon, `--quality <N>p` |
| `vunches vod cast <id> [s:e]` | Cast to Chromecast. `--device <name>` |
| `vunches torrent status` | Show active torrents (progress, speed, peers) |
| `vunches torrent clear` | Stop all active torrent downloads |

### CLI implementation (`src/cli/vod.js` or inline in `src/cli/index.js`):

```js
const { fetchManifest, fetchCatalog, fetchMeta, fetchStreams } = require('../shared/stremio-client')
const { TorrentManager } = require('../shared/torrent-manager')
const config = require('../shared/config')

async function getAddonUrls() {
  const sources = config.get('sources') || []
  const activeSource = sources.find(s => s.id === config.get('activeSourceId'))
  if (!activeSource || activeSource.type !== 'stremio') {
    throw new Error('No active Stremio source. Run: vunches sources use <id>')
  }
  return activeSource.addons
}
```

The CLI stremio commands use the same `config.json` as the GUI. The active
source (which could be a stremio source) determines which addons to query.

---

## Phase 7: Polish

- **Metadata caching**: Cache manifests, catalogs, and metadata locally to avoid re-fetching on every navigation. Invalidate after configurable TTL (e.g., 30 minutes for catalogs, 1 hour for metadata).
- **Stream URL caching**: Cache resolved stream URLs with a short TTL (5-10 minutes) since many addons generate expiring URLs.
- **Subtitle support**: Fetch subtitles via `/subtitles/{type}/{id}.json`, pass to mpv via `--sub-file` or `--sub-files`.
- **Addon configuration**: For addons with `behaviorHints.configurable`, support the `/configure` path for user-specific settings (e.g., Real-Debrid API key).
- **Catalog home rows**: Grouped rows per addon or content type (Trending, New Releases, Popular) — like Stremio's board view.
- **Error states**: Addon unreachable, no streams found, torrent timeout, insufficient peers.
- **Offline catalog browsing**: Browse previously-cached catalogs when offline.
- **Favorites**: Persist favorite VOD items (movies/series) alongside channel favorites — same `favorites` array in `config.json`, filtered by source type.

---

## Dependency Changes

| Package | Purpose | Change |
|---|---|---|
| `webtorrent` | Torrent download + video streaming | **Add** (npm) |
| *(none)* | Stremio protocol client | **Custom** (~300 lines) |
| `electron-store` | Already removed | No change |

---

## Files

### New

| File | Purpose |
|---|---|
| `src/shared/stremio-client.js` | Stremio addon HTTP protocol client (shared, pure Node.js) |
| `src/shared/torrent-manager.js` | WebTorrent streaming engine (shared, pure Node.js) |
| `src/renderer/components/CatalogBrowser.jsx` | VOD poster grid with virtualized scrolling |
| `src/renderer/components/ContentDetail.jsx` | Metadata detail view + series episode picker |
| `src/renderer/components/StreamPicker.jsx` | Stream source/quality selector modal |

### Modified

| File | Changes |
|---|---|
| `src/main/index.js` | New IPC handlers: `stremio-load-catalog`, `stremio-search`, `stremio-get-meta`, `stremio-get-streams`, `torrent-create-stream`, `torrent-destroy-stream`, `torrent-status` |
| `src/preload/index.js` | New `window.electron.stremio*` and `window.electron.torrent*` APIs |
| `src/renderer/store/useStore.js` | New VOD state slices (`vodCatalog`, `vodSelected`, `vodStreams`, `vodHistory`, `vodContentType`, `vodView`, `vodTorrentStatus`) + derived getters + actions |
| `src/renderer/App.jsx` | Conditional rendering: show `CatalogBrowser` / `ContentDetail` / `StreamPicker` when `activeSource.type === 'stremio'` instead of `ChannelList`; boot sequence for loading stremio catalogs |
| `src/renderer/components/Settings.jsx` | New "Stremio" source type in Add Source dropdown + addon URL management form |
| `src/renderer/components/Sidebar.jsx` | VOD content type filters (All / Movies / Series) when stremio source active |
| `src/renderer/components/Titlebar.jsx` | Universal search queries addon catalogs when stremio source is active |
| `src/cli/index.js` | New `vod` and `torrent` commands |
| `package.json` | Add `webtorrent` dependency |
