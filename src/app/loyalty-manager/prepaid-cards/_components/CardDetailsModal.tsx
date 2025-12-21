'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Loader2, X, Trash, History, CreditCard, Power, Download, Plus, Minus } from 'lucide-react'
import Barcode from 'react-barcode'
import { format, isPast } from 'date-fns'

type PrepaidCard = {
    id: string
    card_number: string
    customer_name: string | null
    phone_number: string | null
    email: string | null
    status: 'active' | 'blocked' | 'expired'
    issued_on: string
    expires_on: string | null
    total_purchased: number
    bonus_amount: number
    balance: number
    created_by: string | null
}

type Transaction = {
    id: string
    type: 'topup' | 'usage' | 'adjustment' | 'log'
    purchase_amount: number
    bonus_amount: number
    total_amount: number
    balance_after: number
    description: string | null
    operator: string | null
    created_at: string
}

type Props = {
    card: PrepaidCard
    bonusPercentage: number
    minTopUpAmount: number
    onClose: () => void
    onUpdate: () => void
}

export default function CardDetailsModal({ card, bonusPercentage, minTopUpAmount, onClose, onUpdate }: Props) {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'details' | 'history'>('details')
    const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false)
    const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false)
    const [currentBalance, setCurrentBalance] = useState(card.balance)
    const barcodeRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        fetchTransactions()
    }, [card.id])

    const fetchTransactions = async () => {
        setLoading(true)
        const { data } = await supabase
            .from('prepaid_card_transactions')
            .select('*')
            .eq('card_id', card.id)
            .order('created_at', { ascending: false })

        if (data) {
            setTransactions(data)
            // Note: We don't update currentBalance from logs, only financial transactions
            // But since logs are just records, checking the latest balance_after is still valid
            // if we assume logs record the current balance at that time.
            if (data.length > 0) {
                // Find latest financial transaction for balance? Or trust the log has correct balance?
                // Ideally logs copy the current balance.
                setCurrentBalance(card.balance) // Always trust the card prop or refetch card? 
                // Actually, let's keep it simple and trust existing logic or card.balance.
                // The existing logic used data[0].balance_after.
                // If a log is the latest, it should record the current balance.
            }
        }
        setLoading(false)
    }

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this card? This action cannot be undone.')) return

        const { error } = await supabase
            .from('prepaid_cards')
            .delete()
            .eq('id', card.id)

        if (error) {
            alert('Error deleting card: ' + error.message)
        } else {
            onUpdate()
        }
    }

    const getDisplayStatus = () => {
        if (card.status === 'active' && card.expires_on && isPast(new Date(card.expires_on))) {
            return 'expired'
        }
        return card.status
    }

    const displayStatus = getDisplayStatus()
    const isActive = displayStatus === 'active'

    const handleBlockToggle = async () => {
        const newStatus = card.status === 'blocked' ? 'active' : 'blocked'
        const action = card.status === 'blocked' ? 'unblock' : 'block'

        if (!confirm(`Are you sure you want to ${action} this card?`)) return

        const { error } = await supabase
            .from('prepaid_cards')
            .update({ status: newStatus })
            .eq('id', card.id)

        if (error) {
            alert(`Error ${action}ing card: ` + error.message)
        } else {
            onUpdate()
        }
    }

    const handleDownloadBarcode = async () => {
        if (!barcodeRef.current) return

        const svg = barcodeRef.current.querySelector('svg')
        if (!svg) return

        // 1. Log the download action
        const operatorName = localStorage.getItem('user.displayName') || localStorage.getItem('user.name') || 'Unknown'

        await supabase.from('prepaid_card_transactions').insert({
            card_id: card.id,
            type: 'log',
            purchase_amount: 0,
            bonus_amount: 0,
            total_amount: 0,
            balance_after: currentBalance, // Record current balance state
            description: 'Barcode downloaded',
            operator: operatorName
        })

        // Refresh transactions to show the log
        fetchTransactions()

        // 2. Perform download
        const svgData = new XMLSerializer().serializeToString(svg)
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const img = new Image()

        img.onload = () => {
            canvas.width = img.width
            canvas.height = img.height
            if (ctx) {
                ctx.drawImage(img, 0, 0)
                const pngFile = canvas.toDataURL('image/png')
                const downloadLink = document.createElement('a')
                downloadLink.download = `prepaid-card-${card.card_number}.png`
                downloadLink.href = pngFile
                downloadLink.click()
            }
        }

        img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                            <CreditCard className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-slate-800 font-mono">{card.card_number}</h3>
                            <p className="text-xs text-slate-500">Prepaid Card</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 shrink-0">
                    <button
                        className={`flex-1 py-3 text-sm font-medium ${activeTab === 'details' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setActiveTab('details')}
                    >
                        Details
                    </button>
                    <button
                        className={`flex-1 py-3 text-sm font-medium ${activeTab === 'history' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setActiveTab('history')}
                    >
                        Transaction History
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {activeTab === 'details' ? (
                        <div className="space-y-6">
                            {/* Balance Card */}
                            <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl text-white shadow-lg shadow-blue-200">
                                <p className="text-sm text-blue-100 mb-1">Current Balance</p>
                                <p className="text-3xl font-bold">{formatCurrency(currentBalance)}</p>
                                <div className="mt-4 flex gap-4 text-sm border-t border-blue-500/30 pt-4">
                                    <div>
                                        <p className="text-blue-200">Total Purchased</p>
                                        <p className="font-medium">{formatCurrency(card.total_purchased || 0)}</p>
                                    </div>
                                    <div>
                                        <p className="text-blue-200">Bonus Earned</p>
                                        <p className="font-medium text-green-300">+{formatCurrency(card.bonus_amount || 0)}</p>
                                    </div>
                                </div>
                                {isActive && (
                                    <div className="mt-6 flex gap-3">
                                        <button
                                            onClick={() => setIsTopUpModalOpen(true)}
                                            className="flex-1 bg-white text-blue-600 hover:bg-blue-50 py-2.5 rounded-lg font-bold transition shadow-sm flex items-center justify-center gap-2"
                                        >
                                            <Plus className="w-5 h-5" /> Top Up
                                        </button>
                                        <button
                                            onClick={() => setIsRedeemModalOpen(true)}
                                            className="flex-1 bg-orange-500 text-white hover:bg-orange-600 py-2.5 rounded-lg font-bold transition shadow-sm flex items-center justify-center gap-2"
                                        >
                                            <Minus className="w-5 h-5" /> Redeem
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Customer Info */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <h4 className="font-medium text-slate-800 mb-3">Customer Information</h4>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-slate-500">Name</p>
                                        <p className="font-medium text-slate-800">{card.customer_name || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">Phone</p>
                                        <p className="font-medium text-slate-800">{card.phone_number || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">Email</p>
                                        <p className="font-medium text-slate-800">{card.email || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">Created By</p>
                                        <p className="font-medium text-slate-800">{card.created_by || '-'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Barcode */}
                            <div className="flex items-center justify-center gap-4 py-4 bg-white rounded-xl border border-slate-200">
                                <div ref={barcodeRef}>
                                    <Barcode value={card.card_number} width={2} height={60} fontSize={16} background="transparent" />
                                </div>
                                <button
                                    onClick={handleDownloadBarcode}
                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                    title="Download Barcode"
                                >
                                    <Download className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Status & Expiry */}
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                                    <div className={`px-3 py-2 border rounded-lg font-medium capitalize flex items-center gap-2 ${displayStatus === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                                        displayStatus === 'blocked' ? 'bg-red-50 text-red-700 border-red-200' :
                                            'bg-slate-100 text-slate-700 border-slate-200'
                                        }`}>
                                        <div className={`w-2 h-2 rounded-full ${displayStatus === 'active' ? 'bg-green-500' :
                                            displayStatus === 'blocked' ? 'bg-red-500' :
                                                'bg-slate-500'
                                            }`} />
                                        {displayStatus}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Expires On</label>
                                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600">
                                        {card.expires_on ? format(new Date(card.expires_on), 'dd/MM/yyyy') : 'Never'}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Issued On</label>
                                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600">
                                    {format(new Date(card.issued_on), 'dd/MM/yyyy HH:mm')}
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                                <button
                                    onClick={handleDelete}
                                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition flex items-center gap-2"
                                >
                                    <Trash className="w-4 h-4" /> Delete
                                </button>

                                <div className="flex gap-2">
                                    <button
                                        onClick={handleBlockToggle}
                                        className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${card.status === 'blocked'
                                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                            : 'text-slate-600 hover:bg-slate-100'
                                            }`}
                                        title={card.status === 'blocked' ? 'Unblock Card' : 'Block Card'}
                                    >
                                        <Power className={`w-4 h-4 ${card.status === 'blocked' ? 'text-red-600' : 'text-slate-400'}`} />
                                        {card.status === 'blocked' ? 'Blocked' : 'Block'}
                                    </button>

                                    {/* Actions moved to Balance Card */}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {loading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                                </div>
                            ) : transactions.length === 0 ? (
                                <div className="text-center py-8 text-slate-500">
                                    No transactions found.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {transactions.map(tx => (
                                        <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === 'topup' ? 'bg-green-100 text-green-600' :
                                                    tx.type === 'usage' ? 'bg-orange-100 text-orange-600' :
                                                        tx.type === 'log' ? 'bg-slate-200 text-slate-600' :
                                                            'bg-blue-100 text-blue-600'
                                                    }`}>
                                                    {tx.type === 'topup' ? <Plus className="w-4 h-4" /> :
                                                        tx.type === 'usage' ? <Minus className="w-4 h-4" /> :
                                                            tx.type === 'log' ? <Download className="w-4 h-4" /> :
                                                                <History className="w-4 h-4" />}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-slate-800 capitalize">
                                                        {tx.type === 'log' ? 'Activity Log' : tx.type}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        {format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}
                                                        {tx.operator && <span className="ml-2">by {tx.operator}</span>}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                {tx.type !== 'log' && (
                                                    <>
                                                        <p className={`font-medium ${tx.type === 'usage' ? 'text-red-600' : 'text-green-600'}`}>
                                                            {tx.type === 'usage' ? '-' : '+'}{formatCurrency(Math.abs(tx.total_amount))}
                                                        </p>
                                                        {tx.type === 'topup' && tx.bonus_amount > 0 && (
                                                            <p className="text-xs text-green-500">+{formatCurrency(tx.bonus_amount)} bonus</p>
                                                        )}
                                                        <p className="text-xs text-slate-400">Balance: {formatCurrency(tx.balance_after)}</p>
                                                    </>
                                                )}
                                                {tx.description && <p className="text-xs text-slate-500 italic">{tx.description}</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {isTopUpModalOpen && (
                <TopUpModal
                    cardId={card.id}
                    currentBalance={currentBalance}
                    bonusPercentage={bonusPercentage}
                    minTopUpAmount={minTopUpAmount}
                    onClose={() => setIsTopUpModalOpen(false)}
                    onSuccess={() => {
                        setIsTopUpModalOpen(false)
                        fetchTransactions()
                        onUpdate()
                    }}
                />
            )}

            {isRedeemModalOpen && (
                <RedeemBalanceModal
                    cardId={card.id}
                    currentBalance={currentBalance}
                    onClose={() => setIsRedeemModalOpen(false)}
                    onSuccess={() => {
                        setIsRedeemModalOpen(false)
                        fetchTransactions()
                        onUpdate()
                    }}
                />
            )}
        </div>
    )
}

function TopUpModal({
    cardId,
    currentBalance,
    bonusPercentage,
    minTopUpAmount,
    onClose,
    onSuccess
}: {
    cardId: string
    currentBalance: number
    bonusPercentage: number
    minTopUpAmount: number
    onClose: () => void
    onSuccess: () => void
}) {
    const [loading, setLoading] = useState(false)
    const [amount, setAmount] = useState(0)
    const [currentUser, setCurrentUser] = useState('')

    // Registration state
    const [needsRegistration, setNeedsRegistration] = useState(false)
    const [customerName, setCustomerName] = useState('')
    const [phoneNumber, setPhoneNumber] = useState('')
    const [email, setEmail] = useState('')

    useEffect(() => {
        const init = async () => {
            // Fetch user
            try {
                const localName = localStorage.getItem('user.displayName') || localStorage.getItem('user.name')
                if (localName) setCurrentUser(localName)
                else {
                    const { data: { user } } = await supabase.auth.getUser()
                    if (user?.email) setCurrentUser(user.email.split('@')[0])
                }
            } catch (e) {
                console.error('Error fetching user:', e)
            }

            // Check if card needs registration
            const { data: card } = await supabase
                .from('prepaid_cards')
                .select('customer_name')
                .eq('id', cardId)
                .single()

            if (card && !card.customer_name) {
                setNeedsRegistration(true)
            }
        }
        init()
    }, [cardId])

    const bonusAmount = Math.round((amount * bonusPercentage) / 100)
    const totalCredit = amount + bonusAmount
    const newBalance = currentBalance + totalCredit

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (amount <= 0) {
            alert('Please enter a valid amount')
            return
        }

        if (amount < minTopUpAmount) {
            alert(`Minimum top-up amount is ${new Intl.NumberFormat('en-US').format(minTopUpAmount)} VND`)
            return
        }

        if (needsRegistration && !customerName) {
            alert('Customer name is required for registration')
            return
        }

        setLoading(true)

        // Update card balance, totals, and potentially customer info
        const { data: currentCard } = await supabase
            .from('prepaid_cards')
            .select('total_purchased, bonus_amount')
            .eq('id', cardId)
            .single()

        const updates: any = {
            balance: newBalance,
            total_purchased: (currentCard?.total_purchased || 0) + amount,
            bonus_amount: (currentCard?.bonus_amount || 0) + bonusAmount
        }

        if (needsRegistration) {
            updates.customer_name = customerName
            updates.phone_number = phoneNumber || null
            updates.email = email || null
        }

        const { error: updateError } = await supabase
            .from('prepaid_cards')
            .update(updates)
            .eq('id', cardId)

        if (updateError) {
            alert('Error updating balance: ' + updateError.message)
            setLoading(false)
            return
        }

        // Create transaction
        const { error: txError } = await supabase.from('prepaid_card_transactions').insert({
            card_id: cardId,
            type: 'topup',
            purchase_amount: amount,
            bonus_amount: bonusAmount,
            total_amount: totalCredit,
            balance_after: newBalance,
            description: 'Top-up',
            operator: currentUser
        })

        if (txError) {
            alert('Error creating transaction: ' + txError.message)
        }

        setLoading(false)
        onSuccess()
    }

    const formatNumber = (num: number) => new Intl.NumberFormat('vi-VN').format(num)

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-slate-800">Top Up Card</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[70vh] space-y-4">
                    {needsRegistration && (
                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg space-y-3">
                            <h4 className="font-semibold text-blue-800 text-sm flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-600"></span> First Usage Registration
                            </h4>
                            <div>
                                <label className="block text-xs font-medium text-blue-700 mb-1">Customer Name *</label>
                                <input
                                    type="text"
                                    required
                                    value={customerName}
                                    onChange={e => setCustomerName(e.target.value)}
                                    className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 text-sm"
                                    placeholder="Enter full name"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-blue-700 mb-1">Phone</label>
                                    <input
                                        type="tel"
                                        value={phoneNumber}
                                        onChange={e => setPhoneNumber(e.target.value)}
                                        className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-blue-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Amount (VND)</label>
                        <input
                            type="text"
                            value={amount > 0 ? new Intl.NumberFormat('en-US').format(amount) : ''}
                            onChange={e => {
                                const val = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0
                                setAmount(val)
                            }}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono text-lg"
                            placeholder="0"
                            autoFocus
                        />
                    </div>

                    {amount > 0 && (
                        <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                            <div className="flex justify-between text-sm text-slate-600 mb-1">
                                <span>Purchase Amount:</span>
                                <span>{formatNumber(amount)} ₫</span>
                            </div>
                            <div className="flex justify-between text-sm text-green-600 mb-1">
                                <span>Bonus ({bonusPercentage}%):</span>
                                <span>+{formatNumber(bonusAmount)} ₫</span>
                            </div>
                            <div className="flex justify-between font-bold text-slate-800 pt-2 border-t border-green-200">
                                <span>Credit Added:</span>
                                <span>{formatNumber(totalCredit)} ₫</span>
                            </div>
                            <div className="flex justify-between text-sm text-slate-500 mt-2">
                                <span>New Balance:</span>
                                <span className="font-medium">{formatNumber(newBalance)} ₫</span>
                            </div>
                        </div>
                    )}

                    <div className="text-sm text-slate-500">
                        Operator: <span className="font-medium text-slate-700">{currentUser || 'Unknown'}</span>
                    </div>

                    <div className="flex gap-3 justify-end pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || amount <= 0 || amount < minTopUpAmount}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            Top Up
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

function RedeemBalanceModal({
    cardId,
    currentBalance,
    onClose,
    onSuccess
}: {
    cardId: string
    currentBalance: number
    onClose: () => void
    onSuccess: () => void
}) {
    const [loading, setLoading] = useState(false)
    const [amount, setAmount] = useState(0)
    const [description, setDescription] = useState('')
    const [currentUser, setCurrentUser] = useState('')

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const localName = localStorage.getItem('user.displayName') || localStorage.getItem('user.name')
                if (localName) {
                    setCurrentUser(localName)
                    return
                }

                const { data: { user } } = await supabase.auth.getUser()
                if (user?.email) {
                    setCurrentUser(user.email.split('@')[0])
                }
            } catch (e) {
                console.error('Error fetching user:', e)
            }
        }
        fetchUser()
    }, [])

    const newBalance = currentBalance - amount

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (amount <= 0) {
            alert('Please enter a valid amount')
            return
        }
        if (amount > currentBalance) {
            alert('Insufficient balance')
            return
        }

        setLoading(true)

        // Update card balance
        const { error: updateError } = await supabase
            .from('prepaid_cards')
            .update({ balance: newBalance })
            .eq('id', cardId)

        if (updateError) {
            alert('Error updating balance: ' + updateError.message)
            setLoading(false)
            return
        }

        // Create transaction
        const { error: txError } = await supabase.from('prepaid_card_transactions').insert({
            card_id: cardId,
            type: 'usage',
            purchase_amount: 0,
            bonus_amount: 0,
            total_amount: -amount,
            balance_after: newBalance,
            description: description || 'Payment',
            operator: currentUser
        })

        if (txError) {
            alert('Error creating transaction: ' + txError.message)
        }

        setLoading(false)
        onSuccess()
    }

    const formatNumber = (num: number) => new Intl.NumberFormat('vi-VN').format(num)

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-slate-800">Redeem Balance</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="p-3 bg-blue-50 rounded-lg text-sm">
                        <span className="text-slate-600">Available Balance: </span>
                        <span className="font-bold text-blue-600">{formatNumber(currentBalance)} ₫</span>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Redeem Amount (VND)</label>
                        <input
                            type="text"
                            value={amount > 0 ? new Intl.NumberFormat('en-US').format(amount) : ''}
                            onChange={e => {
                                const val = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0
                                setAmount(val)
                            }}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono text-lg"
                            placeholder="0"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Description (optional)</label>
                        <input
                            type="text"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                            placeholder="e.g. Bill #1234"
                        />
                    </div>

                    {amount > 0 && (
                        <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                            <div className="flex justify-between text-sm text-slate-600 mb-1">
                                <span>Amount to Deduct:</span>
                                <span className="text-orange-600">-{formatNumber(amount)} ₫</span>
                            </div>
                            <div className="flex justify-between font-bold text-slate-800 pt-2 border-t border-orange-200">
                                <span>New Balance:</span>
                                <span>{formatNumber(newBalance)} ₫</span>
                            </div>
                        </div>
                    )}

                    <div className="text-sm text-slate-500">
                        Operator: <span className="font-medium text-slate-700">{currentUser || 'Unknown'}</span>
                    </div>

                    <div className="flex gap-3 justify-end pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || amount <= 0 || amount > currentBalance}
                            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition disabled:opacity-50 flex items-center gap-2"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            Confirm Redemption
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
