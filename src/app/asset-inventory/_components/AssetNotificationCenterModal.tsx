'use client'

import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon, BellIcon, ArrowDownLeftIcon, ArrowUpRightIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { Asset } from '../types'

type NotificationType = {
    type: 'sender_reminder' | 'receiver_alert'
    asset: Asset
}

type Props = {
    open: boolean
    onClose: () => void
    notifications: NotificationType[]
    onReceive: (assetId: string) => void
}

export default function AssetNotificationCenterModal({ open, onClose, notifications, onReceive }: Props) {

    const incoming = notifications.filter(n => n.type === 'receiver_alert')
    const outgoing = notifications.filter(n => n.type === 'sender_reminder')

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
                                                    <BellIcon className="w-5 h-5 text-slate-500" />
                                                    Notifications
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

                                        <div className="relative flex-1 px-6 py-6 space-y-8">
                                            {/* Incoming Section */}
                                            <div>
                                                <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                                    <ArrowDownLeftIcon className="w-4 h-4 text-emerald-600" />
                                                    Incoming Transfers
                                                    <span className="ml-auto bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                                        {incoming.length}
                                                    </span>
                                                </h3>

                                                {incoming.length === 0 ? (
                                                    <p className="text-sm text-slate-400 italic">No incoming transfers.</p>
                                                ) : (
                                                    <ul className="space-y-3">
                                                        {incoming.map((n) => (
                                                            <li key={n.asset.id} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <span className="font-medium text-slate-900">{n.asset.name}</span>
                                                                    <span className="text-xs text-slate-500">{n.asset.transferDate}</span>
                                                                </div>
                                                                <p className="text-sm text-slate-600 mb-3">
                                                                    From: <span className="font-semibold">{n.asset.branch}</span>
                                                                    {n.asset.transferBy && <span className="text-slate-500"> (sent by {n.asset.transferBy})</span>}
                                                                </p>
                                                                <button
                                                                    onClick={() => onReceive(n.asset.id)}
                                                                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-500 transition-colors"
                                                                >
                                                                    <CheckCircleIcon className="w-4 h-4" />
                                                                    Confirm Receipt
                                                                </button>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>

                                            {/* Outgoing Section */}
                                            <div>
                                                <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                                    <ArrowUpRightIcon className="w-4 h-4 text-amber-600" />
                                                    Outgoing (In Transit)
                                                    <span className="ml-auto bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                                        {outgoing.length}
                                                    </span>
                                                </h3>

                                                {outgoing.length === 0 ? (
                                                    <p className="text-sm text-slate-400 italic">No active outgoing transfers.</p>
                                                ) : (
                                                    <ul className="space-y-3">
                                                        {outgoing.map((n) => (
                                                            <li key={n.asset.id} className="bg-slate-50 rounded-lg p-3 border border-slate-200 opacity-75">
                                                                <div className="flex justify-between items-start mb-1">
                                                                    <span className="font-medium text-slate-900">{n.asset.name}</span>
                                                                    <span className="text-xs text-slate-500">{n.asset.transferDate}</span>
                                                                </div>
                                                                <p className="text-sm text-slate-600">
                                                                    To: <span className="font-semibold">{n.asset.targetBranch}</span>
                                                                </p>
                                                                <p className="text-xs text-slate-400 mt-1 italic">
                                                                    Waiting for receiver to confirm...
                                                                </p>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
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
