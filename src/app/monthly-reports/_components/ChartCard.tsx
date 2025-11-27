'use client'

import { useState, useEffect, useMemo } from 'react'
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import type { ChartDataPoint } from '../_data/fetchers'

type Branch = {
    id: string
    name: string
}

type FetchParams = {
    startISO: string
    endISO: string
    branchName: string | null
}

type Props = {
    title: string
    color: string
    branches: Branch[]
    fetchData: (params: FetchParams) => Promise<ChartDataPoint[]>
    formatter?: (val: number) => string
}

export default function ChartCard({ title, color, branches, fetchData, formatter }: Props) {
    const { language } = useSettings()
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<ChartDataPoint[]>([])
    const [total, setTotal] = useState(0)

    // Independent filters
    const [selectedDate, setSelectedDate] = useState(new Date())
    const [selectedBranch, setSelectedBranch] = useState<string>('all')

    const monthYearLabel = useMemo(() => {
        return selectedDate.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-GB', { month: 'long', year: 'numeric' })
    }, [selectedDate, language])

    const handlePrevMonth = () => {
        setSelectedDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
    }

    const handleNextMonth = () => {
        setSelectedDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
    }

    useEffect(() => {
        let active = true
        async function load() {
            setLoading(true)
            try {
                const year = selectedDate.getFullYear()
                const month = selectedDate.getMonth()
                const startDate = new Date(year, month, 1)
                const endDate = new Date(year, month + 1, 0)
                const p = (n: number) => String(n).padStart(2, '0')
                const startISO = `${startDate.getFullYear()}-${p(startDate.getMonth() + 1)}-${p(startDate.getDate())}`
                const endISO = `${endDate.getFullYear()}-${p(endDate.getMonth() + 1)}-${p(endDate.getDate())}`

                const branchName = selectedBranch !== 'all' ? branches.find(b => b.id === selectedBranch)?.name || null : null

                const points = await fetchData({ startISO, endISO, branchName })

                if (active) {
                    // Fill missing days with 0 for smoother chart
                    const filledPoints: ChartDataPoint[] = []
                    const map = new Map(points.map(p => [p.date, p.value]))

                    for (let d = 1; d <= endDate.getDate(); d++) {
                        const dateStr = `${year}-${p(month + 1)}-${p(d)}`
                        filledPoints.push({
                            date: dateStr,
                            value: map.get(dateStr) || 0
                        })
                    }

                    setData(filledPoints)
                    setTotal(points.reduce((sum, p) => sum + p.value, 0))
                }
            } catch (err) {
                console.error(err)
            } finally {
                if (active) setLoading(false)
            }
        }
        load()
        return () => { active = false }
    }, [selectedDate, selectedBranch, branches, fetchData])

    const defaultFormatter = (val: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(val)
    const fmt = formatter || defaultFormatter

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[500px]">
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-800">{title}</h3>
                    <div className="text-xl font-bold text-gray-900">{fmt(total)}</div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Branch Picker */}
                    <select
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        className="h-9 text-sm rounded-lg border-gray-300 text-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                        <option value="all">All Branches</option>
                        {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>

                    {/* Month Picker */}
                    <div className="flex items-center bg-white rounded-lg shadow-sm border border-gray-300 h-9">
                        <button onClick={handlePrevMonth} className="p-1.5 hover:bg-gray-50 rounded-l-lg">
                            <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
                        </button>
                        <span className="px-3 text-sm font-medium text-gray-700 min-w-[100px] text-center">
                            {monthYearLabel}
                        </span>
                        <button onClick={handleNextMonth} className="p-1.5 hover:bg-gray-50 rounded-r-lg">
                            <ChevronRightIcon className="w-4 h-4 text-gray-600" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 relative">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                        <CircularLoader />
                    </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis
                            dataKey="date"
                            tickFormatter={(val) => new Date(val).getDate().toString()}
                            tick={{ fontSize: 11, fill: '#9ca3af' }}
                            axisLine={false}
                            tickLine={false}
                            dy={10}
                        />
                        <YAxis
                            tickFormatter={(val) => (val / 1000000).toFixed(1) + 'M'}
                            tick={{ fontSize: 11, fill: '#9ca3af' }}
                            axisLine={false}
                            tickLine={false}
                            dx={-10}
                        />
                        <Tooltip
                            formatter={(val: number) => [fmt(val), title]}
                            labelFormatter={(label) => new Date(label).toLocaleDateString()}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Line
                            type="monotone"
                            dataKey="value"
                            stroke={color}
                            strokeWidth={3}
                            dot={false}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
