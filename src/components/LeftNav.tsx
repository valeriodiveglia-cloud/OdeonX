// src/components/LeftNav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HomeIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import { ChefHat, Utensils, Package, BarChart3, LineChart, Building2 } from 'lucide-react'
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
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}

const NAV: Item[] = [
  { href: '/materials',          i18nKey: 'Materials',         fallback: 'Materials',          icon: Package },
  { href: '/materials-history',  i18nKey: 'MaterialsHistory',  fallback: 'Materials History',  icon: BarChart3 },
  { href: '/recipes',            i18nKey: 'Recipes',           fallback: 'Recipes',            icon: ChefHat },
  { href: '/equipment',          i18nKey: 'Equipment',         fallback: 'Equipment',          icon: Utensils },
  { href: '/equipment-history',  i18nKey: 'EquipmentHistory',  fallback: 'Equipment History',  icon: LineChart },
  { href: '/suppliers',          i18nKey: 'Suppliers',         fallback: 'Suppliers',          icon: Building2 },
  { href: '/settings',           i18nKey: 'Settings',          fallback: 'Settings',           icon: Cog6ToothIcon },
]

// doppio layer per le icone
function DualIcon({
  Icon,
  active,
  open,
}: {
  Icon: Item['icon']
  active: boolean
  open: boolean
}) {
  return (
    <span className="relative inline-block w-5 h-5 shrink-0">
      <Icon className="absolute inset-0 w-5 h-5 text-white" />
      <Icon className={`absolute inset-0 w-5 h-5 text-slate-900 ${open && active ? 'opacity-100' : 'opacity-0'} transition-opacity`} />
    </span>
  )
}

/* Config */
const ICON_RAIL_W = 80
const CLOSE_DELAY_MS = 120
const FLAG_SHAPE: 'circle' | 'square' = 'circle'

// versione da env
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? 'v0.0'

