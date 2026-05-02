import { useStore } from '../store/useStore'

export default function Titlebar({ onReload, onOpenSettings }) {
  const { searchQuery, setSearchQuery, channels } = useStore()

  return (
    <div className="drag-region flex items-center h-10 px-4 bg-[#0f0f0f] border-b border-white/5 flex-shrink-0">
      {/* App name */}
      <span className="text-purple-400 font-semibold text-sm tracking-wide mr-6 no-drag">
        VUNCHES
      </span>

      {/* Search bar */}
      <div className="no-drag flex-1 max-w-md">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 text-sm text-gray-200 placeholder-gray-600
                       rounded pl-8 pr-3 py-1 outline-none border border-transparent
                       focus:border-purple-500/50 focus:bg-white/8 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Channel count */}
      <span className="no-drag ml-4 text-gray-600 text-xs">
        {channels.length.toLocaleString()} channels
      </span>

      {/* Reload button */}
      <button
        onClick={onReload}
        title="Reload playlist"
        className="no-drag ml-3 text-gray-600 hover:text-gray-300 transition-colors p-1 rounded hover:bg-white/5"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      {/* Settings button */}
      <button
        onClick={onOpenSettings}
        title="Settings"
        className="no-drag ml-1 text-gray-600 hover:text-gray-300 transition-colors p-1 rounded hover:bg-white/5"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  )
}
