'use client'

import React, { useEffect, useState, useMemo, Suspense } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { CheckIcon, XMarkIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon, SparklesIcon, Cog6ToothIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'
import ColumnHeader from '@/components/storehouse/ColumnHeader'
import Button from '@/components/Button'
import { useSearchParams } from 'next/navigation'

interface SetupRecord {
  id?: string
  location_id: string
  item_type: 'material' | 'prep'
  item_id: string
  track_inventory: boolean
  min_stock: number
  par_level: number
  reorder_point: number
  count_frequency: 'daily' | 'weekly' | 'monthly' | 'custom' | 'none'
  default_input_method: 'uom' | 'package' | 'batch'
  track_batch?: boolean
  track_expiry?: boolean
  expiry_required?: boolean
  default_shelf_life?: number | null
  warning_days?: number
  allow_no_batch?: boolean
}

interface Material {
  id: string
  name: string
  brand: string
  category: string
  uom: string
  packaging_size: number
  unit_cost: number
}

interface Prep {
  id: string
  name: string
  brand: string
  category: string
  uom: string
  yield_qty: number
  unit_cost: number
}

type LocationType = 'branch' | 'warehouse' | 'kitchen' | 'external' | 'other'

interface Location {
  id: string
  name: string
  code: string
  type: LocationType
  branch_id: string | null
  is_active: boolean
  created_at?: string
}

interface Branch {
  id: string
  name: string
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

function InventorySetupContent() {
  const { language } = useSettings()
  const searchParams = useSearchParams()
  const branchId = searchParams.get('branchId') || 'all'
  
  // Tabs: 'inventory' | 'locations'
  const [activeMainTab, setActiveMainTab] = useState<'inventory' | 'locations'>('inventory')

  const [locations, setLocations] = useState<Location[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedLocId, setSelectedLocId] = useState<string>('')
  const [role, setRole] = useState<string | null>(null)
  
  // Data lists
  const [materials, setMaterials] = useState<Material[]>([])
  const [preps, setPreps] = useState<Prep[]>([])
  const [setups, setSetups] = useState<SetupRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Tabs: 'materials' | 'preps'
  const [activeTab, setActiveTab] = useState<'materials' | 'preps'>('materials')

  // Configuration Modal State (Inventory Tracking)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<{ id: string; name: string; brand: string; type: 'material' | 'prep'; uom: string } | null>(null)
  const [trackInventory, setTrackInventory] = useState(false)
  const [minStock, setMinStock] = useState('0')
  const [parLevel, setParLevel] = useState('0')
  const [reorderPoint, setReorderPoint] = useState('0')
  const [countFrequency, setCountFrequency] = useState<SetupRecord['count_frequency']>('none')
  const [defaultInputMethod, setDefaultInputMethod] = useState<SetupRecord['default_input_method']>('uom')
  const [trackBatch, setTrackBatch] = useState(false)
  const [trackExpiry, setTrackExpiry] = useState(false)
  const [expiryRequired, setExpiryRequired] = useState(false)
  const [defaultShelfLife, setDefaultShelfLife] = useState('')
  const [warningDays, setWarningDays] = useState('7')
  const [allowNoBatch, setAllowNoBatch] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // Locations Form Modal State
  const [isLocModalOpen, setIsLocModalOpen] = useState(false)
  const [editingLoc, setEditingLoc] = useState<Location | null>(null)
  const [locName, setLocName] = useState('')
  const [locCode, setLocCode] = useState('')
  const [locType, setLocType] = useState<LocationType>('branch')
  const [locBranchId, setLocBranchId] = useState('')
  const [locIsActive, setLocIsActive] = useState(true)
  const [locErrorMsg, setLocErrorMsg] = useState('')

  // Inventory Table sorting and filtering states
  const [sortCol, setSortCol] = useState('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [openHeaderKey, setOpenHeaderKey] = useState<string | null>(null)
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({})
  const [searchQuery, setSearchQuery] = useState('')

  // Locations Table sorting and filtering states
  const [locSortCol, setLocSortCol] = useState('name')
  const [locSortAsc, setLocSortAsc] = useState(true)
  const [locOpenHeaderKey, setLocOpenHeaderKey] = useState<string | null>(null)
  const [locFilters, setLocFilters] = useState<Record<string, Set<string> | null>>({})

  const isManager = useMemo(() => {
    return role && ['owner', 'admin', 'manager', 'accountant'].includes(role)
  }, [role])

  useEffect(() => {
    async function loadInitial() {
      try {
        setLoading(true)
        const { data: userRes } = await supabase.auth.getUser()
        if (userRes?.user) {
          const { data: acc } = await supabase
            .from('app_accounts')
            .select('role')
            .eq('user_id', userRes.user.id)
            .single()
          setRole(acc?.role || 'staff')
        }

        // Carica branches attivi
        const { data: bData } = await supabase
          .from('provider_branches')
          .select('id, name')
          .eq('is_active', true)
          .order('name')
        setBranches(bData || [])

        // Carica TUTTE le locations per la tab di gestione
        let locQuery = supabase
          .from('storehouse_locations')
          .select('*')
          .order('name')
        if (branchId && branchId !== 'all') {
          locQuery = locQuery.eq('branch_id', branchId)
        }
        const { data: locs } = await locQuery
        
        setLocations(locs || [])
        const firstActive = (locs || []).find(l => l.is_active)
        if (firstActive) {
          setSelectedLocId(firstActive.id)
        }
      } catch (err) {
        console.error('Error loading inventory setup page data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadInitial()
  }, [])

  // Carica i dati in base alla location selezionata
  useEffect(() => {
    if (!selectedLocId) return

    async function loadInventoryData() {
      try {
        setLoading(true)
        // 1. Carica Materials dal Costing
        const { data: matsData } = await supabase
          .from('materials')
          .select('id, name, brand, packaging_size, unit_cost, categories(name), uom(name)')
          .is('deleted_at', null)
          .order('name')

        const formattedMats: Material[] = (matsData || []).map((m: any) => ({
          id: m.id,
          name: m.name, // Nome pulito
          brand: m.brand || '-', // Brand separato
          category: m.categories?.name || '-',
          uom: m.uom?.name || 'unit',
          packaging_size: Number(m.packaging_size || 1),
          unit_cost: Number(m.unit_cost || 0),
        }))
        setMaterials(formattedMats)

        // 2. Carica Preps dal Costing
        const { data: prepsData } = await supabase
          .from('prep_recipes')
          .select('id, name, yield_qty, cost_per_unit_vnd, recipe_categories(name), uom(name)')
          .is('deleted_at', null)
          .order('name')

        const formattedPreps: Prep[] = (prepsData || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          brand: '-',
          category: p.recipe_categories?.name || '-',
          uom: p.uom?.name || 'gr',
          yield_qty: Number(p.yield_qty || 1),
          unit_cost: Number(p.cost_per_unit_vnd || 0),
        }))
        setPreps(formattedPreps)

        // 3. Carica Setup di magazzino esistenti per questa location
        const { data: setupsData } = await supabase
          .from('storehouse_inventory_setup')
          .select('*')
          .eq('location_id', selectedLocId)
        
        setSetups(setupsData || [])
      } catch (err) {
        console.error('Error loading inventory setup components:', err)
      } finally {
        setLoading(false)
      }
    }

    loadInventoryData()
  }, [selectedLocId])

  const handleSort = (col: string, asc: boolean) => {
    setSortCol(col)
    setSortAsc(asc)
  }

  const handleFilterChange = (col: string, selected: Set<string> | null) => {
    setFilters(prev => ({ ...prev, [col]: selected }))
  }

  // Costruisce la lista visualizzata in base al tab attivo
  const itemsList = useMemo(() => {
    if (activeTab === 'materials') {
      return materials.map(m => {
        const setup = setups.find(s => s.item_id === m.id && s.item_type === 'material')
        return {
          id: m.id,
          name: m.name,
          brand: m.brand,
          type: 'material' as const,
          category: m.category,
          uom: m.uom,
          details: `${m.packaging_size} ${m.uom}`, // Valore pulito senza label fisse
          unit_cost: m.unit_cost,
          setup,
        }
      })
    } else {
      return preps.map(p => {
        const setup = setups.find(s => s.item_id === p.id && s.item_type === 'prep')
        return {
          id: p.id,
          name: p.name,
          brand: p.brand,
          type: 'prep' as const,
          category: p.category,
          uom: p.uom,
          details: `${p.yield_qty} ${p.uom}`, // Valore pulito senza label fisse
          unit_cost: p.unit_cost,
          setup,
        }
      })
    }
  }, [activeTab, materials, preps, setups])

  // Filtraggio e Ordinamento
  const filteredAndSortedItems = useMemo(() => {
    let result = [...itemsList]

    // Filtra per testo (cerca in nome e brand)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(item => 
        item.name.toLowerCase().includes(q) || 
        item.brand.toLowerCase().includes(q)
      )
    }

    // Applica filtri di colonna
    Object.entries(filters).forEach(([col, set]) => {
      if (!set) return
      result = result.filter(item => {
        let val = ''
        if (col === 'category') val = item.category
        else if (col === 'brand') val = item.brand
        else if (col === 'track') val = item.setup?.track_inventory ? 'Yes' : 'No'
        else if (col === 'frequency') val = item.setup?.count_frequency || 'none'
        return set.has(val)
      })
    })

    // Ordina
    result.sort((a, b) => {
      let valA: any = a[sortCol as keyof typeof a] ?? ''
      let valB: any = b[sortCol as keyof typeof b] ?? ''

      if (sortCol === 'track') {
        valA = a.setup?.track_inventory ? 1 : 0
        valB = b.setup?.track_inventory ? 1 : 0
      } else if (sortCol === 'min') {
        valA = a.setup?.min_stock ?? 0
        valB = b.setup?.min_stock ?? 0
      } else if (sortCol === 'par') {
        valA = a.setup?.par_level ?? 0
        valB = b.setup?.par_level ?? 0
      } else if (sortCol === 'frequency') {
        valA = a.setup?.count_frequency || 'none'
        valB = b.setup?.count_frequency || 'none'
      }

      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
      }
      return sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1)
    })

    return result
  }, [itemsList, filters, searchQuery, sortCol, sortAsc])

  // Valori unici per i filtri delle colonne
  const categoryValues = useMemo(() => Array.from(new Set(itemsList.map(i => i.category))), [itemsList])
  const brandValues = useMemo(() => Array.from(new Set(itemsList.map(i => i.brand).filter(b => b !== '-'))), [itemsList])
  const trackValues = useMemo(() => ['Yes', 'No'], [])
  const frequencyValues = useMemo(() => ['daily', 'weekly', 'monthly', 'custom', 'none'], [])

  const openSetupModal = (item: typeof itemsList[0]) => {
    setEditingItem({ id: item.id, name: item.name, brand: item.brand, type: item.type, uom: item.uom })
    if (item.setup) {
      setTrackInventory(item.setup.track_inventory)
      setMinStock(formatLiveNumber(String(item.setup.min_stock)))
      setParLevel(formatLiveNumber(String(item.setup.par_level)))
      setReorderPoint(formatLiveNumber(String(item.setup.reorder_point)))
      setCountFrequency(item.setup.count_frequency)
      setDefaultInputMethod(item.setup.default_input_method)
      setTrackBatch(item.setup.track_batch ?? false)
      setTrackExpiry(item.setup.track_expiry ?? false)
      setExpiryRequired(item.setup.expiry_required ?? false)
      setDefaultShelfLife(item.setup.default_shelf_life !== null && item.setup.default_shelf_life !== undefined ? String(item.setup.default_shelf_life) : '')
      setWarningDays(String(item.setup.warning_days ?? 7))
      setAllowNoBatch(item.setup.allow_no_batch ?? true)
    } else {
      setTrackInventory(false)
      setMinStock('0')
      setParLevel('0')
      setReorderPoint('0')
      setCountFrequency('none')
      setDefaultInputMethod('uom')
      setTrackBatch(false)
      setTrackExpiry(false)
      setExpiryRequired(false)
      setDefaultShelfLife('')
      setWarningDays('7')
      setAllowNoBatch(true)
    }
    setErrorMsg('')
    setIsModalOpen(true)
  }

  const handleSaveSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingItem || !selectedLocId) return
    setErrorMsg('')

    const minVal = cleanFormattedNumber(minStock)
    const parVal = cleanFormattedNumber(parLevel)
    const reorderVal = cleanFormattedNumber(reorderPoint)

    if (isNaN(minVal) || minVal < 0 || isNaN(parVal) || parVal < 0 || isNaN(reorderVal) || reorderVal < 0) {
      setErrorMsg(language === 'vi' ? 'Vui lòng nhập giá trị số hợp lệ' : 'Please enter valid numeric values')
      return
    }

    const payload = {
      location_id: selectedLocId,
      item_type: editingItem.type,
      item_id: editingItem.id,
      track_inventory: trackInventory,
      min_stock: minVal,
      par_level: parVal,
      reorder_point: reorderVal,
      count_frequency: countFrequency,
      default_input_method: defaultInputMethod,
      track_batch: trackBatch,
      track_expiry: trackExpiry,
      expiry_required: trackExpiry ? expiryRequired : false,
      default_shelf_life: defaultShelfLife !== '' ? parseInt(defaultShelfLife, 10) : null,
      warning_days: parseInt(warningDays, 10) || 7,
      allow_no_batch: allowNoBatch,
    }

    try {
      const existingSetup = setups.find(s => s.item_id === editingItem.id && s.item_type === editingItem.type)
      
      if (existingSetup?.id) {
        // Update
        const { error } = await supabase
          .from('storehouse_inventory_setup')
          .update(payload)
          .eq('id', existingSetup.id)

        if (error) throw error
        setSetups(prev => prev.map(s => s.id === existingSetup.id ? { ...s, ...payload } : s))
      } else {
        // Insert
        const { data, error } = await supabase
          .from('storehouse_inventory_setup')
          .insert([payload])
          .select()

        if (error) throw error
        if (data && data[0]) {
          setSetups(prev => [...prev, data[0]])
        }
      }
      setIsModalOpen(false)
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving inventory setup')
    }
  }

  // ==========================================
  // LOCATIONS CRUD METHODS
  // ==========================================
  const handleLocSort = (col: string, asc: boolean) => {
    setLocSortCol(col)
    setLocSortAsc(asc)
  }

  const handleLocFilterChange = (col: string, selected: Set<string> | null) => {
    setLocFilters(prev => ({ ...prev, [col]: selected }))
  }

  const openLocModal = (loc: Location | null = null) => {
    if (!isManager) return
    setLocErrorMsg('')
    if (loc) {
      setEditingLoc(loc)
      setLocName(loc.name)
      setLocCode(loc.code)
      setLocType(loc.type)
      setLocBranchId(loc.branch_id || '')
      setLocIsActive(loc.is_active)
    } else {
      setEditingLoc(null)
      setLocName('')
      setLocCode('')
      setLocType('warehouse') // default warehouse per creazione manuale
      setLocBranchId(branchId !== 'all' ? branchId : '')
      setLocIsActive(true)
    }
    setIsLocModalOpen(true)
  }

  const closeLocModal = () => {
    setIsLocModalOpen(false)
  }

  const handleSaveLoc = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isManager) return
    setLocErrorMsg('')

    if (!locName.trim() || !locCode.trim()) {
      setLocErrorMsg(language === 'vi' ? 'Vui lòng điền đầy đủ thông tin bắt buộc' : 'Please fill all required fields')
      return
    }

    const payload = {
      name: locName.trim(),
      code: locCode.trim().toUpperCase(),
      type: locType,
      branch_id: locType === 'branch' && locBranchId ? locBranchId : null,
      is_active: locIsActive,
      updated_at: new Date().toISOString(),
    }

    try {
      if (editingLoc) {
        // Update
        const { error } = await supabase
          .from('storehouse_locations')
          .update(payload)
          .eq('id', editingLoc.id)

        if (error) throw error

        setLocations(prev =>
          prev.map(l => (l.id === editingLoc.id ? { ...l, ...payload } : l))
        )
      } else {
        // Insert
        const { data, error } = await supabase
          .from('storehouse_locations')
          .insert([payload])
          .select()

        if (error) throw error
        if (data && data[0]) {
          setLocations(prev => [...prev, data[0]])
        }
      }
      closeLocModal()
    } catch (err: any) {
      setLocErrorMsg(err.message || 'Error saving location')
    }
  }

  const handleDeleteLoc = async (id: string) => {
    if (!isManager) return
    const textConfirm =
      language === 'vi'
        ? 'Bạn có chắc chắn muốn xóa địa điểm này không?'
        : 'Are you sure you want to delete this location?'
    if (!window.confirm(textConfirm)) return

    try {
      const { error } = await supabase.from('storehouse_locations').delete().eq('id', id)
      if (error) throw error
      setLocations(prev => prev.filter(l => l.id !== id))
    } catch (err: any) {
      alert(err.message || 'Error deleting location')
    }
  }

  // Filtraggio e Ordinamento delle Locations
  const filteredAndSortedLocations = useMemo(() => {
    let result = [...locations]

    // Applica filtri
    Object.entries(locFilters).forEach(([col, set]) => {
      if (!set) return
      result = result.filter(item => {
        let val = ''
        if (col === 'type') val = item.type
        else if (col === 'is_active') val = item.is_active ? 'Active' : 'Inactive'
        else if (col === 'branch') {
          const b = branches.find(x => x.id === item.branch_id)
          val = b ? b.name : '-'
        }
        return set.has(val)
      })
    })

    // Applica ordinamento
    result.sort((a, b) => {
      let valA: any = a[locSortCol as keyof Location] ?? ''
      let valB: any = b[locSortCol as keyof Location] ?? ''

      if (locSortCol === 'branch') {
        const bA = branches.find(x => x.id === a.branch_id)?.name ?? ''
        const bB = branches.find(x => x.id === b.branch_id)?.name ?? ''
        valA = bA
        valB = bB
      }

      if (typeof valA === 'string') {
        return locSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
      }
      return locSortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1)
    })

    return result
  }, [locations, locFilters, locSortCol, locSortAsc, branches])

  // Valori unici per i filtri delle colonne delle locations
  const locTypeValues = useMemo(() => Array.from(new Set(locations.map(l => l.type))), [locations])
  const locActiveValues = useMemo(() => ['Active', 'Inactive'], [])
  const locBranchValues = useMemo(() => {
    const list = locations.map(l => {
      const b = branches.find(x => x.id === l.branch_id)
      return b ? b.name : '-'
    })
    return Array.from(new Set(list))
  }, [locations, branches])

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
          <h1 className="text-2xl font-bold text-white">{t(language, 'Settings')}</h1>
          <p className="text-sm text-slate-400">
            {language === 'vi'
              ? 'Cấu hình các thông số theo dõi và giới hạn tồn kho cho từng sản phẩm'
              : 'Configure tracking parameters and stock limits for each item'}
          </p>
        </div>
        
        {/* Dropdown Location / Add Location Button */}
        {activeMainTab === 'inventory' && branchId === 'all' ? (
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {language === 'vi' ? 'Chi nhánh/Kho' : 'Location'}:
            </label>
            <select
              value={selectedLocId}
              onChange={e => setSelectedLocId(e.target.value)}
              className="border border-white/10 rounded-xl px-3 h-11 text-sm font-semibold text-slate-200 bg-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 min-w-[200px]"
            >
              {locations.filter(l => l.is_active).length === 0 && (
                <option value="">{language === 'vi' ? '-- Chưa có địa điểm --' : '-- No locations configured --'}</option>
              )}
              {locations.filter(l => l.is_active).map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          activeMainTab !== 'inventory' && isManager && (
            <button
              onClick={() => openLocModal()}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 h-11 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm cursor-pointer animate-duration-150 shrink-0"
            >
              <PlusIcon className="w-4 h-4" />
              {t(language, 'AddLocation')}
            </button>
          )
        )}
      </div>

      {/* Tab Principali di Primo Livello (Inventory vs Locations) */}
      <div className="border-b border-white/10 flex gap-6">
        <button
          onClick={() => setActiveMainTab('inventory')}
          className={`pb-3 text-base font-extrabold border-b-2 transition-all cursor-pointer ${
            activeMainTab === 'inventory'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          {language === 'vi' ? 'Tồn kho' : 'Inventory'}
        </button>
        <button
          onClick={() => setActiveMainTab('locations')}
          className={`pb-3 text-base font-extrabold border-b-2 transition-all cursor-pointer ${
            activeMainTab === 'locations'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          {language === 'vi' ? 'Địa điểm' : 'Locations'}
        </button>
      </div>

      {/* Sotto-tab visibili solo per Inventory */}
      {activeMainTab === 'inventory' && (
        <div className="border-b border-white/10 flex justify-between items-center gap-4 flex-wrap">
          <div className="flex gap-6">
            <button
              onClick={() => { setActiveTab('materials'); setFilters({}); setSearchQuery(''); }}
              className={`pb-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'materials'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t(language, 'Materials')}
            </button>
            <button
              onClick={() => { setActiveTab('preps'); setFilters({}); setSearchQuery(''); }}
              className={`pb-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'preps'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t(language, 'Prep')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-[300px] w-full items-center justify-center">
          <CircularLoader />
        </div>
      ) : activeMainTab === 'inventory' ? (
        locations.filter(l => l.is_active).length === 0 ? (
          <div className="bg-slate-900/50 rounded-2xl border border-white/10 p-8 text-center text-slate-400 font-semibold italic text-xs">
            {language === 'vi'
              ? 'Vui lòng cấu hình ít nhất một Địa điểm hoạt động trước'
              : 'Please configure at least one active Location first'}
          </div>
        ) : (
          /* Tabella Items: Sfondo Bianco, Look Vibrant, con Badge a pillola e pulsante setup solo rotellina */
          <div className="bg-white rounded-2xl border border-slate-200 shadow p-3 overflow-hidden text-gray-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-auto text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-slate-550 font-semibold">
                  <ColumnHeader
                    colKey="name"
                    label={language === 'vi' ? 'Tên mặt hàng' : 'Item Name'}
                    sortCol={sortCol}
                    sortAsc={sortAsc}
                    onSort={handleSort}
                    values={Array.from(new Set(itemsList.map(i => i.name)))}
                    activeFilter={filters['name'] || null}
                    onFilter={vals => handleFilterChange('name', vals)}
                    onClear={() => handleFilterChange('name', null)}
                    open={openHeaderKey === 'name'}
                    onToggle={() => setOpenHeaderKey(openHeaderKey === 'name' ? null : 'name')}
                    onClose={() => setOpenHeaderKey(null)}
                    dict={dict}
                    className="hover:bg-gray-150 text-slate-500 font-bold"
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
                    className="hover:bg-gray-150 text-slate-500 font-bold"
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
                    className="hover:bg-gray-150 text-slate-500 font-bold"
                  />
                  {/* Intestazione Dinamica (Clean Pack o Yield Size) */}
                  <th className="p-3 text-[11px] font-bold text-slate-550 uppercase tracking-wider">
                    {activeTab === 'materials' 
                      ? (language === 'vi' ? 'Cỡ đóng gói' : 'Pack Size') 
                      : (language === 'vi' ? 'Lượng thu hoạch' : 'Yield Size')}
                  </th>
                  <ColumnHeader
                    colKey="track"
                    label={language === 'vi' ? 'Theo dõi' : 'Track'}
                    sortCol={sortCol}
                    sortAsc={sortAsc}
                    onSort={handleSort}
                    values={trackValues}
                    activeFilter={filters['track'] || null}
                    onFilter={vals => handleFilterChange('track', vals)}
                    onClear={() => handleFilterChange('track', null)}
                    open={openHeaderKey === 'track'}
                    onToggle={() => setOpenHeaderKey(openHeaderKey === 'track' ? null : 'track')}
                    onClose={() => setOpenHeaderKey(null)}
                    dict={dict}
                    className="hover:bg-gray-150 text-slate-500 font-bold"
                    valueLabels={{
                      Yes: language === 'vi' ? 'Có' : 'Yes',
                      No: language === 'vi' ? 'Không' : 'No'
                    }}
                  />
                  <th className="p-3 text-[11px] font-bold text-slate-550 uppercase tracking-wider text-right">
                    {language === 'vi' ? 'Tồn tối thiểu' : 'Min Stock'}
                  </th>
                  <th className="p-3 text-[11px] font-bold text-slate-550 uppercase tracking-wider text-right">
                    {language === 'vi' ? 'Mức chuẩn' : 'Par Level'}
                  </th>
                  <ColumnHeader
                    colKey="frequency"
                    label={language === 'vi' ? 'Tần suất kiểm' : 'Frequency'}
                    sortCol={sortCol}
                    sortAsc={sortAsc}
                    onSort={handleSort}
                    values={frequencyValues}
                    activeFilter={filters['frequency'] || null}
                    onFilter={vals => handleFilterChange('frequency', vals)}
                    onClear={() => handleFilterChange('frequency', null)}
                    open={openHeaderKey === 'frequency'}
                    onToggle={() => setOpenHeaderKey(openHeaderKey === 'frequency' ? null : 'frequency')}
                    onClose={() => setOpenHeaderKey(null)}
                    dict={dict}
                    className="hover:bg-gray-150 text-slate-500 font-bold"
                    valueLabels={{
                      daily: language === 'vi' ? 'Hàng ngày' : 'Daily',
                      weekly: language === 'vi' ? 'Hàng tuần' : 'Weekly',
                      monthly: language === 'vi' ? 'Hàng tháng' : 'Monthly',
                      custom: language === 'vi' ? 'Tùy chỉnh' : 'Custom',
                      none: language === 'vi' ? 'Không kiểm kê' : 'None'
                    }}
                  />
                  <th className="p-3 text-[11px] font-bold text-slate-550 uppercase tracking-wider text-center">
                    {language === 'vi' ? 'Cấu hình' : 'Setup'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAndSortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                      {language === 'vi' ? 'Không tìm thấy mặt hàng nào' : 'No items found'}
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedItems.map(item => {
                    const isTracked = item.setup?.track_inventory
                    
                    return (
                      <tr 
                        key={item.id} 
                        className="transition-colors hover:bg-slate-50 bg-white"
                      >
                        <td className="p-3 font-semibold text-gray-900">{item.name}</td>
                        
                        {/* Brand (Testo semplice) */}
                        <td className="p-3 text-gray-650 font-medium">{item.brand !== '-' ? item.brand : '—'}</td>
                        
                        {/* Categoria (Badge rounded-full coerente con la pagina stock) */}
                        <td className="p-3">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-100">
                            {item.category}
                          </span>
                        </td>
                        
                        {/* Pack Size / Yield Size (valore pulito) */}
                        <td className="p-3 font-bold text-gray-800 text-sm">{item.details}</td>
                        
                        {/* Track (Badge rounded-full colorato Yes/No - Verde/Rosso Chiaro) */}
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold border shadow-3xs ${
                              isTracked
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-250'
                                : 'bg-rose-50 text-rose-700 border-rose-250'
                            }`}
                          >
                            {isTracked ? t(language, 'Yes') : t(language, 'No')}
                          </span>
                        </td>
                        
                        {/* Min Stock (colorato in arancione caldo) */}
                        <td className="p-3 font-bold text-right text-amber-800">
                          {item.setup ? `${item.setup.min_stock.toLocaleString()} ${item.uom}` : '—'}
                        </td>
                        
                        {/* Par Level (colorato in blu intenso) */}
                        <td className="p-3 font-bold text-right text-blue-700">
                          {item.setup ? `${item.setup.par_level.toLocaleString()} ${item.uom}` : '—'}
                        </td>
                        
                        {/* Frequenza (Badge a pillola colorato in base alla criticità) */}
                        <td className="p-3">
                          {item.setup?.count_frequency && item.setup.count_frequency !== 'none' ? (
                            (() => {
                              const freq = item.setup.count_frequency
                              let badgeColor = 'bg-slate-100 text-slate-650 border-slate-200'
                              if (freq === 'daily') badgeColor = 'bg-rose-50 text-rose-700 border-rose-250 font-bold'
                              else if (freq === 'weekly') badgeColor = 'bg-amber-50 text-amber-700 border-amber-250'
                              else if (freq === 'monthly') badgeColor = 'bg-blue-50 text-blue-700 border-blue-200'
                              else if (freq === 'custom') badgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-200'

                              const freqTranslations: Record<string, string> = {
                                daily: language === 'vi' ? 'Hàng ngày' : 'Daily',
                                weekly: language === 'vi' ? 'Hàng tuần' : 'Weekly',
                                monthly: language === 'vi' ? 'Hàng tháng' : 'Monthly',
                                custom: language === 'vi' ? 'Tùy chỉnh' : 'Custom'
                              }

                              return (
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeColor}`}>
                                  {freqTranslations[freq] || freq}
                                </span>
                              )
                            })()
                          ) : (
                            <span className="text-gray-400 text-xs italic font-medium">—</span>
                          )}
                        </td>
                        
                        {/* Bottone Setup: Rotellina blu minimalista senza sfondo o cerchi */}
                        <td className="p-3 text-center">
                          {isManager && (
                            <button
                              onClick={() => openSetupModal(item)}
                              className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-55 transition-colors cursor-pointer"
                              title={language === 'vi' ? 'Cấu hình thông số' : 'Configure Parameters'}
                            >
                              <Cog6ToothIcon className="w-4 h-4 font-semibold" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )
    ) : (
        /* Tabella delle Locations (Sfondo Bianco, Look Vibrant, con Badge a pillola) */
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-3 overflow-hidden text-gray-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-auto text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  <th className="p-3 w-28 text-slate-500 font-bold uppercase tracking-wider">
                    {language === 'vi' ? 'Mã' : 'Code'}
                  </th>
                  <ColumnHeader
                    colKey="name"
                    label={language === 'vi' ? 'Tên' : 'Name'}
                    sortCol={locSortCol}
                    sortAsc={locSortAsc}
                    onSort={handleLocSort}
                    values={Array.from(new Set(locations.map(l => l.name)))}
                    activeFilter={locFilters['name'] || null}
                    onFilter={vals => handleLocFilterChange('name', vals)}
                    onClear={() => handleLocFilterChange('name', null)}
                    open={locOpenHeaderKey === 'name'}
                    onToggle={() => setLocOpenHeaderKey(locOpenHeaderKey === 'name' ? null : 'name')}
                    onClose={() => setLocOpenHeaderKey(null)}
                    dict={dict}
                    className="hover:bg-gray-150 text-slate-500 font-bold"
                  />
                  <ColumnHeader
                    colKey="type"
                    label={language === 'vi' ? 'Loại' : 'Type'}
                    sortCol={locSortCol}
                    sortAsc={locSortAsc}
                    onSort={handleLocSort}
                    values={locTypeValues}
                    activeFilter={locFilters['type'] || null}
                    onFilter={vals => handleLocFilterChange('type', vals)}
                    onClear={() => handleLocFilterChange('type', null)}
                    open={locOpenHeaderKey === 'type'}
                    onToggle={() => setLocOpenHeaderKey(locOpenHeaderKey === 'type' ? null : 'type')}
                    onClose={() => setLocOpenHeaderKey(null)}
                    dict={dict}
                    className="hover:bg-gray-150 text-slate-500 font-bold"
                  />
                  <ColumnHeader
                    colKey="branch"
                    label={t(language, 'BranchAssociated')}
                    sortCol={locSortCol}
                    sortAsc={locSortAsc}
                    onSort={handleLocSort}
                    values={locBranchValues}
                    activeFilter={locFilters['branch'] || null}
                    onFilter={vals => handleLocFilterChange('branch', vals)}
                    onClear={() => handleLocFilterChange('branch', null)}
                    open={locOpenHeaderKey === 'branch'}
                    onToggle={() => setLocOpenHeaderKey(locOpenHeaderKey === 'branch' ? null : 'branch')}
                    onClose={() => setLocOpenHeaderKey(null)}
                    dict={dict}
                    className="hover:bg-gray-150 text-slate-500 font-bold"
                  />
                  <ColumnHeader
                    colKey="is_active"
                    label={language === 'vi' ? 'Trạng thái' : 'Status'}
                    sortCol={locSortCol}
                    sortAsc={locSortAsc}
                    onSort={handleLocSort}
                    values={locActiveValues}
                    activeFilter={locFilters['is_active'] || null}
                    onFilter={vals => handleLocFilterChange('is_active', vals)}
                    onClear={() => handleLocFilterChange('is_active', null)}
                    open={locOpenHeaderKey === 'is_active'}
                    onToggle={() => setLocOpenHeaderKey(locOpenHeaderKey === 'is_active' ? null : 'is_active')}
                    onClose={() => setLocOpenHeaderKey(null)}
                    dict={dict}
                    className="hover:bg-gray-150 text-slate-500 font-bold"
                  />
                  <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center w-28">
                    {language === 'vi' ? 'Thao tác' : 'Actions'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAndSortedLocations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                      {language === 'vi' ? 'Không tìm thấy địa điểm nào' : 'No locations found'}
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedLocations.map(loc => {
                    const b = branches.find(x => x.id === loc.branch_id)
                    return (
                      <tr key={loc.id} className="transition-colors hover:bg-slate-50">
                        <td className="p-3 font-semibold text-gray-900 w-28">{loc.code}</td>
                        <td className="p-3 font-semibold text-slate-800">{loc.name}</td>
                        <td className="p-3 text-slate-650 font-medium capitalize">
                          {loc.type === 'branch' 
                            ? (language === 'vi' ? 'Chi nhánh' : 'Branch')
                            : loc.type === 'warehouse' 
                            ? (language === 'vi' ? 'Kho hàng' : 'Warehouse')
                            : loc.type === 'kitchen' 
                            ? (language === 'vi' ? 'Bếp' : 'Kitchen')
                            : loc.type === 'external' 
                            ? (language === 'vi' ? 'Đối tác ngoài' : 'External Partner')
                            : (language === 'vi' ? 'Khác' : 'Other')}
                        </td>
                        <td className="p-3 text-slate-650 font-medium">{b ? b.name : '—'}</td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-3xs ${
                              loc.is_active
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                          >
                            {loc.is_active ? t(language, 'Active') : t(language, 'Inactive')}
                          </span>
                        </td>
                        <td className="p-3 text-center w-28 space-x-2">
                          {isManager && (
                            <>
                              <button
                                onClick={() => openLocModal(loc)}
                                className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-55 transition-colors cursor-pointer"
                                title={language === 'vi' ? 'Sửa' : 'Edit'}
                              >
                                <PencilIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteLoc(loc.id)}
                                className="inline-flex items-center justify-center p-1.5 rounded-lg text-red-650 hover:text-red-800 hover:bg-red-55 transition-colors cursor-pointer"
                                title={language === 'vi' ? 'Xóa' : 'Delete'}
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </>
                          )}
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
      {isModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/80 backdrop-blur-xs">
          <div className="bg-white rounded-3xl w-full max-w-4xl border border-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between text-gray-900 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {language === 'vi' ? 'Cấu hình tồn kho' : 'Inventory Tracking Setup'}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {editingItem.name} {editingItem.brand !== '-' ? `(${editingItem.brand})` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-slate-450 hover:bg-slate-100 hover:text-slate-650 transition-colors text-sm font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSetup} className="p-6 space-y-6 text-gray-900 overflow-y-auto flex-1">
              {errorMsg && (
                <div className="bg-red-55 text-red-700 text-xs font-semibold p-3 rounded-xl border border-red-150">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                
                {/* COLONNA SINISTRA SUPERIORE: INVENTORY CONTROLS */}
                <div className="space-y-5">
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                      {language === 'vi' ? 'Kiểm soát tồn kho' : 'Inventory Controls'}
                    </h4>
                    
                    {/* Toggle Switch */}
                    <div className="flex items-center">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={trackInventory} 
                          onChange={e => setTrackInventory(e.target.checked)} 
                          className="sr-only peer" 
                        />
                        <div className="relative w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5 shrink-0"></div>
                        <div className="ml-3 select-none">
                          <span className="text-xs font-bold text-gray-800 block">
                            {language === 'vi' ? 'Theo dõi tồn kho' : 'Track Inventory'}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {language === 'vi'
                              ? 'Kích hoạt tính toán số lượng tồn và cảnh báo'
                              : 'Enable stock calculation and low warnings'}
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* DEFAULT INPUT METHOD */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {language === 'vi' ? 'Phương thức nhập mặc định' : 'Default Input Method'}
                    </label>
                    <select
                      value={defaultInputMethod}
                      disabled={!trackInventory}
                      onChange={e => setDefaultInputMethod(e.target.value as any)}
                      className="w-full border border-slate-200 rounded-xl px-3 h-10 text-xs font-semibold text-gray-800 bg-slate-50 focus:bg-white outline-none transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <option value="uom">
                        {language === 'vi' ? `Đơn vị cơ bản (${editingItem.uom})` : `Base Unit (${editingItem.uom})`}
                      </option>
                      {editingItem.type === 'material' ? (
                        <option value="package">
                          {language === 'vi' ? 'Theo Kiện/Gói (Package)' : 'By Package'}
                        </option>
                      ) : (
                        <option value="batch">
                          {language === 'vi' ? 'Theo Mẻ sản xuất (Batch)' : 'By Batch'}
                        </option>
                      )}
                    </select>
                  </div>
                </div>

                {/* COLONNA DESTRA SUPERIORE: BATCH & EXPIRY TOGGLES */}
                <div className="md:border-l md:border-slate-150 md:pl-8 space-y-5">
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                      {language === 'vi' ? 'Theo dõi Lô & Hạn sử dụng' : 'Batch & Expiry Tracking'}
                    </h4>

                    {/* Griglia 2x2 di Toggle Switch */}
                    <div className="grid grid-cols-2 gap-4">
                      
                      {/* Track Batch */}
                      <div className="flex items-center">
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            disabled={!trackInventory}
                            checked={trackBatch} 
                            onChange={e => {
                              setTrackBatch(e.target.checked)
                              if (!e.target.checked) setAllowNoBatch(true)
                            }} 
                            className="sr-only peer" 
                          />
                          <div className="relative w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed shrink-0"></div>
                          <span className={`ml-3 text-xs cursor-pointer leading-tight transition-colors ${trackInventory ? 'text-slate-700 font-semibold' : 'text-slate-400 cursor-not-allowed font-medium'}`}>
                            {language === 'vi' ? 'Theo dõi Lô' : 'Track Batch'}
                          </span>
                        </label>
                      </div>

                      {/* Track Expiry */}
                      <div className="flex items-center">
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            disabled={!trackInventory}
                            checked={trackExpiry} 
                            onChange={e => {
                              setTrackExpiry(e.target.checked)
                              if (!e.target.checked) setExpiryRequired(false)
                            }}
                            className="sr-only peer" 
                          />
                          <div className="relative w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed shrink-0"></div>
                          <span className={`ml-3 text-xs cursor-pointer leading-tight transition-colors ${trackInventory ? 'text-slate-700 font-semibold' : 'text-slate-400 cursor-not-allowed font-medium'}`}>
                            {language === 'vi' ? 'Theo dõi Hạn dùng' : 'Track Expiry'}
                          </span>
                        </label>
                      </div>

                      {/* Expiry Required on Receipt */}
                      <div className="flex items-center">
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={expiryRequired}
                            disabled={!trackExpiry || !trackInventory}
                            onChange={e => setExpiryRequired(e.target.checked)}
                            className="sr-only peer" 
                          />
                          <div className="relative w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed shrink-0"></div>
                          <span className={`ml-3 text-xs cursor-pointer leading-tight transition-colors ${(trackExpiry && trackInventory) ? 'text-slate-700 font-semibold' : 'text-slate-400 cursor-not-allowed font-medium'}`}>
                            {language === 'vi' ? 'Yêu cầu Hạn khi nhận' : 'Expiry Required'}
                          </span>
                        </label>
                      </div>

                      {/* Allow Stock without Batch */}
                      <div className="flex items-center">
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            disabled={!trackBatch || !trackInventory}
                            checked={allowNoBatch}
                            onChange={e => setAllowNoBatch(e.target.checked)}
                            className="sr-only peer" 
                          />
                          <div className="relative w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed shrink-0"></div>
                          <span className={`ml-3 text-xs cursor-pointer leading-tight transition-colors ${(trackBatch && trackInventory) ? 'text-slate-700 font-semibold' : 'text-slate-400 cursor-not-allowed font-medium'}`}>
                            {language === 'vi' ? 'Cho phép không lô' : 'Allow Stock without Batch'}
                          </span>
                        </label>
                      </div>

                    </div>
                  </div>
                </div>
              </div>

              {/* PARTE INFERIORE: LIVELLI E PARAMETRI DI SCADENZA */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start border-t border-slate-100 pt-5">
                
                {/* BASSO SINISTRA: INVENTORY LEVELS & LIMITS */}
                <div className="space-y-4">
                  <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-1">
                    {language === 'vi' ? 'Mức tồn kho & Định mức' : 'Inventory Levels & Limits'}
                  </h5>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        {language === 'vi' ? `Tồn tối thiểu (${editingItem.uom})` : `Min Stock (${editingItem.uom})`}
                      </label>
                      <input
                        type="text"
                        disabled={!trackInventory}
                        value={minStock}
                        onChange={e => setMinStock(formatLiveNumber(e.target.value))}
                        className="w-full border border-slate-200 rounded-xl px-3 h-9 text-xs font-semibold text-gray-800 bg-slate-50 focus:bg-white outline-none transition-colors disabled:opacity-50"
                        required={trackInventory}
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        {language === 'vi' ? `Mức chuẩn (${editingItem.uom})` : `Par Level (${editingItem.uom})`}
                      </label>
                      <input
                        type="text"
                        disabled={!trackInventory}
                        value={parLevel}
                        onChange={e => setParLevel(formatLiveNumber(e.target.value))}
                        className="w-full border border-slate-200 rounded-xl px-3 h-9 text-xs font-semibold text-gray-800 bg-slate-50 focus:bg-white outline-none transition-colors disabled:opacity-50"
                        required={trackInventory}
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        {language === 'vi' ? `Điểm đặt hàng (${editingItem.uom})` : `Order Point (${editingItem.uom})`}
                      </label>
                      <input
                        type="text"
                        disabled={!trackInventory}
                        value={reorderPoint}
                        onChange={e => setReorderPoint(formatLiveNumber(e.target.value))}
                        className="w-full border border-slate-200 rounded-xl px-3 h-9 text-xs font-semibold text-gray-800 bg-slate-50 focus:bg-white outline-none transition-colors disabled:opacity-50"
                        required={trackInventory}
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        {language === 'vi' ? 'Tần suất kiểm kê' : 'Counting Frequency'}
                      </label>
                      <select
                        value={countFrequency}
                        disabled={!trackInventory}
                        onChange={e => setCountFrequency(e.target.value as any)}
                        className="w-full border border-slate-200 rounded-xl px-3 h-9 text-xs font-semibold text-gray-800 bg-slate-50 outline-none cursor-pointer disabled:opacity-50"
                      >
                        <option value="none">{language === 'vi' ? 'Không kiểm kê' : 'None'}</option>
                        <option value="daily">{language === 'vi' ? 'Hàng ngày' : 'Daily'}</option>
                        <option value="weekly">{language === 'vi' ? 'Hàng tuần' : 'Weekly'}</option>
                        <option value="monthly">{language === 'vi' ? 'Hàng tháng' : 'Monthly'}</option>
                        <option value="custom">{language === 'vi' ? 'Tùy chỉnh' : 'Custom'}</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* BASSO DESTRA: SHELF LIFE & WARNING DAYS */}
                <div className="md:border-l md:border-slate-150 md:pl-8 space-y-4">
                  <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-1">
                    {language === 'vi' ? 'Thông số thời hạn' : 'Expiry Settings'}
                  </h5>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        {language === 'vi' ? 'Hạn sử dụng mặc định (ngày)' : 'Shelf Life (Days)'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        disabled={!trackInventory}
                        value={defaultShelfLife}
                        onChange={e => setDefaultShelfLife(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 h-9 text-xs font-semibold text-gray-800 bg-slate-50 focus:bg-white outline-none transition-colors disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        {language === 'vi' ? 'Cảnh báo trước hạn (ngày)' : 'Warning Days'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        disabled={!trackInventory}
                        value={warningDays}
                        onChange={e => setWarningDays(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 h-9 text-xs font-semibold text-gray-800 bg-slate-50 focus:bg-white outline-none transition-colors disabled:opacity-50"
                        required={trackInventory}
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Bottoni Salva */}
              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 h-10 rounded-xl text-sm font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  {language === 'vi' ? 'Hủy' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 h-10 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer"
                >
                  {language === 'vi' ? 'Lưu thiết lập' : 'Save Setup'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal di Gestione Location (Sfondo chiaro) */}
      {isLocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/80 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden border border-slate-100 shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between text-gray-900">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {editingLoc 
                    ? (language === 'vi' ? 'Sửa địa điểm' : 'Edit Location') 
                    : (language === 'vi' ? 'Thêm địa điểm' : 'Add Location')}
                </h3>
              </div>
              <button
                onClick={closeLocModal}
                className="text-slate-400 hover:text-slate-650 transition-colors text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveLoc} className="p-6 space-y-4 text-gray-900">
              {locErrorMsg && (
                <div className="bg-red-50 text-red-700 text-xs font-semibold p-3 rounded-xl border border-red-150">
                  {locErrorMsg}
                </div>
              )}

              {/* Codice Location */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  {language === 'vi' ? 'Mã địa điểm *' : 'Location Code *'}
                </label>
                <input
                  type="text"
                  value={locCode}
                  onChange={e => setLocCode(e.target.value)}
                  placeholder="E.g. WH01, KITCHEN_A"
                  className="w-full border border-slate-200 rounded-xl px-3 h-10 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 uppercase"
                  required
                />
              </div>

              {/* Nome Location */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  {language === 'vi' ? 'Tên địa điểm *' : 'Location Name *'}
                </label>
                <input
                  type="text"
                  value={locName}
                  onChange={e => setLocName(e.target.value)}
                  placeholder="E.g. Central Warehouse, District 1 Kitchen"
                  className="w-full border border-slate-200 rounded-xl px-3 h-10 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  required
                />
              </div>

              {/* Tipo di Location */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  {language === 'vi' ? 'Loại địa điểm' : 'Location Type'}
                </label>
                <select
                  value={locType}
                  onChange={e => setLocType(e.target.value as LocationType)}
                  className="w-full border border-slate-200 rounded-xl px-3 h-10 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-white"
                >
                  <option value="branch">{language === 'vi' ? 'Chi nhánh hệ thống (Branch)' : 'System Branch'}</option>
                  <option value="warehouse">{language === 'vi' ? 'Kho hàng (Warehouse)' : 'Warehouse'}</option>
                  <option value="kitchen">{language === 'vi' ? 'Bếp chế biến (Kitchen)' : 'Kitchen'}</option>
                  <option value="external">{language === 'vi' ? 'Kho đối tác ngoài (External)' : 'External Partner Warehouse'}</option>
                  <option value="other">{language === 'vi' ? 'Khác (Other)' : 'Other'}</option>
                </select>
              </div>

              {/* Associazione Branch (Visibile solo se tipo è 'branch') */}
              {locType === 'branch' && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    {language === 'vi' ? 'Chi nhánh liên kết *' : 'Linked System Branch *'}
                  </label>
                  <select
                    value={locBranchId}
                    onChange={e => setLocBranchId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 h-10 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-white disabled:bg-slate-100 disabled:text-slate-500"
                    required
                    disabled={branchId !== 'all'}
                  >
                    <option value="">{language === 'vi' ? '-- Chọn chi nhánh --' : '-- Select system branch --'}</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Stato di attività */}
              <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                  <label className="text-sm font-bold text-gray-800">
                    {language === 'vi' ? 'Trạng thái hoạt động' : 'Is Active'}
                  </label>
                  <p className="text-xs text-slate-400">
                    {language === 'vi'
                      ? 'Cho phép sử dụng địa điểm này trong giao dịch kho'
                      : 'Allow using this location in inventory transactions'}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={locIsActive}
                  onChange={e => setLocIsActive(e.target.checked)}
                  className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              {/* Bottoni Azione */}
              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeLocModal}
                  className="px-4 h-10 rounded-xl text-sm font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  {language === 'vi' ? 'Hủy' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 h-10 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer"
                >
                  {language === 'vi' ? 'Lưu' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function InventorySetupPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-transparent">
        <CircularLoader />
      </div>
    }>
      <InventorySetupContent />
    </Suspense>
  )
}
