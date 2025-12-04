// src/app/daily-reports/_data/useCashout.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useDailyReportSettingsDB, pickCurrentShiftName } from './useDailyReportSettingsDB'

/* ---------- Const ---------- */
const TBL_SUPS = 'suppliers'
const TBL_CASHOUT = 'cashout'
const TBL_APP_ACCOUNTS = 'app_accounts'

// Branch LS bridge
const BRANCH_KEYS = ['dailyreports.selectedBranch', 'dailyreports.selectedBranch.v1'] as const

// Cross tab per cashout
const BC_NAME = 'dailyreports:cashout'

/* ---------- Types ---------- */
export type Sup = { id: string; name: string }

export type CashoutRow = {
  id: string
  branch: string | null
  date: string
  description: string
  category: string | null
  amount: number
  supplier_id: string | null
  supplier_name: string | null
  invoice: boolean
  deliveryNote: boolean
  shift: string | null
  paidBy: string | null
  created_at?: string | null
}

export type SelectedBranch = {
  id?: string | null
  name: string
  address?: string
}

/* ---------- Utils ---------- */
function todayISO() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
function toTitleCase(s: string) {
  const str = String(s || '').toLowerCase().trim()
  if (!str) return ''
  return str.replace(/\b\p{L}+/gu, w => w[0].toUpperCase() + w.slice(1))
}

function sanitizeString(str: string | null | undefined): string {
  if (!str) return ''
  return String(str)
    .normalize('NFKC') // Normalize unicode
    // Remove control characters (ASCII 0-31, 127-159) except \t (9), \n (10), \r (13)
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .trim()
    .slice(0, 1000) // Truncate to avoid massive payloads
}

/* ----- Branch LS ----- */
function loadSelectedBranch(): SelectedBranch | null {
  for (const key of BRANCH_KEYS) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      if (raw.trim().startsWith('{')) {
        const obj = JSON.parse(raw)
        const name = String(obj?.name || '').trim()
        if (name) {
          return {
            id: obj?.id != null ? String(obj.id) : null,
            name,
            address: obj?.address ? String(obj.address) : '',
          }
        }
      }
      const name = String(raw).trim()
      if (name) return { name }
    } catch { }
  }
  return null
}

/* ---------- DB mappers ---------- */
function normFromDb(d: any, suppliers: Sup[]): CashoutRow {
  const supplier_id = d?.supplier_id ? String(d.supplier_id) : null
  const supplier_name = supplier_id ? (suppliers.find(s => s.id === supplier_id)?.name || null) : null
  return {
    id: String(d?.id || uuid()),
    branch: d?.branch != null ? String(d.branch) : null,
    date: String(d?.date || todayISO()),
    description: String(d?.description || ''),
    category: d?.category != null ? String(d.category) : null,
    amount: Number(d?.amount || 0),
    supplier_id,
    supplier_name,
    invoice: !!d?.invoice,
    deliveryNote: !!d?.delivery_note,
    shift: d?.shift != null ? String(d.shift) : null,
    paidBy: d?.paid_by ? String(d.paid_by) : null,
    created_at: d?.created_at ? String(d.created_at) : null,
  }
}
function toDbPayload(r: CashoutRow) {
  return {
    id: r.id,
    branch: r.branch,
    date: r.date,
    description: sanitizeString(r.description),
    category: sanitizeString(r.category),
    amount: Math.round(r.amount || 0),
    supplier_id: r.supplier_id,
    invoice: r.invoice,
    delivery_note: r.deliveryNote,
    shift: sanitizeString(r.shift),
    paid_by: sanitizeString(r.paidBy),
  }
}

/* ---------- User display name ---------- */
async function fetchCurrentUserNameFromDB(): Promise<string> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user || null
    if (!user) return ''
    const userId = String(user.id)
    const email = String(user.email || '')
    const { data, error } = await supabase
      .from(TBL_APP_ACCOUNTS)
      .select('name,email')
      .eq('user_id', userId)
      .limit(1)
      .single()
    if (error) return user.user_metadata?.full_name || user.user_metadata?.name || email
    const dbName = String(data?.name || '').trim()
    if (dbName) return dbName
    const metaName = user.user_metadata?.full_name || user.user_metadata?.name
    if (metaName) return metaName
    const dbEmail = String(data?.email || '').trim()
    return dbEmail || email
  } catch {
    return ''
  }
}

