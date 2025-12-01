import { CreditCard, Ticket, Gift, Settings } from 'lucide-react'
import Link from 'next/link'

export default function LoyaltyManagerDashboard() {
    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-white mb-6">Loyalty Manager Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <DashboardCard
                    title="Membership Cards"
                    icon={CreditCard}
                    href="/loyalty-manager/membership-cards"
                    description="Manage customer loyalty cards"
                    color="bg-blue-500"
                />
                <DashboardCard
                    title="Vouchers"
                    icon={Ticket}
                    href="/loyalty-manager/vouchers"
                    description="Manage discount vouchers"
                    color="bg-green-500"
                />
                <DashboardCard
                    title="Prepaid Cards"
                    icon={Gift}
                    href="/loyalty-manager/prepaid-cards"
                    description="Manage prepaid gift cards"
                    color="bg-purple-500"
                />
                <DashboardCard
                    title="Settings"
                    icon={Settings}
                    href="/loyalty-manager/settings"
                    description="Configure loyalty program"
                    color="bg-slate-500"
                />
            </div>
        </div>
    )
}

function DashboardCard({ title, icon: Icon, href, description, color }: any) {
    return (
        <Link href={href} className="block group">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 transition-all hover:shadow-md hover:border-blue-300">
                <div className={`w - 12 h - 12 rounded - lg ${color} text - white flex items - center justify - center mb - 4`}>
                    <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">{title}</h3>
                <p className="text-slate-500 text-sm">{description}</p>
            </div>
        </Link>
    )
}
