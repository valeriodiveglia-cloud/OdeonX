'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import React from 'react'
import { 
  LayoutDashboard, 
  Boxes, 
  Settings, 
  Home, 
  ChefHat, 
  ClipboardList, 
  ArrowLeftRight, 
  LogOut,
  Truck,
  Shuffle
} from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'
import ReactCountryFlag from 'react-country-flag'
import { t } from '@/lib/i18n'

const NAV = [
  { href: '/storehouse', key: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/storehouse/current-stock', key: 'CurrentStock', icon: Boxes },
  { href: '/storehouse/goods-receiving', key: 'GoodsReceiving', icon: Truck },
  { href: '/storehouse/kitchen-production', key: 'KitchenProduction', icon: ChefHat },
  { href: '/storehouse/transfers', key: 'Transfers', icon: Shuffle },
  { href: '/storehouse/stock-counts', key: 'StockCounts', icon: ClipboardList },
  { href: '/storehouse/stock-movements', key: 'StockMovements', icon: ArrowLeftRight },
  { href: '/storehouse/inventory-setup', key: 'Settings', icon: Settings },
]

const EXP_W_REM = 16
const COLL_W_REM = 3.5
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? 'v0.0'

export default function LeftNavStorehouse() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { language, setLanguage } = useSettings()
  const [open, setOpen] = React.useState(false)
  const [isTouch, setIsTouch] = React.useState(false)

  const branchId = searchParams?.get('branchId')
  const branchName = searchParams?.get('branchName')

  const getHrefWithParams = (href: string) => {
    const params = new URLSearchParams()
    if (branchId) params.set('branchId', branchId)
    if (branchName) params.set('branchName', branchName)
    const str = params.toString()
    return str ? `${href}?${str}` : href
  }

  React.useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)') : null
    const update = () => setIsTouch(!!mq?.matches)
    update()
    mq?.addEventListener?.('change', update)
    return () => mq?.removeEventListener?.('change', update)
  }, [])

  React.useEffect(() => {
    const root = document.documentElement
    const width = open ? `${EXP_W_REM}rem` : `${COLL_W_REM}rem`
    root.style.setProperty('--leftnav-w', width)
    return () => {
      root.style.removeProperty('--leftnav-w')
    }
  }, [open])

  const hoverInsideRef = React.useRef(false)
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleCloseIfNeeded = React.useCallback(() => {
    clearCloseTimer()
    if (!hoverInsideRef.current) {
      closeTimerRef.current = setTimeout(() => {
        setOpen(false)
        closeTimerRef.current = null
      }, 120)
    }
  }, [clearCloseTimer])

  React.useEffect(() => () => clearCloseTimer(), [clearCloseTimer])

  const toggleLang = () => setLanguage(language === 'en' ? 'vi' : 'en')
  const countryCode = language === 'en' ? 'GB' : 'VN'

  return (
    <div
      className={`fixed inset-y-0 left-0 z-45 flex flex-col text-white transition-[width] duration-150 ease-out
                  ${open ? 'w-64' : 'w-14'} bg-gradient-to-b from-slate-800 to-slate-900 border-r border-white/10`}
      onPointerEnter={() => {
        if (isTouch) return
        hoverInsideRef.current = true
        clearCloseTimer()
        setOpen(true)
      }}
      onPointerLeave={() => {
        if (isTouch) return
        hoverInsideRef.current = false
        scheduleCloseIfNeeded()
      }}
    >
      {/* Header */}
      <div className="h-16 flex items-center px-3 border-b border-white/10 shrink-0">
        <Link
          href="/dashboard"
          className={`p-2 rounded-xl bg-white/10 hover:bg-white/20 shrink-0 ${open ? '' : 'mx-auto'}`}
        >
          <Home className="w-5 h-5 text-white" />
        </Link>
        {open && (
          <div className="ml-3 font-bold tracking-wide text-slate-100 whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
            Storehouse
          </div>
        )}
      </div>

      {/* Menu */}
      <nav className="p-2 space-y-1 mt-2">
        {NAV.map(({ href, key, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          const labelTxt = t(language, key)

          return (
            <Link
              key={href}
              href={getHrefWithParams(href)}
              aria-label={labelTxt}
              title={labelTxt}
              className={`relative flex items-center h-11 rounded-xl transition-colors hover:bg-white/10 ${
                open ? 'gap-3 px-3' : 'justify-center px-0'
              }`}
            >
              {active && (
                <div className="absolute inset-0 bg-blue-600/10 rounded-xl border border-blue-500/30" />
              )}
              <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-blue-400' : 'text-slate-400'}`} />
              {open && (
                <span
                  className={`whitespace-nowrap overflow-hidden text-ellipsis transition-opacity ${
                    active ? 'text-blue-100 font-medium' : 'text-slate-300'
                  }`}
                >
                  {labelTxt}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className={`mt-auto p-3 flex items-center justify-between transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}>
        <button
          type="button"
          onClick={toggleLang}
          className="w-8 h-8 flex items-center justify-center rounded-full overflow-hidden border border-white/20 hover:bg-white/10"
        >
          {open && (
            <ReactCountryFlag
              countryCode={countryCode}
              svg
              style={{
                width: '110%',
                height: '110%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          )}
        </button>
        {open && <div className="text-xs text-slate-300 px-2">{appVersion}</div>}
      </div>
    </div>
  )
}
