'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Loader2, User, CreditCard, Calendar, Phone, Mail, MapPin, Edit, UserPlus, Gift, X, Clock, Trash2, Save } from 'lucide-react'
import { format } from 'date-fns'
import Barcode from 'react-barcode'

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

type Reward = {
    name: string
    cost: number
}

type LoyaltyClass = {
    name: string
    method: 'value' | 'points'
    threshold: number
    points_ratio: number
    redemption_ratio: number
    color?: string
}

type LoyaltySettings = {
    classes: LoyaltyClass[]
    rewards: Reward[]
}

type Props = {
    card: MembershipCard
    onClose: () => void
    onUpdate: () => void
}

export default function CardDetailsModal({ card, onClose, onUpdate }: Props) {
    const [mode, setMode] = useState<'view' | 'edit' | 'assign' | 'redeem-cashback' | 'redeem-reward' | 'add-transaction' | 'history' | 'edit-transaction'>('view')
    const [loading, setLoading] = useState(false)
    const [settings, setSettings] = useState<LoyaltySettings | null>(null)

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
    const [selectedRewardIdx, setSelectedRewardIdx] = useState<number>(-1)
    const [transactions, setTransactions] = useState<any[]>([])

    // Edit Transaction State
    const [editingTx, setEditingTx] = useState<any>(null)

    useEffect(() => {
        if (card.status === 'unassigned') {
            setMode('assign')
        }
        fetchSettings()
        fetchTransactions()
    }, [card.status, card.id])

    const fetchTransactions = async () => {
        const { data } = await supabase
            .from('loyalty_transactions')
            .select('*')
            .eq('card_id', card.id)
            .order('created_at', { ascending: false })

        if (data) {
            setTransactions(data)
        }
    }

    const fetchSettings = async () => {
        const { data } = await supabase
            .from('loyalty_settings')
            .select('*')
            .single()
        if (data) {
            // Migrate old data if needed or set defaults
            const rawClasses = Array.isArray(data.classes) ? data.classes : []
            const classes = rawClasses.map((c: any) => ({
                ...c,
                points_ratio: c.points_ratio || data.points_ratio || 1000,
                redemption_ratio: c.redemption_ratio || data.redemption_ratio || 100,
                color: c.color || '#3b82f6'
            }))

            const rawRewards = Array.isArray(data.rewards) ? data.rewards : []
            const rewards = rawRewards.map((r: any) => ({
                name: r.name,
                cost: r.cost
            }))

            setSettings({
                classes,
                rewards
            })
        }
    }

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

        let pointsToDeduct = 0
        let type = ''
        let description = ''
        let amount = 0

        if (mode === 'redeem-cashback') {
            if (redeemPoints <= 0) return
            pointsToDeduct = redeemPoints
            type = 'redeem_cashback'
            amount = redeemPoints * redemptionRatio
            description = `Cashback redemption: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)}`
        } else if (mode === 'redeem-reward') {
            const reward = settings?.rewards[selectedRewardIdx]
            if (!reward) return
            pointsToDeduct = reward.cost
            type = 'redeem_reward'
            description = `Reward redemption: ${reward.name}`
        }

        if (pointsToDeduct <= 0) return
        if (pointsToDeduct > (card.points || 0)) {
            alert('Insufficient points')
            return
        }

        setLoading(true)

        // Update card points
        const { error: updateError } = await supabase
            .from('membership_cards')
            .update({ points: (card.points || 0) - pointsToDeduct })
            .eq('id', card.id)

        if (updateError) {
            setLoading(false)
            alert('Error redeeming points: ' + updateError.message)
            return
        }

        // Insert transaction
        await supabase.from('loyalty_transactions').insert({
            card_id: card.id,
            type,
            amount: 0, // Redemption doesn't add value, but we could store the equivalent value if needed
            points: -pointsToDeduct,
            description
        })

        setLoading(false)
        onUpdate()
        fetchTransactions()
        setMode('view')
        setRedeemPoints(0)
        setSelectedRewardIdx(-1)
    }

    const currentClass = settings?.classes.find(c => c.name === card.class)
    const redemptionRatio = currentClass?.redemption_ratio || 100 // Default fallback
    const selectedReward = settings?.rewards[selectedRewardIdx]

    const [transactionAmount, setTransactionAmount] = useState<number>(0)

    const determineClass = (totalValue: number, points: number) => {
        let newClassName = card.class
        if (settings?.classes) {
            const sortedClasses = [...settings.classes].sort((a, b) => b.threshold - a.threshold)
            for (const cls of sortedClasses) {
                const valueToCheck = cls.method === 'points' ? points : totalValue
                if (valueToCheck >= cls.threshold) {
                    newClassName = cls.name
                    break
                }
            }
        }
        return newClassName
    }

    const handleAddTransaction = async (e: React.FormEvent) => {
        e.preventDefault()
        if (transactionAmount <= 0) return

        const pointsRatio = currentClass?.points_ratio || 1000
        const earnedPoints = Math.floor(transactionAmount / pointsRatio)

        setLoading(true)

        const newTotalValue = (card.total_value || 0) + transactionAmount
        const newPoints = (card.points || 0) + earnedPoints
        const newClassName = determineClass(newTotalValue, newPoints)

        // Update card
        const { error: updateError } = await supabase
            .from('membership_cards')
            .update({
                total_value: newTotalValue,
                points: newPoints,
                last_used: new Date().toISOString(),
                class: newClassName
            })
            .eq('id', card.id)

        if (updateError) {
            setLoading(false)
            alert('Error adding transaction: ' + updateError.message)
            return
        }

        // Insert transaction
        await supabase.from('loyalty_transactions').insert({
            card_id: card.id,
            type: 'earn',
            amount: transactionAmount,
            points: earnedPoints,
            description: 'Purchase'
        })

        setLoading(false)
        onUpdate()
        fetchTransactions()
        setMode('view')
        setTransactionAmount(0)
    }

    const handleDeleteTransaction = async (tx: any) => {
        if (!confirm('Are you sure you want to delete this transaction? This will revert the points and value changes.')) return

        setLoading(true)

        // Revert card values
        const newTotalValue = (card.total_value || 0) - (tx.amount || 0)
        const newPoints = (card.points || 0) - (tx.points || 0)
        // We don't downgrade class automatically on deletion usually, but let's keep it simple and just update values.
        // If we wanted to re-check class, we could call determineClass(newTotalValue, newPoints)

        const { error: updateError } = await supabase
            .from('membership_cards')
            .update({
                total_value: newTotalValue,
                points: newPoints
            })
            .eq('id', card.id)

        if (updateError) {
            setLoading(false)
            alert('Error reverting card values: ' + updateError.message)
            return
        }

        const { error: deleteError } = await supabase
            .from('loyalty_transactions')
            .delete()
            .eq('id', tx.id)

        if (deleteError) {
            setLoading(false)
            alert('Error deleting transaction: ' + deleteError.message)
            return
        }

        setLoading(false)
        onUpdate()
        fetchTransactions()
    }

    const handleEditTransaction = (tx: any) => {
        setEditingTx({
            ...tx,
            created_at: new Date(tx.created_at).toISOString().slice(0, 16) // Format for datetime-local
        })
        setMode('edit-transaction')
    }

    const handleSaveTransaction = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingTx) return

        setLoading(true)

        // Find original tx to calculate diffs
        const originalTx = transactions.find(t => t.id === editingTx.id)
        if (!originalTx) {
            setLoading(false)
            return
        }

        const diffAmount = (editingTx.amount || 0) - (originalTx.amount || 0)
        const diffPoints = (editingTx.points || 0) - (originalTx.points || 0)

        if (diffAmount !== 0 || diffPoints !== 0) {
            const newTotalValue = (card.total_value || 0) + diffAmount
            const newPoints = (card.points || 0) + diffPoints
            const newClassName = determineClass(newTotalValue, newPoints)

            const { error: updateCardError } = await supabase
                .from('membership_cards')
                .update({
                    total_value: newTotalValue,
                    points: newPoints,
                    class: newClassName
                })
                .eq('id', card.id)

            if (updateCardError) {
                setLoading(false)
                alert('Error updating card: ' + updateCardError.message)
                return
            }
        }

        const { error: updateTxError } = await supabase
            .from('loyalty_transactions')
            .update({
                created_at: new Date(editingTx.created_at).toISOString(),
                description: editingTx.description,
                amount: editingTx.amount,
                points: editingTx.points
            })
            .eq('id', editingTx.id)

        if (updateTxError) {
            setLoading(false)
            alert('Error updating transaction: ' + updateTxError.message)
            return
        }

        setLoading(false)
        onUpdate()
        fetchTransactions()
        setMode('history')
        setEditingTx(null)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                            <CreditCard className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="font-bold text-base text-slate-800">{card.card_number}</h3>
                            <span
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                                style={{
                                    backgroundColor: currentClass?.color || '#e2e8f0',
                                    color: '#ffffff'
                                }}
                            >
                                {card.class.toUpperCase()}
                            </span>
                            <span className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${card.status === 'active' ? 'bg-green-100 text-green-700' :
                                card.status === 'unassigned' ? 'bg-slate-100 text-slate-700' :
                                    'bg-red-100 text-red-700'
                                }`}>
                                {card.status.toUpperCase()}
                            </span>
                        </div>
                    </div>
                    <div className="hidden sm:block">
                        <Barcode value={card.card_number} width={1} height={25} fontSize={10} displayValue={false} margin={0} />
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 overflow-y-auto">
                    {mode === 'view' && (
                        <div className="space-y-4">
                            {/* Points & Value */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-amber-50 p-3 rounded-xl border border-amber-100">
                                    <div className="text-amber-600 text-[10px] font-semibold uppercase tracking-wider mb-0.5">Points Balance</div>
                                    <div className="text-xl font-bold text-amber-900">{card.points || 0}</div>
                                </div>
                                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                                    <div className="text-blue-600 text-[10px] font-semibold uppercase tracking-wider mb-0.5">Total Value</div>
                                    <div className="text-xl font-bold text-blue-900">
                                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(card.total_value)}
                                    </div>
                                </div>
                            </div>

                            {/* Customer Details */}
                            <div className="space-y-2">
                                <h4 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
                                    <User className="w-3.5 h-3.5 text-slate-400" /> Customer Details
                                </h4>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <User className="w-3.5 h-3.5 shrink-0 opacity-50" />
                                        <span className="font-medium text-slate-900 truncate">{card.customer_name || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <Phone className="w-3.5 h-3.5 shrink-0 opacity-50" />
                                        <span className="truncate">{card.phone_number || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <Mail className="w-3.5 h-3.5 shrink-0 opacity-50" />
                                        <span className="truncate">{card.email || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <MapPin className="w-3.5 h-3.5 shrink-0 opacity-50" />
                                        <span className="truncate">{card.address || 'N/A'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Card Details */}
                            <div className="space-y-2 pt-2 border-t border-slate-100">
                                <h4 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
                                    <CreditCard className="w-3.5 h-3.5 text-slate-400" /> Card Info
                                </h4>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div>
                                        <span className="text-slate-500 block text-[10px]">Class</span>
                                        <span className="font-medium text-slate-900">{card.class}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 block text-[10px]">Issued On</span>
                                        <span className="font-medium text-slate-900">{format(new Date(card.issued_on), 'dd/MM/yyyy')}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 block text-[10px]">Expires On</span>
                                        <span className="font-medium text-slate-900">
                                            {card.expires_on ? format(new Date(card.expires_on), 'dd/MM/yyyy') : 'Never'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="space-y-2 pt-3 border-t border-slate-100">
                                <button
                                    onClick={() => setMode('add-transaction')}
                                    className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2 transition shadow-sm text-sm"
                                >
                                    <CreditCard className="w-4 h-4" /> Add Transaction
                                </button>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setMode('history')}
                                        className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition flex items-center justify-center"
                                        title="Transaction History"
                                    >
                                        <Clock className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setMode('edit')}
                                        className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition flex items-center justify-center"
                                        title="Edit Details"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setMode('redeem-cashback')}
                                        className="flex-1 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg hover:bg-green-100 font-medium flex items-center justify-center gap-1.5 transition text-xs"
                                    >
                                        <Gift className="w-3.5 h-3.5" /> Cashback
                                    </button>
                                    <button
                                        onClick={() => setMode('redeem-reward')}
                                        className="flex-1 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-100 font-medium flex items-center justify-center gap-1.5 transition text-xs"
                                    >
                                        <Gift className="w-3.5 h-3.5" /> Reward
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {mode === 'history' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                                    <Calendar className="w-5 h-5 text-slate-500" /> Transaction History
                                </h4>
                                <button
                                    onClick={() => setMode('view')}
                                    className="text-sm text-slate-500 hover:text-slate-700"
                                >
                                    Back
                                </button>
                            </div>

                            <div className="max-h-[60vh] overflow-y-auto space-y-2">
                                {transactions.length === 0 ? (
                                    <div className="text-center py-8 text-slate-500 italic">No transactions yet.</div>
                                ) : (
                                    transactions.map((tx) => (
                                        <div key={tx.id} className="flex justify-between items-center text-sm p-3 rounded-lg bg-slate-50 border border-slate-100 group">
                                            <div className="flex-1">
                                                <div className="font-medium text-slate-900">{tx.description}</div>
                                                <div className="text-xs text-slate-500">{format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}</div>
                                            </div>
                                            <div className="text-right mr-3">
                                                <div className={`font-bold ${tx.points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {tx.points > 0 ? '+' : ''}{tx.points} pts
                                                </div>
                                                {tx.amount > 0 && (
                                                    <div className="text-xs text-slate-600">
                                                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleEditTransaction(tx)}
                                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                                    title="Edit"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteTransaction(tx)}
                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {mode === 'edit-transaction' && editingTx && (
                        <form onSubmit={handleSaveTransaction} className="space-y-4">
                            <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                <Edit className="w-5 h-5 text-blue-600" /> Edit Transaction
                            </h4>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Date & Time</label>
                                <input
                                    type="datetime-local"
                                    required
                                    value={editingTx.created_at}
                                    onChange={e => setEditingTx({ ...editingTx, created_at: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                <input
                                    type="text"
                                    required
                                    value={editingTx.description}
                                    onChange={e => setEditingTx({ ...editingTx, description: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Amount (VND)</label>
                                    <input
                                        type="number"
                                        value={editingTx.amount}
                                        onChange={e => setEditingTx({ ...editingTx, amount: parseInt(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Points</label>
                                    <input
                                        type="number"
                                        value={editingTx.points}
                                        onChange={e => setEditingTx({ ...editingTx, points: parseInt(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                    />
                                </div>
                            </div>

                            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-xs text-yellow-800">
                                <strong>Warning:</strong> Changing Amount or Points will automatically update the card's total balance and points.
                            </div>

                            <div className="pt-4 flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('history')
                                        setEditingTx(null)
                                    }}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                                >
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
                                </button>
                            </div>
                        </form>
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
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                                    <input
                                        type="tel"
                                        value={formData.phone_number}
                                        onChange={e => setFormData({ ...formData, phone_number: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                                <input
                                    type="text"
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Class</label>
                                    <select
                                        value={formData.class}
                                        onChange={e => setFormData({ ...formData, class: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
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
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
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

                    {mode === 'add-transaction' && (
                        <form onSubmit={handleAddTransaction} className="space-y-4">
                            <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-blue-600" /> Add Transaction
                            </h4>

                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <div className="text-sm text-blue-800 mb-2">
                                    Enter the transaction amount. Points will be automatically calculated based on the <strong>{card.class}</strong> class rate (1 pt / {currentClass?.points_ratio || 1000} VND).
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Transaction Amount (VND)</label>
                                <input
                                    type="number"
                                    min="0"
                                    required
                                    value={transactionAmount || ''}
                                    onChange={e => setTransactionAmount(parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 text-lg font-medium"
                                    placeholder="0"
                                    autoFocus
                                />
                            </div>

                            {transactionAmount > 0 && (
                                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <span className="text-slate-600">Points to Earn:</span>
                                    <span className="text-green-600 font-bold text-lg">
                                        +{Math.floor(transactionAmount / (currentClass?.points_ratio || 1000))} pts
                                    </span>
                                </div>
                            )}

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
                                    disabled={loading || transactionAmount <= 0}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                                >
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />} Confirm Transaction
                                </button>
                            </div>
                        </form>
                    )}

                    {mode === 'redeem-cashback' && (
                        <form onSubmit={handleRedeem} className="space-y-4">
                            <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                <Gift className="w-5 h-5 text-green-500" /> Redeem Cashback
                            </h4>

                            <div className="bg-green-50 p-4 rounded-lg border border-green-100 text-center">
                                <div className="text-sm text-green-800 mb-1">Available Points</div>
                                <div className="text-3xl font-bold text-green-900">{card.points || 0}</div>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Points to Redeem</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max={card.points || 0}
                                        required
                                        value={redeemPoints || ''}
                                        onChange={e => setRedeemPoints(parseInt(e.target.value))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                        placeholder="Enter points..."
                                    />
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                                    <span className="text-xs text-slate-500">Exchange Value ({redemptionRatio} VND/pt)</span>
                                    <span className="text-green-600 font-bold">
                                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                                            (redeemPoints || 0) * redemptionRatio
                                        )}
                                    </span>
                                </div>
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
                                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:opacity-50 flex items-center gap-2"
                                >
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />} Confirm Cashback
                                </button>
                            </div>
                        </form>
                    )}

                    {mode === 'redeem-reward' && (
                        <form onSubmit={handleRedeem} className="space-y-4">
                            <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                <Gift className="w-5 h-5 text-amber-500" /> Redeem Reward
                            </h4>

                            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 text-center">
                                <div className="text-sm text-amber-800 mb-1">Available Points</div>
                                <div className="text-3xl font-bold text-amber-900">{card.points || 0}</div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Select Reward</label>
                                <select
                                    value={selectedRewardIdx}
                                    onChange={e => {
                                        setSelectedRewardIdx(Number(e.target.value))
                                    }}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                >
                                    <option value={-1}>Select a reward...</option>
                                    {settings?.rewards.map((reward, idx) => (
                                        <option key={idx} value={idx}>
                                            {reward.name} ({reward.cost} pts)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {selectedReward && (
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                                    <span className="text-slate-700 font-medium">{selectedReward.name}</span>
                                    <span className="text-amber-600 font-bold">{selectedReward.cost} pts</span>
                                </div>
                            )}

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
                                    disabled={
                                        loading ||
                                        selectedRewardIdx === -1 ||
                                        (selectedReward && selectedReward.cost > (card.points || 0))
                                    }
                                    className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition disabled:opacity-50 flex items-center gap-2"
                                >
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />} Confirm Reward
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
