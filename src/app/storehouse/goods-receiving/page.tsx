'use client'

import React, { useEffect, useState, useMemo, Suspense } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import { useSearchParams } from 'next/navigation'
import ColumnHeader from '@/components/storehouse/ColumnHeader'
import { 
  Plus, 
  Trash2, 
  Check, 
  X, 
  Eye, 
  ArrowLeft,
  ArrowRight,
  Calendar,
  FileText,
  User,
  Hash,
  AlertCircle,
  CornerUpLeft
} from 'lucide-react'
import { GoodsReceipt, GoodsReceiptItem, ReturnNote, ReturnNoteItem } from '@/types/storehouse'
import { SupplierCombobox, AddSupplierModal } from '@/app/finance/components/SupplierComponents'

interface DbMaterial {
  id: string
  name: string
  brand: string | null
  packaging_size: number
  package_price: number
  unit_cost: number
  category_id: number
  supplier_id: string | null
  categories: { name: string } | null
  uom: { name: string } | null
  vat_rate_percent?: number | null
  uses_vat?: boolean
}

interface Location {
  id: string
  name: string
  is_active: boolean
}

interface Supplier {
  id: string
  name: string
}

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

const getDueDateStr = (deliveryDateStr: string | null | undefined): string => {
  if (!deliveryDateStr) return '—'
  try {
    const baseDate = deliveryDateStr.includes('T') ? deliveryDateStr.split('T')[0] : deliveryDateStr
    const parts = baseDate.split('-')
    let d: Date
    if (parts.length === 3) {
      const [year, month, day] = parts
      d = new Date(Number(year), Number(month) - 1, Number(day))
    } else {
      d = new Date(deliveryDateStr)
    }
    if (isNaN(d.getTime())) return '—'
    d.setDate(d.getDate() + 30)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
  } catch {
    return '—'
  }
}

