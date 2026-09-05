# Vunches — Manual Testing Checklist

Run `npm run dev` in the vunches folder to launch, or use the Desktop shortcut.

---

## 1. First Launch / Setup

- [ ] App opens without errors
- [ ] Setup screen appears (VUNCHES logo, M3U URL field)
- [ ] "Use IPTV-org public playlist" quick-fill button populates the URL
- [ ] Submitting an invalid URL shows an error message
- [ ] Entering a valid M3U URL loads the playlist and transitions to main UI
- [ ] Channel count appears in toolbar after loading

---

## 2. Channel List

- [ ] Channels display with logo, name, and group subtitle
- [ ] Logos load (some may be broken/missing — fallback TV icon should appear)
- [ ] Scrolling through a large list (10k+ channels) stays smooth (virtual scrolling)
- [ ] Clicking a channel highlights it with a purple left border
- [ ] Now-playing animated bars appear on the active channel row
- [ ] Hovering a row shows the heart (favorite) icon
- [ ] Clicking heart favorites the channel (icon stays pink when favorited)
- [ ] Clicking heart again un-favorites it
- [ ] Dead/failed streams show "unavailable" label and greyed-out row

---

## 3. Search

- [ ] Clicking the search bar or pressing `/` focuses it
- [ ] Typing filters the channel list in real time
- [ ] Search matches channel names (case-insensitive)
- [ ] Header shows "Results for X" and filtered count
- [ ] X button clears search
- [ ] Pressing `Escape` clears search when search bar is not focused

---

## 4. Sidebar / Categories

- [ ] "All Channels" shows full list with correct count
- [ ] "Favorites" shows only favorited channels
- [ ] "Recently Watched" shows last 20 watched channels in order
- [ ] Category list is populated from group-title tags in M3U
- [ ] Clicking a category filters the channel list to that group
- [ ] Active category is highlighted purple

---

## 5. Playback (mpv)

- [ ] With no Chromecast device selected, clicking a channel opens mpv
- [ ] mpv plays the stream (live channels — some may be offline)
- [ ] Channel title appears in mpv window title bar
- [ ] A dead/broken stream: mpv closes quickly and channel shows "unavailable"
- [ ] Clicking a different channel while mpv is open launches a new mpv window

---

## 6. Settings — Sources Tab

- [ ] Gear icon opens Settings panel (right slide-in)
- [ ] Clicking backdrop closes Settings
- [ ] "Sources" tab is default
- [ ] Existing source appears with M3U badge, name, and URL
- [ ] "Load" button on a non-active source switches to it and loads channels
- [ ] Edit (pencil) button opens the M3U form pre-filled
- [ ] Delete (trash) button removes the source after confirmation
- [ ] "Add M3U" button opens blank M3U form
- [ ] "Add Xtream" button opens Xtream Codes form
- [ ] M3U form: entering a URL and submitting loads the playlist and closes settings
- [ ] Xtream form: entering wrong credentials shows error "Invalid username or password"
- [ ] Xtream form: entering correct credentials loads channels
- [ ] Multiple sources can coexist in the list

---

## 7. Settings — EPG Tab

- [ ] EPG tab shows XMLTV URL field
- [ ] If auto-detected, "Auto-detected" label appears and URL is pre-filled
- [ ] Manually entering an XMLTV URL and clicking "Load EPG" starts loading
- [ ] After load, status shows "Guide data loaded — X channels"
- [ ] "Clear" button removes EPG data and resets status
- [ ] Auto-refresh interval buttons (2h/4h/6h/12h/24h) are selectable
- [ ] Active interval button is highlighted

---

## 8. EPG — Now/Next on Channel List

- [ ] After EPG loads, channel rows show "Now" or "Next" with programme title
- [ ] "Now" badge is purple, "Next" is grey
- [ ] Progress bar appears under "Now" badge showing % through current programme
- [ ] Channels with no EPG match show no badge (not an error)

---

## 9. TV Guide

- [ ] "Guide" button appears in toolbar once EPG is loaded
- [ ] Clicking Guide button opens full-screen TV guide overlay
- [ ] Guide shows channels as rows with names and logos on the left
- [ ] Time header scrolls horizontally
- [ ] Current time is marked with a vertical purple line
- [ ] Current programmes are highlighted with purple background
- [ ] Past programmes are dimmer
- [ ] Clicking a programme slot plays that channel
- [ ] Clicking a channel name plays that channel
- [ ] Progress bar at bottom of current programme block shows how far through
- [ ] Time labels appear every 30 minutes
- [ ] Guide scrolls horizontally to "now" on open
- [ ] `G` key toggles guide open/closed
- [ ] `Escape` key closes guide
- [ ] Close (×) button closes guide

---

## 10. Chromecast

