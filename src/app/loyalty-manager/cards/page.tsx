'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Plus, Search, Loader2, CheckCircle, XCircle, AlertCircle, Download, MoreVertical, Trash, ScanBarcode, CreditCard, Wallet, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import {
    BarsArrowUpIcon,
    BarsArrowDownIcon,
    FunnelIcon,
    EllipsisVerticalIcon,
} from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import CreateCardModal from './_components/CreateCardModal'
import CardDetailsModal from './_components/CardDetailsModal'
import { useSettings } from '@/contexts/SettingsContext'
import { getLoyaltyManagerDictionary } from '../_i18n'
import { LoyaltyCard } from './types'

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
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleScroll() {
      onClose();
    }
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [open, onClose])

    const isActive = sortCol === colKey
    const hasFilter = !!activeFilter
    const dropdownStyle = useMemo(() => {
        if (!open || !ref.current) return undefined
        const rect = ref.current.getBoundingClientRect()
        const width = 220;
      let left = right ? rect.right - width : rect.left;
      if (left + width > window.innerWidth) {
        left = window.innerWidth - width - 8;
      }
      if (left < 8) {
        left = 8;
      }
      return { top: rect.bottom + 4, left: left, width: `${width}px` };
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

export default function LoyaltyCardsPage() {
    const { language } = useSettings()
    const t = getLoyaltyManagerDictionary(language)

    const [cards, setCards] = useState<LoyaltyCard[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [isScanModalOpen, setIsScanModalOpen] = useState(false)
    const [scanError, setScanError] = useState<string | null>(null)
    const [selectedCard, setSelectedCard] = useState<LoyaltyCard | null>(null)
    const [settings, setSettings] = useState<any>(null)

    const fetchCards = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('loyalty_cards')
            .select('*')
            .order('created_at', { ascending: false })

        if (!error && data) {
            setCards(data)
        }
        setLoading(false)
    }

    const fetchSettings = async () => {
        const { data } = await supabase
            .from('loyalty_settings')
            .select('*')
            .single()
        if (data) {
            const rawClasses = Array.isArray(data.classes) ? data.classes : []
            const classes = rawClasses.map((c: any) => ({
                ...c,
                color: c.color || '#3b82f6'
            }))
            setSettings({ ...data, classes })
        }
    }

    useEffect(() => {
        fetchCards()
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
                    const card = cards.find(c => c.card_number === buffer)
                    if (card) {
                        setSelectedCard(card)
                        setSearch('')
                    }
                    buffer = ''
                }
            } else if (e.key && e.key.length === 1) {
                buffer += e.key
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [cards, isScanModalOpen])

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {t.cards.status.active}</span>
            case 'unassigned': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {t.cards.status.unassigned}</span>
            case 'expired': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200 flex items-center gap-1"><XCircle className="w-3 h-3" /> {t.cards.status.expired}</span>
            case 'blocked': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200 flex items-center gap-1"><XCircle className="w-3 h-3" /> {t.cards.status.blocked}</span>
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

    const getColValue = (card: LoyaltyCard, colKey: string): string => {
        switch (colKey) {
            case 'card_number':
                return card.card_number || ''
            case 'status':
                return card.status === 'active' ? t.cards.status.active :
                       card.status === 'unassigned' ? t.cards.status.unassigned :
                       card.status === 'expired' ? t.cards.status.expired :
                       card.status === 'blocked' ? t.cards.status.blocked : card.status || ''
            case 'customer_name':
                return card.customer_name || t.cards.status.unassigned
            case 'class':
                if (card.class === '-') return '-'
                return card.class || t.cards.table.standard
            case 'total_spent':
                return formatCurrency(card.total_spent || 0)
            case 'points':
                return card.status === 'blocked' ? '0 pts' : `${card.points || 0} pts`
            case 'balance':
                return card.status === 'blocked' ? formatCurrency(0) : formatCurrency(card.balance || 0)
            case 'expires':
                return (card.card_expires_on || card.tier_expires_on)
                    ? format(new Date(card.card_expires_on || card.tier_expires_on!), 'dd/MM/yyyy')
                    : t.cards.table.never
            default:
                return ''
        }
    }

    const searchedCards = useMemo(() => {
        return cards.filter(c =>
            (c.customer_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
            c.card_number.includes(search) ||
            (c.phone_number || '').includes(search)
        )
    }, [cards, search])

    const filteredCards = useMemo(() => {
        let list = [...searchedCards]
        Object.entries(columnFilters).forEach(([col, vals]) => {
            if (!vals) return
            list = list.filter(x => {
                const v = getColValue(x, col)
                return vals.has(v)
            })
        })
        return list
    }, [searchedCards, columnFilters])

    const sortedCards = useMemo(() => {
        const list = [...filteredCards]
        list.sort((a, b) => {
            const dir = sortAsc ? 1 : -1
            switch (sortCol) {
                case 'card_number': 
                    return (a.card_number || '').localeCompare(b.card_number || '') * dir
                case 'status': {
                    const valA = getColValue(a, 'status')
                    const valB = getColValue(b, 'status')
                    return valA.localeCompare(valB) * dir
                }
                case 'customer_name': {
                    const valA = a.customer_name || ''
                    const valB = b.customer_name || ''
                    return valA.localeCompare(valB) * dir
                }
                case 'class': 
                    return (a.class || '').localeCompare(b.class || '') * dir
                case 'total_spent': 
                    return ((a.total_spent || 0) - (b.total_spent || 0)) * dir
                case 'points': 
                    return ((a.points || 0) - (b.points || 0)) * dir
                case 'balance': 
                    return ((a.balance || 0) - (b.balance || 0)) * dir
                case 'expires': {
                    const timeA = a.card_expires_on || a.tier_expires_on ? new Date(a.card_expires_on || a.tier_expires_on!).getTime() : 0
                    const timeB = b.card_expires_on || b.tier_expires_on ? new Date(b.card_expires_on || b.tier_expires_on!).getTime() : 0
                    return (timeA - timeB) * dir
                }
                case 'issued_on':
                default: {
                    const tA = a.issued_on ? new Date(a.issued_on).getTime() : 0
                    const tB = b.issued_on ? new Date(b.issued_on).getTime() : 0
                    return (tA - tB) * dir
                }
            }
        })
        return list
    }, [filteredCards, sortCol, sortAsc])

    const [selectMode, setSelectMode] = useState(false)
    const [selected, setSelected] = useState<Record<string, boolean>>({})
    const [menuOpen, setMenuOpen] = useState(false)

    const selectedIds = Object.keys(selected).filter(id => selected[id])
    const allSelected = sortedCards.length > 0 && sortedCards.every(c => selected[c.id])

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelected({})
        } else {
            const newSelected: Record<string, boolean> = {}
            sortedCards.forEach(c => newSelected[c.id] = true)
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
        if (!confirm(t.cards.delete_selected_confirm.replace('{count}', selectedIds.length.toString()))) return

        setLoading(true)
        const { error } = await supabase
            .from('loyalty_cards')
            .delete()
            .in('id', selectedIds)

        if (error) {
            alert('Error deleting cards: ' + error.message)
        } else {
            setSelected({})
            setSelectMode(false)
            fetchCards()
        }
        setLoading(false)
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
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
                                                handleDeleteSelected()
                                                setMenuOpen(false)
                                            }}
                                            disabled={selectedIds.length === 0}
                                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50"
                                        >
                                            <Trash className="w-4 h-4" />
                                            {t.cards.delete_selected}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    <h1 className="text-2xl font-bold text-white">
                        {t.cards.title}
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
                        {selectMode ? t.cards.selecting : t.cards.select}
                    </button>
                    <button
                        onClick={() => setIsScanModalOpen(true)}
                        className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-white/10 text-white hover:bg-white/20 border border-blue-400/30"
                    >
                        <ScanBarcode className="w-5 h-5" />
                        {t.cards.scan}
                    </button>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-80"
                    >
                        <Plus className="w-5 h-5" />
                        {t.cards.new_card}
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
                            placeholder={t.cards.search_placeholder}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-slate-500"
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
                                    colKey="card_number"
                                    label={t.cards.table.card_id}
                                    sortCol={sortCol}
                                    sortAsc={sortAsc}
                                    onSort={handleSort}
                                    values={Array.from(new Set(cards.map(c => getColValue(c, 'card_number')))).sort()}
                                    activeFilter={columnFilters.card_number || null}
                                    onFilter={vals => applyColumnFilter('card_number', vals)}
                                    onClear={() => applyColumnFilter('card_number', null)}
                                    open={openMenu === 'card_number'}
                                    onToggle={() => setOpenMenu(openMenu === 'card_number' ? null : 'card_number')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={langDict}
                                />
                                <ColumnHeader
                                    colKey="status"
                                    label={t.cards.table.status}
                                    sortCol={sortCol}
                                    sortAsc={sortAsc}
                                    onSort={handleSort}
                                    values={Array.from(new Set(cards.map(c => getColValue(c, 'status')))).sort()}
                                    activeFilter={columnFilters.status || null}
                                    onFilter={vals => applyColumnFilter('status', vals)}
                                    onClear={() => applyColumnFilter('status', null)}
                                    open={openMenu === 'status'}
                                    onToggle={() => setOpenMenu(openMenu === 'status' ? null : 'status')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={langDict}
                                />
                                <ColumnHeader
                                    colKey="customer_name"
                                    label={t.cards.table.customer}
                                    sortCol={sortCol}
                                    sortAsc={sortAsc}
                                    onSort={handleSort}
                                    values={Array.from(new Set(cards.map(c => getColValue(c, 'customer_name')))).sort()}
                                    activeFilter={columnFilters.customer_name || null}
                                    onFilter={vals => applyColumnFilter('customer_name', vals)}
                                    onClear={() => applyColumnFilter('customer_name', null)}
                                    open={openMenu === 'customer_name'}
                                    onToggle={() => setOpenMenu(openMenu === 'customer_name' ? null : 'customer_name')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={langDict}
                                />
                                <ColumnHeader
                                    colKey="class"
                                    label={t.cards.table.class}
                                    sortCol={sortCol}
                                    sortAsc={sortAsc}
                                    onSort={handleSort}
                                    values={Array.from(new Set(cards.map(c => getColValue(c, 'class')))).sort()}
                                    activeFilter={columnFilters.class || null}
                                    onFilter={vals => applyColumnFilter('class', vals)}
                                    onClear={() => applyColumnFilter('class', null)}
                                    open={openMenu === 'class'}
                                    onToggle={() => setOpenMenu(openMenu === 'class' ? null : 'class')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={langDict}
                                />
                                <ColumnHeader
                                    colKey="total_spent"
                                    label={t.cards.table.total_value}
                                    sortCol={sortCol}
                                    sortAsc={sortAsc}
                                    onSort={handleSort}
                                    values={Array.from(new Set(cards.map(c => getColValue(c, 'total_spent')))).sort((a,b) => {
                                        const numA = parseFloat(a.replace(/[^0-9.-]+/g,"")) || 0
                                        const numB = parseFloat(b.replace(/[^0-9.-]+/g,"")) || 0
                                        return numA - numB
                                    })}
                                    activeFilter={columnFilters.total_spent || null}
                                    onFilter={vals => applyColumnFilter('total_spent', vals)}
                                    onClear={() => applyColumnFilter('total_spent', null)}
                                    open={openMenu === 'total_spent'}
                                    onToggle={() => setOpenMenu(openMenu === 'total_spent' ? null : 'total_spent')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={langDict}
                                    right
                                />
                                <ColumnHeader
                                    colKey="points"
                                    label={t.cards.table.points}
                                    sortCol={sortCol}
                                    sortAsc={sortAsc}
                                    onSort={handleSort}
                                    values={Array.from(new Set(cards.map(c => getColValue(c, 'points')))).sort((a,b) => {
                                        const numA = parseInt(a.replace(/[^0-9]+/g,"")) || 0
                                        const numB = parseInt(b.replace(/[^0-9]+/g,"")) || 0
                                        return numA - numB
                                    })}
                                    activeFilter={columnFilters.points || null}
                                    onFilter={vals => applyColumnFilter('points', vals)}
                                    onClear={() => applyColumnFilter('points', null)}
                                    open={openMenu === 'points'}
                                    onToggle={() => setOpenMenu(openMenu === 'points' ? null : 'points')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={langDict}
                                    right
                                />
                                <ColumnHeader
                                    colKey="balance"
                                    label={t.cards.table.wallet_balance}
                                    sortCol={sortCol}
                                    sortAsc={sortAsc}
                                    onSort={handleSort}
                                    values={Array.from(new Set(cards.map(c => getColValue(c, 'balance')))).sort((a,b) => {
                                        const numA = parseFloat(a.replace(/[^0-9.-]+/g,"")) || 0
                                        const numB = parseFloat(b.replace(/[^0-9.-]+/g,"")) || 0
                                        return numA - numB
                                    })}
                                    activeFilter={columnFilters.balance || null}
                                    onFilter={vals => applyColumnFilter('balance', vals)}
                                    onClear={() => applyColumnFilter('balance', null)}
                                    open={openMenu === 'balance'}
                                    onToggle={() => setOpenMenu(openMenu === 'balance' ? null : 'balance')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={langDict}
                                    right
                                />
                                <ColumnHeader
                                    colKey="expires"
                                    label={t.cards.table.expires}
                                    sortCol={sortCol}
                                    sortAsc={sortAsc}
                                    onSort={handleSort}
                                    values={Array.from(new Set(cards.map(c => getColValue(c, 'expires')))).sort()}
                                    activeFilter={columnFilters.expires || null}
                                    onFilter={vals => applyColumnFilter('expires', vals)}
                                    onClear={() => applyColumnFilter('expires', null)}
                                    open={openMenu === 'expires'}
                                    onToggle={() => setOpenMenu(openMenu === 'expires' ? null : 'expires')}
                                    onClose={() => setOpenMenu(null)}
                                    dict={langDict}
                                />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={selectMode ? 9 : 8} className="px-6 py-8 text-center text-slate-500">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                        {t.cards.loading}
                                    </td>
                                </tr>
                            ) : sortedCards.length === 0 ? (
                                <tr>
                                    <td colSpan={selectMode ? 9 : 8} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                                        {t.cards.no_cards}
                                    </td>
                                </tr>
                            ) : (
                                sortedCards.map(card => (
                                    <tr
                                        key={card.id}
                                        onClick={() => {
                                            if (selectMode) {
                                                toggleSelectRow(card.id)
                                            } else {
                                                setSelectedCard(card)
                                            }
                                        }}
                                        className={`hover:bg-slate-50 transition cursor-pointer ${selected[card.id] ? 'bg-blue-50' : ''}`}
                                    >
                                        {selectMode && (
                                            <td className="px-6 py-4">
                                                <input
                                                    type="checkbox"
                                                    checked={!!selected[card.id]}
                                                    onChange={() => toggleSelectRow(card.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                />
                                            </td>
                                        )}
                                        <td className="px-6 py-4 font-mono font-medium text-blue-600 flex items-center gap-2">
                                            <CreditCard className="w-4 h-4 text-slate-400" />
                                            {card.card_number}
                                        </td>
                                        <td className="px-6 py-4">{getStatusBadge(card.status)}</td>
                                        <td className="px-6 py-4 font-medium text-slate-900">
                                            {card.customer_name || <span className="text-slate-400 italic">{t.cards.status.unassigned}</span>}
                                            {card.phone_number && <div className="text-xs text-slate-500 font-normal">{card.phone_number}</div>}
                                        </td>
                                        <td className="px-6 py-4">
                                            {(() => {
                                                if (card.class === '-') {
                                                    return <span className="text-slate-400 font-mono">-</span>
                                                }
                                                const currentClass = settings?.classes?.find((c: any) => c.name === card.class)
                                                return (
                                                    <span
                                                        className="px-2 py-1 rounded-full text-xs font-medium"
                                                        style={{
                                                            backgroundColor: currentClass?.color || '#e2e8f0',
                                                            color: '#ffffff'
                                                        }}
                                                    >
                                                        {card.class || t.cards.table.standard}
                                                    </span>
                                                )
                                            })()}
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-slate-700">
                                            {formatCurrency(card.total_spent || 0)}
                                        </td>
                                        <td className="px-6 py-4 text-right align-middle">
                                            <div className="flex flex-col justify-center items-end">
                                                {card.status === 'blocked' ? (
                                                    <>
                                                        <span className="text-slate-400 font-medium">0 pts</span>
                                                        <span className="text-[10px] text-slate-400 whitespace-nowrap">Old: {card.points} pts</span>
                                                    </>
                                                ) : (
                                                    <span className="font-medium text-amber-600">{card.points || 0} pts</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right align-middle">
                                            <div className="flex flex-col justify-center items-end">
                                                {card.status === 'blocked' ? (
                                                    <>
                                                        <span className="text-slate-400 font-medium">{formatCurrency(0)}</span>
                                                        <span className="text-[10px] text-slate-400 whitespace-nowrap">Old: {formatCurrency(card.balance)}</span>
                                                    </>
                                                ) : (
                                                    <span className="font-bold text-slate-900">{formatCurrency(card.balance || 0)}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 text-xs text-right">
                                            {(card.card_expires_on || card.tier_expires_on) ? format(new Date(card.card_expires_on || card.tier_expires_on!), 'dd/MM/yyyy') : t.cards.table.never}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {isCreateModalOpen && (
                    <CreateCardModal
                        t={t}
                        onClose={() => setIsCreateModalOpen(false)}
                        onSuccess={() => {
                            setIsCreateModalOpen(false)
                            fetchCards()
                        }}
                    />
                )}

                {selectedCard && (
                    <CardDetailsModal
                        card={selectedCard}
                        t={t}
                        bonusPercentage={settings?.prepaid_bonus_percentage || 0}
                        minTopUpAmount={settings?.min_topup_amount || 0}
                        pointsRatio={settings?.points_ratio || 1000}
                        redemptionRatio={settings?.redemption_ratio || 100}
                        rewards={settings?.rewards || []}
                        onClose={() => setSelectedCard(null)}
                        onUpdate={() => {
                            fetchCards()
                            setSelectedCard(null)
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
                        onScan={(cardId) => {
                            const card = cards.find(c => c.card_number === cardId)
                            if (card) {
                                setSelectedCard(card)
                                setIsScanModalOpen(false)
                                setScanError(null)
                                setSearch('')
                            } else {
                                setScanError('Card not found')
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
                        <h3 className="text-xl font-bold text-slate-900">{t.cards.modals.scan_title}</h3>
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
                            className="w-full px-4 py-2 text-center text-lg font-bold text-slate-900 tracking-widest border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400"
                            placeholder={t.cards.modals.scan_placeholder}
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
