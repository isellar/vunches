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

---

## 11. Keyboard Shortcuts

- [ ] `/` — focuses search bar from anywhere
- [ ] `Escape` — clears search (when search bar not focused)
- [ ] `Escape` — closes TV guide (when guide is open)
- [ ] `Escape` — closes settings panel (when open)
- [ ] `G` — toggles TV guide (when EPG loaded)
- [ ] `F` — toggles favorite on currently active channel
- [ ] `R` — reloads the current playlist

---

## 12. Persistence (restart the app between these)

- [ ] Playlist source reloads automatically on restart (no re-entry needed)
- [ ] Previously favorited channels are still favorited
- [ ] Recently watched list is preserved
- [ ] Selected Chromecast device is remembered
- [ ] Auto-reconnect toggle state is remembered
- [ ] EPG URL is remembered and EPG reloads on launch
- [ ] Active category selection resets to "All" on restart (expected)

---

## 13. Import / Export (Settings → General tab)

- [ ] "Export settings & favorites..." opens a Save dialog
- [ ] Exported JSON file contains sources, favorites, EPG URL
- [ ] "Import settings..." opens a file picker
- [ ] Importing a valid backup restores sources and favorites
- [ ] Importing an invalid file shows an error message

---

## 14. Performance

- [ ] App launches to usable state in under 3 seconds (with cached playlist)
- [ ] Searching 30k+ channels is instant (no lag)
- [ ] Scrolling large channel list (10k+) is smooth
- [ ] Loading a new playlist shows progress bar with channel count and MB
- [ ] Loading from cache is near-instant with "Loading from cache" message

---

## 15. Error Handling

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

*Last updated: 2026-05-02*
