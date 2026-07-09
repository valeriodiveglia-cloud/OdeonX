'use client'

import React from 'react'
import { XMarkIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { InventorySession } from '../../types'
import { useSettings } from '@/contexts/SettingsContext'

interface InventorySessionDetailModalProps {
    open: boolean
    onClose: () => void
    session: InventorySession | null
}

export default function InventorySessionDetailModal({ open, onClose, session }: InventorySessionDetailModalProps) {
    const { language } = useSettings()

    if (!open || !session) return null

    // Calculate stats
    const totalItems = session.items.length
    const discrepancyItems = session.items.filter(i => i.expectedQuantity !== i.countedQuantity)
    const discrepancyCount = discrepancyItems.length
    const matchCount = totalItems - discrepancyCount

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-'
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return dateStr
        const day = String(d.getDate()).padStart(2, '0')
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const year = d.getFullYear()
        return `${day}/${month}/${year}`
    }

    const formattedDate = formatDate(session.date)

    const getConditionLabel = (condition: string) => {
        switch (condition) {
            case 'new': return language === 'vi' ? 'Mới' : 'New'
            case 'good': return language === 'vi' ? 'Tốt' : 'Good'
            case 'fair': return language === 'vi' ? 'Khá' : 'Fair'
            case 'poor': return language === 'vi' ? 'Kém' : 'Poor'
            default: return condition
        }
    }

    const textDict = {
        title: language === 'vi' ? 'Báo cáo kiểm kê' : 'Inventory Report',
        matched: language === 'vi' ? 'Khớp' : 'Matched',
        discrepancies: language === 'vi' ? 'Sai lệch' : 'Discrepancies',
        asset: language === 'vi' ? 'Tài sản' : 'Asset',
        condition: language === 'vi' ? 'Tình trạng' : 'Condition',
        expected: language === 'vi' ? 'Kỳ vọng' : 'Expected',
        counted: language === 'vi' ? 'Đã đếm' : 'Counted',
        diff: language === 'vi' ? 'Chênh lệch' : 'Diff',
        notes: language === 'vi' ? 'Ghi chú' : 'Notes',
        close: language === 'vi' ? 'Đóng báo cáo' : 'Close Report',
        fixedAsset: language === 'vi' ? 'Tài sản cố định' : 'Fixed Asset',
        smallware: language === 'vi' ? 'Công cụ dụng cụ' : 'Smallware',
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] text-slate-700">

                {/* Header */}
                <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                            <span>{textDict.title}: {formattedDate}</span>
                            <div className="flex gap-1.5 items-center">
                                <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-slate-200 text-slate-700 border border-slate-300">
                                    {session.branch}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider border ${session.assetType === 'fixed'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                    }`}>
                                    {session.assetType === 'fixed' ? textDict.fixedAsset : textDict.smallware}
                                </span>
                            </div>
                        </h2>
                        <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                            <span className="flex items-center gap-1 text-emerald-600 font-medium">
                                <CheckCircleIcon className="w-4 h-4 text-emerald-500" /> {matchCount} {textDict.matched}
                            </span>
                            {discrepancyCount > 0 && (
                                <span className="flex items-center gap-1 text-red-600 font-medium">
                                    <ExclamationTriangleIcon className="w-4 h-4 text-red-500" /> {discrepancyCount} {textDict.discrepancies}
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200/60 rounded-lg transition-colors">
                        <XMarkIcon className="w-6 h-6 text-slate-500 hover:text-slate-700" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-0 flex-1 overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                            <tr>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">{textDict.asset}</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">{textDict.condition}</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">{textDict.expected}</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">{textDict.counted}</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">{textDict.diff}</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">{textDict.notes}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {session.items.map((item) => {
                                const diff = item.countedQuantity - item.expectedQuantity
                                const isMatch = diff === 0
                                const rowClass = isMatch ? 'hover:bg-slate-50/40' : 'bg-red-50/30 hover:bg-red-50/50'

                                return (
                                    <tr key={item.assetId} className={`transition-colors ${rowClass}`}>
                                        <td className="p-4">
                                            <div className="font-semibold text-gray-900">{item.assetName}</div>
                                            <div className="text-xs text-slate-500">{item.category}</div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border capitalize ${item.condition === 'new' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                item.condition === 'good' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                    item.condition === 'fair' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                                        'bg-red-50 text-red-700 border-red-200'
                                                }`}>
                                                {getConditionLabel(item.condition)}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center text-slate-600 font-medium">
                                            {item.expectedQuantity}
                                        </td>
                                        <td className="p-4 text-center font-bold text-gray-900">
                                            {item.countedQuantity}
                                        </td>
                                        <td className="p-4 text-center">
                                            {isMatch ? (
                                                <span className="text-slate-400">-</span>
                                            ) : (
                                                <span className={`font-bold ${diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {diff > 0 ? `+${diff}` : diff}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-sm text-slate-600 max-w-xs break-words">
                                            {item.notes || '-'}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm rounded-lg font-medium transition-colors cursor-pointer"
                    >
                        {textDict.close}
                    </button>
                </div>
            </div>
        </div>
    )
}
