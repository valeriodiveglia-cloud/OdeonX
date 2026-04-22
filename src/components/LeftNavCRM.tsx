'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React from 'react'
import { Briefcase, Activity, Users, Settings, Home, Target, HandCoins, CalendarCheck2, LogOut } from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'
import ReactCountryFlag from 'react-country-flag'
import { t } from '@/lib/i18n'

const NAV = [
    { href: '/crm', key: 'CRMDashboardTitle', icon: Home, exact: true },
    { href: '/crm/partners', key: 'PartnersAndPipeline', icon: Users },
    { href: '/crm/referrals', key: 'Referrals', icon: Target },
    { href: '/crm/commissions', key: 'Commissions', icon: Activity },
    { href: '/crm/payouts', key: 'Payouts', icon: HandCoins },
    { href: '/crm/tasks', key: 'TasksAndFollowUps', icon: CalendarCheck2 },
    { href: '/crm/settings', key: 'Settings', icon: Settings },
]

// Reusing style constants
const EXP_W_REM = 16
const COLL_W_REM = 3.5

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? 'v0.0'

export default function LeftNavCRM() {
    const pathname = usePathname()
    const router = useRouter()
    const { language, setLanguage } = useSettings()
    const [open, setOpen] = React.useState(false)

    const [role, setRole] = React.useState<string | null>(null)

    // Layout handling for overlay
    React.useEffect(() => {
        const root = document.documentElement
        const width = open ? `${EXP_W_REM}rem` : `${COLL_W_REM}rem`
        root.style.setProperty('--leftnav-w', width)
        return () => root.style.setProperty('--leftnav-w', `${COLL_W_REM}rem`)
    }, [open])

    React.useEffect(() => {
        const fetchRole = async () => {
            const { data: user } = await import('@/lib/supabase_shim').then(m => m.supabase.auth.getUser())
            if (user?.user) {
                const { data } = await import('@/lib/supabase_shim').then(m => m.supabase.from('app_accounts').select('role').eq('user_id', user.user.id).single())
                setRole(data?.role || 'staff')
            }
        }
        fetchRole()
    }, [])

    const handleMouseEnter = () => setOpen(true)
    const handleMouseLeave = () => setOpen(false)

    const isEN = language === 'en'
    const toggleLang = () => setLanguage(isEN ? 'vi' : 'en')

    const handleLogout = async () => {
        const { supabase } = await import('@/lib/supabase_shim')
        await supabase.auth.signOut()
        router.push('/login')
    }

    const filteredNav = NAV.map(item => {
        if (role === 'sale advisor' && item.key === 'Settings') {
            return { ...item, href: '/crm/settings/password' }
        }
        return item
    }).filter(item => {
        if (role === null) return false; // Prevent flash of unauthorized icons while loading
        if (role === 'staff') {
            return item.href === '/crm/referrals'
        }
        if (role === 'admin' || role === 'manager') {
            if (item.href === '/crm/tasks') return false;
        }
        if (role === 'sale advisor') {
            return item.href === '/crm/partners' || item.href === '/crm/tasks' || item.href === '/crm/commissions' || item.href === '/crm/payouts' || item.href === '/crm/settings/password'
        }
        return true
    })

    return (
        <div
            className={`fixed inset-y-0 left-0 z-40 flex flex-col text-white transition-[width] duration-150 ease-out
                  ${open ? 'w-64' : 'w-14'} bg-slate-900 border-r border-white/10`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Header */}
            <div className="h-16 flex items-center px-3 border-b border-white/10">
                {role !== 'sale advisor' ? (
                    <Link href="/dashboard" className={`p-2 rounded-xl bg-white/10 hover:bg-white/20 shrink-0 ${open ? '' : 'mx-auto'}`} title={t(language, 'BackToDashboard')}>
                        <Home className="w-5 h-5 text-white" />
                    </Link>
                ) : (
                    <div className={`p-2 rounded-xl bg-white/5 shrink-0 ${open ? '' : 'mx-auto'}`}>
                        <Users className="w-5 h-5 text-blue-400" />
                    </div>
                )}
                <div className="ml-3 font-bold tracking-wide text-slate-100 whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
                    {open ? t(language, 'CRMAndPartners') : ''}
                </div>
            </div>

            {/* Nav Items */}
            <nav className="p-2 space-y-1 mt-2">
                {filteredNav.map((item) => {
                    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)

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
                                    {t(language, item.key)}
                                </span>
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Footer */}
            <div className="mt-auto p-2 flex flex-col gap-1 border-t border-white/10">
                {role === 'sale advisor' && (
                    <button
                        onClick={handleLogout}
                        className={`flex items-center h-11 w-full rounded-xl transition-colors hover:bg-white/10 text-slate-400 hover:text-red-400 font-medium ${open ? 'gap-3 px-3' : 'justify-center px-0'}`}
                        title={t(language, 'Logout')}
                    >
                        <LogOut className="w-5 h-5 shrink-0" />
                        {open && <span className="whitespace-nowrap overflow-hidden transition-opacity">{t(language, 'Logout')}</span>}
                    </button>
                )}
                <div className={`p-1 flex items-center justify-between transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}>
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

        </div>
    )
}
