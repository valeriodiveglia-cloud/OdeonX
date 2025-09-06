'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase_shim'

export default function AuthCallbackPage() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/login'   // default: login

  useEffect(() => {
    (async () => {
      try {
        const code = params.get('code')
        if (code) {
          await supabase.auth.exchangeCodeForSession(code).catch(() => {})
        } else {
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
        router.replace(`/auth/update-password?next=${encodeURIComponent(next)}`)
      }
    })()
  }, [params, router, next])

  return <div className="min-h-[60vh] grid place-items-center p-6 text-white">Signing you in…</div>
}
