// src/lib/hr-operational-data.ts
// Shared types, constants, mock data, and localStorage helpers for HR Operational

import { supabase } from './supabase_shim'

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
  isCustom?: boolean
  allDay?: boolean // when type is 'leave', indicates if it's a full-day leave
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
  public_holiday_work_multiplier: number;
  public_holiday_off_multiplier: number;
  split_shift_compensation?: number;
  location_change_compensation?: number;
}

export interface AutoScheduleTimeSlot {
  id: string;
  branchId: string;
  name: string;
  startTime: string;
  endTime: string;
  targets: Record<string, Record<number, number>>; // key: Department Name -> 0=Mon, 1=Tue... 6=Sun
}

// ── Default shift types ──
export const DEFAULT_SHIFT_TYPES: ShiftType[] = [
  { id: 'st-a1', name: 'Shift A1', code: 'A1', startTime: '10:00', endTime: '18:30', color: '#3B82F6', type: 'work', hours: 8, allowParallel: false, globalAcrossBranches: false },
  { id: 'st-a2', name: 'Shift A2', code: 'A2', startTime: '09:30', endTime: '18:00', color: '#1E40AF', type: 'work', hours: 8, allowParallel: false, globalAcrossBranches: false },
  { id: 'st-w1', name: 'Split W1', code: 'W1', startTime: '10:00', endTime: '14:00', startTime2: '18:30', endTime2: '22:30', color: '#06B6D4', type: 'work', hours: 8, allowParallel: false, globalAcrossBranches: false },
  { id: 'st-w2', name: 'Split W2', code: 'W2', startTime: '09:30', endTime: '13:30', startTime2: '18:00', endTime2: '22:00', color: '#0891B2', type: 'work', hours: 8, allowParallel: false, globalAcrossBranches: false },
  { id: 'st-w3', name: 'Split W3', code: 'W3', startTime: '09:30', endTime: '13:00', startTime2: '18:00', endTime2: '22:30', color: '#01579B', type: 'work', hours: 8, allowParallel: false, globalAcrossBranches: false },
  { id: 'st-b',  name: 'Shift B',  code: 'B',  startTime: '14:00', endTime: '22:30', color: '#F59E0B', type: 'work', hours: 8, allowParallel: false, globalAcrossBranches: false },
  { id: 'st-c',  name: 'Shift C',  code: 'C',  startTime: '13:00', endTime: '21:30', color: '#8B5CF6', type: 'work', hours: 8, allowParallel: false, globalAcrossBranches: false },
  { id: 'st-pa1', name: 'PT PA1',   code: 'PA1', startTime: '10:00', endTime: '14:00', color: '#EC4899', type: 'work', hours: 4, allowParallel: true, globalAcrossBranches: false },
  { id: 'st-pa2', name: 'PT PA2',   code: 'PA2', startTime: '09:30', endTime: '14:30', color: '#DB2777', type: 'work', hours: 5, allowParallel: true, globalAcrossBranches: false },
  { id: 'st-pb1', name: 'PT PB1',   code: 'PB1', startTime: '18:00', endTime: '22:30', color: '#10B981', type: 'work', hours: 4.5, allowParallel: true, globalAcrossBranches: false },
  { id: 'st-pb2', name: 'PT PB2',   code: 'PB2', startTime: '17:30', endTime: '22:30', color: '#059669', type: 'work', hours: 5, allowParallel: true, globalAcrossBranches: false },
  { id: 'st-pc',  name: 'PT PC',   code: 'PC',  startTime: '14:00', endTime: '18:00', color: '#14B8A6', type: 'work', hours: 4, allowParallel: true, globalAcrossBranches: false },
  // Nuovi turni richiesti
  { id: 'st-a1n', name: 'A1 New', code: 'A1_N', startTime: '10:00', endTime: '18:30', color: '#60A5FA', type: 'work', hours: 8, allowParallel: false, globalAcrossBranches: false },
  { id: 'st-w1n', name: 'W1 New', code: 'W1_N', startTime: '10:00', endTime: '13:30', startTime2: '17:30', endTime2: '22:00', color: '#22D3EE', type: 'work', hours: 8, allowParallel: false, globalAcrossBranches: false },
  { id: 'st-bn',  name: 'B New',  code: 'B_N',  startTime: '13:30', endTime: '22:00', color: '#FBBF24', type: 'work', hours: 8, allowParallel: false, globalAcrossBranches: false },
  { id: 'st-pb1n', name: 'PB1 New', code: 'PB1_N', startTime: '18:00', endTime: '22:00', color: '#34D399', type: 'work', hours: 4, allowParallel: true, globalAcrossBranches: false },
  { id: 'st-pa1n', name: 'PA1 New', code: 'PA1_N', startTime: '10:00', endTime: '14:00', color: '#F472B6', type: 'work', hours: 4, allowParallel: true, globalAcrossBranches: false },
  { id: 'st-pcn',  name: 'PC New',  code: 'PC_N',  startTime: '14:00', endTime: '18:00', color: '#2DD4BF', type: 'work', hours: 4, allowParallel: true, globalAcrossBranches: false },
  { id: 'st-cn',  name: 'C New',  code: 'C_N',  startTime: '12:00', endTime: '20:30', color: '#A78BFA', type: 'work', hours: 8, allowParallel: false, globalAcrossBranches: false },
  { id: 'st-6', name: 'Day Off',      code: 'DO', startTime: '',      endTime: '',      color: '#6B7280', type: 'leave', hours: 0,  allowParallel: false, globalAcrossBranches: true, isAutoSchedulable: true, allDay: true  },
  { id: 'st-7', name: 'Annual Leave', code: 'AL', startTime: '',      endTime: '',      color: '#EAB308', type: 'leave', hours: 0,  allowParallel: false, globalAcrossBranches: true, isAutoSchedulable: false, allDay: true },
  { id: 'st-8', name: 'Sick Day',     code: 'SD', startTime: '',      endTime: '',      color: '#EF4444', type: 'leave', hours: 0,  allowParallel: false, globalAcrossBranches: true, isAutoSchedulable: false, allDay: true },
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

// ── Cache Globale Write-Through ──
export let cachedShiftTypes: ShiftType[] | null = null
export let cachedOvertimeSettings: OvertimeSettings[] | any = null
export let cachedAutoScheduleTimeSlots: AutoScheduleTimeSlot[] | null = null
export let cachedRosterData: Record<string, string> | null = null
export let cachedRosterRotationSettings: RosterRotationSettings | null = null
export const cachedBranchOpeningHours = new Map<string, BranchOpeningHoursSettings>()

// ── LocalStorage keys ──
const SHIFT_TYPES_KEY = 'hr_operational_shift_types'
const ROSTER_KEY = 'hr_operational_roster'
const OVERTIME_SETTINGS_KEY = 'hr_operational_overtime_settings'
const AUTO_SCHEDULE_TARGETS_KEY = 'hr_operational_auto_schedule_targets'

/**
 * Funzione asincrona globale per caricare TUTTI i dati operativi del roster da Supabase.
 */
export async function initOperationalDataFromDb(): Promise<void> {
  try {
    const { data: shiftData, error: shiftErr } = await supabase
      .from('hr_operational_shift_types')
      .select('*')
      .order('id', { ascending: true })

    if (shiftErr) throw shiftErr

    if (!shiftData || shiftData.length === 0) {
      const dbPayload = DEFAULT_SHIFT_TYPES.map(t => ({
        id: t.id,
        name: t.name,
        code: t.code,
        start_time: t.startTime,
        end_time: t.endTime,
        start_time2: t.startTime2 || null,
        end_time2: t.endTime2 || null,
        color: t.color,
        type: t.type,
        hours: t.hours,
        allow_parallel: t.allowParallel,
        global_across_branches: t.globalAcrossBranches,
        is_auto_schedulable: t.isAutoSchedulable ?? true,
        all_day: t.allDay ?? false,
        is_custom: t.isCustom ?? false
      }))
      await supabase.from('hr_operational_shift_types').insert(dbPayload)
      cachedShiftTypes = [...DEFAULT_SHIFT_TYPES]
    } else {
      cachedShiftTypes = shiftData.map((t: any) => ({
        id: t.id,
        name: t.name,
        code: t.code,
        startTime: t.start_time || '',
        endTime: t.end_time || '',
        startTime2: t.start_time2 || undefined,
        endTime2: t.end_time2 || undefined,
        color: t.color,
        type: t.type as 'work' | 'leave',
        hours: Number(t.hours),
        allowParallel: t.allow_parallel,
        globalAcrossBranches: t.global_across_branches,
        isAutoSchedulable: t.is_auto_schedulable,
        allDay: t.all_day,
        isCustom: t.is_custom
      }))
    }

    let { data: settingsData, error: settingsErr } = await supabase
      .from('hr_roster_settings')
      .select('*')

    if (settingsErr) throw settingsErr

    cachedBranchOpeningHours.clear()

    const isMigrated = typeof window !== 'undefined' && localStorage.getItem('hr_roster_supabase_migrated:v1') === 'true'

    // MIGRATION: Se hr_roster_settings è vuoto su Supabase, migra i dati locali preesistenti
    if (!isMigrated && (!settingsData || settingsData.length === 0) && typeof window !== 'undefined') {
      const localTargetsRaw = localStorage.getItem(AUTO_SCHEDULE_TARGETS_KEY)
      const localTargets = localTargetsRaw ? JSON.parse(localTargetsRaw) : []
      
      const localRotationRaw = localStorage.getItem('hr_operational_roster_rotation_settings')
      const localRotation = localRotationRaw ? JSON.parse(localRotationRaw) : { ftStrategy: 'balanced', ptStrategy: 'balanced', max_consecutive_same_shift: 2 }

      const localOvertimeRaw = localStorage.getItem(OVERTIME_SETTINGS_KEY)
      const localOvertime = localOvertimeRaw ? JSON.parse(localOvertimeRaw) : { overtime_multiplier_salary: 1.5, overtime_multiplier_leave: 1.0, public_holiday_multiplier_salary: 2.0, public_holiday_multiplier_leave: 1.0, public_holiday_work_multiplier: 4.0, public_holiday_off_multiplier: 1.0 }

      const { data: bData } = await supabase.from('provider_branches').select('id')
      if (bData && bData.length > 0) {
        const payload = bData.map(b => {
          const branchTargets = localTargets.filter((t: any) => t.branchId === b.id)
          const localOpeningRaw = localStorage.getItem(`hr_operational_opening_hours_${b.id}`)
          const localOpening = localOpeningRaw ? JSON.parse(localOpeningRaw) : {}
          
          return {
            branch_id: b.id,
            rotation_settings: localRotation,
            auto_schedule_targets: branchTargets,
            overtime_settings: localOvertime,
            opening_hours: localOpening
          }
        })
        
        await supabase.from('hr_roster_settings').upsert(payload)
        
        // Ricarica per avere settingsData popolato
        const { data: reloadedSettings } = await supabase.from('hr_roster_settings').select('*')
        settingsData = reloadedSettings || []
      }
    }

    if (settingsData && settingsData.length > 0) {
      const firstBranchSettings = settingsData[0]
      cachedRosterRotationSettings = firstBranchSettings.rotation_settings || null
      cachedOvertimeSettings = firstBranchSettings.overtime_settings || null
      
      let allSlots: AutoScheduleTimeSlot[] = []
      settingsData.forEach(row => {
        if (Array.isArray(row.auto_schedule_targets) && row.auto_schedule_targets.length > 0) {
          allSlots.push(...row.auto_schedule_targets)
        }
        if (row.opening_hours) {
          cachedBranchOpeningHours.set(row.branch_id, row.opening_hours)
        }
      });

      // MIGRATION / FALLBACK dei target dal localStorage se quelli sul DB sono vuoti
      if (!isMigrated && allSlots.length === 0 && typeof window !== 'undefined') {
        const localTargetsRaw = localStorage.getItem(AUTO_SCHEDULE_TARGETS_KEY)
        const localTargets = localTargetsRaw ? JSON.parse(localTargetsRaw) : []
        if (localTargets.length > 0) {
          allSlots = localTargets
          for (const row of settingsData) {
            const branchTargets = localTargets.filter((t: any) => t.branchId === row.branch_id)
            if (branchTargets.length > 0) {
              await supabase
                .from('hr_roster_settings')
                .update({ auto_schedule_targets: branchTargets })
                .eq('branch_id', row.branch_id)
            }
          }
        }
      }
      cachedAutoScheduleTimeSlots = allSlots

      // FALLBACK della strategia di rotazione dal localStorage
      if (!isMigrated && !cachedRosterRotationSettings && typeof window !== 'undefined') {
        const localRotationRaw = localStorage.getItem('hr_operational_roster_rotation_settings')
        if (localRotationRaw) {
          cachedRosterRotationSettings = JSON.parse(localRotationRaw)
          for (const row of settingsData) {
            await supabase
              .from('hr_roster_settings')
              .update({ rotation_settings: cachedRosterRotationSettings })
              .eq('branch_id', row.branch_id)
          }
        }
      }

      // FALLBACK dei parametri straordinari dal localStorage
      if (!isMigrated && !cachedOvertimeSettings && typeof window !== 'undefined') {
        const localOvertimeRaw = localStorage.getItem(OVERTIME_SETTINGS_KEY)
        if (localOvertimeRaw) {
          cachedOvertimeSettings = JSON.parse(localOvertimeRaw)
          for (const row of settingsData) {
            await supabase
              .from('hr_roster_settings')
              .update({ overtime_settings: cachedOvertimeSettings })
              .eq('branch_id', row.branch_id)
          }
        }
      }
    }

    let { data: rosterData, error: rosterErr } = await supabase
      .from('hr_roster_assignments')
      .select('*')

    if (rosterErr) throw rosterErr

    // MIGRATION: Se hr_roster_assignments è vuoto, migra le assegnazioni da localStorage
    if (!isMigrated && (!rosterData || rosterData.length === 0) && typeof window !== 'undefined') {
      const localRosterRaw = localStorage.getItem(ROSTER_KEY)
      if (localRosterRaw) {
        try {
          const localRoster = JSON.parse(localRosterRaw)
          const payload: any[] = []
          const frozenWeeks: Record<string, Record<string, any>> = {}

          Object.entries(localRoster).forEach(([key, val]: any) => {
            if (key.startsWith('opening_hours::')) {
              const parts = key.split('::')
              if (parts.length >= 4) {
                const branchId = parts[2]
                if (!frozenWeeks[branchId]) frozenWeeks[branchId] = {}
                try {
                  frozenWeeks[branchId][key] = JSON.parse(val)
                } catch {
                  frozenWeeks[branchId][key] = val
                }
              }
              return
            }

            const parsed = parseRosterKey(key)
            if (parsed && val) {
              payload.push({
                branch_id: parsed.branchId,
                staff_id: parsed.staffId,
                date: parsed.date,
                shift_ids: val
              })
            }
          })

          if (payload.length > 0) {
            await supabase.from('hr_roster_assignments').upsert(payload, { onConflict: 'branch_id,staff_id,date' })
          }

          for (const [branchId, weeks] of Object.entries(frozenWeeks)) {
            const { data: current } = await supabase
              .from('hr_roster_settings')
              .select('opening_hours')
              .eq('branch_id', branchId)
              .maybeSingle()

            const currentOpening = current?.opening_hours || {}
            const updatedOpening = {
              ...currentOpening,
              frozenWeeks: {
                ...(currentOpening.frozenWeeks || {}),
                ...weeks
              }
            }

            await supabase.from('hr_roster_settings').upsert({
              branch_id: branchId,
              opening_hours: updatedOpening
            }, { onConflict: 'branch_id' })
          }

          // Ricarica assegnazioni
          const { data: reloadedRoster } = await supabase.from('hr_roster_assignments').select('*')
          rosterData = reloadedRoster || []
        } catch (e) {
          console.error('Error migrating local roster to DB', e)
        }
      }
    }

    const newRoster: Record<string, string> = {}
    if (rosterData) {
      rosterData.forEach(row => {
        const key = rosterKey(row.branch_id, row.staff_id, row.date)
        newRoster[key] = row.shift_ids
      })
    }
    
    settingsData?.forEach(row => {
      if (row.opening_hours?.frozenWeeks) {
        Object.entries(row.opening_hours.frozenWeeks).forEach(([weekKey, weekData]: any) => {
          newRoster[weekKey] = typeof weekData === 'string' ? weekData : JSON.stringify(weekData)
        })
      }
    })

    cachedRosterData = newRoster

    if (typeof window !== 'undefined') {
      localStorage.setItem('hr_roster_supabase_migrated:v1', 'true')
      if (cachedShiftTypes) {
        localStorage.setItem(SHIFT_TYPES_KEY, JSON.stringify(cachedShiftTypes))
      }
      if (cachedRosterData) {
        localStorage.setItem(ROSTER_KEY, JSON.stringify(cachedRosterData))
      }
      if (cachedRosterRotationSettings) {
        localStorage.setItem('hr_operational_roster_rotation_settings', JSON.stringify(cachedRosterRotationSettings))
      }
      if (cachedOvertimeSettings) {
        localStorage.setItem(OVERTIME_SETTINGS_KEY, JSON.stringify(cachedOvertimeSettings))
      }
      if (cachedAutoScheduleTimeSlots) {
        localStorage.setItem(AUTO_SCHEDULE_TARGETS_KEY, JSON.stringify(cachedAutoScheduleTimeSlots))
      }
    }

  } catch (error: any) {
    console.error('Errore caricamento da Supabase:', error?.message || error)
    fallbackToLocalStorage()
  }
}

function fallbackToLocalStorage() {
  if (typeof window === 'undefined') return
  try {
    const shiftStored = localStorage.getItem(SHIFT_TYPES_KEY)
    cachedShiftTypes = shiftStored ? JSON.parse(shiftStored) : DEFAULT_SHIFT_TYPES

    const rosterStored = localStorage.getItem(ROSTER_KEY)
    cachedRosterData = rosterStored ? JSON.parse(rosterStored) : {}

    const overtimeStored = localStorage.getItem(OVERTIME_SETTINGS_KEY)
    cachedOvertimeSettings = overtimeStored ? JSON.parse(overtimeStored) : { 
      overtime_multiplier_salary: 1.5, 
      overtime_multiplier_leave: 1.0, 
      public_holiday_multiplier_salary: 2.0, 
      public_holiday_multiplier_leave: 1.0, 
      public_holiday_work_multiplier: 4.0, 
      public_holiday_off_multiplier: 1.0,
      split_shift_compensation: 50000,
      location_change_compensation: 60000
    }
  } catch (e) {
    console.error('Failed to load from local storage fallback', e)
  }
}

export function getShiftTypes(): ShiftType[] {
  if (cachedShiftTypes) return cachedShiftTypes
  if (typeof window === 'undefined') return DEFAULT_SHIFT_TYPES
  const stored = localStorage.getItem(SHIFT_TYPES_KEY)
  if (stored) {
    try {
      const types = JSON.parse(stored) as ShiftType[]
      if (types.some(t => t.id === 'st-1' || !types.some(t => t.code === 'A1_N'))) {
        localStorage.setItem(SHIFT_TYPES_KEY, JSON.stringify(DEFAULT_SHIFT_TYPES))
        cachedShiftTypes = [...DEFAULT_SHIFT_TYPES]
        return DEFAULT_SHIFT_TYPES
      }
      cachedShiftTypes = types
      return types
    } catch { return DEFAULT_SHIFT_TYPES }
  }
  return DEFAULT_SHIFT_TYPES
}

export function saveShiftTypes(types: ShiftType[]): void {
  cachedShiftTypes = types
  localStorage.setItem(SHIFT_TYPES_KEY, JSON.stringify(types))
  
  const dbPayload = types.map(t => ({
    id: t.id, name: t.name, code: t.code, start_time: t.startTime, end_time: t.endTime,
    start_time2: t.startTime2 || null, end_time2: t.endTime2 || null, color: t.color,
    type: t.type, hours: t.hours, allow_parallel: t.allowParallel,
    global_across_branches: t.globalAcrossBranches, is_auto_schedulable: t.isAutoSchedulable ?? true,
    all_day: t.allDay ?? false, is_custom: t.isCustom ?? false
  }))

  supabase.from('hr_operational_shift_types').delete().neq('id', 'non-existent')
    .then(() => supabase.from('hr_operational_shift_types').insert(dbPayload))
}

export function getOvertimeSettings(): OvertimeSettings {
  if (cachedOvertimeSettings) return cachedOvertimeSettings
  const defaultSettings = { 
    overtime_multiplier_salary: 1.5, 
    overtime_multiplier_leave: 1.0, 
    public_holiday_multiplier_salary: 2.0, 
    public_holiday_multiplier_leave: 1.0, 
    public_holiday_work_multiplier: 4.0, 
    public_holiday_off_multiplier: 1.0,
    split_shift_compensation: 50000,
    location_change_compensation: 60000
  }
  const stored = typeof window !== 'undefined' ? localStorage.getItem(OVERTIME_SETTINGS_KEY) : null
  if (stored) {
    try { return cachedOvertimeSettings = { ...defaultSettings, ...JSON.parse(stored) } } catch { }
  }
  return cachedOvertimeSettings = defaultSettings
}

export function saveOvertimeSettings(settings: OvertimeSettings): void {
  cachedOvertimeSettings = settings
  localStorage.setItem(OVERTIME_SETTINGS_KEY, JSON.stringify(settings))
  supabase.from('hr_roster_settings').select('branch_id').then(({ data }) => {
    data?.forEach(b => supabase.from('hr_roster_settings').upsert({ branch_id: b.branch_id, overtime_settings: settings }, { onConflict: 'branch_id' }))
  })
}

export function getAutoScheduleTimeSlots(): AutoScheduleTimeSlot[] {
  if (cachedAutoScheduleTimeSlots) return cachedAutoScheduleTimeSlots
  const stored = typeof window !== 'undefined' ? localStorage.getItem(AUTO_SCHEDULE_TARGETS_KEY) : null
  return cachedAutoScheduleTimeSlots = stored ? JSON.parse(stored) : []
}

export async function saveAutoScheduleTimeSlots(slots: AutoScheduleTimeSlot[]): Promise<void> {
  cachedAutoScheduleTimeSlots = slots
  localStorage.setItem(AUTO_SCHEDULE_TARGETS_KEY, JSON.stringify(slots))
  const slotsByBranch: Record<string, AutoScheduleTimeSlot[]> = {}
  
  try {
    const { data: bData } = await supabase.from('provider_branches').select('id')
    if (bData && bData.length > 0) {
      bData.forEach(b => {
        slotsByBranch[b.id] = []
      })
    }
  } catch (err) {
    console.error('Error fetching branches for targets sync:', err)
  }

  slots.forEach(s => { 
    slotsByBranch[s.branchId] = slotsByBranch[s.branchId] || []
    slotsByBranch[s.branchId].push(s) 
  })

  const promises = Object.entries(slotsByBranch).map(([branchId, branchSlots]) => {
    return supabase.from('hr_roster_settings').upsert({ branch_id: branchId, auto_schedule_targets: branchSlots }, { onConflict: 'branch_id' })
  })
  try {
    await Promise.all(promises)
  } catch (e) {
    console.error('Error saving auto schedule targets to DB:', e)
  }
}

export function getRosterData(): Record<string, string> {
  if (cachedRosterData) return cachedRosterData
  const stored = typeof window !== 'undefined' ? localStorage.getItem(ROSTER_KEY) : null
  return cachedRosterData = stored ? JSON.parse(stored) : {}
}

export function saveRosterData(data: Record<string, string>): void {
  const oldRoster = cachedRosterData ? { ...cachedRosterData } : {}
  cachedRosterData = data
  localStorage.setItem(ROSTER_KEY, JSON.stringify(data))
  syncRosterAssignmentsToDb(data, oldRoster)
}

async function syncRosterAssignmentsToDb(data: Record<string, string>, oldRoster: Record<string, string>) {
  const deletedKeys: string[] = []
  Object.keys(oldRoster).forEach(key => {
    if (!key.startsWith('opening_hours::') && (!data[key] || data[key] === '')) {
      deletedKeys.push(key)
    }
  })

  const payload: any[] = []
  Object.entries(data).forEach(([key, val]) => {
    if (key.startsWith('opening_hours::')) return
    const parsed = parseRosterKey(key)
    if (parsed) {
      if (val === '') {
        deletedKeys.push(key)
      } else {
        payload.push({ branch_id: parsed.branchId, staff_id: parsed.staffId, date: parsed.date, shift_ids: val })
      }
    }
  })

  // Upsert dei record attivi
  if (payload.length > 0) {
    const { error } = await supabase.from('hr_roster_assignments').upsert(payload, { onConflict: 'branch_id,staff_id,date' })
    if (error) console.error('Errore upsert assignments:', error)
  }

  // Delete dei record cancellati o svuotati
  if (deletedKeys.length > 0) {
    const deletePromises = deletedKeys.map(key => {
      const parsed = parseRosterKey(key)
      if (!parsed) return Promise.resolve()
      return supabase
        .from('hr_roster_assignments')
        .delete()
        .eq('branch_id', parsed.branchId)
        .eq('staff_id', parsed.staffId)
        .eq('date', parsed.date)
    })
    try {
      await Promise.all(deletePromises)
    } catch (e) {
      console.error('Errore eliminazione assignments da DB:', e)
    }
  }
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
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
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

export function formatShortDate(date: Date, lang?: string): string {
  const locale = lang === 'vi' ? 'vi-VN' : 'en-GB'
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

export function formatWeekRange(start: Date, lang?: string): string {
  const end = addDays(start, 6)
  const locale = lang === 'vi' ? 'vi-VN' : 'en-GB'
  const sMonth = start.toLocaleDateString(locale, { month: 'short' })
  const eMonth = end.toLocaleDateString(locale, { month: 'short' })
  const year = end.getFullYear()
  if (sMonth === eMonth) {
    return `${start.getDate()} – ${end.getDate()} ${sMonth} ${year}`
  }
  return `${start.getDate()} ${sMonth} – ${end.getDate()} ${eMonth} ${year}`
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_NAMES_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
export function dayName(date: Date, lang?: string): string {
  const idx = (date.getDay() + 6) % 7 // Monday=0
  return lang === 'vi' ? DAY_NAMES_VI[idx] : DAY_NAMES[idx]
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
  // Full-day global shifts block everything in other branches
  const isGlobalFullDay = (s: ShiftType) => s.globalAcrossBranches && (s.allDay ?? true);
  if (isGlobalFullDay(existing) || isGlobalFullDay(candidate)) return true

  // If either shift explicitly FORBIDS parallel assignment on the same day, they conflict!
  if (candidate.allowParallel === false || existing.allowParallel === false) return true

  // Even if both allow parallel assignment on the same day (e.g. Morning and Afternoon),
  // we MUST check if their actual TIMES overlap. A person cannot be in two places at once.
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

  if (aPeriods.length === 0 || bPeriods.length === 0) {
    const isFullDay = (s: ShiftType) => s.type === 'leave' && (s.allDay ?? true);
    if (isFullDay(existing) || isFullDay(candidate)) return true
    return false
  }

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
  shiftTypes?: ShiftType[],
): { branchId: string; shiftTypeId: string }[] {
  const results: { branchId: string; shiftTypeId: string }[] = []
  for (const [key, shiftTypeIdStr] of Object.entries(rosterData)) {
    const parsed = parseRosterKey(key)
    if (!parsed) continue
    if (parsed.staffId === staffId && parsed.date === date && parsed.branchId !== excludeBranchId) {
      if (shiftTypeIdStr) {
        shiftTypeIdStr.split(',').forEach(id => {
          if (shiftTypes) {
            const st = shiftTypes.find(s => s.id === id)
            if (st?.globalAcrossBranches) {
              return // skip global shifts since they are already applied locally
            }
          }
          results.push({ branchId: parsed.branchId, shiftTypeId: id })
        })
      }
    }
  }
  return results
}

export interface RosterRotationSettings {
  ftStrategy: 'none' | 'weekly' | 'daily' | 'balanced';
  ptStrategy: 'none' | 'weekly' | 'daily' | 'balanced';
  max_consecutive_same_shift: number;
}

const ROSTER_ROTATION_SETTINGS_KEY = 'hr_operational_roster_rotation_settings'

export function getRosterRotationSettings(): RosterRotationSettings {
  if (cachedRosterRotationSettings) return cachedRosterRotationSettings
  const defaultSettings: RosterRotationSettings = {
    ftStrategy: 'balanced',
    ptStrategy: 'balanced',
    max_consecutive_same_shift: 2
  }
  if (typeof window === 'undefined') return defaultSettings
  const stored = localStorage.getItem(ROSTER_ROTATION_SETTINGS_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      cachedRosterRotationSettings = {
        ftStrategy: parsed.ftStrategy || parsed.strategy || 'balanced',
        ptStrategy: parsed.ptStrategy || parsed.strategy || 'balanced',
        max_consecutive_same_shift: parsed.max_consecutive_same_shift ?? 2
      }
      return cachedRosterRotationSettings
    } catch {
      return defaultSettings
    }
  }
  return defaultSettings
}

export function saveRosterRotationSettings(settings: RosterRotationSettings): void {
  cachedRosterRotationSettings = settings
  localStorage.setItem(ROSTER_ROTATION_SETTINGS_KEY, JSON.stringify(settings))
  
  supabase.from('hr_roster_settings').select('branch_id').then(({ data }) => {
    data?.forEach(b => {
      supabase.from('hr_roster_settings').upsert({
        branch_id: b.branch_id,
        rotation_settings: settings
      }, { onConflict: 'branch_id' })
    })
  })
}

export function cleanOrphanedCustomShifts(roster: Record<string, string>, shiftTypes: ShiftType[]): ShiftType[] {
  const assignedIds = new Set(Object.values(roster))
  return shiftTypes.filter(s => !s.isCustom || assignedIds.has(s.id))
}

// ── Orari di Apertura (Opening Hours) ──

export interface OpeningHoursSlot {
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}

export interface DayOpeningHours {
  isOpen: boolean;
  slots: OpeningHoursSlot[];
}

export interface SpecialEventHours {
  id: string;
  name: string;
  isActive: boolean;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  hours: Record<number, DayOpeningHours>; // 0=Mon ... 6=Sun
}

export interface BranchOpeningHoursSettings {
  branchId: string;
  standardHours: Record<number, DayOpeningHours>;
  specialEvents: SpecialEventHours[];
}

export function getDefaultOpeningHours(): Record<number, DayOpeningHours> {
  const hours: Record<number, DayOpeningHours> = {}
  for (let i = 0; i < 7; i++) {
    hours[i] = {
      isOpen: true,
      slots: [{ startTime: '09:00', endTime: '22:00' }]
    }
  }
  return hours
}

export function getBranchOpeningHours(branchId: string): BranchOpeningHoursSettings {
  const cached = cachedBranchOpeningHours.get(branchId)
  if (cached) return cached
  const defaultSettings: BranchOpeningHoursSettings = {
    branchId,
    standardHours: getDefaultOpeningHours(),
    specialEvents: []
  }
  if (typeof window === 'undefined') return defaultSettings
  const stored = localStorage.getItem(`hr_operational_opening_hours_${branchId}`)
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      const res = {
        ...defaultSettings,
        ...parsed,
        standardHours: { ...defaultSettings.standardHours, ...(parsed.standardHours || {}) },
        specialEvents: parsed.specialEvents || []
      }
      cachedBranchOpeningHours.set(branchId, res)
      return res
    } catch {
      return defaultSettings
    }
  }
  return defaultSettings
}

export function saveBranchOpeningHours(branchId: string, settings: BranchOpeningHoursSettings): void {
  cachedBranchOpeningHours.set(branchId, settings)
  localStorage.setItem(`hr_operational_opening_hours_${branchId}`, JSON.stringify(settings))
  
  supabase.from('hr_roster_settings').upsert({
    branch_id: branchId,
    opening_hours: settings
  }, { onConflict: 'branch_id' }).then(({ error }) => {
    if (error) console.error('Error saving branch opening hours:', error)
  })
}

export function getWeekOpeningHours(
  branchId: string,
  weekStartDateStr: string, // YYYY-MM-DD (Monday)
  rosterData: Record<string, string>
): Record<number, DayOpeningHours> {
  // 1. Check if frozen in roster
  const frozenKey = `opening_hours::v1::${branchId}::${weekStartDateStr}`
  const frozenVal = rosterData[frozenKey]
  if (frozenVal) {
    try {
      return JSON.parse(frozenVal)
    } catch {
      // fallback
    }
  }

  // 2. Resolve from active settings
  const settings = getBranchOpeningHours(branchId)
  const resolvedHours: Record<number, DayOpeningHours> = {}
  
  const [wy, wm, wd] = weekStartDateStr.split('-').map(Number)
  const weekStart = new Date(wy, wm - 1, wd, 0, 0, 0)

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const currentDay = new Date(weekStart)
    currentDay.setDate(weekStart.getDate() + dayIndex)
    currentDay.setHours(12, 0, 0, 0) // Mezzogiorno per evitare problemi di fuso orario nei confini di data

    // Cerca se esiste un evento speciale attivo che copre questo giorno specifico
    const activeEvent = settings.specialEvents.find(evt => {
      if (!evt.isActive) return false
      if (!evt.startDate || !evt.endDate) return false
      
      const [sy, sm, sd] = evt.startDate.split('-').map(Number)
      const start = new Date(sy, sm - 1, sd, 0, 0, 0)
      
      const [ey, em, ed] = evt.endDate.split('-').map(Number)
      const end = new Date(ey, em - 1, ed, 23, 59, 59)
      
      return currentDay >= start && currentDay <= end
    })

    if (activeEvent) {
      resolvedHours[dayIndex] = activeEvent.hours[dayIndex] || { isOpen: true, slots: [{ startTime: '09:00', endTime: '22:00' }] }
    } else {
      resolvedHours[dayIndex] = settings.standardHours[dayIndex] || { isOpen: true, slots: [{ startTime: '09:00', endTime: '22:00' }] }
    }
  }

  return resolvedHours
}

