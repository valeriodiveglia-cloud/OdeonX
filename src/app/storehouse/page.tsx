'use client'

import React, { useEffect, useState, useMemo, Suspense } from 'react'
import { supabase } from '@/lib/supabase_shim'
import {
  CurrencyDollarIcon,
  CircleStackIcon,
  ExclamationTriangleIcon,
  ArrowTrendingDownIcon,
  DocumentPlusIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

interface Location {
  id: string
  name: string
}

interface KPIData {
  totalValueVnd: number
  tracedItemsCount: number
  lowStockCount: number
  negativeStockCount: number
}

interface AlertItem {
  id: string
  name: string
  type: 'material' | 'prep'
  current_qty: number
  uom: string
  min_stock: number
  location_name: string
  status: 'low_stock' | 'negative_stock'
}

interface RecentMov {
  id: string
  item_name: string
  location_name: string
  movement_type: string
  qty_base: number
  uom_base: string
  created_at: string
}

function StorehouseOverviewContent() {
  const { language } = useSettings()
  const searchParams = useSearchParams()
  const branchId = searchParams.get('branchId') || 'all'
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocId, setSelectedLocId] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  // Raw data for metrics
  const [materials, setMaterials] = useState<any[]>([])
  const [preps, setPreps] = useState<any[]>([])
  const [setups, setSetups] = useState<any[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [productions, setProductions] = useState<any[]>([])
  const [batches, setBatches] = useState<any[]>([])

  useEffect(() => {
    async function loadLocations() {
      try {
        let query = supabase
          .from('storehouse_locations')
          .select('id, name')
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
    async function loadOverviewData() {
      try {
        setLoading(true)

        const [matsRes, prepsRes, setupRes, movsRes, prodsRes, batchesRes] = await Promise.all([
          supabase.from('materials').select('id, name, brand, unit_cost, categories(name), uom(name)').is('deleted_at', null),
          supabase.from('prep_recipes').select('id, name, cost_per_unit_vnd, recipe_categories(name), uom(name)').is('deleted_at', null),
          supabase.from('storehouse_inventory_setup').select('*'),
          supabase.from('storehouse_movements').select('location_id, item_type, item_id, qty_base, movement_type, created_at').order('created_at', { ascending: false }),
          supabase.from('storehouse_kitchen_productions').select('id, location_id, created_at, qty_actual, prep_recipes(name)').order('created_at', { ascending: false }),
          supabase.from('storehouse_batches').select('*').gt('current_qty', 0).order('expiry_date', { ascending: true })
        ])

        setMaterials(matsRes.data || [])
        setPreps(prepsRes.data || [])
        setSetups(setupRes.data || [])
        setMovements(movsRes.data || [])
        setProductions(prodsRes.data || [])
        setBatches(batchesRes.data || [])
      } catch (err) {
        console.error('Error loading overview database data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadOverviewData()
  }, [selectedLocId])

  // Calcolo KPI ed Alert in base alla location selezionata
  const metrics = useMemo(() => {
    let totalValue = 0
    let tracedCount = 0
    let lowStock = 0
    let negativeStock = 0
    let expiredValue = 0
    let nearExpiryValue = 0
    const alertItemsList: AlertItem[] = []
    const expiryAlertsList: any[] = []

    // Mappatura nomi locations
    const locMap: Record<string, string> = {}
    locations.forEach(l => {
      locMap[l.id] = l.name
    })

    const targetLocs = selectedLocId === 'all' ? locations.map(l => l.id) : [selectedLocId]

    // 0. Calcolo valore lotti scaduti o in scadenza
    batches.forEach(b => {
      if (!targetLocs.includes(b.location_id)) return
      
      const itemCost = b.item_type === 'material'
        ? Number(materials.find(x => x.id === b.item_id)?.unit_cost || 0)
        : Number(preps.find(x => x.id === b.item_id)?.cost_per_unit_vnd || 0)

      const value = b.current_qty * itemCost
      const isExpired = b.expiry_date && new Date(b.expiry_date) < new Date()
      
      // Warning days del setup dell'articolo
      const setup = setups.find(s => s.location_id === b.location_id && s.item_type === b.item_type && s.item_id === b.item_id)
      const warningDays = setup?.warning_days || 7
      const isWarning = b.expiry_date && !isExpired && 
        new Date(b.expiry_date).getTime() - new Date().getTime() < warningDays * 24 * 60 * 60 * 1000

      if (isExpired) {
        expiredValue += value
        
        const itemName = b.item_type === 'material'
          ? (materials.find(x => x.id === b.item_id)?.name || 'Unknown Material')
          : (preps.find(x => x.id === b.item_id)?.name || 'Unknown Prep')

        expiryAlertsList.push({
          id: b.id,
          batch_code: b.batch_code,
          item_name: itemName,
          expiry_date: b.expiry_date,
          current_qty: b.current_qty,
          uom: b.uom_base,
          location_name: locMap[b.location_id] || '-',
          status: 'expired',
          value
        })
      } else if (isWarning) {
        nearExpiryValue += value

        const itemName = b.item_type === 'material'
          ? (materials.find(x => x.id === b.item_id)?.name || 'Unknown Material')
          : (preps.find(x => x.id === b.item_id)?.name || 'Unknown Prep')

        expiryAlertsList.push({
          id: b.id,
          batch_code: b.batch_code,
          item_name: itemName,
          expiry_date: b.expiry_date,
          current_qty: b.current_qty,
          uom: b.uom_base,
          location_name: locMap[b.location_id] || '-',
          status: 'near_expiry',
          value
        })
      }
    })

    targetLocs.forEach(locId => {
      // 1. Calcolo per i Materials
      materials.forEach(m => {
        const setup = setups.find(s => s.location_id === locId && s.item_type === 'material' && s.item_id === m.id)
        const itemMovs = movements.filter(mov => mov.location_id === locId && mov.item_type === 'material' && mov.item_id === m.id)
        const qty = itemMovs.reduce((acc, mov) => acc + Number(mov.qty_base || 0), 0)

        const isTraced = setup?.track_inventory ?? false
        if (isTraced) {
          tracedCount++
          const unitCost = Number(m.unit_cost || 0)
          totalValue += qty * unitCost

          const minStock = setup?.min_stock ?? 0
          if (qty < 0) {
            negativeStock++
            alertItemsList.push({
              id: m.id,
              name: m.name + (m.brand && m.brand.toLowerCase() !== 'unknown' ? ` (${m.brand})` : ''),
              type: 'material',
              current_qty: qty,
              uom: m.uom?.name || 'unit',
              min_stock: minStock,
              location_name: locMap[locId] || '-',
              status: 'negative_stock',
            })
          } else if (qty <= minStock) {
            lowStock++
            alertItemsList.push({
              id: m.id,
              name: m.name + (m.brand && m.brand.toLowerCase() !== 'unknown' ? ` (${m.brand})` : ''),
              type: 'material',
              current_qty: qty,
              uom: m.uom?.name || 'unit',
              min_stock: minStock,
              location_name: locMap[locId] || '-',
              status: 'low_stock',
            })
          }
        }
      })

      // 2. Calcolo per le Prep
      preps.forEach(p => {
        const setup = setups.find(s => s.location_id === locId && s.item_type === 'prep' && s.item_id === p.id)
        const itemMovs = movements.filter(mov => mov.location_id === locId && mov.item_type === 'prep' && mov.item_id === p.id)
        const qty = itemMovs.reduce((acc, mov) => acc + Number(mov.qty_base || 0), 0)

        const isTraced = setup?.track_inventory ?? false
        if (isTraced) {
          tracedCount++
          const unitCost = Number(p.cost_per_unit_vnd || 0)
          totalValue += qty * unitCost

          const minStock = setup?.min_stock ?? 0
          if (qty < 0) {
            negativeStock++
            alertItemsList.push({
              id: p.id,
              name: p.name,
              type: 'prep',
              current_qty: qty,
              uom: p.uom?.name || 'gr',
              min_stock: minStock,
              location_name: locMap[locId] || '-',
              status: 'negative_stock',
            })
          } else if (qty <= minStock) {
            lowStock++
            alertItemsList.push({
              id: p.id,
              name: p.name,
              type: 'prep',
              current_qty: qty,
              uom: p.uom?.name || 'gr',
              min_stock: minStock,
              location_name: locMap[locId] || '-',
              status: 'low_stock',
            })
          }
        }
      })
    })

    return {
      kpis: {
        totalValueVnd: totalValue,
        tracedItemsCount: tracedCount,
        lowStockCount: lowStock,
        negativeStockCount: negativeStock,
        expiredValueVnd: expiredValue,
        nearExpiryValueVnd: nearExpiryValue,
      },
      alerts: alertItemsList.slice(0, 5), // Mostra al massimo 5 alert calcolati
      expiryAlerts: expiryAlertsList.slice(0, 5),
    }
  }, [materials, preps, setups, movements, locations, selectedLocId])

  // Calcola i 5 movimenti recenti
  const recentMovementsList = useMemo(() => {
    const locMap: Record<string, string> = {}
    locations.forEach(l => {
      locMap[l.id] = l.name
    })

    let filtered = movements
    if (selectedLocId !== 'all') {
      filtered = movements.filter(m => m.location_id === selectedLocId)
    } else if (branchId && branchId !== 'all') {
      const allowedLocIds = locations.map(l => l.id)
      filtered = movements.filter(m => allowedLocIds.includes(m.location_id))
    }

    return filtered.slice(0, 5).map(m => {
      const itemInfo = m.item_type === 'material'
        ? materials.find(x => x.id === m.item_id)
        : preps.find(x => x.id === m.item_id)

      return {
        id: m.location_id + m.item_id + m.created_at,
        item_name: itemInfo ? itemInfo.name : `ID: ${m.item_id.slice(0, 8)}`,
        location_name: locMap[m.location_id] || '-',
        movement_type: m.movement_type,
        qty_base: Number(m.qty_base),
        uom_base: m.uom_base,
        created_at: m.created_at,
      }
    })
  }, [movements, materials, preps, locations, selectedLocId])

  const filteredProductions = useMemo(() => {
    let filtered = productions
    if (selectedLocId !== 'all') {
      filtered = productions.filter(p => p.location_id === selectedLocId)
    } else if (branchId && branchId !== 'all') {
      const allowedLocIds = locations.map(l => l.id)
      filtered = productions.filter(p => allowedLocIds.includes(p.location_id))
    }
    return filtered.slice(0, 5)
  }, [productions, selectedLocId, branchId, locations])

  const movementTypeLabel = (type: string) => {
    switch (type) {
      case 'opening_balance':
        return language === 'vi' ? 'Số dư đầu' : 'Opening Bal.'
      case 'manual_receipt':
        return language === 'vi' ? 'Nhập thủ công' : 'Manual Receipt'
      case 'positive_adjustment':
        return language === 'vi' ? 'Điều chỉnh +' : 'Pos. Adj'
      case 'negative_adjustment':
        return language === 'vi' ? 'Điều chỉnh -' : 'Neg. Adj'
      case 'production_consumption':
        return language === 'vi' ? 'Hao hụt bếp' : 'Prod. Consump.'
      case 'production_output':
        return language === 'vi' ? 'Thành phẩm bếp' : 'Prod. Output'
      case 'stock_count_adjustment':
        return language === 'vi' ? 'Lệch kiểm kê' : 'Count Adj'
      default:
        return type
    }
  }

  if (loading) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <CircularLoader />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header e Selezione Location */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t(language, 'StorehouseDashboard')}</h1>
          <p className="text-sm text-slate-500">
            {language === 'vi'
              ? 'Tổng quan nhanh về tình hình tồn kho và logistica chi nhánh'
              : 'Quick status of stock value, shortage alerts, and logistics logs'}
          </p>
        </div>

        {/* Dropdown Location */}
        {branchId === 'all' && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {language === 'vi' ? 'Lọc chi nhánh' : 'Location'}:
            </label>
            <select
              value={selectedLocId}
              onChange={e => setSelectedLocId(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 h-11 text-sm font-semibold text-slate-700 bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 min-w-[200px]"
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

      {/* Grid delle Card KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {/* Valore Totale Stock */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <CurrencyDollarIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {language === 'vi' ? 'GIÁ TRỊ TỒN KHO' : 'STOCK VALUE'}
            </div>
            <div className="text-sm font-black text-gray-900">
              {metrics.kpis.totalValueVnd.toLocaleString()} <span className="text-[10px] font-semibold text-slate-400">VND</span>
            </div>
          </div>
        </div>

        {/* Articoli Tracciati */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <CircleStackIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {language === 'vi' ? 'SẢN PHẨM TRẮC TRUNG' : 'TRACED ITEMS'}
            </div>
            <div className="text-sm font-black text-gray-900">
              {metrics.kpis.tracedItemsCount} <span className="text-[10px] font-semibold text-slate-400">{language === 'vi' ? 'sản phẩm' : 'items'}</span>
            </div>
          </div>
        </div>

        {/* Sotto Scorta Minima */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-orange-50 rounded-xl text-orange-600">
            <ArrowTrendingDownIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {language === 'vi' ? 'SẮP HẾT HÀNG' : 'LOW STOCK'}
            </div>
            <div className="text-sm font-black text-gray-900">
              {metrics.kpis.lowStockCount} <span className="text-[10px] font-semibold text-slate-400">{language === 'vi' ? 'sản phẩm' : 'items'}</span>
            </div>
          </div>
        </div>

        {/* Stock Negativo */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
            <ExclamationTriangleIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {language === 'vi' ? 'TỒN KHO ÂM' : 'NEGATIVE STOCK'}
            </div>
            <div className="text-sm font-black text-gray-900">
              {metrics.kpis.negativeStockCount} <span className="text-[10px] font-semibold text-slate-400">{language === 'vi' ? 'mặt hàng' : 'items'}</span>
            </div>
          </div>
        </div>

        {/* Valore Scaduto */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-red-50 rounded-xl text-red-650">
            <ExclamationTriangleIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {language === 'vi' ? 'GIÁ TRỊ HẾT HẠN' : 'EXPIRED VALUE'}
            </div>
            <div className="text-sm font-black text-red-650">
              {metrics.kpis.expiredValueVnd.toLocaleString()} <span className="text-[10px] font-semibold text-slate-400">VND</span>
            </div>
          </div>
        </div>

        {/* Valore in scadenza */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <ExclamationTriangleIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {language === 'vi' ? 'CẬN HẠN SỬ DỤNG' : 'NEAR EXPIRY'}
            </div>
            <div className="text-sm font-black text-amber-600">
              {metrics.kpis.nearExpiryValueVnd.toLocaleString()} <span className="text-[10px] font-semibold text-slate-400">VND</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sezione Inferiore a 2 Colonne */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Colonne 1: Alert Tồn Kho */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 text-base">
              {language === 'vi' ? 'Cảnh báo tồn kho' : 'Stock Alerts'}
            </h3>
            <Link href="/storehouse/current-stock" className="text-xs font-bold text-blue-600 hover:text-blue-750">
              {language === 'vi' ? 'Xem tất cả' : 'View Current Stock'}
            </Link>
          </div>

          <div className="space-y-3">
            {metrics.alerts.length === 0 ? (
              <div className="text-center text-xs text-slate-400 italic py-6 font-semibold">
                {language === 'vi' ? 'Không có cảnh báo tồn kho nào' : 'All items are well stocked'}
              </div>
            ) : (
              metrics.alerts.map(item => (
                <div key={item.id + item.location_name} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-55/30 hover:bg-slate-50 transition-colors">
                  <div>
                    <div className="font-bold text-gray-900 text-sm">{item.name}</div>
                    <div className="text-[10px] text-slate-450 font-medium">
                      Location: {item.location_name} | Type: {item.type === 'material' ? 'Material' : 'Prep'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-black text-sm ${item.status === 'negative_stock' ? 'text-purple-700' : 'text-orange-600'}`}>
                      {item.current_qty.toLocaleString()} {item.uom}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Min: {item.min_stock} {item.uom}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Colonne 2: Giao dịch Gần đây */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 text-base">
              {language === 'vi' ? 'Giao dịch gần đây' : 'Recent Movements'}
            </h3>
            <Link href="/storehouse/stock-movements" className="text-xs font-bold text-blue-600 hover:text-blue-750">
              {language === 'vi' ? 'Lịch sử giao dịch' : 'Movement Ledger'}
            </Link>
          </div>

          <div className="space-y-3">
            {recentMovementsList.length === 0 ? (
              <div className="text-center text-xs text-slate-400 italic py-6 font-semibold">
                {language === 'vi' ? 'Chưa ghi nhận giao dịch nào' : 'No movements recorded yet'}
              </div>
            ) : (
              recentMovementsList.map(mov => {
                const isNeg = mov.qty_base < 0
                return (
                  <div key={mov.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-55/30 hover:bg-slate-50 transition-colors">
                    <div>
                      <div className="font-bold text-gray-900 text-sm truncate max-w-[240px]">{mov.item_name}</div>
                      <div className="text-[10px] text-slate-450 font-medium">
                        {mov.location_name} | {movementTypeLabel(mov.movement_type)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-black text-sm ${isNeg ? 'text-red-600' : 'text-green-700'}`}>
                        {mov.qty_base > 0 ? '+' : ''}{mov.qty_base.toLocaleString()} {mov.uom_base}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(mov.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Sezione Alert Scadenza Lotti */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-base">
            {language === 'vi' ? 'Cảnh báo hạn sử dụng lô' : 'Batch Expiry Alerts'}
          </h3>
          <Link href="/storehouse/current-stock" className="text-xs font-bold text-blue-600 hover:text-blue-750">
            {language === 'vi' ? 'Kiểm tra lô' : 'Inspect Batches'}
          </Link>
        </div>

        <div className="space-y-3">
          {metrics.expiryAlerts.length === 0 ? (
            <div className="text-center text-xs text-slate-400 italic py-6 font-semibold">
              {language === 'vi' ? 'Không có lô hàng nào hết hạn hoặc cận hạn' : 'No expired or near-expiry batches detected'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {metrics.expiryAlerts.map(alert => (
                <div key={alert.id} className={`p-4 rounded-2xl border flex flex-col justify-between h-full ${
                  alert.status === 'expired' 
                    ? 'bg-red-50/50 border-red-100 text-red-950' 
                    : 'bg-amber-50/50 border-amber-100 text-amber-950'
                }`}>
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-mono font-bold text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded-lg">
                        {alert.batch_code}
                      </span>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${
                        alert.status === 'expired' 
                          ? 'bg-red-100 border-red-200 text-red-700' 
                          : 'bg-amber-100 border-amber-200 text-amber-700'
                      }`}>
                        {alert.status === 'expired' ? 'Expired' : 'Near Exp'}
                      </span>
                    </div>
                    <h4 className="font-bold text-xs truncate" title={alert.item_name}>
                      {alert.item_name}
                    </h4>
                    <p className="text-[10px] text-slate-500 font-medium">
                      Location: {alert.location_name}
                    </p>
                  </div>
                  
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="text-[9px] text-slate-400 uppercase font-bold">Qty</div>
                      <div className="text-xs font-black">
                        {alert.current_qty?.toLocaleString()} {alert.uom}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-slate-400 uppercase font-bold">Exp Date</div>
                      <div className="text-xs font-bold text-slate-800">
                        {alert.expiry_date || 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Attività di Cucina Recenti */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
        <h3 className="font-bold text-gray-900 text-base">
          {language === 'vi' ? 'Hoạt động bếp gần đây' : 'Recent Kitchen Productions'}
        </h3>
        
        <div className="space-y-3">
          {filteredProductions.length === 0 ? (
            <div className="text-center text-xs text-slate-400 italic py-6 font-semibold">
              {language === 'vi' ? 'Chưa ghi nhận sản xuất bếp' : 'No recent kitchen production recorded'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredProductions.map(prod => (
                <div key={prod.id} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <div className="p-2.5 bg-pink-50 rounded-xl text-pink-600">
                    <ArrowPathIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-sm truncate max-w-[180px]">
                      {prod.prep_recipes?.name || '-'}
                    </div>
                    <div className="text-xs text-slate-650 font-black">
                      {prod.qty_actual.toLocaleString()}{' '}
                      <span className="text-[10px] text-slate-450 font-bold uppercase">
                        {prod.prep_recipes?.uom?.name || 'gr'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-450 font-semibold mt-0.5">
                      {new Date(prod.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function StorehouseOverviewPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-transparent">
        <CircularLoader />
      </div>
    }>
      <StorehouseOverviewContent />
    </Suspense>
  )
}
