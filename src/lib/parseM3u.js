/**
 * Parse M3U playlist text into channel objects.
 * Returns array of { name, url, tvgId, tvgLogo, group: { title } }
 */
export function parseM3u(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const channels = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('#EXTINF')) continue

    // Parse attributes from the #EXTINF line
    const tvgId = line.match(/tvg-id="([^"]*)"/)?.[1] || ''
    const tvgName = line.match(/tvg-name="([^"]*)"/)?.[1] || ''
    const tvgLogo = line.match(/tvg-logo="([^"]*)"/)?.[1] || ''
    const groupTitle = line.match(/group-title="([^"]*)"/)?.[1] || ''

    // Channel name is after the last comma
    const commaIdx = line.lastIndexOf(',')
    const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : tvgName || 'Unknown'

    // Next non-comment line is the URL
    let url = ''
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].startsWith('#')) {
        url = lines[j].trim()
        i = j // skip ahead
        break
      }
    }

    if (!url) continue

    channels.push({
      id: `${tvgId || name}-${url}`,
      name: name || tvgName || 'Unknown Channel',
      url,
      tvgId,
      tvgLogo,
      group: { title: groupTitle },
    })
  }

  return channels
}
