'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    (async () => {
      try {
        // Caso PKCE: link con ?code=...
        const code = params.get('code')
        if (code) {
          await supabase.auth.exchangeCodeForSession(code).catch(() => {})
        } else {
          // Caso implicit: link con #access_token=...&refresh_token=...
          const hash = window.location.hash || ''
          if (hash.startsWith('#')) {
            const hp = new URLSearchParams(hash.slice(1))
            const access_token = hp.get('access_token') || undefined
            const refresh_token = hp.get('refresh_token') || undefined
            if (access_token && refresh_token) {
              await supabase.auth.setSession({ access_token, refresh_token }).catch(() => {})
            }
          }
        }
      } finally {
        router.replace('/auth/update-password')
      }
    })()
  }, [params, router])

  return (
    <div className="min-h-[60vh] grid place-items-center p-6 text-white">
      Autenticazione in corso…
    </div>
  )
}