/* ---------- Hook ---------- */
export function useCashout(params?: { year?: number; month?: number; branchName?: string | null }) {
  // Protezione wake/unmount: evitiamo setState su hook smontato
  const isActiveRef = useRef(true)
  useEffect(() => {
    isActiveRef.current = true
    return () => {
      isActiveRef.current = false
    }
  }, [])

  const [selectedBranch, setSelectedBranch] = useState<SelectedBranch | null>(() =>
    typeof window === 'undefined' ? null : loadSelectedBranch()
  )
  const selectedBranchName = selectedBranch?.name || ''

  // Fetch settings from DB
  const { settings: dbSettings } = useDailyReportSettingsDB(params?.branchName || selectedBranchName)

  const [suppliers, setSuppliers] = useState<Sup[]>([])
  const suppliersRef = useRef<Sup[]>([])
  useEffect(() => {
    suppliersRef.current = suppliers
  }, [suppliers])

  const [rows, setRows] = useState<CashoutRow[]>([])
  const [staffOpts, setStaffOpts] = useState<string[]>([])
  const [shiftOpts, setShiftOpts] = useState<string[]>([])
  const [catOpts, setCatOpts] = useState<string[]>([])
  const [currentShiftName, setCurrentShiftName] = useState<string>('')
  const [currentUserName, setCurrentUserName] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bcRef = useRef<BroadcastChannel | null>(null)
  const rtCashoutRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const rtSuppliersRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Safe setters
  const safeSetRows = (updater: CashoutRow[] | ((prev: CashoutRow[]) => CashoutRow[])) => {
    if (!isActiveRef.current) return
    setRows(updater as any)
  }
  const safeSetSuppliers = (updater: Sup[] | ((prev: Sup[]) => Sup[])) => {
    if (!isActiveRef.current) return
    setSuppliers(updater as any)
  }
  const safeSetSelectedBranch = (val: SelectedBranch | null) => {
    if (!isActiveRef.current) return
    setSelectedBranch(val)
  }
  const safeSetCurrentUserName = (val: string) => {
    if (!isActiveRef.current) return
    setCurrentUserName(val)
  }
  const safeSetLoading = (val: boolean) => {
    if (!isActiveRef.current) return
    setLoading(val)
  }
  const safeSetError = (val: string | null) => {
    if (!isActiveRef.current) return
    setError(val)
  }

  // Update options from DB settings
  useEffect(() => {
    if (!dbSettings) return

    // Staff
    if (dbSettings.initialInfo?.staff) {
      setStaffOpts(dbSettings.initialInfo.staff)
    }

    // Shifts
    if (dbSettings.initialInfo?.shifts) {
      const shifts = dbSettings.initialInfo.shifts
      const names = Array.isArray(shifts)
        ? shifts.map(s => typeof s === 'string' ? s : s.name).filter(Boolean)
        : []
      setShiftOpts(names)

      // Calculate current shift
      const current = pickCurrentShiftName(shifts)
      if (current) setCurrentShiftName(current)
    } else {
      // Fallback if missing in DB
      setShiftOpts(['Lunch', 'Dinner'])
    }

    // Categories
    if (dbSettings.cashOut?.categories) {
      setCatOpts(dbSettings.cashOut.categories)
    }
  }, [dbSettings])



  /* ---------- Fetch iniziale / refetch ---------- */
  const refetch = useCallback(async () => {
    safeSetLoading(true)
    safeSetError(null)
    try {
      let q = supabase
        .from(TBL_CASHOUT)
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (params?.year != null && params?.month != null) {
        const start = new Date(params.year, params.month, 1)
        const end = new Date(params.year, params.month + 1, 1)
        const p = (n: number) => String(n).padStart(2, '0')
        const startISO = `${start.getFullYear()}-${p(start.getMonth() + 1)}-${p(start.getDate())}`
        const endISO = `${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}`
        q = q.gte('date', startISO).lt('date', endISO)
      }

      if (params?.branchName) {
        q = q.eq('branch', params.branchName)
      }

      const [{ data: sups, error: supErr }, { data: cash, error: cashErr }] = await Promise.all([
        supabase.from(TBL_SUPS).select('id,name').order('name', { ascending: true }),
        q
      ])

      if (!isActiveRef.current) return

      if (supErr || cashErr) {
        console.error('fetch cashout error', supErr || cashErr)
        safeSetError('Failed to load Cash Out data.')
      }

      const supRows = (sups || []).map(d => ({ id: String(d.id), name: String(d.name) }))
      safeSetSuppliers(supRows)

      const norm = (cash || []).map(d => normFromDb(d, supRows))
      safeSetRows(norm)
    } catch (err) {
      if (!isActiveRef.current) return
      console.error('fetch cashout exception', err)
      safeSetError('Failed to load Cash Out data.')
      safeSetRows([])
    } finally {
      safeSetLoading(false)
    }
  }, [params?.year, params?.month, params?.branchName])

  /* ---------- Supplier CRUD ---------- */
  const createSupplier = useCallback(
    async (name: string): Promise<Sup | null> => {
      const clean = String(name || '').trim()
      if (!clean) return null
      const existing = suppliersRef.current.find(
        s => s.name.toLowerCase() === clean.toLowerCase()
      )
      if (existing) return existing

      const { data, error } = await supabase
        .from(TBL_SUPS)
        .insert({ name: toTitleCase(clean) })
        .select('id,name')
        .single()

      if (!isActiveRef.current) return null

      if (error || !data) {
        console.error('create supplier error', error)
        return null
      }

      const created: Sup = { id: String(data.id), name: String(data.name) }
      safeSetSuppliers(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))

      // ping altre tab
      if (bcRef.current) {
        try {
          bcRef.current.postMessage({ type: 'suppliers:changed' })
        } catch { }
      }

      return created
    },
    []
  )

  /* ---------- Cashout CRUD ---------- */
  const upsertCashout = useCallback(
    async (row: CashoutRow) => {
      console.log('[useCashout] upsertCashout called', row)
      safeSetError(null)
      let lastError: any
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) {
            console.warn(`[useCashout] Retry attempt ${attempt + 1}...`)
            await new Promise(r => setTimeout(r, 1000))
          }

          const payload = toDbPayload(row)
          console.log('[useCashout] payload', payload)

          const dbPromise = supabase
            .from(TBL_CASHOUT)
            .upsert([payload], { onConflict: 'id' })
            .select('*')
            .single()

          const timeoutPromise = new Promise<{ data: any, error: any }>((_, reject) =>
            setTimeout(() => reject(new Error('Network request timed out (45s). Please check your connection.')), 45000)
          )

          // @ts-ignore
          const { data, error } = await Promise.race([dbPromise, timeoutPromise])

          console.log('[useCashout] supabase response', { data, error })

          if (!isActiveRef.current) {
            console.warn('[useCashout] component unmounted during save')
            return null
          }

          if (error || !data) {
            console.error('[useCashout] upsert error', error)
            const msg = 'Failed to save entry: ' + (error?.message || 'Unknown error')
            // If it's the last attempt, throw
            if (attempt === 1) {
              safeSetError(msg)
              throw new Error(msg)
            }
            // Otherwise continue to retry
            lastError = new Error(msg)
            continue
          }

          const saved = normFromDb(data, suppliersRef.current)
          safeSetRows(prev => {
            const i = prev.findIndex(r => r.id === saved.id)
            if (i >= 0) {
              const next = [...prev]
              next[i] = saved
              return next
            }
            return [saved, ...prev]
          })

          if (bcRef.current) {
            try {
              bcRef.current.postMessage({ type: 'cashout:changed', id: saved.id })
            } catch (e) {
              console.warn('[useCashout] postMessage error', e)
            }
          }

          return saved
        } catch (err) {
          console.error(`[useCashout] Exception in attempt ${attempt + 1}`, err)
          lastError = err
          if (attempt === 1) {
            if (err instanceof Error) throw err
            throw new Error(String(err))
          }
        }
      }
      throw lastError
    },
    []
  )

  const deleteCashout = useCallback(async (id: string) => {
    safeSetError(null)
    const { error } = await supabase.from(TBL_CASHOUT).delete().eq('id', id)
    if (!isActiveRef.current) return false

    if (error) {
      console.error('delete cashout error', error)
      safeSetError('Failed to delete entry: ' + error.message)
      return false
    }
    safeSetRows(prev => prev.filter(r => r.id !== id))

    if (bcRef.current) {
      try {
        bcRef.current.postMessage({ type: 'cashout:changed', id })
      } catch { }
    }
    return true
  }, [])

  const bulkDeleteCashout = useCallback(async (ids: string[]) => {
    if (!ids.length) return true
    safeSetError(null)
    const { error } = await supabase.from(TBL_CASHOUT).delete().in('id', ids)
    if (!isActiveRef.current) return false

    if (error) {
      console.error('bulk delete cashout error', error)
      safeSetError('Failed to delete entries: ' + error.message)
      return false
    }
    safeSetRows(prev => prev.filter(r => !ids.includes(r.id)))

    if (bcRef.current) {
      try {
        bcRef.current.postMessage({ type: 'cashout:changed' })
      } catch { }
    }
    return true
  }, [])

  /* ---------- Current user name ---------- */
  useEffect(() => {
    ; (async () => {
      const name = await fetchCurrentUserNameFromDB()
      if (!isActiveRef.current) return
      safeSetCurrentUserName(name || '')
    })()

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      const name = await fetchCurrentUserNameFromDB()
      if (!isActiveRef.current) return
      safeSetCurrentUserName(name || '')
    })

    return () => {
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  /* ---------- First fetch ---------- */
  useEffect(() => {
    refetch().catch(() => { })

    const onFocus = () => {
      if (isActiveRef.current && document.visibilityState === 'visible') {
        refetch().catch(() => { })
      }
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refetch])

  /* ---------- localStorage listeners (Branch only) ---------- */
  useEffect(() => {
    function onStorage(ev: StorageEvent) {
      if (!ev.key) return
      if (!isActiveRef.current) return

      if ((BRANCH_KEYS as readonly string[]).includes(ev.key as any)) {
        safeSetSelectedBranch(loadSelectedBranch())
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /* ---------- BroadcastChannel cross tab (cashout specific) ---------- */
  useEffect(() => {
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel(BC_NAME)
      bcRef.current = bc
      const onMsg = (ev: MessageEvent) => {
        if (!isActiveRef.current) return
        const t = ev?.data?.type
        if (t === 'cashout:changed' || t === 'suppliers:changed') {
          refetch().catch(() => { })
        }
      }
      bc.addEventListener('message', onMsg)
      return () => {
        if (bc) {
          bc.removeEventListener('message', onMsg)
          bc.close()
        }
      }
    } catch {
      return () => { }
    }
  }, [refetch])

  /* ---------- Supabase realtime (cashout + suppliers) ---------- */
  useEffect(() => {
    const chCash = supabase
      .channel('rt-cashout')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TBL_CASHOUT },
        (payload) => {
          if (!isActiveRef.current) return
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const saved = normFromDb(payload.new, suppliersRef.current)
            safeSetRows(prev => {
              const i = prev.findIndex(r => r.id === saved.id)
              if (i >= 0) {
                const next = [...prev]
                next[i] = saved
                return next
              }
              return [saved, ...prev]
            })
          } else if (payload.eventType === 'DELETE') {
            const id = String(payload.old?.id || '')
            safeSetRows(prev => prev.filter(r => r.id !== id))
          }
        }
      )
      .subscribe()

    const chSup = supabase
      .channel('rt-suppliers')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TBL_SUPS },
        async () => {
          const { data: sups } = await supabase
            .from(TBL_SUPS)
            .select('id,name')
            .order('name', { ascending: true })

          if (!isActiveRef.current) return

          const supRows = (sups || []).map(d => ({
            id: String(d.id),
            name: String(d.name),
          }))
          safeSetSuppliers(supRows)
        }
      )
      .subscribe()

    rtCashoutRef.current = chCash
    rtSuppliersRef.current = chSup

    return () => {
      if (rtCashoutRef.current) supabase.removeChannel(rtCashoutRef.current)
      if (rtSuppliersRef.current) supabase.removeChannel(rtSuppliersRef.current)
    }
  }, [])

  return {
    // state
    rows,
    suppliers,
    staffOpts,
    shiftOpts,
    catOpts,
    selectedBranch,
    selectedBranchName,
    currentUserName,
    currentShiftName,
    loading,
    error,

    // actions
    refetch,
    createSupplier,
    upsertCashout,
    deleteCashout,
    bulkDeleteCashout,
  }
}