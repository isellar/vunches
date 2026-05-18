import { useEffect, useRef, useState } from 'react'
import { useStore } from './store/useStore'
import Sidebar from './components/Sidebar'
import ChannelList from './components/ChannelList'
import CatalogBrowser from './components/CatalogBrowser'
import ContentDetail from './components/ContentDetail'
import StreamPicker from './components/StreamPicker'
import Titlebar from './components/Titlebar'
import Setup from './components/Setup'
import Settings from './components/Settings'
import CastBar from './components/CastBar'
import LoadingScreen from './components/LoadingScreen'
import EpgGuide from './components/EpgGuide'

export default function App() {
  const {
    sources, setSources, setChannels, setLoading, setLoadError,
    isLoading, loadError, setFavorites, setRecentlyWatched,
    selectedDevice, selectDevice, setAggressiveReconnect, setCastDevices,
    setCastStatus, setCastError,
    setEpg, setEpgUrl, setEpgStatus, setEpgError, showGuide, setShowGuide,
    epgUrl, epgRefreshInterval,
    activeSourceId, setActiveSourceId,
    searchQuery, setSearchQuery,
    activeChannel, toggleFavorite, favorites,
    // VOD
    stremioAddons, setStremioAddons,
    setVodCatalog, setVodContentType, setVodView, vodView,
    setVodSearch, setVodHistory,
    updateTorrentStatus,
  } = useStore()

  const [initializing, setInitializing] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [loadProgress, setLoadProgress] = useState(null)
  const epgRefreshTimer = useRef(null)

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    window.electron.onPlaylistProgress(data => setLoadProgress(data))
    window.electron.onEpgProgress(data => {
      if (data.stage === 'done') setEpgStatus('ready')
      else if (data.stage !== 'cache') setEpgStatus('loading')
    })

    async function init() {
      const [savedSources, savedFavs, savedRecent, savedDevice, savedAggressive,
             savedEpgUrl, savedActiveId, savedRefresh, savedVodHistory, savedAddons] = await Promise.all([
        window.electron.store.get('sources'),
        window.electron.store.get('favorites'),
        window.electron.store.get('recentlyWatched'),
        window.electron.store.get('selectedDevice'),
        window.electron.store.get('aggressiveReconnect'),
        window.electron.store.get('epgUrl'),
        window.electron.store.get('activeSourceId'),
        window.electron.store.get('epgRefreshInterval'),
        window.electron.store.get('vodHistory'),
        window.electron.store.get('stremioAddons'),
      ])

      setSources(savedSources || [])
      setFavorites(savedFavs || [])
      setRecentlyWatched(savedRecent || [])
      setVodHistory(savedVodHistory || [])
      if (savedDevice) selectDevice(savedDevice)
      if (savedAggressive != null) setAggressiveReconnect(savedAggressive)
      if (savedEpgUrl) setEpgUrl(savedEpgUrl)
      if (savedRefresh) useStore.setState({ epgRefreshInterval: savedRefresh })

      // Stremio addons are global — ensure Cinemeta is always included for catalog browsing
      const CINEMETA = 'https://v3-cinemeta.strem.io'
      const addonsWithCatalog = savedAddons?.length
        ? (savedAddons.includes(CINEMETA) ? savedAddons : [CINEMETA, ...savedAddons])
        : []
      if (addonsWithCatalog.length) {
        setStremioAddons(addonsWithCatalog)
        if (addonsWithCatalog.length !== (savedAddons?.length || 0)) {
          window.electron.store.set('stremioAddons', addonsWithCatalog)
        }
        loadVodCatalogs(addonsWithCatalog)
      }

      // Clean up old stremio-type sources and load the active source
      const allSources = (savedSources || []).filter(s => s.type !== 'stremio' && s.url)
      if (allSources.length !== (savedSources || []).length) {
        // Persist the cleaned list
        setSources(allSources)
        window.electron.store.set('sources', allSources)
      }
      const activeId = savedActiveId || allSources[0]?.id || null
      if (activeId) setActiveSourceId(activeId)

      const source = allSources.find(s => s.id === activeId) || allSources[0]
      if (source) await loadSource(source)
      if (savedEpgUrl) loadEpg(savedEpgUrl)
      setInitializing(false)
    }
    init()

    // Cast
    window.electron.cast.startDiscovery().then(d => { if (d?.length) setCastDevices(d) })
    window.electron.cast.onDevicesUpdated(setCastDevices)
    window.electron.cast.onMediaStatus(s => {
      if (s.type === 'MEDIA_STATUS' && s.status?.[0]) {
        const ps = s.status[0].playerState
        if      (ps === 'PLAYING')                   setCastStatus('playing')
        else if (ps === 'PAUSED')                    setCastStatus('paused')
        else if (ps === 'IDLE' || ps === 'FINISHED') setCastStatus('idle')
      }
    })
    window.electron.cast.onDisconnected(() => setCastStatus('idle'))
    window.electron.cast.onReconnecting(() => setCastStatus('reconnecting'))
    window.electron.cast.onReconnected(()  => setCastStatus('playing'))
    window.electron.cast.onError(e => { setCastStatus('error'); setCastError(e) })

    // Torrent
    window.electron.onTorrentProgress(status => {
      updateTorrentStatus(status.infoHash, status)
    })

    return () => {
      window.electron.cast.offAll()
      window.electron.offPlaylistProgress()
      window.electron.offEpgProgress()
      window.electron.offTorrentProgress()
      window.electron.offTorrentError()
      if (epgRefreshTimer.current) clearInterval(epgRefreshTimer.current)
    }
  }, [])

  // ── EPG auto-refresh ──────────────────────────────────────────────────────
  useEffect(() => {
    if (epgRefreshTimer.current) clearInterval(epgRefreshTimer.current)
    if (!epgUrl || !epgRefreshInterval) return
    const ms = epgRefreshInterval * 60 * 60 * 1000
    epgRefreshTimer.current = setInterval(() => loadEpg(epgUrl), ms)
    return () => clearInterval(epgRefreshTimer.current)
  }, [epgUrl, epgRefreshInterval])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      const tag = e.target.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable

      if (e.key === '/' && !typing) {
        e.preventDefault()
        document.querySelector('input[placeholder^="Search"]')?.focus()
        return
      }

      if (typing) return

      if (e.key === 'Escape') {
        if (showGuide)       { setShowGuide(false); return }
        const view = useStore.getState().vodView
        if (view === 'stream-picker') { useStore.getState().setVodView('detail'); return }
        if (view === 'detail')        { useStore.getState().setVodView('catalog'); return }
        if (view === 'catalog')       { useStore.getState().setVodView('channels'); return }
        if (searchQuery)     { setSearchQuery(''); return }
        if (showSettings)    { setShowSettings(false); return }
      }
      if (e.key === 'g' || e.key === 'G') {
        if (useStore.getState().epgStatus === 'ready' && vodView === 'channels') setShowGuide(!showGuide)
      }
      if (e.key === 'f' || e.key === 'F') {
        const ch = useStore.getState().activeChannel
        if (ch) toggleFavorite(ch.url)
      }
      if (e.key === 'r' || e.key === 'R') {
        const s = useStore.getState().sources.find(s => s.id === useStore.getState().activeSourceId)
          || useStore.getState().sources[0]
        if (s) loadSource(s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showGuide, searchQuery, showSettings, vodView])

  // ── Load source ───────────────────────────────────────────────────────────
  async function loadSource(source) {
    if (!source || source.type === 'stremio' || !source.url) {
      // Skip stremio sources (now global) or sources without URLs
      if (source?.type === 'stremio') return
      setChannels([])
      return
    }
    setLoading(true)
    setLoadError(null)
    setLoadProgress(null)
    try {
      let channels, tvgUrlFromM3u = null

      if (source.type === 'xtream') {
        channels = await loadXtreamSource(source)
      } else {
        const result = await window.electron.loadPlaylist(source.url)
        channels = Array.isArray(result) ? result : result.channels
        tvgUrlFromM3u = Array.isArray(result) ? null : result.tvgUrl
      }

      setChannels(channels)
      setVodView('channels')

      // Auto-detect EPG if none set
      const currentEpg = useStore.getState().epgUrl
      if (!currentEpg) autoLoadEpg(source, tvgUrlFromM3u)

    } catch (err) {
      setLoadError(err.message || 'Failed to load playlist')
    } finally {
      setLoading(false)
      setLoadProgress(null)
    }
  }

  async function loadVodCatalogs(addonUrls) {
    if (!addonUrls?.length) return
    try {
      const result = await window.electron.stremioLoadAll({
        addonUrls,
        types: ['movie', 'series'],
      })
      if (result.error) return
      setVodContentType('all')
      setVodCatalog(result.metas || [])
    } catch {}
  }

  async function loadXtreamSource(source) {
    const [cats, streams] = await Promise.all([
      window.electron.xtreamFetch({ host: source.host, username: source.username, password: source.password, action: 'get_live_categories' }),
      window.electron.xtreamFetch({ host: source.host, username: source.username, password: source.password, action: 'get_live_streams' }),
    ])

    const catMap = {}
    if (Array.isArray(cats)) cats.forEach(c => { catMap[c.category_id] = c.category_name })

    return (Array.isArray(streams) ? streams : []).map(s => ({
      id: `xtream-${s.stream_id}`,
      name: s.name || 'Unknown',
      url: `${source.host.replace(/\/$/, '')}/live/${source.username}/${source.password}/${s.stream_id}.ts`,
      tvgId: s.epg_channel_id || String(s.stream_id),
      tvgLogo: s.stream_icon || '',
      group: { title: catMap[s.category_id] || 'Uncategorized' },
    }))
  }

  async function autoLoadEpg(source, tvgUrlFromHeader) {
    let url = tvgUrlFromHeader
    if (!url && source.type === 'm3u') url = await window.electron.detectEpgUrl(source.url)
    if (!url && source.type === 'xtream') {
      url = `${source.host.replace(/\/$/, '')}/xmltv.php?username=${source.username}&password=${source.password}`
    }
    if (!url) return
    setEpgUrl(url)
    await window.electron.store.set('epgUrl', url)
    loadEpg(url)
  }

  async function loadEpg(url) {
    setEpgStatus('loading')
    setEpgError(null)
    try {
      const data = await window.electron.loadEpg(url)
      setEpg(data)
      setEpgStatus('ready')
    } catch (err) {
      setEpgStatus('error')
      setEpgError(err.message)
    }
  }

  async function handleAddSource(source) {
    const updated = [...sources, source]
    setSources(updated)
    setActiveSourceId(source.id)
    await window.electron.store.set('sources', updated)
    await window.electron.store.set('activeSourceId', source.id)
    await loadSource(source)
  }

  const activeSource = sources.find(s => s.id === activeSourceId) || sources[0]

  // ── Render ────────────────────────────────────────────────────────────────
  if (initializing) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0f0f0f]">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    )
  }

  if (sources.length === 0) return <Setup onAdd={handleAddSource} />

  return (
    <div className="flex flex-col h-screen bg-[#0f0f0f] text-gray-100 select-none">
      <Titlebar
        onReload={() => activeSource && loadSource(activeSource)}
        onOpenSettings={() => setShowSettings(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {isLoading && <LoadingScreen progress={loadProgress} />}
          {loadError && !isLoading && (
            <div className="flex items-center justify-center flex-1">
              <div className="text-center">
                <p className="text-red-400 mb-2 font-medium">Failed to load</p>
                <p className="text-gray-500 text-sm mb-4">{loadError}</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => activeSource && loadSource(activeSource)}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-sm transition-colors">
                    Retry
                  </button>
                  <button onClick={() => setShowSettings(true)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded text-sm transition-colors">
                    Settings
                  </button>
                </div>
              </div>
            </div>
          )}
          {!isLoading && !loadError && vodView === 'channels' && <ChannelList />}
          {!isLoading && !loadError && vodView === 'catalog' && <CatalogBrowser />}
          {!isLoading && !loadError && vodView === 'detail' && <ContentDetail />}
          {!isLoading && !loadError && vodView === 'stream-picker' && <StreamPicker />}
          {showGuide && vodView === 'channels' && <EpgGuide />}
        </main>
      </div>

      <CastBar />

      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          onLoadSource={(source) => loadSource(source)}
          onLoadEpg={(url) => loadEpg(url)}
        />
      )}
    </div>
  )
}
