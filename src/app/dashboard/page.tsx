'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase_shim'
import type { User } from '@supabase/supabase-js'
import { t } from '@/lib/i18n'
import {
  CalculatorIcon,
  BuildingOffice2Icon,
  DocumentTextIcon,
  Cog6ToothIcon,
  XMarkIcon,
  MapPinIcon,
  ArrowRightStartOnRectangleIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { LayoutDashboard, Boxes } from 'lucide-react'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import ReactCountryFlag from 'react-country-flag'

type ProviderBranch = {
  id: string
  name: string
  address?: string
  sort_order?: number | null
}

const LS_BRANCH_JSON = 'dailyreports.selectedBranch'      // {id,name,address}
const LS_BRANCH_LEGACY = 'dailyreports.selectedBranch.v1' // solo nome (stringa)

// Stesse chiavi usate nel modulo General Settings · Daily Reports
const LS_PROVIDER_BRANCHES = 'generalsettings.providerBranches.v1'
const LS_PROVIDER_ORDER = 'generalsettings.providerBranchesOrder.v1'

function loadProviderOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(LS_PROVIDER_ORDER)
    if (!raw) return null
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return null
    return arr.filter(id => typeof id === 'string')
  } catch {
    return null
  }
}

function loadProviderSnapshotFromLS(): ProviderBranch[] | null {
  try {
    const raw = localStorage.getItem(LS_PROVIDER_BRANCHES)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return null

    const order = loadProviderOrder()
    const idsFromOrder = (order || []).filter((id) => obj[id])
    const remaining = Object.keys(obj).filter((id) => !idsFromOrder.includes(id))
    const finalIds = [...idsFromOrder, ...remaining]

    return finalIds.map((id) => ({
      id,
      name: obj[id]?.name || '',
      address: obj[id]?.address || '',
    }))
  } catch {
    return null
  }
}

export default function HomeDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const { language } = useSettings()

  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        const { data } = await supabase.auth.getUser()
        if (!mounted) return

        setUser(data.user ?? null)

        if (data.user) {
          const { data: acc } = await supabase
            .from('app_accounts')
            .select('role')
            .eq('user_id', data.user.id)
            .single()

          if (mounted) {
            setRole(acc?.role || null)
          }
        }
      } catch (err) {
        console.error('Dashboard init error:', err)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    init()

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (mounted) {
        setUser(session?.user ?? null)
      }
    })

    return () => {
      mounted = false
      sub?.subscription.unsubscribe()
    }
  }, [])

  function handleLogout() {
    // Navigate to server-side signout route which handles cookie clearing and redirect
    window.location.href = '/auth/signout'
  }

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-blue-50">
        <CircularLoader />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <Topbar userEmail={user?.email ?? ''} onLogout={handleLogout} />

      <main className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 -right-24 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
          <div className="absolute bottom-0 -left-24 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl" />
        </div>

        <section className="relative max-w-6xl mx-auto px-4 py-16">
          <div className="mx-auto max-w-4xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-gray-600 bg-white/60 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {t(language, 'DashboardReady')}
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900">
              {t(language, 'WelcomeTo')} <span className="text-blue-700">OddsOff</span>
            </h1>
            <p className="mt-3 text-gray-600">{t(language, 'DashboardSubtitle')}</p>

            {/* Main Card */}
            <div className="mt-8 rounded-2xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden">
              <div className="grid sm:grid-cols-[1fr,220px]">
                {/* Left: CTA */}
                <div className="p-6 sm:p-8">
                  <div className="flex flex-wrap gap-3">
                    {/* Daily Reports → apre modale branch picker */}
                    <BranchPickerCTA />



                    {/* Monthly Reports - Only for Owner/Admin */}
                    {role && ['owner', 'admin'].includes(role) && (
                      <Link
                        href="/monthly-reports"
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition shadow"
                      >
                        <LayoutDashboard className="h-6 w-6" />
                        <span>Monthly Reports</span>
                      </Link>
                    )}

                    <Link
                      href="/materials"
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition shadow"
                    >
                      <CalculatorIcon className="h-6 w-6" />
                      <span>{t(language, 'Costing')}</span>
                    </Link>

                    <Link
                      href="/catering"
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition shadow"
                    >
                      <BuildingOffice2Icon className="h-6 w-6" />
                      <span>{t(language, 'Catering')}</span>
                    </Link>

                    {/* App Settings → /general-settings */}
                    <Link
                      href="/general-settings"
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition shadow"
                    >
                      <Cog6ToothIcon className="h-6 w-6" />
                      <span>{t(language, 'Settings')}</span>
                    </Link>

                    {/* Loyalty Manager */}
                    <Link
                      href="/loyalty-manager"
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition shadow"
                    >
                      <UserGroupIcon className="h-6 w-6" />
                      <span>Loyalty Manager</span>
                    </Link>

                    {/* Asset Inventory */}
                    <AssetBranchPickerCTA />
                  </div>
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

            <p className="mt-6 text-xs text-gray-400">{t(language, 'SoonMoreModules')}</p>
          </div>
        </section>
      </main>
    </div>
  )
}

