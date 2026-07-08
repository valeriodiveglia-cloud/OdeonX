// src/components/LeftNav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChefHat, Utensils, Package, BarChart3, LineChart, Building2, Handshake, Home, Settings } from 'lucide-react'
import React from 'react'

// i18n
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'

// bandiere SVG
import ReactCountryFlag from 'react-country-flag'

type Item = {
  href: string
  i18nKey: string | null
  fallback: string
  icon: React.ComponentType<any>
}
const NAV: Item[] = [
  { href: '/materials', i18nKey: 'Materials', fallback: 'Materials', icon: Package },
  { href: '/materials-history', i18nKey: 'MaterialsHistory', fallback: 'Materials History', icon: BarChart3 },
  { href: '/recipes', i18nKey: 'Recipes', fallback: 'Recipes', icon: ChefHat },
  { href: '/equipment', i18nKey: 'Equipment', fallback: 'Equipment', icon: Utensils },
  { href: '/equipment-history', i18nKey: 'EquipmentHistory', fallback: 'Equipment History', icon: LineChart },
  { href: '/suppliers', i18nKey: 'Suppliers', fallback: 'Suppliers', icon: Building2 },
  { href: '/settings', i18nKey: 'Settings', fallback: 'Settings', icon: Settings },
]



/* Config */
const COLLAPSED_W = 56 // px (w-14)
const ICON_RAIL_W = COLLAPSED_W
const CLOSE_DELAY_MS = 120
const FLAG_SHAPE: 'circle' | 'square' = 'circle'

// versione da env
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? 'v0.0'

export default function LeftNav() {
  const pathname = usePathname()
  const { language, setLanguage } = useSettings()

  const [open, setOpen] = React.useState(false)

  // Rileva input touch
  const [isTouch, setIsTouch] = React.useState(false)
  React.useEffect(() => {
    const mq =
      typeof window !== 'undefined'
        ? window.matchMedia('(pointer: coarse)')
        : null
    const update = () => setIsTouch(!!mq?.matches)
    update()
    mq?.addEventListener?.('change', update)
    return () => mq?.removeEventListener?.('change', update)
  }, [])

  React.useEffect(() => {
    const root = document.documentElement
    const width = open ? '16rem' : '3.5rem'
    root.style.setProperty('--leftnav-w', width)
    return () => {
      root.style.removeProperty('--leftnav-w')
    }
  }, [open])

  // Flag interni
  const hoverInsideRef = React.useRef(false)

  // Timer di chiusura
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
      }, CLOSE_DELAY_MS)
    }
  }, [clearCloseTimer])

  React.useEffect(() => () => clearCloseTimer(), [clearCloseTimer])

  // Overlay rail: dietro, combacia con larghezza chiusa
  const IconRailOverlay = () => (
    <div
      className="absolute left-0 top-0 h-full z-0"
      style={{ width: ICON_RAIL_W, pointerEvents: 'auto' }}
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
    />
  )

  // Tooltip kill switch
  React.useEffect(() => {
    const body = document.body
    if (!open) body.classList.add('no-tooltips')
    else body.classList.remove('no-tooltips')
    return () => body.classList.remove('no-tooltips')
  }, [open])

  const homeTitle = 'Home'
  const appName = 'OddsOff'

  const isEN = language === 'en'
  const countryCode = isEN ? 'GB' : 'VN'
  const nextLang = isEN ? 'vi' : 'en'
  const label = isEN ? 'Switch to Tiếng Việt' : 'Switch to English'
  const toggleLang = () => setLanguage(nextLang as 'en' | 'vi')

  const stateClass = open ? 'leftnav expanded' : 'leftnav collapsed'

  return (
    <div
      className={`fixed inset-y-0 left-0 z-40 flex flex-col text-white transition-[width] duration-150 ease-out
                  ${open ? 'w-64' : 'w-14'} ${stateClass} bg-gradient-to-b from-slate-800 to-slate-900 border-r border-white/10`}
      aria-expanded={open}
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
      {/* Rail overlay: attivo solo da chiusa e solo desktop */}
      {!open && !isTouch && <IconRailOverlay />}

      {/* Header */}
      <div className="h-16 flex items-center px-3 border-b border-white/10 clip-scope">
        <Link
          href="/dashboard"
          aria-label={homeTitle}
          title={homeTitle}
          className={`p-2 rounded-xl bg-white/10 hover:bg-white/20 shrink-0 ${open ? '' : 'mx-auto'
            }`}
          onPointerEnter={() => {
            if (!isTouch) setOpen(true)
          }}
        >
          <Home className="w-5 h-5 text-white" />
        </Link>
        <div className="ml-3 font-bold tracking-wide text-slate-100 whitespace-nowrap overflow-hidden text-ellipsis min-w-0 nav-text">
          {open ? appName : ''}
        </div>
      </div>

      {/* Menu */}
      <nav className="p-2 space-y-1 clip-scope">
        {NAV.map(({ href, i18nKey, fallback, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(href + '/')
          const labelTxt = i18nKey ? t(i18nKey, language) : fallback

          return (
            <Link
              key={href}
              href={href}
              aria-label={labelTxt}
              title={labelTxt}
              aria-current={active ? 'page' : undefined}
              className={`relative flex items-center h-11 rounded-xl transition-colors hover:bg-white/10 ${open ? 'gap-3 px-3' : 'justify-center px-0'
                }`}
              tabIndex={0}
              onPointerEnter={() => {
                if (!isTouch) setOpen(true)
              }}
            >
              {active && (
                <div className="absolute inset-0 bg-blue-600/10 rounded-xl border border-blue-500/30" />
              )}
              <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-blue-400' : 'text-slate-400'}`} />
              {open && (
                <span
                  className={`whitespace-nowrap overflow-hidden text-ellipsis transition-opacity ${active ? 'text-blue-100 font-medium' : 'text-slate-300'
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
      <div
        className={`mt-auto p-3 flex items-center justify-between footer-wrap clip-scope ${open ? 'opacity-100' : 'opacity-0'
          }`}
      >
        <button
          type="button"
          onClick={toggleLang}
          aria-label={open ? label : undefined}
          className={`w-8 h-8 flex items-center justify-center ${FLAG_SHAPE === 'circle' ? 'rounded-full' : 'rounded-none'
            } overflow-hidden border border-white/20 hover:bg-white/10`}
          tabIndex={open ? 0 : -1}
          onPointerEnter={() => {
            if (!isTouch) setOpen(true)
          }}
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
        {open && (
          <div className="text-xs text-slate-300 px-2">{appVersion}</div>
        )}
      </div>
    </div>
  )
}
