'use client'

import React, { useEffect, useState, useMemo, Suspense } from 'react'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'
import ColumnHeader from '@/components/storehouse/ColumnHeader'
import { BeakerIcon, ArchiveBoxIcon, ExclamationTriangleIcon, CheckCircleIcon, XCircleIcon, MinusCircleIcon, QuestionMarkCircleIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { useSearchParams } from 'next/navigation'

interface StockItem {
  id: string
  name: string
  item_type: 'material' | 'prep'
  category: string
  brand: string
  location_id: string
  location_name: string
  location_code: string
  current_qty: number
  uom: string
  packaging_size: number // yield_qty per le Prep
  equivalent_value: number // package equivalent o batch equivalent
  unit_cost: number
  stock_value: number
  min_stock: number
  par_level: number
  status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'negative_stock' | 'not_configured'
  last_count_at: string | null
  last_movement_at: string | null
  batches?: any[]
  track_batch?: boolean
  track_expiry?: boolean
}

interface Location {
  id: string
  name: string
  code: string
}

const getLocationColor = (code: string) => {
  const upper = code.toUpperCase()
  if (upper.includes('PFG')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
  if (upper.includes('PFT')) {
    return 'bg-amber-50 text-amber-700 border-amber-200'
  }
  if (upper.includes('PFD')) {
    return 'bg-rose-50 text-rose-700 border-rose-200'
  }

  // Fallback deterministico per magazzini custom
  let hash = 0
  for (let i = 0; i < code.length; i++) {
    hash = code.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % 5
  const palettes = [
    'bg-blue-50 text-blue-700 border-blue-200',
    'bg-fuchsia-50 text-fuchsia-750 border-fuchsia-200',
    'bg-indigo-50 text-indigo-705 border-indigo-200',
    'bg-cyan-50 text-cyan-700 border-cyan-200',
    'bg-purple-50 text-purple-700 border-purple-200',
  ]
  return palettes[index]
}

function CurrentStockContent() {
  const { language } = useSettings()
  const searchParams = useSearchParams()
  const branchId = searchParams.get('branchId') || 'all'
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocId, setSelectedLocId] = useState<string>('all')
  const [stockList, setStockList] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)

  // Table sorting and filtering states
  const [sortCol, setSortCol] = useState('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [openHeaderKey, setOpenHeaderKey] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})

  const toggleExpandItem = (key: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({})
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function loadLocations() {
      try {
        let query = supabase
          .from('storehouse_locations')
          .select('id, name, code')
          .eq('is_active', true)
          .order('name')
        if (branchId && branchId !== 'all') {
          query = query.eq('branch_id', branchId)
        }
        const { data } = await query
        setLocations(data || [])
      } catch (err) {
        console.error('Error loading locations:', err)
      }
    }
    loadLocations()
  }, [branchId])

  useEffect(() => {
    async function loadStock() {
      try {
        setLoading(true)

        // 1. Carica tutti i Materials e le Prep dal Costing per avere l'anagrafica completa e aggiornata
        const [matsRes, prepsRes, setupRes, movsRes, countsRes, batchesRes] = await Promise.all([
          supabase.from('materials').select('id, name, brand, packaging_size, unit_cost, categories(name), uom(name)').is('deleted_at', null),
          supabase.from('prep_recipes').select('id, name, yield_qty, cost_per_unit_vnd, recipe_categories(name), uom(name)').is('deleted_at', null),
          supabase.from('storehouse_inventory_setup').select('*'),
          // Carichiamo tutti i movimenti per fare il calcolo real-time della giacenza
          supabase.from('storehouse_movements').select('location_id, item_type, item_id, qty_base, created_at').order('created_at', { ascending: false }),
          // Carichiamo i dettagli dei conteggi fisici approvati per avere la data dell'ultimo conteggio
          supabase.from('storehouse_stock_counts')
            .select('id, location_id, approved_at, storehouse_stock_count_items(item_type, item_id)')
            .eq('status', 'approved')
            .not('approved_at', 'is', null),
          // Carichiamo tutti i lotti attivi
          supabase.from('storehouse_batches').select('*').gt('current_qty', 0).order('expiry_date', { ascending: true })
        ])

        const materials = matsRes.data || []
        const preps = prepsRes.data || []
        const setups = setupRes.data || []
        const movements = movsRes.data || []
        const approvedCounts = countsRes.data || []

        // Mappa delle locazioni per nome e codice
        let locQuery = supabase.from('storehouse_locations').select('id, name, code')
        if (branchId && branchId !== 'all') {
          locQuery = locQuery.eq('branch_id', branchId)
        }
        const { data: allLocs } = await locQuery
        const locMap: Record<string, { name: string; code: string }> = {}
        ;(allLocs || []).forEach(l => {
          locMap[l.id] = { name: l.name, code: l.code }
        })

        // Costruiamo la lista degli item da tracciare per ciascuna location
        const list: StockItem[] = []

        // Per ogni location attiva
        const activeLocations = allLocs || []
        
        activeLocations.forEach(loc => {
          // Seleziona solo la location cercata (se non 'all')
          if (selectedLocId !== 'all' && loc.id !== selectedLocId) return

          // Aggiungiamo i Materials
          materials.forEach((m: any) => {
            const setup = setups.find(s => s.location_id === loc.id && s.item_type === 'material' && s.item_id === m.id)
            
            // Giacenza = somma qty_base di tutti i movimenti di questa location per questo item
            const itemMovs = movements.filter(mov => mov.location_id === loc.id && mov.item_type === 'material' && mov.item_id === m.id)
            const currentQty = itemMovs.reduce((acc, mov) => acc + Number(mov.qty_base || 0), 0)
            const lastMovement = itemMovs.length > 0 ? itemMovs[0].created_at : null

            // Trova l'ultimo stock count approvato
            const lastCount = approvedCounts
              .filter(c => c.location_id === loc.id && c.storehouse_stock_count_items?.some((ci: any) => ci.item_type === 'material' && ci.item_id === m.id))
              .sort((a, b) => new Date(b.approved_at).getTime() - new Date(a.approved_at).getTime())
            const lastCountAt = lastCount.length > 0 ? lastCount[0].approved_at : null

            // Parametri setup
            const track = setup?.track_inventory ?? false
            const minStock = setup?.min_stock ?? 0
            const parLevel = setup?.par_level ?? 0

            // Calcolo equivalenti e valore stock
            const packagingSize = Number(m.packaging_size || 1)
            const equivVal = currentQty / packagingSize
            const unitCost = Number(m.unit_cost || 0)
            const stockValue = currentQty * unitCost

            // Calcolo dello stato stock
            let status: StockItem['status'] = 'not_configured'
            if (track) {
              if (currentQty < 0) status = 'negative_stock'
              else if (currentQty === 0) status = 'out_of_stock'
              else if (currentQty <= minStock) status = 'low_stock'
              else status = 'in_stock'
            }

            // Lotti di questo articolo
            const itemBatches = (batchesRes.data || []).filter(
              b => b.location_id === loc.id && b.item_type === 'material' && b.item_id === m.id
            )

            list.push({
              id: m.id,
              name: m.name, // Nome pulito senza brand aggregato
              brand: m.brand || '-', // Brand in colonna dedicata
              item_type: 'material',
              category: m.categories?.name || '-',
              location_id: loc.id,
              location_name: loc.name,
              location_code: loc.code,
              current_qty: currentQty,
              uom: m.uom?.name || 'unit',
              packaging_size: packagingSize,
              equivalent_value: equivVal,
              unit_cost: unitCost,
              stock_value: stockValue,
              min_stock: minStock,
              par_level: parLevel,
              status,
              last_count_at: lastCountAt,
              last_movement_at: lastMovement,
              batches: itemBatches,
              track_batch: setup?.track_batch ?? false,
              track_expiry: setup?.track_expiry ?? false,
            })
          })

          // Aggiungiamo le Prep
          preps.forEach((p: any) => {
            const setup = setups.find(s => s.location_id === loc.id && s.item_type === 'prep' && s.item_id === p.id)
            
            const itemMovs = movements.filter(mov => mov.location_id === loc.id && mov.item_type === 'prep' && mov.item_id === p.id)
            const currentQty = itemMovs.reduce((acc, mov) => acc + Number(mov.qty_base || 0), 0)
            const lastMovement = itemMovs.length > 0 ? itemMovs[0].created_at : null

            const lastCount = approvedCounts
              .filter(c => c.location_id === loc.id && c.storehouse_stock_count_items?.some((ci: any) => ci.item_type === 'prep' && ci.item_id === p.id))
              .sort((a, b) => new Date(b.approved_at).getTime() - new Date(a.approved_at).getTime())
            const lastCountAt = lastCount.length > 0 ? lastCount[0].approved_at : null

            const track = setup?.track_inventory ?? false
            const minStock = setup?.min_stock ?? 0
            const parLevel = setup?.par_level ?? 0

            const yieldQty = Number(p.yield_qty || 1)
            const equivVal = currentQty / yieldQty
            const unitCost = Number(p.cost_per_unit_vnd || 0)
            const stockValue = currentQty * unitCost

            let status: StockItem['status'] = 'not_configured'
            if (track) {
              if (currentQty < 0) status = 'negative_stock'
              else if (currentQty === 0) status = 'out_of_stock'
              else if (currentQty <= minStock) status = 'low_stock'
              else status = 'in_stock'
            }

            // Lotti di questo articolo
            const itemBatches = (batchesRes.data || []).filter(
              b => b.location_id === loc.id && b.item_type === 'prep' && b.item_id === p.id
            )

            list.push({
              id: p.id,
              name: p.name,
              brand: '-', // Le preparazioni interne non hanno un brand
              item_type: 'prep',
              category: p.recipe_categories?.name || '-',
              location_id: loc.id,
              location_name: loc.name,
              location_code: loc.code,
              current_qty: currentQty,
              uom: p.uom?.name || 'gr',
              packaging_size: yieldQty,
              equivalent_value: equivVal,
              unit_cost: unitCost,
              stock_value: stockValue,
              min_stock: minStock,
              par_level: parLevel,
              status,
              last_count_at: lastCountAt,
              last_movement_at: lastMovement,
              batches: itemBatches,
              track_batch: setup?.track_batch ?? false,
              track_expiry: setup?.track_expiry ?? false,
            })
          })
        })

        setStockList(list)
      } catch (err) {
        console.error('Error calculating current stock:', err)
      } finally {
        setLoading(false)
      }
    }

    loadStock()
  }, [selectedLocId])

  const handleSort = (col: string, asc: boolean) => {
    setSortCol(col)
    setSortAsc(asc)
  }

  const handleFilterChange = (col: string, selected: Set<string> | null) => {
    setFilters(prev => ({ ...prev, [col]: selected }))
  }

  // Filtraggio e Ordinamento dei Dati
  const filteredAndSortedStock = useMemo(() => {
    let result = [...stockList]

    // Cerca per nome o brand
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(item => 
        item.name.toLowerCase().includes(q) || 
        item.brand.toLowerCase().includes(q)
      )
    }

    // Applica filtri a colonne
    Object.entries(filters).forEach(([col, set]) => {
      if (!set) return
      result = result.filter(item => {
        let val = ''
        if (col === 'item_type') val = item.item_type
        else if (col === 'category') val = item.category
        else if (col === 'status') val = item.status
        else if (col === 'location') val = item.location_code // Filtra per codice
        else if (col === 'brand') val = item.brand
        return set.has(val)
      })
    })

    // Ordina
    result.sort((a, b) => {
      let valA: any = a[sortCol as keyof StockItem] ?? ''
      let valB: any = b[sortCol as keyof StockItem] ?? ''

      if (sortCol === 'current_qty') {
        valA = a.current_qty
        valB = b.current_qty
      } else if (sortCol === 'stock_value') {
        valA = a.stock_value
        valB = b.stock_value
      } else if (sortCol === 'location') {
        valA = a.location_code
        valB = b.location_code
      }

      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
      }
      return sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1)
    })

    return result
  }, [stockList, filters, searchQuery, sortCol, sortAsc])

  // Valori unici per i filtri delle colonne
  const typeValues = useMemo(() => ['material', 'prep'], [])
  const categoryValues = useMemo(() => Array.from(new Set(stockList.map(i => i.category))), [stockList])
  const statusValues = useMemo(() => ['in_stock', 'low_stock', 'out_of_stock', 'negative_stock', 'not_configured'], [])
  const locationCodeValues = useMemo(() => Array.from(new Set(stockList.map(i => i.location_code))), [stockList])
  const brandValues = useMemo(() => Array.from(new Set(stockList.map(i => i.brand).filter(b => b !== '-'))), [stockList])

  // Badge Status: Estremamente colorati con Icone, compatti (vietato spezzare su 2 righe!)
  const statusLabel = (status: StockItem['status']) => {
    switch (status) {
      case 'in_stock':
        return {
          label: language === 'vi' ? 'Đủ hàng' : 'In Stock',
          color: 'bg-emerald-50 text-emerald-700 border-emerald-250',
          icon: <CheckCircleIcon className="w-3 h-3 text-emerald-600 shrink-0" />
        }
      case 'low_stock':
        return {
          label: language === 'vi' ? 'Sắp hết' : 'Low Stock',
          color: 'bg-amber-50 text-amber-700 border-amber-250 animate-pulse',
          icon: <ExclamationTriangleIcon className="w-3 h-3 text-amber-600 shrink-0" />
        }
      case 'out_of_stock':
        return {
          label: language === 'vi' ? 'Hết hàng' : 'Out of Stock',
          color: 'bg-rose-50 text-rose-700 border-rose-250',
          icon: <XCircleIcon className="w-3 h-3 text-rose-600 shrink-0" />
        }
      case 'negative_stock':
        return {
          label: language === 'vi' ? 'Tồn âm' : 'Below 0',
          color: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-250 font-bold',
          icon: <MinusCircleIcon className="w-3 h-3 text-fuchsia-600 shrink-0" />
        }
      default:
        return {
          // COMPATTO: Untracked / Tắt per occupare meno spazio orizzontale ed evitare doppie righe
          label: language === 'vi' ? 'Tắt' : 'Untracked',
          color: 'bg-slate-100 text-slate-500 border-slate-200',
          icon: <QuestionMarkCircleIcon className="w-3 h-3 text-slate-400 shrink-0" />
        }
    }
  }

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    const yy = String(d.getFullYear()).slice(-2)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${yy} ${String(
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
      {/* Header e Selezione Location */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{t(language, 'CurrentStock')}</h1>
          <p className="text-sm text-slate-400">
            {language === 'vi'
              ? 'Tình trạng tồn kho thực tế tính theo các giao dịch đã hoàn thành'
              : 'Real-time stock levels computed from confirmed transactions'}
          </p>
        </div>

        {/* Filtro Location in alto */}
        {branchId === 'all' && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {language === 'vi' ? 'Lọc chi nhánh' : 'Location'}:
            </label>
            <select
              value={selectedLocId}
              onChange={e => setSelectedLocId(e.target.value)}
              className="border border-white/10 rounded-xl px-3 h-11 text-sm font-semibold text-slate-200 bg-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 min-w-[200px]"
            >
              <option value="all">{language === 'vi' ? 'Tất cả các kho' : 'All Locations'}</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Riepilogo filtri */}
      {Object.values(filters).some(Boolean) && (
        <div className="flex justify-end">
          <button
            onClick={() => setFilters({})}
            className="text-xs font-semibold text-blue-400 hover:text-blue-500 cursor-pointer bg-slate-900/40 px-3 py-1.5 rounded-lg border border-white/10"
          >
            {language === 'vi' ? 'Xóa tất cả lọc' : 'Clear All Filters'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex h-[300px] w-full items-center justify-center">
          <CircularLoader />
        </div>
      ) : (
        /* Tabella Giacenze: Sfondo Bianco e Design Vibrant (Coerente con Costing, con molti Badge e Icone) */
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-3 overflow-hidden text-gray-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-auto text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-slate-550 font-semibold">
                  <th className="w-[40px] py-3 px-2"></th>
                  <ColumnHeader
                    colKey="name"
                    label={language === 'vi' ? 'Mặt hàng' : 'Item'}
                    sortCol={sortCol}
                    sortAsc={sortAsc}
                    onSort={handleSort}
                    values={Array.from(new Set(stockList.map(i => i.name)))}
                    activeFilter={filters['name'] || null}
                    onFilter={vals => handleFilterChange('name', vals)}
                    onClear={() => handleFilterChange('name', null)}
                    open={openHeaderKey === 'name'}
                    onToggle={() => setOpenHeaderKey(openHeaderKey === 'name' ? null : 'name')}
                    onClose={() => setOpenHeaderKey(null)}
                    dict={dict}
                    className="hover:bg-gray-150 text-slate-500 font-bold py-3 px-2"
                  />
                  <ColumnHeader
                    colKey="brand"
                    label={language === 'vi' ? 'Thương hiệu' : 'Brand'}
                    sortCol={sortCol}
                    sortAsc={sortAsc}
                    onSort={handleSort}
                    values={brandValues}
                    activeFilter={filters['brand'] || null}
                    onFilter={vals => handleFilterChange('brand', vals)}
                    onClear={() => handleFilterChange('brand', null)}
                    open={openHeaderKey === 'brand'}
                    onToggle={() => setOpenHeaderKey(openHeaderKey === 'brand' ? null : 'brand')}
                    onClose={() => setOpenHeaderKey(null)}
                    dict={dict}
                    className="hover:bg-gray-150 text-slate-500 font-bold py-3 px-2 w-[120px]"
                  />
                  <ColumnHeader
                    colKey="item_type"
                    label={language === 'vi' ? 'Loại' : 'Type'}
                    sortCol={sortCol}
                    sortAsc={sortAsc}
                    onSort={handleSort}
                    values={typeValues}
                    activeFilter={filters['item_type'] || null}
                    onFilter={vals => handleFilterChange('item_type', vals)}
                    onClear={() => handleFilterChange('item_type', null)}
                    open={openHeaderKey === 'item_type'}
                    onToggle={() => setOpenHeaderKey(openHeaderKey === 'item_type' ? null : 'item_type')}
                    onClose={() => setOpenHeaderKey(null)}
                    dict={dict}
                    className="hover:bg-gray-150 text-slate-500 font-bold py-3 px-2 w-[100px]"
                  />
                  <ColumnHeader
                    colKey="category"
                    label={language === 'vi' ? 'Danh mục' : 'Category'}
                    sortCol={sortCol}
                    sortAsc={sortAsc}
                    onSort={handleSort}
                    values={categoryValues}
                    activeFilter={filters['category'] || null}
                    onFilter={vals => handleFilterChange('category', vals)}
                    onClear={() => handleFilterChange('category', null)}
                    open={openHeaderKey === 'category'}
                    onToggle={() => setOpenHeaderKey(openHeaderKey === 'category' ? null : 'category')}
                    onClose={() => setOpenHeaderKey(null)}
                    dict={dict}
                    className="hover:bg-gray-150 text-slate-500 font-bold py-3 px-2 w-[180px]"
                  />
                  {selectedLocId === 'all' && (
                    <ColumnHeader
                      colKey="location"
                      label={language === 'vi' ? 'Kho' : 'Location'}
                      sortCol={sortCol}
                      sortAsc={sortAsc}
                      onSort={handleSort}
                      values={locationCodeValues}
                      activeFilter={filters['location'] || null}
                      onFilter={vals => handleFilterChange('location', vals)}
                      onClear={() => handleFilterChange('location', null)}
                      open={openHeaderKey === 'location'}
                      onToggle={() => setOpenHeaderKey(openHeaderKey === 'location' ? null : 'location')}
                      onClose={() => setOpenHeaderKey(null)}
                      dict={dict}
                      className="hover:bg-gray-150 text-slate-550 font-bold py-3 px-2 w-[90px]"
                    />
                  )}
                  <th className="py-3 px-2 text-[11px] font-bold text-slate-550 uppercase tracking-wider text-right whitespace-nowrap">
                    {language === 'vi' ? 'Tồn hiện tại' : 'Stock Qty'}
                  </th>
                  <th className="py-3 px-2 text-[11px] font-bold text-slate-550 uppercase tracking-wider text-right whitespace-nowrap">
                    {language === 'vi' ? 'Gói/Mẻ' : 'Pkg/Batch'}
                  </th>
                  <th className="py-3 px-2 text-[11px] font-bold text-slate-550 uppercase tracking-wider text-right whitespace-nowrap">
                    {language === 'vi' ? 'Giá trị (VND)' : 'Value (VND)'}
                  </th>
                  <ColumnHeader
                    colKey="status"
                    label={language === 'vi' ? 'Trạng thái' : 'Status'}
                    sortCol={sortCol}
                    sortAsc={sortAsc}
                    onSort={handleSort}
                    values={statusValues}
                    activeFilter={filters['status'] || null}
                    onFilter={vals => handleFilterChange('status', vals)}
                    onClear={() => handleFilterChange('status', null)}
                    open={openHeaderKey === 'status'}
                    onToggle={() => setOpenHeaderKey(openHeaderKey === 'status' ? null : 'status')}
                    onClose={() => setOpenHeaderKey(null)}
                    dict={dict}
                    right={true}
                    className="hover:bg-gray-150 text-slate-500 font-bold text-right"
                  />
                  <th className="py-3 px-2 text-[11px] font-bold text-slate-550 uppercase tracking-wider whitespace-nowrap text-right">
                    {language === 'vi' ? 'Kiểm kê gần nhất' : 'Last Counted'}
                  </th>
                  <th className="py-3 px-2 text-[11px] font-bold text-slate-550 uppercase tracking-wider whitespace-nowrap text-right">
                    {language === 'vi' ? 'Giao dịch cuối' : 'Last Movement'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAndSortedStock.length === 0 ? (
                  <tr>
                    <td
                      colSpan={selectedLocId === 'all' ? 12 : 11}
                      className="text-center py-8 text-slate-400 text-xs italic font-semibold"
                    >
                      {language === 'vi' ? 'Không có tồn kho nào được tìm thấy' : 'No stock items found'}
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedStock.map((item, idx) => {
                    const statusConfig = statusLabel(item.status)
                    const isNeg = item.current_qty < 0
                    const isLow = item.status === 'low_stock' || item.status === 'out_of_stock'
                    
                    const rowKey = `${item.location_id}-${item.item_type}-${item.id}`
                    const isExpanded = !!expandedItems[rowKey]
                    const hasBatches = item.batches && item.batches.length > 0

                    return (
                      <React.Fragment key={idx}>
                        <tr className="hover:bg-blue-50/20 transition-colors">
                          <td className="py-2.5 px-2 text-center w-[40px]">
                            {hasBatches && (
                              <button
                                onClick={() => toggleExpandItem(rowKey)}
                                className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer"
                              >
                                {isExpanded ? (
                                  <ChevronDownIcon className="w-4 h-4 text-blue-600" />
                                ) : (
                                  <ChevronRightIcon className="w-4 h-4 text-slate-400" />
                                )}
                              </button>
                            )}
                          </td>
                          {/* Nome semplice (può andare a capo su più righe) */}
                          <td className="py-2.5 px-2 font-semibold text-gray-900 min-w-[150px]">
                          <span title={item.name}>{item.name}</span>
                        </td>
                        
                        {/* Brand (può andare a capo su più righe) */}
                        <td className="py-2.5 px-2 text-gray-650 font-medium w-[120px] min-w-[100px]" title={item.brand}>{item.brand !== '-' ? item.brand : '—'}</td>
                        
                        {/* Tipo (Badge colorato compatto rounded-full) */}
                        <td className="py-2.5 px-2 w-[100px]">
                          {item.item_type === 'material' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-150 uppercase tracking-wider">
                              Material
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-150 uppercase tracking-wider">
                              Prep
                            </span>
                          )}
                        </td>
                        
                        {/* Categoria (Badge grigio/azzurro rounded-full con larghezza aumentata) */}
                        <td className="py-2.5 px-2 w-[180px]">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-100 whitespace-nowrap" title={item.category}>
                            {item.category}
                          </span>
                        </td>
                        
                        {/* Location (Badge a pillola colorato in modo deterministico) */}
                        {selectedLocId === 'all' && (
                          <td className="py-2.5 px-2 w-[90px]">
                            <span 
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-3xs cursor-default ${getLocationColor(item.location_code)}`}
                              title={item.location_name}
                            >
                              {item.location_code}
                            </span>
                          </td>
                        )}
                        
                        {/* Quantità (colorata in rosso se sottoscorta per attirare attenzione) */}
                        <td className={`py-2.5 px-2 font-bold text-right text-xs whitespace-nowrap ${isNeg ? 'text-red-650 bg-red-50/20' : (isLow ? 'text-amber-705' : 'text-gray-800')}`}>
                          {item.current_qty.toLocaleString()} <span className="text-xs font-normal text-slate-500">{item.uom}</span>
                        </td>
                        
                        {/* Equiv. Packages / Batches */}
                        <td className="py-2.5 px-2 text-right text-gray-700 font-semibold text-xs whitespace-nowrap">
                          {item.status !== 'not_configured' ? (
                            item.equivalent_value.toFixed(1)
                          ) : (
                            '—'
                          )}
                        </td>
                        
                        {/* Valore in VND (Colorato di verde/slate) */}
                        <td className="py-2.5 px-2 font-bold text-right text-emerald-800 text-xs whitespace-nowrap">
                          {item.status !== 'not_configured' ? (
                            item.stock_value.toLocaleString()
                          ) : (
                            '—'
                          )}
                        </td>
                        
                        {/* Status (Badge vibrant compatto, una sola riga!) */}
                        <td className="py-2.5 px-2 text-right">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-3xs whitespace-nowrap ${statusConfig.color}`}
                          >
                            {statusConfig.icon}
                            {statusConfig.label}
                          </span>
                        </td>
                        
                        {/* Data Conteggio */}
                        <td className="py-2.5 px-2 text-[10px] text-gray-400 font-medium whitespace-nowrap text-right">
                          {formatDateTime(item.last_count_at)}
                        </td>
                        
                        {/* Data Movimento */}
                        <td className="py-2.5 px-2 text-[10px] text-gray-400 font-medium whitespace-nowrap text-right">
                          {formatDateTime(item.last_movement_at)}
                        </td>
                      </tr>
                      {isExpanded && hasBatches && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={selectedLocId === 'all' ? 12 : 11} className="py-3 px-4 pl-12 border-b border-gray-150">
                            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-3xs space-y-2 max-w-4xl">
                              <h4 className="font-bold text-[11px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                                <span>Active Batches (Lô hàng đang hoạt động)</span>
                              </h4>
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="border-b border-gray-200 text-[10px] text-slate-400 uppercase font-bold">
                                    <th className="py-1.5 px-2">Batch Code</th>
                                    <th className="py-1.5 px-2">Receipt Date</th>
                                    <th className="py-1.5 px-2">Expiry Date</th>
                                    <th className="py-1.5 px-2 text-right">Current Qty</th>
                                    <th className="py-1.5 px-2 text-center w-[120px]">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {item.batches?.map((batch: any) => {
                                    const isExpired = batch.expiry_date && new Date(batch.expiry_date) < new Date()
                                    
                                    // Warning days check (default warning_days or fallback 7 days)
                                    const warningDays = 7
                                    const isWarning = batch.expiry_date && !isExpired && 
                                      new Date(batch.expiry_date).getTime() - new Date().getTime() < warningDays * 24 * 60 * 60 * 1000

                                    let batchStatusColor = 'bg-slate-50 text-slate-600 border-slate-200'
                                    let batchStatusLabel = 'Active'

                                    if (isExpired) {
                                      batchStatusColor = 'bg-red-50 text-red-650 border-red-200'
                                      batchStatusLabel = 'Expired (Hết hạn)'
                                    } else if (isWarning) {
                                      batchStatusColor = 'bg-amber-50 text-amber-705 border-amber-250'
                                      batchStatusLabel = 'Near Expiry (Sắp hết hạn)'
                                    }

                                    return (
                                      <tr key={batch.id} className="hover:bg-slate-50/50">
                                        <td className="py-1.5 px-2 font-mono font-bold text-gray-800">{batch.batch_code}</td>
                                        <td className="py-1.5 px-2 text-slate-500">{batch.receipt_date}</td>
                                        <td className={`py-1.5 px-2 font-semibold ${isExpired ? 'text-red-600' : (isWarning ? 'text-amber-600' : 'text-slate-700')}`}>
                                          {batch.expiry_date || 'N/A'}
                                        </td>
                                        <td className="py-1.5 px-2 text-right font-bold text-gray-900">
                                          {batch.current_qty?.toLocaleString()} <span className="text-slate-400 font-normal">{batch.uom_base}</span>
                                        </td>
                                        <td className="py-1.5 px-2 text-center">
                                          <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${batchStatusColor}`}>
                                            {batchStatusLabel}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
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

export default function CurrentStockPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-transparent">
        <CircularLoader />
      </div>
    }>
      <CurrentStockContent />
    </Suspense>
  )
}
