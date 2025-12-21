'use client'

import { useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import { TruckIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { Asset } from '../types'

type NotificationType = 'sender_reminder' | 'receiver_alert'

type Props = {
    notifications: Array<{
        type: NotificationType
        asset: Asset
    }>
    onAcknowledge: (assetId: string) => void // Just verify for sender
    onReceive: (assetId: string) => void // Mark as arrived for receiver
}

export default function TransferNotificationModal({ notifications, onAcknowledge, onReceive }: Props) {
    const [isOpen, setIsOpen] = useState(false)
    const [currentIndex, setCurrentIndex] = useState(0)

    useEffect(() => {
        if (notifications.length > 0) {
            setIsOpen(true)
            setCurrentIndex(0) // Reset to first when new notifications come
        }
    }, [notifications])

    if (!isOpen || notifications.length === 0) return null

    const current = notifications[currentIndex]
    const isReceiver = current.type === 'receiver_alert'

    const handleAction = () => {
        if (isReceiver) {
            onReceive(current.asset.id)
        } else {
            onAcknowledge(current.asset.id)
        }

        if (currentIndex < notifications.length - 1) {
            setCurrentIndex(prev => prev + 1)
        } else {
            setIsOpen(false)
        }
    }

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-[150]" onClose={() => { /* Prevent closing by background click to enforce acknowledgement */ }}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                                <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${isReceiver ? 'bg-green-100' : 'bg-amber-100'} mb-6`}>
                                    {isReceiver ? (
                                        <TruckIcon className="h-10 w-10 text-green-600" aria-hidden="true" />
                                    ) : (
                                        <ExclamationTriangleIcon className="h-10 w-10 text-amber-600" aria-hidden="true" />
                                    )}
                                </div>

                                <Dialog.Title
                                    as="h3"
                                    className="text-lg font-bold leading-6 text-gray-900 text-center mb-2"
                                >
                                    {isReceiver ? 'Incoming Asset Arrived?' : 'Asset Still In Transit'}
                                </Dialog.Title>

                                <div className="mt-2 text-center text-sm text-gray-500">
                                    <p className="mb-4">
                                        Asset: <span className="font-semibold text-gray-900">{current.asset.name}</span>
                                    </p>

                                    {isReceiver ? (
                                        <p>
                                            This asset was sent from <strong>{current.asset.branch}</strong> by <span className="text-blue-600 font-medium">{current.asset.transferBy || 'Staff'}</span>.
                                            <br />Has it arrived at your location?
                                        </p>
                                    ) : (
                                        <p>
                                            You sent this asset to <strong>{current.asset.targetBranch}</strong> on {current.asset.transferDate || 'a recent date'}.
                                            <br />Please ensure they verify receipt.
                                        </p>
                                    )}
                                </div>

                                <div className="mt-8 flex justify-center gap-3">
                                    <button
                                        type="button"
                                        className="inline-flex justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 border border-slate-300 transition-colors"
                                        onClick={() => {
                                            // Simply advance or close without action
                                            if (currentIndex < notifications.length - 1) {
                                                setCurrentIndex(prev => prev + 1)
                                            } else {
                                                setIsOpen(false)
                                            }
                                        }}
                                    >
                                        {isReceiver ? 'Not Arrived Yet' : 'Dismiss'}
                                    </button>
                                    <button
                                        type="button"
                                        className={`inline-flex justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 transition-colors ${isReceiver
                                            ? 'bg-green-600 hover:bg-green-500 focus-visible:outline-green-600'
                                            : 'bg-blue-600 hover:bg-blue-500 focus-visible:outline-blue-600'
                                            }`}
                                        onClick={handleAction}
                                    >
                                        {isReceiver ? 'Yes, Mark as Arrived' : 'OK, I Check'}
                                    </button>
                                </div>
                                <div className="mt-4 text-center text-xs text-gray-400">
                                    Notification {currentIndex + 1} of {notifications.length}
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    )
}
