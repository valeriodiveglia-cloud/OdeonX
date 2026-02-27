'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { RecruitmentPosting, PostingStatus, RecruitmentPlatform } from '@/types/human-resources'
import {
    GlobeAltIcon,
    ArrowTopRightOnSquareIcon,
    EllipsisVerticalIcon,
    PlusIcon,
} from '@heroicons/react/24/outline'
import { AddPostingModal } from './AddPostingModal'

const FALLBACK_PLATFORM = { icon: '📌', color: 'bg-gray-100 text-gray-800' }

const STATUS_STYLES: Record<PostingStatus, { label: string; class: string }> = {
    active: { label: 'Active', class: 'bg-green-100 text-green-800' },
    paused: { label: 'Paused', class: 'bg-yellow-100 text-yellow-800' },
    expired: { label: 'Expired', class: 'bg-gray-100 text-gray-600' },
    removed: { label: 'Removed', class: 'bg-red-100 text-red-800' },
}

interface RecruitmentPostingsProps {
    hiringRequestId: string
    positionTitle: string
}

export function RecruitmentPostings({ hiringRequestId, positionTitle }: RecruitmentPostingsProps) {
    const [postings, setPostings] = useState<RecruitmentPosting[]>([])
    const [loading, setLoading] = useState(true)
    const [showAddModal, setShowAddModal] = useState(false)
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
    const [platformConfig, setPlatformConfig] = useState<Record<string, { icon: string; color: string }>>({})

    useEffect(() => {
        loadData()
    }, [hiringRequestId])

    const loadData = async () => {
        setLoading(true)
        await Promise.all([fetchPostings(), fetchPlatformConfig()])
        setLoading(false)
    }

    const fetchPlatformConfig = async () => {
        try {
            const { data, error } = await supabase
                .from('recruitment_platforms')
                .select('value, icon, color_bg, color_text')
                .order('sort_order', { ascending: true })

            if (error) throw error
            const config: Record<string, { icon: string; color: string }> = {}
                ; (data || []).forEach((p: any) => {
                    config[p.value] = { icon: p.icon, color: `${p.color_bg} ${p.color_text}` }
                })
            setPlatformConfig(config)
        } catch (error) {
            console.error('Error fetching platform config:', error)
        }
    }

    const fetchPostings = async () => {
        try {
            const { data, error } = await supabase
                .from('recruitment_postings')
                .select('*')
                .eq('hiring_request_id', hiringRequestId)
                .order('posted_at', { ascending: false })

            if (error) throw error
            setPostings(data as RecruitmentPosting[])
        } catch (error) {
            console.error('Error fetching postings:', error)
        }
    }

    const updatePostingStatus = async (postingId: string, newStatus: PostingStatus) => {
        try {
            const { error } = await supabase
                .from('recruitment_postings')
                .update({ status: newStatus })
                .eq('id', postingId)

            if (error) throw error

            const posting = postings.find(p => p.id === postingId)

            // Log activity
            await supabase.from('hr_activity_log').insert([{
                hiring_request_id: hiringRequestId,
                action_type: 'posting_status_changed',
                message: `${posting?.platform} posting status changed to ${newStatus}`,
            }])

            setPostings(prev => prev.map(p =>
                p.id === postingId ? { ...p, status: newStatus } : p
            ))
            setMenuOpenId(null)
        } catch (error) {
            console.error('Error updating posting status:', error)
        }
    }

    const incrementResponses = async (postingId: string) => {
        const posting = postings.find(p => p.id === postingId)
        if (!posting) return

        const newCount = posting.responses_count + 1

        try {
            const { error } = await supabase
                .from('recruitment_postings')
                .update({ responses_count: newCount })
                .eq('id', postingId)

            if (error) throw error
            setPostings(prev => prev.map(p =>
                p.id === postingId ? { ...p, responses_count: newCount } : p
            ))
        } catch (error) {
            console.error('Error updating response count:', error)
        }
    }

    if (loading) return <div className="p-4 text-center text-gray-500">Loading postings...</div>

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <GlobeAltIcon className="h-5 w-5 text-blue-600" />
                        Job Postings
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">Track where this position has been posted</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow-sm"
                >
                    <PlusIcon className="h-4 w-4" />
                    Log Posting
                </button>
            </div>

            {/* Summary Stats */}
            {postings.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-blue-50 rounded-lg px-4 py-3 text-center border border-blue-100">
                        <div className="text-2xl font-bold text-blue-700">{postings.length}</div>
                        <div className="text-xs text-blue-600 font-medium">Platforms</div>
                    </div>
                    <div className="bg-green-50 rounded-lg px-4 py-3 text-center border border-green-100">
                        <div className="text-2xl font-bold text-green-700">{postings.filter(p => p.status === 'active').length}</div>
                        <div className="text-xs text-green-600 font-medium">Active</div>
                    </div>
                    <div className="bg-amber-50 rounded-lg px-4 py-3 text-center border border-amber-100">
                        <div className="text-2xl font-bold text-amber-700">{postings.reduce((sum, p) => sum + p.responses_count, 0)}</div>
                        <div className="text-xs text-amber-600 font-medium">Responses</div>
                    </div>
                </div>
            )}

            {/* Postings List */}
            {postings.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                    <GlobeAltIcon className="mx-auto h-10 w-10 text-gray-300" />
                    <p className="mt-2 text-sm text-gray-500">No postings logged yet</p>
                    <p className="text-xs text-gray-400">Click "Log Posting" to record where the job is being advertised</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {postings.map((posting) => {
                        const platformInfo = platformConfig[posting.platform] || FALLBACK_PLATFORM
                        const statusInfo = STATUS_STYLES[posting.status as PostingStatus] || STATUS_STYLES.active

                        return (
                            <div
                                key={posting.id}
                                className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-100 hover:bg-gray-50/50 transition group"
                            >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <span className="text-xl flex-shrink-0">{platformInfo.icon}</span>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-gray-900 text-sm">{posting.platform}</span>
                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusInfo.class}`}>
                                                {statusInfo.label}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <span className="text-xs text-gray-400">
                                                {new Date(posting.posted_at).toLocaleDateString()}
                                            </span>
                                            {posting.notes && (
                                                <span className="text-xs text-gray-400 truncate max-w-[200px]">
                                                    {posting.notes}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {/* Response Counter */}
                                    <button
                                        onClick={() => incrementResponses(posting.id)}
                                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-xs text-gray-600 transition"
                                        title="Click to increment responses"
                                    >
                                        <span className="font-semibold">{posting.responses_count}</span>
                                        <span className="text-gray-400">resp.</span>
                                    </button>

                                    {/* External Link */}
                                    {posting.platform_url && (
                                        <a
                                            href={posting.platform_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition"
                                            title="Open post"
                                        >
                                            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                                        </a>
                                    )}

                                    {/* Menu */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setMenuOpenId(menuOpenId === posting.id ? null : posting.id)}
                                            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition"
                                        >
                                            <EllipsisVerticalIcon className="h-4 w-4" />
                                        </button>
                                        {menuOpenId === posting.id && (
                                            <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-10">
                                                {posting.status !== 'active' && (
                                                    <button
                                                        onClick={() => updatePostingStatus(posting.id, 'active')}
                                                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                                                    >
                                                        Set Active
                                                    </button>
                                                )}
                                                {posting.status !== 'paused' && (
                                                    <button
                                                        onClick={() => updatePostingStatus(posting.id, 'paused')}
                                                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                                                    >
                                                        Pause
                                                    </button>
                                                )}
                                                {posting.status !== 'removed' && (
                                                    <button
                                                        onClick={() => updatePostingStatus(posting.id, 'removed')}
                                                        className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Add Posting Modal */}
            {showAddModal && (
                <AddPostingModal
                    hiringRequestId={hiringRequestId}
                    positionTitle={positionTitle}
                    onClose={() => setShowAddModal(false)}
                    onSuccess={fetchPostings}
                />
            )}
        </div>
    )
}
