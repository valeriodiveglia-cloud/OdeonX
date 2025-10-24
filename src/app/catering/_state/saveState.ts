// src/app/catering/_state/saveState.ts
export function dirtyKey(eventId?: string | null) {
  return `eventcalc.save.dirty:${eventId || ''}`
}
export function lastAtKey(eventId?: string | null) {
  return `eventcalc.save.lastAt:${eventId || ''}`
}
export function markDirty(eventId?: string | null) {
  try {
    localStorage.setItem(dirtyKey(eventId), '1')
    window.dispatchEvent(new CustomEvent('eventcalc:dirty', { detail: { eventId } }))
  } catch {}
}
export function markSaved(eventId?: string | null) {
  try {
    localStorage.setItem(dirtyKey(eventId), '0')
    localStorage.setItem(lastAtKey(eventId), String(Date.now()))
    window.dispatchEvent(new CustomEvent('eventcalc:saved', { detail: { eventId } }))
  } catch {}
}
export function getInitialDirty(eventId?: string | null) {
  try { return localStorage.getItem(dirtyKey(eventId)) === '1' } catch { return false }
}
