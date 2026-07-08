'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import { HRActivityLog } from '@/types/human-resources'
import { 
    UserCircleIcon,
    BriefcaseIcon,
    PencilSquareIcon,
    ArrowPathIcon,
    UserPlusIcon,
    TrashIcon,
    SparklesIcon,
    XMarkIcon,
    ChevronRightIcon,
    UserIcon,
    ClockIcon,
    GlobeAltIcon
} from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'

interface ActivityWithPosition extends HRActivityLog {
    position_title?: string
    branch_names?: string
    headcount?: number
}

const formatActivityMessage = (message: string, lang: string) => {
    if (!message) return ''
    const parts = message.split(' / ')
    if (parts.length === 2) {
        return lang === 'vi' ? parts[1] : parts[0]
    }
    return message
}

export default function AllActivityPage() {
    const { language } = useSettings()
    const isVI = language === 'vi'
    const [activities, setActivities] = useState<ActivityWithPosition[]>([])
    const [loading, setLoading] = useState(true)

    // Filter states
    const [searchQuery, setSearchQuery] = useState('')
    const [filterCategory, setFilterCategory] = useState<'all' | 'requests' | 'candidates'>('all')

    useEffect(() => {
        fetchAllActivity()
    }, [])

    const fetchAllActivity = async () => {
        try {
            // Fetch all activity logs
            const { data: activityData, error } = await supabase
                .from('hr_activity_log')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error

            // Fetch hiring request titles + branch_ids
            const hiringRequestIds = [...new Set((activityData || []).map((a: HRActivityLog) => a.hiring_request_id).filter(Boolean))]

            let positionMap: Record<string, { title: string; branch_ids: string[]; headcount: number }> = {}
            let allBranchIds: string[] = []

            if (hiringRequestIds.length > 0) {
                const { data: hrData } = await supabase
                    .from('hiring_requests')
                    .select('id, position_title, branch_ids, headcount')
                    .in('id', hiringRequestIds)

                if (hrData) {
                    hrData.forEach((hr: any) => {
                        positionMap[hr.id] = { title: hr.position_title, branch_ids: hr.branch_ids || [], headcount: hr.headcount || 1 }
                        allBranchIds.push(...(hr.branch_ids || []))
                    })
                }
            }

            // Resolve branch names
            let branchNameMap: Record<string, string> = {}
            const uniqueBranchIds = [...new Set(allBranchIds)].filter(Boolean)
            if (uniqueBranchIds.length > 0) {
                const { data: branchData } = await supabase
                    .from('provider_branches')
                    .select('id, name')
                    .in('id', uniqueBranchIds)

                if (branchData) {
                    branchData.forEach((b: any) => {
                        branchNameMap[String(b.id)] = b.name
                    })
                }
            }

            const enriched: ActivityWithPosition[] = (activityData || []).map((a: HRActivityLog) => {
                const pos = positionMap[a.hiring_request_id]
                const branchNames = pos?.branch_ids?.map(id => branchNameMap[String(id)] || id).join(', ') || ''
                return {
                    ...a,
                    position_title: pos?.title || (isVI ? 'Vị trí không xác định' : 'Unknown Position'),
                    branch_names: branchNames,
                    headcount: pos?.headcount,
                }
            })

            setActivities(enriched)
        } catch (error) {
            console.error('Error fetching all activity:', error)
        } finally {
            setLoading(false)
        }
    }

    const filteredActivities = useMemo(() => {
        let out = activities

        // Category filter
        if (filterCategory === 'requests') {
            out = out.filter(a => 
                a.action_type === 'created' || 
                a.action_type === 'updated' || 
                a.action_type?.startsWith('hiring_request_') || 
                a.action_type?.startsWith('posting_') ||
                a.action_type?.startsWith('platform_')
            )
        } else if (filterCategory === 'candidates') {
            out = out.filter(a => 
                a.action_type?.startsWith('candidate_') || 
                a.action_type === 'stage_changed'
            )
        }

        // Search query filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            out = out.filter(a => {
                const messageMatch = a.message?.toLowerCase().includes(q)
                const positionMatch = a.position_title?.toLowerCase().includes(q)
                const branchMatch = a.branch_names?.toLowerCase().includes(q)
                const typeMatch = a.action_type?.toLowerCase().includes(q)
                return messageMatch || positionMatch || branchMatch || typeMatch
            })
        }

        return out
    }, [activities, filterCategory, searchQuery])

    const groupedActivities = useMemo(() => {
        const groups: Record<string, ActivityWithPosition[]> = {}
        filteredActivities.forEach(a => {
            const date = new Date(a.created_at)
            const dateStr = date.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })
            if (!groups[dateStr]) groups[dateStr] = []
            groups[dateStr].push(a)
        })
        return Object.entries(groups)
    }, [filteredActivities, language])

    const getActionTypeDetails = (type: string) => {
        switch (type) {
            case 'created':
            case 'hiring_request_created':
                return {
                    icon: BriefcaseIcon,
                    bg: 'bg-emerald-50 border-emerald-100 text-emerald-600',
                    label: isVI ? 'Tạo yêu cầu' : 'Request Created'
                }
            case 'updated':
            case 'hiring_request_updated':
                return {
                    icon: PencilSquareIcon,
                    bg: 'bg-blue-50 border-blue-100 text-blue-600',
                    label: isVI ? 'Cập nhật yêu cầu' : 'Request Updated'
                }
            case 'hiring_request_status_changed':
                return {
                    icon: ArrowPathIcon,
                    bg: 'bg-purple-50 border-purple-100 text-purple-600',
                    label: isVI ? 'Thay đổi trạng thái' : 'Status Changed'
                }
            case 'candidate_added':
            case 'candidate_created':
                return {
                    icon: UserPlusIcon,
                    bg: 'bg-sky-50 border-sky-100 text-sky-600',
                    label: isVI ? 'Ứng viên mới' : 'New Candidate'
                }
            case 'candidate_deleted':
                return {
                    icon: TrashIcon,
                    bg: 'bg-rose-50 border-rose-100 text-rose-600',
                    label: isVI ? 'Xóa ứng viên' : 'Candidate Deleted'
                }
            case 'candidate_onboarded':
            case 'candidate_hired':
                return {
                    icon: SparklesIcon,
                    bg: 'bg-green-50 border-green-100 text-green-700',
                    label: isVI ? 'Đã nhận việc' : 'Hired'
                }
            case 'candidate_rejected':
                return {
                    icon: XMarkIcon,
                    bg: 'bg-red-50 border-red-100 text-red-650',
                    label: isVI ? 'Từ chối' : 'Rejected'
                }
            case 'candidate_status_changed':
            case 'stage_changed':
                return {
                    icon: ChevronRightIcon,
                    bg: 'bg-indigo-50 border-indigo-100 text-indigo-600',
                    label: isVI ? 'Chuyển trạng thái' : 'Stage Changed'
                }
            case 'posting_added':
            case 'posting_deleted':
            case 'posting_status_changed':
                return {
                    icon: ArrowPathIcon,
                    bg: 'bg-amber-50 border-amber-100 text-amber-600',
                    label: isVI ? 'Tin tuyển dụng' : 'Job Posting'
                }
            case 'platform_created':
                return {
                    icon: GlobeAltIcon,
                    bg: 'bg-emerald-50 border-emerald-100 text-emerald-600',
                    label: isVI ? 'Tạo nền tảng' : 'Platform Created'
                }
            case 'platform_updated':
                return {
                    icon: GlobeAltIcon,
                    bg: 'bg-blue-50 border-blue-100 text-blue-600',
                    label: isVI ? 'Cập nhật nền tảng' : 'Platform Updated'
                }
            case 'platform_deleted':
                return {
                    icon: GlobeAltIcon,
                    bg: 'bg-rose-50 border-rose-100 text-rose-600',
                    label: isVI ? 'Xóa nền tảng' : 'Platform Deleted'
                }
            default:
                return {
                    icon: UserIcon,
                    bg: 'bg-slate-50 border-slate-100 text-slate-600',
                    label: type
                }
        }
    }

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
            {/* Header */}
            <header className="mb-6">
                <div className="flex items-center gap-4">
                    <Link
                        href="/human-resources"
                        className="inline-flex items-center justify-center p-2 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-850 hover:border-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                        title={isVI ? 'Quay lại' : 'Back'}
                    >
                        <ArrowLeftIcon className="h-5 w-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-white sm:text-3xl tracking-tight leading-normal">
                            {isVI ? 'Nhật ký hoạt động' : 'Activity Log'}
                        </h1>
                        <p className="mt-1 text-sm text-slate-400">
                            {isVI ? 'Toàn bộ lịch sử hoạt động nhân sự của tất cả các vị trí.' : 'All HR activity across every open position.'}
                        </p>
                    </div>
                </div>
            </header>

            {/* Filters Bar */}
            <div className="mb-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
                {/* Tabs */}
                <div className="flex border-b border-slate-800/80 gap-6 w-full sm:w-auto px-2">
                    {([
                        ['all', isVI ? 'Tutte' : 'All'],
                        ['requests', isVI ? 'Richieste' : 'Hiring Requests'],
                        ['candidates', isVI ? 'Candidati' : 'Candidates']
                    ] as const).map(([cat, label]) => {
                        const isActive = filterCategory === cat
                        return (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setFilterCategory(cat)}
                                className={`pb-3 text-sm font-semibold border-b-2 transition-all cursor-pointer outline-none ${
                                    isActive 
                                        ? 'border-blue-500 text-white font-extrabold' 
                                        : 'border-transparent text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                {label}
                            </button>
                        )
                    })}
                </div>

                {/* Search Box */}
                <div className="relative w-full sm:w-72">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" aria-hidden="true" />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder={isVI ? 'Cerca attività...' : 'Search activity...'}
                        className="block w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2 pl-10 pr-3 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                    />
                </div>
            </div>

            {/* Main Content */}
            <main>
                {loading ? (
                    <div className="flex justify-center py-12">
                        <CircularLoader />
                    </div>
                ) : filteredActivities.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl shadow border border-gray-150 p-6">
                        <UserCircleIcon className="mx-auto h-12 w-12 text-gray-300" />
                        <h3 className="mt-3 text-sm font-semibold text-gray-900">
                            {isVI ? 'Nessuna attività trovata' : 'No activity found'}
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">
                            {isVI 
                                ? 'Prova a modificare i filtri o la query di ricerca per trovare i log.' 
                                : 'Try adjusting your filters or search query to find the activity log.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {groupedActivities.map(([dateStr, items]) => (
                            <div key={dateStr} className="space-y-4">
                                {/* Date Header */}
                                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider pl-1">
                                    {dateStr}
                                </h3>

                                <div className="bg-white rounded-2xl border border-gray-150 shadow-sm overflow-hidden p-6">
                                    <div className="flow-root">
                                        <ul role="list" className="-mb-8">
                                            {items.map((activity, activityIdx) => {
                                                const actionDetails = getActionTypeDetails(activity.action_type || '')
                                                const ActionIcon = actionDetails.icon

                                                return (
                                                    <li key={activity.id}>
                                                        <div className="relative pb-8">
                                                            {activityIdx !== items.length - 1 ? (
                                                                <span className="absolute top-5 left-5 -ml-px h-full w-0.5 bg-gray-100" aria-hidden="true" />
                                                            ) : null}
                                                            <div className="relative flex items-start space-x-3">
                                                                {/* Icon Badge */}
                                                                <div className="relative">
                                                                    <span className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm ${actionDetails.bg} ring-8 ring-white transition`}>
                                                                        <ActionIcon className="h-5 w-5" aria-hidden="true" />
                                                                    </span>
                                                                </div>

                                                                {/* Details */}
                                                                <div className="min-w-0 flex-1 py-1.5 flex justify-between gap-4">
                                                                    <div className="space-y-1.5">
                                                                        <p className="text-sm font-semibold text-slate-800">
                                                                            {formatActivityMessage(activity.message || '', language)}
                                                                        </p>
                                                                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs">
                                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${actionDetails.bg}`}>
                                                                                {actionDetails.label}
                                                                            </span>
                                                                            {activity.hiring_request_id ? (
                                                                                <Link
                                                                                    href={`/human-resources/recruitment/${activity.hiring_request_id}`}
                                                                                    className="inline-flex items-center gap-1.5 text-xs text-blue-650 hover:text-blue-800 hover:underline font-bold transition-colors"
                                                                                >
                                                                                    <BriefcaseIcon className="h-3.5 w-3.5 text-blue-500" />
                                                                                    {activity.position_title}
                                                                                    {activity.branch_names && (
                                                                                        <span className="text-slate-400 font-normal">
                                                                                            ({activity.branch_names})
                                                                                        </span>
                                                                                    )}
                                                                                </Link>
                                                                            ) : (
                                                                                <Link
                                                                                    href="/human-resources/settings"
                                                                                    className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 hover:underline font-bold transition-colors"
                                                                                >
                                                                                    <GlobeAltIcon className="h-3.5 w-3.5 text-slate-400" />
                                                                                    {isVI ? 'Cấu hình Tuyển dụng' : 'Recruitment Settings'}
                                                                                </Link>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="whitespace-nowrap text-right text-xs text-slate-400 font-semibold flex items-center gap-1 pt-0.5">
                                                                        <ClockIcon className="h-3.5 w-3.5 text-slate-350" />
                                                                        {new Date(activity.created_at).toLocaleTimeString(language === 'vi' ? 'vi-VN' : 'en-US', {
                                                                            hour: '2-digit',
                                                                            minute: '2-digit'
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    )
}
