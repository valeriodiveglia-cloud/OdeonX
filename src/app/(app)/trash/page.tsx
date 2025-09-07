// src/app/trash/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'
import {
  ArrowUturnLeftIcon,
  TrashIcon,
  EllipsisVerticalIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'

/* ---------- DB tables ---------- */
const TBL_MATERIALS = 'materials'
const TBL_MAT_CATS = 'categories'
const TBL_SUPS = 'suppliers'
const TBL_UOM = 'uom'

const TBL_PREP = 'prep_recipes'
const TBL_PREP_CATS = 'recipe_categories'

const TBL_FINAL = 'final_recipes'
const TBL_DISH_CATS = 'dish_categories'

const TBL_EQ = 'rental_equipment'
const TBL_EQ_CATS = 'equipment_categories'

/* ---------- Types ---------- */
type Uom = { id: number; name: string }
type Sup = { id: string; name: string }

type MatCat = { id: number; name: string }
type DishCat = { id: number; name: string }
type PrepCat = { id: number; name: string }
type EqCat = { id: number; name: string }

type Mat = {
  id: string
  name: string
  category_id: number | null
  brand: string | null
  supplier_id: string | null
  uom_id: number | null
  packaging_size: number | null
  package_price: number | null
  unit_cost: number | null
  vat_rate_percent: number | null
  notes: string | null
  is_food_drink: boolean
  is_default: boolean
  created_at: string
  last_update: string | null
  deleted_at: string | null
}

type PrepTrash = {
  id: string
  name: string
  category_id: number | null
  type: 'food' | 'beverage' | null
  deleted_at: string | null
  updated_at?: string | null
  last_update?: string | null
}

type DishTrash = {
  id: string
  name: string
  category_id: number | null
  type: 'food' | 'beverage' | null
  price_vnd: number | null
  deleted_at: string | null
  updated_at?: string | null
  last_update?: string | null
}

type EqTrash = {
  id: string
  name: string
  category_id: number | null
  supplier_id: string | null
  cost: number | null
  vat_rate_percent: number | null
  markup_x: number | null
  final_price: number | null
  deleted_at: string | null
  updated_at?: string | null
  last_update?: string | null
}

/* ---------- Utils ---------- */
function fmtDate(s?: string | null) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}
function typeLabel(kind?: 'food' | 'beverage' | null, lang?: any) {
  if (!kind) return ''
  return kind === 'beverage'
    ? (t('Drink', lang) || 'Drink')
    : (t('Food', lang) || 'Food')
}

/* =====================================================
   Page
===================================================== */

