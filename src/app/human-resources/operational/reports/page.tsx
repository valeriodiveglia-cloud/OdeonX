'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase_shim'
import {
    ShiftType, MOCK_STAFF,
    getShiftTypes, getRosterData, rosterKey, parseRosterKey,
    formatDate, getMonday, addDays, dayName,
} from '@/lib/hr-operational-data'
import CircularLoader from '@/components/CircularLoader'
import {
    CalendarDays, Clock, Palmtree, Thermometer, Coffee,
    ChevronLeft, ChevronRight, Users, BarChart3
} from 'lucide-react'

type Period = 'day' | 'week' | 'month' | 'year'
type ViewMode = 'staff' | 'daily'

function getDateRange(period: Period, refDate: Date): { start: Date; end: Date } {
    const d = new Date(refDate)
    d.setHours(0, 0, 0, 0)
    switch (period) {
        case 'day':
            return { start: new Date(d), end: new Date(d) }
        case 'week': {
            const monday = getMonday(d)
            return { start: monday, end: addDays(monday, 6) }
        }
        case 'month': {
            const start = new Date(d.getFullYear(), d.getMonth(), 1)
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
            return { start, end }
        }
        case 'year': {
            const start = new Date(d.getFullYear(), 0, 1)
            const end = new Date(d.getFullYear(), 11, 31)
            return { start, end }
        }
    }
}

function navigate(period: Period, refDate: Date, direction: number): Date {
    const d = new Date(refDate)
    switch (period) {
        case 'day': d.setDate(d.getDate() + direction); break
        case 'week': d.setDate(d.getDate() + direction * 7); break
        case 'month': d.setMonth(d.getMonth() + direction); break
        case 'year': d.setFullYear(d.getFullYear() + direction); break
    }
    return d
}

