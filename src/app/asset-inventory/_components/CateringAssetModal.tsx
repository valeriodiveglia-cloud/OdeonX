'use client'

import { useState } from 'react'
import { Dialog } from '@headlessui/react'
import { XMarkIcon, TruckIcon } from '@heroicons/react/24/outline'
import { Asset, CateringEvent } from '../types'

type Props = {
    open: boolean
    onClose: () => void
    onConfirm: (details: CateringEvent) => void
    asset: Asset | null
}

export default function CateringAssetModal({ open, onClose, onConfirm, asset }: Props) {
    const [eventName, setEventName] = useState('')
    const [customerName, setCustomerName] = useState('')
    const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]) // Default to today
    const [notes, setNotes] = useState('')

    if (!open || !asset) return null

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onConfirm({
            eventName,
            customerName,
            eventDate,
            notes
        })
        // Reset
        setEventName('')
        setCustomerName('')
        setEventDate(new Date().toISOString().split('T')[0])
        setNotes('')
    }

    // Input classes with better padding/margins
    const inputClass = "w-full rounded-xl border-slate-300 focus:border-purple-500 focus:ring-purple-500 text-slate-900 px-4 py-3"

    return (
        <div className="fixed inset-0 z-[110] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
                <div className="fixed inset-0 bg-black/60 transition-opacity" onClick={onClose} />

                <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 text-left shadow-xl transition-all">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <TruckIcon className="w-5 h-5 text-purple-600" />
                            Out to Catering
                        </h3>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="mb-6 p-3 bg-purple-50 rounded-lg border border-purple-100">
                        <p className="text-sm text-purple-900 font-medium">Asset to send:</p>
                        <p className="text-purple-700">{asset.name}</p>
                        <p className="text-xs text-purple-500 font-mono mt-0.5">{asset.sku}</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Event Name</label>
                            <input
                                required
                                type="text"
                                value={eventName}
                                onChange={e => setEventName(e.target.value)}
                                className={inputClass}
                                placeholder="e.g., Wedding at Riverside"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Customer (Optional)</label>
                            <input
                                type="text"
                                value={customerName}
                                onChange={e => setCustomerName(e.target.value)}
                                className={inputClass}
                                placeholder="e.g., John Doe"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Event Date</label>
                            <input
                                required
                                type="date"
                                value={eventDate}
                                onChange={e => setEventDate(e.target.value)}
                                className={inputClass}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={3}
                                className={inputClass}
                                placeholder="Additional details..."
                            />
                        </div>

                        <div className="mt-8 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-5 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-xl hover:bg-purple-700 shadow-sm shadow-purple-200 transition-colors"
                            >
                                Confirm Out
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
