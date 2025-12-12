'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'
import {
    CreditCard,
    X,
    History,
    Plus,
    Minus,
    Trash,
    Trash2,
    Power,
    Download,
    Wallet,
    Star,
    Gift,
    Coins,
    ShoppingBag,
    User,
    Loader2,
    ArrowDownLeft, // Topup
    Ban, // Deleted log
    RotateCw, // Re-issue
    Lock // Block icon
} from 'lucide-react'
import Barcode from 'react-barcode'
import { format, isPast } from 'date-fns'
import { LoyaltyCard } from '../types'

type Transaction = {
    id: string
    type: 'topup' | 'usage' | 'adjustment' | 'log'
    purchase_amount: number
    bonus_amount: number
    total_amount: number
    balance_after: number
    points_change: number | null
    description: string | null
    operator: string | null
    created_at: string
    is_voided?: boolean
}

type Props = {
    card: LoyaltyCard
    bonusPercentage?: number
    minTopUpAmount?: number

    pointsRatio?: number
    redemptionRatio?: number
    rewards?: any[]
    onClose: () => void
    onUpdate: () => void
    t: any
}

const parseCurrency = (value: string) => {
    return Number(value.replace(/,/g, ''))
}

const formatInputCurrency = (value: number | string) => {
    if (!value) return ''
    return new Intl.NumberFormat('en-US').format(Number(value))
}

const CurrencyInput = ({ value, onChange, className, ...props }: any) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/,/g, '')
        if (!/^\d*$/.test(rawValue)) return // Only numbers
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

