import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'

const TAB = { SOURCES: 'sources', EPG: 'epg', GENERAL: 'general' }

export default function Settings({ onClose, onLoadSource, onLoadEpg }) {
  const [tab, setTab] = useState(TAB.SOURCES)

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-[420px] bg-[#1a1a1a] border-l border-white/8 z-50 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 flex-shrink-0">
          <h2 className="text-gray-100 font-semibold">Settings</h2>
          <button onClick={onClose}
            className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-white/5 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/8 flex-shrink-0">
          {[
            { id: TAB.SOURCES, label: 'Sources' },
            { id: TAB.EPG,     label: 'EPG' },
            { id: TAB.GENERAL, label: 'General' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2
                ${tab === t.id
                  ? 'text-purple-300 border-purple-500'
                  : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {tab === TAB.SOURCES && <SourcesTab onClose={onClose} onLoadSource={onLoadSource} />}
          {tab === TAB.EPG     && <EpgTab onLoadEpg={onLoadEpg} />}
          {tab === TAB.GENERAL && <GeneralTab onClose={onClose} />}
        </div>

        <div className="px-5 py-3 border-t border-white/5 text-center flex-shrink-0">
          <p className="text-xs text-gray-700">Vunches v0.1.0</p>
        </div>
      </div>
    </>
  )
}

// ─── Sources Tab ──────────────────────────────────────────────────────────────

function SourcesTab({ onClose, onLoadSource }) {
  const { sources, setSources, activeSourceId, setActiveSourceId } = useStore()
  const [mode, setMode] = useState(null) // null | 'add-m3u' | 'add-xtream' | 'edit'
  const [editSource, setEditSource] = useState(null)

  async function handleDelete(id) {
    if (!confirm('Remove this source?')) return
    const updated = sources.filter(s => s.id !== id)
    setSources(updated)
    await window.electron.store.set('sources', updated)
    if (activeSourceId === id && updated.length > 0) {
      setActiveSourceId(updated[0].id)
      onLoadSource(updated[0])
    }
  }

  function handleEdit(source) {
    setEditSource(source)
    setMode(source.type === 'xtream' ? 'add-xtream' : 'add-m3u')
  }

  async function handleActivate(source) {
    setActiveSourceId(source.id)
    await window.electron.store.set('activeSourceId', source.id)
    onLoadSource(source)
    onClose()
  }

  if (mode === 'add-m3u' || (mode === 'edit' && editSource?.type === 'm3u')) {
    return <M3uForm existing={editSource} onDone={() => { setMode(null); setEditSource(null) }}
      onLoadSource={onLoadSource} onClose={onClose} />
  }
  if (mode === 'add-xtream') {
    return <XtreamForm existing={editSource} onDone={() => { setMode(null); setEditSource(null) }}
      onLoadSource={onLoadSource} onClose={onClose} />
  }

  return (
    <div className="px-5 py-5 space-y-4">
      {/* Source list */}
      {sources.length === 0 ? (
        <p className="text-gray-600 text-sm text-center py-6">No sources added yet.</p>
      ) : (
        <div className="space-y-2">
          {sources.map(source => (
            <div key={source.id}
              className={`rounded-lg border p-3 transition-colors
                ${activeSourceId === source.id
                  ? 'border-purple-500/40 bg-purple-600/10'
                  : 'border-white/8 bg-black/20'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded
                      ${source.type === 'xtream' ? 'bg-blue-600/30 text-blue-300' : 'bg-purple-600/30 text-purple-300'}`}>
                      {source.type === 'xtream' ? 'XC' : 'M3U'}
                    </span>
                    <p className="text-sm font-medium text-gray-200 truncate">{source.name}</p>
                  </div>
                  <p className="text-xs text-gray-600 truncate mt-0.5">
                    {source.type === 'xtream' ? source.host : source.url}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {activeSourceId !== source.id && (
                    <button onClick={() => handleActivate(source)}
                      className="text-xs text-purple-400 hover:text-purple-300 px-2 py-1 rounded hover:bg-white/5 transition-colors">
                      Load
                    </button>
                  )}
                  <button onClick={() => handleEdit(source)}
                    className="text-gray-600 hover:text-gray-300 p-1 rounded hover:bg-white/5 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(source.id)}
                    className="text-gray-600 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
              {activeSourceId === source.id && (
                <p className="text-[10px] text-purple-400 mt-1.5 font-medium">● Active</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add buttons */}
      <div className="flex gap-2 pt-1">
        <button onClick={() => setMode('add-m3u')}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-white/10
                     text-gray-400 hover:text-gray-200 hover:bg-white/5 text-sm transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add M3U
        </button>
        <button onClick={() => setMode('add-xtream')}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-white/10
                     text-gray-400 hover:text-gray-200 hover:bg-white/5 text-sm transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Xtream
        </button>
      </div>
    </div>
  )
}

function M3uForm({ existing, onDone, onLoadSource, onClose }) {
  const { sources, setSources, activeSourceId, setActiveSourceId } = useStore()
  const [url, setUrl] = useState(existing?.url || '')
  const [name, setName] = useState(existing?.name || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    try {
      const source = {
        id: existing?.id || Date.now().toString(),
        name: name.trim() || 'My Playlist',
        url: trimmed,
        type: 'm3u',
      }
      const updated = existing
        ? sources.map(s => s.id === existing.id ? source : s)
        : [...sources, source]
      setSources(updated)
      await window.electron.store.set('sources', updated)
      // Activate and load
      setActiveSourceId(source.id)
      await window.electron.store.set('activeSourceId', source.id)
      onLoadSource(source)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-5 py-5">
      <button onClick={onDone} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-sm mb-4 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>
      <h3 className="text-gray-200 font-medium mb-4">{existing ? 'Edit M3U Source' : 'Add M3U Playlist'}</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Playlist URL" required>
          <input type="url" value={url} onChange={e => { setUrl(e.target.value); setError('') }}
            placeholder="https://example.com/playlist.m3u" autoFocus
            className={inputCls} required />
        </Field>
        <Field label="Name">
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="My Playlist" className={inputCls} />
        </Field>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button type="submit" disabled={loading || !url.trim()} className={btnCls}>
          {loading ? 'Loading...' : existing ? 'Save Changes' : 'Add & Load'}
        </button>
      </form>
    </div>
  )
}

function XtreamForm({ existing, onDone, onLoadSource, onClose }) {
  const { sources, setSources, setActiveSourceId } = useStore()
  const [host, setHost]         = useState(existing?.host || '')
  const [username, setUsername] = useState(existing?.username || '')
  const [password, setPassword] = useState(existing?.password || '')
  const [name, setName]         = useState(existing?.name || '')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const trimHost = host.trim().replace(/\/$/, '')
    if (!trimHost || !username.trim() || !password.trim()) return
    setLoading(true)
    setError('')
    try {
      // Validate credentials by calling get_user_info
      const info = await window.electron.xtreamFetch({
        host: trimHost, username: username.trim(), password: password.trim(),
        action: 'get_user_info',
      })
      if (info.user_info?.auth === 0) throw new Error('Invalid username or password')

      const source = {
        id: existing?.id || Date.now().toString(),
        name: name.trim() || info.user_info?.username || 'Xtream Source',
        host: trimHost,
        username: username.trim(),
        password: password.trim(),
        type: 'xtream',
      }
      const updated = existing
        ? sources.map(s => s.id === existing.id ? source : s)
        : [...sources, source]
      setSources(updated)
      await window.electron.store.set('sources', updated)
      setActiveSourceId(source.id)
      await window.electron.store.set('activeSourceId', source.id)
      onLoadSource(source)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to connect')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-5 py-5">
      <button onClick={onDone} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-sm mb-4 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>
      <h3 className="text-gray-200 font-medium mb-4">{existing ? 'Edit Xtream Source' : 'Add Xtream Codes Source'}</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Server URL" required>
          <input type="url" value={host} onChange={e => { setHost(e.target.value); setError('') }}
            placeholder="http://provider.com:8080" autoFocus className={inputCls} required />
        </Field>
        <Field label="Username" required>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)}
            placeholder="username" className={inputCls} required autoComplete="off" />
        </Field>
        <Field label="Password" required>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="password" className={inputCls} required autoComplete="new-password" />
        </Field>
        <Field label="Name">
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="My Provider" className={inputCls} />
        </Field>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button type="submit" disabled={loading || !host.trim() || !username.trim() || !password.trim()} className={btnCls}>
          {loading ? 'Connecting...' : existing ? 'Save Changes' : 'Connect & Load'}
        </button>
      </form>
    </div>
  )
}

// ─── EPG Tab ──────────────────────────────────────────────────────────────────

function EpgTab({ onLoadEpg }) {
  const { epgUrl, setEpgUrl, setEpg, setEpgStatus, epgStatus, epgRefreshInterval, setEpgRefreshInterval } = useStore()
  const [input, setInput]     = useState(epgUrl || '')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => { if (epgUrl && !input) setInput(epgUrl) }, [epgUrl])

  async function handleSave(e) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    setLoading(true); setError(''); setSuccess(false)
    setEpgStatus('loading')
    try {
      const data = await window.electron.loadEpg(trimmed)
      setEpg(data)
      setEpgUrl(trimmed)
      setEpgStatus('ready')
      await window.electron.store.set('epgUrl', trimmed)
      setSuccess(true)
      if (onLoadEpg) onLoadEpg(trimmed)
    } catch (err) {
      setEpgStatus('error')
      setError(err.message || 'Failed to load EPG')
    } finally {
      setLoading(false)
    }
  }

  async function handleClear() {
    setEpg({}); setEpgUrl(''); setEpgStatus('idle'); setInput('')
    await window.electron.store.set('epgUrl', '')
  }

  return (
    <div className="px-5 py-5 space-y-5">
      <div>
        <p className="text-xs text-gray-500 mb-3">
          XMLTV URL from your provider. Enables now/next info and the TV guide.
          {epgUrl && epgUrl === input && <span className="ml-1 text-purple-400">Auto-detected.</span>}
        </p>
        <form onSubmit={handleSave} className="space-y-3">
          <Field label="XMLTV URL">
            <input type="url" value={input}
              onChange={e => { setInput(e.target.value); setSuccess(false); setError('') }}
              placeholder="https://example.com/epg.xml or epg.xml.gz"
              className={inputCls} />
          </Field>
          {error   && <p className="text-red-400 text-xs">{error}</p>}
          {success && <p className="text-green-400 text-xs">EPG loaded — {Object.keys(useStore.getState().epg).length.toLocaleString()} channels</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={loading || !input.trim()} className={`${btnCls} flex-1`}>
              {loading ? 'Loading...' : epgUrl ? 'Reload EPG' : 'Load EPG'}
            </button>
            {epgUrl && (
              <button type="button" onClick={handleClear}
                className="px-3 py-2 border border-white/10 text-gray-400 hover:text-gray-200 rounded-lg text-sm transition-colors">
                Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {/* EPG status */}
      {epgStatus !== 'idle' && (
        <div className={`text-xs px-3 py-2 rounded-lg border
          ${epgStatus === 'ready'   ? 'bg-green-900/20 border-green-700/30 text-green-400' :
            epgStatus === 'loading' ? 'bg-purple-900/20 border-purple-700/30 text-purple-400' :
            epgStatus === 'error'   ? 'bg-red-900/20 border-red-700/30 text-red-400' : ''}`}>
          {epgStatus === 'ready'   && `Guide data loaded — ${Object.keys(useStore.getState().epg).length.toLocaleString()} channels`}
          {epgStatus === 'loading' && 'Loading EPG data...'}
          {epgStatus === 'error'   && `Error: ${useStore.getState().epgError || 'Failed to load'}`}
        </div>
      )}

      {/* Auto-refresh interval */}
      <div>
        <label className="text-xs text-gray-500 block mb-2">Auto-refresh every</label>
        <div className="flex gap-2">
          {[2, 4, 6, 12, 24].map(h => (
            <button key={h} onClick={() => setEpgRefreshInterval(h)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${epgRefreshInterval === h
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
                  : 'bg-white/5 text-gray-400 border border-white/8 hover:bg-white/8'}`}>
              {h}h
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── General Tab ──────────────────────────────────────────────────────────────

function GeneralTab({ onClose }) {
  const { setSources, setFavorites, setRecentlyWatched, setActiveSourceId,
          selectDevice, setAggressiveReconnect, setEpgUrl, setEpg, setEpgStatus,
          setChannels } = useStore()
  const [status, setStatus] = useState('')

  async function handleExport() {
    const result = await window.electron.exportData()
    setStatus(result.ok ? `Exported to ${result.filePath}` : 'Export cancelled')
  }

  async function handleImport() {
    const result = await window.electron.importData()
    if (!result.ok) { setStatus(result.error ? `Error: ${result.error}` : 'Import cancelled'); return }
    // Reload state from store
    const [sources, favorites, recent, device, aggressive, epgUrl, activeId] = await Promise.all([
      window.electron.store.get('sources'),
      window.electron.store.get('favorites'),
      window.electron.store.get('recentlyWatched'),
      window.electron.store.get('selectedDevice'),
      window.electron.store.get('aggressiveReconnect'),
      window.electron.store.get('epgUrl'),
      window.electron.store.get('activeSourceId'),
    ])
    setSources(sources || [])
    setFavorites(favorites || [])
    setRecentlyWatched(recent || [])
    if (device) selectDevice(device)
    if (aggressive != null) setAggressiveReconnect(aggressive)
    if (epgUrl) setEpgUrl(epgUrl)
    if (activeId) setActiveSourceId(activeId)
    setStatus('Settings imported. Reload the app to apply sources.')
  }

  async function handleReset() {
    if (!confirm('This will clear all sources, favorites, and settings. Are you sure?')) return
    await Promise.all([
      window.electron.store.delete('sources'),
      window.electron.store.delete('favorites'),
      window.electron.store.delete('recentlyWatched'),
      window.electron.store.delete('selectedDevice'),
      window.electron.store.delete('epgUrl'),
      window.electron.store.delete('activeSourceId'),
    ])
    setSources([])
    setFavorites([])
    setRecentlyWatched([])
    setChannels([])
    setEpg({})
    setEpgUrl('')
    setEpgStatus('idle')
    setActiveSourceId(null)
    onClose()
  }

  return (
    <div className="px-5 py-5 space-y-6">
      {/* Keyboard shortcuts reference */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Keyboard Shortcuts</h3>
        <div className="space-y-1.5 text-xs">
          {[
            ['/', 'Focus search'],
            ['Escape', 'Clear search / close guide'],
            ['G', 'Toggle TV guide'],
            ['F', 'Favorite current channel'],
            ['R', 'Reload playlist'],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between text-gray-400">
              <span>{desc}</span>
              <kbd className="bg-white/8 border border-white/10 rounded px-1.5 py-0.5 font-mono text-gray-300">{key}</kbd>
            </div>
          ))}
        </div>
      </section>

      {/* Backup */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Backup & Restore</h3>
        <div className="space-y-2">
          <button onClick={handleExport}
            className="w-full py-2 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 text-sm transition-colors">
            Export settings & favorites...
          </button>
          <button onClick={handleImport}
            className="w-full py-2 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 text-sm transition-colors">
            Import settings...
          </button>
          {status && <p className="text-xs text-gray-500">{status}</p>}
        </div>
      </section>

      {/* Danger */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Danger Zone</h3>
        <button onClick={handleReset}
          className="w-full py-2 rounded-lg border border-red-900/50 text-red-400 hover:bg-red-900/20 text-sm transition-colors">
          Reset all settings
        </button>
      </section>
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">
        {label}{required && <span className="text-gray-600 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = `w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm
  text-gray-200 placeholder-gray-700 outline-none focus:border-purple-500/60 transition-colors`

const btnCls = `w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed
  text-white font-medium py-2 rounded-lg text-sm transition-colors`
