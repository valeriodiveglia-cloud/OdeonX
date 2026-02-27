'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Candidate } from '@/types/human-resources'
import { PlusIcon, UserIcon, PhoneIcon, PaperClipIcon } from '@heroicons/react/24/outline'

interface CandidateListProps {
    hiringRequestId: string
}

export function CandidateList({ hiringRequestId }: CandidateListProps) {
    const [candidates, setCandidates] = useState<Candidate[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchCandidates()
    }, [hiringRequestId])

    const fetchCandidates = async () => {
        try {
            const { data, error } = await supabase
                .from('candidates')
                .select('*')
                .eq('hiring_request_id', hiringRequestId)
                .order('created_at', { ascending: false })

            if (error) throw error
            setCandidates(data as Candidate[])
        } catch (error) {
            console.error('Error fetching candidates:', error)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="p-4 text-center">Loading candidates...</div>

    if (candidates.length === 0) {
        return (
            <div className="text-center py-10 bg-white border border-gray-200 rounded-lg">
                <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No candidates yet</h3>
                <p className="mt-1 text-sm text-gray-500">Wait for HR to add candidates or add one manually (if allowed).</p>
                {/* For MVP, Manager view is read-only for candidates mostly, but we can add 'Add Candidate' if needed */}
            </div>
        )
    }

    return (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul role="list" className="divide-y divide-gray-200">
                {candidates.map((candidate) => (
                    <li key={candidate.id}>
                        <div className="px-4 py-4 flex items-center sm:px-6">
                            <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between">
                                <div className="truncate">
                                    <div className="flex text-sm">
                                        <p className="font-medium text-blue-600 truncate">{candidate.full_name}</p>
                                        <p className="ml-1 flex-shrink-0 font-normal text-gray-500">
                                            in {candidate.stage.replace('_', ' ')}
                                        </p>
                                    </div>
                                    <div className="mt-2 flex">
                                        <div className="flex items-center text-sm text-gray-500">
                                            <PhoneIcon className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" aria-hidden="true" />
                                            <p>{candidate.phone || 'No phone'}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 flex-shrink-0 sm:mt-0 sm:ml-5">
                                    <div className="flex overflow-hidden -space-x-1">
                                        {/* Avatar placeholder or initials could go here */}
                                    </div>
                                </div>
                            </div>
                            <div className="ml-5 flex-shrink-0">
                                {candidate.cv_url && (
                                    <a href={candidate.cv_url} target="_blank" rel="noopener noreferrer" className="p-2 text-gray-400 hover:text-gray-500">
                                        <PaperClipIcon className="h-5 w-5" aria-hidden="true" />
                                    </a>
                                )}
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}
