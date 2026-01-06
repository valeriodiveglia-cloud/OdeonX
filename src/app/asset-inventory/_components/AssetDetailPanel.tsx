'use client'

import { XMarkIcon, TruckIcon, WrenchScrewdriverIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Asset, calculateCurrentValue, getStatusColor, getConditionColor, getWarrantyStatus, getComputedCondition } from '../types'
import { getAssetSignedUrl } from '@/lib/storage'
import { useState, useEffect } from 'react'

type Props = {
    asset: Asset | null
    onClose: () => void
    onEdit: () => void
    onDelete: (id: string) => void
    onTransfer: (asset: Asset) => void
    onCatering: (asset: Asset) => void
}

export default function AssetDetailPanel({ asset, onClose, onEdit, onDelete, onTransfer, onCatering }: Props) {
    const [duration, setDuration] = useState(6)

    useEffect(() => {
        const stored = localStorage.getItem('asset_new_duration_months')
        if (stored) setDuration(Number(stored))
    }, [])

    const [imageUrl, setImageUrl] = useState<string | null>(null)

    useEffect(() => {
        if (asset?.images?.[0]) {
            getAssetSignedUrl(asset.images[0]).then(setImageUrl).catch(console.error)
        } else {
            setImageUrl(null)
        }
    }, [asset])

    if (!asset) return null

    // No currency symbols
    const formatMoney = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n))
    const formatDate = (dateString: string) => {
        if (!dateString) return '-'
        const date = new Date(dateString)
        const day = date.getDate().toString().padStart(2, '0')
        const month = (date.getMonth() + 1).toString().padStart(2, '0')
        const year = date.getFullYear()
        return `${day}/${month}/${year}`
    }

    const currentValue = calculateCurrentValue(asset)
    const originalValue = asset.financials.purchasePrice
    const depreciationPct = originalValue > 0 ? ((originalValue - currentValue) / originalValue) * 100 : 0
    const computedCondition = getComputedCondition(asset, duration)

    return (
        <div className="fixed inset-0 z-[100] overflow-hidden">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

            <div className="absolute inset-y-0 right-0 flex max-w-full pl-10 pointer-events-none">
                <div className="w-screen max-w-md bg-white text-slate-900 shadow-xl pointer-events-auto flex flex-col h-full transform transition-transform duration-300 ease-in-out">

                    {/* Header */}
                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-start justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">{asset.name}</h2>
                            <p className="text-sm text-slate-500 font-mono mt-1">{asset.sku}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={onEdit} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors" title="Edit Asset">
                                <PencilSquareIcon className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => {
                                    if (confirm('Are you sure you want to delete this asset?')) {
                                        onDelete(asset.id)
                                    }
                                }}
                                className="p-2 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                                title="Delete Asset"
                            >
                                <TrashIcon className="w-5 h-5" />
                            </button>
                            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-8">

                        {imageUrl && (
                            <div className="w-full h-56 bg-slate-100 rounded-2xl overflow-hidden shadow-sm border border-slate-200">
                                <img src={imageUrl} alt={asset.name} className="w-full h-full object-cover" />
                            </div>
                        )}

                        {/* Status Section */}
                        <div className="flex items-center gap-4">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ring-1 ring-inset ${getStatusColor(asset.status)} capitalize`}>
                                {asset.status.replaceAll('_', ' ')}
                            </span>
                            <div className="h-4 w-px bg-slate-300" />
                            <div className="flex items-center gap-2">
                                <div className={`w-2.5 h-2.5 rounded-full ${getConditionColor(computedCondition)}`} />
                                <span className="text-sm text-slate-600 capitalize">{computedCondition} Condition</span>
                            </div>
                        </div>

                        {/* Financial Card */}
                        <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3 opacity-10">
                                <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05 1.18 1.91 2.53 1.91 1.29 0 2.13-.81 2.13-1.88 0-1.09-.86-1.63-2.61-2.06-1.3-.33-2.92-.86-2.92-2.96 0-1.81 1.34-2.92 2.97-3.24V4h2.67v1.94c1.55.35 2.81 1.41 2.98 3.14h-1.95c-.17-.96-1.12-1.6-2.31-1.6-1.25 0-2.03.86-2.03 1.84 0 1.12.98 1.63 2.76 2.06 1.36.33 2.82.91 2.82 2.72 0 1.94-1.35 2.99-3.06 3.29z" /></svg>
                            </div>

                            <p className="text-blue-200 text-sm font-medium mb-1">Current Book Value</p>
                            <h3 className="text-3xl font-bold mb-4">{formatMoney(currentValue)}</h3>

                            <div className="grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
                                <div>
                                    <p className="text-slate-400 text-xs uppercase tracking-wide">Purchase Price</p>
                                    <p className="font-semibold">{formatMoney(originalValue)}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs uppercase tracking-wide">Depreciation</p>
                                    <p className="font-semibold text-red-300">-{depreciationPct.toFixed(1)}%</p>
                                </div>
                            </div>
                        </div>

                        {/* Details Grid */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-100 pb-2">Asset Details</h4>
                            <div className="grid grid-cols-2 gap-y-4 text-sm">
                                <div>
                                    <p className="text-slate-500">Category</p>
                                    <p className="font-medium text-slate-900">{asset.category}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500">Type</p>
                                    <p className="font-medium text-slate-900 capitalize">{asset.type}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500">Branch</p>
                                    <p className="font-medium text-slate-900">{asset.branch}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500">Location</p>
                                    <p className="font-medium text-slate-900">{asset.location}</p>
                                </div>
                                {asset.status === 'out_for_catering' && asset.cateringEvent && (
                                    <div className="col-span-2 bg-purple-50 p-3 rounded-lg border border-purple-100">
                                        <p className="text-purple-900 font-medium flex items-center gap-2">
                                            <TruckIcon className="w-4 h-4" />
                                            Out for Catering
                                        </p>
                                        <div className="mt-2 text-sm text-slate-700 space-y-1">
                                            <p><span className="text-slate-500">Event:</span> {asset.cateringEvent.eventName}</p>
                                            {asset.cateringEvent.expectedReturnDate && (
                                                <p><span className="text-slate-500">Return:</span> {formatDate(asset.cateringEvent.expectedReturnDate)}</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {asset.serialNumber && (
                                    <div className="col-span-2">
                                        <p className="text-slate-500">Serial Number</p>
                                        <p className="font-mono bg-slate-100 px-2 py-1 rounded inline-block text-slate-800">{asset.serialNumber}</p>
                                    </div>
                                )}
                                {asset.type === 'smallware' && (
                                    <>
                                        <div>
                                            <p className="text-slate-500">Quantity</p>
                                            <p className="font-medium text-slate-900">{asset.quantity}</p>
                                        </div>
                                        <div>
                                            <p className="text-slate-500">Par Level</p>
                                            <p className="font-medium text-slate-900">{asset.parLevel}</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-100 pb-2">Purchase Info</h4>
                            <div className="grid grid-cols-2 gap-y-4 text-sm">
                                <div>
                                    <p className="text-slate-500">Bought On</p>
                                    <p className="font-medium text-slate-900">{formatDate(asset.financials.purchaseDate)}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500">Useful Life</p>
                                    <p className="font-medium text-slate-900">{asset.financials.usefulLifeYears} Years</p>
                                </div>
                                {asset.financials.warrantyYears && asset.financials.warrantyYears > 0 && (
                                    <div className="col-span-2 border-t border-slate-100 pt-3 mt-1">
                                        <p className="text-slate-500 mb-1">Warranty</p>
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium text-slate-900">{asset.financials.warrantyYears} Years</p>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ring-1 ring-inset ${getWarrantyStatus(asset).color}`}>
                                                {getWarrantyStatus(asset).label}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col gap-3">
                        {asset.status === 'out_for_catering' ? (
                            <button
                                onClick={() => onCatering(asset!)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 font-medium hover:bg-purple-100 transition-colors shadow-sm"
                            >
                                <TruckIcon className="w-5 h-5" />
                                Return from Catering
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={() => onTransfer(asset!)}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-blue-200 bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
                                >
                                    <TruckIcon className="w-5 h-5" />
                                    Transfer Asset
                                </button>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => onCatering(asset!)}
                                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 font-medium hover:bg-purple-100 transition-colors"
                                    >
                                        <TruckIcon className="w-5 h-5" />
                                        Catering
                                    </button>
                                    <button
                                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 font-medium hover:bg-amber-100 transition-colors"
                                    >
                                        <WrenchScrewdriverIcon className="w-5 h-5" />
                                        Maintenance
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
