'use client'

import React, { useEffect, useState, useMemo, Suspense } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import ColumnHeader from '@/components/storehouse/ColumnHeader'
import { useSearchParams } from 'next/navigation'
import { 
  Plus, 
  Trash2, 
  Check, 
  X, 
  Eye, 
  ArrowLeft,
  Calendar,
  MoveRight,
  AlertCircle,
  Truck,
  Shuffle,
  FileText,
  User,
  Undo2,
  Pencil,
  RotateCcw
} from 'lucide-react'
import { StorehouseTransfer, StorehouseTransferItem, StorehouseBatch } from '@/types/storehouse'

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—'
  const baseDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr
  const parts = baseDate.split('-')
  if (parts.length === 3) {
    const [year, month, day] = parts
    return `${day}/${month}/${year}`
  }
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
  } catch {
    return dateStr
  }
}

const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${day}/${month}/${year} ${hours}:${minutes}`
  } catch {
    return dateStr
  }
}
const formatStatus = (status: string | null | undefined, language: 'en' | 'vi'): string => {
  if (!status) return '—'
  const key = status.toLowerCase()
  if (key === 'draft') return language === 'vi' ? 'Bản nháp' : 'Draft'
  if (key === 'submitted') return language === 'vi' ? 'Đã gửi yêu cầu' : 'Submitted'
  if (key === 'approved') return language === 'vi' ? 'Đã duyệt' : 'Approved'
  if (key === 'in_transit') return language === 'vi' ? 'Đang vận chuyển' : 'In Transit'
  if (key === 'received') return language === 'vi' ? 'Đã nhận' : 'Received'
  if (key === 'partially_received') return language === 'vi' ? 'Nhận một phần' : 'Partially Received'
  if (key === 'cancelled') return language === 'vi' ? 'Đã hủy' : 'Cancelled'
  return status.toUpperCase()
}


const formatQty = (val: number | string | null | undefined): string => {
  if (val === null || val === undefined) return '0'
  const num = Number(val)
  if (isNaN(num)) return '0'
  return parseFloat(num.toFixed(3)).toString()
}

interface DbItem {
  id: string
  name: string
  brand?: string | null
  type: 'material' | 'prep'
  uom_name: string
  packaging_size: number
}

interface Location {
  id: string
  name: string
  is_active: boolean
  branch_id?: string | null
}

const textDict = {
  en: {
    editTransferDraft: 'Edit Transfer Draft',
    newBranchTransfer: 'New Branch Transfer',
    sourceLocation: 'Source Location',
    destinationLocation: 'Destination Location',
    requestedDate: 'Requested Date',
    notes: 'Notes',
    transferItemsList: 'Transfer Items List',
    addItem: 'Add Item',
    itemName: 'Item Name',
    type: 'Type',
    uom: 'UOM',
    qtyRequested: 'Qty Requested',
    noItemsAdded: 'No items added to this transfer yet',
    cancel: 'Cancel',
    saveTransferDraft: 'Save Transfer Draft',
    dispatchTransfer: 'Dispatch Transfer',
    receiveTransfer: 'Receive Transfer',
    transferSummary: 'Transfer Summary',
    logistics: 'Logistics',
    source: 'Source:',
    destination: 'Destination:',
    requestedDateLabel: 'Requested Date:',
    signaturesAndDates: 'Signatures & Dates',
    dispatchedOn: 'Dispatched on:',
    receivedOn: 'Received on:',
    notesTitle: 'Notes:',
    transferItemsDetails: 'Transfer Items Details',
    item: 'Item',
    requested: 'Requested',
    dispatched: 'Dispatched',
    qtyDispatch: 'Qty Dispatch',
    selectBatch: 'Select Batch',
    qtyReceived: 'Qty Received',
    variance: 'Variance',
    reasonNote: 'Reason / Note',
    received: 'Received',
    batchCode: 'Batch Code',
    reason: 'Reason',
    selectBatchOption: '-- Select Batch --',
    notTracked: 'Not tracked',
    varianceReasonPlaceholder: 'Variance reason...',
    close: 'Close',
    confirmDispatch: 'Confirm Dispatch',
    confirmReceipt: 'Confirm Receipt',
    transfersTitle: 'Transfers',
    transfersSubtitle: 'Manage and send items (Materials and Prep) between different warehouses',
    newBranchTransferBtn: 'New Branch Transfer',
    transferNumber: 'Transfer Number',
    unit: 'Unit',
    baseUnitOption: 'Base Unit',
    packageOption: 'Package ({size} {uom})',
    status: 'Status',
    actions: 'Actions',
    noTransfers: 'No transfers found',
    viewDetails: 'View details',
    editDraft: 'Edit Draft',
    submitForApproval: 'Submit for Approval',
    approveTransfer: 'Approve Transfer',
    dispatchShipmentTooltip: 'Dispatch Shipment',
    receiveGoodsTooltip: 'Receive Goods',
    cancelTransferTooltip: 'Cancel Transfer'
  },
  vi: {
    editTransferDraft: 'Sửa bản nháp chuyển kho',
    newBranchTransfer: 'Yêu cầu chuyển kho mới',
    sourceLocation: 'Kho nguồn',
    destinationLocation: 'Kho đích',
    requestedDate: 'Ngày yêu cầu',
    notes: 'Ghi chú',
    transferItemsList: 'Danh sách mặt hàng chuyển kho',
    addItem: 'Thêm mặt hàng',
    itemName: 'Tên mặt hàng',
    type: 'Loại',
    uom: 'ĐVT',
    qtyRequested: 'SL Yêu cầu',
    noItemsAdded: 'Chưa có mặt hàng nào được thêm vào',
    cancel: 'Hủy',
    saveTransferDraft: 'Lưu bản nháp chuyển kho',
    dispatchTransfer: 'Gửi vận chuyển',
    receiveTransfer: 'Nhận vận chuyển',
    transferSummary: 'Tóm tắt vận chuyển',
    logistics: 'Hậu cần',
    source: 'Nguồn gửi:',
    destination: 'Đích nhận:',
    requestedDateLabel: 'Yêu cầu lúc:',
    signaturesAndDates: 'Chữ ký & Thời gian',
    dispatchedOn: 'Đã gửi lúc:',
    receivedOn: 'Đã nhận lúc:',
    notesTitle: 'Ghi chú:',
    transferItemsDetails: 'Chi tiết các mặt hàng chuyển kho',
    item: 'Mặt hàng',
    requested: 'Yêu cầu',
    dispatched: 'Đã gửi',
    qtyDispatch: 'SL Gửi',
    selectBatch: 'Chọn lô hàng',
    qtyReceived: 'SL Nhận',
    variance: 'Chênh lệch',
    reasonNote: 'Lý do / Ghi chú',
    received: 'Đã nhận',
    batchCode: 'Mã lô hàng',
    reason: 'Lý do',
    selectBatchOption: '-- Chọn lô hàng --',
    notTracked: 'Không trích xuất',
    varianceReasonPlaceholder: 'Lý do chênh lệch...',
    close: 'Đóng',
    confirmDispatch: 'Xác nhận gửi',
    confirmReceipt: 'Xác nhận nhận',
    transfersTitle: 'Chuyển kho',
    transfersSubtitle: 'Quản lý và vận chuyển nguyên vật liệu & bán thành phẩm giữa các kho hàng',
    newBranchTransferBtn: 'Yêu cầu chuyển kho mới',
    transferNumber: 'Mã chuyển kho',
    unit: 'Đơn vị',
    baseUnitOption: 'Đơn vị cơ bản',
    packageOption: 'Thùng ({size} {uom})',
    status: 'Trạng thái',
    actions: 'Hành động',
    noTransfers: 'Không tìm thấy yêu cầu chuyển kho nào',
    viewDetails: 'Xem chi tiết',
    editDraft: 'Sửa bản nháp',
    submitForApproval: 'Gửi phê duyệt',
    approveTransfer: 'Phê duyệt yêu cầu',
    dispatchShipmentTooltip: 'Gửi vận chuyển',
    receiveGoodsTooltip: 'Nhận hàng',
    cancelTransferTooltip: 'Hủy chuyển kho'
  }
}

function BranchTransfersContent() {
  const { language } = useSettings()
  const searchParams = useSearchParams()
  const branchId = searchParams.get('branchId') || 'all'
  const langDict = language === 'vi' ? textDict.vi : textDict.en
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string>('staff')
  const [userId, setUserId] = useState<string | null>(null)

  const columnHeaderDict = useMemo(() => ({
    sortAsc: language === 'vi' ? 'Sắp xếp tăng dần' : 'Sort Ascending',
    sortDesc: language === 'vi' ? 'Sắp xếp giảm dần' : 'Sort Descending',
    selectAll: language === 'vi' ? 'Chọn tất cả' : 'Select All',
    deselectAll: language === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect All',
    filterPlaceholder: language === 'vi' ? 'Tìm kiếm...' : 'Search...',
    clearFilters: language === 'vi' ? 'Xóa bộ lọc' : 'Clear Filters',
  }), [language])
  
  // Data lists
  const [transfers, setTransfers] = useState<StorehouseTransfer[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [allItems, setAllItems] = useState<DbItem[]>([])
  const [sourceBatches, setSourceBatches] = useState<StorehouseBatch[]>([])
  const [inventorySetups, setInventorySetups] = useState<any[]>([])
  const [sourceStock, setSourceStock] = useState<Record<string, number>>({})

  // UI State
  const [isEditing, setIsEditing] = useState(false)
  const [isViewing, setIsViewing] = useState(false)
  const [activeTransfer, setActiveTransfer] = useState<Partial<StorehouseTransfer> | null>(null)
  const [activeItems, setActiveItems] = useState<Partial<StorehouseTransferItem>[]>([])
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [successMsg, setSuccessMsg] = useState<string>('')

  // Dispatch / Receive Workflow Modal State
  const [workflowMode, setWorkflowMode] = useState<'view' | 'dispatch' | 'receive' | 'none'>('none')

  // Table sort/filters
  const [sortCol, setSortCol] = useState('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [openHeaderKey, setOpenHeaderKey] = useState<string | null>(null)
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({})

  // Permissions
  const isManager = useMemo(() => {
    return role && ['owner', 'admin', 'manager', 'accountant'].includes(role)
  }, [role])

  useEffect(() => {
    if (workflowMode === 'dispatch' || workflowMode === 'receive') {
      const fetchFreshBatches = async () => {
        const { data: batches } = await supabase
          .from('storehouse_batches')
          .select('*')
          .gt('current_qty', 0)
        setSourceBatches(batches || [])
      }
      fetchFreshBatches()
    }
  }, [workflowMode])

  useEffect(() => {
    async function loadUser() {
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
    }
    loadUser()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

      // 0. Auto-pulizia orfani per i trasferimenti cancellati storici
      await supabase.rpc('cleanup_cancelled_transfers')
      
      // Load locations
      const { data: locs } = await supabase
        .from('storehouse_locations')
        .select('id, name, is_active, branch_id')
        .order('name')
      setLocations(locs || [])

      // Load Materials & Preps
      const [matsRes, prepsRes] = await Promise.all([
        supabase.from('materials').select('id, name, brand, packaging_size, uom(name)').is('deleted_at', null).order('name'),
        supabase.from('prep_recipes').select('id, name, uom(name)').is('deleted_at', null).order('name')
      ])

      const mats: DbItem[] = (matsRes.data || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        brand: m.brand,
        type: 'material',
        uom_name: m.uom?.name || 'unit',
        packaging_size: Number(m.packaging_size || 1)
      }))

      const preps: DbItem[] = (prepsRes.data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        type: 'prep',
        uom_name: p.uom?.name || 'gr',
        packaging_size: 1
      }))

      setAllItems([...mats, ...preps])

      // Load setups for batch configuration checks
      const { data: setups } = await supabase
        .from('storehouse_inventory_setup')
        .select('*')
      setInventorySetups(setups || [])

      // Load active batches (to choose source batches on dispatch)
      const { data: batches } = await supabase
        .from('storehouse_batches')
        .select('*')
        .gt('current_qty', 0)
      setSourceBatches(batches || [])

      // Carica i branch degli utenti per capire chi ha fatto la richiesta
      const { data: accounts } = await supabase.from('app_accounts').select('user_id, branch_id')
      const userBranchMap: Record<string, string> = {}
      ;(accounts || []).forEach(a => {
        if (a.user_id) userBranchMap[a.user_id] = a.branch_id || ''
      })

      // Load Transfers
      const { data: trs, error } = await supabase
        .from('storehouse_transfers')
        .select(`
          *,
          source:storehouse_locations!source_location_id(name, branch_id),
          destination:storehouse_locations!destination_location_id(name, branch_id)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      let formatted: StorehouseTransfer[] = (trs || []).map((t: any) => ({
        ...t,
        source_location_name: t.source?.name || '-',
        source_branch_id: t.source?.branch_id || null,
        destination_location_name: t.destination?.name || '-',
        destination_branch_id: t.destination?.branch_id || null,
        creator_branch_id: t.requested_by ? userBranchMap[t.requested_by] : null
      }))

      if (branchId && branchId !== 'all') {
        const allowedLocIds = (locs || []).filter((l: any) => l.branch_id === branchId).map((l: any) => l.id)
        formatted = formatted.filter(t => allowedLocIds.includes(t.source_location_id) || allowedLocIds.includes(t.destination_location_id))
      }

      setTransfers(formatted)
    } catch (err) {
      console.error('Error loading transfers data:', err)
      setErrorMsg(language === 'vi' ? 'Lỗi khi tải dữ liệu trang' : 'Error loading page data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const loadSourceStock = async (sourceLocationId: string) => {
    if (!sourceLocationId) {
      setSourceStock({})
      return
    }
    try {
      const { data, error } = await supabase
        .from('storehouse_movements')
        .select('item_type, item_id, qty_base')
        .eq('location_id', sourceLocationId)

      if (error) throw error

      const stockMap: Record<string, number> = {}
      ;(data || []).forEach(mov => {
        const key = `${mov.item_type}_${mov.item_id}`
        stockMap[key] = (stockMap[key] || 0) + Number(mov.qty_base || 0)
      })

      setSourceStock(stockMap)
    } catch (err) {
      console.error('Error loading source stock:', err)
    }
  }

  useEffect(() => {
    if (activeTransfer?.source_location_id) {
      loadSourceStock(activeTransfer.source_location_id)
    } else {
      setSourceStock({})
    }
  }, [activeTransfer?.source_location_id])

  // Filtered & Sorted Transfers
  const filteredAndSortedTransfers = useMemo(() => {
    let list = [...transfers]

    // Column Filters
    Object.keys(filters).forEach(colKey => {
      const activeSet = filters[colKey]
      if (activeSet && activeSet.size > 0) {
        list = list.filter(r => {
          let val = ''
          if (colKey === 'source_location') val = r.source_location_name || ''
          else if (colKey === 'destination_location') val = r.destination_location_name || ''
          else if (colKey === 'status') val = r.status || ''
          return activeSet.has(val)
        })
      }
    })

    // Sorting
    list.sort((a: any, b: any) => {
      let valA = a[sortCol]
      let valB = b[sortCol]
      if (sortCol === 'source_location') {
        valA = a.source_location_name || ''
        valB = b.source_location_name || ''
      } else if (sortCol === 'destination_location') {
        valA = a.destination_location_name || ''
        valB = b.destination_location_name || ''
      }
      
      if (valA === valB) return 0
      if (valA === null || valA === undefined) return sortAsc ? 1 : -1
      if (valB === null || valB === undefined) return sortAsc ? -1 : 1

      if (typeof valA === 'string') {
        return sortAsc 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA)
      } else {
        return sortAsc ? valA - valB : valB - valA
      }
    })

    return list
  }, [transfers, filters, sortCol, sortAsc])

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc)
    } else {
      setSortCol(col)
      setSortAsc(true)
    }
  }

  const handleFilterChange = (col: string, values: Set<string> | null) => {
    setFilters(prev => ({
      ...prev,
      [col]: values
    }))
  }

  const getFilterOptions = (colKey: string): string[] => {
    const vals = new Set<string>()
    transfers.forEach(r => {
      if (colKey === 'source_location') vals.add(r.source_location_name || '')
      else if (colKey === 'destination_location') vals.add(r.destination_location_name || '')
      else if (colKey === 'status') vals.add(r.status || '')
    })
    return Array.from(vals).filter(Boolean)
  }

  // Generate Transfer Number (TR-YYYYMMDD-XXX)
  const generateTransferNumber = async (): Promise<string> => {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const prefix = `TR-${yyyy}${mm}${dd}-`
    
    const { data } = await supabase
      .from('storehouse_transfers')
      .select('transfer_number')
      .like('transfer_number', `${prefix}%`)
      .order('transfer_number', { ascending: false })
      .limit(1)

    let nextNum = 1
    if (data && data.length > 0) {
      const lastNumStr = data[0].transfer_number.replace(prefix, '')
      const lastNum = parseInt(lastNumStr, 10)
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1
      }
    }

    return `${prefix}${String(nextNum).padStart(3, '0')}`
  }

  const openNewTransfer = async () => {
    setErrorMsg('')
    setSuccessMsg('')
    const num = await generateTransferNumber()
    
    const activeLocs = locations.filter(l => l.is_active)
    let sourceLocId = ''
    let destLocId = ''

    if (branchId && branchId !== 'all') {
      // Destinazione bloccata sul branch in uso
      const destLocs = activeLocs.filter(l => l.branch_id === branchId)
      destLocId = destLocs[0]?.id || ''
      // Sorgente selezionabile tra gli altri branch
      const sourceLocs = activeLocs.filter(l => l.branch_id !== branchId)
      sourceLocId = sourceLocs[0]?.id || ''
    } else {
      sourceLocId = activeLocs[0]?.id || ''
      destLocId = activeLocs[1]?.id || ''
    }

    setActiveTransfer({
      transfer_number: num,
      source_location_id: sourceLocId,
      destination_location_id: destLocId,
      requested_date: new Date().toISOString().split('T')[0],
      notes: '',
      status: 'draft'
    })
    setActiveItems([])
    setIsEditing(true)
    setIsViewing(false)
    setWorkflowMode('none')
  }

  const viewTransfer = async (transfer: StorehouseTransfer, mode: 'view' | 'dispatch' | 'receive' = 'view') => {
    try {
      setLoading(true)
      setErrorMsg('')
      setSuccessMsg('')
      
      const { data: itemsData, error } = await supabase
        .from('storehouse_transfer_items')
        .select('*')
        .eq('transfer_id', transfer.id)

      if (error) throw error

      // Map details
      const mappedItems: StorehouseTransferItem[] = (itemsData || []).map((item: any) => {
        const matchingItem = allItems.find(x => x.id === item.item_id && x.type === item.item_type)
        const pSize = Number(matchingItem?.packaging_size || 1)
        
        const qtyDispTemp = (transfer.status === 'submitted' && (item.qty_dispatched === 0 || item.qty_dispatched === null)) 
          ? item.qty_requested 
          : (item.qty_dispatched || 0)

        const isReqPkg = item.qty_requested > 0 && item.qty_requested % pSize === 0
        const isDispPkg = qtyDispTemp === 0 || qtyDispTemp % pSize === 0
        const isRecvPkg = item.qty_received === 0 || item.qty_received === null || (item.qty_received % pSize === 0)

        const isPkg = pSize > 1 && isReqPkg && isDispPkg && isRecvPkg

        const qtyRecvTemp = (transfer.status === 'in_transit' && (item.qty_received === 0 || item.qty_received === null))
          ? qtyDispTemp
          : (item.qty_received || 0)

        const varianceTemp = qtyRecvTemp - qtyDispTemp

        return {
          ...item,
          item_name: matchingItem?.name || '-',
          item_brand: matchingItem?.brand || '-',
          is_package: isPkg,
          qty_dispatched: qtyDispTemp,
          qty_approved: qtyDispTemp,
          qty_received: qtyRecvTemp,
          variance: item.variance !== undefined ? item.variance : varianceTemp,
          rejection_reason: item.notes || '',
          original_batch_number: item.batch_number
        } as any
      })

      setActiveTransfer(transfer)
      setActiveItems(mappedItems)
      setWorkflowMode(mode)
      setIsViewing(true)
      setIsEditing(false)
    } catch (err) {
      console.error('Error fetching transfer items:', err)
      setErrorMsg(language === 'vi' ? 'Không thể tải các mặt hàng' : 'Failed to load items')
    } finally {
      setLoading(false)
    }
  }

  const handleAddItemRow = () => {
    if (allItems.length === 0) return
    
    // Find first item with stock > 0 in source location
    const defaultItem = allItems.find(m => {
      const key = `${m.type}_${m.id}`
      return (sourceStock[key] || 0) > 0
    })

    if (!defaultItem) {
      setErrorMsg(
        language === 'vi'
          ? 'Không có mặt hàng nào còn hàng trong kho nguồn này.'
          : 'No items in stock in this source location.'
      )
      return
    }

    const newItem: Partial<StorehouseTransferItem> = {
      item_type: defaultItem.type,
      item_id: defaultItem.id,
      uom_base: defaultItem.uom_name,
      qty_requested: 0,
      qty_dispatched: 0,
      qty_received: 0,
      variance: 0,
      batch_number: null,
      expiry_date: null,
      notes: '',
      item_name: defaultItem.name,
      item_brand: defaultItem.brand || '-',
      is_package: false
    }
    setActiveItems([...activeItems, newItem])
  }

  const handleRemoveItemRow = (idx: number) => {
    setActiveItems(activeItems.filter((_, i) => i !== idx))
  }

  const handleItemChange = (idx: number, field: any, val: any) => {
    if (idx === -1) {
      if (field === 'source_location_id') {
        // Reset active items if source location changes
        setActiveItems([])
      }
      setActiveTransfer(prev => prev ? { ...prev, [field]: val } : null)
      return
    }

    const updated = [...activeItems]
    const row = { ...updated[idx] }

    if (field && typeof field === 'object') {
      // Support object updates to prevent React state batching race conditions
      Object.keys(field).forEach(k => {
        (row as any)[k] = field[k]
      })
    } else if (field === 'item_id') {
      // Find matches in combined materials/prep list
      const itemMatch = allItems.find(x => x.id === val)
      if (itemMatch) {
        row.item_id = val
        row.item_type = itemMatch.type
        row.item_name = itemMatch.name
        row.item_brand = itemMatch.brand || '-'
        row.uom_base = itemMatch.uom_name
        row.is_package = false
      }
    } else {
      (row as any)[field] = val
    }

    // Auto-calculate variance on receive
    const isQtyReceivedChanged = field === 'qty_received' || (field && typeof field === 'object' && 'qty_received' in field)
    const isQtyDispatchedChanged = field === 'qty_dispatched' || (field && typeof field === 'object' && 'qty_dispatched' in field)
    if (isQtyReceivedChanged || isQtyDispatchedChanged) {
      const qDisp = Number(row.qty_dispatched || 0)
      const qRecv = Number(row.qty_received || 0)
      row.variance = qRecv - qDisp
    }

    updated[idx] = row
    setActiveItems(updated)
  }

  const handleSaveDraft = async (submitDirectly = false) => {
    setErrorMsg('')
    setSuccessMsg('')
    if (!activeTransfer?.source_location_id || !activeTransfer?.destination_location_id) {
      setErrorMsg(language === 'vi' ? 'Vui lòng chọn cả kho nguồn và kho đích.' : 'Please select both source and destination locations.')
      return
    }

    if (activeTransfer.source_location_id === activeTransfer.destination_location_id) {
      setErrorMsg(language === 'vi' ? 'Kho nguồn và kho đích không được trùng nhau.' : 'Source and destination locations cannot be the same.')
      return
    }

    // Validate that requested quantities do not exceed available stock in source location
    for (let i = 0; i < activeItems.length; i++) {
      const item = activeItems[i]
      const key = `${item.item_type}_${item.item_id}`
      const maxStock = sourceStock[key] || 0
      const qty = Number(item.qty_requested || 0)
      if (qty <= 0) {
        setErrorMsg(
          language === 'vi'
            ? `Dòng ${i + 1}: Số lượng yêu cầu phải lớn hơn 0.`
            : `Row ${i + 1}: Requested quantity must be greater than 0.`
        )
        return
      }
      if (qty > maxStock) {
        setErrorMsg(
          language === 'vi'
            ? `Dòng ${i + 1}: Số lượng yêu cầu (${qty}) vượt quá số lượng hiện có trong kho nguồn (${maxStock}).`
            : `Row ${i + 1}: Requested quantity (${qty}) exceeds available stock in source location (${maxStock}).`
        )
        return
      }
    }

    try {
      setLoading(true)

      const finalStatus = submitDirectly ? 'submitted' : (activeTransfer.status || 'draft')

      const payload = {
        transfer_number: activeTransfer.transfer_number,
        source_location_id: activeTransfer.source_location_id,
        destination_location_id: activeTransfer.destination_location_id,
        requested_date: activeTransfer.requested_date,
        notes: activeTransfer.notes || null,
        status: finalStatus,
        requested_by: userId,
        created_at: new Date().toISOString()
      }

      let trId = activeTransfer.id
      if (trId) {
        const { error } = await supabase
          .from('storehouse_transfers')
          .update(payload)
          .eq('id', trId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('storehouse_transfers')
          .insert([payload])
          .select()
        if (error) throw error
        trId = data?.[0]?.id
      }

      // Save Items
      await supabase
        .from('storehouse_transfer_items')
        .delete()
        .eq('transfer_id', trId)

      if (activeItems.length > 0) {
        const itemsPayload = activeItems.map(item => ({
          transfer_id: trId,
          item_type: item.item_type,
          item_id: item.item_id,
          uom_base: item.uom_base,
          qty_requested: Number(item.qty_requested || 0),
          qty_dispatched: Number(item.qty_dispatched || 0),
          qty_received: Number(item.qty_received || 0),
          variance: Number(item.variance || 0),
          notes: item.notes || null
        }))

        const { error: itemsErr } = await supabase
          .from('storehouse_transfer_items')
          .insert(itemsPayload)
        if (itemsErr) throw itemsErr
      }

      if (submitDirectly) {
        setSuccessMsg(language === 'vi' ? 'Đã gửi yêu cầu chuyển kho thành công!' : 'Transfer request submitted successfully!')
      } else {
        setSuccessMsg(language === 'vi' ? 'Lưu bản nháp chuyển kho thành công!' : 'Transfer draft saved successfully!')
      }
      setIsEditing(false)
      loadData()
    } catch (err) {
      console.error('Error saving transfer draft:', err)
      setErrorMsg(language === 'vi' ? 'Lỗi lưu dữ liệu' : 'Failed to save transfer data')
    } finally {
      setLoading(false)
    }
  }

  // Submit for Approval
  const handleSubmitTransfer = async (transfer: StorehouseTransfer) => {
    try {
      setLoading(true)
      const { error } = await supabase
        .from('storehouse_transfers')
        .update({ status: 'submitted' })
        .eq('id', transfer.id)

      if (error) throw error
      setSuccessMsg(language === 'vi' ? 'Đã gửi yêu cầu chuyển kho!' : 'Transfer request submitted!')
      loadData()
    } catch (err) {
      console.error('Error submitting transfer:', err)
      setErrorMsg(language === 'vi' ? 'Không thể gửi yêu cầu' : 'Failed to submit transfer')
    } finally {
      setLoading(false)
    }
  }

  // Approve Transfer
  const handleApproveTransfer = async (transfer: StorehouseTransfer) => {
    try {
      setLoading(true)

      // 1. Salva gli item con le eventuali quantità modificate (approvazione parziale)
      if (activeItems.length > 0) {
        for (const item of activeItems) {
          const approvedQty = Number(item.qty_dispatched !== undefined ? item.qty_dispatched : item.qty_requested || 0)
          const { error: itemUpdErr } = await supabase
            .from('storehouse_transfer_items')
            .update({
              qty_dispatched: approvedQty,
              reason: item.reason || null
            })
            .eq('transfer_id', transfer.id)
            .eq('item_type', item.item_type)
            .eq('item_id', item.item_id)

          if (itemUpdErr) throw itemUpdErr
        }
      }

      const { error } = await supabase
        .from('storehouse_transfers')
        .update({ 
          status: 'approved',
          approved_by: userId
        })
        .eq('id', transfer.id)

      if (error) throw error
      setSuccessMsg(language === 'vi' ? 'Đã phê duyệt yêu cầu chuyển kho!' : 'Transfer request approved!')
      loadData()
    } catch (err) {
      console.error('Error approving transfer:', err)
      setErrorMsg(language === 'vi' ? 'Không thể phê duyệt yêu cầu' : 'Failed to approve transfer')
    } finally {
      setLoading(false)
    }
  }

  // Dispatch Transfer (Shipment out of source, into transit)
  const handleDispatchTransfer = async () => {
    if (!activeTransfer?.id) return

    let hasAtLeastOneDispatched = false
    for (let i = 0; i < activeItems.length; i++) {
      const item = activeItems[i]
      const qtyDisp = Number(item.qty_dispatched || 0)
      if (qtyDisp < 0) {
        setErrorMsg(
          language === 'vi'
            ? `Dòng ${i + 1}: Số lượng vận chuyển không được âm.`
            : `Row ${i + 1}: Dispatched quantity cannot be negative.`
        )
        return
      }
      if (qtyDisp > 0) {
        hasAtLeastOneDispatched = true
        // If batch is tracked, verify source batch selection
        const setup = inventorySetups.find(
          s => s.location_id === activeTransfer.source_location_id && 
               s.item_type === item.item_type && 
               s.item_id === item.item_id
        )
        
        if (setup?.track_batch && !item.batch_number) {
          setErrorMsg(
            language === 'vi'
              ? `Dòng ${i + 1}: Bắt buộc chọn số lô cho ${item.item_name}.`
              : `Row ${i + 1}: Batch selection is required for ${item.item_name}.`
          )
          return
        }
      }
    }

    if (!hasAtLeastOneDispatched && activeItems.length > 0) {
      setErrorMsg(
        language === 'vi'
          ? 'Phải vận chuyển ít nhất một mặt hàng con.'
          : 'At least one item must have a dispatched quantity greater than 0.'
      )
      return
    }

    try {
      setLoading(true)
      const movementsCreated: string[] = []

      try {
        // 1. Sposta lo stato in In Transit
        const { error: trErr } = await supabase
          .from('storehouse_transfers')
          .update({
            status: 'in_transit',
            dispatch_date: new Date().toISOString().split('T')[0],
            dispatched_by: userId
          })
          .eq('id', activeTransfer.id)

        if (trErr) throw trErr

        for (const item of activeItems) {
          const qtyDisp = Number(item.qty_dispatched || 0)

          const { error: itemUpdErr } = await supabase
            .from('storehouse_transfer_items')
            .update({
              qty_dispatched: qtyDisp,
              batch_number: qtyDisp > 0 ? item.batch_number : null,
              expiry_date: qtyDisp > 0 ? item.expiry_date : null
            })
            .eq('id', item.id)

          if (itemUpdErr) throw itemUpdErr

          if (qtyDisp <= 0) {
            continue
          }

          // 3. Crea movimenti di magazzino:
          // - TRANSFER_OUT (Negativo, sorgente)
          const { data: outMov, error: outErr } = await supabase
            .from('storehouse_movements')
            .insert([{
              location_id: activeTransfer.source_location_id,
              item_type: item.item_type,
              item_id: item.item_id,
              movement_type: 'transfer_out',
              qty_entered: qtyDisp,
              unit_entered: item.uom_base,
              qty_base: -qtyDisp,
              uom_base: item.uom_base,
              unit_cost: 0, // Inserito a costo 0 o da storico costi
              total_value: 0,
              notes: `TR-OUT-${activeTransfer.transfer_number}`,
              reference_type: 'branch_transfer',
              reference_id: activeTransfer.id,
              created_by: userId,
              created_at: new Date().toISOString()
            }])
            .select()

          if (outErr) throw outErr
          if (outMov?.[0]) movementsCreated.push(outMov[0].id)

          // - STOCK_IN_TRANSIT (Positivo, destinazione temporaneo)
          const { data: transitMov, error: transitErr } = await supabase
            .from('storehouse_movements')
            .insert([{
              location_id: activeTransfer.destination_location_id,
              item_type: item.item_type,
              item_id: item.item_id,
              movement_type: 'stock_in_transit',
              qty_entered: item.qty_dispatched,
              unit_entered: item.uom_base,
              qty_base: Number(item.qty_dispatched),
              uom_base: item.uom_base,
              unit_cost: 0,
              total_value: 0,
              notes: `TR-TRANSIT-${activeTransfer.transfer_number}`,
              reference_type: 'branch_transfer',
              reference_id: activeTransfer.id,
              created_by: userId,
              created_at: new Date().toISOString()
            }])
            .select()

          if (transitErr) throw transitErr
          if (transitMov?.[0]) movementsCreated.push(transitMov[0].id)

          // 4. Scarica quantità del lotto sorgente
          if (item.batch_number) {
            const matchBatch = sourceBatches.find(
              b => b.location_id === activeTransfer.source_location_id && 
                   b.item_id === item.item_id && 
                   b.batch_code === item.batch_number
            )
            if (matchBatch) {
              const newQty = Math.max(0, Number(matchBatch.current_qty) - Number(item.qty_dispatched))
              const { error: bErr } = await supabase
                .from('storehouse_batches')
                .update({
                  current_qty: newQty,
                  status: newQty === 0 ? 'depleted' : matchBatch.status
                })
                .eq('id', matchBatch.id)

              if (bErr) throw bErr
            }
          }
        }

        setSuccessMsg(language === 'vi' ? 'Đã gửi hàng chuyển kho!' : 'Transfer dispatched and is In Transit!')
        setIsViewing(false)
        loadData()
      } catch (innerErr) {
        // Rollback transazionale
        console.error('Dispatch failed, triggering rollback:', innerErr)
        await supabase
          .from('storehouse_transfers')
          .update({ status: 'approved', dispatch_date: null, dispatched_by: null })
          .eq('id', activeTransfer.id)

        if (movementsCreated.length > 0) {
          await supabase
            .from('storehouse_movements')
            .delete()
            .in('id', movementsCreated)
        }
        throw innerErr
      }
    } catch (err) {
      console.error('Error dispatching transfer:', err)
      setErrorMsg(language === 'vi' ? 'Không thể gửi vận chuyển' : 'Failed to dispatch transfer')
    } finally {
      setLoading(false)
    }
  }

  // Receive Transfer (Into destination, clear transit, log variance)
  const handleReceiveTransfer = async () => {
    if (!activeTransfer?.id) return

    // Validations
    for (let i = 0; i < activeItems.length; i++) {
      const item = activeItems[i]
      if (Number(item.qty_received || 0) < 0) {
        setErrorMsg(
          language === 'vi'
            ? `Dòng ${i + 1}: Số lượng nhận không được là số âm.`
            : `Row ${i + 1}: Received quantity cannot be negative.`
        )
        return
      }
    }

    try {
      setLoading(true)
      const movementsCreated: string[] = []
      const batchesCreated: string[] = []

      try {
        const isPartial = activeItems.some(item => Number(item.variance || 0) !== 0)
        const finalStatus = isPartial ? 'partially_received' : 'received'

        // 1. Aggiorna lo stato del trasferimento
        const { error: trErr } = await supabase
          .from('storehouse_transfers')
          .update({
            status: finalStatus,
            received_date: new Date().toISOString().split('T')[0],
            received_by: userId
          })
          .eq('id', activeTransfer.id)

        if (trErr) throw trErr

        // 2. Carica i lotti per ereditare la scadenza corretta del lotto di origine se trasferito
        for (const item of activeItems) {
          const qtyDisp = Number(item.qty_dispatched || 0)

          if (qtyDisp <= 0) {
            const { error: itemUpdErr } = await supabase
              .from('storehouse_transfer_items')
              .update({
                qty_received: 0,
                variance: 0,
                reason: 'Not approved/shipped by source branch'
              })
              .eq('id', item.id)

            if (itemUpdErr) throw itemUpdErr
            continue
          }

          const { error: itemUpdErr } = await supabase
            .from('storehouse_transfer_items')
            .update({
              qty_received: item.qty_received,
              variance: item.variance,
              notes: (item as any).rejection_reason || null,
              batch_number: item.batch_number || null,
              expiry_date: item.expiry_date || null
            })
            .eq('id', item.id)

          if (itemUpdErr) throw itemUpdErr

          // 3. Movimenti di magazzino:
          // - Rimuovi stock In Transit (Negativo)
          const { data: clearTransit, error: clearErr } = await supabase
            .from('storehouse_movements')
            .insert([{
              location_id: activeTransfer.destination_location_id,
              item_type: item.item_type,
              item_id: item.item_id,
              movement_type: 'stock_in_transit',
              qty_entered: item.qty_dispatched,
              unit_entered: item.uom_base,
              qty_base: -Number(item.qty_dispatched), // rimuovi il transito positivo
              uom_base: item.uom_base,
              unit_cost: 0,
              total_value: 0,
              notes: `TR-TRANSIT-CLEAR-${activeTransfer.transfer_number}`,
              reference_type: 'branch_transfer',
              reference_id: activeTransfer.id,
              created_by: userId,
              created_at: new Date().toISOString()
            }])
            .select()

          if (clearErr) throw clearErr
          if (clearTransit?.[0]) movementsCreated.push(clearTransit[0].id)

          // - Carica STOCK in destinazione (TRANSFER_IN positivo)
          const { data: inMov, error: inErr } = await supabase
            .from('storehouse_movements')
            .insert([{
              location_id: activeTransfer.destination_location_id,
              item_type: item.item_type,
              item_id: item.item_id,
              movement_type: 'transfer_in',
              qty_entered: item.qty_received,
              unit_entered: item.uom_base,
              qty_base: Number(item.qty_received),
              uom_base: item.uom_base,
              unit_cost: 0,
              total_value: 0,
              notes: `TR-IN-${activeTransfer.transfer_number}`,
              reference_type: 'branch_transfer',
              reference_id: activeTransfer.id,
              created_by: userId,
              created_at: new Date().toISOString()
            }])
            .select()

          if (inErr) throw inErr
          if (inMov?.[0]) movementsCreated.push(inMov[0].id)

          // - Se c'è merce non ricevuta/rifiutata (varianza negativa), eseguiamo il Return al magazzino sorgente
          const qtyReturned = qtyDisp - Number(item.qty_received || 0)
          if (qtyReturned > 0) {
            // Crea movimento di ritorno (transfer_in) sul magazzino del mittente
            const { data: retMov, error: retErr } = await supabase
              .from('storehouse_movements')
              .insert([{
                location_id: activeTransfer.source_location_id,
                item_type: item.item_type,
                item_id: item.item_id,
                movement_type: 'transfer_in',
                qty_entered: qtyReturned,
                unit_entered: item.uom_base,
                qty_base: qtyReturned,
                uom_base: item.uom_base,
                unit_cost: 0,
                total_value: 0,
                notes: `TR-RETURN-${activeTransfer.transfer_number}`,
                reference_type: 'branch_transfer',
                reference_id: activeTransfer.id,
                created_by: userId,
                created_at: new Date().toISOString()
              }])
              .select()

            if (retErr) throw retErr
            if (retMov?.[0]) movementsCreated.push(retMov[0].id)

            // Ri-accredita il lotto sorgente nel magazzino sorgente
            if (item.batch_number) {
              const { data: srcB, error: srcBErr } = await supabase
                .from('storehouse_batches')
                .select('id, current_qty')
                .eq('location_id', activeTransfer.source_location_id)
                .eq('item_type', item.item_type)
                .eq('item_id', item.item_id)
                .eq('batch_code', (item as any).original_batch_number)
                .maybeSingle()

              if (!srcBErr && srcB) {
                const { error: updSrcBErr } = await supabase
                  .from('storehouse_batches')
                  .update({
                    current_qty: Number(srcB.current_qty || 0) + qtyReturned
                  })
                  .eq('id', srcB.id)

                if (updSrcBErr) throw updSrcBErr
              }
            }
          }

          // 4. Se l'articolo ha tracciamento lotti, propaga il lotto nella destinazione
          const setup = inventorySetups.find(
            s => s.location_id === activeTransfer.destination_location_id && 
                 s.item_type === item.item_type && 
                 s.item_id === item.item_id
          )

          if ((setup?.track_batch || setup?.track_expiry) && Number(item.qty_received || 0) > 0) {
            // Crea lotto duplicato con stesso codice/scadenza
            const { data: newBatch, error: bErr } = await supabase
              .from('storehouse_batches')
              .insert([{
                batch_code: item.batch_number || `TR-LOT-${(activeTransfer.transfer_number || '').slice(-4)}`,
                item_type: item.item_type,
                item_id: item.item_id,
                location_id: activeTransfer.destination_location_id,
                expiry_date: item.expiry_date || null,
                receipt_date: new Date().toISOString().split('T')[0],
                initial_qty: Number(item.qty_received || 0),
                current_qty: Number(item.qty_received || 0),
                uom_base: item.uom_base,
                unit_cost: 0,
                source_type: 'transfer',
                source_id: activeTransfer.id,
                status: 'active',
                created_at: new Date().toISOString()
              }])
              .select()

            if (bErr) throw bErr
            if (newBatch?.[0]) batchesCreated.push(newBatch[0].id)
          }
        }

        setSuccessMsg(language === 'vi' ? 'Đã xác nhận nhận hàng chuyển kho!' : 'Transfer received successfully!')
        setIsViewing(false)
        loadData()
      } catch (innerErr) {
        // Rollback
        console.error('Receive failed, triggering rollback:', innerErr)
        await supabase
          .from('storehouse_transfers')
          .update({ status: 'in_transit', received_date: null, received_by: null })
          .eq('id', activeTransfer.id)

        if (movementsCreated.length > 0) {
          await supabase
            .from('storehouse_movements')
            .delete()
            .in('id', movementsCreated)
        }

        if (batchesCreated.length > 0) {
          await supabase
            .from('storehouse_batches')
            .delete()
            .in('id', batchesCreated)
        }
        throw innerErr
      }
    } catch (err) {
      console.error('Error receiving transfer:', err)
      setErrorMsg(language === 'vi' ? 'Không thể xác nhận nhận hàng' : 'Failed to receive transfer')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelTransfer = async (transfer: StorehouseTransfer) => {
    // 1. Messaggio di conferma specifico per lo stato
    let confirmMsg = language === 'vi' 
      ? 'Bạn có chắc chắn muốn hủy yêu cầu chuyển kho này?' 
      : 'Are you sure you want to cancel this transfer request?';
      
    if (transfer.status === 'received' || transfer.status === 'partially_received') {
      confirmMsg = language === 'vi'
        ? 'Bạn có chắc chắn muốn hoàn tác việc nhận hàng và quay lại bước trước đó (Đang vận chuyển)?'
        : 'Are you sure you want to undo the receipt and return to the previous step (In Transit)?';
    } else if (transfer.status === 'in_transit') {
      confirmMsg = language === 'vi'
        ? 'Bạn có chắc chắn muốn hoàn tác việc gửi hàng và quay lại bước trước đó (Bản nháp)?'
        : 'Are you sure you want to undo the dispatch and return to the previous step (Draft)?';
    }

    if (!window.confirm(confirmMsg)) {
      return
    }

    try {
      setLoading(true)
      setErrorMsg('')
      setSuccessMsg('')

      // --- CASO 1: ANNULLA RICEZIONE (status: received / partially_received) ---
      if (transfer.status === 'received' || transfer.status === 'partially_received') {
        // Controlliamo che i lotti creati a destinazione non siano stati consumati
        const { data: destBatches, error: bErr } = await supabase
          .from('storehouse_batches')
          .select('*')
          .eq('source_type', 'transfer')
          .eq('source_id', transfer.id)

        if (bErr) throw bErr

        if (destBatches && destBatches.length > 0) {
          for (const batch of destBatches) {
            if (Number(batch.current_qty) < Number(batch.initial_qty)) {
              setErrorMsg(
                language === 'vi'
                  ? `Không thể hủy: Mặt hàng trong lô ${batch.batch_code} đã được tiêu thụ một phần.`
                  : `Cannot cancel: Items in batch ${batch.batch_code} have been partially consumed.`
              )
              setLoading(false)
              return
            }
          }
        }

        // Procediamo con lo storno via RPC (lato database, bypassando l'RLS di storehouse_movements)
        const { error: rpcErr } = await supabase.rpc('undo_storehouse_transfer_receipt', { p_transfer_id: transfer.id })
        if (rpcErr) throw rpcErr

        // c. Aggiorna lo stato del trasferimento a in_transit e azzera dati ricezione negli item
        const { error: trUpdErr } = await supabase
          .from('storehouse_transfers')
          .update({
            status: 'in_transit',
            received_date: null,
            received_by: null
          })
          .eq('id', transfer.id)

        if (trUpdErr) throw trUpdErr

        const { error: itemsUpdErr } = await supabase
          .from('storehouse_transfer_items')
          .update({
            qty_received: 0,
            variance: 0,
            reason: null
          })
          .eq('transfer_id', transfer.id)

        if (itemsUpdErr) throw itemsUpdErr

        setSuccessMsg(language === 'vi' ? 'Đã hủy nhận hàng và chuyển về Đang vận chuyển!' : 'Receipt cancelled, status returned to In Transit!')
      }

      // --- CASO 2: ANNULLA SPEDIZIONE (status: in_transit) ---
      else if (transfer.status === 'in_transit') {
        // Procediamo con il rollback completo via RPC (lato database, bypassando l'RLS di storehouse_movements)
        const { error: rpcErr } = await supabase.rpc('cancel_storehouse_transfer', { p_transfer_id: transfer.id })
        if (rpcErr) throw rpcErr

        // d. Riporta lo stato del trasferimento a draft e azzera i dati spedizione negli item
        const { error: trUpdErr } = await supabase
          .from('storehouse_transfers')
          .update({
            status: 'draft',
            dispatch_date: null,
            dispatched_by: null
          })
          .eq('id', transfer.id)

        if (trUpdErr) throw trUpdErr

        const { error: itemsUpdErr } = await supabase
          .from('storehouse_transfer_items')
          .update({
            qty_dispatched: 0,
            batch_number: null,
            expiry_date: null
          })
          .eq('transfer_id', transfer.id)

        if (itemsUpdErr) throw itemsUpdErr

        setSuccessMsg(language === 'vi' ? 'Đã hủy gửi hàng và chuyển về Bản nháp!' : 'Dispatch cancelled, status returned to Draft!')
      }

      // --- CASO 2.5: ANNULLA APPROVAZIONE (status: approved) ---
      else if (transfer.status === 'approved') {
        const { error: trUpdErr } = await supabase
          .from('storehouse_transfers')
          .update({
            status: 'submitted'
          })
          .eq('id', transfer.id)

        if (trUpdErr) throw trUpdErr
        setSuccessMsg(language === 'vi' ? 'Đã hoàn tác phê duyệt!' : 'Approval undone, returned to submitted request!')
      }

      // --- CASO 3: ANNULLA DRAFT / SUBMITTED ---
      else {
        const { error } = await supabase
          .from('storehouse_transfers')
          .update({ status: 'cancelled' })
          .eq('id', transfer.id)

        if (error) throw error
        setSuccessMsg(language === 'vi' ? 'Đã hủy chuyển kho!' : 'Transfer cancelled!')
      }

      setIsEditing(false)
      setIsViewing(false)
      loadData()
    } catch (err) {
      console.error('Error cancelling/rolling back transfer:', err)
      setErrorMsg(language === 'vi' ? 'Không thể thực hiện thao tác hủy' : 'Failed to perform cancel operation')
    } finally {
      setLoading(false)
    }
  }
  // Recall submitted transfer back to draft
  const handleRecallTransfer = async (transfer: StorehouseTransfer) => {
    try {
      setLoading(true)
      setErrorMsg('')
      setSuccessMsg('')

      const { error } = await supabase
        .from('storehouse_transfers')
        .update({ status: 'draft' })
        .eq('id', transfer.id)

      if (error) throw error
      setSuccessMsg(language === 'vi' ? 'Đã thu hồi yêu cầu chuyển kho về bản nháp!' : 'Transfer request recalled to Draft!')
      setIsViewing(false)
      loadData()
    } catch (err) {
      console.error('Error recalling transfer:', err)
      setErrorMsg(language === 'vi' ? 'Không thể thu hồi yêu cầu' : 'Failed to recall transfer request')
    } finally {
      setLoading(false)
    }
  }
  const isApprover = useMemo(() => {
    if (!activeTransfer || activeTransfer.status !== 'submitted') return false
    let approverBranchId = activeTransfer.source_branch_id
    if (activeTransfer.creator_branch_id) {
      if (activeTransfer.creator_branch_id === activeTransfer.destination_branch_id) {
        approverBranchId = activeTransfer.source_branch_id
      } else if (activeTransfer.creator_branch_id === activeTransfer.source_branch_id) {
        approverBranchId = activeTransfer.destination_branch_id
      }
    }
    return branchId === 'all' || branchId === approverBranchId
  }, [activeTransfer, branchId])

  return (
    <div className="space-y-6 text-slate-100">
      
      {/* 1. CREAZIONE / MODIFICA TRASFERIMENTO */}
      {isEditing && activeTransfer && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 text-gray-900 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsEditing(false)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-slate-500"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-bold text-gray-900">
                {activeTransfer.id 
                  ? (language === 'vi' ? 'Sửa bản nháp chuyển kho' : 'Edit Transfer Draft') 
                  : (language === 'vi' ? 'Yêu cầu chuyển kho mới' : 'New Branch Transfer')}
              </h2>
            </div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {activeTransfer.transfer_number}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                {language === 'vi' ? 'Kho nguồn (Từ)' : 'Source Location'}
              </label>
              <select
                value={activeTransfer.source_location_id}
                onChange={e => handleItemChange(-1, 'source_location_id' as never, e.target.value)}
                disabled={!!activeTransfer.id}
                className="w-full border border-slate-200 rounded-xl px-3 h-10 text-sm font-semibold bg-slate-50 text-gray-800 disabled:opacity-50"
              >
                {locations.filter(l => l.is_active && (branchId === 'all' || l.branch_id !== branchId)).map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                {language === 'vi' ? 'Kho đích (Đến)' : 'Destination Location'}
              </label>
              <select
                value={activeTransfer.destination_location_id}
                onChange={e => handleItemChange(-1, 'destination_location_id' as never, e.target.value)}
                disabled={!!activeTransfer.id || (branchId !== 'all' && !activeTransfer.id)}
                className="w-full border border-slate-200 rounded-xl px-3 h-10 text-sm font-semibold bg-slate-50 text-gray-800 disabled:opacity-50"
              >
                {locations.filter(l => l.is_active && (branchId === 'all' || l.branch_id === branchId)).map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                {language === 'vi' ? 'Ngày yêu cầu' : 'Requested Date'}
              </label>
              <input
                type="date"
                value={activeTransfer.requested_date}
                onChange={e => handleItemChange(-1, 'requested_date' as never, e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 h-10 text-sm font-semibold bg-slate-50 text-gray-800"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              {language === 'vi' ? 'Ghi chú' : 'Notes'}
            </label>
            <input
              type="text"
              value={activeTransfer.notes || ''}
              onChange={e => handleItemChange(-1, 'notes' as never, e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 h-10 text-sm font-semibold bg-slate-50 text-gray-800"
            />
          </div>

          {/* Righe Trasferimento */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-base text-gray-900">
                {language === 'vi' ? 'Danh sách mặt hàng chuyển kho' : 'Transfer Items List'}
              </h3>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 text-xs font-bold text-blue-600 hover:bg-blue-50/50 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> {language === 'vi' ? 'Thêm mặt hàng' : 'Add Item'}
              </button>
            </div>

            <div className="overflow-x-auto border border-gray-150 rounded-2xl">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left">{language === 'vi' ? 'Tên mặt hàng' : 'Item Name'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-center w-[120px]">{language === 'vi' ? 'Đơn vị' : 'Unit'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right w-[130px]">{language === 'vi' ? 'Sẵn có' : 'Available'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-center w-[120px]">{language === 'vi' ? 'Loại' : 'Type'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-center w-[120px]">{language === 'vi' ? 'ĐVT' : 'UOM'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right w-[110px]">{language === 'vi' ? 'SL Yêu cầu' : 'Qty Requested'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left">{language === 'vi' ? 'Ghi chú' : 'Notes'}</th>
                    <th className="py-2.5 px-3 text-center w-[60px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {activeItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-slate-400 italic font-semibold">
                        {language === 'vi' ? 'Chưa có mặt hàng nào được thêm vào' : 'No items added to this transfer yet'}
                      </td>
                    </tr>
                  ) : (
                    activeItems.map((item, idx) => {
                      const currentItemKey = `${item.item_type}_${item.item_id}`
                      const filteredOptions = allItems.filter(m => {
                        const key = `${m.type}_${m.id}`
                        const stock = sourceStock[key] || 0
                        return stock > 0 || key === currentItemKey
                      })

                      const currentStockVal = sourceStock[currentItemKey] || 0
                      const matchingItem = allItems.find(x => x.id === item.item_id && x.type === item.item_type)
                      const packagingSize = matchingItem?.packaging_size || 1
                      const showUnitSelector = item.item_type === 'material' && packagingSize > 1

                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2">
                            <select
                              value={item.item_id}
                              onChange={e => handleItemChange(idx, 'item_id', e.target.value)}
                              className="w-full border border-slate-200 rounded-xl px-2.5 h-9 text-xs font-semibold text-gray-800 bg-slate-50"
                            >
                              {filteredOptions.map(m => (
                                <option key={m.id} value={m.id}>
                                  {m.name} {m.brand && m.brand !== '-' ? `(${m.brand})` : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 text-center w-[120px]">
                            {showUnitSelector ? (
                              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                                <button
                                  type="button"
                                  onClick={() => handleItemChange(idx, 'is_package', true)}
                                  className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition-all cursor-pointer ${
                                    item.is_package
                                      ? 'bg-blue-600 text-white shadow-sm'
                                      : 'text-slate-500 hover:text-slate-700'
                                  }`}
                                  title={
                                    language === 'vi' 
                                      ? `Thùng (${packagingSize} ${item.uom_base})` 
                                      : `Package (${packagingSize} ${item.uom_base})`
                                  }
                                >
                                  {language === 'vi' ? 'Gói' : 'Pack'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleItemChange(idx, 'is_package', false)}
                                  className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition-all cursor-pointer ${
                                    !item.is_package
                                      ? 'bg-blue-600 text-white shadow-sm'
                                      : 'text-slate-500 hover:text-slate-700'
                                  }`}
                                >
                                  {language === 'vi' ? 'Lẻ' : 'Unit'}
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500 font-semibold">${item.uom_base}</span>
                            )}
                          </td>
                          <td className="p-2 text-right text-xs font-semibold text-slate-600 w-[130px]">
                            {item.is_package 
                              ? `${formatQty(currentStockVal / packagingSize)} pk` 
                              : `${formatQty(currentStockVal)} ${item.uom_base}`}
                          </td>
                          <td className="p-2 text-center text-xs text-slate-500 font-semibold uppercase">
                            {item.item_type}
                          </td>
                          <td className="p-2 text-center text-xs text-slate-555 font-bold">
                            {item.uom_base}
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step={item.is_package ? "1" : "any"}
                              value={
                                item.qty_requested 
                                  ? (item.is_package 
                                      ? parseFloat((item.qty_requested / packagingSize).toFixed(3)) 
                                      : item.qty_requested) 
                                  : ''
                              }
                              onChange={e => {
                                const inputVal = Number(e.target.value)
                                const qtyBase = item.is_package ? inputVal * packagingSize : inputVal
                                handleItemChange(idx, 'qty_requested', qtyBase)
                              }}
                              className={`w-full border rounded-xl px-2 h-9 text-xs text-right font-medium text-gray-800 bg-slate-50 ${
                                (item.qty_requested || 0) > currentStockVal
                                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500 text-red-655 font-bold bg-red-50/50'
                                  : 'border-slate-200'
                              }`}
                            />
                            {(item.qty_requested || 0) > currentStockVal && (
                              <span className="text-[10px] text-red-500 block text-right mt-0.5 font-semibold">
                                {language === 'vi' 
                                  ? `Tối đa ${item.is_package ? formatQty(currentStockVal / packagingSize) + ' pk' : formatQty(currentStockVal) + ' ' + item.uom_base}`
                                  : `Max: ${item.is_package ? formatQty(currentStockVal / packagingSize) + ' pk' : formatQty(currentStockVal) + ' ' + item.uom_base}`}
                              </span>
                            )}
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.notes || ''}
                              onChange={e => handleItemChange(idx, 'notes', e.target.value)}
                              placeholder="..."
                              className="w-full border border-slate-200 rounded-xl px-2.5 h-9 text-xs text-gray-800 bg-slate-50"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(idx)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
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

          <div className="flex justify-between items-center border-t border-gray-100 pt-5">
            <div>
              {activeTransfer.id && ['draft', 'submitted', 'approved'].includes(activeTransfer.status || '') && (
                <button
                  type="button"
                  onClick={() => handleCancelTransfer(activeTransfer as StorehouseTransfer)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-bold transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  {language === 'vi' ? 'Hủy yêu cầu' : 'Cancel Request'}
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors cursor-pointer"
              >
                {language === 'vi' ? 'Hủy' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleSaveDraft(false)}
                className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 rounded-xl text-sm font-bold transition-colors cursor-pointer"
              >
                {language === 'vi' ? 'Lưu bản nháp' : 'Save Draft'}
              </button>
              <button
                type="button"
                onClick={() => handleSaveDraft(true)}
                className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors cursor-pointer"
              >
                {language === 'vi' ? 'Gửi' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. OPERAZIONI WORKFLOW (VIEW / DISPATCH / RECEIVE) */}
      {isViewing && activeTransfer && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 text-gray-900 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsViewing(false)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-slate-500"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-bold text-gray-900">
                {workflowMode === 'dispatch' && langDict.dispatchTransfer}
                {workflowMode === 'receive' && langDict.receiveTransfer}
                {workflowMode === 'view' && langDict.transferSummary}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                activeTransfer.status === 'received' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                activeTransfer.status === 'in_transit' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                activeTransfer.status === 'cancelled' ? 'bg-red-50 text-red-600 border-red-100' :
                'bg-slate-50 text-slate-600 border-slate-100'
              }`}>
                {formatStatus(activeTransfer.status, language)}
              </span>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                {activeTransfer.transfer_number}
              </div>
            </div>
          </div>

          {/* Dati Generali / Logistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider inline-flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-blue-600" /> {language === 'vi' ? 'Vận chuyển' : 'Logistics'}
              </div>
              <div className="text-xs font-medium text-slate-700">
                <strong>{language === 'vi' ? 'Kho nguồn:' : 'Source:'}</strong> {activeTransfer.source_location_name}
              </div>
              <div className="text-xs font-medium text-slate-700">
                <strong>{language === 'vi' ? 'Kho đích:' : 'Destination:'}</strong> {activeTransfer.destination_location_name}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-600" /> {language === 'vi' ? 'Mốc thời gian' : 'Timestamps'}
              </div>
              <div className="text-xs font-medium text-slate-700">
                <strong>{language === 'vi' ? 'Ngày yêu cầu:' : 'Requested Date:'}</strong> {formatDate(activeTransfer.requested_date)}
              </div>
              <div className="text-xs font-medium text-slate-700">
                <strong>{language === 'vi' ? 'Ngày gửi:' : 'Dispatched On:'}</strong> {formatDate(activeTransfer.dispatch_date)}
              </div>
              <div className="text-xs font-medium text-slate-700">
                <strong>{language === 'vi' ? 'Ngày nhận:' : 'Received On:'}</strong> {formatDate(activeTransfer.received_date)}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider inline-flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-blue-600" /> {language === 'vi' ? 'Ghi chú' : 'Notes & Metadata'}
              </div>
              <div className="text-xs font-medium text-slate-700">
                <strong>{language === 'vi' ? 'Ghi chú:' : 'Notes:'}</strong> {activeTransfer.notes || '—'}
              </div>
              <div className="text-xs font-medium text-slate-700">
                <strong>{language === 'vi' ? 'Tạo lúc:' : 'Created At:'}</strong> {formatDateTime(activeTransfer.created_at)}
              </div>
            </div>
          </div>

          {/* Tabella righe per workflow */}
          <div className="space-y-3">
            <h3 className="font-bold text-base text-gray-900">{langDict.transferItemsDetails}</h3>
            
            <div className="overflow-x-auto border border-gray-150 rounded-2xl">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left">{langDict.item}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-center w-[80px]">{langDict.uom}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right w-[110px]">{langDict.requested}</th>
                    
                    {/* Colonne condizionali in base al workflow */}
                    
                    {/* Se è l'approvatore in visualizzazione submitted, mostra l'input Approved Qty e Reason */}
                    {isApprover && workflowMode === 'view' && (
                      <>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right w-[125px]">
                          {language === 'vi' ? 'SL phê duyệt' : 'Approved Qty'}
                        </th>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left w-[450px]">
                          {language === 'vi' ? 'Lý do' : 'Reason / Note'}
                        </th>
                      </>
                    )}

                    {/* Mostra la colonna Dispatched solo per stati successivi a approved (in_transit, received, etc.) */}
                    {workflowMode === 'view' && activeTransfer.status !== 'draft' && activeTransfer.status !== 'submitted' && activeTransfer.status !== 'approved' && (
                      <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right w-[110px]">{langDict.dispatched}</th>
                    )}

                    {/* Se il trasferimento è in stato approved ed è in visualizzazione view (sola lettura), mostra Approved Qty e Reason */}
                    {workflowMode === 'view' && activeTransfer.status === 'approved' && (
                      <>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right w-[110px]">
                          {language === 'vi' ? 'SL phê duyệt' : 'Approved Qty'}
                        </th>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left w-[400px]">
                          {language === 'vi' ? 'Lý do' : 'Reason / Note'}
                        </th>
                      </>
                    )}
                    
                    {workflowMode === 'dispatch' && (
                      <>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right w-[125px]">
                          {language === 'vi' ? 'SL gửi' : 'Dispatching Qty'}
                        </th>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left w-[450px]">{langDict.selectBatch}</th>
                      </>
                    )}

                    {workflowMode === 'receive' && (
                      <>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right w-[110px]">
                          {language === 'vi' ? 'SL gửi' : 'Dispatched Qty'}
                        </th>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right w-[110px]">
                          {language === 'vi' ? 'SL nhận' : 'Received Qty'}
                        </th>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right w-[100px]">
                          {language === 'vi' ? 'Lệch' : 'Variance'}
                        </th>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right w-[110px]">
                          {language === 'vi' ? 'Từ chối / Trả lại' : 'Rejected / Return'}
                        </th>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left w-[450px]">
                          {language === 'vi' ? 'Lô & Hạn dùng' : 'Batch & Expiry'}
                        </th>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left w-[250px]">
                          {language === 'vi' ? 'Lý do từ chối' : 'Rejection Reason'}
                        </th>
                      </>
                    )}

                    {workflowMode === 'view' && activeTransfer.status !== 'draft' && activeTransfer.status !== 'submitted' && activeTransfer.status !== 'approved' && (
                      <>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right w-[110px]">{langDict.received}</th>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right w-[100px]">{langDict.variance}</th>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left w-[200px]">{langDict.batchCode}</th>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left w-[250px]">
                          {language === 'vi' ? 'Lý do duyệt (Gửi)' : 'Reason (Sender)'}
                        </th>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left w-[250px]">
                          {language === 'vi' ? 'Lý do từ chối (Nhận)' : 'Rejection Reason (Receiver)'}
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {activeItems.map((item, idx) => {
                    // Filtra i lotti disponibili per la location sorgente e questo item
                    const batchesForItem = sourceBatches.filter(
                      b => b.location_id === activeTransfer.source_location_id && 
                           b.item_id === item.item_id && 
                           b.item_type === item.item_type
                    )

                    // Check setup per lotto
                    const setup = inventorySetups.find(
                      s => s.location_id === activeTransfer.source_location_id && 
                           s.item_type === item.item_type && 
                           s.item_id === item.item_id
                    )
                    const isBatchTracked = setup?.track_batch ?? false
                    const matchingItem = allItems.find(x => x.id === item.item_id && x.type === item.item_type)
                    const packagingSize = matchingItem?.packaging_size || 1
                    const showUnitSelector = item.item_type === 'material' && packagingSize > 1

                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-semibold text-gray-900">
                          {item.item_name} {item.item_brand && item.item_brand !== '-' ? `(${item.item_brand})` : ''}
                        </td>
                        
                        {/* Selettore Packaging/Unit interattivo o statico */}
                        <td className="p-2 text-center w-[120px]">
                          {showUnitSelector && (
                            (isApprover && workflowMode === 'view') || 
                            workflowMode === 'receive'
                          ) ? (
                            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                              <button
                                type="button"
                                onClick={() => handleItemChange(idx, 'is_package', true)}
                                className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition-all cursor-pointer ${
                                  item.is_package
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                                title={
                                  language === 'vi' 
                                    ? `Thùng (${packagingSize} ${item.uom_base})` 
                                    : `Package (${packagingSize} ${item.uom_base})`
                                }
                              >
                                {language === 'vi' ? 'Gói' : 'Pack'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleItemChange(idx, 'is_package', false)}
                                className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition-all cursor-pointer ${
                                  !item.is_package
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                              >
                                {language === 'vi' ? 'Lẻ' : 'Unit'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500 font-semibold uppercase">
                              {item.is_package && packagingSize > 1 ? (language === 'vi' ? 'Gói' : 'Pack') : item.uom_base}
                            </span>
                          )}
                        </td>

                        {/* Qty Requested (sempre in sola lettura) */}
                        <td className="p-3 text-right text-xs text-slate-700 font-medium w-[110px]">
                          {item.is_package && packagingSize > 1 
                            ? `${formatQty((item.qty_requested || 0) / packagingSize)} pk` 
                            : `${(item.qty_requested || 0).toLocaleString()} ${item.uom_base}`}
                        </td>

                        {/* Se è l'approvatore in submitted, mostra l'input Approved Qty e la Reason */}
                        {isApprover && workflowMode === 'view' && (
                          <>
                            <td className="p-2 text-right w-[110px]">
                              <input
                                type="number"
                                min="0"
                                max={item.is_package ? (item.qty_requested || 0) / packagingSize : item.qty_requested || 0}
                                step={item.is_package ? "1" : "any"}
                                value={
                                  item.qty_dispatched !== undefined 
                                    ? (item.is_package 
                                        ? parseFloat(((item.qty_dispatched || 0) / packagingSize).toFixed(3)) 
                                        : item.qty_dispatched)
                                    : (item.is_package 
                                        ? parseFloat(((item.qty_requested || 0) / packagingSize).toFixed(3)) 
                                        : item.qty_requested || 0)
                                }
                                onChange={e => {
                                  const inputVal = Number(e.target.value)
                                  const maxVal = item.is_package ? (item.qty_requested || 0) / packagingSize : item.qty_requested || 0
                                  const finalInputVal = Math.min(maxVal, Math.max(0, inputVal))
                                  const qtyBase = item.is_package ? finalInputVal * packagingSize : finalInputVal
                                  handleItemChange(idx, 'qty_dispatched', qtyBase)
                                }}
                                className="w-full border border-slate-200 rounded-xl px-2 h-9 text-xs text-right font-bold text-gray-900 bg-slate-50"
                              />
                            </td>
                            <td className="p-2 w-[450px]">
                              <input
                                type="text"
                                placeholder={language === 'vi' ? 'Nhập lý do...' : 'Enter reason...'}
                                value={item.reason || ''}
                                onChange={e => handleItemChange(idx, 'reason', e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-2.5 h-9 text-xs text-gray-800 bg-slate-50"
                              />
                            </td>
                          </>
                        )}

                        {/* Dispatch Fields (la quantità è in sola lettura pari ad approved) */}
                        {workflowMode === 'dispatch' && (
                          <>
                            <td className="p-3 text-right text-xs text-slate-700 font-semibold w-[125px]">
                              {item.is_package && packagingSize > 1 
                                ? `${formatQty(((item as any).qty_approved || 0) / packagingSize)} pk` 
                                : `${((item as any).qty_approved || 0).toLocaleString()} ${item.uom_base}`}
                            </td>

                            <td className="p-2 w-[450px]">
                              {isBatchTracked ? (
                                <select
                                  value={item.batch_number || ''}
                                  onChange={e => {
                                    const selB = batchesForItem.find(x => x.batch_code === e.target.value)
                                    handleItemChange(idx, {
                                      batch_number: e.target.value,
                                      expiry_date: selB?.expiry_date || null
                                    }, null)
                                  }}
                                  className="w-full border border-slate-200 rounded-xl px-2.5 h-9 text-xs font-semibold text-gray-800 bg-slate-50"
                                >
                                  <option value="">{langDict.selectBatchOption}</option>
                                  {batchesForItem.map(b => (
                                    <option key={b.id} value={b.batch_code}>
                                      {b.batch_code} ({b.current_qty} {b.uom_base} - Exp: {b.expiry_date ? formatDate(b.expiry_date) : 'N/A'})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">{langDict.notTracked}</span>
                              )}
                            </td>
                          </>
                        )}

                        {/* Receive Fields */}
                        {workflowMode === 'receive' && (
                          <>
                            <td className="p-3 text-right text-xs text-slate-700 font-medium w-[110px]">
                              {item.is_package && packagingSize > 1 
                                ? `${formatQty((item.qty_dispatched || 0) / packagingSize)} pk` 
                                : `${(item.qty_dispatched || 0).toLocaleString()} ${item.uom_base}`}
                            </td>
                            <td className="p-2 w-[110px]">
                              <input
                                type="number"
                                min="0"
                                max={item.is_package ? (item.qty_dispatched || 0) / packagingSize : item.qty_dispatched || 0}
                                step={item.is_package ? "1" : "any"}
                                value={
                                  item.qty_received !== undefined
                                    ? (item.is_package
                                        ? parseFloat(((item.qty_received || 0) / packagingSize).toFixed(3))
                                        : item.qty_received)
                                    : ''
                                }
                                onChange={e => {
                                  const inputVal = Number(e.target.value)
                                  const maxVal = item.is_package ? (item.qty_dispatched || 0) / packagingSize : item.qty_dispatched || 0
                                  const finalInputVal = Math.min(maxVal, Math.max(0, inputVal))
                                  const qtyBase = item.is_package ? finalInputVal * packagingSize : finalInputVal
                                  const varianceVal = qtyBase - (item.qty_dispatched || 0)
                                  handleItemChange(idx, {
                                    qty_received: qtyBase,
                                    variance: varianceVal
                                  }, null)
                                }}
                                className="w-full border border-slate-200 rounded-xl px-2 h-9 text-xs text-right font-bold text-gray-900 bg-slate-50"
                              />
                            </td>
                            <td className={`p-3 text-right text-xs font-bold w-[100px] ${
                              (item.variance || 0) < 0 ? 'text-red-600' : 'text-slate-750'
                            }`}>
                              {item.is_package && packagingSize > 1
                                ? `${formatQty((item.variance || 0) / packagingSize)} pk`
                                : `${(item.variance || 0).toLocaleString()} ${item.uom_base}`}
                            </td>
                            <td className="p-3 text-right text-xs font-bold text-amber-600 w-[110px]">
                              {item.is_package && packagingSize > 1 
                                ? `${formatQty(((item.qty_dispatched || 0) - (item.qty_received || 0)) / packagingSize)} pk` 
                                : `${((item.qty_dispatched || 0) - (item.qty_received || 0)).toLocaleString()} ${item.uom_base}`}
                            </td>
                            <td className="p-2 w-[450px]">
                              {isBatchTracked ? (
                                <select
                                  value={item.batch_number || ''}
                                  onChange={e => {
                                    const selB = batchesForItem.find(x => x.batch_code === e.target.value)
                                    handleItemChange(idx, {
                                      batch_number: e.target.value,
                                      expiry_date: selB?.expiry_date || null
                                    }, null)
                                  }}
                                  className="w-full border border-slate-200 rounded-xl px-2.5 h-9 text-xs font-semibold text-gray-800 bg-slate-50"
                                >
                                  {(item as any).original_batch_number && !batchesForItem.some(x => x.batch_code === (item as any).original_batch_number) && (
                                    <option value={(item as any).original_batch_number}>
                                      {(item as any).original_batch_number} ({language === 'vi' ? 'Lô đã gửi' : 'Shipped Batch'} - Exp: {item.expiry_date ? formatDate(item.expiry_date) : 'N/A'})
                                    </option>
                                  )}
                                  <option value="">{langDict.selectBatchOption}</option>
                                  {batchesForItem.map(b => (
                                    <option key={b.id} value={b.batch_code}>
                                      {b.batch_code} ({b.current_qty} {b.uom_base} - Exp: {b.expiry_date ? formatDate(b.expiry_date) : 'N/A'})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">{langDict.notTracked}</span>
                              )}
                            </td>
                            <td className="p-2 w-[250px]">
                              <input
                                type="text"
                                placeholder={language === 'vi' ? 'Lý do từ chối...' : 'Rejection reason...'}
                                value={(item as any).rejection_reason || ''}
                                onChange={e => handleItemChange(idx, 'rejection_reason', e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-2.5 h-9 text-xs text-gray-800 bg-slate-50"
                              />
                            </td>
                          </>
                        )}

                        {/* View Fields per stati successivi a approved (in_transit, received, etc.) */}
                        {workflowMode === 'view' && activeTransfer.status !== 'draft' && activeTransfer.status !== 'submitted' && activeTransfer.status !== 'approved' && (
                          <>
                            <td className="p-3 text-right text-xs text-slate-700 font-medium w-[110px]">
                              {item.is_package && packagingSize > 1 
                                ? `${formatQty((item.qty_dispatched || 0) / packagingSize)} pk` 
                                : `${(item.qty_dispatched || 0).toLocaleString()} ${item.uom_base}`}
                            </td>
                            <td className="p-3 text-right text-xs text-slate-700 font-medium w-[110px]">
                              {item.is_package && packagingSize > 1 
                                ? `${formatQty((item.qty_received || 0) / packagingSize)} pk` 
                                : `${(item.qty_received || 0).toLocaleString()} ${item.uom_base}`}
                            </td>
                            <td className={`p-3 text-right text-xs font-bold w-[100px] ${
                              (item.variance || 0) < 0 ? 'text-red-600' : 'text-slate-750'
                            }`}>
                              {item.is_package && packagingSize > 1 
                                ? `${formatQty((item.variance || 0) / packagingSize)} pk` 
                                : `${(item.variance || 0).toLocaleString()} ${item.uom_base}`}
                            </td>
                            <td className="p-3 text-xs text-slate-800 font-mono font-bold w-[200px]">
                              {item.batch_number || '—'} {item.expiry_date ? `(${formatDate(item.expiry_date)})` : ''}
                            </td>
                            <td className="p-3 text-xs text-slate-800 font-medium w-[250px] whitespace-normal break-words">
                              {item.reason || '—'}
                            </td>
                            <td className="p-3 text-xs text-amber-900 font-bold bg-amber-50/50 rounded-xl w-[250px] whitespace-normal break-words">
                              {item.notes || '—'}
                            </td>
                          </>
                        )}

                        {/* View Fields per lo stato approved (non ancora spedito) in sola lettura */}
                        {workflowMode === 'view' && activeTransfer.status === 'approved' && (
                          <>
                            <td className="p-3 text-right text-xs text-slate-700 font-medium w-[110px]">
                              {item.is_package && packagingSize > 1 
                                ? `${formatQty((item.qty_dispatched || 0) / packagingSize)} pk` 
                                : `${(item.qty_dispatched || 0).toLocaleString()} ${item.uom_base}`}
                            </td>
                            <td className="p-3 text-xs text-slate-800 font-semibold w-[400px] whitespace-normal break-words" title={item.reason || ''}>
                              {item.reason || '—'}
                            </td>
                          </>
                        )}

                        {/* View Fields for Submitted transfers (not approved yet, non showing dispatched/received) */}
                        {workflowMode === 'view' && activeTransfer.status === 'submitted' && !isApprover && (
                          <td className="p-3 text-right text-xs text-slate-400 italic font-medium">
                            {language === 'vi' ? 'Chờ phê duyệt' : 'Pending Approval'}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between items-center border-t border-gray-100 pt-5">
            <div>
              {activeTransfer.status === 'submitted' && (
                <>
                  {/* Se è l'approvatore: pulsante Reject */}
                  {isApprover && (
                    <button
                      type="button"
                      onClick={async () => {
                        await handleCancelTransfer(activeTransfer as StorehouseTransfer);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-red-50 hover:bg-red-100 text-red-650 rounded-xl text-sm font-bold transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      {language === 'vi' ? 'Từ chối' : 'Reject'}
                    </button>
                  )}

                  {/* Se è il richiedente (e non l'approvatore): pulsante Recall */}
                  {!isApprover && (branchId === 'all' || branchId === activeTransfer.creator_branch_id || branchId === activeTransfer.destination_branch_id) && (
                    <button
                      type="button"
                      onClick={async () => {
                        await handleRecallTransfer(activeTransfer as StorehouseTransfer);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-sm font-bold transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      {language === 'vi' ? 'Thu hồi' : 'Recall'}
                    </button>
                  )}
                </>
              )}

              {activeTransfer.status === 'approved' && workflowMode === 'view' && (() => {
                let approverBranchId = activeTransfer.source_branch_id;
                if (activeTransfer.creator_branch_id) {
                  if (activeTransfer.creator_branch_id === activeTransfer.destination_branch_id) {
                    approverBranchId = activeTransfer.source_branch_id;
                  } else if (activeTransfer.creator_branch_id === activeTransfer.source_branch_id) {
                    approverBranchId = activeTransfer.destination_branch_id;
                  }
                }
                return (branchId === 'all' || branchId === approverBranchId);
              })() && (
                <button
                  type="button"
                  onClick={async () => {
                    await handleCancelTransfer(activeTransfer as StorehouseTransfer);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-sm font-bold transition-colors cursor-pointer"
                >
                  <Undo2 className="w-4 h-4" />
                  {language === 'vi' ? 'Hoàn tác phê duyệt' : 'Undo Approval'}
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsViewing(false)}
                className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors cursor-pointer"
              >
                {langDict.close}
              </button>

              {activeTransfer.status === 'submitted' && workflowMode === 'view' && (() => {
                let approverBranchId = activeTransfer.source_branch_id;
                if (activeTransfer.creator_branch_id) {
                  if (activeTransfer.creator_branch_id === activeTransfer.destination_branch_id) {
                    approverBranchId = activeTransfer.source_branch_id;
                  } else if (activeTransfer.creator_branch_id === activeTransfer.source_branch_id) {
                    approverBranchId = activeTransfer.destination_branch_id;
                  }
                }
                return (branchId === 'all' || branchId === approverBranchId);
              })() && (
                <button
                  type="button"
                  onClick={async () => {
                    await handleApproveTransfer(activeTransfer as StorehouseTransfer);
                    setIsViewing(false);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  {language === 'vi' ? 'Phê duyệt' : 'Approve'}
                </button>
              )}

              {activeTransfer.status === 'approved' && workflowMode === 'view' && (branchId === 'all' || branchId === activeTransfer.source_branch_id) && (
                <button
                  type="button"
                  onClick={() => setWorkflowMode('dispatch')}
                  className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors cursor-pointer"
                >
                  <Truck className="w-4 h-4" />
                  {language === 'vi' ? 'Gửi hàng' : 'Dispatch'}
                </button>
              )}

              {activeTransfer.status === 'in_transit' && workflowMode === 'view' && (branchId === 'all' || branchId === activeTransfer.destination_branch_id) && (
                <button
                  type="button"
                  onClick={() => setWorkflowMode('receive')}
                  className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  {language === 'vi' ? 'Nhận hàng' : 'Receive'}
                </button>
              )}

              {workflowMode === 'dispatch' && (branchId === 'all' || branchId === activeTransfer?.source_branch_id) && (
                <button
                  type="button"
                  onClick={handleDispatchTransfer}
                  className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors cursor-pointer"
                >
                  <Truck className="w-4 h-4" /> {langDict.confirmDispatch}
                </button>
              )}

              {workflowMode === 'receive' && (branchId === 'all' || branchId === activeTransfer?.destination_branch_id) && (
                <button
                  type="button"
                  onClick={handleReceiveTransfer}
                  className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4" /> {langDict.confirmReceipt}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. GRIGLIA TRASFERIMENTI PRINCIPALE */}
      {!isEditing && !isViewing && (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">
                {t(language, 'Transfers')}
              </h1>
              <p className="text-sm text-slate-400">
                {langDict.transfersSubtitle}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={openNewTransfer}
                className="inline-flex items-center gap-1.5 px-4 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-5 h-5" /> {langDict.newBranchTransferBtn}
              </button>
            </div>
          </div>

          {/* Feedbacks */}
          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-200 text-xs px-4 py-3 rounded-2xl flex items-center gap-2 font-medium">
              <AlertCircle className="w-4.5 h-4.5 text-red-400" /> {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs px-4 py-3 rounded-2xl flex items-center gap-2 font-medium">
              <Check className="w-4.5 h-4.5 text-emerald-400" /> {successMsg}
            </div>
          )}

          {loading ? (
            <div className="flex h-[250px] w-full items-center justify-center">
              <CircularLoader />
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden text-gray-900">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th 
                        onClick={() => handleSort('transfer_number')}
                        className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>{langDict.transferNumber}</span>
                          {sortCol === 'transfer_number' && (
                            sortAsc ? ' ▲' : ' ▼'
                          )}
                        </div>
                      </th>
                      <ColumnHeader
                        colKey="source_location"
                        label={langDict.sourceLocation}
                        sortCol={sortCol}
                        sortAsc={sortAsc}
                        onSort={handleSort}
                        values={getFilterOptions('source_location')}
                        activeFilter={filters['source_location'] || null}
                        onFilter={vals => handleFilterChange('source_location', vals)}
                        onClear={() => handleFilterChange('source_location', null)}
                        open={openHeaderKey === 'source_location'}
                        onToggle={() => setOpenHeaderKey(openHeaderKey === 'source_location' ? null : 'source_location')}
                        onClose={() => setOpenHeaderKey(null)}
                        dict={columnHeaderDict}
                        className="py-3 px-4 text-left"
                      />
                      <ColumnHeader
                        colKey="destination_location"
                        label={langDict.destinationLocation}
                        sortCol={sortCol}
                        sortAsc={sortAsc}
                        onSort={handleSort}
                        values={getFilterOptions('destination_location')}
                        activeFilter={filters['destination_location'] || null}
                        onFilter={vals => handleFilterChange('destination_location', vals)}
                        onClear={() => handleFilterChange('destination_location', null)}
                        open={openHeaderKey === 'destination_location'}
                        onToggle={() => setOpenHeaderKey(openHeaderKey === 'destination_location' ? null : 'destination_location')}
                        onClose={() => setOpenHeaderKey(null)}
                        dict={columnHeaderDict}
                        className="py-3 px-4 text-left"
                      />
                      <th 
                        onClick={() => handleSort('requested_date')}
                        className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>{langDict.requestedDate}</span>
                          {sortCol === 'requested_date' && (
                            sortAsc ? ' ▲' : ' ▼'
                          )}
                        </div>
                      </th>
                      <ColumnHeader
                        colKey="status"
                        label={langDict.status}
                        sortCol={sortCol}
                        sortAsc={sortAsc}
                        onSort={handleSort}
                        values={getFilterOptions('status')}
                        activeFilter={filters['status'] || null}
                        onFilter={vals => handleFilterChange('status', vals)}
                        onClear={() => handleFilterChange('status', null)}
                        open={openHeaderKey === 'status'}
                        onToggle={() => setOpenHeaderKey(openHeaderKey === 'status' ? null : 'status')}
                        onClose={() => setOpenHeaderKey(null)}
                        dict={columnHeaderDict}
                        right={true}
                        className="py-3 px-4"
                      />
                      <th className="py-3 px-4 text-center w-[160px] text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {langDict.actions}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {filteredAndSortedTransfers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs text-slate-400 italic font-semibold">
                          {langDict.noTransfers}
                        </td>
                      </tr>
                    ) : (
                      filteredAndSortedTransfers.map(tr => (
                        <tr key={tr.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-bold text-gray-900">{tr.transfer_number}</td>
                          <td className="py-3 px-4 text-slate-650 font-medium">{tr.source_location_name}</td>
                          <td className="py-3 px-4 text-slate-650 font-medium">{tr.destination_location_name}</td>
                          <td className="py-3 px-4 text-slate-650 font-medium">{formatDate(tr.requested_date)}</td>
                          <td className="py-3 px-4 text-right">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              tr.status === 'received' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                              tr.status === 'in_transit' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                              tr.status === 'submitted' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                              tr.status === 'cancelled' ? 'bg-red-50 text-red-600 border-red-100' :
                              'bg-slate-50 text-slate-600 border-slate-100'
                            }`}>
                              {formatStatus(tr.status, language)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                title={langDict.viewDetails}
                                onClick={() => viewTransfer(tr, 'view')}
                                className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                              >
                                <Eye className="w-4.5 h-4.5" />
                              </button>
                              
                              {tr.status === 'draft' && (branchId === 'all' || branchId === tr.source_branch_id || branchId === tr.destination_branch_id) && (
                                <button
                                  title={langDict.editDraft}
                                  onClick={() => {
                                    setActiveTransfer(tr)
                                    // fetch details to edit
                                    viewTransfer(tr, 'view').then(() => {
                                      setIsEditing(true)
                                      setIsViewing(false)
                                    })
                                  }}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                                >
                                  <Pencil className="w-4.5 h-4.5" />
                                </button>
                              )}




                              {/* Tasto Undo / Storno (per approved, in_transit, received, partially_received) */}
                              {((tr.status === 'approved' && (() => {
                                  let approverBranchId = tr.source_branch_id;
                                  if (tr.creator_branch_id) {
                                    if (tr.creator_branch_id === tr.destination_branch_id) {
                                      approverBranchId = tr.source_branch_id;
                                    } else if (tr.creator_branch_id === tr.source_branch_id) {
                                      approverBranchId = tr.destination_branch_id;
                                    }
                                  }
                                  return (branchId === 'all' || branchId === approverBranchId);
                                })()) ||
                                (tr.status === 'in_transit' && (branchId === 'all' || branchId === tr.source_branch_id)) ||
                                (['received', 'partially_received'].includes(tr.status) && (branchId === 'all' || branchId === tr.destination_branch_id))) && (
                                <button
                                  title={
                                    tr.status === 'approved' ? (language === 'vi' ? 'Hoàn tác phê duyệt (Chờ phê duyệt)' : 'Undo Approval (Submitted)') :
                                    tr.status === 'in_transit' ? (language === 'vi' ? 'Hoàn tác gửi hàng (Bản nháp)' : 'Undo Dispatch (Draft)') :
                                    (language === 'vi' ? 'Hoàn tác nhận hàng (Đang vận chuyển)' : 'Undo Receipt (In Transit)')
                                  }
                                  onClick={() => handleCancelTransfer(tr)}
                                  className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                                >
                                  <Undo2 className="w-4.5 h-4.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  )
}

export default function BranchTransfersPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-transparent">
        <CircularLoader />
      </div>
    }>
      <BranchTransfersContent />
    </Suspense>
  )
}
