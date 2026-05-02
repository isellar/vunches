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
    <aside className="w-52 flex-shrink-0 flex flex-col bg-[#141414] border-r border-white/5 overflow-y-auto">
      <div className="px-3 pt-3 pb-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider px-2 mb-1">
          Library
        </p>
        {['All', 'Favorites', 'Recent'].map((cat) => (
          <CategoryItem
            key={cat}
            label={cat}
            count={counts[cat]}
            active={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
            icon={cat === 'Favorites' ? '♥' : cat === 'Recent' ? '⏱' : '▤'}
          />
        ))}
      </div>

      <div className="px-3 pt-2 pb-3 flex-1">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider px-2 mb-1">
          Categories
        </p>
        {categories.slice(3).map((cat) => (
          <CategoryItem
            key={cat}
            label={cat}
            active={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
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
      className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between group transition-colors
        ${active
          ? 'bg-purple-600/20 text-purple-300'
          : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
        }`}
    >
      <span className="flex items-center gap-2 truncate">
        {icon && <span className="text-xs opacity-60">{icon}</span>}
        <span className="truncate">{label}</span>
      </span>
      {count !== undefined && (
        <span className={`text-xs flex-shrink-0 ml-1 ${active ? 'text-purple-400' : 'text-gray-600'}`}>
          {count.toLocaleString()}
        </span>
      )}
    </button>
  )
}
