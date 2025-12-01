'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Loader2, User, CreditCard, Calendar, Phone, Mail, MapPin, Edit, UserPlus, Gift, X } from 'lucide-react'
import { format } from 'date-fns'

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

type Props = {
    card: MembershipCard
    onClose: () => void
    onUpdate: () => void
}

export default function CardDetailsModal({ card, onClose, onUpdate }: Props) {
    const [mode, setMode] = useState<'view' | 'edit' | 'assign' | 'redeem'>('view')
    const [loading, setLoading] = useState(false)

    // Edit/Assign Form State
    const [formData, setFormData] = useState({
        customer_name: card.customer_name || '',
        phone_number: card.phone_number || '',
        email: card.email || '',
        address: card.address || '',
        class: card.class || 'Standard',
        expires_on: card.expires_on ? new Date(card.expires_on).toISOString().split('T')[0] : ''
    })

    // Redeem State
    const [redeemPoints, setRedeemPoints] = useState<number>(0)

    useEffect(() => {
        if (card.status === 'unassigned') {
            setMode('assign')
        }
    }, [card.status])

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const updates: any = {
            customer_name: formData.customer_name,
            phone_number: formData.phone_number,
            email: formData.email,
            address: formData.address,
            class: formData.class,
            expires_on: formData.expires_on ? new Date(formData.expires_on).toISOString() : null
        }

        if (mode === 'assign') {
            updates.status = 'active'
            updates.issued_on = new Date().toISOString()
        }

        const { error } = await supabase
            .from('membership_cards')
            .update(updates)
            .eq('id', card.id)

        setLoading(false)
        if (error) {
            alert('Error updating card: ' + error.message)
        } else {
            onUpdate()
            if (mode === 'assign') onClose()
            else setMode('view')
        }
    }

    const handleRedeem = async (e: React.FormEvent) => {
        e.preventDefault()
        if (redeemPoints <= 0) return
        if (redeemPoints > (card.points || 0)) {
            alert('Insufficient points')
            return
        }

        setLoading(true)
        const { error } = await supabase
            .from('membership_cards')
            .update({ points: (card.points || 0) - redeemPoints })
            .eq('id', card.id)

        setLoading(false)
        if (error) {
            alert('Error redeeming points: ' + error.message)
        } else {
            onUpdate()
            setMode('view')
            setRedeemPoints(0)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                            <CreditCard className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-slate-800">{card.card_number}</h3>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${card.status === 'active' ? 'bg-green-100 text-green-700' :
                                    card.status === 'unassigned' ? 'bg-slate-100 text-slate-700' :
                                        'bg-red-100 text-red-700'
                                }`}>
                                {card.status.toUpperCase()}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {mode === 'view' && (
                        <div className="space-y-6">
                            {/* Points & Value */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                                    <div className="text-amber-600 text-xs font-semibold uppercase tracking-wider mb-1">Points Balance</div>
                                    <div className="text-2xl font-bold text-amber-900">{card.points || 0}</div>
                                </div>
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                    <div className="text-blue-600 text-xs font-semibold uppercase tracking-wider mb-1">Total Value</div>
                                    <div className="text-2xl font-bold text-blue-900">
                                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(card.total_value)}
                                    </div>
                                </div>
                            </div>

                            {/* Customer Details */}
                            <div className="space-y-3">
                                <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                                    <User className="w-4 h-4 text-slate-400" /> Customer Details
                                </h4>
                                <div className="grid grid-cols-1 gap-3 text-sm">
                                    <div className="flex items-center gap-3 text-slate-600">
                                        <User className="w-4 h-4 shrink-0 opacity-50" />
                                        <span className="font-medium text-slate-900">{card.customer_name || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-slate-600">
                                        <Phone className="w-4 h-4 shrink-0 opacity-50" />
                                        <span>{card.phone_number || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-slate-600">
                                        <Mail className="w-4 h-4 shrink-0 opacity-50" />
                                        <span>{card.email || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-slate-600">
                                        <MapPin className="w-4 h-4 shrink-0 opacity-50" />
                                        <span>{card.address || 'N/A'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Card Details */}
                            <div className="space-y-3 pt-2 border-t border-slate-100">
                                <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                                    <CreditCard className="w-4 h-4 text-slate-400" /> Card Info
                                </h4>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-slate-500 block text-xs">Class</span>
                                        <span className="font-medium text-slate-900">{card.class}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 block text-xs">Issued On</span>
                                        <span className="font-medium text-slate-900">{format(new Date(card.issued_on), 'dd/MM/yyyy')}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 block text-xs">Expires On</span>
                                        <span className="font-medium text-slate-900">
                                            {card.expires_on ? format(new Date(card.expires_on), 'dd/MM/yyyy') : 'Never'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-4 border-t border-slate-100">
                                <button
                                    onClick={() => setMode('edit')}
                                    className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium flex items-center justify-center gap-2 transition"
                                >
                                    <Edit className="w-4 h-4" /> Edit Details
                                </button>
                                <button
                                    onClick={() => setMode('redeem')}
                                    className="flex-1 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-100 font-medium flex items-center justify-center gap-2 transition"
                                >
                                    <Gift className="w-4 h-4" /> Redeem Points
                                </button>
                            </div>
                        </div>
                    )}

                    {(mode === 'edit' || mode === 'assign') && (
                        <form onSubmit={handleUpdate} className="space-y-4">
                            <h4 className="font-semibold text-slate-900 mb-4">
                                {mode === 'assign' ? 'Assign Card' : 'Edit Details'}
                            </h4>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name</label>
                                <input
                                    type="text"
                                    required={mode === 'assign'}
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
                                <button
                                    type="button"
                                    onClick={() => mode === 'assign' ? onClose() : setMode('view')}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                                >
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {mode === 'assign' ? 'Assign Card' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    )}

                    {mode === 'redeem' && (
                        <form onSubmit={handleRedeem} className="space-y-4">
                            <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                <Gift className="w-5 h-5 text-amber-500" /> Redeem Points
                            </h4>

                            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 text-center">
                                <div className="text-sm text-amber-800 mb-1">Available Points</div>
                                <div className="text-3xl font-bold text-amber-900">{card.points || 0}</div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Points to Redeem</label>
                                <input
                                    type="number"
                                    min="1"
                                    max={card.points || 0}
                                    required
                                    value={redeemPoints || ''}
                                    onChange={e => setRedeemPoints(parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
                                    placeholder="0"
                                />
                            </div>

                            <div className="pt-4 flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setMode('view')}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || redeemPoints <= 0 || redeemPoints > (card.points || 0)}
                                    className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition disabled:opacity-50 flex items-center gap-2"
                                >
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />} Confirm Redemption
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