export default function TrashPage() {
  const { language: lang, currency, vatEnabled, vatRate } = useSettings()
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US'
  const num = useMemo(
    () => new Intl.NumberFormat(locale, {
      maximumFractionDigits: currency === 'VND' ? 0 : 2,
      minimumFractionDigits: currency === 'VND' ? 0 : 2,
    }),
    [locale, currency]
  )

  const [tab, setTab] = useState<'Materials' | 'Dishes' | 'Preps' | 'Equipment'>('Materials')

  /* ---------- Dictionaries ---------- */
  const [uoms, setUoms] = useState<Uom[]>([])
  const [sups, setSups] = useState<Sup[]>([])
  const [matCats, setMatCats] = useState<MatCat[]>([])
  const [dishCats, setDishCats] = useState<DishCat[]>([])
  const [prepCats, setPrepCats] = useState<PrepCat[]>([])
  const [eqCats, setEqCats] = useState<EqCat[]>([])

  /* ---------- Data ---------- */
  const [mats, setMats] = useState<Mat[]>([])
  const [dishes, setDishes] = useState<DishTrash[]>([])
  const [preps, setPreps] = useState<PrepTrash[]>([])
  const [eqs, setEqs] = useState<EqTrash[]>([])

  const [loading, setLoading] = useState(true)

  /* ---------- Filters ---------- */
  const [matFilters, setMatFilters] = useState({
    name: '',
    brand: '',
    categoryId: '' as string | number | '',
    supplierId: '' as string | '',
  })
  const [dishFilters, setDishFilters] = useState({
    name: '',
    categoryId: '' as string | number | '',
    type: '' as '' | 'food' | 'beverage',
  })
  const [prepFilters, setPrepFilters] = useState({
    name: '',
    categoryId: '' as string | number | '',
    type: '' as '' | 'food' | 'beverage',
  })
  const [eqFilters, setEqFilters] = useState({
    name: '',
    categoryId: '' as string | number | '',
    supplierId: '' as string | '',
  })

  /* ---------- Selection & menu (per tab) ---------- */
  const [selectModeMat, setSelectModeMat] = useState(false)
  const [selectedMat, setSelectedMat] = useState<Record<string, boolean>>({})
  const headerCbMat = useRef<HTMLInputElement>(null)
  const [menuOpenMat, setMenuOpenMat] = useState(false)
  const menuRefMat = useRef<HTMLDivElement>(null)

  const [selectModeDish, setSelectModeDish] = useState(false)
  const [selectedDish, setSelectedDish] = useState<Record<string, boolean>>({})
  const headerCbDish = useRef<HTMLInputElement>(null)
  const [menuOpenDish, setMenuOpenDish] = useState(false)
  const menuRefDish = useRef<HTMLDivElement>(null)

  const [selectModePrep, setSelectModePrep] = useState(false)
  const [selectedPrep, setSelectedPrep] = useState<Record<string, boolean>>({})
  const headerCbPrep = useRef<HTMLInputElement>(null)
  const [menuOpenPrep, setMenuOpenPrep] = useState(false)
  const menuRefPrep = useRef<HTMLDivElement>(null)

  const [selectModeEq, setSelectModeEq] = useState(false)
  const [selectedEq, setSelectedEq] = useState<Record<string, boolean>>({})
  const headerCbEq = useRef<HTMLInputElement>(null)
  const [menuOpenEq, setMenuOpenEq] = useState(false)
  const menuRefEq = useRef<HTMLDivElement>(null)

  // click outside chiude i menu
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRefMat.current && !menuRefMat.current.contains(e.target as Node)) setMenuOpenMat(false)
      if (menuRefDish.current && !menuRefDish.current.contains(e.target as Node)) setMenuOpenDish(false)
      if (menuRefPrep.current && !menuRefPrep.current.contains(e.target as Node)) setMenuOpenPrep(false)
      if (menuRefEq.current && !menuRefEq.current.contains(e.target as Node)) setMenuOpenEq(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  /* ---------- Load ---------- */
  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [uRes, sRes, mcRes, dcRes, pcRes, ecRes, mRes, dRes, pRes, eRes] = await Promise.all([
      supabase.from(TBL_UOM).select('*').order('name', { ascending: true }),
      supabase.from(TBL_SUPS).select('*').order('name', { ascending: true }),
      supabase.from(TBL_MAT_CATS).select('*').order('name', { ascending: true }),
      supabase.from(TBL_DISH_CATS).select('*').order('name', { ascending: true }),
      supabase.from(TBL_PREP_CATS).select('*').order('name', { ascending: true }),
      supabase.from(TBL_EQ_CATS).select('*').order('name', { ascending: true }),

      supabase.from(TBL_MATERIALS).select('*')
        .not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from(TBL_FINAL).select('id,name,category_id,type,price_vnd,deleted_at,updated_at,last_update')
        .not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      // niente 'updated_at' per prep_recipes
      supabase.from(TBL_PREP).select('id,name,category_id,type,deleted_at,last_update')
        .not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from(TBL_EQ).select('*')
        .not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    ])

    if (uRes.data) setUoms(uRes.data)
    if (sRes.data) setSups(sRes.data)
    if (mcRes.data) setMatCats(mcRes.data)
    if (dcRes.data) setDishCats(dcRes.data)
    if (pcRes.data) setPrepCats(pcRes.data)
    if (ecRes.data) setEqCats(ecRes.data)

    if (mRes.error) console.error('Trash MATERIALS select error:', mRes.error)
    if (dRes.error) console.error('Trash DISHES select error:', dRes.error)
    if (pRes.error) console.error('Trash PREPS select error:', pRes.error)
    if (eRes.error) console.error('Trash EQUIPMENT select error:', eRes.error)

    setMats(mRes.data || [])
    setDishes(dRes.data || [])
    setPreps(pRes.data || [])
    setEqs(eRes.data || [])

    setSelectedMat({})
    setSelectedDish({})
    setSelectedPrep({})
    setSelectedEq({})

    setLoading(false)
  }

  /* =====================================================
     Filters + selection helpers
  ====================================================== */

  // Materials
  function applyMatFilters(list: Mat[]) {
    let rows = [...list]
    if (matFilters.name.trim()) rows = rows.filter(r => r.name.toLowerCase().includes(matFilters.name.trim().toLowerCase()))
    if (matFilters.brand.trim()) rows = rows.filter(r => (r.brand ?? '').toLowerCase().includes(matFilters.brand.trim().toLowerCase()))
    if (matFilters.categoryId !== '') rows = rows.filter(r => r.category_id === Number(matFilters.categoryId))
    if (matFilters.supplierId !== '') rows = rows.filter(r => r.supplier_id === String(matFilters.supplierId))
    return rows
  }
  const matsFiltered = applyMatFilters(mats)
  const matAllVisibleSelected = matsFiltered.length > 0 && matsFiltered.every(m => !!selectedMat[m.id])
  const matSomeVisibleSelected = matsFiltered.some(m => !!selectedMat[m.id]) && !matAllVisibleSelected
  useEffect(() => { if (headerCbMat.current) headerCbMat.current.indeterminate = matSomeVisibleSelected }, [matSomeVisibleSelected, matAllVisibleSelected, matsFiltered.length])
  useEffect(() => { if (!selectModeMat) setSelectedMat({}) }, [selectModeMat])
  function toggleSelectAllVisibleMat() {
    const next: Record<string, boolean> = { ...selectedMat }
    if (matAllVisibleSelected) matsFiltered.forEach(m => next[m.id] = false)
    else matsFiltered.forEach(m => next[m.id] = true)
    setSelectedMat(next)
  }
  const selectedMatIds = useMemo(() => Object.keys(selectedMat).filter(id => selectedMat[id]), [selectedMat])

  // Dishes
  function applyDishFilters(list: DishTrash[]) {
    let rows = [...list]
    if (dishFilters.name.trim()) rows = rows.filter(r => r.name.toLowerCase().includes(dishFilters.name.trim().toLowerCase()))
    if (dishFilters.categoryId !== '') rows = rows.filter(r => r.category_id === Number(dishFilters.categoryId))
    if (dishFilters.type) rows = rows.filter(r => r.type === dishFilters.type)
    return rows
  }
  const dishesFiltered = applyDishFilters(dishes)
  const dishAllVisibleSelected = dishesFiltered.length > 0 && dishesFiltered.every(m => !!selectedDish[m.id])
  const dishSomeVisibleSelected = dishesFiltered.some(m => !!selectedDish[m.id]) && !dishAllVisibleSelected
  useEffect(() => { if (headerCbDish.current) headerCbDish.current.indeterminate = dishSomeVisibleSelected }, [dishSomeVisibleSelected, dishAllVisibleSelected, dishesFiltered.length])
  useEffect(() => { if (!selectModeDish) setSelectedDish({}) }, [selectModeDish])
  function toggleSelectAllVisibleDish() {
    const next: Record<string, boolean> = { ...selectedDish }
    if (dishAllVisibleSelected) dishesFiltered.forEach(m => next[m.id] = false)
    else dishesFiltered.forEach(m => next[m.id] = true)
    setSelectedDish(next)
  }
  const selectedDishIds = useMemo(() => Object.keys(selectedDish).filter(id => selectedDish[id]), [selectedDish])

  // Preps
  function applyPrepFilters(list: PrepTrash[]) {
    let rows = [...list]
    if (prepFilters.name.trim()) rows = rows.filter(r => r.name.toLowerCase().includes(prepFilters.name.trim().toLowerCase()))
    if (prepFilters.categoryId !== '') rows = rows.filter(r => r.category_id === Number(prepFilters.categoryId))
    if (prepFilters.type) rows = rows.filter(r => r.type === prepFilters.type)
    return rows
  }
  const prepsFiltered = applyPrepFilters(preps)
  const prepAllVisibleSelected = prepsFiltered.length > 0 && prepsFiltered.every(m => !!selectedPrep[m.id])
  const prepSomeVisibleSelected = prepsFiltered.some(m => !!selectedPrep[m.id]) && !prepAllVisibleSelected
  useEffect(() => { if (headerCbPrep.current) headerCbPrep.current.indeterminate = prepSomeVisibleSelected }, [prepSomeVisibleSelected, prepAllVisibleSelected, prepsFiltered.length])
  useEffect(() => { if (!selectModePrep) setSelectedPrep({}) }, [selectModePrep])
  function toggleSelectAllVisiblePrep() {
    const next: Record<string, boolean> = { ...selectedPrep }
    if (prepAllVisibleSelected) prepsFiltered.forEach(m => next[m.id] = false)
    else prepsFiltered.forEach(m => next[m.id] = true)
    setSelectedPrep(next)
  }
  const selectedPrepIds = useMemo(() => Object.keys(selectedPrep).filter(id => selectedPrep[id]), [selectedPrep])

  // Equipment
  function applyEqFilters(list: EqTrash[]) {
    let rows = [...list]
    if (eqFilters.name.trim()) rows = rows.filter(r => r.name.toLowerCase().includes(eqFilters.name.trim().toLowerCase()))
    if (eqFilters.categoryId !== '') rows = rows.filter(r => r.category_id === Number(eqFilters.categoryId))
    if (eqFilters.supplierId !== '') rows = rows.filter(r => r.supplier_id === String(eqFilters.supplierId))
    return rows
  }
  const eqsFiltered = applyEqFilters(eqs)
  const eqAllVisibleSelected = eqsFiltered.length > 0 && eqsFiltered.every(m => !!selectedEq[m.id])
  const eqSomeVisibleSelected = eqsFiltered.some(m => !!selectedEq[m.id]) && !eqAllVisibleSelected
  useEffect(() => { if (headerCbEq.current) headerCbEq.current.indeterminate = eqSomeVisibleSelected }, [eqSomeVisibleSelected, eqAllVisibleSelected, eqsFiltered.length])
  useEffect(() => { if (!selectModeEq) setSelectedEq({}) }, [selectModeEq])
  function toggleSelectAllVisibleEq() {
    const next: Record<string, boolean> = { ...selectedEq }
    if (eqAllVisibleSelected) eqsFiltered.forEach(m => next[m.id] = false)
    else eqsFiltered.forEach(m => next[m.id] = true)
    setSelectedEq(next)
  }
  const selectedEqIds = useMemo(() => Object.keys(selectedEq).filter(id => selectedEq[id]), [selectedEq])

  /* =====================================================
     Actions: Restore / Delete forever
  ====================================================== */

  // Materials
  async function restoreMaterials(ids: string[]) {
    if (!ids.length) return
    const { error } = await supabase.from(TBL_MATERIALS).update({ deleted_at: null }).in('id', ids)
    if (error) { alert((t('SavedErr', lang) || 'Error') + ': ' + error.message); return }
    await fetchAll()
  }
  async function deleteMaterialsForever(ids: string[]) {
    if (!ids.length) return
    const ok = window.confirm(`Permanently delete ${ids.length} item(s)? This cannot be undone.`)
    if (!ok) return
    const { error } = await supabase.from(TBL_MATERIALS).delete().in('id', ids)
    if (error) { alert((t('SavedErr', lang) || 'Error') + ': ' + error.message); return }
    await fetchAll()
  }

  // Dishes
  async function restoreDishes(ids: string[]) {
    if (!ids.length) return
    const { error } = await supabase.from(TBL_FINAL).update({ deleted_at: null }).in('id', ids)
    if (error) { alert((t('SavedErr', lang) || 'Error') + ': ' + error.message); return }
    await fetchAll()
  }
  async function deleteDishesForever(ids: string[]) {
    if (!ids.length) return
    const ok = window.confirm(`Permanently delete ${ids.length} dish(es)? This cannot be undone.`)
    if (!ok) return
    const { error } = await supabase.from(TBL_FINAL).delete().in('id', ids)
    if (error) { alert((t('SavedErr', lang) || 'Error') + ': ' + error.message); return }
    await fetchAll()
  }

  // Preps
  async function restorePreps(ids: string[]) {
    if (!ids.length) return
    const { error } = await supabase.from(TBL_PREP).update({ deleted_at: null }).in('id', ids)
    if (error) { alert((t('SavedErr', lang) || 'Error') + ': ' + error.message); return }
    await fetchAll()
  }
  async function deletePrepsForever(ids: string[]) {
    if (!ids.length) return
    const ok = window.confirm(`Permanently delete ${ids.length} prep(s)? This cannot be undone.`)
    if (!ok) return
    const { error } = await supabase.from(TBL_PREP).delete().in('id', ids)
    if (error) { alert((t('SavedErr', lang) || 'Error') + ': ' + error.message); return }
    await fetchAll()
  }

  // Equipment
  async function restoreEquipment(ids: string[]) {
    if (!ids.length) return
    const { error } = await supabase.from(TBL_EQ).update({ deleted_at: null }).in('id', ids)
    if (error) { alert((t('SavedErr', lang) || 'Error') + ': ' + error.message); return }
    await fetchAll()
  }
  async function deleteEquipmentForever(ids: string[]) {
    if (!ids.length) return
    const ok = window.confirm(`Permanently delete ${ids.length} equipment item(s)? This cannot be undone.`)
    if (!ok) return
    const { error } = await supabase.from(TBL_EQ).delete().in('id', ids)
    if (error) { alert((t('SavedErr', lang) || 'Error') + ': ' + error.message); return }
    await fetchAll()
  }

  /* =====================================================
     Renders
  ====================================================== */

  if (loading) return <div className="p-6">{t('Loading', lang) || 'Loading…'}</div>

  // Helpers current tab states
  const selectedCount =
    tab === 'Materials' ? selectedMatIds.length
    : tab === 'Dishes' ? selectedDishIds.length
    : tab === 'Preps' ? selectedPrepIds.length
    : selectedEqIds.length

  return (
    <div className="max-w-none mx-auto p-4 text-gray-100">
      {/* Header */}
      <div className="mb-3 flex items-center justify-start">
        <div className="flex items-center gap-2">
          {/* Kebab per Materials */}
          {tab === 'Materials' && selectModeMat && (
            <div className="relative" ref={menuRefMat}>
              <button
                type="button"
                onClick={() => setMenuOpenMat(v => !v)}
                className="p-2 rounded-lg hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                title={t('BulkActions', lang) || 'Bulk actions'}
                aria-haspopup="menu"
                aria-expanded={menuOpenMat}
              >
                <EllipsisVerticalIcon className="w-6 h-6 text-white" />
              </button>
              {menuOpenMat && (
                <div className="absolute z-10 mt-2 w-64 rounded-xl border border-white/10 bg-white text-gray-900 shadow-xl">
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 disabled:opacity-50 flex items-center gap-2"
                    onClick={() => { setMenuOpenMat(false); restoreMaterials(selectedMatIds) }}
                    disabled={selectedMatIds.length === 0}
                  >
                    <ArrowUturnLeftIcon className="w-4 h-4" />
                    {t('Restore', lang) || 'Restore'}
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 disabled:opacity-50 flex items-center gap-2"
                    onClick={() => { setMenuOpenMat(false); deleteMaterialsForever(selectedMatIds) }}
                    disabled={selectedMatIds.length === 0}
                  >
                    <TrashIcon className="w-4 h-4" />
                    {t('Delete', lang) || 'Delete permanently'}
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Kebab per Dishes */}
          {tab === 'Dishes' && selectModeDish && (
            <div className="relative" ref={menuRefDish}>
              <button
                type="button"
                onClick={() => setMenuOpenDish(v => !v)}
                className="p-2 rounded-lg hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                title={t('BulkActions', lang) || 'Bulk actions'}
                aria-haspopup="menu"
                aria-expanded={menuOpenDish}
              >
                <EllipsisVerticalIcon className="w-6 h-6 text-white" />
              </button>
              {menuOpenDish && (
                <div className="absolute z-10 mt-2 w-64 rounded-xl border border-white/10 bg-white text-gray-900 shadow-xl">
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 disabled:opacity-50 flex items-center gap-2"
                    onClick={() => { setMenuOpenDish(false); restoreDishes(selectedDishIds) }}
                    disabled={selectedDishIds.length === 0}
                  >
                    <ArrowUturnLeftIcon className="w-4 h-4" />
                    {t('Restore', lang) || 'Restore'}
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 disabled:opacity-50 flex items-center gap-2"
                    onClick={() => { setMenuOpenDish(false); deleteDishesForever(selectedDishIds) }}
                    disabled={selectedDishIds.length === 0}
                  >
                    <TrashIcon className="w-4 h-4" />
                    {t('Delete', lang) || 'Delete permanently'}
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Kebab per Preps */}
          {tab === 'Preps' && selectModePrep && (
            <div className="relative" ref={menuRefPrep}>
              <button
                type="button"
                onClick={() => setMenuOpenPrep(v => !v)}
                className="p-2 rounded-lg hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                title={t('BulkActions', lang) || 'Bulk actions'}
                aria-haspopup="menu"
                aria-expanded={menuOpenPrep}
              >
                <EllipsisVerticalIcon className="w-6 h-6 text-white" />
              </button>
              {menuOpenPrep && (
                <div className="absolute z-10 mt-2 w-64 rounded-xl border border-white/10 bg-white text-gray-900 shadow-xl">
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 disabled:opacity-50 flex items-center gap-2"
                    onClick={() => { setMenuOpenPrep(false); restorePreps(selectedPrepIds) }}
                    disabled={selectedPrepIds.length === 0}
                  >
                    <ArrowUturnLeftIcon className="w-4 h-4" />
                    {t('Restore', lang) || 'Restore'}
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 disabled:opacity-50 flex items-center gap-2"
                    onClick={() => { setMenuOpenPrep(false); deletePrepsForever(selectedPrepIds) }}
                    disabled={selectedPrepIds.length === 0}
                  >
                    <TrashIcon className="w-4 h-4" />
                    {t('Delete', lang) || 'Delete permanently'}
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Kebab per Equipment */}
          {tab === 'Equipment' && selectModeEq && (
            <div className="relative" ref={menuRefEq}>
              <button
                type="button"
                onClick={() => setMenuOpenEq(v => !v)}
                className="p-2 rounded-lg hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                title={t('BulkActions', lang) || 'Bulk actions'}
                aria-haspopup="menu"
                aria-expanded={menuOpenEq}
              >
                <EllipsisVerticalIcon className="w-6 h-6 text-white" />
              </button>
              {menuOpenEq && (
                <div className="absolute z-10 mt-2 w-64 rounded-xl border border-white/10 bg-white text-gray-900 shadow-xl">
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 disabled:opacity-50 flex items-center gap-2"
                    onClick={() => { setMenuOpenEq(false); restoreEquipment(selectedEqIds) }}
                    disabled={selectedEqIds.length === 0}
                  >
                    <ArrowUturnLeftIcon className="w-4 h-4" />
                    {t('Restore', lang) || 'Restore'}
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 disabled:opacity-50 flex items-center gap-2"
                    onClick={() => { setMenuOpenEq(false); deleteEquipmentForever(selectedEqIds) }}
                    disabled={selectedEqIds.length === 0}
                  >
                    <TrashIcon className="w-4 h-4" />
                    {t('Delete', lang) || 'Delete permanently'}
                  </button>
                </div>
              )}
            </div>
          )}

          <h1 className="text-2xl font-bold text-white">Trash</h1>
          {selectedCount > 0 && (
            <span className="ml-2 text-sm text-blue-200">({selectedCount} {t('Selected', lang)})</span>
          )}
        </div>
      </div>

      {/* Tabs + Select allineati sulla stessa riga */}
      <div className="mb-4 flex items-center justify-between">
        {/* Tabs a sinistra */}
        <div className="inline-flex rounded-xl border overflow-hidden">
          <button
            aria-pressed={tab === 'Materials'}
            className={`px-4 py-2 font-medium transition ${tab === 'Materials' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 hover:bg-blue-50'}`}
            onClick={() => setTab('Materials')}
          >
            {t('Materials', lang)}
          </button>
          <button
            aria-pressed={tab === 'Dishes'}
            className={`px-4 py-2 font-medium transition ${tab === 'Dishes' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 hover:bg-blue-50'}`}
            onClick={() => setTab('Dishes')}
          >
            {t('Dish', lang)}
          </button>
          <button
            aria-pressed={tab === 'Preps'}
            className={`px-4 py-2 font-medium transition ${tab === 'Preps' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 hover:bg-blue-50'}`}
            onClick={() => setTab('Preps')}
          >
            {t('Prep', lang)}
          </button>
          <button
            aria-pressed={tab === 'Equipment'}
            className={`px-4 py-2 font-medium transition ${tab === 'Equipment' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 hover:bg-blue-50'}`}
            onClick={() => setTab('Equipment')}
          >
            {t('Equipment', lang) || 'Equipment'}
          </button>
        </div>

        {/* Pulsante Select a destra */}
        <div className="flex items-center gap-2">
          {tab === 'Materials' && (
            <button
              onClick={() => {
                setSelectModeMat(s => !s)
                setMenuOpenMat(false)
              }}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${
                selectModeMat
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
              }`}
              title={selectModeMat ? (t('ExitSelection', lang) || 'Exit selection') : (t('EnterSelection', lang) || 'Select')}
            >
              <CheckCircleIcon className="w-5 h-5" />
              {selectModeMat ? (t('Selecting', lang) || 'Selecting') : (t('Select', lang) || 'Select')}
            </button>
          )}
          {tab === 'Dishes' && (
            <button
              onClick={() => {
                setSelectModeDish(s => !s)
                setMenuOpenDish(false)
              }}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${
                selectModeDish
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
              }`}
              title={selectModeDish ? (t('ExitSelection', lang) || 'Exit selection') : (t('EnterSelection', lang) || 'Select')}
            >
              <CheckCircleIcon className="w-5 h-5" />
              {selectModeDish ? (t('Selecting', lang) || 'Selecting') : (t('Select', lang) || 'Select')}
            </button>
          )}
          {tab === 'Preps' && (
            <button
              onClick={() => {
                setSelectModePrep(s => !s)
                setMenuOpenPrep(false)
              }}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${
                selectModePrep
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
              }`}
              title={selectModePrep ? (t('ExitSelection', lang) || 'Exit selection') : (t('EnterSelection', lang) || 'Select')}
            >
              <CheckCircleIcon className="w-5 h-5" />
              {selectModePrep ? (t('Selecting', lang) || 'Selecting') : (t('Select', lang) || 'Select')}
            </button>
          )}
          {tab === 'Equipment' && (
            <button
              onClick={() => {
                setSelectModeEq(s => !s)
                setMenuOpenEq(false)
              }}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${
                selectModeEq
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
              }`}
              title={selectModeEq ? (t('ExitSelection', lang) || 'Exit selection') : (t('EnterSelection', lang) || 'Select')}
            >
              <CheckCircleIcon className="w-5 h-5" />
              {selectModeEq ? (t('Selecting', lang) || 'Selecting') : (t('Select', lang) || 'Select')}
            </button>
          )}
        </div>
      </div>

      {/* ============ MATERIALS ============ */}
      {tab === 'Materials' && (
        <>
          {/* Filter bar */}
          <div className="bg-white rounded-2xl shadow p-3 mb-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder={t('FilterByName', lang) || 'Filter by name'}
                value={matFilters.name}
                onChange={e => setMatFilters(s => ({ ...s, name: e.target.value }))}
                className="border rounded-lg px-2 h-9 text-sm text-gray-900 placeholder-gray-600 w-[180px]"
              />
              <input
                type="text"
                placeholder={t('FilterByBrand', lang) || 'Filter by brand'}
                value={matFilters.brand}
                onChange={e => setMatFilters(s => ({ ...s, brand: e.target.value }))}
                className="border rounded-lg px-2 h-9 text-sm text-gray-900 placeholder-gray-600 w-[160px]"
              />
              <select
                value={matFilters.categoryId}
                onChange={e => setMatFilters(s => ({ ...s, categoryId: e.target.value }))}
                className="border rounded-lg px-2 h-9 text-sm bg-white text-gray-900 w-[160px]"
              >
                <option value="">{t('AllCategories', lang) || 'All categories'}</option>
                {matCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                value={matFilters.supplierId}
                onChange={e => setMatFilters(s => ({ ...s, supplierId: e.target.value }))}
                className="border rounded-lg px-2 h-9 text-sm bg-white text-gray-900 w-[160px]"
              >
                <option value="">{t('AllSuppliers', lang) || 'All suppliers'}</option>
                {sups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              <div className="ml-auto" />

              <button
                type="button"
                onClick={() => setMatFilters({ name: '', brand: '', categoryId: '', supplierId: '' })}
                className="inline-flex items-center gap-1 px-3 h-9 rounded-lg border border-blue-600 text-blue-700 hover:bg-blue-50 overflow-hidden min-w-0"
                title={t('Clear', lang) || 'Clear'}
              >
                {t('Clear', lang) || 'Clear'}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow p-3">
            <table className="w-full table-auto text-sm text-gray-900">
              <thead>
                <tr>
                  <th className="p-2 w-7">
                    {selectModeMat ? (
                      <input
                        ref={headerCbMat}
                        type="checkbox"
                        checked={matAllVisibleSelected}
                        onChange={toggleSelectAllVisibleMat}
                        className="h-4 w-4"
                        title={t('SelectAll', lang) || 'Select all'}
                      />
                    ) : null}
                  </th>
                  <th className="p-2 text-left">{t('Name', lang) || 'Name'}</th>
                  <th className="p-2 text-left">{t('Category', lang) || 'Category'}</th>
                  <th className="p-2 text-left">{t('Brand', lang) || 'Brand'}</th>
                  <th className="p-2 text-left">{t('Supplier', lang) || 'Supplier'}</th>
                  <th className="p-2 text-center">UOM</th>
                  <th className="p-2 text-center">{t('PackagePrice', lang) || 'Package price'}</th>
                  <th className="p-2 text-center">{t('UnitCost', lang) || 'Unit cost'}</th>
                  {vatEnabled && <th className="p-2 text-center">{t('VatRatePct', lang) || 'VAT %'}</th>}
                  <th className="p-2 text-center">{t('UpdatedAt', lang) || 'Updated at'}</th>
                  <th className="p-2 text-center">Deleted</th>
                </tr>
              </thead>
              <tbody>
                {matsFiltered.map(m => {
                  const catName = matCats.find(c => c.id === m.category_id)?.name || ''
                  const supName = sups.find(s => s.id === m.supplier_id)?.name || ''
                  const uomName = uoms.find(u => u.id === m.uom_id)?.name || ''
                  const vatEff = vatEnabled ? (m.vat_rate_percent ?? (vatRate ?? 0)) : 0
                  return (
                    <tr key={m.id} className="border-t">
                      <td className="p-2 w-7">
                        {selectModeMat ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={!!selectedMat[m.id]}
                            onChange={e => setSelectedMat(prev => ({ ...prev, [m.id]: e.target.checked }))}
                            title={t('SelectRow', lang) || 'Select row'}
                          />
                        ) : null}
                      </td>
                      <td className="p-2">{m.name}</td>
                      <td className="p-2">{catName || '-'}</td>
                      <td className="p-2">{m.brand || '-'}</td>
                      <td className="p-2">{supName || '-'}</td>
                      <td className="p-2 text-center">{uomName || '-'}</td>
                      <td className="p-2 text-center tabular-nums">{m.package_price != null ? num.format(m.package_price) : '-'}</td>
                      <td className="p-2 text-center tabular-nums">{m.unit_cost != null ? num.format(m.unit_cost) : '-'}</td>
                      {vatEnabled && <td className="p-2 text-center tabular-nums">{num.format(Math.max(0, Math.min(100, Number(vatEff))))}</td>}
                      <td className="p-2 text-center tabular-nums">{fmtDate(m.last_update)}</td>
                      <td className="p-2 text-center tabular-nums">{fmtDate(m.deleted_at)}</td>
                    </tr>
                  )
                })}
                {matsFiltered.length === 0 && (
                  <tr>
                    <td className="p-3 text-gray-500" colSpan={vatEnabled ? 11 : 10}>
                      {t('NoMaterials', lang) || 'No items'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ============ DISHES ============ */}
      {tab === 'Dishes' && (
        <>
          {/* Filter bar */}
          <div className="bg-white rounded-2xl shadow p-3 mb-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder={t('FilterByName', lang) || 'Filter by name'}
                value={dishFilters.name}
                onChange={e => setDishFilters(s => ({ ...s, name: e.target.value }))}
                className="border rounded-lg px-2 h-9 text-sm text-gray-900 placeholder-gray-600 w-[220px]"
              />
              <select
                value={dishFilters.categoryId}
                onChange={e => setDishFilters(s => ({ ...s, categoryId: e.target.value }))}
                className="border rounded-lg px-2 h-9 text-sm bg-white text-gray-900 w-[200px]"
              >
                <option value="">{t('AllCategories', lang) || 'All categories'}</option>
                {dishCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                value={dishFilters.type}
                onChange={e => setDishFilters(s => ({ ...s, type: e.target.value as any }))}
                className="border rounded-lg px-2 h-9 text-sm bg-white text-gray-900 w-[160px]"
              >
                <option value="">{t('AllTypes', lang)}</option>
                <option value="food">{t('Food', lang)}</option>
                <option value="beverage">{t('Drink', lang)}</option>
              </select>

              <div className="ml-auto" />

              <button
                type="button"
                onClick={() => setDishFilters({ name: '', categoryId: '', type: '' })}
                className="inline-flex items-center gap-1 px-3 h-9 rounded-lg border border-blue-600 text-blue-700 hover:bg-blue-50 overflow-hidden min-w-0"
                title={t('Clear', lang) || 'Clear'}
              >
                {t('Clear', lang) || 'Clear'}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow p-3">
            <table className="w-full table-auto text-sm text-gray-900">
              <thead>
                <tr>
                  <th className="p-2 w-7">
                    {selectModeDish ? (
                      <input
                        ref={headerCbDish}
                        type="checkbox"
                        checked={dishAllVisibleSelected}
                        onChange={toggleSelectAllVisibleDish}
                        className="h-4 w-4"
                        title={t('SelectAll', lang) || 'Select all'}
                      />
                    ) : null}
                  </th>
                  <th className="p-2 text-left">{t('Name', lang) || 'Name'}</th>
                  <th className="p-2 text-left">{t('Category', lang) || 'Category'}</th>
                  <th className="p-2 text-left">{t('Type', lang) || 'Type'}</th>
                  <th className="p-2 text-center">{t('Price', lang)} ({currency})</th>
                  <th className="p-2 text-center">Deleted</th>
                </tr>
              </thead>
              <tbody>
                {dishesFiltered.map(r => {
                  const catName = dishCats.find(c => c.id === r.category_id)?.name || ''
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-2 w-7">
                        {selectModeDish ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={!!selectedDish[r.id]}
                            onChange={e => setSelectedDish(prev => ({ ...prev, [r.id]: e.target.checked }))}
                            title={t('SelectRow', lang) || 'Select row'}
                          />
                        ) : null}
                      </td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{catName || '-'}</td>
                      <td className="p-2">{typeLabel(r.type, lang) || '-'}</td>
                      <td className="p-2 text-center tabular-nums">{r.price_vnd != null ? num.format(r.price_vnd) : '-'}</td>
                      <td className="p-2 text-center tabular-nums">{fmtDate(r.deleted_at)}</td>
                    </tr>
                  )
                })}
                {dishesFiltered.length === 0 && (
                  <tr>
                    <td className="p-3 text-gray-500" colSpan={6}>
                      {t('NoDishes', lang) || 'No items'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ============ PREPS ============ */}
      {tab === 'Preps' && (
        <>
          {/* Filter bar */}
          <div className="bg-white rounded-2xl shadow p-3 mb-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder={t('FilterByName', lang) || 'Filter by name'}
                value={prepFilters.name}
                onChange={e => setPrepFilters(s => ({ ...s, name: e.target.value }))}
                className="border rounded-lg px-2 h-9 text-sm text-gray-900 placeholder-gray-600 w-[220px]"
              />
              <select
                value={prepFilters.categoryId}
                onChange={e => setPrepFilters(s => ({ ...s, categoryId: e.target.value }))}
                className="border rounded-lg px-2 h-9 text-sm bg-white text-gray-900 w-[200px]"
              >
                <option value="">{t('AllCategories', lang) || 'All categories'}</option>
                {prepCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                value={prepFilters.type}
                onChange={e => setPrepFilters(s => ({ ...s, type: e.target.value as any }))}
                className="border rounded-lg px-2 h-9 text-sm bg-white text-gray-900 w-[160px]"
              >
                <option value="">{t('AllTypes', lang)}</option>
                <option value="food">{t('Food', lang)}</option>
                <option value="beverage">{t('Drink', lang)}</option>
              </select>

              <div className="ml-auto" />

              <button
                type="button"
                onClick={() => setPrepFilters({ name: '', categoryId: '', type: '' })}
                className="inline-flex items-center gap-1 px-3 h-9 rounded-lg border border-blue-600 text-blue-700 hover:bg-blue-50 overflow-hidden min-w-0"
                title={t('Clear', lang) || 'Clear'}
              >
                {t('Clear', lang) || 'Clear'}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow p-3">
            <table className="w-full table-auto text-sm text-gray-900">
              <thead>
                <tr>
                  <th className="p-2 w-7">
                    {selectModePrep ? (
                      <input
                        ref={headerCbPrep}
                        type="checkbox"
                        checked={prepAllVisibleSelected}
                        onChange={toggleSelectAllVisiblePrep}
                        className="h-4 w-4"
                        title={t('SelectAll', lang) || 'Select all'}
                      />
                    ) : null}
                  </th>
                  <th className="p-2 text-left">{t('Name', lang) || 'Name'}</th>
                  <th className="p-2 text-left">{t('Category', lang) || 'Category'}</th>
                  <th className="p-2 text-left">{t('Type', lang) || 'Type'}</th>
                  <th className="p-2 text-center">Deleted</th>
                </tr>
              </thead>
              <tbody>
                {prepsFiltered.map(r => {
                  const catName = prepCats.find(c => c.id === r.category_id)?.name || ''
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-2 w-7">
                        {selectModePrep ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={!!selectedPrep[r.id]}
                            onChange={e => setSelectedPrep(prev => ({ ...prev, [r.id]: e.target.checked }))}
                            title={t('SelectRow', lang) || 'Select row'}
                          />
                        ) : null}
                      </td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{catName || '-'}</td>
                      <td className="p-2">{typeLabel(r.type, lang) || '-'}</td>
                      <td className="p-2 text-center tabular-nums">{fmtDate(r.deleted_at)}</td>
                    </tr>
                  )
                })}
                {prepsFiltered.length === 0 && (
                  <tr>
                    <td className="p-3 text-gray-500" colSpan={5}>
                      {t('NoPreps', lang) || 'No items'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ============ EQUIPMENT ============ */}
      {tab === 'Equipment' && (
        <>
          {/* Filter bar */}
          <div className="bg-white rounded-2xl shadow p-3 mb-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder={t('FilterByName', lang) || 'Filter by name'}
                value={eqFilters.name}
                onChange={e => setEqFilters(s => ({ ...s, name: e.target.value }))}
                className="border rounded-lg px-2 h-9 text-sm text-gray-900 placeholder-gray-600 w-[200px]"
              />
              <select
                value={eqFilters.categoryId}
                onChange={e => setEqFilters(s => ({ ...s, categoryId: e.target.value }))}
                className="border rounded-lg px-2 h-9 text-sm bg-white text-gray-900 w-[200px]"
              >
                <option value="">{t('AllCategories', lang) || 'All categories'}</option>
                {eqCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                value={eqFilters.supplierId}
                onChange={e => setEqFilters(s => ({ ...s, supplierId: e.target.value }))}
                className="border rounded-lg px-2 h-9 text-sm bg-white text-gray-900 w-[200px]"
              >
                <option value="">{t('AllSuppliers', lang) || 'All suppliers'}</option>
                {sups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              <div className="ml-auto" />

              <button
                type="button"
                onClick={() => setEqFilters({ name: '', categoryId: '', supplierId: '' })}
                className="inline-flex items-center gap-1 px-3 h-9 rounded-lg border border-blue-600 text-blue-700 hover:bg-blue-50 overflow-hidden min-w-0"
                title={t('Clear', lang) || 'Clear'}
              >
                {t('Clear', lang) || 'Clear'}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow p-3">
            <table className="w-full table-auto text-sm text-gray-900">
              <thead>
                <tr>
                  <th className="p-2 w-7">
                    {selectModeEq ? (
                      <input
                        ref={headerCbEq}
                        type="checkbox"
                        checked={eqAllVisibleSelected}
                        onChange={toggleSelectAllVisibleEq}
                        className="h-4 w-4"
                        title={t('SelectAll', lang) || 'Select all'}
                      />
                    ) : null}
                  </th>
                  <th className="p-2 text-left">{t('Name', lang) || 'Name'}</th>
                  <th className="p-2 text-left">{t('Category', lang) || 'Category'}</th>
                  <th className="p-2 text-left">{t('Supplier', lang) || 'Supplier'}</th>
                  <th className="p-2 text-center">{t('Cost', lang) || 'Cost'}</th>
                  {vatEnabled && <th className="p-2 text-center">{t('VatRatePct', lang) || 'VAT %'}</th>}
                  <th className="p-2 text-center">{t('Markup', lang) || 'Markup ×'}</th>
                  <th className="p-2 text-center">{t('FinalPrice', lang) || 'Final price'}</th>
                  <th className="p-2 text-center">Deleted</th>
                </tr>
              </thead>
              <tbody>
                {eqsFiltered.map(r => {
                  const catName = eqCats.find(c => c.id === r.category_id)?.name || ''
                  const supName = sups.find(s => s.id === r.supplier_id)?.name || ''
                  const vatEff = vatEnabled ? (r.vat_rate_percent ?? (vatRate ?? 0)) : 0
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-2 w-7">
                        {selectModeEq ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={!!selectedEq[r.id]}
                            onChange={e => setSelectedEq(prev => ({ ...prev, [r.id]: e.target.checked }))}
                            title={t('SelectRow', lang) || 'Select row'}
                          />
                        ) : null}
                      </td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{catName || '-'}</td>
                      <td className="p-2">{supName || '-'}</td>
                      <td className="p-2 text-center tabular-nums">{r.cost != null ? num.format(r.cost) : '-'}</td>
                      {vatEnabled && <td className="p-2 text-center tabular-nums">{num.format(Math.max(0, Math.min(100, Number(vatEff))))}</td>}
                      <td className="p-2 text-center tabular-nums">{r.markup_x != null ? num.format(r.markup_x) : '-'}</td>

                      {/* FINAL PRICE calcolato come nella pagina Equipment: cost × markup × (1 + VAT%) */}
                      {(() => {
                        const markup = r.markup_x ?? 1
                        const base = r.cost != null ? Number(r.cost) * markup : null
                        const final = base == null ? null : base * (vatEnabled ? (1 + Number(vatEff) / 100) : 1)
                        return (
                          <td className="p-2 text-center tabular-nums">
                            {final != null ? num.format(final) : '-'}
                          </td>
                        )
                      })()}

                      <td className="p-2 text-center tabular-nums">{fmtDate(r.deleted_at)}</td>
                    </tr>
                  )
                })}
                {eqsFiltered.length === 0 && (
                  <tr>
                    <td className="p-3 text-gray-500" colSpan={vatEnabled ? 9 : 8}>
                      {t('NoEquipment', lang) || 'No items'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