- [ ] Cast bar appears at the bottom of the app
- [ ] "Scanning for devices..." spinner appears briefly on launch
- [ ] Known Chromecast devices appear in the device dropdown within ~5 seconds
- [ ] Device names are readable (not hex strings)
- [ ] Selecting a device from dropdown puts app into "cast mode"
- [ ] "Ready — click a channel to cast to [Device]" message appears
- [ ] Clicking a channel while a device is selected casts the stream (not mpv)
- [ ] Cast bar shows "Connecting to [Device]..." spinner
- [ ] Once playing: animated bars, channel name, device name appear in cast bar
- [ ] Pause button pauses on the TV
- [ ] Play/resume button resumes
- [ ] Stop button stops casting and resets to idle
- [ ] Volume slider changes TV volume
- [ ] Deselecting device (choose "Select cast device...") returns to mpv mode
- [ ] Auto-reconnect toggle on the right side of cast bar
  - [ ] OFF: if stream disconnects, stays disconnected
  - [ ] ON: if stream disconnects, "Reconnecting..." appears and retries every 3s
- [ ] Device selection persists between app restarts
- [ ] On a machine with multiple network interfaces/subnets (e.g. Wi-Fi + Ethernet, or a VPN active), casting still selects the correct LAN IP and connects
- [ ] Casting a stream whose URL 302-redirects (common with Xtream sources) plays correctly, not a redirect error
- [ ] Rapidly switching between two Chromecast devices in the dropdown ends up casting to the *last* selected device, not a stale one

---

## 11. Stremio Addons & VOD/Torrent Playback

**Settings → Addons tab**
- [ ] Cinemeta is always present in the addon list and cannot be removed
- [ ] Quick-add chips exist for Cinemeta, Torrentio, and Comet and populate the URL field
- [ ] Entering an addon manifest URL and leaving the field shows a loading indicator (`...`), then a green check (valid) or red X (invalid)
- [ ] Saving with an invalid/unreachable addon URL is still allowed (not blocked)
- [ ] "Save Addons" button reads "Saving..." while in progress
- [ ] On successful save, catalogs reload and the modal closes
- [ ] If reloading catalogs fails after save, the modal stays open and shows an error message instead of closing

**Catalog Browser**
- [ ] "All" / "Movies" / "Series" filter tabs switch the displayed content
- [ ] Item count is shown and updates with the active filter
- [ ] Empty state (no addons return content) shows a "No content found" message
- [ ] Empty state when addons have content but the current filter excludes it all shows the additional hint "Try changing the content filter"
- [ ] "Load More" button loads the next page (30 items) and shows "Loading..." while fetching
- [ ] If pagination fails, "Load More" disappears without an error toast (expected — not a crash)

**Content Detail**
- [ ] Opening an item shows "Loading details..." briefly, then poster/backdrop, title, and description
- [ ] Movies show a "Play" button
- [ ] Series show season tabs and a per-season episode list; clicking an episode plays it directly
- [ ] A broken poster/backdrop image falls back gracefully (icon or hidden), not a broken-image icon

**Stream Picker**
- [ ] Streams list shows quality badge (4K/1080p/720p/SD/raw), addon name, size (if known), and a type icon (torrent = orange, YouTube = red, direct/other = blue)
- [ ] Empty state shows "No streams available" with a hint to add more addons in Settings
- [ ] Clicking "Play" shows "Starting..." while resolving
- [ ] A torrent with no peers found within ~30s shows a clear error (e.g. "No peers found for torrent")
- [ ] A torrent with no recognizable video file shows an error (e.g. "No playable file found in torrent")
- [ ] During torrent buffering/peer discovery, note whether any progress/percentage indicator is visible to the user (may currently be missing — report if so)
- [ ] A successfully resolved torrent or direct stream starts playback in mpv/cast as expected

---

## 12. CLI (`vunches` command)

Run these from a terminal with the CLI installed/linked (`vunches <command>`).

- [ ] Running `vunches` with no arguments prints help/usage text listing all commands
- [ ] An unknown command (e.g. `vunches bogus`) prints help/usage text
- [ ] `vunches devices` scans for ~10s and prints discovered Chromecast devices (name + host:port), or "No Chromecast devices found."
- [ ] `vunches channels` lists all channels from the active source with total count
- [ ] `vunches channels <query>` filters by name/id/tvg-id and prints match count
- [ ] `vunches channels --category <name>` filters by group title
- [ ] `vunches channels --limit <n>` caps the number of results shown
- [ ] `vunches channels --verbose` additionally prints tvg-id and stream URL per channel
- [ ] `vunches watch <name>` launches mpv for the best fuzzy match; ambiguous matches print a "Multiple matches for ... using closest" note
- [ ] `vunches cast <name>` with no `--device` uses the saved device, or scans and casts to the first device found if none saved
- [ ] `vunches cast <name> --device <name>` targets a specific device by name/host match
- [ ] `vunches cast` with no devices available prints "No Chromecast devices found. Use --device <name> to specify." and exits non-zero
- [ ] `vunches stop` / `pause` / `resume` control the active cast session; `pause`/`resume` print "No active cast session." when nothing is casting
- [ ] `vunches volume <0-100>` sets and confirms the cast volume; out-of-range values are clamped
- [ ] `vunches sources` (no args) lists configured sources with an active-source marker (►), type badge ([M3U]/[XC]), id, and URL
- [ ] `vunches sources add --type m3u --url <url> --name <name>` adds an M3U source
- [ ] `vunches sources add --type xtream --host <url> --user <u> --pass <p> --name <name>` validates credentials before adding; invalid credentials print an error and exit non-zero
- [ ] `vunches sources add` without `--name` (or required type-specific flags) prints a usage error and exits non-zero
- [ ] `vunches sources use <id>` switches the active source; `sources remove <id>` removes it (and clears active-source if it was active)
- [ ] `vunches reload` re-fetches the current playlist and prints "Done."
- [ ] `vunches favorites` / `favorites add --url <url>` / `favorites remove --url <url>` list/add/remove favorites
- [ ] `vunches recent` lists recently watched channels, most recent first
- [ ] `vunches config` prints the current config as JSON with any stored Xtream `password` fields redacted

