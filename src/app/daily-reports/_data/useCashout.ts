// src/app/daily-reports/_data/useCashout.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

/* ---------- Const ---------- */
const TBL_SUPS = 'suppliers'
const TBL_CASHOUT = 'cashout'
const TBL_APP_ACCOUNTS = 'app_accounts'

// Initial info LS (staff + shifts)
const SETTINGS_LS_KEY = 'dailysettings.initialInfo.v1'

// Vecchia chiave categorie - non piu usata come sorgente principale
const CATEGORIES_LEGACY_LS_KEY = 'dailysettings.categories.v1'

// Nuovo cache globale settings
const DR_SETTINGS_CACHE_KEY = 'dr.settings.cache'
const DR_SETTINGS_BUMP_KEY = 'dr.settings.bump'
const DR_SETTINGS_BC_NAME = 'dr-settings'

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

/* ----- Staff / shifts da initialInfo LS ----- */
function loadAuthorizedStaff(): string[] {
  try {
    const raw = localStorage.getItem(SETTINGS_LS_KEY)
    if (!raw) return []
    const p = JSON.parse(raw)
    return Array.isArray(p?.staff) ? p.staff.map((s: any) => String(s).trim()).filter(Boolean) : []
  } catch {
    return []
  }
}
function loadShiftLabels(): string[] {
  try {
    const raw = localStorage.getItem(SETTINGS_LS_KEY)
    if (!raw) return ['Lunch', 'Dinner', 'All day']
    const p = JSON.parse(raw)
    const out: string[] = []
    const arr = Array.isArray(p?.shifts) ? p.shifts : []
    for (const it of arr) {
      if (typeof it === 'string') {
        const s = it.trim()
        if (s) out.push(s)
      } else if (it && typeof it === 'object') {
        const name = String(it.name ?? it.label ?? '').trim()
        if (name) out.push(name)
      }
    }
    const uniq = Array.from(new Set(out)).filter(Boolean)
    return uniq.length ? uniq : ['Lunch', 'Dinner', 'All day']
  } catch {
    return ['Lunch', 'Dinner', 'All day']
  }
}

/* ----- Categories: nuova sorgente da dr.settings.cache + eventi ----- */
function normalizeCategories(list: any): string[] {
  if (!Array.isArray(list)) return []
  return list
    .map((s) => String(s || '').trim())
    .filter(Boolean)
}

function loadCategoriesFromCache(): string[] {
  try {
    const raw = localStorage.getItem(DR_SETTINGS_CACHE_KEY)
    if (!raw) return []
    const p = JSON.parse(raw)
    const arr = p?.cashOutCategories
    const norm = normalizeCategories(arr)
    if (norm.length) return norm
  } catch {
    // ignore
  }

  // fallback legacy (nel caso ci sia ancora roba vecchia)
  try {
    const legacyRaw = localStorage.getItem(CATEGORIES_LEGACY_LS_KEY)
    if (!legacyRaw) return []
    const p = JSON.parse(legacyRaw)
    return normalizeCategories(p?.categories)
  } catch {
    return []
  }
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
    description: r.description,
    category: r.category,
    amount: Math.round(r.amount || 0),
    supplier_id: r.supplier_id,
    invoice: r.invoice,
    delivery_note: r.deliveryNote,
    shift: r.shift,
    paid_by: r.paidBy,
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

  const [suppliers, setSuppliers] = useState<Sup[]>([])
  const suppliersRef = useRef<Sup[]>([])
  useEffect(() => {
    suppliersRef.current = suppliers
  }, [suppliers])

  const [rows, setRows] = useState<CashoutRow[]>([])
  const [staffOpts, setStaffOpts] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : loadAuthorizedStaff()
  )
  const [shiftOpts, setShiftOpts] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : loadShiftLabels()
  )
  const [catOpts, setCatOpts] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : loadCategoriesFromCache()
  )
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
  const safeSetStaffOpts = (updater: string[] | ((prev: string[]) => string[])) => {
    if (!isActiveRef.current) return
    setStaffOpts(updater as any)
  }
  const safeSetShiftOpts = (updater: string[] | ((prev: string[]) => string[])) => {
    if (!isActiveRef.current) return
    setShiftOpts(updater as any)
  }
  const safeSetCatOpts = (updater: string[] | ((prev: string[]) => string[])) => {
    if (!isActiveRef.current) return
    setCatOpts(updater as any)
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
      const payload = toDbPayload(row)
      const { data, error } = await supabase
        .from(TBL_CASHOUT)
        .upsert([payload], { onConflict: 'id' })
        .select('*')
        .single()

      if (!isActiveRef.current) return null

      if (error || !data) {
        console.error('upsert cashout error', error)
        return null
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
        } catch { }
      }

      return saved
    },
    []
  )

  const deleteCashout = useCallback(async (id: string) => {
    const { error } = await supabase.from(TBL_CASHOUT).delete().eq('id', id)
    if (!isActiveRef.current) return false

    if (error) {
      console.error('delete cashout error', error)
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
    const { error } = await supabase.from(TBL_CASHOUT).delete().in('id', ids)
    if (!isActiveRef.current) return false

    if (error) {
      console.error('bulk delete cashout error', error)
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

  /* ---------- localStorage listeners ---------- */
  useEffect(() => {
    function onStorage(ev: StorageEvent) {
      if (!ev.key) return
      if (!isActiveRef.current) return

      if ((BRANCH_KEYS as readonly string[]).includes(ev.key as any)) {
        safeSetSelectedBranch(loadSelectedBranch())
      }

      if (ev.key === SETTINGS_LS_KEY) {
        safeSetStaffOpts(loadAuthorizedStaff())
        safeSetShiftOpts(loadShiftLabels())
      }

      // bump globale settings -> ricarica categorie da cache
      if (ev.key === DR_SETTINGS_BUMP_KEY) {
        safeSetCatOpts(loadCategoriesFromCache())
      }

      // legacy categorie LS (se mai cambia ancora)
      if (ev.key === CATEGORIES_LEGACY_LS_KEY) {
        safeSetCatOpts(prev => {
          const legacy = loadCategoriesFromCache()
          return legacy.length ? legacy : prev
        })
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /* ---------- Settings events (same tab + BC dr-settings) ---------- */
  useEffect(() => {
    function onCashOutEvent(ev: Event) {
      if (!isActiveRef.current) return
      const ce = ev as CustomEvent<{ value?: string[] }>
      const list = ce.detail?.value
      if (!list) return
      safeSetCatOpts(normalizeCategories(list))
    }

    window.addEventListener(
      'dr:settings:cashOutCategories',
      onCashOutEvent as EventListener
    )

    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel(DR_SETTINGS_BC_NAME)
      const onMsg = (ev: MessageEvent) => {
        if (!isActiveRef.current) return
        const t = ev?.data?.type
        if (t === 'cashOutCategories') {
          const list = ev.data?.value
          safeSetCatOpts(normalizeCategories(list))
        }
      }
      bc.addEventListener('message', onMsg)
      return () => {
        window.removeEventListener(
          'dr:settings:cashOutCategories',
          onCashOutEvent as EventListener
        )
        if (bc) {
          bc.removeEventListener('message', onMsg)
          bc.close()
        }
      }
    } catch {
      return () => {
        window.removeEventListener(
          'dr:settings:cashOutCategories',
          onCashOutEvent as EventListener
        )
      }
    }
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