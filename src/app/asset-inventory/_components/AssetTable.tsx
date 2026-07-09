'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Asset, calculateCurrentValue, getStatusColor, getConditionColor, getWarrantyStatus, getComputedCondition } from '../types'
import { useSettings } from '@/contexts/SettingsContext'
import {
    BarsArrowUpIcon,
    BarsArrowDownIcon,
    FunnelIcon,
    EllipsisVerticalIcon
} from '@heroicons/react/24/outline'

interface ColumnHeaderProps {
    colKey: string
    label: string
    sortCol: string
    sortAsc: boolean
    onSort: (key: string, asc: boolean) => void
    values: string[]
    activeFilter: Set<string> | null
    onFilter: (vals: Set<string> | null) => void
    onClear: () => void
    open: boolean
    onToggle: () => void
    onClose: () => void
    dict: {
        sortAsc: string
        sortDesc: string
        selectAll: string
        deselectAll: string
        filterPlaceholder: string
        clearFilters: string
    }
    right?: boolean
    center?: boolean
    className?: string
}

function ColumnHeader({
    colKey,
    label,
    sortCol,
    sortAsc,
    onSort,
    values,
    activeFilter,
    onFilter,
    onClear,
    open,
    onToggle,
    onClose,
    dict,
    right,
    center,
    className = '',
}: ColumnHeaderProps) {
    const ref = useRef<HTMLTableCellElement>(null)
    const [filterSearch, setFilterSearch] = useState('')
    const [localChecked, setLocalChecked] = useState<Set<string>>(new Set(values))

    useEffect(() => {
        if (open) {
            setLocalChecked(activeFilter ? new Set(activeFilter) : new Set(values))
            setFilterSearch('')
        }
    }, [open, values, activeFilter])

    useEffect(() => {
        if (!open) return
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose()
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [open, onClose])

    const isActive = sortCol === colKey
    const hasFilter = !!activeFilter
    const dropdownStyle = useMemo(() => {
        if (!open || !ref.current) return undefined
        const rect = ref.current.getBoundingClientRect()
        return { top: rect.bottom + window.scrollY + 4, left: right ? Math.max(0, rect.right - 220) : rect.left }
    }, [open, right])

    const filteredValues = filterSearch
        ? values.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
        : values

    const allVisibleChecked = filteredValues.length > 0 && filteredValues.every(v => localChecked.has(v))

    function toggleAll() {
        const next = new Set(localChecked)
        if (allVisibleChecked) {
            filteredValues.forEach(v => next.delete(v))
        } else {
            filteredValues.forEach(v => next.add(v))
        }
        setLocalChecked(next)
    }

    function toggleOne(v: string) {
        const next = new Set(localChecked)
        if (next.has(v)) next.delete(v); else next.add(v)
        setLocalChecked(next)
    }

    function handleApply() {
        let finalChecked = localChecked
        if (filterSearch) {
            finalChecked = new Set([...localChecked].filter(x => filteredValues.includes(x)))
        }
        if (finalChecked.size >= values.length) onFilter(null); else onFilter(finalChecked)
    }

    return (
        <th className={`p-2 ${right ? 'text-right' : ''} ${className} relative`} ref={ref}>
            <div className={`flex items-center gap-1 font-semibold ${center ? 'justify-center' : right ? 'justify-end' : 'justify-start'}`}>
                <span className="select-none">{label}</span>
                {isActive && (
                    sortAsc ? (
                        <BarsArrowUpIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                    ) : (
                        <BarsArrowDownIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                    )
                )}
                {hasFilter && <FunnelIcon className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
                <button
                    type="button"
                    onClick={e => {
                        e.stopPropagation()
                        onToggle()
                    }}
                    className="ml-0.5 p-0.5 rounded hover:bg-gray-200 transition-colors flex-shrink-0 cursor-pointer"
                    aria-label={`Menu ${label}`}
                >
                    <EllipsisVerticalIcon className="w-3.5 h-3.5 text-gray-500" />
                </button>
            </div>

            {open && dropdownStyle && (
                <div
                    className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700 normal-case"
                    style={dropdownStyle}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="px-3 py-2 space-y-1">
                        <button
                            type="button"
                            onClick={() => onSort(colKey, true)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${
                                isActive && sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'
                            }`}
                        >
                            <BarsArrowUpIcon className="w-4 h-4" />
                            {dict.sortAsc}
                        </button>
                        <button
                            type="button"
                            onClick={() => onSort(colKey, false)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer text-left ${
                                isActive && !sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'
                            }`}
                        >
                            <BarsArrowDownIcon className="w-4 h-4" />
                            {dict.sortDesc}
                        </button>
                    </div>

                    <div className="border-t border-gray-200" />

                    <div className="px-3 py-2">
                        <input
                            type="text"
                            value={filterSearch}
                            onChange={e => setFilterSearch(e.target.value)}
                            placeholder={dict.filterPlaceholder}
                            className="w-full mb-2 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <button
                            type="button"
                            onClick={toggleAll}
                            className="text-xs text-blue-600 hover:text-blue-800 mb-1 cursor-pointer font-medium"
                        >
                            {allVisibleChecked ? dict.deselectAll : dict.selectAll}
                        </button>
                        <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                            {filteredValues.map(v => (
                                <label key={v} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={localChecked.has(v)}
                                        onChange={() => toggleOne(v)}
                                        className="accent-blue-600 rounded"
                                    />
                                    <span className="truncate text-xs">{v || '(Empty)'}</span>
                                </label>
                            ))}
                            {filteredValues.length === 0 && (
                                <div className="text-xs text-gray-400 py-1 text-center">—</div>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={onClear}
                            className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer font-medium"
                        >
                            {dict.clearFilters}
                        </button>
                        <button
                            type="button"
                            onClick={handleApply}
                            className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer font-medium"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </th>
    )
}

function WarrantyBadge({ asset }: { asset: Asset }) {
    const w = getWarrantyStatus(asset)
    if (w.status === 'None') return <span className="text-gray-400 text-xs">-</span>

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${w.color}`}>
            {w.label}
        </span>
    )
}

type Props = {
    assets: Asset[]
    onAssetClick: (asset: Asset) => void
}

const ConditionBar = ({ asset, duration }: { asset: Asset; duration: number }) => {
    const computedCondition = getComputedCondition(asset, duration)
    const color = getConditionColor(computedCondition)

    const width =
        computedCondition === 'new' ? 'w-full' :
            computedCondition === 'good' ? 'w-3/4' :
                computedCondition === 'fair' ? 'w-1/2' : 'w-1/4'

    return (
        <div className="w-24 bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div className={`h-full rounded-full ${color} ${width}`} />
        </div>
    )
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)

export default function AssetTable({ assets, onAssetClick }: Props) {
    const { language } = useSettings()
    const [durationMonths, setDurationMonths] = useState(6)

    useEffect(() => {
        const stored = localStorage.getItem('asset_new_duration_months')
        if (stored) setDurationMonths(Number(stored))
    }, [])

    const [sortCol, setSortCol] = useState<string>('name')
    const [sortAsc, setSortAsc] = useState<boolean>(true)
    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({})
    const [openMenu, setOpenMenu] = useState<string | null>(null)

    const displayValue = (asset: Asset, colKey: string) => {
        switch (colKey) {
            case 'name': return asset.name || ''
            case 'sku': return asset.sku || ''
            case 'category': return asset.category || ''
            case 'status': return asset.status || ''
            case 'condition': return getComputedCondition(asset, durationMonths) || ''
            case 'warranty': return getWarrantyStatus(asset).label || ''
            case 'quantity': return String(asset.quantity || 1)
            case 'value': return fmt(calculateCurrentValue(asset))
            default: return ''
        }
    }

    const filteredAssets = useMemo(() => {
        let r = [...assets]
        Object.entries(columnFilters).forEach(([colKey, set]) => {
            if (!set) return
            r = r.filter(asset => {
                const val = displayValue(asset, colKey)
                return set.has(val)
            })
        })
        return r
    }, [assets, columnFilters, durationMonths])

    const sortedAssets = useMemo(() => {
        const r = [...filteredAssets]
        r.sort((a, b) => {
            if (sortCol === 'quantity') {
                const qtyA = a.quantity || 1
                const qtyB = b.quantity || 1
                return sortAsc ? qtyA - qtyB : qtyB - qtyA
            }
            if (sortCol === 'value') {
                const valA = calculateCurrentValue(a) * (a.type === 'smallware' ? (a.quantity || 1) : 1)
                const valB = calculateCurrentValue(b) * (b.type === 'smallware' ? (b.quantity || 1) : 1)
                return sortAsc ? valA - valB : valB - valA
            }
            const valA = String(displayValue(a, sortCol)).toLowerCase()
            const valB = String(displayValue(b, sortCol)).toLowerCase()
            if (valA < valB) return sortAsc ? -1 : 1
            if (valA > valB) return sortAsc ? 1 : -1
            return 0
        })
        return r
    }, [filteredAssets, sortCol, sortAsc, durationMonths])

    const handleFilter = (colKey: string, set: Set<string> | null) => {
        setColumnFilters(prev => ({ ...prev, [colKey]: set }))
        setOpenMenu(null)
    }

    const handleSort = (colKey: string, asc: boolean) => {
        setSortCol(colKey)
        setSortAsc(asc)
        setOpenMenu(null)
    }

    const dict = {
        sortAsc: language === 'vi' ? 'Sắp xếp tăng dần' : 'Sort Ascending',
        sortDesc: language === 'vi' ? 'Sắp xếp giảm dần' : 'Sort Descending',
        selectAll: language === 'vi' ? 'Chọn tất cả' : 'Select All',
        deselectAll: language === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect All',
        filterPlaceholder: language === 'vi' ? 'Lọc...' : 'Filter...',
        clearFilters: language === 'vi' ? 'Xóa bộ lọc' : 'Clear Filters',
    }

    const getValuesForCol = (colKey: string) => {
        const unique = new Set(assets.map(a => displayValue(a, colKey)))
        return Array.from(unique).sort()
    }

    const emptyText = language === 'vi' ? 'Không tìm thấy tài sản nào.' : 'No assets found.'

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-100 text-xs uppercase font-semibold text-slate-500">
                    <tr>
                        <ColumnHeader
                            colKey="name"
                            label={language === 'vi' ? 'Tên tài sản' : 'Asset Name'}
                            sortCol={sortCol}
                            sortAsc={sortAsc}
                            onSort={handleSort}
                            values={getValuesForCol('name')}
                            activeFilter={columnFilters['name'] || null}
                            onFilter={(set) => handleFilter('name', set)}
                            onClear={() => handleFilter('name', null)}
                            open={openMenu === 'name'}
                            onToggle={() => setOpenMenu(openMenu === 'name' ? null : 'name')}
                            onClose={() => setOpenMenu(null)}
                            dict={dict}
                            className="px-6 py-4"
                        />
                        <ColumnHeader
                            colKey="sku"
                            label="SKU"
                            sortCol={sortCol}
                            sortAsc={sortAsc}
                            onSort={handleSort}
                            values={getValuesForCol('sku')}
                            activeFilter={columnFilters['sku'] || null}
                            onFilter={(set) => handleFilter('sku', set)}
                            onClear={() => handleFilter('sku', null)}
                            open={openMenu === 'sku'}
                            onToggle={() => setOpenMenu(openMenu === 'sku' ? null : 'sku')}
                            onClose={() => setOpenMenu(null)}
                            dict={dict}
                            className="px-6 py-4"
                        />
                        <ColumnHeader
                            colKey="category"
                            label={language === 'vi' ? 'Danh mục' : 'Category'}
                            sortCol={sortCol}
                            sortAsc={sortAsc}
                            onSort={handleSort}
                            values={getValuesForCol('category')}
                            activeFilter={columnFilters['category'] || null}
                            onFilter={(set) => handleFilter('category', set)}
                            onClear={() => handleFilter('category', null)}
                            open={openMenu === 'category'}
                            onToggle={() => setOpenMenu(openMenu === 'category' ? null : 'category')}
                            onClose={() => setOpenMenu(null)}
                            dict={dict}
                            className="px-6 py-4"
                        />
                        <ColumnHeader
                            colKey="status"
                            label={language === 'vi' ? 'Trạng thái' : 'Status'}
                            sortCol={sortCol}
                            sortAsc={sortAsc}
                            onSort={handleSort}
                            values={getValuesForCol('status')}
                            activeFilter={columnFilters['status'] || null}
                            onFilter={(set) => handleFilter('status', set)}
                            onClear={() => handleFilter('status', null)}
                            open={openMenu === 'status'}
                            onToggle={() => setOpenMenu(openMenu === 'status' ? null : 'status')}
                            onClose={() => setOpenMenu(null)}
                            dict={dict}
                            className="px-6 py-4"
                        />
                        <ColumnHeader
                            colKey="condition"
                            label={language === 'vi' ? 'Tình trạng' : 'Condition'}
                            sortCol={sortCol}
                            sortAsc={sortAsc}
                            onSort={handleSort}
                            values={getValuesForCol('condition')}
                            activeFilter={columnFilters['condition'] || null}
                            onFilter={(set) => handleFilter('condition', set)}
                            onClear={() => handleFilter('condition', null)}
                            open={openMenu === 'condition'}
                            onToggle={() => setOpenMenu(openMenu === 'condition' ? null : 'condition')}
                            onClose={() => setOpenMenu(null)}
                            dict={dict}
                            className="px-6 py-4"
                        />
                        <ColumnHeader
                            colKey="warranty"
                            label={language === 'vi' ? 'Bảo hành' : 'Warranty'}
                            sortCol={sortCol}
                            sortAsc={sortAsc}
                            onSort={handleSort}
                            values={getValuesForCol('warranty')}
                            activeFilter={columnFilters['warranty'] || null}
                            onFilter={(set) => handleFilter('warranty', set)}
                            onClear={() => handleFilter('warranty', null)}
                            open={openMenu === 'warranty'}
                            onToggle={() => setOpenMenu(openMenu === 'warranty' ? null : 'warranty')}
                            onClose={() => setOpenMenu(null)}
                            dict={dict}
                            className="px-6 py-4"
                        />
                        <ColumnHeader
                            colKey="quantity"
                            label={language === 'vi' ? 'SL' : 'Qty'}
                            sortCol={sortCol}
                            sortAsc={sortAsc}
                            onSort={handleSort}
                            values={getValuesForCol('quantity')}
                            activeFilter={columnFilters['quantity'] || null}
                            onFilter={(set) => handleFilter('quantity', set)}
                            onClear={() => handleFilter('quantity', null)}
                            open={openMenu === 'quantity'}
                            onToggle={() => setOpenMenu(openMenu === 'quantity' ? null : 'quantity')}
                            onClose={() => setOpenMenu(null)}
                            dict={dict}
                            center
                            className="px-6 py-4 text-center"
                        />
                        <ColumnHeader
                            colKey="value"
                            label={language === 'vi' ? 'Giá trị' : 'Value'}
                            sortCol={sortCol}
                            sortAsc={sortAsc}
                            onSort={handleSort}
                            values={getValuesForCol('value')}
                            activeFilter={columnFilters['value'] || null}
                            onFilter={(set) => handleFilter('value', set)}
                            onClear={() => handleFilter('value', null)}
                            open={openMenu === 'value'}
                            onToggle={() => setOpenMenu(openMenu === 'value' ? null : 'value')}
                            onClose={() => setOpenMenu(null)}
                            dict={dict}
                            right
                            className="px-6 py-4 text-right"
                        />
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {sortedAssets.length === 0 ? (
                        <tr>
                            <td colSpan={8} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                                {emptyText}
                            </td>
                        </tr>
                    ) : (
                        sortedAssets.map((asset) => (
                            <tr
                                key={asset.id}
                                onClick={() => onAssetClick(asset)}
                                className="hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                                <td className="px-6 py-3 font-medium text-slate-900">{asset.name}</td>
                                <td className="px-6 py-3">{asset.sku}</td>
                                <td className="px-6 py-3">{asset.category}</td>
                                <td className="px-6 py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(asset.status)}`}>
                                        {asset.status.replaceAll('_', ' ')}
                                    </span>
                                </td>
                                <td className="px-6 py-3">
                                    <ConditionBar asset={asset} duration={durationMonths} />
                                </td>
                                <td className="px-6 py-3">
                                    <WarrantyBadge asset={asset} />
                                </td>
                                <td className={`px-6 py-3 text-center font-medium ${asset.parLevel && (asset.quantity || 0) < asset.parLevel ? 'text-red-600' : 'text-slate-700'}`}>
                                    {asset.quantity || 1}
                                    {asset.parLevel ? <span className="text-slate-400 font-normal"> / {asset.parLevel}</span> : ''}
                                </td>
                                <td className="px-6 py-3 text-right font-medium text-slate-900">
                                    {fmt(calculateCurrentValue(asset) * (asset.type === 'smallware' ? (asset.quantity || 1) : 1))}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    )
}
