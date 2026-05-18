import { useState } from 'react'
import { useStore } from '../store/useStore'

export default function StreamPicker() {
  const {
    vodStreams, vodSelected, setVodView, addVodToHistory,
    vodActiveStream, setVodActiveStream,
  } = useStore()
  const [playing, setPlaying] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [error, setError] = useState('')

  const selected = vodStreams[selectedIdx] || null

  async function handlePlay() {
    if (!selected || playing) return
    setPlaying(true)
    setError('')
    try {
      let playUrl

      if (selected.url) {
        playUrl = selected.url
      } else if (selected.infoHash) {
        const result = await window.electron.torrentCreateStream({
          infoHash: selected.infoHash,
          fileIdx: selected.fileIdx,
        })
        if (!result.ok) throw new Error(result.error || 'Torrent failed')
        playUrl = result.url
      } else if (selected.ytId) {
        playUrl = `https://www.youtube.com/watch?v=${selected.ytId}`
      }

      if (!playUrl) throw new Error('No playable URL')

      await window.electron.playStream(playUrl, vodSelected?.name || 'VOD')

      if (vodSelected) {
        addVodToHistory({
          id: vodSelected.id,
          type: vodSelected.type,
          name: vodSelected.name,
          poster: vodSelected.poster,
          timestamp: Date.now(),
        })
      }

      setVodView('catalog')
    } catch (e) {
      setError(e.message || 'Playback failed')
    } finally {
      setPlaying(false)
    }
  }

  function getQualityLabel(stream) {
    const name = (stream.name || '').toLowerCase()
    if (name.includes('4k') || name.includes('2160')) return '4K'
    if (name.includes('1080') || name.includes('fhd')) return '1080p'
    if (name.includes('720') || name.includes('hd')) return '720p'
    if (name.includes('480') || name.includes('sd')) return 'SD'
    return stream.name || '?'
  }

  function getStreamType(stream) {
    if (stream.url) return 'direct'
    if (stream.infoHash) return 'torrent'
    if (stream.ytId) return 'youtube'
    return 'other'
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-6">
        <button onClick={() => setVodView('detail')}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-sm mb-4 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to details
        </button>

        <h2 className="text-gray-200 font-semibold mb-1">Select Stream</h2>
        <p className="text-xs text-gray-600 mb-5">
          {vodStreams.length} source{vodStreams.length !== 1 ? 's' : ''} available
        </p>

        {vodStreams.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">No streams available</p>
            <p className="text-gray-700 text-xs mt-1">Try adding more addons in Settings</p>
          </div>
        ) : (
          <div className="space-y-2 mb-5">
            {vodStreams.map((stream, i) => {
              const type = getStreamType(stream)
              return (
                <button key={i} onClick={() => setSelectedIdx(i)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors
                    ${i === selectedIdx
                      ? 'border-purple-500/40 bg-purple-600/10'
                      : 'border-white/8 bg-black/20 hover:bg-white/5'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold
                        ${i === selectedIdx ? 'bg-purple-600/30 text-purple-300' : 'bg-white/5 text-gray-600'}`}>
                        {getQualityLabel(stream)}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-sm truncate ${i === selectedIdx ? 'text-gray-200' : 'text-gray-400'}`}>
                          {stream._addonName || 'Unknown'}
                        </p>
                        <p className="text-[10px] text-gray-600 truncate">{stream.description || stream.name}</p>
                      </div>
                    </div>
                    <StreamTypeIcon type={type} />
                  </div>
                  {stream.behaviorHints?.videoSize && (
                    <p className="text-[10px] text-gray-600 mt-1.5 ml-10">
                      {(stream.behaviorHints.videoSize / 1_000_000_000).toFixed(1)} GB
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {error && (
          <p className="text-red-400 text-xs mb-3 p-2 rounded bg-red-900/20 border border-red-900/30">{error}</p>
        )}

        {vodStreams.length > 0 && (
          <button onClick={handlePlay} disabled={playing}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed
                       text-white font-medium rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            {playing ? 'Starting...' : 'Play'}
          </button>
        )}
      </div>
    </div>
  )
}

function StreamTypeIcon({ type }) {
  if (type === 'torrent') {
    return (
      <svg className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  }
  if (type === 'youtube') {
    return (
      <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    )
  }
  return (
    <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  )
}
