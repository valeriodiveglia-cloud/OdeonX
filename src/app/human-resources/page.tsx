'use client'

import Link from 'next/link'
import { Briefcase, Activity, Users, Settings, CalendarDays } from 'lucide-react'

const MODULES = [
    { name: 'Recruitment', description: 'Manage hiring requests and candidates', href: '/human-resources/recruitment', icon: Briefcase, color: 'bg-blue-500' },
    { name: 'Activity', description: 'View HR activity timeline', href: '/human-resources/activity', icon: Activity, color: 'bg-green-500' },
    { name: 'Candidates', description: 'View and search all candidates', href: '/human-resources/candidates', icon: Users, color: 'bg-purple-500' },
    { name: 'HR Operational', description: 'Staff scheduling, roster and shift management', href: '/human-resources/operational', icon: CalendarDays, color: 'bg-cyan-500' },
    { name: 'Settings', description: 'Configure HR module settings', href: '/human-resources/settings', icon: Settings, color: 'bg-gray-500' },
]

export default function HRDashboardPage() {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-2xl font-semibold text-gray-900 mb-6">Human Resources Dashboard</h1>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {MODULES.map((module) => (
                    <Link
                        key={module.name}
                        href={module.href}
                        className="relative rounded-lg border border-gray-200 bg-white p-6 shadow-sm flex items-center space-x-3 hover:border-gray-400 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                    >
                        <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white ${module.color}`}>
                            <module.icon className="h-6 w-6" aria-hidden="true" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <span className="absolute inset-0" aria-hidden="true" />
                            <p className="text-sm font-medium text-gray-900">{module.name}</p>
                            <p className="text-sm text-gray-500 truncate">{module.description}</p>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