export function freezeWeekOpeningHours(
  branchId: string,
  weekStartDateStr: string,
  rosterData: Record<string, string>
): Record<string, string> {
  const frozenKey = `opening_hours::v1::${branchId}::${weekStartDateStr}`
  if (rosterData[frozenKey]) return rosterData

  const resolved = getWeekOpeningHours(branchId, weekStartDateStr, rosterData)
  return {
    ...rosterData,
    [frozenKey]: JSON.stringify(resolved)
  }
}

export interface PublishedRoster {
  branch_id: string
  week_start: string
  published_at: string
  published_by?: string | null
  roster_snapshot: Record<string, string>
  shifts_snapshot: ShiftType[]
}

export async function fetchPublishedRoster(branchId: string, weekStartStr: string): Promise<PublishedRoster | null> {
  const { data, error } = await supabase
    .from('hr_published_rosters')
    .select('*')
    .eq('branch_id', branchId)
    .eq('week_start', weekStartStr)
    .maybeSingle()

  if (error) {
    console.error('Error fetching published roster:', error)
    return null
  }
  return data as PublishedRoster | null
}

export async function publishRoster(
  branchId: string,
  weekStartStr: string,
  rosterSnapshot: Record<string, string>,
  shiftsSnapshot: ShiftType[]
): Promise<void> {
  const { error } = await supabase
    .from('hr_published_rosters')
    .upsert({
      branch_id: branchId,
      week_start: weekStartStr,
      roster_snapshot: rosterSnapshot,
      shifts_snapshot: shiftsSnapshot,
      published_at: new Date().toISOString()
    }, { onConflict: 'branch_id,week_start' })

  if (error) {
    console.error('Error publishing roster:', error)
    throw error
  }
}

export async function unpublishRoster(branchId: string, weekStartStr: string): Promise<void> {
  const { error } = await supabase
    .from('hr_published_rosters')
    .delete()
    .eq('branch_id', branchId)
    .eq('week_start', weekStartStr)

  if (error) {
    console.error('Error unpublishing roster:', error)
    throw error
  }
}

export function getTranslatedShiftName(code: string, name: string, lang: string): string {
  if (lang !== 'vi') return name
  const upper = (code || '').toUpperCase()
  if (upper === 'DO') return 'Ngày nghỉ'
  if (upper === 'AL') return 'Nghỉ phép năm'
  if (upper === 'SD') return 'Nghỉ bệnh'
  if (name === 'Morning Shift') return 'Ca Sáng'
  if (name === 'Afternoon Shift') return 'Ca Chiều'
  if (name === 'Night Shift') return 'Ca Tối'
  if (name === 'Split Shift') return 'Ca Gãy'
  return name
}



