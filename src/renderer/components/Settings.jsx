import { useState } from 'react'
import { useStore } from '../store/useStore'

export default function Settings({ onClose }) {
  const { sources, setSources, setChannels, setLoading, setLoadError } = useStore()
  const current = sources[0] || null

  const [url, setUrl] = useState(current?.url || '')
  const [name, setName] = useState(current?.name || '')
  const [loading, setLocalLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    const trimmedUrl = url.trim()
    if (!trimmedUrl) return
    setLocalLoading(true)
    setError('')
    setSuccess(false)

    try {
      // Validate by fetching
      const text = await window.electron?.fetchUrl(trimmedUrl)
      if (!text) throw new Error('Empty response')

      const newSource = {
        id: current?.id || Date.now().toString(),
        name: name.trim() || 'My Playlist',
        url: trimmedUrl,
        type: 'url',
      }

      const updated = [newSource]
      setSources(updated)
      await window.electron?.store.set('sources', updated)

      // Parse and load new channels
      const { parseM3u } = await import('../lib/parseM3u.js')
      setLoading(true)
      setLoadError(null)
      try {
        const parsed = parseM3u(text)
        setChannels(parsed)
        setSuccess(true)
        setTimeout(onClose, 800)
      } finally {
        setLoading(false)
      }
    } catch (err) {
      setError(err.message || 'Could not load that URL')
    } finally {
      setLocalLoading(false)
    }
  }

  async function handleClear() {
    if (!confirm('Remove current playlist and start over?')) return
    setSources([])
    setChannels([])
    await window.electron?.store.set('sources', [])
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-96 bg-[#1a1a1a] border-l border-white/8 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="text-gray-100 font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded hover:bg-white/5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Playlist source */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Playlist Source
            </h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">M3U URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setSuccess(false); setError('') }}
                  placeholder="https://example.com/playlist.m3u"
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm
                             text-gray-200 placeholder-gray-700 outline-none
                             focus:border-purple-500/60 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Name</label>
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

              {error && <p className="text-red-400 text-xs">{error}</p>}
              {success && <p className="text-green-400 text-xs">Playlist loaded successfully</p>}

              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40
                           disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg
                           text-sm transition-colors"
              >
                {loading ? 'Loading...' : current ? 'Update Playlist' : 'Load Playlist'}
              </button>
            </form>
          </section>

          {/* Danger zone */}
          {current && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Danger Zone
              </h3>
              <button
                onClick={handleClear}
                className="w-full border border-red-900/50 text-red-400 hover:bg-red-900/20
                           py-2 rounded-lg text-sm transition-colors"
              >
                Remove playlist &amp; reset
              </button>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/5 text-center">
          <p className="text-xs text-gray-700">Vunches v0.1.0</p>
        </div>
      </div>
    </>
  )
}
