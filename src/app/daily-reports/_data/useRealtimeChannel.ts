// src/app/daily-reports/_data/useRealtimeChannel.ts
'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'

/**
 * Kill switch senza .env:
 *  - localStorage:   localStorage.setItem('FC_RT_OFF','1')  // ON
 *                    localStorage.removeItem('FC_RT_OFF')   // OFF
 *  - global flag:    window.FC_RT_OFF = '1'                 // ON (per sessione)
 */
function isRtOff() {
  try {
    // @ts-ignore
    if (typeof window !== 'undefined' && window.FC_RT_OFF === '1') return true
    if (typeof localStorage !== 'undefined' && localStorage.getItem('FC_RT_OFF') === '1') return true
  } catch {}
  return false
}

// Singleton registry per deduplicare canali per tab
const channelRegistry: Record<string, { ref: number; ch: ReturnType<typeof supabase.channel> }> = {}

// Broadcast tra tab per diagnostica e coordination leggera
const bc =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('fc-rt')
    : null

function bcPost(msg: any) {
  try {
    bc?.postMessage(msg)
  } catch {}
}

type Handler = () => void

export function useRealtimeChannel(
  nameBase: string,
  tables: string[],
  onEvent: Handler
) {
  const installedKeyRef = useRef<string>('')
  const isActiveRef = useRef(true)

  // guard per evitare onEvent dopo unmount / wake con hook smontato
  useEffect(() => {
    isActiveRef.current = true
    return () => {
      isActiveRef.current = false
    }
  }, [])

  useEffect(() => {
    if (isRtOff()) return

    // normalizziamo subito le tabelle
    const sortedTables = Array.from(new Set(tables)).sort()
    const tablesKey = JSON.stringify(sortedTables)

    // Niente subscribe se tab nascosta
    const hidden =
      typeof document !== 'undefined' && document.visibilityState === 'hidden'

    if (hidden) {
      const onVisible = () => {
        if (!isActiveRef.current) return
        if (document.visibilityState === 'visible') {
          try {
            onEvent()
          } catch (e) {
            console.error('[useRealtimeChannel] onEvent error after visible', e)
          }
        }
      }
      document.addEventListener('visibilitychange', onVisible, { once: true })
      return () =>
        document.removeEventListener('visibilitychange', onVisible)
    }

    // Key unica per dedup
    const key = `${nameBase}:${tablesKey}`
    installedKeyRef.current = key

    if (!channelRegistry[key]) {
      const chName = `${nameBase}-${Math.random().toString(36).slice(2)}`
      const ch = supabase.channel(chName)

      for (const t of sortedTables) {
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: t },
          () => {
            if (!isActiveRef.current) return
            try {
              onEvent()
            } catch (e) {
              console.error('[useRealtimeChannel] onEvent handler error', e)
            }
          }
        )
      }

      ch.subscribe()
      channelRegistry[key] = { ref: 1, ch }

      try {
        // diagnostica
        ;(window as any).__rt_open = ((window as any).__rt_open || 0) + 1
        console.log('[rt] +open', chName, 'total:', (window as any).__rt_open)
        bcPost({ t: 'open', ch: chName, total: (window as any).__rt_open })
      } catch {}
    } else {
      channelRegistry[key].ref += 1
    }

    return () => {
      const k = installedKeyRef.current
      const reg = channelRegistry[k]
      if (!reg) return
      reg.ref -= 1
      if (reg.ref <= 0) {
        try {
          supabase.removeChannel(reg.ch)
          ;(window as any).__rt_open = Math.max(
            0,
            ((window as any).__rt_open || 1) - 1
          )
          console.log('[rt] -close', k, 'total:', (window as any).__rt_open)
          bcPost({ t: 'close', key: k, total: (window as any).__rt_open })
        } catch {}
        delete channelRegistry[k]
      }
    }
  }, [
    nameBase,
    onEvent,
    // mantiene key stabile rispetto all'insieme di tabelle, ordine indipendente
    JSON.stringify(Array.from(new Set(tables)).sort()),
  ])
}