'use client'

import React, { useEffect, useState, useMemo, Suspense } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { PlusIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'
import ColumnHeader from '@/components/storehouse/ColumnHeader'
import { useSearchParams } from 'next/navigation'

interface Movement {
  id: string
  location_name: string
  item_name: string
  item_type: 'material' | 'prep'
  movement_type: string
  qty_entered: number
  unit_entered: string
  qty_base: number
  uom_base: string
  unit_cost: number
  total_value: number
  reason: string | null
  notes: string | null
  created_at: string
  created_by_name: string | null
}

interface Location {
  id: string
  name: string
}

interface CostingItem {
  id: string
  name: string
  type: 'material' | 'prep'
  uom: string
  packaging_size: number // o yield_qty per le Prep
  unit_cost: number
  category: string
}

const formatLiveNumber = (val: string): string => {
  let clean = val.replace(/[^0-9.]/g, '')
  const parts = clean.split('.')
  if (parts.length > 2) {
    clean = parts[0] + '.' + parts.slice(1).join('')
  }
  if (clean.includes('.')) {
    const [integerPart, decimalPart] = clean.split('.')
    const integerNum = parseInt(integerPart, 10)
    const formattedInteger = isNaN(integerNum) ? '' : integerNum.toLocaleString('en-US')
    return formattedInteger + '.' + decimalPart
  } else {
    const num = parseInt(clean, 10)
    return isNaN(num) ? '' : num.toLocaleString('en-US')
  }
}

const cleanFormattedNumber = (val: string): number => {
  if (!val) return 0
  const clean = val.replace(/,/g, '')
  return Number(clean) || 0
}

function StockMovementsContent() {
  const { language } = useSettings()
  const searchParams = useSearchParams()
  const branchId = searchParams.get('branchId') || 'all'
  const [locations, setLocations] = useState<Location[]>([])
  const [costingItems, setCostingItems] = useState<CostingItem[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [role, setRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Modale Movimento Manuale
  const [isManualModalOpen, setIsManualModalOpen] = useState(false)
  const [selectedLocId, setSelectedLocId] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [movementType, setMovementType] = useState<'manual_receipt' | 'positive_adjustment' | 'negative_adjustment'>('manual_receipt')
  const [qtyEntered, setQtyEntered] = useState('')
  const [unitEntered, setUnitEntered] = useState('uom') // 'uom' | 'package' | 'batch'
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Modale Opening Stock (Workflow separato)
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false)
  const [opLocId, setOpLocId] = useState('')
  const [opItemId, setOpItemId] = useState('')
  const [opQtyWhole, setOpQtyWhole] = useState('') // packages o batches intere
  const [opQtyPartial, setOpQtyPartial] = useState('') // quantità residua/parziale in UOM base
  const [opInputType, setOpInputType] = useState<'uom' | 'pack_batch'>('uom')
  const [opErrorMsg, setOpErrorMsg] = useState('')

  // Table Sort and Filter
  const [sortCol, setSortCol] = useState('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [openHeaderKey, setOpenHeaderKey] = useState<string | null>(null)
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({})

  useEffect(() => {
    async function loadInitial() {
      try {
        setLoading(true)
        const { data: userRes } = await supabase.auth.getUser()
        if (userRes?.user) {
          setUserId(userRes.user.id)
          const { data: acc } = await supabase
            .from('app_accounts')
            .select('role')
            .eq('user_id', userRes.user.id)
            .single()
          setRole(acc?.role || 'staff')
        }

        // 0. Auto-pulizia orfani per i trasferimenti cancellati storici
        await supabase.rpc('cleanup_cancelled_transfers')

        // Carica locations
        let locQuery = supabase
          .from('storehouse_locations')
          .select('id, name')
          .eq('is_active', true)
          .order('name')
        if (branchId && branchId !== 'all') {
          locQuery = locQuery.eq('branch_id', branchId)
        }
        const { data: locs } = await locQuery
        setLocations(locs || [])
        if (locs && locs.length > 0) {
          setSelectedLocId(locs[0].id)
          setOpLocId(locs[0].id)
        }

        // Carica anagrafica costing
        const [matsRes, prepsRes] = await Promise.all([
          supabase.from('materials').select('id, name, brand, packaging_size, unit_cost, categories(name), uom(name)').is('deleted_at', null),
          supabase.from('prep_recipes').select('id, name, yield_qty, cost_per_unit_vnd, recipe_categories(name), uom(name)').is('deleted_at', null)
        ])

        const mats: CostingItem[] = (matsRes.data || []).map((m: any) => ({
          id: m.id,
          name: m.name + (m.brand && m.brand.toLowerCase() !== 'unknown' ? ` (${m.brand})` : ''),
          type: 'material',
          uom: m.uom?.name || 'unit',
          packaging_size: Number(m.packaging_size || 1),
          unit_cost: Number(m.unit_cost || 0),
          category: m.categories?.name || '-',
        }))

        const preps: CostingItem[] = (prepsRes.data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          type: 'prep',
          uom: p.uom?.name || 'gr',
          packaging_size: Number(p.yield_qty || 1),
          unit_cost: Number(p.cost_per_unit_vnd || 0),
          category: p.recipe_categories?.name || '-',
        }))

        setCostingItems([...mats, ...preps])

        // Carica ledger movimenti
        await loadMovements([...mats, ...preps], locs || [])
      } catch (err) {
        console.error('Error loading movements page initial data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadInitial()
  }, [])

  const loadMovements = async (itemsList?: CostingItem[], currentLocs?: Location[]) => {
    try {
      const activeItems = itemsList || costingItems
      const { data, error } = await supabase
        .from('storehouse_movements')
        .select(`
          id,
          location_id,
          storehouse_locations(name),
          item_type,
          item_id,
          movement_type,
          qty_entered,
          unit_entered,
          qty_base,
          uom_base,
          unit_cost,
          total_value,
          reason,
          notes,
          created_at,
          created_by
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      let list = data || []
      const locList = currentLocs || locations
      if (branchId && branchId !== 'all') {
        const allowedLocIds = locList.map(l => l.id)
        list = list.filter(m => allowedLocIds.includes(m.location_id))
      }

      // Carichiamo anche i nomi dei creatori in modo sicuro
      const { data: accounts } = await supabase.from('app_accounts').select('user_id, name')
      const userMap: Record<string, string> = {}
      ;(accounts || []).forEach(a => {
        if (a.user_id) userMap[a.user_id] = a.name || ''
      })

      const formatted: Movement[] = (list || []).map((m: any) => {
        const itemInfo = activeItems.find(x => x.id === m.item_id && x.type === m.item_type)
        return {
          id: m.id,
          location_name: m.storehouse_locations?.name || '-',
          item_name: itemInfo ? itemInfo.name : `ID: ${m.item_id.slice(0, 8)}`,
          item_type: m.item_type,
          movement_type: m.movement_type,
          qty_entered: Number(m.qty_entered),
          unit_entered: m.unit_entered,
          qty_base: Number(m.qty_base),
          uom_base: m.uom_base,
          unit_cost: Number(m.unit_cost),
          total_value: Number(m.total_value),
          reason: m.reason,
          notes: m.notes,
          created_at: m.created_at,
          created_by_name: userMap[m.created_by] || m.created_by || '-'
        }
      })

      setMovements(formatted)
    } catch (err) {
      console.error('Error loading movements:', err)
    }
  }

  // Carichiamo i dettagli non appena gli item di costing sono pronti
  useEffect(() => {
    if (costingItems.length > 0 && movements.length > 0 && movements[0].item_name === '-') {
      loadMovements()
    }
  }, [costingItems, movements])

  const selectedItemInfo = useMemo(() => {
    return costingItems.find(x => x.id === selectedItemId)
  }, [selectedItemId, costingItems])

  const opSelectedItemInfo = useMemo(() => {
    return costingItems.find(x => x.id === opItemId)
  }, [opItemId, costingItems])

  // Calcolo teorico della conversione manuale
  const manualConversionQty = useMemo(() => {
    const qty = cleanFormattedNumber(qtyEntered)
    if (isNaN(qty) || qty <= 0 || !selectedItemInfo) return 0
    if (unitEntered === 'package' || unitEntered === 'batch') {
      return qty * selectedItemInfo.packaging_size
    }
    return qty
  }, [qtyEntered, unitEntered, selectedItemInfo])

  // Calcolo teorico dell'Opening Balance
  const opConversionQty = useMemo(() => {
    if (!opSelectedItemInfo) return 0
    if (opInputType === 'uom') {
      const q = cleanFormattedNumber(opQtyPartial)
      return isNaN(q) || q < 0 ? 0 : q
    } else {
      const whole = cleanFormattedNumber(opQtyWhole)
      const part = cleanFormattedNumber(opQtyPartial)
      const wVal = isNaN(whole) || whole < 0 ? 0 : whole
      const pVal = isNaN(part) || part < 0 ? 0 : part
      return (wVal * opSelectedItemInfo.packaging_size) + pVal
    }
  }, [opQtyWhole, opQtyPartial, opInputType, opSelectedItemInfo])

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || !selectedLocId || !selectedItemId || !selectedItemInfo) return
    setErrorMsg('')

    const qty = cleanFormattedNumber(qtyEntered)
    if (isNaN(qty) || qty <= 0) {
      setErrorMsg(language === 'vi' ? 'Vui lòng nhập số lượng hợp lệ' : 'Please enter a valid quantity')
      return
    }

    // Per i movimenti negativi invertiamo la quantità base
    const sign = movementType === 'negative_adjustment' ? -1 : 1
    const qtyBase = manualConversionQty * sign
    const totalVal = qtyBase * selectedItemInfo.unit_cost

    const payload = {
      location_id: selectedLocId,
      item_type: selectedItemInfo.type,
      item_id: selectedItemId,
      movement_type: movementType,
      qty_entered: qty,
      unit_entered: unitEntered === 'uom' ? selectedItemInfo.uom : unitEntered,
      qty_base: qtyBase,
      uom_base: selectedItemInfo.uom,
      unit_cost: selectedItemInfo.unit_cost,
      total_value: totalVal,
      reason: reason.trim() || null,
      notes: notes.trim() || null,
      created_by: userId,
      created_at: new Date().toISOString()
    }

    try {
      const { data, error } = await supabase
        .from('storehouse_movements')
        .insert([payload])
        .select()

      if (error) throw error
      setIsManualModalOpen(false)
      loadMovements()
    } catch (err: any) {
      setErrorMsg(err.message || 'Error inserting stock movement')
    }
  }

  // Salva Opening Stock
  const handleSaveOpening = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || !opLocId || !opItemId || !opSelectedItemInfo) return
    setOpErrorMsg('')

    if (opConversionQty <= 0) {
      setOpErrorMsg(language === 'vi' ? 'Vui lòng nhập số lượng lớn hơn 0' : 'Please enter a quantity greater than 0')
      return
    }

    try {
      // 1. Controlla se esiste già un opening balance per questo item e location
      const { data: exist, error: chkErr } = await supabase
        .from('storehouse_movements')
        .select('id')
        .eq('location_id', opLocId)
        .eq('item_type', opSelectedItemInfo.type)
        .eq('item_id', opItemId)
        .eq('movement_type', 'opening_balance')
        .limit(1)

      if (chkErr) throw chkErr
      if (exist && exist.length > 0) {
        setOpErrorMsg(
          language === 'vi'
            ? 'Số dư đầu kỳ đã được thiết lập cho mặt hàng này tại kho này. Vui lòng sử dụng điều chỉnh để thay đổi.'
            : 'Opening balance already exists for this item at this location. Please use adjustments to correct it.'
        )
        return
      }

      // 2. Inserisci il movimento
      const payload = {
        location_id: opLocId,
        item_type: opSelectedItemInfo.type,
        item_id: opItemId,
        movement_type: 'opening_balance',
        qty_entered: opInputType === 'uom' ? opConversionQty : cleanFormattedNumber(opQtyWhole),
        unit_entered: opInputType === 'uom' ? opSelectedItemInfo.uom : (opSelectedItemInfo.type === 'material' ? 'package' : 'batch'),
        qty_base: opConversionQty,
        uom_base: opSelectedItemInfo.uom,
        unit_cost: opSelectedItemInfo.unit_cost,
        total_value: opConversionQty * opSelectedItemInfo.unit_cost,
        reason: 'Opening Balance Initialization',
        notes: opInputType === 'pack_batch' && cleanFormattedNumber(opQtyPartial) > 0 ? `Residual partial: ${opQtyPartial} ${opSelectedItemInfo.uom}` : null,
        created_by: userId,
        created_at: new Date().toISOString()
      }

      const { error: insErr } = await supabase
        .from('storehouse_movements')
        .insert([payload])

      if (insErr) throw insErr

      setIsOpeningModalOpen(false)
      loadMovements()
    } catch (err: any) {
      setOpErrorMsg(err.message || 'Error initializing opening stock')
    }
  }

  const handleSort = (col: string, asc: boolean) => {
    setSortCol(col)
    setSortAsc(asc)
  }

  const handleFilterChange = (col: string, selected: Set<string> | null) => {
    setFilters(prev => ({ ...prev, [col]: selected }))
  }

  // Filtraggio e Ordinamento della tabella
  const handleFilterAndSort = useMemo(() => {
    let result = [...movements]

    // Applica filtri
    Object.entries(filters).forEach(([col, set]) => {
      if (!set) return
      result = result.filter(item => {
        let val = ''
        if (col === 'location') val = item.location_name
        else if (col === 'type') val = item.movement_type
        else if (col === 'item_type') val = item.item_type
        return set.has(val)
      })
    })

    // Ordina
    result.sort((a, b) => {
      let valA: any = a[sortCol as keyof Movement] ?? ''
      let valB: any = b[sortCol as keyof Movement] ?? ''

      if (sortCol === 'qty_base') {
        valA = a.qty_base
        valB = b.qty_base
      } else if (sortCol === 'total_value') {
        valA = a.total_value
        valB = b.total_value
      } else if (sortCol === 'created_at') {
        valA = new Date(a.created_at).getTime()
        valB = new Date(b.created_at).getTime()
      }

      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
      }
      return sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1)
    })

    return result
  }, [movements, filters, sortCol, sortAsc])

  // Valori unici per i filtri delle colonne
  const locationValues = useMemo(() => Array.from(new Set(movements.map(m => m.location_name))), [movements])
  const typeValues = useMemo(() => Array.from(new Set(movements.map(m => m.movement_type))), [movements])
  const itemTypeValues = useMemo(() => ['material', 'prep'], [])

  const movementLabel = (type: string) => {
    switch (type) {
      case 'opening_balance':
        return { label: language === 'vi' ? 'Số dư đầu kỳ' : 'Opening Balance', color: 'text-blue-700 bg-blue-50 border-blue-200' }
      case 'manual_receipt':
        return { label: language === 'vi' ? 'Nhập kho thủ công' : 'Manual Receipt', color: 'text-green-700 bg-green-50 border-green-200' }
      case 'positive_adjustment':
        return { label: language === 'vi' ? 'Điều chỉnh tăng' : 'Positive Adj', color: 'text-emerald-700 bg-emerald-55/60 border-emerald-200' }
      case 'negative_adjustment':
        return { label: language === 'vi' ? 'Điều chỉnh giảm' : 'Negative Adj', color: 'text-red-700 bg-red-50 border-red-200' }
      case 'production_consumption':
        return { label: language === 'vi' ? 'Hao hụt sản xuất' : 'Prod Consumption', color: 'text-purple-700 bg-purple-50 border-purple-200' }
      case 'production_output':
        return { label: language === 'vi' ? 'Thành phẩm sản xuất' : 'Prod Output', color: 'text-pink-700 bg-pink-50 border-pink-200' }
      case 'stock_count_adjustment':
        return { label: language === 'vi' ? 'Lệch kiểm kê' : 'Stock Count Adj', color: 'text-amber-700 bg-amber-50 border-amber-200' }
      default:
        return { label: type, color: 'text-slate-700 bg-slate-50 border-slate-200' }
    }
  }

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(
      d.getHours()
    ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const dict = {
    sortAsc: language === 'vi' ? 'Sắp xếp tăng dần' : 'Sort Ascending',
    sortDesc: language === 'vi' ? 'Sắp xếp giảm dần' : 'Sort Descending',
    selectAll: language === 'vi' ? 'Chọn tất cả' : 'Select All',
    deselectAll: language === 'vi' ? 'Bỏ chọn tất cả' : 'Clear Selection',
    filterPlaceholder: language === 'vi' ? 'Tìm kiếm...' : 'Search...',
    clearFilters: language === 'vi' ? 'Xóa bộ lọc' : 'Clear Filters',
  }

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header e Bottoni */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{t(language, 'StockMovements')}</h1>
          <p className="text-sm text-slate-400">
            {language === 'vi'
              ? 'Lịch sử và nhật ký thay đổi số lượng kho (Movement Ledger)'
              : 'Audit log of stock quantity changes (Movement Ledger)'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsOpeningModalOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 px-4 h-11 text-sm font-semibold text-slate-200 transition-colors shadow-xs cursor-pointer animate-duration-150"
          >
            <ArrowPathIcon className="w-4 h-4" />
            {language === 'vi' ? 'Khởi tạo Số dư' : 'Opening Stock'}
          </button>
          <button
            onClick={() => setIsManualModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 h-11 text-sm font-semibold text-white transition-colors shadow-sm cursor-pointer animate-duration-150"
          >
            <PlusIcon className="w-4 h-4" />
            {language === 'vi' ? 'Giao dịch thủ công' : 'Manual Movement'}
          </button>
        </div>
      </div>

      {/* Tabella Storico Movimenti: Sfondo Bianco e Testo Chiaro/Scuro coerente */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow p-3 overflow-hidden text-gray-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-slate-550 font-semibold">
                <ColumnHeader
                  colKey="location"
                  label={language === 'vi' ? 'Kho hàng' : 'Location'}
                  sortCol={sortCol}
                  sortAsc={sortAsc}
                  onSort={handleSort}
                  values={locationValues}
                  activeFilter={filters['location'] || null}
                  onFilter={vals => handleFilterChange('location', vals)}
                  onClear={() => handleFilterChange('location', null)}
                  open={openHeaderKey === 'location'}
                  onToggle={() => setOpenHeaderKey(openHeaderKey === 'location' ? null : 'location')}
                  onClose={() => setOpenHeaderKey(null)}
                  dict={dict}
                  className="hover:bg-gray-150 text-slate-550 font-bold"
                />
                <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {language === 'vi' ? 'Mặt hàng' : 'Item'}
                </th>
                <ColumnHeader
                  colKey="item_type"
                  label={language === 'vi' ? 'Loại' : 'Type'}
                  sortCol={sortCol}
                  sortAsc={sortAsc}
                  onSort={handleSort}
                  values={itemTypeValues}
                  activeFilter={filters['item_type'] || null}
                  onFilter={vals => handleFilterChange('item_type', vals)}
                  onClear={() => handleFilterChange('item_type', null)}
                  open={openHeaderKey === 'item_type'}
                  onToggle={() => setOpenHeaderKey(openHeaderKey === 'item_type' ? null : 'item_type')}
                  onClose={() => setOpenHeaderKey(null)}
                  dict={dict}
                  className="hover:bg-gray-150 text-slate-550 font-bold"
                />
                <ColumnHeader
                  colKey="type"
                  label={language === 'vi' ? 'Loại giao dịch' : 'Movement Type'}
                  sortCol={sortCol}
                  sortAsc={sortAsc}
                  onSort={handleSort}
                  values={typeValues}
                  activeFilter={filters['type'] || null}
                  onFilter={vals => handleFilterChange('type', vals)}
                  onClear={() => handleFilterChange('type', null)}
                  open={openHeaderKey === 'type'}
                  onToggle={() => setOpenHeaderKey(openHeaderKey === 'type' ? null : 'type')}
                  onClose={() => setOpenHeaderKey(null)}
                  dict={dict}
                  className="hover:bg-gray-150 text-slate-550 font-bold"
                />
                <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">
                  {language === 'vi' ? 'SL Nhập' : 'Entered Qty'}
                </th>
                <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">
                  {language === 'vi' ? 'Số lượng (gốc)' : 'Base Qty'}
                </th>
                <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">
                  {language === 'vi' ? 'Đơn giá' : 'Unit Cost'}
                </th>
                <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">
                  {language === 'vi' ? 'Giá trị' : 'Value'}
                </th>
                <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {language === 'vi' ? 'Thời gian' : 'Timestamp'}
                </th>
                <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {language === 'vi' ? 'Người thực hiện' : 'Created By'}
                </th>
              </tr>
            </thead>
            <tbody>
              {handleFilterAndSort.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                    {language === 'vi' ? 'Không có giao dịch nào được ghi nhận' : 'No movements recorded'}
                  </td>
                </tr>
              ) : (
                handleFilterAndSort.map((mov, idx) => {
                  const labelCfg = movementLabel(mov.movement_type)
                  const isNeg = mov.qty_base < 0
                  
                  return (
                    <tr key={mov.id + idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-3 font-semibold text-gray-700">{mov.location_name}</td>
                      <td className="p-3 font-semibold text-gray-900">{mov.item_name}</td>
                      <td className="p-3 text-gray-650 capitalize">
                        {mov.item_type === 'material' ? t(language, 'Materials') : t(language, 'Prep')}
                      </td>
                      <td className="p-3 text-sm">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${labelCfg.color}`}>
                          {labelCfg.label}
                        </span>
                      </td>
                      <td className="p-3 text-right text-gray-750 font-medium">
                        {mov.qty_entered.toLocaleString()} <span className="text-xs text-slate-500 font-normal">{mov.unit_entered}</span>
                      </td>
                      <td className={`p-3 font-bold text-right ${isNeg ? 'text-red-650' : 'text-green-700'}`}>
                        {mov.qty_base > 0 ? '+' : ''}{mov.qty_base.toLocaleString()} <span className="text-xs font-normal text-slate-500">{mov.uom_base}</span>
                      </td>
                      <td className="p-3 text-right text-gray-650">
                        {mov.unit_cost.toLocaleString()} <span className="text-xs text-slate-500">VND</span>
                      </td>
                      <td className="p-3 font-bold text-right text-gray-800">
                        {mov.total_value.toLocaleString()} <span className="text-xs text-slate-500">VND</span>
                      </td>
                      <td className="p-3 text-xs text-gray-600">{formatDateTime(mov.created_at)}</td>
                      <td className="p-3 text-gray-650">{mov.created_by_name || '-'}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Movimento Manuale */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/80 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden border border-slate-100 shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between text-gray-900">
              <h3 className="text-lg font-bold text-gray-900">
                {language === 'vi' ? 'Tạo giao dịch thủ công' : 'Create Manual Movement'}
              </h3>
              <button onClick={() => setIsManualModalOpen(false)} className="text-slate-400 hover:text-slate-650 transition-colors text-sm font-semibold">
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSaveManual} className="p-6 space-y-4 text-gray-900">
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  {language === 'vi' ? 'Chi nhánh/Kho *' : 'Location *'}
                </label>
                <select
                  value={selectedLocId}
                  onChange={e => setSelectedLocId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none bg-white"
                  required
                >
                  <option value="">{language === 'vi' ? '-- Chọn kho --' : '-- Select Location --'}</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  {language === 'vi' ? 'Mặt hàng (Nguyên liệu/Bán thành phẩm) *' : 'Item (Materials/Prep) *'}
                </label>
                <select
                  value={selectedItemId}
                  onChange={e => {
                    setSelectedItemId(e.target.value)
                    setUnitEntered('uom')
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none bg-white"
                  required
                >
                  <option value="">{language === 'vi' ? '-- Chọn mặt hàng --' : '-- Select Item --'}</option>
                  {costingItems.map(item => (
                    <option key={item.id} value={item.id}>
                      [{item.type === 'material' ? 'M' : 'P'}] {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  {language === 'vi' ? 'Loại giao dịch *' : 'Movement Type *'}
                </label>
                <select
                  value={movementType}
                  onChange={e => setMovementType(e.target.value as any)}
                  className="w-full border border-slate-200 rounded-lg px-3 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none bg-white"
                  required
                >
                  <option value="manual_receipt">{language === 'vi' ? 'Nhập kho thủ công' : 'Manual Receipt'}</option>
                  <option value="positive_adjustment">{language === 'vi' ? 'Điều chỉnh tăng (+)' : 'Positive Adjustment (+)'}</option>
                  <option value="negative_adjustment">{language === 'vi' ? 'Điều chỉnh giảm (-)' : 'Negative Adjustment (-)'}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    {language === 'vi' ? 'Số lượng *' : 'Quantity *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={qtyEntered}
                    onChange={e => setQtyEntered(formatLiveNumber(e.target.value))}
                    className="w-full border border-slate-200 rounded-lg px-3 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-550 mb-1">
                    {language === 'vi' ? 'Đơn vị nhập *' : 'Unit *'}
                  </label>
                  <select
                    value={unitEntered}
                    onChange={e => setUnitEntered(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none bg-white"
                  >
                    <option value="uom">
                      {selectedItemInfo ? `${selectedItemInfo.uom} (Base)` : 'Base UOM'}
                    </option>
                    {selectedItemInfo?.type === 'material' && (
                      <option value="package">{language === 'vi' ? 'Gói/Hộp (Package)' : 'Package'}</option>
                    )}
                    {selectedItemInfo?.type === 'prep' && (
                      <option value="batch">{language === 'vi' ? 'Mẻ (Batch)' : 'Batch'}</option>
                    )}
                  </select>
                </div>
              </div>

              {selectedItemInfo && qtyEntered && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                  <span className="font-bold">
                    {language === 'vi' ? 'Quy đổi cơ bản:' : 'Converted Qty:'}
                  </span>{' '}
                  {manualConversionQty.toLocaleString()} {selectedItemInfo.uom} 
                  <span className="mx-2 font-normal">|</span>
                  <span className="font-bold">
                    {language === 'vi' ? 'Đơn giá:' : 'Cost:'}
                  </span>{' '}
                  {selectedItemInfo.unit_cost.toLocaleString()} VND 
                  <span className="mx-2 font-normal">|</span>
                  <span className="font-bold">
                    {language === 'vi' ? 'Thành tiền:' : 'Total:'}
                  </span>{' '}
                  {(manualConversionQty * selectedItemInfo.unit_cost).toLocaleString()} VND
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  {language === 'vi' ? 'Lý do' : 'Reason'}
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none"
                  placeholder={language === 'vi' ? 'Ví dụ: Nhập hàng bổ sung' : 'e.g. Inbound shipment'}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-550 mb-1">
                  {language === 'vi' ? 'Ghi chú' : 'Notes'}
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-3 h-20 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none resize-none"
                  placeholder="..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 h-11 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-bold transition-colors cursor-pointer inline-flex items-center justify-center"
                >
                  {language === 'vi' ? 'Hủy' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 h-10 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm cursor-pointer"
                >
                  {language === 'vi' ? 'Xác nhận' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Opening Balance (Workflow) */}
      {isOpeningModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/80 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden border border-slate-100 shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between text-gray-900">
              <h3 className="text-lg font-bold text-gray-900">
                {language === 'vi' ? 'Khởi tạo số dư tồn kho' : 'Initialize Opening Stock'}
              </h3>
              <button onClick={() => setIsOpeningModalOpen(false)} className="text-slate-400 hover:text-slate-650 transition-colors text-sm font-semibold">
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSaveOpening} className="p-6 space-y-4 text-gray-900">
              {opErrorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
                  {opErrorMsg}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  {language === 'vi' ? 'Chi nhánh/Kho *' : 'Location *'}
                </label>
                <select
                  value={opLocId}
                  onChange={e => setOpLocId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none bg-white"
                  required
                >
                  <option value="">{language === 'vi' ? '-- Chọn kho --' : '-- Select Location --'}</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  {language === 'vi' ? 'Mặt hàng cần mở số dư *' : 'Item *'}
                </label>
                <select
                  value={opItemId}
                  onChange={e => {
                    setOpItemId(e.target.value)
                    setOpQtyWhole('')
                    setOpQtyPartial('')
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none bg-white"
                  required
                >
                  <option value="">{language === 'vi' ? '-- Chọn mặt hàng --' : '-- Select Item --'}</option>
                  {costingItems.map(item => (
                    <option key={item.id} value={item.id}>
                      [{item.type === 'material' ? 'M' : 'P'}] {item.name}
                    </option>
                  ))}
                </select>
              </div>

              {opSelectedItemInfo && (
                <>
                  <div className="flex gap-4 p-2 bg-slate-55 rounded-xl border border-slate-200 justify-center">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="opInputType"
                        checked={opInputType === 'uom'}
                        onChange={() => setOpInputType('uom')}
                        className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      {language === 'vi' ? 'Đơn vị cơ bản' : 'Base UOM'}
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="opInputType"
                        checked={opInputType === 'pack_batch'}
                        onChange={() => setOpInputType('pack_batch')}
                        className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      {opSelectedItemInfo.type === 'material'
                        ? (language === 'vi' ? 'Gói + Lẻ' : 'Package + Partial')
                        : (language === 'vi' ? 'Mẻ + Lẻ' : 'Batch + Partial')}
                    </label>
                  </div>

                  {opInputType === 'uom' ? (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        {language === 'vi' ? 'Số lượng' : 'Quantity'} ({opSelectedItemInfo.uom})
                      </label>
                      <input
                        type="text"
                        required
                        value={opQtyPartial}
                        onChange={e => setOpQtyPartial(formatLiveNumber(e.target.value))}
                        className="w-full border border-slate-200 rounded-lg px-3 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          {opSelectedItemInfo.type === 'material' ? 'Packages' : 'Batches'}
                        </label>
                        <input
                          type="text"
                          required
                          value={opQtyWhole}
                          onChange={e => setOpQtyWhole(formatLiveNumber(e.target.value))}
                          className="w-full border border-slate-200 rounded-lg px-3 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          {language === 'vi' ? 'Số lẻ' : 'Partial'} ({opSelectedItemInfo.uom})
                        </label>
                        <input
                          type="text"
                          value={opQtyPartial}
                          onChange={e => setOpQtyPartial(formatLiveNumber(e.target.value))}
                          className="w-full border border-slate-200 rounded-lg px-3 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}

                  {opConversionQty > 0 && (
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                      <span className="font-bold">
                        {language === 'vi' ? 'Số dư khởi tạo (Base):' : 'Opening stock (Base):'}
                      </span>{' '}
                      {opConversionQty.toLocaleString()} {opSelectedItemInfo.uom}
                      <span className="mx-2 font-normal">|</span>
                      <span className="font-bold">
                        {language === 'vi' ? 'Giá trị:' : 'Value:'}
                      </span>{' '}
                      {(opConversionQty * opSelectedItemInfo.unit_cost).toLocaleString()} VND
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOpeningModalOpen(false)}
                  className="px-4 h-10 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  {language === 'vi' ? 'Hủy' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 h-10 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm cursor-pointer"
                >
                  {language === 'vi' ? 'Xác nhận khởi tạo' : 'Initialize'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function StockMovementsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-transparent">
        <CircularLoader />
      </div>
    }>
      <StockMovementsContent />
    </Suspense>
  )
}
