'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Search, Download, CreditCard, Clock, CheckCircle2, RefreshCcw, Calendar, FileText, X, Cog } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { CRMPayout } from '@/types/crm'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
import { useRouter } from 'next/navigation'

interface ExtendedPayout extends CRMPayout {
    payout_type?: string
    sale_advisor_id?: string
    crm_partners: {
        name: string
    } | null
}

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function formatMonthLabel(d: Date, language?: string) { return d.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' }) }
function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

export default function CRMPayoutsPage() {
    const router = useRouter()
    const { currency, language } = useSettings()
    const [searchTerm, setSearchTerm] = useState('')
    const [payouts, setPayouts] = useState<ExtendedPayout[]>([])
    const [loading, setLoading] = useState(true)
    const [isGenerating, setIsGenerating] = useState(false)
    const [activeTab, setActiveTab] = useState<'partner' | 'advisor'>('partner')

    /* month cursor */
    const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))

    function prevMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), -1)) }
    function nextMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), 1)) }

    /* Modals State */
    const [selectedPayout, setSelectedPayout] = useState<ExtendedPayout | null>(null)
    const [modalMode, setModalMode] = useState<'none' | 'markPaid' | 'viewReceipt'>('none')
    
    // Form fields for Mark Paid
    const [paymentDate, setPaymentDate] = useState('')
    const [paymentMethod, setPaymentMethod] = useState('Cash')
    const [paymentNotes, setPaymentNotes] = useState('')

    const [currentUser, setCurrentUser] = useState<{ id: string, role?: string } | null>(null)
    const [accountsMap, setAccountsMap] = useState<Record<string, string>>({})

    const fetchData = async () => {
        setLoading(true)
        const { data: userData } = await supabase.auth.getUser()
        let userRole = 'staff'
        let userId = ''
        
        if (userData?.user) {
            userId = userData.user.id
            const { data: acc } = await supabase.from('app_accounts').select('role').eq('user_id', userId).maybeSingle()
            if (acc) {
                userRole = acc.role
                if (userRole === 'sale advisor') {
                    setActiveTab('advisor')
                }
            }
            setCurrentUser({ id: userId, role: userRole })
        }

        let query = supabase
            .from('crm_payouts')
            .select(`
                *,
                crm_partners (
                    name
                )
            `)
            .order('created_at', { ascending: false })
            
        if (userRole === 'sale advisor') {
            query = query.eq('sale_advisor_id', userId)
        }

        const [payoutsRes, accountsRes] = await Promise.all([
            query,
            supabase.from('app_accounts').select('user_id, name, email')
        ])

        if (payoutsRes.error) {
            console.error('Error fetching payouts:', payoutsRes.error)
            alert('Failed to load payouts')
        } else {
            setPayouts(payoutsRes.data as unknown as ExtendedPayout[])
        }

        if (accountsRes.data) {
            const map: Record<string, string> = {}
            for (const acc of accountsRes.data) {
                if (acc.user_id) map[acc.user_id] = acc.name || acc.email || 'Unknown User'
            }
            setAccountsMap(map)
        }

        setLoading(false)
    }

    useEffect(() => {
        fetchData()
    }, [])

    /* Generate automatic payouts from pending referrals */
    const generatePayouts = async () => {
        if (!confirm(`${t(language, 'AreYouSure')} ${activeTab} ${t(language, 'Payouts').toLowerCase()} ${t(language, 'For')} ${formatMonthLabel(monthCursor, language)}?`)) return

        setIsGenerating(true)
        try {
            const periodKey = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, '0')}`

            // Fetch validated referrals for this month
            const firstDay = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1).toISOString().split('T')[0]
            const lastDay = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).toISOString().split('T')[0]

            const isPartner = activeTab === 'partner'
            const payoutField = isPartner ? 'payout_id' : 'advisor_payout_id'

            const { data: refs, error: refErr } = await supabase
                .from('crm_referrals')
                .select(`
                    *,
                    crm_partners ( owner_id )
                `)
                .eq('status', 'Pending')
                .is(payoutField, null)
                .gte('arrival_date', firstDay)
                .lte('arrival_date', lastDay)

            if (refErr) throw refErr

            let insertedCount = 0

            if (isPartner) {
                const partnerGroups: Record<string, { amount: number, refIds: string[], owner_id: string | null }> = {}
                for (const r of refs || []) {
                    if (!partnerGroups[r.partner_id]) {
                        // @ts-ignore
                        partnerGroups[r.partner_id] = { amount: 0, refIds: [], owner_id: r.sale_advisor_id || r.crm_partners?.owner_id || null }
                    }
                    partnerGroups[r.partner_id].amount += Number(r.commission_value || 0)
                    partnerGroups[r.partner_id].refIds.push(r.id)
                }

                if (Object.keys(partnerGroups).length === 0) {
                    alert(`No pending unassigned referrals found to generate partner payouts for ${formatMonthLabel(monthCursor, language)}.`)
                    setIsGenerating(false)
                    return
                }

                for (const [partnerId, group] of Object.entries(partnerGroups)) {
                    if (group.amount <= 0) continue

                    const { data: newPayout, error: insErr } = await supabase.from('crm_payouts').insert({
                        partner_id: partnerId,
                        period: periodKey,
                        amount: group.amount,
                        status: 'Pending',
                        sale_advisor_id: group.owner_id,
                        payout_type: 'partner'
                    }).select().single()

                    if (insErr) throw insErr

                    await supabase
                        .from('crm_referrals')
                        .update({ payout_id: newPayout.id })
                        .in('id', group.refIds)

                    insertedCount++
                }
            } else {
                const advisorGroups: Record<string, { amount: number, refIds: string[] }> = {}
                for (const r of refs || []) {
                    const advId = r.sale_advisor_id
                    if (!advId) continue
                    if (!advisorGroups[advId]) {
                        advisorGroups[advId] = { amount: 0, refIds: [] }
                    }
                    advisorGroups[advId].amount += Number(r.advisor_commission_value || 0)
                    advisorGroups[advId].refIds.push(r.id)
                }

                if (Object.keys(advisorGroups).length === 0) {
                    alert(`No pending referrals with advisor commission found for ${formatMonthLabel(monthCursor, language)}.`)
                    setIsGenerating(false)
                    return
                }

                for (const [advisorId, group] of Object.entries(advisorGroups)) {
                    if (group.amount <= 0) continue

                    const { data: newPayout, error: insErr } = await supabase.from('crm_payouts').insert({
                        period: periodKey,
                        amount: group.amount,
                        status: 'Pending',
                        sale_advisor_id: advisorId,
                        payout_type: 'advisor'
                    }).select().single()

                    if (insErr) throw insErr

                    await supabase
                        .from('crm_referrals')
                        .update({ advisor_payout_id: newPayout.id })
                        .in('id', group.refIds)

                    insertedCount++
                }
            }

            if (insertedCount > 0) {
                alert(`Successfully generated ${insertedCount} new payout(s).`)
                fetchData()
            } else {
                alert('No payouts were generated (amounts were 0).')
            }
        } catch (error: any) {
            console.error('Error generating payouts:', error)
            alert('Failed to generate payouts: ' + error.message)
        }
        setIsGenerating(false)
    }

    const openMarkPaid = (payout: ExtendedPayout) => {
        setSelectedPayout(payout)
        setPaymentDate(new Date().toISOString().split('T')[0])
        setPaymentMethod('Cash')
        setPaymentNotes('')
        setModalMode('markPaid')
    }

    const openViewReceipt = (payout: ExtendedPayout) => {
        setSelectedPayout(payout)
        setModalMode('viewReceipt')
    }

    const closeModal = () => {
        setModalMode('none')
        setSelectedPayout(null)
    }

    const submitMarkPaid = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedPayout || !paymentDate || !paymentMethod) {
            alert('Please fill out all required fields')
            return
        }
        
        try {
            const { error: payoutErr } = await supabase
                .from('crm_payouts')
                .update({ 
                    status: 'Paid', 
                    payment_date: paymentDate,
                    reference_number: paymentMethod,
                    notes: paymentNotes
                })
                .eq('id', selectedPayout.id)

            if (payoutErr) throw payoutErr

            setPayouts(prev => prev.map(p => p.id === selectedPayout.id ? { 
                ...p, 
                status: 'Paid', 
                payment_date: paymentDate,
                reference_number: paymentMethod,
                notes: paymentNotes 
            } : p))

            closeModal()
        } catch (err) {
            console.error(err)
            alert('Failed to mark as paid')
        }
    }

    // Filter by search + month
    const filteredPayouts = useMemo(() => {
        return payouts.filter(p => {
            // Filter by Active Tab
            if ((p.payout_type || 'partner') !== activeTab) return false

            const matchesSearch = (p.crm_partners?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                p.period.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (activeTab === 'advisor' && accountsMap[p.sale_advisor_id || '']?.toLowerCase().includes(searchTerm.toLowerCase()))
            
            if (!matchesSearch) return false

            // Filter by month based on period string (e.g. "2026-04" or "April 2026")
            const periodStr = p.period?.toLowerCase() || ''
            const monthLabel = formatMonthLabel(monthCursor, language).toLowerCase()
            const monthKey = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, '0')}`
            return periodStr.includes(monthLabel) || periodStr.includes(monthKey) || !p.period
        })
    }, [payouts, searchTerm, monthCursor, activeTab, accountsMap])

    const totalPending = filteredPayouts.filter(p => p.status === 'Pending').reduce((acc, curr) => acc + Number(curr.amount || 0), 0)
    const totalPaid = filteredPayouts.filter(p => p.status !== 'Pending').reduce((acc, curr) => acc + Number(curr.amount || 0), 0)
    const totalAmount = filteredPayouts.reduce((acc, curr) => acc + Number(curr.amount || 0), 0)

    return (
        <div className="p-6 max-w-7xl mx-auto relative">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'Payouts')}</h1>
                    <p className="text-slate-500 mt-1">{t(language, 'PayoutsDesc')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {currentUser && currentUser.role !== 'sale advisor' && (
                        <button 
                            onClick={generatePayouts}
                            disabled={isGenerating}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2"
                        >
                            {isGenerating ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Cog className="w-4 h-4" />}
                            {t(language, 'GeneratePayouts')}
                        </button>
                    )}
                    <button className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        {t(language, 'Export')}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 mb-6 sticky top-0 bg-slate-50/80 backdrop-blur z-10 pt-2">
                <button
                    onClick={() => setActiveTab('partner')}
                    className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 whitespace-nowrap ${
                        activeTab === 'partner' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    {t(language, 'PartnerPayouts')}
                </button>
                <button
                    onClick={() => setActiveTab('advisor')}
                    className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 whitespace-nowrap ${
                        activeTab === 'advisor' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    {t(language, 'AdvisorPayouts')}
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-5 border border-amber-200">
                    <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-1">
                        <Clock className="w-4 h-4" /> {t(language, 'PendingPayouts')}
                    </div>
                    <div className="text-2xl font-black text-amber-900 tabular-nums">{fmt(totalPending)} <span className="text-sm font-medium">{currency}</span></div>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-5 border border-emerald-200">
                    <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm mb-1">
                        <CheckCircle2 className="w-4 h-4" /> {t(language, 'Paid')}
                    </div>
                    <div className="text-2xl font-black text-emerald-900 tabular-nums">{fmt(totalPaid)} <span className="text-sm font-medium">{currency}</span></div>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-200">
                    <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm mb-1">
                        <CreditCard className="w-4 h-4" /> {t(language, 'TotalTitle')}
                    </div>
                    <div className="text-2xl font-black text-blue-900 tabular-nums">{fmt(totalAmount)} <span className="text-sm font-medium">{currency}</span></div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder={t(language, 'SearchPartners')}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-64 text-slate-900 shadow-sm"
                        />
                    </div>
                </div>
            </div>

            {/* Month Nav */}
            <div className="mb-4 grid grid-cols-3 items-center">
                <div className="justify-self-start">
                    <button onClick={prevMonth} className="text-blue-600 hover:text-blue-800 underline underline-offset-4 decoration-blue-300/40 text-sm font-medium">
                        {t(language, 'Previous')}
                    </button>
                </div>
                <div className="justify-self-center flex items-center gap-2">
                    <span className="text-slate-700 font-semibold">{formatMonthLabel(monthCursor, language)}</span>
                    <Calendar className="w-5 h-5 text-slate-400" />
                </div>
                <div className="justify-self-end">
                    <button onClick={nextMonth} className="text-blue-600 hover:text-blue-800 underline underline-offset-4 decoration-blue-300/40 text-sm font-medium">
                        {t(language, 'Next')}
                    </button>
                </div>
            </div>

            {/* Payouts Table */}
            <div className="bg-white rounded-2xl shadow p-3 overflow-x-auto">
                <table className="w-full table-auto text-sm text-gray-900 text-left border-collapse">
                    <thead>
                        <tr className="text-gray-500 font-semibold">
                            <th className="p-2 whitespace-nowrap">{t(language, 'PayoutID')}</th>
                            {activeTab === 'partner' ? (
                                <th className="p-2 whitespace-nowrap">{t(language, 'Partner')}</th>
                            ) : (
                                <th className="p-2 whitespace-nowrap">{t(language, 'AdvisorTitle')}</th>
                            )}
                            <th className="p-2 whitespace-nowrap">{t(language, 'Period')}</th>
                            <th className="p-2 whitespace-nowrap text-right">{t(language, 'Amount')} ({currency})</th>
                            <th className="p-2 whitespace-nowrap">{t(language, 'TaskStatus')}</th>
                            <th className="p-2 whitespace-nowrap text-right">{t(language, 'Actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-gray-500">
                                    <div className="animate-pulse flex flex-col items-center">
                                        <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                                        {t(language, 'Loading')}
                                    </div>
                                </td>
                            </tr>
                        ) : filteredPayouts.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-gray-500">
                                    {t(language, 'NoPayoutsFound')}
                                </td>
                            </tr>
                        ) : (
                            filteredPayouts.map(payout => (
                                <tr key={payout.id} className="border-t hover:bg-blue-50/40 transition">
                                    <td className="p-2 whitespace-nowrap">
                                        <div className="text-sm font-medium text-slate-700">{payout.id.slice(0, 8).toUpperCase()}</div>
                                    </td>
                                    {activeTab === 'partner' ? (
                                        <td className="p-2 whitespace-nowrap">
                                            <div className="font-semibold text-gray-900">{payout.crm_partners?.name || t(language, 'UnknownPartner')}</div>
                                            <div className="text-xs text-slate-500">{t(language, 'AdvisorTitle')}: {payout.sale_advisor_id ? accountsMap[payout.sale_advisor_id] : t(language, 'NoAdvisor')}</div>
                                        </td>
                                    ) : (
                                        <td className="p-2 whitespace-nowrap">
                                            <div className="font-semibold text-gray-900">{payout.sale_advisor_id ? accountsMap[payout.sale_advisor_id] || t(language, 'UnknownAdvisor') : t(language, 'UnknownAdvisor')}</div>
                                        </td>
                                    )}
                                    <td className="p-2 whitespace-nowrap text-slate-500">{payout.period || '-'}</td>
                                    <td className="p-2 whitespace-nowrap text-right tabular-nums font-semibold">
                                        {fmt(Number(payout.amount))}
                                    </td>
                                    <td className="p-2 whitespace-nowrap">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                            payout.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                                            payout.status === 'Processing' ? 'bg-blue-100 text-blue-700' :
                                            'bg-amber-100 text-amber-700'
                                        }`}>
                                            {t(language, payout.status as any)}
                                        </span>
                                        {payout.payment_date && (
                                            <div className="text-xs text-gray-500 mt-0.5">on {new Date(payout.payment_date).toLocaleDateString()}</div>
                                        )}
                                    </td>
                                    <td className="p-2 whitespace-nowrap text-right">
                                        {payout.status === 'Pending' && currentUser?.role !== 'sale advisor' && (
                                            <button
                                                onClick={() => openMarkPaid(payout)}
                                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ml-auto"
                                            >
                                                <CreditCard className="w-3.5 h-3.5"/> {t(language, 'MarkPaid')}
                                            </button>
                                        )}
                                        {payout.status === 'Paid' && (
                                            <button 
                                                onClick={() => openViewReceipt(payout)}
                                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ml-auto"
                                            >
                                                <FileText className="w-3.5 h-3.5" /> {t(language, 'ViewReceipt')}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                    {!loading && filteredPayouts.length > 0 && (
                        <tbody>
                            <tr className="border-t bg-gray-50 font-semibold">
                                <td colSpan={3} className="p-2 text-right">
                                    {t(language, 'Totals')}
                                </td>
                                <td className="p-2 text-right tabular-nums">
                                    {fmt(totalAmount)}
                                </td>
                                <td colSpan={2} className="p-2"></td>
                            </tr>
                        </tbody>
                    )}
                </table>
            </div>

            {/* Modals */}
            {modalMode !== 'none' && selectedPayout && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                {modalMode === 'markPaid' ? <CreditCard className="w-5 h-5 text-blue-500" /> : <FileText className="w-5 h-5 text-blue-500" />}
                                {modalMode === 'markPaid' ? t(language, 'MarkPayoutAsPaid') : t(language, 'PayoutReceipt')}
                            </h2>
                            <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition p-1 hover:bg-slate-100 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {modalMode === 'markPaid' && (
                            <form onSubmit={submitMarkPaid} className="p-4 sm:p-6 flex flex-col gap-5">
                                
                                <div className="bg-blue-50 p-4 rounded-xl flex justify-between items-center border border-blue-100">
                                    <div className="text-sm font-medium text-blue-800">
                                        {activeTab === 'partner' ? t(language, 'Partner') + ':' : t(language, 'AdvisorTitle') + ':'} <span className="font-bold">
                                            {activeTab === 'partner' ? 
                                                (selectedPayout.crm_partners?.name || t(language, 'Unknown')) :
                                                (selectedPayout.sale_advisor_id ? accountsMap[selectedPayout.sale_advisor_id] || t(language, 'UnknownAdvisor') : t(language, 'Unknown'))
                                            }
                                        </span>
                                    </div>
                                    <div className="text-lg font-black text-blue-900 tabular-nums">
                                        {fmt(Number(selectedPayout.amount))} {currency}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'PaymentDateStar')}</label>
                                    <input 
                                        type="date" 
                                        required
                                        value={paymentDate}
                                        onChange={e => setPaymentDate(e.target.value)}
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 bg-white"
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'PaymentMethodStar')}</label>
                                    <select 
                                        required
                                        value={paymentMethod}
                                        onChange={e => setPaymentMethod(e.target.value)}
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 bg-white"
                                    >
                                        <option value="Cash">{t(language, 'Cash')}</option>
                                        <option value="Bank Transfer">{t(language, 'BankTransfer')}</option>
                                        <option value="Other">{t(language, 'Other')}</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'InternalNotes')}</label>
                                    <textarea 
                                        rows={3}
                                        placeholder={t(language, 'InternalNotesPlaceholder')}
                                        value={paymentNotes}
                                        onChange={e => setPaymentNotes(e.target.value)}
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm resize-none text-slate-900 bg-white placeholder:text-slate-400"
                                    />
                                </div>

                                <div className="flex gap-3 justify-end mt-2 pt-4 border-t border-slate-100">
                                    <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition">
                                        {t(language, 'Cancel')}
                                    </button>
                                    <button type="submit" className="px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition flex items-center gap-2 shadow-md hover:shadow-lg">
                                        <CheckCircle2 className="w-4 h-4"/> {t(language, 'ConfirmPayment')}
                                    </button>
                                </div>
                            </form>
                        )}

                        {modalMode === 'viewReceipt' && (
                            <div className="p-4 sm:p-6 flex flex-col gap-6">
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900">{fmt(Number(selectedPayout.amount))} {currency}</h3>
                                    <p className="text-sm font-semibold text-emerald-600 mt-1 uppercase tracking-wider">{t(language, 'TransactionSuccessful')}</p>
                                </div>

                                <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-4">
                                    <div className="flex justify-between items-center border-b border-slate-200/60 pb-3">
                                        <span className="text-sm text-slate-500">{activeTab === 'partner' ? t(language, 'Partner') : t(language, 'AdvisorTitle')}</span>
                                        <span className="text-sm font-semibold text-slate-900">
                                            {activeTab === 'partner' ? 
                                                (selectedPayout.crm_partners?.name || t(language, 'Unknown')) :
                                                (selectedPayout.sale_advisor_id ? accountsMap[selectedPayout.sale_advisor_id] || t(language, 'UnknownAdvisor') : t(language, 'Unknown'))
                                            }
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-slate-200/60 pb-3">
                                        <span className="text-sm text-slate-500">{t(language, 'Period')}</span>
                                        <span className="text-sm font-semibold text-slate-900">{selectedPayout.period}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-slate-200/60 pb-3">
                                        <span className="text-sm text-slate-500">{t(language, 'PaymentDate')}</span>
                                        <span className="text-sm font-semibold text-slate-900">
                                            {selectedPayout.payment_date ? new Date(selectedPayout.payment_date).toLocaleDateString() : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-slate-500">{t(language, 'PaymentMethod')}</span>
                                        <span className="text-sm font-mono font-semibold text-slate-900">{selectedPayout.reference_number || t(language, 'Cash')}</span>
                                    </div>
                                </div>

                                {selectedPayout.notes && (
                                    <div>
                                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t(language, 'Notes')}</h4>
                                        <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                            {selectedPayout.notes}
                                        </p>
                                    </div>
                                )}

                                <div className="flex gap-3 justify-end mt-2">
                                    <button onClick={closeModal} className="w-full px-5 py-2.5 text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition shadow-md">
                                        {t(language, 'CloseReceipt')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
