'use client'

import { CreditCard, Ticket, Settings } from 'lucide-react'
import Link from 'next/link'
import { useSettings } from '@/contexts/SettingsContext'
import { getLoyaltyManagerDictionary } from './_i18n'

export default function LoyaltyManagerDashboard() {
    const { language } = useSettings()
    const t = getLoyaltyManagerDictionary(language)

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-white mb-6">{t.dashboard.title}</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <DashboardCard
                    title={t.dashboard.cards.loyalty_cards_title}
                    icon={CreditCard}
                    href="/loyalty-manager/cards"
                    description={t.dashboard.cards.loyalty_cards_desc}
                    color="bg-blue-600"
                />
                <DashboardCard
                    title={t.dashboard.cards.vouchers_title}
                    icon={Ticket}
                    href="/loyalty-manager/vouchers"
                    description={t.dashboard.cards.vouchers_desc}
                    color="bg-purple-600"
                />
                <DashboardCard
                    title={t.dashboard.cards.settings_title}
                    icon={Settings}
                    href="/loyalty-manager/settings"
                    description={t.dashboard.cards.settings_desc}
                    color="bg-slate-500"
                />
            </div>
        </div>
    )
}

function DashboardCard({ title, icon: Icon, href, description, color }: any) {
    return (
        <Link href={href} className="block group h-full">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 transition-all hover:shadow-md hover:border-blue-300 h-full flex flex-col">
                <div className={`w-full h-10 rounded-lg ${color} text-white flex items-center justify-start pl-4 mb-4`}>
                    <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">{title}</h3>
                <div className="h-px bg-slate-200 my-3" />
                <p className="text-slate-500 text-sm">{description}</p>
            </div>
        </Link>
    )
}
