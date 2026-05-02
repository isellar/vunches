import { useStore } from '../store/useStore'

export default function CastBar() {
  const {
    castDevices, selectedDevice, selectDevice,
    castStatus, castError,
    aggressiveReconnect, setAggressiveReconnect,
    activeChannel,
  } = useStore()

  const isCasting = selectedDevice && (castStatus === 'playing' || castStatus === 'paused' || castStatus === 'reconnecting' || castStatus === 'connecting')
  const hasDevices = castDevices.length > 0

  async function handleStop() {
    await window.electron.cast.stop()
    useStore.setState({ castStatus: 'idle', castError: null })
  }

  async function handleVolumeChange(e) {
    await window.electron.cast.setVolume(parseFloat(e.target.value))
  }

  return (
    <div className="flex items-center gap-3 px-4 h-12 bg-[#0d0d0d] border-t border-white/5 flex-shrink-0 text-sm">

      {/* ── Device selector ── */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <CastIcon active={isCasting} />
        <select
          value={selectedDevice?.host || ''}
          onChange={(e) => {
            const device = castDevices.find(d => d.host === e.target.value) || null
            selectDevice(device)
            // If switching device while playing, stop current cast
            if (isCasting) window.electron.cast.stop()
          }}
          className="bg-[#1a1a1a] border border-white/10 text-gray-300 text-xs rounded px-2 py-1
                     outline-none focus:border-purple-500/50 max-w-[180px] cursor-pointer
                     disabled:opacity-40"
        >
          <option value="">
            {hasDevices ? 'Select device...' : 'Scanning for devices...'}
          </option>
          {castDevices.map(d => (
            <option key={d.host} value={d.host}>{d.name}</option>
          ))}
        </select>

        {!hasDevices && (
          <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* ── Status / Now casting ── */}
      {selectedDevice && (
        <>
          <div className="w-px h-5 bg-white/8 flex-shrink-0" />

          {castStatus === 'idle' && (
            <span className="text-gray-600 text-xs">
              Ready — click a channel to cast to <span className="text-gray-400">{selectedDevice.name}</span>
            </span>
          )}

          {castStatus === 'connecting' && (
            <span className="flex items-center gap-2 text-gray-400 text-xs">
              <div className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin" />
              Connecting to {selectedDevice.name}...
            </span>
          )}

          {castStatus === 'reconnecting' && (
            <span className="flex items-center gap-2 text-amber-400 text-xs">
              <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />
              Reconnecting...
            </span>
          )}

          {(castStatus === 'playing' || castStatus === 'paused') && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Now playing indicator */}
              <div className="flex items-end gap-0.5 h-4 flex-shrink-0">
                {castStatus === 'playing' ? (
                  [1,2,3].map(i => (
                    <div key={i} className="w-0.5 bg-purple-400 rounded animate-pulse"
                      style={{ height: `${6+i*3}px`, animationDelay: `${i*0.15}s`, animationDuration: '0.8s' }} />
                  ))
                ) : (
                  <div className="w-2 h-3 border border-gray-500 rounded-sm" />
                )}
              </div>

              <span className="text-gray-300 text-xs truncate max-w-[180px]">
                {activeChannel?.name || 'Casting'}
              </span>
              <span className="text-gray-600 text-xs flex-shrink-0">→ {selectedDevice.name}</span>

              {/* Play/Pause */}
              <button
                onClick={castStatus === 'paused'
                  ? () => { window.electron.cast.resume(); useStore.setState({ castStatus: 'playing' }) }
                  : () => { window.electron.cast.pause();  useStore.setState({ castStatus: 'paused'  }) }
                }
                className="p-1 text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0"
                title={castStatus === 'paused' ? 'Resume' : 'Pause'}
              >
                {castStatus === 'paused' ? <PlayIcon /> : <PauseIcon />}
              </button>

              {/* Stop */}
              <button onClick={handleStop}
                className="p-1 text-gray-400 hover:text-red-400 transition-colors flex-shrink-0"
                title="Stop casting">
                <StopIcon />
              </button>

              {/* Volume */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <VolumeIcon />
                <input type="range" min="0" max="1" step="0.05" defaultValue="1"
                  onChange={handleVolumeChange}
                  className="w-20 accent-purple-500 cursor-pointer" />
              </div>
            </div>
          )}

          {castStatus === 'error' && (
            <span className="text-red-400 text-xs truncate">
              {castError || 'Cast error'}
              <button
                onClick={() => useStore.setState({ castStatus: 'idle', castError: null })}
                className="ml-2 text-gray-500 hover:text-gray-300"
              >dismiss</button>
            </span>
          )}
        </>
      )}

      {/* ── Reconnect toggle ── pushed to the right ── */}
      <div className="ml-auto flex items-center gap-2 flex-shrink-0">
        <span className="text-gray-600 text-xs">Auto-reconnect</span>
        <button
          onClick={() => setAggressiveReconnect(!aggressiveReconnect)}
          title={aggressiveReconnect ? 'Aggressive: will retry on disconnect' : 'Off: will not retry on disconnect'}
          className={`relative w-8 h-4 rounded-full transition-colors ${aggressiveReconnect ? 'bg-purple-600' : 'bg-white/10'}`}
        >
          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow
            ${aggressiveReconnect ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </div>
  )
}

function CastIcon({ active }) {
  return (
    <svg className={`w-4 h-4 flex-shrink-0 ${active ? 'text-purple-400' : 'text-gray-600'}`}
      fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 17a4 4 0 00-4-4M4 13V7a1 1 0 011-1h14a1 1 0 011 1v10a1 1 0 01-1 1h-5" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 17h.01" />
    </svg>
  )
}
function PlayIcon()  { return <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> }
function PauseIcon() { return <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> }
function StopIcon()  { return <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg> }
function VolumeIcon() {
  return (
    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
    </svg>
  )
}
