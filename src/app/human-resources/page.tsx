'use client'

import Link from 'next/link'
import { Briefcase, Activity, Users, Settings, CalendarDays, Clock } from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'

export default function HRDashboardPage() {
    const { language } = useSettings()

    const title = language === 'vi' ? 'Bảng điều khiển Nhân sự' : 'Human Resources Dashboard'

    const MODULES = [
        {
            name: 'Recruitment',
            label: language === 'vi' ? 'Tuyển dụng' : 'Recruitment',
            description: language === 'vi' ? 'Quản lý yêu cầu tuyển dụng và ứng viên' : 'Manage hiring requests and candidates',
            href: '/human-resources/recruitment',
            icon: Briefcase,
            color: 'bg-blue-500'
        },
        {
            name: 'Activity',
            label: language === 'vi' ? 'Hoạt động' : 'Activity',
            description: language === 'vi' ? 'Xem dòng thời gian hoạt động nhân sự' : 'View HR activity timeline',
            href: '/human-resources/activity',
            icon: Activity,
            color: 'bg-green-500'
        },
        {
            name: 'Candidates',
            label: language === 'vi' ? 'Ứng viên' : 'Candidates',
            description: language === 'vi' ? 'Xem và tìm kiếm tất cả ứng viên' : 'View and search all candidates',
            href: '/human-resources/candidates',
            icon: Users,
            color: 'bg-purple-500'
        },
        {
            name: 'HR Operational',
            label: language === 'vi' ? 'Vận hành HR' : 'HR Operational',
            description: language === 'vi' ? 'Lập lịch nhân viên, phân ca và quản lý ca làm việc' : 'Staff scheduling, roster and shift management',
            href: '/human-resources/operational',
            icon: CalendarDays,
            color: 'bg-cyan-500'
        },
        {
            name: 'Time Keeping',
            label: language === 'vi' ? 'Chấm công' : 'Time Keeping',
            description: language === 'vi' ? 'Chấm công, tăng ca và tính phí dịch vụ' : 'Attendance, overtime and service charge calculation',
            href: '/human-resources/time-keeping',
            icon: Clock,
            color: 'bg-amber-500'
        },
        {
            name: 'Settings',
            label: language === 'vi' ? 'Cài đặt' : 'Settings',
            description: language === 'vi' ? 'Cấu hình các cài đặt mô-đun nhân sự' : 'Configure HR module settings',
            href: '/human-resources/settings',
            icon: Settings,
            color: 'bg-gray-500'
        },
    ]

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-2xl font-semibold text-gray-900 mb-6">{title}</h1>
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
                            <p className="text-sm font-medium text-gray-900">{module.label}</p>
                            <p className="text-sm text-gray-500 truncate">{module.description}</p>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
