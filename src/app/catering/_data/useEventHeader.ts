// src/app/catering/_data/useEventHeader.ts
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type Id = string

export type EventHeader = {
  id: Id

  // campi lista
  event_date: string | null          // ISO (DB: date o timestamptz)
  event_name: string | null
  host_name: string | null

  // campi dettaglio (editor)
  title: string
  start_at: string | null
  end_at: string | null
  location: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  customer_type: string | null
  company: string | null

  // azienda
  company_director: string | null
  company_tax_code: string | null
  company_address: string | null
  company_city: string | null
  billing_email: string | null
  preferred_contact: string | null

  // budget & note
  people_count: number | null
  budget_per_person_vnd: number | null
  budget_total_vnd: number | null
  notes: string | null

  // 🔹 pagamento
  payment_plan: 'full' | 'installments' | null
  is_full_payment: boolean | null

  payment_term: string | null
  payment_terms: string | null
  payment_policy: string | null
  payment_condition: string | null

  deposit_percent: number | null         // 0..100
  deposit_percentage: number | null      // alias
  deposit_percent_01: number | null      // 0..1 (se presente a schema)

  balance_percent: number | null         // 0..100
  balance_percentage: number | null      // alias
  balance_percent_01: number | null      // 0..1 (se presente a schema)

  deposit_due_date: string | null
  deposit_due_at: string | null
  deposit_due_on: string | null

  balance_due_date: string | null
  balance_due_at: string | null
  balance_due_on: string | null

  // 🔹 provider branch (uuid)
  provider_branch_id: string | null

  created_at?: string
  updated_at?: string
}

type State = {
  header: EventHeader | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  /** Upsert deterministico: crea se non esiste, aggiorna se esiste. */
  save: (patch: Partial<Omit<EventHeader, 'id'>> & { id?: Id }) => Promise<boolean>
}

/** Colonne scoperte dinamicamente nello schema corrente. */
type Caps = {
  [k: string]: boolean
}

/** Normalizza l'ID: stringa non-vuota oppure null. */
function normId(x: unknown): string | null {
  if (x == null) return null
  const s = String(x).trim()
  return s === '' ? null : s
}

/**
 * Hook CRUD per `event_headers`:
 * - SELECT con `*` (mai errore per colonne mancanti).
 * - Rileva le colonne presenti (Caps) e salva solo quelle (niente errori su save).
 * - Re-sync su focus/visibility, niente polling.
 */
