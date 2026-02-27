'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PlusIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { HiringRequestList } from '@/components/human-resources/HiringRequestList'
import { supabase } from '@/lib/supabase_shim'
import { HiringRequest } from '@/types/human-resources'
import CircularLoader from '@/components/CircularLoader'

export default function RecruitmentPage() {
    const [loading, setLoading] = useState(true)
    const [requests, setRequests] = useState<HiringRequest[]>([])
    const [branchNames, setBranchNames] = useState<Record<string, string>>({})

    useEffect(() => {
        const loadData = async () => {
            setLoading(true)
            await Promise.all([fetchRequests(), fetchBranches()])
            setLoading(false)
        }
        loadData()
    }, [])

    const fetchBranches = async () => {
        try {
            const { data } = await supabase
                .from('provider_branches')
                .select('id, name')

            if (data) {
                const lookup: Record<string, string> = {}
                data.forEach((b: any) => {
                    lookup[String(b.id)] = b.name
                })
                setBranchNames(lookup)
            }
        } catch (error) {
            console.error('Error fetching branches:', error)
        }
    }

    const fetchRequests = async () => {
        try {
            const { data, error } = await supabase
                .from('hiring_requests')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error
            setRequests(data as HiringRequest[])
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
                    hiring_request_id: id,
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

    return (
        <div className="min-h-screen bg-slate-900 text-gray-100 p-4">
            {/* Header */}
            <header className="mb-6">
                <div className="max-w-none mx-auto">
                    <div className="md:flex md:items-center md:justify-between">
                        <div className="flex-1 min-w-0 flex items-center gap-4">
                            <Link
                                href="/dashboard"
                                className="p-2 rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition"
                            >
                                <ArrowLeftIcon className="h-5 w-5" />
                            </Link>
                            <div>
                                <h2 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">
                                    Recruitment
                                </h2>
                                <p className="mt-1 text-sm text-blue-200">Manage your branch hiring requests and candidates.</p>
                            </div>
                        </div>
                        <div className="mt-4 flex md:mt-0 md:ml-4">
                            <Link
                                href="/human-resources/recruitment/new"
                                className="ml-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow hover:shadow-lg"
                            >
                                <PlusIcon className="h-5 w-5" aria-hidden="true" />
                                New Request
                            </Link>
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
                ) : (
                    <HiringRequestList requests={requests} onDelete={deleteRequest} branchNames={branchNames} />
                )}
            </main>
        </div>
    )
}