---

## 13. Keyboard Shortcuts

- [ ] `/` — focuses search bar from anywhere
- [ ] `Escape` — clears search (when search bar not focused)
- [ ] `Escape` — closes TV guide (when guide is open)
- [ ] `Escape` — closes settings panel (when open)
- [ ] `G` — toggles TV guide (when EPG loaded)
- [ ] `F` — toggles favorite on currently active channel
- [ ] `R` — reloads the current playlist

---

## 14. Persistence (restart the app between these)

- [ ] Playlist source reloads automatically on restart (no re-entry needed)
- [ ] Previously favorited channels are still favorited
- [ ] Recently watched list is preserved
- [ ] Selected Chromecast device is remembered
- [ ] Auto-reconnect toggle state is remembered
- [ ] EPG URL is remembered and EPG reloads on launch
- [ ] Active category selection resets to "All" on restart (expected)

---

## 15. Import / Export (Settings → General tab)

- [ ] "Export settings & favorites..." opens a Save dialog
- [ ] Exported JSON file contains sources, favorites, EPG URL
- [ ] "Import settings..." opens a file picker
- [ ] Importing a valid backup restores sources and favorites
- [ ] Importing an invalid file shows an error message

---

## 16. Performance

- [ ] App launches to usable state in under 3 seconds (with cached playlist)
- [ ] Searching 30k+ channels is instant (no lag)
- [ ] Scrolling large channel list (10k+) is smooth
- [ ] Loading a new playlist shows progress bar with channel count and MB
- [ ] Loading from cache is near-instant with "Loading from cache" message

---

## 17. Linux-Specific

Run these on a Linux build (`npm run dev` or the packaged AppImage) alongside a Windows pass, since several subsystems branch by `process.platform`.

- [ ] Window shows the native OS titlebar (min/max/close via window manager decorations), not the custom overlay used on Windows
- [ ] The in-app toolbar row (logo, search, Guide/Reload/Settings buttons) doesn't visually collide or duplicate controls with the native titlebar above it
- [ ] Window snapping, resizing, and double-click-to-maximize work correctly via native decorations
- [ ] On a machine with no `mpv` installed (not in `/usr/bin`, `/usr/local/bin`, `/snap/bin`, or `PATH`), clicking a channel fails with a visible error — note the exact wording shown, since the underlying error may just be a generic spawn failure rather than a "please install mpv" message
- [ ] On a machine with no `ffmpeg` installed, attempting to cast (which requires the HLS proxy) either shows a clear error or — note if it instead fails silently with no feedback, since the code path currently only logs a console warning
- [ ] With a local firewall enabled (ufw/firewalld), casting still works, or if blocked, note whether the app gives any indication of why (no automatic firewall rule is added on Linux for the HLS proxy port, unlike Windows)
- [ ] Config/data is stored under `~/.config/vunches` (or `$XDG_CONFIG_HOME/vunches`), not a Windows-style path
- [ ] The packaged AppImage launches directly and has a reasonable app icon (may currently fall back to the default Electron icon — note as a known issue rather than a regression if so)

---

## 18. Error Handling

- [ ] Invalid M3U URL shows "Failed to load playlist" with Retry/Settings buttons
- [ ] Network timeout on playlist fetch shows error (not a hang)
- [ ] Dead stream shows "unavailable" on the channel row, not a crash
- [ ] Chromecast connection failure shows error in cast bar with Dismiss button
- [ ] EPG load failure shows error status in EPG settings tab

---

## Known Non-Issues (expected behavior)

- Console errors about "Autofill.enable" — harmless Electron DevTools warning, ignore
- "Unable to move the cache: Access is denied" — harmless GPU cache error, ignore
- Some channels show broken logo images — normal, providers have outdated logos
- Some live streams are offline — normal for public IPTV playlists
- Hex-string device names in Chromecast list — devices not broadcasting a friendly name
- `local` appearing in Chromecast list — fixed with recent update, may need restart

---

## Bugs to Report

If you find any issues, note:
1. What you did (steps to reproduce)
2. What you expected
3. What actually happened
4. Any error shown in the app or in the terminal

---

*Last updated: 2026-09-05*
