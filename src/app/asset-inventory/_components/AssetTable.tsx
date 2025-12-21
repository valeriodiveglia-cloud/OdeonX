'use client'

import { useState, useEffect } from 'react'
import { Asset, calculateCurrentValue, getStatusColor, getConditionColor, getWarrantyStatus, getComputedCondition } from '../types'

function WarrantyBadge({ asset }: { asset: Asset }) {
    const w = getWarrantyStatus(asset)
    if (w.status === 'None') return <span className="text-gray-400 text-xs">-</span>

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${w.color}`}>
            {w.label}
        </span>
    )
}

type Props = {
    assets: Asset[]
    onAssetClick: (asset: Asset) => void
}

// Helper component for Condition Bar
const ConditionBar = ({ asset }: { asset: Asset }) => {
    // Read directly from storage for now to avoid prop drilling, or default to 6
    const [duration, setDuration] = useState(6)
    useEffect(() => {
        const stored = localStorage.getItem('asset_new_duration_months')
        if (stored) setDuration(Number(stored))
    }, [])

    const computedCondition = getComputedCondition(asset, duration)
    const color = getConditionColor(computedCondition)

    const width =
        computedCondition === 'new' ? 'w-full' :
            computedCondition === 'good' ? 'w-3/4' :
                computedCondition === 'fair' ? 'w-1/2' : 'w-1/4'

    return (
        <div className="w-24 bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div className={`h-full rounded-full ${color} ${width}`} />
        </div>
    )
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)

export default function AssetTable({ assets, onAssetClick }: Props) {
    if (assets.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-gray-500">
                No assets found.
            </div>
        )
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-100 text-xs uppercase font-semibold text-slate-500">
                    <tr>
                        <th className="px-6 py-4">Asset Name</th>
                        <th className="px-6 py-4">SKU</th>
                        <th className="px-6 py-4">Category</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Condition</th>
                        <th className="px-6 py-4">Warranty</th>
                        <th className="px-6 py-4 text-center">Qty</th>
                        <th className="px-6 py-4 text-right">Value</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {assets.map((asset) => (
                        <tr
                            key={asset.id}
                            onClick={() => onAssetClick(asset)}
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                            <td className="px-6 py-3 font-medium text-slate-900">{asset.name}</td>
                            <td className="px-6 py-3">{asset.sku}</td>
                            <td className="px-6 py-3">{asset.category}</td>
                            <td className="px-6 py-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(asset.status)}`}>
                                    {asset.status.replace('_', ' ')}
                                </span>
                            </td>
                            <td className="px-6 py-3">
                                <ConditionBar asset={asset} />
                            </td>
                            <td className="px-6 py-3">
                                <WarrantyBadge asset={asset} />
                            </td>
                            <td className={`px-6 py-3 text-center font-medium ${asset.parLevel && (asset.quantity || 0) < asset.parLevel ? 'text-red-600' : 'text-slate-700'}`}>
                                {asset.quantity || 1}
                                {asset.parLevel ? <span className="text-slate-400 font-normal"> / {asset.parLevel}</span> : ''}
                            </td>
                            <td className="px-6 py-3 text-right font-medium text-slate-900">
                                {fmt(calculateCurrentValue(asset) * (asset.type === 'smallware' ? (asset.quantity || 1) : 1))}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