function periodLabel(period: Period, refDate: Date): string {
    switch (period) {
        case 'day':
            return refDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
        case 'week': {
            const monday = getMonday(refDate)
            const sunday = addDays(monday, 6)
            return `${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${sunday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
        }
        case 'month':
            return refDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        case 'year':
            return `${refDate.getFullYear()}`
    }
}

interface Stats {
    totalShifts: number
    totalHours: number
    annualLeave: number
    sickDays: number
    daysOff: number
    byStaff: Record<string, { shifts: number; hours: number; annualLeave: number; sickDays: number; daysOff: number }>
    byDay: Record<string, { staffWorking: number; hours: number; onLeave: number; sick: number; off: number }>
}

export default function ReportsPage() {
    const [loading, setLoading] = useState(true)
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    const [selectedBranch, setSelectedBranch] = useState('')
    const [period, setPeriod] = useState<Period>('week')
    const [refDate, setRefDate] = useState(new Date())
    const [viewMode, setViewMode] = useState<ViewMode>('staff')
    const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([])
    const [roster, setRoster] = useState<Record<string, string>>({})

    useEffect(() => {
        ;(async () => {
            const { data } = await supabase.from('provider_branches').select('id, name').order('name')
            if (data && data.length > 0) {
                setBranches(data)
                setSelectedBranch(data[0].id)
            }
            setLoading(false)
        })()
    }, [])

    useEffect(() => {
        setShiftTypes(getShiftTypes())
        setRoster(getRosterData())
    }, [])

    const stats = useMemo<Stats>(() => {
        const result: Stats = {
            totalShifts: 0, totalHours: 0, annualLeave: 0, sickDays: 0, daysOff: 0,
            byStaff: {}, byDay: {}
        }
        if (!selectedBranch) return result

        const { start, end } = getDateRange(period, refDate)
        let current = new Date(start)

        while (current <= end) {
            const dateStr = formatDate(current)
            const dayStats = { staffWorking: 0, hours: 0, onLeave: 0, sick: 0, off: 0 }

            MOCK_STAFF.forEach(staff => {
                const key = rosterKey(selectedBranch, staff.id, dateStr)
                const stId = roster[key]
                if (!stId) return

                const shift = shiftTypes.find(s => s.id === stId)
                if (!shift) return

                if (!result.byStaff[staff.id]) {
                    result.byStaff[staff.id] = { shifts: 0, hours: 0, annualLeave: 0, sickDays: 0, daysOff: 0 }
                }

                if (shift.type === 'work') {
                    result.totalShifts++
                    result.totalHours += shift.hours
                    result.byStaff[staff.id].shifts++
                    result.byStaff[staff.id].hours += shift.hours
                    dayStats.staffWorking++
                    dayStats.hours += shift.hours
                } else {
                    if (shift.code === 'AL') {
                        result.annualLeave++
                        result.byStaff[staff.id].annualLeave++
                        dayStats.onLeave++
                    } else if (shift.code === 'SD') {
                        result.sickDays++
                        result.byStaff[staff.id].sickDays++
                        dayStats.sick++
                    } else {
                        result.daysOff++
                        result.byStaff[staff.id].daysOff++
                        dayStats.off++
                    }
                }
            })

            result.byDay[dateStr] = dayStats
            current = addDays(current, 1)
        }

        return result
    }, [selectedBranch, roster, shiftTypes, period, refDate])

    const prev = () => setRefDate(navigate(period, refDate, -1))
    const next = () => setRefDate(navigate(period, refDate, 1))
    const goToday = () => setRefDate(new Date())

    if (loading) {
        return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><CircularLoader /></div>
    }

    const summaryCards = [
        { label: 'Working Shifts', value: stats.totalShifts, icon: CalendarDays, color: 'text-blue-400', bg: 'bg-blue-500/10' },
        { label: 'Total Hours', value: `${stats.totalHours}h`, icon: Clock, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        { label: 'Annual Leave', value: stats.annualLeave, icon: Palmtree, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        { label: 'Sick Days', value: stats.sickDays, icon: Thermometer, color: 'text-red-400', bg: 'bg-red-500/10' },
        { label: 'Days Off', value: stats.daysOff, icon: Coffee, color: 'text-gray-400', bg: 'bg-gray-500/10' },
        { label: 'Avg Hrs/Staff', value: `${MOCK_STAFF.length > 0 ? Math.round(stats.totalHours / MOCK_STAFF.length * 10) / 10 : 0}h`, icon: BarChart3, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    ]

    const sortedDays = Object.entries(stats.byDay).sort(([a], [b]) => a.localeCompare(b))

    return (
        <div className="min-h-screen bg-slate-900 text-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
                    <p className="text-sm text-slate-400 mt-1">Shift hours, attendance and leave overview.</p>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                    {/* Branch */}
                    <select
                        value={selectedBranch}
                        onChange={e => setSelectedBranch(e.target.value)}
                        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                    >
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>

                    {/* Period tabs */}
                    <div className="flex rounded-lg border border-white/10 overflow-hidden">
                        {(['day', 'week', 'month', 'year'] as Period[]).map(p => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`px-4 py-2 text-xs font-medium capitalize transition
                                    ${period === p ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-white/5'}`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>

                    {/* Date navigator */}
                    <div className="flex items-center gap-2 sm:ml-auto">
                        <button onClick={prev} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"><ChevronLeft className="w-5 h-5" /></button>
                        <span className="text-sm font-medium text-white min-w-[180px] text-center">{periodLabel(period, refDate)}</span>
                        <button onClick={next} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"><ChevronRight className="w-5 h-5" /></button>
                        <button onClick={goToday} className="ml-2 px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white font-medium">Today</button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                    {summaryCards.map(c => (
                        <div key={c.label} className="rounded-xl bg-white shadow-sm p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <c.icon className={`w-4 h-4 ${c.color}`} />
                                <span className="text-xs text-gray-500">{c.label}</span>
                            </div>
                            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                        </div>
                    ))}
                </div>

                {/* View mode tabs */}
                <div className="flex items-center gap-2 mb-4">
                    <button
                        onClick={() => setViewMode('staff')} 
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition
                            ${viewMode === 'staff' ? 'bg-white text-gray-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}
                    >
                        <Users className="w-4 h-4" /> By Staff
                    </button>
                    <button
                        onClick={() => setViewMode('daily')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition
                            ${viewMode === 'daily' ? 'bg-white text-gray-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}
                    >
                        <CalendarDays className="w-4 h-4" /> By Day
                    </button>
                </div>

                {/* Table */}
                <div className="rounded-2xl bg-white shadow-md overflow-hidden">
                    {viewMode === 'staff' ? (
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">#</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Staff</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Role</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Shifts</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Hours</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Avg Hrs/Day</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Annual Leave</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Sick Days</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Days Off</th>
                                </tr>
                            </thead>
                            <tbody>
                                {MOCK_STAFF.map((staff, idx) => {
                                    const s = stats.byStaff[staff.id] || { shifts: 0, hours: 0, annualLeave: 0, sickDays: 0, daysOff: 0 }
                                    const avgHrs = s.shifts > 0 ? Math.round(s.hours / s.shifts * 10) / 10 : 0
                                    return (
                                        <tr key={staff.id} className={`border-t border-gray-100 ${idx % 2 === 0 ? 'bg-gray-50/50' : ''}`}>
                                            <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                                        {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                    </div>
                                                    <span className="text-sm font-medium text-gray-900">{staff.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500">{staff.role}</td>
                                            <td className="px-4 py-3 text-center text-sm font-semibold text-blue-600">{s.shifts}</td>
                                            <td className="px-4 py-3 text-center text-sm font-semibold text-emerald-600">{s.hours}h</td>
                                            <td className="px-4 py-3 text-center text-sm text-gray-600">{avgHrs}h</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.annualLeave > 0 ? 'bg-amber-100 text-amber-700' : 'text-gray-400'}`}>
                                                    {s.annualLeave}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.sickDays > 0 ? 'bg-red-100 text-red-700' : 'text-gray-400'}`}>
                                                    {s.sickDays}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center text-sm text-gray-500">{s.daysOff}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-gray-50 border-t border-gray-200">
                                    <td colSpan={3} className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">Totals</td>
                                    <td className="px-4 py-3 text-center text-sm font-bold text-blue-600">{stats.totalShifts}</td>
                                    <td className="px-4 py-3 text-center text-sm font-bold text-emerald-600">{stats.totalHours}h</td>
                                    <td className="px-4 py-3 text-center text-sm text-gray-400">—</td>
                                    <td className="px-4 py-3 text-center text-sm font-bold text-amber-600">{stats.annualLeave}</td>
                                    <td className="px-4 py-3 text-center text-sm font-bold text-red-600">{stats.sickDays}</td>
                                    <td className="px-4 py-3 text-center text-sm font-bold text-gray-700">{stats.daysOff}</td>
                                </tr>
                            </tfoot>
                        </table>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Date</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Day</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Staff Working</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Total Hours</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">On Leave</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Sick</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">Off</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedDays.map(([dateStr, d], idx) => {
                                    const dt = new Date(dateStr + 'T00:00:00')
                                    const isToday = dateStr === formatDate(new Date())
                                    return (
                                        <tr key={dateStr} className={`border-t border-gray-100 ${isToday ? 'bg-blue-50' : idx % 2 === 0 ? 'bg-gray-50/50' : ''}`}>
                                            <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                                                {dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                {isToday && <span className="ml-2 text-xs text-blue-600 font-normal">(today)</span>}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500">{dayName(dt)}</td>
                                            <td className="px-4 py-3 text-center text-sm font-semibold text-blue-600">{d.staffWorking}</td>
                                            <td className="px-4 py-3 text-center text-sm font-semibold text-emerald-600">{d.hours}h</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`text-sm ${d.onLeave > 0 ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>{d.onLeave}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`text-sm ${d.sick > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{d.sick}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center text-sm text-gray-500">{d.off}</td>
                                        </tr>
                                    )
                                })}
                                {sortedDays.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-12 text-center text-gray-400">No data for the selected period.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}
