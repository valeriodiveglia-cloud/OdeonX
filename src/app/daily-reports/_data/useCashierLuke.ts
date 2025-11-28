// src/app/daily-reports/_data/useCashierLuke.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import type {
  Header as HeaderInfo,
  PaymentBreakdown,
} from '../cashier-closing/_cards/InitialInfoCard'

type CashShape = Record<string, number>

export type LukeLoadResult = {
  id: string
  header: HeaderInfo
  floatTarget: number
  payments: PaymentBreakdown
  payouts: number
  deposits: number
  cash: CashShape
  floatPlan: CashShape
  branchId: string | null
  lastEditorName?: string
}

export type LukePayload = {
  id?: string | null
  header: HeaderInfo
  floatTarget: number
  payments: PaymentBreakdown
  payouts: number
  deposits: number
  cash: CashShape
  floatPlan: CashShape
  branchId?: string | null
  userId?: string | null
}

/* ---------- Helpers ---------- */
function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseCashShape(value: any): CashShape {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? (parsed as CashShape) : {}
    } catch {
      return {}
    }
  }
  if (typeof value === 'object') {
    return value as CashShape
  }
  return {}
}

/** UUID v4-ish validator (sufficiente per evitare il cast "pb_..." -> uuid) */
function isValidUUID(value: any): value is string {
  if (typeof value !== 'string') return false
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(value)
}

/**
 * Luke = puro layer snapshot per la tabella `cashier_closings`.
 *
 * - `load` prende sempre i valori salvati (snapshot) da `cashier_closings`
 *   e li rimappa nello shape usato da CashierClosingPage.
 * - `save` scrive questi valori nella riga (insert/update).
 *
 * Nessuna logica live qui dentro.
 */
