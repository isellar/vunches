export default function LoadingScreen({ progress }) {
  const stage = progress?.stage
  const channelCount = progress?.channelCount || 0
  const receivedBytes = progress?.receivedBytes || 0
  const totalBytes = progress?.totalBytes || 0
  const pct = totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : null

  // Human-readable bytes
  function fmtBytes(b) {
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
    if (b >= 1024)        return `${(b / 1024).toFixed(0)} KB`
    return `${b} B`
  }

  const stageLabel = {
    cache:       'Loading from cache...',
    downloading: 'Downloading playlist...',
    parsing:     'Parsing channels...',
    done:        'Done',
  }[stage] ?? 'Loading playlist...'

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-12">
      <div className="w-full max-w-sm">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-purple-600/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        {/* Stage label */}
        <p className="text-center text-gray-200 font-medium mb-1">{stageLabel}</p>

        {/* Detail line */}
        <p className="text-center text-gray-500 text-sm mb-5 h-5">
          {stage === 'downloading' && channelCount > 0 && (
            <>
              {channelCount.toLocaleString()} channels found
              {totalBytes > 0
                ? ` · ${fmtBytes(receivedBytes)} / ${fmtBytes(totalBytes)}`
                : ` · ${fmtBytes(receivedBytes)}`
              }
            </>
          )}
          {stage === 'downloading' && channelCount === 0 && totalBytes > 0 && (
            `${fmtBytes(receivedBytes)} / ${fmtBytes(totalBytes)}`
          )}
          {stage === 'downloading' && channelCount === 0 && totalBytes === 0 && receivedBytes > 0 && (
            `${fmtBytes(receivedBytes)} downloaded`
          )}
          {stage === 'parsing' && `Loaded ${fmtBytes(receivedBytes)} · processing ${channelCount.toLocaleString()} channels...`}
          {stage === 'cache' && (progress?.message || 'Restoring from cache...')}
        </p>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-white/8 rounded-full overflow-hidden">
          {pct !== null ? (
            <div
              className="h-full bg-purple-500 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          ) : (
            // Indeterminate bar
            <div className="h-full w-1/3 bg-purple-500 rounded-full animate-indeterminate" />
          )}
        </div>

        {/* Percentage */}
        {pct !== null && (
          <p className="text-center text-gray-600 text-xs mt-2 tabular-nums">{pct}%</p>
        )}
      </div>
    </div>
  )
}
