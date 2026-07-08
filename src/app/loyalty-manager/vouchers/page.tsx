'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Plus, Search, Loader2, CheckCircle, XCircle, AlertCircle, Download, MoreVertical, Trash, ScanBarcode, Ticket, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import {
    BarsArrowUpIcon,
    BarsArrowDownIcon,
    FunnelIcon,
    EllipsisVerticalIcon,
} from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import CreateVoucherModal from './_components/CreateVoucherModal'
import VoucherDetailsModal from './_components/VoucherDetailsModal'
import { useSettings } from '@/contexts/SettingsContext'
import { getLoyaltyManagerDictionary } from '../_i18n'

type GiftVoucher = {
    id: string
    code: string
    value: number
    status: 'active' | 'redeemed' | 'expired' | 'blocked'
    issued_on: string
    expires_on: string | null
    donor_type: 'restaurant' | 'partner' | 'customer'
    donor_name: string | null
    notes: string | null
    created_at?: string
}

const textDict = {
    en: {
        sortAsc: 'Sort Ascending',
        sortDesc: 'Sort Descending',
        selectAll: 'Select All',
        deselectAll: 'Deselect All',
        filterPlaceholder: 'Search...',
        clearFilters: 'Clear',
        ok: 'OK',
        empty: '(Empty)',
    },
    vi: {
        sortAsc: 'Sắp xếp tăng dần',
        sortDesc: 'Sắp xếp giảm dần',
        selectAll: 'Chọn tất cả',
        deselectAll: 'Bỏ chọn tất cả',
        filterPlaceholder: 'Tìm kiếm...',
        clearFilters: 'Xoá bộ lọc',
        ok: 'Đồng ý',
        empty: '(Trống)',
    }
}

