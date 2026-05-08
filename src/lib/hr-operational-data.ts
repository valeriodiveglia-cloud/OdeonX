// src/lib/hr-operational-data.ts
// Shared types, constants, mock data, and localStorage helpers for HR Operational

export interface ShiftType {
  id: string
  name: string
  code: string
  startTime: string  // HH:mm or '' for leave types
  endTime: string    // HH:mm or '' for leave types
  startTime2?: string // HH:mm for the second part of a split shift
  endTime2?: string   // HH:mm for the second part of a split shift
  color: string      // hex color
  type: 'work' | 'leave'
  hours: number
  /** When true, staff can be assigned another shift in the same slot in a different branch */
  allowParallel: boolean
  /** When true, assigning this shift in one branch auto-applies it to ALL branches */
  globalAcrossBranches: boolean
  /** When true, this shift type can be automatically assigned by the Auto-Schedule engine (e.g. Day Off). False for planned leaves (Annual Leave, Sick Day). */
  isAutoSchedulable?: boolean
}

export interface StaffMember {
  id: string
  name: string
  role: string
}

export interface OvertimeSettings {
  overtime_multiplier_salary: number;
  overtime_multiplier_leave: number;
  public_holiday_multiplier_salary: number;
  public_holiday_multiplier_leave: number;
}

// ── Default shift types ──
export const DEFAULT_SHIFT_TYPES: ShiftType[] = [
  { id: 'st-1', name: 'Morning',      code: 'M',  startTime: '07:00', endTime: '15:00', color: '#3B82F6', type: 'work',  hours: 8,  allowParallel: true,  globalAcrossBranches: false },
  { id: 'st-2', name: 'Afternoon',    code: 'A',  startTime: '15:00', endTime: '23:00', color: '#F59E0B', type: 'work',  hours: 8,  allowParallel: true,  globalAcrossBranches: false },
  { id: 'st-3', name: 'Evening',      code: 'E',  startTime: '18:00', endTime: '02:00', color: '#8B5CF6', type: 'work',  hours: 8,  allowParallel: true,  globalAcrossBranches: false },
  { id: 'st-4', name: 'Full Day',     code: 'FD', startTime: '09:00', endTime: '21:00', color: '#10B981', type: 'work',  hours: 12, allowParallel: false, globalAcrossBranches: false },
  { id: 'st-5', name: 'Split Shift',  code: 'SP', startTime: '10:00', endTime: '22:00', color: '#06B6D4', type: 'work',  hours: 9,  allowParallel: false, globalAcrossBranches: false },
  { id: 'st-6', name: 'Day Off',      code: 'DO', startTime: '',      endTime: '',      color: '#6B7280', type: 'leave', hours: 0,  allowParallel: false, globalAcrossBranches: true, isAutoSchedulable: true  },
  { id: 'st-7', name: 'Annual Leave', code: 'AL', startTime: '',      endTime: '',      color: '#EAB308', type: 'leave', hours: 0,  allowParallel: false, globalAcrossBranches: true, isAutoSchedulable: false },
  { id: 'st-8', name: 'Sick Day',     code: 'SD', startTime: '',      endTime: '',      color: '#EF4444', type: 'leave', hours: 0,  allowParallel: false, globalAcrossBranches: true, isAutoSchedulable: false },
]

// ── Mock staff (realistic names) ──
export const MOCK_STAFF: StaffMember[] = [
  { id: 'staff-1',  name: 'Nguyen Van Minh',   role: 'Head Chef' },
  { id: 'staff-2',  name: 'Tran Thi Lan',      role: 'Sous Chef' },
  { id: 'staff-3',  name: 'Marco Rossi',        role: 'Chef de Partie' },
  { id: 'staff-4',  name: 'Le Hoang Nam',       role: 'Line Cook' },
  { id: 'staff-5',  name: 'Pham Thu Ha',        role: 'Pastry Chef' },
  { id: 'staff-6',  name: 'Giuseppe Bianchi',   role: 'Restaurant Manager' },
  { id: 'staff-7',  name: 'Vo Minh Tuan',       role: 'Bartender' },
  { id: 'staff-8',  name: 'Maria Conti',        role: 'Server' },
  { id: 'staff-9',  name: 'Bui Thanh Hoa',      role: 'Server' },
  { id: 'staff-10', name: 'Dang Quoc Viet',     role: 'Kitchen Porter' },
]

