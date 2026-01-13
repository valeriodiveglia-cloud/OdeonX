// src/app/catering/_cards/EventInfoCard.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useEventCalc } from '@/app/catering/_state/EventCalcProvider'
import { useEventHeader } from '@/app/catering/_data/useEventHeader'
import { supabase } from '@/lib/supabase_shim'
import { useECT } from '@/app/catering/_i18n'

export type CustomerType = 'private' | 'company'
export type ContactMethod = 'phone' | 'email' | 'whatsapp' | 'zalo' | 'other'
export type PaymentPlan = 'full' | 'installments'

export type EventInfo = {
  eventName: string
  date: string
  startTime: string
  endTime: string
  totalHours: number
  location: string

  hostOrPoc: string
  phone: string
  email: string
  contactMethod: ContactMethod

  customerType: CustomerType

  companyName: string
  companyDirector: string
  companyTaxCode: string
  companyAddress: string
  companyCity: string
  billingEmail: string

  people: number
  budgetPerPerson: number
  budgetTotal: number

  notes: string

  paymentPlan: PaymentPlan
  depositPercent: number | null
  depositDueDate: string
  balancePercent: number | null
  balanceDueDate: string

  providerBranchId: string | null
}

type ProviderBranch = { id: string; name: string | null; company_name: string | null }

const clampPos = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0)
const clampPct = (n: number | null | undefined): number | null =>
  n == null ? null : Math.max(0, Math.min(100, Number(n)))

const normDbPct = (v: any): number | null => {
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  if (n <= 1 && n >= 0) return n * 100
  if (n > 1 && n <= 100) return n
  return null
}

function pctStr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return ''
  return Number(n).toFixed(8).replace(/\.?0+$/, '')
}

const formatPercent = (n: number | null | undefined) =>
  n == null ? '' : Number(n).toFixed(8).replace(/\.?0+$/, '')

function makePaymentTerm(
  t: (key: string, fallback?: string) => string,
  plan: PaymentPlan,
  dep: number | null,
  bal: number | null
): string {
  if (plan === 'full') return '100% ' + t('eventinfo.payment.full').toLowerCase()
  const d = clampPct(dep) ?? 0
  const b = clampPct(bal) ?? Math.max(0, 100 - d)
  return `${pctStr(d)}/${pctStr(b)}`
}

function emptyEventInfo(): EventInfo {
  return {
    eventName: '',
    date: '',
    startTime: '',
    endTime: '',
    totalHours: 0,
    location: '',
    hostOrPoc: '',
    phone: '',
    email: '',
    contactMethod: 'phone',
    customerType: 'private',
    companyName: '',
    companyDirector: '',
    companyTaxCode: '',
    companyAddress: '',
    companyCity: '',
    billingEmail: '',
    people: 0,
    budgetPerPerson: 0,
    budgetTotal: 0,
    notes: '',
    paymentPlan: 'full',
    depositPercent: null,
    depositDueDate: '',
    balancePercent: 100,
    balanceDueDate: '',
    providerBranchId: null,
  }
}

/* ---- time helpers ---- */
function hhmmToMinutes(s: string) {
  if (!s || !/^\d{2}:\d{2}$/.test(s)) return NaN
  const [hh, mm] = s.split(':').map(Number)
  return hh * 60 + mm
}
function diffHours(start: string, end: string) {
  const a = hhmmToMinutes(start)
  const b = hhmmToMinutes(end)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  const minutes = b >= a ? b - a : b + 24 * 60 - a
  return Math.max(0, Math.round((minutes / 60) * 100) / 100)
}

