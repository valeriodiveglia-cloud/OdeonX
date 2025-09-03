'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts'
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'

type Cat = { id: number; name: string }
type Sup = { id: string; name: string }
type Uom = { id: number; name: string }

type Mat = {
  id: string
  name: string
  brand: string | null
  supplier_id: string | null
  category_id: number | null
  uom_id: number | null
  packaging_size: number | null
  package_price: number | null
  unit_cost: number | null
  created_at?: string | null
}

type HistoryRow = {
  id: string
  material_id: string
  changed_at: string
  old_package_price: number | null
  new_package_price: number | null
  old_packaging_size: number | null
  new_packaging_size: number | null
  old_unit_cost: number | null
  new_unit_cost: number | null
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
function unitFrom(packPrice: number | null | undefined, packSize: number | null | undefined) {
  const p = packPrice ?? null
  const s = packSize ?? null
  if (p == null || s == null || s === 0) return null
  return Number(p) / Number(s)
}

type ViewMode = 'detail' | 'list'

export default function MaterialsHistoryPage() {
  const { language: lang } = useSettings()

  const [loading, setLoading] = useState(true)
  const [cats, setCats] = useState<Cat[]>([])
  const [sups, setSups] = useState<Sup[]>([])
  const [uoms, setUoms] = useState<Uom[]>([])
  const [mats, setMats] = useState<Mat[]>([])
  const [selMat, setSelMat] = useState<string>('')

  const today = useMemo(() => startOfDay(new Date()), [])
  const [from, setFrom] = useState<string>(() => toYMDLocal(addDays(today, -365)))
  const [to, setTo] = useState<string>(() => toYMDLocal(today))

  const [view, setView] = useState<ViewMode>('detail')

  const [rowsAll, setRowsAll] = useState<HistoryRow[]>([])
  const [loadingRows, setLoadingRows] = useState(false)

  const [filterName, setFilterName] = useState('')
  type ListSortCol = 'name' | 'changed_at' | 'old_unit_cost' | 'new_unit_cost' | 'pct' | 'trend'
  const [listSortCol, setListSortCol] = useState<ListSortCol>('name')
  const [listSortAsc, setListSortAsc] = useState(true)
  function toggleListSort(col: ListSortCol) {
    if (listSortCol === col) setListSortAsc(s => !s)
    else { setListSortCol(col); setListSortAsc(true) }
  }

  async function fetchLookups() {
    setLoading(true)
    const [cRes, sRes, uRes, mRes] = await Promise.all([
      supabase.from('categories').select('*').order('name', { ascending: true }),
      supabase.from('suppliers').select('*').order('name', { ascending: true }),
      supabase.from('uom').select('*').order('name', { ascending: true }),
      supabase.from('materials')
        .select('id,name,brand,supplier_id,category_id,uom_id,packaging_size,package_price,unit_cost,created_at')
        .order('name', { ascending: true }),
    ])

    if (cRes.data) setCats(cRes.data)
    if (sRes.data) setSups(sRes.data)
    if (uRes.data) setUoms(uRes.data)
    if (mRes.data) setMats(mRes.data)

    if (!selMat && mRes.data && mRes.data.length) setSelMat(mRes.data[0].id)
    setLoading(false)
  }

  async function fetchHistoryAll() {
    setLoadingRows(true)

    // Guard: se una delle date è vuota, non fare query e svuota la lista
    if (!from || !to) {
      setRowsAll([])
      setLoadingRows(false)
      return
    }

    const fromIso = `${from}T00:00:00.000Z`
    const toStart = new Date(`${to}T00:00:00.000Z`)
    toStart.setUTCDate(toStart.getUTCDate() + 1)
    const toIsoExclusive = toStart.toISOString()

    const { data, error } = await supabase
      .from('material_price_history')
      .select('*')
      .gte('changed_at', fromIso)
      .lt('changed_at', toIsoExclusive)
      .order('material_id', { ascending: true })
      .order('changed_at', { ascending: true })

    if (error) {
      alert('Error loading history: ' + error.message)
      setRowsAll([])
    } else {
      setRowsAll(data || [])
    }
    setLoadingRows(false)
  }

  useEffect(() => { fetchLookups() }, [])
  useEffect(() => { fetchHistoryAll() }, [from, to])

  const currentMaterial = useMemo(() => mats.find(m => m.id === selMat) || null, [mats, selMat])
  const rowsDetail = useMemo(() => rowsAll.filter(r => r.material_id === selMat), [rowsAll, selMat])

  const chartData = useMemo(() => {
    const list = rowsDetail.map(r => {
      const newUnit = r.new_unit_cost ?? unitFrom(r.new_package_price, r.new_packaging_size)
      const oldUnit = r.old_unit_cost ?? unitFrom(r.old_package_price, r.old_packaging_size)
      const unit = newUnit ?? oldUnit ?? null
      return { date: new Date(r.changed_at), unit_cost: unit }
    }).filter(p => p.unit_cost != null)

    if (currentMaterial && currentMaterial.unit_cost != null) {
      list.push({ date: startOfDay(new Date()), unit_cost: currentMaterial.unit_cost })
    }

    const key = (d: Date) => d.toISOString().slice(0,10)
    const seen = new Set<string>()
    const uniq: Array<{date: Date; unit_cost: number}> = []
    for (const p of list.sort((a,b) => a.date.getTime() - b.date.getTime())) {
      const k = key(p.date)
      if (!seen.has(k)) { uniq.push(p as any); seen.add(k) }
    }
    return uniq
  }, [rowsDetail, currentMaterial])

  const tableRowsDetail = useMemo(() => {
    return rowsDetail.map(r => {
      const diffUnit = (r.new_unit_cost ?? 0) - (r.old_unit_cost ?? 0)
      const pct = r.old_unit_cost && r.old_unit_cost !== 0
        ? (diffUnit / r.old_unit_cost) * 100
        : null
      return { ...r, diffUnit, pct }
    })
  }, [rowsDetail])

  type ListRow = {
    material_id: string
    name: string
    brand: string | null
    category_id: number | null
    supplier_id: string | null
    uom_id: number | null
    old_unit_cost: number | null
    new_unit_cost: number | null
    pct: number | null
    changed_at: string | null
  }

  const listRows: ListRow[] = useMemo(() => {
    if (!rowsAll.length) return []
    const byMat = new Map<string, HistoryRow[]>()
    for (const r of rowsAll) {
      if (!byMat.has(r.material_id)) byMat.set(r.material_id, [])
      byMat.get(r.material_id)!.push(r)
    }
    const out: ListRow[] = []
    for (const [matId, arr] of byMat.entries()) {
      const last = arr[arr.length - 1]
      const m = mats.find(x => x.id === matId)
      const diffUnit = (last?.new_unit_cost ?? 0) - (last?.old_unit_cost ?? 0)
      const pct = last?.old_unit_cost && last.old_unit_cost !== 0
        ? (diffUnit / last.old_unit_cost) * 100
        : null
      out.push({
        material_id: matId,
        name: m ? m.name : matId,
        brand: m ? m.brand : null,
        category_id: m ? m.category_id : null,
        supplier_id: m ? m.supplier_id : null,
        uom_id: m ? m.uom_id : null,
        old_unit_cost: last?.old_unit_cost ?? null,
        new_unit_cost: last?.new_unit_cost ?? null,
        pct,
        changed_at: last?.changed_at ?? null,
      })
    }
    out.sort((a, b) => (Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0)))
    return out
  }, [rowsAll, mats])

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
      if (cmp === 0) {
        cmp = Math.abs(bp) - Math.abs(ap)
      }
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

  function gotoDetailFromList(materialId: string) {
    const m = mats.find(x => x.id === materialId)
    const today0 = startOfDay(new Date())
    const fallback = addDays(today0, -365)
    const fromDate = m?.created_at ? startOfDay(new Date(m.created_at)) : fallback
    setFrom(toYMDLocal(fromDate))
    setTo(toYMDLocal(today0))
    setSelMat(materialId)
    setView('detail')
  }

  if (loading) return <CircularLoader />

  return (
    <div key={lang} lang={lang} className="max-w-5xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">{t('MaterialsHistory', lang)}</h1>

      {/* Toggle vista + search */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-2xl overflow-hidden border shrink-0">
          <button
            onClick={() => setView('detail')}
            className={`px-4 py-2 font-semibold ${view === 'detail' ? 'bg-blue-700 text-white' : 'bg-white text-blue-700'}`}
          >
            {t('DetailTab', lang)}
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-4 py-2 font-semibold ${view === 'list' ? 'bg-blue-700 text-white' : 'bg-white text-blue-700'}`}
          >
            {t('ListTab', lang)}
          </button>
        </div>

        {view === 'list' && (
          <input
            type="text"
            placeholder={t('Search', lang)}
            value={filterName}
            onChange={e => setFilterName(e.target.value)}
            className="h-10 w-32 sm:w-48 md:w-60 lg:w-[260px] rounded-xl border border-blue-500 bg-transparent px-3 text-sm text-blue-700 placeholder-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
          />
        )}
      </div>

      {/* Barra controlli */}
      <div className="bg-white rounded-2xl shadow p-3 mb-6">
        {view === 'detail' ? (
          <div className="flex flex-col md:flex-row md:flex-nowrap md:items-end md:gap-3">
            <label className="flex flex-col gap-1 md:min-w-[230px] md:flex-[1.2]">
              <span className="text-sm text-gray-700">{t('MaterialLabel', lang)}</span>
              <select
                value={selMat}
                onChange={e => setSelMat(e.target.value)}
                className="h-10 w-full p-2 border rounded-xl text-gray-900"
              >
                {mats.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.brand ? ` · ${m.brand}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 md:min-w-[150px] md:flex-1">
              <span className="text-sm text-gray-700">{t('DateFrom', lang)}</span>
              <input
                type="date"
                lang={lang}
                value={from}
                max={to}
                onChange={e => setFrom(e.target.value)}
                className="h-10 w-full p-2 border rounded-xl text-gray-900"
              />
            </label>

            <label className="flex flex-col gap-1 md:min-w-[150px] md:flex-1">
              <span className="text-sm text-gray-700">{t('DateTo', lang)}</span>
              <input
                type="date"
                lang={lang}
                value={to}
                min={from}
                onChange={e => setTo(e.target.value)}
                className="h-10 w-full p-2 border rounded-xl text-gray-900"
              />
            </label>

            <div className="mt-2 md:mt-0 md:ml-auto flex gap-2">
              <button
                onClick={() => {
                  const now = startOfDay(new Date())
                  setTo(toYMDLocal(now))
                  setFrom(toYMDLocal(addDays(now, -182)))
                }}
                className="px-3 py-3 rounded-xl text-sm font-medium border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition"
                title={t('Last6Months', lang)}
              >
                {t('Last6Months', lang)}
              </button>

              <button
                onClick={() => {
                  const now = startOfDay(new Date())
                  setTo(toYMDLocal(now))
                  setFrom(toYMDLocal(addDays(now, -365)))
                }}
                className="px-3 py-3 rounded-xl text-sm font-medium border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition"
                title={t('Last12Months', lang)}
              >
                {t('Last12Months', lang)}
              </button>

              <button
                onClick={() => {
                  const now = startOfDay(new Date())
                  setTo(toYMDLocal(now))
                  setFrom(toYMDLocal(addDays(now, -547)))
                }}
                className="px-3 py-3 rounded-xl text-sm font-medium border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition"
                title={t('Last18Months', lang)}
              >
                {t('Last18Months', lang)}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-700">{t('DateFrom', lang)}</span>
              <input
                type="date"
                lang={lang}
                value={from}
                max={to}
                onChange={e => setFrom(e.target.value)}
                className="p-2 border rounded-xl text-gray-900"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-700">{t('DateTo', lang)}</span>
              <input
                type="date"
                lang={lang}
                value={to}
                min={from}
                onChange={e => setTo(e.target.value)}
                className="p-2 border rounded-xl text-gray-900"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const now = startOfDay(new Date())
                  setTo(toYMDLocal(now))
                  setFrom(toYMDLocal(addDays(now, -182)))
                }}
                className="px-3 py-3 rounded-xl text-sm font-medium border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition"
                title={t('Last6Months', lang)}
              >
                {t('Last6Months', lang)}
              </button>
              <button
                onClick={() => {
                  const now = startOfDay(new Date())
                  setTo(toYMDLocal(now))
                  setFrom(toYMDLocal(addDays(now, -365)))
                }}
                className="px-3 py-3 rounded-xl text-sm font-medium border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition"
                title={t('Last12Months', lang)}
              >
                {t('Last12Months', lang)}
              </button>
              <button
                onClick={() => {
                  const now = startOfDay(new Date())
                  setTo(toYMDLocal(now))
                  setFrom(toYMDLocal(addDays(now, -547)))
                }}
                className="px-3 py-3 rounded-xl text-sm font-medium border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition"
                title={t('Last18Months', lang)}
              >
                {t('Last18Months', lang)}
              </button>
            </div>
          </div>
        )}
      </div>

      {view === 'detail' ? (
        <>
          {/* Grafico */}
          <div className="bg-white rounded-2xl shadow p-3 mb-6">
            <h2 className="text-xl font-bold mb-3 text-blue-800">{t('TrendUnitCost', lang)}</h2>
            <div className="h-72">
              {loadingRows ? (
                <div className="h-full flex items-center justify-center"><CircularLoader /></div>
              ) : chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-600">{t('NoDataInRange', lang)}</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v: Date) => fmtDMY(v)}
                      type="number"
                      domain={['auto', 'auto']}
                      scale="time"
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(l: any) => fmtDMY(new Date(l))}
                      formatter={(v: any) => [Number(v).toLocaleString(), t('UnitCost', lang)]}
                    />
                    <Line type="monotone" dataKey="unit_cost" dot />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Tabella storico dettaglio */}
          <div className="bg-white rounded-2xl shadow p-3">
            <h2 className="text-xl font-bold mb-3 text-blue-800">{t('Changes', lang)}</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed text-sm text-gray-900">
                <thead>
                  <tr className="bg-blue-50 text-gray-800">
                    <th className="p-2 text-left">{t('Date', lang)}</th>
                    <th className="p-2 text-right">{t('OldPackPrice', lang)}</th>
                    <th className="p-2 text-right">{t('NewPackPrice', lang)}</th>
                    <th className="p-2 text-right">{t('OldPackSize', lang)}</th>
                    <th className="p-2 text-right">{t('NewPackSize', lang)}</th>
                    <th className="p-2 text-right">{t('OldUnit', lang)}</th>
                    <th className="p-2 text-right">{t('NewUnit', lang)}</th>
                    <th className="p-2 text-right">{t('DeltaUnit', lang)}</th>
                    <th className="p-2 text-right">{t('PctUnit', lang)}</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRows ? (
                    <tr><td colSpan={9} className="p-4"><CircularLoader /></td></tr>
                  ) : tableRowsDetail.length === 0 ? (
                    <tr><td colSpan={9} className="p-4 text-center text-gray-600">{t('NoChanges', lang)}</td></tr>
                  ) : (
                    tableRowsDetail.map(r => (
                      <tr key={r.id} className="border-t hover:bg-blue-50/40">
                        <td className="p-2">{fmtDMY(r.changed_at)}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{r.old_package_price != null ? Number(r.old_package_price).toLocaleString() : '-'}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{r.new_package_price != null ? Number(r.new_package_price).toLocaleString() : '-'}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{r.old_packaging_size != null ? Number(r.old_packaging_size).toLocaleString() : '-'}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{r.new_packaging_size != null ? Number(r.new_packaging_size).toLocaleString() : '-'}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{r.old_unit_cost != null ? Number(r.old_unit_cost).toLocaleString() : '-'}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{r.new_unit_cost != null ? Number(r.new_unit_cost).toLocaleString() : '-'}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{Number((r as any).diffUnit ?? 0).toLocaleString()}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">
                          {(r as any).pct == null ? '-' : `${(r as any).pct >= 0 ? '+' : ''}${(r as any).pct.toFixed(1)}%`}
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
        /* ===================== LIST VIEW ===================== */
        <div className="bg-white rounded-2xl shadow p-3">
          <h2 className="text-xl font-bold mb-3 text-blue-800">{t('LastChangePerMaterial', lang)}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed text-sm text-gray-900">
              <colgroup>
                <col className="w-[22rem]" />
                <col className="w-[10rem]" />
                <col className="w-[9rem]" />
                <col className="w-[9rem]" />
                <col className="w-[9rem]" />
                <col className="w-[7rem]" />
              </colgroup>
              <thead>
                <tr className="bg-blue-50 text-gray-800">
                  <th className="p-2">
                    <button type="button" onClick={() => toggleListSort('name')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-start font-semibold">
                        <span>{t('MaterialLabel', lang)}</span>
                        <SortIcon active={listSortCol==='name'} asc={listSortAsc} />
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleListSort('changed_at')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-start font-semibold">
                        <span>{t('ChangedAt', lang)}</span>
                        <SortIcon active={listSortCol==='changed_at'} asc={listSortAsc} />
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleListSort('old_unit_cost')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={listSortCol==='old_unit_cost'} asc={listSortAsc} />
                        <span>{t('OldUnit', lang)}</span>
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleListSort('new_unit_cost')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={listSortCol==='new_unit_cost'} asc={listSortAsc} />
                        <span>{t('NewUnit', lang)}</span>
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleListSort('pct')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-end font-semibold">
                        <SortIcon active={listSortCol==='pct'} asc={listSortAsc} />
                        <span>{t('PctChange', lang)}</span>
                      </div>
                    </button>
                  </th>
                  <th className="p-2">
                    <button type="button" onClick={() => toggleListSort('trend')} className="w-full cursor-pointer">
                      <div className="flex items-center gap-1 justify-center font-semibold">
                        <span>{t('Trend', lang)}</span>
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
                  <tr><td colSpan={6} className="p-4 text-center text-gray-600">{t('NoChangesInRange', lang)}</td></tr>
                ) : (
                  filteredList.map(r => {
                    const up = (r.pct ?? 0) > 0
                    const down = (r.pct ?? 0) < 0
                    return (
                      <tr
                        key={r.material_id}
                        className="border-t hover:bg-blue-50/40 cursor-pointer"
                        onClick={() => gotoDetailFromList(r.material_id)}
                        title={t('OpenDetail', lang)}
                      >
                        <td className="p-2">
                          {r.name}{r.brand ? ` · ${r.brand}` : ''}
                        </td>
                        <td className="p-2">{r.changed_at ? fmtDMY(r.changed_at) : '-'}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{r.old_unit_cost != null ? Number(r.old_unit_cost).toLocaleString() : '-'}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{r.new_unit_cost != null ? Number(r.new_unit_cost).toLocaleString() : '-'}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">
                          {r.pct == null ? '-' : `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%`}
                        </td>
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
