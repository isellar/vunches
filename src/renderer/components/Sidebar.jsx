import { useStore } from '../store/useStore'

export default function Sidebar() {
  const { selectedCategory, setSelectedCategory, getCategories, channels, favorites, recentlyWatched } = useStore()
  const categories = getCategories()

  const counts = {
    All: channels.length,
    Favorites: favorites.length,
    Recent: recentlyWatched.length,
  }

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col bg-[#141414] border-r border-white/5 overflow-y-auto">

      {/* Library section */}
      <div className="px-3 pt-4 pb-2">
        <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-widest px-3 mb-2">
          Library
        </p>
        <CategoryItem label="All Channels" count={counts.All}
          active={selectedCategory === 'All'} onClick={() => setSelectedCategory('All')}
          icon={<GridIcon />} />
        <CategoryItem label="Favorites" count={counts.Favorites}
          active={selectedCategory === 'Favorites'} onClick={() => setSelectedCategory('Favorites')}
          icon={<HeartIcon />} />
        <CategoryItem label="Recently Watched" count={counts.Recent}
          active={selectedCategory === 'Recent'} onClick={() => setSelectedCategory('Recent')}
          icon={<ClockIcon />} />
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-white/5 my-1" />

      {/* Categories section */}
      <div className="px-3 pt-2 pb-4 flex-1">
        <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-widest px-3 mb-2">
          Categories
        </p>
        {categories.slice(3).map((cat) => (
          <CategoryItem
            key={cat}
            label={cat}
            active={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
            icon={<TagIcon />}
          />
        ))}
      </div>
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
