// src/app/dev-error-guard.tsx
'use client'

import React, { useEffect } from 'react'

/**
 * Silenzia SOLO in development gli errori "rumorosi" generati da eventi di caricamento
 * (es. iframe / fetch interni a SuperDoc) che arrivano come [object Event] o con isTrusted=true.
 * In produzione NON tocca nulla.
 */
export default function ClientErrorGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return

    const onUnhandled = (ev: PromiseRejectionEvent) => {
      try {
        const r: any = ev.reason
        const looksLikeNoise =
          r instanceof Event ||
          r?.isTrusted === true ||
          (r && typeof r === 'object' && Object.keys(r).length === 0)

        if (looksLikeNoise) {
          ev.preventDefault()
          // Non usiamo console.error per non attivare l'overlay Next
          console.warn('[silenced:unhandledrejection]', r)
        }
      } catch {
        // se per qualche motivo esplode la lettura, non blocchiamo l’app
      }
    }

    const onWindowError = (ev: Event) => {
      const anyEv: any = ev
      const looksLikeNoise =
        (anyEv?.error == null && anyEv?.message == null) &&
        (anyEv?.isTrusted === true || anyEv?.target?.tagName === 'IFRAME')

      if (looksLikeNoise && typeof (ev as any).preventDefault === 'function') {
        ;(ev as any).preventDefault()
        console.warn('[silenced:error]', anyEv)
      }
    }

    window.addEventListener('unhandledrejection', onUnhandled)
    window.addEventListener('error', onWindowError, { capture: true })

    return () => {
      window.removeEventListener('unhandledrejection', onUnhandled)
      window.removeEventListener('error', onWindowError, { capture: true } as any)
    }
  }, [])

  return <>{children}</>
}