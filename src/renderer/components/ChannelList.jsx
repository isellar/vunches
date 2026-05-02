import { useCallback, useState } from 'react'
import { useStore } from '../store/useStore'

export default function ChannelList() {
  const { getFilteredChannels, activeChannel, setActiveChannel, favorites, toggleFavorite, searchQuery, selectedCategory } = useStore()
  const channels = getFilteredChannels()
  const [mpvError, setMpvError] = useState(false)

  const handlePlay = useCallback(async (channel) => {
    setActiveChannel(channel)
    setMpvError(false)
    const result = await window.electron?.playStream(channel.url, channel.name)
    if (result && !result.launched) setMpvError(true)
  }, [setActiveChannel])

  const empty = channels.length === 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* mpv not found banner */}
      {mpvError && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-900/40 border-b border-amber-700/40 text-amber-300 text-sm flex-shrink-0">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span>mpv not found. Install it with: <code className="bg-black/30 px-1 rounded">winget install shinchiro.mpv</code></span>
          <button onClick={() => setMpvError(false)} className="ml-auto text-amber-500 hover:text-amber-300">×</button>
        </div>
      )}
      {/* List header */}
      <div className="flex items-center px-4 py-2 border-b border-white/5 flex-shrink-0">
        <h2 className="text-sm font-medium text-gray-300">
          {searchQuery
            ? `Results for "${searchQuery}"`
            : selectedCategory}
        </h2>
        <span className="ml-2 text-xs text-gray-600">
          {channels.length.toLocaleString()} channel{channels.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Channel rows */}
      <div className="flex-1 overflow-y-auto">
        {empty ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            <p className="text-sm">No channels found</p>
          </div>
        ) : (
          channels.map((channel) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              isActive={activeChannel?.url === channel.url}
              isFavorite={favorites.includes(channel.url)}
              onPlay={() => handlePlay(channel)}
              onToggleFavorite={() => toggleFavorite(channel.url)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ChannelRow({ channel, isActive, isFavorite, onPlay, onToggleFavorite }) {
  const [imgError, setImgError] = useState(false)

  return (
    <div
      onDoubleClick={onPlay}
      onClick={onPlay}
      className={`flex items-center px-4 py-2.5 cursor-pointer group transition-colors border-b border-white/3
        ${isActive
          ? 'bg-purple-600/15 border-l-2 border-l-purple-500'
          : 'hover:bg-white/5 border-l-2 border-l-transparent'
        }`}
    >
      {/* Logo */}
      <div className="w-8 h-8 flex-shrink-0 rounded overflow-hidden bg-white/5 flex items-center justify-center mr-3">
        {channel.tvgLogo && !imgError ? (
          <img
            src={channel.tvgLogo}
            alt=""
            className="w-full h-full object-contain"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <svg className="w-4 h-4 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
            <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/>
          </svg>
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${isActive ? 'text-purple-200 font-medium' : 'text-gray-200'}`}>
          {channel.name}
        </p>
        {channel.group?.title && (
          <p className="text-xs text-gray-600 truncate">{channel.group.title}</p>
        )}
      </div>

      {/* Now playing indicator */}
      {isActive && (
        <div className="flex items-center gap-0.5 mr-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-0.5 bg-purple-400 rounded animate-pulse"
              style={{
                height: `${8 + i * 4}px`,
                animationDelay: `${i * 0.15}s`,
                animationDuration: '0.8s',
              }}
            />
          ))}
        </div>
      )}

      {/* Favorite button */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
        className={`flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity
          ${isFavorite ? '!opacity-100 text-pink-400' : 'text-gray-600 hover:text-pink-400'}`}
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