export interface AutoScheduleTimeSlot {
  id: string;
  branchId: string;
  name: string;
  startTime: string;
  endTime: string;
  targets: Record<string, Record<number, number>>; // key: Department Name -> 0=Mon, 1=Tue... 6=Sun
}

// ── LocalStorage keys ──
const SHIFT_TYPES_KEY = 'hr_operational_shift_types'
const ROSTER_KEY = 'hr_operational_roster'
const OVERTIME_SETTINGS_KEY = 'hr_operational_overtime_settings'
const AUTO_SCHEDULE_TARGETS_KEY = 'hr_operational_auto_schedule_targets'

// ── Helpers ──
export function getShiftTypes(): ShiftType[] {
  if (typeof window === 'undefined') return DEFAULT_SHIFT_TYPES
  const stored = localStorage.getItem(SHIFT_TYPES_KEY)
  if (stored) {
    try { return JSON.parse(stored) } catch { return DEFAULT_SHIFT_TYPES }
  }
  return DEFAULT_SHIFT_TYPES
}

export function saveShiftTypes(types: ShiftType[]): void {
  localStorage.setItem(SHIFT_TYPES_KEY, JSON.stringify(types))
}

export function getOvertimeSettings(): OvertimeSettings {
  const defaultSettings: OvertimeSettings = {
    overtime_multiplier_salary: 1.5,
    overtime_multiplier_leave: 1.0,
    public_holiday_multiplier_salary: 2.0,
    public_holiday_multiplier_leave: 1.0
  }
  if (typeof window === 'undefined') return defaultSettings
  const stored = localStorage.getItem(OVERTIME_SETTINGS_KEY)
  if (stored) {
    try { 
      const parsed = JSON.parse(stored)
      return { ...defaultSettings, ...parsed } // Merge with defaults to gracefully handle old schema
    } catch { 
      return defaultSettings 
    }
  }
  return defaultSettings
}

export function saveOvertimeSettings(settings: OvertimeSettings): void {
  localStorage.setItem(OVERTIME_SETTINGS_KEY, JSON.stringify(settings))
}

export function getAutoScheduleTimeSlots(): AutoScheduleTimeSlot[] {
  if (typeof window === 'undefined') return []
  
  // Seed flag to ensure we populate the data for testing at least once
  const SEED_VERSION = 'v4' // incremented to wipe old flat targets
  const isSeeded = localStorage.getItem(`${AUTO_SCHEDULE_TARGETS_KEY}_seeded`)
  
  if (isSeeded !== SEED_VERSION) {
    const branches = [
      'pb_il4b3q3n2wgmgose343', // Thao Dien
      'pb_to2tw34zsrmgosmj11',  // Thanh My Loi
      'pb_e5u1fjs3zv6mi7cqds8'  // Da Lat
    ]

    const seed: AutoScheduleTimeSlot[] = []
    branches.forEach(branchId => {
      // Lunch Rush
      seed.push({
        id: `slot-lunch-${branchId}`,
        branchId,
        name: 'Lunch Rush',
        startTime: '11:00',
        endTime: '15:00',
        targets: {
          'FOH': { 0: 1, 1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2 },
          'Kitchen': { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 3, 6: 3 },
          'BOH': { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 }
        }
      })
      // Afternoon
      seed.push({
        id: `slot-afternoon-${branchId}`,
        branchId,
        name: 'Afternoon',
        startTime: '15:00',
        endTime: '18:00',
        targets: {
          'FOH': { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 },
          'Kitchen': { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 },
          'BOH': { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 1, 6: 1 }
        }
      })
      // Dinner Rush
      seed.push({
        id: `slot-dinner-${branchId}`,
        branchId,
        name: 'Dinner',
        startTime: '18:00',
        endTime: '22:00',
        targets: {
          'FOH': { 0: 2, 1: 2, 2: 2, 3: 2, 4: 3, 5: 4, 6: 4 },
          'Kitchen': { 0: 2, 1: 2, 2: 2, 3: 2, 4: 4, 5: 5, 6: 5 },
          'BOH': { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 }
        }
      })
    })

    localStorage.setItem(AUTO_SCHEDULE_TARGETS_KEY, JSON.stringify(seed))
    localStorage.setItem(`${AUTO_SCHEDULE_TARGETS_KEY}_seeded`, SEED_VERSION)
    return seed
  }

  const stored = localStorage.getItem(AUTO_SCHEDULE_TARGETS_KEY)
  if (stored) {
    try { return JSON.parse(stored) } catch { return [] }
  }
  return []
}

