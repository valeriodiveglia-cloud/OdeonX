// src/app/catering/_data/useCalcBus.ts
/* CalcBus centralizzato: fornisce
   - useCalcTick(): hook che “bumpa” quando qualcuno emette un tick
   - emitCalcTick(): da chiamare dopo salvataggi/aggiornamenti per forzare il refresh live

   Canali usati:
   1) bus in-memory (window.__calcBus__) → istantaneo nella stessa tab
   2) evento DOM 'calc:tick'            → per useEffect che ascoltano eventi
   3) localStorage 'eventcalc.tick'     → cross-tab
*/

import { useEffect, useState } from 'react'

type Handler = () => void
const KEY = 'eventcalc.tick'

declare global {
  interface Window {
    __calcBus__?: {
      on: (evt: string, h: Handler) => void
      off: (evt: string, h: Handler) => void
      emit: (evt: string) => void
    }
  }
}

// Inizializza il bus in-memory una sola volta (client only)
if (typeof window !== 'undefined' && !window.__calcBus__) {
  const listeners = new Map<string, Set<Handler>>()
  window.__calcBus__ = {
    on(evt, h) {
      let set = listeners.get(evt)
      if (!set) { set = new Set(); listeners.set(evt, set) }
      set.add(h)
    },
    off(evt, h) { listeners.get(evt)?.delete(h) },
    emit(evt) {
      const set = listeners.get(evt)
      if (!set) return
      for (const h of Array.from(set)) {
        try { h() } catch {}
      }
    },
  }
}

/** Hook: ritorna un numero che cambia ogni volta che viene emesso un calc tick. */
export function useCalcTick(): number {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return

    let mounted = true
    const bump = () => { if (mounted) setTick(t => (t + 1) | 0) }

    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) bump()
    }

    // Ascolta i 3 canali
    window.addEventListener('calc:tick', bump as EventListener)
    window.addEventListener('storage', onStorage)

    // in-memory bus
    let off: (() => void) | undefined
    try {
      const bus = window.__calcBus__
      if (bus?.on) { bus.on('tick', bump); off = () => bus.off?.('tick', bump) }
    } catch {}

    return () => {
      mounted = false
      window.removeEventListener('calc:tick', bump as EventListener)
      window.removeEventListener('storage', onStorage)
      try { off?.() } catch {}
    }
  }, [])

  return tick
}

/** Da chiamare dopo un update che impatta i totali/percentuali. */
export function emitCalcTick(): void {
  try { window.__calcBus__?.emit?.('tick') } catch {}
  try { window.dispatchEvent(new Event('calc:tick')) } catch {}
  try { localStorage.setItem(KEY, String(Date.now())) } catch {}
}
