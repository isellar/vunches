import { useState } from 'react'

const EXAMPLE_URL = 'https://iptv-org.github.io/iptv/categories/news.m3u'

export default function Setup({ onAdd }) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    try {
      // Quick validation — try fetching the URL
      await window.electron?.fetchUrl(trimmed)
      onAdd({
        id: Date.now().toString(),
        name: name.trim() || 'My Playlist',
        url: trimmed,
        type: 'm3u',
      })
    } catch (err) {
      setError('Could not load that URL. Check the address and try again.')
    } finally {
      setLoading(false)
    }
  }

  function useExample() {
    setUrl(EXAMPLE_URL)
    setName('IPTV-org (Public)')
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0f0f0f] px-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-purple-400 tracking-tight">VUNCHES</h1>
          <p className="text-gray-500 text-sm mt-1">Your desktop IPTV client</p>
        </div>

        <div className="bg-[#1a1a1a] rounded-xl border border-white/8 p-6">
          <h2 className="text-gray-200 font-medium mb-1">Add your playlist</h2>
          <p className="text-gray-500 text-sm mb-5">
            Enter an M3U playlist URL to get started.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Playlist URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/playlist.m3u"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm
                           text-gray-200 placeholder-gray-700 outline-none
                           focus:border-purple-500/60 transition-colors"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Name (optional)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Playlist"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm
                           text-gray-200 placeholder-gray-700 outline-none
                           focus:border-purple-500/60 transition-colors"
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed
                         text-white font-medium py-2 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Loading playlist...' : 'Load Playlist'}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-white/5">
            <p className="text-xs text-gray-600 mb-2">No playlist? Try a free public one:</p>
            <button
              onClick={useExample}
              className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              Use IPTV-org public playlist (news channels)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
