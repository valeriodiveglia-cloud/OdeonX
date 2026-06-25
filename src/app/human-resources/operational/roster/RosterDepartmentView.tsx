'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ShiftType, rosterKey, formatDate, addDays, dayName, formatWeekRange, saveRosterData, saveShiftTypes, shiftsOverlap, getStaffCrossBranchShifts } from '@/lib/hr-operational-data'
import { ChevronLeft, ChevronRight, ChevronDown, Plus, X, User, AlertTriangle, MapPin } from 'lucide-react'

// ── Types ──
interface StaffMember {
    id: string
    name: string
    role: string
    department: string
    position: string
    employment_type: string
    skill_level: number
    branchIds: string[]
}

interface RosterDepartmentViewProps {
    branches: { id: string; name: string }[]
    selectedBranch: string
    weekStart: Date
    weekDays: Date[]
    roster: Record<string, string>
    setRoster: (r: Record<string, string>) => void
    shiftTypes: ShiftType[]
    setShiftTypes: (types: ShiftType[]) => void
    displayedStaff: StaffMember[]
    language: string
    getBranchName: (id: string) => string
    prevWeek: () => void
    nextWeek: () => void
    goToday: () => void
    onOpenBorrowModal: () => void
    selectedDayIndex: number
    setSelectedDayIndex: (idx: number) => void
    getDayCoverageStatus: (dateStr: string, dayIndex: number) => { met: boolean; errors: string[]; totalTargets: number }
    onViewCoverage: (dateStr: string) => void
    autoScheduleTimeSlots: any[]
}

// ── Constants ──
const TIMELINE_START = 6   // 06:00
const TIMELINE_END = 30    // 06:00 next day (24-hour coverage)
const TIMELINE_HOURS = TIMELINE_END - TIMELINE_START // 24
const SNAP_MINUTES = 30
const MIN_DURATION_MINUTES = 30

function parseTime(t: string): number {
    const [h, m] = t.split(':').map(Number)
    let hour = h + m / 60
    if (hour < TIMELINE_START) hour += 24
    return hour
}

