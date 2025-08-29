// src/app/(app)/equipment-history/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CircularLoader from '@/components/CircularLoader'
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts'

// i18n + settings
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'

/* ---------- Lookup types ---------- */
type Cat = { id: number; name: string }
type Sup = { id: string; name: string }

/* ---------- Equipment & History ---------- */
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

/* ---------- Small UI helpers ---------- */
function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return <span className="inline-block w-4" />
  return asc ? (
    <ChevronUpIcon className="w-4 h-4 inline-block text-gray-700" />
  ) : (
    <ChevronDownIcon className="w-4 h-4 inline-block text-gray-700" />
  )
}

/* utils */
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x }
function addDays(d: Date, days: number) { const x = new Date(d); x.setDate(x.getDate() + days); return x }
function fmtDMY(d: Date | string) {
  const x = typeof d === 'string' ? new Date(d) : d
  const dd = String(x.getDate()).padStart(2, '0')
  const mm = String(x.getMonth()+1).padStart(2, '0')
  const yy = x.getFullYear()
  return `${dd}/${mm}/${yy}`
}
function toYMDLocal(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
}

type ViewMode = 'detail' | 'list'

/* =====================================================
   Page
===================================================== */
export default function EquipmentHistoryPage() {
  const { language } = useSettings()

  const [loading, setLoading] = useState(true)
  const [cats, setCats] = useState<Cat[]>([])
  const [sups, setSups] = useState<Sup[]>([])
  const [equip, setEquip] = useState<Equip[]>([])
  const [selEq, setSelEq] = useState<string>('')

  const today = useMemo(() => startOfDay(new Date()), [])
  const [from, setFrom] = useState<string>(() => toYMDLocal(addDays(today, -365)))
  const [to, setTo] = useState<string>(() => toYMDLocal(today))

  const [view, setView] = useState<ViewMode>('detail')

  // storico caricato per TUTTI gli equipment nel range
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

  /* ---------- Load data ---------- */
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

  async function fetchHistoryAll() {
    setLoadingRows(true)

    // ✅ Guard: se una delle date è vuota (Clear), non fare query
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

  useEffect(() => { fetchLookups() }, [])
  useEffect(() => { fetchHistoryAll() }, [from, to])

  const currentEquipment = useMemo(() => equip.find(e => e.id === selEq) || null, [equip, selEq])

  // dettaglio: storico dell’equipment selezionato
  const rowsDetail = useMemo(() => rowsAll.filter(r => r.equipment_id === selEq), [rowsAll, selEq])

  // grafico: tracciamo il COST nel tempo (final_price è cost*1.5)
  const chartData = useMemo(() => {
    const pts = rowsDetail.map(r => ({
      date: new Date(r.changed_at),
      cost: r.new_cost ?? r.old_cost ?? null,
    })).filter(p => p.cost != null)

    if (currentEquipment && currentEquipment.cost != null) {
      pts.push({ date: startOfDay(new Date()), cost: currentEquipment.cost })
    }

    // de-dup per giorno
    const key = (d: Date) => d.toISOString().slice(0,10)
    const seen = new Set<string>()
    const uniq: Array<{date: Date; cost: number}> = []
    for (const p of pts.sort((a,b) => a.date.getTime() - b.date.getTime())) {
      const k = key(p.date)
      if (!seen.has(k)) { uniq.push(p as any); seen.add(k) }
    }
    return uniq
  }, [rowsDetail, currentEquipment])

  // tabella del dettaglio con diff e %
  const tableRowsDetail = useMemo(() => {
    return rowsDetail.map(r => {
      const diff = (r.new_cost ?? 0) - (r.old_cost ?? 0)
      const pct = r.old_cost && r.old_cost !== 0 ? (diff / r.old_cost) * 100 : null
      return { ...r, diff, pct }
    })
  }, [rowsDetail])

  // lista globale: ultimo cambio per equipment nel range
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

  // filtro e sorting lista
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

  // click riga lista -> dettaglio
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

  if (loading) return <CircularLoader />

  return (
    <div className="max-w-5xl mx-auto p-4" lang={language}>
      <h1 className="text-3xl font-bold mb-4">{t('EquipmentCostHistory', language)}</h1>

      {/* Toggle vista + search */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-2xl overflow-hidden border shrink-0">
          <button
            onClick={() => setView('detail')}
            className={`px-4 py-2 font-semibold ${view === 'detail' ? 'bg-blue-700 text-white' : 'bg-white text-blue-700'}`}
          >
            {t('Detail', language)}
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-4 py-2 font-semibold ${view === 'list' ? 'bg-blue-700 text-white' : 'bg-white text-blue-700'}`}
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
            className="h-10 w-32 sm:w-48 md:w-60 lg:w-[260px] rounded-xl border border-blue-500 bg-transparent px-3 text-sm text-blue-700 placeholder-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            aria-label={t('Search', language)}
          />
        )}
      </div>

      {/* Controls bar */}
      <div className="bg-white rounded-2xl shadow p-3 mb-6">
        {view === 'detail' ? (
          <div className="flex flex-col md:flex-row md:flex-nowrap md:items-end md:gap-3">
            <label className="flex flex-col gap-1 md:min-w-[230px] md:flex-[1.2]">
              <span className="text-sm text-gray-700">{t('Equipment', language)}</span>
              <select
                value={selEq}
                onChange={e => setSelEq(e.target.value)}
                className="h-10 w-full p-2 border rounded-xl text-gray-900"
                aria-label={t('Equipment', language)}
              >
                {equip.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 md:min-w-[150px] md:flex-1">
              <span className="text-sm text-gray-700">{t('From', language)}</span>
              <input
                type="date"
                lang={language}
                value={from}
                max={to}
                onChange={e => setFrom(e.target.value)}
                className="h-10 w-full p-2 border rounded-xl text-gray-900"
                aria-label={t('From', language)}
              />
            </label>

            <label className="flex flex-col gap-1 md:min-w-[150px] md:flex-1">
              <span className="text-sm text-gray-700">{t('To', language)}</span>
              <input
                type="date"
                lang={language}
                value={to}
                min={from}
                onChange={e => setTo(e.target.value)}
                className="h-10 w-full p-2 border rounded-xl text-gray-900"
                aria-label={t('To', language)}
              />
            </label>

            <div className="mt-2 md:mt-0 md:ml-auto flex gap-2">
              <button
                onClick={() => { const now = startOfDay(new Date()); setTo(toYMDLocal(now)); setFrom(toYMDLocal(addDays(now, -182))) }}
                className="px-3 py-3 rounded-xl text-sm font-medium border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition"
              >
                {t('SixMonths', language)}
              </button>
              <button
                onClick={() => { const now = startOfDay(new Date()); setTo(toYMDLocal(now)); setFrom(toYMDLocal(addDays(now, -365))) }}
                className="px-3 py-3 rounded-xl text-sm font-medium border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition"
              >
                {t('TwelveMonths', language)}
              </button>
              <button
                onClick={() => { const now = startOfDay(new Date()); setTo(toYMDLocal(now)); setFrom(toYMDLocal(addDays(now, -547))) }}
                className="px-3 py-3 rounded-xl text-sm font-medium border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition"
              >
                {t('EighteenMonths', language)}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-700">{t('From', language)}</span>
              <input
                type="date"
                lang={language}
                value={from}
                max={to}
                onChange={e => setFrom(e.target.value)}
                className="p-2 border rounded-xl text-gray-900"
                aria-label={t('From', language)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-700">{t('To', language)}</span>
              <input
                type="date"
                lang={language}
                value={to}
                min={from}
                onChange={e => setTo(e.target.value)}
                className="p-2 border rounded-xl text-gray-900"
                aria-label={t('To', language)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { const n = startOfDay(new Date()); setTo(toYMDLocal(n)); setFrom(toYMDLocal(addDays(n,-182))) }} className="px-3 py-3 rounded-xl text-sm font-medium border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition">{t('SixMonths', language)}</button>
              <button onClick={() => { const n = startOfDay(new Date()); setTo(toYMDLocal(n)); setFrom(toYMDLocal(addDays(n,-365))) }} className="px-3 py-3 rounded-xl text-sm font-medium border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition">{t('TwelveMonths', language)}</button>
              <button onClick={() => { const n = startOfDay(new Date()); setTo(toYMDLocal(n)); setFrom(toYMDLocal(addDays(n,-547))) }} className="px-3 py-3 rounded-xl text-sm font-medium border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition">{t('EighteenMonths', language)}</button>
            </div>
          </div>
        )}
      </div>

      {view === 'detail' ? (
        <>
          {/* Grafico COST */}
          <div className="bg-white rounded-2xl shadow p-3 mb-6">
            <h2 className="text-xl font-bold mb-3 text-blue-800">{t('TrendCost', language)}</h2>
            <div className="h-72">
              {loadingRows ? (
                <div className="h-full flex items-center justify-center"><CircularLoader /></div>
              ) : chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-600">{t('NoDataInSelectedRange', language)}</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(v: Date) => fmtDMY(v)} type="number" domain={['auto','auto']} scale="time" />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(l: any) => fmtDMY(new Date(l))}
                      formatter={(v: any) => [Number(v).toLocaleString(), t('Cost', language)]}
                    />
                    <Line type="monotone" dataKey="cost" dot />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Tabella storico dettaglio */}
          <div className="bg-white rounded-2xl shadow p-3">
            <h2 className="text-xl font-bold mb-3 text-blue-800">{t('Changes', language)}</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed text-sm text-gray-900">
                <thead>
                  <tr className="bg-blue-50 text-gray-800">
                    <th className="p-2 text-left">{t('Date', language)}</th>
                    <th className="p-2 text-right">{t('OldCost', language)}</th>
                    <th className="p-2 text-right">{t('NewCost', language)}</th>
                    <th className="p-2 text-right">{t('Change', language)}</th>
                    <th className="p-2 text-right">{t('PctChange', language)}</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRows ? (
                    <tr><td colSpan={5} className="p-4"><CircularLoader /></td></tr>
                  ) : tableRowsDetail.length === 0 ? (
                    <tr><td colSpan={5} className="p-4 text-center text-gray-600">{t('NoChanges', language)}</td></tr>
                  ) : (
                    tableRowsDetail.map(r => (
                      <tr key={r.id} className="border-t hover:bg-blue-50/40">
                        <td className="p-2">{fmtDMY(r.changed_at)}</td>

                        <td className="p-2 text-right tabular-nums whitespace-nowrap">
                          {r.old_cost != null ? Number(r.old_cost).toLocaleString() : '-'}
                        </td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">
                          {r.new_cost != null ? Number(r.new_cost).toLocaleString() : '-'}
                        </td>

                        <td className="p-2 text-right tabular-nums whitespace-nowrap">
                          {(r.old_cost != null && r.new_cost != null)
                            ? `${((r as any).diff >= 0 ? '+' : '')}${Number((r as any).diff).toLocaleString()}`
                            : '-'}
                        </td>

                        <td className="p-2 text-right tabular-nums whitespace-nowrap">
                          {(r as any).pct == null
                            ? '-'
                            : `${(r as any).pct >= 0 ? '+' : ''}${(r as any).pct.toFixed(1)}%`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* ===== LIST VIEW ===== */
        <div className="bg-white rounded-2xl shadow p-3">
          <h2 className="text-xl font-bold mb-3 text-blue-800">{t('LastChangePerEquipment', language)}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed text-sm text-gray-900">
              <colgroup>
                {[<col key="l-name" className="w-[22rem]" />,
                  <col key="l-date" className="w-[10rem]" />,
                  <col key="l-old" className="w-[9rem]" />,
                  <col key="l-new" className="w-[9rem]" />,
                  <col key="l-pct" className="w-[9rem]" />,
                  <col key="l-trend" className="w-[7rem]" />]}
              </colgroup>
              <thead>
                <tr className="bg-blue-50 text-gray-800">
                  <th className="p-2">
                    <button type="button" onClick={() => toggleListSort('name')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-start font-semibold">
                        <span>{t('Equipment', language)}</span>
                        <SortIcon active={listSortCol==='name'} asc={listSortAsc} />
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleListSort('changed_at')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-start font-semibold">
                        <span>{t('ChangedAt', language)}</span>
                        <SortIcon active={listSortCol==='changed_at'} asc={listSortAsc} />
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleListSort('old_cost')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={listSortCol==='old_cost'} asc={listSortAsc} />
                        <span>{t('OldCost', language)}</span>
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleListSort('new_cost')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={listSortCol==='new_cost'} asc={listSortAsc} />
                        <span>{t('NewCost', language)}</span>
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleListSort('pct')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={listSortCol==='pct'} asc={listSortAsc} />
                        <span>{t('PercentChange', language)}</span>
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleListSort('trend')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-center font-semibold">
                        <span>{t('Trend', language)}</span>
                        <SortIcon active={listSortCol==='trend'} asc={listSortAsc} />
                      </div>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadingRows ? (
                  <tr><td colSpan={6} className="p-4"><CircularLoader /></td></tr>
                ) : filteredList.length === 0 ? (
                  <tr><td colSpan={6} className="p-4 text-center text-gray-600">{t('NoChangesInRange', language)}</td></tr>
                ) : (
                  filteredList.map(r => {
                    const up = (r.pct ?? 0) > 0
                    const down = (r.pct ?? 0) < 0
                    return (
                      <tr
                        key={r.equipment_id}
                        className="border-t hover:bg-blue-50/40 cursor-pointer"
                        onClick={() => gotoDetailFromList(r.equipment_id)}
                        title={t('OpenDetail', language)}
                      >
                        <td className="p-2">{r.name}</td>
                        <td className="p-2">{r.changed_at ? fmtDMY(r.changed_at) : '-'}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{r.old_cost != null ? Number(r.old_cost).toLocaleString() : '-'}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{r.new_cost != null ? Number(r.new_cost).toLocaleString() : '-'}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{r.pct == null ? '-' : `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%`}</td>
                        <td className="p-2 text-center">
                          {up && <ChevronUpIcon className="w-5 h-5 text-red-600 inline-block" />}
                          {down && <ChevronDownIcon className="w-5 h-5 text-green-600 inline-block" />}
                          {!up && !down && <span className="text-gray-500">=</span>}
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
