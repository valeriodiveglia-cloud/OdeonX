'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRActivityLog } from '@/types/human-resources'
import {
    UserCircleIcon,
    PlusCircleIcon,
    PencilSquareIcon,
    TrashIcon,
    UserPlusIcon,
    GlobeAltIcon,
    ArrowPathIcon,
} from '@heroicons/react/24/solid'

interface ActivityTimelineProps {
    hiringRequestId: string
}

const ACTION_CONFIG: Record<string, { icon: typeof UserCircleIcon; bg: string; iconColor: string }> = {
    'created': { icon: PlusCircleIcon, bg: 'bg-green-500', iconColor: 'text-white' },
    'updated': { icon: PencilSquareIcon, bg: 'bg-blue-500', iconColor: 'text-white' },
    'deleted': { icon: TrashIcon, bg: 'bg-red-500', iconColor: 'text-white' },
    'candidate_added': { icon: UserPlusIcon, bg: 'bg-purple-500', iconColor: 'text-white' },
    'posting_added': { icon: GlobeAltIcon, bg: 'bg-indigo-500', iconColor: 'text-white' },
    'posting_status_changed': { icon: ArrowPathIcon, bg: 'bg-amber-500', iconColor: 'text-white' },
    'default': { icon: UserCircleIcon, bg: 'bg-gray-400', iconColor: 'text-white' },
}

export function ActivityTimeline({ hiringRequestId }: ActivityTimelineProps) {
    const [activities, setActivities] = useState<HRActivityLog[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchActivity()
    }, [hiringRequestId])

    const fetchActivity = async () => {
        try {
            const { data, error } = await supabase
                .from('hr_activity_log')
                .select('*')
                .eq('hiring_request_id', hiringRequestId)
                .order('created_at', { ascending: false })

            if (error) throw error
            setActivities(data as HRActivityLog[])
        } catch (error) {
            console.error('Error fetching activity:', error)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="p-4 text-center text-gray-500">Loading activity...</div>

    if (activities.length === 0) {
        return (
            <div className="text-center py-10 bg-white shadow sm:rounded-2xl border border-gray-200">
                <p className="text-sm text-gray-500">No activity recorded yet.</p>
            </div>
        )
    }

    return (
        <div className="flow-root bg-white shadow overflow-hidden sm:rounded-2xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Activity Timeline</h3>
            <ul role="list" className="-mb-8">
                {activities.map((activity, activityIdx) => {
                    const config = ACTION_CONFIG[activity.action_type] || ACTION_CONFIG['default']
                    const IconComponent = config.icon

                    return (
                        <li key={activity.id}>
                            <div className="relative pb-8">
                                {activityIdx !== activities.length - 1 ? (
                                    <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                                ) : null}
                                <div className="relative flex space-x-3">
                                    <div>
                                        <span className={`h-8 w-8 rounded-full ${config.bg} flex items-center justify-center ring-8 ring-white`}>
                                            <IconComponent className={`h-4 w-4 ${config.iconColor}`} aria-hidden="true" />
                                        </span>
                                    </div>
                                    <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                                        <div>
                                            <p className="text-sm text-gray-600">
                                                {activity.message}
                                            </p>
                                        </div>
                                        <div className="whitespace-nowrap text-right text-sm text-gray-400">
                                            <time dateTime={activity.created_at}>{new Date(activity.created_at).toLocaleString()}</time>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
