import { useEffect, useState } from 'react'
import { useStore } from './store/useStore'
import Sidebar from './components/Sidebar'
import ChannelList from './components/ChannelList'
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
    setEpg, setEpgUrl, setEpgStatus, setEpgError, showGuide,
  } = useStore()

  const [initializing, setInitializing] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [loadProgress, setLoadProgress] = useState(null)

  useEffect(() => {
    window.electron.onPlaylistProgress((data) => setLoadProgress(data))
    window.electron.onEpgProgress((data) => {
      if (data.stage === 'done') setEpgStatus('ready')
      else if (data.stage !== 'cache') setEpgStatus('loading')
    })

    async function init() {
      const [savedSources, savedFavorites, savedRecent, savedDevice, savedAggressive, savedEpgUrl] =
        await Promise.all([
          window.electron.store.get('sources'),
          window.electron.store.get('favorites'),
          window.electron.store.get('recentlyWatched'),
          window.electron.store.get('selectedDevice'),
          window.electron.store.get('aggressiveReconnect'),
          window.electron.store.get('epgUrl'),
        ])

      setSources(savedSources || [])
      setFavorites(savedFavorites || [])
      setRecentlyWatched(savedRecent || [])
      if (savedDevice) selectDevice(savedDevice)
      if (savedAggressive != null) setAggressiveReconnect(savedAggressive)
      if (savedEpgUrl) setEpgUrl(savedEpgUrl)

      if (savedSources?.length > 0) await loadSource(savedSources[0])
      if (savedEpgUrl) loadEpg(savedEpgUrl)
      setInitializing(false)
    }
    init()

    // Cast discovery + events
    window.electron.cast.startDiscovery().then(devices => {
      if (devices?.length) setCastDevices(devices)
    })
    window.electron.cast.onDevicesUpdated(setCastDevices)
    window.electron.cast.onMediaStatus((s) => {
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
    window.electron.cast.onError((e)       => { setCastStatus('error'); setCastError(e) })

    return () => {
      window.electron.cast.offAll()
      window.electron.offPlaylistProgress()
      window.electron.offEpgProgress()
    }
  }, [])

  async function loadSource(source) {
    setLoading(true)
    setLoadError(null)
    setLoadProgress(null)
    try {
      const result = await window.electron.loadPlaylist(source.url)
      // Handle both old (array) and new ({ channels, tvgUrl }) shapes
      const channels = Array.isArray(result) ? result : result.channels
      const tvgUrlFromM3u = Array.isArray(result) ? null : result.tvgUrl
      setChannels(channels)

      // Auto-load EPG if we don't already have one configured
      const currentEpgUrl = useStore.getState().epgUrl
      if (!currentEpgUrl) {
        autoLoadEpg(source.url, tvgUrlFromM3u)
      }
    } catch (err) {
      setLoadError(err.message || 'Failed to load playlist')
    } finally {
      setLoading(false)
      setLoadProgress(null)
    }
  }

  async function autoLoadEpg(m3uUrl, tvgUrlFromHeader) {
    // 1. Use tvg-url from M3U header if present
    // 2. Otherwise probe common URL patterns
    let epgUrl = tvgUrlFromHeader
    if (!epgUrl) {
      epgUrl = await window.electron.detectEpgUrl(m3uUrl)
    }
    if (!epgUrl) return

    // Save and load it
    setEpgUrl(epgUrl)
    await window.electron.store.set('epgUrl', epgUrl)
    loadEpg(epgUrl)
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
    const updated = [source]
    setSources(updated)
    await window.electron.store.set('sources', updated)
    await loadSource(source)
  }

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
        onReload={() => loadSource(sources[0])}
        onOpenSettings={() => setShowSettings(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {isLoading && (
            <LoadingScreen progress={loadProgress} />
          )}
          {loadError && !isLoading && (
            <div className="flex items-center justify-center flex-1">
              <div className="text-center">
                <p className="text-red-400 mb-2 font-medium">Failed to load playlist</p>
                <p className="text-gray-500 text-sm">{loadError}</p>
                <div className="flex gap-3 justify-center mt-4">
                  <button onClick={() => loadSource(sources[0])}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-sm transition-colors">
                    Retry
                  </button>
                  <button onClick={() => setShowSettings(true)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded text-sm transition-colors">
                    Change playlist
                  </button>
                </div>
              </div>
            </div>
          )}
          {!isLoading && !loadError && <ChannelList />}
          {showGuide && <EpgGuide />}
        </main>
      </div>

      <CastBar />

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  )
}
