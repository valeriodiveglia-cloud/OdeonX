'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Plus, Search, Loader2, CheckCircle, XCircle, AlertCircle, Download, MoreVertical, Trash, ScanBarcode, Ticket } from 'lucide-react'
import { format } from 'date-fns'
import CreateVoucherModal from './_components/CreateVoucherModal'
import VoucherDetailsModal from './_components/VoucherDetailsModal'

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
}

export default function VouchersPage() {
    const [vouchers, setVouchers] = useState<GiftVoucher[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [isScanModalOpen, setIsScanModalOpen] = useState(false)
    const [scanError, setScanError] = useState<string | null>(null)
    const [selectedVoucher, setSelectedVoucher] = useState<GiftVoucher | null>(null)

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

    useEffect(() => {
        fetchVouchers()
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
            case 'active': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Active</span>
            case 'redeemed': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Redeemed</span>
            case 'expired': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200 flex items-center gap-1"><XCircle className="w-3 h-3" /> Expired</span>
            case 'blocked': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1"><XCircle className="w-3 h-3" /> Blocked</span>
            default: return null
        }
    }

    const filteredVouchers = vouchers.filter(v =>
        v.code.toLowerCase().includes(search.toLowerCase()) ||
        (v.donor_name && v.donor_name.toLowerCase().includes(search.toLowerCase()))
    )

    const [selectMode, setSelectMode] = useState(false)
    const [selected, setSelected] = useState<Record<string, boolean>>({})
    const [menuOpen, setMenuOpen] = useState(false)
    const [isExportModalOpen, setIsExportModalOpen] = useState(false)

    const selectedIds = Object.keys(selected).filter(id => selected[id])
    const allSelected = filteredVouchers.length > 0 && filteredVouchers.every(v => selected[v.id])

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelected({})
        } else {
            const newSelected: Record<string, boolean> = {}
            filteredVouchers.forEach(v => newSelected[v.id] = true)
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
        if (!confirm(`Are you sure you want to delete ${selectedIds.length} vouchers? This action cannot be undone.`)) return

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
                                            Export CSV
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
                                            Delete Selected
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    <h1 className="text-2xl font-bold text-white">
                        Gift Vouchers
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
                        {selectMode ? 'Selecting' : 'Select'}
                    </button>
                    <button
                        onClick={() => setIsScanModalOpen(true)}
                        className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-white/10 text-white hover:bg-white/20 border border-blue-400/30"
                    >
                        <ScanBarcode className="w-5 h-5" />
                        Scan
                    </button>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-80"
                    >
                        <Plus className="w-5 h-5" />
                        New Voucher
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
                            placeholder="Search by code or donor..."
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
                                    <th className="px-6 py-4 w-12">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                    </th>
                                )}
                                <th className="px-6 py-4">Voucher Code</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Donor</th>
                                <th className="px-6 py-4">Issued On</th>
                                <th className="px-6 py-4">Expires On</th>
                                <th className="px-6 py-4 text-right">Value</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={selectMode ? 7 : 6} className="px-6 py-8 text-center text-slate-500">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                        Loading...
                                    </td>
                                </tr>
                            ) : filteredVouchers.length === 0 ? (
                                <tr>
                                    <td colSpan={selectMode ? 7 : 6} className="px-6 py-8 text-center text-slate-500">
                                        No vouchers found.
                                    </td>
                                </tr>
                            ) : (
                                filteredVouchers.map(voucher => (
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
                                            {voucher.expires_on ? format(new Date(voucher.expires_on), 'dd/MM/yyyy') : 'Never'}
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
                        onClose={() => setSelectedVoucher(null)}
                        onUpdate={() => {
                            fetchVouchers()
                            setSelectedVoucher(null)
                        }}
                    />
                )}

                {isExportModalOpen && (
                    <ExportModal
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
    error
}: {
    onClose: () => void
    onScan: (code: string) => void
    error: string | null
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
                        <h3 className="text-xl font-bold text-slate-900">Scan Voucher</h3>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                            <XCircle className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center animate-pulse">
                            <ScanBarcode className="w-10 h-10 text-blue-600" />
                        </div>
                        <p className="text-slate-600 text-center">
                            Ready to scan. Please use your barcode scanner now.
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
                            placeholder="Scan or type voucher code"
                            autoFocus
                        />
                    </div>

                    <div className="mt-4 text-center text-xs text-slate-400">
                        Or type the code manually and press Enter
                    </div>
                </div>
            </div>
        </div>
    )
}

function ExportModal({
    selectedCount,
    onClose,
    onExport
}: {
    selectedCount: number
    onClose: () => void
    onExport: (columns: string[]) => void
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
                        <h3 className="text-xl font-bold text-slate-900">Export to CSV</h3>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                            <XCircle className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="space-y-4 mb-6">
                        <p className="text-slate-600">
                            Select columns to include in the export.
                            {selectedCount > 0 && <span className="font-medium block mt-1">Exporting {selectedCount} selected vouchers.</span>}
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
                            Cancel
                        </button>
                        <button
                            onClick={handleExport}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            Export CSV
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
