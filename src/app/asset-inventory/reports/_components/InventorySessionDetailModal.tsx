'use client'

import React from 'react'
import { XMarkIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { InventorySession, InventorySessionItem } from '../../types'

interface InventorySessionDetailModalProps {
    open: boolean
    onClose: () => void
    session: InventorySession | null
}

export default function InventorySessionDetailModal({ open, onClose, session }: InventorySessionDetailModalProps) {
    if (!open || !session) return null

    // Calculate stats
    const totalItems = session.items.length
    const discrepancyItems = session.items.filter(i => i.expectedQuantity !== i.countedQuantity)
    const discrepancyCount = discrepancyItems.length
    const matchCount = totalItems - discrepancyCount

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 rounded-2xl w-full max-w-4xl shadow-2xl border border-white/10 flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-800/50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            Inventory Report: {new Date(session.date).toLocaleDateString()}
                            <div className="flex gap-1.5 ml-2">
                                <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-slate-700 text-slate-300">
                                    {session.branch}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${session.assetType === 'fixed'
                                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20'
                                    : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/20'
                                    }`}>
                                    {session.assetType === 'fixed' ? 'Fixed Asset' : 'Smallware'}
                                </span>
                            </div>
                        </h2>
                        <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                            <span className="flex items-center gap-1 text-emerald-400">
                                <CheckCircleIcon className="w-4 h-4" /> {matchCount} Matched
                            </span>
                            {discrepancyCount > 0 && (
                                <span className="flex items-center gap-1 text-red-400">
                                    <ExclamationTriangleIcon className="w-4 h-4" /> {discrepancyCount} Discrepancies
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <XMarkIcon className="w-6 h-6 text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-0 flex-1 overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-950 sticky top-0 z-10">
                            <tr>
                                <th className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Asset</th>
                                <th className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider text-center">Condition</th>
                                <th className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider text-center">Expected</th>
                                <th className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider text-center">Counted</th>
                                <th className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider text-center">Diff</th>
                                <th className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {session.items.map((item) => {
                                const diff = item.countedQuantity - item.expectedQuantity
                                const isMatch = diff === 0
                                const rowClass = isMatch ? 'hover:bg-white/[0.02]' : 'bg-red-500/5 hover:bg-red-500/10'

                                return (
                                    <tr key={item.assetId} className={`transition-colors ${rowClass}`}>
                                        <td className="p-4">
                                            <div className="font-medium text-white">{item.assetName}</div>
                                            <div className="text-xs text-slate-500">{item.category}</div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`inline-block px-2 py-1 rounded text-xs capitalize ${item.condition === 'new' ? 'bg-emerald-500/20 text-emerald-400' :
                                                item.condition === 'good' ? 'bg-blue-500/20 text-blue-400' :
                                                    item.condition === 'fair' ? 'bg-yellow-500/20 text-yellow-400' :
                                                        'bg-red-500/20 text-red-400'
                                                }`}>
                                                {item.condition}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center text-slate-400">
                                            {item.expectedQuantity}
                                        </td>
                                        <td className="p-4 text-center font-bold text-white">
                                            {item.countedQuantity}
                                        </td>
                                        <td className="p-4 text-center">
                                            {isMatch ? (
                                                <span className="text-slate-600">-</span>
                                            ) : (
                                                <span className={`font-bold ${diff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {diff > 0 ? `+${diff}` : diff}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-sm text-slate-400 max-w-xs break-words">
                                            {item.notes || '-'}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 bg-slate-900 rounded-b-2xl flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
                    >
                        Close Report
                    </button>
                </div>
            </div>
        </div>
    )
}