export function saveAutoScheduleTimeSlots(slots: AutoScheduleTimeSlot[]): void {
  localStorage.setItem(AUTO_SCHEDULE_TARGETS_KEY, JSON.stringify(slots))
}

export function getRosterData(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const stored = localStorage.getItem(ROSTER_KEY)
  if (stored) {
    try { return JSON.parse(stored) } catch { return {} }
  }
  return {}
}

export function saveRosterData(data: Record<string, string>): void {
  localStorage.setItem(ROSTER_KEY, JSON.stringify(data))
}

export function rosterKey(branchId: string, staffId: string, date: string): string {
  return `${branchId}::${staffId}::${date}`
}

export function parseRosterKey(key: string): { branchId: string; staffId: string; date: string } | null {
  const parts = key.split('::')
  if (parts.length !== 3) return null
  return { branchId: parts[0], staffId: parts[1], date: parts[2] }
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function formatWeekRange(start: Date): string {
  const end = addDays(start, 6)
  const sMonth = start.toLocaleDateString('en-GB', { month: 'short' })
  const eMonth = end.toLocaleDateString('en-GB', { month: 'short' })
  const year = end.getFullYear()
  if (sMonth === eMonth) {
    return `${start.getDate()} – ${end.getDate()} ${sMonth} ${year}`
  }
  return `${start.getDate()} ${sMonth} – ${end.getDate()} ${eMonth} ${year}`
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export function dayName(date: Date): string {
  const idx = (date.getDay() + 6) % 7 // Monday=0
  return DAY_NAMES[idx]
}

// ── Generate mock roster for a week ──
function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function generateMockRoster(branchId: string, weekStart: Date, allBranchIds: string[]): Record<string, string> {
  const roster: Record<string, string> = {}
  const shiftTypes = getShiftTypes()
  const workShifts = shiftTypes.filter(s => s.type === 'work')
  const doShift = shiftTypes.find(s => s.code === 'DO')
  const alShift = shiftTypes.find(s => s.code === 'AL')
  const sdShift = shiftTypes.find(s => s.code === 'SD')

  // Half-day shifts for split days (morning / afternoon type)
  const morningShift = workShifts.find(s => s.code === 'M')
  const afternoonShift = workShifts.find(s => s.code === 'A')

  // Determine which staff are assigned to THIS branch
  const staffForBranch = MOCK_STAFF.filter((staff) => {
    const h = simpleHash(`${staff.id}::home::${branchId}`)
    return h % 3 !== 0
  })

  staffForBranch.forEach((staff) => {
    const si = MOCK_STAFF.indexOf(staff)

    // Find ALL branches this staff is assigned to
    const staffBranches = allBranchIds.filter((bId) => {
      const h = simpleHash(`${staff.id}::home::${bId}`)
      return h % 3 !== 0
    })

    for (let d = 0; d < 7; d++) {
      const date = addDays(weekStart, d)
      const dateStr = formatDate(date)

      // 2 off days per week (global, same across ALL branches)
      const offDay1 = (si * 2 + 5) % 7
      const offDay2 = (si * 2 + 6) % 7

      if (d === offDay1 || d === offDay2) {
        // Off/leave days → appear in ALL branches this staff belongs to
        const hash = simpleHash(`${staff.id}-${dateStr}-offday`)
        if (hash % 10 === 0 && alShift) {
          roster[rosterKey(branchId, staff.id, dateStr)] = alShift.id
        } else if (hash % 13 === 0 && sdShift) {
          roster[rosterKey(branchId, staff.id, dateStr)] = sdShift.id
        } else if (doShift) {
          roster[rosterKey(branchId, staff.id, dateStr)] = doShift.id
        }
      } else {
        // Work day
        const dayHash = simpleHash(`${staff.id}-${dateStr}-primary`)

        if (staffBranches.length >= 2) {
          // Staff works in multiple branches — decide if today is a split day
          const isSplitDay = dayHash % 4 === 0 // ~25% of work days are split

          if (isSplitDay && morningShift && afternoonShift) {
            // Split day: morning in one branch, afternoon in another
            const branchIdx = staffBranches.indexOf(branchId)
            if (branchIdx === 0) {
              roster[rosterKey(branchId, staff.id, dateStr)] = morningShift.id
            } else if (branchIdx === 1) {
              roster[rosterKey(branchId, staff.id, dateStr)] = afternoonShift.id
            }
            // 3rd+ branches stay empty on split days
          } else {
            // Single branch day — pick one primary branch
            const primaryBranch = staffBranches[dayHash % staffBranches.length]
            if (branchId === primaryBranch) {
              const shiftHash = simpleHash(`${staff.id}-${dateStr}-shift`)
              const shiftIdx = (si + shiftHash) % workShifts.length
              roster[rosterKey(branchId, staff.id, dateStr)] = workShifts[shiftIdx]?.id || ''
            }
            // Other branches: empty
          }
        } else {
          // Staff only works in one branch — always assign here
          const shiftHash = simpleHash(`${staff.id}-${dateStr}-shift`)
          const shiftIdx = (si + shiftHash) % workShifts.length
          roster[rosterKey(branchId, staff.id, dateStr)] = workShifts[shiftIdx]?.id || ''
        }
      }
    }
  })
  return roster
}

// ── Cross-branch conflict helpers ──

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * Checks whether assigning `candidate` is blocked by `existing` in another branch.
 * Uses the new allowParallel flag first:
 * - If candidate.allowParallel === true → always allowed (no conflict)
 * - If candidate.allowParallel === false → always blocked
 * - Fallback to time-based overlap for backwards compatibility with old data
 */
export function shiftsOverlap(candidate: ShiftType, existing: ShiftType): boolean {
  // Global shifts (leave/day off) block everything in other branches
  if (existing.globalAcrossBranches || candidate.globalAcrossBranches) return true

  // If either shift explicitly FORBIDS parallel assignment on the same day, they conflict!
  if (candidate.allowParallel === false || existing.allowParallel === false) return true

  // Even if both allow parallel assignment on the same day (e.g. Morning and Afternoon),
  // we MUST check if their actual TIMES overlap. A person cannot be in two places at once.
  if (candidate.type !== 'work' || existing.type !== 'work') return false

  const getPeriods = (shift: ShiftType) => {
    const periods = []
    if (shift.startTime && shift.endTime) {
      const s = timeToMinutes(shift.startTime)
      let e = timeToMinutes(shift.endTime)
      if (e <= s) e += 24 * 60
      periods.push({ start: s, end: e })
    }
    if (shift.startTime2 && shift.endTime2) {
      const s = timeToMinutes(shift.startTime2)
      let e = timeToMinutes(shift.endTime2)
      if (e <= s) e += 24 * 60
      periods.push({ start: s, end: e })
    }
    return periods
  }

  const aPeriods = getPeriods(candidate)
  const bPeriods = getPeriods(existing)

  if (aPeriods.length === 0 || bPeriods.length === 0) return false

  for (const a of aPeriods) {
    for (const b of bPeriods) {
      if (a.start < b.end && b.start < a.end) return true
    }
  }

  return false
}

/** Returns all shifts for a staff member on a date in OTHER branches */
export function getStaffCrossBranchShifts(
  rosterData: Record<string, string>,
  staffId: string,
  date: string,
  excludeBranchId: string,
): { branchId: string; shiftTypeId: string }[] {
  const results: { branchId: string; shiftTypeId: string }[] = []
  for (const [key, shiftTypeId] of Object.entries(rosterData)) {
    const parsed = parseRosterKey(key)
    if (!parsed) continue
    if (parsed.staffId === staffId && parsed.date === date && parsed.branchId !== excludeBranchId) {
      results.push({ branchId: parsed.branchId, shiftTypeId })
    }
  }
  return results
}
