'use client'

import { useState, useEffect, Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon, TruckIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase'
import { Asset } from '../types'

type Props = {
    open: boolean
    onClose: () => void
    onConfirm: (targetBranch: string, note?: string) => void
    asset: Asset | null
    currentBranch: string
}

type BranchOption = {
    id: string
    name: string
}

export default function TransferAssetModal({ open, onClose, onConfirm, asset, currentBranch }: Props) {
    const [branches, setBranches] = useState<BranchOption[]>([])
    const [selectedBranch, setSelectedBranch] = useState('')
    const [note, setNote] = useState('')
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!open) return

        const fetchBranches = async () => {
            setLoading(true)
            try {
                // Try Supabase first
                const { data, error } = await supabase
                    .from('provider_branches')
                    .select('id, name')
                    .order('name')

                if (error) throw error

                if (data) {
                    setBranches(data.map(b => ({ id: b.name, name: b.name })))
                }
            } catch (err) {
                // Squelch error for now or log simply
                // console.error('Failed to fetch branches') 

                // Fallback
                const stored = localStorage.getItem('provider_branches_snapshot')
                const snap = stored ? JSON.parse(stored) : []
                if (snap && snap.length > 0) {
                    setBranches(snap.map((b: any) => ({ id: b.name, name: b.name })))
                } else {
                    // Only relevant branches
                    setBranches([
                        { id: 'Pasta Fresca Thao Dien', name: 'Pasta Fresca Thao Dien' },
                        { id: 'Pasta Fresca Thanh My Loi', name: 'Pasta Fresca Thanh My Loi' },
                        { id: 'Pasta Fresca Da Lat', name: 'Pasta Fresca Da Lat' }
                    ])
                }
            } finally {
                setLoading(false)
            }
        }

        fetchBranches()
    }, [open])

    const handleConfirm = () => {
        if (!selectedBranch) return
        onConfirm(selectedBranch, note)
        setSelectedBranch('')
        setNote('')
        onClose()
    }

    // Filter out current branch from options
    const availableBranches = branches.filter(b => b.name !== currentBranch)

    return (
        <Transition appear show={open} as={Fragment}>
            <Dialog as="div" className="relative z-[110]" onClose={onClose}>
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
                            <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white text-left align-middle shadow-xl transition-all">

                                {/* Header */}
                                <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
                                    <Dialog.Title as="h3" className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                        <TruckIcon className="w-5 h-5 text-blue-600" />
                                        Transfer Asset
                                    </Dialog.Title>
                                    <button
                                        onClick={onClose}
                                        className="text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        <XMarkIcon className="w-6 h-6" />
                                    </button>
                                </div>

                                <div className="px-6 py-6 space-y-6">
                                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                                        <p className="text-sm text-blue-800">
                                            Transferring <strong>{asset?.name}</strong> from <strong>{currentBranch}</strong>.
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Destination Branch
                                        </label>
                                        <select
                                            value={selectedBranch}
                                            onChange={(e) => setSelectedBranch(e.target.value)}
                                            className="w-full mt-1 border border-slate-300 rounded-lg px-3 h-10 text-slate-900 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                            disabled={loading}
                                        >
                                            <option value="" className="text-slate-500">Select a branch...</option>
                                            {availableBranches.map(b => (
                                                <option key={b.id} value={b.name} className="text-slate-900">
                                                    {b.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Transfer Note <span className="text-slate-400 font-normal">(Optional)</span>
                                        </label>
                                        <textarea
                                            value={note}
                                            onChange={(e) => setNote(e.target.value)}
                                            rows={3}
                                            className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-blue-500 focus:ring-blue-500 sm:text-sm placeholder:text-slate-400"
                                            placeholder="Reason for transfer..."
                                        />
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex justify-end gap-3 transition-colors">
                                    <button
                                        type="button"
                                        className="inline-flex justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white hover:text-slate-800 hover:shadow-sm ring-1 ring-inset ring-slate-300 bg-white"
                                        onClick={onClose}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="inline-flex justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={handleConfirm}
                                        disabled={!selectedBranch}
                                    >
                                        Confirm Transfer
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    )
}
