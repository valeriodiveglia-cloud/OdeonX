'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useBranchUnified } from './useBranchUnified'

type SettingsJson = {
  cashCount?: { cashFloatVND?: number }
  initialInfo?: {
    staff?: string[]
    shifts?: Array<{ name: string; start: string; end: string }>
    thirdParties?: string[]
  }
  cashOut?: {
    categories?: string[]
  }
}

type Row = {
  id?: string
  branch_name: string
  settings: SettingsJson
  updated_at?: string
  updated_by?: string
}

function normalizeCategories(list: string[] | undefined | null): string[] {
  const arr = Array.isArray(list) ? list : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of arr) {
    const v = String(raw ?? '').trim()
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

const DEFAULT_CASHOUT_CATEGORIES: string[] = ['Petty cash', 'Maintenance', 'Misc']
export const DEFAULT_FLOAT = 3_000_000
const FLOAT_CACHE_KEY = 'dr.settings.cashFloatByBranch'

export function useDailyReportSettings() {
  const { name: branchNameRaw } = useBranchUnified()
  const branchName = (branchNameRaw || '').trim()

  const [row, setRow] = useState<Row | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const savingRef = useRef(false)
  const mountedRef = useRef(true)

  // Cache locale per-branch
  const [cachedFloat, setCachedFloat] = useState<number | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  /* ===== helper per leggere la cache per branch corrente ===== */
  const readCacheForBranch = useCallback(
    (bname: string | null | undefined) => {
      const clean = (bname || '').trim()
      if (!clean || typeof window === 'undefined') {
        setCachedFloat(null)
        return
      }
      try {
        const raw = localStorage.getItem(FLOAT_CACHE_KEY) || ''
        if (!raw) {
          setCachedFloat(null)
          return
        }
        const parsed = JSON.parse(raw) || {}
        const v = Number(parsed[clean])
        if (Number.isFinite(v) && v > 0) {
          setCachedFloat(Math.round(v))
        } else {
          setCachedFloat(null)
        }
      } catch {
        setCachedFloat(null)
      }
    },
    [],
  )

  // Quando cambia branch, rileggiamo la cache di quel branch
  useEffect(() => {
    readCacheForBranch(branchName)
  }, [branchName, readCacheForBranch])

  // Listener storage e broadcast per aggiornare la cache quando altri tab salvano
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (!e.key) return
      if (e.key === FLOAT_CACHE_KEY || e.key === 'dr.settings.bump') {
        readCacheForBranch(branchName)
      }
    }

    function onCustom(e: Event) {
      const ce = e as CustomEvent<any>
      const b = (ce?.detail?.branch || '').trim()
      if (!b || b !== branchName) return
      const v = Number(ce?.detail?.value)
      // Update local cache
      if (Number.isFinite(v) && v > 0) {
        setCachedFloat(Math.round(v))
      } else {
        setCachedFloat(null)
      }

      // Update Row to reflect change immediately
      setRow(prev => {
        if (!prev) return null
        const nextSettings = {
          ...(prev.settings || {}),
          cashCount: {
            ...(prev.settings?.cashCount || {}),
            cashFloatVND: Number.isFinite(v) && v > 0 ? Math.round(v) : undefined
          }
        }
        return { ...prev, settings: nextSettings }
      })
    }

    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('dr-settings')
      bc.onmessage = msg => {
        const d = msg?.data

        // Legacy broadcast support
        if (d?.type === 'cashFloatVND') {
          const b = (d.branch || '').trim()
          if (!b || b !== branchName) return
          const v = Number(d.value)
          if (Number.isFinite(v) && v > 0) {
            setCachedFloat(Math.round(v))
          } else {
            setCachedFloat(null)
          }

          // Update Row
          setRow(prev => {
            if (!prev) return null
            const nextSettings = {
              ...(prev.settings || {}),
              cashCount: {
                ...(prev.settings?.cashCount || {}),
                cashFloatVND: Number.isFinite(v) && v > 0 ? Math.round(v) : undefined
              }
            }
            return { ...prev, settings: nextSettings }
          })
        }

        // Context broadcast (full settings)
        if (d?.type === 'update') {
          const b = (d.branch || '').trim()
          if (!b || b !== branchName) return

          // Update cache if float changed
          const val = Number(d.settings?.cashCount?.cashFloatVND)
          if (Number.isFinite(val) && val > 0) {
            setCachedFloat(Math.round(val))
          } else if (d.settings?.cashCount) {
            setCachedFloat(null)
          }

          // Update Row with full settings
          setRow(prev => {
            // If we don't have a row yet (loading), we can't fully construct it, 
            // but we can update cache which is enough for loading state.
            // If we DO have a row, update it.
            if (!prev) return null
            return {
              ...prev,
              settings: d.settings || {}
            }
          })
        }
      }
    } catch {
      bc = null
    }

    window.addEventListener('dr:settings:cashFloatVND', onCustom as EventListener)
    window.addEventListener('storage', onStorage)

    return () => {
      window.removeEventListener('dr:settings:cashFloatVND', onCustom as EventListener)
      window.removeEventListener('storage', onStorage)
      try {
        bc?.close()
      } catch { }
    }
  }, [branchName, readCacheForBranch])

  const fetchSettingsFromDb = useCallback(
    async (bname: string | null) => {
      if (!bname) {
        if (mountedRef.current) {
          setLoading(false)
        }
        return
      }
      if (savingRef.current) {
        // stiamo salvando, evitiamo di sovrascrivere con roba vecchia
        return
      }
      if (mountedRef.current) {
        console.debug('[DailyReportSettings] fetching from DB for branch:', bname)
        setLoading(true)
        setError(null)
      }

      const { data, error } = await supabase
        .from('daily_report_settings')
        .select('id, branch_name, settings, updated_at, updated_by')
        .eq('branch_name', bname)
        .order('updated_at', { ascending: false })
        .limit(1)

      if (!mountedRef.current) return

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      const r = data?.[0]
      if (!r) {
        setRow({ branch_name: bname, settings: {} })
        setLoading(false)
        return
      }
      const parsed: SettingsJson =
        typeof r.settings === 'string' ? safeParse(r.settings) : (r.settings ?? {})
      console.debug('[DailyReportSettings] loaded settings from DB:', parsed)
      setRow({ ...r, settings: parsed })
      setLoading(false)
    },
    [],
  )

  useEffect(() => {
    const clean = branchName || ''
    void fetchSettingsFromDb(clean || null)
  }, [branchName, fetchSettingsFromDb])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        const clean = branchName || ''
        void fetchSettingsFromDb(clean || null)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [branchName, fetchSettingsFromDb])

  const settings = useMemo<SettingsJson>(() => row?.settings ?? {}, [row])

  // Ref to track latest settings for concurrent saves
  const latestSettingsRef = useRef<SettingsJson>(settings)
  useEffect(() => {
    latestSettingsRef.current = settings
  }, [settings])

  const cashFloatVND = useMemo(() => {
    const raw = settings?.cashCount?.cashFloatVND
    const n = Number(raw)
    const safeDb = Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_FLOAT

    console.debug(
      '[DailyReportSettings] derived cashFloatVND from settings:',
      raw,
      '->',
      safeDb,
      'cachedFloat:',
      cachedFloat,
      'branch:',
      branchName,
    )

    // Se stiamo caricando (row == null), usiamo la cache per evitare flash
    if (!row) {
      if (cachedFloat != null && Number.isFinite(cachedFloat) && cachedFloat > 0) {
        return Math.round(cachedFloat)
      }
    }

    // Se abbiamo caricato il DB (row != null), usiamo il valore DB.
    // Il safeDb è calcolato sopra dai settings del row.
    return safeDb
  }, [settings, cachedFloat, branchName, row])

  const cashOutCategories = useMemo<string[]>(() => {
    const norm = normalizeCategories(settings?.cashOut?.categories)
    return norm.length ? norm : DEFAULT_CASHOUT_CATEGORIES
  }, [settings])

  async function saveCashFloatVND(next: number) {
    const cleanBranch = branchName
    if (!cleanBranch) throw new Error('No branch selected')
    const safe = Math.max(0, Math.round(next))

    // Use ref to get latest state, including pending updates from other concurrent saves
    const current = latestSettingsRef.current
    const merged: SettingsJson = {
      ...(current ?? {}),
      cashCount: { ...(current?.cashCount ?? {}), cashFloatVND: safe },
    }

    // Update ref immediately so subsequent calls see it
    latestSettingsRef.current = merged

    savingRef.current = true
    setRow(prev => ({
      ...(prev ?? { branch_name: cleanBranch, settings: {} }),
      branch_name: cleanBranch,
      settings: merged,
    }))

    const { error } = await supabase
      .from('daily_report_settings')
      .upsert([{ branch_name: cleanBranch, settings: merged }], {
        onConflict: 'branch_name',
      })

    savingRef.current = false

    if (error) {
      throw error
    }
  }

  async function saveCashOutCategories(categories: string[]) {
    const cleanBranch = branchName
    if (!cleanBranch) throw new Error('No branch selected')
    const cleaned = normalizeCategories(categories)

    const current = latestSettingsRef.current
    const merged: SettingsJson = {
      ...(current ?? {}),
      cashOut: { ...(current?.cashOut ?? {}), categories: cleaned },
    }

    latestSettingsRef.current = merged

    savingRef.current = true
    setRow(prev => ({
      ...(prev ?? { branch_name: cleanBranch, settings: {} }),
      branch_name: cleanBranch,
      settings: merged,
    }))

    const { error } = await supabase
      .from('daily_report_settings')
      .upsert([{ branch_name: cleanBranch, settings: merged }], {
        onConflict: 'branch_name',
      })

    savingRef.current = false

    if (error) {
      throw error
    }
  }

  async function saveInitialInfo(info: SettingsJson['initialInfo']) {
    const cleanBranch = branchName
    if (!cleanBranch) throw new Error('No branch selected')

    const current = latestSettingsRef.current
    const merged: SettingsJson = {
      ...(current ?? {}),
      initialInfo: info,
    }

    latestSettingsRef.current = merged

    savingRef.current = true
    setRow(prev => ({
      ...(prev ?? { branch_name: cleanBranch, settings: {} }),
      branch_name: cleanBranch,
      settings: merged,
    }))

    const { error } = await supabase
      .from('daily_report_settings')
      .upsert([{ branch_name: cleanBranch, settings: merged }], {
        onConflict: 'branch_name',
      })

    savingRef.current = false

    if (error) {
      throw error
    }
  }

  async function refresh() {
    const clean = branchName || ''
    await fetchSettingsFromDb(clean || null)
  }

  return {
    branchName: branchName || null,
    loading,
    error,
    settings,
    cashFloatVND,
    cashOutCategories,
    saveCashFloatVND,
    saveCashOutCategories,
    saveInitialInfo,
    refresh,
  }
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}
