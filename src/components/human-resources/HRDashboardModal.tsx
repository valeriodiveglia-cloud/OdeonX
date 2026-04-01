'use client'

import { useRouter } from 'next/navigation'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { Fragment } from 'react'
import {
    UserGroupIcon,
    BriefcaseIcon,
    ClipboardDocumentCheckIcon,
    XMarkIcon
} from '@heroicons/react/24/outline'

interface HRDashboardModalProps {
    onClose: () => void
}

export default function HRDashboardModal({ onClose }: HRDashboardModalProps) {
    const router = useRouter()

    const navigateTo = (path: string) => {
        onClose()
        router.push(path)
    }

    return (
        <Transition appear show={true} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/25" />
                </TransitionChild>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                                <div className="flex items-center justify-between mb-5">
                                    <DialogTitle as="h3" className="text-lg font-medium leading-6 text-gray-900 flex items-center gap-2">
                                        <UserGroupIcon className="h-6 w-6 text-blue-600" />
                                        Human Resources
                                    </DialogTitle>
                                    <button
                                        onClick={onClose}
                                        className="p-1 rounded-full hover:bg-gray-100 transition"
                                    >
                                        <XMarkIcon className="h-5 w-5 text-gray-500" />
                                    </button>
                                </div>

                                <div className="mt-4 space-y-3">
                                    {/* Management - Future */}
                                    <div className="flex items-center p-4 rounded-xl border border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed">
                                        <div className="h-10 w-10 rounded-lg bg-gray-200 flex items-center justify-center text-gray-400 mr-4">
                                            <ClipboardDocumentCheckIcon className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-gray-500">Management</h4>
                                            <p className="text-xs text-gray-400">Employee records & contracts (Coming Soon)</p>
                                        </div>
                                    </div>

                                    {/* Recruitment - Active */}
                                    <button
                                        onClick={() => navigateTo('/human-resources/recruitment')}
                                        className="w-full flex items-center p-4 rounded-xl border border-blue-100 bg-blue-50 hover:bg-blue-100 hover:border-blue-200 transition text-left group"
                                    >
                                        <div className="h-10 w-10 rounded-lg bg-blue-600 text-white flex items-center justify-center mr-4 shadow-sm group-hover:scale-105 transition-transform">
                                            <BriefcaseIcon className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-gray-900 group-hover:text-blue-700">Recruitment</h4>
                                            <p className="text-xs text-gray-600">Hiring requests & candidates</p>
                                        </div>
                                    </button>

                                    {/* HR Operational - Active */}
                                    <button
                                        onClick={() => navigateTo('/human-resources/operational/roster')}
                                        className="w-full flex items-center p-4 rounded-xl border border-blue-100 bg-blue-50 hover:bg-blue-100 hover:border-blue-200 transition text-left group"
                                    >
                                        <div className="h-10 w-10 rounded-lg bg-blue-600 text-white flex items-center justify-center mr-4 shadow-sm group-hover:scale-105 transition-transform">
                                            <UserGroupIcon className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-gray-900 group-hover:text-blue-700">HR Operational</h4>
                                            <p className="text-xs text-gray-600">Roster, shifts & reports</p>
                                        </div>
                                    </button>
                                </div>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    )
}
