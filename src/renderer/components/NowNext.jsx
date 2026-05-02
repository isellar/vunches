import { useStore } from '../store/useStore'

export function NowNextBadge({ tvgId }) {
  const { getNowNext, epgStatus } = useStore()
  if (epgStatus !== 'ready' || !tvgId) return null

  const { now, next } = getNowNext(tvgId)
  if (!now && !next) return null

  const prog = now || next
  const isNow = !!now

  // Progress bar — how far through the current programme
  const pct = now
    ? Math.min(100, Math.round(((Date.now() - now.start) / (now.stop - now.start)) * 100))
    : null

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5 min-w-0">
        {isNow ? (
          <span className="text-[10px] font-semibold text-purple-400 flex-shrink-0 uppercase tracking-wide">Now</span>
        ) : (
          <span className="text-[10px] font-semibold text-gray-600 flex-shrink-0 uppercase tracking-wide">Next</span>
        )}
        <span className="text-xs text-gray-400 truncate">{prog.title}</span>
      </div>
      {pct !== null && (
        <div className="mt-1 h-0.5 bg-white/8 rounded-full overflow-hidden">
          <div className="h-full bg-purple-500/60 rounded-full" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}
