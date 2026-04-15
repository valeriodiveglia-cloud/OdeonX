'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase_shim'
import {
    ShiftType, MOCK_STAFF,
    getShiftTypes, getRosterData, saveRosterData, rosterKey,
    formatDate, getMonday, addDays, formatWeekRange, dayName,
    generateMockRoster, getStaffCrossBranchShifts, shiftsOverlap,
} from '@/lib/hr-operational-data'
import CircularLoader from '@/components/CircularLoader'
import { ChevronLeft, ChevronRight, CalendarDays, X, Trash2, AlertTriangle, MapPin, Globe, User, Clock } from 'lucide-react'

export default function RosterPage() {
    const [loading, setLoading] = useState(true)
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    const [selectedBranch, setSelectedBranch] = useState('')
    const [weekStart, setWeekStart] = useState(getMonday(new Date()))
    const [roster, setRoster] = useState<Record<string, string>>({})
    const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([])
    const [editingCell, setEditingCell] = useState<{ staffId: string; date: string; staffName: string } | null>(null)
    const [staffDetailId, setStaffDetailId] = useState<string | null>(null)
    const [dayDetailDate, setDayDetailDate] = useState<string | null>(null)
    const modalRef = useRef<HTMLDivElement>(null)

    // Load branches
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

    // Load shift types & roster whenever branch or week changes
    useEffect(() => {
        if (!selectedBranch || branches.length === 0) return
        const types = getShiftTypes()
        setShiftTypes(types)

        // Clear stale mock data when generator version changes
        const MOCK_VERSION = 'v7-offdays-global-split-days'
        const versionKey = 'hr_operational_roster_version'
        if (typeof window !== 'undefined' && localStorage.getItem(versionKey) !== MOCK_VERSION) {
            localStorage.removeItem('hr_operational_roster')
            localStorage.removeItem('hr_operational_shift_types')
            localStorage.setItem(versionKey, MOCK_VERSION)
        }

        const saved = getRosterData()
        // Generate mock data for ALL branches (not just selected) so cross-branch views work
        let merged = { ...saved }
        let anyGenerated = false
        const allBranchIds = branches.map(b => b.id)
        branches.forEach((branch) => {
            const weekKey = rosterKey(branch.id, 'staff-1', formatDate(weekStart))
            if (!merged[weekKey]) {
                const mock = generateMockRoster(branch.id, weekStart, allBranchIds)
                merged = { ...merged, ...mock }
                anyGenerated = true
            }
        })
        if (anyGenerated) {
            saveRosterData(merged)
        }
        setRoster(merged)
    }, [selectedBranch, weekStart, branches])

    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const todayStr = formatDate(new Date())

    const prevWeek = () => setWeekStart(addDays(weekStart, -7))
    const nextWeek = () => setWeekStart(addDays(weekStart, 7))
    const goToday = () => setWeekStart(getMonday(new Date()))

    const getCellShift = useCallback((staffId: string, date: string): ShiftType | null => {
        const key = rosterKey(selectedBranch, staffId, date)
        const stId = roster[key]
        if (!stId) return null
        return shiftTypes.find(s => s.id === stId) || null
    }, [selectedBranch, roster, shiftTypes])

    // Strip common prefix from branch names (e.g. "Pasta Fresca Thanh My Loi" → "Thanh My Loi")
    const commonPrefix = (() => {
        if (branches.length < 2) return ''
        const names = branches.map(b => b.name)
        let prefix = names[0]
        for (let i = 1; i < names.length; i++) {
            while (!names[i].startsWith(prefix)) {
                prefix = prefix.slice(0, -1)
                if (!prefix) return ''
            }
        }
        // Trim trailing space so we get clean location names
        return prefix.replace(/\s+$/, '') + ' '
    })()

    const shortBranchName = useCallback((name: string) => {
        if (commonPrefix && name.startsWith(commonPrefix)) {
            return name.slice(commonPrefix.length)
        }
        return name
    }, [commonPrefix])

    const getBranchName = useCallback((id: string) => {
        const full = branches.find(b => b.id === id)?.name || id
        return shortBranchName(full)
    }, [branches, shortBranchName])

    const getCrossBranchShifts = useCallback((staffId: string, date: string) => {
        return getStaffCrossBranchShifts(roster, staffId, date, selectedBranch)
    }, [roster, selectedBranch])

    const hasConflict = useCallback((candidate: ShiftType, staffId: string, date: string): { conflict: boolean; branchName: string; shiftName: string } => {
        const crossShifts = getCrossBranchShifts(staffId, date)
        for (const cs of crossShifts) {
            const otherShift = shiftTypes.find(s => s.id === cs.shiftTypeId)
            if (otherShift && shiftsOverlap(candidate, otherShift)) {
                return { conflict: true, branchName: getBranchName(cs.branchId), shiftName: otherShift.name }
            }
        }
        return { conflict: false, branchName: '', shiftName: '' }
    }, [getCrossBranchShifts, shiftTypes, getBranchName])

    const assignShift = (staffId: string, date: string, shiftTypeId: string) => {
        const shiftType = shiftTypes.find(s => s.id === shiftTypeId)
        if (shiftType) {
            const check = hasConflict(shiftType, staffId, date)
            if (check.conflict) return // blocked by conflict
        }
        const newRoster = { ...roster }

        // If the shift is global (Day Off, Leave, etc.), apply to ALL branches
        if (shiftType?.globalAcrossBranches) {
            branches.forEach(b => {
                const key = rosterKey(b.id, staffId, date)
                newRoster[key] = shiftTypeId
            })
        } else {
            const key = rosterKey(selectedBranch, staffId, date)
            if (newRoster[key] === shiftTypeId) {
                delete newRoster[key]
            } else {
                newRoster[key] = shiftTypeId
            }
        }

        setRoster(newRoster)
        saveRosterData(newRoster)
        setEditingCell(null)
    }

    const clearShift = (staffId: string, date: string) => {
        const key = rosterKey(selectedBranch, staffId, date)
        const currentShiftId = roster[key]
        const currentShift = currentShiftId ? shiftTypes.find(s => s.id === currentShiftId) : null
        const newRoster = { ...roster }

        // If the shift was global, clear from ALL branches
        if (currentShift?.globalAcrossBranches) {
            branches.forEach(b => {
                delete newRoster[rosterKey(b.id, staffId, date)]
            })
        } else {
            delete newRoster[key]
        }

        setRoster(newRoster)
        saveRosterData(newRoster)
        setEditingCell(null)
    }

    const getWeeklyHours = (staffId: string): number => {
        return weekDays.reduce((t, day) => {
            const s = getCellShift(staffId, formatDate(day))
            return t + (s?.hours || 0)
        }, 0)
    }

    const getStaffWorkingCount = (date: string): number => {
        return MOCK_STAFF.filter(s => {
            const sh = getCellShift(s.id, date)
            return sh && sh.type === 'work'
        }).length
    }

    const getDayTotalHours = (date: string): number => {
        return MOCK_STAFF.reduce((t, s) => {
            const sh = getCellShift(s.id, date)
            return t + (sh?.hours || 0)
        }, 0)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
                <CircularLoader />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-900 max-w-none mx-auto p-4 text-gray-100">
            {/* Header */}
            <div className="mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Branch selector */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-blue-200 uppercase tracking-wider font-medium">Branch</label>
                        <select
                            value={selectedBranch}
                            onChange={e => setSelectedBranch(e.target.value)}
                            className="bg-blue-600/15 border border-blue-400/30 rounded-lg px-3 py-1.5 text-sm text-blue-100 focus:ring-blue-500 focus:border-blue-500"
                        >
                            {branches.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Week navigation */}
                    <div className="flex items-center gap-2 sm:ml-auto">
                        <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-white/10 text-blue-200 hover:text-white transition">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="text-sm font-semibold text-white min-w-[180px] text-center">
                            {formatWeekRange(weekStart)}
                        </div>
                        <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-white/10 text-blue-200 hover:text-white transition">
                            <ChevronRight className="w-5 h-5" />
                        </button>
                        <button onClick={goToday} className="ml-2 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition">
                            Today
                        </button>
                    </div>
                </div>
            </div>

            {/* Divider */}
            <div className="border-t border-blue-400/20 mb-4"></div>

            {/* Grid in white card */}
            <div className="bg-white rounded-2xl shadow overflow-x-auto">
                <table className="w-full border-collapse min-w-[800px]">
                    <thead>
                        <tr>
                            <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 min-w-[180px] rounded-tl-2xl">
                                Staff
                            </th>
                            {weekDays.map(day => {
                                const ds = formatDate(day)
                                const isToday = ds === todayStr
                                return (
                                    <th
                                        key={ds}
                                        className={`px-2 py-3 text-center border-b border-gray-200 min-w-[100px] cursor-pointer group/day transition-colors
                                            ${isToday ? 'bg-blue-50 hover:bg-blue-100/70' : 'bg-gray-50 hover:bg-gray-100'}`}
                                        onClick={() => setDayDetailDate(ds)}
                                    >
                                        <div className={`text-xs uppercase tracking-wider ${isToday ? 'text-blue-600' : 'text-gray-500'} group-hover/day:text-blue-600 transition-colors`}>
                                            {dayName(day)}
                                        </div>
                                        <div className={`text-lg font-bold mt-0.5 ${isToday ? 'text-blue-700' : 'text-gray-800'} group-hover/day:text-blue-700 transition-colors`}>
                                            {day.getDate()}
                                        </div>
                                        <div className="text-[9px] text-gray-400 opacity-0 group-hover/day:opacity-100 transition-opacity mt-0.5 flex items-center justify-center gap-0.5">
                                            <Clock className="w-2.5 h-2.5" /> Timeline
                                        </div>
                                    </th>
                                )
                            })}
                            <th className="bg-gray-50 px-3 py-3 text-center border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 rounded-tr-2xl min-w-[60px]">
                                Hours
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {MOCK_STAFF.map((staff, idx) => {
                            const weekHours = getWeeklyHours(staff.id)
                            return (
                                <tr key={staff.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                                    {/* Staff name cell */}
                                    <td className="sticky left-0 z-10 px-4 py-2 border-b border-gray-100" style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                                        <div
                                            className="flex items-center gap-3 cursor-pointer group"
                                            onClick={(e) => { e.stopPropagation(); setStaffDetailId(staff.id) }}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                                                {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium text-gray-900 leading-tight group-hover:text-blue-600 group-hover:underline transition-colors">{staff.name}</div>
                                                <div className="text-xs text-gray-400">{staff.role}</div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Day cells */}
                                    {weekDays.map(day => {
                                        const ds = formatDate(day)
                                        const shift = getCellShift(staff.id, ds)
                                        const isToday = ds === todayStr
                                        // Only show cross-branch info if staff HAS a shift in current branch
                                        const crossShifts = shift ? getCrossBranchShifts(staff.id, ds) : []

                                        return (
                                            <td
                                                key={ds}
                                                className={`px-1 py-1.5 border-b border-gray-100 text-center cursor-pointer transition-colors
                                                    ${isToday ? 'bg-blue-50/50' : ''}
                                                    hover:bg-blue-50`}
                                                onClick={() => setEditingCell({ staffId: staff.id, date: ds, staffName: staff.name })}
                                            >
                                                {shift ? (
                                                    <div
                                                        className="inline-flex flex-col items-center rounded-lg px-2.5 py-1.5 min-w-[64px]"
                                                        style={{
                                                            backgroundColor: shift.color + '15',
                                                            border: `1px solid ${shift.color}30`,
                                                        }}
                                                    >
                                                        <span className="text-xs font-bold" style={{ color: shift.color }}>
                                                            {shift.code}
                                                        </span>
                                                        {shift.type === 'work' && shift.startTime && (
                                                            <span className="text-[10px] text-gray-400 mt-0.5">
                                                                {shift.startTime}–{shift.endTime}
                                                            </span>
                                                        )}
                                                        {shift.type === 'leave' && (
                                                            <span className="text-[10px] mt-0.5" style={{ color: shift.color + 'BB' }}>
                                                                {shift.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="inline-flex items-center justify-center rounded-lg border border-dashed border-gray-200 text-gray-300 hover:border-gray-300 hover:text-gray-400 transition min-w-[64px] py-3 text-lg">
                                                        +
                                                    </div>
                                                )}
                                                {/* Cross-branch indicator — only when this cell HAS a shift */}
                                                {crossShifts.length > 0 && (
                                                    <div className="mt-0.5">
                                                        {crossShifts.map((cs, i) => {
                                                            const otherShift = shiftTypes.find(s => s.id === cs.shiftTypeId)
                                                            return (
                                                                <div key={i} className="flex items-center justify-center gap-0.5 text-[9px] text-amber-600/80">
                                                                    <MapPin className="w-2.5 h-2.5" />
                                                                    <span>{getBranchName(cs.branchId).split(' ').slice(0, 2).join(' ')}: {otherShift?.code}</span>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </td>
                                        )
                                    })}

                                    {/* Weekly hours */}
                                    <td className="px-3 py-2 border-b border-gray-100 text-center">
                                        <span className={`text-sm font-semibold ${weekHours > 44 ? 'text-red-500' : weekHours >= 40 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                            {weekHours}h
                                        </span>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>

                    {/* Summary row */}
                    <tfoot>
                        <tr className="bg-gray-50">
                            <td className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-xs uppercase tracking-wider text-gray-500 font-semibold rounded-bl-2xl">
                                Totals
                            </td>
                            {weekDays.map(day => {
                                const ds = formatDate(day)
                                const count = getStaffWorkingCount(ds)
                                const hours = getDayTotalHours(ds)
                                return (
                                    <td key={ds} className={`px-2 py-3 text-center ${ds === todayStr ? 'bg-blue-50/50' : ''}`}>
                                        <div className="text-sm font-semibold text-gray-800">{count} staff</div>
                                        <div className="text-xs text-gray-400">{hours}h</div>
                                    </td>
                                )
                            })}
                            <td className="px-3 py-3 text-center rounded-br-2xl">
                                <div className="text-sm font-bold text-gray-800">
                                    {MOCK_STAFF.reduce((t, s) => t + getWeeklyHours(s.id), 0)}h
                                </div>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Shift legend */}
            <div className="mt-4">
                <div className="flex flex-wrap gap-3">
                    {shiftTypes.map(st => (
                        <div key={st.id} className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: st.color }} />
                            <span className="text-xs text-blue-200">{st.code} – {st.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Assignment Modal */}
            {editingCell && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditingCell(null)}>
                    <div
                        ref={modalRef}
                        className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md p-6"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">Assign Shift</h3>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    {editingCell.staffName} — {new Date(editingCell.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                                </p>
                            </div>
                            <button onClick={() => setEditingCell(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Cross-branch info banner */}
                        {(() => {
                            const cross = getCrossBranchShifts(editingCell.staffId, editingCell.date)
                            if (cross.length === 0) return null
                            return (
                                <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-xs font-medium text-amber-700">Working in another branch</p>
                                            {cross.map((cs, i) => {
                                                const otherShift = shiftTypes.find(s => s.id === cs.shiftTypeId)
                                                return (
                                                    <p key={i} className="text-xs text-amber-600 mt-0.5">
                                                        {getBranchName(cs.branchId)}: {otherShift?.name}
                                                        {otherShift?.type === 'work' && otherShift?.startTime ? ` (${otherShift.startTime}–${otherShift.endTime})` : ''}
                                                    </p>
                                                )
                                            })}
                                            <p className="text-[10px] text-amber-500 mt-1">Overlapping shifts will be disabled</p>
                                        </div>
                                    </div>
                                </div>
                            )
                        })()}

                        {/* Work shifts */}
                        <div className="mb-3">
                            <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Work Shifts</p>
                            <div className="grid grid-cols-2 gap-2">
                                {shiftTypes.filter(s => s.type === 'work').map(st => {
                                    const current = getCellShift(editingCell.staffId, editingCell.date)
                                    const isSelected = current?.id === st.id
                                    const conflictInfo = hasConflict(st, editingCell.staffId, editingCell.date)
                                    const isConflicted = conflictInfo.conflict
                                    return (
                                        <button
                                            key={st.id}
                                            onClick={() => !isConflicted && assignShift(editingCell.staffId, editingCell.date, st.id)}
                                            disabled={isConflicted}
                                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left
                                                ${isConflicted
                                                    ? 'border-red-200 bg-red-50 opacity-50 cursor-not-allowed'
                                                    : isSelected
                                                        ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-500/50'
                                                        : 'border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300'}`}
                                        >
                                            <div className="w-4 h-4 rounded-md shrink-0" style={{ backgroundColor: isConflicted ? '#9CA3AF' : st.color }} />
                                            <div className="min-w-0">
                                                <div className={`text-sm font-medium ${isConflicted ? 'text-gray-400' : 'text-gray-900'}`}>{st.name}</div>
                                                <div className="text-xs text-gray-500">{st.startTime}–{st.endTime} · {st.hours}h</div>
                                                {isConflicted && (
                                                    <div className="text-[10px] text-red-500 mt-0.5 flex items-center gap-1">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Conflicts with {conflictInfo.branchName}
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Leave types */}
                        <div className="mb-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Leave Types</p>
                            <div className="grid grid-cols-3 gap-2">
                                {shiftTypes.filter(s => s.type === 'leave').map(st => {
                                    const current = getCellShift(editingCell.staffId, editingCell.date)
                                    const isSelected = current?.id === st.id
                                    return (
                                        <button
                                            key={st.id}
                                            onClick={() => assignShift(editingCell.staffId, editingCell.date, st.id)}
                                            className={`flex flex-col items-center p-3 rounded-xl border transition-all
                                                ${isSelected
                                                    ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-500/50'
                                                    : 'border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300'}`}
                                        >
                                            <div className="w-3 h-3 rounded-full mb-1" style={{ backgroundColor: st.color }} />
                                            <span className="text-xs font-medium text-gray-700">{st.name}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Clear button */}
                        {getCellShift(editingCell.staffId, editingCell.date) && (
                            <button
                                onClick={() => clearShift(editingCell.staffId, editingCell.date)}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition text-sm"
                            >
                                <Trash2 className="w-4 h-4" />
                                Clear Assignment
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Staff Detail Modal */}
            {staffDetailId && (() => {
                const staff = MOCK_STAFF.find(s => s.id === staffDetailId)
                if (!staff) return null

                // Gather all shifts for this staff across all branches for current week
                const branchShiftData = branches.map(branch => {
                    const days = weekDays.map(day => {
                        const ds = formatDate(day)
                        const key = rosterKey(branch.id, staff.id, ds)
                        const shiftId = roster[key]
                        const shift = shiftId ? shiftTypes.find(s => s.id === shiftId) : null
                        return { date: ds, day, shift }
                    })
                    const totalHours = days.reduce((t, d) => t + (d.shift?.hours || 0), 0)
                    const hasAnyShift = days.some(d => d.shift !== null && d.shift !== undefined)
                    return { branch, days, totalHours, hasAnyShift }
                })

                // Only show branches where staff has at least one shift
                const activeBranches = branchShiftData.filter(b => b.hasAnyShift)
                const totalWeekHours = activeBranches.reduce((t, b) => t + b.totalHours, 0)
                const workDaysCount = weekDays.filter(day => {
                    const ds = formatDate(day)
                    return branches.some(b => {
                        const key = rosterKey(b.id, staff.id, ds)
                        const shiftId = roster[key]
                        const shift = shiftId ? shiftTypes.find(s => s.id === shiftId) : null
                        return shift?.type === 'work'
                    })
                }).length
                const leaveDaysCount = weekDays.filter(day => {
                    const ds = formatDate(day)
                    return branches.some(b => {
                        const key = rosterKey(b.id, staff.id, ds)
                        const shiftId = roster[key]
                        const shift = shiftId ? shiftTypes.find(s => s.id === shiftId) : null
                        return shift?.type === 'leave'
                    })
                }).length

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setStaffDetailId(null)}>
                        <div
                            className="bg-slate-800 rounded-2xl border border-white/10 shadow-2xl w-full max-w-4xl mx-4 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="px-6 py-5 border-b border-white/10">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-sm font-bold text-white">
                                            {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-white">{staff.name}</h3>
                                            <p className="text-sm text-slate-400">{staff.role} · {formatWeekRange(weekStart)}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setStaffDetailId(null)} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Summary stats */}
                                <div className="flex items-center gap-6 mt-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                                            <CalendarDays className="w-4 h-4 text-blue-400" />
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-400">Work Days</div>
                                            <div className="text-sm font-semibold text-white">{workDaysCount}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                                            <span className="text-emerald-400 text-sm font-bold">h</span>
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-400">Total Hours</div>
                                            <div className={`text-sm font-semibold ${totalWeekHours > 44 ? 'text-red-400' : totalWeekHours >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                                {totalWeekHours}h
                                            </div>
                                        </div>
                                    </div>
                                    {leaveDaysCount > 0 && (
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                                                <Globe className="w-4 h-4 text-amber-400" />
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-400">Leave</div>
                                                <div className="text-sm font-semibold text-amber-400">{leaveDaysCount} day{leaveDaysCount !== 1 ? 's' : ''}</div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
                                            <MapPin className="w-4 h-4 text-purple-400" />
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-400">Branches</div>
                                            <div className="text-sm font-semibold text-purple-400">{activeBranches.length}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Shifts table */}
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr>
                                            <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500 bg-slate-800/80 border-b border-white/5 min-w-[140px]">Branch</th>
                                            {weekDays.map(day => {
                                                const ds = formatDate(day)
                                                const isToday = ds === todayStr
                                                return (
                                                    <th key={ds} className={`px-2 py-3 text-center border-b border-white/5 min-w-[90px] ${isToday ? 'bg-blue-500/10' : 'bg-slate-800/80'}`}>
                                                        <div className={`text-[10px] uppercase tracking-wider ${isToday ? 'text-blue-400' : 'text-slate-500'}`}>{dayName(day)}</div>
                                                        <div className={`text-sm font-bold mt-0.5 ${isToday ? 'text-blue-300' : 'text-slate-300'}`}>{day.getDate()}</div>
                                                    </th>
                                                )
                                            })}
                                            <th className="px-3 py-3 text-center border-b border-white/5 bg-slate-800/80 text-xs uppercase tracking-wider text-slate-500 min-w-[60px]">Hours</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activeBranches.length === 0 ? (
                                            <tr>
                                                <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                                                    <User className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                                    <p>No shifts assigned this week</p>
                                                </td>
                                            </tr>
                                        ) : (
                                            activeBranches.map((bd, bIdx) => (
                                                <tr key={bd.branch.id} className={bIdx % 2 === 0 ? 'bg-slate-800/40' : 'bg-slate-700/20'}>
                                                    <td className="px-4 py-2.5 border-b border-white/5">
                                                        <div className="flex items-center gap-2">
                                                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                                                            <span className="text-sm font-medium text-slate-200">
                                                                {bd.branch.name.replace(/^Pasta Fresca\s*/i, '')}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    {bd.days.map(d => {
                                                        const isToday = d.date === todayStr
                                                        return (
                                                            <td key={d.date} className={`px-1 py-2 border-b border-white/5 text-center ${isToday ? 'bg-blue-500/5' : ''}`}>
                                                                {d.shift ? (
                                                                    <div
                                                                        className="inline-flex flex-col items-center rounded-lg px-2 py-1.5 min-w-[56px]"
                                                                        style={{
                                                                            backgroundColor: d.shift.color + '20',
                                                                            border: `1px solid ${d.shift.color}40`,
                                                                        }}
                                                                    >
                                                                        <span className="text-xs font-bold" style={{ color: d.shift.color }}>
                                                                            {d.shift.code}
                                                                        </span>
                                                                        {d.shift.type === 'work' && d.shift.startTime && (
                                                                            <span className="text-[9px] text-slate-400 mt-0.5">
                                                                                {d.shift.startTime}–{d.shift.endTime}
                                                                            </span>
                                                                        )}
                                                                        {d.shift.type === 'leave' && (
                                                                            <span className="text-[9px] mt-0.5" style={{ color: d.shift.color + 'CC' }}>
                                                                                {d.shift.name}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-slate-600">—</span>
                                                                )}
                                                            </td>
                                                        )
                                                    })}
                                                    <td className="px-3 py-2 border-b border-white/5 text-center">
                                                        <span className={`text-sm font-semibold ${bd.totalHours > 0 ? 'text-slate-200' : 'text-slate-600'}`}>
                                                            {bd.totalHours > 0 ? `${bd.totalHours}h` : '—'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                    {activeBranches.length > 1 && (
                                        <tfoot>
                                            <tr className="bg-slate-700/40">
                                                <td className="px-4 py-3 text-xs uppercase tracking-wider text-slate-400 font-semibold">Total</td>
                                                {weekDays.map(day => {
                                                    const ds = formatDate(day)
                                                    const dayHours = activeBranches.reduce((t, b) => {
                                                        const dData = b.days.find(d => d.date === ds)
                                                        return t + (dData?.shift?.hours || 0)
                                                    }, 0)
                                                    return (
                                                        <td key={ds} className="px-2 py-3 text-center">
                                                            <span className={`text-xs font-semibold ${dayHours > 0 ? 'text-slate-300' : 'text-slate-600'}`}>
                                                                {dayHours > 0 ? `${dayHours}h` : '—'}
                                                            </span>
                                                        </td>
                                                    )
                                                })}
                                                <td className="px-3 py-3 text-center">
                                                    <span className={`text-sm font-bold ${totalWeekHours > 44 ? 'text-red-400' : totalWeekHours >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                                        {totalWeekHours}h
                                                    </span>
                                                </td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* Day Detail Timeline Modal */}
            {dayDetailDate && (() => {
                // Find the actual Date object from weekDays to avoid timezone mismatch
                const dateObj = weekDays.find(d => formatDate(d) === dayDetailDate) || new Date(dayDetailDate + 'T12:00:00')
                const dateLabel = dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

                // Timeline from 06:00 to 02:00 next day = 20 hours
                const TIMELINE_START = 6 // 06:00
                const TIMELINE_END = 26  // 02:00 next day (= 24+2)
                const TIMELINE_HOURS = TIMELINE_END - TIMELINE_START // 20 hours

                const parseTime = (t: string): number => {
                    const [h, m] = t.split(':').map(Number)
                    let hour = h + m / 60
                    // Times like 01:00, 02:00 are next day
                    if (hour < TIMELINE_START) hour += 24
                    return hour
                }

                const getBarStyle = (shift: ShiftType) => {
                    if (shift.type !== 'work' || !shift.startTime || !shift.endTime) return null
                    const start = parseTime(shift.startTime)
                    const end = parseTime(shift.endTime)
                    const left = ((start - TIMELINE_START) / TIMELINE_HOURS) * 100
                    const width = ((end - start) / TIMELINE_HOURS) * 100
                    return { left: `${Math.max(0, left)}%`, width: `${Math.min(100 - Math.max(0, left), width)}%` }
                }

                // Build staff rows with their shifts for this day across the selected branch
                const staffRows = MOCK_STAFF.map(staff => {
                    const key = rosterKey(selectedBranch, staff.id, dayDetailDate)
                    const shiftId = roster[key]
                    const shift = shiftId ? shiftTypes.find(s => s.id === shiftId) : null
                    return { staff, shift }
                }).filter((r): r is { staff: typeof r.staff; shift: NonNullable<typeof r.shift> } => r.shift !== null && r.shift !== undefined && r.shift.type === 'work') // only show staff with work shifts

                // Compute coverage: count staff working at each 30-min slot
                const SLOTS = TIMELINE_HOURS * 2 // 30-min slots
                const coverage = new Array(SLOTS).fill(0)
                staffRows.forEach(({ shift }) => {
                    if (!shift || shift.type !== 'work' || !shift.startTime || !shift.endTime) return
                    const start = parseTime(shift.startTime)
                    const end = parseTime(shift.endTime)
                    for (let i = 0; i < SLOTS; i++) {
                        const slotTime = TIMELINE_START + i * 0.5
                        if (slotTime >= start && slotTime < end) coverage[i]++
                    }
                })

                // Find gap and overlap zones
                const gaps: { start: number; end: number }[] = []
                const overlaps: { start: number; end: number; count: number }[] = []
                let gapStart = -1
                let overlapStart = -1
                let overlapCount = 0

                // Only check coverage during operating hours (roughly 07:00-23:00 = slots 2..34)
                const OP_START_SLOT = 2 // 07:00
                const OP_END_SLOT = 34  // 23:00

                for (let i = OP_START_SLOT; i < Math.min(OP_END_SLOT, SLOTS); i++) {
                    // Gaps
                    if (coverage[i] === 0 && gapStart === -1) gapStart = i
                    if ((coverage[i] > 0 || i === OP_END_SLOT - 1) && gapStart !== -1) {
                        gaps.push({ start: gapStart, end: coverage[i] === 0 ? i + 1 : i })
                        gapStart = -1
                    }
                    // Overlaps (3+ staff at same time)
                    if (coverage[i] >= 3) {
                        if (overlapStart === -1) { overlapStart = i; overlapCount = coverage[i] }
                    } else {
                        if (overlapStart !== -1) {
                            overlaps.push({ start: overlapStart, end: i, count: overlapCount })
                            overlapStart = -1
                        }
                    }
                }
                if (overlapStart !== -1) overlaps.push({ start: overlapStart, end: OP_END_SLOT, count: overlapCount })

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDayDetailDate(null)}>
                        <div
                            className="bg-slate-800 rounded-2xl border border-white/10 shadow-2xl w-full max-w-5xl mx-4 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="px-6 py-5 border-b border-white/10">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                                            <Clock className="w-5 h-5 text-blue-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-white">Daily Timeline</h3>
                                            <p className="text-sm text-slate-400">{dateLabel} · {getBranchName(selectedBranch)}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setDayDetailDate(null)} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Quick stats */}
                                <div className="flex items-center gap-6 mt-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                                            <User className="w-4 h-4 text-blue-400" />
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-400">Staff On</div>
                                            <div className="text-sm font-semibold text-white">{staffRows.length}</div>
                                        </div>
                                    </div>
                                    {gaps.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
                                                <AlertTriangle className="w-4 h-4 text-red-400" />
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-400">Coverage Gaps</div>
                                                <div className="text-sm font-semibold text-red-400">{gaps.length}</div>
                                            </div>
                                        </div>
                                    )}
                                    {gaps.length === 0 && (
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                                                <span className="text-emerald-400 text-sm">✓</span>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-400">Coverage</div>
                                                <div className="text-sm font-semibold text-emerald-400">Full</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Timeline area */}
                            <div className="px-6 py-4 overflow-x-auto">
                                {/* Hour labels */}
                                <div className="flex ml-[160px] mb-1">
                                    {Array.from({ length: TIMELINE_HOURS + 1 }, (_, i) => {
                                        const h = (TIMELINE_START + i) % 24
                                        return (
                                            <div
                                                key={i}
                                                className="text-[10px] text-slate-500 shrink-0"
                                                style={{ width: i < TIMELINE_HOURS ? `${100 / TIMELINE_HOURS}%` : 0, minWidth: 0 }}
                                            >
                                                {String(h).padStart(2, '0')}:00
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Coverage heatmap bar */}
                                <div className="flex ml-[160px] mb-3 h-3 rounded-full overflow-hidden bg-slate-700/50">
                                    {coverage.map((count, i) => {
                                        let bg = 'bg-transparent'
                                        if (i >= OP_START_SLOT && i < OP_END_SLOT) {
                                            if (count === 0) bg = 'bg-red-500/40'
                                            else if (count === 1) bg = 'bg-amber-500/50'
                                            else if (count === 2) bg = 'bg-emerald-500/50'
                                            else bg = 'bg-blue-500/60'
                                        }
                                        return (
                                            <div
                                                key={i}
                                                className={`${bg} transition-colors`}
                                                style={{ width: `${100 / SLOTS}%` }}
                                                title={`${String((TIMELINE_START + i * 0.5) % 24 | 0).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'} — ${count} staff`}
                                            />
                                        )
                                    })}
                                </div>

                                {/* Coverage legend */}
                                <div className="flex items-center gap-3 ml-[160px] mb-4">
                                    <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-red-500/40" /><span className="text-[10px] text-slate-500">No cover</span></div>
                                    <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-amber-500/50" /><span className="text-[10px] text-slate-500">1 staff</span></div>
                                    <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/50" /><span className="text-[10px] text-slate-500">2 staff</span></div>
                                    <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-blue-500/60" /><span className="text-[10px] text-slate-500">3+ staff</span></div>
                                </div>

                                {/* Staff timeline rows */}
                                <div className="space-y-1">
                                    {staffRows.map(({ staff, shift }) => {
                                        const barStyle = shift ? getBarStyle(shift) : null

                                        return (
                                            <div key={staff.id} className="flex items-center gap-0 h-10">
                                                {/* Staff label */}
                                                <div className="w-[160px] shrink-0 flex items-center gap-2 pr-3">
                                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                                        {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-medium text-slate-200 truncate">{staff.name}</div>
                                                        <div className="text-[10px] text-slate-500 truncate">{staff.role}</div>
                                                    </div>
                                                </div>

                                                {/* Timeline bar area */}
                                                <div className="flex-1 relative h-8 bg-slate-700/30 rounded-lg overflow-hidden">
                                                    {/* Hour grid lines */}
                                                    {Array.from({ length: TIMELINE_HOURS }, (_, i) => (
                                                        <div
                                                            key={i}
                                                            className="absolute top-0 bottom-0 border-l border-slate-600/30"
                                                            style={{ left: `${(i / TIMELINE_HOURS) * 100}%` }}
                                                        />
                                                    ))}

                                                    {/* Shift bar */}
                                                    {barStyle && (
                                                        <div
                                                            className="absolute top-1 bottom-1 rounded-md flex items-center justify-center shadow-sm transition-all"
                                                            style={{
                                                                left: barStyle.left,
                                                                width: barStyle.width,
                                                                backgroundColor: shift!.color + 'CC',
                                                            }}
                                                        >
                                                            <span className="text-[11px] font-bold text-white drop-shadow-sm">
                                                                {shift!.code} {shift!.startTime}–{shift!.endTime}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {staffRows.length === 0 && (
                                        <div className="py-12 text-center text-slate-500">
                                            <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                            <p>No shifts assigned for this day</p>
                                        </div>
                                    )}
                                </div>

                                {/* Gap warnings */}
                                {gaps.length > 0 && (
                                    <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                                            <div>
                                                <p className="text-xs font-medium text-red-300">Coverage gaps detected</p>
                                                {gaps.map((g, i) => {
                                                    const startH = TIMELINE_START + g.start * 0.5
                                                    const endH = TIMELINE_START + g.end * 0.5
                                                    const fmtH = (h: number) => `${String(Math.floor(h % 24)).padStart(2, '0')}:${h % 1 === 0 ? '00' : '30'}`
                                                    return (
                                                        <p key={i} className="text-xs text-red-400/80 mt-0.5">
                                                            No coverage: {fmtH(startH)} – {fmtH(endH)}
                                                        </p>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })()}
        </div>
    )
}
