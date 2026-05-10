import { useCallback, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore } from '../store/useStore'
import { NowNextBadge } from './NowNext'

export default function ChannelList() {
  const {
    getFilteredChannels, activeChannel, setActiveChannel,
    favorites, toggleFavorite, searchQuery, selectedCategory,
    selectedDevice, setCastStatus, setCastError, aggressiveReconnect,
    epgStatus, showGuide,
  } = useStore()

  const channels = getFilteredChannels()
  const [mpvError, setMpvError] = useState(null)
  const [deadStreams, setDeadStreams] = useState({})

  const hasEpg = epgStatus === 'ready'
  const ROW_HEIGHT = hasEpg ? 78 : 68

  const parentRef = useRef(null)

  const virtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const handlePlay = useCallback(async (channel) => {
    setActiveChannel(channel)
    setMpvError(null)

    // Always read fresh state to avoid stale closure
    const { selectedDevice: device, aggressiveReconnect: aggressive,
            setCastStatus: setCS, setCastError: setCE } = useStore.getState()

    // If a Chromecast device is selected, cast instead of opening mpv
    if (device) {
      setCS('connecting')
      setCE(null)
      const result = await window.electron.cast.play({
        ...device,
        url: channel.url,
        title: channel.name,
        aggressive,
      })
      if (result?.ok) {
        setCS('playing')
      } else {
        setCS('error')
        setCE(result?.error || 'Cast failed')
      }
      return
    }

    // Otherwise open in mpv
    const result = await window.electron?.playStream(channel.url, channel.name)
    if (result && !result.launched) {
      setMpvError(result.error || 'mpv failed to launch')
    } else if (result && result.error) {
      setDeadStreams((prev) => ({ ...prev, [channel.url]: true }))
    }
  }, [setActiveChannel])

  const empty = channels.length === 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Error banner */}
      {mpvError !== null && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-900/40 border-b border-amber-700/40 text-amber-300 text-sm flex-shrink-0">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="truncate">{mpvError}</span>
          <button onClick={() => setMpvError(null)} className="ml-auto flex-shrink-0 text-amber-500 hover:text-amber-300 text-lg leading-none">×</button>
        </div>
      )}

      {/* List header */}
      <div className="flex items-center px-5 py-3 border-b border-white/5 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-200">
          {searchQuery ? `Results for "${searchQuery}"` : selectedCategory}
        </h2>
        <span className="ml-2.5 text-xs text-gray-600 tabular-nums">
          {channels.length.toLocaleString()} channel{channels.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Virtual channel list */}
      {empty ? (
        <div className="flex flex-col items-center justify-center flex-1 text-gray-600">
          <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          <p className="text-sm">No channels found</p>
        </div>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-y-auto">
          <div
            style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const channel = channels[virtualRow.index]
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: `${ROW_HEIGHT}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ChannelRow
                    channel={channel}
                    isActive={activeChannel?.url === channel.url}
                    isFavorite={favorites.includes(channel.url)}
                    isDead={!!deadStreams[channel.url]}
                    hasEpg={hasEpg}
                    onPlay={() => handlePlay(channel)}
                    onToggleFavorite={() => toggleFavorite(channel.url)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ChannelRow({ channel, isActive, isFavorite, isDead, hasEpg, onPlay, onToggleFavorite }) {
  const [imgError, setImgError] = useState(false)

  return (
    <div
      onClick={onPlay}
      className={`flex items-center px-5 h-full cursor-pointer group transition-colors border-b border-white/[0.04]
        ${isDead ? 'opacity-35' : ''}
        ${isActive
          ? 'bg-purple-600/15 border-l-[3px] border-l-purple-500'
          : 'hover:bg-white/[0.04] border-l-[3px] border-l-transparent'
        }`}
    >
      {/* Logo */}
      <div className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center mr-4">
        {channel.tvgLogo && !imgError ? (
          <img
            src={channel.tvgLogo}
            alt=""
            className="w-full h-full object-contain p-0.5"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
            <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z" />
          </svg>
        )}
      </div>

      {/* Name + group + now/next */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <p className={`text-sm font-medium truncate leading-snug
          ${isActive ? 'text-purple-200' : 'text-gray-100'}`}>
          {channel.name}
          {isDead && <span className="ml-2 text-xs font-normal text-red-500/60">unavailable</span>}
        </p>
        {!hasEpg && channel.group?.title && (
          <p className="text-xs text-gray-500 truncate">{channel.group.title}</p>
        )}
        {hasEpg && <NowNextBadge tvgId={channel.tvgId} />}
      </div>

      {/* Now playing bars */}
      {isActive && !isDead && (
        <div className="flex items-end gap-[3px] mr-4 h-5">
          {[1, 2, 3, 2].map((h, i) => (
            <div
              key={i}
              className="w-[3px] bg-purple-400 rounded-full animate-pulse"
              style={{
                height: `${6 + h * 3}px`,
                animationDelay: `${i * 0.12}s`,
                animationDuration: '0.9s',
              }}
            />
          ))}
        </div>
      )}

      {/* Favorite button */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
        className={`flex-shrink-0 p-1.5 rounded-lg transition-all
          opacity-0 group-hover:opacity-100
          ${isFavorite ? '!opacity-100 text-pink-400 hover:text-pink-300' : 'text-gray-600 hover:text-pink-400 hover:bg-white/5'}`}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <svg className="w-4 h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </button>
    </div>
  )
}
