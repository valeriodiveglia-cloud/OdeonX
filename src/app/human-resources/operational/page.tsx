'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import WeekPicker from '@/components/WeekPicker'
import { 
    getMonday, addDays, formatDate, formatWeekRange, getTranslatedShiftName 
} from '@/lib/hr-operational-data'
import { 
    CalendarDays, BarChart3, Settings, Users, Clock, 
    Palmtree, AlertCircle, ChevronLeft, ChevronRight, ChevronRight as ArrowRight 
} from 'lucide-react'
import { 
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
    Tooltip as RechartsTooltip, Legend, PieChart, Pie, Cell 
} from 'recharts'

interface Branch {
    id: string
    name: string
}

interface StaffMember {
    id: string
    full_name: string
    position: string
    department: string
}

interface ShiftType {
    id: string
    name: string
    code: string
    type: 'work' | 'leave'
    hours: number
    color: string
}

interface RosterAssignment {
    branch_id: string
    staff_id: string
    date: string
    shift_ids: string
}

export default function HROperationalDashboard() {
    const { language } = useSettings()
    const [currentDate, setCurrentDate] = useState(() => new Date())
    const [loading, setLoading] = useState(true)

    // Data lists
    const [branches, setBranches] = useState<Branch[]>([])
    const [staffList, setStaffList] = useState<StaffMember[]>([])
    const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([])
    const [assignments, setAssignments] = useState<RosterAssignment[]>([])

    const monday = getMonday(currentDate)
    const sunday = addDays(monday, 6)
    const dateStartStr = formatDate(monday)
    const dateEndStr = formatDate(sunday)

    const fetchDashboardData = useCallback(async () => {
        setLoading(true)
        try {
            // 1. Fetch branches
            const { data: branchesRes, error: branchesErr } = await supabase
                .from('provider_branches')
                .select('id, name')
                .order('name')
            if (branchesErr) throw branchesErr

            // 2. Fetch staff
            const { data: staffRes, error: staffErr } = await supabase
                .from('hr_staff')
                .select('id, full_name, position, department')
                .eq('status', 'active')
            if (staffErr) throw staffErr

            // 3. Fetch shift types
            const { data: shiftTypesRes, error: shiftTypesErr } = await supabase
                .from('hr_operational_shift_types')
                .select('id, name, code, type, hours, color')
            if (shiftTypesErr) throw shiftTypesErr

            // 4. Fetch roster assignments for this week
            const { data: assignmentsRes, error: assignmentsErr } = await supabase
                .from('hr_roster_assignments')
                .select('branch_id, staff_id, date, shift_ids')
                .gte('date', dateStartStr)
                .lte('date', dateEndStr)
            if (assignmentsErr) throw assignmentsErr

            setBranches(branchesRes || [])
            setStaffList(staffRes || [])
            setShiftTypes((shiftTypesRes as any[])?.map(t => ({
                id: t.id,
                name: t.name,
                code: t.code,
                type: t.type,
                hours: Number(t.hours),
                color: t.color
            })) || [])
            setAssignments(assignmentsRes || [])
        } catch (err) {
            console.error('Error loading operational dashboard:', err)
        } finally {
            setLoading(false)
        }
    }, [dateStartStr, dateEndStr])

    useEffect(() => {
        fetchDashboardData()
    }, [fetchDashboardData])

    // Metrics compiled
    const metrics = useMemo(() => {
        let totalHours = 0
        const activeStaffIds = new Set<string>()
        let leaveCount = 0

        assignments.forEach(row => {
            if (!row.shift_ids) return
            const ids = row.shift_ids.split(',')
            ids.forEach(id => {
                const shift = shiftTypes.find(s => s.id === id)
                if (shift) {
                    if (shift.type === 'work') {
                        totalHours += shift.hours
                        activeStaffIds.add(row.staff_id)
                    } else if (shift.type === 'leave') {
                        // Count AL or SD or other leaves
                        if (shift.code === 'AL' || shift.code === 'SD') {
                            leaveCount += 1
                        }
                    }
                }
            })
        })

        return {
            totalHours: Math.round(totalHours),
            activeStaff: activeStaffIds.size,
            leaves: leaveCount
        }
    }, [assignments, shiftTypes])

    // Charts Data Prep
    const branchChartData = useMemo(() => {
        return branches.map(b => {
            let hours = 0
            assignments.filter(r => r.branch_id === b.id).forEach(row => {
                if (!row.shift_ids) return
                row.shift_ids.split(',').forEach(id => {
                    const shift = shiftTypes.find(s => s.id === id)
                    if (shift && shift.type === 'work') {
                        hours += shift.hours
                    }
                })
            })
            return {
                name: b.name,
                hours: Math.round(hours)
            }
        }).filter(item => item.hours > 0)
          .sort((a, b) => b.hours - a.hours)
    }, [branches, assignments, shiftTypes])

    const shiftTypePieData = useMemo(() => {
        let workCount = 0
        let doCount = 0
        let alCount = 0
        let sdCount = 0

        assignments.forEach(row => {
            if (!row.shift_ids) return
            row.shift_ids.split(',').forEach(id => {
                const shift = shiftTypes.find(s => s.id === id)
                if (shift) {
                    if (shift.type === 'work') workCount++
                    else if (shift.code === 'DO') doCount++
                    else if (shift.code === 'AL') alCount++
                    else if (shift.code === 'SD') sdCount++
                }
            })
        })

        const data = [
            { name: language === 'vi' ? 'Ca làm việc' : 'Work Shifts', value: workCount, color: '#3b82f6' },
            { name: language === 'vi' ? 'Ngày nghỉ' : 'Day Off', value: doCount, color: '#6b7280' },
            { name: language === 'vi' ? 'Nghỉ phép năm' : 'Annual Leave', value: alCount, color: '#eab308' },
            { name: language === 'vi' ? 'Nghỉ bệnh' : 'Sick Day', value: sdCount, color: '#ef4444' }
        ]

        return data.filter(item => item.value > 0)
    }, [assignments, shiftTypes, language])

    // Rankings & Lists
    const topLists = useMemo(() => {
        // Staff hours this week
        const staffHours = staffList.map(s => {
            let hours = 0
            assignments.filter(r => r.staff_id === s.id).forEach(row => {
                if (!row.shift_ids) return
                row.shift_ids.split(',').forEach(id => {
                    const shift = shiftTypes.find(s => s.id === id)
                    if (shift && shift.type === 'work') {
                        hours += shift.hours
                    }
                })
            })
            return {
                id: s.id,
                full_name: s.full_name,
                position: s.position,
                hours: Math.round(hours)
            }
        }).filter(item => item.hours > 0)
          .sort((a, b) => b.hours - a.hours)
          .slice(0, 5)

        // Leaves of the week
        const leaves: { staffName: string; position: string; type: string; date: string; color: string }[] = []
        assignments.forEach(row => {
            if (!row.shift_ids) return
            row.shift_ids.split(',').forEach(id => {
                const shift = shiftTypes.find(s => s.id === id)
                if (shift && shift.type === 'leave' && shift.code !== 'DO') {
                    const staff = staffList.find(s => s.id === row.staff_id)
                    const d = new Date(row.date)
                    const formattedDate = d.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-GB', { day: 'numeric', month: 'short' })
                    leaves.push({
                        staffName: staff?.full_name || (language === 'vi' ? 'Không xác định' : 'Unknown'),
                        position: staff?.position || '',
                        type: getTranslatedShiftName(shift.code, shift.name, language),
                        date: formattedDate,
                        color: shift.code === 'AL' ? 'text-amber-500' : 'text-red-500'
                    })
                }
            })
        })

        const sortedLeaves = leaves.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 5)

        return { staffHours, leaves: sortedLeaves }
    }, [staffList, assignments, shiftTypes])

    if (loading && staffList.length === 0) {
        return (
            <div className="min-h-screen bg-[#0b1530] flex items-center justify-center">
                <CircularLoader />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#0b1530] text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto">
                
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                        {language === 'vi' ? 'Vận hành HR' : 'HR Operational'}
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                        {language === 'vi' 
                            ? 'Lập lịch nhân sự, quản lý ca làm việc và phân tích vận hành.' 
                            : 'Staff scheduling, shift management and operational analytics.'}
                    </p>
                </div>

                {/* Week Picker */}
                <WeekPicker 
                    value={currentDate} 
                    onChange={setCurrentDate} 
                    language={language}
                    colorClass="text-blue-100 hover:text-white"
                    labelColorClass="text-white"
                    iconColorClass="text-blue-200 hover:text-white"
                    className="mt-3 mb-6"
                />

                {/* KPI Overview Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    
                    {/* Rostered Hours KPI Card */}
                    <div className="rounded-2xl bg-white shadow-xl p-6 border border-gray-100 text-gray-900 relative overflow-hidden">
                        <div className="absolute right-4 top-4 bg-blue-50 text-blue-600 p-2.5 rounded-xl">
                            <Clock className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                            {language === 'vi' ? 'Tổng số giờ lên lịch' : 'Rostered Hours (This Week)'}
                        </span>
                        <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-3xl font-bold text-gray-900">{metrics.totalHours}h</span>
                            <span className="text-sm text-gray-500">{language === 'vi' ? 'giờ làm việc' : 'working hours'}</span>
                        </div>
                    </div>

                    {/* Active Staff KPI Card */}
                    <div className="rounded-2xl bg-white shadow-xl p-6 border border-gray-100 text-gray-900 relative overflow-hidden">
                        <div className="absolute right-4 top-4 bg-emerald-50 text-emerald-600 p-2.5 rounded-xl">
                            <Users className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                            {language === 'vi' ? 'Nhân viên đi làm' : 'Active Staff (This Week)'}
                        </span>
                        <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-3xl font-bold text-gray-900">{metrics.activeStaff}</span>
                            <span className="text-sm text-gray-500">/ {staffList.length} {language === 'vi' ? 'nhân viên' : 'active staff'}</span>
                        </div>
                    </div>

                    {/* Leaves KPI Card */}
                    <div className="rounded-2xl bg-white shadow-xl p-6 border border-gray-100 text-gray-900 relative overflow-hidden">
                        <div className="absolute right-4 top-4 bg-amber-50 text-amber-600 p-2.5 rounded-xl">
                            <Palmtree className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                            {language === 'vi' ? 'Lượt phép phép & Bệnh' : 'Leaves (This Week)'}
                        </span>
                        <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-3xl font-bold text-gray-900">{metrics.leaves}</span>
                            <span className="text-sm text-gray-500">{language === 'vi' ? 'lượt nghỉ phép' : 'leaves registered'}</span>
                        </div>
                    </div>

                </div>



                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    
                    {/* Branch Workload Allocation Bar Chart */}
                    <div className="lg:col-span-2 rounded-2xl bg-white shadow-xl p-6 border border-gray-100 text-gray-900">
                        <div className="flex items-center justify-between mb-4 border-b border-gray-50 pb-3">
                            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-blue-600" />
                                {language === 'vi' ? 'Phân bổ giờ làm theo Chi nhánh' : 'Branch Workload Allocation'}
                            </h2>
                            <span className="text-xs text-gray-400">{language === 'vi' ? 'Theo tuần' : 'Weekly view'}</span>
                        </div>
                        <div className="h-[280px] w-full">
                            {branchChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={branchChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis 
                                            dataKey="name" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fill: '#64748b', fontSize: 10 }}
                                        />
                                        <YAxis 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fill: '#64748b', fontSize: 10 }}
                                            tickFormatter={(val) => `${val}h`}
                                        />
                                        <RechartsTooltip 
                                            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                            formatter={(value) => [`${value} hrs`, language === 'vi' ? 'Số giờ lên lịch' : 'Scheduled Hours']}
                                        />
                                        <Bar dataKey="hours" name="Hours" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={45} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm">
                                    <AlertCircle className="w-8 h-8 text-gray-300 mb-2" />
                                    {language === 'vi' ? 'Không có giờ làm việc nào được lên lịch tuần này.' : 'No roster hours scheduled for this week.'}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Shift Type Pie Chart */}
                    <div className="rounded-2xl bg-white shadow-xl p-6 border border-gray-100 text-gray-900">
                        <div className="flex items-center justify-between mb-4 border-b border-gray-50 pb-3">
                            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                <CalendarDays className="w-4 h-4 text-emerald-600" />
                                {language === 'vi' ? 'Phân bổ Ca làm & Nghỉ phép' : 'Shifts & Leaves Allocation'}
                            </h2>
                            <span className="text-xs text-gray-400">{language === 'vi' ? 'Tuần này' : 'This week'}</span>
                        </div>
                        <div className="h-[280px] w-full flex flex-col items-center justify-center">
                            {shiftTypePieData.length > 0 ? (
                                <>
                                    <div className="h-[180px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={shiftTypePieData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={45}
                                                    outerRadius={70}
                                                    paddingAngle={3}
                                                    dataKey="value"
                                                >
                                                    {shiftTypePieData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip 
                                                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                                    formatter={(value) => [`${value} ${language === 'vi' ? 'ca/ngày' : 'shifts/days'}`, 'Count']}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    {/* Custom Legend */}
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] mt-2 w-full px-2">
                                        {shiftTypePieData.map((item, index) => (
                                            <div key={index} className="flex items-center gap-1.5 truncate">
                                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                                                <span className="text-gray-600 truncate">{item.name}:</span>
                                                <span className="font-bold text-gray-800 shrink-0">{item.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm">
                                    <AlertCircle className="w-8 h-8 text-gray-300 mb-2" />
                                    {language === 'vi' ? 'Không có ca hay lịch nghỉ phép tuần này.' : 'No shift assignments this week.'}
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* Details Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* Top Scheduled Staff */}
                    <div className="rounded-2xl bg-white shadow-xl p-6 border border-gray-100 text-gray-900 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-5 border-b border-gray-50 pb-3">
                                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-blue-600" />
                                    {language === 'vi' ? 'Số giờ lên lịch cao nhất' : 'Staff Scheduled Hours'}
                                </h3>
                                <span className="text-xs text-gray-400">{language === 'vi' ? 'Top 5 tuần này' : 'Top 5 this week'}</span>
                            </div>

                            <div className="space-y-2">
                                {topLists.staffHours.map((item, idx) => (
                                    <div key={item.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 transition duration-150">
                                        <div className="flex items-center gap-3">
                                            <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-250 flex items-center justify-center text-xs font-bold text-gray-700">
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <span className="text-sm font-semibold text-gray-900 block leading-tight">{item.full_name}</span>
                                                <span className="text-[10px] text-gray-500 block mt-0.5">{item.position}</span>
                                            </div>
                                        </div>
                                        <span className="text-sm font-bold text-blue-600">{item.hours}h</span>
                                    </div>
                                ))}

                                {topLists.staffHours.length === 0 && (
                                    <div className="py-12 text-center text-gray-450 text-sm">
                                        <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                        {language === 'vi' ? 'Không có giờ làm việc nào được lên lịch tuần này.' : 'No roster hours scheduled.'}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-8 pt-4 border-t border-gray-100">
                            <Link 
                                href="/human-resources/operational/roster" 
                                className="w-full bg-blue-600/15 hover:bg-blue-600/25 text-blue-600 font-semibold px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 group text-sm"
                            >
                                {language === 'vi' ? 'Mở lịch phân ca (Roster)' : 'Open Roster Scheduler'}
                                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                            </Link>
                        </div>
                    </div>

                    {/* Active Leaves List */}
                    <div className="rounded-2xl bg-white shadow-xl p-6 border border-gray-100 text-gray-900 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-5 border-b border-gray-50 pb-3">
                                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                    <Palmtree className="w-4 h-4 text-amber-500" />
                                    {language === 'vi' ? 'Nhân viên nghỉ phép tuần này' : 'Leaves Scheduled This Week'}
                                </h3>
                                <span className="text-xs text-gray-400">{language === 'vi' ? 'Tối đa 5 ghi nhận' : 'Max 5 entries'}</span>
                            </div>

                            <div className="space-y-2">
                                {topLists.leaves.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 transition duration-150">
                                        <div className="flex items-center gap-3">
                                            <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-250 flex items-center justify-center text-xs font-bold text-gray-700">
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <span className="text-sm font-semibold text-gray-900 block leading-tight">{item.staffName}</span>
                                                <span className="text-[10px] text-gray-500 block mt-0.5">{item.position}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-xs font-semibold block ${item.color}`}>{item.type}</span>
                                            <span className="text-[10px] text-gray-500 block mt-0.5">{item.date}</span>
                                        </div>
                                    </div>
                                ))}

                                {topLists.leaves.length === 0 && (
                                    <div className="py-12 text-center text-gray-450 text-sm">
                                        <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                        {language === 'vi' ? 'Không có ai nghỉ phép hay nghỉ ốm tuần này.' : 'No leaves scheduled.'}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-8 pt-4 border-t border-gray-100">
                            <Link 
                                href="/human-resources/operational/reports" 
                                className="w-full bg-blue-600/15 hover:bg-blue-600/25 text-blue-600 font-semibold px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 group text-sm"
                            >
                                {language === 'vi' ? 'Xem báo cáo chi tiết' : 'View Detailed Reports'}
                                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                            </Link>
                        </div>
                    </div>

                </div>

            </div>
        </div>
    )
}
