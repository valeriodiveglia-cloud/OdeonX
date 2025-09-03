// /src/app/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase_shim'
import type { User } from '@supabase/supabase-js'
import { t } from '@/lib/i18n'
import { CalculatorIcon } from '@heroicons/react/24/outline'
import { useSettings } from '@/contexts/SettingsContext'
import ReactCountryFlag from 'react-country-flag'

export default function HomeDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const { language } = useSettings()

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        router.replace('/login')
        return
      }
      if (!mounted) return
      setUser(data.user)
      setLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session?.user) router.replace('/login')
      else setUser(session.user)
    })

    return () => sub?.subscription.unsubscribe()
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-blue-50 to-white">
        <div className="text-blue-700 text-xl font-bold">{t(language, 'Loading')}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <Topbar userEmail={user?.email ?? ''} onLogout={handleLogout} />

      {/* Hero / Dashboard */}
      <main className="relative">
        {/* Decorative blobs */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 -right-24 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
          <div className="absolute bottom-0 -left-24 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl" />
        </div>

        <section className="relative max-w-6xl mx-auto px-4 py-16">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-gray-600 bg-white/60 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {t(language, 'DashboardReady')}
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900">
              {t(language, 'WelcomeTo')} <span className="text-blue-700">OdeonX</span>
            </h1>
            <p className="mt-3 text-gray-600">
              {t(language, 'DashboardSubtitle')}
            </p>

            {/* Main Card (stile precedente) */}
            <div className="mt-8 rounded-2xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden">
              <div className="grid sm:grid-cols-[1fr,220px]">
                {/* Left: solo CTA */}
                <div className="p-6 sm:p-8">
                  <Link
                    href="/materials"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition shadow"
                  >
                    <CalculatorIcon className="h-6 w-6" />
                    <span>{t(language, 'Costing')}</span>
                  </Link>
                </div>

                {/* Right: pattern */}
                <div className="relative hidden sm:block bg-gradient-to-br from-blue-50 to-indigo-50">
                  <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full opacity-60" aria-hidden>
                    <defs>
                      <pattern id="dots" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                        <circle cx="1" cy="1" r="1" fill="#93c5fd" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#dots)" />
                  </svg>
                </div>
              </div>
            </div>

            <p className="mt-6 text-xs text-gray-400">
              {t(language, 'SoonMoreModules')}
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}

/* ---------- Topbar con switch lingua stile LeftNav ---------- */
function Topbar({ userEmail, onLogout }: { userEmail: string; onLogout: () => void }) {
  const { language, setLanguage } = useSettings()
  const isEN = language === 'en'
  const countryCode = isEN ? 'GB' : 'VN'
  const nextLang = isEN ? 'vi' : 'en'
  const label = isEN ? 'Switch to Tiếng Việt' : 'Switch to English'

  return (
    <header className="sticky top-0 bg-white/80 backdrop-blur border-b">
      <div className="h-14 max-w-6xl mx-auto px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-white text-xs font-bold">
            OX
          </span>
          <div className="text-lg font-extrabold text-blue-700">OdeonX</div>
        </div>
        <div className="flex items-center gap-3">
          {/* Language switch (flag) */}
          <button
            type="button"
            onClick={() => setLanguage(nextLang as 'en' | 'vi')}
            aria-label={label}
            className="w-8 h-8 flex items-center justify-center rounded-full overflow-hidden border border-black/10 hover:bg-black/5 bg-white/70 backdrop-blur"
          >
            <ReactCountryFlag
              countryCode={countryCode}
              svg
              style={{ width: '110%', height: '110%', objectFit: 'cover', display: 'block' }}
            />
          </button>

          <span className="text-sm text-gray-600 hidden sm:inline">{userEmail}</span>
          <button
            onClick={onLogout}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-xl hover:bg-blue-700 transition"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
