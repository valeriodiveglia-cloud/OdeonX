'use client'

import React, { useEffect, useState, useMemo, useRef, Suspense } from 'react'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'
import ColumnHeader from '@/components/storehouse/ColumnHeader'
import Button from '@/components/Button'
import { PlusIcon, EyeIcon, ChevronRightIcon, ArrowLeftIcon, BuildingOffice2Icon, MapPinIcon, XMarkIcon, CalculatorIcon, BookOpenIcon, Square3Stack3DIcon, InboxIcon, SparklesIcon, ChatBubbleOvalLeftEllipsisIcon, ChartBarIcon, ClipboardDocumentListIcon, ArrowPathIcon, TrashIcon } from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'
import { useSearchParams } from 'next/navigation'

interface StockCount {
  id: string
  location_name: string
  status: 'draft' | 'approved' | 'cancelled'
  created_at: string
  approved_at: string | null
  created_by_name: string | null
  items?: CountItem[]
}

interface CountItem {
  id: string
  item_id: string
  item_name: string
  item_type: 'material' | 'prep'
  category: string
  brand?: string
  qty_theoretical: number
  qty_physical: number
  qty_adjustment: number
  uom: string
  unit_cost: number
  adjustment_value: number
}

interface Location {
  id: string
  name: string
  type?: string
  branch_id?: string
  provider_branches?: {
    address?: string
    city?: string
  } | {
    address?: string
    city?: string
  }[] | null
}

interface CostingItem {
  id: string
  name: string
  type: 'material' | 'prep'
  category: string
  brand?: string
  uom: string
  packaging_size: number
  unit_cost: number
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

function StockCountsContent() {
  const { language } = useSettings()
  const searchParams = useSearchParams()
  const branchId = searchParams.get('branchId') || 'all'
  const [locations, setLocations] = useState<Location[]>([])
  const [costingItems, setCostingItems] = useState<CostingItem[]>([])
  const [counts, setCounts] = useState<StockCount[]>([])
  const [role, setRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Form Nuovo Conteggio
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const [modalStep, setModalStep] = useState<'location' | 'form'>('location')
  const [cityFilter, setCityFilter] = useState('')
  const [selectedLocId, setSelectedLocId] = useState('')
  const [physicalQtys, setPhysicalQtys] = useState<Record<string, string>>({}) // item_id -> string
  const [errorMsg, setErrorMsg] = useState('')

  // Modal Dettagli
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false)
  const [viewingCount, setViewingCount] = useState<StockCount | null>(null)

  // Sort and Filter Table
  const [sortCol, setSortCol] = useState('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [openHeaderKey, setOpenHeaderKey] = useState<string | null>(null)
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({})

  // Permessi manager (Owner, Admin, Accountant o Manager)
  const isManager = useMemo(() => {
    return role && ['owner', 'admin', 'manager', 'accountant'].includes(role)
  }, [role])

  const isOwner = useMemo(() => {
    return role && ['owner', 'admin'].includes(role)
  }, [role])

  // Press-and-hold (auto-repeat) per i tasti stepper
  const repeatTimeoutRef = useRef<any>(null)
  const repeatIntervalRef = useRef<any>(null)

  const stopRepeat = () => {
    if (repeatTimeoutRef.current) clearTimeout(repeatTimeoutRef.current)
    if (repeatIntervalRef.current) clearInterval(repeatIntervalRef.current)
    repeatTimeoutRef.current = null
    repeatIntervalRef.current = null
  }

  const startRepeat = (action: () => void) => {
    stopRepeat()
    action()
    repeatTimeoutRef.current = setTimeout(() => {
      repeatIntervalRef.current = setInterval(() => {
        action()
      }, 75)
    }, 500)
  }

  const getBranchDetails = (loc: Location) => {
    if (!loc.provider_branches) return { address: '', city: '' }
    if (Array.isArray(loc.provider_branches)) {
      return loc.provider_branches[0] || { address: '', city: '' }
    }
    return loc.provider_branches
  }

  const cities = useMemo(() => {
    const list = locations.map(loc => getBranchDetails(loc).city).filter(Boolean) as string[]
    return Array.from(new Set(list))
  }, [locations])

  const filteredLocationsForModal = useMemo(() => {
    if (!cityFilter) return locations
    return locations.filter(loc => getBranchDetails(loc).city === cityFilter)
  }, [locations, cityFilter])

  const selectedLocationName = useMemo(() => {
    const found = locations.find(loc => loc.id === selectedLocId)
    return found ? found.name : ''
  }, [locations, selectedLocId])

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

        // Carica locations con dettagli del branch
        let locQuery = supabase
          .from('storehouse_locations')
          .select('id, name, type, branch_id, provider_branches(address, city)')
          .eq('is_active', true)
          .order('name')
        if (branchId && branchId !== 'all') {
          locQuery = locQuery.eq('branch_id', branchId)
        }
        const { data: locs } = await locQuery
        setLocations(locs || [])
        if (locs && locs.length > 0) {
          setSelectedLocId(locs[0].id)
        }

        // Carica anagrafica Costing
        const [matsRes, prepsRes] = await Promise.all([
          supabase.from('materials').select('id, name, brand, packaging_size, unit_cost, categories(name), uom(name)').is('deleted_at', null),
          supabase.from('prep_recipes').select('id, name, yield_qty, cost_per_unit_vnd, recipe_categories(name), uom(name)').is('deleted_at', null)
        ])

        const mats: CostingItem[] = (matsRes.data || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          type: 'material',
          category: m.categories?.name || '-',
          brand: (m.brand && m.brand.toLowerCase() !== 'unknown') ? m.brand : '-',
          uom: m.uom?.name || 'unit',
          packaging_size: Number(m.packaging_size || 1),
          unit_cost: Number(m.unit_cost || 0),
        }))

