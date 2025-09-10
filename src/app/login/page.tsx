'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import { t, type Lang } from '@/lib/i18n'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

export default function LoginPage() {
  const { language: lang, setLanguage } = useSettings()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = searchParams.get('redirect') || '/dashboard'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage('')
    setSubmitting(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setSubmitting(false)
    if (error) {
      setMessage(error.message)
      return
    }

    router.replace(redirectTo)
    router.refresh()
  }

  function LangButton({ code, label }: { code: Lang; label: string }) {
    const active = code === lang
    return (
      <button
        type="button"
        onClick={() => setLanguage(code)}
        className={`px-2 py-1 rounded-lg text-sm border ${
          active
            ? 'bg-blue-600 text-white border-blue-700'
            : 'bg-white text-blue-700 border-blue-400 hover:bg-blue-50'
        }`}
        aria-pressed={active}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-blue-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-10 w-full max-w-md">
        {/* language switch */}
        <div className="flex items-center justify-end gap-2 mb-4">
          <span className="text-xs text-slate-600 mr-1">{t(lang, 'Language')}:</span>
          <LangButton code="en" label="EN" />
          <LangButton code="vi" label="VI" />
        </div>

        <h2 className="text-2xl font-bold mb-4 text-blue-700">{t(lang, 'Login')}</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            name="email"
            placeholder={t(lang, 'Email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            className="rounded-xl border border-blue-400 px-4 py-2 text-slate-900 placeholder-slate-500 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              name="password"
              placeholder={t(lang, 'Password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-xl border border-blue-400 px-4 py-2 pr-14 text-slate-900 placeholder-slate-500 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-10 h-8 bg-white border border-blue-400 rounded-lg hover:bg-blue-50 focus:outline-none"
              aria-label={showPw ? t(lang, 'Hide') : t(lang, 'Show')}
              title={showPw ? t(lang, 'Hide') : t(lang, 'Show')}
            >
              {showPw ? <EyeSlashIcon className="w-5 h-5 text-blue-700" /> : <EyeIcon className="w-5 h-5 text-blue-700" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 disabled:opacity-70 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-xl shadow transition hover:bg-blue-700"
          >
            {submitting ? t(lang, 'LoggingIn') : t(lang, 'Login')}
          </button>
        </form>

        {message && (
          <div className="mt-4 text-sm px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-300">
            {message}
          </div>
        )}
      </div>
    </div>
  )
}
