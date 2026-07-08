'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React from 'react'
import { CalendarDays, BarChart3, Settings, Home } from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'
import ReactCountryFlag from 'react-country-flag'

const BASE = '/human-resources/operational'

const EXP_W_REM = 16
const COLL_W_REM = 3.5

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? 'v0.0'

export default function LeftNavHROperational() {
    const pathname = usePathname()
    const { language, setLanguage } = useSettings()
    const [open, setOpen] = React.useState(false)

    React.useEffect(() => {
        const root = document.documentElement
        const width = open ? `${EXP_W_REM}rem` : `${COLL_W_REM}rem`
        root.style.setProperty('--leftnav-w', width)
        return () => {
            root.style.removeProperty('--leftnav-w')
        }
    }, [open])

    const handleMouseEnter = () => setOpen(true)
    const handleMouseLeave = () => setOpen(false)

    const isEN = language === 'en'
    const toggleLang = () => setLanguage(isEN ? 'vi' : 'en')

    const headerTitle = language === 'vi' ? 'Vận hành HR' : 'HR Operational'

    const NAV = [
        { href: BASE, label: language === 'vi' ? 'Bảng điều khiển' : 'Dashboard', icon: Home, exact: true },
        { href: `${BASE}/roster`, label: language === 'vi' ? 'Lịch ca' : 'Roster', icon: CalendarDays },
        { href: `${BASE}/reports`, label: language === 'vi' ? 'Báo cáo' : 'Reports', icon: BarChart3 },
        { href: `${BASE}/settings`, label: language === 'vi' ? 'Cài đặt' : 'Settings', icon: Settings },
    ]

    const norm = (s: string) => s.replace(/\/+$/, '')

    return (
        <div
            className={`fixed inset-y-0 left-0 z-40 flex flex-col text-white transition-[width] duration-150 ease-out
                  ${open ? 'w-64' : 'w-14'} bg-gradient-to-b from-slate-800 to-slate-900 border-r border-white/10`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Header */}
            <div className="h-16 flex items-center px-3 border-b border-white/10">
                <Link href="/dashboard" className={`p-2 rounded-xl bg-white/10 hover:bg-white/20 shrink-0 ${open ? '' : 'mx-auto'}`}>
                    <Home className="w-5 h-5 text-white" />
                </Link>
                <div className="ml-3 font-bold tracking-wide text-slate-100 whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
                    {open ? headerTitle : ''}
                </div>
            </div>

            {/* Nav Items */}
            <nav className="p-2 space-y-1 mt-2">
                {NAV.map((item) => {
                    const active = item.exact
                        ? norm(pathname) === norm(item.href)
                        : pathname === item.href || pathname.startsWith(item.href + '/')

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`relative flex items-center h-11 rounded-xl transition-colors hover:bg-white/10 ${open ? 'gap-3 px-3' : 'justify-center px-0'}`}
                        >
                            {active && (
                                <div className="absolute inset-0 bg-blue-600/10 rounded-xl border border-blue-500/30" />
                            )}
                            <item.icon className={`w-5 h-5 ${active ? 'text-blue-400' : 'text-slate-400'}`} />
                            {open && (
                                <span className={`whitespace-nowrap overflow-hidden transition-opacity ${active ? 'text-blue-100 font-medium' : 'text-slate-300'}`}>
                                    {item.label}
                                </span>
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Footer */}
            <div className={`mt-auto p-3 flex items-center justify-between transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}>
                <button
                    onClick={toggleLang}
                    className="w-8 h-8 rounded-full overflow-hidden border border-white/20 hover:bg-white/10 flex items-center justify-center p-0"
                >
                    <ReactCountryFlag
                        countryCode={isEN ? 'GB' : 'VN'}
                        svg
                        style={{
                            width: '110%',
                            height: '110%',
                            objectFit: 'cover',
                            display: 'block',
                        }}
                    />
                </button>
                {open && (
                    <div className="text-xs text-slate-300 px-2">{appVersion}</div>
                )}
            </div>
        </div>
    )
}
