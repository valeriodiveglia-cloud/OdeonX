// src/app/auth/update-password/page.tsx
'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useRouter, useSearchParams } from 'next/navigation'

export default function UpdatePasswordPage() {
  const [ready, setReady] = useState(false)
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const params = useSearchParams()
  const rawNext = params.get('next') || '/dashboard'
  const next = useMemo(() => {
    return rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'
  }, [rawNext])

  const router = useRouter()
  const ensuredOnce = useRef(false)

  function go(target: string) {
    const url = target.includes('?') ? `${target}&updated=1` : `${target}?updated=1`
    router.replace(url)
  }

  function parseFragmentTokens(): { access_token: string; refresh_token: string } | null {
    try {
      const hash = (typeof window !== 'undefined' ? window.location.hash : '') || ''
      const frag = hash.startsWith('#') ? hash.slice(1) : hash
      const sp = new URLSearchParams(frag)
      const access_token = sp.get('access_token') || ''
      const refresh_token = sp.get('refresh_token') || ''
      if (access_token && refresh_token) {
        return {
          access_token: decodeURIComponent(access_token),
          refresh_token: decodeURIComponent(refresh_token),
        }
      }
      return null
    } catch {
      return null
    }
  }

  async function ensureSessionFromUrl(): Promise<boolean> {
    if (ensuredOnce.current) {
      const { data } = await supabase.auth.getSession()
      return !!data?.session
    }
    ensuredOnce.current = true

    // 1) già presente
    let { data: s1 } = await supabase.auth.getSession()
    if (s1?.session) return true

    // 2) tenta PKCE se fosse presente ?code=...
    try {
      await supabase.auth.exchangeCodeForSession(typeof window !== 'undefined' ? window.location.href : '')
      const { data: s2 } = await supabase.auth.getSession()
      if (s2?.session) {
        const u = new URL(window.location.href)
        u.searchParams.delete('code')
        u.searchParams.delete('state')
        window.history.replaceState({}, '', u.toString())
        return true
      }
    } catch {}

    // 3) flusso recovery: token nel fragment
    const tok = parseFragmentTokens()
    if (tok) {
      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: tok.access_token,
          refresh_token: tok.refresh_token,
        })
        if (!error && data?.session) {
          const clean = new URL(window.location.href)
          clean.hash = ''
          window.history.replaceState({}, '', clean.toString())
          return true
        }
      } catch {}
    }

    return false
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await ensureSessionFromUrl()

        const { data: s } = await supabase.auth.getSession()
        const meta = s?.session?.user?.user_metadata as any
        if (s?.session && (meta?.needs_onboarding === false || meta?.is_onboarded === true)) {
          if (!cancelled) go(next)
          return
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router, next])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return

    if (!pwd || pwd.length < 8) {
      setMsg('Password must be at least 8 characters')
      return
    }
    if (pwd !== pwd2) {
      setMsg('Passwords do not match')
      return
    }

    setBusy(true)
    setMsg(null)
    try {
      // assicurati che la sessione esista anche se l’hash è stato consumato
      await ensureSessionFromUrl()

      const { data: sess } = await supabase.auth.getSession()
      if (!sess?.session) throw new Error('Auth session missing! Please reopen the email link.')

      // 1) aggiorna password
      const { error: e1 } = await supabase.auth.updateUser({ password: pwd })
      if (e1) throw e1

      // 2) prendi uid
      const { data: ures, error: uerr } = await supabase.auth.getUser()
      if (uerr) throw uerr
      const uid = ures?.user?.id
      if (!uid) throw new Error('No user id')

      // 3) marca onboarding completato e aggiorna sempre i metadati in AUTH
      try {
        // best effort lato DB
        try { await supabase.rpc('app_mark_onboarded', { p_uid: uid }) } catch {}

        // metadati che il middleware leggerà nel JWT
        await supabase.auth.updateUser({
          data: { is_onboarded: true, needs_onboarding: false },
        })

        // bookkeeping opzionale
        try {
          await supabase
            .from('app_accounts')
            .update({ first_login_at: new Date().toISOString() })
            .is('first_login_at', null)
            .eq('user_id', uid)
        } catch {}
      } catch {}

      // 4) refresh sessione per rigenerare il JWT in cookie
      try { await supabase.auth.refreshSession() } catch {}
      await new Promise(r => setTimeout(r, 100))

      // 5) redirect
      go(next)
    } catch (e: any) {
      setMsg(e?.message || 'Error updating password')
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return <div className="p-6">Preparing…</div>

  return (
    <div className="min-h-[60vh] grid place-items-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-md border rounded-2xl p-6 bg-white">
        <h1 className="text-xl font-bold text-gray-900 mb-4">Set password</h1>

        <div className="space-y-3 mt-3">
          <div>
            <label className="text-sm text-gray-700">New password</label>
            <input
              type="password"
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              className="mt-1 w-full border rounded-lg px-3 py-2"
              placeholder="********"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="text-sm text-gray-700">Confirm password</label>
            <input
              type="password"
              value={pwd2}
              onChange={e => setPwd2(e.target.value)}
              className="mt-1 w-full border rounded-lg px-3 py-2"
              placeholder="********"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </div>
        </div>

        {msg && <div className="mt-3 text-sm text-red-600">{msg}</div>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-lg bg-blue-600 text-white h-10 hover:opacity-90 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </div>
  )
}
