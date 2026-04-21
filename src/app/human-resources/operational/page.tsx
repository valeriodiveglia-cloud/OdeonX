'use client'

import Link from 'next/link'
import { CalendarDays, BarChart3, Settings } from 'lucide-react'

const MODULES = [
    {
        name: 'Roster',
        description: 'Create and manage weekly staff schedules for each branch',
        href: '/human-resources/operational/roster',
        icon: CalendarDays,
        color: 'bg-blue-500',
    },
    {
        name: 'Reports',
        description: 'View shifts, hours, leave and attendance analytics',
        href: '/human-resources/operational/reports',
        icon: BarChart3,
        color: 'bg-emerald-500',
    },
    {
        name: 'Settings',
        description: 'Configure shift types, schedules and operational rules',
        href: '/human-resources/operational/settings',
        icon: Settings,
        color: 'bg-gray-500',
    },
    {
        name: 'Service Charge',
        description: 'Calculate and distribute monthly service charges',
        href: '/human-resources/operational/service-charge',
        icon: CalendarDays,
        color: 'bg-indigo-500',
    },
]

export default function HROperationalDashboard() {
    return (
        <div className="min-h-screen bg-\[#0b1530\] text-gray-100 p-6">
            <div className="max-w-5xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-white sm:text-3xl tracking-tight">
                        HR Operational
                    </h1>
                    <p className="mt-2 text-sm text-slate-400">
                        Staff scheduling, shift management and operational analytics.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {MODULES.map((m) => (
                        <Link
                            key={m.name}
                            href={m.href}
                            className="group relative rounded-2xl bg-white shadow-md p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                        >
                            <div className="flex items-start gap-4">
                                <div className={`flex-shrink-0 h-12 w-12 rounded-xl flex items-center justify-center text-white ${m.color} shadow-lg`}>
                                    <m.icon className="h-6 w-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                        {m.name}
                                    </p>
                                    <p className="mt-1 text-sm text-gray-500">
                                        {m.description}
                                    </p>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    )
}
