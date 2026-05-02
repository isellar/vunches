import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'

export default function CastBar() {
  const { activeChannel } = useStore()
  const [devices, setDevices] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [casting, setCasting] = useState(null)   // { name, host, port } of active device
  const [status, setStatus] = useState('idle')   // idle | connecting | playing | paused | error
  const [volume, setVolume] = useState(1)
  const [error, setError] = useState(null)
  const pickerRef = useRef(null)

  // Start discovery and listen for events when mounted
  useEffect(() => {
    window.electron.cast.startDiscovery().then(setDevices)
    window.electron.cast.onDevicesUpdated(setDevices)
    window.electron.cast.onMediaStatus((s) => {
      if (s.type === 'MEDIA_STATUS' && s.status?.[0]) {
        const ps = s.status[0].playerState
        if (ps === 'PLAYING') setStatus('playing')
        else if (ps === 'PAUSED') setStatus('paused')
        else if (ps === 'IDLE' || ps === 'FINISHED') {
          setStatus('idle')
          setCasting(null)
        }
      }
    })
    window.electron.cast.onDisconnected(() => {
      setCasting(null)
      setStatus('idle')
    })
    return () => window.electron.cast.offAll()
  }, [])

  // Close picker when clicking outside
  useEffect(() => {
    function handler(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleCast(device) {
    if (!activeChannel) return
    setShowPicker(false)
    setCasting(device)
    setStatus('connecting')
    setError(null)

    const result = await window.electron.cast.play({
      host: device.host,
      port: device.port,
      url: activeChannel.url,
      title: activeChannel.name,
    })

    if (result?.ok) {
      setStatus('playing')
    } else {
      setError(result?.error || 'Failed to connect')
      setStatus('error')
      setCasting(null)
    }
  }

  async function handleStop() {
    await window.electron.cast.stop()
    setCasting(null)
    setStatus('idle')
  }

  async function handleVolumeChange(e) {
    const v = parseFloat(e.target.value)
    setVolume(v)
    await window.electron.cast.setVolume(v)
  }

  const hasCasting = !!casting

  return (
    <div className="flex items-center gap-2 px-4 h-12 bg-[#111] border-t border-white/5 flex-shrink-0">
      {/* Cast icon + device picker */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => !hasCasting && setShowPicker((v) => !v)}
          title={hasCasting ? `Casting to ${casting.name}` : devices.length ? 'Cast to device' : 'No cast devices found'}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm transition-colors
            ${hasCasting
              ? 'text-purple-300 bg-purple-600/20 cursor-default'
              : devices.length
                ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5 cursor-pointer'
                : 'text-gray-700 cursor-not-allowed'
            }`}
        >
          <CastIcon active={hasCasting} />
          <span className="text-xs">
            {hasCasting ? casting.name : devices.length ? `${devices.length} device${devices.length > 1 ? 's' : ''}` : 'No devices'}
          </span>
          {status === 'connecting' && (
            <div className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin" />
          )}
        </button>

        {/* Device picker dropdown */}
        {showPicker && devices.length > 0 && (
          <div className="absolute bottom-full mb-2 left-0 w-56 bg-[#222] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
            <p className="text-xs text-gray-500 px-3 py-2 border-b border-white/5">
              {activeChannel ? `Cast "${activeChannel.name}"` : 'Select a channel first'}
            </p>
            {devices.map((device) => (
              <button
                key={device.host}
                onClick={() => handleCast(device)}
                disabled={!activeChannel}
                className="w-full text-left px-3 py-2.5 text-sm text-gray-200 hover:bg-white/5
                           disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <CastIcon active={false} className="w-4 h-4 text-gray-500" />
                <span className="truncate">{device.name}</span>
                <span className="ml-auto text-xs text-gray-600">{device.host}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active cast controls */}
      {hasCasting && (
        <>
          <div className="w-px h-5 bg-white/10" />

          {/* Now casting label */}
          <span className="text-xs text-gray-500 truncate max-w-[160px]">
            {activeChannel?.name}
          </span>

          {/* Play/Pause */}
          <button
            onClick={status === 'paused'
              ? () => { window.electron.cast.resume(); setStatus('playing') }
              : () => { window.electron.cast.pause(); setStatus('paused') }
            }
            className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
            title={status === 'paused' ? 'Resume' : 'Pause'}
          >
            {status === 'paused' ? <PlayIcon /> : <PauseIcon />}
          </button>

          {/* Stop */}
          <button
            onClick={handleStop}
            className="p-1 text-gray-400 hover:text-red-400 transition-colors"
            title="Stop casting"
          >
            <StopIcon />
          </button>

          {/* Volume */}
          <div className="flex items-center gap-1.5 ml-1">
            <VolumeIcon muted={volume === 0} />
            <input
              type="range"
              min="0" max="1" step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              className="w-20 accent-purple-500 cursor-pointer"
            />
          </div>
        </>
      )}

      {/* Error */}
      {error && status === 'error' && (
        <span className="text-xs text-red-400 ml-2 truncate">{error}</span>
      )}
    </div>
  )
}

function CastIcon({ active, className = 'w-4 h-4' }) {
  return (
    <svg className={`${className} ${active ? 'text-purple-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 17a4 4 0 00-4-4M4 13V7a1 1 0 011-1h14a1 1 0 011 1v10a1 1 0 01-1 1h-5" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 17h.01" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 6h12v12H6z" />
    </svg>
  )
}

function VolumeIcon({ muted }) {
  return muted ? (
    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l-5-5M17 9l-5 5" />
    </svg>
  ) : (
    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    </svg>
  )
}
