'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PlusIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import { HiringRequestList } from '@/components/human-resources/HiringRequestList'
import { supabase } from '@/lib/supabase_shim'
import { HiringRequest } from '@/types/human-resources'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import { getCurrentUserPermissions } from '@/lib/user-branches'

export default function RecruitmentPage() {
    const { language } = useSettings()
    const isVI = language === 'vi'
    const [loading, setLoading] = useState(true)
    const [requests, setRequests] = useState<(HiringRequest & { candidates?: { id: string }[] })[]>([])
    const [branchNames, setBranchNames] = useState<Record<string, string>>({})
    const [activeSubTab, setActiveSubTab] = useState<'active' | 'archived'>('active')
    const [userRole, setUserRole] = useState<string | null>(null)
    const [userBranches, setUserBranches] = useState<string[]>([])

    useEffect(() => {
        const loadData = async () => {
            setLoading(true)
            try {
                const perms = await getCurrentUserPermissions()
                setUserRole(perms.role)
                setUserBranches(perms.userBranches)
                await Promise.all([
                    fetchRequests(perms.isAdminOrOwner, perms.userBranches),
                    fetchBranches(perms.isAdminOrOwner, perms.userBranches)
                ])
            } catch (error) {
                console.error('Error loading page data:', error)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [])

    const fetchBranches = async (isAdminOrOwnerVal?: boolean, userBranchesVal?: string[]) => {
        try {
            let allowedBranches = userBranchesVal !== undefined ? userBranchesVal : userBranches
            let isAdmin = isAdminOrOwnerVal !== undefined ? isAdminOrOwnerVal : (userRole === 'admin' || userRole === 'owner')

            if (userBranchesVal === undefined || isAdminOrOwnerVal === undefined) {
                const perms = await getCurrentUserPermissions()
                allowedBranches = perms.userBranches
                isAdmin = perms.isAdminOrOwner
            }

            const { data } = await supabase
                .from('provider_branches')
                .select('id, name')

            if (data) {
                let filteredData = data
                if (!isAdmin) {
                    filteredData = data.filter((b: any) => allowedBranches.includes(String(b.id)))
                }
                const lookup: Record<string, string> = {}
                filteredData.forEach((b: any) => {
                    lookup[String(b.id)] = b.name
                })
                setBranchNames(lookup)
            }
        } catch (error) {
            console.error('Error fetching branches:', error)
        }
    }

    const fetchRequests = async (isAdminOrOwnerVal?: boolean, userBranchesVal?: string[]) => {
        try {
            let allowedBranches = userBranchesVal !== undefined ? userBranchesVal : userBranches
            let isAdmin = isAdminOrOwnerVal !== undefined ? isAdminOrOwnerVal : (userRole === 'admin' || userRole === 'owner')

            if (userBranchesVal === undefined || isAdminOrOwnerVal === undefined) {
                const perms = await getCurrentUserPermissions()
                allowedBranches = perms.userBranches
                isAdmin = perms.isAdminOrOwner
            }

            const { data, error } = await supabase
                .from('hiring_requests')
                .select('*, candidates(id), creator:app_accounts!hiring_requests_created_by_fkey(name)')
                .order('created_at', { ascending: false })

            if (error) throw error

            if (data) {
                let filteredData = data
                if (!isAdmin) {
                    filteredData = data.filter((r: any) =>
                        (r.branch_ids || []).some((bid: string) => allowedBranches.includes(String(bid)))
                    )
                }
                setRequests(filteredData as any)
            }
        } catch (error) {
            console.error('Error fetching hiring requests:', JSON.stringify(error, null, 2) || error)
        }
    }

    const deleteRequest = async (id: string) => {
        try {
            // Find the request title for the activity log
            const deletedRequest = requests.find(r => r.id === id)

            const { error } = await supabase
                .from('hiring_requests')
                .delete()
                .eq('id', id)

            if (error) throw error

            // Log deletion activity (before removing from state)
            if (deletedRequest) {
                await supabase.from('hr_activity_log').insert([{
                    hiring_request_id: null,
                    action_type: 'deleted',
                    message: `Hiring request "${deletedRequest.position_title}" was deleted`,
                }])
            }

            setRequests(prev => prev.filter(r => r.id !== id))
        } catch (error) {
            console.error('Error deleting request:', error)
            alert('Failed to delete request')
        }
    }

    const updateRequestStatus = async (id: string, newStatus: string) => {
        try {
            const requestToUpdate = requests.find(r => r.id === id)
            if (!requestToUpdate) return

            const { error } = await supabase
                .from('hiring_requests')
                .update({ status: newStatus })
                .eq('id', id)

            if (error) throw error

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
                hiring_request_id: id,
                action_type: 'updated',
                message: `Hiring request status was updated to ${statusLabelEN} / Trạng thái yêu cầu tuyển dụng được cập nhật thành ${statusLabelVI}`,
            }])

            fetchRequests()
        } catch (error) {
            console.error('Error updating request status:', error)
            alert(isVI ? 'Không thể cập nhật trạng thái yêu cầu tuyển dụng' : 'Failed to update hiring request status')
        }
    }

    const activeRequests = requests.filter(r => r.status !== 'closed')
    const archivedRequests = requests.filter(r => r.status === 'closed')

    const activeCount = activeRequests.length
    const archivedCount = archivedRequests.length

    const filteredRequests = activeSubTab === 'active' ? activeRequests : archivedRequests

    return (
        <div className="min-h-screen text-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="mb-6">
                    <div className="md:flex md:items-center md:justify-between">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-2xl font-bold text-white sm:text-3xl tracking-tight leading-normal">
                                {isVI ? 'Tuyển dụng' : 'Recruitment'}
                            </h1>
                            <p className="mt-1 text-sm text-slate-400">
                                {isVI ? 'Quản lý yêu cầu tuyển dụng và ứng viên chi nhánh.' : 'Manage your branch hiring requests and candidates.'}
                            </p>
                        </div>
                        <div className="mt-4 flex items-center gap-3 md:mt-0 md:ml-4">
                            {activeSubTab === 'active' && (
                                <Link
                                    href="/human-resources/recruitment/new"
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow hover:shadow-lg"
                                >
                                    <PlusIcon className="h-5 w-5" aria-hidden="true" />
                                    {isVI ? 'Yêu cầu mới' : 'New Request'}
                                </Link>
                            )}
                        </div>
                    </div>
                </header>

                {/* TAB MINIMALISTE ON DARK BACKGROUND */}
                <div className="flex border-b border-slate-800/80 mb-6 gap-6 px-2">
                    <button
                        type="button"
                        onClick={() => setActiveSubTab('active')}
                        className={`pb-3 text-sm font-semibold border-b-2 transition-all cursor-pointer outline-none ${
                            activeSubTab === 'active'
                                ? 'border-blue-500 text-white font-extrabold'
                                : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        {isVI ? `Đang hoạt động (${activeCount})` : `Active (${activeCount})`}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveSubTab('archived')}
                        className={`pb-3 text-sm font-semibold border-b-2 transition-all cursor-pointer outline-none ${
                            activeSubTab === 'archived'
                                ? 'border-blue-500 text-white font-extrabold'
                                : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        {isVI ? `Đã đóng (${archivedCount})` : `Closed (${archivedCount})`}
                    </button>
                </div>

                {/* Main Content */}
                <main>
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <CircularLoader />
                        </div>
                    ) : (
                        <HiringRequestList requests={filteredRequests} onStatusChange={updateRequestStatus} branchNames={branchNames} activeSubTab={activeSubTab} />
                    )}
                </main>
            </div>
        </div>
    )
}
