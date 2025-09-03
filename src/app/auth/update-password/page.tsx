'use client'
import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useRouter, useSearchParams } from 'next/navigation'

export default function UpdatePasswordPage() {
  const [ready, setReady] = useState(false)
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const params = useSearchParams()
  const next = params.get('next') || '/login'
  const router = useRouter()

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code') || url.hash.match(/code=([^&]+)/)?.[1]
        if (code) await supabase.auth.exchangeCodeForSession(code).catch(() => {})
      } finally { setReady(true) }
    })()
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!pwd || pwd.length < 8) { setMsg('Password must be at least 8 characters'); return }
    if (pwd !== pwd2)          { setMsg('Passwords do not match'); return }
    setBusy(true); setMsg(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd })
      if (error) throw error
      await supabase.auth.signOut().catch(() => {})         // <- logout forzato
      const target = next.includes('?') ? `${next}&updated=1` : `${next}?updated=1`
      // usa una navigazione “hard” per evitare qualunque cache/404
      window.location.assign(target)
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
        <h1 className="text-xl font-semibold mb-4">Set password</h1>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-700">New password</label>
            <input type="password" value={pwd} onChange={e => setPwd(e.target.value)}
                   className="mt-1 w-full border rounded-lg px-3 py-2" placeholder="********" minLength={8}/>
          </div>
          <div>
            <label className="text-sm text-gray-700">Confirm password</label>
            <input type="password" value={pwd2} onChange={e => setPwd2(e.target.value)}
                   className="mt-1 w-full border rounded-lg px-3 py-2" placeholder="********" minLength={8}/>
          </div>
        </div>
        {msg && <div className="mt-3 text-sm text-gray-700">{msg}</div>}
        <button type="submit" disabled={busy}
                className="mt-5 w-full rounded-lg bg-blue-600 text-white h-10 hover:opacity-90 disabled:opacity-60">
          Save password
        </button>
      </form>
    </div>
  )
}