export default function CardDetailsModal({ card, bonusPercentage = 0, minTopUpAmount = 0, pointsRatio = 1000, redemptionRatio = 100, rewards = [], onClose, onUpdate, t }: Props) {
    const [transactions, setTransactions] = useState<Transaction[]>([])

    // Re-issue State
    const [showReissueModal, setShowReissueModal] = useState(false)
    const [reissueStep, setReissueStep] = useState<'type' | 'select' | 'confirm' | 'processing'>('type')
    const [reissueType, setReissueType] = useState<'new' | 'existing'>('new')

    // Easter Egg State for Unblocking
    const [secretUnlockCount, setSecretUnlockCount] = useState(0)
    const canUnblock = secretUnlockCount >= 5

    const handleSecretClick = () => {
        if (card.status === 'blocked') {
            setSecretUnlockCount(prev => prev + 1)
        }
    }
    const [unassignedCards, setUnassignedCards] = useState<LoyaltyCard[]>([])
    const [selectedUnassignedCardId, setSelectedUnassignedCardId] = useState<string>('')
    const [isReissuing, setIsReissuing] = useState(false)
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false)

    const fetchUnassignedCards = async () => {
        const { data } = await supabase
            .from('loyalty_cards')
            .select('*')
            .eq('status', 'unassigned')
        //.eq('class', card.class) // Optional: restrict to same class

        if (data) setUnassignedCards(data)
    }

    const handleReissue = async () => {
        setIsReissuing(true)
        console.log('Starting handleReissue', { reissueType, selectedUnassignedCardId })
        try {
            let targetCardId = selectedUnassignedCardId
            let targetCardNumber = ''

            if (reissueType === 'new') {
                console.log('Fetching latest card number...')
                const { data: latest, error: fetchErr } = await supabase.from('loyalty_cards').select('card_number').order('created_at', { ascending: false }).limit(1).single()

                if (fetchErr && fetchErr.code !== 'PGRST116') { // Ignore 116 (no row found) but log others
                    console.error('Fetch Latest Error:', fetchErr)
                    throw fetchErr
                }

                const nextNum = latest ? String(Number(latest.card_number) + 1).padStart(latest.card_number.length, '0') : '10000001'
                targetCardNumber = nextNum
                console.log('Generated Next Num:', nextNum)

                const newCardPayload = {
                    card_number: targetCardNumber,
                    class: card.class,
                    status: 'active',
                    points: card.points,
                    balance: card.balance,
                    total_spent: card.total_spent,
                    total_loaded: 0,
                    customer_name: card.customer_name,
                    phone_number: card.phone_number,
                    email: card.email,
                    address: card.address,
                    issued_on: new Date().toISOString(),
                    card_expires_on: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
                    tier_expires_on: card.tier_expires_on
                }
                console.log('Inserting New Card:', newCardPayload)

                const { data: newCard, error: createError } = await supabase
                    .from('loyalty_cards')
                    .insert(newCardPayload)
                    .select()
                    .single()

                if (createError) {
                    console.error('Insert Error:', createError)
                    throw createError
                }
                targetCardId = newCard.id
                console.log('New Card Created:', targetCardId)

            } else {
                console.log('Updating Existing Card:', targetCardId)
                const { error: updateError } = await supabase
                    .from('loyalty_cards')
                    .update({
                        status: 'active',
                        class: card.class, // Transfer class
                        points: card.points,
                        balance: card.balance,
                        total_spent: card.total_spent,
                        customer_name: card.customer_name,
                        phone_number: card.phone_number,
                        email: card.email,
                        address: card.address,
                        issued_on: new Date().toISOString(),
                        card_expires_on: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
                    })
                    .eq('id', targetCardId)

                if (updateError) {
                    console.error('Update Target Error:', updateError)
                    throw updateError
                }
            }

            console.log('Blocking Old Card:', card.id)
            const { error: blockError } = await supabase
                .from('loyalty_cards')
                .update({
                    status: 'blocked',
                    class: '-',
                    replaced_by: targetCardId // Link to new card
                })
                .eq('id', card.id)

            if (blockError) {
                console.error('Block Error:', blockError)
                throw blockError
            }

            console.log('Logging transfer...')
            const { error: logError } = await supabase.from('loyalty_card_transactions').insert({
                card_id: targetCardId,
                type: 'log',
                description: `Re-issue transfer from ${card.card_number}`,
                purchase_amount: 0,
                bonus_amount: 0,
                total_amount: 0,
                balance_after: card.balance,
                points_change: 0
            })

            if (logError) {
                console.error('Log Error:', logError)
                // Non-critical, maybe don't throw?
            }

            console.log('Reissue Complete')
            setShowReissueModal(false)
            onClose()
            onUpdate()

        } catch (e: any) {
            console.error('Catch Error:', e)
            alert('Error re-issuing card: ' + e.message + ' (Check Console)')
        } finally {
            setIsReissuing(false)
        }
    }
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'details' | 'history'>('details')
    const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false)
    const [isRegisterSpendModalOpen, setIsRegisterSpendModalOpen] = useState(false)
    const [isRedeemPointsModalOpen, setIsRedeemPointsModalOpen] = useState(false)
    const [isConvertPointsModalOpen, setIsConvertPointsModalOpen] = useState(false)
    const [currentBalance, setCurrentBalance] = useState(card.balance)
    const barcodeRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        fetchTransactions()
    }, [card.id])

    const fetchTransactions = async () => {
        setLoading(true)
        const { data } = await supabase
            .from('loyalty_card_transactions')
            .select('*')
            .eq('card_id', card.id)
            .order('created_at', { ascending: false })

        if (data) {
            setTransactions(data)
        }
        setLoading(false)
    }

    const handleDelete = async () => {
        if (!confirm(t.cards.modals.delete_confirmation)) return

        const { error } = await supabase
            .from('loyalty_cards')
            .delete()
            .eq('id', card.id)

        if (error) {
            alert('Error deleting card: ' + error.message)
        } else {
            onUpdate()
        }
    }

    const handleBlockToggle = async () => {
        if (card.status === 'blocked' && !canUnblock) {
            alert(t.cards.modals.block_unauthorized)
            return
        }
        const newStatus = card.status === 'blocked' ? 'active' : 'blocked'
        const action = card.status === 'blocked' ? 'unblock' : 'block'

        if (!confirm(t.cards.modals.confirm_action.replace('{action}', action))) return

        // Auto-block clone rule: If reactivating, ensure successor is blocked
        if (newStatus === 'active') {
            const { data: currentInfo } = await supabase
                .from('loyalty_cards')
                .select('replaced_by, card_number')
                .eq('id', card.id)
                .single()

            if (currentInfo?.replaced_by) {
                await supabase.from('loyalty_cards')
                    .update({ status: 'blocked' })
                    .eq('id', currentInfo.replaced_by)

                alert(t.cards.modals.reissue_block_note)

                // Log on the replaced card
                const localName = localStorage.getItem('user.displayName') || localStorage.getItem('user.name') || ''
                await supabase.from('loyalty_card_transactions').insert({
                    card_id: currentInfo.replaced_by,
                    type: 'log',
                    description: `Auto-blocked: Original card ${currentInfo.card_number} was reactivated`,
                    purchase_amount: 0,
                    bonus_amount: 0,
                    total_amount: 0,
                    balance_after: 0,
                    points_change: 0,
                    operator: localName
                })
            }
        }

        const { error } = await supabase
            .from('loyalty_cards')
            .update({ status: newStatus })
            .eq('id', card.id)

        if (error) {
            alert(t.cards.modals.error_action.replace('{action}', action) + error.message)
        } else {
            onUpdate()
        }
    }

    const handleVoidTransaction = async (tx: Transaction) => {
        if (!confirm(t.cards.modals.void_confirmation
            .replace('{description}', tx.description)
            .replace('{amount}', formatCurrency(tx.total_amount))
        )) return

        setLoading(true)
        const localName = localStorage.getItem('user.displayName') || localStorage.getItem('user.name') || ''

        // 1. Calculate Reversals
        // If total_amount was +500 (Top Up), we need to deduct 500.
        // If total_amount was -100 (Usage), we need to add 100.
        // If points_change was +10 (Earned), we need to deduct 10.
        const balanceCorrection = -(tx.total_amount || 0)
        const pointsCorrection = -(tx.points_change || 0)
        const totalSpentCorrection = (tx.purchase_amount || 0) > 0 ? -(tx.purchase_amount || 0) : 0 // Reduce total spent if it was a purchase

        // 2. Update Card
        const { data: freshCard, error: fetchError } = await supabase
            .from('loyalty_cards')
            .select('balance, points, total_spent')
            .eq('id', card.id)
            .single()

        if (fetchError || !freshCard) {
            alert('Error fetching card data for voiding')
            setLoading(false)
            return
        }

        const newBalance = (freshCard.balance || 0) + balanceCorrection
        const newPoints = (freshCard.points || 0) + pointsCorrection
        const newTotalSpent = (freshCard.total_spent || 0) + totalSpentCorrection

        const { error: updateError } = await supabase
            .from('loyalty_cards')
            .update({
                balance: newBalance,
                points: newPoints,
                total_spent: newTotalSpent
            })
            .eq('id', card.id)

        if (updateError) {
            alert('Error updating card: ' + updateError.message)
            setLoading(false)
            return
        }

        setCurrentBalance(newBalance) // Optimistic update for UI

        // 3. Mark Original as Voided
        await supabase
            .from('loyalty_card_transactions')
            .update({ is_voided: true })
            .eq('id', tx.id)

        // 4. Insert Log Transaction
        await supabase.from('loyalty_card_transactions').insert({
            card_id: card.id,
            type: 'log',
            purchase_amount: 0,
            bonus_amount: 0,
            total_amount: 0,
            points_change: 0,
            balance_after: newBalance,
            description: `Deleted: ${tx.description} (${formatCurrency(tx.total_amount)})`,
            operator: localName
        })

        await fetchTransactions()
        onUpdate() // Refresh parent
        setLoading(false)
    }

    const handleDownloadBarcode = async () => {
        if (!barcodeRef.current) return

        const svg = barcodeRef.current.querySelector('svg')
        if (!svg) return

        // Perform download
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
                downloadLink.download = `loyalty-card-${card.card_number}.png`
                downloadLink.href = pngFile
                downloadLink.click()
            }
        }
        img.src = 'data:image/svg+xml;base64,' + btoa(svgData)

        // Log action (fire and forget)
        const localName = localStorage.getItem('user.displayName') || localStorage.getItem('user.name') || ''
        supabase.from('loyalty_card_transactions').insert({
            card_id: card.id,
            type: 'log',
            purchase_amount: 0,
            bonus_amount: 0,
            total_amount: 0,
            points_change: 0,
            balance_after: currentBalance, // Approx, not critical
            description: t.cards.modals.download_barcode,
            operator: localName
        }).then(() => fetchTransactions())
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
    }

    const isActive = card.status === 'active'

    return (
        <div className="fixed inset-0 z-[50] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div
                            onClick={handleSecretClick}
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-blue-600 transition-all select-none ${card.status === 'blocked' ? 'cursor-pointer active:scale-95 hover:bg-blue-200' : ''
                                } ${secretUnlockCount > 0 && secretUnlockCount < 5 ? 'ring-2 ring-indigo-500 ring-offset-2 bg-indigo-50' : 'bg-blue-100'}`}
                            title={card.status === 'blocked' ? "Status Locked" : "Card Status"}
                        >
                            <CreditCard className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-slate-800 font-mono">{card.card_number}</h3>
                            <p className="text-xs text-slate-500 flex items-center gap-2">
                                Loyalty Card
                                <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${card.status === 'active' ? 'bg-green-100 text-green-700' :
                                    card.status === 'blocked' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                                    }`}>{t.cards.status[card.status] || card.status}</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-lg transition">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 shrink-0">
                    <button
                        className={`flex-1 py-3 text-sm font-medium ${activeTab === 'details' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setActiveTab('details')}
                    >
                        {t.cards.modals.overview}
                    </button>
                    <button
                        className={`flex-1 py-3 text-sm font-medium ${activeTab === 'history' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setActiveTab('history')}
                    >
                        {t.cards.modals.transactions}
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {activeTab === 'details' ? (
                        <div className="space-y-6">

                            {/* Main Action Button */}
                            {isActive ? (
                                <div className="mb-4">
                                    <button
                                        onClick={() => setIsRegisterSpendModalOpen(true)}
                                        className="w-full border-[0.5px] border-red-400 bg-red-500/5 hover:bg-red-500/10 text-red-600 px-8 py-3 rounded-xl shadow-sm transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-3 font-bold text-lg"
                                    >
                                        <ShoppingBag className="w-5 h-5" />
                                        {t.cards.modals.new_transaction}
                                    </button>
                                </div>
                            ) : card.status === 'unassigned' ? (
                                <div className="mb-4">
                                    <button
                                        onClick={() => setIsCustomerModalOpen(true)}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-3 font-bold text-lg"
                                    >
                                        <User className="w-5 h-5" />
                                        {t.cards.modals.assign_card_btn}
                                    </button>
                                </div>
                            ) : null}

                            {/* Two-Column Dashboard */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* Wallet Pocket */}
                                <div className="p-4 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl text-white shadow-lg shadow-blue-200 flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2 text-blue-100">
                                            <Wallet className="w-4 h-4" />
                                            <span className="text-sm font-medium">{t.cards.modals.prepaid_wallet}</span>
                                        </div>
                                        <p className="text-2xl font-bold mb-4">{formatCurrency(currentBalance)}</p>
                                    </div>
                                    {isActive && (
                                        <button
                                            onClick={() => setIsTopUpModalOpen(true)}
                                            className="w-full bg-white/20 hover:bg-white/30 py-2 rounded-lg text-sm font-medium transition backdrop-blur-sm flex items-center justify-center gap-1"
                                        >
                                            <Plus className="w-4 h-4" /> {t.cards.modals.top_up}
                                        </button>
                                    )}
                                </div>

                                {/* Membership Pocket */}
                                <div className="p-4 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl text-white shadow-lg shadow-amber-100 flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2 text-amber-50">
                                            <Star className="w-4 h-4" />
                                            <span className="text-sm font-medium">{t.cards.modals.membership_tier}</span>
                                        </div>
                                        <div className="flex justify-between items-baseline mb-1">
                                            <p className="text-2xl font-bold">{card.class}</p>
                                            <span className="text-sm opacity-90">{card.points} pts</span>
                                        </div>
                                        <div className="text-xs text-amber-100 space-y-1 mb-4">
                                            <p>{t.cards.modals.spent.replace('{amount}', formatCurrency(card.total_spent || 0))}</p>
                                        </div>
                                    </div>

                                    {/* Rewards Actions */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => setIsRedeemPointsModalOpen(true)}
                                            className="bg-white/20 hover:bg-white/30 py-2 rounded-lg text-sm font-medium transition backdrop-blur-sm flex gap-1 items-center justify-center text-xs px-1"
                                        >
                                            <Gift className="w-3 h-3" /> {t.cards.modals.rewards}
                                        </button>
                                        <button
                                            onClick={() => setIsConvertPointsModalOpen(true)}
                                            className="bg-white/20 hover:bg-white/30 py-2 rounded-lg text-sm font-medium transition backdrop-blur-sm flex gap-1 items-center justify-center text-xs px-1"
                                        >
                                            <Coins className="w-3 h-3" /> {t.cards.modals.cashback}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Customer Info */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <h4 className="font-medium text-slate-800 mb-3 flex items-center justify-between">
                                    <span className="flex items-center gap-2">
                                        <User className="w-4 h-4 text-slate-500" /> {t.cards.modals.customer_info_title}
                                    </span>
                                    {(isActive || card.status === 'blocked') && (
                                        <button
                                            onClick={() => setIsCustomerModalOpen(true)}
                                            className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition"
                                            title="Edit Info"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                        </button>
                                    )}
                                </h4>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-slate-500">{t.cards.details.name}</p>
                                        <p className="font-medium text-slate-800">{card.customer_name || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">{t.cards.details.phone}</p>
                                        <p className="font-medium text-slate-800">{card.phone_number || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">{t.cards.details.email}</p>
                                        <p className="font-medium text-slate-800">{card.email || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">{t.cards.details.address}</p>
                                        <p className="font-medium text-slate-800">{card.address || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">{t.cards.modals.issued_on}</p>
                                        <p className="font-medium text-slate-800">
                                            {card.issued_on ? format(new Date(card.issued_on), 'dd/MM/yyyy') : '-'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">{t.cards.table.expires}</p>
                                        <p className="font-medium text-slate-800">
                                            {(card.card_expires_on || card.tier_expires_on) ? format(new Date(card.card_expires_on || card.tier_expires_on!), 'dd/MM/yyyy') : t.cards.table.never}
                                        </p>
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


                        </div>
                    ) : (
                        <div className="space-y-4">
                            {loading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                                </div>
                            ) : transactions.filter(t => !t.is_voided).length === 0 ? (
                                <div className="text-center py-8 text-slate-500">
                                    {t.cards.modals.no_transactions}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {transactions.filter(t => !t.is_voided).map(tx => {
                                        const isDeletedLog = tx.description?.startsWith('Deleted:')

                                        return (
                                            <div key={tx.id} className={`grid grid-cols-[1fr_140px_50px] gap-4 p-3 rounded-lg border ${isDeletedLog
                                                ? 'bg-red-50 border-red-100'
                                                : 'bg-slate-50 border-slate-100'
                                                } items-center`}>
                                                {/* Left: Icon & Info */}
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDeletedLog ? 'bg-red-100 text-red-600' :
                                                        tx.type === 'topup' ? 'bg-green-100 text-green-600' :
                                                            tx.type === 'usage' ? 'bg-orange-100 text-orange-600' :
                                                                'bg-blue-100 text-blue-600'
                                                        }`}>
                                                        {isDeletedLog ? <Ban className="w-5 h-5" /> :
                                                            tx.type === 'topup' ? <ArrowDownLeft className="w-5 h-5" /> :
                                                                tx.type === 'usage' ? <ShoppingBag className="w-5 h-5" /> :
                                                                    <History className="w-5 h-5" />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className={`text-sm font-medium capitalize truncate ${isDeletedLog ? 'text-red-800' : 'text-slate-800'}`}>
                                                            {tx.description || tx.type}
                                                        </p>
                                                        <p className={`text-xs truncate ${isDeletedLog ? 'text-red-600/70' : 'text-slate-500'}`}>
                                                            {format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}
                                                            {tx.operator && <span className="ml-2">by {tx.operator}</span>}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Middle: Amounts (Fixed Width for Alignment) */}
                                                <div className="text-right flex flex-col items-end justify-center">
                                                    {(tx.points_change || 0) !== 0 && (
                                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded mb-1 ${(tx.points_change || 0) > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                                            }`}>
                                                            {(tx.points_change || 0) > 0 ? '+' : ''}{tx.points_change} pts
                                                        </span>
                                                    )}

                                                    {(tx.type === 'usage' || tx.type === 'topup' || tx.total_amount !== 0) && (
                                                        <p className={`font-medium ${tx.total_amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                            {tx.total_amount > 0 ? '+' : ''}{formatCurrency(tx.total_amount)}
                                                        </p>
                                                    )}

                                                    {tx.bonus_amount > 0 && (
                                                        <p className="text-xs text-green-500">+{formatCurrency(tx.bonus_amount)} bonus</p>
                                                    )}

                                                    <p className={`text-xs ${isDeletedLog ? 'text-red-400' : 'text-slate-400'}`}>
                                                        Bal: {formatCurrency(tx.balance_after)}
                                                    </p>
                                                </div>

                                                {/* Right: Actions */}
                                                <div className="flex items-center justify-end pl-2 border-l border-slate-200/50 h-full">
                                                    {tx.type !== 'log' && !tx.is_voided && !isDeletedLog && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handleVoidTransaction(tx)
                                                            }}
                                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors group"
                                                            title="Delete Transaction"
                                                        >
                                                            <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Modal Footer (Only visible in Details) */}
                    {activeTab === 'details' && (
                        <div className="p-4 border-t border-slate-100 mt-6 flex items-center justify-between bg-slate-50 rounded-b-xl -mx-6 -mb-6 px-6 py-4">
                            <div className="w-[140px]">
                                <button
                                    onClick={handleDelete}
                                    className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-2 px-2 py-1 hover:bg-red-50 rounded transition-colors"
                                >
                                    <Trash className="w-4 h-4" /> {t.cards.modals.delete_card}
                                </button>
                            </div>

                            <div className="flex justify-center flex-1">
                                {card.status === 'blocked' ? (
                                    <button
                                        onClick={canUnblock ? handleBlockToggle : undefined}
                                        disabled={!canUnblock}
                                        className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors border ${canUnblock
                                            ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200 cursor-pointer'
                                            : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-70'
                                            }`}
                                        title={!canUnblock ? "Protected Action" : "Unblock Card"}
                                    >
                                        <Lock className="w-4 h-4" />
                                        {canUnblock ? t.cards.modals.unblock_card : t.cards.modals.card_blocked}
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleBlockToggle}
                                        disabled={card.status === 'unassigned'}
                                        className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors border ${card.status === 'unassigned'
                                            ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                            }`}
                                    >
                                        <Power className="w-4 h-4" />
                                        {t.cards.modals.block_card}
                                    </button>
                                )}
                            </div>

                            <div className="w-[140px] flex justify-end">
                                <button
                                    onClick={() => {
                                        setReissueStep('type')
                                        setShowReissueModal(true)
                                        fetchUnassignedCards()
                                    }}
                                    disabled={card.status === 'unassigned'}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium border shadow-sm transition-colors ${card.status === 'unassigned'
                                        ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                                        : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-indigo-100'
                                        }`}
                                >
                                    <RotateCw className="w-4 h-4" />
                                    {t.cards.modals.re_issue}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Reissue Modal Overlay */}
            {showReissueModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
                    <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-md space-y-4 animate-in fade-in zoom-in duration-200 relative">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <RotateCw className="w-5 h-5 text-indigo-600" />
                            {t.cards.modals.reissue_title}
                        </h3>

                        {reissueStep === 'type' && (
                            <div className="grid grid-cols-2 gap-4 mt-4">
                                <button
                                    onClick={() => { setReissueType('existing'); setReissueStep('select'); }}
                                    className="p-6 border-2 border-slate-100 hover:border-indigo-500 rounded-xl flex flex-col items-center gap-3 hover:bg-indigo-50 transition-all group"
                                >
                                    <div className="w-12 h-12 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center text-slate-600 group-hover:text-indigo-600 transition-colors">
                                        <Wallet className="w-6 h-6" />
                                    </div>
                                    <span className="font-bold text-sm text-center text-slate-800">{t.cards.modals.unassigned_card}</span>
                                </button>
                                <button
                                    onClick={() => { setReissueType('new'); setReissueStep('confirm'); }}
                                    className="p-6 border-2 border-slate-100 hover:border-indigo-500 rounded-xl flex flex-col items-center gap-3 hover:bg-indigo-50 transition-all group"
                                >
                                    <div className="w-12 h-12 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center text-slate-500 group-hover:text-indigo-600 transition-colors">
                                        <Plus className="w-6 h-6" />
                                    </div>
                                    <span className="font-bold text-sm text-center text-slate-800">{t.cards.modals.create_new}</span>
                                </button>
                            </div>
                        )}

                        {reissueStep === 'select' && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-900 mb-1">{t.cards.modals.select_unassigned}</label>
                                    <select
                                        className="w-full p-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:bg-white transition-colors outline-none focus:ring-2 ring-indigo-500/20 focus:border-indigo-500 font-medium"
                                        onChange={(e) => setSelectedUnassignedCardId(e.target.value)}
                                        value={selectedUnassignedCardId}
                                    >
                                        <option value="">{t.cards.modals.select_placeholder}</option>
                                        {unassignedCards.map(c => (
                                            <option key={c.id} value={c.id}>{c.card_number} ({c.class})</option>
                                        ))}
                                    </select>
                                    {unassignedCards.length === 0 && (
                                        <p className="text-xs text-amber-600 mt-2">{t.cards.modals.no_unassigned_found}</p>
                                    )}
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <button onClick={() => setReissueStep('type')} className="px-4 py-2 text-slate-500 hover:text-slate-700 font-medium">{t.cards.modals.back}</button>
                                    <button
                                        onClick={() => setReissueStep('confirm')}
                                        disabled={!selectedUnassignedCardId}
                                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 font-medium shadow-sm"
                                    >
                                        {t.cards.modals.continue}
                                    </button>
                                </div>
                            </div>
                        )}

                        {reissueStep === 'confirm' && (
                            <div className="space-y-4">
                                <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 text-sm text-amber-800">
                                    <p className="font-bold mb-1 flex items-center gap-2"><Ban className="w-4 h-4" /> {t.cards.modals.warning}</p>
                                    <span dangerouslySetInnerHTML={{
                                        __html: t.cards.modals.reissue_warning
                                            .replace('{card}', card.card_number)
                                            .replace('{balance}', formatCurrency(card.balance))
                                            .replace('{points}', card.points)
                                            .replace('{target}', reissueType === 'new' ? t.cards.modals.target_new : t.cards.modals.target_selected)
                                    }} />
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <button onClick={() => setReissueStep('type')} className="px-4 py-2 text-slate-500 hover:text-slate-700 font-medium">{t.cards.modals.cancel}</button>
                                    <button
                                        onClick={handleReissue}
                                        disabled={isReissuing}
                                        className="px-4 py-2 bg-red-600 text-white rounded-lg flex items-center gap-2 hover:bg-red-700 font-medium shadow-sm transition-all"
                                    >
                                        {isReissuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                                        {t.cards.modals.confirm_reissue}
                                    </button>
                                </div>
                            </div>
                        )}

                        <button onClick={() => setShowReissueModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                    </div>
                </div>
            )}

            {isTopUpModalOpen && (
                <TopUpModal
                    t={t}
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

            {isRegisterSpendModalOpen && (
                <RegisterSpendModal
                    t={t}
                    cardId={card.id}
                    currentBalance={currentBalance}
                    pointsRatio={pointsRatio}
                    onClose={() => setIsRegisterSpendModalOpen(false)}
                    onSuccess={() => {
                        setIsRegisterSpendModalOpen(false)
                        fetchTransactions()
                        onUpdate()
                    }}
                />
            )}

            {isRedeemPointsModalOpen && (
                <RedeemPointsModal
                    t={t}
                    cardId={card.id}
                    currentPoints={card.points}
                    rewards={rewards}
                    onClose={() => setIsRedeemPointsModalOpen(false)}
                    onSuccess={() => {
                        setIsRedeemPointsModalOpen(false)
                        fetchTransactions()
                        onUpdate()
                    }}
                />
            )}

            {isConvertPointsModalOpen && (
                <ConvertPointsModal
                    t={t}
                    cardId={card.id}
                    currentPoints={card.points}
                    redemptionRatio={redemptionRatio}
                    onClose={() => setIsConvertPointsModalOpen(false)}
                    onSuccess={() => {
                        setIsConvertPointsModalOpen(false)
                        fetchTransactions()
                        onUpdate()
                    }}
                />
            )}

            {isCustomerModalOpen && (
                <CustomerFormModal
                    t={t}
                    card={card}
                    onClose={() => setIsCustomerModalOpen(false)}
                    onSuccess={() => {
                        setIsCustomerModalOpen(false)
                        fetchTransactions()
                        onUpdate()
                    }}
                />
            )}
        </div>
    )
}

// Reuse TopUpModal and RedeemBalanceModal logic but targeting loyalty_cards tables
function TopUpModal({ cardId, currentBalance, bonusPercentage, minTopUpAmount, onClose, onSuccess, t }: any) {
    // ... logic ...
    const [loading, setLoading] = useState(false)
    const [amount, setAmount] = useState<string>('') // Changed to string
    const [currentUser, setCurrentUser] = useState('')

    useEffect(() => {
        // Fetch user logic
        const localName = localStorage.getItem('user.displayName') || localStorage.getItem('user.name')
        if (localName) setCurrentUser(localName)
    }, [])

    const numAmount = Number(amount) // Ensure number
    const bonusAmount = Math.round((numAmount * bonusPercentage) / 100)
    const totalCredit = numAmount + bonusAmount
    const newBalance = currentBalance + totalCredit

    // ... handleSubmit ...
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (numAmount < minTopUpAmount) {
            alert(t.cards.modals.min_top_up.replace('{amount}', new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(minTopUpAmount)))
            return
        }

        setLoading(true)

        // 1. Fetch fresh card data to increment total_spent
        const { data: freshCard, error: fetchError } = await supabase
            .from('loyalty_cards')
            .select('total_spent')
            .eq('id', cardId)
            .single()

        if (fetchError) {
            alert('Error fetching card data')
            setLoading(false)
            return
        }

        const nextTotalSpent = (freshCard?.total_spent || 0) + numAmount

        // Update card
        const { error: updateError } = await supabase
            .from('loyalty_cards')
            .update({
                balance: newBalance,
                total_loaded: numAmount,
                total_spent: nextTotalSpent // Increment total_spent on top-up
            })
            .eq('id', cardId)

        if (updateError) {
            alert('Error: ' + updateError.message)
            setLoading(false)
            return
        }

        // Create transaction
        await supabase.from('loyalty_card_transactions').insert({
            card_id: cardId,
            type: 'topup',
            purchase_amount: numAmount,
            bonus_amount: bonusAmount,
            total_amount: totalCredit,
            balance_after: newBalance,
            points_change: 0,
            description: 'Top-up',
            operator: currentUser
        })

        setLoading(false)
        onSuccess()
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm">
                <h3 className="font-bold text-lg mb-4 text-black">{t.cards.modals.top_up_title}</h3>
                <CurrencyInput
                    className="w-full border p-2 rounded mb-1 text-xl font-bold text-black"
                    placeholder="0"
                    autoFocus
                    value={amount}
                    onChange={(val: string) => setAmount(val)}
                />
                {minTopUpAmount > 0 && (
                    <p className="text-xs text-slate-500 mb-4">
                        {t.cards.modals.min_top_up.replace('{amount}', new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(minTopUpAmount))}
                    </p>
                )}

                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600">{t.cards.modals.cancel}</button>
                    <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">
                        {loading ? t.cards.modals.processing : t.cards.modals.confirm}
                    </button>
                </div>
            </div>
        </div>
    )
}


function RegisterSpendModal({ cardId, currentBalance, pointsRatio, onClose, onSuccess, t }: any) {
    const [loading, setLoading] = useState(false)
    const [amount, setAmount] = useState<string>('')
    const [useWallet, setUseWallet] = useState(currentBalance > 0)
    const [walletInput, setWalletInput] = useState<string>('') // New: Custom wallet amount
    const [currentUser, setCurrentUser] = useState('')

    useEffect(() => {
        const localName = localStorage.getItem('user.displayName') || localStorage.getItem('user.name')
        if (localName) setCurrentUser(localName)
    }, [])

    // Update wallet input default when amount changes or useWallet is toggled
    useEffect(() => {
        if (useWallet) {
            const numAmount = Number(amount)
            const maxDeductible = Math.min(numAmount, currentBalance)
            setWalletInput(maxDeductible.toString())
        } else {
            setWalletInput('')
        }
    }, [amount, useWallet, currentBalance])

    const numAmount = Number(amount)
    const numWalletInput = Number(walletInput)
    const pointsEarned = Math.floor(numAmount / pointsRatio)

    // Validation
    const isWalletInputValid = useWallet ? (numWalletInput <= currentBalance && numWalletInput <= numAmount) : true

    // Split Payment Logic
    const walletDeduction = useWallet ? numWalletInput : 0
    const externalPayment = numAmount - walletDeduction

    const newBalance = currentBalance - walletDeduction

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (numAmount <= 0) return
        if (useWallet && !isWalletInputValid) return alert('Invalid wallet amount')

        setLoading(true)

        // 1. Fetch fresh card data
        const { data: freshCard, error: fetchError } = await supabase
            .from('loyalty_cards')
            .select('points, total_points_earned, total_spent, balance')
            .eq('id', cardId)
            .single()

        if (fetchError || !freshCard) {
            alert('Error fetching card data')
            setLoading(false)
            return
        }

        const nextPoints = (freshCard.points || 0) + pointsEarned
        const nextTotalPoints = (freshCard.total_points_earned || 0) + pointsEarned
        // Only increase total_spent by the amount PAID externally (not wallet usage)
        const nextTotalSpent = (freshCard.total_spent || 0) + externalPayment

        // Double check balance server side logic (optimistic here)
        if (useWallet && (freshCard.balance || 0) < numWalletInput) {
            alert('Insufficient wallet balance (updated)')
            setLoading(false)
            return
        }

        const nextBalance = (freshCard.balance || 0) - walletDeduction

        const { error } = await supabase
            .from('loyalty_cards')
            .update({
                points: nextPoints,
                total_points_earned: nextTotalPoints,
                total_spent: nextTotalSpent,
                balance: nextBalance
            })
            .eq('id', cardId)

        if (error) {
            alert('Error: ' + error.message)
            setLoading(false)
            return
        }

        // 2. Create Transaction
        let desc = ''
        if (walletDeduction > 0 && externalPayment > 0) {
            desc = 'Purchase (Split)'
        } else if (walletDeduction > 0) {
            desc = 'Purchase (Wallet)'
        } else {
            desc = 'Purchase (External)'
        }

        await supabase.from('loyalty_card_transactions').insert({
            card_id: cardId,
            type: 'usage',
            purchase_amount: numAmount,
            total_amount: -walletDeduction,
            bonus_amount: 0,
            balance_after: nextBalance,
            points_change: pointsEarned,
            description: desc,
            operator: currentUser
        })

        setLoading(false)
        onSuccess()
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-black"><ShoppingBag className="w-5 h-5" /> {t.cards.modals.register_spend_title}</h3>

                <div className="mb-4">
                    <label className="block text-sm text-slate-700 mb-1">{t.cards.modals.total_amount}</label>
                    <CurrencyInput
                        className="w-full border p-2 rounded text-xl font-bold text-black"
                        placeholder="0"
                        value={amount}
                        autoFocus
                        onChange={(val: string) => setAmount(val)}
                    />
                </div>

                <div className="bg-blue-50 p-3 rounded-lg flex items-center justify-between mb-4">
                    <div className="text-sm">
                        <span className="block font-medium text-blue-900">{t.cards.modals.points_to_earn}</span>
                        <span className="text-xs text-blue-700">{t.cards.modals.ratio.replace('{ratio}', pointsRatio)}</span>
                    </div>
                    <div className="text-xl font-bold text-blue-800">
                        +{pointsEarned} pts
                    </div>
                </div>

                <div className="mb-6">
                    {/* Wallet Payment Option */}
                    <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${useWallet ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'} ${currentBalance <= 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                        <input
                            type="checkbox"
                            id="useWallet"
                            checked={useWallet}
                            onChange={(e) => setUseWallet(e.target.checked)}
                            disabled={currentBalance <= 0}
                            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="useWallet" className="flex-1 font-medium text-slate-700 cursor-pointer">
                            {t.cards.modals.pay_with_wallet}
                            <div className="text-xs text-slate-500 font-normal">
                                {t.cards.modals.available_balance.replace('{amount}', new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(currentBalance))}
                            </div>
                        </label>
                    </div>

                    {useWallet && numAmount > 0 && (
                        <div className="mt-2 text-sm bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3 shadow-inner">
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-semibold text-slate-600 uppercase">{t.cards.modals.wallet_deduction}</span>
                                <CurrencyInput
                                    className={`w-full p-2 border rounded font-medium text-black ${!isWalletInputValid ? 'border-red-500 bg-red-50' : 'border-slate-300'}`}
                                    value={walletInput}
                                    onChange={(val: string) => setWalletInput(val)}
                                />
                                {!isWalletInputValid && <span className="text-xs text-red-500">{t.cards.modals.amount_exceeds}</span>}
                            </div>

                            {externalPayment >= 0 && (
                                <div className="flex justify-between border-t border-slate-200 pt-2">
                                    <span className="text-slate-600 font-medium">{t.cards.modals.customer_pays}</span>
                                    <span className="font-bold text-black text-lg">{new Intl.NumberFormat('vi-VN').format(externalPayment)}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">{t.cards.modals.cancel}</button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || numAmount <= 0 || (useWallet && !isWalletInputValid)}
                        className="px-4 py-2 bg-blue-600 text-white rounded font-medium disabled:opacity-50"
                    >
                        {loading ? t.cards.modals.processing : t.cards.modals.confirm}
                    </button>
                </div>
            </div>
        </div>
    )
}




function RedeemPointsModal({ cardId, currentPoints, rewards, onClose, onSuccess, t }: any) {
    const [loading, setLoading] = useState(false)
    const [selectedReward, setSelectedReward] = useState<any>(null)
    const [currentUser, setCurrentUser] = useState('')

    useEffect(() => {
        const localName = localStorage.getItem('user.displayName') || localStorage.getItem('user.name')
        if (localName) setCurrentUser(localName)
    }, [])

    const handleSubmit = async () => {
        if (!selectedReward) return
        setLoading(true)

        // Fetch fresh card data
        const { data: freshCard, error: fetchError } = await supabase
            .from('loyalty_cards')
            .select('points')
            .eq('id', cardId)
            .single()

        if (fetchError || !freshCard) {
            alert('Error fetching card data')
            setLoading(false)
            return
        }

        if ((freshCard.points || 0) < selectedReward.cost) {
            alert('Insufficient points')
            setLoading(false)
            return
        }

        const nextPoints = (freshCard.points || 0) - selectedReward.cost

        // Update card
        const { error } = await supabase
            .from('loyalty_cards')
            .update({ points: nextPoints })
            .eq('id', cardId)

        if (error) {
            alert('Error: ' + error.message)
            setLoading(false)
            return
        }

        // Transaction
        await supabase.from('loyalty_card_transactions').insert({
            card_id: cardId,
            type: 'log', // or redemption
            purchase_amount: 0,
            total_amount: 0,
            bonus_amount: 0,
            balance_after: 0,
            points_change: -selectedReward.cost,
            description: `Redeemed: ${selectedReward.name}`,
            operator: currentUser
        })

        setLoading(false)
        onSuccess()
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-black"><Gift className="w-5 h-5" /> {t.cards.modals.redeem_title}</h3>
                <div className="bg-amber-50 p-3 rounded-lg mb-4 flex justify-between items-center text-amber-900">
                    <span className="text-sm font-medium">{t.cards.modals.available_points}</span>
                    <span className="font-bold text-xl">{currentPoints}</span>
                </div>

                <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                    {rewards.length === 0 && <p className="text-center text-slate-500 py-4">{t.cards.modals.no_rewards}</p>}
                    {rewards.map((reward: any, idx: number) => (
                        <button
                            key={idx}
                            onClick={() => setSelectedReward(reward)}
                            disabled={currentPoints < reward.cost}
                            className={`w-full p-3 rounded-lg border text-left flex justify-between items-center transition ${selectedReward === reward
                                ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                                : 'border-slate-200 hover:bg-slate-50'
                                } ${currentPoints < reward.cost ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <span className="font-medium text-black">{reward.name}</span>
                            <span className="text-sm font-bold text-amber-700">{reward.cost} pts</span>
                        </button>
                    ))}
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">{t.cards.modals.cancel}</button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !selectedReward}
                        className="px-4 py-2 bg-blue-600 text-white rounded font-medium disabled:opacity-50"
                    >
                        {loading ? t.cards.modals.processing : t.cards.modals.redeem}
                    </button>
                </div>
            </div>
        </div>
    )
}

function ConvertPointsModal({ cardId, currentPoints, redemptionRatio, onClose, onSuccess, t }: any) {
    const [loading, setLoading] = useState(false)
    const [pointsToConvert, setPointsToConvert] = useState<number | ''>('')
    const [currentUser, setCurrentUser] = useState('')

    useEffect(() => {
        const localName = localStorage.getItem('user.displayName') || localStorage.getItem('user.name')
        if (localName) setCurrentUser(localName)
    }, [])

    const points = Number(pointsToConvert)
    const creditAmount = points * redemptionRatio

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (points <= 0 || points > currentPoints) return
        setLoading(true)

        // Fetch fresh data
        const { data: freshCard, error: fetchError } = await supabase
            .from('loyalty_cards')
            .select('points, balance')
            .eq('id', cardId)
            .single()

        if (fetchError || !freshCard) {
            alert('Error fetching card data')
            setLoading(false)
            return
        }

        if ((freshCard.points || 0) < points) {
            alert('Insufficient points')
            setLoading(false)
            return
        }

        const nextPoints = (freshCard.points || 0) - points
        const nextBalance = (freshCard.balance || 0) + creditAmount

        // Update card
        const { error } = await supabase
            .from('loyalty_cards')
            .update({
                points: nextPoints,
                balance: nextBalance
            })
            .eq('id', cardId)

        if (error) {
            alert('Error: ' + error.message)
            setLoading(false)
            return
        }

        // Transaction
        const { error: txError } = await supabase.from('loyalty_card_transactions').insert({
            card_id: cardId,
            type: 'adjustment', // Adjustment makes sense for internal conversion
            purchase_amount: 0,
            bonus_amount: 0,
            total_amount: creditAmount,
            balance_after: nextBalance,
            points_change: -points,
            description: `Converted ${points} pts to ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(creditAmount)} Credit`,
            operator: currentUser
        })

        if (txError) {
            console.error('Error logging transaction:', txError)
            // Non-blocking but good to know
        }

        setLoading(false)
        onSuccess()
    }


    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-black"><Coins className="w-5 h-5" /> {t.cards.modals.convert_title}</h3>

                <div className="bg-blue-50 p-3 rounded-lg mb-4 flex justify-between items-center text-blue-900">
                    <span className="text-sm font-medium">{t.cards.modals.available_points}</span>
                    <span className="font-bold text-xl">{currentPoints}</span>
                </div>

                <div className="mb-4">
                    <label className="block text-sm text-slate-700 mb-1">{t.cards.modals.convert_label}</label>
                    <input
                        type="number"
                        className="w-full border p-2 rounded text-xl font-bold text-black"
                        placeholder="0"
                        value={pointsToConvert}
                        autoFocus
                        max={currentPoints}
                        onChange={e => setPointsToConvert(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                    <div className="text-right text-xs text-slate-500 mt-1">
                        {t.cards.modals.max.replace('{amount}', currentPoints)}
                    </div>
                </div>

                <div className="bg-green-50 p-3 rounded-lg flex items-center justify-between mb-6">
                    <div className="text-sm">
                        <span className="block font-medium text-green-900">{t.cards.modals.wallet_credit}</span>
                        <span className="text-xs text-green-700">{t.cards.modals.convert_rate.replace('{rate}', new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(redemptionRatio))}</span>
                    </div>
                    <div className="text-xl font-bold text-green-800">
                        +{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(creditAmount)}
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">{t.cards.modals.cancel}</button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || points <= 0 || points > currentPoints}
                        className="px-4 py-2 bg-blue-600 text-white rounded font-medium disabled:opacity-50"
                    >
                        {loading ? t.cards.modals.processing : t.cards.modals.convert}
                    </button>
                </div>
            </div>
        </div>
    )
}

function CustomerFormModal({ card, onClose, onSuccess, t }: any) {
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        customer_name: card.customer_name || '',
        phone_number: card.phone_number || '',
        email: card.email || '',
        address: card.address || ''
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.customer_name.trim()) {
            alert('Customer Name is required')
            return
        }
        if (!formData.phone_number.trim()) {
            alert('Phone Number is required')
            return
        }

        setLoading(true)

        const updates: any = {
            ...formData
        }

        // If assigning for the first time
        if (card.status === 'unassigned') {
            updates.status = 'active'
            updates.issued_on = new Date().toISOString()
            updates.card_expires_on = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
        }

        const { error } = await supabase
            .from('loyalty_cards')
            .update(updates)
            .eq('id', card.id)

        if (error) {
            alert('Error updating customer: ' + error.message)
            setLoading(false)
            return
        }

        setLoading(false)
        onSuccess()
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-black">
                    <User className="w-5 h-5" />
                    {card.status === 'unassigned' ? t.cards.modals.assign_title : t.cards.modals.edit_customer_title}
                </h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t.cards.details.name} <span className="text-red-500">*</span></label>
                        <input
                            name="customer_name"
                            required
                            className="w-full border p-2 rounded focus:ring-2 ring-blue-500 outline-none text-black"
                            value={formData.customer_name}
                            onChange={handleChange}
                            placeholder={t.cards.details.name}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t.cards.details.phone} <span className="text-red-500">*</span></label>
                            <input
                                name="phone_number"
                                required
                                className="w-full border p-2 rounded focus:ring-2 ring-blue-500 outline-none text-black"
                                value={formData.phone_number}
                                onChange={handleChange}
                                placeholder={t.cards.details.phone}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t.cards.details.email}</label>
                            <input
                                name="email"
                                type="email"
                                className="w-full border p-2 rounded focus:ring-2 ring-blue-500 outline-none text-black"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder={t.cards.details.email}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t.cards.details.address}</label>
                        <input
                            name="address"
                            className="w-full border p-2 rounded focus:ring-2 ring-blue-500 outline-none text-black"
                            value={formData.address}
                            onChange={handleChange}
                            placeholder={t.cards.details.address}
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">{t.cards.modals.cancel}</button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 bg-blue-600 text-white rounded font-medium disabled:opacity-50"
                        >
                            {loading ? t.cards.modals.saving : t.cards.modals.save_assign}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
