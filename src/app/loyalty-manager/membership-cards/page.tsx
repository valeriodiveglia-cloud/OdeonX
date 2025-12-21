'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Plus, Search, Loader2, CheckCircle, XCircle, AlertCircle, Download, MoreVertical, Trash, ScanBarcode } from 'lucide-react'
import { format } from 'date-fns'
import CardDetailsModal from './_components/CardDetailsModal'

type MembershipCard = {
    id: string
    card_number: string
    customer_name: string | null
    phone_number: string | null
    email: string | null
    address: string | null
    issued_on: string
    expires_on: string | null
    last_used: string | null
    total_value: number
    points: number
    class: string
    status: 'active' | 'unassigned' | 'expired' | 'blocked'
}

export default function MembershipCardsPage() {
    const [cards, setCards] = useState<MembershipCard[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [isScanModalOpen, setIsScanModalOpen] = useState(false)
    const [scanError, setScanError] = useState<string | null>(null)
    const [selectedCard, setSelectedCard] = useState<MembershipCard | null>(null)
    const [settings, setSettings] = useState<any>(null)

    const fetchCards = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('membership_cards')
            .select('*')
            .order('card_number', { ascending: false })

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
            // If modal is open, let the modal handle it
            if (isScanModalOpen) return

            const currentTime = Date.now()

            // If the time between keystrokes is too long (>100ms), reset buffer (manual typing)
            if (currentTime - lastKeyTime > 100) {
                buffer = ''
            }
            lastKeyTime = currentTime

            if (e.key === 'Enter') {
                if (buffer.length > 0) {
                    const card = cards.find(c => c.card_number === buffer)
                    if (card) {
                        setSelectedCard(card)
                        // Clear search to avoid confusion
                        setSearch('')
                    }
                    buffer = ''
                }
            } else if (e.key.length === 1) {
                // Only append printable characters
                buffer += e.key
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [cards, isScanModalOpen])

    const handleExportCSV = () => {
        if (cards.length === 0) {
            alert('No cards to export')
            return
        }

        const headers = ['Card Number (Barcode)', 'Status', 'Class', 'Customer Name', 'Phone']
        const rows = cards.map(c => [
            c.card_number,
            c.status,
            c.class,
            c.customer_name || '',
            c.phone_number || ''
        ])

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `membership_cards_${format(new Date(), 'yyyyMMdd')}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Active</span>
            case 'unassigned': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Unassigned</span>
            case 'expired': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200 flex items-center gap-1"><XCircle className="w-3 h-3" /> Expired</span>
            case 'blocked': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1"><XCircle className="w-3 h-3" /> Blocked</span>
            default: return null
        }
    }

    const filteredCards = cards.filter(c =>
        (c.customer_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
        c.card_number.includes(search) ||
        (c.phone_number || '').includes(search)
    )

    const [selectMode, setSelectMode] = useState(false)
    const [selected, setSelected] = useState<Record<string, boolean>>({})
    const [menuOpen, setMenuOpen] = useState(false)
    const [isExportModalOpen, setIsExportModalOpen] = useState(false)

    // Derived state
    const selectedIds = Object.keys(selected).filter(id => selected[id])
    const allSelected = filteredCards.length > 0 && filteredCards.every(c => selected[c.id])

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelected({})
        } else {
            const newSelected: Record<string, boolean> = {}
            filteredCards.forEach(c => newSelected[c.id] = true)
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
        if (!confirm(`Are you sure you want to delete ${selectedIds.length} cards? This action cannot be undone.`)) return

        setLoading(true)
        const { error } = await supabase
            .from('membership_cards')
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
                        Membership Cards
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
                        New Card
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
                            placeholder="Search by name, card ID, or phone..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                <th className="px-6 py-4">Card ID</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Customer</th>
                                <th className="px-6 py-4">Phone</th>
                                <th className="px-6 py-4">Class</th>
                                <th className="px-6 py-4">Issued On</th>
                                <th className="px-6 py-4">Expires On</th>
                                <th className="px-6 py-4 text-right">Points</th>
                                <th className="px-6 py-4 text-right">Total Value</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={selectMode ? 10 : 9} className="px-6 py-8 text-center text-slate-500">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                        Loading...
                                    </td>
                                </tr>
                            ) : filteredCards.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                                        No cards found.
                                    </td>
                                </tr>
                            ) : (
                                filteredCards.map(card => (
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
                                        <td className="px-6 py-4 font-mono font-medium text-blue-600">{card.card_number}</td>
                                        <td className="px-6 py-4">{getStatusBadge(card.status)}</td>
                                        <td className="px-6 py-4 font-medium text-slate-900">
                                            {card.customer_name || <span className="text-slate-400 italic">Unassigned</span>}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{card.phone_number || '-'}</td>
                                        <td className="px-6 py-4">
                                            {(() => {
                                                const currentClass = settings?.classes?.find((c: any) => c.name === card.class)
                                                return (
                                                    <span
                                                        className="px-2 py-1 rounded-full text-xs font-medium"
                                                        style={{
                                                            backgroundColor: currentClass?.color || '#e2e8f0',
                                                            color: '#ffffff'
                                                        }}
                                                    >
                                                        {card.class || 'Standard'}
                                                    </span>
                                                )
                                            })()}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{format(new Date(card.issued_on), 'dd/MM/yyyy')}</td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {card.expires_on ? format(new Date(card.expires_on), 'dd/MM/yyyy') : 'Never'}
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-amber-600">
                                            {card.points || 0}
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-slate-900">
                                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(card.total_value)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {isCreateModalOpen && (
                    <CreateCardModal
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
                        onClose={() => setSelectedCard(null)}
                        onUpdate={() => {
                            fetchCards()
                            setSelectedCard(null)
                        }}
                    />
                )}

                {isExportModalOpen && (
                    <ExportModal
                        selectedCount={selectedIds.length}
                        onClose={() => setIsExportModalOpen(false)}
                        onExport={(columns) => {
                            const selectedCards = cards.filter(c => selected[c.id])

                            const headers = columns.map(c => c.replace('_', ' ').toUpperCase())
                            const rows = selectedCards.map(c =>
                                columns.map(col => {
                                    const val = c[col as keyof MembershipCard]
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
                            link.setAttribute('download', `membership_cards_export_${format(new Date(), 'yyyyMMdd')}.csv`)
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

/* -------------------------------------------------------------------------- */
/*                            CREATE CARD MODAL                               */
/* -------------------------------------------------------------------------- */

function CreateCardModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
    const [mode, setMode] = useState<'single' | 'bulk'>('single')
    const [loading, setLoading] = useState(false)

    // Single Mode State
    const [manualId, setManualId] = useState(false)
    const [customId, setCustomId] = useState('')
    const [autoId, setAutoId] = useState('')
    const [formData, setFormData] = useState({
        customer_name: '',
        phone_number: '',
        email: '',
        address: '',
        class: 'Standard',
        expires_on: ''
    })

    // Bulk Mode State
    const [bulkQty, setBulkQty] = useState(1)
    const [bulkClass, setBulkClass] = useState('Standard')
    const [bulkExpires, setBulkExpires] = useState('')

    useEffect(() => {
        if (!manualId && mode === 'single') {
            generateNextId().then(id => setAutoId(id))
        }
    }, [manualId, mode])

    const generateNextId = async () => {
        const year = new Date().getFullYear()
        const prefix = `${year}`

        const { data } = await supabase
            .from('membership_cards')
            .select('card_number')
            .ilike('card_number', `${prefix}%`)
            .order('card_number', { ascending: false })
            .limit(1)

        let nextSeq = 1
        if (data && data.length > 0) {
            const lastId = data[0].card_number
            const lastSeqStr = lastId.substring(4)
            const lastSeq = parseInt(lastSeqStr, 10)
            if (!isNaN(lastSeq)) {
                nextSeq = lastSeq + 1
            }
        }
        return `${prefix}${String(nextSeq).padStart(4, '0')}`
    }

    const handleSingleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const cardId = manualId ? customId : autoId
        if (!cardId) {
            alert('Card ID is required')
            setLoading(false)
            return
        }

        const { error } = await supabase.from('membership_cards').insert({
            card_number: cardId,
            customer_name: formData.customer_name,
            phone_number: formData.phone_number,
            email: formData.email,
            address: formData.address,
            class: formData.class,
            expires_on: formData.expires_on ? new Date(formData.expires_on).toISOString() : null,
            issued_on: new Date().toISOString(),
            status: 'active',
            total_value: 0,
            points: 0
        })

        if (error) alert('Error: ' + error.message)
        else onSuccess()
        setLoading(false)
    }

    const handleBulkSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            // 1. Determine start sequence
            const year = new Date().getFullYear()
            const prefix = `${year}`

            const { data } = await supabase
                .from('membership_cards')
                .select('card_number')
                .ilike('card_number', `${prefix}%`)
                .order('card_number', { ascending: false })
                .limit(1)

            let startSeq = 1
            if (data && data.length > 0) {
                const lastId = data[0].card_number
                const lastSeqStr = lastId.substring(4)
                const lastSeq = parseInt(lastSeqStr, 10)
                if (!isNaN(lastSeq)) {
                    startSeq = lastSeq + 1
                }
            }

            // 2. Generate rows
            const rows = []
            for (let i = 0; i < bulkQty; i++) {
                const seq = startSeq + i
                const cardId = `${prefix}${String(seq).padStart(4, '0')}`
                rows.push({
                    card_number: cardId,
                    class: bulkClass,
                    expires_on: bulkExpires ? new Date(bulkExpires).toISOString() : null,
                    issued_on: new Date().toISOString(),
                    status: 'unassigned',
                    total_value: 0,
                    points: 0
                })
            }

            // 3. Insert
            const { error } = await supabase.from('membership_cards').insert(rows)
            if (error) throw error

            onSuccess()
        } catch (err: any) {
            alert('Error creating bulk cards: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-lg text-slate-800">Create Membership Cards</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 shrink-0">
                    <button
                        className={`flex-1 py-3 text-sm font-medium ${mode === 'single' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setMode('single')}
                    >
                        Single Card
                    </button>
                    <button
                        className={`flex-1 py-3 text-sm font-medium ${mode === 'bulk' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setMode('bulk')}
                    >
                        Bulk Creation
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {mode === 'single' ? (
                        <form onSubmit={handleSingleSubmit} className="space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-slate-700">Card ID</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500">Manual ID</span>
                                    <button
                                        type="button"
                                        onClick={() => setManualId(!manualId)}
                                        className={`w-8 h-4 rounded-full transition-colors relative ${manualId ? 'bg-blue-600' : 'bg-slate-300'}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${manualId ? 'translate-x-4' : ''}`} />
                                    </button>
                                </div>
                            </div>

                            {manualId ? (
                                <input
                                    type="text"
                                    value={customId}
                                    onChange={e => setCustomId(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Enter custom ID"
                                    required
                                />
                            ) : (
                                <input
                                    type="text"
                                    value={autoId}
                                    disabled
                                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 font-mono"
                                />
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.customer_name}
                                    onChange={e => setFormData({ ...formData, customer_name: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                                    <input
                                        type="tel"
                                        value={formData.phone_number}
                                        onChange={e => setFormData({ ...formData, phone_number: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                                <input
                                    type="text"
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Class</label>
                                    <select
                                        value={formData.class}
                                        onChange={e => setFormData({ ...formData, class: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="Standard">Standard</option>
                                        <option value="Silver">Silver</option>
                                        <option value="Gold">Gold</option>
                                        <option value="Platinum">Platinum</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Expires On</label>
                                    <input
                                        type="date"
                                        value={formData.expires_on}
                                        onChange={e => setFormData({ ...formData, expires_on: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3 justify-end">
                                <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancel</button>
                                <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />} Create
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleBulkSubmit} className="space-y-4">
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800 mb-4">
                                Bulk created cards will be set to <strong>Unassigned</strong> status. You can assign them to customers later.
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="1000"
                                    value={bulkQty}
                                    onChange={e => setBulkQty(parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Class</label>
                                    <select
                                        value={bulkClass}
                                        onChange={e => setBulkClass(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="Standard">Standard</option>
                                        <option value="Silver">Silver</option>
                                        <option value="Gold">Gold</option>
                                        <option value="Platinum">Platinum</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Expires On</label>
                                    <input
                                        type="date"
                                        value={bulkExpires}
                                        onChange={e => setBulkExpires(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3 justify-end">
                                <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancel</button>
                                <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />} Generate {bulkQty} Cards
                                </button>
                            </div>
                        </form>
                    )}
                </div>
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
    onScan: (cardId: string) => void
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
                        <h3 className="text-xl font-bold text-slate-900">Scan Membership Card</h3>
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
                            className="w-full px-4 py-2 text-center text-lg font-bold text-slate-900 tracking-widest border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Scan or type card number"
                            autoFocus
                        />
                    </div>

                    <div className="mt-4 text-center text-xs text-slate-400">
                        Or type the card number manually and press Enter
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
        card_number: true,
        status: true,
        customer_name: true,
        phone_number: true,
        class: true,
        points: false,
        total_value: false,
        email: false,
        address: false
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
                            {selectedCount > 0 && <span className="font-medium block mt-1">Exporting {selectedCount} selected cards.</span>}
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
