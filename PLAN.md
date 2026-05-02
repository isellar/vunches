# Vunches — IPTV Desktop Streaming Client

## Overview

Vunches is a desktop IPTV client for Windows (with cross-platform in mind) that supports M3U playlists and Xtream Codes. The goal is a usable, fast, modern alternative to the fragmented IPTV client landscape — no server required, no account needed, just load your playlist and watch.

## Market Gap

The best IPTV clients (TiviMate, OTT Navigator) are Android TV only. The best desktop options (Plex, Emby, Jellyfin) require running a local server. IPTVnator is the closest open-source desktop equivalent but lacks polish, Chromecast support, and struggles with large playlists. **No premium standalone desktop IPTV client exists with a modern UI, M3U + Xtream Codes support, EPG, and Chromecast.**

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Electron + Vite + React | JS-only, huge ecosystem, cross-platform builds |
| Video Playback | mpv (separate process, Phase 1) | Click channel → mpv opens and plays the stream |
| Video Playback (later) | mpv embedded via --wid | Phase 5 — in-app player |
| M3U Parsing | `iptv-playlist-parser` npm | Handles tvg-id, tvg-logo, group-title, etc. |
| Chromecast | `castv2` npm | Open-source CASTV2 protocol; no Google cert needed |
| EPG | `epg-parser` npm | Parses XMLTV .xml/.xml.gz |
| Styling | Tailwind CSS | |
| State Management | Zustand | Lightweight, minimal boilerplate |
| Persistence | `electron-store` | Saves playlists, favorites, settings to disk |
| Build / Distribution | `electron-builder` | Windows .exe installer + portable; Mac/Linux later |

---

## Test Playlist

For development and testing, use the iptv-org community playlist:

- **Full catalog (grouped by category):** `https://iptv-org.github.io/iptv/index.category.m3u`
- **News only (smaller, faster):** `https://iptv-org.github.io/iptv/categories/news.m3u`
- **US channels:** `https://iptv-org.github.io/iptv/countries/us.m3u`

These are free, legal, public broadcast streams. Some will be offline at any given time — that is normal and good for testing error handling.

---

## UI Layout

Two-panel layout prioritizing usability:
- **Left sidebar:** Category/group list + Favorites + Recently Watched sections
- **Right main panel:** Channel list (logo + name + now-playing EPG info later)
- **Top bar:** Search input (real-time filter), source selector, settings

---

## Phases

### Phase 1 — Working Desktop Streamer (MVP)
**Goal: Load an M3U, find a channel, watch it.**

- [ ] Electron + Vite + React scaffold
- [ ] First-launch onboarding: enter M3U URL or pick local file
- [ ] Load and parse M3U in background with progress indicator
- [ ] Channel list: logo + name, flat list initially
- [ ] Real-time search/filter across all channels
- [ ] Category/group sidebar (group-title from M3U)
- [ ] Click channel → mpv launches and plays the stream
- [ ] Error handling for dead/failed streams
- [ ] Favorites: star any channel, persisted to disk
- [ ] Recently watched list
- [ ] Persist M3U source URL — reloads on next launch automatically

**Phase 1 is done when:** You can load the iptv-org playlist, search for a channel, click it, and it plays.

---

### Phase 2 — Chromecast ⬅ Early Priority
**Goal: Cast any stream to a Chromecast device on the local network.**

- [ ] mDNS discovery of Chromecast devices on local network
- [ ] Cast icon/button on currently selected channel
- [ ] Device picker UI when multiple devices found
- [ ] Send stream URL directly to Chromecast (no transcoding needed for most streams)
- [ ] In-app remote controls while casting: play/pause/stop/volume/seek
- [ ] Cast status indicator (what's playing, on which device)

---

### Phase 3 — Xtream Codes
**Goal: Support Xtream Codes as a first-class source alongside M3U.**

- [ ] Second source type: login form (host + username + password)
- [ ] Fetch live channel categories and streams via Xtream player API
- [ ] Fetch VOD categories, movies, series
- [ ] Series view: seasons and episodes
- [ ] Same channel browser UI reused — source type is transparent to UI
- [ ] VOD detail view: poster, description, play button

---

### Phase 4 — EPG (Electronic Program Guide)
**Goal: Know what's on without leaving the app.**

- [ ] XMLTV URL input (typically provided by IPTV provider alongside M3U)
- [ ] Parse and match programs to channels via tvg-id
- [ ] Now/Next badge on channel list items
- [ ] Full EPG grid view (TV guide style — channels as rows, time as columns)
- [ ] Program info overlay/tooltip while watching
- [ ] Auto-refresh EPG on schedule (configurable)
- [ ] Catch-up support where provider/stream supports it

---

### Phase 5 — Polish & Advanced Features
**Goal: Make it feel like a real product.**

- [ ] Embedded player — replace mpv separate window with in-app video (mpv --wid)
- [ ] Multiple saved playlist/source management
- [ ] Region/country filtering
- [ ] Custom channel ordering and renaming
- [ ] Stream quality selector (multi-bitrate streams)
- [ ] Stream recording (locally saved)
- [ ] Parental PIN lock for channels/categories
- [ ] Import/export settings and favorites
- [ ] System tray — minimize to tray, mini-player mode
- [ ] Keyboard shortcuts
- [ ] AirPlay support (macOS)
- [ ] DLNA/UPnP casting
- [ ] macOS and Linux polished builds
- [ ] Auto-update via electron-updater

---

## Monetization (Future Consideration)

If productized, a freemium model similar to TiviMate:
- **Free:** 1 playlist source, basic playback, search, favorites
- **Premium (~$8-15 one-time):** Multiple sources, Chromecast, EPG, catch-up, recording, advanced filters

---

## Reference Projects

- **IPTVnator** — `github.com/4gray/iptvnator` — closest open-source desktop equivalent; Electron + Angular
- **TiviMate** — gold standard IPTV UX; Android TV only
- **OTT Navigator** — excellent Android IPTV client; no desktop version
- **castv2** — `github.com/thibauts/node-castv2` — open-source Chromecast protocol implementation
