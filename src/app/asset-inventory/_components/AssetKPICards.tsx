'use client'

import { Asset, calculateCurrentValue } from '../types'
import { useMemo } from 'react'

type Props = {
    assets: Asset[]
}

// Reusing StatPill component style from ClosingList page for consistency
function StatPill({ label, value, subtext, color = "blue" }: { label: string; value: string | number; subtext?: string, color?: "blue" | "emerald" | "amber" }) {
    let bgClass = "bg-white border-blue-200 text-gray-900 shadow-sm"
    let labelClass = "text-blue-600"
    if (color === "emerald") {
        bgClass = "bg-white border-emerald-200 text-gray-900 shadow-sm"
        labelClass = "text-emerald-600"
    }
    if (color === "amber") {
        bgClass = "bg-white border-amber-200 text-gray-900 shadow-sm"
        labelClass = "text-amber-600"
    }

    return (
        <div className={`text-left rounded-xl border ${bgClass} px-3 py-2`}>
            <div className={`text-[11px] uppercase tracking-wide opacity-80 mb-1 ${labelClass}`}>{label}</div>
            <div className="flex items-baseline gap-2">
                <div className="text-xl font-semibold tabular-nums">{value}</div>
                {subtext && <div className="text-xs opacity-70">{subtext}</div>}
            </div>
        </div>
    )
}

export default function AssetKPICards({ assets }: Props) {
    const kpi = useMemo(() => {
        let totalPurchase = 0
        let totalCurrent = 0

        assets.forEach(a => {
            const current = calculateCurrentValue(a)
            const qty = a.type === 'fixed' ? 1 : a.quantity

            totalPurchase += a.financials.purchasePrice * qty
            totalCurrent += current * qty
        })

        const loss = totalPurchase > 0 ? ((totalPurchase - totalCurrent) / totalPurchase) * 100 : 0

        return {
            totalPurchase,
            totalCurrent,
            loss
        }
    }, [assets])

    // No currency symbol, just number formatting
    const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n))

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <StatPill
                label="Total Purchase Value"
                value={fmt(kpi.totalPurchase)}
                color="blue"
            />
            <StatPill
                label="Current Depreciated Value"
                value={fmt(kpi.totalCurrent)}
                color="emerald"
            />
            <StatPill
                label="Depreciation Loss"
                value={`${kpi.loss.toFixed(1)}%`}
                subtext="of original value"
                color="amber"
            />
        </div>
    )
}
