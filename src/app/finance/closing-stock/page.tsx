'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { Save, AlertCircle, Download, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import MonthPicker from '@/components/MonthPicker'
import CircularLoader from '@/components/CircularLoader'
import { t } from '@/lib/i18n'

function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }
function formatMonthLabel(d: Date, language: string) { return d.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' }) }

export interface InventoryRecord {
    id?: string;
    month_key: string;
    branch_id: string;
    item_type: 'material' | 'prep_recipe' | 'final_recipe';
    item_id: string;
    name: string;
    brand?: string | null;
    uom: string | null;
    qty: number;
    unit_cost: number;
    total_value: number;
    _isNew?: boolean;
    _hasError?: boolean;
}

export default function FinanceClosingStockPage() {
    const { currency, language } = useSettings()
    
    // Auth & Role
    const [authLoaded, setAuthLoaded] = useState(false)
    const [role, setRole] = useState<string | null>(null)

    // Data state
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    
    const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
    const monthInputValue = useMemo(() => toMonthInputValue(monthCursor), [monthCursor])

    const [branchFilter, setBranchFilter] = useState<string>('')
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    
    const [records, setRecords] = useState<InventoryRecord[]>([])
    
    // Costing data cache for Pre-load
    const [costingData, setCostingData] = useState<{
        materials: any[],
        prep: any[],
        final: any[],
        uoms: any[]
    } | null>(null)

    useEffect(() => {
        async function loadRole() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { setAuthLoaded(true); return }
            const { data } = await supabase
                .from('app_accounts')
                .select('role')
                .eq('email', user.email ?? '')
                .eq('is_active', true)
                .maybeSingle()
            setRole(data?.role ?? null)
            setAuthLoaded(true)
        }
        loadRole()
    }, [])

    // Load Branches & Costing Data once
    useEffect(() => {
        if (!authLoaded) return
        if (role !== 'owner' && role !== 'accountant') return;

        async function loadInitial() {
            const [brRes, uomRes, matRes, prepRes, finalRes, finalVwRes] = await Promise.all([
                supabase.from('provider_branches').select('id, name').order('name'),
                supabase.from('uom').select('id, name'),
                supabase.from('materials').select('id, name, brand, unit_cost, uom_id').is('deleted_at', null),
                supabase.from('prep_recipes').select('id, name, cost_per_unit_vnd, uom_id').is('deleted_at', null).is('archived_at', null),
                supabase.from('final_recipes').select('id, name, cost_per_unit_vnd').is('deleted_at', null).is('archived_at', null),
                supabase.from('final_list_vw').select('id, cost_unit_vnd')
            ])

            if (brRes.data) {
                setBranches(brRes.data)
                if (brRes.data.length > 0) setBranchFilter(brRes.data[0].id)
            }
            
            const finalWithCosts = finalRes.data?.map(f => {
                const vwCost = finalVwRes.data?.find(v => v.id === f.id)?.cost_unit_vnd || 0;
                return { ...f, cost_per_unit_vnd: vwCost };
            }) || []

            setCostingData({
                uoms: uomRes.data || [],
                materials: matRes.data || [],
                prep: prepRes.data || [],
                final: finalWithCosts
            })
        }
        loadInitial()
    }, [authLoaded, role])

    // Load Inventory Records and Auto-Merge Costing Data
    useEffect(() => {
        if (!authLoaded || !branchFilter || !costingData) {
            setRecords([])
            if (!branchFilter) setLoading(false)
            return
        }

        async function fetchRecords() {
            setLoading(true)
            const { data } = await supabase
                .from('fin_inventory_records')
                .select('*')
                .eq('month_key', monthInputValue)
                .eq('branch_id', branchFilter)

            const dbRecords: InventoryRecord[] = data || []
            const newRecords: InventoryRecord[] = dbRecords.map(r => {
                let brand: string | null = null
                if (r.item_type === 'material') {
                    brand = costingData!.materials.find(m => m.id === r.item_id)?.brand || null
                }
                return { ...r, brand }
            })

            const getUomName = (uomId: number | null) => {
                if (!uomId) return null
                return costingData!.uoms.find(u => u.id === uomId)?.name || null
            }

            // Auto-preload missing items
            const addIfNotExists = (type: 'material'|'prep_recipe'|'final_recipe', item: any, costField: string, uomField?: string) => {
                const exists = newRecords.find(r => r.item_type === type && r.item_id === item.id)
                if (!exists) {
                    const cost = Number(item[costField] || 0)
                    newRecords.push({
                        month_key: monthInputValue,
                        branch_id: branchFilter,
                        item_type: type,
                        item_id: item.id,
                        name: item.name,
                        brand: type === 'material' ? item.brand : null,
                        uom: type === 'final_recipe' ? 'unit' : (uomField ? getUomName(item[uomField]) : null),
                        qty: 0,
                        unit_cost: cost,
                        total_value: 0,
                        _isNew: true,
                        _hasError: cost <= 0
                    })
                }
            }

            costingData!.materials.forEach(m => addIfNotExists('material', m, 'unit_cost', 'uom_id'))
            costingData!.prep.forEach(p => addIfNotExists('prep_recipe', p, 'cost_per_unit_vnd', 'uom_id'))
            costingData!.final.forEach(f => addIfNotExists('final_recipe', f, 'cost_per_unit_vnd'))

            const orderMap: Record<string, number> = {
                'material': 1,
                'prep_recipe': 2,
                'final_recipe': 3
            }

            newRecords.sort((a, b) => {
                const orderA = orderMap[a.item_type] || 99
                const orderB = orderMap[b.item_type] || 99
                if (orderA !== orderB) return orderA - orderB
                return (a.name || '').localeCompare(b.name || '')
            })

            setRecords(newRecords)
            setLoading(false)
        }
        fetchRecords()
    }, [monthInputValue, branchFilter, authLoaded, costingData])

    const handleQtyChange = (index: number, val: string) => {
        const num = parseFloat(val) || 0
        const newRecs = [...records]
        newRecs[index].qty = num
        newRecs[index].total_value = num * newRecs[index].unit_cost
        setRecords(newRecs)
    }

    const handleSaveAll = async () => {
        // Prevent saving items with cost 0
        const hasErrors = records.some(r => (r.unit_cost || 0) <= 0)
        if (hasErrors) {
            alert(t(language, 'FinCSAlertMissingCost'))
            return
        }

        setSaving(true)
        try {
            const payload = records.map(r => ({
                month_key: r.month_key,
                branch_id: r.branch_id,
                item_type: r.item_type,
                item_id: r.item_id,
                name: r.name,
                uom: r.uom,
                qty: r.qty,
                unit_cost: r.unit_cost,
                total_value: r.total_value,
                updated_at: new Date().toISOString()
            }))
            
            const { error } = await supabase
                .from('fin_inventory_records')
                .upsert(payload, { onConflict: 'month_key, branch_id, item_type, item_id' })
                
            if (error) throw error
            alert(t(language, 'FinCSSavedSuccess'))
            
            // Reload from DB to get IDs
            const { data } = await supabase
                .from('fin_inventory_records')
                .select('*')
                .eq('month_key', monthInputValue)
                .eq('branch_id', branchFilter)
            setRecords(data || [])
            
        } catch (err: any) {
            alert(t(language, 'FinCSSaveError') + err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleExportExcel = async () => {
        const branchName = branches.find(b => b.id === branchFilter)?.name || 'Unknown Branch'
        const monthName = formatMonthLabel(monthCursor, language)
        
        const ExcelJS = (await import('exceljs')).default
        const wb = new ExcelJS.Workbook()
        const ws = wb.addWorksheet('Stock Template')

        // Title Row
        ws.mergeCells('A1:E1')
        const titleCell = ws.getCell('A1')
        titleCell.value = `${t(language, 'FinCSExportTemplate')} - ${branchName} - ${monthName}`
        titleCell.font = { bold: true, size: 16 }
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }
        ws.getRow(1).height = 30

        // Header Row
        const headers = [t(language, 'FinCSColType'), t(language, 'FinCSColItemName'), t(language, 'FinCSColBrand'), t(language, 'FinCSColQty'), t(language, 'FinCSColTotalValue')]
        ws.addRow(headers)
        const headerRow = ws.getRow(2)
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
        headerRow.height = 20
        headers.forEach((_, i) => {
            const cell = headerRow.getCell(i + 1)
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } }
            cell.border = {
                top: { style: 'thin' }, left: { style: 'thin' },
                bottom: { style: 'thin' }, right: { style: 'thin' }
            }
        })

        // Column Widths
        ws.getColumn(1).width = 15 // Type
        ws.getColumn(2).width = 40 // Item Name
        ws.getColumn(3).width = 20 // Brand
        ws.getColumn(4).width = 10 // UOM
        ws.getColumn(5).width = 20 // Counted Qty

        // Data Rows
        records.forEach(r => {
            const typeLabel = (r.item_type || '').replace('_', ' ').toUpperCase()
            const row = ws.addRow([
                typeLabel,
                r.name,
                r.brand || '-',
                r.uom || '-',
                '' // Empty for manual counting
            ])
            
            row.eachCell({ includeEmpty: true }, cell => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
                }
                cell.alignment = { vertical: 'middle' }
            })
            // Center align Type and UOM
            row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
            row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' }
            // Ensure the input column has a thick border to make it obvious
            row.getCell(5).border = {
                top: { style: 'thin' }, left: { style: 'thin' },
                bottom: { style: 'thin' }, right: { style: 'thin' }
            }
        })

        // Download
        const buffer = await wb.xlsx.writeBuffer()
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Stock_Template_${branchName.replace(/\s+/g, '_')}_${monthInputValue}.xlsx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    if (!authLoaded) return <div className="p-10 flex justify-center"><CircularLoader /></div>
    if (role !== 'owner' && role !== 'accountant') {
        return <div className="p-10 text-center text-slate-500">{t(language, 'FinCSAccessDenied')}</div>
    }

    const totalValue = records.reduce((acc, r) => acc + (r.total_value || 0), 0)
    const totalItemsCount = records.length
    const missingCostCount = records.filter(r => r.unit_cost <= 0).length

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'FinCSTitle')}</h1>
                    <p className="text-slate-500 mt-1">{t(language, 'FinCSSubtitle')}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Branch Filter */}
                    <div className="relative">
                        <select
                            value={branchFilter}
                            onChange={e => setBranchFilter(e.target.value)}
                            className="appearance-none pl-4 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="" disabled>{t(language, 'FinCSSelectBranch')}</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                </div>
            </div>


            {!branchFilter ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-slate-500 font-medium">{t(language, 'FinCSSelectBranchWarning')}</p>
                </div>
            ) : loading ? (
                <div className="flex justify-center py-20"><CircularLoader /></div>
            ) : (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                                <span className="text-xl font-bold text-blue-700">Σ</span>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">{t(language, 'FinCSTotalValue')}</p>
                                <p className="text-2xl font-black text-slate-900 mt-0.5">{fmt(totalValue)} <span className="text-lg text-slate-500 font-bold">{currency}</span></p>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                                <Package className="w-6 h-6 text-slate-700" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">{t(language, 'FinCSTotalItems')}</p>
                                <p className="text-2xl font-black text-slate-900 mt-0.5">{fmt(totalItemsCount)}</p>
                            </div>
                        </div>

                        <div className={`rounded-2xl p-5 border shadow-sm flex items-center gap-4 ${missingCostCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${missingCostCount > 0 ? 'bg-red-100' : 'bg-emerald-100'}`}>
                                {missingCostCount > 0 ? <AlertCircle className="w-6 h-6 text-red-600" /> : <span className="text-xl font-bold text-emerald-700">✓</span>}
                            </div>
                            <div>
                                <p className={`text-sm font-medium uppercase tracking-wider ${missingCostCount > 0 ? 'text-red-700' : 'text-slate-500'}`}>{t(language, 'FinCSMissingCost')}</p>
                                <p className={`text-2xl font-black mt-0.5 ${missingCostCount > 0 ? 'text-red-700' : 'text-slate-900'}`}>{fmt(missingCostCount)}</p>
                            </div>
                        </div>
                    </div>

                    <MonthPicker
                        value={monthInputValue}
                        onChange={(val) => setMonthCursor(fromMonthInputValue(val))}
                        language={language}
                        colorClass="text-blue-600 hover:text-blue-800"
                        className="mb-4 mt-6"
                    />

                    {/* Main Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                            <h2 className="font-bold text-slate-800">{t(language, 'FinCSStockItems')}</h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleExportExcel}
                                    className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-bold transition flex items-center shadow-sm"
                                >
                                    <Download className="w-4 h-4 mr-2" /> {t(language, 'FinCSExportTemplate')}
                                </button>
                                <button
                                    onClick={handleSaveAll}
                                    disabled={saving}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition flex items-center shadow-sm disabled:opacity-50"
                                >
                                    <Save className="w-4 h-4 mr-2" /> {saving ? t(language, 'Saving') : t(language, 'FinCSSaveAll')}
                                </button>
                            </div>
                        </div>

                        {records.length === 0 ? (
                            <div className="text-center py-16 text-slate-500">
                                <p>{t(language, 'FinCSNoItems')}</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">{t(language, 'FinCSColType')}</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">{t(language, 'FinCSColItemName')}</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">{t(language, 'FinCSColBrand')}</th>
                                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase">{t(language, 'FinCSColUnitCost')}</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">{t(language, 'FinCSColQty')}</th>
                                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase">{t(language, 'FinCSColTotalValue')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {records.map((r, i) => {
                                            const hasError = (r.unit_cost || 0) <= 0
                                            return (
                                                <tr key={r.id || `${r.item_type}-${r.item_id}`} className={`hover:bg-slate-50 ${hasError ? 'bg-red-50/50' : ''}`}>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                            r.item_type === 'material' ? 'bg-amber-100 text-amber-800' :
                                                            r.item_type === 'prep_recipe' ? 'bg-cyan-100 text-cyan-800' :
                                                            'bg-emerald-100 text-emerald-800'
                                                        }`}>
                                                            {t(language, r.item_type as any) || (r.item_type || '').replace('_', ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                                                            {r.name}
                                                            {hasError && (
                                                                <span className="text-red-500 flex items-center gap-1 text-[10px] bg-red-100 px-1.5 py-0.5 rounded border border-red-200" title="Update cost in Costing module">
                                                                    <AlertCircle className="w-3 h-3" /> {t(language, 'FinCSCostMissing')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-slate-600">
                                                        {r.brand || '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-sm text-slate-500 font-mono">
                                                        {fmt(r.unit_cost)}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="any"
                                                                value={r.qty === 0 ? '' : r.qty}
                                                                onChange={e => handleQtyChange(i, e.target.value)}
                                                                disabled={hasError}
                                                                className="w-24 px-2 py-1.5 text-sm font-black text-center text-slate-900 bg-white border border-slate-400 shadow-inner rounded focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200"
                                                                placeholder="0"
                                                            />
                                                            <span className="text-xs text-slate-500 w-8 text-left">{r.uom || '-'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold text-slate-900 font-mono text-sm">
                                                        {fmt(r.total_value)}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
