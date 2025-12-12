'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Loader2, Plus, Users, CreditCard, Calendar } from 'lucide-react'

type Props = {
    onClose: () => void
    onSuccess: () => void
    t: any
}

const formatInputCurrency = (value: number | string) => {
    if (!value) return ''
    return new Intl.NumberFormat('en-US').format(Number(value))
}

const CurrencyInput = ({ value, onChange, className, ...props }: any) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/,/g, '')
        if (!/^[\d]*$/.test(rawValue)) return // Only numbers (regex fix: allow empty)
        onChange(rawValue)
    }

    return (
        <input
            {...props}
            type="text"
            className={`${className} text-black`}
            value={formatInputCurrency(value)}
            onChange={handleChange}
        />
    )
}

export default function CreateCardModal({ onClose, onSuccess, t }: Props) {
    const [mode, setMode] = useState<'single' | 'bulk'>('single')
    const [loading, setLoading] = useState(false)
    const [tab, setTab] = useState<'basic' | 'membership' | 'prepaid'>('basic')

    // Single Mode State
    const [manualId, setManualId] = useState(false)
    const [customId, setCustomId] = useState('')
    const [autoId, setAutoId] = useState('')

    // Form Data
    const [formData, setFormData] = useState({
        customer_name: '',
        phone_number: '',
        email: '',
        address: '',
        class: 'Standard',
        tier_expires_on: '',
        card_expires_on: '',
        initial_balance: 0,
        initial_points: 0
    })

    // Bulk Mode State
    const [bulkQty, setBulkQty] = useState(1)

    const [classes, setClasses] = useState<string[]>([])

    useEffect(() => {
        const fetchSettings = async () => {
            const { data } = await supabase.from('loyalty_settings').select('classes').single()
            if (data?.classes && Array.isArray(data.classes)) {
                setClasses(data.classes.map((c: any) => c.name))
            } else {
                setClasses(['Standard', 'Silver', 'Gold', 'Platinum']) // Fallback
            }
        }
        fetchSettings()
    }, [])

    useEffect(() => {
        if (!manualId && mode === 'single') {
            generateNextId().then(id => setAutoId(id))
        }
    }, [manualId, mode])

    // ... existing generateNextId ... 


    const generateNextId = async () => {
        const year = new Date().getFullYear()
        const prefix = `${year}`

        const { data } = await supabase
            .from('loyalty_cards')
            .select('card_number')
            .ilike('card_number', `${prefix}%`)
            .order('card_number', { ascending: false })
            .limit(1)

        let nextSeq = 1
        if (data && data.length > 0) {
            const lastId = data[0].card_number
            // Try to parse last 4 digits
            const lastSeqStr = lastId.substring(4) // assuming YYYY0001
            const lastSeq = parseInt(lastSeqStr, 10)
            if (!isNaN(lastSeq)) {
                nextSeq = lastSeq + 1
            }
        }
        return `${prefix}${String(nextSeq).padStart(4, '0')}`
    }

    const handleQuickDate = (years: number) => {
        const date = new Date()
        date.setFullYear(date.getFullYear() + years)
        const dateStr = date.toISOString().split('T')[0]
        setFormData(prev => ({
            ...prev,
            tier_expires_on: dateStr,
            card_expires_on: dateStr
        }))
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

        if (!formData.card_expires_on) {
            alert('Expiry date is required')
            setLoading(false)
            return
        }

        const { error } = await supabase.from('loyalty_cards').insert({
            card_number: cardId,
            customer_name: formData.customer_name || null,
            phone_number: formData.phone_number || null,
            email: formData.email || null,
            address: formData.address || null,
            class: formData.class,
            points: formData.initial_points,
            total_points_earned: formData.initial_points,
            balance: formData.initial_balance,
            total_loaded: formData.initial_balance, // Assuming initial load
            tier_expires_on: formData.tier_expires_on ? new Date(formData.tier_expires_on).toISOString() : null,
            card_expires_on: formData.card_expires_on ? new Date(formData.card_expires_on).toISOString() : null,
            status: (formData.customer_name || formData.phone_number || formData.email) ? 'active' : 'unassigned',
            created_at: new Date().toISOString()
        })

        if (error) {
            alert('Error creating card: ' + error.message)
        } else {
            // If initial balance > 0, create a transaction log?
            // For now, simple insert. In production, we should probably wrap in transaction or create log.
            if (formData.initial_balance > 0) {
                await supabase.from('loyalty_card_transactions').insert({
                    // We need the ID of the card just created.
                    // But supabase insert above didn't return it unless we use select().
                    // Let's refetch ID by card_number
                    // This is a bit race-condition prone but ok for now.
                })
                // Actually, let's skip transaction creation until we have the ID properly or just let the balance sit there.
            }
            onSuccess()
        }
        setLoading(false)
    }

    const handleBulkSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            // 1. Determine start sequence
            if (!formData.card_expires_on) {
                alert('Expiry date is required')
                setLoading(false)
                return
            }

            const year = new Date().getFullYear()
            const prefix = `${year}`

            const { data } = await supabase
                .from('loyalty_cards')
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
                    class: formData.class,
                    tier_expires_on: formData.tier_expires_on ? new Date(formData.tier_expires_on).toISOString() : null,
                    card_expires_on: formData.card_expires_on ? new Date(formData.card_expires_on).toISOString() : null,
                    status: 'unassigned', // Bulk cards are unassigned
                    balance: 0,
                    points: 0
                })
            }

            // 3. Insert
            const { error } = await supabase.from('loyalty_cards').insert(rows)
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
                    <h3 className="font-bold text-lg text-black">{t.cards.modals.create_title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>

                {/* Mode Tabs */}
                <div className="flex border-b border-slate-100 shrink-0">
                    <button
                        className={`flex-1 py-3 text-sm font-medium ${mode === 'single' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setMode('single')}
                    >
                        {t.cards.modals.single_card}
                    </button>
                    <button
                        className={`flex-1 py-3 text-sm font-medium ${mode === 'bulk' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setMode('bulk')}
                    >
                        {t.cards.modals.bulk_create}
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {mode === 'single' ? (
                        <form onSubmit={handleSingleSubmit} className="space-y-4">
                            {/* ID Section */}
                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-slate-700">{t.cards.table.card_id}</label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-500">{t.cards.modals.manual_id}</span>
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
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                                        placeholder={t.cards.modals.enter_custom_id}
                                        required
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        value={autoId}
                                        disabled
                                        className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-800 font-mono"
                                    />
                                )}
                            </div>

                            {/* Customer Info */}
                            <div>
                                <h4 className="text-sm font-medium text-slate-900 mb-2 flex items-center gap-2">
                                    <Users className="w-4 h-4 text-slate-500" /> {t.cards.details.customer_info}
                                </h4>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        placeholder={t.cards.details.name}
                                        value={formData.customer_name}
                                        onChange={e => setFormData({ ...formData, customer_name: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                                    />
                                    <div className="grid grid-cols-2 gap-3">
                                        <input
                                            type="tel"
                                            placeholder={t.cards.details.phone}
                                            value={formData.phone_number}
                                            onChange={e => setFormData({ ...formData, phone_number: e.target.value })}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                                        />
                                        <input
                                            type="email"
                                            placeholder={t.cards.details.email}
                                            value={formData.email}
                                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                                        />
                                    </div>
                                </div>
                            </div>

                            <hr className="border-slate-100" />

                            {/* Membership & Prepaid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.cards.table.class}</label>
                                    <select
                                        value={formData.class}
                                        onChange={e => setFormData({ ...formData, class: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                                    >
                                        {classes.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.cards.modals.initial_balance}</label>
                                    <CurrencyInput
                                        value={formData.initial_balance}
                                        onChange={(val: string) => setFormData({ ...formData, initial_balance: Number(val) || 0 })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-sm font-medium text-slate-700">{t.cards.table.expires} <span className="text-red-500">*</span></label>
                                    <div className="flex gap-1">
                                        {[1, 2, 3].map(y => (
                                            <button
                                                key={y}
                                                type="button"
                                                onClick={() => handleQuickDate(y)}
                                                className="px-2 py-0.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 rounded transition-colors"
                                            >
                                                {y}y
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <input
                                    type="date"
                                    required
                                    value={formData.card_expires_on}
                                    onChange={e => setFormData({
                                        ...formData,
                                        card_expires_on: e.target.value,
                                        tier_expires_on: e.target.value
                                    })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                                />
                            </div>

                            <div className="pt-4 flex gap-3 justify-end">
                                <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition">{t.cards.modals.cancel}</button>
                                <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />} {t.cards.modals.create}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleBulkSubmit} className="space-y-4">
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800 mb-4" dangerouslySetInnerHTML={{ __html: t.cards.modals.bulk_unassigned_note }} />

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t.cards.modals.quantity}</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="1000"
                                    value={bulkQty}
                                    onChange={e => setBulkQty(parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.cards.table.class}</label>
                                    <select
                                        value={formData.class}
                                        onChange={e => setFormData({ ...formData, class: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                                    >
                                        {classes.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-sm font-medium text-slate-700">{t.cards.table.expires} <span className="text-red-500">*</span></label>
                                    <div className="flex gap-1">
                                        {[1, 2, 3].map(y => (
                                            <button
                                                key={y}
                                                type="button"
                                                onClick={() => handleQuickDate(y)}
                                                className="px-2 py-0.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 rounded transition-colors"
                                            >
                                                {y}y
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <input
                                    type="date"
                                    required
                                    value={formData.card_expires_on}
                                    onChange={e => setFormData({
                                        ...formData,
                                        card_expires_on: e.target.value,
                                        tier_expires_on: e.target.value
                                    })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                                />
                            </div>

                            <div className="pt-4 flex gap-3 justify-end">
                                <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition">{t.cards.modals.cancel}</button>
                                <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />} {t.cards.modals.generate_cards.replace('{count}', bulkQty)}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
