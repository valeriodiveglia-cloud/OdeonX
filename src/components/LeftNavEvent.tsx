// src/components/LeftNavEvent.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HomeIcon } from '@heroicons/react/24/outline'
import { Building2, Settings } from 'lucide-react'
import React from 'react'

import { useECT } from '@/app/catering/_i18n'
import { useSettings } from '@/contexts/SettingsContext'
import ReactCountryFlag from 'react-country-flag'

type Item = {
  href: string
  i18nKey: string | null
  fallback: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  /** se true, la voce è “active” solo su match esatto del pathname */
  exact?: boolean
}

const BASE = '/catering'
const NAV: Item[] = [
  // Rinominato + rotta a /catering + exact per non “attivarsi” anche su /catering/eventsettings
  { href: `${BASE}`,               i18nKey: 'EventCalculator', fallback: 'Event Calculator', icon: Building2, exact: true },
  { href: `${BASE}/eventsettings`, i18nKey: 'EventSettings',   fallback: 'Event Settings',   icon: Settings },
]

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
      <Icon
        className={`absolute inset-0 w-5 h-5 text-slate-900 ${
          open && active ? 'opacity-100' : 'opacity-0'
        } transition-opacity`}
      />
    </span>
  )
}

const ICON_RAIL_W = 56 // px (w-14)
const EXP_W_REM = 16   // w-64
const COLL_W_REM = 3.5 // w-14

const CLOSE_DELAY_MS = 120
const FLAG_SHAPE: 'circle' | 'square' = 'circle'
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? 'v0.0'

export default function LeftNavEvent() {
  const pathname = usePathname()
  const { language, setLanguage } = useSettings()

  // Allarga localmente la firma del traduttore per accettare chiavi string dinamiche
  const _t = useECT() as unknown as (k: string, fb?: string) => string

  const [open, setOpen] = React.useState(false)
  const [isTouch, setIsTouch] = React.useState(false)

  React.useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)') : null
    const update = () => setIsTouch(!!mq?.matches)
    update()
    mq?.addEventListener?.('change', update)
    return () => mq?.removeEventListener?.('change', update)
  }, [])

  // 👉 aggiorna variabile globale --leftnav-w in base allo stato (collassata/espansa)
  React.useEffect(() => {
    const root = document.documentElement
    const width = open ? `${EXP_W_REM}rem` : `${COLL_W_REM}rem`
    root.style.setProperty('--leftnav-w', width)
    return () => {
      // su unmount la lasciamo collassata (fallback 56px nel resto dell'app)
      root.style.setProperty('--leftnav-w', `${COLL_W_REM}rem`)
    }
  }, [open])

  // flag interni
  const hoverInsideRef = React.useRef(false)
  const focusInsideRef = React.useRef(false)

  // timer
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

  // focus tastiera (desktop) — su touch non apre
  const handleFocusWithin: React.FocusEventHandler<HTMLDivElement> = () => {
    if (isTouch) return
    focusInsideRef.current = true
    clearCloseTimer()
    setOpen(true)
  }
  const handleBlurWithin: React.FocusEventHandler<HTMLDivElement> = (e) => {
    const stillInside = e.currentTarget.contains(e.relatedTarget as Node)
    focusInsideRef.current = !!stillInside
    if (!stillInside) scheduleCloseIfNeeded()
  }

  // overlay rail per hover da chiusa (desktop)
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
        // chiudi SEMPRE quando esci dall’area (indipendente dal focus)
        hoverInsideRef.current = false
        focusInsideRef.current = false
        scheduleCloseIfNeeded()
      }}
    />
  )

  // tooltip kill switch
  React.useEffect(() => {
    const body = document.body
    if (!open) body.classList.add('no-tooltips')
    else body.classList.remove('no-tooltips')
    return () => body.classList.remove('no-tooltips')
  }, [open])

  const homeTitle = 'Home'
  // Titolo ridotto a “Catering”
  const appName = 'Catering'
  const isEN = language === 'en'
  const countryCode = isEN ? 'GB' : 'VN'
  const nextLang = isEN ? 'vi' : 'en'
  const label = isEN ? 'Switch to Tiếng Việt' : 'Switch to English'
  const toggleLang = () => setLanguage(nextLang as 'en' | 'vi')

  const stateClass = open ? 'leftnav expanded' : 'leftnav collapsed'

  // normalizza per confronto esatto
  const norm = (s: string) => s.replace(/\/+$/, '')

  return (
    // fisso + bg + bordo
    <div
      className={`fixed inset-y-0 left-0 z-40 flex flex-col text-white transition-[width] duration-150 ease-out
                  ${open ? 'w-64' : 'w-14'} ${stateClass} bg-slate-900 border-r border-white/10`}
      style={{ height: '100dvh' }}
      aria-expanded={open}
      onFocus={handleFocusWithin}
      onBlur={handleBlurWithin}
      onPointerEnter={() => {
        if (isTouch) return
        hoverInsideRef.current = true
        clearCloseTimer()
        setOpen(true)
      }}
      onPointerLeave={() => {
        if (isTouch) return
        // **fix principale**: quando il mouse esce, chiudi sempre
        hoverInsideRef.current = false
        focusInsideRef.current = false
        scheduleCloseIfNeeded()
      }}
    >
      {!open && !isTouch && <IconRailOverlay />}

      {/* Header */}
      <div className="h-16 flex items-center px-3 border-b border-white/10 clip-scope">
        <Link
          href="/dashboard"
          aria-label={homeTitle}
          title={homeTitle}
          className={`p-2 rounded-xl bg-white/10 hover:bg-white/20 shrink-0 ${open ? '' : 'mx-auto'}`}
          onPointerEnter={() => {
            if (!isTouch) setOpen(true)
          }}
        >
          <DualIcon Icon={HomeIcon as any} active={pathname === '/'} open={open} />
        </Link>
        <div className="ml-3 font-bold tracking-wide text-slate-100 whitespace-nowrap overflow-hidden text-ellipsis min-w-0 nav-text">
          {open ? appName : ''}
        </div>
      </div>

      {/* Menu */}
      <nav className="p-2 space-y-1 clip-scope">
        {NAV.map(({ href, i18nKey, fallback, icon: Icon, exact }) => {
          const active = exact ? norm(pathname) === norm(href) : (pathname === href || pathname.startsWith(href + '/'))
          const labelTxt = i18nKey ? _t(i18nKey, fallback) : fallback

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
              onPointerEnter={() => {
                if (!isTouch) setOpen(true)
              }}
            >
              {active && (open
                ? <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r bg-blue-500" />
                : <span className="absolute inset-0 rounded-xl ring-1 ring-white/30" aria-hidden="true" />
              )}

              <DualIcon Icon={Icon} active={active} open={open} />

              {open && (
                <>
                  <span className={`whitespace-nowrap overflow-hidden text-ellipsis font-medium nav-text ${active ? 'text-slate-900' : 'text-slate-100'}`}>
                    {labelTxt}
                  </span>
                  <span className={`pointer-events-none absolute inset-0 -z-10 rounded-xl bg-blue-100 nav-active-bg ${active ? '' : 'opacity-0'}`} />
                </>
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
          onPointerEnter={() => { if (!isTouch) setOpen(true) }}
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