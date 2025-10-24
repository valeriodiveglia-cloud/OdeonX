// src/app/catering/_data/useEventList.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type NextDueKind = 'deposit' | 'balance'
export type PaymentPlan = 'full' | 'installments'

export type EventListRow = {
  id: string
  event_date: string | null
  event_name: string | null
  host_name: string | null
  total_vnd: number | null   // coerced to Number (no strings)
  updated_at: string | null

  // ---- Payment (from catering_event_pay_vw)
  payment_plan: PaymentPlan | null
  deposit_percent_0_100: number | null
  deposit_due_date: string | null
  balance_percent_0_100: number | null
  balance_due_date: string | null
  next_due_kind: NextDueKind | null
  next_due_date: string | null
  is_overdue: boolean | null
}

export function useEventList() {
  const [rows, setRows] = useState<EventListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // piccolo debounce per evitare tempeste di refresh
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRefresh = useCallback((reason: string) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      if (typeof window !== 'undefined') {
        console.debug('[catering] list refresh:', reason)
      }
      void fetchRows()
    }, 150)
  }, [])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    setError(null)

    // Nota: la view espone l'ID come "id" (alias di event_id)
    const { data, error } = await supabase
      .from('catering_event_pay_vw')
      .select(`
        id,
        event_date,
        event_name,
        host_name,
        total_vnd,
        updated_at,
        payment_plan,
        deposit_percent_0_100,
        deposit_due_date,
        balance_percent_0_100,
        balance_due_date,
        next_due_kind,
        next_due_date,
        is_overdue
      `)
      // Ordine: updated_at ↓ (nuovi in alto), event_date ↓, id ↑ come tie-breaker stabile
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })

    if (error) {
      console.debug('[catering] useEventList error:', error.message)
      setError(error.message)
      setRows([])
    } else {
      const mapped: EventListRow[] = (data ?? []).map((r: any) => {
        // Supabase ritorna NUMERIC come stringa: convertiamo in number qui
        const totalNum =
          r.total_vnd == null
            ? null
            : Number(typeof r.total_vnd === 'string' ? r.total_vnd : r.total_vnd)

        return {
          id: String(r.id ?? ''),
          event_date: r.event_date ?? null,
          event_name: r.event_name ?? null,
          host_name: r.host_name ?? null,
          total_vnd: Number.isFinite(totalNum as number) ? (totalNum as number) : null,
          updated_at: r.updated_at ?? null,

          payment_plan: (r.payment_plan ?? null) as EventListRow['payment_plan'],
          deposit_percent_0_100: r.deposit_percent_0_100 ?? null,
          deposit_due_date: r.deposit_due_date ?? null,
          balance_percent_0_100: r.balance_percent_0_100 ?? null,
          balance_due_date: r.balance_due_date ?? null,
          next_due_kind: (r.next_due_kind ?? null) as EventListRow['next_due_kind'],
          next_due_date: r.next_due_date ?? null,
          is_overdue: typeof r.is_overdue === 'boolean' ? r.is_overdue : (r.is_overdue == null ? null : !!r.is_overdue),
        }
      })
      if (typeof window !== 'undefined' && mapped[0]) {
        // log diagnostico utile: controlla che sia number
        console.debug('[catering] first row types:', {
          total_vnd: mapped[0].total_vnd,
          typeof_total: typeof mapped[0].total_vnd,
          payment_plan: mapped[0].payment_plan,
          next_due_kind: mapped[0].next_due_kind,
          next_due_date: mapped[0].next_due_date,
          is_overdue: mapped[0].is_overdue,
        })
      }
      setRows(mapped)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRows()
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [fetchRows])

  // Auto-refresh su focus/visibility (niente polling)
  useEffect(() => {
    const onFocus = () => scheduleRefresh('window:focus')
    const onVisible = () => { if (document.visibilityState === 'visible') scheduleRefresh('visibility:visible') }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [scheduleRefresh])

  // Auto-refresh quando l’editor emette eventi custom
  // (trigger utili quando premi “save” nelle varie card)
  useEffect(() => {
    const onBundles   = () => scheduleRefresh('event:bundles:totals')
    const onHeader    = () => scheduleRefresh('event:eventinfo:changed')
    const onEquip     = () => scheduleRefresh('event:equipment:totals')
    const onStaff     = () => scheduleRefresh('event:staff:totals')
    const onTrans     = () => scheduleRefresh('event:transport:totals')
    const onAssets    = () => scheduleRefresh('event:assets:total')
    const onExtraFee  = () => scheduleRefresh('event:extrafee:total')
    const onDiscounts = () => scheduleRefresh('event:discounts:total')
    const onRefetch   = () => scheduleRefresh('events:refetch')

    window.addEventListener('bundles:totals',    onBundles as EventListener)
    window.addEventListener('eventinfo:changed', onHeader  as EventListener)
    window.addEventListener('equipment:totals',  onEquip   as EventListener)
    window.addEventListener('staff:totals',      onStaff   as EventListener)
    window.addEventListener('transport:totals',  onTrans   as EventListener)
    window.addEventListener('assets:total',      onAssets  as EventListener)
    window.addEventListener('extrafee:total',    onExtraFee as EventListener)
    window.addEventListener('discounts:total',   onDiscounts as EventListener)
    window.addEventListener('events:refetch',    onRefetch as EventListener)

    return () => {
      window.removeEventListener('bundles:totals',    onBundles as EventListener)
      window.removeEventListener('eventinfo:changed', onHeader  as EventListener)
      window.removeEventListener('equipment:totals',  onEquip   as EventListener)
      window.removeEventListener('staff:totals',      onStaff   as EventListener)
      window.removeEventListener('transport:totals',  onTrans   as EventListener)
      window.removeEventListener('assets:total',      onAssets  as EventListener)
      window.removeEventListener('extrafee:total',    onExtraFee as EventListener)
      window.removeEventListener('discounts:total',   onDiscounts as EventListener)
      window.removeEventListener('events:refetch',    onRefetch as EventListener)
    }
  }, [scheduleRefresh])

  // Auto-refresh cross-tab via storage (chiavi LS usate dall’editor)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      const k = e.key || ''
      if (
        k.startsWith('eventcalc.bundles.totals:')   ||
        k.startsWith('eventcalc.header:')           ||
        k.startsWith('eventcalc.equipment.totals:') ||
        k.startsWith('eventcalc.staff.cost:')       || k.startsWith('eventcalc.staff.price:') ||
        k.startsWith('eventcalc.transport.totals:') ||
        k.startsWith('eventcalc.assets.total:')     ||
        k.startsWith('eventcalc.extrafee.total:')   ||
        k.startsWith('eventcalc.discounts.total:')
      ) {
        scheduleRefresh(`storage:${k.split(':')[0]}`)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener('storage', onStorage) }
  }, [scheduleRefresh])

  return { rows, loading, error, refresh: fetchRows }
}

export default useEventList