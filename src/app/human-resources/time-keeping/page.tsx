'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import MonthPicker from '@/components/MonthPicker'
import CircularLoader from '@/components/CircularLoader'
import { getOvertimeSettings } from '@/lib/hr-operational-data'
import { Clock, Timer, Coins, AlertCircle, TrendingUp, ChevronRight, ChevronDown } from 'lucide-react'
import { 
    ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts'

// Local types for the dashboard
interface StaffMember {
    id: string
    full_name: string
    position: string
    department: string
    salary_amount: number
    salary_type: 'monthly' | 'hourly'
    city?: string
    employment_type?: string
}

interface AttendanceMonthly {
    staff_id: string
    lates_count: number
    lates_minutes: number
    no_shows_count: number
    annual_leaves: number
    sick_leaves: number
    unpaid_leaves: number
    other_leaves: number
}

interface OvertimeRecord {
    staff_id: string
    date: string
    hours: number
    compensation_type: 'salary' | 'annual_leave'
    is_public_holiday: boolean
}

interface SalaryHistory {
    staff_id: string
    effective_date: string
    previous_amount: number
    new_amount: number
}

export default function TimeKeepingDashboard() {
    const { currency, language } = useSettings()
    const [currentDate, setCurrentDate] = useState(() => new Date())
    const [loading, setLoading] = useState(true)
    const [selectedCity, setSelectedCity] = useState<'Ho Chi Minh' | 'Da Lat'>('Ho Chi Minh')
    const [cityDropdownOpen, setCityDropdownOpen] = useState(false)
    const [activeRankTab, setActiveRankTab] = useState<'tardiness' | 'overtime' | 'service-charge'>('tardiness')

    // Raw database state
    const [staffList, setStaffList] = useState<StaffMember[]>([])
    const [attendanceData, setAttendanceData] = useState<AttendanceMonthly[]>([])
    const [overtimeData, setOvertimeData] = useState<OvertimeRecord[]>([])
    const [salaryHistory, setSalaryHistory] = useState<SalaryHistory[]>([])
    const [serviceChargePools, setServiceChargePools] = useState<{ city: string; total_amount: number }[]>([])
    const [serviceChargeStaff, setServiceChargeStaff] = useState<{ staff_id: string; hours_worked: number }[]>([])

    const monthId = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`

    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
    const dateStartStr = `${monthStart.getFullYear()}-${(monthStart.getMonth() + 1).toString().padStart(2, '0')}-01`
    const dateEndStr = `${monthEnd.getFullYear()}-${(monthEnd.getMonth() + 1).toString().padStart(2, '0')}-${monthEnd.getDate().toString().padStart(2, '0')}`

    const displayMonth = currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    const fetchAllData = useCallback(async () => {
        setLoading(true)
        try {
            // 1. Fetch active staff (excluding outsourced)
            const { data: staffRes, error: staffErr } = await supabase
                .from('hr_staff')
                .select('id, full_name, position, department, salary_amount, salary_type, city, employment_type')
                .eq('status', 'active')
                .neq('employment_type', 'outsourced')
                .order('full_name')
            if (staffErr) throw staffErr

            // 2. Fetch monthly attendance summary
            const { data: attRes, error: attErr } = await supabase
                .from('hr_staff_attendance_monthly')
                .select('*')
                .eq('month_id', monthId)
            if (attErr) throw attErr

            // 3. Fetch overtime for the month
            const { data: otRes, error: otErr } = await supabase
                .from('hr_staff_overtime')
                .select('staff_id, date, hours, compensation_type, is_public_holiday')
                .gte('date', dateStartStr)
                .lte('date', dateEndStr)
            if (otErr) throw otErr

            // 4. Fetch salary history for calculating overtime rates
            const { data: historyRes } = await supabase
                .from('hr_staff_salary_history')
                .select('staff_id, effective_date, previous_amount, new_amount')
                .order('effective_date', { ascending: false })

            // 5. Fetch service charge pools for the month
            const { data: scPoolRes } = await supabase
                .from('hr_service_charges')
                .select('city, total_amount')
                .eq('month_id', monthId)

            // 6. Fetch service charge staff records
            const { data: scStaffRes } = await supabase
                .from('hr_service_charge_staff')
                .select('staff_id, hours_worked')
                .eq('month_id', monthId)

            setStaffList((staffRes as StaffMember[]) || [])
            setAttendanceData((attRes as AttendanceMonthly[]) || [])
            setOvertimeData((otRes as OvertimeRecord[]) || [])
            setSalaryHistory((historyRes as SalaryHistory[]) || [])
            setServiceChargePools((scPoolRes as any[]) || [])
            setServiceChargeStaff((scStaffRes as any[]) || [])
        } catch (err) {
            console.error('Error fetching Time Keeping dashboard data:', err)
        } finally {
            setLoading(false)
        }
    }, [monthId, dateStartStr, dateEndStr])

    useEffect(() => {
        fetchAllData()
    }, [fetchAllData])

    // Overtime settings and calculator
    const otSettings = useMemo(() => getOvertimeSettings(), [])

    const getHourlyRate = useCallback((staff: StaffMember, dateStr: string) => {
        let applicableSalary = staff.salary_amount
        const futureChanges = salaryHistory.filter(h => h.staff_id === staff.id && new Date(h.effective_date) > new Date(dateStr))
        if (futureChanges.length > 0) {
            const sortedFuture = [...futureChanges].sort((a, b) => new Date(a.effective_date).getTime() - new Date(b.effective_date).getTime())
            applicableSalary = sortedFuture[0].previous_amount
        }
        if (!applicableSalary) return 0
        if (staff.salary_type === 'hourly') return applicableSalary

        const recordDate = new Date(dateStr)
        const daysInMonth = new Date(recordDate.getFullYear(), recordDate.getMonth() + 1, 0).getDate()
        const workingDays = Math.max(1, daysInMonth - 4)
        return (applicableSalary / workingDays) / 8
    }, [salaryHistory])

    const calculateOtCostOrDays = useCallback((r: OvertimeRecord, staff: StaffMember) => {
        let multiplier = 1
        if (r.is_public_holiday) {
            multiplier = r.compensation_type === 'salary' ? otSettings.public_holiday_multiplier_salary : otSettings.public_holiday_multiplier_leave
        } else {
            multiplier = r.compensation_type === 'salary' ? otSettings.overtime_multiplier_salary : otSettings.overtime_multiplier_leave
        }
        const eqHours = r.hours * multiplier

        if (r.compensation_type === 'annual_leave') {
            return eqHours / 8 // 8 hours = 1 leave day
        } else {
            const hourlyRate = getHourlyRate(staff, r.date)
            return eqHours * hourlyRate
        }
    }, [otSettings, getHourlyRate])

    // Formatting money helper
    const formatMoney = useCallback((val: number) => {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currency || 'VND',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(val)
    }, [currency])

    // Filter staff by active city
    const filteredStaff = useMemo(() => {
        return staffList.filter(s => {
            if (selectedCity === 'Ho Chi Minh') {
                return s.city === 'Ho Chi Minh' || !s.city
            }
            return s.city === selectedCity
        })
    }, [staffList, selectedCity])

    // Current service charge pool
    const currentScPool = useMemo(() => {
        return serviceChargePools.find(p => p.city === selectedCity) || null
    }, [serviceChargePools, selectedCity])

    // Compile active metrics for selected city
    const metrics = useMemo(() => {
        // Attendance
        const filteredAttData = attendanceData.filter(r => filteredStaff.some(s => s.id === r.staff_id))
        const totalLates = filteredAttData.reduce((sum, r) => sum + (r.lates_count || 0), 0)
        const totalLateMins = filteredAttData.reduce((sum, r) => sum + (r.lates_minutes || 0), 0)
        const totalNoShows = filteredAttData.reduce((sum, r) => sum + (r.no_shows_count || 0), 0)
        const totalSickLeaves = filteredAttData.reduce((sum, r) => sum + (r.sick_leaves || 0), 0)
        const totalAnnualLeaves = filteredAttData.reduce((sum, r) => sum + (r.annual_leaves || 0), 0)
        const totalUnpaidLeaves = filteredAttData.reduce((sum, r) => sum + (r.unpaid_leaves || 0), 0)
        const totalOtherLeaves = filteredAttData.reduce((sum, r) => sum + (r.other_leaves || 0), 0)

        // Overtime
        const filteredOtData = overtimeData.filter(r => filteredStaff.some(s => s.id === r.staff_id))
        const totalOtHours = filteredOtData.reduce((sum, r) => sum + (r.hours || 0), 0)
        let totalOtCost = 0
        let totalOtCompDays = 0

        filteredOtData.forEach(r => {
            const staff = filteredStaff.find(s => s.id === r.staff_id)
            if (staff) {
                const res = calculateOtCostOrDays(r, staff)
                if (r.compensation_type === 'salary') {
                    totalOtCost += res
                } else {
                    totalOtCompDays += res
                }
            }
        })

        // Service Charge
        const scPoolAmount = currentScPool?.total_amount || 0
        const filteredScStaff = serviceChargeStaff.filter(r => filteredStaff.some(s => s.id === r.staff_id))
        const scTotalHours = filteredScStaff.reduce((sum, r) => sum + (r.hours_worked || 0), 0)
        const scRatePerHour = scTotalHours > 0 ? scPoolAmount / scTotalHours : 0

        return {
            attendance: {
                totalLates,
                totalLateMins,
                totalNoShows,
                totalSickLeaves,
                totalAnnualLeaves,
                totalUnpaidLeaves,
                totalOtherLeaves
            },
            overtime: {
                totalOtHours,
                totalOtCost,
                totalOtCompDays
            },
            serviceCharge: {
                poolAmount: scPoolAmount,
                totalHours: scTotalHours,
                ratePerHour: scRatePerHour
            }
        }
    }, [attendanceData, overtimeData, filteredStaff, currentScPool, serviceChargeStaff, calculateOtCostOrDays])

    const attendancePieData = useMemo(() => {
        const lates = metrics.attendance.totalLates
        const noShows = metrics.attendance.totalNoShows
        const sick = metrics.attendance.totalSickLeaves
        const annual = metrics.attendance.totalAnnualLeaves
        const unpaid = metrics.attendance.totalUnpaidLeaves
        
        const data = [
            { name: language === 'vi' ? 'Đi muộn' : 'Lates', value: lates, color: '#3b82f6' }, 
            { name: language === 'vi' ? 'Vắng mặt' : 'No-shows', value: noShows, color: '#ef4444' }, 
            { name: language === 'vi' ? 'Nghỉ bệnh' : 'Sick', value: sick, color: '#10b981' }, 
            { name: language === 'vi' ? 'Phép năm' : 'Annual', value: annual, color: '#8b5cf6' }, 
            { name: language === 'vi' ? 'Không lương' : 'Unpaid', value: unpaid, color: '#64748b' }
        ]
        
        return data.filter(item => item.value > 0)
    }, [metrics.attendance, language])

    // Rankings & Top Lists (Filtered by Selected City)
    const topLists = useMemo(() => {
        // Top Lates
        const lates = filteredStaff.map(s => {
            const att = attendanceData.find(r => r.staff_id === s.id)
            return {
                id: s.id,
                full_name: s.full_name,
                position: s.position,
                lates_count: att?.lates_count || 0,
                lates_minutes: att?.lates_minutes || 0,
                no_shows: att?.no_shows_count || 0
            }
        }).filter(item => item.lates_count > 0 || item.lates_minutes > 0 || item.no_shows > 0)
          .sort((a, b) => b.lates_minutes - a.lates_minutes)
          .slice(0, 5)

        // Top Overtime
        const overtime = filteredStaff.map(s => {
            const records = overtimeData.filter(r => r.staff_id === s.id)
            const hours = records.reduce((sum, r) => sum + r.hours, 0)
            const cost = records.filter(r => r.compensation_type === 'salary').reduce((sum, r) => sum + calculateOtCostOrDays(r, s), 0)
            return {
                id: s.id,
                full_name: s.full_name,
                position: s.position,
                hours,
                cost
            }
        }).filter(item => item.hours > 0)
          .sort((a, b) => b.hours - a.hours)
          .slice(0, 5)

        // Top Service Charge
        const serviceCharge = filteredStaff.map(s => {
            const rec = serviceChargeStaff.find(r => r.staff_id === s.id)
            const hours = rec?.hours_worked || 0
            const amount = hours * metrics.serviceCharge.ratePerHour
            return {
                id: s.id,
                full_name: s.full_name,
                position: s.position,
                hours,
                amount
            }
        }).filter(item => item.hours > 0)
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5)

        return { lates, overtime, serviceCharge }
    }, [filteredStaff, attendanceData, overtimeData, serviceChargeStaff, metrics.serviceCharge.ratePerHour, calculateOtCostOrDays])

    // City Cost & Ratio Comparison (HCM vs DL)
    const cityComparison = useMemo(() => {
        const getCityMetrics = (city: 'Ho Chi Minh' | 'Da Lat') => {
            const cityStaff = staffList.filter(s => {
                if (city === 'Ho Chi Minh') return s.city === 'Ho Chi Minh' || !s.city
                return s.city === city
            })
            const staffCount = cityStaff.length

            // Overtime Cost
            const cityOtData = overtimeData.filter(r => cityStaff.some(s => s.id === r.staff_id))
            let overtimeCost = 0
            let overtimeHours = 0
            cityOtData.forEach(r => {
                const staff = cityStaff.find(s => s.id === r.staff_id)
                if (staff && r.compensation_type === 'salary') {
                    overtimeCost += calculateOtCostOrDays(r, staff)
                }
                if (staff) {
                    overtimeHours += r.hours
                }
            })

            // Service Charge Pool
            const pool = serviceChargePools.find(p => p.city === city)?.total_amount || 0

            // Total Cost (Overtime + Service Charge Pool)
            const totalCost = overtimeCost + pool
            const averageCostPerStaff = staffCount > 0 ? totalCost / staffCount : 0

            return {
                staffCount,
                overtimeCost,
                overtimeHours,
                pool,
                totalCost,
                averageCostPerStaff
            }
        }

        const hcm = getCityMetrics('Ho Chi Minh')
        const dl = getCityMetrics('Da Lat')

        // Calculate differences
        let ratioDifferencePct = 0
        let higherCity: 'Ho Chi Minh' | 'Da Lat' | null = null

        if (hcm.averageCostPerStaff > dl.averageCostPerStaff) {
            higherCity = 'Ho Chi Minh'
            ratioDifferencePct = dl.averageCostPerStaff > 0 
                ? ((hcm.averageCostPerStaff - dl.averageCostPerStaff) / dl.averageCostPerStaff) * 100 
                : 100
        } else if (dl.averageCostPerStaff > hcm.averageCostPerStaff) {
            higherCity = 'Da Lat'
            ratioDifferencePct = hcm.averageCostPerStaff > 0 
                ? ((dl.averageCostPerStaff - hcm.averageCostPerStaff) / hcm.averageCostPerStaff) * 100 
                : 100
        }

        return { hcm, dl, ratioDifferencePct, higherCity }
    }, [staffList, overtimeData, serviceChargePools, calculateOtCostOrDays])

    const handleMonthChange = (newVal: string) => {
        const [y, m] = newVal.split('-').map(Number)
        setCurrentDate(new Date(y, m - 1, 1))
    }

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
                
                {/* Header (No Icon inside Title Tag) */}
                <div className="mb-6 ml-2">
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                        {language === 'vi' ? 'Lịch Trình & Công Công' : 'Time Keeping'}
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                        {language === 'vi' 
                            ? 'Theo dõi chuyên cần, làm thêm giờ và phân bổ phí dịch vụ hàng tháng.' 
                            : 'Track staff attendance, monthly overtime, and service charge distribution.'}
                    </p>
                </div>

                {/* 1. City Selection Dropdown (White Theme) - Compresso (w-36) e con angoli rounded-lg */}
                <div className="mb-8 px-2 flex items-center gap-3 relative z-20">
                    <span className="text-sm font-semibold text-slate-400">{language === 'vi' ? 'Thành phố:' : 'City:'}</span>
                    <div className="relative inline-block text-left">
                        <button
                            type="button"
                            onClick={() => setCityDropdownOpen(!cityDropdownOpen)}
                            className="inline-flex justify-between items-center gap-2 w-36 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 hover:bg-gray-50 transition-all focus:ring-2 focus:ring-blue-500/50 outline-none"
                        >
                            <span className="truncate">{selectedCity}</span>
                            <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                        </button>

                        {cityDropdownOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setCityDropdownOpen(false)} />
                                <div className="absolute left-0 mt-2 w-36 rounded-lg bg-white border border-gray-200 shadow-xl z-20 focus:outline-none overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100">
                                    <div className="py-1">
                                        <button
                                            onClick={() => {
                                                setSelectedCity('Ho Chi Minh')
                                                setCityDropdownOpen(false)
                                            }}
                                            className={`w-full text-left px-3 py-2 text-sm font-semibold transition-colors ${
                                                selectedCity === 'Ho Chi Minh'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            Ho Chi Minh
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedCity('Da Lat')
                                                setCityDropdownOpen(false)
                                            }}
                                            className={`w-full text-left px-3 py-2 text-sm font-semibold transition-colors ${
                                                selectedCity === 'Da Lat'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            Da Lat
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* 2. MonthPicker a larghezza intera / posizionato da solo sotto il dropdown con spaziature aumentate */}
                <MonthPicker 
                    value={monthId} 
                    onChange={handleMonthChange} 
                    language={language}
                    colorClass="text-blue-100 hover:text-white"
                    labelColorClass="text-white"
                    iconColorClass="text-blue-200 hover:text-white"
                    className="mt-6 mb-8 px-2"
                />

                {/* 3. Main Dashboard Content (Compact Two-Column Grid Layout aligned to stretch vertically) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                    
                    {/* Left Column (1/3 Width) - KPI Stack & Attendance Pie Chart */}
                    <div className="flex flex-col gap-6">
                        
                        {/* Attendance KPI Card (White Card) */}
                        <div className="rounded-lg bg-white shadow p-5 border border-gray-100 text-gray-900 relative">
                            <div className="absolute right-4 top-4 bg-blue-50 text-blue-600 p-2 rounded-lg">
                                <Clock className="w-5 h-5" />
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                                {language === 'vi' ? 'Chuyên Cần' : 'Attendance'}
                            </span>
                            <div className="flex items-baseline gap-1 mt-1.5">
                                <span className="text-2xl font-black text-gray-900">{metrics.attendance.totalLates}</span>
                                <span className="text-xs text-gray-500 font-medium">{language === 'vi' ? 'lần đi trễ' : 'lates'}</span>
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-[11px] text-gray-500">
                                <div>
                                    <span className="block font-bold text-gray-900 leading-tight">{metrics.attendance.totalLateMins}m</span>
                                    <span className="text-[10px] text-gray-400">{language === 'vi' ? 'Số phút trễ' : 'Late mins'}</span>
                                </div>
                                <div>
                                    <span className="block font-bold text-gray-900 leading-tight">{metrics.attendance.totalNoShows}d</span>
                                    <span className="text-[10px] text-gray-400">{language === 'vi' ? 'Vắng mặt' : 'No-shows'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Overtime KPI Card (White Card) */}
                        <div className="rounded-lg bg-white shadow p-5 border border-gray-100 text-gray-900 relative">
                            <div className="absolute right-4 top-4 bg-emerald-50 text-emerald-600 p-2 rounded-lg">
                                <Timer className="w-5 h-5" />
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                                {language === 'vi' ? 'Tăng Ca' : 'Overtime'}
                            </span>
                            <div className="flex items-baseline gap-1 mt-1.5">
                                <span className="text-2xl font-black text-gray-900">{metrics.overtime.totalOtHours}h</span>
                                <span className="text-xs text-gray-500 font-medium">{language === 'vi' ? 'giờ tích lũy' : 'hours'}</span>
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-[11px] text-gray-500">
                                <div>
                                    <span className="block font-bold text-emerald-655 leading-tight">{formatMoney(metrics.overtime.totalOtCost)}</span>
                                    <span className="text-[10px] text-gray-400">{language === 'vi' ? 'Thanh toán' : 'Payout'}</span>
                                </div>
                                <div>
                                    <span className="block font-bold text-purple-650 leading-tight">+{metrics.overtime.totalOtCompDays.toFixed(1)}d</span>
                                    <span className="text-[10px] text-gray-400">{language === 'vi' ? 'Phép bù' : 'Leaves'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Service Charge KPI Card (White Card) */}
                        <div className="rounded-lg bg-white shadow p-5 border border-gray-100 text-gray-900 relative">
                            <div className="absolute right-4 top-4 bg-amber-50 text-amber-600 p-2 rounded-lg">
                                <Coins className="w-5 h-5" />
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                                {language === 'vi' ? 'Phí Dịch Vụ' : 'Service Charge'}
                            </span>
                            <div className="flex items-baseline gap-1 mt-1.5">
                                <span className="text-2xl font-black text-gray-900">{formatMoney(metrics.serviceCharge.poolAmount)}</span>
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-[11px] text-gray-500">
                                <div>
                                    <span className="block font-bold text-gray-900 leading-tight">{metrics.serviceCharge.totalHours.toFixed(1)}h</span>
                                    <span className="text-[10px] text-gray-400">{language === 'vi' ? 'Tổng giờ' : 'Total hours'}</span>
                                </div>
                                <div>
                                    <span className="block font-bold text-amber-655 leading-tight">{formatMoney(metrics.serviceCharge.ratePerHour)}/h</span>
                                    <span className="text-[10px] text-gray-400">{language === 'vi' ? 'Hệ số' : 'Rate'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Attendance Leaves Pie Chart (White Card - stretched vertical to match columns bottoms) */}
                        <div className="rounded-lg bg-white shadow p-5 border border-gray-100 text-gray-900 flex flex-col items-center flex-grow justify-between">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 self-start w-full border-b border-gray-100 pb-2 shrink-0">
                                {language === 'vi' ? 'Phân bổ chuyên cần & phép' : 'Attendance & Leaves'}
                            </h3>
                            {attendancePieData.length > 0 ? (
                                <div className="w-full flex items-center justify-between gap-4 my-auto">
                                    <div className="h-[120px] w-[120px] shrink-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={attendancePieData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={30}
                                                    outerRadius={50}
                                                    paddingAngle={2}
                                                    dataKey="value"
                                                >
                                                    {attendancePieData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="flex-1 space-y-1 text-[10px] leading-tight">
                                        {attendancePieData.slice(0, 5).map((item, index) => (
                                            <div key={index} className="flex items-center gap-1.5 justify-between">
                                                <div className="flex items-center gap-1 min-w-0">
                                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                                    <span className="text-gray-500 truncate">{item.name}</span>
                                                </div>
                                                <span className="font-bold text-gray-900 shrink-0">{item.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="py-6 text-center text-gray-450 text-xs w-full my-auto">
                                    <AlertCircle className="w-6 h-6 text-gray-300 mx-auto mb-1.5" />
                                    {language === 'vi' ? 'Không có ghi nhận nghỉ phép' : 'No records.'}
                                </div>
                            )}
                        </div>

                    </div>

                    {/* Right Column (2/3 Width) - City Comparison (White Card) & Ranks (White Card) */}
                    <div className="lg:col-span-2 flex flex-col gap-6">
                        
                        {/* City Cost & Ratio Comparison (White Card matching UI standards) */}
                        <div className="rounded-lg bg-white shadow p-5 border border-gray-100 text-gray-900">
                            <div className="flex items-center justify-between mb-5 border-b border-gray-100 pb-3">
                                <span className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-blue-600" />
                                    {language === 'vi' ? 'So Sánh Chi Phí & Tỷ Lệ Theo Thành Phố' : 'City Cost & Ratio Comparison'}
                                </span>
                                <span className="text-[11px] text-gray-400 capitalize">{displayMonth}</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Ho Chi Minh Panel */}
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 relative">
                                    <div className="absolute top-3.5 right-4 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                        {cityComparison.hcm.staffCount} {language === 'vi' ? 'nhân sự' : 'staff'}
                                    </div>
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3.5">Ho Chi Minh</h4>
                                    <div className="space-y-2.5 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">{language === 'vi' ? 'Chi phí tăng ca:' : 'Overtime Cost:'}</span>
                                            <span className="font-bold text-gray-900">{formatMoney(cityComparison.hcm.overtimeCost)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">{language === 'vi' ? 'Quỹ phí dịch vụ:' : 'Service Charge Pool:'}</span>
                                            <span className="font-bold text-gray-900">{formatMoney(cityComparison.hcm.pool)}</span>
                                        </div>
                                        <div className="flex justify-between border-t border-gray-200/60 pt-2">
                                            <span className="text-gray-500 font-semibold">{language === 'vi' ? 'Tổng chi phí:' : 'Total Cost:'}</span>
                                            <span className="font-extrabold text-gray-900">{formatMoney(cityComparison.hcm.totalCost)}</span>
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-gray-200/60 flex flex-col">
                                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{language === 'vi' ? 'Chi phí trung bình / Nhân viên' : 'Average Cost per Staff'}</span>
                                            <span className="text-lg font-black text-blue-600 mt-0.5">
                                                {formatMoney(cityComparison.hcm.averageCostPerStaff)} <span className="text-xs font-normal text-gray-450">{language === 'vi' ? '/ nhân sự' : '/ staff'}</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Da Lat Panel */}
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 relative">
                                    <div className="absolute top-3.5 right-4 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                                        {cityComparison.dl.staffCount} {language === 'vi' ? 'nhân sự' : 'staff'}
                                    </div>
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3.5">Da Lat</h4>
                                    <div className="space-y-2.5 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">{language === 'vi' ? 'Chi phí tăng ca:' : 'Overtime Cost:'}</span>
                                            <span className="font-bold text-gray-900">{formatMoney(cityComparison.dl.overtimeCost)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">{language === 'vi' ? 'Quỹ phí dịch vụ:' : 'Service Charge Pool:'}</span>
                                            <span className="font-bold text-gray-900">{formatMoney(cityComparison.dl.pool)}</span>
                                        </div>
                                        <div className="flex justify-between border-t border-gray-200/60 pt-2">
                                            <span className="text-gray-500 font-semibold">{language === 'vi' ? 'Tổng chi phí:' : 'Total Cost:'}</span>
                                            <span className="font-extrabold text-gray-900">{formatMoney(cityComparison.dl.totalCost)}</span>
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-gray-200/60 flex flex-col">
                                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{language === 'vi' ? 'Chi phí trung bình / Nhân viên' : 'Average Cost per Staff'}</span>
                                            <span className="text-lg font-black text-emerald-600 mt-0.5">
                                                {formatMoney(cityComparison.dl.averageCostPerStaff)} <span className="text-xs font-normal text-gray-450">{language === 'vi' ? '/ nhân sự' : '/ staff'}</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Comparison Banner (Using Standard Alert/Warning style - bg-amber-50) */}
                            {cityComparison.higherCity && cityComparison.ratioDifferencePct > 0 && (
                                <div className="mt-4 p-3 bg-amber-50 text-amber-800 border border-amber-100 rounded-lg text-xs md:text-sm font-semibold flex items-center gap-2">
                                    <span>📊</span>
                                    <span>
                                        {language === 'vi' ? (
                                            <>
                                                Trung bình, <strong className="text-amber-955">{cityComparison.higherCity}</strong> có chi phí tương đối trên mỗi nhân sự cao hơn <strong className="text-amber-755">{cityComparison.ratioDifferencePct.toFixed(1)}%</strong> so với thành phố còn lại.
                                            </>
                                        ) : (
                                            <>
                                                On average, <strong className="text-amber-955">{cityComparison.higherCity}</strong> has a <strong className="text-amber-755">{cityComparison.ratioDifferencePct.toFixed(1)}%</strong> higher relative cost per staff member than the other city.
                                            </>
                                        )}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Detailed Ranks with Minimalist Tabs (Light Theme - White Card - stretched to match bottom) */}
                        <div className="rounded-lg bg-white shadow p-5 border border-gray-100 text-gray-900 flex flex-col flex-grow justify-between">
                            
                            <div className="flex flex-col flex-grow">
                                {/* Minimalist Tabs Header (Rule-compliant) */}
                                <div className="flex border-b border-gray-200 mb-5 gap-6 px-1 shrink-0">
                                    <button
                                        onClick={() => setActiveRankTab('tardiness')}
                                        className={`pb-3 text-xs font-bold border-b-2 transition-all uppercase tracking-wider outline-none ${
                                            activeRankTab === 'tardiness'
                                                ? 'border-blue-600 text-blue-700'
                                                : 'border-transparent text-gray-400 hover:text-gray-650'
                                        }`}
                                    >
                                        {language === 'vi' ? 'Đi Muộn Nhiều Nhất' : 'Tardiness Rank'}
                                    </button>
                                    <button
                                        onClick={() => setActiveRankTab('overtime')}
                                        className={`pb-3 text-xs font-bold border-b-2 transition-all uppercase tracking-wider outline-none ${
                                            activeRankTab === 'overtime'
                                                ? 'border-blue-600 text-blue-700'
                                                : 'border-transparent text-gray-400 hover:text-gray-650'
                                        }`}
                                    >
                                        {language === 'vi' ? 'Tăng Ca Nhiều Nhất' : 'Top Overtime'}
                                    </button>
                                    <button
                                        onClick={() => setActiveRankTab('service-charge')}
                                        className={`pb-3 text-xs font-bold border-b-2 transition-all uppercase tracking-wider outline-none ${
                                            activeRankTab === 'service-charge'
                                                ? 'border-blue-600 text-blue-700'
                                                : 'border-transparent text-gray-400 hover:text-gray-650'
                                        }`}
                                    >
                                        {language === 'vi' ? 'Nhận Phí Dịch Vụ Nhiều Nhất' : 'Top Service Charge'}
                                    </button>
                                </div>

                                {/* Tab Contents: Tardiness Rank */}
                                {activeRankTab === 'tardiness' && (
                                    <div className="flex-grow flex flex-col justify-between">
                                        <div className="space-y-1">
                                            {topLists.lates.map((item, idx) => (
                                                <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition duration-150 border-b border-gray-100/50 last:border-b-0">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-750 flex items-center justify-center text-xs font-bold">
                                                            {idx + 1}
                                                        </div>
                                                        <div>
                                                            <span className="text-xs font-bold text-gray-900 block leading-tight">{item.full_name}</span>
                                                            <span className="text-[10px] text-gray-450 block mt-0.5">{item.position}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-xs font-extrabold text-amber-600 block leading-none">{item.lates_count}x</span>
                                                        <span className="text-[9px] text-gray-450 block mt-0.5">{item.lates_minutes} {language === 'vi' ? 'phút trễ' : 'min late'}</span>
                                                    </div>
                                                </div>
                                            ))}

                                            {topLists.lates.length === 0 && (
                                                <div className="py-12 text-center text-gray-450 text-xs my-auto">
                                                    <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                                    {language === 'vi' ? 'Không có ai đi trễ trong tháng này!' : `No lates in ${selectedCity}.`}
                                                </div>
                                            )}
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-gray-100 shrink-0">
                                            <Link 
                                                href="/human-resources/time-keeping/attendance" 
                                                className="w-full bg-blue-600/10 hover:bg-blue-600/20 text-blue-655 font-bold px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 group text-xs"
                                            >
                                                {language === 'vi' ? 'Quản lý chuyên cần' : 'Manage Attendance'}
                                                <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                                            </Link>
                                        </div>
                                    </div>
                                )}

                                {/* Tab Contents: Top Overtime */}
                                {activeRankTab === 'overtime' && (
                                    <div className="flex-grow flex flex-col justify-between">
                                        <div className="space-y-1">
                                            {topLists.overtime.map((item, idx) => (
                                                <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition duration-150 border-b border-gray-100/50 last:border-b-0">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-750 flex items-center justify-center text-xs font-bold">
                                                            {idx + 1}
                                                        </div>
                                                        <div>
                                                            <span className="text-xs font-bold text-gray-900 block leading-tight">{item.full_name}</span>
                                                            <span className="text-[10px] text-gray-455 block mt-0.5">{item.position}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-xs font-extrabold text-emerald-600 block leading-none">{item.hours}h</span>
                                                        <span className="text-[9px] text-gray-455 block mt-0.5">{formatMoney(item.cost)}</span>
                                                    </div>
                                                </div>
                                            ))}

                                            {topLists.overtime.length === 0 && (
                                                <div className="py-12 text-center text-gray-450 text-xs my-auto">
                                                    <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                                    {language === 'vi' ? 'Không có giờ làm thêm trong tháng này!' : `No overtime in ${selectedCity}.`}
                                                </div>
                                            )}
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-gray-100 shrink-0">
                                            <Link 
                                                href="/human-resources/time-keeping/overtime" 
                                                className="w-full bg-blue-600/10 hover:bg-blue-600/20 text-blue-655 font-bold px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 group text-xs"
                                            >
                                                {language === 'vi' ? 'Quản lý làm thêm giờ' : 'Manage Overtime'}
                                                <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                                            </Link>
                                        </div>
                                    </div>
                                )}

                                {/* Tab Contents: Top Service Charge */}
                                {activeRankTab === 'service-charge' && (
                                    <div className="flex-grow flex flex-col justify-between">
                                        <div className="space-y-1">
                                            {topLists.serviceCharge.map((item, idx) => (
                                                <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition duration-150 border-b border-gray-100/50 last:border-b-0">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-7 h-7 rounded-full bg-amber-50 text-amber-750 flex items-center justify-center text-xs font-bold">
                                                            {idx + 1}
                                                        </div>
                                                        <div>
                                                            <span className="text-xs font-bold text-gray-900 block leading-tight">{item.full_name}</span>
                                                            <span className="text-[10px] text-gray-455 block mt-0.5">{item.position}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-xs font-extrabold text-amber-600 block leading-none">{formatMoney(item.amount)}</span>
                                                        <span className="text-[9px] text-gray-455 block mt-0.5">{item.hours.toFixed(1)} {language === 'vi' ? 'giờ' : 'hrs'}</span>
                                                    </div>
                                                </div>
                                            ))}

                                            {topLists.serviceCharge.length === 0 && (
                                                <div className="py-12 text-center text-gray-450 text-xs my-auto">
                                                    <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                                    {language === 'vi' ? 'Chưa phân bổ phí dịch vụ tháng này!' : `No service charge in ${selectedCity}.`}
                                                </div>
                                            )}
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-gray-100 shrink-0">
                                            <Link 
                                                href="/human-resources/time-keeping/service-charge" 
                                                className="w-full bg-blue-600/10 hover:bg-blue-600/20 text-blue-655 font-bold px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 group text-xs"
                                            >
                                                {language === 'vi' ? 'Quản lý phí dịch vụ' : 'Manage Service Charge'}
                                                <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                                            </Link>
                                        </div>
                                    </div>
                                )}
                            </div>

                        </div>

                    </div>

                </div>

            </div>
        </div>
    )
}