function GoodsReceivingContent() {
  const { language, vatRate } = useSettings()
  const searchParams = useSearchParams()
  const branchId = searchParams.get('branchId') || 'all'
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string>('staff')
  const [userId, setUserId] = useState<string | null>(null)
  
  // Data lists
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materials, setMaterials] = useState<DbMaterial[]>([])
  const [inventorySetups, setInventorySetups] = useState<any[]>([])

  // Selection & UI State
  const [selectedLocation, setSelectedLocation] = useState<string>('all')
  const [isEditing, setIsEditing] = useState(false)
  const [isViewing, setIsViewing] = useState(false)
  const [activeReceipt, setActiveReceipt] = useState<Partial<GoodsReceipt> | null>(null)
  const [activeItems, setActiveItems] = useState<Partial<GoodsReceiptItem>[]>([])
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [successMsg, setSuccessMsg] = useState<string>('')
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false)
  const [returnItems, setReturnItems] = useState<Record<string, number>>({}) // itemId -> qtyToReturn
  const [returnNotes, setReturnNotes] = useState('')
  const [showRejectRow, setShowRejectRow] = useState<Record<number, boolean>>({})
  const [rejectMode, setRejectMode] = useState<Record<number, 'package' | 'unit'>>({})
  const [returnMode, setReturnMode] = useState<Record<string, 'package' | 'unit'>>({})
  const [activeTab, setActiveTab] = useState<'receipts' | 'returns'>('receipts')
  const [returnNotesList, setReturnNotesList] = useState<ReturnNote[]>([])
  const [activeReturnNote, setActiveReturnNote] = useState<ReturnNote | null>(null)
  const [isReturnViewOpen, setIsReturnViewOpen] = useState(false)

  // Table sorting / filtering
  const [sortCol, setSortCol] = useState('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [openHeaderKey, setOpenHeaderKey] = useState<string | null>(null)
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({})

  // User permission check
  const isManager = useMemo(() => {
    return role && ['owner', 'admin', 'manager', 'accountant'].includes(role)
  }, [role])

  const columnHeaderDict = useMemo(() => ({
    sortAsc: language === 'vi' ? 'Sắp xếp tăng dần' : 'Sort Ascending',
    sortDesc: language === 'vi' ? 'Sắp xếp giảm dần' : 'Sort Descending',
    selectAll: language === 'vi' ? 'Chọn tất cả' : 'Select All',
    deselectAll: language === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect All',
    filterPlaceholder: language === 'vi' ? 'Tìm kiếm...' : 'Search...',
    clearFilters: language === 'vi' ? 'Xóa bộ lọc' : 'Clear Filters',
  }), [language])

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
      
      // Load locations
      let locQuery = supabase
        .from('storehouse_locations')
        .select('id, name, is_active')
        .order('name')
      if (branchId && branchId !== 'all') {
        locQuery = locQuery.eq('branch_id', branchId)
      }
      const { data: locs } = await locQuery
      setLocations(locs || [])

      // Load suppliers
      const { data: sups } = await supabase
        .from('suppliers')
        .select('id, name')
        .order('name')
      setSuppliers(sups || [])

      // Load materials with categories, UOM and supplier_id
      const { data: mats } = await supabase
        .from('materials')
        .select('id, name, brand, packaging_size, package_price, unit_cost, category_id, supplier_id, categories(name), uom(name), vat_rate_percent, uses_vat')
        .is('deleted_at', null)
        .order('name')
      const formattedMats: DbMaterial[] = (mats || []).map((m: any) => {
        const cat = Array.isArray(m.categories) ? m.categories[0] : m.categories
        const u = Array.isArray(m.uom) ? m.uom[0] : m.uom
        return {
          id: m.id,
          name: m.name,
          brand: m.brand,
          packaging_size: Number(m.packaging_size || 1),
          package_price: Number(m.package_price || 0),
          unit_cost: Number(m.unit_cost || 0),
          category_id: m.category_id,
          supplier_id: m.supplier_id || null,
          categories: cat ? { name: String(cat.name || '') } : null,
          uom: u ? { name: String(u.name || '') } : null,
          vat_rate_percent: m.vat_rate_percent != null ? Number(m.vat_rate_percent) : null,
          uses_vat: !!m.uses_vat
        }
      })
      setMaterials(formattedMats)

      // Load setups for batch configuration checks
      const { data: setups } = await supabase
        .from('storehouse_inventory_setup')
        .select('*')
      setInventorySetups(setups || [])

      // Load Receipts
      let query = supabase
        .from('storehouse_goods_receipts')
        .select(`
          *,
          storehouse_locations(name),
          suppliers(name)
        `)
        .order('created_at', { ascending: false })

      const { data: grs, error } = await query
      if (error) throw error

      // Map to view models
      const formatted: GoodsReceipt[] = (grs || []).map((g: any) => ({
        ...g,
        location_name: g.storehouse_locations?.name || '-',
        supplier_name: g.suppliers?.name || '-'
      }))

      setReceipts(formatted)

      // Load Return Notes
      const { data: rtns, error: rtnErr } = await supabase
        .from('storehouse_return_notes')
        .select(`
          *,
          storehouse_locations(name),
          suppliers(name),
          storehouse_goods_receipts(receipt_number)
        `)
        .order('return_date', { ascending: false })

      if (rtnErr) throw rtnErr

      const formattedRtns: ReturnNote[] = (rtns || []).map((r: any) => ({
        ...r,
        location_name: r.storehouse_locations?.name || '-',
        supplier_name: r.suppliers?.name || '-',
        receipt_number: r.storehouse_goods_receipts?.receipt_number || '-'
      }))
      setReturnNotesList(formattedRtns)
    } catch (err) {
      console.error('Error loading goods receiving data:', err)
      setErrorMsg('Error loading page data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Filtered & Sorted Receipts
  const filteredAndSortedReceipts = useMemo(() => {
    let list = [...receipts]

    // Location Filter
    if (selectedLocation !== 'all') {
      list = list.filter(r => r.location_id === selectedLocation)
    } else if (branchId && branchId !== 'all') {
      const allowedLocIds = locations.map(l => l.id)
      list = list.filter(r => allowedLocIds.includes(r.location_id))
    }

    // Column Filters
    Object.keys(filters).forEach(colKey => {
      const activeSet = filters[colKey]
      if (activeSet && activeSet.size > 0) {
        list = list.filter(r => {
          let val = ''
          if (colKey === 'location') val = r.location_name || ''
          else if (colKey === 'supplier') val = r.supplier_name || ''
          else if (colKey === 'status') val = r.status || ''
          return activeSet.has(val)
        })
      }
    })

    // Sorting
    list.sort((a: any, b: any) => {
      let valA = a[sortCol]
      let valB = b[sortCol]
      if (sortCol === 'location') {
        valA = a.location_name || ''
        valB = b.location_name || ''
      } else if (sortCol === 'supplier') {
        valA = a.supplier_name || ''
        valB = b.supplier_name || ''
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
  }, [receipts, selectedLocation, filters, sortCol, sortAsc])

  // Filtered & Sorted Return Notes
  const filteredReturnNotes = useMemo(() => {
    let list = returnNotesList
    if (selectedLocation !== 'all') {
      list = list.filter(r => r.location_id === selectedLocation)
    } else if (branchId && branchId !== 'all') {
      const allowedLocIds = locations.map(l => l.id)
      list = list.filter(r => allowedLocIds.includes(r.location_id))
    }
    return list
  }, [returnNotesList, selectedLocation, branchId, locations])

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

  // Get filter options
  const getFilterOptions = (colKey: string): string[] => {
    const vals = new Set<string>()
    receipts.forEach(r => {
      if (colKey === 'location') vals.add(r.location_name || '')
      else if (colKey === 'supplier') vals.add(r.supplier_name || '')
      else if (colKey === 'status') vals.add(r.status || '')
    })
    return Array.from(vals).filter(Boolean)
  }

  // Generate Receipt Number (GR-YYYYMMDD-XXX)
  const generateReceiptNumber = async (): Promise<string> => {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const prefix = `GR-${yyyy}${mm}${dd}-`
    
    const { data } = await supabase
      .from('storehouse_goods_receipts')
      .select('receipt_number')
      .like('receipt_number', `${prefix}%`)
      .order('receipt_number', { ascending: false })
      .limit(1)

    let nextNum = 1
    if (data && data.length > 0) {
      const lastNumStr = data[0].receipt_number.replace(prefix, '')
      const lastNum = parseInt(lastNumStr, 10)
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1
      }
    }

    return `${prefix}${String(nextNum).padStart(3, '0')}`
  }

  const generateReturnNoteNumber = async (): Promise<string> => {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const prefix = `RTN-${yyyy}${mm}${dd}-`
    
    const { data } = await supabase
      .from('storehouse_return_notes')
      .select('return_number')
      .like('return_number', `${prefix}%`)
      .order('return_number', { ascending: false })
      .limit(1)

    let nextNum = 1
    if (data && data.length > 0) {
      const lastNumStr = data[0].return_number.replace(prefix, '')
      const lastNum = parseInt(lastNumStr, 10)
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1
      }
    }

    return `${prefix}${String(nextNum).padStart(3, '0')}`
  }

  const openNewReceipt = async () => {
    setErrorMsg('')
    setSuccessMsg('')
    const num = await generateReceiptNumber()
    setActiveReceipt({
      receipt_number: num,
      location_id: locations.find(l => l.is_active)?.id || '',
      supplier_id: '',
      delivery_date: new Date().toISOString().split('T')[0],
      reference_document: 'none',
      reference_number: '',
      notes: '',
      status: 'draft'
    })
    setActiveItems([])
    setShowRejectRow({})
    setRejectMode({})
    setIsEditing(true)
    setIsViewing(false)
  }

  const viewReceipt = async (receipt: GoodsReceipt) => {
    try {
      setLoading(true)
      setErrorMsg('')
      setSuccessMsg('')
      
      const { data: itemsData, error } = await supabase
        .from('storehouse_goods_receipt_items')
        .select('*')
        .eq('receipt_id', receipt.id)

      if (error) throw error

      // Map details
      const mappedItems: GoodsReceiptItem[] = (itemsData || []).map((item: any) => {
        const mat = materials.find(m => m.id === item.material_id)
        return {
          ...item,
          material_name: mat?.name || '-',
          material_brand: mat?.brand || '-',
          category_name: mat?.categories?.name || '-',
          uom_base: mat?.uom?.name || 'unit',
          packaging_size: Number(mat?.packaging_size || 1)
        }
      })

      const newShowRejectRow: Record<number, boolean> = {}
      const newRejectMode: Record<number, 'package' | 'unit'> = {}
      mappedItems.forEach((item, idx) => {
        if (Number(item.qty_rejected_package || 0) > 0 || Number(item.qty_rejected_partial || 0) > 0) {
          newShowRejectRow[idx] = true
        }
        if (Number(item.qty_rejected_partial || 0) > 0) {
          newRejectMode[idx] = 'unit'
        } else {
          newRejectMode[idx] = 'package'
        }
      })
      setShowRejectRow(newShowRejectRow)
      setRejectMode(newRejectMode)

      setActiveReceipt(receipt)
      setActiveItems(mappedItems)
      setIsViewing(true)
      setIsEditing(false)
    } catch (err) {
      console.error('Error fetching receipt items:', err)
      setErrorMsg('Failed to load items')
    } finally {
      setLoading(false)
    }
  }

  const handleViewReturnNote = async (note: ReturnNote) => {
    try {
      setLoading(true)
      setErrorMsg('')
      setSuccessMsg('')
      
      const { data: itemsData, error } = await supabase
        .from('storehouse_return_note_items')
        .select('*')
        .eq('return_note_id', note.id)

      if (error) throw error

      // Map details
      const mappedItems: ReturnNoteItem[] = (itemsData || []).map((item: any) => {
        const mat = materials.find(m => m.id === item.material_id)
        return {
          ...item,
          material_name: mat?.name || '-',
          material_brand: mat?.brand || '-',
          uom_base: mat?.uom?.name || 'unit',
          packaging_size: Number(mat?.packaging_size || 1)
        }
      })

      setActiveReturnNote({
        ...note,
        items: mappedItems
      })
      setIsReturnViewOpen(true)
    } catch (err) {
      console.error('Error fetching return note items:', err)
      setErrorMsg('Failed to load return note details')
    } finally {
      setLoading(false)
    }
  }

  const handlePrintReturnNote = () => {
    if (!activeReturnNote) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const itemsHtml = (activeReturnNote.items || []).map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #1e293b;">${item.material_name} ${item.material_brand && item.material_brand !== '-' ? `(${item.material_brand})` : ''}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 12px; color: #334155;">${item.qty_package} pk + ${item.qty_partial} units</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 12px; color: #334155;">${item.qty_base} ${item.uom_base}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 12px; color: #334155;">${(item.unit_cost || 0).toLocaleString()}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 12px; font-weight: bold; color: #0f172a;">${((item.qty_base || 0) * (item.unit_cost || 0)).toLocaleString()}</td>
      </tr>
    `).join('')

    const html = `
      <html>
        <head>
          <title>Return Note - ${activeReturnNote.return_number}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 40px; color: #1e293b; background: #fff; }
            .header-container { display: flex; justify-content: space-between; border-bottom: 2px solid #cbd5e1; padding-bottom: 20px; margin-bottom: 25px; }
            .title { font-size: 22px; font-weight: 850; letter-spacing: -0.025em; text-transform: uppercase; color: #0f172a; }
            .num-date { font-size: 12px; margin-top: 6px; color: #475569; }
            .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 35px; font-size: 13px; border: 1px solid #e2e8f0; padding: 15px; rounded: 12px; background: #f8fafc; }
            .details-label { font-weight: 700; color: #475569; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background: #f1f5f9; padding: 12px 10px; border-bottom: 2px solid #cbd5e1; font-size: 10px; text-transform: uppercase; font-weight: bold; color: #475569; text-align: left; }
            th.right { text-align: right; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="header-container">
            <div>
              <div class="title">GOODS RETURN NOTE</div>
              <div class="num-date">Number: <strong style="color: #0f172a;">${activeReturnNote.return_number}</strong></div>
            </div>
            <div style="text-align: right; font-size: 12px; color: #475569;">
              Date: <strong style="color: #0f172a;">${formatDate(activeReturnNote.return_date)}</strong>
            </div>
          </div>
          <div class="details-grid">
            <div>
              <div><span class="details-label">Location:</span> ${activeReturnNote.location_name}</div>
              <div style="margin-top: 5px;"><span class="details-label">Supplier:</span> ${activeReturnNote.supplier_name}</div>
            </div>
            <div>
              <div><span class="details-label">Original Receipt Ref:</span> ${activeReturnNote.receipt_number}</div>
              <div style="margin-top: 5px;"><span class="details-label">Notes:</span> ${activeReturnNote.notes || '-'}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th class="right">Returned Pkgs</th>
                <th class="right">Returned Base</th>
                <th class="right">Net Unit Cost</th>
                <th class="right">Total Value</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `

    printWindow.document.write(html)
    printWindow.document.close()
  }

  const editReceipt = async (receipt: GoodsReceipt) => {
    if (receipt.status !== 'draft') return
    await viewReceipt(receipt)
    setIsViewing(false)
    setIsEditing(true)
  }

  const handleAddItemRow = () => {
    // Filtra i materiali per il fornitore selezionato
    const selectedSupplierId = activeReceipt?.supplier_id
    const filteredMats = selectedSupplierId 
      ? materials.filter(m => m.supplier_id === selectedSupplierId)
      : materials

    if (filteredMats.length === 0) {
      setErrorMsg(language === 'vi' ? 'Không có nguyên liệu nào cho nhà cung cấp này.' : 'No materials found for this supplier.')
      return
    }
    const defaultMat = filteredMats[0]
    
    // Check lot configuration
    const setup = inventorySetups.find(
      s => s.location_id === activeReceipt?.location_id && 
           s.item_type === 'material' && 
           s.item_id === defaultMat.id
    )

    const isBatchTracked = setup?.track_batch ?? false
    const isExpiryTracked = setup?.track_expiry ?? false
    
    const newItem: Partial<GoodsReceiptItem> = {
      material_id: defaultMat.id,
      qty_package: 0,
      qty_partial: 0,
      qty_base: 0,
      package_cost: Number(defaultMat.package_price || 0),
      unit_cost: Number(defaultMat.unit_cost || 0),
      batch_number: isBatchTracked ? '' : null,
      expiry_date: isExpiryTracked ? '' : null,
      notes: '',
      material_name: defaultMat.name,
      material_brand: defaultMat.brand || '-',
      category_name: defaultMat.categories?.name || '-',
      uom_base: defaultMat.uom?.name || 'unit',
      packaging_size: Number(defaultMat.packaging_size || 1),
      vat_rate_percent: (defaultMat.vat_rate_percent != null && Number(defaultMat.vat_rate_percent) > 0) ? Number(defaultMat.vat_rate_percent) : (vatRate ?? 10),
      discount_amount: 0,
      qty_rejected_package: 0,
      qty_rejected_partial: 0,
      qty_rejected_base: 0,
      qty_returned_after_base: 0
    }
    setActiveItems([...activeItems, newItem])
  }

  const handleRemoveItemRow = (idx: number) => {
    setActiveItems(activeItems.filter((_, i) => i !== idx))
  }

  const handleReceiptChange = (field: keyof GoodsReceipt, val: any) => {
    if (!activeReceipt) return
    setActiveReceipt(prev => {
      if (!prev) return null
      return {
        ...prev,
        [field]: val
      }
    })

    if (field === 'supplier_id') {
      setActiveItems([]) // Reset items list when supplier changes
    }
  }

  const handleSupplierSaved = (newSup: { id: string; name: string }) => {
    setSuppliers(prev => [...prev, newSup].sort((a, b) => a.name.localeCompare(b.name)))
    handleReceiptChange('supplier_id', newSup.id)
    setShowAddSupplier(false)
  }

  const handleItemChange = (idx: number, field: keyof GoodsReceiptItem, val: any) => {
    const updated = [...activeItems]
    const row = { ...updated[idx] }

    if (field === 'material_id') {
      const mat = materials.find(m => m.id === val)
      if (mat) {
        row.material_id = val
        row.material_name = mat.name
        row.material_brand = mat.brand || '-'
        row.category_name = mat.categories?.name || '-'
        row.uom_base = mat.uom?.name || 'unit'
        row.packaging_size = Number(mat.packaging_size || 1)
        row.package_cost = Number(mat.package_price || 0)
        row.unit_cost = Number(mat.unit_cost || 0)
        row.vat_rate_percent = (mat.vat_rate_percent != null && Number(mat.vat_rate_percent) > 0) ? Number(mat.vat_rate_percent) : (vatRate ?? 10)
        row.discount_amount = 0
        row.qty_rejected_package = 0
        row.qty_rejected_partial = 0
        row.qty_rejected_base = 0
        
        // Expiry warning settings check
        const setup = inventorySetups.find(
          s => s.location_id === activeReceipt?.location_id && 
               s.item_type === 'material' && 
               s.item_id === val
        )
        row.batch_number = setup?.track_batch ? '' : null
        row.expiry_date = setup?.track_expiry ? '' : null
      }
    } else {
      row[field] = val as never
    }

    const pSize = Number(row.packaging_size || 1)

    // Recompute qty_base
    if (field === 'qty_package' || field === 'material_id') {
      const qPack = Number(row.qty_package || 0)
      row.qty_base = qPack * pSize
      row.qty_partial = 0
    }

    // Recompute qty_rejected_base
    if (field === 'qty_rejected_package' || field === 'material_id') {
      const qRejPack = Number(row.qty_rejected_package || 0)
      row.qty_rejected_base = qRejPack * pSize
      row.qty_rejected_partial = 0
    }

    if (field === 'package_cost' || field === 'qty_package' || field === 'material_id') {
      const pCost = Number(row.package_cost || 0)
      row.unit_cost = pSize > 0 ? pCost / pSize : 0
    }

    updated[idx] = row
    setActiveItems(updated)
  }

  const handleSaveDraft = async () => {
    setErrorMsg('')
    setSuccessMsg('')
    if (!activeReceipt?.location_id || !activeReceipt?.supplier_id) {
      setErrorMsg(language === 'vi' ? 'Vui lòng chọn đầy đủ chi nhánh và nhà cung cấp.' : 'Please select a location and supplier.')
      return
    }

    try {
      setLoading(true)

      const payload = {
        receipt_number: activeReceipt.receipt_number,
        location_id: activeReceipt.location_id,
        supplier_id: activeReceipt.supplier_id,
        delivery_date: activeReceipt.delivery_date,
        reference_document: activeReceipt.reference_document,
        reference_number: activeReceipt.reference_number || null,
        notes: activeReceipt.notes || null,
        status: 'draft',
        created_by: userId,
        created_at: new Date().toISOString(),
        discount_amount: Number(activeReceipt.discount_amount || 0)
      }

      let grId = activeReceipt.id
      if (grId) {
        // Update
        const { error } = await supabase
          .from('storehouse_goods_receipts')
          .update(payload)
          .eq('id', grId)
        if (error) throw error
      } else {
        // Insert
        const { data, error } = await supabase
          .from('storehouse_goods_receipts')
          .insert([payload])
          .select()
        if (error) throw error
        grId = data?.[0]?.id
      }

      // Save Items
      // Delete old ones first
      await supabase
        .from('storehouse_goods_receipt_items')
        .delete()
        .eq('receipt_id', grId)

      if (activeItems.length > 0) {
        const itemsPayload = activeItems.map(item => ({
          receipt_id: grId,
          material_id: item.material_id,
          qty_package: Number(item.qty_package || 0),
          qty_partial: Number(item.qty_partial || 0),
          qty_base: Number(item.qty_base || 0),
          package_cost: Number(item.package_cost || 0),
          unit_cost: Number(item.unit_cost || 0),
          batch_number: item.batch_number || null,
          expiry_date: item.expiry_date || null,
          notes: item.notes || null,
          vat_rate_percent: Number(item.vat_rate_percent || 0),
          discount_amount: Number(item.discount_amount || 0),
          qty_rejected_package: Number(item.qty_rejected_package || 0),
          qty_rejected_partial: Number(item.qty_rejected_partial || 0),
          qty_rejected_base: Number(item.qty_rejected_base || 0),
          qty_returned_after_base: Number(item.qty_returned_after_base || 0)
        }))

        const { error: itemsErr } = await supabase
          .from('storehouse_goods_receipt_items')
          .insert(itemsPayload)
        if (itemsErr) throw itemsErr
      }

      setSuccessMsg(language === 'vi' ? 'Lưu bản nháp thành công!' : 'Draft saved successfully!')
      setIsEditing(false)
      loadData()
    } catch (err) {
      console.error('Error saving goods receipt draft:', err)
      setErrorMsg(language === 'vi' ? 'Lỗi khi lưu bản nháp' : 'Failed to save draft')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmReceipt = async () => {
    setErrorMsg('')
    setSuccessMsg('')

    if (!activeReceipt?.location_id || !activeReceipt?.supplier_id) {
      setErrorMsg(language === 'vi' ? 'Vui lòng chọn đầy đủ chi nhánh và nhà cung cấp.' : 'Please select a location and supplier.')
      return
    }

    // 1. Validation: Batch & Expiry settings check
    for (let i = 0; i < activeItems.length; i++) {
      const item = activeItems[i]
      const setup = inventorySetups.find(
        s => s.location_id === activeReceipt.location_id && 
             s.item_type === 'material' && 
             s.item_id === item.material_id
      )
      
      const matName = item.material_name || 'Material'
      
      if (setup?.track_batch && !setup?.allow_no_batch && !item.batch_number) {
        setErrorMsg(
          language === 'vi' 
            ? `Dòng ${i + 1}: Vật liệu "${matName}" yêu cầu số lô (Batch Number).` 
            : `Row ${i + 1}: Material "${matName}" requires a Batch Number.`
        )
        return
      }

      if (setup?.track_expiry && setup?.expiry_required && !item.expiry_date) {
        setErrorMsg(
          language === 'vi' 
            ? `Dòng ${i + 1}: Vật liệu "${matName}" yêu cầu ngày hết hạn (Expiry Date).` 
            : `Row ${i + 1}: Material "${matName}" requires an Expiry Date.`
        )
        return
      }
    }

    try {
      setLoading(true)

      // Transactional rollback list
      const movementsCreated: string[] = []
      const batchesCreated: string[] = []

      try {
        // A. Save the goods receipt header (insert or update) to get/update the ID
        const payload = {
          receipt_number: activeReceipt.receipt_number,
          location_id: activeReceipt.location_id,
          supplier_id: activeReceipt.supplier_id,
          delivery_date: activeReceipt.delivery_date,
          reference_document: activeReceipt.reference_document,
          reference_number: activeReceipt.reference_number || null,
          notes: activeReceipt.notes || null,
          status: 'draft', // temp state during save
          created_by: userId,
          created_at: activeReceipt.created_at || new Date().toISOString(),
          discount_amount: Number(activeReceipt.discount_amount || 0)
        }

        let grId = activeReceipt.id
        if (grId) {
          const { error } = await supabase
            .from('storehouse_goods_receipts')
            .update(payload)
            .eq('id', grId)
          if (error) throw error
        } else {
          const { data, error } = await supabase
            .from('storehouse_goods_receipts')
            .insert([payload])
            .select()
          if (error) throw error
          grId = data?.[0]?.id
        }

        if (!grId) throw new Error('Could not resolve Goods Receipt ID')

        // Save Items
        await supabase
          .from('storehouse_goods_receipt_items')
          .delete()
          .eq('receipt_id', grId)

        if (activeItems.length > 0) {
          const itemsPayload = activeItems.map(item => ({
            receipt_id: grId,
            material_id: item.material_id,
            qty_package: Number(item.qty_package || 0),
            qty_partial: Number(item.qty_partial || 0),
            qty_base: Number(item.qty_base || 0),
            package_cost: Number(item.package_cost || 0),
            unit_cost: Number(item.unit_cost || 0),
            batch_number: item.batch_number || null,
            expiry_date: item.expiry_date || null,
            notes: item.notes || null,
            vat_rate_percent: Number(item.vat_rate_percent || 0),
            discount_amount: Number(item.discount_amount || 0),
            qty_rejected_package: Number(item.qty_rejected_package || 0),
            qty_rejected_partial: Number(item.qty_rejected_partial || 0),
            qty_rejected_base: Number(item.qty_rejected_base || 0),
            qty_returned_after_base: Number(item.qty_returned_after_base || 0)
          }))

          const { error: itemsErr } = await supabase
            .from('storehouse_goods_receipt_items')
            .insert(itemsPayload)
          if (itemsErr) throw itemsErr
        }

        // B. Confirm the Receipt
        const { error: grErr } = await supabase
          .from('storehouse_goods_receipts')
          .update({
            status: 'confirmed',
            confirmed_by: userId,
            confirmed_at: new Date().toISOString()
          })
          .eq('id', grId)

        if (grErr) throw grErr

        // 3. Genera movimenti di magazzino positivi (solo per merce ACCETTATA)
        for (const item of activeItems) {
          const qtyBase = Number(item.qty_base || 0)
          const qtyRejBase = Number(item.qty_rejected_base || 0)
          const qtyAcceptedBase = qtyBase - qtyRejBase

          if (qtyAcceptedBase <= 0) continue

          const discountVal = Number(item.discount_amount || 0)
          const netCostRow = (qtyAcceptedBase * Number(item.unit_cost || 0)) - discountVal
          const unitCostNet = qtyAcceptedBase > 0 ? netCostRow / qtyAcceptedBase : 0

          const { data: movData, error: movErr } = await supabase
            .from('storehouse_movements')
            .insert([{
              location_id: activeReceipt.location_id,
              item_type: 'material',
              item_id: item.material_id,
              movement_type: 'goods_receipt',
              qty_entered: qtyAcceptedBase,
              unit_entered: item.uom_base,
              qty_base: qtyAcceptedBase,
              uom_base: item.uom_base,
              unit_cost: unitCostNet,
              total_value: netCostRow,
              notes: `GR-${activeReceipt.receipt_number}`,
              reference_type: 'goods_receipt',
              reference_id: grId,
              created_by: userId,
              created_at: new Date().toISOString()
            }])
            .select()

          if (movErr) throw movErr
          if (movData?.[0]) movementsCreated.push(movData[0].id)

          // 4. Se configurato tracciamento lotti, crea o incrementa il lotto in storehouse_batches
          const setup = inventorySetups.find(
            s => s.location_id === activeReceipt.location_id && 
                 s.item_type === 'material' && 
                 s.item_id === item.material_id
          )

          if (setup?.track_batch || setup?.track_expiry) {
            // Calcola giorni rimanenti / stato
            let expiryStatus: 'active' | 'expiring_soon' | 'expired' = 'active'
            if (item.expiry_date) {
              const expDate = new Date(item.expiry_date)
              const todayObj = new Date()
              const diffMs = expDate.getTime() - todayObj.getTime()
              const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
              
              if (diffDays <= 0) {
                expiryStatus = 'expired'
              } else if (diffDays <= Number(setup.warning_days || 7)) {
                expiryStatus = 'expiring_soon'
              }
            }

            const { data: batchData, error: batchErr } = await supabase
              .from('storehouse_batches')
              .insert([{
                batch_code: item.batch_number || `GR-LOT-${(activeReceipt.receipt_number || '').slice(-4)}`,
                item_type: 'material',
                item_id: item.material_id,
                location_id: activeReceipt.location_id,
                expiry_date: item.expiry_date || null,
                receipt_date: activeReceipt.delivery_date,
                initial_qty: qtyAcceptedBase,
                current_qty: qtyAcceptedBase,
                uom_base: item.uom_base,
                unit_cost: unitCostNet,
                source_type: 'goods_receipt',
                source_id: grId,
                status: expiryStatus,
                created_at: new Date().toISOString()
              }])
              .select()

            if (batchErr) throw batchErr
            if (batchData?.[0]) batchesCreated.push(batchData[0].id)
          }
        }

        setSuccessMsg(language === 'vi' ? 'Nhận hàng đã được xác nhận!' : 'Goods receipt confirmed successfully!')
        setIsEditing(false)
        setIsViewing(false)
        loadData()
      } catch (innerErr) {
        // Rollback di emergenza
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

        throw innerErr;
      }
    } catch (err) {
      console.error('Error confirming receipt:', err)
      setErrorMsg(language === 'vi' ? 'Xác nhận nhận hàng thất bại' : 'Failed to confirm receipt')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelReceipt = async (receipt: GoodsReceipt) => {
    if (!window.confirm(language === 'vi' ? 'Bạn có chắc chắn muốn HỦY đơn nhận hàng này? Một giao dịch trả lại hàng sẽ được ghi lại.' : 'Are you sure you want to CANCEL this receipt? A reversal movement will be recorded.')) {
      return
    }

    try {
      setLoading(true)
      setErrorMsg('')
      setSuccessMsg('')

      // 1. Carica le righe del Goods Receipt per effettuare lo storno
      const { data: grItems, error: itemsErr } = await supabase
        .from('storehouse_goods_receipt_items')
        .select('*')
        .eq('receipt_id', receipt.id)

      if (itemsErr) throw itemsErr

      // 2. Crea i movimenti di storno negativi (reversal)
      for (const item of (grItems || [])) {
        if (Number(item.qty_base || 0) <= 0) continue

        const { error: revErr } = await supabase
          .from('storehouse_movements')
          .insert([{
            location_id: receipt.location_id,
            item_type: 'material',
            item_id: item.material_id,
            movement_type: 'wastage_reversal', // tipo storno / reversal
            qty_entered: item.qty_package * item.qty_base + item.qty_partial,
            unit_entered: item.notes, // riusa note
            qty_base: -Number(item.qty_base || 0), // Quantità negativa per togliere lo stock
            uom_base: 'unit', // fallback
            unit_cost: Number(item.unit_cost || 0),
            total_value: -Number(item.qty_base || 0) * Number(item.unit_cost || 0),
            notes: `REVERSAL-GR-${receipt.receipt_number}`,
            reference_type: 'goods_receipt',
            reference_id: receipt.id,
            created_by: userId,
            created_at: new Date().toISOString()
          }])

        if (revErr) throw revErr

        // 3. Scarica o cancella i lotti collegati
        const { error: batchErr } = await supabase
          .from('storehouse_batches')
          .update({
            current_qty: 0,
            status: 'depleted'
          })
          .eq('source_type', 'goods_receipt')
          .eq('source_id', receipt.id)
          .eq('item_id', item.material_id)

        if (batchErr) throw batchErr
      }

      // 4. Cambia stato in cancelled
      const { error: grErr } = await supabase
        .from('storehouse_goods_receipts')
        .update({
          status: 'cancelled',
          notes: (receipt.notes || '') + ' [Cancelled Reversal]'
        })
        .eq('id', receipt.id)

      if (grErr) throw grErr

      setSuccessMsg(language === 'vi' ? 'Hủy nhận hàng thành công!' : 'Receipt cancelled and reversed successfully!')
      loadData()
    } catch (err) {
      console.error('Error cancelling goods receipt:', err)
      setErrorMsg(language === 'vi' ? 'Hủy nhận hàng thất bại' : 'Failed to cancel receipt')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveReturn = async () => {
    if (!activeReceipt?.id) return
    setErrorMsg('')
    setSuccessMsg('')

    try {
      setLoading(true)
      
      const validItemsToReturn = Object.entries(returnItems).filter(([_, qty]) => qty > 0)
      if (validItemsToReturn.length === 0) {
        setLoading(false)
        return
      }

      // Valida le quantità prima di salvare
      for (const [itemId, qtyToReturn] of validItemsToReturn) {
        const item = activeItems.find(i => i.material_id === itemId)
        if (!item) continue

        const rMode = returnMode[itemId] || 'package'
        const pSize = Number(item.packaging_size || 1)
        const qtyToReturnBase = rMode === 'package' ? qtyToReturn * pSize : qtyToReturn

        const qtyBase = Number(item.qty_base || 0)
        const qtyRejBase = Number(item.qty_rejected_base || 0)
        const qtyAccepted = qtyBase - qtyRejBase
        const currentReturned = Number(item.qty_returned_after_base || 0)
        const maxReturnableBase = qtyAccepted - currentReturned

        if (qtyToReturnBase > maxReturnableBase) {
          setErrorMsg(
            language === 'vi'
              ? `Số lượng trả lại cho "${item.material_name}" vượt quá số lượng có thể trả (${maxReturnableBase}).`
              : `Return quantity for "${item.material_name}" exceeds the returnable amount (${maxReturnableBase}).`
          )
          setLoading(false)
          return
        }
      }

      // 1. Genera codice Nota di Reso ed inserisci record principale
      const returnNo = await generateReturnNoteNumber()
      const { data: rtnNoteData, error: rtnNoteErr } = await supabase
        .from('storehouse_return_notes')
        .insert([{
          return_number: returnNo,
          goods_receipt_id: activeReceipt.id,
          location_id: activeReceipt.location_id,
          supplier_id: activeReceipt.supplier_id,
          notes: returnNotes || null,
          created_by: userId
        }])
        .select()
        .single()

      if (rtnNoteErr) throw rtnNoteErr
      const newReturnNoteId = rtnNoteData.id

      // Esegui la transazione logica di reso per ciascun articolo
      for (const [itemId, qtyToReturn] of validItemsToReturn) {
        const item = activeItems.find(i => i.material_id === itemId)
        if (!item) continue

        const rMode = returnMode[itemId] || 'package'
        const pSize = Number(item.packaging_size || 1)
        const qtyToReturnBase = rMode === 'package' ? qtyToReturn * pSize : qtyToReturn

        const qtyBase = Number(item.qty_base || 0)
        const qtyRejBase = Number(item.qty_rejected_base || 0)
        const qtyAcceptedBase = qtyBase - qtyRejBase
        const discountVal = Number(item.discount_amount || 0)
        const netCostRow = (qtyAcceptedBase * Number(item.unit_cost || 0)) - discountVal
        const unitCostNet = qtyAcceptedBase > 0 ? netCostRow / qtyAcceptedBase : Number(item.unit_cost || 0)

        // 1. Aggiorna storehouse_goods_receipt_items
        const newReturnedBase = Number(item.qty_returned_after_base || 0) + qtyToReturnBase
        const { error: itemUpdateErr } = await supabase
          .from('storehouse_goods_receipt_items')
          .update({ qty_returned_after_base: newReturnedBase })
          .eq('receipt_id', activeReceipt.id)
          .eq('material_id', itemId)
        
        if (itemUpdateErr) throw itemUpdateErr

        // 2. Genera riga in storehouse_return_note_items
        const qPkg = rMode === 'package' ? qtyToReturn : Math.floor(qtyToReturn / pSize)
        const qPart = rMode === 'package' ? 0 : qtyToReturn % pSize
        const { error: rtnItemInsertErr } = await supabase
          .from('storehouse_return_note_items')
          .insert([{
            return_note_id: newReturnNoteId,
            material_id: itemId,
            qty_package: qPkg,
            qty_partial: qPart,
            qty_base: qtyToReturnBase,
            unit_cost: unitCostNet,
            notes: returnNotes || null
          }])
        
        if (rtnItemInsertErr) throw rtnItemInsertErr

        // 3. Genera movimento di magazzino negativo (storno)
        const { error: movErr } = await supabase
          .from('storehouse_movements')
          .insert([{
            location_id: activeReceipt.location_id,
            item_type: 'material',
            item_id: itemId,
            movement_type: 'wastage_reversal',
            qty_entered: -qtyToReturnBase,
            unit_entered: item.uom_base,
            qty_base: -qtyToReturnBase,
            uom_base: item.uom_base,
            unit_cost: unitCostNet,
            total_value: -qtyToReturnBase * unitCostNet,
            notes: `LATE-RETURN-GR-${activeReceipt.receipt_number}${returnNotes ? ': ' + returnNotes : ''}`,
            reference_type: 'goods_receipt',
            reference_id: activeReceipt.id,
            created_by: userId,
            created_at: new Date().toISOString()
          }])

        if (movErr) throw movErr

        // 4. Riduci quantità lotto
        const { data: batches, error: batchFindErr } = await supabase
          .from('storehouse_batches')
          .select('*')
          .eq('item_id', itemId)
          .eq('location_id', activeReceipt.location_id)
          .eq('source_type', 'goods_receipt')
          .eq('source_id', activeReceipt.id)

        if (batchFindErr) throw batchFindErr

        if (batches && batches.length > 0) {
          const batch = batches[0]
          const { error: batchUpdateErr } = await supabase
            .from('storehouse_batches')
            .update({
              current_qty: Math.max(0, Number(batch.current_qty || 0) - qtyToReturnBase)
            })
            .eq('id', batch.id)

          if (batchUpdateErr) throw batchUpdateErr
        }
      }

      setSuccessMsg(
        language === 'vi'
          ? 'Đăng ký trả hàng trễ thành công!'
          : 'Late return registered successfully!'
      )
      setIsReturnModalOpen(false)
      setReturnItems({})
      setReturnNotes('')

      // Ricarica per visualizzare le quantità aggiornate a schermo
      if (activeReceipt) {
        const { data: itemsData } = await supabase
          .from('storehouse_goods_receipt_items')
          .select('*')
          .eq('receipt_id', activeReceipt.id)
        
        const mappedItems: GoodsReceiptItem[] = (itemsData || []).map((item: any) => {
          const mat = materials.find(m => m.id === item.material_id)
          return {
            ...item,
            material_name: mat?.name || '-',
            material_brand: mat?.brand || '-',
            category_name: mat?.categories?.name || '-',
            uom_base: mat?.uom?.name || 'unit',
            packaging_size: Number(mat?.packaging_size || 1)
          }
        })
        setActiveItems(mappedItems)
      }
      loadData()
    } catch (err) {
      console.error('Error saving late return:', err)
      setErrorMsg(language === 'vi' ? 'Không thể lưu trả hàng trễ' : 'Failed to save late return')
    } finally {
      setLoading(false)
    }
  }

  // Costi Totali in UI
  const originalNetCost = useMemo(() => {
    return activeItems.reduce((acc, item) => {
      const qtyBase = Number(item.qty_base || 0)
      const qtyRejBase = Number(item.qty_rejected_base || 0)
      const qtyAccepted = qtyBase - qtyRejBase
      const rowBaseNet = qtyAccepted * Number(item.unit_cost || 0)
      const discount = Number(item.discount_amount || 0)
      return acc + Math.max(0, rowBaseNet - discount)
    }, 0)
  }, [activeItems])

  const stornoAmount = useMemo(() => {
    return activeItems.reduce((acc, item) => {
      const qtyReturned = Number(item.qty_returned_after_base || 0)
      if (qtyReturned <= 0) return acc
      
      const qtyBase = Number(item.qty_base || 0)
      const qtyRejBase = Number(item.qty_rejected_base || 0)
      const qtyAccepted = qtyBase - qtyRejBase
      const rowBaseNet = qtyAccepted * Number(item.unit_cost || 0)
      const discount = Number(item.discount_amount || 0)
      const rowNetOriginal = Math.max(0, rowBaseNet - discount)
      const unitCostNet = qtyAccepted > 0 ? rowNetOriginal / qtyAccepted : Number(item.unit_cost || 0)
      
      return acc + (qtyReturned * unitCostNet)
    }, 0)
  }, [activeItems])

  const actualNetCost = useMemo(() => {
    return Math.max(0, originalNetCost - stornoAmount)
  }, [originalNetCost, stornoAmount])

  const generalDiscount = useMemo(() => {
    return Number(activeReceipt?.discount_amount || 0)
  }, [activeReceipt?.discount_amount])

  const taxableAmount = useMemo(() => {
    return Math.max(0, actualNetCost - generalDiscount)
  }, [actualNetCost, generalDiscount])

  const vatAmount = useMemo(() => {
    const ratio = actualNetCost > 0 ? generalDiscount / actualNetCost : 0
    return activeItems.reduce((acc, item) => {
      const qtyBase = Number(item.qty_base || 0)
      const qtyRejBase = Number(item.qty_rejected_base || 0)
      const qtyAccepted = qtyBase - qtyRejBase
      const qtyReturned = Number(item.qty_returned_after_base || 0)
      const qtyActual = Math.max(0, qtyAccepted - qtyReturned)
      
      const rowBaseNet = qtyAccepted * Number(item.unit_cost || 0)
      const discount = Number(item.discount_amount || 0)
      const rowNetOriginal = Math.max(0, rowBaseNet - discount)
      const unitCostNet = qtyAccepted > 0 ? rowNetOriginal / qtyAccepted : Number(item.unit_cost || 0)
      
      const rowNetActual = qtyActual * unitCostNet
      const discountedRowNet = rowNetActual * (1 - Math.min(1, ratio))
      const vatRate = Number(item.vat_rate_percent || 0)
      
      return acc + (discountedRowNet * (vatRate / 100))
    }, 0)
  }, [activeItems, actualNetCost, generalDiscount])

  const grossCost = useMemo(() => {
    return taxableAmount + vatAmount
  }, [taxableAmount, vatAmount])

  return (
    <div className="space-y-6 text-slate-100">
      
      {/* 1. SEZIONE EDITING / CREAZIONE */}
      {isEditing && activeReceipt && (
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
                {activeReceipt.id 
                  ? (language === 'vi' ? 'Chỉnh sửa đơn nhận hàng' : 'Edit Goods Receipt') 
                  : (language === 'vi' ? 'Tạo mới đơn nhận hàng' : 'New Goods Receipt')}
              </h2>
            </div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {activeReceipt.receipt_number}
            </div>
          </div>

          {/* Form Header */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                {language === 'vi' ? 'Chi nhánh/Kho' : 'Location'}
              </label>
              <select
                value={activeReceipt.location_id}
                onChange={e => handleReceiptChange('location_id', e.target.value)}
                disabled={!!activeReceipt.id} // Non modificabile se già salvato bozza
                className="w-full border border-slate-200 rounded-xl px-3 h-10 text-sm font-semibold bg-slate-50 text-gray-800 disabled:opacity-50"
              >
                {locations.filter(l => l.is_active).map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                {language === 'vi' ? 'Nhà cung cấp' : 'Supplier'}
              </label>
              <SupplierCombobox
                suppliers={suppliers}
                selectedId={activeReceipt.supplier_id || null}
                onChange={id => handleReceiptChange('supplier_id', id || '')}
                onAddNew={q => { setNewSupplierName(q); setShowAddSupplier(true) }}
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                {language === 'vi' ? 'Ngày nhận hàng' : 'Delivery Date'}
              </label>
              <input
                type="date"
                value={activeReceipt.delivery_date}
                onChange={e => handleReceiptChange('delivery_date', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 h-10 text-sm font-semibold bg-slate-50 text-gray-800"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                {language === 'vi' ? 'Tài liệu đối chiếu' : 'Reference Document'}
              </label>
              <div className="flex gap-2">
                <select
                  value={activeReceipt.reference_document}
                  onChange={e => handleReceiptChange('reference_document', e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 h-10 text-sm font-semibold bg-slate-50 text-gray-800 w-1/2"
                >
                  <option value="none">{language === 'vi' ? 'Không' : 'None'}</option>
                  <option value="po">Purchase Order</option>
                  <option value="invoice">Supplier Invoice</option>
                  <option value="delivery_note">Delivery Note</option>
                </select>
                <input
                  type="text"
                  placeholder={language === 'vi' ? 'Số tài liệu' : 'Ref Number'}
                  value={activeReceipt.reference_number || ''}
                  onChange={e => handleReceiptChange('reference_number', e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 h-10 text-sm font-semibold bg-slate-50 text-gray-800 w-1/2"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              {language === 'vi' ? 'Ghi chú' : 'Notes'}
            </label>
            <input
              type="text"
              value={activeReceipt.notes || ''}
              onChange={e => handleReceiptChange('notes', e.target.value)}
              placeholder="..."
              className="w-full border border-slate-200 rounded-xl px-3 h-10 text-sm font-semibold bg-slate-50 text-gray-800"
            />
          </div>
          {/* Dettagli Articoli */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-base text-gray-900">{language === 'vi' ? 'Danh sách nguyên liệu nhận' : 'Received Materials List'}</h3>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 text-xs font-bold text-blue-600 hover:bg-blue-50/50 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> {language === 'vi' ? 'Thêm nguyên liệu' : 'Add Material'}
              </button>
            </div>

            {/* Tabella Righe */}
            <div className="overflow-x-auto border border-gray-150 rounded-2xl">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left w-[200px]">{language === 'vi' ? 'Nguyên vật liệu' : 'Material'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-center w-[70px]">{language === 'vi' ? 'ĐVT' : 'UOM'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-center w-[100px]">{language === 'vi' ? 'SL Nhận (Pk)' : 'Qty Recv (Pk)'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right w-[100px]">{language === 'vi' ? 'Giá/Gói (VND)' : 'Pack Cost (VND)'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-center w-[70px]">{language === 'vi' ? 'Thuế %' : 'VAT %'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right w-[90px]">{language === 'vi' ? 'S.Khấu' : 'Discount'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left w-[110px]">{language === 'vi' ? 'Mã lô' : 'Batch #'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left w-[110px]">{language === 'vi' ? 'Hạn sử dụng' : 'Expiry Date'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-center w-[80px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {activeItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-xs text-slate-400 italic font-semibold">
                        {language === 'vi' ? 'Chưa có nguyên liệu nào được thêm' : 'No materials added yet'}
                      </td>
                    </tr>
                  ) : (
                    activeItems.flatMap((item, idx) => {
                      const setup = inventorySetups.find(
                        s => s.location_id === activeReceipt.location_id && 
                             s.item_type === 'material' && 
                             s.item_id === item.material_id
                      )
                      const isBatch = setup?.track_batch ?? false
                      const isExpiry = setup?.track_expiry ?? false
                      const isExpReq = setup?.expiry_required ?? false

                      const rows = [
                        <tr key={`main-${idx}`} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2">
                            <select
                              value={item.material_id}
                              onChange={e => handleItemChange(idx, 'material_id', e.target.value)}
                              className="w-full border border-slate-200 rounded-xl px-2.5 h-9 text-xs font-semibold text-gray-800 bg-slate-50"
                            >
                              {materials
                                .filter(m => !activeReceipt?.supplier_id || m.supplier_id === activeReceipt.supplier_id)
                                .map(m => (
                                  <option key={m.id} value={m.id}>
                                    {m.name} {m.brand && m.brand !== '-' ? `(${m.brand})` : ''}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="p-2 text-center text-xs text-slate-500 font-semibold whitespace-nowrap">
                            {item.uom_base} ({item.packaging_size}{item.uom_base}/pk)
                          </td>
                          <td className="p-2 text-center">
                            <input
                              type="number"
                              min="0"
                              value={item.qty_package || ''}
                              onChange={e => handleItemChange(idx, 'qty_package', Number(e.target.value))}
                              className="w-20 border border-slate-200 rounded-xl px-2 h-9 text-xs text-right font-medium text-gray-800 bg-slate-50"
                              placeholder="0"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              value={item.package_cost || ''}
                              onChange={e => handleItemChange(idx, 'package_cost', Number(e.target.value))}
                              className="w-24 border border-slate-200 rounded-xl px-2 h-9 text-xs text-right font-medium text-gray-800 bg-slate-50"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.vat_rate_percent || ''}
                              onChange={e => handleItemChange(idx, 'vat_rate_percent', Number(e.target.value))}
                              className="w-14 border border-slate-200 rounded-xl px-1.5 h-9 text-xs text-center font-medium text-gray-800 bg-slate-50"
                              placeholder="0"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              min="0"
                              value={item.discount_amount || ''}
                              onChange={e => handleItemChange(idx, 'discount_amount', Number(e.target.value))}
                              className="w-24 border border-slate-200 rounded-xl px-1.5 h-9 text-xs text-right font-medium text-gray-800 bg-slate-50"
                              placeholder="0"
                            />
                          </td>
                          <td className="p-2">
                            {isBatch ? (
                              <input
                                type="text"
                                placeholder="LOT-XXX"
                                value={item.batch_number || ''}
                                onChange={e => handleItemChange(idx, 'batch_number', e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-2 h-9 text-xs text-gray-800 font-medium bg-slate-50"
                              />
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Non richiesto</span>
                            )}
                          </td>
                          <td className="p-2">
                            {isExpiry ? (
                              <input
                                type="date"
                                required={isExpReq}
                                value={item.expiry_date || ''}
                                onChange={e => handleItemChange(idx, 'expiry_date', e.target.value)}
                                className={`w-full border rounded-xl px-2 h-9 text-xs text-gray-800 font-medium bg-slate-50 ${
                                  isExpReq && !item.expiry_date ? 'border-red-400' : 'border-slate-200'
                                }`}
                              />
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Non richiesto</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const wasShown = !!showRejectRow[idx]
                                  setShowRejectRow(prev => ({ ...prev, [idx]: !prev[idx] }))
                                  if (wasShown) {
                                    handleItemChange(idx, 'qty_rejected_package', 0)
                                    handleItemChange(idx, 'notes', '')
                                  }
                                }}
                                title={language === 'vi' ? 'Từ chối colli' : 'Reject Packages'}
                                className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                                  showRejectRow[idx] 
                                    ? 'bg-red-50 text-red-650 border border-red-200' 
                                    : 'text-slate-400 hover:text-red-500 hover:bg-slate-50'
                                }`}
                              >
                                <CornerUpLeft className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveItemRow(idx)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ]

                      if (showRejectRow[idx]) {
                        const rMode = rejectMode[idx] || 'package'
                        const pSize = Number(item.packaging_size || 1)

                        rows.push(
                          <tr key={`sub-${idx}`} className="bg-slate-50/50">
                            <td colSpan={2} className="p-2 pl-6 text-xs text-slate-500 font-semibold italic inline-flex items-center gap-1.5 pt-3.5">
                              <CornerUpLeft className="w-3.5 h-3.5 text-red-500" />
                              {language === 'vi' ? 'Từ chối khi nhận hàng:' : 'Rejected at delivery:'}
                              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 ml-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectMode(prev => ({ ...prev, [idx]: 'package' }))
                                    handleItemChange(idx, 'qty_rejected_package', 0)
                                    handleItemChange(idx, 'qty_rejected_partial', 0)
                                    handleItemChange(idx, 'qty_rejected_base', 0)
                                  }}
                                  className={`px-2 py-0.5 rounded-md text-[9px] font-bold transition-all cursor-pointer ${
                                    rMode === 'package'
                                      ? 'bg-blue-600 text-white shadow-sm'
                                      : 'text-slate-500 hover:text-slate-700'
                                  }`}
                                >
                                  Pack
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectMode(prev => ({ ...prev, [idx]: 'unit' }))
                                    handleItemChange(idx, 'qty_rejected_package', 0)
                                    handleItemChange(idx, 'qty_rejected_partial', 0)
                                    handleItemChange(idx, 'qty_rejected_base', 0)
                                  }}
                                  className={`px-2 py-0.5 rounded-md text-[9px] font-bold transition-all cursor-pointer ${
                                    rMode === 'unit'
                                      ? 'bg-blue-600 text-white shadow-sm'
                                      : 'text-slate-500 hover:text-slate-700'
                                  }`}
                                >
                                  Unit
                                </button>
                              </div>
                            </td>
                            <td className="p-2 text-center">
                              {rMode === 'package' ? (
                                <input
                                  type="number"
                                  min="0"
                                  max={item.qty_package || 0}
                                  value={item.qty_rejected_package || ''}
                                  onChange={e => {
                                    const maxVal = Number(item.qty_package || 0)
                                    const val = Math.min(maxVal, Math.max(0, Number(e.target.value)))
                                    handleItemChange(idx, 'qty_rejected_package', val)
                                    handleItemChange(idx, 'qty_rejected_base', val * pSize)
                                    handleItemChange(idx, 'qty_rejected_partial', 0)
                                  }}
                                  className="w-20 border border-slate-200 rounded-xl px-2 h-8 text-xs text-right font-medium text-gray-800 bg-white"
                                  placeholder={`max ${item.qty_package || 0} pk`}
                                />
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  max={item.qty_base || 0}
                                  value={item.qty_rejected_base || ''}
                                  onChange={e => {
                                    const maxVal = Number(item.qty_base || 0)
                                    const val = Math.min(maxVal, Math.max(0, Number(e.target.value)))
                                    handleItemChange(idx, 'qty_rejected_base', val)
                                    handleItemChange(idx, 'qty_rejected_package', Math.floor(val / pSize))
                                    handleItemChange(idx, 'qty_rejected_partial', val % pSize)
                                  }}
                                  className="w-20 border border-slate-200 rounded-xl px-2 h-8 text-xs text-right font-medium text-gray-800 bg-white"
                                  placeholder={`max ${item.qty_base || 0} ${item.uom_base}`}
                                />
                              )}
                            </td>
                            <td colSpan={6} className="p-2 pr-4">
                              <input
                                type="text"
                                value={item.notes || ''}
                                onChange={e => handleItemChange(idx, 'notes', e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-3 h-8 text-xs font-semibold bg-white text-gray-800"
                                placeholder={language === 'vi' ? 'Lý do từ chối (Ghi chú dòng)...' : 'Reason for rejection (item notes)...'}
                              />
                            </td>
                          </tr>
                        )
                      }

                      return rows
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Riepilogo Costi & Azioni */}
          <div className="border-t border-gray-100 pt-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
              
              {/* Left Column: Totals Box */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between text-xs font-semibold text-slate-650 space-y-2 shadow-sm">
                <div className="flex justify-between items-center py-1">
                  <span>{language === 'vi' ? 'Tổng tiền ròng:' : 'Net Total:'}</span>
                  <span className="text-gray-900 font-bold">{originalNetCost.toLocaleString()} VND</span>
                </div>
                
                <div className="flex justify-between items-center py-1 text-red-600">
                  <span>{language === 'vi' ? 'Hàng trả lại:' : 'Reversals:'}</span>
                  <span className="font-bold">
                    {stornoAmount > 0 ? `- ${stornoAmount.toLocaleString()}` : '0'} VND
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-t border-slate-100">
                  <span>{language === 'vi' ? 'Tiền ròng sau khi trả lại:' : 'Net after Reversals:'}</span>
                  <span className="text-gray-900 font-bold">{actualNetCost.toLocaleString()} VND</span>
                </div>

                <div className="flex justify-between items-center py-1 border-t border-slate-100">
                  <span>{language === 'vi' ? 'Chiết khấu hóa đơn:' : 'Invoice Discount:'}</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      value={activeReceipt.discount_amount || ''}
                      onChange={e => handleReceiptChange('discount_amount', Number(e.target.value))}
                      className="w-24 border border-slate-200 rounded-lg px-2 h-6 text-xs text-right font-bold text-gray-800 bg-white"
                      placeholder="0"
                    />
                    <span className="text-[9px] text-slate-400 font-bold">VND</span>
                  </div>
                </div>

                <div className="flex justify-between items-center py-1 border-t border-slate-100">
                  <span>{language === 'vi' ? 'Tổng tiền chịu thuế:' : 'Taxable Total:'}</span>
                  <span className="text-gray-900 font-bold">{taxableAmount.toLocaleString()} VND</span>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span>{language === 'vi' ? 'Tổng thuế VAT:' : 'VAT Total:'}</span>
                  <span className="text-gray-900 font-bold">{vatAmount.toLocaleString()} VND</span>
                </div>
              </div>

              {/* Right Column: Gross Total and Actions */}
              <div className="flex flex-col justify-between space-y-4">
                
                {/* Gross Total Box */}
                <div className="flex-1 bg-slate-50/50 rounded-2xl border border-slate-200 p-6 flex flex-col items-center justify-center shadow-sm">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {language === 'vi' ? 'Tổng thanh toán' : 'Gross Total'}
                  </div>
                  <div className="text-xl font-extrabold text-slate-800 mt-1">
                    {grossCost.toLocaleString()} VND
                  </div>
                  <div className="text-[10px] text-slate-500 font-bold mt-1">
                    {language === 'vi' ? 'Hạn thanh toán: —' : 'Due Date: —'}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="inline-flex items-center justify-center gap-1.5 px-4 h-11 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-bold transition-colors cursor-pointer"
                  >
                    {language === 'vi' ? 'Hủy' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors cursor-pointer"
                  >
                    {language === 'vi' ? 'Lưu nháp' : 'Save Draft'}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmReceipt}
                    className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors cursor-pointer"
                  >
                    <Check className="w-4 h-4" /> {language === 'vi' ? 'Xác nhận' : 'Confirm Receipt'}
                  </button>
                </div>

              </div>

            </div>
          </div>
        </div>
      )}
      {/* 2. SEZIONE DETTAGLIO RICEZIONE CONFIRMED/CANCELLED */}
      {isViewing && activeReceipt && (
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
                {language === 'vi' ? 'Chi tiết đơn nhận' : 'Goods Receipt Details'}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                activeReceipt.status === 'confirmed' 
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                  : activeReceipt.status === 'cancelled'
                  ? 'bg-red-50 text-red-600 border-red-100'
                  : 'bg-slate-50 text-slate-600 border-slate-100'
              }`}>
                {activeReceipt.status === 'confirmed'
                  ? (language === 'vi' ? 'ĐÃ XÁC NHẬN' : 'CONFIRMED')
                  : activeReceipt.status === 'cancelled'
                  ? (language === 'vi' ? 'ĐÃ HỦY' : 'CANCELLED')
                  : (language === 'vi' ? 'BẢN NHÁP' : 'DRAFT')}
              </span>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {activeReceipt.receipt_number}
              </div>
            </div>
          </div>

          {/* Dati Generali */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> {language === 'vi' ? 'Thông tin chung' : 'General Info'}
              </div>
              <div className="text-xs font-medium text-slate-700">
                <strong>{language === 'vi' ? 'Chi nhánh/Kho:' : 'Location:'}</strong> {locations.find(l => l.id === activeReceipt.location_id)?.name}
              </div>
              <div className="text-xs font-medium text-slate-700">
                <strong>{language === 'vi' ? 'Nhà cung cấp:' : 'Supplier:'}</strong> {suppliers.find(s => s.id === activeReceipt.supplier_id)?.name}
              </div>
              <div className="text-xs font-medium text-slate-700">
                <strong>{language === 'vi' ? 'Ngày nhận hàng:' : 'Delivery Date:'}</strong> {formatDate(activeReceipt.delivery_date)}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider inline-flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> {language === 'vi' ? 'Tài liệu tham chiếu' : 'Reference Doc'}
              </div>
              <div className="text-xs font-medium text-slate-700">
                <strong>{language === 'vi' ? 'Loại tài liệu:' : 'Type:'}</strong> {activeReceipt.reference_document === 'delivery_note' ? (language === 'vi' ? 'Phiếu giao hàng' : 'Delivery Note') : activeReceipt.reference_document === 'invoice' ? (language === 'vi' ? 'Hóa đơn' : 'Invoice') : activeReceipt.reference_document}
              </div>
              <div className="text-xs font-medium text-slate-700">
                <strong>{language === 'vi' ? 'Số tài liệu:' : 'Doc Number:'}</strong> {activeReceipt.reference_number || '—'}
              </div>
              <div className="text-xs font-medium text-slate-700">
                <strong>{language === 'vi' ? 'Ghi chú:' : 'Notes:'}</strong> {activeReceipt.notes || '—'}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider inline-flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> {language === 'vi' ? 'Hệ thống' : 'System Logs'}
              </div>
              <div className="text-xs font-medium text-slate-700">
                <strong>{language === 'vi' ? 'Tạo lúc:' : 'Created at:'}</strong> {formatDateTime(activeReceipt.created_at)}
              </div>
              <div className="text-xs font-medium text-slate-700">
                <strong>{language === 'vi' ? 'Xác nhận lúc:' : 'Confirmed at:'}</strong> {formatDateTime(activeReceipt.confirmed_at)}
              </div>
            </div>
          </div>

          {/* Righe Tabella */}
          <div className="space-y-3">
            <h3 className="font-bold text-base text-gray-900">{language === 'vi' ? 'Chi tiết nguyên liệu' : 'Materials List'}</h3>
            
            <div className="overflow-x-auto border border-gray-150 rounded-2xl">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left">{language === 'vi' ? 'Nguyên vật liệu' : 'Material'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-center">{language === 'vi' ? 'ĐVT' : 'UOM'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right">{language === 'vi' ? 'SL Nhận (Pk)' : 'Qty Recv (Pk)'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right">{language === 'vi' ? 'Giá/Gói (VND)' : 'Pack Cost (VND)'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-center">{language === 'vi' ? 'Thuế %' : 'VAT %'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-right">{language === 'vi' ? 'S.Khấu' : 'Discount'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left">{language === 'vi' ? 'Mã lô' : 'Batch #'}</th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-slate-500 uppercase text-left">{language === 'vi' ? 'Hạn sử dụng' : 'Expiry Date'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {activeItems.flatMap((item, idx) => {
                    const hasReject = Number(item.qty_rejected_package || 0) > 0
                    const rows = [
                      <tr key={`main-view-${idx}`} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-semibold text-gray-900">
                          {item.material_name} {item.material_brand && item.material_brand !== '-' ? `(${item.material_brand})` : ''}
                        </td>
                        <td className="p-3 text-center text-xs text-slate-500 font-semibold whitespace-nowrap">
                          {item.uom_base} ({item.packaging_size}{item.uom_base}/pk)
                        </td>
                        <td className="p-3 text-right text-xs text-slate-700 font-medium">
                          {item.qty_package?.toLocaleString()} pk
                        </td>
                        <td className="p-3 text-right text-xs text-slate-700 font-medium">
                          {item.package_cost?.toLocaleString()}
                        </td>
                        <td className="p-3 text-center text-xs text-slate-700 font-medium">
                          {item.vat_rate_percent || 0}%
                        </td>
                        <td className="p-3 text-right text-xs text-slate-700 font-medium">
                          {item.discount_amount?.toLocaleString()}
                        </td>
                        <td className="p-3 text-xs text-slate-800 font-semibold font-mono">
                          {item.batch_number || '—'}
                        </td>
                        <td className="p-3 text-xs text-slate-700 font-semibold">
                          {formatDate(item.expiry_date)}
                        </td>
                      </tr>
                    ]
                    if (hasReject) {
                      rows.push(
                        <tr key={`sub-view-${idx}`} className="bg-slate-50/30">
                          <td colSpan={2} className="p-2.5 pl-6 text-xs text-slate-500 font-semibold italic inline-flex items-center gap-1">
                            <CornerUpLeft className="w-3.5 h-3.5 text-red-500" />
                            {language === 'vi' ? 'Từ chối khi nhận hàng:' : 'Rejected at delivery:'}
                          </td>
                          <td className="p-2.5 text-right text-xs text-red-650 font-bold">
                            {item.qty_rejected_package} pk
                          </td>
                          <td colSpan={5} className="p-2.5 text-xs text-slate-500 font-semibold pl-4">
                            <strong>{language === 'vi' ? 'Lý do:' : 'Reason:'}</strong> {item.notes || '—'}
                          </td>
                        </tr>
                      )
                    }
                    return rows
                  })}
                </tbody>
              </table>
            </div>
          </div>

           {/* Costo Totale */}
          <div className="border-t border-gray-100 pt-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
              
              {/* Left Column: Totals Box */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between text-xs font-semibold text-slate-650 space-y-2 shadow-sm">
                <div className="flex justify-between items-center py-1">
                  <span>{language === 'vi' ? 'Tổng tiền ròng:' : 'Net Total:'}</span>
                  <span className="text-gray-900 font-bold">{originalNetCost.toLocaleString()} VND</span>
                </div>
                
                <div className="flex justify-between items-center py-1 text-red-600">
                  <span>{language === 'vi' ? 'Hàng trả lại:' : 'Reversals:'}</span>
                  <span className="font-bold">
                    {stornoAmount > 0 ? `- ${stornoAmount.toLocaleString()}` : '0'} VND
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-t border-slate-100">
                  <span>{language === 'vi' ? 'Tiền ròng sau khi trả lại:' : 'Net after Reversals:'}</span>
                  <span className="text-gray-900 font-bold">{actualNetCost.toLocaleString()} VND</span>
                </div>

                <div className="flex justify-between items-center py-1 border-t border-slate-100">
                  <span>{language === 'vi' ? 'Chiết khấu hóa đơn:' : 'Invoice Discount:'}</span>
                  <span className="text-gray-900 font-bold">{(activeReceipt.discount_amount || 0).toLocaleString()} VND</span>
                </div>

                <div className="flex justify-between items-center py-1 border-t border-slate-100">
                  <span>{language === 'vi' ? 'Tổng tiền chịu thuế:' : 'Taxable Total:'}</span>
                  <span className="text-gray-900 font-bold">{taxableAmount.toLocaleString()} VND</span>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span>{language === 'vi' ? 'Tổng thuế VAT:' : 'VAT Total:'}</span>
                  <span className="text-gray-900 font-bold">{vatAmount.toLocaleString()} VND</span>
                </div>
              </div>

              {/* Right Column: Gross Total and Actions */}
              <div className="flex flex-col justify-between space-y-4">
                
                {/* Gross Total Box */}
                <div className="flex-1 bg-slate-50/50 rounded-2xl border border-slate-200 p-6 flex flex-col items-center justify-center shadow-sm">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {language === 'vi' ? 'Tổng thanh toán' : 'Gross Total'}
                  </div>
                  <div className="text-xl font-extrabold text-slate-800 mt-1">
                    {grossCost.toLocaleString()} VND
                  </div>
                  <div className="text-[10px] text-slate-500 font-bold mt-1">
                    {language === 'vi' ? 'Hạn thanh toán: —' : 'Due Date: —'}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsViewing(false)}
                    className="inline-flex items-center justify-center gap-1.5 px-4 h-11 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-bold transition-colors cursor-pointer"
                  >
                    {language === 'vi' ? 'Đóng' : 'Close'}
                  </button>
                  {activeReceipt.status === 'confirmed' && (
                    <button
                      type="button"
                      onClick={() => {
                        const initialReturn: Record<string, number> = {}
                        activeItems.forEach(item => {
                          if (item.material_id) initialReturn[item.material_id] = 0
                        })
                        setReturnItems(initialReturn)
                        setReturnNotes('')
                        setIsReturnModalOpen(true)
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors cursor-pointer"
                    >
                      {language === 'vi' ? 'Trả hàng trễ' : 'Register Late Return'} <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>

              </div>

            </div>
          </div>
        </div>
      )}

      {/* 3. VISTA LISTA PRINCIPALE */}
      {!isEditing && !isViewing && (
        <>
          {/* Header e Selezione Location */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">
                {t(language, 'GoodsReceiving')}
              </h1>
              <p className="text-sm text-slate-400">
                {language === 'vi'
                  ? 'Quản lý việc nhận hàng nguyên vật liệu từ nhà cung cấp vào kho'
                  : 'Manage receiving of raw materials from suppliers into stock'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {branchId === 'all' && (
                <select
                  value={selectedLocation}
                  onChange={e => setSelectedLocation(e.target.value)}
                  className="border border-white/10 rounded-xl px-3 h-11 text-sm font-semibold text-slate-200 bg-slate-800 focus:outline-none min-w-[200px]"
                >
                  <option value="all">{language === 'vi' ? 'Tất cả các kho' : 'All Locations'}</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              )}

              <button
                onClick={openNewReceipt}
                className="inline-flex items-center gap-1.5 px-4 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-5 h-5" /> {language === 'vi' ? 'Nhận hàng mới' : 'New Goods Receipt'}
              </button>
            </div>
          </div>

          {/* Tab minimaliste */}
          <div className="flex border-b border-white/10 gap-6 pb-px mt-2 mb-4">
            <button
              onClick={() => setActiveTab('receipts')}
              className={`pb-2.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'receipts'
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {language === 'vi' ? 'Hóa đơn Nhận hàng' : 'Goods Receipts'}
            </button>
            <button
              onClick={() => setActiveTab('returns')}
              className={`pb-2.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'returns'
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {language === 'vi' ? 'Phiếu trả hàng' : 'Return Notes'}
            </button>
          </div>

          {/* Feedback Messages */}
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

          {/* Loader */}
          {loading ? (
            <div className="flex h-[250px] w-full items-center justify-center">
              <CircularLoader />
            </div>
          ) : activeTab === 'receipts' ? (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden text-gray-900">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th 
                        onClick={() => handleSort('receipt_number')}
                        className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>{language === 'vi' ? 'Số đơn nhận' : 'Receipt Number'}</span>
                          {sortCol === 'receipt_number' && (
                            sortAsc ? ' ▲' : ' ▼'
                          )}
                        </div>
                      </th>
                      <ColumnHeader
                        colKey="location"
                        label={language === 'vi' ? 'Chi nhánh/Kho' : 'Location'}
                        sortCol={sortCol}
                        sortAsc={sortAsc}
                        onSort={handleSort}
                        values={getFilterOptions('location')}
                        activeFilter={filters['location'] || null}
                        onFilter={vals => handleFilterChange('location', vals)}
                        onClear={() => handleFilterChange('location', null)}
                        open={openHeaderKey === 'location'}
                        onToggle={() => setOpenHeaderKey(openHeaderKey === 'location' ? null : 'location')}
                        onClose={() => setOpenHeaderKey(null)}
                        dict={columnHeaderDict}
                        className="py-3 px-4 text-left"
                      />
                      <ColumnHeader
                        colKey="supplier"
                        label={language === 'vi' ? 'Nhà cung cấp' : 'Supplier'}
                        sortCol={sortCol}
                        sortAsc={sortAsc}
                        onSort={handleSort}
                        values={getFilterOptions('supplier')}
                        activeFilter={filters['supplier'] || null}
                        onFilter={vals => handleFilterChange('supplier', vals)}
                        onClear={() => handleFilterChange('supplier', null)}
                        open={openHeaderKey === 'supplier'}
                        onToggle={() => setOpenHeaderKey(openHeaderKey === 'supplier' ? null : 'supplier')}
                        onClose={() => setOpenHeaderKey(null)}
                        dict={columnHeaderDict}
                        className="py-3 px-4 text-left"
                      />
                      <th 
                        onClick={() => handleSort('delivery_date')}
                        className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>{language === 'vi' ? 'Ngày nhận' : 'Delivery Date'}</span>
                          {sortCol === 'delivery_date' && (
                            sortAsc ? ' ▲' : ' ▼'
                          )}
                        </div>
                      </th>
                      <ColumnHeader
                        colKey="status"
                        label={language === 'vi' ? 'Trạng thái' : 'Status'}
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
                      <th className="py-3 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-[120px]">{language === 'vi' ? 'Thao tác' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {filteredAndSortedReceipts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs text-slate-400 italic font-semibold">
                          {language === 'vi' ? 'Không tìm thấy đơn nhận hàng nào' : 'No goods receipts found'}
                        </td>
                      </tr>
                    ) : (
                      filteredAndSortedReceipts.map(gr => (
                        <tr key={gr.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-bold text-gray-900">{gr.receipt_number}</td>
                          <td className="py-3 px-4 text-slate-650 font-medium">{gr.location_name}</td>
                          <td className="py-3 px-4 text-slate-650 font-medium">{gr.supplier_name}</td>
                          <td className="py-3 px-4 text-slate-650 font-medium">{formatDate(gr.delivery_date)}</td>
                          <td className="py-3 px-4 text-right">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              gr.status === 'confirmed' 
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                : gr.status === 'cancelled'
                                ? 'bg-red-50 text-red-600 border-red-100'
                                : 'bg-slate-50 text-slate-600 border-slate-100'
                            }`}>
                              {gr.status === 'confirmed'
                                ? (language === 'vi' ? 'ĐÃ XÁC NHẬN' : 'CONFIRMED')
                                : gr.status === 'cancelled'
                                ? (language === 'vi' ? 'ĐÃ HỦY' : 'CANCELLED')
                                : (language === 'vi' ? 'BẢN NHÁP' : 'DRAFT')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                title="View details"
                                onClick={() => viewReceipt(gr)}
                                className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                              >
                                <Eye className="w-4.5 h-4.5" />
                              </button>
                              
                              {gr.status === 'draft' && (
                                <button
                                  title="Edit draft"
                                  onClick={() => editReceipt(gr)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                                >
                                  <Plus className="w-4.5 h-4.5" />
                                </button>
                              )}
 
                              {gr.status === 'confirmed' && isManager && (
                                <button
                                  title="Cancel and reverse receipt"
                                  onClick={() => handleCancelReceipt(gr)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                                >
                                  <X className="w-4.5 h-4.5" />
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
          ) : (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden text-gray-900">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {language === 'vi' ? 'Số Phiếu Trả' : 'Return Number'}
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {language === 'vi' ? 'Hóa đơn gốc' : 'Receipt Ref'}
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {language === 'vi' ? 'Chi nhánh/Kho' : 'Location'}
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {language === 'vi' ? 'Nhà cung cấp' : 'Supplier'}
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {language === 'vi' ? 'Ngày trả' : 'Return Date'}
                      </th>
                      <th className="py-3 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-[120px]">
                        {language === 'vi' ? 'Thao tác' : 'Actions'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {filteredReturnNotes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                          {language === 'vi' ? 'Không có phiếu trả hàng nào.' : 'No return notes found.'}
                        </td>
                      </tr>
                    ) : (
                      filteredReturnNotes.map((note) => (
                        <tr key={note.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-4 font-bold text-xs text-gray-800">
                            {note.return_number}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium text-slate-700">
                            {note.receipt_number}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-700 font-medium">
                            {note.location_name}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-700 font-medium">
                            {note.supplier_name}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500 font-medium">
                            {formatDate(note.return_date)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleViewReturnNote(note)}
                              className="px-3 py-1 bg-slate-50 border border-slate-200 hover:bg-blue-50 hover:border-blue-200 text-blue-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                              {language === 'vi' ? 'Xem chi tiết' : 'View Details'}
                            </button>
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

      <AddSupplierModal 
        isOpen={showAddSupplier} 
        onClose={() => setShowAddSupplier(false)} 
        onSaved={handleSupplierSaved} 
        initialName={newSupplierName} 
      />

      {isReturnModalOpen && activeReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 text-gray-900 shadow-xl border border-slate-100 flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <div className="flex items-center gap-2 text-red-600">
                <CornerUpLeft className="w-5 h-5" />
                <h3 className="text-lg font-bold text-gray-900">
                  {language === 'vi' ? 'Đăng ký trả hàng trễ' : 'Register Late Return'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsReturnModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <p className="text-xs text-slate-500">
                {language === 'vi'
                  ? 'Ghi nhận việc trả lại hàng sau khi đơn đã được xác nhận. Số lượng trả lại sẽ được trừ vào kho (lô hàng tương ứng) và ghi nhận việc trả lại hàng.'
                  : 'Record a return after the receipt has been confirmed. Returned quantities will be deducted from the warehouse inventory (matching batch) and recorded as a reversal.'}
              </p>

              <div className="border border-slate-150 rounded-2xl overflow-hidden shadow-sm">
                <table className="min-w-full divide-y divide-gray-100 text-sm align-middle">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase text-left">{language === 'vi' ? 'Nguyên vật liệu' : 'Material'}</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase text-right w-[150px]">{language === 'vi' ? 'Trạng thái' : 'Status'}</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase text-center w-[120px]">{language === 'vi' ? 'Chế độ' : 'Mode'}</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase text-right w-[160px]">{language === 'vi' ? 'SL trả lại' : 'Qty to Return'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {activeItems.map((item, idx) => {
                      const qtyBase = Number(item.qty_base || 0)
                      const qtyRejBase = Number(item.qty_rejected_base || 0)
                      const qtyAccepted = qtyBase - qtyRejBase
                      const returned = Number(item.qty_returned_after_base || 0)
                      const maxReturnableBase = qtyAccepted - returned
                      const itemId = item.material_id || ''
                      const pSize = Number(item.packaging_size || 1)
                      const rMode = returnMode[itemId] || 'package'

                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3">
                            <div className="font-semibold text-gray-900 text-xs">
                              {item.material_name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              {item.category_name} {item.material_brand && item.material_brand !== '-' ? `(${item.material_brand})` : ''}
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="text-[11px] text-slate-500 font-medium space-y-0.5">
                              <div>{language === 'vi' ? 'Đã nhận' : 'Accepted'}: <strong className="text-slate-800">{qtyAccepted} {item.uom_base}</strong></div>
                              <div>{language === 'vi' ? 'Đã trả' : 'Returned'}: <strong className="text-red-500">{returned} {item.uom_base}</strong></div>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                              <button
                                type="button"
                                onClick={() => {
                                  setReturnMode(prev => ({ ...prev, [itemId]: 'package' }))
                                  setReturnItems(prev => ({ ...prev, [itemId]: 0 }))
                                }}
                                className={`px-2 py-1 rounded-md text-[9px] font-bold transition-all cursor-pointer ${
                                  rMode === 'package'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                  }`}
                              >
                                {language === 'vi' ? 'Gói' : 'Pack'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReturnMode(prev => ({ ...prev, [itemId]: 'unit' }))
                                  setReturnItems(prev => ({ ...prev, [itemId]: 0 }))
                                }}
                                className={`px-2 py-1 rounded-md text-[9px] font-bold transition-all cursor-pointer ${
                                  rMode === 'unit'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                              >
                                {language === 'vi' ? 'Lẻ' : 'Unit'}
                              </button>
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                min="0"
                                max={rMode === 'package' ? Math.floor(maxReturnableBase / pSize) : maxReturnableBase}
                                value={returnItems[itemId] || ''}
                                onChange={e => {
                                  const limit = rMode === 'package' ? Math.floor(maxReturnableBase / pSize) : maxReturnableBase
                                  const val = Math.min(limit, Math.max(0, Number(e.target.value)))
                                  setReturnItems(prev => ({
                                    ...prev,
                                    [itemId]: val
                                  }))
                                }}
                                className="w-20 border border-slate-200 rounded-xl px-2 h-8 text-xs text-right font-semibold text-gray-800 bg-slate-50 focus:bg-white focus:border-blue-300 transition-colors"
                                placeholder={`max ${rMode === 'package' ? Math.floor(maxReturnableBase / pSize) : maxReturnableBase}`}
                                disabled={maxReturnableBase <= 0}
                              />
                              <span className="text-[10px] font-bold text-slate-400 w-8 text-left uppercase">
                                {rMode === 'package' ? 'pk' : item.uom_base}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  {language === 'vi' ? 'Lý do / Ghi chú trả hàng' : 'Reason / Return Notes'}
                </label>
                <input
                  type="text"
                  value={returnNotes}
                  onChange={e => setReturnNotes(e.target.value)}
                  placeholder="..."
                  className="w-full border border-slate-200 rounded-xl px-3 h-10 text-xs font-semibold bg-slate-50 text-gray-800 focus:bg-white focus:border-blue-300 transition-colors"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-3 mt-4">
              <button
                type="button"
                onClick={() => setIsReturnModalOpen(false)}
                className="inline-flex items-center justify-center gap-1.5 px-4 h-11 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-bold transition-colors cursor-pointer"
              >
                {language === 'vi' ? 'Hủy' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSaveReturn}
                className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-red-655 hover:bg-red-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors cursor-pointer"
              >
                {language === 'vi' ? 'Xác nhận trả' : 'Confirm Return'}
              </button>
            </div>

          </div>
        </div>
      )}

      {isReturnViewOpen && activeReturnNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 text-gray-900 shadow-xl border border-slate-100 flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <div className="flex items-center gap-2 text-blue-650">
                <CornerUpLeft className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-gray-900">
                  {language === 'vi' ? 'Chi tiết Phiếu Trả Hàng' : 'Return Note Details'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsReturnViewOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl text-xs font-semibold text-gray-700 border border-slate-100 mb-4">
              <div className="space-y-1.5">
                <div>
                  <span className="text-slate-400 uppercase tracking-wider text-[9px] block">{language === 'vi' ? 'Số phiếu trả' : 'Return Number'}</span>
                  <span className="text-gray-900 font-bold">{activeReturnNote.return_number}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase tracking-wider text-[9px] block">{language === 'vi' ? 'Kho' : 'Location'}</span>
                  <span className="text-slate-800">{activeReturnNote.location_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase tracking-wider text-[9px] block">{language === 'vi' ? 'Nhà cung cấp' : 'Supplier'}</span>
                  <span className="text-slate-800">{activeReturnNote.supplier_name}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <div>
                  <span className="text-slate-400 uppercase tracking-wider text-[9px] block">{language === 'vi' ? 'Hóa đơn gốc' : 'Original Receipt Ref'}</span>
                  <span className="text-slate-800">{activeReturnNote.receipt_number}</span>
                </div>
                <div>
                  <span className="text-slate-400 tracking-wider text-[9px] block uppercase">{language === 'vi' ? 'Ngày trả' : 'Return Date'}</span>
                  <span className="text-slate-800">{formatDate(activeReturnNote.return_date)}</span>
                </div>
                <div>
                  <span className="text-slate-400 tracking-wider text-[9px] block uppercase">{language === 'vi' ? 'Ghi chú' : 'Notes'}</span>
                  <span className="text-slate-800">{activeReturnNote.notes || '-'}</span>
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="flex-1 overflow-y-auto border border-slate-100 rounded-2xl shadow-sm">
              <table className="min-w-full divide-y divide-gray-100 text-sm align-middle">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase text-left">{language === 'vi' ? 'Nguyên vật liệu' : 'Material'}</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase text-right w-[150px]">{language === 'vi' ? 'Số gói trả' : 'Returned Pkgs'}</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase text-right w-[120px]">{language === 'vi' ? 'Đơn vị cơ bản' : 'Returned Base'}</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase text-right w-[140px]">{language === 'vi' ? 'Đơn giá ròng' : 'Unit Cost'}</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase text-right w-[140px]">{language === 'vi' ? 'Tổng giá trị' : 'Total Value'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(activeReturnNote.items || []).map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3">
                        <div className="font-semibold text-gray-900 text-xs">
                          {item.material_name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">
                          {item.material_brand && item.material_brand !== '-' ? `Brand: ${item.material_brand}` : ''}
                        </div>
                      </td>
                      <td className="p-3 text-right text-xs font-semibold text-slate-700">
                        {item.qty_package} pk
                      </td>
                      <td className="p-3 text-right text-xs font-semibold text-slate-700">
                        {item.qty_base} {item.uom_base}
                      </td>
                      <td className="p-3 text-right text-xs text-slate-650 font-medium">
                        {(item.unit_cost || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-xs font-bold text-gray-900">
                        {((item.qty_base || 0) * (item.unit_cost || 0)).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-3 mt-4">
              <button
                type="button"
                onClick={() => setIsReturnViewOpen(false)}
                className="inline-flex items-center justify-center gap-1.5 px-4 h-11 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-bold transition-colors cursor-pointer"
              >
                {language === 'vi' ? 'Đóng' : 'Close'}
              </button>
              <button
                type="button"
                onClick={handlePrintReturnNote}
                className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors cursor-pointer"
              >
                {language === 'vi' ? 'In phiếu' : 'Print Note'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

export default function GoodsReceivingPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-transparent">
        <CircularLoader />
      </div>
    }>
      <GoodsReceivingContent />
    </Suspense>
  )
}
