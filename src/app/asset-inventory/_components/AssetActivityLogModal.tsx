'use client'

import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon, ClockIcon } from '@heroicons/react/24/outline'
import { AssetLogEntry } from '../types'

type Props = {
    open: boolean
    onClose: () => void
    logs: AssetLogEntry[]
}

export default function AssetActivityLogModal({ open, onClose, logs }: Props) {
    // Sort logs descending
    const sortedLogs = [...logs].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    const getActionColor = (action: string) => {
        switch (action) {
            case 'CREATE': return 'bg-emerald-100 text-emerald-700'
            case 'UPDATE': return 'bg-blue-100 text-blue-700'
            case 'DELETE': return 'bg-red-100 text-red-700'
            case 'TRANSFER_INIT': return 'bg-amber-100 text-amber-700'
            case 'TRANSFER_RECEIVE': return 'bg-purple-100 text-purple-700'
            default: return 'bg-slate-100 text-slate-700'
        }
    }

    const formatTime = (iso: string) => {
        return new Date(iso).toLocaleString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        })
    }

    return (
        <Transition appear show={open} as={Fragment}>
            <Dialog as="div" className="relative z-[120]" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-hidden">
                    <div className="absolute inset-0 overflow-hidden">
                        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
                            <Transition.Child
                                as={Fragment}
                                enter="transform transition ease-in-out duration-500 sm:duration-700"
                                enterFrom="translate-x-full"
                                enterTo="translate-x-0"
                                leave="transform transition ease-in-out duration-500 sm:duration-700"
                                leaveFrom="translate-x-0"
                                leaveTo="translate-x-full"
                            >
                                <Dialog.Panel className="pointer-events-auto w-screen max-w-md">
                                    <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-xl">
                                        <div className="px-6 py-6 border-b border-slate-100 bg-slate-50">
                                            <div className="flex items-start justify-between">
                                                <Dialog.Title className="text-lg font-bold leading-6 text-slate-900 flex items-center gap-2">
                                                    <ClockIcon className="w-5 h-5 text-slate-500" />
                                                    Activity Log
                                                </Dialog.Title>
                                                <div className="ml-3 flex h-7 items-center">
                                                    <button
                                                        type="button"
                                                        className="rounded-md bg-transparent text-slate-400 hover:text-slate-500 focus:outline-none"
                                                        onClick={onClose}
                                                    >
                                                        <span className="sr-only">Close panel</span>
                                                        <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="relative flex-1 px-6 py-6">
                                            {logs.length === 0 ? (
                                                <div className="text-center text-slate-400 mt-10">
                                                    <p>No activity recorded yet.</p>
                                                </div>
                                            ) : (
                                                <div className="flow-root">
                                                    <ul role="list" className="-mb-8">
                                                        {sortedLogs.map((log, logIdx) => (
                                                            <li key={log.id}>
                                                                <div className="relative pb-8">
                                                                    {logIdx !== sortedLogs.length - 1 ? (
                                                                        <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200" aria-hidden="true" />
                                                                    ) : null}
                                                                    <div className="relative flex space-x-3">
                                                                        <div>
                                                                            <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${getActionColor(log.action)}`}>
                                                                                {/* Simple Icon Dot */}
                                                                                <div className="w-2.5 h-2.5 rounded-full bg-current" />
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                                                                            <div>
                                                                                <p className="text-sm text-slate-900">
                                                                                    {log.details}
                                                                                </p>
                                                                                <p className="text-xs text-slate-500 mt-0.5">
                                                                                    by <span className="font-medium text-slate-700">{log.user}</span>
                                                                                </p>
                                                                            </div>
                                                                            <div className="whitespace-nowrap text-right text-xs text-slate-400">
                                                                                {formatTime(log.timestamp)}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </div>
            </Dialog>
        </Transition>
    )
}
