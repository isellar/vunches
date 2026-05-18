import { useState } from 'react'
import { useStore } from '../store/useStore'

export default function CatalogBrowser() {
  const {
    vodCatalog, setVodCatalog, vodContentType, setVodContentType,
    vodSkip, setVodSkip, vodHasMore, setVodHasMore,
    setVodSelected, setVodView, stremioAddons, isLoading,
  } = useStore()

  const [loadingMore, setLoadingMore] = useState(false)
  const PAGE_SIZE = 30

  const addonUrls = stremioAddons || []

  async function loadMore() {
    if (loadingMore || !vodHasMore || !addonUrls.length) return
    setLoadingMore(true)
    try {
      const result = await window.electron.stremioLoadCatalog({
        addonUrls,
        type: vodContentType === 'all' ? 'movie' : vodContentType,
        catalogId: vodContentType === 'all' ? 'default' : vodContentType,
        skip: vodSkip + PAGE_SIZE,
      })
      if (result.error) {
        console.error('Catalog error:', result.error)  // eslint-disable-line
        setVodHasMore(false)
      } else {
        setVodCatalog([...vodCatalog, ...result.metas])
        setVodSkip(vodSkip + PAGE_SIZE)
        setVodHasMore(result.hasMore)
      }
    } catch (e) {
      console.error('Failed to load more:', e)  // eslint-disable-line
    } finally {
      setLoadingMore(false)
    }
  }

  function handleSelect(meta) {
    setVodSelected(meta)
    setVodView('detail')
  }

  const filtered = useStore.getState().getFilteredCatalog()

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading catalog...</div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        {['all', 'movie', 'series'].map(t => (
          <button key={t} onClick={() => setVodContentType(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${vodContentType === t
                ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'}`}>
            {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'Series'}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-600">{filtered.length} items</span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-16">
          <svg className="w-12 h-12 text-gray-700 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
          </svg>
          <p className="text-gray-600 text-sm">No content found</p>
          {filtered.length === 0 && vodCatalog.length > 0 && (
            <p className="text-gray-700 text-xs mt-1">Try changing the content filter</p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 px-4 pb-4">
            {filtered.map(meta => (
              <CatalogCard key={meta.id} meta={meta} onClick={() => handleSelect(meta)} />
            ))}
          </div>

          {vodHasMore && (
            <div className="flex justify-center pb-6">
              <button onClick={loadMore} disabled={loadingMore}
                className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/8 rounded-lg
                           text-gray-400 hover:text-gray-200 text-sm transition-colors disabled:opacity-40">
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CatalogCard({ meta, onClick }) {
  const [imgError, setImgError] = useState(false)

  return (
    <button onClick={onClick}
      className="group text-left rounded-lg overflow-hidden bg-white/3 border border-white/5
                 hover:border-purple-500/30 hover:bg-white/5 transition-all duration-200
                 focus:outline-none focus:ring-1 focus:ring-purple-500/50">
      <div className="aspect-[2/3] relative bg-[#141414] overflow-hidden">
        {meta.poster && !imgError ? (
          <img
            src={meta.poster}
            alt={meta.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        <div className="absolute top-1.5 right-1.5">
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded
            ${meta.type === 'series' ? 'bg-blue-600/40 text-blue-300' : 'bg-purple-600/40 text-purple-300'}`}>
            {meta.type === 'series' ? 'TV' : 'MOV'}
          </span>
        </div>
      </div>
      <div className="p-2">
        <p className="text-xs font-medium text-gray-300 truncate group-hover:text-purple-300 transition-colors">
          {meta.name}
        </p>
        <p className="text-[10px] text-gray-600 mt-0.5 truncate">
          {meta.releaseInfo || meta.year || ''}
          {meta.releaseInfo && meta.genres?.length ? ' · ' : ''}
          {meta.genres?.slice(0, 2).join(', ') || ''}
        </p>
      </div>
    </button>
  )
}
