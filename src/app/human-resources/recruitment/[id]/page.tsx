'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import { HiringRequest } from '@/types/human-resources'
import CircularLoader from '@/components/CircularLoader'

import { RequestOverview } from '@/components/human-resources/RequestOverview'

import { ActivityTimeline } from '@/components/human-resources/ActivityTimeline'
import { CandidateList } from '@/components/human-resources/CandidateList'
import { AddCandidateModal } from '@/components/human-resources/AddCandidateModal'
import { RecruitmentPostings } from '@/components/human-resources/RecruitmentPostings'
import { PlusIcon } from '@heroicons/react/24/outline'

export default function HiringRequestDetailPage() {
    const params = useParams()
    const id = params.id as string
    const router = useRouter()

    const [request, setRequest] = useState<HiringRequest | null>(null)
    const [branchNames, setBranchNames] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'candidates' | 'notes'>('overview')
    const [isAddCandidateOpen, setIsAddCandidateOpen] = useState(false)
    const [refreshCandidatesKey, setRefreshCandidatesKey] = useState(0)

    useEffect(() => {
        if (!id) return
        fetchRequest()
    }, [id])

    const fetchRequest = async () => {
        setLoading(true)
        try {
            const { data: requestData, error: requestError } = await supabase
                .from('hiring_requests')
                .select('*')
                .eq('id', id)
                .single()

            if (requestError) throw requestError
            setRequest(requestData as HiringRequest)

            // Fetch branches to resolve names
            if (requestData.branch_ids && requestData.branch_ids.length > 0) {
                const { data: branchData } = await supabase
                    .from('provider_branches')
                    .select('id, name')
                    .in('id', requestData.branch_ids)

                if (branchData) {
                    setBranchNames(branchData.map(b => b.name).join(', '))
                }
            }

        } catch (error) {
            console.error('Error fetching request:', error)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="flex h-screen items-center justify-center"><CircularLoader /></div>
    if (!request) return <div className="p-8 text-center bg-slate-900 text-gray-100 min-h-screen">Request not found</div>

    return (
        <div className="min-h-screen bg-slate-900">
            <header className="shadow-none border-b border-white/10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/human-resources/recruitment"
                            className="p-2 rounded-full hover:bg-white/10 transition"
                        >
                            <ArrowLeftIcon className="h-5 w-5 text-gray-300" />
                        </Link>
                        <div>
                            <h2 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">
                                {request.position_title}
                            </h2>
                            <p className="mt-1 text-sm text-gray-400">{request.department} {branchNames && `- ${branchNames}`}</p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <Link
                                href={`/human-resources/recruitment/${request.id}/edit`}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow hover:shadow-lg"
                            >
                                <PencilSquareIcon className="h-5 w-5" />
                                Edit
                            </Link>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="mt-8 border-b border-white/10">
                        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                            {['overview', 'activity', 'candidates', 'notes'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab as any)}
                                    className={`
                                        whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                                        ${activeTab === tab
                                            ? 'border-blue-500 text-blue-500'
                                            : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}
                                    `}
                                >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {activeTab === 'overview' && <RequestOverview request={request} branchNames={branchNames} />}
                {activeTab === 'activity' && (
                    <div className="space-y-6">
                        {/* Postings Tracker */}
                        <div className="bg-white shadow overflow-hidden sm:rounded-2xl border border-gray-200 p-6">
                            <RecruitmentPostings
                                hiringRequestId={request.id}
                                positionTitle={request.position_title}
                            />
                        </div>

                        {/* Activity Timeline */}
                        <ActivityTimeline hiringRequestId={request.id} />
                    </div>
                )}
                {activeTab === 'candidates' && (
                    <div className="space-y-4">
                        <div className="flex justify-end">
                            <button
                                onClick={() => setIsAddCandidateOpen(true)}
                                className="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none"
                            >
                                <PlusIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                                Add Candidate
                            </button>
                        </div>
                        <CandidateList key={refreshCandidatesKey} hiringRequestId={request.id} />
                    </div>
                )}
                {activeTab === 'notes' && (
                    <div className="bg-white shadow sm:rounded-2xl border border-gray-200 p-6">
                        <h3 className="text-lg font-medium leading-6 text-gray-900">Notes</h3>
                        <div className="mt-2 text-sm text-gray-500 whitespace-pre-wrap">
                            {request.notes || 'No internal notes.'}
                        </div>
                    </div>
                )}
            </main>
            {isAddCandidateOpen && request && (
                <AddCandidateModal
                    hiringRequest={request}
                    onClose={() => setIsAddCandidateOpen(false)}
                    onSuccess={() => {
                        setRefreshCandidatesKey(prev => prev + 1)
                    }}
                />
            )}
        </div>
    )
}