export function useCashierLuke(initialId?: string | null) {
  const [id, setId] = useState<string | null>(initialId ?? null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Protezione wake / unmount: evitiamo di toccare stato su hook smontato
  const isActiveRef = useRef(true)
  useEffect(() => {
    isActiveRef.current = true
    return () => {
      isActiveRef.current = false
    }
  }, [])

  const safeSetLoading = (v: boolean) => {
    if (isActiveRef.current) setLoading(v)
  }
  const safeSetSaving = (v: boolean) => {
    if (isActiveRef.current) setSaving(v)
  }
  const safeSetError = (msg: string | null) => {
    if (isActiveRef.current) setError(msg)
  }
  const safeSetId = (val: string | null) => {
    if (isActiveRef.current) setId(val)
  }

  const load = useCallback(
    async (recordId: string): Promise<LukeLoadResult | null> => {
      if (!recordId) return null
      safeSetLoading(true)
      safeSetError(null)

      try {
        const { data, error } = await supabase
          .from('cashier_closings')
          .select('*')
          .eq('id', recordId)
          .maybeSingle()

        if (!isActiveRef.current) return null

        if (error || !data) {
          console.error('[useCashierLuke] load error RAW', error || 'no row found')
          console.error(
            '[useCashierLuke] load error fields',
            error?.message,
            error?.code,
            error?.details,
            error?.hint
          )
          safeSetError('Failed to load cashier closing')
          return null
        }

        const row: any = data

        const header: HeaderInfo = {
          dateStr: row.report_date || todayISO(),
          branch: row.branch_name || '',
          shift: row.shift || '',
          cashier: row.cashier_name || '',
          notes: row.notes || '',
        }

        const payments: PaymentBreakdown = {
          revenue: num(row.revenue_vnd),
          gojek: num(row.gojek_vnd),
          grab: num(row.grab_vnd),
          mpos: num(row.mpos_vnd),
          unpaid: num(row.unpaid_vnd),
          repaymentsCashCard: num(row.repayments_cash_card_vnd),
          // opzionale: se non esiste nel tipo, rimane ignorato a runtime
          // @ts-expect-error possibile campo extra
          setOffDebt: num(row.set_off_debt_vnd),
          capichi: num(row.capichi_vnd),
          bankTransferEwallet: num(row.bank_transfer_ewallet_vnd),
          cashOut: num(row.cash_out_vnd),
          thirdPartyAmounts: Array.isArray(row.third_party_amounts_json)
            ? row.third_party_amounts_json
            : [], // Fallback to empty if null/invalid
        }

        const cash: CashShape = parseCashShape(row.cash_json)
        const floatPlan: CashShape = parseCashShape(row.float_plan_json)

        const result: LukeLoadResult = {
          id: String(row.id),
          header,
          floatTarget: num(row.opening_float_vnd),
          payments,
          payouts: num(row.payouts_vnd),
          deposits: num(row.deposits_vnd),
          cash,
          floatPlan,
          branchId: row.branch_id ? String(row.branch_id) : null,
          lastEditorName: '', // Will be filled below
        }

        // Resolve updated_by name
        if (row.updated_by) {
          const { data: userData } = await supabase
            .from('app_accounts')
            .select('name')
            .eq('user_id', row.updated_by)
            .maybeSingle()

          if (userData?.name) {
            result.lastEditorName = userData.name
          }
        }

        safeSetId(result.id)
        return result
      } catch (err) {
        if (!isActiveRef.current) return null
        console.error('[useCashierLuke] load exception', err)
        safeSetError('Failed to load cashier closing')
        return null
      } finally {
        safeSetLoading(false)
      }
    },
    []
  )

  const save = useCallback(
    async (payload: LukePayload): Promise<string | null> => {
      safeSetSaving(true)
      safeSetError(null)

      try {
        const rawBranchId = payload.branchId ?? null
        const safeBranchId = isValidUUID(rawBranchId) ? rawBranchId : null

        if (rawBranchId && !safeBranchId) {
          console.warn(
            '[useCashierLuke] branchId is not a valid uuid, sending null to DB:',
            rawBranchId
          )
        }

        const row = {
          report_date: payload.header.dateStr || todayISO(),
          branch_name: (payload.header.branch || '').trim() || null,
          // inviamo il valore solo se è un uuid valido, altrimenti null
          branch_id: safeBranchId,
          shift: payload.header.shift || null,
          cashier_name: payload.header.cashier || null,
          notes: payload.header.notes || null,

          opening_float_vnd: num(payload.floatTarget),

          revenue_vnd: num(payload.payments.revenue),
          gojek_vnd: num(payload.payments.gojek),
          grab_vnd: num(payload.payments.grab),
          mpos_vnd: num(payload.payments.mpos),
          unpaid_vnd: num(payload.payments.unpaid),
          repayments_cash_card_vnd: num(payload.payments.repaymentsCashCard),
          // @ts-expect-error possibile campo extra
          set_off_debt_vnd: num(payload.payments.setOffDebt),
          capichi_vnd: num(payload.payments.capichi),
          bank_transfer_ewallet_vnd: num(payload.payments.bankTransferEwallet),
          cash_out_vnd: num(payload.payments.cashOut),

          payouts_vnd: num(payload.payouts),
          deposits_vnd: num(payload.deposits),

          cash_json: payload.cash || {},
          float_plan_json: payload.floatPlan || {},
          third_party_amounts_json: payload.payments.thirdPartyAmounts || [],
          updated_at: new Date().toISOString(),
          updated_by: payload.userId || null,
        }

        let newId = payload.id || id

        if (newId) {
          const { error } = await supabase
            .from('cashier_closings')
            .update(row)
            .eq('id', newId)

          if (!isActiveRef.current) return null

          if (error) {
            console.error('[useCashierLuke] update error RAW', error)
            console.error(
              '[useCashierLuke] update error fields',
              error?.message,
              error?.code,
              error?.details,
              error?.hint
            )
            console.error('[useCashierLuke] update payload', row)
            safeSetError('Failed to save cashier closing')
            return null
          }
        } else {
          const insertRow = {
            ...row,
            created_by: payload.userId || null,
          }
          const { data, error } = await supabase
            .from('cashier_closings')
            .insert(insertRow)
            .select('id')
            .single()

          if (!isActiveRef.current) return null

          if (error) {
            console.error('[useCashierLuke] insert error RAW', error)
            console.error(
              '[useCashierLuke] insert error fields',
              error?.message,
              error?.code,
              error?.details,
              error?.hint
            )
            console.error('[useCashierLuke] insert payload', row)
            safeSetError('Failed to save cashier closing')
            return null
          }

          if (!data) {
            console.error('[useCashierLuke] insert error no row returned on insert')
            console.error('[useCashierLuke] insert payload', row)
            safeSetError('Failed to save cashier closing')
            return null
          }

          newId = data.id ? String(data.id) : null
        }

        if (newId) safeSetId(newId)
        return newId || null
      } catch (err) {
        if (!isActiveRef.current) return null
        console.error('[useCashierLuke] save exception', err)
        safeSetError('Failed to save cashier closing')
        return null
      } finally {
        safeSetSaving(false)
      }
    },
    [id]
  )

  return {
    id,
    setId: (val: string | null) => safeSetId(val),
    loading,
    saving,
    error,
    load,
    save,
  }
}
