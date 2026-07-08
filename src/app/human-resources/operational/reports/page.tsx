'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase_shim'
import {
    ShiftType,
    getShiftTypes, getRosterData, rosterKey, parseRosterKey,
    formatDate, getMonday, addDays, getOvertimeSettings,
    initOperationalDataFromDb
} from '@/lib/hr-operational-data'
import CircularLoader from '@/components/CircularLoader'
import {
    CalendarDays, Clock, Palmtree, Thermometer, Coffee,
    ChevronLeft, ChevronRight, Users, BarChart3, X
} from 'lucide-react'
import { getCurrentUserPermissions } from '@/lib/user-branches'
import { useSettings } from '@/contexts/SettingsContext'

type Period = 'day' | 'week' | 'month' | 'year'
type ViewMode = 'staff' | 'daily'

function formatVND(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value) + ' VND'
}

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

function periodLabel(period: Period, refDate: Date, lang: string): string {
    const locale = lang === 'vi' ? 'vi-VN' : 'en-GB'
    switch (period) {
        case 'day':
            return refDate.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
        case 'week': {
            const monday = getMonday(refDate)
            const sunday = addDays(monday, 6)
            return `${monday.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${sunday.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
        }
        case 'month':
            return refDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
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
    totalOvertime?: number
    byStaff: Record<string, { shifts: number; hours: number; annualLeave: number; sickDays: number; daysOff: number; overtime: number; cost: number; activeDays: number }>
    byDay: Record<string, { staffWorking: number; hours: number; onLeave: number; sick: number; off: number }>
}

export default function ReportsPage() {
    const { language } = useSettings()
    const [loading, setLoading] = useState(true)
    const [branches, setBranches] = useState<{ id: string; name: string; city?: string | null }[]>([])
    const [cities, setCities] = useState<string[]>([])
    const [selectedCity, setSelectedCity] = useState<string>('')
    const [period, setPeriod] = useState<Period>('week')
    const [refDate, setRefDate] = useState(new Date())
    const [viewMode, setViewMode] = useState<ViewMode>('staff')
    const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([])
    const [roster, setRoster] = useState<Record<string, string>>({})
    const [staffList, setStaffList] = useState<{ id: string; name: string; role: string; department: string; position: string; employment_type: string; skill_level: number; salary_amount: number; salary_type: string; branchIds: string[] }[]>([])
    const [staffTypeTab, setStaffTypeTab] = useState<'full_time' | 'part_time' | 'outsourced'>('full_time')
    const [activeDetailStaff, setActiveDetailStaff] = useState<any | null>(null)
    const [holidays, setHolidays] = useState<Record<string, string>>({})

    // Permissions states
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
    const [currentUserBranches, setCurrentUserBranches] = useState<string[] | null>(null)

    const getStaffBreakdown = (staffId: string) => {
        const breakdown: Record<string, { 
            branchName: string; 
            shifts: number; 
            hours: number;
            regularCost: number;
            overtimeCost: number;
            holidayCost: number;
            splitAllowance: number;
            locationAllowance: number;
            totalCost: number;
        }> = {}

        const staff = staffList.find(st => st.id === staffId)
        if (!staff) return []

        const comps = getOvertimeSettings()
        const { start, end } = getDateRange(period, refDate)
        const daysCount = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1

        let current = new Date(start)
        while (current <= end) {
            const dateStr = formatDate(current)
            const isPH = !!holidays[dateStr]

            const dailyBranchHours: Record<string, number> = {}
            const dailyBranchShifts: Record<string, number> = {}
            let dailyWorkHours = 0
            let hasAnyRosterAssignment = false

            branches.forEach(branch => {
                const key = rosterKey(branch.id, staffId, dateStr)
                const stIdsStr = roster[key]
                if (stIdsStr) {
                    hasAnyRosterAssignment = true
                    const stIds = stIdsStr.split(',')
                    stIds.forEach(stId => {
                        const shift = shiftTypes.find(s => s.id === stId)
                        if (shift) {
                            if (shift.type === 'work') {
                                const workValue = stIds.length > 1 ? 0.5 : 1.0
                                dailyBranchShifts[branch.id] = (dailyBranchShifts[branch.id] || 0) + workValue
                                dailyBranchHours[branch.id] = (dailyBranchHours[branch.id] || 0) + shift.hours
                                dailyWorkHours += shift.hours
                            } else {
                                if (!breakdown[branch.id]) {
                                    breakdown[branch.id] = { branchName: branch.name, shifts: 0, hours: 0, regularCost: 0, overtimeCost: 0, holidayCost: 0, splitAllowance: 0, locationAllowance: 0, totalCost: 0 }
                                }
                            }
                        }
                    })
                }
            })

            if (staff.employment_type === 'full_time') {
                const dailyRate = staff.salary_amount / 26
                const hourlyRate = dailyRate / 8

                if (hasAnyRosterAssignment) {
                    const baseProRated = staff.salary_amount / 30
                    if (dailyWorkHours > 0) {
                        Object.keys(dailyBranchHours).forEach(bId => {
                            const bHours = dailyBranchHours[bId]
                            const share = bHours / dailyWorkHours
                            const branch = branches.find(b => b.id === bId)
                            if (branch) {
                                if (!breakdown[bId]) {
                                    breakdown[bId] = { branchName: branch.name, shifts: 0, hours: 0, regularCost: 0, overtimeCost: 0, holidayCost: 0, splitAllowance: 0, locationAllowance: 0, totalCost: 0 }
                                }
                                breakdown[bId].regularCost += baseProRated * share
                            }
                        })
                    } else {
                        const primaryBranchId = staff.branchIds[0] || branches[0]?.id
                        if (primaryBranchId) {
                            const branch = branches.find(b => b.id === primaryBranchId)
                            if (branch) {
                                if (!breakdown[primaryBranchId]) {
                                    breakdown[primaryBranchId] = { branchName: branch.name, shifts: 0, hours: 0, regularCost: 0, overtimeCost: 0, holidayCost: 0, splitAllowance: 0, locationAllowance: 0, totalCost: 0 }
                                }
                                breakdown[primaryBranchId].regularCost += baseProRated
                            }
                        }
                    }
                }

                if (dailyWorkHours > 0) {
                    const stdHours = Math.min(8, dailyWorkHours)
                    const otHours = Math.max(0, dailyWorkHours - 8)

                    Object.keys(dailyBranchHours).forEach(bId => {
                        const bHours = dailyBranchHours[bId]
                        const share = bHours / dailyWorkHours
                        const bStdHours = stdHours * share
                        const bOtHours = otHours * share
                        
                        const branch = branches.find(b => b.id === bId)
                        if (branch) {
                            if (!breakdown[bId]) {
                                breakdown[bId] = { branchName: branch.name, shifts: 0, hours: 0, regularCost: 0, overtimeCost: 0, holidayCost: 0, splitAllowance: 0, locationAllowance: 0, totalCost: 0 }
                            }

                            if (isPH) {
                                const extraWorkPay = bStdHours * hourlyRate * ((comps.public_holiday_work_multiplier ?? 4.0) - 1)
                                const extraOtPay = bOtHours * hourlyRate * (comps.public_holiday_multiplier_salary ?? 2.0)
                                breakdown[bId].holidayCost += extraWorkPay + extraOtPay
                            } else {
                                if (otHours > 0) {
                                    const otPay = bOtHours * hourlyRate * (comps.overtime_multiplier_salary ?? 1.5)
                                    breakdown[bId].overtimeCost += otPay
                                }
                            }
                        }
                    })
                }
            } else {
                if (dailyWorkHours > 0) {
                    const stdHours = Math.min(8, dailyWorkHours)
                    const otHours = Math.max(0, dailyWorkHours - 8)

                    Object.keys(dailyBranchHours).forEach(bId => {
                        const bHours = dailyBranchHours[bId]
                        const share = bHours / dailyWorkHours
                        const bStdHours = stdHours * share
                        const bOtHours = otHours * share

                        const branch = branches.find(b => b.id === bId)
                        if (branch) {
                            if (!breakdown[bId]) {
                                breakdown[bId] = { branchName: branch.name, shifts: 0, hours: 0, regularCost: 0, overtimeCost: 0, holidayCost: 0, splitAllowance: 0, locationAllowance: 0, totalCost: 0 }
                            }

                            if (isPH) {
                                const holidayWorkPay = bStdHours * staff.salary_amount * (comps.public_holiday_work_multiplier ?? 4.0)
                                const holidayOtPay = bOtHours * staff.salary_amount * (comps.public_holiday_multiplier_salary ?? 2.0)
                                breakdown[bId].holidayCost += holidayWorkPay + holidayOtPay
                            } else {
                                const regularPay = bStdHours * staff.salary_amount
                                const otPay = bOtHours * staff.salary_amount * (comps.overtime_multiplier_salary ?? 1.5)
                                breakdown[bId].regularCost += regularPay
                                breakdown[bId].overtimeCost += otPay
                            }
                        }
                    })
                }
            }

            // Calculate operational allowances for this day and distribute to branches
            let dailyAllowance = 0
            let isLocationChange = false
            let isSplitShift = false

            if (dailyWorkHours > 0) {
                const workedBranchesCount = Object.keys(dailyBranchHours).length
                if (workedBranchesCount > 1) {
                    dailyAllowance = comps.location_change_compensation ?? 60000
                    isLocationChange = true
                } else if (workedBranchesCount === 1) {
                    const bId = Object.keys(dailyBranchHours)[0]
                    const key = rosterKey(bId, staffId, dateStr)
                    const stIdsStr = roster[key]
                    if (stIdsStr) {
                        const stIds = stIdsStr.split(',')
                        const workedShiftsInBranch = stIds.filter(id => {
                            const sh = shiftTypes.find(s => s.id === id)
                            return sh && sh.type === 'work'
                        })
                        const hasNativeSplit = workedShiftsInBranch.some(id => {
                            const sh = shiftTypes.find(s => s.id === id)
                            return sh && sh.startTime2
                        })
                        if (hasNativeSplit || workedShiftsInBranch.length > 1) {
                            dailyAllowance = comps.split_shift_compensation ?? 50000
                            isSplitShift = true
                        }
                    }
                }
            }

            if (dailyAllowance > 0) {
                if (isLocationChange) {
                    const workedBranches = Object.keys(dailyBranchHours)
                    const share = dailyAllowance / workedBranches.length
                    workedBranches.forEach(bId => {
                        const branch = branches.find(b => b.id === bId)
                        if (branch) {
                            if (!breakdown[bId]) {
                                breakdown[bId] = { branchName: branch.name, shifts: 0, hours: 0, regularCost: 0, overtimeCost: 0, holidayCost: 0, splitAllowance: 0, locationAllowance: 0, totalCost: 0 }
                            }
                            breakdown[bId].locationAllowance += share
                        }
                    })
                } else if (isSplitShift) {
                    const bId = Object.keys(dailyBranchHours)[0]
                    const branch = branches.find(b => b.id === bId)
                    if (branch) {
                        if (!breakdown[bId]) {
                            breakdown[bId] = { branchName: branch.name, shifts: 0, hours: 0, regularCost: 0, overtimeCost: 0, holidayCost: 0, splitAllowance: 0, locationAllowance: 0, totalCost: 0 }
                        }
                        breakdown[bId].splitAllowance += dailyAllowance
                    }
                }
            }

            Object.keys(dailyBranchHours).forEach(bId => {
                if (breakdown[bId]) {
                    breakdown[bId].shifts += dailyBranchShifts[bId] || 0
                    breakdown[bId].hours += dailyBranchHours[bId] || 0
                }
            })

            current = addDays(current, 1)
        }

        Object.keys(breakdown).forEach(bId => {
            const b = breakdown[bId]
            b.totalCost = b.regularCost + b.overtimeCost + b.holidayCost + b.splitAllowance + b.locationAllowance
        })

        return Object.values(breakdown).filter(b => b.shifts > 0 || b.hours > 0 || b.totalCost > 0)
    }

    useEffect(() => {
        ;(async () => {
            await initOperationalDataFromDb()
            setShiftTypes(getShiftTypes())
            setRoster(getRosterData())

            const perms = await getCurrentUserPermissions()
            const userRole = perms.role
            const userBranches = perms.branches
            setCurrentUserRole(userRole)
            setCurrentUserBranches(userBranches)

            const { data: bData } = await supabase.from('provider_branches').select('id, name, city').order('name')
            if (bData && bData.length > 0) {
                let filteredBranches = bData
                if (userRole && !['owner', 'admin'].includes(userRole) && userBranches) {
                    filteredBranches = filteredBranches.filter(b => userBranches.includes(b.id))
                }
                setBranches(filteredBranches)
                const uniqueCities = Array.from(new Set(filteredBranches.map((b: any) => b.city || 'Unknown'))).filter(c => c !== 'Unknown')
                setCities(uniqueCities)
                if (uniqueCities.length > 0) {
                    setSelectedCity(uniqueCities[0])
                }
            }
            
            const { data: sData } = await supabase
                .from('hr_staff')
                .select(`
                    id, 
                    full_name, 
                    department,
                    position, 
                    employment_type,
                    skill_level,
                    salary_amount,
                    salary_type,
                    hr_staff_branches(branch_id)
                `)
                .eq('status', 'active')

            if (sData) {
                let formatted = sData.map((s: any) => ({
                    id: s.id,
                    name: s.full_name,
                    role: s.position ? `${s.position}${s.employment_type === 'outsourced' ? ' (Outsourced)' : ''}` : (s.employment_type === 'outsourced' ? 'Outsourced' : 'Staff'),
                    department: s.department || 'Unassigned',
                    position: s.position || 'Unassigned',
                    employment_type: s.employment_type,
                    skill_level: s.skill_level || 1,
                    salary_amount: Number(s.salary_amount || 0),
                    salary_type: s.salary_type || 'hourly',
                    branchIds: s.hr_staff_branches?.map((b: any) => b.branch_id) || []
                }))
                if (userRole && !['owner', 'admin'].includes(userRole) && userBranches) {
                    formatted = formatted.filter(s =>
                        s.branchIds.some((bid: string) => userBranches.includes(bid))
                    )
                }
                setStaffList(formatted)
            }

            const { data: hData } = await supabase.from('hr_public_holidays').select('*')
            if (hData) {
                const mapping: Record<string, string> = {}
                hData.forEach((h: any) => {
                    mapping[h.date] = h.name
                })
                setHolidays(mapping)
            }
            
            setLoading(false)
        })()
    }, [])

    const stats = useMemo<Stats>(() => {
        const comps = getOvertimeSettings()
        const result: Stats = {
            totalShifts: 0, totalHours: 0, annualLeave: 0, sickDays: 0, daysOff: 0, totalOvertime: 0,
            byStaff: {}, byDay: {}
        }
        if (!selectedCity) return result

        const branchIdsInCity = branches.filter(b => b.city === selectedCity).map(b => b.id)
        if (branchIdsInCity.length === 0) return result

        const { start, end } = getDateRange(period, refDate)
        const daysCount = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1

        staffList.forEach(staff => {
            result.byStaff[staff.id] = { shifts: 0, hours: 0, annualLeave: 0, sickDays: 0, daysOff: 0, overtime: 0, cost: 0, activeDays: 0 }
        })

        let current = new Date(start)

        while (current <= end) {
            const dateStr = formatDate(current)
            const dayStats = { staffWorking: 0, hours: 0, onLeave: 0, sick: 0, off: 0 }

            staffList.forEach(staff => {
                const cityShiftIds: string[] = []
                branchIdsInCity.forEach(branchId => {
                    const key = rosterKey(branchId, staff.id, dateStr)
                    const stIdsStr = roster[key]
                    if (stIdsStr) {
                        stIdsStr.split(',').forEach(id => {
                            if (!cityShiftIds.includes(id)) {
                                cityShiftIds.push(id)
                            }
                        })
                    }
                })

                if (cityShiftIds.length === 0) return

                result.byStaff[staff.id].activeDays += 1
                let dailyWorkHours = 0

                cityShiftIds.forEach(stId => {
                    const shift = shiftTypes.find(s => s.id === stId)
                    if (!shift) return

                    if (shift.type === 'work') {
                        const workValue = cityShiftIds.length > 1 ? 0.5 : 1.0;
                        result.totalShifts += workValue;
                        result.totalHours += shift.hours;
                        result.byStaff[staff.id].shifts += workValue;
                        result.byStaff[staff.id].hours += shift.hours;
                        dayStats.staffWorking += workValue;
                        dayStats.hours += shift.hours;
                        
                        dailyWorkHours += shift.hours
                    } else {
                        const leaveValue = (shift.allDay ?? true) ? 1 : 0.5;
                        if (shift.code.startsWith('AL')) {
                            result.annualLeave += leaveValue
                            result.byStaff[staff.id].annualLeave += leaveValue
                            dayStats.onLeave += leaveValue
                        } else if (shift.code.startsWith('SD')) {
                            result.sickDays += leaveValue
                            result.byStaff[staff.id].sickDays += leaveValue
                            dayStats.sick += leaveValue
                        } else {
                            result.daysOff += leaveValue
                            result.byStaff[staff.id].daysOff += leaveValue
                            dayStats.off += leaveValue
                        }
                    }
                })

                if (dailyWorkHours > 8) {
                    const ot = dailyWorkHours - 8
                    result.byStaff[staff.id].overtime += ot
                    if (result.totalOvertime !== undefined) {
                        result.totalOvertime += ot
                    }
                }

                // Cost calculation:
                let dailyCost = 0
                const isPH = !!holidays[dateStr]

                if (staff.employment_type === 'full_time') {
                    const dailyRate = staff.salary_amount / 26
                    const hourlyRate = dailyRate / 8
                    
                    if (isPH) {
                        if (dailyWorkHours > 0) {
                            const stdHours = Math.min(8, dailyWorkHours)
                            const otHours = Math.max(0, dailyWorkHours - 8)
                            // Since their monthly salary covers basic pay (x1), we add the extra (multiplier - 1) for std hours,
                            // and the full overtime multiplier for OT hours.
                            dailyCost = (stdHours * hourlyRate * ((comps.public_holiday_work_multiplier ?? 4.0) - 1)) +
                                        (otHours * hourlyRate * (comps.public_holiday_multiplier_salary ?? 2.0))
                        }
                    } else {
                        if (dailyWorkHours > 8) {
                            const otHours = dailyWorkHours - 8
                            dailyCost = otHours * hourlyRate * (comps.overtime_multiplier_salary ?? 1.5)
                        }
                    }
                } else {
                    // Part-time / Outsourced:
                    if (isPH) {
                        if (dailyWorkHours > 0) {
                            const stdHours = Math.min(8, dailyWorkHours)
                            const otHours = Math.max(0, dailyWorkHours - 8)
                            dailyCost = (stdHours * staff.salary_amount * (comps.public_holiday_work_multiplier ?? 4.0)) +
                                        (otHours * staff.salary_amount * (comps.public_holiday_multiplier_salary ?? 2.0))
                        }
                    } else {
                        if (dailyWorkHours > 0) {
                            const stdHours = Math.min(8, dailyWorkHours)
                            const otHours = Math.max(0, dailyWorkHours - 8)
                            dailyCost = (stdHours * staff.salary_amount) +
                                        (otHours * staff.salary_amount * (comps.overtime_multiplier_salary ?? 1.5))
                        }
                    }
                }

                // Add operational allowances: split shift or location change
                let allowance = 0
                const dailyWorkShifts = cityShiftIds.filter(id => {
                    const sh = shiftTypes.find(s => s.id === id)
                    return sh && sh.type === 'work'
                })

                if (dailyWorkShifts.length > 0) {
                    let dailyBranchesWorked: string[] = []
                    branchIdsInCity.forEach(branchId => {
                        const key = rosterKey(branchId, staff.id, dateStr)
                        const stIdsStr = roster[key]
                        if (stIdsStr) {
                            stIdsStr.split(',').forEach(id => {
                                const sh = shiftTypes.find(s => s.id === id)
                                if (sh && sh.type === 'work' && !dailyBranchesWorked.includes(branchId)) {
                                    dailyBranchesWorked.push(branchId)
                                }
                            })
                        }
                    })

                    const workedBranchesCount = dailyBranchesWorked.length
                    if (workedBranchesCount > 1) {
                        allowance = comps.location_change_compensation ?? 60000
                    } else if (workedBranchesCount === 1) {
                        const hasNativeSplit = dailyWorkShifts.some(id => {
                            const sh = shiftTypes.find(s => s.id === id)
                            return sh && sh.startTime2
                        })
                        if (hasNativeSplit || dailyWorkShifts.length > 1) {
                            allowance = comps.split_shift_compensation ?? 50000
                        }
                    }
                }

                dailyCost += allowance
                result.byStaff[staff.id].cost += dailyCost
            })

            result.byDay[dateStr] = dayStats
            current = addDays(current, 1)
        }

        // Add pro-rated contract base salary only for active days scheduled in the roster
        Object.keys(result.byStaff).forEach(staffId => {
            const s = result.byStaff[staffId]
            const staff = staffList.find(st => st.id === staffId)
            if (staff && staff.employment_type === 'full_time' && s.activeDays > 0) {
                const baseProRated = (staff.salary_amount / 30) * s.activeDays
                s.cost += baseProRated
            }
        })

        return result
    }, [selectedCity, branches, roster, shiftTypes, period, refDate, staffList, holidays])

    const displayedStaff = useMemo(() => {
        const branchIdsInCity = branches.filter(b => b.city === selectedCity).map(b => b.id)

        const filtered = staffList.filter(staff => {
            const matchesType = staff.employment_type === staffTypeTab;
            if (!matchesType) return false;

            const hasContract = staff.branchIds.some(bid => branchIdsInCity.includes(bid));
            const hasWorked = stats.byStaff[staff.id] && (stats.byStaff[staff.id].shifts > 0 || stats.byStaff[staff.id].hours > 0);
            return hasContract || hasWorked;
        });

        return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    }, [staffList, selectedCity, branches, stats.byStaff, staffTypeTab])

    const totalHoursForTab = useMemo(() => {
        return displayedStaff.reduce((sum, staff) => {
            const s = stats.byStaff[staff.id];
            return sum + (s ? s.hours : 0);
        }, 0);
    }, [displayedStaff, stats.byStaff])

    const prev = () => setRefDate(navigate(period, refDate, -1))
    const next = () => setRefDate(navigate(period, refDate, 1))
    const goToday = () => setRefDate(new Date())

    if (loading) {
        return <div className="min-h-screen bg-[#0b1530] flex items-center justify-center"><CircularLoader /></div>
    }

    const summaryCards = [
        { label: language === 'vi' ? 'Ca làm việc' : 'Working Shifts', value: stats.totalShifts, icon: CalendarDays, color: 'text-blue-400', bg: 'bg-blue-500/10' },
        { label: language === 'vi' ? 'Tổng số giờ' : 'Total Hours', value: `${stats.totalHours}${language === 'vi' ? 'g' : 'h'}`, icon: Clock, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        { label: language === 'vi' ? 'Nghỉ phép năm' : 'Annual Leave', value: stats.annualLeave, icon: Palmtree, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        { label: language === 'vi' ? 'Nghỉ ốm' : 'Sick Days', value: stats.sickDays, icon: Thermometer, color: 'text-red-400', bg: 'bg-red-500/10' },
        { label: language === 'vi' ? 'Ngày nghỉ' : 'Days Off', value: stats.daysOff, icon: Coffee, color: 'text-gray-400', bg: 'bg-gray-500/10' },
        { label: `${language === 'vi' ? 'Giờ TB/' : 'Avg Hrs/'}${staffTypeTab === 'full_time' ? 'FT' : staffTypeTab === 'part_time' ? 'PT' : 'Outsource'}`, value: `${displayedStaff.length > 0 ? Math.round(totalHoursForTab / displayedStaff.length * 10) / 10 : 0}${language === 'vi' ? 'g' : 'h'}`, icon: BarChart3, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    ]

    const sortedDays = Object.entries(stats.byDay).sort(([a], [b]) => a.localeCompare(b))

    const getDayNameTranslated = (d: Date) => {
        return d.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'short' })
    }

    return (
        <div className="min-h-screen bg-[#0b1530] text-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-white">
                        {language === 'vi' ? 'Báo Cáo & Phân Tích' : 'Reports & Analytics'}
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                        {language === 'vi' ? 'Tổng quan giờ ca, chuyên cần và nghỉ phép.' : 'Shift hours, attendance and leave overview.'}
                    </p>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
                    {/* City Selector */}
                    <select
                        value={selectedCity}
                        onChange={e => setSelectedCity(e.target.value)}
                        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        {cities.map(c => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>

                    {/* Period tabs (Minimalist underline style) */}
                    <div className="flex items-center gap-4 border-b border-white/10 pb-1">
                        {(['day', 'week', 'month', 'year'] as Period[]).map(p => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`pb-1 px-1 text-xs font-semibold capitalize transition-all border-b-2
                                    ${period === p ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-400 hover:text-white'}`}
                            >
                                {p === 'day' ? (language === 'vi' ? 'Ngày' : 'day') : p === 'week' ? (language === 'vi' ? 'Tuần' : 'week') : p === 'month' ? (language === 'vi' ? 'Tháng' : 'month') : (language === 'vi' ? 'Năm' : 'year')}
                            </button>
                        ))}
                    </div>

                    {/* Date navigator */}
                    <div className="flex items-center gap-2 sm:ml-auto">
                        <button onClick={prev} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"><ChevronLeft className="w-5 h-5" /></button>
                        <span className="text-sm font-medium text-white min-w-[180px] text-center">{periodLabel(period, refDate, language)}</span>
                        <button onClick={next} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"><ChevronRight className="w-5 h-5" /></button>
                        <button onClick={goToday} className="ml-2 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition shadow-sm">
                            {language === 'vi' ? 'Hôm nay' : 'Today'}
                        </button>
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

                {/* Main View Mode Tabs (Minimalist underline style) */}
                <div className="flex items-center gap-6 border-b border-white/10 mb-6">
                    <button
                        onClick={() => setViewMode('staff')}
                        className={`pb-2 px-1 text-sm font-semibold transition-all border-b-2 flex items-center gap-2 ${
                            viewMode === 'staff'
                                ? 'border-blue-500 text-blue-500'
                                : 'border-transparent text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        <Users className="w-4 h-4" />
                        {language === 'vi' ? 'Theo nhân viên' : 'By Staff'}
                    </button>
                    <button
                        onClick={() => setViewMode('daily')}
                        className={`pb-2 px-1 text-sm font-semibold transition-all border-b-2 flex items-center gap-2 ${
                            viewMode === 'daily'
                                ? 'border-blue-500 text-blue-500'
                                : 'border-transparent text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        <CalendarDays className="w-4 h-4" />
                        {language === 'vi' ? 'Theo ngày' : 'By Day'}
                    </button>
                </div>

                {/* Sub-tabs for staff types (Minimalist underline style, only when in "By Staff" view) */}
                {viewMode === 'staff' && (
                    <div className="flex items-center gap-6 border-b border-white/5 mb-4 px-2">
                        {(['full_time', 'part_time', 'outsourced'] as const).map(type => (
                            <button
                                key={type}
                                onClick={() => setStaffTypeTab(type)}
                                className={`pb-2 text-xs font-semibold transition-all border-b-2 ${
                                    staffTypeTab === type
                                        ? 'border-blue-500 text-blue-500'
                                        : 'border-transparent text-gray-400 hover:text-gray-200'
                                }`}
                            >
                                {type === 'full_time' ? (language === 'vi' ? 'Toàn thời gian' : 'Full-time') : type === 'part_time' ? (language === 'vi' ? 'Bán thời gian' : 'Part-time') : (language === 'vi' ? 'Nguồn ngoài' : 'Outsourced')}
                            </button>
                        ))}
                    </div>
                )}

                {/* Table */}
                <div className="rounded-2xl bg-white shadow-md overflow-hidden">
                    {viewMode === 'staff' ? (
                        staffTypeTab === 'full_time' ? (
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200">
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">#</th>
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Nhân viên' : 'Staff'}</th>
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Vai trò' : 'Role'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Ca' : 'Shifts'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Giờ' : 'Hours'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Tăng ca' : 'Overtime'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Giờ TB/Ngày' : 'Avg Hrs/Day'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Phép năm' : 'Annual Leave'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Nghỉ ốm' : 'Sick Days'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Ngày nghỉ' : 'Days Off'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Lương tháng' : 'Monthly Salary'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Tổng chi phí' : 'Total Cost'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayedStaff.map((staff, idx) => {
                                        const s = stats.byStaff[staff.id] || { shifts: 0, hours: 0, annualLeave: 0, sickDays: 0, daysOff: 0, overtime: 0 }
                                        const avgHrs = s.shifts > 0 ? Math.round(s.hours / s.shifts * 10) / 10 : 0
                                        return (
                                            <tr key={staff.id} className={`border-t border-gray-100 ${idx % 2 === 0 ? 'bg-gray-50/50' : ''}`}>
                                                <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => setActiveDetailStaff(staff)}
                                                        className="flex items-center gap-2 text-left hover:opacity-80 transition group"
                                                    >
                                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                                            {staff.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                                                        </div>
                                                        <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 group-hover:underline">{staff.name}</span>
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500">{staff.role}</td>
                                                <td className="px-4 py-3 text-center text-sm font-semibold text-blue-600">{s.shifts}</td>
                                                <td className="px-4 py-3 text-center text-sm font-semibold text-emerald-600">{s.hours}{language === 'vi' ? 'g' : 'h'}</td>
                                                <td className="px-4 py-3 text-center text-sm">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${s.overtime > 0 ? 'bg-amber-100 text-amber-700' : 'text-gray-400'}`}>
                                                        {s.overtime > 0 ? `${s.overtime}${language === 'vi' ? 'g' : 'h'}` : `0${language === 'vi' ? 'g' : 'h'}`}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center text-sm text-gray-600">{avgHrs}{language === 'vi' ? 'g' : 'h'}</td>
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
                                                <td className="px-4 py-3 text-center text-sm text-gray-600">{formatVND(staff.salary_amount)}</td>
                                                <td className="px-4 py-3 text-center text-sm font-bold text-red-600">{formatVND(s.cost)}</td>
                                            </tr>
                                        )
                                    })}
                                    {displayedStaff.length === 0 && (
                                        <tr>
                                            <td colSpan={12} className="px-4 py-12 text-center text-gray-400">
                                                {language === 'vi' ? 'Không tìm thấy nhân viên toàn thời gian.' : 'No Full-Time staff found.'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-50 border-t border-gray-200">
                                        <td colSpan={3} className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">
                                            {language === 'vi' ? 'Tổng cộng' : 'Totals'}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-blue-600">
                                            {displayedStaff.reduce((sum, staff) => sum + (stats.byStaff[staff.id]?.shifts || 0), 0)}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-emerald-600">
                                            {displayedStaff.reduce((sum, staff) => sum + (stats.byStaff[staff.id]?.hours || 0), 0)}{language === 'vi' ? 'g' : 'h'}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-amber-600">
                                            {displayedStaff.reduce((sum, staff) => sum + (stats.byStaff[staff.id]?.overtime || 0), 0)}{language === 'vi' ? 'g' : 'h'}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm text-gray-400">—</td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-amber-600">
                                            {displayedStaff.reduce((sum, staff) => sum + (stats.byStaff[staff.id]?.annualLeave || 0), 0)}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-red-600">
                                            {displayedStaff.reduce((sum, staff) => sum + (stats.byStaff[staff.id]?.sickDays || 0), 0)}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-gray-700">
                                            {displayedStaff.reduce((sum, staff) => sum + (stats.byStaff[staff.id]?.daysOff || 0), 0)}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm text-gray-400">—</td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-red-600">
                                            {formatVND(displayedStaff.reduce((sum, staff) => sum + (stats.byStaff[staff.id]?.cost || 0), 0))}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        ) : staffTypeTab === 'part_time' ? (
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200">
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">#</th>
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Nhân viên' : 'Staff'}</th>
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Vai trò' : 'Role'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Ca' : 'Shifts'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Giờ' : 'Hours'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Giờ TB/Ngày' : 'Avg Hrs/Day'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Lương giờ' : 'Hourly Rate'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Tổng chi phí' : 'Total Cost'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayedStaff.map((staff, idx) => {
                                        const s = stats.byStaff[staff.id] || { shifts: 0, hours: 0, annualLeave: 0, sickDays: 0, daysOff: 0 }
                                        const avgHrs = s.shifts > 0 ? Math.round(s.hours / s.shifts * 10) / 10 : 0
                                        return (
                                            <tr key={staff.id} className={`border-t border-gray-100 ${idx % 2 === 0 ? 'bg-gray-50/50' : ''}`}>
                                                <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => setActiveDetailStaff(staff)}
                                                        className="flex items-center gap-2 text-left hover:opacity-80 transition group"
                                                    >
                                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                                            {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                        </div>
                                                        <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 group-hover:underline">{staff.name}</span>
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500">{staff.role}</td>
                                                <td className="px-4 py-3 text-center text-sm font-semibold text-blue-600">{s.shifts}</td>
                                                <td className="px-4 py-3 text-center text-sm font-semibold text-emerald-600">{s.hours}{language === 'vi' ? 'g' : 'h'}</td>
                                                <td className="px-4 py-3 text-center text-sm text-gray-600">{avgHrs}{language === 'vi' ? 'g' : 'h'}</td>
                                                <td className="px-4 py-3 text-center text-sm text-gray-600">{formatVND(staff.salary_amount)}</td>
                                                <td className="px-4 py-3 text-center text-sm font-bold text-red-600">{formatVND(s.cost)}</td>
                                            </tr>
                                        )
                                    })}
                                    {displayedStaff.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                                                {language === 'vi' ? 'Không tìm thấy nhân viên bán thời gian.' : 'No Part-Time staff found.'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-50 border-t border-gray-200">
                                        <td colSpan={3} className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">
                                            {language === 'vi' ? 'Tổng cộng' : 'Totals'}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-blue-600">
                                            {displayedStaff.reduce((sum, staff) => sum + (stats.byStaff[staff.id]?.shifts || 0), 0)}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-emerald-600">
                                            {displayedStaff.reduce((sum, staff) => sum + (stats.byStaff[staff.id]?.hours || 0), 0)}{language === 'vi' ? 'g' : 'h'}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm text-gray-400">—</td>
                                        <td className="px-4 py-3 text-center text-sm text-gray-400">—</td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-red-600">
                                            {formatVND(displayedStaff.reduce((sum, staff) => sum + (stats.byStaff[staff.id]?.cost || 0), 0))}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        ) : (
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200">
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">#</th>
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Nhân viên' : 'Staff'}</th>
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Vai trò' : 'Role'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Ca' : 'Shifts'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Giờ' : 'Hours'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Giờ TB/Ngày' : 'Avg Hrs/Day'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Lương giờ' : 'Hourly Rate'}</th>
                                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Tổng chi phí' : 'Total Cost'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayedStaff.map((staff, idx) => {
                                        const s = stats.byStaff[staff.id] || { shifts: 0, hours: 0, annualLeave: 0, sickDays: 0, daysOff: 0 }
                                        const avgHrs = s.shifts > 0 ? Math.round(s.hours / s.shifts * 10) / 10 : 0
                                        return (
                                            <tr key={staff.id} className={`border-t border-gray-100 ${idx % 2 === 0 ? 'bg-gray-50/50' : ''}`}>
                                                <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => setActiveDetailStaff(staff)}
                                                        className="flex items-center gap-2 text-left hover:opacity-80 transition group"
                                                    >
                                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                                            {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                        </div>
                                                        <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 group-hover:underline">{staff.name}</span>
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500">{staff.role}</td>
                                                <td className="px-4 py-3 text-center text-sm font-semibold text-blue-600">{s.shifts}</td>
                                                <td className="px-4 py-3 text-center text-sm font-semibold text-emerald-600">{s.hours}{language === 'vi' ? 'g' : 'h'}</td>
                                                <td className="px-4 py-3 text-center text-sm text-gray-600">{avgHrs}{language === 'vi' ? 'g' : 'h'}</td>
                                                <td className="px-4 py-3 text-center text-sm text-gray-600">{formatVND(staff.salary_amount)}</td>
                                                <td className="px-4 py-3 text-center text-sm font-bold text-red-600">{formatVND(s.cost)}</td>
                                            </tr>
                                        )
                                    })}
                                    {displayedStaff.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                                                {language === 'vi' ? 'Không tìm thấy nhân viên nguồn ngoài.' : 'No Outsourced staff found.'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-50 border-t border-gray-200">
                                        <td colSpan={3} className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">
                                            {language === 'vi' ? 'Tổng cộng' : 'Totals'}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-blue-600">
                                            {displayedStaff.reduce((sum, staff) => sum + (stats.byStaff[staff.id]?.shifts || 0), 0)}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-emerald-600">
                                            {displayedStaff.reduce((sum, staff) => sum + (stats.byStaff[staff.id]?.hours || 0), 0)}{language === 'vi' ? 'g' : 'h'}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm text-gray-400">—</td>
                                        <td className="px-4 py-3 text-center text-sm text-gray-400">—</td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-red-600">
                                            {formatVND(displayedStaff.reduce((sum, staff) => sum + (stats.byStaff[staff.id]?.cost || 0), 0))}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        )
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Ngày' : 'Date'}</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Thứ' : 'Day'}</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Nhân sự hoạt động' : 'Staff Working'}</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Tổng số giờ' : 'Total Hours'}</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Nghỉ phép' : 'On Leave'}</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Nghỉ bệnh' : 'Sick'}</th>
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{language === 'vi' ? 'Nghỉ ca' : 'Off'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedDays.map(([dateStr, d], idx) => {
                                    const dt = new Date(dateStr + 'T00:00:00')
                                    const isToday = dateStr === formatDate(new Date())
                                    return (
                                        <tr key={dateStr} className={`border-t border-gray-100 ${isToday ? 'bg-blue-50' : idx % 2 === 0 ? 'bg-gray-50/50' : ''}`}>
                                            <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                                                {dt.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                {isToday && <span className="ml-2 text-xs text-blue-600 font-normal">{language === 'vi' ? '(hôm nay)' : '(today)'}</span>}
                                                {holidays[dateStr] && (
                                                    <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-100" title={holidays[dateStr]}>
                                                        {holidays[dateStr]}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500">{getDayNameTranslated(dt)}</td>
                                            <td className="px-4 py-3 text-center text-sm font-semibold text-blue-600">{d.staffWorking}</td>
                                            <td className="px-4 py-3 text-center text-sm font-semibold text-emerald-600">{d.hours}{language === 'vi' ? 'g' : 'h'}</td>
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
                                        <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                                            {language === 'vi' ? 'Không có dữ liệu trong khoảng thời gian đã chọn.' : 'No data for the selected period.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Breakdown Modal */}
            {activeDetailStaff && (() => {
                const breakdown = getStaffBreakdown(activeDetailStaff.id)
                const s = stats.byStaff[activeDetailStaff.id] || { shifts: 0, hours: 0, annualLeave: 0, sickDays: 0, daysOff: 0, overtime: 0, cost: 0, activeDays: 0 }
                const totalShifts = breakdown.reduce((sum, b) => sum + b.shifts, 0)
                const totalHours = breakdown.reduce((sum, b) => sum + b.hours, 0)
                const totalRegularCost = breakdown.reduce((sum, b) => sum + b.regularCost, 0)
                const totalOvertimeCost = breakdown.reduce((sum, b) => sum + b.overtimeCost, 0)
                const totalHolidayCost = breakdown.reduce((sum, b) => sum + b.holidayCost, 0)
                const totalSplitAllowance = breakdown.reduce((sum, b) => sum + b.splitAllowance, 0)
                const totalLocationAllowance = breakdown.reduce((sum, b) => sum + b.locationAllowance, 0)
                const totalCost = breakdown.reduce((sum, b) => sum + b.totalCost, 0)
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setActiveDetailStaff(null)}>
                        <div 
                            className="bg-white rounded-2xl border border-gray-200 w-full max-w-[95vw] lg:max-w-7xl shadow-2xl overflow-hidden flex flex-col"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                                        {activeDetailStaff.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-gray-900">{activeDetailStaff.name}</h3>
                                        <p className="text-xs text-gray-500 capitalize">{activeDetailStaff.role.replace('_', ' ')}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setActiveDetailStaff(null)} 
                                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="py-6 overflow-y-auto max-h-[75vh] space-y-5">
                                {/* Summary Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6">
                                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                                        <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                            {language === 'vi' ? 'Hợp đồng & Lương' : 'Employment & Rate'}
                                        </span>
                                        <span className="block text-xs font-bold text-gray-900 capitalize mt-0.5 whitespace-nowrap">
                                            {activeDetailStaff.employment_type === 'full_time' ? (language === 'vi' ? 'Toàn thời gian' : 'Full-time') : activeDetailStaff.employment_type === 'part_time' ? (language === 'vi' ? 'Bán thời gian' : 'Part-time') : (language === 'vi' ? 'Nguồn ngoài' : 'Outsourced')}
                                        </span>
                                        <span className="block text-[10px] text-gray-500 mt-0.5 whitespace-nowrap">
                                            {activeDetailStaff.employment_type === 'full_time' 
                                                ? `${formatVND(activeDetailStaff.salary_amount)} / ${language === 'vi' ? 'tháng' : 'month'}` 
                                                : `${formatVND(activeDetailStaff.salary_amount)} / ${language === 'vi' ? 'giờ' : 'hour'}`}
                                        </span>
                                    </div>
                                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                                        <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                            {language === 'vi' ? 'Số ngày hoạt động' : 'Roster Active Days'}
                                        </span>
                                        <span className="block text-xs font-bold text-gray-900 mt-0.5 whitespace-nowrap">
                                            {s.activeDays} {language === 'vi' ? 'ngày hoạt động' : 'days active'}
                                        </span>
                                        <span className="block text-[10px] text-blue-600 font-semibold mt-0.5 whitespace-nowrap">
                                            {s.shifts} {language === 'vi' ? 'ca làm việc' : 'shifts total'}
                                        </span>
                                    </div>
                                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                                        <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                            {language === 'vi' ? 'Giờ đã làm' : 'Worked Hours'}
                                        </span>
                                        <span className="block text-xs font-bold text-emerald-600 mt-0.5 whitespace-nowrap">
                                            {s.hours}{language === 'vi' ? 'g' : 'h'} {language === 'vi' ? 'tổng cộng' : 'total'}
                                        </span>
                                        <span className="block text-[10px] text-amber-600 font-semibold mt-0.5 whitespace-nowrap">
                                            {s.overtime}{language === 'vi' ? 'g' : 'h'} {language === 'vi' ? 'tăng ca' : 'overtime'}
                                        </span>
                                    </div>
                                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                                        <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                            {language === 'vi' ? 'Nghỉ phép & Nghỉ DO' : 'Leaves & DO'}
                                        </span>
                                        <span className="block text-xs font-bold text-gray-900 mt-0.5 whitespace-nowrap">
                                            DO: {s.daysOff} {language === 'vi' ? 'ngày' : 'days'}
                                        </span>
                                        <span className="block text-[10px] text-gray-500 mt-0.5 whitespace-nowrap">
                                            AL: {s.annualLeave} | SD: {s.sickDays}
                                        </span>
                                    </div>
                                </div>

                                <div className="px-6 space-y-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                                        {language === 'vi' ? 'Chi tiết giờ làm & chi phí theo chi nhánh' : 'Branch Hours & Cost Breakdown'}
                                    </h4>
                                    
                                    <div className="rounded-xl border border-gray-100 overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-gray-50 border-b border-gray-150 text-gray-400 font-semibold text-[9px] uppercase tracking-wider">
                                                    <th className="text-left px-2.5 py-2.5">{language === 'vi' ? 'Chi nhánh' : 'Branch'}</th>
                                                    <th className="text-center px-2.5 py-2.5">{language === 'vi' ? 'Ca' : 'Shifts'}</th>
                                                    <th className="text-center px-2.5 py-2.5">{language === 'vi' ? 'Giờ' : 'Hours'}</th>
                                                    <th className="text-right px-2.5 py-2.5">{language === 'vi' ? 'Chi phí gốc' : 'Base Cost'}</th>
                                                    <th className="text-right px-2.5 py-2.5 text-amber-600">{language === 'vi' ? 'Chi phí tăng ca' : 'Overtime Cost'}</th>
                                                    <th className="text-right px-2.5 py-2.5 text-rose-600">{language === 'vi' ? 'Chi phí ngày lễ' : 'Holiday Cost'}</th>
                                                    <th className="text-right px-2.5 py-2.5 text-yellow-600">{language === 'vi' ? 'Phụ cấp ca gãy' : 'Split Allowance'}</th>
                                                    <th className="text-right px-2.5 py-2.5 text-blue-600">{language === 'vi' ? 'Phụ cấp địa điểm' : 'Loc. Allowance'}</th>
                                                    <th className="text-right px-2.5 py-2.5 font-bold text-gray-700">{language === 'vi' ? 'Tổng chi phí' : 'Total Cost'}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 text-[11px]">
                                                {breakdown.map((b) => {
                                                    return (
                                                        <tr key={b.branchName} className="text-gray-900 hover:bg-gray-50/50">
                                                            <td className="px-2.5 py-2.5 font-semibold text-gray-700 whitespace-nowrap">{b.branchName}</td>
                                                            <td className="px-2.5 py-2.5 text-center text-blue-600 font-bold whitespace-nowrap">{b.shifts}</td>
                                                            <td className="px-2.5 py-2.5 text-center text-emerald-600 font-bold whitespace-nowrap">{b.hours}{language === 'vi' ? 'g' : 'h'}</td>
                                                            <td className="px-2.5 py-2.5 text-right text-gray-600 whitespace-nowrap">{formatVND(b.regularCost)}</td>
                                                            <td className="px-2.5 py-2.5 text-right text-amber-600 font-bold whitespace-nowrap">{formatVND(b.overtimeCost)}</td>
                                                            <td className="px-2.5 py-2.5 text-right text-rose-600 font-bold whitespace-nowrap">{formatVND(b.holidayCost)}</td>
                                                            <td className="px-2.5 py-2.5 text-right text-yellow-600 font-bold whitespace-nowrap">{formatVND(b.splitAllowance)}</td>
                                                            <td className="px-2.5 py-2.5 text-right text-blue-600 font-bold whitespace-nowrap">{formatVND(b.locationAllowance)}</td>
                                                            <td className="px-2.5 py-2.5 text-right font-bold text-gray-900 whitespace-nowrap">{formatVND(b.totalCost)}</td>
                                                        </tr>
                                                    )
                                                })}
                                                {breakdown.length === 0 && (
                                                    <tr>
                                                        <td colSpan={9} className="px-2.5 py-8 text-center text-gray-400 text-[11px] italic">
                                                            {language === 'vi' ? 'Không có ca làm việc nào được ghi nhận.' : 'No shifts recorded in this period.'}
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                            {breakdown.length > 0 && (
                                                <tfoot>
                                                    <tr className="bg-gray-50 border-t border-gray-150 text-[11px] font-bold text-gray-900">
                                                        <td className="px-2.5 py-3 text-gray-500 uppercase font-bold whitespace-nowrap">{language === 'vi' ? 'Tổng cộng' : 'Total'}</td>
                                                        <td className="px-2.5 py-3 text-center text-blue-600 font-bold whitespace-nowrap">{totalShifts}</td>
                                                        <td className="px-2.5 py-3 text-center text-emerald-600 font-bold whitespace-nowrap">{totalHours}{language === 'vi' ? 'g' : 'h'}</td>
                                                        <td className="px-2.5 py-3 text-right text-gray-700 font-bold whitespace-nowrap">{formatVND(totalRegularCost)}</td>
                                                        <td className="px-2.5 py-3 text-right text-amber-600 font-bold whitespace-nowrap">{formatVND(totalOvertimeCost)}</td>
                                                        <td className="px-2.5 py-3 text-right text-rose-600 font-bold whitespace-nowrap">{formatVND(totalHolidayCost)}</td>
                                                        <td className="px-2.5 py-3 text-right text-yellow-600 font-bold whitespace-nowrap">{formatVND(totalSplitAllowance)}</td>
                                                        <td className="px-2.5 py-3 text-right text-blue-600 font-bold whitespace-nowrap">{formatVND(totalLocationAllowance)}</td>
                                                        <td className="px-2.5 py-3 text-right font-bold text-red-600 whitespace-nowrap">{formatVND(totalCost)}</td>
                                                    </tr>
                                                </tfoot>
                                            )}
                                        </table>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="flex justify-end items-center gap-3 p-4 border-t border-gray-200 bg-gray-50">
                                <button 
                                    onClick={() => setActiveDetailStaff(null)}
                                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm"
                                >
                                    {language === 'vi' ? 'Đóng' : 'Close'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })()}
        </div>
    )
}