function formatHour(h: number): string {
    const hh = Math.floor(h % 24)
    const mm = Math.round((h % 1) * 60)
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function snapToGrid(hours: number): number {
    const snap = SNAP_MINUTES / 60
    return Math.round(hours / snap) * snap
}

export default function RosterDepartmentView({
    branches,
    selectedBranch,
    weekStart,
    weekDays,
    roster,
    setRoster,
    shiftTypes,
    setShiftTypes,
    displayedStaff,
    language,
    getBranchName,
    prevWeek,
    nextWeek,
    goToday,
    onOpenBorrowModal,
    selectedDayIndex,
    setSelectedDayIndex,
    getDayCoverageStatus,
    onViewCoverage,
    autoScheduleTimeSlots,
}: RosterDepartmentViewProps) {

    const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set())
    const [addSlotDept, setAddSlotDept] = useState<string | null>(null)
    const [editShiftStaffId, setEditShiftStaffId] = useState<string | null>(null)
    const [isMounted, setIsMounted] = useState(false)
    const [popoverAnchorRect, setPopoverAnchorRect] = useState<DOMRect | null>(null)
    const [selectedStaffForAdd, setSelectedStaffForAdd] = useState<{ id: string; name: string } | null>(null)

    useEffect(() => {
        setIsMounted(true)
    }, [])
    const [dragInfo, setDragInfo] = useState<{
        staffId: string
        edge: 'left' | 'right' | 'move'
        part: 1 | 2
        initialMouseX: number
        initialStart: number
        initialEnd: number
    } | null>(null)
    const [activeDrag, setActiveDrag] = useState<{
        staffId: string
        part: 1 | 2
        start: number
        end: number
    } | null>(null)
    
    const activeDragRef = useRef(activeDrag)
    useEffect(() => {
        activeDragRef.current = activeDrag
    }, [activeDrag])

    const timelineRef = useRef<HTMLDivElement>(null)

    const week1Days = useMemo(() => {
        return weekDays.map(d => addDays(d, -7))
    }, [weekDays])

    const week2Days = weekDays

    const week3Days = useMemo(() => {
        return weekDays.map(d => addDays(d, 7))
    }, [weekDays])

    const week4Days = useMemo(() => {
        return weekDays.map(d => addDays(d, 14))
    }, [weekDays])

    const selectedDate = useMemo(() => {
        if (selectedDayIndex < 7) {
            return week1Days[selectedDayIndex]
        } else if (selectedDayIndex < 14) {
            return week2Days[selectedDayIndex - 7]
        } else if (selectedDayIndex < 21) {
            return week3Days[selectedDayIndex - 14]
        } else {
            return week4Days[selectedDayIndex - 21]
        }
    }, [selectedDayIndex, week1Days, week2Days, week3Days, week4Days])

    const selectedDateStr = formatDate(selectedDate)
    const todayStr = formatDate(new Date())

    // ── Get department target coverage ──
    const getDeptCoverage = useCallback((dept: string) => {
        const dayIndexInWeek = (selectedDate.getDay() + 6) % 7
        const branchSlots = autoScheduleTimeSlots.filter(s => s.branchId === selectedBranch)
        
        const currentPoints: Record<string, number> = {}
        const parseTimeStr = (t: string) => {
            const [h, m] = t.split(':').map(Number)
            return h * 60 + m
        }
        const coversSlot = (shift: ShiftType, slotStart: string, slotEnd: string) => {
            if (!shift.startTime || !shift.endTime) return false
            const sStart = parseTimeStr(shift.startTime)
            const sEnd = parseTimeStr(shift.endTime) < sStart ? parseTimeStr(shift.endTime) + 24 * 60 : parseTimeStr(shift.endTime)
            const lStart = parseTimeStr(slotStart)
            const lEnd = parseTimeStr(slotEnd) < lStart ? parseTimeStr(slotEnd) + 24 * 60 : parseTimeStr(slotEnd)
            return sStart <= lStart && sEnd >= lEnd
        }

        displayedStaff.forEach(staff => {
            if ((staff.department || 'Unassigned') !== dept) return
            const key = rosterKey(selectedBranch, staff.id, selectedDateStr)
            const assignedShiftId = roster[key]
            if (assignedShiftId) {
                const assignedShift = shiftTypes.find(s => s.id === assignedShiftId)
                if (assignedShift && assignedShift.type === 'work') {
                    branchSlots.forEach(slot => {
                        if (coversSlot(assignedShift, slot.startTime, slot.endTime)) {
                            currentPoints[slot.id] = (currentPoints[slot.id] || 0) + (staff.skill_level || 1)
                        }
                    })
                }
            }
        })

        const slotsStatus: { name: string; current: number; target: number; met: boolean }[] = []

        branchSlots.forEach(slot => {
            const targets = slot.targets || {}
            if (targets[dept]) {
                const target = targets[dept][dayIndexInWeek] || 0
                if (target > 0) {
                    const pts = currentPoints[slot.id] || 0
                    slotsStatus.push({
                        name: slot.name,
                        current: pts,
                        target: target,
                        met: pts >= target
                    })
                }
            }
        })

        return slotsStatus
    }, [selectedBranch, selectedDate, selectedDateStr, autoScheduleTimeSlots, displayedStaff, roster, shiftTypes])

    // ── Render single day button helper ──
    const renderDayButton = useCallback((day: Date, idx: number) => {
        const ds = formatDate(day)
        const isToday = ds === todayStr
        const isActive = idx === selectedDayIndex
        const weekdayIdx = (day.getDay() + 6) % 7
        const coverage = getDayCoverageStatus(ds, weekdayIdx)

        let targetBandColor = 'bg-transparent'
        if (coverage.totalTargets > 0) {
            targetBandColor = coverage.met ? 'bg-emerald-500' : 'bg-red-500'
        }

        return (
            <button
                key={ds}
                type="button"
                onClick={() => setSelectedDayIndex(idx)}
                className={`relative flex flex-col items-center px-1.5 pt-1 pb-3 rounded-lg transition-all min-w-[32px] sm:min-w-[34px] md:min-w-[36px] border
                    ${isActive
                        ? 'bg-blue-600 text-white shadow-md border-blue-600'
                        : 'hover:bg-gray-100 text-gray-700 border-transparent'
                    }`}
            >
                <span className={`text-[8px] uppercase tracking-wider font-semibold
                    ${isActive ? 'text-blue-100' : isToday ? 'text-blue-500' : 'text-gray-400'}`}>
                    {dayName(day).slice(0, 3)}
                </span>
                <span className="text-xs font-bold mt-0.5">
                    {day.getDate()}
                </span>
                {isToday && !isActive && (
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-0.5" />
                )}
                <div className={`absolute bottom-1 left-1.5 right-1.5 h-[3px] rounded-full ${targetBandColor}`} />
            </button>
        )
    }, [selectedDayIndex, todayStr, getDayCoverageStatus, setSelectedDayIndex])

    // ── Group staff by department ──
    const groupedByDept = useMemo(() => {
        const groups: Record<string, StaffMember[]> = {}
        displayedStaff.forEach(s => {
            const dept = s.department || 'Unassigned'
            if (!groups[dept]) groups[dept] = []
            groups[dept].push(s)
        })
        return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
    }, [displayedStaff])

    // ── Get shift data for a staff member on selected day ──
    const getStaffShift = useCallback((staffId: string): ShiftType | null => {
        const key = rosterKey(selectedBranch, staffId, selectedDateStr)
        const shiftId = roster[key]
        if (!shiftId) return null
        return shiftTypes.find(s => s.id === shiftId) || null
    }, [selectedBranch, selectedDateStr, roster, shiftTypes])

    // ── Staff with shifts for this day, grouped by dept ──
    const staffWithShifts = useMemo(() => {
        const result: Record<string, { staff: StaffMember; shift: ShiftType }[]> = {}
        groupedByDept.forEach(([dept, members]) => {
            result[dept] = members
                .map(staff => {
                    const shift = getStaffShift(staff.id)
                    return shift ? { staff, shift } : null
                })
                .filter((r): r is { staff: StaffMember; shift: ShiftType } => r !== null && r.shift.type === 'work')
        })
        return result
    }, [groupedByDept, getStaffShift])

    // ── Available staff (not assigned) for a department ──
    const getAvailableStaff = useCallback((dept: string): StaffMember[] => {
        return displayedStaff.filter(s => {
            if ((s.department || 'Unassigned') !== dept) return false
            const key = rosterKey(selectedBranch, s.id, selectedDateStr)
            return !roster[key]
        })
    }, [displayedStaff, selectedBranch, selectedDateStr, roster])

    // ── Assign a shift to staff ──
    const assignShiftToStaff = useCallback((staffId: string) => {
        const workShifts = shiftTypes.filter(s => s.type === 'work')
        const defaultShift = workShifts.find(s => s.code === 'M') || workShifts[0]
        if (!defaultShift) return

        // CHECK FOR CROSS-BRANCH CONFLICTS
        let hasBranchConflict = false
        let conflictBranchName = ''
        let conflictShiftName = ''
        
        if (!defaultShift.globalAcrossBranches) {
            for (const b of branches) {
                if (b.id === selectedBranch) continue
                const key = rosterKey(b.id, staffId, selectedDateStr)
                const otherShiftId = roster[key]
                if (otherShiftId) {
                    const otherShift = shiftTypes.find(s => s.id === otherShiftId)
                    if (otherShift && shiftsOverlap(defaultShift, otherShift)) {
                        hasBranchConflict = true
                        conflictBranchName = getBranchName(b.id)
                        conflictShiftName = otherShift.name
                        break
                    }
                }
            }
        }

        if (hasBranchConflict) {
            const errMsg = language === 'vi'
                ? `Không thể thay đổi: Nhân viên này đã được phân công vào ca "${conflictShiftName}" tại chi nhánh "${conflictBranchName}" cùng ngày!`
                : `Cannot assign: This staff member is already assigned to shift "${conflictShiftName}" at branch "${conflictBranchName}" on this day!`
            alert(errMsg)
            setAddSlotDept(null)
            return
        }

        const newRoster = { ...roster }
        if (defaultShift.globalAcrossBranches) {
            branches.forEach(b => {
                newRoster[rosterKey(b.id, staffId, selectedDateStr)] = defaultShift.id
            })
        } else {
            const key = rosterKey(selectedBranch, staffId, selectedDateStr)
            newRoster[key] = defaultShift.id
        }

        setRoster(newRoster)
        saveRosterData(newRoster)
        setAddSlotDept(null)
    }, [shiftTypes, selectedBranch, selectedDateStr, roster, setRoster, branches, getBranchName, language])

    // ── Assign a specific shift type to staff ──
    const assignSpecificShift = useCallback((staffId: string, shiftId: string) => {
        const matchingShift = shiftTypes.find(s => s.id === shiftId)
        if (!matchingShift) return

        // CHECK FOR CROSS-BRANCH CONFLICTS
        let hasBranchConflict = false
        let conflictBranchName = ''
        let conflictShiftName = ''
        
        if (!matchingShift.globalAcrossBranches) {
            for (const b of branches) {
                if (b.id === selectedBranch) continue
                const key = rosterKey(b.id, staffId, selectedDateStr)
                const otherShiftId = roster[key]
                if (otherShiftId) {
                    const otherShift = shiftTypes.find(s => s.id === otherShiftId)
                    if (otherShift && shiftsOverlap(matchingShift, otherShift)) {
                        hasBranchConflict = true
                        conflictBranchName = getBranchName(b.id)
                        conflictShiftName = otherShift.name
                        break
                    }
                }
            }
        }

        if (hasBranchConflict) {
            const errMsg = language === 'vi'
                ? `Không thể thay đổi: Nhân viên này đã được phân công vào ca "${conflictShiftName}" tại chi nhánh "${conflictBranchName}" cùng ngày!`
                : `Cannot assign: This staff member is already assigned to shift "${conflictShiftName}" at branch "${conflictBranchName}" on this day!`
            alert(errMsg)
            return
        }

        const newRoster = { ...roster }
        if (matchingShift.globalAcrossBranches) {
            branches.forEach(b => {
                newRoster[rosterKey(b.id, staffId, selectedDateStr)] = shiftId
            })
        } else {
            const key = rosterKey(selectedBranch, staffId, selectedDateStr)
            newRoster[key] = shiftId
        }

        setRoster(newRoster)
        saveRosterData(newRoster)
    }, [shiftTypes, selectedBranch, selectedDateStr, roster, setRoster, branches, getBranchName, language])

    // ── Remove a shift ──
    const removeShift = useCallback((staffId: string) => {
        const key = rosterKey(selectedBranch, staffId, selectedDateStr)
        const currentShiftId = roster[key]
        const currentShift = currentShiftId ? shiftTypes.find(s => s.id === currentShiftId) : null
        const newRoster = { ...roster }

        if (currentShift?.globalAcrossBranches) {
            branches.forEach(b => {
                delete newRoster[rosterKey(b.id, staffId, selectedDateStr)]
            })
        } else {
            delete newRoster[key]
        }

        setRoster(newRoster)
        saveRosterData(newRoster)
    }, [selectedBranch, selectedDateStr, roster, shiftTypes, branches, setRoster])

    // ── Toggle department collapse ──
    const toggleDept = (dept: string) => {
        setCollapsedDepts(prev => {
            const next = new Set(prev)
            if (next.has(dept)) next.delete(dept)
            else next.add(dept)
            return next
        })
    }

    // ── Drag & Resize ──
    const handleDragStart = useCallback((
        e: React.MouseEvent,
        staffId: string,
        edge: 'left' | 'right' | 'move',
        shift: ShiftType,
        part: 1 | 2 = 1
    ) => {
        e.preventDefault()
        e.stopPropagation()
        const start = part === 1 ? parseTime(shift.startTime) : parseTime(shift.startTime2 || '')
        const end = part === 1 ? parseTime(shift.endTime) : parseTime(shift.endTime2 || '')
        setDragInfo({
            staffId,
            edge,
            part,
            initialMouseX: e.clientX,
            initialStart: start,
            initialEnd: end,
        })
        setActiveDrag({
            staffId,
            part,
            start,
            end,
        })
    }, [])

    useEffect(() => {
        if (!dragInfo) return

        const handleMouseMove = (e: MouseEvent) => {
            if (!timelineRef.current) return
            const rect = timelineRef.current.getBoundingClientRect()
            const pxPerHour = rect.width / TIMELINE_HOURS
            const deltaX = e.clientX - dragInfo.initialMouseX
            const deltaHours = deltaX / pxPerHour

            let newStart = dragInfo.initialStart
            let newEnd = dragInfo.initialEnd

            if (dragInfo.edge === 'left') {
                newStart = snapToGrid(dragInfo.initialStart + deltaHours)
                newStart = Math.max(TIMELINE_START, Math.min(newStart, newEnd - MIN_DURATION_MINUTES / 60))
            } else if (dragInfo.edge === 'right') {
                newEnd = snapToGrid(dragInfo.initialEnd + deltaHours)
                newEnd = Math.min(TIMELINE_END, Math.max(newEnd, newStart + MIN_DURATION_MINUTES / 60))
            } else if (dragInfo.edge === 'move') {
                const duration = dragInfo.initialEnd - dragInfo.initialStart
                newStart = snapToGrid(dragInfo.initialStart + deltaHours)
                
                // Limiti della timeline
                if (newStart < TIMELINE_START) {
                    newStart = TIMELINE_START
                }
                newEnd = newStart + duration
                if (newEnd > TIMELINE_END) {
                    newEnd = TIMELINE_END
                    newStart = newEnd - duration
                }
            }

            setActiveDrag({
                staffId: dragInfo.staffId,
                part: dragInfo.part,
                start: newStart,
                end: newEnd,
            })
        }

        const handleMouseUp = () => {
            const currentDrag = activeDragRef.current
            if (currentDrag) {
                const { staffId, part, start, end } = currentDrag
                const startStr = formatHour(start)
                const endStr = formatHour(end % 24)

                // Get current shift
                const currentShift = getStaffShift(staffId)
                if (currentShift) {
                    let matchingShift: ShiftType | undefined
                    const isSplit = !!(currentShift.startTime2 && currentShift.endTime2)

                    if (isSplit) {
                        const finalStart1 = part === 1 ? startStr : currentShift.startTime
                        const finalEnd1 = part === 1 ? endStr : currentShift.endTime
                        const finalStart2 = part === 2 ? startStr : currentShift.startTime2!
                        const finalEnd2 = part === 2 ? endStr : currentShift.endTime2!

                        matchingShift = shiftTypes.find(s =>
                            s.type === 'work' &&
                            s.startTime === finalStart1 && s.endTime === finalEnd1 &&
                            s.startTime2 === finalStart2 && s.endTime2 === finalEnd2
                        )

                        if (!matchingShift) {
                            const code = 'XS'
                            
                            const parseToNum = (t: string) => {
                                const [h, m] = t.split(':').map(Number)
                                let val = h + m / 60
                                if (val < TIMELINE_START) val += 24
                                return val
                            }
                            const h1 = parseToNum(finalEnd1) - parseToNum(finalStart1)
                            const h2 = parseToNum(finalEnd2) - parseToNum(finalStart2)

                            const newShift: ShiftType = {
                                id: `st-custom-${Date.now()}`,
                                name: `Custom ${finalStart1}–${finalEnd1} & ${finalStart2}–${finalEnd2}`,
                                code: code,
                                startTime: finalStart1,
                                endTime: finalEnd1,
                                startTime2: finalStart2,
                                endTime2: finalEnd2,
                                color: currentShift.color || '#06B6D4',
                                type: 'work',
                                hours: h1 + h2,
                                allowParallel: currentShift.allowParallel,
                                globalAcrossBranches: currentShift.globalAcrossBranches,
                                isCustom: true
                            }
                            matchingShift = newShift
                        }
                    } else {
                        matchingShift = shiftTypes.find(s =>
                            s.type === 'work' && s.startTime === startStr && s.endTime === endStr && !s.startTime2
                        )

                        if (!matchingShift) {
                            const code = 'X'
                            const newShift: ShiftType = {
                                id: `st-custom-${Date.now()}`,
                                name: `Custom ${startStr}–${endStr}`,
                                code: code,
                                startTime: startStr,
                                endTime: endStr,
                                color: currentShift.color || '#4B5563',
                                type: 'work',
                                hours: end - start,
                                allowParallel: currentShift.allowParallel,
                                globalAcrossBranches: currentShift.globalAcrossBranches,
                                isCustom: true
                            }
                            matchingShift = newShift
                        }
                    }

                    // CHECK FOR CROSS-BRANCH CONFLICTS
                    let hasBranchConflict = false
                    let conflictBranchName = ''
                    let conflictShiftName = ''
                    
                    if (!matchingShift.globalAcrossBranches) {
                        for (const b of branches) {
                            if (b.id === selectedBranch) continue
                            const key = rosterKey(b.id, staffId, selectedDateStr)
                            const otherShiftId = roster[key]
                            if (otherShiftId) {
                                const otherShift = shiftTypes.find(s => s.id === otherShiftId)
                                if (otherShift && shiftsOverlap(matchingShift, otherShift)) {
                                    hasBranchConflict = true
                                    conflictBranchName = getBranchName(b.id)
                                    conflictShiftName = otherShift.name
                                    break
                                }
                            }
                        }
                    }

                    if (hasBranchConflict) {
                        const errMsg = language === 'vi'
                            ? `Không thể thay đổi: Nhân viên này đã được phân công vào ca "${conflictShiftName}" tại chi nhánh "${conflictBranchName}" cùng ngày!`
                            : `Cannot assign: This staff member is already assigned to shift "${conflictShiftName}" at branch "${conflictBranchName}" on this day!`
                        alert(errMsg)
                    } else {
                        // Se non c'è conflitto, salviamo il turno
                        if (!shiftTypes.some(s => s.id === matchingShift!.id)) {
                            const updatedShifts = [...shiftTypes, matchingShift!]
                            saveShiftTypes(updatedShifts)
                            setShiftTypes(updatedShifts)
                        }

                        const newRoster = { ...roster }
                        if (matchingShift.globalAcrossBranches) {
                            branches.forEach(b => {
                                newRoster[rosterKey(b.id, staffId, selectedDateStr)] = matchingShift!.id
                            })
                        } else {
                            const key = rosterKey(selectedBranch, staffId, selectedDateStr)
                            newRoster[key] = matchingShift!.id
                        }
                        setRoster(newRoster)
                        saveRosterData(newRoster)
                    }
                }
            }
            setDragInfo(null)
            setActiveDrag(null)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [dragInfo, shiftTypes, selectedBranch, selectedDateStr, roster, setRoster, setShiftTypes, getStaffShift, branches, getBranchName, language])

    // ── Render ──
    return (
        <div>
            {/* Day Selector — within white card-like container */}
            <div className="bg-white rounded-2xl shadow overflow-hidden mb-3">
                {/* Continuous 28-Day Strip (4 Weeks) with Left/Right chevrons */}
                <div className="border-b border-gray-200 px-4 py-1 flex items-center justify-between gap-2 bg-white">
                    {/* Left Scroll Button */}
                    <button
                        type="button"
                        onClick={prevWeek}
                        className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-blue-600 transition shrink-0"
                        title={language === 'vi' ? 'Tuần trước' : 'Previous week'}
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>

                    <div className="flex-1 flex flex-col xl:flex-row items-center justify-center gap-3.5 overflow-x-auto py-1">
                        {/* Week 1 */}
                        <div className="flex flex-col items-center shrink-0">
                            <div className="flex gap-0.5 md:gap-1">
                                {week1Days.map((day, idx) => renderDayButton(day, idx))}
                            </div>
                        </div>

                        {/* Week Separator 1 */}
                        <div className="hidden xl:block h-8 w-[1px] bg-gray-200 shrink-0 self-center" />

                        {/* Week 2 (Current) */}
                        <div className="flex flex-col items-center shrink-0">
                            <div className="flex gap-0.5 md:gap-1">
                                {week2Days.map((day, idx) => renderDayButton(day, idx + 7))}
                            </div>
                        </div>

                        {/* Week Separator 2 */}
                        <div className="hidden xl:block h-8 w-[1px] bg-gray-200 shrink-0 self-center" />

                        {/* Week 3 */}
                        <div className="flex flex-col items-center shrink-0">
                            <div className="flex gap-0.5 md:gap-1">
                                {week3Days.map((day, idx) => renderDayButton(day, idx + 14))}
                            </div>
                        </div>

                        {/* Week Separator 3 */}
                        <div className="hidden xl:block h-8 w-[1px] bg-gray-200 shrink-0 self-center" />

                        {/* Week 4 */}
                        <div className="flex flex-col items-center shrink-0">
                            <div className="flex gap-0.5 md:gap-1">
                                {week4Days.map((day, idx) => renderDayButton(day, idx + 21))}
                            </div>
                        </div>
                    </div>

                    {/* Right Scroll Button */}
                    <button
                        type="button"
                        onClick={nextWeek}
                        className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-blue-600 transition shrink-0"
                        title={language === 'vi' ? 'Tuần sau' : 'Next week'}
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

                {/* Selected Day Status Bar */}
                {(() => {
                    const selectedDateWeekdayIdx = (selectedDate.getDay() + 6) % 7
                    const selectedDayCoverage = getDayCoverageStatus(selectedDateStr, selectedDateWeekdayIdx)
                    const formattedExtendedDate = selectedDate.toLocaleDateString(
                        language === 'vi' ? 'vi-VN' : 'en-US',
                        { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
                    )

                    return (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50 border border-gray-100 rounded-2xl p-4 mb-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                                <h3 className="text-sm font-semibold text-gray-800 capitalize">
                                    {formattedExtendedDate}
                                </h3>
                            </div>
                            
                            <div className="flex items-center gap-3">
                                {selectedDayCoverage.totalTargets > 0 && (
                                    selectedDayCoverage.met ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            {language === 'vi' ? '✓ Đạt tất cả mục tiêu' : '✓ All Targets Covered'}
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                            {language === 'vi' ? 'Thiếu nhân sự' : 'Understaffed'}
                                        </span>
                                    )
                                )}
                            </div>
                        </div>
                    )
                })()}

                {/* Scrollable Timeline Grid Wrapper */}
                <div className="overflow-x-auto w-full">
                    <div className="min-w-[1200px]">
                        {/* Timeline Header */}
                        <div className="flex border-b border-gray-100 bg-gray-50 pt-3.5 pb-1 relative z-20">
                            <div className="w-[200px] shrink-0 text-xs uppercase tracking-wider text-gray-500 font-semibold flex items-center mb-1 sticky left-0 bg-gray-50 z-30 pl-4">
                                {language === 'vi' ? 'Nhân viên' : 'Staff'}
                            </div>
                            <div className="flex-1 pr-4 relative">
                                <div ref={timelineRef} className="w-full flex relative h-8 select-none">
                        {Array.from({ length: TIMELINE_HOURS }, (_, i) => {
                            const h = (TIMELINE_START + i) % 24
                            const hourLabel = `${String(h).padStart(2, '0')}:00`
                            return (
                                <div
                                    key={i}
                                    className="relative h-full"
                                    style={{ width: `${100 / TIMELINE_HOURS}%` }}
                                >
                                    {/* Hour Label */}
                                    <span className="absolute -left-3 -top-3 text-[9px] font-bold text-gray-500">
                                        {hourLabel}
                                    </span>
                                    
                                    {/* Gradients/Tacks */}
                                    {/* :00 tack */}
                                    <div className="absolute left-0 bottom-0 w-[1px] h-3 bg-gray-300" />
                                    {/* :15 tack */}
                                    <div className="absolute left-1/4 bottom-0 w-[1px] h-1.5 bg-gray-200/60" />
                                    {/* :30 tack */}
                                    <div className="absolute left-1/2 bottom-0 w-[1px] h-2 bg-gray-300/80" />
                                    {/* :45 tack */}
                                    <div className="absolute left-3/4 bottom-0 w-[1px] h-1.5 bg-gray-200/60" />
                                </div>
                            )
                        })}
                        {/* Last hour label and tack at the end */}
                        <div className="absolute right-0 h-full w-0">
                            <span className="absolute -left-3 -top-3 text-[9px] font-bold text-gray-500">
                                {`${String(TIMELINE_END % 24).padStart(2, '0')}:00`}
                            </span>
                            <div className="absolute left-0 bottom-0 w-[1px] h-3 bg-gray-300" />
                        </div>
                                </div>
                            </div>
                        </div>

                {/* Department Sections */}
                {groupedByDept.map(([dept, members]) => {
                    const isCollapsed = collapsedDepts.has(dept)
                    const assigned = staffWithShifts[dept] || []
                    const deptCount = assigned.length
                    const totalMembers = members.length

                    return (
                        <div key={dept} className="border-b border-gray-100 last:border-0">
                            {/* Department Header */}
                            <div className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition border-b border-gray-50 bg-gray-50/50">
                                <button
                                    onClick={() => toggleDept(dept)}
                                    className="flex items-center gap-2 text-left"
                                >
                                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                                    <span className="text-sm font-semibold text-gray-800">{dept}</span>
                                    <span className="text-xs text-gray-400 ml-1">
                                        {deptCount}/{totalMembers} {language === 'vi' ? 'đã phân công' : 'assigned'}
                                    </span>
                                </button>
                                
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {getDeptCoverage(dept).map((status, sIdx) => {
                                        if (status.met) {
                                            return (
                                                <span key={sIdx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
                                                    ✓ {status.name}: {status.current}/{status.target}
                                                </span>
                                            )
                                        }
                                        return (
                                            <span key={sIdx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-100 shrink-0">
                                                <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                                                {status.name}: {status.current}/{status.target}
                                            </span>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Staff Rows */}
                            {!isCollapsed && (
                                <div>
                                    {assigned.map(({ staff, shift }) => {
                                        const isDraggingThisStaff = activeDrag && activeDrag.staffId === staff.id

                                        // Part 1 calculations
                                        const isDraggingPart1 = isDraggingThisStaff && activeDrag.part === 1
                                        const start1 = isDraggingPart1 ? activeDrag.start : parseTime(shift.startTime)
                                        const end1 = isDraggingPart1 ? activeDrag.end : parseTime(shift.endTime)
                                        const left1 = ((start1 - TIMELINE_START) / TIMELINE_HOURS) * 100
                                        const width1 = ((end1 - start1) / TIMELINE_HOURS) * 100

                                        const displayedStartStr1 = isDraggingPart1 ? formatHour(start1) : shift.startTime
                                        const displayedEndStr1 = isDraggingPart1 ? formatHour(end1 % 24) : shift.endTime

                                        // Part 2 calculations (only if shift.startTime2 and shift.endTime2 exist)
                                        const hasPart2 = !!(shift.startTime2 && shift.endTime2)
                                        const isDraggingPart2 = isDraggingThisStaff && activeDrag.part === 2
                                        const start2 = hasPart2 ? (isDraggingPart2 ? activeDrag.start : parseTime(shift.startTime2!)) : 0
                                        const end2 = hasPart2 ? (isDraggingPart2 ? activeDrag.end : parseTime(shift.endTime2!)) : 0
                                        const left2 = hasPart2 ? ((start2 - TIMELINE_START) / TIMELINE_HOURS) * 100 : 0
                                        const width2 = hasPart2 ? ((end2 - start2) / TIMELINE_HOURS) * 100 : 0

                                        const displayedStartStr2 = hasPart2 ? (isDraggingPart2 ? formatHour(start2) : shift.startTime2!) : ''
                                        const displayedEndStr2 = hasPart2 ? (isDraggingPart2 ? formatHour(end2 % 24) : shift.endTime2!) : ''

                                        return (
                                            <div key={staff.id} className="flex items-center py-1.5 hover:bg-blue-50/30 transition group/row border-b border-gray-50 last:border-b-0 min-w-[1200px]">
                                                {/* Staff Name */}
                                                <div className={`w-[200px] shrink-0 pr-3 sticky left-0 bg-white group-hover/row:bg-blue-50/30 transition-colors pl-4 relative ${editShiftStaffId === staff.id ? 'z-40' : 'z-10'}`}>
                                                    <button
                                                        onClick={(e) => {
                                                            const rect = e.currentTarget.getBoundingClientRect()
                                                            setPopoverAnchorRect(rect)
                                                            setEditShiftStaffId(editShiftStaffId === staff.id ? null : staff.id)
                                                        }}
                                                        className="w-full text-left flex items-center gap-2 hover:bg-gray-100/50 p-1 -m-1 rounded-lg transition"
                                                        title={language === 'vi' ? 'Nhấp để đổi ca' : 'Click to change shift'}
                                                    >
                                                        <div
                                                            className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                                            style={{ backgroundColor: shift.color }}
                                                        >
                                                            {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-medium text-gray-800 truncate">{staff.name}</p>
                                                            <p className="text-[10px] text-gray-400 truncate">{staff.position}</p>
                                                        </div>
                                                    </button>

                                                    {/* Edit Shift Popover */}
                                                    {isMounted && editShiftStaffId === staff.id && popoverAnchorRect && (() => {
                                                        const openUpward = window.innerHeight - popoverAnchorRect.bottom < 300
                                                        return createPortal(
                                                            <>
                                                                <div className="fixed inset-0 z-40" onClick={() => {
                                                                    setEditShiftStaffId(null)
                                                                    setPopoverAnchorRect(null)
                                                                }} />
                                                                <div 
                                                                    style={{
                                                                        position: 'fixed',
                                                                        ...(openUpward 
                                                                            ? { bottom: `${window.innerHeight - popoverAnchorRect.top + 8}px` } 
                                                                            : { top: `${popoverAnchorRect.bottom + 8}px` }
                                                                        ),
                                                                        left: `${popoverAnchorRect.left}px`,
                                                                    }}
                                                                    className={`bg-white rounded-2xl border border-gray-100 p-4 shadow-2xl z-50 text-gray-900 w-[260px] animate-in fade-in duration-150 ${openUpward ? 'slide-in-from-bottom-2' : 'slide-in-from-top-2'}`}
                                                                >
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <p className="text-xs font-semibold text-gray-800">
                                                                            {language === 'vi' ? 'Chọn ca làm việc' : 'Select shift'}
                                                                        </p>
                                                                        <button onClick={() => {
                                                                            setEditShiftStaffId(null)
                                                                            setPopoverAnchorRect(null)
                                                                        }} className="p-0.5 hover:bg-gray-200 rounded transition">
                                                                            <X className="w-3.5 h-3.5 text-gray-400" />
                                                                        </button>
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1">
                                                                            {shiftTypes.filter(st => !st.isCustom).map(st => (
                                                                                <button
                                                                                    key={st.id}
                                                                                    onClick={() => {
                                                                                        assignSpecificShift(staff.id, st.id)
                                                                                        setEditShiftStaffId(null)
                                                                                        setPopoverAnchorRect(null)
                                                                                    }}
                                                                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition text-left ${shift.id === st.id ? 'bg-blue-50 font-semibold' : ''}`}
                                                                                >
                                                                                    <div className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: st.color }} />
                                                                                    <div className="min-w-0 flex-1">
                                                                                        <p className="text-xs text-gray-700 truncate">{st.name} ({st.code})</p>
                                                                                        {st.startTime && (
                                                                                            <p className="text-[10px] text-gray-400 leading-tight">
                                                                                                {st.startTime}–{st.endTime}
                                                                                                {st.startTime2 && ` & ${st.startTime2}–${st.endTime2}`}
                                                                                            </p>
                                                                                        )}
                                                                                    </div>
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                        <div className="border-t border-gray-150 pt-2 mt-2">
                                                                            <button
                                                                                onClick={() => {
                                                                                    removeShift(staff.id)
                                                                                    setEditShiftStaffId(null)
                                                                                    setPopoverAnchorRect(null)
                                                                                }}
                                                                                className="w-full py-1.5 text-center text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                                                                            >
                                                                                {language === 'vi' ? 'Xóa phân công' : 'Remove Assignment'}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </>,
                                                            document.body
                                                        )
                                                    })()}
                                                </div>

                                                {/* Timeline Bar */}
                                                <div className="flex-1 pr-4 relative h-8">
                                                    <div className="w-full h-full relative">
                                                        {/* Background grid lines */}
                                                        <div className="absolute inset-0 flex">
                                                            {Array.from({ length: TIMELINE_HOURS }, (_, i) => (
                                                                <div key={i} className="relative h-full border-l border-gray-100/70" style={{ width: `${100 / TIMELINE_HOURS}%` }}>
                                                                    {/* Half-hour dashed line */}
                                                                    <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-gray-100/50" />
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {shift.type === 'leave' ? (
                                                            /* Leave Bar (Full Width) */
                                                            <div
                                                                className="absolute top-0.5 bottom-0.5 left-0 right-0 rounded-md flex items-center justify-center cursor-not-allowed group/bar opacity-85 hover:opacity-100 transition-opacity"
                                                                style={{
                                                                    backgroundColor: shift.color,
                                                                }}
                                                                title={shift.name}
                                                            >
                                                                <span className="text-[10px] font-bold text-white drop-shadow-sm whitespace-nowrap px-1 select-none uppercase tracking-wide">
                                                                    {shift.name} ({shift.code})
                                                                </span>
                                                                {/* Delete on hover */}
                                                                <button
                                                                    onClick={() => removeShift(staff.id)}
                                                                    className="absolute -right-1 -top-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity shadow"
                                                                >
                                                                    <X className="w-2.5 h-2.5 text-white" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            /* Work Shifts - Part 1 & Part 2 */
                                                            <>
                                                                {/* Shift Bar Part 1 */}
                                                                <div
                                                                    onMouseDown={(e) => handleDragStart(e, staff.id, 'move', shift, 1)}
                                                                    className="absolute top-0.5 bottom-0.5 rounded-md flex items-center justify-center cursor-move group/bar transition-shadow hover:shadow-md"
                                                                    style={{
                                                                        left: `${Math.max(0, left1)}%`,
                                                                        width: `${Math.min(100 - Math.max(0, left1), width1)}%`,
                                                                        backgroundColor: shift.color,
                                                                    }}
                                                                >
                                                                    {/* Left handle */}
                                                                    <div
                                                                        className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity"
                                                                        onMouseDown={(e) => handleDragStart(e, staff.id, 'left', shift, 1)}
                                                                    >
                                                                        <div className="w-0.5 h-3 bg-white/80 rounded-full" />
                                                                    </div>

                                                                    {/* Label */}
                                                                    <span className="text-[10px] font-bold text-white drop-shadow-sm whitespace-nowrap px-1 select-none">
                                                                        {shift.code} {displayedStartStr1}–{displayedEndStr1}
                                                                    </span>

                                                                    {/* Right handle */}
                                                                    <div
                                                                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity"
                                                                        onMouseDown={(e) => handleDragStart(e, staff.id, 'right', shift, 1)}
                                                                    >
                                                                        <div className="w-0.5 h-3 bg-white/80 rounded-full" />
                                                                    </div>

                                                                    {/* Delete on hover */}
                                                                    <button
                                                                        onClick={() => removeShift(staff.id)}
                                                                        className="absolute -right-1 -top-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity shadow"
                                                                    >
                                                                        <X className="w-2.5 h-2.5 text-white" />
                                                                    </button>
                                                                </div>

                                                                {/* Shift Bar Part 2 */}
                                                                {hasPart2 && (
                                                                    <div
                                                                        onMouseDown={(e) => handleDragStart(e, staff.id, 'move', shift, 2)}
                                                                        className="absolute top-0.5 bottom-0.5 rounded-md flex items-center justify-center cursor-move group/bar transition-shadow hover:shadow-md"
                                                                        style={{
                                                                            left: `${Math.max(0, left2)}%`,
                                                                            width: `${Math.min(100 - Math.max(0, left2), width2)}%`,
                                                                            backgroundColor: shift.color,
                                                                        }}
                                                                    >
                                                                        {/* Left handle */}
                                                                        <div
                                                                            className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity"
                                                                            onMouseDown={(e) => handleDragStart(e, staff.id, 'left', shift, 2)}
                                                                        >
                                                                            <div className="w-0.5 h-3 bg-white/80 rounded-full" />
                                                                        </div>

                                                                        {/* Label */}
                                                                        <span className="text-[10px] font-bold text-white drop-shadow-sm whitespace-nowrap px-1 select-none">
                                                                            {shift.code} (P2) {displayedStartStr2}–{displayedEndStr2}
                                                                        </span>

                                                                        {/* Right handle */}
                                                                        <div
                                                                            className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity"
                                                                            onMouseDown={(e) => handleDragStart(e, staff.id, 'right', shift, 2)}
                                                                        >
                                                                            <div className="w-0.5 h-3 bg-white/80 rounded-full" />
                                                                        </div>

                                                                        {/* Delete on hover */}
                                                                        <button
                                                                            onClick={() => removeShift(staff.id)}
                                                                            className="absolute -right-1 -top-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity shadow"
                                                                        >
                                                                            <X className="w-2.5 h-2.5 text-white" />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {/* Add Staff Row */}
                                    <div className="flex items-center py-2 border-b border-gray-50 last:border-b-0 min-w-[1200px]">
                                        <div className={`w-[200px] shrink-0 sticky left-0 bg-white pl-4 relative ${addSlotDept === dept ? 'z-40' : 'z-10'}`}>
                                            {isMounted && addSlotDept === dept && popoverAnchorRect ? (() => {
                                                const openUpward = window.innerHeight - popoverAnchorRect.bottom < 320
                                                return createPortal(
                                                    <>
                                                        <div className="fixed inset-0 z-40" onClick={() => {
                                                            setAddSlotDept(null)
                                                            setPopoverAnchorRect(null)
                                                            setSelectedStaffForAdd(null)
                                                        }} />
                                                        <div
                                                            style={{
                                                                position: 'fixed',
                                                                ...(openUpward
                                                                    ? { bottom: `${window.innerHeight - popoverAnchorRect.top + 8}px` }
                                                                    : { top: `${popoverAnchorRect.bottom + 8}px` }
                                                                ),
                                                                left: `${popoverAnchorRect.left}px`,
                                                            }}
                                                            className={`bg-white rounded-2xl border border-gray-100 p-4 shadow-2xl z-50 text-gray-900 w-[260px] animate-in fade-in duration-150 ${openUpward ? 'slide-in-from-bottom-2' : 'slide-in-from-top-2'}`}
                                                        >
                                                            <div className="flex items-center justify-between mb-3">
                                                                <p className="text-xs font-semibold text-gray-800">
                                                                    {language === 'vi' ? 'Thêm nhân viên' : 'Add staff'}
                                                                </p>
                                                                <button onClick={() => {
                                                                    setAddSlotDept(null)
                                                                    setPopoverAnchorRect(null)
                                                                    setSelectedStaffForAdd(null)
                                                                }} className="p-0.5 hover:bg-gray-200 rounded transition">
                                                                    <X className="w-3.5 h-3.5 text-gray-400" />
                                                                </button>
                                                            </div>
                                                            {(() => {
                                                                if (selectedStaffForAdd) {
                                                                    return (
                                                                        <div className="space-y-1">
                                                                            <div className="max-h-[160px] overflow-y-auto space-y-1">
                                                                                {shiftTypes.filter(st => !st.isCustom).map(st => (
                                                                                    <button
                                                                                        key={st.id}
                                                                                        onClick={() => {
                                                                                            assignSpecificShift(selectedStaffForAdd.id, st.id)
                                                                                            setAddSlotDept(null)
                                                                                            setPopoverAnchorRect(null)
                                                                                            setSelectedStaffForAdd(null)
                                                                                        }}
                                                                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition text-left"
                                                                                    >
                                                                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                                                                                        <div className="min-w-0">
                                                                                            <p className="text-xs font-medium text-gray-700 truncate">{st.name}</p>
                                                                                            <p className="text-[10px] text-gray-400 truncate">
                                                                                                {st.code} {st.startTime && `· ${st.startTime}–${st.endTime}`}
                                                                                            </p>
                                                                                        </div>
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setSelectedStaffForAdd(null)}
                                                                                className="w-full text-center py-1.5 px-2 rounded-lg hover:bg-gray-50 transition text-xs font-semibold text-gray-500 mt-2 border border-gray-150"
                                                                            >
                                                                                {language === 'vi' ? 'Quay lại' : 'Back'}
                                                                            </button>
                                                                        </div>
                                                                    )
                                                                }

                                                                const available = getAvailableStaff(dept)
                                                                if (available.length === 0) {
                                                                    return (
                                                                        <div className="flex flex-col items-center py-2 text-center">
                                                                            <p className="text-[11px] text-gray-400">
                                                                                {language === 'vi'
                                                                                    ? 'Không có nhân viên khả dụng cho ngày này.'
                                                                                    : 'No available staff for this day.'}
                                                                            </p>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    onOpenBorrowModal()
                                                                                    setAddSlotDept(null)
                                                                                    setPopoverAnchorRect(null)
                                                                                }}
                                                                                className="mt-2 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline transition"
                                                                            >
                                                                                {language === 'vi' ? 'Phân công nhân viên ngoài chi nhánh' : 'Assign External Staff'}
                                                                            </button>
                                                                        </div>
                                                                    )
                                                                }
                                                                return (
                                                                    <div className="space-y-1">
                                                                        <div className="max-h-[160px] overflow-y-auto space-y-1">
                                                                            {available.map(s => {
                                                                                const crossShifts = getStaffCrossBranchShifts(roster, s.id, selectedDateStr, selectedBranch)
                                                                                return (
                                                                                    <button
                                                                                        key={s.id}
                                                                                        onClick={() => {
                                                                                            setSelectedStaffForAdd({ id: s.id, name: s.name })
                                                                                        }}
                                                                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition text-left"
                                                                                    >
                                                                                        <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                                                        <div className="min-w-0 flex-1">
                                                                                            <p className="text-xs font-medium text-gray-700 truncate">{s.name}</p>
                                                                                            <div className="flex flex-col gap-0.5">
                                                                                                <p className="text-[10px] text-gray-400 truncate">{s.position}</p>
                                                                                                {crossShifts.map((cs, idx) => {
                                                                                                    const bName = getBranchName(cs.branchId)
                                                                                                    const stCode = shiftTypes.find(st => st.id === cs.shiftTypeId)?.code || ''
                                                                                                    return (
                                                                                                        <div key={idx} className="flex items-center gap-0.5 text-[9px] text-amber-600 font-medium">
                                                                                                            <MapPin className="w-2.5 h-2.5 shrink-0" />
                                                                                                            <span className="truncate">{bName}: {stCode}</span>
                                                                                                        </div>
                                                                                                    )
                                                                                                })}
                                                                                            </div>
                                                                                        </div>
                                                                                    </button>
                                                                                )
                                                                            })}
                                                                        </div>
                                                                        <div className="border-t border-gray-150 pt-2 mt-2">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    onOpenBorrowModal()
                                                                                    setAddSlotDept(null)
                                                                                    setPopoverAnchorRect(null)
                                                                                }}
                                                                                className="w-full flex items-center justify-center gap-1 py-1 px-2 rounded-lg hover:bg-blue-50 transition text-xs font-semibold text-blue-600 hover:text-blue-700"
                                                                            >
                                                                                <Plus className="w-3 h-3" />
                                                                                {language === 'vi' ? 'Nhân viên ngoài' : 'External Staff'}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })()}
                                                        </div>
                                                    </>,
                                                    document.body
                                                )
                                            })() : (
                                                <button
                                                    onClick={(e) => {
                                                        const rect = e.currentTarget.getBoundingClientRect()
                                                        setPopoverAnchorRect(rect)
                                                        setAddSlotDept(dept)
                                                    }}
                                                    className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-700 font-medium transition px-2 py-1 rounded-lg hover:bg-blue-50"
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    {language === 'vi' ? 'Thêm nhân viên' : 'Add staff'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex-1 pr-4 relative h-8"></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}

                {/* Empty state */}
                {groupedByDept.length === 0 && (
                    <div className="py-16 text-center text-gray-400">
                        <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">{language === 'vi' ? 'Chưa có nhân viên' : 'No staff assigned to this branch'}</p>
                    </div>
                )}
                    </div>
                </div>
            </div>

            {/* Shift Legend */}
            <div className="mt-3 flex flex-wrap items-center gap-3 px-1">
                {shiftTypes.filter(s => s.type === 'work' && !s.isCustom).map(st => (
                    <div key={st.id} className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: st.color }} />
                        <span className="text-[10px] text-slate-300 font-medium">{st.code} · {st.name} ({st.startTime}–{st.endTime})</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
