'use client'

import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Asset, AssetLogEntry, calculateCurrentValue, getConditionColor, getStatusColor } from '../types'
import { MOCK_ASSETS, STORAGE_KEY, LOG_STORAGE_KEY } from '../_data/mockData'
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'
import { Clock, AlertTriangle, CheckCircle2, Package, TrendingUp, History, ArrowRight } from 'lucide-react'

// Helper functions (same as layout)
const loadAssets = (defaults: Asset[]) => {
    if (typeof window === 'undefined') return defaults
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : defaults
}

const loadLogs = () => {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(LOG_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
}

// FORMATTTER
const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)

export default function AssetDashboard() {
    const searchParams = useSearchParams()
    const branchName = searchParams.get('branchName') || 'all'

    const [allAssets, setAllAssets] = useState<Asset[]>([])
    const [assets, setAssets] = useState<Asset[]>([])
    const [logs, setLogs] = useState<AssetLogEntry[]>([])

    useEffect(() => {
        const loaded = loadAssets(MOCK_ASSETS)
        setAllAssets(loaded)
        setLogs(loadLogs())
    }, [])

    // Filter Logic
    useEffect(() => {
        if (branchName && branchName !== 'all') {
            const filtered = allAssets.filter(a => a.branch === branchName)
            setAssets(filtered)
        } else {
            setAssets(allAssets)
        }
    }, [branchName, allAssets])

    // --- COMPUTED DATA (uses filtered 'assets') ---

    const kpis = useMemo(() => {
        const totalCount = assets.reduce((acc, a) => acc + (a.type === 'fixed' ? 1 : a.quantity), 0)

        let totalPurchaseValue = 0
        let totalCurrentValue = 0
        let maintenanceCount = 0
        let expiredWarrantyCount = 0

        assets.forEach(a => {
            const qty = a.type === 'fixed' ? 1 : a.quantity
            totalPurchaseValue += a.financials.purchasePrice * qty
            totalCurrentValue += calculateCurrentValue(a) * qty

            if (a.status === 'maintenance') maintenanceCount++

            // Check warranty
            if (a.financials.warrantyYears && a.financials.purchaseDate) {
                const purchaseDate = new Date(a.financials.purchaseDate)
                const warrantyEnd = new Date(purchaseDate)
                warrantyEnd.setFullYear(purchaseDate.getFullYear() + a.financials.warrantyYears)
                if (new Date() > warrantyEnd) expiredWarrantyCount++
            }
        })

        return {
            totalCount,
            totalPurchaseValue,
            totalCurrentValue,
            maintenanceCount,
            expiredWarrantyCount
        }
    }, [assets])

    // Chart Data: Value by Category
    const categoryData = useMemo(() => {
        const map = new Map<string, number>()
        assets.forEach(a => {
            const val = calculateCurrentValue(a) * (a.type === 'fixed' ? 1 : a.quantity)
            map.set(a.category, (map.get(a.category) || 0) + val)
        })
        return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
    }, [assets])

    // Chart Data: Condition Breakdown
    const conditionData = useMemo(() => {
        const counts = { new: 0, good: 0, fair: 0, poor: 0 }
        assets.forEach(a => {
            if (counts[a.condition] !== undefined) counts[a.condition]++
        })
        return [
            { name: 'New', value: counts.new, color: '#10b981' }, // emerald-500
            { name: 'Good', value: counts.good, color: '#3b82f6' }, // blue-500
            { name: 'Fair', value: counts.fair, color: '#eab308' }, // yellow-500
            { name: 'Poor', value: counts.poor, color: '#ef4444' }, // red-500
        ]
    }, [assets])

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1']

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 text-slate-100">

            <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                        Asset Overview
                    </h1>
                    <p className="text-slate-400 text-sm">Real-time insights on inventory financial health and status.</p>
                </div>
                <Link
                    href={`/asset-inventory/list?branchName=${branchName}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                    <Package size={16} />
                    Manage Assets
                    <ArrowRight size={16} />
                </Link>
            </header>

            {/* TOP KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400"><Package size={24} /></div>
                    <div>
                        <div className="text-sm text-slate-400">Total Assets</div>
                        <div className="text-2xl font-bold">{kpis.totalCount}</div>
                    </div>
                </div>
                <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-emerald-500/20 text-emerald-400"><TrendingUp size={24} /></div>
                    <div>
                        <div className="text-sm text-slate-400">Current Valuation</div>
                        <div className="text-2xl font-bold">{formatCurrency(kpis.totalCurrentValue)}</div>
                        <div className="text-xs text-slate-500">Orig: {formatCurrency(kpis.totalPurchaseValue)}</div>
                    </div>
                </div>
                <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-amber-500/20 text-amber-400"><AlertTriangle size={24} /></div>
                    <div>
                        <div className="text-sm text-slate-400">In Maintenance</div>
                        <div className="text-2xl font-bold">{kpis.maintenanceCount}</div>
                    </div>
                </div>
                <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-slate-500/20 text-slate-400"><Clock size={24} /></div>
                    <div>
                        <div className="text-sm text-slate-400">Warranty Expired</div>
                        <div className="text-2xl font-bold">{kpis.expiredWarrantyCount}</div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* CHART: Value by Category */}
                <div className="col-span-1 lg:col-span-2 bg-slate-900/50 border border-white/10 rounded-xl p-6">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <TrendingUp size={18} className="text-blue-400" />
                        Value Distribution by Category
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={categoryData} layout="vertical" margin={{ left: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                                <XAxis type="number" stroke="#94a3b8" tickFormatter={(val) => `$${val / 1000}k`} />
                                <YAxis dataKey="name" type="category" stroke="#94a3b8" width={120} tick={{ fontSize: 12 }} />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                                    formatter={(val: number) => formatCurrency(val)}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* CHART: Condition */}
                <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-emerald-400" />
                        Asset Condition
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={conditionData}
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {conditionData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                                />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* RECENT ACTIVITY */}
            <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <History size={18} className="text-slate-400" />
                    Recent Activity
                </h3>
                <div className="space-y-4">
                    {logs.length === 0 ? (
                        <div className="text-center text-slate-500 py-8">No recent activity</div>
                    ) : (
                        logs.slice(0, 5).map(log => (
                            <div key={log.id} className="flex items-start gap-4 pb-4 border-b border-white/5 last:border-0 last:pb-0">
                                <div className={`mt-1 w-2 h-2 rounded-full shrink-0
                                    ${log.action === 'CREATE' ? 'bg-emerald-500' :
                                        log.action === 'DELETE' ? 'bg-red-500' :
                                            log.action === 'UPDATE' ? 'bg-blue-500' : 'bg-amber-500'
                                    }`}
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-slate-200">
                                        {log.action.replace('_', ' ')}
                                        {log.assetName && <span className="text-slate-400 font-normal"> - {log.assetName}</span>}
                                    </div>
                                    <div className="text-xs text-slate-500 truncate">{log.details}</div>
                                </div>
                                <div className="text-xs text-slate-500 whitespace-nowrap">
                                    {new Date(log.timestamp).toLocaleDateString()}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

        </div>
    )
}
