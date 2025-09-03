'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
import {
  ArrowUturnLeftIcon,
  TrashIcon,
  EllipsisVerticalIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'

/* ---------- Tables ---------- */
const TBL_FINAL = 'final_recipes'
const TBL_PREP  = 'prep_recipes'
const TBL_DISH_CATS = 'dish_categories'
const TBL_RECIPE_CATS = 'recipe_categories'

type Cat = { id: number; name: string }
type DishRow = {
  id: string
  name: string
  category_id: number | null
  type: 'food' | 'beverage' | null
  price_vnd: number | null
  last_update: string | null
  archived_at: string | null
  deleted_at: string | null
}
type PrepRow = {
  id: string
  name: string
  category_id: number | null
  type: 'food' | 'beverage' | null
  yield_qty: number | null
  cost_per_unit_vnd: number | null
  last_update: string | null
  archived_at: string | null
  deleted_at: string | null
}

function fmtDate(s?: string | null) {
  if (!s) return ''
  const d = new Date(s); if (isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}
function typeLabel(v?: 'food'|'beverage'|null, lang?: any) {
  if (!v) return ''
  return v === 'beverage' ? t('Drink', lang) : t('Food', lang)
}

export default function ArchivePage() {
  const { language: lang, currency } = useSettings()

  const [tab, setTab] = useState<'Dish'|'Prep'>('Dish')
  const [dishCats, setDishCats] = useState<Cat[]>([])
  const [prepCats, setPrepCats] = useState<Cat[]>([])

  const [dishes, setDishes] = useState<DishRow[]>([])
  const [preps, setPreps]   = useState<PrepRow[]>([])
  const [loading, setLoading] = useState(true)

  // filtri
  const [qName, setQName] = useState('')
  const [qCat,  setQCat]  = useState<string|number|''>('')
  const [qType, setQType] = useState<''|'food'|'beverage'>('')

  // selezione multipla
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const headerCbRef = useRef<HTMLInputElement>(null)

  // kebab state + refs per chiusura esterna
  const [menuOpen, setMenuOpen] = useState(false)
  const kebabWrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const [dishCat, prepCat] = await Promise.all([
        supabase.from(TBL_DISH_CATS).select('id,name').order('name'),
        supabase.from(TBL_RECIPE_CATS).select('id,name').order('name'),
      ])
      if (dishCat.data) setDishCats(dishCat.data as Cat[])
      if (prepCat.data) setPrepCats(prepCat.data as Cat[])

      const [fin, prep] = await Promise.all([
        supabase
          .from(TBL_FINAL)
          .select('id,name,category_id,type,price_vnd,last_update,archived_at,deleted_at')
          .not('archived_at','is',null).is('deleted_at','null')
          .order('archived_at',{ ascending: false }),
        supabase
          .from(TBL_PREP)
          .select('id,name,category_id,type,yield_qty,cost_per_unit_vnd,last_update,archived_at,deleted_at')
          .not('archived_at','is',null).is('deleted_at','null')
          .order('archived_at',{ ascending: false }),
      ])
      setDishes((fin.data as DishRow[]) || [])
      setPreps((prep.data as PrepRow[]) || [])
      setSelected({})
      setLoading(false)
    })()
  }, [])

  // chiudi il menu se esci dalla modalità select o cambi tab
  useEffect(() => { if (!selectMode) setMenuOpen(false) }, [selectMode])
  useEffect(() => { setMenuOpen(false) }, [tab])

  // chiusura on click esterno + Esc
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuOpen) return
      const target = e.target as Node
      const inside = kebabWrapperRef.current?.contains(target)
      if (!inside) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const cats = tab === 'Dish' ? dishCats : prepCats

  const filtered = useMemo(() => {
    const rows = tab === 'Dish' ? dishes : preps
    const contains = (s: string) => s.toLowerCase().includes((qName||'').toLowerCase())
    return rows.filter(r => {
      const nameOk = qName ? contains(r.name || '') : true
      const catOk  = qCat !== '' ? r.category_id === Number(qCat) : true
      const typeOk = qType ? r.type === qType : true
      return nameOk && catOk && typeOk
    })
  }, [tab, dishes, preps, qName, qCat, qType])

  const allVisibleSelected = filtered.length>0 && filtered.every(r => selected[r.id])
  const someVisibleSelected = filtered.some(r => selected[r.id]) && !allVisibleSelected
  useEffect(() => { if (headerCbRef.current) headerCbRef.current.indeterminate = someVisibleSelected }, [someVisibleSelected])

  function toggleSelectAllVisible() {
    const next = { ...selected }
    if (allVisibleSelected) filtered.forEach(r => { next[r.id]=false })
    else filtered.forEach(r => { next[r.id]=true })
    setSelected(next)
  }
  function selectedIds(): string[] { return Object.keys(selected).filter(id => selected[id]) }

  async function unarchive(ids: string[]) {
    if (!ids.length) return
    const table = tab === 'Dish' ? TBL_FINAL : TBL_PREP
    const { error } = await supabase.from(table).update({ archived_at: null }).in('id', ids)
    if (error) { alert(error.message); return }
    if (tab==='Dish') setDishes(d => d.filter(r => !ids.includes(r.id)))
    else setPreps(p => p.filter(r => !ids.includes(r.id)))
    setSelected({})
    setMenuOpen(false)
  }
  async function moveToTrash(ids: string[]) {
    if (!ids.length) return
    const ok = window.confirm(t('MoveToTrash', lang))
    if (!ok) return
    const table = tab === 'Dish' ? TBL_FINAL : TBL_PREP
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).in('id', ids)
    if (error) { alert(error.message); return }
    if (tab==='Dish') setDishes(d => d.filter(r => !ids.includes(r.id)))
    else setPreps(p => p.filter(r => !ids.includes(r.id)))
    setSelected({})
    setMenuOpen(false)
  }
  async function deleteForever(ids: string[]) {
    if (!ids.length) return
    const ok = window.confirm(`${t('Delete', lang)}?`)
    if (!ok) return
    const table = tab === 'Dish' ? TBL_FINAL : TBL_PREP
    const { error } = await supabase.from(table).delete().in('id', ids)
    if (error) { alert(error.message); return }
    if (tab==='Dish') setDishes(d => d.filter(r => !ids.includes(r.id)))
    else setPreps(p => p.filter(r => !ids.includes(r.id)))
    setSelected({})
    setMenuOpen(false)
  }

  if (loading) return <div className="p-6">{t('Loading', lang) || 'Loading…'}</div>

  return (
    <div className="max-w-6xl mx-auto p-4 text-gray-100">
      {/* Header: kebab a sinistra del titolo quando Select attivo */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {selectMode && (
            <div ref={kebabWrapperRef} className="relative">
              <button
                onClick={(e:any)=>{ e.stopPropagation?.(); setMenuOpen(v=>!v) }}
                className="p-2 rounded-lg hover:bg-white/10"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Bulk actions"
              >
                <EllipsisVerticalIcon className="w-6 h-6 text-white" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 mt-2 w-64 rounded-xl border border-white/10 bg-white text-gray-900 shadow-xl z-20"
                >
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 disabled:opacity-50"
                    disabled={!selectedIds().length}
                    onClick={()=>unarchive(selectedIds())}
                    role="menuitem"
                  >
                    <div className="flex items-center gap-2">
                      <ArrowUturnLeftIcon className="w-4 h-4" /> {t('Restore', lang) || 'Unarchive'}
                    </div>
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-amber-50 disabled:opacity-50"
                    disabled={!selectedIds().length}
                    onClick={()=>moveToTrash(selectedIds())}
                    role="menuitem"
                  >
                    <div className="flex items-center gap-2">
                      <TrashIcon className="w-4 h-4" /> {t('MoveToTrash', lang) || 'Move to Trash'}
                    </div>
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 disabled:opacity-50"
                    disabled={!selectedIds().length}
                    onClick={()=>deleteForever(selectedIds())}
                    role="menuitem"
                  >
                    <div className="flex items-center gap-2">
                      <TrashIcon className="w-4 h-4" /> {t('Delete', lang) || 'Delete permanently'}
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          <h1 className="text-2xl font-bold text-white">{t('Archive', lang)}</h1>
          {selectedIds().length>0 && <span className="text-sm text-blue-200">({selectedIds().length} {t('Selected', lang)})</span>}
        </div>

        <div />
      </div>

      {/* Tabs + Select sulla stessa riga: UN SOLO GRUPPO PER LE TAB */}
      <div className="inline-flex w-full items-center justify-between rounded-xl overflow-visible mb-3">
        <div className="inline-flex rounded-xl border overflow-hidden">
          <button
            aria-pressed={tab==='Dish'}
            className={`px-4 py-2 font-medium transition ${tab==='Dish'?'bg-blue-600 text-white':'bg-white text-blue-600 hover:bg-blue-50'}`}
            onClick={()=>{ setTab('Dish'); setSelected({}); setMenuOpen(false) }}
          >
            {t('Dish', lang)}
          </button>
          <button
            aria-pressed={tab==='Prep'}
            className={`px-4 py-2 font-medium transition ${tab==='Prep'?'bg-blue-600 text-white':'bg-white text-blue-600 hover:bg-blue-50'}`}
            onClick={()=>{ setTab('Prep'); setSelected({}); setMenuOpen(false) }}
          >
            {t('Prep', lang)}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={()=>{
              setSelectMode(v=>!v)
              setSelected({})
              setMenuOpen(false)
            }}
            className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${
              selectMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
            }`}
          >
            <CheckCircleIcon className="w-5 h-5" />
            {selectMode ? (t('Selecting', lang) || 'Selecting') : (t('Select', lang) || 'Select')}
          </button>
        </div>
      </div>

      {/* Filtri */}
      <div className="bg-white rounded-2xl shadow p-3 mb-4">
        <div className="flex items-center gap-2">
          <input
            value={qName}
            onChange={e=>setQName(e.target.value)}
            placeholder={t('FilterByName', lang)}
            className="border rounded-lg px-2 h-9 text-sm text-gray-900 placeholder-gray-600 w-[220px]"
          />
          <select
            value={qCat}
            onChange={e=>setQCat(e.target.value)}
            className="border rounded-lg px-2 h-9 text-sm bg-white text-gray-900 w-[200px]"
          >
            <option value="">{t('AllCategories', lang)}</option>
            {cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={qType}
            onChange={e=>setQType(e.target.value as any)}
            className="border rounded-lg px-2 h-9 text-sm bg-white text-gray-900 w-[160px]"
          >
            <option value="">{t('AllTypes', lang)}</option>
            <option value="food">{t('Food', lang)}</option>
            <option value="beverage">{t('Drink', lang)}</option>
          </select>

          <div className="ml-auto" />
          <button
            onClick={()=>{ setQName(''); setQCat(''); setQType('') }}
            className="px-3 h-9 rounded-lg border border-blue-600 text-blue-700 hover:bg-blue-50"
          >
            {t('Clear', lang)}
          </button>
        </div>
      </div>

      {/* Tabella */}
      <div className="bg-white rounded-2xl shadow p-3">
        <table className="w-full table-auto text-sm text-gray-900">
          <thead>
            <tr>
              <th className="p-2 w-7">
                {selectMode && (
                  <input
                    ref={headerCbRef}
                    type="checkbox"
                    className="h-4 w-4"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    title={t('SelectAll', lang)}
                  />
                )}
              </th>
              <th className="p-2 text-left">{t('Name', lang)}</th>
              <th className="p-2 text-left">{t('Category', lang)}</th>
              <th className="p-2 text-left">{t('Type', lang)}</th>
              {tab==='Dish' ? (
                <th className="p-2 text-right">{t('Price', lang)} ({currency})</th>
              ) : (
                <th className="p-2 text-right">{t('UnitCost', lang)} ({currency})</th>
              )}
              <th className="p-2 text-center">{t('UpdatedShort', lang)}</th>
              <th className="p-2 text-center">{t('Archived', lang)}</th>
              <th className="p-2 text-center">{t('Actions', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const catName = (tab==='Dish' ? dishCats : prepCats).find(c => c.id === r.category_id)?.name || ''
              const checked = !!selected[r.id]
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2 w-7">
                    {selectMode && (
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={checked}
                        onChange={e=>setSelected(prev=>({ ...prev, [r.id]: e.target.checked }))}
                      />
                    )}
                  </td>
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">{catName || '-'}</td>
                  <td className="p-2">{typeLabel((r as any).type, lang)}</td>
                  {tab==='Dish' ? (
                    <td className="p-2 text-right tabular-nums">{(r as DishRow).price_vnd ?? ''}</td>
                  ) : (
                    <td className="p-2 text-right tabular-nums">{(r as PrepRow).cost_per_unit_vnd ?? ''}</td>
                  )}
                  <td className="p-2 text-center tabular-nums">{fmtDate((r as any).last_update)}</td>
                  <td className="p-2 text-center tabular-nums">{fmtDate((r as any).archived_at)}</td>
                  <td className="p-2">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        className="px-2 py-1 rounded-lg border text-gray-800 hover:bg-blue-50 inline-flex items-center gap-1"
                        onClick={()=>unarchive([r.id])}
                        title={t('Restore', lang) || 'Unarchive'}
                      >
                        <ArrowUturnLeftIcon className="w-4 h-4" />
                        {t('Restore', lang)}
                      </button>
                      <button
                        className="px-2 py-1 rounded-lg border text-amber-700 hover:bg-amber-50 inline-flex items-center gap-1"
                        onClick={()=>moveToTrash([r.id])}
                      >
                        <TrashIcon className="w-4 h-4" />
                        {t('MoveToTrash', lang)}
                      </button>
                      <button
                        className="px-2 py-1 rounded-lg border text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
                        onClick={()=>deleteForever([r.id])}
                      >
                        <TrashIcon className="w-4 h-4" />
                        {t('Delete', lang)}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length===0 && (
              <tr><td className="p-3 text-gray-500" colSpan={8}>{t('NoItems', lang) || 'No items'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
