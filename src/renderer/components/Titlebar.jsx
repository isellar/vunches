import { useStore } from '../store/useStore'

export default function Titlebar({ onReload, onOpenSettings }) {
  const { searchQuery, setSearchQuery, channels } = useStore()

  return (
    <div className="drag-region flex items-center h-14 px-5 bg-[#0f0f0f] border-b border-white/5 flex-shrink-0 gap-4">

      {/* App name */}
      <span className="no-drag text-purple-400 font-bold text-base tracking-widest flex-shrink-0">
        VUNCHES
      </span>

      {/* Search bar — takes remaining space up to a max */}
      <div className="no-drag flex-1 max-w-lg">
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/6 text-sm text-gray-200 placeholder-gray-600
                       rounded-lg pr-8 py-2 outline-none border border-white/8
                       focus:border-purple-500/60 focus:bg-white/8 transition-colors"
            style={{ paddingLeft: '2.25rem' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center
                         justify-center text-gray-500 hover:text-gray-200 transition-colors
                         rounded hover:bg-white/10"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Channel count */}
      <span className="no-drag text-gray-600 text-xs flex-shrink-0 hidden sm:block">
        {channels.length.toLocaleString()} channels
      </span>

      {/* Reload button */}
      <button
        onClick={onReload}
        title="Reload playlist"
        className="no-drag flex items-center gap-1.5 text-gray-500 hover:text-gray-200
                   transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/6 flex-shrink-0"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span className="text-xs hidden md:block">Reload</span>
      </button>

      {/* Settings button */}
      <button
        onClick={onOpenSettings}
        title="Settings"
        className="no-drag flex items-center gap-1.5 text-gray-500 hover:text-gray-200
                   transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/6 flex-shrink-0"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="text-xs hidden md:block">Settings</span>
      </button>
    </div>
  )
}
