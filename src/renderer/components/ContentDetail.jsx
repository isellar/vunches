import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'

export default function ContentDetail() {
  const {
    vodSelected, setVodStreams, vodStreams, setVodView, setVodActiveStream,
    stremioAddons, addVodToHistory,
  } = useStore()

  const [meta, setMeta] = useState(vodSelected)
  const [loading, setLoading] = useState(!vodSelected?.description)
  const [season, setSeason] = useState(1)
  const [episodes, setEpisodes] = useState([])
  const [imgError, setImgError] = useState(false)

  const addonUrls = stremioAddons || []

  useEffect(() => {
    if (!vodSelected?.id) return
    loadMeta()
  }, [vodSelected?.id])

  async function loadMeta() {
    setLoading(true)
    try {
      const result = await window.electron.stremioGetMeta({
        addonUrls, type: vodSelected.type, id: vodSelected.id,
      })
      if (result.meta) {
        setMeta(result.meta)
        if (result.meta.type === 'series' && result.meta.videos?.length) {
          const seasons = [...new Set(result.meta.videos.map(v => v.season || 1))].sort((a, b) => a - b)
          setSeason(seasons[0] || 1)
          setEpisodes(result.meta.videos)
        }
      }
    } catch (e) {
      console.error('Failed to load meta:', e)  // eslint-disable-line
    } finally {
      setLoading(false)
    }
  }

  async function handlePlay(videoId) {
    const id = videoId || (meta.type === 'series' ? null : meta.id)
    if (!id) return

    try {
      const result = await window.electron.stremioGetStreams({
        addonUrls, type: meta.type, id,
      })
      setVodStreams(result.streams || [])
      setVodView('stream-picker')
    } catch (e) {
      console.error('Failed to get streams:', e)  // eslint-disable-line
    }
  }

  async function handlePlayStream(stream) {
    try {
      let playUrl

      if (stream.url) {
        playUrl = stream.url
      } else if (stream.infoHash) {
        const result = await window.electron.torrentCreateStream({
          infoHash: stream.infoHash,
          fileIdx: stream.fileIdx,
        })
        if (!result.ok) throw new Error(result.error || 'Torrent failed')
        playUrl = result.url
      } else if (stream.ytId) {
        playUrl = `https://www.youtube.com/watch?v=${stream.ytId}`
      }

      if (!playUrl) throw new Error('No playable URL')

      await window.electron.playStream(playUrl, meta.name || 'VOD')

      addVodToHistory({
        id: meta.id,
        type: meta.type,
        name: meta.name,
        poster: meta.poster,
        timestamp: Date.now(),
      })

      setVodView('catalog')
    } catch (e) {
      console.error('Playback error:', e)  // eslint-disable-line
    }
  }

  function handlePlayMovie() {
    handlePlay(null)
  }

  function handlePlayEpisode(ep) {
    handlePlay(ep.id)
  }

  const seasonEpisodes = meta?.type === 'series'
    ? episodes.filter(ep => (ep.season || 1) === season)
    : []
  const seasons = meta?.type === 'series'
    ? [...new Set(episodes.map(v => v.season || 1))].sort((a, b) => a - b)
    : []

  function back() {
    if (vodStreams.length > 0 && useStore.getState().vodView === 'stream-picker') {
      setVodStreams([])
      setVodView('detail')
    } else {
      setVodView('catalog')
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading details...</div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Backdrop */}
      <div className="relative">
        <div className="h-48 md:h-64 bg-[#141414] relative overflow-hidden">
          {(meta.background || meta.poster) && !imgError ? (
            <img
              src={meta.background || meta.poster}
              alt=""
              className="w-full h-full object-cover opacity-40"
              onError={() => setImgError(true)}
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/80 to-transparent" />
        </div>

        {/* Back button */}
        <button onClick={back}
          className="absolute top-3 left-3 flex items-center gap-1.5 text-gray-300 hover:text-white
                     bg-black/40 hover:bg-black/60 rounded-lg px-3 py-1.5 text-sm transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* Content */}
        <div className="px-6 pb-6 -mt-20 relative z-10">
          <div className="flex gap-5">
            {/* Poster */}
            <div className="w-32 md:w-40 flex-shrink-0 rounded-lg overflow-hidden shadow-2xl bg-[#141414] border border-white/5">
              {meta.poster ? (
                <img src={meta.poster} alt={meta.name} className="w-full object-cover aspect-[2/3]"
                  onError={(e) => { e.target.style.display = 'none' }} />
              ) : (
                <div className="aspect-[2/3] flex items-center justify-center text-gray-800">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="pt-3 flex-1 min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-white">{meta.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-400">
                {meta.releaseInfo && <span>{meta.releaseInfo}</span>}
                {meta.runtime && <span>{meta.runtime}</span>}
                {meta.imdbRating && (
                  <span className="text-yellow-400 font-medium">★ {meta.imdbRating}</span>
                )}
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-600/30 text-purple-300">
                  {meta.type === 'series' ? 'Series' : 'Movie'}
                </span>
              </div>
              {meta.genres?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {meta.genres.map(g => (
                    <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-500 border border-white/5">
                      {g}
                    </span>
                  ))}
                </div>
              )}
              {meta.director?.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  <span className="text-gray-600">Director: </span>
                  {meta.director.slice(0, 3).join(', ')}
                </p>
              )}
              {meta.cast?.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  <span className="text-gray-600">Cast: </span>
                  {meta.cast.slice(0, 5).join(', ')}
                </p>
              )}

              {/* Play button for movies */}
              {meta.type !== 'series' && (
                <button onClick={handlePlayMovie}
                  className="mt-4 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium
                             rounded-lg text-sm transition-colors flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Play
                </button>
              )}
            </div>
          </div>

          {/* Description */}
          {meta.description && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Synopsis</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{meta.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Episodes for Series */}
      {meta.type === 'series' && (
        <div className="px-6 pb-8">
          {/* Season selector */}
          {seasons.length > 1 && (
            <div className="flex gap-2 mb-4">
              {seasons.map(s => (
                <button key={s} onClick={() => setSeason(s)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors
                    ${season === s
                      ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
                      : 'text-gray-500 hover:text-gray-300 bg-white/3 border border-white/5 hover:bg-white/5'}`}>
                  Season {s}
                </button>
              ))}
            </div>
          )}

          {/* Episode list */}
          <div className="space-y-1.5">
            {seasonEpisodes.map((ep, idx) => (
              <div key={ep.id}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/3 transition-colors group cursor-pointer"
                onClick={() => handlePlayEpisode(ep)}>
                <div className="w-20 h-12 flex-shrink-0 rounded bg-[#141414] border border-white/5 overflow-hidden">
                  {ep.thumbnail ? (
                    <img src={ep.thumbnail} alt="" className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = 'none' }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-800">
                      <span className="text-xs font-bold">{ep.episode || idx + 1}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 group-hover:text-purple-300 transition-colors truncate">
                    {ep.title || `Episode ${ep.episode || idx + 1}`}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-600">
                      S{ep.season || 1} E{ep.episode || idx + 1}
                    </span>
                    {ep.released && (
                      <span className="text-[10px] text-gray-700">
                        {new Date(ep.released).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-700 group-hover:text-gray-400 flex-shrink-0 transition-colors"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
