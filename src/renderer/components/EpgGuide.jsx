import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'

const MINS_VISIBLE = 120        // 2 hours visible at a time
const PX_PER_MIN   = 6          // pixels per minute
const CHAN_W       = 160        // channel label column width
const ROW_H        = 64         // row height per channel
const HEADER_H     = 48         // time header height

export default function EpgGuide() {
  const { epg, channels, setShowGuide, activeChannel, setActiveChannel,
          selectedDevice, setCastStatus, setCastError, aggressiveReconnect } = useStore()

  const [now, setNow] = useState(() => Date.now())
  const scrollRef = useRef(null)

  // Tick every 30s to keep "now" line current
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // Start time = current hour, rounded down
  const startTime = useMemo(() => {
    const d = new Date(now)
    d.setMinutes(0, 0, 0)
    d.setHours(d.getHours() - 1) // show 1 hour back
    return d.getTime()
  }, [Math.floor(now / 3600000)]) // only recalc each hour

  const totalMins  = MINS_VISIBLE + 60 // 1h back + 2h forward
  const totalWidth = totalMins * PX_PER_MIN

  // Channels that have EPG data, matched to the loaded channels list
  const epgChannels = useMemo(() => {
    return channels
      .filter(ch => ch.tvgId && epg[ch.tvgId]?.length)
      .slice(0, 200) // cap at 200 rows for performance
  }, [channels, epg])

  // Scroll to "now" on mount
  useEffect(() => {
    if (scrollRef.current) {
      const nowOffset = ((now - startTime) / 60000) * PX_PER_MIN
      scrollRef.current.scrollLeft = Math.max(0, nowOffset - 200)
    }
  }, [])

  function timeLabel(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  async function handlePlay(channel) {
    setActiveChannel(channel)
    // Read fresh state — avoids stale closure issues
    const { selectedDevice: device, aggressiveReconnect: aggressive,
            setCastStatus: setCS, setCastError: setCE } = useStore.getState()
    if (device) {
      setCS('connecting')
      setCE(null)
      const result = await window.electron.cast.play({
        ...device, url: channel.url, title: channel.name, aggressive,
      })
      if (result?.ok) setCS('playing')
      else { setCS('error'); setCE(result?.error || 'Cast failed') }
    } else {
      window.electron.playStream(channel.url, channel.name)
    }
  }

  // Time header marks — every 30 mins
  const timeMarks = []
  for (let m = 0; m <= totalMins; m += 30) {
    timeMarks.push({ mins: m, ts: startTime + m * 60000 })
  }

  const nowOffsetPx = ((now - startTime) / 60000) * PX_PER_MIN

  return (
    <div className="absolute inset-0 flex flex-col bg-[#0f0f0f] z-30">
      {/* Guide header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h2 className="font-semibold text-gray-100">TV Guide</h2>
          <span className="text-xs text-gray-500">{epgChannels.length} channels with guide data</span>
        </div>
        <button onClick={() => setShowGuide(false)}
          className="text-gray-500 hover:text-gray-200 p-1.5 rounded-lg hover:bg-white/5 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {epgChannels.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-gray-600">
          <p className="text-sm">No channels matched EPG data</p>
          <p className="text-xs mt-1 text-gray-700">Make sure your playlist has tvg-id tags matching the EPG</p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Sticky channel label column */}
          <div className="flex-shrink-0 border-r border-white/5" style={{ width: CHAN_W }}>
            {/* Top-left corner — spacer for time header */}
            <div style={{ height: HEADER_H }} className="border-b border-white/5 bg-[#0f0f0f]" />
            <div className="overflow-hidden" style={{ height: `calc(100% - ${HEADER_H}px)` }}>
              <div style={{ paddingBottom: 16 }}>
                {epgChannels.map((ch) => (
                  <div key={ch.url}
                    onClick={() => handlePlay(ch)}
                    className={`flex items-center gap-2.5 px-3 cursor-pointer border-b border-white/[0.04]
                      transition-colors hover:bg-white/5
                      ${activeChannel?.url === ch.url ? 'bg-purple-600/15' : ''}`}
                    style={{ height: ROW_H }}>
                    {/* Logo */}
                    <div className="w-7 h-7 flex-shrink-0 rounded bg-white/5 overflow-hidden flex items-center justify-center">
                      {ch.tvgLogo ? (
                        <img src={ch.tvgLogo} alt="" className="w-full h-full object-contain"
                          onError={e => e.target.style.display='none'} loading="lazy" />
                      ) : (
                        <svg className="w-4 h-4 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/>
                        </svg>
                      )}
                    </div>
                    <span className="text-xs text-gray-300 truncate leading-tight">{ch.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Scrollable programme grid */}
          <div ref={scrollRef} className="flex-1 overflow-auto">
            <div style={{ width: totalWidth, position: 'relative' }}>
              {/* Time header */}
              <div style={{ height: HEADER_H, position: 'sticky', top: 0, zIndex: 10 }}
                className="bg-[#111] border-b border-white/5">
                {timeMarks.map(({ mins, ts }) => (
                  <div key={mins} style={{ position: 'absolute', left: mins * PX_PER_MIN, top: 0, height: '100%' }}
                    className="flex items-center border-l border-white/5 pl-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">{timeLabel(ts)}</span>
                  </div>
                ))}
                {/* Now line in header */}
                <div style={{ position: 'absolute', left: nowOffsetPx, top: 0, width: 2, height: '100%' }}
                  className="bg-purple-500 opacity-80" />
              </div>

              {/* Programme rows */}
              <div style={{ position: 'relative' }}>
                {/* Now line */}
                <div style={{
                  position: 'absolute', left: nowOffsetPx, top: 0,
                  width: 2, height: epgChannels.length * ROW_H, zIndex: 5,
                }} className="bg-purple-500 opacity-40" />

                {epgChannels.map((ch) => {
                  const progs = epg[ch.tvgId] || []
                  // Only show programmes in visible time range
                  const visible = progs.filter(p =>
                    p.stop > startTime && p.start < startTime + totalMins * 60000
                  )

                  return (
                    <div key={ch.url} className="border-b border-white/[0.04] relative"
                      style={{ height: ROW_H }}>
                      {visible.map((prog, i) => {
                        const left  = Math.max(0, ((prog.start - startTime) / 60000) * PX_PER_MIN)
                        const right = Math.min(totalWidth, ((prog.stop  - startTime) / 60000) * PX_PER_MIN)
                        const width = Math.max(2, right - left)
                        const isNow = prog.start <= now && prog.stop > now

                        return (
                          <div key={i}
                            onClick={() => handlePlay(ch)}
                            style={{ position: 'absolute', left, width: width - 2, top: 4, height: ROW_H - 8 }}
                            className={`rounded px-2 flex flex-col justify-center overflow-hidden cursor-pointer
                              border transition-colors group
                              ${isNow
                                ? 'bg-purple-600/25 border-purple-500/40 hover:bg-purple-600/35'
                                : 'bg-white/[0.04] border-white/[0.06] hover:bg-white/8'}`}
                          >
                            <p className={`text-xs font-medium truncate leading-tight
                              ${isNow ? 'text-purple-200' : 'text-gray-200'}`}>
                              {prog.title}
                            </p>
                            {width > 120 && (
                              <p className="text-[10px] text-gray-500 truncate mt-0.5">
                                {timeLabel(prog.start)} – {timeLabel(prog.stop)}
                              </p>
                            )}
                            {/* Progress bar for current programme */}
                            {isNow && (
                              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5 rounded-b">
                                <div className="h-full bg-purple-400 rounded-b" style={{
                                  width: `${Math.min(100, ((now - prog.start) / (prog.stop - prog.start)) * 100)}%`
                                }} />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
