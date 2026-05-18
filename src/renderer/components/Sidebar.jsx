import { useStore } from '../store/useStore'

export default function Sidebar() {
  const {
    selectedCategory, setSelectedCategory, getCategories,
    channels, favorites, recentlyWatched,
    vodContentType, setVodContentType, vodHistory, vodView, setVodView,
    stremioAddons,
  } = useStore()

  const categories = getCategories()
  const counts = {
    All: channels.length,
    Favorites: favorites.length,
    Recent: recentlyWatched.length,
  }

  const hasVod = stremioAddons?.length > 0

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col bg-[#141414] border-r border-white/5 overflow-y-auto">

      {/* Live TV section */}
      <div className="px-3 pt-4 pb-2">
        <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-widest px-3 mb-2">
          Live TV
        </p>
        <CategoryItem label="All Channels" count={counts.All}
          active={vodView === 'channels' && selectedCategory === 'All'}
          onClick={() => { setVodView('channels'); setSelectedCategory('All') }}
          icon={<GridIcon />} />
        <CategoryItem label="Favorites" count={counts.Favorites}
          active={vodView === 'channels' && selectedCategory === 'Favorites'}
          onClick={() => { setVodView('channels'); setSelectedCategory('Favorites') }}
          icon={<HeartIcon />} />
        <CategoryItem label="Recently Watched" count={counts.Recent}
          active={vodView === 'channels' && selectedCategory === 'Recent'}
          onClick={() => { setVodView('channels'); setSelectedCategory('Recent') }}
          icon={<ClockIcon />} />
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-white/5 my-1" />

      {/* Categories section */}
      <div className="px-3 pt-2 pb-4">
        <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-widest px-3 mb-2">
          Categories
        </p>
        {categories.slice(3).map((cat) => (
          <CategoryItem
            key={cat}
            label={cat}
            active={vodView === 'channels' && selectedCategory === cat}
            onClick={() => { setVodView('channels'); setSelectedCategory(cat) }}
            icon={<TagIcon />}
          />
        ))}
      </div>

      {/* VOD section */}
      {hasVod && (
        <>
          <div className="mx-4 border-t border-white/5 my-1" />

          <div className="px-3 pt-2 pb-2">
            <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-widest px-3 mb-2">
              VOD
            </p>
            <CategoryItem label="Browse All"
              active={vodView === 'catalog' && vodContentType === 'all'}
              onClick={() => { setVodView('catalog'); setVodContentType('all') }}
              icon={<FilmIcon />} />
            <CategoryItem label="Movies"
              active={vodView === 'catalog' && vodContentType === 'movie'}
              onClick={() => { setVodView('catalog'); setVodContentType('movie') }}
              icon={<MovieIcon />} />
            <CategoryItem label="Series"
              active={vodView === 'catalog' && vodContentType === 'series'}
              onClick={() => { setVodView('catalog'); setVodContentType('series') }}
              icon={<TvIcon />} />
          </div>

          {vodHistory.length > 0 && (
            <div className="px-3 pt-2 pb-4">
              <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-widest px-3 mb-2">
                Continue Watching
              </p>
              {vodHistory.slice(0, 10).map(item => (
                <button key={item.id}
                  onClick={() => {
                    useStore.setState({ vodSelected: item, vodView: 'detail' })
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-3
                             text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors mb-0.5">
                  <div className="w-6 h-8 rounded bg-[#0f0f0f] overflow-hidden flex-shrink-0">
                    {item.poster ? (
                      <img src={item.poster} alt="" className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none' }} />
                    ) : null}
                  </div>
                  <span className="flex-1 truncate text-xs">{item.name}</span>
                  <span className="text-[10px] text-gray-600">{item.type === 'series' ? 'TV' : 'MOV'}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </aside>
  )
}

function CategoryItem({ label, count, active, onClick, icon }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 group transition-colors mb-0.5
        ${active
          ? 'bg-purple-600/20 text-purple-300'
          : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
        }`}
    >
      <span className={`flex-shrink-0 w-4 h-4 ${active ? 'text-purple-400' : 'text-gray-600 group-hover:text-gray-400'}`}>
        {icon}
      </span>
      <span className="flex-1 truncate text-sm">{label}</span>
      {count !== undefined && (
        <span className={`text-xs flex-shrink-0 tabular-nums ${active ? 'text-purple-400' : 'text-gray-600'}`}>
          {count > 9999 ? `${(count / 1000).toFixed(1)}k` : count.toLocaleString()}
        </span>
      )}
    </button>
  )
}

function GridIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
    </svg>
  )
}

function FilmIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
    </svg>
  )
}

function MovieIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}

function TvIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}
