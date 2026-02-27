import Link from 'next/link'
import { HiringRequest, HiringRequestStatus, HiringRequestPriority } from '@/types/human-resources'
import {
    CalendarIcon,
    MapPinIcon,
    UsersIcon,
    PencilSquareIcon,
    TrashIcon
} from '@heroicons/react/24/outline'

interface HiringRequestListProps {
    requests: HiringRequest[]
    onDelete: (id: string) => void
    branchNames?: Record<string, string>
}

const statusColors: Record<HiringRequestStatus, string> = {
    draft: 'bg-gray-100 text-gray-800',
    submitted: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    waiting_manager: 'bg-orange-100 text-orange-800',
    on_hold: 'bg-purple-100 text-purple-800',
    closed: 'bg-green-100 text-green-800',
}

const priorityColors: Record<HiringRequestPriority, string> = {
    low: 'text-gray-500',
    medium: 'text-blue-500',
    high: 'text-orange-500',
    urgent: 'text-red-500 font-bold',
}

export function HiringRequestList({ requests, onDelete, branchNames = {} }: HiringRequestListProps) {
    if (requests.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-2xl shadow-lg border border-gray-100">
                <UsersIcon className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-2 text-sm font-semibold text-gray-900">No hiring requests</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by creating a new hiring request.</p>
                <div className="mt-6">
                    <Link
                        href="/human-resources/recruitment/new"
                        className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 hover:shadow-md transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                        <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                        New Request
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="overflow-hidden bg-white shadow-lg rounded-2xl border border-gray-100">
            <ul role="list" className="divide-y divide-gray-100">
                {requests.map((request) => (
                    <li key={request.id} className="flex hover:bg-blue-50/50 transition-colors">
                        <Link href={`/human-resources/recruitment/${request.id}`} className="flex-1 block px-4 py-4 sm:px-6">
                            <div className="flex items-center justify-between">
                                <div className="truncate text-base font-semibold text-blue-700">
                                    {request.position_title}
                                    <span className="ml-2 text-gray-500 font-normal text-sm">in {request.department}</span>
                                </div>
                                <div className="ml-2 flex flex-shrink-0">
                                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 ${statusColors[request.status]}`}>
                                        {request.status.replace('_', ' ').toUpperCase()}
                                    </span>
                                </div>
                            </div>
                            <div className="mt-2 sm:flex sm:justify-between">
                                <div className="sm:flex gap-6">
                                    <p className="flex items-center text-sm text-gray-500">
                                        <UsersIcon className="mr-1.5 h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                                        {request.headcount} Headcount
                                    </p>
                                    <p className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                                        <MapPinIcon className="mr-1.5 h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                                        {/* Handle both old branch_id (fallback) and new branch_ids */}
                                        {request.branch_ids && request.branch_ids.length > 0
                                            ? request.branch_ids.map(id => branchNames[id] || id).join(', ')
                                            : 'No Branch'}
                                    </p>
                                </div>
                                <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                                    <CalendarIcon className="mr-1.5 h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                                    <p>
                                        <time dateTime={request.created_at}>{new Date(request.created_at).toLocaleDateString()}</time>
                                    </p>
                                </div>
                            </div>
                        </Link>

                        {/* Actions */}
                        <div className="flex items-center px-4 border-l border-gray-100 space-x-1">
                            <Link
                                href={`/human-resources/recruitment/${request.id}/edit`}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit Request"
                            >
                                <PencilSquareIcon className="h-5 w-5" />
                            </Link>
                            <button
                                onClick={() => {
                                    if (confirm('Are you sure you want to delete this specific request?')) {
                                        onDelete(request.id)
                                    }
                                }}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete Request"
                            >
                                <TrashIcon className="h-5 w-5" />
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}

function PlusIcon({ className, 'aria-hidden': ariaHidden }: any) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} aria-hidden={ariaHidden}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
    )
}