export function useEventHeader(eventId: Id | null | undefined): State {
  const [header, setHeader] = useState<EventHeader | null>(null)
  const [loading, setLoading] = useState<boolean>(!!eventId)
  const [error, setError] = useState<string | null>(null)
  const [caps, setCaps] = useState<Caps>({})
  const alive = useRef(true)

  const load = useCallback(async () => {
    const id = normId(eventId)
    if (!id) {
      setHeader(null); setLoading(false); setError(null); setCaps({}); 
      return
    }
    setLoading(true); setError(null)
    try {
      const { data, error } = await supabase
        .from('event_headers')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error

      const row = data || {}
      const c = detectCaps(row)
      setCaps(c)
      setHeader(normalizeRow(row))
      setLoading(false)
    } catch (e: any) {
      if (!alive.current) return
      const msg = readableErr(e) || 'Failed to load event_headers'
      console.warn('[useEventHeader] load error:', msg, { eventId: eventId ?? null })
      setError(msg)
      setHeader(null)
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    alive.current = true
    load()
    return () => { alive.current = false }
  }, [load])

  // Re-sync su focus/visibility
  useEffect(() => {
    const onFocus = () => { void load() }
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const save = useCallback(async (patch: Partial<Omit<EventHeader, 'id'>> & { id?: Id }) => {
    const id = normId(patch.id ?? eventId)
    if (!id) {
      setError('Missing eventId')
      return false
    }

    // Normalizziamo la data evento: 'YYYY-MM-DD' → mezzanotte UTC (se serve). Pass-through se già ISO/tz.
    const eventDateIso =
      patch.event_date !== undefined ? toIsoDateStartUTC(patch.event_date) : undefined

    // Costruiamo il payload includendo solo le colonne che esistono nello schema corrente (caps)
    const payload: any = { id }

    // --- campi lista ---
    if (eventDateIso !== undefined) payload.event_date = eventDateIso
    assignIf(payload, 'event_name', patch.event_name, toNullStr, true)
    assignIf(payload, 'host_name', patch.host_name, toNullStr, true)

    // --- dettaglio ---
    assignIf(payload, 'title', patch.title, (v) => (v == null ? null : String(v)), true)
    assignIf(payload, 'start_at', patch.start_at, toNullStr, true)
    assignIf(payload, 'end_at', patch.end_at, toNullStr, true)
    assignIf(payload, 'location', patch.location, toNullStr, true)
    assignIf(payload, 'contact_name', patch.contact_name, toNullStr, true)
    assignIf(payload, 'contact_phone', patch.contact_phone, toNullStr, true)
    assignIf(payload, 'contact_email', patch.contact_email, toNullStr, true)
    assignIf(payload, 'customer_type', patch.customer_type, toNullStr, true)
    assignIf(payload, 'company', patch.company, toNullStr, true)

    // --- azienda ---
    assignIf(payload, 'company_director', patch.company_director, toNullStr, true)
    assignIf(payload, 'company_tax_code', patch.company_tax_code, toNullStr, true)
    assignIf(payload, 'company_address', patch.company_address, toNullStr, true)
    assignIf(payload, 'company_city', patch.company_city, toNullStr, true)
    assignIf(payload, 'billing_email', patch.billing_email, toNullStr, true)
    assignIf(payload, 'preferred_contact', patch.preferred_contact, toNullStr, true)

    // --- numerici ---
    assignIf(payload, 'people_count', patch.people_count, toNullInt, true)
    assignIf(payload, 'budget_per_person_vnd', patch.budget_per_person_vnd, toNullNum, true)
    assignIf(payload, 'budget_total_vnd', patch.budget_total_vnd, toNullNum, true)
    assignIf(payload, 'notes', patch.notes, toNullStr, true)

    // --- 🔹 pagamento: SOLO se la colonna esiste (caps) ---
    capAssign(payload, caps, 'payment_plan', patch.payment_plan, id)
    capAssign(payload, caps, 'is_full_payment', patch.is_full_payment, id)

    capAssign(payload, caps, 'payment_term', patch.payment_term, id, toNullStr)
    capAssign(payload, caps, 'payment_terms', patch.payment_terms, id, toNullStr)
    capAssign(payload, caps, 'payment_policy', patch.payment_policy, id, toNullStr)
    capAssign(payload, caps, 'payment_condition', patch.payment_condition, id, toNullStr)

    capAssign(payload, caps, 'deposit_percent', patch.deposit_percent, id, toNullNum)
    capAssign(payload, caps, 'deposit_percentage', patch.deposit_percentage, id, toNullNum)
    capAssign(payload, caps, 'deposit_percent_01', patch.deposit_percent_01, id, toNullNum)

    capAssign(payload, caps, 'balance_percent', patch.balance_percent, id, toNullNum)
    capAssign(payload, caps, 'balance_percentage', patch.balance_percentage, id, toNullNum)
    capAssign(payload, caps, 'balance_percent_01', patch.balance_percent_01, id, toNullNum)

    capAssign(payload, caps, 'deposit_due_date', patch.deposit_due_date, id, toNullStr)
    capAssign(payload, caps, 'deposit_due_at', patch.deposit_due_at, id, toNullStr)
    capAssign(payload, caps, 'deposit_due_on', patch.deposit_due_on, id, toNullStr)

    capAssign(payload, caps, 'balance_due_date', patch.balance_due_date, id, toNullStr)
    capAssign(payload, caps, 'balance_due_at', patch.balance_due_at, id, toNullStr)
    capAssign(payload, caps, 'balance_due_on', patch.balance_due_on, id, toNullStr)

    // --- 🔹 provider branch (uuid): SOLO se la colonna esiste (caps) ---
    capAssign(
      payload,
      caps,
      'provider_branch_id',
      (patch as any).provider_branch_id ?? undefined,
      id,
      toNullStr
    )

    try {
      const up = await supabase
        .from('event_headers')
        .upsert(payload, { onConflict: 'id' })
        .select()
        .single()

      if (up.error) {
        console.error('[useEventHeader] save error:', up.error, { payload, caps })
        setError(up.error.message || 'Save failed')
        return false
      }

      const row = up.data
      setHeader(normalizeRow(row as any))
      setError(null)
      return true
    } catch (e: any) {
      const msg = readableErr(e) || 'Save failed'
      console.error('[useEventHeader] save catch:', msg, e, { payload, caps })
      setError(msg)
      return false
    }
  }, [eventId, caps])

  return useMemo(() => ({ header, loading, error, refresh: load, save }), [header, loading, error, load, save])
}

/* ------------ helpers ------------ */

// rileva colonne presenti nello schema dalla riga caricata con select('*')
function detectCaps(row: any): Caps {
  const keys = new Set(Object.keys(row || {}))
  const has = (k: string) => keys.has(k)
  return {
    // core
    id: true,
    event_date: has('event_date'),
    event_name: has('event_name'),
    host_name: has('host_name'),
    title: has('title'),
    start_at: has('start_at'),
    end_at: has('end_at'),
    location: has('location'),
    contact_name: has('contact_name'),
    contact_phone: has('contact_phone'),
    contact_email: has('contact_email'),
    customer_type: has('customer_type'),
    company: has('company'),
    company_director: has('company_director'),
    company_tax_code: has('company_tax_code'),
    company_address: has('company_address'),
    company_city: has('company_city'),
    billing_email: has('billing_email'),
    preferred_contact: has('preferred_contact'),
    people_count: has('people_count'),
    budget_per_person_vnd: has('budget_per_person_vnd'),
    budget_total_vnd: has('budget_total_vnd'),
    notes: has('notes'),
    // pagamento
    payment_plan: has('payment_plan'),
    is_full_payment: has('is_full_payment'),
    payment_term: has('payment_term'),
    payment_terms: has('payment_terms'),
    payment_policy: has('payment_policy'),
    payment_condition: has('payment_condition'),
    deposit_percent: has('deposit_percent'),
    deposit_percentage: has('deposit_percentage'),
    deposit_percent_01: has('deposit_percent_01'),
    balance_percent: has('balance_percent'),
    balance_percentage: has('balance_percentage'),
    balance_percent_01: has('balance_percent_01'),
    deposit_due_date: has('deposit_due_date'),
    deposit_due_at: has('deposit_due_at'),
    deposit_due_on: has('deposit_due_on'),
    balance_due_date: has('balance_due_date'),
    balance_due_at: has('balance_due_at'),
    balance_due_on: has('balance_due_on'),
    // 🔹 provider
    provider_branch_id: has('provider_branch_id'),
  }
}

// Converte 'YYYY-MM-DD' → 'YYYY-MM-DDT00:00:00Z' (timestamptz). Pass-through se già ISO/tz.
function toIsoDateStartUTC(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00Z`
  return s
}

function toNullStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
function toNullNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function toNullInt(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) ? n : null
}

function num(x: any): number | null {
  return x == null ? null : (Number(x) ?? null)
}
function bool(x: any): boolean | null {
  return x == null ? null : Boolean(x)
}
function str(x: any): string | null {
  return x == null ? null : String(x)
}

// Normalizzazione generica (indipendente dallo schema)
function normalizeRow(r: any): EventHeader {
  return {
    id: String(r?.id ?? ''),

    event_date: r?.event_date ?? null,
    event_name: r?.event_name ?? null,
    host_name: r?.host_name ?? null,

    title: String(r?.title ?? ''),
    start_at: r?.start_at ?? null,
    end_at: r?.end_at ?? null,
    location: r?.location ?? null,
    contact_name: r?.contact_name ?? null,
    contact_phone: r?.contact_phone ?? null,
    contact_email: r?.contact_email ?? null,
    customer_type: r?.customer_type ?? null,
    company: r?.company ?? null,

    company_director: r?.company_director ?? null,
    company_tax_code: r?.company_tax_code ?? null,
    company_address: r?.company_address ?? null,
    company_city: r?.company_city ?? null,
    billing_email: r?.billing_email ?? null,
    preferred_contact: r?.preferred_contact ?? null,

    people_count: r?.people_count == null ? null : Number(r.people_count),
    budget_per_person_vnd: num(r?.budget_per_person_vnd),
    budget_total_vnd: num(r?.budget_total_vnd),
    notes: r?.notes ?? null,

    // 🔹 pagamento (se ci sono, altrimenti restano null)
    payment_plan: r?.payment_plan ?? null,
    is_full_payment: bool(r?.is_full_payment),

    payment_term: str(r?.payment_term),
    payment_terms: str(r?.payment_terms),
    payment_policy: str(r?.payment_policy),
    payment_condition: str(r?.payment_condition),

    deposit_percent: num(r?.deposit_percent),
    deposit_percentage: num(r?.deposit_percentage),
    deposit_percent_01: num(r?.deposit_percent_01),

    balance_percent: num(r?.balance_percent),
    balance_percentage: num(r?.balance_percentage),
    balance_percent_01: num(r?.balance_percent_01),

    deposit_due_date: str(r?.deposit_due_date),
    deposit_due_at: str(r?.deposit_due_at),
    deposit_due_on: str(r?.deposit_due_on),

    balance_due_date: str(r?.balance_due_date),
    balance_due_at: str(r?.balance_due_at),
    balance_due_on: str(r?.balance_due_on),

    // 🔹 provider
    provider_branch_id: str(r?.provider_branch_id),

    created_at: r?.created_at ?? undefined,
    updated_at: r?.updated_at ?? undefined,
  }
}

function readableErr(e: any): string | null {
  if (!e) return null
  if (typeof e === 'string') return e
  if (e.message) return String(e.message)
  try { return JSON.stringify(e) } catch { return null }
}

/** Assegna sempre (colonna sicura) se `val` è stato passato. */
function assignIf(
  payload: any,
  key: string,
  val: unknown,
  map: (v: unknown) => any = (v) => v,
  _allowUnknown = false
) {
  if (val === undefined) return
  payload[key] = map(val)
}

/** Assegna SOLO se la colonna esiste in caps. */
function capAssign(
  payload: any,
  caps: Caps,
  key: string,
  val: unknown,
  _id: Id,
  map: (v: unknown) => any = (v) => v
) {
  if (val === undefined) return
  if (!caps?.[key]) return
  payload[key] = map(val)
}

export default useEventHeader