'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HomeIcon } from '@heroicons/react/24/outline'
import {
    LayoutDashboard,
    CreditCard,
    Ticket,
    Gift,
    Settings,
} from 'lucide-react'
import React from 'react'

import { getLoyaltyManagerDictionary } from '@/app/loyalty-manager/_i18n'
import { useSettings } from '@/contexts/SettingsContext'
import ReactCountryFlag from 'react-country-flag'

type Item = {
    href: string
    label: string
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
    exact?: boolean
}

const BASE = '/loyalty-manager'

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
                className={`absolute inset-0 w-5 h-5 text-slate-900 ${open && active ? 'opacity-100' : 'opacity-0'
                    } transition-opacity`}
            />
        </span>
    )
}

const ICON_RAIL_W = 56
const EXP_W_REM = 16
const COLL_W_REM = 3.5
const CLOSE_DELAY_MS = 120
const FLAG_SHAPE: 'circle' | 'square' = 'circle'
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? 'v0.0'

export default function LeftNavLoyaltyManager() {
    const [isOpen, setIsOpen] = React.useState(false)
    const pathname = usePathname()
    const { language, setLanguage } = useSettings()

    const t = getLoyaltyManagerDictionary(language)

    const NAV: Item[] = [
        { href: BASE, label: t.navigation.dashboard, icon: LayoutDashboard, exact: true },
        { href: `${BASE}/cards`, label: t.navigation.loyalty_cards, icon: CreditCard },
        { href: `${BASE}/vouchers`, label: t.navigation.vouchers, icon: Ticket },
        { href: `${BASE}/settings`, label: t.navigation.settings, icon: Settings },
    ]

    const [isTouch, setIsTouch] = React.useState(false)

    React.useEffect(() => {
        const mq = typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)') : null
        const update = () => setIsTouch(!!mq?.matches)
        update()
        mq?.addEventListener?.('change', update)
        return () => mq?.removeEventListener?.('change', update)
    }, [])

    React.useEffect(() => {
        const root = document.documentElement
        const width = isOpen ? `${EXP_W_REM}rem` : `${COLL_W_REM}rem`
        root.style.setProperty('--leftnav-w', width)
        return () => root.style.setProperty('--leftnav-w', `${COLL_W_REM}rem`)
    }, [isOpen])

    const hoverInsideRef = React.useRef(false)
    const focusInsideRef = React.useRef(false)
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
                setIsOpen(false)
                closeTimerRef.current = null
            }, CLOSE_DELAY_MS)
        }
    }, [clearCloseTimer, setIsOpen])

    React.useEffect(() => () => clearCloseTimer(), [clearCloseTimer])

    const handleFocusWithin: React.FocusEventHandler<HTMLDivElement> = () => {
        if (isTouch) return
        focusInsideRef.current = true
        clearCloseTimer()
        setIsOpen(true)
    }
    const handleBlurWithin: React.FocusEventHandler<HTMLDivElement> = (e) => {
        const stillInside = e.currentTarget.contains(e.relatedTarget as Node)
        focusInsideRef.current = !!stillInside
        if (!stillInside) scheduleCloseIfNeeded()
    }

    const IconRailOverlay = () => (
        <div
            className="absolute left-0 top-0 h-full z-0"
            style={{ width: ICON_RAIL_W, pointerEvents: 'auto' }}
            onPointerEnter={() => {
                if (isTouch) return
                hoverInsideRef.current = true
                clearCloseTimer()
                setIsOpen(true)
            }}
            onPointerLeave={() => {
                if (isTouch) return
                hoverInsideRef.current = false
                focusInsideRef.current = false
                scheduleCloseIfNeeded()
            }}
        />
    )

    React.useEffect(() => {
        const body = document.body
        if (!isOpen) body.classList.add('no-tooltips')
        else body.classList.remove('no-tooltips')
        return () => body.classList.remove('no-tooltips')
    }, [isOpen])

    const homeTitle = t.navigation.home
    const appName = 'Loyalty Manager'
    const isEN = language === 'en'
    const countryCode = isEN ? 'GB' : 'VN'
    const nextLang = isEN ? 'vi' : 'en'
    const label = isEN ? t.navigation.switch_to_vi : t.navigation.switch_to_en
    const toggleLang = () => setLanguage(nextLang as 'en' | 'vi')

    const stateClass = isOpen ? 'leftnav expanded' : 'leftnav collapsed'
    const norm = (s: string) => s.replace(/\/+$/, '')

    return (
        <div
            className={`fixed inset-y-0 left-0 z-40 flex flex-col text-white transition-[width] duration-150 ease-out
                  ${isOpen ? 'w-64' : 'w-14'} ${stateClass} bg-slate-900 border-r border-white/10`}
            style={{ height: '100dvh' }}
            aria-expanded={isOpen}
            onFocus={handleFocusWithin}
            onBlur={handleBlurWithin}
            onPointerEnter={() => {
                if (isTouch) return
                hoverInsideRef.current = true
                clearCloseTimer()
                setIsOpen(true)
            }}
            onPointerLeave={() => {
                if (isTouch) return
                hoverInsideRef.current = false
                focusInsideRef.current = false
                scheduleCloseIfNeeded()
            }}
        >
            {!isOpen && !isTouch && <IconRailOverlay />}

            {/* Header */}
            <div className="h-16 flex items-center px-3 border-b border-white/10">
                <Link
                    href="/dashboard"
                    aria-label={homeTitle}
                    title={homeTitle}
                    className={`p-2 rounded-xl bg-white/10 hover:bg-white/20 shrink-0 ${isOpen ? '' : 'mx-auto'}`}
                    onPointerEnter={() => { if (!isTouch) setIsOpen(true) }}
                >
                    <HomeIcon className="w-5 h-5 text-white" />
                </Link>
                <div className="ml-3 font-bold tracking-wide text-slate-100 whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
                    {isOpen ? appName : ''}
                </div>
            </div>

            {/* Menu */}
            <nav className="p-2 space-y-1">
                {NAV.map(({ href, label, icon: Icon, exact }) => {
                    const active = exact
                        ? norm(pathname) === norm(href)
                        : pathname === href || pathname.startsWith(href + '/')

                    return (
                        <Link
                            key={href}
                            href={href}
                            aria-label={label}
                            title={label}
                            aria-current={active ? 'page' : undefined}
                            className={`relative flex items-center h-11 rounded-xl transition-colors hover:bg-white/10 ${isOpen ? 'gap-3 px-3' : 'justify-center px-0'
                                }`}
                            tabIndex={0}
                            onPointerEnter={() => { if (!isTouch) setIsOpen(true) }}
                        >
                            {active && (isOpen
                                ? (
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r bg-blue-500" />
                                )
                                : (
                                    <span
                                        className="absolute inset-0 rounded-xl ring-1 ring-white/30"
                                        aria-hidden="true"
                                    />
                                )
                            )}

                            <DualIcon Icon={Icon} active={active} open={isOpen} />

                            {isOpen && (
                                <>
                                    <span
                                        className={`whitespace-nowrap overflow-hidden text-ellipsis font-medium ${active ? 'text-slate-900' : 'text-slate-100'
                                            }`}
                                    >
                                        {label}
                                    </span>
                                    <span
                                        className={`pointer-events-none absolute inset-0 -z-10 rounded-xl bg-blue-100 ${active ? '' : 'opacity-0'
                                            }`}
                                    />
                                </>
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Footer */}
            <div
                className={`mt-auto p-3 flex items-center justify-between ${isOpen ? 'opacity-100' : 'opacity-0'
                    }`}
            >
                <button
                    type="button"
                    onClick={toggleLang}
                    aria-label={isOpen ? label : undefined}
                    className={`w-8 h-8 flex items-center justify-center ${FLAG_SHAPE === 'circle' ? 'rounded-full' : 'rounded-none'
                        } overflow-hidden border border-white/20 hover:bg-white/10`}
                    tabIndex={isOpen ? 0 : -1}
                    onPointerEnter={() => { if (!isTouch) setIsOpen(true) }}
                >
                    {isOpen && (
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
                {isOpen && <div className="text-xs text-slate-300 px-2">{appVersion}</div>}
            </div>
        </div>
    )
}
