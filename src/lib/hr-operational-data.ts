// src/lib/hr-operational-data.ts
// Shared types, constants, mock data, and localStorage helpers for HR Operational

export interface ShiftType {
  id: string
  name: string
  code: string
  startTime: string  // HH:mm or '' for leave types
  endTime: string    // HH:mm or '' for leave types
  color: string      // hex color
  type: 'work' | 'leave'
  hours: number
  /** When true, staff can be assigned another shift in the same slot in a different branch */
  allowParallel: boolean
  /** When true, assigning this shift in one branch auto-applies it to ALL branches */
  globalAcrossBranches: boolean
}

export interface StaffMember {
  id: string
  name: string
  role: string
}

// ── Default shift types ──
export const DEFAULT_SHIFT_TYPES: ShiftType[] = [
  { id: 'st-1', name: 'Morning',      code: 'M',  startTime: '07:00', endTime: '15:00', color: '#3B82F6', type: 'work',  hours: 8,  allowParallel: true,  globalAcrossBranches: false },
  { id: 'st-2', name: 'Afternoon',    code: 'A',  startTime: '15:00', endTime: '23:00', color: '#F59E0B', type: 'work',  hours: 8,  allowParallel: true,  globalAcrossBranches: false },
  { id: 'st-3', name: 'Evening',      code: 'E',  startTime: '18:00', endTime: '02:00', color: '#8B5CF6', type: 'work',  hours: 8,  allowParallel: true,  globalAcrossBranches: false },
  { id: 'st-4', name: 'Full Day',     code: 'FD', startTime: '09:00', endTime: '21:00', color: '#10B981', type: 'work',  hours: 12, allowParallel: false, globalAcrossBranches: false },
  { id: 'st-5', name: 'Split Shift',  code: 'SP', startTime: '10:00', endTime: '22:00', color: '#06B6D4', type: 'work',  hours: 9,  allowParallel: false, globalAcrossBranches: false },
  { id: 'st-6', name: 'Day Off',      code: 'DO', startTime: '',      endTime: '',      color: '#6B7280', type: 'leave', hours: 0,  allowParallel: false, globalAcrossBranches: true  },
  { id: 'st-7', name: 'Annual Leave', code: 'AL', startTime: '',      endTime: '',      color: '#EAB308', type: 'leave', hours: 0,  allowParallel: false, globalAcrossBranches: true  },
  { id: 'st-8', name: 'Sick Day',     code: 'SD', startTime: '',      endTime: '',      color: '#EF4444', type: 'leave', hours: 0,  allowParallel: false, globalAcrossBranches: true  },
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

// ── LocalStorage keys ──
const SHIFT_TYPES_KEY = 'hr_operational_shift_types'
const ROSTER_KEY = 'hr_operational_roster'

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
  if (existing.globalAcrossBranches) return true

  // If the candidate explicitly allows parallel assignment, no conflict
  if (candidate.allowParallel) return false

  // If allowParallel is explicitly false, it's always blocked
  if (candidate.allowParallel === false) return true

  // Fallback: use time overlap for legacy data that lacks the flag
  if (candidate.type !== 'work' || existing.type !== 'work') return false
  if (!candidate.startTime || !existing.startTime) return false

  const aStart = timeToMinutes(candidate.startTime)
  let aEnd = timeToMinutes(candidate.endTime)
  const bStart = timeToMinutes(existing.startTime)
  let bEnd = timeToMinutes(existing.endTime)

  // Handle midnight crossing (e.g. 18:00–02:00)
  if (aEnd <= aStart) aEnd += 24 * 60
  if (bEnd <= bStart) bEnd += 24 * 60

  return aStart < bEnd && bStart < aEnd
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
