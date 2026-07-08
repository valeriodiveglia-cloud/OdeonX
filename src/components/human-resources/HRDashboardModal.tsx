'use client'

import { useRouter } from 'next/navigation'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { Fragment } from 'react'
import { useSettings } from '@/contexts/SettingsContext'
import {
    UserGroupIcon,
    BriefcaseIcon,
    ClipboardDocumentCheckIcon,
    XMarkIcon,
    ClockIcon,
    ChevronRightIcon
} from '@heroicons/react/24/outline'

interface HRDashboardModalProps {
    onClose: () => void
}

export default function HRDashboardModal({ onClose }: HRDashboardModalProps) {
    const router = useRouter()
    const { language } = useSettings()

    const navigateTo = (path: string) => {
        onClose()
        router.push(path)
    }

    const modules = [
        {
            id: 'recruitment',
            path: '/human-resources/recruitment',
            titleEn: 'Recruitment',
            titleVi: 'Tuyển dụng',
            descEn: 'Hiring requests, postings & candidates',
            descVi: 'Yêu cầu tuyển dụng, đăng tin & ứng viên',
            icon: BriefcaseIcon,
            iconClass: 'text-cyan-600 bg-cyan-50 border border-cyan-200/60',
        },
        {
            id: 'management',
            path: '/human-resources/management/staff',
            titleEn: 'Management',
            titleVi: 'Quản lý',
            descEn: 'Staff directory, positions & salaries',
            descVi: 'Danh mục nhân viên, vị trí & mức lương',
            icon: ClipboardDocumentCheckIcon,
            iconClass: 'text-indigo-600 bg-indigo-50 border border-indigo-200/60',
        },
        {
            id: 'operational',
            path: '/human-resources/operational/roster',
            titleEn: 'Operational',
            titleVi: 'Vận hành',
            descEn: 'Roster, shifts & reports',
            descVi: 'Lịch làm việc, ca làm & báo cáo',
            icon: UserGroupIcon,
            iconClass: 'text-emerald-600 bg-emerald-50 border border-emerald-200/60',
        },
        {
            id: 'timekeeping',
            path: '/human-resources/time-keeping',
            titleEn: 'Time Keeping',
            titleVi: 'Chấm công',
            descEn: 'Attendance, overtime & service charge',
            descVi: 'Chuyên cần, tăng ca & phí dịch vụ',
            icon: ClockIcon,
            iconClass: 'text-amber-600 bg-amber-50 border border-amber-200/60',
        }
    ]

    return (
        <Transition appear show={true} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" />
                </TransitionChild>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <DialogPanel className="w-full max-w-[580px] transform overflow-hidden rounded-3xl bg-slate-50 border border-slate-200/80 p-6 text-left align-middle shadow-2xl transition-all">
                                {/* Header */}
                                <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200/60">
                                    <DialogTitle as="h3" className="text-base font-extrabold text-slate-900 flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                                            <UserGroupIcon className="h-5 w-5" />
                                        </div>
                                        <span>
                                            {language === 'vi' ? 'Quản trị Nhân sự' : 'Human Resources'}
                                        </span>
                                    </DialogTitle>
                                    <button
                                        onClick={onClose}
                                        className="p-1.5 rounded-full text-slate-400 hover:text-slate-650 hover:bg-slate-200/65 transition cursor-pointer"
                                    >
                                        <XMarkIcon className="h-5 w-5" />
                                    </button>
                                </div>

                                {/* Submodules Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                    {modules.map((m) => {
                                        const Icon = m.icon
                                        return (
                                            <button
                                                key={m.id}
                                                onClick={() => navigateTo(m.path)}
                                                className="group relative flex items-center gap-3.5 w-full p-4 rounded-2xl bg-white hover:bg-blue-50/10 border border-slate-250 hover:border-blue-500 shadow-[0_1px_3px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_20px_rgba(59,130,246,0.06)] transition-all duration-300 text-left cursor-pointer"
                                            >
                                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-250 group-hover:scale-103 ${m.iconClass}`}>
                                                    <Icon className="w-6 h-6 stroke-[1.75]" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-[13px] text-slate-900 group-hover:text-blue-700 transition-colors truncate">
                                                        {language === 'vi' ? m.titleVi : m.titleEn}
                                                    </h4>
                                                    <p className="text-[10px] text-slate-500 font-semibold leading-normal mt-0.5 group-hover:text-slate-650 line-clamp-2">
                                                        {language === 'vi' ? m.descVi : m.descEn}
                                                    </p>
                                                </div>
                                                <ChevronRightIcon className="w-4 h-4 text-slate-350 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                                            </button>
                                        )
                                    })}
                                </div>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    )
}
