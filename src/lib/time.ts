export function relativeTime(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function elapsedMinutes(isoString: string): number {
  return Math.floor((Date.now() - new Date(isoString).getTime()) / 60000)
}

export function formatElapsed(isoString: string): string {
  const mins = elapsedMinutes(isoString)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  // A dine-in session never runs a full day. Past 24h the underlying table_session
  // row is stale (never closed), so show days -- an obviously-wrong "87d" a server
  // ignores -- instead of a plausible-looking, alarming "2088h 21m".
  if (hours >= 24) return `${Math.floor(hours / 24)}d (stale)`
  return `${hours}h ${mins % 60}m`
}

export function shiftContextLine(shiftStart: Date): string {
  const day = shiftStart.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Chicago' })
  const time = shiftStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })
  return `${day} shift -- ${time}`
}