        const preps: CostingItem[] = (prepsRes.data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          type: 'prep',
          category: p.recipe_categories?.name || '-',
          brand: '-',
          uom: p.uom?.name || 'gr',
          packaging_size: Number(p.yield_qty || 1),
          unit_cost: Number(p.cost_per_unit_vnd || 0),
        }))

        setCostingItems([...mats, ...preps])

        // Carica i conteggi
        await loadCounts(locs || [])
      } catch (err) {
        console.error('Error loading stock counts page data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadInitial()
  }, [])

  useEffect(() => {
    return () => {
      stopRepeat()
    }
  }, [])

  const loadCounts = async (currentLocs?: Location[]) => {
    try {
      const { data, error } = await supabase
        .from('storehouse_stock_counts')
        .select(`
          *,
          storehouse_locations(name)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      let list = data || []
      const locList = currentLocs || locations
      if (branchId && branchId !== 'all') {
        const allowedLocIds = locList.map(l => l.id)
        list = list.filter(c => allowedLocIds.includes(c.location_id))
      }

      // Nomi dei creatori
      const { data: accounts } = await supabase.from('app_accounts').select('user_id, name')
      const userMap: Record<string, string> = {}
      ;(accounts || []).forEach(a => {
        if (a.user_id) userMap[a.user_id] = a.name || ''
      })

      const formatted: StockCount[] = (data || []).map((c: any) => ({
        id: c.id,
        location_name: c.storehouse_locations?.name || '-',
        status: c.status,
        created_at: c.created_at,
        approved_at: c.approved_at,
        created_by_name: userMap[c.created_by] || c.created_by || '-',
        items: [] // Verranno popolati pigramente o su richiesta
      }))

      setCounts(formatted)
    } catch (err) {
      console.error('Error loading counts list:', err)
    }
  }

  // Carica i dettagli di un conteggio specifico
  const loadCountItems = async (countId: string): Promise<CountItem[]> => {
    try {
      const { data, error } = await supabase
        .from('storehouse_stock_count_items')
        .select('*')
        .eq('stock_count_id', countId)

      if (error) throw error

      return (data || []).map((i: any) => {
        const costingMatch = costingItems.find(x => x.id === i.item_id && x.type === i.item_type)
        const unitCost = costingMatch ? costingMatch.unit_cost : 0
        const qtyAdjustment = Number(i.qty_counted) - Number(i.qty_theoretical)
        
        return {
          id: i.id,
          item_id: i.item_id,
          item_name: costingMatch ? costingMatch.name : `ID: ${i.item_id.slice(0, 8)}`,
          item_type: i.item_type,
          category: costingMatch ? costingMatch.category : '-',
          brand: costingMatch ? costingMatch.brand : '-',
          qty_theoretical: Number(i.qty_theoretical),
          qty_physical: Number(i.qty_counted),
          qty_adjustment: qtyAdjustment,
          uom: costingMatch ? costingMatch.uom : '',
          unit_cost: unitCost,
          adjustment_value: qtyAdjustment * unitCost
        }
      })
    } catch (err) {
      console.error('Error loading count items:', err)
      return []
    }
  }

  const handleOpenDetails = async (count: StockCount) => {
    try {
      setLoading(true)
      const items = await loadCountItems(count.id)
      setViewingCount({ ...count, items })
      setIsDetailsModalOpen(true)
    } finally {
      setLoading(false)
    }
  }

  // Items attivi e tracciati per la location selezionata (per comporre il form)
  const [trackedItemsForNewCount, setTrackedItemsForNewCount] = useState<CostingItem[]>([])
  const [theoreticalBalances, setTheoreticalBalances] = useState<Record<string, number>>({}) // item_id -> qty

  useEffect(() => {
    if (!selectedLocId || !isNewModalOpen) return

    async function loadTracked() {
      try {
        setLoading(true)
        // 1. Legge il setup di magazzino per capire cosa tracciare
        const { data: setups } = await supabase
          .from('storehouse_inventory_setup')
          .select('item_id, item_type')
          .eq('location_id', selectedLocId)
          .eq('track_inventory', true)

        if (!setups || setups.length === 0) {
          setTrackedItemsForNewCount([])
          setTheoreticalBalances({})
          return
        }

        const filtered = costingItems.filter(x =>
          setups.some(s => s.item_id === x.id && s.item_type === x.type)
        )
        setTrackedItemsForNewCount(filtered)

        // 2. Calcola la giacenza teorica corrente per ciascuno di questi item (somma qty_base dei movimenti)
        const { data: movs } = await supabase
          .from('storehouse_movements')
          .select('item_id, item_type, qty_base')
          .eq('location_id', selectedLocId)

        const balances: Record<string, number> = {}
        filtered.forEach(item => {
          const itemMovs = (movs || []).filter(m => m.item_id === item.id && m.item_type === item.type)
          balances[item.id] = itemMovs.reduce((acc, m) => acc + Number(m.qty_base || 0), 0)
        })
        setTheoreticalBalances(balances)

        // Prequotiamo le quantità fisiche a quelle teoriche per comodità
        const defaultQtys: Record<string, string> = {}
        filtered.forEach(item => {
          defaultQtys[item.id] = formatLiveNumber(String(balances[item.id] || 0))
        })
        setPhysicalQtys(defaultQtys)
      } catch (err) {
        console.error('Error loading tracked items for count:', err)
      } finally {
        setLoading(false)
      }
    }
    loadTracked()
  }, [selectedLocId, isNewModalOpen, costingItems])

  const handleDecrement = (itemId: string, theory: number) => {
    setPhysicalQtys(prev => {
      const currentStr = prev[itemId]
      const currentVal = currentStr === undefined || currentStr === '' 
        ? theory 
        : cleanFormattedNumber(currentStr)
      const newVal = Math.max(0, currentVal - 1)
      return { ...prev, [itemId]: formatLiveNumber(String(newVal)) }
    })
  }

  const handleIncrement = (itemId: string, theory: number) => {
    setPhysicalQtys(prev => {
      const currentStr = prev[itemId]
      const currentVal = currentStr === undefined || currentStr === '' 
        ? theory 
        : cleanFormattedNumber(currentStr)
      const newVal = currentVal + 1
      return { ...prev, [itemId]: formatLiveNumber(String(newVal)) }
    })
  }

  const handleCreateCount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || !selectedLocId || trackedItemsForNewCount.length === 0) return
    setErrorMsg('')

    try {
      setLoading(true)

      // 1. Inserisci testata del conteggio (Stato 'draft')
      const { data: countData, error: countErr } = await supabase
        .from('storehouse_stock_counts')
        .insert([{
          location_id: selectedLocId,
          scope: 'full',
          status: 'draft',
          created_by: userId
        }])
        .select()

      if (countErr) throw countErr
      const newCount = countData?.[0]
      if (!newCount) throw new Error('Failed to create count head')

      // Registrazione transazionale con ROLLBACK client-side
      const insertedItems: string[] = []

      try {
        // 2. Inserisci le righe del conteggio
        for (const item of trackedItemsForNewCount) {
          const theory = theoreticalBalances[item.id] ?? 0
          const physicalStr = physicalQtys[item.id]
          const physical = physicalStr === '' || isNaN(cleanFormattedNumber(physicalStr)) ? theory : cleanFormattedNumber(physicalStr)

          const { data: rowItem, error: rowErr } = await supabase
            .from('storehouse_stock_count_items')
            .insert([{
              stock_count_id: newCount.id,
              item_type: item.type,
              item_id: item.id,
              qty_theoretical: theory,
              qty_counted: physical,
              unit_cost: item.unit_cost || 0
            }])
            .select()

          if (rowErr) throw rowErr
          if (rowItem?.[0]) insertedItems.push(rowItem[0].id)
        }
      } catch (rowErr) {
        // ROLLBACK
        console.warn('Count rows failed, starting rollback...', rowErr)
        if (insertedItems.length > 0) {
          await supabase.from('storehouse_stock_count_items').delete().in('id', insertedItems)
        }
        await supabase.from('storehouse_stock_counts').delete().eq('id', newCount.id)
        throw rowErr
      }

      setIsNewModalOpen(false)
      setPhysicalQtys({})
      await loadCounts()
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating stock count')
    } finally {
      setLoading(false)
    }
  }

  // Approvazione del Conteggio Fisico e generazione degli Adjustment
  const handleApproveCount = async (count: StockCount) => {
    if (!isManager || !userId) return
    const textConfirm =
      language === 'vi'
        ? 'Bạn có chắc chắn muốn phê duyệt đợt kiểm kê này? Hệ thống sẽ tự động tạo các giao dịch điều chỉnh chênh lệch.'
        : 'Are you sure you want to approve this stock count? The system will auto-generate adjustments for discrepancies.'

    if (!window.confirm(textConfirm)) return

    try {
      setLoading(true)

      // Carica i dettagli del conteggio
      const items = await loadCountItems(count.id)

      // Mappa delle locazioni (per recuperare l'id effettivo)
      const { data: rawCountHead } = await supabase
        .from('storehouse_stock_counts')
        .select('location_id')
        .eq('id', count.id)
        .single()
      const locId = rawCountHead?.location_id

      if (!locId) throw new Error('Location not found for count')

      // Registrazione transazionale con ROLLBACK client-side in caso di errore sui movimenti
      const generatedMovements: string[] = []

      try {
        // 1. Per ogni item che ha discrepanze, inseriamo un movimento di tipo 'stock_count_adjustment'
        for (const item of items) {
          if (item.qty_adjustment !== 0) {
            const { data: movData, error: movErr } = await supabase
              .from('storehouse_movements')
              .insert([{
                location_id: locId,
                item_type: item.item_type,
                item_id: item.item_id,
                movement_type: 'stock_count_adjustment',
                qty_entered: Math.abs(item.qty_adjustment),
                unit_entered: item.uom,
                qty_base: item.qty_adjustment, // Positivo o Negativo per riallineare alla realtà fisica
                uom_base: item.uom,
                unit_cost: item.unit_cost,
                total_value: item.qty_adjustment * item.unit_cost,
                reason: `Stock Count Discrepancy Reconciliation`,
                notes: `COUNT-${count.id}`,
                created_by: userId,
                created_at: new Date().toISOString()
              }])
              .select()

            if (movErr) throw movErr
            if (movData?.[0]) generatedMovements.push(movData[0].id)
          }
        }

        // 2. Aggiorna lo stato del conteggio in 'approved'
        const { error: appErr } = await supabase
          .from('storehouse_stock_counts')
          .update({
            status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: userId
          })
          .eq('id', count.id)

        if (appErr) throw appErr

      } catch (appErr) {
        console.warn('Reconciliation movements failed, starting rollback...', appErr)
        // Rollback dei movimenti orfani generati
        if (generatedMovements.length > 0) {
          await supabase.from('storehouse_movements').delete().in('id', generatedMovements)
        }
        // Ripristina lo stato a draft
        await supabase.from('storehouse_stock_counts').update({ status: 'draft', approved_at: null, approved_by: null }).eq('id', count.id)
        throw appErr
      }

      setIsDetailsModalOpen(false)
      await loadCounts()
    } catch (err: any) {
      alert(err.message || 'Error approving stock count')
    } finally {
      setLoading(false)
    }
  }

  // Annullamento del Conteggio
  const handleCancelCount = async (count: StockCount) => {
    if (!isManager) return
    const textConfirm =
      language === 'vi'
        ? 'Bạn có chắc chắn muốn hủy đợt kiểm kê này không?'
        : 'Are you sure you want to cancel this stock count?'
    if (!window.confirm(textConfirm)) return

    try {
      setLoading(true)
      const { error } = await supabase
        .from('storehouse_stock_counts')
        .update({ status: 'cancelled' })
        .eq('id', count.id)

      if (error) throw error
      setIsDetailsModalOpen(false)
      await loadCounts()
    } catch (err: any) {
      alert(err.message || 'Error cancelling stock count')
    } finally {
      setLoading(false)
    }
  }

  // Eliminazione fisica definitiva del Conteggio (Owner/Admin)
  const handleDeleteCount = async (count: StockCount) => {
    if (!isOwner) return
    const textConfirm =
      language === 'vi'
        ? 'BẠN CÓ CHẮC CHẮN MUỐN XÓA VĨNH VIỄN đợt kiểm kê này khỏi hệ thống? Hành động này sẽ xóa toàn bộ dữ liệu liên quan và KHÔNG thể hoàn tác!'
        : 'ARE YOU SURE you want to DESTRUCTIVELY DELETE this stock count from the database? This will permanently delete all associated items and CANNOT be undone!'
    if (!window.confirm(textConfirm)) return

    try {
      setLoading(true)
      const { error } = await supabase
        .from('storehouse_stock_counts')
        .delete()
        .eq('id', count.id)

      if (error) throw error
      setIsDetailsModalOpen(false)
      await loadCounts()
    } catch (err: any) {
      alert(err.message || 'Error deleting stock count')
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (col: string, asc: boolean) => {
    setSortCol(col)
    setSortAsc(asc)
  }

  const handleFilterChange = (col: string, selected: Set<string> | null) => {
    setFilters(prev => ({ ...prev, [col]: selected }))
  }

  // Filtraggio e Ordinamento della tabella principale
  const filteredCounts = useMemo(() => {
    let result = [...counts]

    // Applica filtri
    Object.entries(filters).forEach(([col, set]) => {
      if (!set) return
      result = result.filter(item => {
        let val = ''
        if (col === 'location') val = item.location_name
        else if (col === 'status') val = item.status
        return set.has(val)
      })
    })

    // Ordina
    result.sort((a, b) => {
      let valA: any = a[sortCol as keyof StockCount] ?? ''
      let valB: any = b[sortCol as keyof StockCount] ?? ''

      if (sortCol === 'created_at') {
        valA = new Date(a.created_at).getTime()
        valB = new Date(b.created_at).getTime()
      }

      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
      }
      return sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1)
    })

    return result
  }, [counts, filters, sortCol, sortAsc])

  // Valori unici per i filtri delle colonne
  const locationValues = useMemo(() => Array.from(new Set(counts.map(c => c.location_name))), [counts])
  const statusValues = useMemo(() => ['draft', 'approved', 'cancelled'], [])

  const statusLabel = (status: StockCount['status']) => {
    switch (status) {
      case 'approved':
        return { label: language === 'vi' ? 'Đã phê duyệt' : 'Approved', color: 'text-green-700 bg-green-50 border-green-200' }
      case 'cancelled':
        return { label: language === 'vi' ? 'Đã hủy' : 'Cancelled', color: 'text-red-750 bg-red-50 border-red-200' }
      default:
        return { label: language === 'vi' ? 'Nháp (Chờ)' : 'Draft (Pending)', color: 'text-amber-700 bg-amber-50 border-amber-200' }
    }
  }

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-'
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
      {/* Header e Bottone Aggiungi */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{t(language, 'StockCounts')}</h1>
          <p className="text-sm text-slate-400">
            {language === 'vi'
              ? 'Rất tự động đối chiếu chênh lệch giữa số lượng thực tế kiểm kê và lý thuyết'
              : 'Reconcile physical stock counts with theoretical balances'}
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          icon={PlusIcon}
          onClick={() => {
            setModalStep('location')
            setIsNewModalOpen(true)
          }}
        >
          {language === 'vi' ? 'Đợt kiểm kê mới' : 'New Stock Count'}
        </Button>
      </div>

      {/* Tabella Conteggi: Sfondo Bianco e Testo Chiaro/Scuro coerente */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow p-3 overflow-hidden text-gray-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-slate-550 font-semibold">
                <ColumnHeader
                  colKey="location"
                  label={language === 'vi' ? 'Kho/Cửa hàng' : 'Location'}
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
                  className="hover:bg-gray-150 text-slate-550 font-bold"
                />
                <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {language === 'vi' ? 'Thời gian kiểm' : 'Counted At'}
                </th>
                <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {language === 'vi' ? 'Thời gian duyệt' : 'Approved At'}
                </th>
                <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {language === 'vi' ? 'Người tạo' : 'Created By'}
                </th>
                <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">
                  {language === 'vi' ? 'Chi tiết' : 'Reconciliation'}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                    {language === 'vi' ? 'Chưa ghi nhận đợt kiểm kê nào' : 'No stock counts logged'}
                  </td>
                </tr>
              ) : (
                filteredCounts.map((count, idx) => {
                  const statusConfig = statusLabel(count.status)
                  
                  return (
                    <tr key={count.id + idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-3 font-semibold text-gray-700">{count.location_name}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusConfig.color}`}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-gray-600">{formatDateTime(count.created_at)}</td>
                      <td className="p-3 text-xs text-gray-600">{formatDateTime(count.approved_at)}</td>
                      <td className="p-3 text-gray-650">{count.created_by_name || '-'}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleOpenDetails(count)}
                          className="p-1.5 text-blue-655 hover:text-blue-800 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center"
                          title={language === 'vi' ? 'Xem đối chiếu chênh lệch' : 'View discrepancies'}
                        >
                          <EyeIcon className="w-4.5 h-4.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nuovo Conteggio Fisico (Chiaro per inserimento dati) */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/80 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden border border-slate-100 shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Step 1: Selezione della Location */}
            {modalStep === 'location' && (
              <>
                <div className="p-6 border-b border-slate-200/60 flex items-center justify-between text-gray-900 bg-white shrink-0">
                  <div className="text-base font-extrabold text-slate-900 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                      <BuildingOffice2Icon className="h-5 w-5" />
                    </div>
                    <span>
                      {language === 'vi' ? 'Chọn Kho/Cửa Hàng Kiểm Kê' : 'Select Location for Stock Count'}
                    </span>
                  </div>
                  <button
                    onClick={() => setIsNewModalOpen(false)}
                    className="p-1.5 rounded-full text-slate-400 hover:text-slate-655 hover:bg-slate-200/65 transition cursor-pointer focus:outline-none flex items-center justify-center"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 text-gray-900 bg-white">
                  {cities.length > 0 && (
                    <div className="flex items-center gap-2 mb-4 shrink-0">
                      <label className="text-sm font-bold text-slate-900">{language === 'vi' ? 'Thành phố:' : 'City:'}</label>
                      <select
                        value={cityFilter}
                        onChange={e => setCityFilter(e.target.value)}
                        className="text-sm font-semibold border border-gray-300 rounded-lg bg-white text-slate-900 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 py-1.5 px-3 cursor-pointer focus:outline-none outline-none"
                      >
                        <option value="" className="text-slate-900 bg-white font-medium">{language === 'vi' ? 'Tất cả thành phố' : 'All Cities'}</option>
                        {cities.sort().map(c => (
                          <option key={c} value={c} className="text-slate-900 bg-white font-medium">{c}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[380px] overflow-y-auto pr-1">
                    {filteredLocationsForModal.map(loc => {
                      const details = getBranchDetails(loc)
                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => {
                            setSelectedLocId(loc.id)
                            setModalStep('form')
                          }}
                          className="group relative flex items-center gap-3.5 w-full p-4 rounded-2xl bg-white hover:bg-blue-50/10 border border-slate-250 hover:border-blue-500 shadow-[0_1px_3px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_20px_rgba(59,130,246,0.06)] transition-all duration-300 text-left cursor-pointer focus:outline-none"
                        >
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-250 group-hover:scale-103 text-blue-600 bg-blue-50 border border-blue-200/60">
                            <MapPinIcon className="w-6 h-6 stroke-[1.75]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-[13px] text-slate-900 group-hover:text-blue-700 transition-colors truncate">
                              {loc.name}
                            </h4>
                            <p className="text-[10px] text-slate-500 font-semibold leading-normal mt-0.5 group-hover:text-slate-655 line-clamp-2">
                              {details?.address || (loc.type === 'warehouse' ? (language === 'vi' ? 'Kho hàng' : 'Warehouse') : (language === 'vi' ? 'Chi nhánh' : 'Branch'))}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                    {filteredLocationsForModal.length === 0 && (
                      <div className="col-span-2 text-sm text-gray-550 italic text-center py-8">
                        {language === 'vi' ? 'Không tìm thấy địa điểm nào' : 'No locations found'}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Step 2: Form di Conteggio Fisico */}
            {modalStep === 'form' && (
              <>
                <div className="p-6 border-b border-slate-100 flex items-center justify-between text-gray-900 shrink-0">
                  <div className="flex items-center">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <ClipboardDocumentListIcon className="w-5 h-5 text-slate-400" />
                        {language === 'vi' ? 'Bắt đầu đợt kiểm kê kho' : 'New Stock Count Session'}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {language === 'vi' ? 'Nhập số lượng thực tế đếm được tại kho hàng' : 'Enter the physical quantities found in the warehouse'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setIsNewModalOpen(false)} className="p-1.5 rounded-full text-slate-400 hover:text-slate-655 hover:bg-slate-200/65 transition cursor-pointer focus:outline-none flex items-center justify-center">
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateCount} className="p-6 flex flex-col flex-1 overflow-hidden">
                  {errorMsg && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-750 text-xs font-semibold rounded-xl mb-4 shrink-0">
                      {errorMsg}
                    </div>
                  )}

                  {/* Card Location Selezionata */}
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 mb-4 flex items-center justify-between gap-4 shrink-0 text-gray-900">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-600/10 text-blue-600 rounded-xl p-2 w-9 h-9 flex items-center justify-center shrink-0">
                        <BuildingOffice2Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{language === 'vi' ? 'Địa điểm kiểm kê' : 'Stock Count Location'}</p>
                        <p className="text-sm font-bold text-slate-800">{selectedLocationName}</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={ArrowPathIcon}
                      onClick={() => setModalStep('location')}
                      type="button"
                      className="w-8 px-0"
                      title={language === 'vi' ? 'Thay đổi địa điểm' : 'Change Location'}
                    />
                  </div>

                  {/* Elenco Item con input per quantità fisica */}
                  <div className="flex-1 overflow-y-auto min-h-0 border border-slate-100 rounded-xl divide-y divide-slate-100 text-gray-900 mb-4 bg-white">
                    {trackedItemsForNewCount.length === 0 ? (
                      <p className="text-sm text-slate-400 italic text-center py-8">
                        {language === 'vi'
                          ? 'Không có sản phẩm nào được cấu hình theo dõi tại địa điểm này.'
                          : 'No items are configured for tracking at this location.'}
                      </p>
                    ) : (
                      trackedItemsForNewCount.map(item => {
                        const theory = theoreticalBalances[item.id] ?? 0
                        
                        return (
                          <div key={item.id} className="p-3 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-850 truncate">{item.name}</p>
                              <p className="text-xs text-slate-550">
                                {language === 'vi' ? 'Thuyết lượng (Lý thuyết):' : 'Theoretical:'} {theory.toLocaleString()} {item.uom}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 text-gray-900">
                              <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs h-9.5">
                                {/* Tasto Meno */}
                                <button
                                  type="button"
                                  onMouseDown={() => startRepeat(() => handleDecrement(item.id, theory))}
                                  onMouseUp={stopRepeat}
                                  onMouseLeave={stopRepeat}
                                  onTouchStart={e => { e.preventDefault(); startRepeat(() => handleDecrement(item.id, theory)) }}
                                  onTouchEnd={stopRepeat}
                                  onTouchCancel={stopRepeat}
                                  className="w-9.5 h-full bg-slate-50 hover:bg-slate-100/90 text-slate-500 hover:text-slate-700 flex items-center justify-center font-bold text-xs select-none transition-colors border-r border-slate-200 cursor-pointer active:bg-slate-200/50 focus:outline-none"
                                >
                                  —
                                </button>
                                {/* Input Quantità */}
                                <input
                                  type="text"
                                  value={physicalQtys[item.id] ?? ''}
                                  onChange={e => setPhysicalQtys(prev => ({ ...prev, [item.id]: formatLiveNumber(e.target.value) }))}
                                  className="w-18 h-full text-center border-0 focus:ring-0 focus:outline-none text-xs font-bold text-slate-800 bg-white"
                                  placeholder={String(theory)}
                                />
                                {/* Tasto Più */}
                                <button
                                  type="button"
                                  onMouseDown={() => startRepeat(() => handleIncrement(item.id, theory))}
                                  onMouseUp={stopRepeat}
                                  onMouseLeave={stopRepeat}
                                  onTouchStart={e => { e.preventDefault(); startRepeat(() => handleIncrement(item.id, theory)) }}
                                  onTouchEnd={stopRepeat}
                                  onTouchCancel={stopRepeat}
                                  className="w-9.5 h-full bg-slate-50 hover:bg-slate-100/90 text-slate-500 hover:text-slate-700 flex items-center justify-center font-bold text-xs select-none transition-colors border-l border-slate-200 cursor-pointer active:bg-slate-200/50 focus:outline-none"
                                >
                                  +
                                </button>
                              </div>
                              <span className="text-[10px] text-slate-400 font-bold uppercase w-10 truncate shrink-0 ml-1">
                                {item.uom}
                              </span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => setIsNewModalOpen(false)}
                      type="button"
                      disabled={loading}
                    >
                      {language === 'vi' ? 'Hủy' : 'Cancel'}
                    </Button>
                    <Button
                      variant="primary"
                      type="button"
                      onClick={handleCreateCount}
                      size="md"
                      disabled={trackedItemsForNewCount.length === 0}
                      loading={loading}
                    >
                      {language === 'vi' ? 'Tạo bản nháp' : 'Save Draft'}
                    </Button>
                  </div>
                </form>
              </>
            )}

          </div>
        </div>
      )}

      {/* Modal Dettagli / Đối chiếu chênh lệch (Chiaro per analisi discrepanze) */}
      {isDetailsModalOpen && viewingCount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/80 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-5xl overflow-hidden border border-slate-100 shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between text-gray-900">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {language === 'vi' ? 'Kết quả đối chiếu kiểm kê' : 'Inventory Discrepancy Analysis'}
                </h3>
                <p className="text-xs text-slate-500">
                  {viewingCount.location_name} — {formatDateTime(viewingCount.created_at)}
                </p>
              </div>
              <button onClick={() => setIsDetailsModalOpen(false)} className="text-slate-400 hover:text-slate-650 transition-colors text-sm font-semibold">
                ✕
              </button>
            </div>
            
            <div className="flex flex-col max-h-[85vh]">
              {/* Contenuto scrollabile */}
              <div className="p-6 overflow-y-auto min-h-0 flex-1">
                {/* Tabella Dettaglio chênh lệch */}
                <div className="border border-slate-100 rounded-xl text-gray-900 text-sm bg-white overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-150">
                      <tr>
                        <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{language === 'vi' ? 'Mặt hàng' : 'Item'}</th>
                        <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{language === 'vi' ? 'Nhãn hiệu' : 'Brand'}</th>
                        <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{language === 'vi' ? 'Lý thuyết' : 'Theoretical'}</th>
                        <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{language === 'vi' ? 'Thực tế' : 'Physical'}</th>
                        <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{language === 'vi' ? 'Chênh lệch' : 'Discrepancy'}</th>
                        <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{language === 'vi' ? 'Giá trị lệch' : 'Adj Value'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(!viewingCount.items || viewingCount.items.length === 0) ? (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-slate-400 italic">
                            {language === 'vi' ? 'Không tìm thấy chi tiết kiểm kê' : 'No items counted'}
                          </td>
                        </tr>
                      ) : (
                        viewingCount.items.map((item, idx) => {
                          const isDiff = item.qty_adjustment !== 0
                          const isNeg = item.qty_adjustment < 0
                          
                          return (
                            <tr key={idx} className={`hover:bg-slate-50/50 ${isDiff ? (isNeg ? 'bg-red-55/30' : 'bg-green-55/30') : ''}`}>
                              <td className="p-3 font-semibold text-slate-800">{item.item_name}</td>
                              <td className="p-3 font-medium text-slate-500">{item.brand || '—'}</td>
                              <td className="p-3 text-right font-medium text-slate-600">{item.qty_theoretical.toLocaleString()} {item.uom}</td>
                              <td className="p-3 text-right font-bold text-slate-850">{item.qty_physical.toLocaleString()} {item.uom}</td>
                              <td className={`p-3 text-right font-bold ${isDiff ? (isNeg ? 'text-red-650' : 'text-green-700') : 'text-slate-400'}`}>
                                {item.qty_adjustment > 0 ? '+' : ''}{item.qty_adjustment.toLocaleString()} {item.uom}
                              </td>
                              <td className={`p-3 text-right font-bold ${isDiff ? (isNeg ? 'text-red-650' : 'text-green-700') : 'text-slate-400'}`}>
                                {item.qty_adjustment !== 0 ? `${item.adjustment_value.toLocaleString()} VND` : '—'}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottoni Azione (Approvazione / Annullamento) */}
              <div className="p-6 border-t border-slate-100 flex justify-between items-center bg-white shrink-0">
                <div className="flex gap-2">
                  {isOwner && (
                    <Button
                      variant="danger-light"
                      size="md"
                      icon={TrashIcon}
                      onClick={() => handleDeleteCount(viewingCount)}
                      type="button"
                      className="w-10 px-0"
                      title={language === 'vi' ? 'Xóa vĩnh viễn' : 'Delete Permanently'}
                    />
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsDetailsModalOpen(false)}
                    className="px-4 h-10 text-sm font-semibold text-slate-555 hover:text-slate-700 transition-colors cursor-pointer"
                  >
                    {language === 'vi' ? 'Đóng' : 'Close'}
                  </button>
                  {viewingCount.status === 'draft' && isManager && (
                    <button
                      onClick={() => handleCancelCount(viewingCount)}
                      className="px-4 h-10 text-sm font-semibold text-red-600 hover:bg-red-50/50 rounded-lg transition-colors cursor-pointer border border-red-200 active:bg-red-100/40"
                    >
                      {language === 'vi' ? 'Hủy đợt kiểm kê' : 'Cancel Count'}
                    </button>
                  )}
                  {viewingCount.status === 'draft' && isManager && (
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => handleApproveCount(viewingCount)}
                      type="button"
                    >
                      <CheckIcon className="w-4 h-4" />
                      {language === 'vi' ? 'Phê duyệt & Đồng bộ' : 'Approve & Sync'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function StockCountsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-transparent">
        <CircularLoader />
      </div>
    }>
      <StockCountsContent />
    </Suspense>
  )
}
