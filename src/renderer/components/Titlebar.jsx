import { useStore } from '../store/useStore'

export default function Titlebar({ onReload, onOpenSettings }) {
  const {
    searchQuery, setSearchQuery, channels, showGuide, setShowGuide, epgStatus,
    vodSearch, setVodSearch, vodView, stremioAddons, setStremioResults, setVodCatalog,
  } = useStore()

  async function handleSearch(val) {
    if (vodView === 'catalog') {
      // VOD mode: filter local catalog by name
      setVodSearch(val)
      return
    }

    // Channel mode: filter channels locally + query stremio
    setSearchQuery(val)

    if (val.trim() && stremioAddons?.length) {
      try {
        const result = await window.electron.stremioSearch({
          addonUrls: stremioAddons,
          query: val,
          types: ['movie', 'series'],
        })
        setStremioResults(result.metas || [])
      } catch {
        setStremioResults([])
      }
    } else {
      setStremioResults([])
    }
  }

  function handleClear() {
    if (vodView === 'catalog') {
      setVodSearch('')
    } else {
      setSearchQuery('')
      setStremioResults([])
    }
  }

  const searchValue = vodView === 'catalog' ? vodSearch : searchQuery
  const itemCount = vodView === 'catalog'
    ? useStore.getState().getFilteredCatalog().length
    : channels.length

  return (
    <div className="flex-shrink-0 bg-[#0f0f0f] border-b border-white/5">

      <div className="drag-region flex items-center h-9 px-4">
        <span className="no-drag text-purple-400 font-bold text-sm tracking-widest select-none">
          VUNCHES
        </span>
      </div>

      <div className="flex items-center gap-2 px-3 pb-2.5">

        <div className="no-drag relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={vodView === 'catalog' ? "Search catalog..." : "Search channels & movies..."}
            value={searchValue}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full bg-white/5 text-sm text-gray-200 placeholder-gray-600
                       rounded-lg pr-8 py-1.5 outline-none border border-white/8
                       focus:border-purple-500/50 focus:bg-white/7 transition-colors"
            style={{ paddingLeft: '2rem' }}
          />
          {searchValue && (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center
                         justify-center text-gray-500 hover:text-gray-200 rounded transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <span className="text-gray-600 text-xs flex-shrink-0 tabular-nums px-1">
          {itemCount.toLocaleString()}
        </span>

        <div className="w-px h-4 bg-white/8 flex-shrink-0" />

        {vodView === 'channels' && epgStatus === 'ready' && (
          <ToolbarButton
            onClick={() => setShowGuide(!showGuide)}
            title="TV Guide"
            active={showGuide}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
            label="Guide"
          />
        )}

        <ToolbarButton
          onClick={onReload}
          title={vodView === 'catalog' ? "Reload catalog" : "Reload playlist"}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          }
          label="Reload"
        />

        <ToolbarButton
          onClick={onOpenSettings}
          title="Settings"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
          label="Settings"
        />
      </div>
    </div>
  )
}

function ToolbarButton({ onClick, title, icon, label, active = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`no-drag flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs
                  flex-shrink-0 transition-colors
                  ${active
                    ? 'text-purple-300 bg-purple-600/20 hover:bg-purple-600/30'
                    : 'text-gray-500 hover:text-gray-200 hover:bg-white/6'}`}
    >
      {icon}
      {label && <span className="hidden md:block">{label}</span>}
    </button>
  )
}