/* ---------- CTA + Modal Branch Picker ---------- */
function BranchPickerCTA() {
  const [open, setOpen] = useState(false)
  const { language } = useSettings()
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition shadow"
      >
        <DocumentTextIcon className="h-6 w-6" />
        <span>{t(language, 'DailyReports')}</span>
      </button>
      {open && <BranchPickerModal onClose={() => setOpen(false)} />}
    </>
  )
}

function BranchPickerModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState<ProviderBranch[]>([])
  const [err, setErr] = useState<string | null>(null)
  const { language } = useSettings()

  useEffect(() => {
    let ignore = false
      ; (async () => {
        setLoading(true)
        setErr(null)
        try {
          const { data, error } = await supabase
            .from('provider_branches')
            .select('id,name,address,sort_order')
            .order('sort_order', { ascending: true, nullsFirst: true })
            .order('name', { ascending: true })

          if (error) throw error

          const rows: ProviderBranch[] =
            (data || []).map(r => ({
              id: String(r.id),
              name: r.name || '',
              address: r.address || '',
              sort_order: r.sort_order
            }))

          if (!ignore) {
            setBranches(rows)
          }
        } catch {
          if (!ignore) {
            const snap = loadProviderSnapshotFromLS()
            if (snap && snap.length > 0) {
              setBranches(snap)
              setErr(null)
            } else {
              setErr(t(language, 'DashboardBranchesLoadFailed'))
            }
          }
        } finally {
          if (!ignore) setLoading(false)
        }
      })()
    return () => { ignore = true }
  }, [])

  const pick = (b: ProviderBranch) => {
    try {
      const payload = JSON.stringify({ id: b.id, name: b.name, address: b.address || '' })
      localStorage.setItem(LS_BRANCH_JSON, payload)     // nuovo formato
      localStorage.setItem(LS_BRANCH_LEGACY, b.name)    // legacy nome semplice
    } catch { }
    onClose()
    // Qui andiamo direttamente alla lista dei closing
    router.push('/daily-reports/closinglist')
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <BuildingOffice2Icon className="w-5 h-5" />
                </span>
                <div className="text-lg font-semibold text-gray-900">{t(language, 'DashboardSelectBranch')}</div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-blue-300"
                aria-label="Close"
              >
                <XMarkIcon className="w-5 h-5 text-gray-700" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-5">
            {loading && <CircularLoader />}
            {!loading && err && <div className="text-sm text-red-600">{err}</div>}

            {!loading && !err && branches.length === 0 && (
              <div className="text-sm text-gray-700">
                {t(language, 'DashboardBranchesEmpty')}{' '}
                <Link href="/general-settings" className="text-blue-700 hover:underline">
                  {t(language, 'Settings')}
                </Link>
                .
              </div>
            )}

            {!loading && !err && branches.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {branches.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => pick(b)}
                    className="group relative text-left rounded-2xl border border-gray-200 bg-white px-4 py-4 transition
                               hover:border-blue-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <span className="pointer-events-none absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-blue-200 opacity-0 transition group-hover:opacity-100" />
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shrink-0">
                        <MapPinIcon className="w-5 h-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{b.name || t(language, 'GeneralSettingsUntitled')}</div>
                        <div className="text-sm text-gray-600 truncate">{b.address || '-'}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t bg-white flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
            >
              {t(language, 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Asset Inventory Branch Picker ---------- */
function AssetBranchPickerCTA() {
  const [open, setOpen] = useState(false)
  const { language } = useSettings()
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition shadow"
      >
        <Boxes className="h-6 w-6" />
        <span>Asset Inventory</span>
      </button>
      {open && <AssetBranchPickerModal onClose={() => setOpen(false)} />}
    </>
  )
}

function AssetBranchPickerModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState<ProviderBranch[]>([])
  const [err, setErr] = useState<string | null>(null)
  const { language } = useSettings()

  useEffect(() => {
    let ignore = false
      ; (async () => {
        setLoading(true)
        setErr(null)
        try {
          const { data, error } = await supabase
            .from('provider_branches')
            .select('id,name,address,sort_order')
            .order('sort_order', { ascending: true, nullsFirst: true })
            .order('name', { ascending: true })

          if (error) throw error

          const rows: ProviderBranch[] =
            (data || []).map(r => ({
              id: String(r.id),
              name: r.name || '',
              address: r.address || '',
              sort_order: r.sort_order
            }))

          if (!ignore) {
            setBranches(rows)
          }
        } catch {
          if (!ignore) {
            const snap = loadProviderSnapshotFromLS()
            if (snap && snap.length > 0) {
              setBranches(snap)
              setErr(null)
            } else {
              setErr(t(language, 'DashboardBranchesLoadFailed'))
            }
          }
        } finally {
          if (!ignore) setLoading(false)
        }
      })()
    return () => { ignore = true }
  }, [])

  const pick = (branchId: string) => {
    onClose()
    if (branchId === 'all') {
      router.push(`/asset-inventory?branchId=all`)
    } else {
      const branch = branches.find(b => b.id === branchId)
      const name = branch ? branch.name : ''
      router.push(`/asset-inventory?branchId=${branchId}&branchName=${encodeURIComponent(name)}`)
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Boxes className="w-5 h-5" />
                </span>
                <div className="text-lg font-semibold text-gray-900">Select Branch for Inventory</div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-blue-300"
                aria-label="Close"
              >
                <XMarkIcon className="w-5 h-5 text-gray-700" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-5">
            {loading && <CircularLoader />}
            {!loading && err && <div className="text-sm text-red-600">{err}</div>}

            {!loading && !err && branches.length === 0 && (
              <div className="text-sm text-gray-700">
                {t(language, 'DashboardBranchesEmpty')}{' '}
                <Link href="/general-settings" className="text-blue-700 hover:underline">
                  {t(language, 'Settings')}
                </Link>
                .
              </div>
            )}

            {!loading && !err && branches.length > 0 && (
              <div className="space-y-4">
                {/* All Branches Option */}
                <button
                  type="button"
                  onClick={() => pick('all')}
                  className="w-full group relative text-left rounded-2xl border border-blue-200 bg-blue-50/50 px-4 py-4 transition
                               hover:border-blue-400 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-white shrink-0">
                      <Boxes className="w-5 h-5" />
                    </span>
                    <div className="min-w-0 flex items-center h-10">
                      <div className="font-bold text-slate-800 text-lg">All Branches</div>
                    </div>
                  </div>
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {branches.map(b => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => pick(b.id)}
                      className="group relative text-left rounded-2xl border border-gray-200 bg-white px-4 py-4 transition
                                   hover:border-blue-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                    >
                      <span className="pointer-events-none absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-blue-200 opacity-0 transition group-hover:opacity-100" />
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shrink-0">
                          <MapPinIcon className="w-5 h-5" />
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 truncate">{b.name || t(language, 'GeneralSettingsUntitled')}</div>
                          <div className="text-sm text-gray-600 truncate">{b.address || '-'}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t bg-white flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
            >
              {t(language, 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Topbar ---------- */
function Topbar({ userEmail, onLogout }: { userEmail: string; onLogout: () => void }) {
  const { language, setLanguage } = useSettings()
  const isEN = language === 'en'
  const countryCode = isEN ? 'GB' : 'VN'
  const nextLang = isEN ? 'vi' : 'en'
  const label = isEN ? t(language, 'SwitchToVi') : t(language, 'SwitchToEn')

  return (
    <header className="sticky top-0 bg-white/80 backdrop-blur border-b">
      <div className="h-14 max-w-6xl mx-auto px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative h-14 w-52">
            <img src="/logo.svg" alt="OddsOff Logo" className="h-full w-full object-contain object-left" />
          </div>
        </div>
        <div className="flex items-center gap-3">
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
            {t(language, 'Logout')}
          </button>
        </div>
      </div>
    </header>
  )
}
