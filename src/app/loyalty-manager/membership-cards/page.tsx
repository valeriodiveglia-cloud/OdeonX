'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Plus, Search, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
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
    const [selectedCard, setSelectedCard] = useState<MembershipCard | null>(null)

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

    useEffect(() => {
        fetchCards()
    }, [])

    const filteredCards = cards.filter(c =>
        (c.customer_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
        c.card_number.includes(search) ||
        (c.phone_number || '').includes(search)
    )

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Active</span>
            case 'unassigned': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Unassigned</span>
            case 'expired': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200 flex items-center gap-1"><XCircle className="w-3 h-3" /> Expired</span>
            case 'blocked': return <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1"><XCircle className="w-3 h-3" /> Blocked</span>
            default: return null
        }
    }

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">
                    Membership Cards
                </h1>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition"
                >
                    <Plus className="w-4 h-4" />
                    New Card
                </button>
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
                                    <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
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
                                        onClick={() => setSelectedCard(card)}
                                        className="hover:bg-slate-50 transition cursor-pointer"
                                    >
                                        <td className="px-6 py-4 font-mono font-medium text-blue-600">{card.card_number}</td>
                                        <td className="px-6 py-4">{getStatusBadge(card.status)}</td>
                                        <td className="px-6 py-4 font-medium text-slate-900">
                                            {card.customer_name || <span className="text-slate-400 italic">Unassigned</span>}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{card.phone_number || '-'}</td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                                                {card.class || 'Standard'}
                                            </span>
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