/* ---- datetime helpers (UTC-safe) ---- */
function toIsoOrNull(date: string, time: string): string | null {
  if (!date) return null
  const t = /^\d{2}:\d{2}$/.test(time) ? time : '00:00'
  try {
    const [y, m, d] = date.split('-').map(Number)
    const [hh, mm] = t.split(':').map(Number)
    return new Date(Date.UTC(y, m - 1, d, hh, mm, 0)).toISOString()
  } catch {
    return null
  }
}
function pad2(n: number) { return n < 10 ? `0${n}` : String(n) }
function fromIso(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { date: '', time: '' }
  const yyyy = d.getUTCFullYear()
  const mm = pad2(d.getUTCMonth() + 1)
  const dd = pad2(d.getUTCDate())
  const hh = pad2(d.getUTCHours())
  const mi = pad2(d.getUTCMinutes())
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` }
}

/* ---- currency helpers ---- */
const onlyDigits = (s: string) => (s ?? '').toString().replace(/\D+/g, '')
const parseCurrency = (s: string) => clampPos(Number(onlyDigits(s)))
const formatCurrency = (n: number) => {
  const i = Math.round(clampPos(n))
  return i.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/* ---- percent helpers ---- */
function parsePercentStrict(s: string): number | null {
  const t = (s ?? '').toString().replace(',', '.').replace(/[^\d.]/g, '').trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, n))
}

/* ---- draft helpers ---- */
function draftKey(eventId: string | null) {
  return `eventcalc.eventinfo:${eventId || ''}`
}

/* ---- installments cache ---- */
type InstallmentsSnap = { dep: number | null; bal: number | null; depDue: string; balDue: string }
const installmentsKey = (eventId: string | null) => `eventcalc.installments:last:${eventId || ''}`

/* ---- LS payment helpers ---- */
function readPaymentLS(eventId: string | null) {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`eventcalc.payment:${eventId || ''}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function writePaymentLS(eventId: string | null, patch: Record<string, any>) {
  if (typeof window === 'undefined') return
  try {
    const prev = readPaymentLS(eventId) || {}
    const next = { ...prev, ...patch }
    localStorage.setItem(`eventcalc.payment:${eventId || ''}`, JSON.stringify(next))
  } catch { }
}

/** LS percentuali o importi vincono sul DB */
function getPaymentFromLS(eventId: string | null): { plan?: PaymentPlan, depPct?: number | null, balPct?: number | null } {
  const ls = readPaymentLS(eventId)
  if (!ls) return {}
  const plan: PaymentPlan | undefined =
    ls?.plan === 'installments' || ls?.plan === 'full' ? ls.plan : undefined

  const tot = Number(ls?.total_amount_vnd)
  const depAmt = Number(ls?.deposit_amount_vnd)
  const balAmt = Number(ls?.balance_amount_vnd)
  if (Number.isFinite(tot) && tot > 0 && (Number.isFinite(depAmt) || Number.isFinite(balAmt))) {
    const depPct = Number.isFinite(depAmt) ? (depAmt / tot) * 100 : undefined
    const balPct = Number.isFinite(balAmt) ? (balAmt / tot) * 100 : undefined
    return { plan, depPct: depPct == null ? undefined : depPct, balPct: balPct == null ? undefined : balPct }
  }

  const depPct = normDbPct(ls?.deposit_percent)
  const balPct = normDbPct(ls?.balance_percent)
  if (depPct != null || balPct != null) return { plan, depPct: depPct ?? undefined, balPct: balPct ?? undefined }
  return {}
}

type Props = {
  title?: string
  value?: EventInfo
  onChange?: (v: EventInfo) => void
}

export default function EventInfoCard({ title, value, onChange }: Props) {
  const t = useECT()
  const tAny = (k: string, fallback?: string) => t(k as any, fallback)

  const ctx = useEventCalc() as any
  const eventId: string | null = useMemo(() => {
    const fromCtx = ctx?.eventId ?? null
    if (fromCtx) return String(fromCtx)
    if (typeof window !== 'undefined') {
      const fromLS = window.localStorage.getItem('eventcalc.draftEventId')
      return fromLS || null
    }
    return null
  }, [ctx])

  const { header, loading, error, save } = useEventHeader(eventId)

  const [data, setData] = useState<EventInfo>(value ?? emptyEventInfo())

  const lastInstallmentsRef = useRef<InstallmentsSnap | null>(null)
  const readLastInstallments = (): InstallmentsSnap | null => {
    if (lastInstallmentsRef.current) return lastInstallmentsRef.current
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(installmentsKey(eventId))
        if (raw) {
          const snap = JSON.parse(raw) as InstallmentsSnap
          lastInstallmentsRef.current = snap
          return snap
        }
      }
    } catch { }
    return null
  }
  const saveLastInstallments = (snap: InstallmentsSnap) => {
    lastInstallmentsRef.current = snap
    try { if (typeof window !== 'undefined') localStorage.setItem(installmentsKey(eventId), JSON.stringify(snap)) } catch { }
  }

  const [branches, setBranches] = useState<ProviderBranch[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  useEffect(() => {
    let active = true
      ; (async () => {
        try {
          setBranchesLoading(true)
          const { data, error } = await supabase
            .from('provider_branches')
            .select('id, name, company_name')
            .order('name', { ascending: true })
          if (!active) return
          if (error) throw error
          setBranches((data || []) as ProviderBranch[])
        } catch (e) {
          console.warn('[EventInfoCard] provider_branches load error:', (e as any)?.message || e)
          setBranches([])
        } finally {
          if (active) setBranchesLoading(false)
        }
      })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    lastInstallmentsRef.current = null
    readLastInstallments()
  }, [eventId]) // eslint-disable-line

  const hydratedOnceRef = useRef(false)
  const [hydrated, setHydrated] = useState(false)
  const [dirty, setDirty] = useState(false)

  const applyingExternalRef = useRef(false)

  useEffect(() => {
    if (value) setData(value)
  }, [value])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = draftKey(eventId)
    try {
      const raw = key ? localStorage.getItem(key) : null
      if (raw) {
        const draft = JSON.parse(raw) as EventInfo
        setData(draft)
        setHydrated(true)
        setDirty(true)
      }
    } catch { }
  }, [eventId]) // eslint-disable-line

  useEffect(() => {
    if (!header) return

    const { date: startDate, time: startTime } = fromIso(header.start_at ?? null)
    const { time: endTime } = fromIso(header.end_at ?? null)

    const planDb = (header as any)?.payment_plan as PaymentPlan | undefined
    const depositPctDB = normDbPct((header as any)?.deposit_percent)
    const balancePctDB = normDbPct((header as any)?.balance_percent)

    const lsPay = getPaymentFromLS(eventId)
    const planResolved: PaymentPlan =
      lsPay.plan
      ?? (planDb ? planDb : (depositPctDB != null || balancePctDB != null ? 'installments' : 'full'))

    const depFromLS = clampPct(lsPay.depPct)
    const balFromLS = clampPct(lsPay.balPct)

    const depFromDB = clampPct(depositPctDB)
    const balFromDB = clampPct(balancePctDB)

    const depFinal =
      depFromLS != null ? depFromLS
        : depFromDB != null ? depFromDB
          : (balFromDB != null ? Math.max(0, Math.min(100, 100 - balFromDB)) : null)

    const balFinal =
      balFromLS != null ? balFromLS
        : balFromDB != null ? balFromDB
          : (depFinal != null ? Math.max(0, Math.min(100, 100 - depFinal)) : (planResolved === 'full' ? 100 : null))

    const depDueDB = (header as any)?.deposit_due_date ?? ''
    const balDueDB = (header as any)?.balance_due_date ?? ''

    saveLastInstallments({
      dep: depFinal,
      bal: balFinal,
      depDue: depDueDB || '',
      balDue: balDueDB || '',
    })

    setData(prev => {
      const next: EventInfo = {
        ...prev,
        eventName: (header.event_name ?? header.title ?? prev.eventName) || '',
        date: (header.event_date ?? startDate ?? prev.date) || '',
        startTime: startTime || prev.startTime,
        endTime: endTime || prev.endTime,
        location: header.location ?? prev.location,
        hostOrPoc: (header.host_name ?? header.contact_name ?? prev.hostOrPoc) || '',
        phone: header.contact_phone ?? prev.phone,
        email: header.contact_email ?? prev.email,
        contactMethod: (header.preferred_contact as ContactMethod) ?? prev.contactMethod,
        customerType: (header.customer_type as CustomerType) ?? prev.customerType,
        companyName: header.company ?? prev.companyName,
        companyDirector: header.company_director ?? prev.companyDirector,
        companyTaxCode: header.company_tax_code ?? prev.companyTaxCode,
        companyAddress: header.company_address ?? prev.companyAddress,
        companyCity: header.company_city ?? prev.companyCity,
        billingEmail: header.billing_email ?? prev.billingEmail,
        people: Number.isFinite(header.people_count) && header.people_count != null ? Number(header.people_count) : prev.people,
        budgetPerPerson: header.budget_per_person_vnd ?? prev.budgetPerPerson,
        budgetTotal: header.budget_total_vnd ?? prev.budgetTotal,
        notes: header.notes ?? prev.notes,

        paymentPlan: planResolved,
        depositPercent: depFinal,
        depositDueDate: depDueDB || '',
        balancePercent: balFinal,
        balanceDueDate: balDueDB || '',

        providerBranchId: (header as any)?.provider_branch_id ?? prev.providerBranchId ?? null,
      }
      return next
    })

    hydratedOnceRef.current = true
    setHydrated(true)
  }, [header, eventId])

  useEffect(() => {
    if (!loading && !hydrated) setHydrated(true)
  }, [loading, hydrated])

  const totalHours = useMemo(() => diffHours(data.startTime, data.endTime), [data.startTime, data.endTime])

  useEffect(() => {
    if (totalHours !== data.totalHours) {
      const next = { ...data, totalHours }
      setData(next)
      onChange?.(next)
      persistDraft(next)
      setDirty(true)
      broadcastHeader(tAny, next)
    }
  }, [totalHours]) // eslint-disable-line

  function persistNow(current: EventInfo) {
    if (!eventId) return
    const start_at = toIsoOrNull(current.date, current.startTime)
    const end_at = toIsoOrNull(current.date, current.endTime)
    const isCompany = current.customerType === 'company'

    const event_date = current.date ? String(current.date).slice(0, 10) : null
    const event_name = current.eventName || null
    const host_name = current.hostOrPoc || null

    const payment_plan: PaymentPlan = current.paymentPlan
    const depPct = payment_plan === 'installments' ? clampPct(current.depositPercent) : null
    const balPct = payment_plan === 'full'
      ? 100
      : clampPct(current.balancePercent ?? (depPct != null ? 100 - depPct : null))

    const depPct01 = depPct == null ? null : Math.max(0, Math.min(1, depPct / 100))
    const balPct01 = balPct == null ? null : Math.max(0, Math.min(1, balPct / 100))

    const rawDepositDue = payment_plan === 'installments' ? (current.depositDueDate || null) : null
    let balance_due_date = current.balanceDueDate || null
    if (payment_plan === 'installments' && rawDepositDue && balance_due_date && balance_due_date < rawDepositDue) {
      balance_due_date = rawDepositDue
    }

    const payment_term = makePaymentTerm(tAny, payment_plan, depPct, balPct)

    const provider_branch_id = current.providerBranchId && current.providerBranchId.trim()
      ? current.providerBranchId
      : null

    const payload: any = {
      event_date, event_name, host_name,
      title: current.eventName,
      start_at, end_at,
      location: current.location || null,
      contact_name: current.hostOrPoc || null,
      contact_phone: current.phone || null,
      contact_email: current.email || null,
      preferred_contact: current.contactMethod || null,
      customer_type: current.customerType || null,
      company: isCompany ? (current.companyName || null) : null,
      company_director: isCompany ? (current.companyDirector || null) : null,
      company_tax_code: isCompany ? (current.companyTaxCode || null) : null,
      company_address: isCompany ? (current.companyAddress || null) : null,
      company_city: isCompany ? (current.companyCity || null) : null,
      billing_email: isCompany ? (current.billingEmail || null) : null,
      people_count: Number.isFinite(current.people) ? current.people : null,
      budget_per_person_vnd: Number.isFinite(current.budgetPerPerson) ? current.budgetPerPerson : null,
      budget_total_vnd: Number.isFinite(current.budgetTotal) ? current.budgetTotal : null,
      notes: current.notes || null,

      payment_plan,
      is_full_payment: payment_plan === 'full',

      payment_term,
      payment_terms: payment_term,
      payment_policy: payment_term,
      payment_condition: payment_term,

      deposit_percent: depPct,
      deposit_percentage: depPct,
      deposit_percent_01: depPct01,

      balance_percent: balPct,
      balance_percentage: balPct,
      balance_percent_01: balPct01,

      deposit_due_date: rawDepositDue,
      deposit_due_at: rawDepositDue,
      deposit_due_on: rawDepositDue,

      balance_due_date,
      balance_due_at: balance_due_date,
      balance_due_on: balance_due_date,

      provider_branch_id,
    }

    console.info('[EventInfoCard] WILL SAVE payload ⬇️', payload)

    void (async () => {
      await save(payload)
      persistDraft(current)
      setDirty(false)
      announceDirty(false)
      announceSaved()
      try { window.dispatchEvent(new CustomEvent('eventcalc:header-saved-ok', { detail: { eventId } })) } catch { }
    })()
  }

  function persistDraft(next: EventInfo) {
    if (typeof window === 'undefined') return
    try { localStorage.setItem(draftKey(eventId), JSON.stringify(next)) } catch { }
  }

  function broadcastHeader(
    t: (key: string, fallback?: string) => string,
    next: EventInfo,
    opts?: { emitPayment?: boolean }
  ) {
    if (typeof window === 'undefined') return
    const people = clampPos(Number(next.people || 0))
    const budgetPerPerson = clampPos(Number(next.budgetPerPerson || 0))
    const budgetTotal = Number.isFinite(next.budgetTotal) && next.budgetTotal > 0
      ? clampPos(next.budgetTotal)
      : people * budgetPerPerson
    const totalHours = clampPos(Number(next.totalHours || 0))

    const key = `eventcalc.header:${eventId || ''}`
    try {
      localStorage.setItem(key, JSON.stringify({ people, budgetPerPerson, budgetTotal, totalHours }))
    } catch { }

    try {
      window.dispatchEvent(new CustomEvent('eventinfo:changed', {
        detail: { eventId: eventId || null, people, budgetPerPerson, budgetTotal, totalHours }
      }))
    } catch { }

    if (opts?.emitPayment === false) return
    try {
      const dep = next.paymentPlan === 'installments' ? clampPct(next.depositPercent) : null
      const bal = next.paymentPlan === 'full' ? 100 : clampPct(next.balancePercent ?? (dep != null ? 100 - dep : null))

      writePaymentLS(eventId, {
        plan: next.paymentPlan,
        payment_term: makePaymentTerm(t, next.paymentPlan, dep, bal),
        deposit_percent: dep,
        deposit_due_date: next.paymentPlan === 'installments' ? next.depositDueDate : null,
        balance_percent: bal,
        balance_due_date: next.balanceDueDate || null,
      })

      window.dispatchEvent(new CustomEvent('payment:changed', {
        detail: { eventId: eventId || null, plan: next.paymentPlan, deposit_percent: dep, balance_percent: bal }
      }))
    } catch { }
  }

  function emitSaveBarEvent(type: 'dirty' | 'saved', detail: any) {
    if (typeof window === 'undefined') return
    try {
      const payloadHeader = { ...detail, card: 'header' }
      const payloadEventInfo = { ...detail, card: 'eventinfo' }
      window.dispatchEvent(new CustomEvent(`eventcalc:${type}`, { detail: payloadHeader }))
      window.dispatchEvent(new CustomEvent(`eventcalc:${type}`, { detail: payloadEventInfo }))
    } catch { }
  }

  function announceDirty(v: boolean) {
    emitSaveBarEvent('dirty', { eventId: eventId || null, dirty: v })
  }

  function announceSaved() {
    emitSaveBarEvent('saved', { eventId: eventId || null })
  }

  function setAndProp(next: EventInfo) {
    setData(next)
    onChange?.(next)
    persistDraft(next)
    broadcastHeader(tAny, next)
    if (!dirty) setDirty(true)
    announceDirty(true)
  }
  function upd<K extends keyof EventInfo>(key: K, val: EventInfo[K]) {
    const next = { ...data, [key]: val }
    setAndProp(next)
  }

  function nudgeSaveBar() { announceDirty(true) }

  function setPeople(v: string) {
    const people = clampPos(Number(v))
    const per = clampPos(data.budgetPerPerson)
    const total = people > 0 ? per * people : 0
    setAndProp({ ...data, people, budgetPerPerson: per, budgetTotal: total })
  }
  function setBudgetPerPerson(v: string) {
    const budgetPerPerson = parseCurrency(v)
    const ppl = clampPos(data.people)
    const total = budgetPerPerson * ppl
    setAndProp({ ...data, budgetPerPerson, budgetTotal: total })
  }
  function setBudgetTotal(v: string) {
    const budgetTotal = parseCurrency(v)
    const ppl = clampPos(data.people)
    const per = ppl > 0 ? Math.round((budgetTotal / ppl) * 100) / 100 : 0
    setAndProp({ ...data, budgetTotal, budgetPerPerson: per })
  }

  function setDepositPercent(v: string) {
    const dep = parsePercentStrict(v)
    if (data.paymentPlan !== 'installments') {
      upd('depositPercent', dep); nudgeSaveBar(); return
    }
    const nextDep = dep == null ? null : clampPct(dep)!
    const nextBal = nextDep == null ? data.balancePercent : Math.max(0, Math.min(100, 100 - nextDep))
    const next: EventInfo = { ...data, depositPercent: nextDep, balancePercent: nextBal ?? null }
    setAndProp(next)
    saveLastInstallments({ dep: nextDep, bal: nextBal ?? null, depDue: next.depositDueDate, balDue: next.balanceDueDate })
    nudgeSaveBar()
  }

  function setBalancePercent(v: string) {
    const bal = parsePercentStrict(v)
    if (data.paymentPlan !== 'installments') {
      upd('balancePercent', bal); nudgeSaveBar(); return
    }
    const nextBal = bal == null ? null : clampPct(bal)!
    const nextDep = nextBal == null ? data.depositPercent : Math.max(0, Math.min(100, 100 - nextBal))
    const next: EventInfo = { ...data, balancePercent: nextBal, depositPercent: nextDep ?? null }
    setAndProp(next)
    saveLastInstallments({ dep: nextDep ?? null, bal: nextBal, depDue: next.depositDueDate, balDue: next.balanceDueDate })
    nudgeSaveBar()
  }

  function setDepositDueDate(v: string) {
    if (data.paymentPlan === 'installments') {
      const needsClamp = data.balanceDueDate && v && data.balanceDueDate < v
      const next = needsClamp
        ? { ...data, depositDueDate: v, balanceDueDate: v }
        : { ...data, depositDueDate: v }
      setAndProp(next)
      saveLastInstallments({ dep: next.depositPercent, bal: next.balancePercent, depDue: next.depositDueDate, balDue: next.balanceDueDate })
    } else {
      upd('depositDueDate', v)
    }
    nudgeSaveBar()
  }

  function setBalanceDueDate(v: string) {
    if (data.paymentPlan === 'installments' && data.depositDueDate && v && v < data.depositDueDate) {
      const next = { ...data, balanceDueDate: data.depositDueDate }
      setAndProp(next)
      saveLastInstallments({ dep: next.depositPercent, bal: next.balancePercent, depDue: next.depositDueDate, balDue: next.balanceDueDate })
    } else {
      const next = { ...data, balanceDueDate: v }
      setAndProp(next)
      if (data.paymentPlan === 'installments') {
        saveLastInstallments({ dep: next.depositPercent, bal: next.balancePercent, depDue: next.depositDueDate, balDue: next.balanceDueDate })
      }
    }
    nudgeSaveBar()
  }

  function setPaymentPlan(plan: PaymentPlan) {
    if (plan === data.paymentPlan) return
    if (plan === 'full') {
      setAndProp({
        ...data,
        paymentPlan: 'full',
        depositPercent: null,
        depositDueDate: '',
        balancePercent: 100,
      })
      nudgeSaveBar()
    } else {
      const snap = readLastInstallments()
      const depFromCache = clampPct(snap?.dep)
      const balFromCache = clampPct(snap?.bal)
      const dep = depFromCache ?? (balFromCache != null ? Math.max(0, Math.min(100, 100 - balFromCache)) : 50)
      const bal = balFromCache ?? Math.max(0, Math.min(100, 100 - dep))
      const depDue = snap?.depDue ?? data.depositDueDate ?? ''
      const balDue = snap?.balDue ?? data.balanceDueDate ?? ''
      const next: EventInfo = {
        ...data,
        paymentPlan: 'installments',
        depositPercent: dep,
        balancePercent: bal,
        depositDueDate: depDue,
        balanceDueDate: balDue,
      }
      setAndProp(next)
      saveLastInstallments({ dep, bal, depDue, balDue })
      nudgeSaveBar()
    }
  }

  useEffect(() => {
    announceDirty(dirty)
  }, [dirty]) // eslint-disable-line

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onGlobalSave = () => persistNow(data)
    window.addEventListener('eventcalc:save-header', onGlobalSave as EventListener)
    return () => window.removeEventListener('eventcalc:save-header', onGlobalSave as EventListener)
  }, [data, eventId]) // eslint-disable-line

  function applyExternalPayment(plan: PaymentPlan, depIn: number | null, balIn: number | null, amounts?: { dep?: number | null; bal?: number | null; total?: number | null }) {
    if (applyingExternalRef.current) return
    applyingExternalRef.current = true

    const snap = readLastInstallments()

    let depFromAmt: number | null = null
    let balFromAmt: number | null = null
    if (amounts?.total && (amounts.dep != null || amounts.bal != null)) {
      const tot = Math.max(0, Number(amounts.total) || 0)
      if (tot > 0) {
        if (amounts.dep != null) depFromAmt = (Number(amounts.dep) / tot) * 100
        if (amounts.bal != null) balFromAmt = (Number(amounts.bal) / tot) * 100
      }
    }

    setData(prev => {
      let d = plan === 'installments' ? (depFromAmt ?? clampPct(depIn)) : null
      let b = plan === 'full' ? 100 : (balFromAmt ?? clampPct(balIn))

      if (plan === 'installments') {
        if (d == null && b == null) {
          d = clampPct(snap?.dep) ?? clampPct(prev.depositPercent) ?? 50
          b = clampPct(snap?.bal) ?? Math.max(0, Math.min(100, 100 - (d ?? 50)))
        } else if (d == null && b != null) {
          d = Math.max(0, Math.min(100, 100 - b))
        } else if (b == null && d != null) {
          b = Math.max(0, Math.min(100, 100 - d))
        }
      }

      const same =
        prev.paymentPlan === plan &&
        (plan === 'full'
          ? (prev.depositPercent == null && prev.balancePercent === 100)
          : (prev.depositPercent === d && prev.balancePercent === b))
      if (same) return prev

      const next: EventInfo = { ...prev }
      if (plan === 'full') {
        next.paymentPlan = 'full'
        next.depositPercent = null
        next.balancePercent = 100
      } else {
        next.paymentPlan = 'installments'
        next.depositPercent = d ?? prev.depositPercent ?? 50
        next.balancePercent = b ?? Math.max(0, Math.min(100, 100 - (next.depositPercent ?? 50)))
        saveLastInstallments({
          dep: next.depositPercent,
          bal: next.balancePercent,
          depDue: next.depositDueDate,
          balDue: next.balanceDueDate,
        })
      }

      persistDraft(next)
      return next
    })

    setTimeout(() => { applyingExternalRef.current = false }, 0)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onPayment = (e: any) => {
      const d = (e as CustomEvent).detail
      if (!eventId || d?.eventId === eventId) {
        const plan: PaymentPlan = (d?.plan === 'installments' || d?.plan === 'full') ? d.plan : 'installments'
        const dep = normDbPct(d?.deposit_percent)
        const bal = normDbPct(d?.balance_percent)
        const depAmt = Number.isFinite(Number(d?.deposit_amount_vnd)) ? Number(d?.deposit_amount_vnd) : null
        const balAmt = Number.isFinite(Number(d?.balance_amount_vnd)) ? Number(d?.balance_amount_vnd) : null
        const totAmt = Number.isFinite(Number(d?.total_amount_vnd)) ? Number(d?.total_amount_vnd) : null
        setTimeout(() => applyExternalPayment(plan, dep, bal, { dep: depAmt, bal: balAmt, total: totAmt }), 0)
      }
    }
    window.addEventListener('payment:changed', onPayment as EventListener)
    return () => window.removeEventListener('payment:changed', onPayment as EventListener)
  }, [eventId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `eventcalc.payment:${eventId || ''}`
    const readOnce = () => {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) return
        const o = JSON.parse(raw)
        const plan: PaymentPlan = (o?.plan === 'installments' || o?.plan === 'full') ? o.plan : 'installments'

        let depPct: number | null = null
        let balPct: number | null = null
        const tot = Number.isFinite(Number(o?.total_amount_vnd)) ? Number(o.total_amount_vnd) : null
        const depAmt = Number.isFinite(Number(o?.deposit_amount_vnd)) ? Number(o.deposit_amount_vnd) : null
        const balAmt = Number.isFinite(Number(o?.balance_amount_vnd)) ? Number(o.balance_amount_vnd) : null

        if (tot && (depAmt != null || balAmt != null)) {
          if (depAmt != null) depPct = (depAmt / tot) * 100
          if (balAmt != null) balPct = (balAmt / tot) * 100
        } else {
          depPct = normDbPct(o?.deposit_percent)
          balPct = normDbPct(o?.balance_percent)
        }

        setTimeout(() => applyExternalPayment(plan, depPct, balPct, { dep: depAmt, bal: balAmt, total: tot }), 0)
      } catch { }
    }
    readOnce()
  }, [eventId])

  const showCompany = data.customerType === 'company'

  if (!hydrated && loading) {
    return (
      <div className="bg-white rounded-2xl shadow p-3 text-gray-900">
        {t('eventinfo.loading')}
      </div>
    )
  }

  const branchLabel = (b: ProviderBranch) =>
    b.name?.trim() || b.company_name?.trim() || `Branch ${b.id.slice(0, 8)}`

  return (
    <div className="bg-white rounded-2xl shadow p-3 text-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title ?? t('eventinfo.title')}</h2>
      </div>

      {/* RIGA 1 Evento */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <Field label={t('eventinfo.event')} value={data.eventName} onChange={v => upd('eventName', v)} className="md:flex-[2]" />
          <Field type="date" label={t('eventinfo.date')} value={data.date} onChange={v => upd('date', v)} className="md:w-56" />
          <Field type="time" label={t('eventinfo.start_time')} value={data.startTime} onChange={v => upd('startTime', v)} className="md:w-40" />
          <Field type="time" label={t('eventinfo.end_time')} value={data.endTime} onChange={v => upd('endTime', v)} className="md:w-40" />
          <ReadOnly label={t('eventinfo.total_hours')} value={Number.isFinite(data.totalHours) ? String(data.totalHours) : ''} className="md:w-40" />
        </div>

        <div className="mt-3">
          <Field label={t('eventinfo.location')} value={data.location} onChange={v => upd('location', v)} />
        </div>
      </div>

      {/* RIGA 2 Contatti */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <Field label={t('eventinfo.host_poc')} value={data.hostOrPoc} onChange={v => upd('hostOrPoc', v)} className="md:flex-[2]" />
          <Field label={t('eventinfo.phone')} value={data.phone} onChange={v => upd('phone', v)} className="md:w-64" />
          <Field label={t('eventinfo.email')} value={data.email} onChange={v => upd('email', v)} className="md:flex-[2]" />
          <Select
            label={t('eventinfo.preferred_contact')}
            value={data.contactMethod}
            onChange={v => upd('contactMethod', v as ContactMethod)}
            options={[
              { value: 'zalo', label: t('eventinfo.contact.zalo') },
              { value: 'phone', label: t('eventinfo.contact.phone') },
              { value: 'email', label: t('eventinfo.contact.email') },
              { value: 'whatsapp', label: t('eventinfo.contact.whatsapp') },
              { value: 'other', label: t('eventinfo.contact.other') },
            ]}
            className="md:w-56"
          />
        </div>
      </div>

      {/* RIGA 3 Tipo cliente + azienda */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-800">{t('eventinfo.customer_type')}</span>
          <div className="inline-flex rounded-lg overflow-hidden border border-blue-600/40">
            <button type="button" onClick={() => upd('customerType', 'private')}
              className={`px-3 py-1.5 text-sm ${data.customerType === 'private' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700'}`}>
              {t('eventinfo.customer.private')}
            </button>
            <button type="button" onClick={() => upd('customerType', 'company')}
              className={`px-3 py-1.5 text-sm border-l ${data.customerType === 'company' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700'}`}>
              {t('eventinfo.customer.company')}
            </button>
          </div>
        </div>

        {data.customerType === 'company' && (
          <div className="mt-4 bg:white rounded-xl border border-gray-200 p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <Field label={t('eventinfo.company.name')} value={data.companyName} onChange={v => upd('companyName', v)} className="md:flex-[2]" />
              <Field label={t('eventinfo.company.director')} value={data.companyDirector} onChange={v => upd('companyDirector', v)} className="md:flex-[2]" />
              <Field label={t('eventinfo.company.tax_code')} value={data.companyTaxCode} onChange={v => upd('companyTaxCode', v)} className="md:w-64" />
            </div>

            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
              <Field label={t('eventinfo.company.address')} value={data.companyAddress} onChange={v => upd('companyAddress', v)} className="md:flex-[3]" />
              <Field label={t('eventinfo.company.city')} value={data.companyCity} onChange={v => upd('companyCity', v)} className="md:flex-[1]" />
              <Field label={t('eventinfo.company.billing_email')} value={data.billingEmail} onChange={v => upd('billingEmail', v)} className="md:flex-[2]" />
            </div>
          </div>
        )}
      </div>

      {/* RIGA 4 People/Budget + Notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2 order-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field type="number" label={t('eventinfo.people')} value={Number.isFinite(data.people) ? String(data.people) : ''} onChange={setPeople} className="sm:col-span-2" />
              <CurrencyFieldWithSuffix label={t('eventinfo.budget_per_person')} value={formatCurrency(data.budgetPerPerson)} onChange={setBudgetPerPerson} suffix={t('eventinfo.per_person_suffix')} />
              <CurrencyField label={t('eventinfo.budget_total')} value={formatCurrency(data.budgetTotal)} onChange={setBudgetTotal} />
            </div>
          </div>

          <div className="md:col-span-3 order-2">
            <label className="flex flex-col h-full">
              <span className="text-sm text-gray-800">{t('eventinfo.notes')}</span>
              <textarea className="mt-1 w-full border rounded-lg px-2 py-2 text-gray-900 bg-white min-h-[140px]"
                value={data.notes ?? ''} onChange={e => upd('notes', e.target.value ?? '')} />
            </label>
            {error && (
              <div className="mt-2 text-xs text-red-600">
                {typeof error === 'string'
                  ? error
                  : (error as any)?.message || JSON.stringify(error)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGA 5 Payment + Provider branch */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mt-3">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm text-gray-800">{t('eventinfo.payment')}</span>
          <div className="inline-flex rounded-lg overflow-hidden border border-blue-600/40">
            <button type="button" onClick={() => setPaymentPlan('full')}
              className={`px-3 py-1.5 text-sm ${data.paymentPlan === 'full' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700'}`}>
              {t('eventinfo.payment.full')}
            </button>
            <button type="button" onClick={() => setPaymentPlan('installments')}
              className={`px-3 py-1.5 text-sm border-l ${data.paymentPlan === 'installments' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700'}`}>
              {t('eventinfo.payment.installments')}
            </button>
          </div>
        </div>

        {data.paymentPlan === 'installments' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-3">
              <div className="font-semibold mb-2">{t('eventinfo.deposit')}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PercentField label={t('eventinfo.deposit_pct')} value={formatPercent(data.depositPercent)} onChange={setDepositPercent} />
                <Field type="date" label={t('eventinfo.due_date')} value={data.depositDueDate} onChange={setDepositDueDate} />
              </div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="font-semibold mb-2">{t('eventinfo.balance')}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PercentField label={t('eventinfo.balance_pct')} value={formatPercent(data.balancePercent)} onChange={setBalancePercent} />
                <Field type="date" label={t('eventinfo.due_date')} value={data.balanceDueDate} onChange={setBalanceDueDate} min={data.depositDueDate || undefined} />
              </div>
            </div>
          </div>
        ) : (
          <div className="border rounded-lg p-3">
            <div className="font-semibold mb-2">{t('eventinfo.balance')}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ReadOnly label={t('eventinfo.balance_pct')} value="100" />
              <Field type="date" label={t('eventinfo.due_date')} value={data.balanceDueDate} onChange={v => { upd('balanceDueDate', v); nudgeSaveBar() }} />
            </div>
          </div>
        )}

        <div className="mt-4">
          <Select
            label={`${t('eventinfo.provider_branch')}${branchesLoading ? ` (${t('eventinfo.loading')})` : ''}`}
            value={data.providerBranchId ?? ''}
            onChange={(v) => {
              const val = (v || '').trim()
              upd('providerBranchId', val === '' ? null : val)
              nudgeSaveBar()
            }}
            options={[
              { value: '', label: t('eventinfo.select_branch') },
              ...branches.map(b => ({ value: b.id, label: branchLabel(b) })),
            ]}
            className="md:w-[420px]"
          />
        </div>
      </div>
    </div>
  )
}

/* ---------------- UI helpers ---------------- */

function Field({
  label, value, onChange, type = 'text', className = '', min, max,
}: {
  label: string
  value: string | undefined
  onChange: (v: string) => void
  type?: string
  className?: string
  min?: string
  max?: string
}) {
  const v = value ?? ''
  return (
    <label className={`flex flex-col ${className}`}>
      <span className="text-sm text-gray-800">{label}</span>
      <input
        className="mt-1 w-full border rounded-lg px-2 h-10 text-gray-900 bg-white"
        value={v}
        type={type}
        min={min}
        max={max}
        onChange={e => onChange(e.target.value ?? '')}
      />
    </label>
  )
}

function ReadOnly({ label, value, className = '' }: { label: string; value: string | undefined; className?: string }) {
  const v = value ?? ''
  return (
    <label className={`flex flex-col ${className}`}>
      <span className="text-sm text-gray-800">{label}</span>
      <div className="mt-1 w-full border rounded-lg h-10 bg-gray-50 px-3 flex items-center justify-end text-gray-900">
        <span className="tabular-nums font-semibold">{v}</span>
      </div>
    </label>
  )
}

function Select({
  label, value, onChange, options, className = '',
}: {
  label: string
  value: string | undefined
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  const fallback = options[0]?.value ?? ''
  const v = value ?? fallback
  return (
    <label className={`flex flex-col ${className}`}>
      <span className="text-sm text-gray-800">{label}</span>
      <select
        className="mt-1 w-full border rounded-lg px-2 h-10 text-gray-900 bg-white"
        value={v}
        onChange={e => onChange(e.target.value ?? fallback)}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

function CurrencyField({
  label, value, onChange, className = '',
}: {
  label: string
  value: string | undefined
  onChange: (v: string) => void
  className?: string
}) {
  const v = value ?? ''
  return (
    <label className={`flex flex-col ${className}`}>
      <span className="text-sm text-gray-800">{label}</span>
      <input
        className="mt-1 w-full border rounded-lg px-2 h-10 text-gray-900 bg-white text-right tabular-nums"
        value={v}
        inputMode="numeric"
        onChange={e => onChange(e.target.value ?? '')}
      />
    </label>
  )
}

function CurrencyFieldWithSuffix({
  label, value, onChange, suffix, className = '',
}: {
  label: string
  value: string | undefined
  onChange: (v: string) => void
  suffix: string
  className?: string
}) {
  const v = value ?? ''
  return (
    <label className={`flex flex-col ${className}`}>
      <span className="text-sm text-gray-800">{label}</span>
      <div className="relative mt-1">
        <input
          className="w-full border rounded-lg h-10 pr-16 pl-2 text-right text-gray-900 bg-white tabular-nums"
          value={v}
          inputMode="numeric"
          onChange={e => onChange(e.target.value ?? '')}
        />
        <span className="absolute inset-y-0 right-2 flex items-center text-gray-500 text-sm pointer-events-none">
          {suffix}
        </span>
      </div>
    </label>
  )
}

function PercentField({
  label, value, onChange, className = '',
}: {
  label: string
  value: string | undefined
  onChange: (v: string) => void
  className?: string
}) {
  const v = value ?? ''
  return (
    <label className={`flex flex-col ${className}`}>
      <span className="text-sm text-gray-800">{label}</span>
      <div className="relative mt-1">
        <input
          className="w-full border rounded-lg h-10 pr-10 pl-2 text-right text-gray-900 bg-white tabular-nums"
          value={v}
          inputMode="decimal"
          onChange={e => onChange(e.target.value ?? '')}
        />
        <span className="absolute inset-y-0 right-2 flex items-center text-gray-500 text-sm pointer-events-none">%</span>
      </div>
    </label>
  )
}