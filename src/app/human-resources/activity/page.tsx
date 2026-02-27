'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import { HRActivityLog } from '@/types/human-resources'
import { UserCircleIcon } from '@heroicons/react/24/solid'
import CircularLoader from '@/components/CircularLoader'

interface ActivityWithPosition extends HRActivityLog {
    position_title?: string
    branch_names?: string
    headcount?: number
}

export default function AllActivityPage() {
    const [activities, setActivities] = useState<ActivityWithPosition[]>([])
    const [loading, setLoading] = useState(true)

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
            const hiringRequestIds = [...new Set((activityData || []).map((a: HRActivityLog) => a.hiring_request_id))]

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
            const uniqueBranchIds = [...new Set(allBranchIds)]
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
                    position_title: pos?.title || 'Unknown Position',
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

    return (
        <div className="min-h-screen bg-slate-900 text-gray-100 p-4">
            {/* Header */}
            <header className="mb-6">
                <div className="max-w-none mx-auto">
                    <div className="md:flex md:items-center md:justify-between">
                        <div className="flex-1 min-w-0 flex items-center gap-4">
                            <Link
                                href="/human-resources"
                                className="p-2 rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition"
                            >
                                <ArrowLeftIcon className="h-5 w-5" />
                            </Link>
                            <div>
                                <h2 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">
                                    Activity
                                </h2>
                                <p className="mt-1 text-sm text-blue-200">All HR activity across every open position.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-none mx-auto">
                {loading ? (
                    <div className="flex justify-center py-12">
                        <CircularLoader />
                    </div>
                ) : activities.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl shadow border border-gray-200">
                        <UserCircleIcon className="mx-auto h-12 w-12 text-gray-300" />
                        <h3 className="mt-3 text-sm font-semibold text-gray-900">No activity yet</h3>
                        <p className="mt-1 text-sm text-gray-500">Activity will appear here as changes are made to hiring requests and candidates.</p>
                    </div>
                ) : (
                    <div className="flow-root bg-white shadow overflow-hidden rounded-2xl border border-gray-200 p-6">
                        <ul role="list" className="-mb-8">
                            {activities.map((activity, activityIdx) => (
                                <li key={activity.id}>
                                    <div className="relative pb-8">
                                        {activityIdx !== activities.length - 1 ? (
                                            <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                                        ) : null}
                                        <div className="relative flex space-x-3">
                                            <div>
                                                <span className="h-8 w-8 rounded-full bg-gray-400 flex items-center justify-center ring-8 ring-white">
                                                    <UserCircleIcon className="h-5 w-5 text-white" aria-hidden="true" />
                                                </span>
                                            </div>
                                            <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                                                <div>
                                                    <p className="text-sm text-gray-500">
                                                        {activity.message}{' '}
                                                        <span className="font-medium text-gray-900">{activity.action_type}</span>
                                                    </p>
                                                    <Link
                                                        href={`/human-resources/recruitment/${activity.hiring_request_id}`}
                                                        className="mt-0.5 inline-block text-xs text-blue-600 hover:text-blue-800 transition-colors"
                                                    >
                                                        {activity.position_title}{activity.branch_names ? ` — ${activity.branch_names}` : ''}{activity.headcount ? ` (${activity.headcount} headcount)` : ''}
                                                    </Link>
                                                </div>
                                                <div className="whitespace-nowrap text-right text-sm text-gray-500">
                                                    <time dateTime={activity.created_at}>{new Date(activity.created_at).toLocaleString()}</time>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </main>
        </div>
    )
}
