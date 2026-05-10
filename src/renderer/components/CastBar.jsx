import { useStore } from '../store/useStore'

export default function CastBar() {
  const {
    castDevices, selectedDevice, selectDevice,
    castStatus, castError,
    aggressiveReconnect, setAggressiveReconnect,
    activeChannel,
  } = useStore()

  const isCasting = selectedDevice &&
    ['playing', 'paused', 'reconnecting', 'connecting', 'error'].includes(castStatus)
  const hasDevices = castDevices.length > 0

  async function handleStop() {
    await window.electron.cast.stop()
    useStore.setState({ castStatus: 'idle', castError: null })
  }

  async function handleVolumeChange(e) {
    await window.electron.cast.setVolume(parseFloat(e.target.value))
  }

  return (
    <div className="flex-shrink-0 bg-[#0d0d0d] border-t border-white/5">

      {/* Active cast controls — only shown while casting */}
      {isCasting && (castStatus === 'playing' || castStatus === 'paused') && (
        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-white/5">
          {/* Now playing indicator */}
          <div className="flex items-end gap-[3px] h-5 flex-shrink-0">
            {castStatus === 'playing' ? (
              [1, 2, 3, 2].map((h, i) => (
                <div key={i} className="w-[3px] bg-purple-400 rounded-full animate-pulse"
                  style={{ height: `${6+h*3}px`, animationDelay: `${i*0.12}s`, animationDuration: '0.9s' }} />
              ))
            ) : (
              <div className="flex items-end gap-[3px] h-5">
                {[1,2,3,2].map((h,i) => (
                  <div key={i} className="w-[3px] bg-gray-600 rounded-full"
                    style={{ height: `${6+h*3}px` }} />
                ))}
              </div>
            )}
          </div>

          {/* Channel name + device */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-100 truncate">
              {activeChannel?.name || 'Casting'}
            </p>
            <p className="text-xs text-gray-500">
              Playing on <span className="text-purple-400">{selectedDevice.name}</span>
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={castStatus === 'paused'
                ? () => { window.electron.cast.resume(); useStore.setState({ castStatus: 'playing' }) }
                : () => { window.electron.cast.pause();  useStore.setState({ castStatus: 'paused'  }) }
              }
              className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-300
                         hover:text-white hover:bg-white/8 transition-colors"
              title={castStatus === 'paused' ? 'Resume' : 'Pause'}
            >
              {castStatus === 'paused' ? <PlayIcon /> : <PauseIcon />}
            </button>
            <button onClick={handleStop}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400
                         hover:text-red-400 hover:bg-red-900/20 transition-colors"
              title="Stop casting">
              <StopIcon />
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <VolumeIcon />
            <input type="range" min="0" max="1" step="0.05" defaultValue="1"
              onChange={handleVolumeChange}
              className="w-24 accent-purple-500 cursor-pointer" />
          </div>
        </div>
      )}

      {/* Reconnecting / connecting state */}
      {selectedDevice && (castStatus === 'connecting' || castStatus === 'reconnecting') && (
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/5">
          <div className={`w-3.5 h-3.5 border-2 rounded-full animate-spin flex-shrink-0
            ${castStatus === 'reconnecting' ? 'border-amber-400 border-t-transparent' : 'border-purple-400 border-t-transparent'}`} />
          <span className={`text-sm ${castStatus === 'reconnecting' ? 'text-amber-400' : 'text-gray-300'}`}>
            {castStatus === 'reconnecting' ? 'Connection lost — reconnecting...' : `Connecting to ${selectedDevice.name}...`}
          </span>
        </div>
      )}

      {/* Error state */}
      {castStatus === 'error' && (
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/5 bg-red-900/10">
          <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="text-sm text-red-300 flex-1 truncate">{castError || 'Cast failed'}</span>
          <button onClick={() => useStore.setState({ castStatus: 'idle', castError: null })}
            className="text-xs text-gray-500 hover:text-gray-300 flex-shrink-0 px-2 py-1 rounded hover:bg-white/5">
            Dismiss
          </button>
        </div>
      )}

      {/* Bottom bar — device selector OR disconnect + reconnect toggle */}
      <div className="flex items-center gap-3 px-5 h-12">

        {/* Cast icon */}
        <CastIcon active={isCasting} />

        {/* Device selector — always visible */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {!hasDevices ? (
            <span className="flex items-center gap-2 text-xs text-gray-600">
              <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" />
              Scanning...
            </span>
          ) : (
            <select
              value={selectedDevice?.host || ''}
              onChange={(e) => {
                const device = castDevices.find(d => d.host === e.target.value) || null
                if (isCasting) window.electron.cast.stop()
                selectDevice(device)
                useStore.setState({ castStatus: 'idle', castError: null })
              }}
              className="bg-[#1c1c1c] border border-white/10 text-gray-200 text-sm rounded-lg
                         px-3 py-1.5 outline-none focus:border-purple-500/50 cursor-pointer
                         min-w-[160px] max-w-[220px]"
            >
              <option value="">Select cast device...</option>
              {castDevices.map(d => (
                <option key={d.host} value={d.host}>{d.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Disconnect — always available when a device is selected */}
        {selectedDevice && (
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm
                       text-red-400 border border-red-900/40 hover:bg-red-900/20 transition-colors flex-shrink-0"
            title="Disconnect from Chromecast"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h12v12H6z"/>
            </svg>
            Disconnect
          </button>
        )}

        {/* Ready hint — only when device selected but not casting */}
        {selectedDevice && castStatus === 'idle' && (
          <span className="text-xs text-gray-600">
            Click a channel to cast to <span className="text-gray-400">{selectedDevice.name}</span>
          </span>
        )}

        {/* Reconnect toggle — pushed right */}
        <div className="ml-auto flex items-center gap-2.5 flex-shrink-0">
          <span className="text-xs text-gray-500">Auto-reconnect</span>
          <button
            onClick={() => setAggressiveReconnect(!aggressiveReconnect)}
            title={aggressiveReconnect ? 'On: retries on disconnect' : 'Off: stops on disconnect'}
            className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0
              ${aggressiveReconnect ? 'bg-purple-600' : 'bg-white/10'}`}
          >
            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow transition-transform
              ${aggressiveReconnect ? 'translate-x-[18px]' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>
    </div>
  )
}

function CastIcon({ active }) {
  return (
    <svg className={`w-5 h-5 flex-shrink-0 transition-colors ${active ? 'text-purple-400' : 'text-gray-600'}`}
      fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M8 17a4 4 0 00-4-4M4 13V7a1 1 0 011-1h14a1 1 0 011 1v10a1 1 0 01-1 1h-5" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 17h.01" />
    </svg>
  )
}
function PlayIcon()  {
  return <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
}
function PauseIcon() {
  return <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
}
function StopIcon()  {
  return <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
}
function VolumeIcon() {
  return (
    <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
    </svg>
  )
}