interface ColumnHeaderProps {
    colKey: string
    label: string
    sortCol: string
    sortAsc: boolean
    onSort: (key: any, asc: boolean) => void
    values: string[]
    activeFilter: Set<string> | null
    onFilter: (vals: Set<string> | null) => void
    onClear: () => void
    open: boolean
    onToggle: () => void
    onClose: () => void
    dict: typeof textDict.en
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
        <th className={`px-6 py-4 text-left text-slate-600 font-semibold ${right ? 'text-right' : ''} ${className} relative`} ref={ref}>
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
                    className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700 normal-case font-normal"
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
                                    <span className="truncate text-xs">{v || dict.empty}</span>
                                </label>
                            ))}
                            {filteredValues.length === 0 && (
                                <div className="text-xs text-gray-400 py-1 text-center">—</div>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-gray-200 border-solid px-3 py-2 flex items-center justify-between gap-2">
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

export default function VouchersPage() {
    const { language } = useSettings()
    const t = getLoyaltyManagerDictionary(language)

    const [vouchers, setVouchers] = useState<GiftVoucher[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [isScanModalOpen, setIsScanModalOpen] = useState(false)
    const [scanError, setScanError] = useState<string | null>(null)
    const [selectedVoucher, setSelectedVoucher] = useState<GiftVoucher | null>(null)
    const [voucherTerms, setVoucherTerms] = useState<string | null>(null)
    const [voucherHeader, setVoucherHeader] = useState<string | null>(null)

    const fetchVouchers = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('gift_vouchers')
            .select('*')
            .order('created_at', { ascending: false })

        if (!error && data) {
            setVouchers(data)
        }
        setLoading(false)
    }

    const fetchSettings = async () => {
        const { data } = await supabase
            .from('loyalty_settings')
            .select('voucher_terms, voucher_header')
            .single()

        if (data) {
            setVoucherTerms(data.voucher_terms)
            setVoucherHeader(data.voucher_header)
        }
    }

    useEffect(() => {
        fetchVouchers()
        fetchSettings()
    }, [])

    // Barcode Scanner Listener
    useEffect(() => {
        let buffer = ''
        let lastKeyTime = Date.now()

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isScanModalOpen) return

            const currentTime = Date.now()
            if (currentTime - lastKeyTime > 100) {
                buffer = ''
            }
            lastKeyTime = currentTime

            if (e.key === 'Enter') {
                if (buffer.length > 0) {
                    const voucher = vouchers.find(v => v.code === buffer)
                    if (voucher) {
                        setSelectedVoucher(voucher)
                        setSearch('')
                    }
                    buffer = ''
                }
            } else if (e.key.length === 1) {
                buffer += e.key
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [vouchers, isScanModalOpen])

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {t.vouchers.status.active}</span>
            case 'redeemed': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {t.vouchers.status.redeemed}</span>
            case 'expired': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200 flex items-center gap-1"><XCircle className="w-3 h-3" /> {t.vouchers.status.expired}</span>
            case 'blocked': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1"><XCircle className="w-3 h-3" /> {t.vouchers.status.blocked}</span>
            default: return null
        }
    }

    const langDict = language === 'vi' ? textDict.vi : textDict.en

    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({})
    const [openMenu, setOpenMenu] = useState<string | null>(null)
    const [sortCol, setSortCol] = useState<string>('issued_on')
    const [sortAsc, setSortAsc] = useState<boolean>(false)

    const applyColumnFilter = (colKey: string, vals: Set<string> | null) => {
        setColumnFilters(prev => ({ ...prev, [colKey]: vals }))
        setOpenMenu(null)
    }

    const handleSort = (colKey: string, asc: boolean) => {
        setSortCol(colKey)
        setSortAsc(asc)
    }

    const getColValue = (voucher: GiftVoucher, colKey: string): string => {
        switch (colKey) {
            case 'code':
                return voucher.code || ''
            case 'status':
                return voucher.status === 'active' ? t.vouchers.status.active :
                       voucher.status === 'redeemed' ? t.vouchers.status.redeemed :
                       voucher.status === 'expired' ? t.vouchers.status.expired :
                       voucher.status === 'blocked' ? t.vouchers.status.blocked : voucher.status || ''
            case 'donor': {
                let d: string = voucher.donor_type || ''
                if (voucher.donor_name) {
                    d = `${d} (${voucher.donor_name})`
                }
                return d
            }
            case 'issued_on':
                return voucher.issued_on ? format(new Date(voucher.issued_on), 'dd/MM/yyyy') : ''
            case 'expires_on':
                return voucher.expires_on ? format(new Date(voucher.expires_on), 'dd/MM/yyyy') : t.cards.table.never
            case 'value':
                return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(voucher.value)
            default:
                return ''
        }
    }

    const searchedVouchers = useMemo(() => {
        return vouchers.filter(v =>
            (v.code || '').toLowerCase().includes(search.toLowerCase()) ||
            (v.donor_name && v.donor_name.toLowerCase().includes(search.toLowerCase()))
        )
    }, [vouchers, search])

    const filteredVouchers = useMemo(() => {
        let list = [...searchedVouchers]
        Object.entries(columnFilters).forEach(([col, vals]) => {
            if (!vals) return
            list = list.filter(x => {
                const v = getColValue(x, col)
                return vals.has(v)
            })
        })
        return list
    }, [searchedVouchers, columnFilters])

    const sortedVouchers = useMemo(() => {
        const list = [...filteredVouchers]
        list.sort((a, b) => {
            const dir = sortAsc ? 1 : -1
            switch (sortCol) {
                case 'code':
                    return (a.code || '').localeCompare(b.code || '') * dir
                case 'status': {
                    const statusA = getColValue(a, 'status')
                    const statusB = getColValue(b, 'status')
                    return statusA.localeCompare(statusB) * dir
                }
                case 'donor': {
                    const donorA = getColValue(a, 'donor')
                    const donorB = getColValue(b, 'donor')
                    return donorA.localeCompare(donorB) * dir
                }
                case 'issued_on': {
                    const tIssuedA = a.issued_on ? new Date(a.issued_on).getTime() : 0
                    const tIssuedB = b.issued_on ? new Date(b.issued_on).getTime() : 0
                    return (tIssuedA - tIssuedB) * dir
                }
                case 'expires_on': {
                    const tExpiresA = a.expires_on ? new Date(a.expires_on).getTime() : 0
                    const tExpiresB = b.expires_on ? new Date(b.expires_on).getTime() : 0
                    return (tExpiresA - tExpiresB) * dir
                }
                case 'value':
                    return ((a.value || 0) - (b.value || 0)) * dir
                case 'issued_on':
                default: {
                    const tA = a.issued_on ? new Date(a.issued_on).getTime() : 0
                    const tB = b.issued_on ? new Date(b.issued_on).getTime() : 0
                    return (tA - tB) * dir
                }
            }
        })
        return list
    }, [filteredVouchers, sortCol, sortAsc])

    const [selectMode, setSelectMode] = useState(false)
    const [selected, setSelected] = useState<Record<string, boolean>>({})
    const [menuOpen, setMenuOpen] = useState(false)
    const [isExportModalOpen, setIsExportModalOpen] = useState(false)

    const selectedIds = Object.keys(selected).filter(id => selected[id])
    const allSelected = sortedVouchers.length > 0 && sortedVouchers.every(v => selected[v.id])

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelected({})
        } else {
            const newSelected: Record<string, boolean> = {}
            sortedVouchers.forEach(v => newSelected[v.id] = true)
            setSelected(newSelected)
        }
    }

    const toggleSelectRow = (id: string) => {
        setSelected(prev => ({
            ...prev,
            [id]: !prev[id]
        }))
    }

    const handleDeleteSelected = async () => {
        if (!confirm(t.vouchers.delete_selected_confirm.replace('{count}', selectedIds.length.toString()))) return

        setLoading(true)
        const { error } = await supabase
            .from('gift_vouchers')
            .delete()
            .in('id', selectedIds)

        if (error) {
            alert('Error deleting vouchers: ' + error.message)
        } else {
            setSelected({})
            setSelectMode(false)
            fetchVouchers()
        }
        setLoading(false)
    }

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                    {selectMode && (
                        <div className="relative">
                            <button
                                onClick={() => setMenuOpen(!menuOpen)}
                                className="p-0 h-auto w-auto bg-transparent border-0 outline-none text-blue-200 hover:text-white focus:outline-none"
                            >
                                <MoreVertical className="w-5 h-5" />
                            </button>
                            {menuOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                                    <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-20 overflow-hidden py-1">
                                        <button
                                            onClick={() => {
                                                setIsExportModalOpen(true)
                                                setMenuOpen(false)
                                            }}
                                            disabled={selectedIds.length === 0}
                                            className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
                                        >
                                            <Download className="w-4 h-4" />
                                            {t.vouchers.export_csv}
                                        </button>
                                        <button
                                            onClick={() => {
                                                handleDeleteSelected()
                                                setMenuOpen(false)
                                            }}
                                            disabled={selectedIds.length === 0}
                                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50"
                                        >
                                            <Trash className="w-4 h-4" />
                                            {t.vouchers.delete_selected}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    <h1 className="text-2xl font-bold text-white">
                        {t.vouchers.title}
                    </h1>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            setSelectMode(!selectMode)
                            setSelected({})
                            setMenuOpen(false)
                        }}
                        className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border ${selectMode
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25 border-blue-400/30'
                            }`}
                        title={selectMode ? 'Exit selection mode' : 'Enter selection mode'}
                    >
                        <CheckCircle className="w-5 h-5" />
                        {selectMode ? t.vouchers.selecting : t.vouchers.select}
                    </button>
                    <button
                        onClick={() => setIsScanModalOpen(true)}
                        className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-white/10 text-white hover:bg-white/20 border border-blue-400/30"
                    >
                        <ScanBarcode className="w-5 h-5" />
                        {t.vouchers.scan}
                    </button>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-80"
                    >
                        <Plus className="w-5 h-5" />
                        {t.vouchers.new_voucher}
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Toolbar */}
                <div className="p-4 border-b border-slate-100 flex gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder={t.vouchers.search_placeholder}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-slate-600"
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                            <tr>
                                {selectMode && (
                                    <th className="px-6 py-4 w-12 align-middle text-left">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        />
                                    </th>
                                )}
                                <ColumnHeader
                                    colKey="code"
                                    label={t.vouchers.table.code}
                                    sortCol={sortCol}
                                    sortAsc={sortAsc}
                                    onSort={handleSort}
                                    values={Array.from(new Set(vouchers.map(v => getColValue(v, 'code')))).sort()}
                                    activeFilter={columnFilters.code || null}
                                    onFilter={vals => applyColumnFilter('code', vals)}
                                    onClear={() => applyColumnFilter('code', null)}
                                    open={openMenu === 'code'}
                                    onToggle={() => setOpenMenu(openMenu === 'code' ? null : 'code')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={langDict}
                                />
                                <ColumnHeader
                                    colKey="status"
                                    label={t.vouchers.table.status}
                                    sortCol={sortCol}
                                    sortAsc={sortAsc}
                                    onSort={handleSort}
                                    values={Array.from(new Set(vouchers.map(v => getColValue(v, 'status')))).sort()}
                                    activeFilter={columnFilters.status || null}
                                    onFilter={vals => applyColumnFilter('status', vals)}
                                    onClear={() => applyColumnFilter('status', null)}
                                    open={openMenu === 'status'}
                                    onToggle={() => setOpenMenu(openMenu === 'status' ? null : 'status')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={langDict}
                                />
                                <ColumnHeader
                                    colKey="donor"
                                    label={t.vouchers.table.donor}
                                    sortCol={sortCol}
                                    sortAsc={sortAsc}
                                    onSort={handleSort}
                                    values={Array.from(new Set(vouchers.map(v => getColValue(v, 'donor')))).sort()}
                                    activeFilter={columnFilters.donor || null}
                                    onFilter={vals => applyColumnFilter('donor', vals)}
                                    onClear={() => applyColumnFilter('donor', null)}
                                    open={openMenu === 'donor'}
                                    onToggle={() => setOpenMenu(openMenu === 'donor' ? null : 'donor')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={langDict}
                                />
                                <ColumnHeader
                                    colKey="issued_on"
                                    label={t.vouchers.table.issued_on}
                                    sortCol={sortCol}
                                    sortAsc={sortAsc}
                                    onSort={handleSort}
                                    values={Array.from(new Set(vouchers.map(v => getColValue(v, 'issued_on')))).sort()}
                                    activeFilter={columnFilters.issued_on || null}
                                    onFilter={vals => applyColumnFilter('issued_on', vals)}
                                    onClear={() => applyColumnFilter('issued_on', null)}
                                    open={openMenu === 'issued_on'}
                                    onToggle={() => setOpenMenu(openMenu === 'issued_on' ? null : 'issued_on')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={langDict}
                                />
                                <ColumnHeader
                                    colKey="expires_on"
                                    label={t.vouchers.table.expires_on}
                                    sortCol={sortCol}
                                    sortAsc={sortAsc}
                                    onSort={handleSort}
                                    values={Array.from(new Set(vouchers.map(v => getColValue(v, 'expires_on')))).sort()}
                                    activeFilter={columnFilters.expires_on || null}
                                    onFilter={vals => applyColumnFilter('expires_on', vals)}
                                    onClear={() => applyColumnFilter('expires_on', null)}
                                    open={openMenu === 'expires_on'}
                                    onToggle={() => setOpenMenu(openMenu === 'expires_on' ? null : 'expires_on')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={langDict}
                                />
                                <ColumnHeader
                                    colKey="value"
                                    label={t.vouchers.table.value}
                                    sortCol={sortCol}
                                    sortAsc={sortAsc}
                                    onSort={handleSort}
                                    values={Array.from(new Set(vouchers.map(v => getColValue(v, 'value')))).sort((a,b) => {
                                        const numA = parseFloat(a.replace(/[^0-9.-]+/g,"")) || 0
                                        const numB = parseFloat(b.replace(/[^0-9.-]+/g,"")) || 0
                                        return numA - numB
                                    })}
                                    activeFilter={columnFilters.value || null}
                                    onFilter={vals => applyColumnFilter('value', vals)}
                                    onClear={() => applyColumnFilter('value', null)}
                                    open={openMenu === 'value'}
                                    onToggle={() => setOpenMenu(openMenu === 'value' ? null : 'value')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={langDict}
                                    right
                                />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={selectMode ? 7 : 6} className="px-6 py-8 text-center text-slate-500">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                        {t.vouchers.loading}
                                    </td>
                                </tr>
                            ) : sortedVouchers.length === 0 ? (
                                <tr>
                                    <td colSpan={selectMode ? 7 : 6} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                                        {t.vouchers.no_vouchers}
                                    </td>
                                </tr>
                            ) : (
                                sortedVouchers.map(voucher => (
                                    <tr
                                        key={voucher.id}
                                        onClick={() => {
                                            if (selectMode) {
                                                toggleSelectRow(voucher.id)
                                            } else {
                                                setSelectedVoucher(voucher)
                                            }
                                        }}
                                        className={`hover:bg-slate-50 transition cursor-pointer ${selected[voucher.id] ? 'bg-blue-50' : ''}`}
                                    >
                                        {selectMode && (
                                            <td className="px-6 py-4">
                                                <input
                                                    type="checkbox"
                                                    checked={!!selected[voucher.id]}
                                                    onChange={() => toggleSelectRow(voucher.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                />
                                            </td>
                                        )}
                                        <td className="px-6 py-4 font-mono font-medium text-blue-600 flex items-center gap-2">
                                            <Ticket className="w-4 h-4 text-slate-400" />
                                            {voucher.code}
                                        </td>
                                        <td className="px-6 py-4">{getStatusBadge(voucher.status)}</td>
                                        <td className="px-6 py-4">
                                            <span className="capitalize font-medium text-slate-700">{voucher.donor_type}</span>
                                            {voucher.donor_name && <span className="text-slate-500 ml-1">({voucher.donor_name})</span>}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{format(new Date(voucher.issued_on), 'dd/MM/yyyy')}</td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {voucher.expires_on ? format(new Date(voucher.expires_on), 'dd/MM/yyyy') : t.cards.table.never}
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-slate-900">
                                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(voucher.value)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {isCreateModalOpen && (
                    <CreateVoucherModal
                        t={t}
                        onClose={() => setIsCreateModalOpen(false)}
                        onSuccess={() => {
                            setIsCreateModalOpen(false)
                            fetchVouchers()
                        }}
                    />
                )}

                {selectedVoucher && (
                    <VoucherDetailsModal
                        voucher={selectedVoucher}
                        voucherTerms={voucherTerms}
                        voucherHeader={voucherHeader}
                        t={t}
                        onClose={() => setSelectedVoucher(null)}
                        onUpdate={() => {
                            fetchVouchers()
                            setSelectedVoucher(null)
                        }}
                    />
                )}

                {isExportModalOpen && (
                    <ExportModal
                        t={t}
                        selectedCount={selectedIds.length}
                        onClose={() => setIsExportModalOpen(false)}
                        onExport={(columns) => {
                            const selectedVouchers = vouchers.filter(v => selected[v.id])

                            const headers = columns.map(c => c.replace('_', ' ').toUpperCase())
                            const rows = selectedVouchers.map(v =>
                                columns.map(col => {
                                    const val = v[col as keyof GiftVoucher]
                                    return val === null ? '' : String(val)
                                })
                            )

                            const csvContent = [
                                headers.join(','),
                                ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
                            ].join('\n')

                            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
                            const link = document.createElement('a')
                            const url = URL.createObjectURL(blob)
                            link.setAttribute('href', url)
                            link.setAttribute('download', `gift_vouchers_export_${format(new Date(), 'yyyyMMdd')}.csv`)
                            link.style.visibility = 'hidden'
                            document.body.appendChild(link)
                            link.click()
                            document.body.removeChild(link)

                            setIsExportModalOpen(false)
                            setSelectMode(false)
                            setSelected({})
                        }}
                    />
                )}

                {isScanModalOpen && (
                    <ScanModal
                        t={t}
                        onClose={() => {
                            setIsScanModalOpen(false)
                            setScanError(null)
                        }}
                        onScan={(code) => {
                            const voucher = vouchers.find(v => v.code === code)
                            if (voucher) {
                                setSelectedVoucher(voucher)
                                setIsScanModalOpen(false)
                                setScanError(null)
                                setSearch('')
                            } else {
                                setScanError('Voucher not found')
                            }
                        }}
                        error={scanError}
                    />
                )}
            </div>
        </div>
    )
}

function ScanModal({
    onClose,
    onScan,
    error,
    t
}: {
    onClose: () => void
    onScan: (code: string) => void
    error: string | null
    t: any
}) {
    const [buffer, setBuffer] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus()
        }
    }, [])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            if (buffer.trim()) {
                onScan(buffer.trim())
                setBuffer('')
            }
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-slate-900">{t.vouchers.modals.scan_title}</h3>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                            <XCircle className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center animate-pulse">
                            <ScanBarcode className="w-10 h-10 text-blue-600" />
                        </div>
                        <p className="text-slate-600 text-center">
                            {t.cards.modals.ready_to_scan}
                        </p>

                        {error && (
                            <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-2 rounded-lg text-sm">
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </div>
                        )}

                        <input
                            ref={inputRef}
                            type="text"
                            value={buffer}
                            onChange={(e) => setBuffer(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full px-4 py-2 text-center text-lg font-bold text-slate-900 tracking-widest border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-600"

                            placeholder={t.vouchers.modals.scan_placeholder}
                            autoFocus
                        />
                    </div>

                    <div className="mt-4 text-center text-xs text-slate-400">
                        {t.cards.modals.or_type}
                    </div>
                </div>
            </div>
        </div>
    )
}

function ExportModal({
    selectedCount,
    onClose,
    onExport,
    t
}: {
    selectedCount: number
    onClose: () => void
    onExport: (columns: string[]) => void
    t: any
}) {
    const [columns, setColumns] = useState({
        code: true,
        status: true,
        value: true,
        donor_type: true,
        donor_name: true,
        issued_on: true,
        expires_on: true
    })

    const handleExport = () => {
        const selectedCols = Object.entries(columns)
            .filter(([_, checked]) => checked)
            .map(([key]) => key)
        onExport(selectedCols)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-slate-900">{t.vouchers.modals.export_title}</h3>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                            <XCircle className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="space-y-4 mb-6">
                        <p className="text-slate-600">
                            {t.vouchers.modals.select_columns}
                            {selectedCount > 0 && <span className="font-medium block mt-1">{t.vouchers.modals.exporting_count.replace('{count}', selectedCount.toString())}</span>}
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                            {Object.entries(columns).map(([key, checked]) => (
                                <label key={key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 p-2 rounded-lg border border-transparent hover:border-slate-100 transition">
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => setColumns(prev => ({ ...prev, [key]: e.target.checked }))}
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="capitalize">{key.replace('_', ' ')}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                        >
                            {t.cards.modals.cancel}
                        </button>
                        <button
                            onClick={handleExport}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            {t.vouchers.export_csv}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
