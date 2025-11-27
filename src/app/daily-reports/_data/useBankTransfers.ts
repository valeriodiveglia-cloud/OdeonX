// src/app/daily-reports/_data/useBankTransfers.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useDRBranch } from './useDRBranch'

export type BankTransferRow = {
  id: string
  branch: string | null
  date: string          // yyyy-mm-dd
  amount: number
  note: string | null
  created_at: string | null
  updated_at: string | null
}

type UpsertInput = {
  id?: string
  date: string
  amount: number
  note?: string | null
}

type UseBankTransfersResult = {
  rows: BankTransferRow[]
  loading: boolean
  error: string | null
  selectedBranchName: string
  refresh: () => Promise<void>
  createTransfer: (input: Omit<UpsertInput, 'id'>) => Promise<BankTransferRow | null>
  updateTransfer: (input: UpsertInput) => Promise<BankTransferRow | null>
  deleteTransfers: (ids: string[]) => Promise<boolean>
}

/* ---------- Helper per risolvere il branch ---------- */
function resolveBranchName(branchFromDR: string | undefined | null): string {
  const base = (branchFromDR || '').trim()
  if (base) return base

  // fallback legacy su DR_BRANCH_NAME, per compat con la Cashier Closing
  try {
    if (typeof window !== 'undefined') {
      const ls = localStorage.getItem('DR_BRANCH_NAME')
      if (ls && ls.trim()) return ls.trim()
    }
  } catch {
    // ignore
  }
  return ''
}

export function useBankTransfers(params?: { year?: number; month?: number; branchName?: string | null }): UseBankTransfersResult {
  const { branch } = useDRBranch({ validate: false })

  // branch risolto: prima da useDRBranch, poi da DR_BRANCH_NAME
  const drBranchName = useMemo(
    () => resolveBranchName(branch?.name),
    [branch?.name],
  )

  // Se params.branchName è definito (anche null), usiamo quello. Altrimenti fallback su drBranchName.
  // params.branchName === null significa "Tutti i branch"
  const effectiveBranchName = params && 'branchName' in params ? params.branchName : drBranchName

  const [rows, setRows] = useState<BankTransferRow[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // per evitare di spammare refresh su ogni focus/online
  const wakeSyncAtRef = useRef<number>(0)

  const refresh = useCallback(async () => {
    // Se siamo in modalità "Daily Reports" (no params), serve un branch selezionato.
    // Se siamo in modalità "Monthly Reports" (params defined), branchName può essere null (tutti).
    const isDailyMode = !params
    if (isDailyMode && !effectiveBranchName) {
      setRows([])
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      let q = supabase
        .from('daily_report_bank_transfers')
        .select('*')
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })

      if (effectiveBranchName) {
        q = q.eq('branch', effectiveBranchName)
      }

      if (params?.year != null && params?.month != null) {
        const start = new Date(params.year, params.month, 1)
        const end = new Date(params.year, params.month + 1, 1)
        const p = (n: number) => String(n).padStart(2, '0')
        const startISO = `${start.getFullYear()}-${p(start.getMonth() + 1)}-${p(start.getDate())}`
        const endISO = `${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}`
        q = q.gte('date', startISO).lt('date', endISO)
      }

      const { data, error: err } = await q

      if (err) {
        console.error('fetch bank transfers error', err)
        setError('Failed to load bank transfers.')
        setRows([])
        return
      }

      const list: BankTransferRow[] = (data || []).map((r: any) => ({
        id: String(r.id),
        branch: r.branch ?? null,
        date: r.date,
        amount: Number(r.amount || 0),
        note: r.note ?? null,
        created_at: r.created_at ?? null,
        updated_at: r.updated_at ?? null,
      }))

      setRows(list)
    } finally {
      setLoading(false)
    }
  }, [effectiveBranchName, params?.year, params?.month])

  useEffect(() => {
    // se il branch cambia o diventa disponibile, rifacciamo il fetch
    refresh().catch(() => { })
  }, [refresh])

  // Wake / tab-focus / back-online: prova a riallineare i dati
  useEffect(() => {
    const maybeSync = () => {
      if (!effectiveBranchName) return
      const now = Date.now()
      // throttle 3 secondi per sicurezza
      if (now - wakeSyncAtRef.current < 3000) return
      wakeSyncAtRef.current = now
      refresh().catch(() => { })
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') maybeSync()
    }
    const onFocus = () => maybeSync()
    const onOnline = () => maybeSync()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
    }
  }, [refresh, effectiveBranchName])

  async function createTransfer(input: Omit<UpsertInput, 'id'>): Promise<BankTransferRow | null> {
    // Se non ho branch, non creo righe orfane
    if (!effectiveBranchName) {
      console.warn('createTransfer called without selectedBranchName')
      return null
    }

    const payload = {
      branch: effectiveBranchName,
      date: input.date,
      amount: Math.round(input.amount || 0),
      note: input.note ?? null,
    }

    const { data, error: err } = await supabase
      .from('daily_report_bank_transfers')
      .insert(payload)
      .select('*')
      .single()

    if (err || !data) {
      console.error('create bank transfer error', err)
      return null
    }

    const row: BankTransferRow = {
      id: String(data.id),
      branch: data.branch ?? null,
      date: data.date,
      amount: Number(data.amount || 0),
      note: data.note ?? null,
      created_at: data.created_at ?? null,
      updated_at: data.updated_at ?? null,
    }

    setRows(prev => [...prev, row])
    return row
  }

  async function updateTransfer(input: UpsertInput): Promise<BankTransferRow | null> {
    if (!input.id) return null

    const payload: any = {
      date: input.date,
      amount: Math.round(input.amount || 0),
      note: input.note ?? null,
    }

    // teniamo il branch allineato al branch selezionato
    if (effectiveBranchName) {
      payload.branch = effectiveBranchName
    }

    const { data, error: err } = await supabase
      .from('daily_report_bank_transfers')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .maybeSingle()

    if (err || !data) {
      console.error('update bank transfer error', err)
      return null
    }

    const row: BankTransferRow = {
      id: String(data.id),
      branch: data.branch ?? null,
      date: data.date,
      amount: Number(data.amount || 0),
      note: data.note ?? null,
      created_at: data.created_at ?? null,
      updated_at: data.updated_at ?? null,
    }

    setRows(prev => prev.map(r => (r.id === row.id ? row : r)))
    return row
  }

  async function deleteTransfers(ids: string[]): Promise<boolean> {
    if (!ids.length) return true

    const { error: err } = await supabase
      .from('daily_report_bank_transfers')
      .delete()
      .in('id', ids)

    if (err) {
      console.error('delete bank transfers error', err)
      return false
    }

    setRows(prev => prev.filter(r => !ids.includes(r.id)))
    return true
  }

  return {
    rows,
    loading,
    error,
    selectedBranchName: effectiveBranchName || '',
    refresh,
    createTransfer,
    updateTransfer,
    deleteTransfers,
  }
}