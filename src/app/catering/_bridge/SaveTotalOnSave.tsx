'use client'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase_shim'

type Props = { eventId?: string | null }

const SNAP_KEY = (id: string) => `eventcalc.snap.totals:${id}`

export default function SaveTotalOnSave({ eventId }: Props) {
  useEffect(() => {
    if (!eventId) return

    const handler = async () => {
      try {
        // Leggi SOLO lo snapshot "stabile" scritto dalla Totals Card quando è tutto pronto
        let total = 0
        try {
          const raw = localStorage.getItem(SNAP_KEY(eventId))
          if (raw) {
            const snap = JSON.parse(raw) || {}
            const n = Number(snap.priceAfterDiscounts)
            if (Number.isFinite(n)) total = Math.round(n)
          }
        } catch {}

        // Se non abbiamo uno snapshot stabile, NON scriviamo (meglio nessun update che un parziale)
        if (!Number.isFinite(total) || total <= 0) return

        const { error } = await supabase.rpc('event_totals_set_total', {
          p_event_id: eventId,
          p_total: total,
        })
        if (error) {
          console.error('[event_totals_set_total] RPC error:', error.message)
        } else {
          // opzionale: segnale locale per UI/lista
          try { window.dispatchEvent(new CustomEvent('event_total:updated', { detail: { eventId, total } })) } catch {}
        }
      } catch (e) {
        console.error('[SaveTotalOnSave] exception:', e)
      }
    }

    // ascolta entrambi (compat)
    window.addEventListener('eventcalc:saved',    handler as EventListener)
    window.addEventListener('eventcalc:saved-ok', handler as EventListener)
    return () => {
      window.removeEventListener('eventcalc:saved',    handler as EventListener)
      window.removeEventListener('eventcalc:saved-ok', handler as EventListener)
    }
  }, [eventId])

  return null
}
