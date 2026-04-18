'use client'

import { useEffect, useState, Fragment } from 'react'
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
import { LayoutDashboard, Boxes, Handshake, Target, Settings2, Save, Bell } from 'lucide-react'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import ReactCountryFlag from 'react-country-flag'
import HRDashboardModal from '@/components/human-resources/HRDashboardModal'
import { APP_PAGES_DIRECTORY, getPageByHref, getDefaultQuickAccess, AppPage } from '@/lib/appPages'
import { CheckIcon } from '@heroicons/react/24/solid'
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

  const [recentVisits, setRecentVisits] = useState<AppPage[]>([])
  const [quickAccessIds, setQuickAccessIds] = useState<string[]>([])
  const [isQaModalOpen, setIsQaModalOpen] = useState(false)
  const [moduleOrder, setModuleOrder] = useState<string[]>([])
  const [isEditingLayout, setIsEditingLayout] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  // Load user specific info
  useEffect(() => {
    if (!user) return
    const qaKey = `dashboard.quickAccess.${user.id}`
    const recentKey = `dashboard.recent.${user.id}`
    const orderKey = `dashboard.moduleOrder.${user.id}`
    
    try {
      // Recent Visits
      const storedRecent = localStorage.getItem(recentKey)
      if (storedRecent) {
        const paths: string[] = JSON.parse(storedRecent)
        const matched = paths.map(getPageByHref).filter(Boolean) as AppPage[]
        setRecentVisits(matched)
      }
      
      // Quick Access
      const storedQa = localStorage.getItem(qaKey)
      if (storedQa) {
        setQuickAccessIds(JSON.parse(storedQa).slice(0, 6))
      } else {
        setQuickAccessIds(getDefaultQuickAccess(role))
      }
      
      // Module Order
      const storedOrder = localStorage.getItem(orderKey)
      if (storedOrder) {
        setModuleOrder(JSON.parse(storedOrder))
      }
    } catch (e) {
      // quiet
    }
  }, [user, role])

  // Also listen for recent visits updates globally
  useEffect(() => {
    const handleRecentUpdate = () => {
      if (!user) return
      const recentKey = `dashboard.recent.${user.id}`
      try {
        const storedRecent = localStorage.getItem(recentKey)
        if (storedRecent) {
          const paths: string[] = JSON.parse(storedRecent)
          const matched = paths.map(getPageByHref).filter(Boolean) as AppPage[]
          setRecentVisits(matched)
        }
      } catch (e) {}
    }
    
    window.addEventListener('recent_visits_updated', handleRecentUpdate)
    return () => window.removeEventListener('recent_visits_updated', handleRecentUpdate)
  }, [user])

  const saveQuickAccess = (newIds: string[]) => {
    if (!user) return
    const qaKey = `dashboard.quickAccess.${user.id}`
    localStorage.setItem(qaKey, JSON.stringify(newIds))
    setQuickAccessIds(newIds)
    setIsQaModalOpen(false)
  }

  const quickAccessPages = quickAccessIds
    .map(id => APP_PAGES_DIRECTORY.find(p => p.id === id))
    .filter(Boolean).slice(0, 6) as AppPage[]

  const saveModuleOrder = (newOrder: string[]) => {
    if (!user) return
    const orderKey = `dashboard.moduleOrder.${user.id}`
    localStorage.setItem(orderKey, JSON.stringify(newOrder))
    setModuleOrder(newOrder)
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedId || draggedId === targetId) return
    
    // We want to reorder based on the current sortedModules sequence
    const currentList = sortedModules.map(m => m.id)
    const draggedIdx = currentList.indexOf(draggedId)
    const targetIdx = currentList.indexOf(targetId)
    
    if (draggedIdx !== -1 && targetIdx !== -1) {
      const newList = [...currentList]
      // SWAP behavior: "spostiamo solo il contenuto e non cambiamo il layout"
      // Swapping preserves exact locations and prevents cascade column jumping
      newList[draggedIdx] = currentList[targetIdx]
      newList[targetIdx] = currentList[draggedIdx]
      saveModuleOrder(newList)
    }
    setDraggedId(null)
  }

  const defaultModules = [
    // Column 1
    { id: 'costing', href: '/materials', icon: CalculatorIcon, title: t(language, 'Costing') },
    { id: 'crm', href: '/crm', icon: Handshake, title: 'CRM & Partnerships', roles: ['owner', 'admin', 'manager'] },
    { id: 'referrals', href: '/crm/referrals', icon: Target, title: 'Register Referral', roles: ['owner', 'admin', 'manager', 'staff'] },
    
    // Column 2
    { id: 'catering', href: '/catering', icon: BuildingOffice2Icon, title: t(language, 'Catering') },
    { id: 'settings', href: '/general-settings', icon: Cog6ToothIcon, title: t(language, 'Settings') },
    
    // Column 3
    { id: 'loyalty', href: '/loyalty-manager', icon: UserGroupIcon, title: 'Loyalty Manager' },
    { id: 'asset-branch-picker', Component: AssetBranchPickerCTA, title: 'Asset Inventory', icon: Boxes },
    
    // Column 4
    { id: 'branch-picker', Component: BranchPickerCTA, title: 'Check In System', icon: MapPinIcon },
    { id: 'monthly-reports', href: '/monthly-reports', icon: LayoutDashboard, title: 'Monthly Reports', roles: ['owner', 'admin'] },
    { id: 'hr-module', Component: HRModuleCTA, title: t(language, 'HumanResources') || 'Human Resources', icon: UserGroupIcon },
  ]

  // Filter based on roles
  const permittedModules = defaultModules.filter(m => !m.roles || (role && m.roles.includes(role)))

  // Sort based on saved order
  const sortedModules = [...permittedModules].sort((a, b) => {
    const indexA = moduleOrder.indexOf(a.id)
    const indexB = moduleOrder.indexOf(b.id)
    if (indexA !== -1 && indexB !== -1) return indexA - indexB
    if (indexA !== -1) return -1
    if (indexB !== -1) return 1
    return 0 // Keep original index for new or unordered modules
  })

  // Distribute sequentially into 4 columns (chunking top-down to preserve layout structure)
  const cols: typeof sortedModules[] = [[], [], [], []]
  let colSizes = [0, 0, 0, 0]
  
  if (sortedModules.length === 10) {
    // Force the exact 3-2-2-3 layout pattern as the original design for exact visual symmetry
    colSizes = [3, 2, 2, 3]
  } else {
    // If modules are reduced due to roles, distribute evenly top-to-bottom
    const minItems = Math.floor(sortedModules.length / 4)
    let remainder = sortedModules.length % 4
    for (let i = 0; i < 4; i++) {
      colSizes[i] = minItems + (remainder > 0 ? 1 : 0)
      remainder--
    }
  }

  let currIdx = 0
  for (let i = 0; i < 4; i++) {
    cols[i] = sortedModules.slice(currIdx, currIdx + colSizes[i])
    currIdx += colSizes[i]
  }

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-blue-50">
        <CircularLoader />
      </div>
    )
  }

  return (
    <div className="h-screen w-full flex flex-col bg-[#0B1537] overflow-hidden font-sans">
      <Topbar userEmail={user?.email ?? ''} onLogout={handleLogout} />

      <main className="flex-1 w-full h-full min-h-0 relative flex justify-center p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden z-0">
          <div className="absolute top-[5%] left-[10%] h-[500px] w-[500px] rounded-full bg-blue-500/20 blur-[100px]" />
          <div className="absolute bottom-[5%] right-[10%] h-[500px] w-[500px] rounded-full bg-indigo-500/20 blur-[100px]" />
        </div>

        <div className="relative z-10 w-full h-full min-h-[600px] max-w-[1500px] flex gap-5 lg:gap-8 justify-center items-stretch">
          
          {/* Left Column: QUICK ACCESS */}
          <div className="w-[160px] xl:w-[200px] shrink-0 flex flex-col h-full hidden lg:flex">
            <div className="flex items-center justify-center mb-4 px-1 relative z-[60]">
              <h2 className="text-xs font-bold tracking-[0.15em] text-blue-100 uppercase text-center">Quick Access</h2>
              <button 
                onClick={() => setIsQaModalOpen(true)}
                className="absolute right-0 w-7 h-7 flex items-center justify-center rounded-full bg-white text-slate-500 hover:text-blue-600 hover:bg-blue-50 shadow-md border border-blue-100 transition-all"
                aria-label="Configure Quick Access"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 bg-gradient-to-b from-white/90 to-blue-50/60 backdrop-blur-xl rounded-[2.5rem] shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/50 flex flex-col overflow-hidden">
              <div className="flex-1 flex flex-col p-4 w-full h-full overflow-hidden">
                <div className="flex-1 flex flex-col gap-3 w-full h-full justify-evenly">
                  {quickAccessPages.length > 0 ? (
                    quickAccessPages.map(page => (
                       <ModuleButton key={page.id} href={page.href} title={page.title} icon={page.icon} />
                    ))
                  ) : (
                    <div className="text-[12px] text-blue-400 px-3 italic flex-1 flex items-center justify-center text-center">Settings</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Center Column: ALL MODULES */}
          <div className="flex-1 max-w-[900px] flex flex-col h-full min-w-0">
            {/* Header Outside */}
            <div className="mb-4 shrink-0 flex items-center justify-center flex-col text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-green-400/30 px-2.5 py-1 text-[10px] font-bold text-green-400 bg-green-500/10 shadow-sm uppercase tracking-wide mb-2">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                {t(language, 'DashboardReady') || 'Dashboard ready'}
              </div>
              <h1 className="text-3xl lg:text-4xl font-medium tracking-tight text-white mb-1">
                {t(language, 'WelcomeTo')} <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">OddsOff</span>
              </h1>
              <p className="text-blue-100/70 text-[13px] font-medium">{t(language, 'DashboardSubtitle') || 'Central hub for your modules.'}</p>
            </div>

            {/* Container */}
            <div className={`flex-1 min-h-0 bg-gradient-to-br from-white/90 via-white/80 to-blue-50/60 backdrop-blur-xl rounded-[3rem] shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/50 p-6 lg:p-10 flex flex-col relative overflow-hidden transition-all ${isEditingLayout ? 'bg-blue-500/20 ring-4 ring-blue-400' : ''}`}>
              <div className="flex items-center justify-center mb-6 relative z-[60]">
                <h2 className="text-[11px] font-bold tracking-[0.2em] bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-500 text-center uppercase shrink-0">
                  All Modules
                </h2>
                {role === 'owner' && (
                  <button 
                    onClick={() => setIsEditingLayout(!isEditingLayout)}
                    className={`absolute right-0 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full shadow-sm border transition-all ${isEditingLayout ? 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700 hover:scale-110' : 'bg-white text-slate-400 border-slate-200 hover:text-blue-600 hover:bg-blue-50'}`}
                    title={isEditingLayout ? "Save Layout" : "Edit Layout"}
                  >
                    {isEditingLayout ? <Save className="w-3.5 h-3.5" /> : <Settings2 className="w-3 h-3" />}
                  </button>
                )}
              </div>
              
              <div className="flex-1 min-h-[400px] overflow-y-auto custom-scrollbar px-5 pt-8 pb-8 -mt-8 -mb-5">
                <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 h-full">
                  
                  {cols.map((columnModules, colIdx) => (
                    <div key={colIdx} className="flex-1 flex flex-col gap-4 lg:gap-5 h-full relative">
                      {columnModules.map(mod => {
                        const content = mod.Component ? (
                          // Mod.Component wraps itself in flex/h-full so we must wrap IT if we want it identical
                          <mod.Component key={mod.id} />
                        ) : (
                          <ModuleButton 
                            key={mod.id} 
                            href={mod.href} 
                            icon={mod.icon} 
                            title={mod.title || ''} 
                          />
                        )

                        if (!isEditingLayout) {
                          return <Fragment key={mod.id}>{content}</Fragment>
                        }

                        return (
                          <div
                            key={mod.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, mod.id)}
                            onDragOver={(e) => handleDragOver(e, mod.id)}
                            onDrop={(e) => handleDrop(e, mod.id)}
                            onDragEnd={() => setDraggedId(null)}
                            className={`flex flex-col flex-1 min-h-[110px] w-full cursor-grab active:cursor-grabbing rounded-[2rem] transition-all duration-300 ring-2 ring-offset-4 ring-offset-transparent ${draggedId === mod.id ? 'opacity-40 scale-95 ring-blue-500 shadow-inner' : 'ring-gray-300/50 hover:ring-blue-400 hover:scale-[1.02] bg-white/50 shadow-sm'}`}
                          >
                            <div className="pointer-events-none flex-1 flex flex-col w-full h-full opacity-80 mix-blend-luminosity grayscale-[30%]">
                              {content}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}

                </div>
              </div>
            </div>
          </div>

          {/* Right Column: RECENTLY VISITED */}
          <div className="w-[160px] xl:w-[200px] shrink-0 flex flex-col h-full hidden lg:flex">
            <div className="flex items-center justify-center mb-4 px-1 relative z-[60]">
              <h2 className="text-xs font-bold tracking-[0.15em] text-blue-100 uppercase text-center">Recent</h2>
            </div>
            <div className="flex-1 bg-gradient-to-b from-white/90 to-blue-50/60 backdrop-blur-xl rounded-[2.5rem] shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/50 flex flex-col overflow-hidden">
              <div className="flex-1 flex flex-col p-4 w-full h-full overflow-hidden">
                <div className="flex-1 flex flex-col gap-3 w-full h-full justify-evenly">
                  {recentVisits.length > 0 ? (
                    recentVisits.map((page, idx) => (
                      <ModuleButton 
                        key={`${page.id}-${idx}`} 
                        href={page.href} 
                        title={page.title} 
                        icon={page.icon} 
                      />
                    ))
                  ) : (
                    <div className="text-[12px] text-blue-400 px-3 italic flex-1 flex items-center justify-center text-center">Nothing recently visited.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Configuration Modal */}
      {isQaModalOpen && (
        <QuickAccessModal 
          availablePages={APP_PAGES_DIRECTORY.filter(p => !p.requiresRole || p.requiresRole.includes(role || 'staff'))}
          selectedIds={quickAccessIds}
          onSave={saveQuickAccess}
          onClose={() => setIsQaModalOpen(false)}
        />
      )}

    </div>
  )
}




/* ---------- Module Button Component ---------- */
function ModuleButton({
  icon: Icon,
  title,
  onClick,
  href,
  active,
  badge
}: {
  icon: any
  title: string
  onClick?: () => void
  href?: string
  active?: boolean
  badge?: string
}) {
  const inner = (
    <div className={`relative flex flex-col items-center justify-center p-3 h-full w-full rounded-[1.5rem] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-bottom z-10 group-hover/btn:z-50 cursor-pointer ${
      active 
      ? 'bg-blue-50 shadow-md ring-2 ring-blue-500 scale-[1.05] border border-blue-200' 
      : 'bg-white shadow-sm border border-slate-100 group-hover/btn:shadow-[0_20px_40px_-5px_rgba(37,99,235,0.15)] group-hover/btn:-translate-y-1 group-hover/btn:scale-[1.04] group-hover/btn:border-blue-200 group-hover/btn:bg-white'
    }`}>
      {badge && (
        <span className="absolute -top-3 -right-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-[11px] font-extrabold px-3 py-1 rounded-full shadow-[0_5px_15px_rgba(37,99,235,0.5)] z-10 tracking-widest border-2 border-white">
          {badge}
        </span>
      )}
      <div className={`w-14 h-14 flex items-center justify-center mb-3 rounded-[1rem] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-sm ${
        active 
        ? 'bg-blue-600 text-white scale-110' 
        : 'bg-blue-50 border border-blue-100/50 text-blue-600 group-hover/btn:bg-blue-600 group-hover/btn:text-white group-hover/btn:shadow-[0_8px_20px_rgba(37,99,235,0.25)] group-hover/btn:border-blue-500 group-hover/btn:scale-[1.10]'
      }`}>
        <Icon className="w-6 h-6 stroke-[2] transition-colors duration-300" />
      </div>
      <span className={`text-[13px] font-bold text-center transition-colors px-1 pb-1 ${
        active ? 'text-blue-900' : 'text-blue-800 group-hover/btn:text-blue-600'
      }`}>
        {title}
      </span>
    </div>
  )

  // the wrapper creates the flex resizing dynamic
  const wrapClass = "flex flex-col w-full h-full flex-1 min-h-[70px] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:flex-[1.5] group/btn"

  if (href) {
    return <Link href={href} className={wrapClass}>{inner}</Link>
  }
  return <button onClick={onClick} type="button" className={`${wrapClass} text-left outline-none`}>{inner}</button>
}

/* ---------- CTA + Modal Branch Picker ---------- */
function BranchPickerCTA({ badge, active }: { badge?: string; active?: boolean }) {
  const [open, setOpen] = useState(false)
  const { language } = useSettings()
  return (
    <>
      <ModuleButton 
        icon={DocumentTextIcon} 
        title={t(language, 'DailyReports')} 
        onClick={() => setOpen(true)}
        badge={badge}
        active={active}
      />
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
function AssetBranchPickerCTA({ badge, active }: { badge?: string; active?: boolean }) {
  const [open, setOpen] = useState(false)
  const { language } = useSettings()
  return (
    <>
      <ModuleButton 
        icon={Boxes} 
        title="Asset Inventory" 
        onClick={() => setOpen(true)}
        badge={badge}
        active={active}
      />
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
  const [showNotif, setShowNotif] = useState(false)
  const isEN = language === 'en'
  const countryCode = isEN ? 'GB' : 'VN'
  const nextLang = isEN ? 'vi' : 'en'
  const label = isEN ? t(language, 'SwitchToVi') : t(language, 'SwitchToEn')

  return (
    <header className="bg-white/80 backdrop-blur-md shadow-[0_4px_30px_rgb(0,0,0,0.05)] border-b border-gray-100/50 sticky top-0 z-50 rounded-b-[2rem] mx-2">
      <div className="h-16 max-w-[1500px] mx-auto px-6 flex items-center justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative h-12 w-32 sm:w-40">
            <img src="/logo.svg" alt="OddsOff Logo" className="h-full w-full object-contain object-left" />
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3 sm:gap-4">
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

          <span className="text-[13px] font-medium text-gray-600 hidden sm:block">{userEmail}</span>
          <button
            onClick={onLogout}
            className="flex items-center justify-center bg-gradient-to-b from-blue-400 to-blue-600 text-white px-5 py-2 rounded-full text-xs font-bold tracking-wide hover:from-blue-500 hover:to-blue-700 transition-all shadow-[0_2px_10px_rgba(37,99,235,0.3)]"
          >
            Logout
          </button>
          
          <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block"></div>

          <div className="relative">
            <button
              onClick={() => setShowNotif(!showNotif)}
              onBlur={() => setTimeout(() => setShowNotif(false), 200)}
              className="relative p-2 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors focus:outline-none"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 border border-white"></span>
            </button>

            {showNotif && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-100 shadow-xl rounded-2xl p-4 z-[100] animate-in fade-in slide-in-from-top-2 origin-top-right">
                <div className="flex justify-center mb-2">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                    <Bell className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-sm font-bold text-gray-900 text-center">Notifications</div>
                <div className="text-xs text-gray-500 text-center mt-1">Coming soon!</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

/* ---------- HR Module CTA ---------- */
function HRModuleCTA({ badge, active }: { badge?: string; active?: boolean }) {
  const [open, setOpen] = useState(false)
  const { language } = useSettings()
  return (
    <>
      <ModuleButton 
        icon={UserGroupIcon} 
        title={t(language, 'HumanResources') || 'Human Resources'} 
        onClick={() => setOpen(true)}
        badge={badge}
        active={active}
      />
      {open && <HRDashboardModal onClose={() => setOpen(false)} />}
    </>
  )
}


/* ---------- Compact Sidebar Link ---------- */
function CompactLink({ icon: Icon, title, href, badge }: { icon: any, title: string, href: string, badge?: string }) {
  return (
    <Link 
      href={href} 
      className="group relative flex items-center gap-3 w-full p-2.5 rounded-[1.2rem] bg-transparent hover:bg-white/60 hover:shadow-sm border border-transparent hover:border-white transition-all duration-200"
    >
      <div className="w-9 h-9 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:text-blue-600 transition-all">
        <Icon className="w-4.5 h-4.5 stroke-[1.5] text-slate-700 group-hover:text-blue-600" />
      </div>
      <span className="text-[13px] font-medium text-slate-700 group-hover:text-blue-900 flex-1 truncate">{title}</span>
      {badge && (
        <span className="absolute top-1 right-1 bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-sm">
          {badge}
        </span>
      )}
    </Link>
  )
}

function QuickAccessModal({ 
  availablePages, 
  selectedIds, 
  onSave, 
  onClose 
}: { 
  availablePages: AppPage[], 
  selectedIds: string[], 
  onSave: (ids: string[]) => void, 
  onClose: () => void 
}) {
  const validIds = availablePages.map(p => p.id)
  const initialIds = selectedIds.filter(id => validIds.includes(id))
  const [draftIds, setDraftIds] = useState<string[]>(initialIds)

  const toggleId = (id: string) => {
    if (draftIds.includes(id)) {
      setDraftIds(draftIds.filter(i => i !== id))
    } else {
      if (draftIds.length >= 6) {
        alert('You can only select up to 6 quick access pages.')
        return
      }
      setDraftIds([...draftIds, id])
    }
  }

  // Group pages by module
  const grouped = availablePages.reduce((acc, page) => {
    if (!acc[page.module]) acc[page.module] = []
    acc[page.module].push(page)
    return acc
  }, {} as Record<string, AppPage[]>)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl flex flex-col max-h-[85vh] border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 rounded-t-3xl">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Configure Quick Access</h3>
            <p className="text-xs text-gray-500">Select the pages you want pinned to your sidebar.</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-100"><XMarkIcon className="w-5 h-5" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {Object.entries(grouped).map(([moduleName, pages]) => (
            <div key={moduleName}>
              <h4 className="text-sm font-semibold tracking-wide text-blue-900 mb-3 uppercase flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span> {moduleName}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {pages.map(page => {
                  const isSelected = draftIds.includes(page.id)
                  const Icon = page.icon
                  return (
                    <button
                      key={page.id}
                      onClick={() => toggleId(page.id)}
                      className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                        isSelected 
                        ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-500/20' 
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className={`p-2 rounded-xl shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        <Icon className="w-4 h-4 stroke-[1.5]" />
                      </div>
                      <span className={`text-[13px] font-medium flex-1 ${isSelected ? 'text-blue-900' : 'text-gray-700'}`}>
                        {page.title}
                      </span>
                      {isSelected && <CheckIcon className="w-4 h-4 text-blue-600 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-3xl flex justify-between items-center">
          <span className="text-xs text-gray-500">{draftIds.length}/6 items selected</span>
          <div className="flex gap-3">
             <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-200">Cancel</button>
             <button onClick={() => onSave(draftIds)} className="px-5 py-2 outline-none rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm">Save Preferences</button>
          </div>
        </div>
      </div>
    </div>
  )
}