export default function LeftNav() {
  const pathname = usePathname()
  const { language, setLanguage } = useSettings()

  // Stato apertura interno (solo per testi/colore; la larghezza la gestisce il CSS del parent aside)
  const [open, setOpen] = React.useState(false)

  // Rileva input touch: su touch non apriamo mai, le icone navigano direttamente
  const [isTouch, setIsTouch] = React.useState(false)
  React.useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)') : null
    const update = () => setIsTouch(!!mq?.matches)
    update()
    mq?.addEventListener?.('change', update)
    return () => mq?.removeEventListener?.('change', update)
  }, [])

  // Flag interni per la chiusura
  const hoverInsideRef = React.useRef(false)
  const focusInsideRef = React.useRef(false)

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
    if (!hoverInsideRef.current && !focusInsideRef.current) {
      closeTimerRef.current = setTimeout(() => {
        setOpen(false)
        closeTimerRef.current = null
      }, CLOSE_DELAY_MS)
    }
  }, [clearCloseTimer])

  React.useEffect(() => () => clearCloseTimer(), [clearCloseTimer])

  // Pointer events: su desktop aprono/chiudono il pannello testuale; su touch ignoriamo
  const onPointerEnterContainer: React.PointerEventHandler<HTMLDivElement> = () => {
    if (isTouch) return
    hoverInsideRef.current = true
    clearCloseTimer()
    setOpen(true)
  }
  const onPointerLeaveContainer: React.PointerEventHandler<HTMLDivElement> = () => {
    if (isTouch) return
    hoverInsideRef.current = false
    scheduleCloseIfNeeded()
  }
  const onPointerDownContainer: React.PointerEventHandler<HTMLDivElement> = () => {
    if (isTouch) return
    hoverInsideRef.current = true
    clearCloseTimer()
    setOpen(true)
  }

  // Focus tastiera
  const handleFocusWithin: React.FocusEventHandler<HTMLDivElement> = () => {
    focusInsideRef.current = true
    clearCloseTimer()
    setOpen(true)
  }
  const handleBlurWithin: React.FocusEventHandler<HTMLDivElement> = (e) => {
    const stillInside = e.currentTarget.contains(e.relatedTarget as Node)
    focusInsideRef.current = !!stillInside
    if (!stillInside) scheduleCloseIfNeeded()
  }

  // Overlay rail: solo desktop; su touch lo disattiviamo per non bloccare i tap
  const IconRailOverlay = () => (
    <div
      className="absolute left-0 top-0 h-full"
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
      onPointerDown={() => {
        if (isTouch) return
        hoverInsideRef.current = true
        clearCloseTimer()
        setOpen(true)
      }}
    />
  )

  // Tooltip kill switch quando chiusa
  React.useEffect(() => {
    const body = document.body
    if (!open) body.classList.add('no-tooltips')
    else body.classList.remove('no-tooltips')
    return () => body.classList.remove('no-tooltips')
  }, [open])

  const homeTitle = 'Home'
  const appName = 'OdeonX'

  const isEN = language === 'en'
  const countryCode = isEN ? 'GB' : 'VN'
  const nextLang = isEN ? 'vi' : 'en'
  const label = isEN ? 'Switch to Tiếng Việt' : 'Switch to English'
  const toggleLang = () => setLanguage(nextLang as 'en' | 'vi')

  const stateClass = open ? 'leftnav expanded' : 'leftnav collapsed'

  return (
    <div
      className={`relative z-20 h-full flex flex-col text-white transition-[width] duration-150 ease-out ${open ? 'w-64' : 'w-14'} ${stateClass}`}
      aria-expanded={open}
      onPointerEnter={onPointerEnterContainer}
      onPointerLeave={onPointerLeaveContainer}
      onPointerDown={onPointerDownContainer}
      onFocus={handleFocusWithin}
      onBlur={handleBlurWithin}
    >
      {/* Rail overlay: attivo solo da chiusa e solo desktop */}
      {!open && !isTouch && <IconRailOverlay />}

      {/* Header */}
      <div className="h-16 flex items-center px-3 border-b border-white/10 clip-scope">
        <Link
          href="/dashboard"
          aria-label={homeTitle}
          title={homeTitle}
          className={`p-2 rounded-xl bg-white/10 hover:bg-white/20 shrink-0 ${open ? '' : 'mx-auto'}`}
        >
          <DualIcon Icon={HomeIcon} active={pathname === '/'} open={open} />
        </Link>
        <div className="ml-3 font-bold tracking-wide text-slate-100 whitespace-nowrap overflow-hidden text-ellipsis min-w-0 nav-text">
          {open ? appName : ''}
        </div>
      </div>

      {/* Menu */}
      <nav className="p-2 space-y-1 clip-scope">
        {NAV.map(({ href, i18nKey, fallback, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          const labelTxt = i18nKey ? t(i18nKey, language) : fallback

          return (
            <Link
              key={href}
              href={href}
              aria-label={labelTxt}
              title={labelTxt}
              aria-current={active ? 'page' : undefined}
              className={`relative flex items-center h-11 rounded-xl transition-colors hover:bg-white/10 ${
                open ? 'gap-3 px-3' : 'justify-center px-0'
              }`}
              tabIndex={0}
              onPointerDown={() => {
                // su desktop apri per continuità visiva; su touch non aprire, lascia navigare
                if (!isTouch) {
                  hoverInsideRef.current = true
                  clearCloseTimer()
                  setOpen(true)
                }
              }}
            >
              {/* Indicatore attivo: barra se aperta, ring se chiusa */}
              {active && (
                open ? (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r bg-blue-500" />
                ) : (
                  <span className="absolute inset-0 rounded-xl ring-1 ring-white/30" aria-hidden="true" />
                )
              )}

              <DualIcon Icon={Icon} active={active} open={open} />

              {open && (
                <span className={`whitespace-nowrap overflow-hidden text-ellipsis font-medium nav-text ${
                  active ? 'text-slate-900' : 'text-slate-100'
                }`}>
                  {labelTxt}
                </span>
              )}

              {open && (
                <span className={`pointer-events-none absolute inset-0 -z-10 rounded-xl bg-blue-100 nav-active-bg ${active ? '' : 'opacity-0'}`} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className={`mt-auto p-3 flex items-center justify-between footer-wrap clip-scope ${open ? 'opacity-100' : 'opacity-0'}`}>
        <button
          type="button"
          onClick={toggleLang}
          aria-label={open ? label : undefined}
          className={`w-8 h-8 flex items-center justify-center ${FLAG_SHAPE === 'circle' ? 'rounded-full' : 'rounded-none'} overflow-hidden border border-white/20 hover:bg-white/10`}
          tabIndex={open ? 0 : -1}
          onPointerDown={() => {
            if (isTouch) return
            hoverInsideRef.current = true
            clearCloseTimer()
            setOpen(true)
          }}
        >
          {open && (
            <ReactCountryFlag
              countryCode={countryCode}
              svg
              style={{ width: '110%', height: '110%', objectFit: 'cover', display: 'block' }}
            />
          )}
        </button>
        {open && <div className="text-xs text-slate-300 px-2">{appVersion}</div>}
      </div>
    </div>
  )
}
