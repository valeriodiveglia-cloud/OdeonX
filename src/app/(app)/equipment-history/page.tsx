// src/app/(app)/equipment-history/page.tsx
'use client'

/* ╔══════════════════════════════════════════════════════════════════╗
   ║                 EQUIPMENT HISTORY — Cost Trend & Log             ║
   ╠══════════════════════════════════════════════════════════════════╣
   ║  File riorganizzato a blocchi con titoli per refactor futuro     ║
   ╚══════════════════════════════════════════════════════════════════╝ */

/* ────────────────────────────────────────
   ▶️  IMPORTS
   ──────────────────────────────────────── */
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

// i18n + settings
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'

/* ────────────────────────────────────────
   🧩  TIPI (lookup, dominio, view-model)
   ──────────────────────────────────────── */
type Cat = { id: number; name: string }
type Sup = { id: string; name: string }

type Equip = {
  id: string
  name: string
  category_id: number | null
  supplier_id: string | null
  cost: number | null
  final_price: number | null
  created_at?: string | null
}

type EqHistoryRow = {
  id: string
  equipment_id: string
  changed_at: string
  old_cost: number | null
  new_cost: number | null
  old_final_price: number | null
  new_final_price: number | null
}

type ViewMode = 'detail' | 'list'

/* ────────────────────────────────────────
   🧩  UI HELPERS
   ──────────────────────────────────────── */
function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return <span className="inline-block w-4" />
  return asc ? (
    <ChevronUpIcon className="w-4 h-4 inline-block text-gray-700" />
  ) : (
    <ChevronDownIcon className="w-4 h-4 inline-block text-gray-700" />
  )
}

/* ────────────────────────────────────────
   🛠️  UTILS (date & format)
   ──────────────────────────────────────── */
function startOfDay(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x
}
function addDays(d: Date, days: number) {
  const x = new Date(d); x.setDate(x.getDate() + days); return x
}
function fmtDMY(d: Date | string) {
  const x = typeof d === 'string' ? new Date(d) : d
  const dd = String(x.getDate()).padStart(2, '0')
  const mm = String(x.getMonth() + 1).padStart(2, '0')
  const yy = x.getFullYear()
  return `${dd}/${mm}/${yy}`
}
function toYMDLocal(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
}

/* ╔══════════════════════════════════════════════════════════════════╗
   ║                           COMPONENTE                             ║
   ╚══════════════════════════════════════════════════════════════════╝ */
