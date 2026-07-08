'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import { HiringRequest } from '@/types/human-resources'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import { getCurrentUserPermissions } from '@/lib/user-branches'

import { RequestOverview } from '@/components/human-resources/RequestOverview'

import { CandidateList } from '@/components/human-resources/CandidateList'
import { AddCandidateModal } from '@/components/human-resources/AddCandidateModal'
import { RecruitmentPostings } from '@/components/human-resources/RecruitmentPostings'
import { PlusIcon } from '@heroicons/react/24/outline'

export default function HiringRequestDetailPage() {
    const { language } = useSettings()
    const isVI = language === 'vi'
    const params = useParams()
    const id = params.id as string
    const router = useRouter()

    const [request, setRequest] = useState<HiringRequest | null>(null)
    const [branchNames, setBranchNames] = useState<string>('')
    const [userRole, setUserRole] = useState<string | null>(null)
    const [userBranches, setUserBranches] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [updatingStatus, setUpdatingStatus] = useState(false)
    const [activeTab, setActiveTab] = useState<'overview' | 'postings' | 'candidates'>('overview')
    const [isAddCandidateOpen, setIsAddCandidateOpen] = useState(false)
    const [refreshCandidatesKey, setRefreshCandidatesKey] = useState(0)
    const [refreshActivityKey, setRefreshActivityKey] = useState(0)

    const triggerActivityRefresh = () => {
        setRefreshActivityKey(prev => prev + 1)
        fetchRequest(true)
    }

    useEffect(() => {
        if (!id) return
        fetchRequest()
    }, [id])

    const fetchRequest = async (silent = false) => {
        if (!silent) setLoading(true)
        try {
            const perms = await getCurrentUserPermissions()
            setUserRole(perms.role)
            setUserBranches(perms.userBranches)

            const { data: requestData, error: requestError } = await supabase
                .from('hiring_requests')
                .select('*')
                .eq('id', id)
                .single()

            if (requestError) throw requestError

            if (!perms.isAdminOrOwner) {
                const reqBranches = requestData.branch_ids || []
                const hasAccess = reqBranches.some((bid: string) => perms.userBranches.includes(String(bid)))
                if (!hasAccess) {
                    router.push('/human-resources/recruitment')
                    return
                }
            }
            
            let currentStatus = requestData.status
            if (currentStatus === 'submitted') {
                const { count, error: countErr } = await supabase
                    .from('recruitment_postings')
                    .select('*', { count: 'exact', head: true })
                    .eq('hiring_request_id', id)

                if (!countErr && count !== null && count > 0) {
                    await supabase
                        .from('hiring_requests')
                        .update({ status: 'in_progress' })
                        .eq('id', id)

                    await supabase.from('hr_activity_log').insert([{
                        hiring_request_id: id,
                        action_type: 'updated',
                        message: `Hiring request was automatically updated to In Progress because a job posting was published / Trạng thái yêu cầu tuyển dụng tự động chuyển thành Đang thực hiện do tin tuyển dụng đã được đăng.`,
                    }])
                    currentStatus = 'in_progress'
                }
            }

            setRequest({ ...requestData, status: currentStatus } as HiringRequest)

            // Fetch branches to resolve names
            const validBranchIds = (requestData.branch_ids || []).filter(Boolean)
            if (validBranchIds.length > 0) {
                const { data: branchData } = await supabase
                    .from('provider_branches')
                    .select('id, name')
                    .in('id', validBranchIds)

                if (branchData) {
                    setBranchNames(branchData.map(b => b.name).join(', '))
                }
            }

        } catch (error) {
            console.error('Error fetching request:', error)
        } finally {
            if (!silent) setLoading(false)
        }
    }

    const handleStatusChange = async (newStatus: string) => {
        if (!request) return
        setUpdatingStatus(true)
        try {
            const closedAtVal = newStatus === 'closed' ? new Date().toISOString() : null
            const { error } = await supabase
                .from('hiring_requests')
                .update({ 
                    status: newStatus,
                    closed_at: closedAtVal
                })
                .eq('id', request.id)

            if (error) throw error

            setRequest(prev => prev ? { ...prev, status: newStatus as any, closed_at: closedAtVal } : null)

            const statusLabelEN = {
                draft: 'Draft',
                submitted: 'Submitted',
                in_progress: 'In Progress',
                waiting_manager: 'Waiting Manager',
                on_hold: 'On Hold',
                closed: 'Closed'
            }[newStatus] || newStatus

            const statusLabelVI = {
                draft: 'Nháp',
                submitted: 'Đã nộp',
                in_progress: 'Đang thực hiện',
                waiting_manager: 'Chờ Quản lý',
                on_hold: 'Tạm dừng',
                closed: 'Đã đóng'
            }[newStatus] || newStatus

            await supabase.from('hr_activity_log').insert([{
                hiring_request_id: request.id,
                action_type: 'updated',
                message: `Hiring request status was updated to ${statusLabelEN} / Trạng thái yêu cầu tuyển dụng được cập nhật thành ${statusLabelVI}`,
            }])

            triggerActivityRefresh()
        } catch (err) {
            console.error('Error updating status:', err)
            alert(language === 'vi' ? 'Cập nhật trạng thái thất bại' : 'Failed to update status')
        } finally {
            setUpdatingStatus(false)
        }
    }

    const handleCandidateHired = async () => {
        if (!id) return
        try {
            const { data: requestData } = await supabase
                .from('hiring_requests')
                .select('headcount, status, position_title')
                .eq('id', id)
                .single()

            if (!requestData || requestData.status === 'closed') return

            const { count, error } = await supabase
                .from('candidates')
                .select('id', { count: 'exact', head: true })
                .eq('hiring_request_id', id)
                .eq('stage', 'hired')

            if (!error && count !== null && count >= requestData.headcount) {
                const confirmMsg = language === 'vi'
                    ? `Bạn đã tuyển đủ số lượng nhân sự (${requestData.headcount}) cho vị trí "${requestData.position_title}". Bạn có muốn đóng/lưu trữ yêu cầu tuyển dụng này không?`
                    : `You have successfully hired the required headcount (${requestData.headcount}) for "${requestData.position_title}". Do you want to close/archive this hiring request?`
                
                if (confirm(confirmMsg)) {
                    await handleStatusChange('closed')
                }
            }
        } catch (err) {
            console.error('Error checking hired candidates count:', err)
        }
    }

    if (loading) return <div className="flex h-screen items-center justify-center"><CircularLoader /></div>
    if (!request) return <div className="p-8 text-center bg-slate-900 text-gray-100 min-h-screen">Request not found</div>

    return (
        <div className="min-h-screen">
            <header className="shadow-none border-b border-white/10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/human-resources/recruitment"
                            className="p-2 rounded-full hover:bg-white/10 transition"
                        >
                            <ArrowLeftIcon className="h-5 w-5 text-gray-300" />
                        </Link>
                        <div className="flex flex-col gap-2">
                            <h2 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">
                                {request.position_title}
                            </h2>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold uppercase tracking-wider">
                                    {request.department}
                                </span>
                                {branchNames && branchNames.split(', ').map((branch, idx) => (
                                    <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded bg-slate-800 text-slate-350 border border-slate-700/80 text-xs font-medium">
                                        {branch}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="ml-auto flex items-center gap-3">
                            {(() => {
                                const statusColors = {
                                    draft: 'bg-slate-700/50 text-slate-300 border-slate-600',
                                    submitted: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/25',
                                    in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
                                    waiting_manager: 'bg-orange-500/10 text-orange-400 border-orange-500/25',
                                    on_hold: 'bg-purple-500/10 text-purple-400 border-purple-500/25',
                                    closed: 'bg-green-500/10 text-green-400 border-green-500/25',
                                }
                                const statusLabels = {
                                    en: {
                                        draft: 'Draft',
                                        submitted: 'Submitted',
                                        in_progress: 'In Progress',
                                        waiting_manager: 'Waiting Manager',
                                        on_hold: 'On Hold',
                                        closed: 'Closed'
                                    },
                                    vi: {
                                        draft: 'Nháp',
                                        submitted: 'Đã nộp',
                                        in_progress: 'Đang thực hiện',
                                        waiting_manager: 'Chờ Quản lý',
                                        on_hold: 'Tạm dừng',
                                        closed: 'Đã đóng'
                                    }
                                }
                                const label = statusLabels[language === 'vi' ? 'vi' : 'en'][request.status] || request.status
                                const color = statusColors[request.status] || 'bg-slate-800 text-slate-400 border-white/10'
                                return (
                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${color}`}>
                                        {label}
                                    </span>
                                )
                            })()}
                            <Link
                                href={`/human-resources/recruitment/${request.id}/edit`}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow hover:shadow-lg"
                            >
                                <PencilSquareIcon className="h-5 w-5" />
                                {language === 'vi' ? 'Sửa' : 'Edit'}
                            </Link>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="mt-8 border-b border-white/10">
                        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                            {(['overview', 'postings', 'candidates'] as const).map((tab) => {
                                const label = tab === 'overview'
                                    ? (isVI ? 'Tổng quan' : 'Overview')
                                    : tab === 'postings'
                                    ? (isVI ? 'Đăng tuyển' : 'Job Postings')
                                    : (isVI ? 'Ứng viên' : 'Candidates')
                                return (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`
                                            whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all cursor-pointer
                                            ${activeTab === tab
                                                ? 'border-blue-500 text-blue-500'
                                                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}
                                        `}
                                    >
                                        {label}
                                    </button>
                                )
                            })}
                        </nav>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {activeTab === 'overview' && <RequestOverview request={request} branchNames={branchNames} />}
                {activeTab === 'postings' && (
                    <div className="bg-white shadow overflow-hidden sm:rounded-2xl border border-gray-200 p-6">
                        <RecruitmentPostings
                            hiringRequestId={request.id}
                            positionTitle={request.position_title}
                            onActivityUpdate={triggerActivityRefresh}
                        />
                    </div>
                )}
                {activeTab === 'candidates' && (
                    <div className="space-y-4">
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setIsAddCandidateOpen(true)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow hover:shadow-lg"
                            >
                                <PlusIcon className="w-4 h-4" />
                                {isVI ? 'Thêm ứng viên' : 'Add Candidate'}
                            </button>
                        </div>
                        <CandidateList 
                            key={refreshCandidatesKey} 
                            hiringRequestId={request.id} 
                            hiringRequest={request}
                            onRefreshRequest={() => {
                                triggerActivityRefresh()
                            }}
                            onCandidateHired={handleCandidateHired}
                        />
                    </div>
                )}
            </main>
            {isAddCandidateOpen && request && (
                <AddCandidateModal
                    hiringRequest={request}
                    onClose={() => setIsAddCandidateOpen(false)}
                    onSuccess={() => {
                        setRefreshCandidatesKey(prev => prev + 1)
                        triggerActivityRefresh()
                    }}
                />
            )}
        </div>
    )
}
