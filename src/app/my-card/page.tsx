'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Loader2, CreditCard, History, Wallet, Star } from 'lucide-react'
import Barcode from 'react-barcode'
import { format } from 'date-fns'

type LoyaltyCard = {
    id: string
    card_number: string
    customer_name: string | null
    phone_number: string | null
    class: string
    points: number
    balance: number
    status: 'active' | 'blocked' | 'expired' | 'unassigned'
    card_expires_on: string | null
}

type Transaction = {
    id: string
    type: string
    total_amount: number
    created_at: string
    description: string | null
}

export default function MyCardPage() {
    const [view, setView] = useState<'login' | 'dashboard'>('login')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Login Form
    const [cardNumber, setCardNumber] = useState('')
    const [phone, setPhone] = useState('')

    // Card Data
    const [card, setCard] = useState<LoyaltyCard | null>(null)
    const [transactions, setTransactions] = useState<Transaction[]>([])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            // 1. Fetch Card
            const { data: cardData, error: cardError } = await supabase
                .from('loyalty_cards')
                .select('*')
                .eq('card_number', cardNumber)
                .eq('phone_number', phone) // Strict match
                .single()

            if (cardError || !cardData) {
                throw new Error('Invalid Card ID or Phone Number')
            }

            if (cardData.status !== 'active') {
                throw new Error(`Card is ${cardData.status}`)
            }

            // 2. Fetch Transactions (Last 10)
            const { data: txnData } = await supabase
                .from('loyalty_card_transactions')
                .select('*')
                .eq('card_id', cardData.id)
                .order('created_at', { ascending: false })
                .limit(10)

            setCard(cardData)
            setTransactions(txnData || [])
            setView('dashboard')
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleLogout = () => {
        setCard(null)
        setTransactions([])
        setCardNumber('')
        setPhone('')
        setView('login')
    }

    if (view === 'login') {
        return (
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">My Loyalty Card</h1>
                    <p className="text-slate-500 text-sm">Enter your details to check balance</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    {error && (
                        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg text-center">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Card Number</label>
                        <input
                            type="text"
                            value={cardNumber}
                            onChange={e => setCardNumber(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                            placeholder="e.g. 20240001"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                            placeholder="e.g. 0912345678"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-lg shadow-blue-200 flex justify-center items-center"
                    >
                        {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Check Balance'}
                    </button>
                </form>
            </div>
        )
    }

    // Dashboard View
    if (!card) return null

    return (
        <div className="w-full max-w-md space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center px-2">
                <div>
                    <h2 className="font-bold text-lg text-slate-800">Welcome, {card.customer_name || 'Customer'}</h2>
                    <p className="text-slate-500 text-xs">Card: {card.card_number}</p>
                </div>
                <button onClick={handleLogout} className="text-sm text-blue-600 font-medium">Exit</button>
            </div>

            {/* Digital Card */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                {/* Abstract circles */}
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/5 rounded-full blur-2xl" />

                <div className="relative z-10 flex justify-between items-start mb-8">
                    <div>
                        <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Loyalty Card</p>
                        <p className="font-mono text-xl tracking-wider">{card.card_number}</p>
                    </div>
                    <div className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase border border-white/10">
                        {card.class}
                    </div>
                </div>

                <div className="relative z-10 bg-white p-2 rounded-lg inline-block">
                    <Barcode value={card.card_number} width={1.5} height={40} displayValue={false} margin={0} />
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-2">
                        <Wallet className="w-5 h-5" />
                    </div>
                    <p className="text-slate-400 text-xs font-medium uppercase mb-1">Balance</p>
                    <p className="text-xl font-bold text-slate-900">
                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(card.balance)}
                    </p>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
                    <div className="w-10 h-10 bg-yellow-50 text-yellow-600 rounded-full flex items-center justify-center mb-2">
                        <Star className="w-5 h-5" />
                    </div>
                    <p className="text-slate-400 text-xs font-medium uppercase mb-1">Points</p>
                    <p className="text-xl font-bold text-slate-900">{card.points}</p>
                </div>
            </div>

            {/* Transactions */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-50 flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-400" />
                    <h3 className="font-bold text-slate-800 text-sm">Recent Activity</h3>
                </div>

                <div className="divide-y divide-slate-50">
                    {transactions.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-sm">No recent transactions</div>
                    ) : (
                        transactions.map(txn => (
                            <div key={txn.id} className="p-4 flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-medium text-slate-900 capitalize">{txn.type.replace('_', ' ')}</p>
                                    <p className="text-xs text-slate-400">{format(new Date(txn.created_at), 'dd MMM yyyy, HH:mm')}</p>
                                </div>
                                <div className={`font-bold text-sm ${txn.type === 'topup' ? 'text-green-600' : 'text-slate-700'
                                    }`}>
                                    {txn.type === 'topup' ? '+' : ''}
                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(txn.total_amount)}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