export default function EquipmentHistoryPage() {
  /* ────────────────────────────────────────
     🌐  SETTINGS / LINGUA
     ──────────────────────────────────────── */
  const { language } = useSettings()

  /* ────────────────────────────────────────
     📦  STATE — dati base, selezioni, view
     ──────────────────────────────────────── */
  const [loading, setLoading] = useState(true)
  const [cats, setCats] = useState<Cat[]>([])
  const [sups, setSups] = useState<Sup[]>([])
  const [equip, setEquip] = useState<Equip[]>([])
  const [selEq, setSelEq] = useState<string>('')

  const today = useMemo(() => startOfDay(new Date()), [])
  const [from, setFrom] = useState<string>(() => toYMDLocal(addDays(today, -365)))
  const [to, setTo] = useState<string>(() => toYMDLocal(today))

  const [view, setView] = useState<ViewMode>('detail')

  // storico (tutti gli equipment nel range)
  const [rowsAll, setRowsAll] = useState<EqHistoryRow[]>([])
  const [loadingRows, setLoadingRows] = useState(false)

  // LIST: filtro + sorting
  const [filterName, setFilterName] = useState('')
  type ListSortCol = 'name' | 'changed_at' | 'old_cost' | 'new_cost' | 'pct' | 'trend'
  const [listSortCol, setListSortCol] = useState<ListSortCol>('name')
  const [listSortAsc, setListSortAsc] = useState(true)
  function toggleListSort(col: ListSortCol) {
    if (listSortCol === col) setListSortAsc(s => !s)
    else { setListSortCol(col); setListSortAsc(true) }
  }

  /* ────────────────────────────────────────
     🔌  FETCH — lookups + equipment
     ──────────────────────────────────────── */
  async function fetchLookups() {
    setLoading(true)
    const [cRes, sRes, eRes] = await Promise.all([
      supabase.from('equipment_categories').select('*').order('name', { ascending: true }),
      supabase.from('suppliers').select('*').order('name', { ascending: true }),
      supabase.from('rental_equipment')
        .select('id,name,category_id,supplier_id,cost,final_price,created_at')
        .order('name', { ascending: true }),
    ])
    if (cRes.data) setCats(cRes.data as Cat[])
    if (sRes.data) setSups(sRes.data as Sup[])
    if (eRes.data) setEquip(eRes.data as Equip[])
    if (!selEq && eRes.data && eRes.data.length) setSelEq((eRes.data as Equip[])[0].id)
    setLoading(false)
  }

  /* ────────────────────────────────────────
     🔌  FETCH — storico prezzi nel range
     ──────────────────────────────────────── */
  async function fetchHistoryAll() {
    setLoadingRows(true)

    if (!from || !to) {
      setRowsAll([])
      setLoadingRows(false)
      return
    }

    // intervallo chiuso-aperto [from 00:00Z, to+1 00:00Z)
    const fromIso = `${from}T00:00:00.000Z`
    const toStart = new Date(`${to}T00:00:00.000Z`)
    toStart.setUTCDate(toStart.getUTCDate() + 1)
    const toIsoExclusive = toStart.toISOString()

    const { data, error } = await supabase
      .from('equipment_price_history')
      .select('*')
      .gte('changed_at', fromIso)
      .lt('changed_at', toIsoExclusive)
      .order('equipment_id', { ascending: true })
      .order('changed_at', { ascending: true })

    if (error) {
      alert('Error loading history: ' + error.message)
      setRowsAll([])
    } else {
      setRowsAll((data as EqHistoryRow[]) || [])
    }
    setLoadingRows(false)
  }

  /* ────────────────────────────────────────
     ⏱️  EFFECTS — bootstrap & reload
     ──────────────────────────────────────── */
  useEffect(() => { fetchLookups() }, [])
  useEffect(() => { fetchHistoryAll() }, [from, to])

  /* ────────────────────────────────────────
     🧮  SELECTORS — equipment & righe dettaglio
     ──────────────────────────────────────── */
  const currentEquipment = useMemo(
    () => equip.find(e => e.id === selEq) || null,
    [equip, selEq]
  )
  const rowsDetail = useMemo(
    () => rowsAll.filter(r => r.equipment_id === selEq),
    [rowsAll, selEq]
  )

  /* ────────────────────────────────────────
     📈  DERIVED — dati per il GRAFICO (fix RANGE)
         - asse X fisso da from (00:00) a to (23:59:59.999)
         - usa timestamp reale di changed_at (fluttuazioni nello stesso giorno)
         - padding ai bordi (from/to) per coprire tutta la larghezza
         - se non ci sono punti: linea piatta al valore corrente
     ──────────────────────────────────────── */
  const chartData = useMemo(() => {
    const fromTs = startOfDay(new Date(`${from}T00:00:00`)).getTime()
    const toEndTs = addDays(startOfDay(new Date(`${to}T00:00:00`)), 1).getTime() - 1

    const points: Array<{ ts: number; cost: number }> = []

    for (const r of rowsDetail) {
      const val = r.new_cost ?? r.old_cost
      if (val == null) continue

      const ts = new Date(r.changed_at).getTime() // timestamp reale
      if (ts < fromTs || ts > toEndTs) continue
      points.push({ ts, cost: val })
    }

    points.sort((a, b) => a.ts - b.ts)

    if (points.length === 0) {
      const val = currentEquipment?.cost
      if (val != null) return [{ ts: fromTs, cost: val }, { ts: toEndTs, cost: val }]
      return []
    }

    const firstVal = points[0].cost
    const lastVal  = points[points.length - 1].cost
    if (points[0].ts > fromTs) points.unshift({ ts: fromTs, cost: firstVal })
    if (points[points.length - 1].ts < toEndTs) points.push({ ts: toEndTs, cost: lastVal })

    return points
  }, [rowsDetail, currentEquipment, from, to])

  /* ────────────────────────────────────────
     🧭  DERIVED — X DOMAIN con Auto-focus cambi
         (stessa logica usata nei materials)
     ──────────────────────────────────────── */
  const xDomain: [number, number] = useMemo(() => {
    const rangeStart = startOfDay(new Date(`${from}T00:00:00`)).getTime()
    const rangeEnd   = addDays(startOfDay(new Date(`${to}T00:00:00`)), 1).getTime() - 1
    if (chartData.length === 0) return [rangeStart, rangeEnd]

    // ignora eventuali punti di padding esattamente sui bordi
    let firstIdx = 0
    while (firstIdx < chartData.length - 1 && chartData[firstIdx].ts === rangeStart) firstIdx++
    let lastIdx = chartData.length - 1
    while (lastIdx > 0 && chartData[lastIdx].ts === rangeEnd) lastIdx--

    if (firstIdx >= lastIdx) return [rangeStart, rangeEnd]

    const first = chartData[firstIdx].ts
    const last  = chartData[lastIdx].ts

    const fullSpan   = rangeEnd - rangeStart
    const signalSpan = Math.max(1, last - first)
    const WEEK = 7 * 24 * 3600 * 1000

    // padding minimo
    const pad = Math.max(WEEK, signalSpan * 0.15)
    let min = Math.max(rangeStart, first - pad)
    let max = Math.min(rangeEnd,   last  + pad)

    // se l'area di interesse è troppo piccola rispetto al range totale, allarga e centra
    if (signalSpan / fullSpan < 0.4) {
      const desired = Math.min(Math.max(signalSpan * 1.6, 60 * 24 * 3600 * 1000), fullSpan) // ≥60 giorni
      const mid = (first + last) / 2
      min = Math.max(rangeStart, mid - desired / 2)
      max = Math.min(rangeEnd,   mid + desired / 2)
    }

    // finestra minima di 1 settimana
    if (max - min < WEEK) {
      const mid = (min + max) / 2
      min = Math.max(rangeStart, mid - WEEK / 2)
      max = Math.min(rangeEnd,   mid + WEEK / 2)
    }

    return [min, max]
  }, [from, to, chartData])

  /* ────────────────────────────────────────
     📋  DERIVED — tabella dettaglio (diff/%)
     ──────────────────────────────────────── */
  const tableRowsDetail = useMemo(() => {
    return rowsDetail.map(r => {
      const diff = (r.new_cost ?? 0) - (r.old_cost ?? 0)
      const pct = r.old_cost && r.old_cost !== 0 ? (diff / r.old_cost) * 100 : null
      return { ...r, diff, pct }
    })
  }, [rowsDetail])

  /* ────────────────────────────────────────
     📋  DERIVED — LIST: ultimo cambio per equipment
     ──────────────────────────────────────── */
  type ListRow = {
    equipment_id: string
    name: string
    category_id: number | null
    supplier_id: string | null
    old_cost: number | null
    new_cost: number | null
    pct: number | null
    changed_at: string | null
  }

  const listRows: ListRow[] = useMemo(() => {
    if (!rowsAll.length) return []
    const byEq = new Map<string, EqHistoryRow[]>()
    for (const r of rowsAll) {
      if (!byEq.has(r.equipment_id)) byEq.set(r.equipment_id, [])
      byEq.get(r.equipment_id)!.push(r)
    }
    const out: ListRow[] = []
    for (const [eqId, arr] of byEq.entries()) {
      const last = arr[arr.length - 1]
      const e = equip.find(x => x.id === eqId)
      const diff = (last?.new_cost ?? 0) - (last?.old_cost ?? 0)
      const pct = last?.old_cost && last.old_cost !== 0 ? (diff / last.old_cost) * 100 : null
      out.push({
        equipment_id: eqId,
        name: e ? e.name : eqId,
        category_id: e ? e.category_id : null,
        supplier_id: e ? e.supplier_id : null,
        old_cost: last?.old_cost ?? null,
        new_cost: last?.new_cost ?? null,
        pct,
        changed_at: last?.changed_at ?? null,
      })
    }
    out.sort((a, b) => (Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0)))
    return out
  }, [rowsAll, equip])

  /* ────────────────────────────────────────
     🔎  FILTER & SORT — LIST
     ──────────────────────────────────────── */
  const filteredList = useMemo(() => {
    let rows = [...listRows]
    if (filterName.trim()) rows = rows.filter(r => r.name.toLowerCase().includes(filterName.trim().toLowerCase()))

    const col = listSortCol
    function trendCmp(a: ListRow, b: ListRow) {
      const ap = a.pct ?? 0
      const bp = b.pct ?? 0
      const as = ap > 0 ? 1 : ap < 0 ? -1 : 0
      const bs = bp > 0 ? 1 : bp < 0 ? -1 : 0
      let cmp = as - bs
      if (cmp === 0) cmp = Math.abs(bp) - Math.abs(ap)
      return listSortAsc ? cmp : -cmp
    }

    rows.sort((a, b) => {
      if (col === 'trend') return trendCmp(a, b)
      if (col === 'changed_at') {
        const ta = a.changed_at ? new Date(a.changed_at).getTime() : -Infinity
        const tb = b.changed_at ? new Date(b.changed_at).getTime() : -Infinity
        const cmpDate = ta - tb
        return listSortAsc ? cmpDate : -cmpDate
      }
      const av: any = (a as any)[col]
      const bv: any = (b as any)[col]
      const va = av == null ? '' : (typeof av === 'number' ? av : String(av))
      const vb = bv == null ? '' : (typeof bv === 'number' ? bv : String(bv))
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? (va as number) - (vb as number)
          : String(va).localeCompare(String(vb), undefined, { numeric: true })
      return listSortAsc ? cmp : -cmp
    })
    return rows
  }, [listRows, filterName, listSortCol, listSortAsc])

  /* ────────────────────────────────────────
     🔗  NAV — click lista → dettaglio
     ──────────────────────────────────────── */
  function gotoDetailFromList(equipmentId: string) {
    const e = equip.find(x => x.id === equipmentId)
    const today0 = startOfDay(new Date())
    const fallback = addDays(today0, -365)
    const fromDate = e?.created_at ? startOfDay(new Date(e.created_at)) : fallback
    setFrom(toYMDLocal(fromDate))
    setTo(toYMDLocal(today0))
    setSelEq(equipmentId)
    setView('detail')
  }

  /* ────────────────────────────────────────
     🧪  LOADING
     ──────────────────────────────────────── */
  if (loading) return <CircularLoader />

  return (
    <div className="max-w-5xl mx-auto p-4 text-gray-100" lang={language}>
      {/* Header */}
      <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-bold text-white sm:text-3xl tracking-tight leading-normal">
            {t('EquipmentCostHistory', language)}
          </h1>
          <p className="text-xs text-slate-400">
            {language === 'vi'
              ? 'Lịch sử biến động giá thuê và chi phí thiết bị'
              : 'Historical trend and changes of equipment rental costs'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-4 gap-6 items-center justify-between">
        <div className="flex gap-6">
          <button
            aria-pressed={view === 'detail'}
            className={`pb-2.5 text-sm font-semibold transition-all border-b-2 cursor-pointer ${
              view === 'detail'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => setView('detail')}
          >
            {t('Detail', language)}
          </button>
          <button
            aria-pressed={view === 'list'}
            className={`pb-2.5 text-sm font-semibold transition-all border-b-2 cursor-pointer ${
              view === 'list'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => setView('list')}
          >
            {t('List', language)}
          </button>
        </div>

        {view === 'list' && (
          <input
            type="text"
            placeholder={t('Search', language)}
            value={filterName}
            onChange={e => setFilterName(e.target.value)}
            className="mb-2 h-9 w-32 sm:w-48 md:w-60 lg:w-[260px] rounded-xl border border-white/20 bg-white/5 px-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
            aria-label={t('Search', language)}
          />
        )}
      </div>

      {/* Control Bar */}
      <div className="bg-white rounded-2xl shadow p-4 mb-6 text-gray-800">
        {view === 'detail' ? (
          <div className="flex flex-col md:flex-row md:flex-nowrap md:items-end md:gap-3 gap-2">
            {/* Equipment select */}
            <label className="flex flex-col gap-1 md:min-w-[230px] md:flex-[1.2]">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('Equipment', language)}</span>
              <select
                value={selEq}
                onChange={e => setSelEq(e.target.value)}
                className="h-10 w-full px-3 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-sm"
                aria-label={t('Equipment', language)}
              >
                {equip.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>

            {/* From */}
            <label className="flex flex-col gap-1 md:min-w-[150px] md:flex-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('From', language)}</span>
              <input
                type="date"
                lang={language}
                value={from}
                max={to}
                onChange={e => setFrom(e.target.value)}
                className="h-10 w-full px-3 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-sm"
                aria-label={t('From', language)}
              />
            </label>

            {/* To */}
            <label className="flex flex-col gap-1 md:min-w-[150px] md:flex-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('To', language)}</span>
              <input
                type="date"
                lang={language}
                value={to}
                min={from}
                onChange={e => setTo(e.target.value)}
                className="h-10 w-full px-3 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-sm"
                aria-label={t('To', language)}
              />
            </label>

            {/* Preset */}
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => { const now = startOfDay(new Date()); setTo(toYMDLocal(now)); setFrom(toYMDLocal(addDays(now, -182))) }}
                className="px-3 h-10 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition cursor-pointer"
              >
                {t('SixMonths', language)}
              </button>
              <button
                onClick={() => { const now = startOfDay(new Date()); setTo(toYMDLocal(now)); setFrom(toYMDLocal(addDays(now, -365))) }}
                className="px-3 h-10 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition cursor-pointer"
              >
                {t('TwelveMonths', language)}
              </button>
              <button
                onClick={() => { const now = startOfDay(new Date()); setTo(toYMDLocal(now)); setFrom(toYMDLocal(addDays(now, -547))) }}
                className="px-3 h-10 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition cursor-pointer"
              >
                {t('EighteenMonths', language)}
              </button>
            </div>
          </div>
        ) : (
          /* LIST controls */
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <label className="flex flex-col gap-1 md:flex-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('From', language)}</span>
              <input
                type="date"
                lang={language}
                value={from}
                max={to}
                onChange={e => setFrom(e.target.value)}
                className="h-10 w-full px-3 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-sm"
                aria-label={t('From', language)}
              />
            </label>
            <label className="flex flex-col gap-1 md:flex-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('To', language)}</span>
              <input
                type="date"
                lang={language}
                value={to}
                min={from}
                onChange={e => setTo(e.target.value)}
                className="h-10 w-full px-3 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-sm"
                aria-label={t('To', language)}
              />
            </label>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => { const n = startOfDay(new Date()); setTo(toYMDLocal(n)); setFrom(toYMDLocal(addDays(n, -182))) }} className="px-3 h-10 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition cursor-pointer">{t('SixMonths', language)}</button>
              <button onClick={() => { const n = startOfDay(new Date()); setTo(toYMDLocal(n)); setFrom(toYMDLocal(addDays(n, -365))) }} className="px-3 h-10 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition cursor-pointer">{t('TwelveMonths', language)}</button>
              <button onClick={() => { const n = startOfDay(new Date()); setTo(toYMDLocal(n)); setFrom(toYMDLocal(addDays(n, -547))) }} className="px-3 h-10 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition cursor-pointer">{t('EighteenMonths', language)}</button>
            </div>
          </div>
        )}
      </div>

      {view === 'detail' ? (
        <>
          {/* Chart */}
          <div className="bg-white rounded-2xl shadow p-4 mb-6 text-gray-900">
            <h2 className="text-base font-bold mb-3 text-gray-800">{t('TrendCost', language)}</h2>
            <div className="h-72">
              {loadingRows ? (
                <div className="h-full flex items-center justify-center"><CircularLoader /></div>
              ) : chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">{t('NoDataInSelectedRange', language)}</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="ts"
                      type="number"
                      scale="time"
                      allowDataOverflow
                      domain={xDomain}
                      tickFormatter={(ms: number) => fmtDMY(new Date(ms))}
                      minTickGap={24}
                      tickMargin={8}
                      style={{ fontSize: '11px', fill: '#6B7280' }}
                    />
                    <YAxis
                      width={54}
                      tickMargin={8}
                      allowDecimals
                      tickFormatter={(v: number) => Number(v).toLocaleString()}
                      style={{ fontSize: '11px', fill: '#6B7280' }}
                    />
                    <Tooltip
                      labelFormatter={(ms: any) => fmtDMY(new Date(Number(ms)))}
                      formatter={(v: any) => [Number(v).toLocaleString(), t('Cost', language)]}
                    />
                    <Line type="monotone" dataKey="cost" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Details Table */}
          <div className="bg-white rounded-2xl shadow p-4 text-gray-900">
            <h2 className="text-base font-bold mb-3 text-gray-800">{t('Changes', language)}</h2>
            <div className="overflow-x-auto">
              <table className="w-full table-auto text-sm text-gray-900">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                    <th className="px-3 py-2 text-left">{t('Date', language)}</th>
                    <th className="px-3 py-2 text-right">{t('OldCost', language)}</th>
                    <th className="px-3 py-2 text-right">{t('NewCost', language)}</th>
                    <th className="px-3 py-2 text-right">{t('Change', language)}</th>
                    <th className="px-3 py-2 text-right">{t('PctChange', language)}</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRows ? (
                    <tr><td colSpan={5} className="px-3 py-4"><CircularLoader /></td></tr>
                  ) : tableRowsDetail.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-500">{t('NoChanges', language)}</td></tr>
                  ) : (
                    tableRowsDetail.map((r, idx) => {
                      const up = (r as any).pct > 0
                      const down = (r as any).pct < 0
                      return (
                        <tr
                          key={r.id}
                          className={`border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer ${
                            idx % 2 === 0 ? 'bg-gray-50/30' : ''
                          }`}
                        >
                          <td className="px-3 py-2.5 text-xs text-gray-600 font-mono">{fmtDMY(r.changed_at)}</td>
                          <td className="px-3 py-2.5 text-xs text-right font-mono text-gray-900 whitespace-nowrap">
                            {r.old_cost != null ? Number(r.old_cost).toLocaleString() : '-'}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-right font-mono text-gray-900 whitespace-nowrap">
                            {r.new_cost != null ? Number(r.new_cost).toLocaleString() : '-'}
                          </td>
                          <td className={`px-3 py-2.5 text-xs text-right font-mono whitespace-nowrap font-semibold ${up ? 'text-red-600' : down ? 'text-green-600' : 'text-gray-500'}`}>
                            {(r.old_cost != null && r.new_cost != null)
                              ? `${((r as any).diff >= 0 ? '+' : '')}${Number((r as any).diff).toLocaleString()}`
                              : '-'}
                          </td>
                          <td className={`px-3 py-2.5 text-xs text-right font-mono whitespace-nowrap font-semibold ${up ? 'text-red-600' : down ? 'text-green-600' : 'text-gray-500'}`}>
                            {(r as any).pct == null
                              ? '-'
                              : `${(r as any).pct >= 0 ? '+' : ''}${(r as any).pct.toFixed(1)}%`}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* List view */
        <div className="bg-white rounded-2xl shadow p-4 text-gray-900">
          <h2 className="text-base font-bold mb-3 text-gray-800">{t('LastChangePerEquipment', language)}</h2>
          <div className="overflow-x-auto">
            <table className="w-full table-auto text-sm text-gray-900">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                  <th className="px-3 py-2 text-left">{t('Equipment', language)}</th>
                  <th className="px-3 py-2 text-left">{t('ChangedAt', language)}</th>
                  <th className="px-3 py-2 text-right">{t('OldCost', language)}</th>
                  <th className="px-3 py-2 text-right">{t('NewCost', language)}</th>
                  <th className="px-3 py-2 text-right">{t('PercentChange', language)}</th>
                  <th className="px-3 py-2 text-center">{t('Trend', language)}</th>
                </tr>
              </thead>
              <tbody>
                {loadingRows ? (
                  <tr><td colSpan={6} className="px-3 py-4"><CircularLoader /></td></tr>
                ) : filteredList.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-500">{t('NoChangesInRange', language)}</td></tr>
                ) : (
                  filteredList.map((r, idx) => {
                    const up = (r.pct ?? 0) > 0
                    const down = (r.pct ?? 0) < 0
                    return (
                      <tr
                        key={r.equipment_id}
                        className={`border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer ${
                          idx % 2 === 0 ? 'bg-gray-50/30' : ''
                        }`}
                        onClick={() => gotoDetailFromList(r.equipment_id)}
                        title={t('OpenDetail', language)}
                      >
                        <td className="px-3 py-2.5 text-xs text-gray-900 font-semibold truncate max-w-[22rem]">{r.name}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-600 font-mono">{r.changed_at ? fmtDMY(r.changed_at) : '-'}</td>
                        <td className="px-3 py-2.5 text-xs text-right font-mono text-gray-900 whitespace-nowrap">{r.old_cost != null ? Number(r.old_cost).toLocaleString() : '-'}</td>
                        <td className="px-3 py-2.5 text-xs text-right font-mono text-gray-900 whitespace-nowrap">{r.new_cost != null ? Number(r.new_cost).toLocaleString() : '-'}</td>
                        <td className={`px-3 py-2.5 text-xs text-right font-mono whitespace-nowrap font-semibold ${up ? 'text-red-600' : down ? 'text-green-600' : 'text-gray-500'}`}>{r.pct == null ? '-' : `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%`}</td>
                        <td className="px-3 py-2.5 text-center">
                          {up && <ChevronUpIcon className="w-4 h-4 text-red-600 inline-block" />}
                          {down && <ChevronDownIcon className="w-4 h-4 text-green-600 inline-block" />}
                          {!up && !down && <span className="text-gray-500 font-semibold">=</span>}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
