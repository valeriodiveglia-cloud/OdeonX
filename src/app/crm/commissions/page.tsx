'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Search, Calendar, CheckCircle2, Activity, RefreshCcw, X, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
import { CRMReferral } from '@/types/crm'

interface ExtendedReferral extends CRMReferral {
    sale_advisor_id?: string
    payout_id?: string | null
    advisor_payout_id?: string | null
    crm_partners: {
        name: string
        owner_id?: string
        crm_agreements?: { client_discount_value: number | null }[]
    } | null
    partner_payout?: { status: string } | null
    advisor_payout?: { status: string } | null
}

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }
function formatMonthLabel(d: Date, language?: string) { return d.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' }) }

export default function CRMCommissionsPage() {
    const [searchTerm, setSearchTerm] = useState('')
    const [referrals, setReferrals] = useState<ExtendedReferral[]>([])
    const [loading, setLoading] = useState(true)
    const [accountsMap, setAccountsMap] = useState<Record<string, {name: string, deduct_pit: boolean}>>({})
    const [currentUser, setCurrentUser] = useState<{ id: string, role?: string } | null>(null)
    const [selectedReferral, setSelectedReferral] = useState<ExtendedReferral | null>(null)
    const { currency, crmPartnerRules, crmCommissionRules, language } = useSettings()

    /* month cursor */
    const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))

    function prevMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), -1)) }
    function nextMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), 1)) }

    const fetchData = async () => {
        setLoading(true)

        const { data: userData } = await supabase.auth.getUser()
        let userRole = 'staff'
        let userId = ''
        if (userData?.user) {
            userId = userData.user.id
            const { data: acc } = await supabase.from('app_accounts').select('role').eq('user_id', userId).maybeSingle()
            if (acc) userRole = acc.role
            setCurrentUser({ id: userId, role: userRole })
        }

        let query = supabase
            .from('crm_referrals')
            .select(`
                *, 
                crm_partners (name, owner_id, issues_vat_invoice, crm_agreements (client_discount_value)),
                partner_payout:crm_payouts!crm_referrals_payout_id_fkey(status),
                advisor_payout:crm_payouts!crm_referrals_advisor_payout_id_fkey(status)
            `)
            .order('created_at', { ascending: false })

        // Role-based filtering constraints
        if (userRole === 'sale advisor') {
            query = query.eq('sale_advisor_id', userId)
        }

        const [refsRes, accountsRes] = await Promise.all([
            query,
            supabase.from('app_accounts').select('id, user_id, name, email, deduct_pit')
        ])

        if (refsRes.error) {
            console.error('Error fetching referrals:', refsRes.error)
            alert('Failed to load commissions')
        } else {
            setReferrals(refsRes.data as unknown as ExtendedReferral[])
        }

        if (accountsRes.data) {
            const map: Record<string, {name: string, deduct_pit: boolean}> = {}
            for (const acc of accountsRes.data) {
                if (acc.user_id) map[acc.user_id] = {
                    name: acc.name || acc.email || 'Unknown User',
                    deduct_pit: acc.deduct_pit !== false
                }
            }
            setAccountsMap(map)
        }
        
        setLoading(false)
    }

    useEffect(() => {
        fetchData()
    }, [])

    const filteredReferrals = useMemo(() => {
        return referrals.filter(ref => {
            const matchesSearch = 
                (ref.guest_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (ref.crm_partners?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                ref.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (ref.sale_advisor_id && accountsMap[ref.sale_advisor_id]?.name.toLowerCase().includes(searchTerm.toLowerCase()))
            
            if (!matchesSearch) return false

            const t = ref.arrival_date ? new Date(ref.arrival_date) : null
            if (!t) return false
            return t.getFullYear() === monthCursor.getFullYear() && t.getMonth() === monthCursor.getMonth()
        })
    }, [referrals, searchTerm, monthCursor, accountsMap])

    const totalPartnerComm = filteredReferrals.reduce((sum, r) => sum + (r.commission_value || 0), 0)
    const totalAdvisorComm = filteredReferrals.reduce((sum, r) => sum + (r.advisor_commission_value || 0), 0)

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(val || 0))
    }

    return (
        <div className="p-6 max-w-7xl mx-auto relative h-[calc(100vh-2rem)] flex flex-col">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'Commissions')}</h1>
                    <p className="text-slate-500 mt-1">{t(language, 'CommissionsDesc')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 shrink-0">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-200">
                    <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm mb-1">
                        <Activity className="w-4 h-4" /> {t(language, 'TotalItems')}
                    </div>
                    <div className="text-2xl font-black text-blue-900 tabular-nums">{filteredReferrals.length}</div>
                </div>
                {currentUser?.role !== 'sale advisor' && (
                    <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50 rounded-2xl p-5 border border-purple-200">
                        <div className="flex items-center gap-2 text-purple-800 font-semibold text-sm mb-1">
                            {t(language, 'PartnerCommissions')}
                        </div>
                        <div className="text-2xl font-black text-purple-900 tabular-nums">{formatCurrency(totalPartnerComm)} <span className="text-sm font-medium">{currency}</span></div>
                    </div>
                )}
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-5 border border-emerald-200">
                    <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm mb-1">
                        {t(language, 'AdvisorCommissions')}
                    </div>
                    <div className="text-2xl font-black text-emerald-900 tabular-nums">{formatCurrency(totalAdvisorComm)} <span className="text-sm font-medium">{currency}</span></div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 shrink-0">
                <div className="relative flex-1 max-w-sm">
                    <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder={t(language, 'SearchPartnerAdvisorID')}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full text-slate-900 shadow-sm"
                    />
                </div>
            </div>

            {/* Month Nav */}
            <div className="mb-4 grid grid-cols-3 items-center shrink-0">
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

            {/* Flat List Table */}
            <div className="bg-white rounded-2xl shadow overflow-y-auto flex-1 h-0">
                <table className="w-full table-auto text-sm text-gray-900 text-left border-collapse">
                    <thead className="sticky top-0 bg-white z-10 shadow-sm">
                        <tr className="text-gray-500 font-semibold">
                            <th className="p-3 whitespace-nowrap bg-white">{t(language, 'DateAndRef')}</th>
                            {currentUser?.role !== 'sale advisor' && (
                                <th className="p-3 whitespace-nowrap bg-white">{t(language, 'Partner')}</th>
                            )}
                            <th className="p-3 whitespace-nowrap bg-white">{t(language, 'SalesAdvisor')}</th>
                            <th className="p-3 whitespace-nowrap text-right bg-white">{t(language, 'Revenue')} ({currency})</th>
                            {currentUser?.role !== 'sale advisor' && (
                                <th className="p-3 whitespace-nowrap text-right bg-white text-purple-700">{t(language, 'PartnerCommSummary')}</th>
                            )}
                            <th className="p-3 whitespace-nowrap text-right bg-white text-emerald-700">{t(language, 'AdvisorCommSummary')}</th>
                            <th className="p-3 whitespace-nowrap bg-white">{t(language, 'TaskStatus')}</th>
                            <th className="p-3 whitespace-nowrap bg-white">{t(language, 'Payout')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="p-8 text-center text-gray-500">
                                    <div className="animate-pulse flex flex-col items-center">
                                        <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                                        {t(language, 'Loading')}
                                    </div>
                                </td>
                            </tr>
                        ) : filteredReferrals.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="p-8 text-center text-gray-500">
                                    {t(language, 'NoCommissionsFound')}
                                </td>
                            </tr>
                        ) : (
                            filteredReferrals.map(ref => (
                                <tr key={ref.id} onClick={() => setSelectedReferral(ref)} className="border-t hover:bg-blue-50/40 cursor-pointer transition">
                                    <td className="p-3 whitespace-nowrap">
                                        <div className="flex items-center gap-2 font-medium">
                                            <Calendar className="w-4 h-4 text-gray-400"/> {ref.arrival_date ? new Date(ref.arrival_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-0.5 uppercase font-mono">{ref.id.split('-')[0]}</div>
                                    </td>
                                    {currentUser?.role !== 'sale advisor' && (
                                        <td className="p-3 whitespace-nowrap">
                                            <div className="font-semibold text-gray-900">
                                                {ref.partner_id ? (ref.crm_partners?.name || t(language, 'UnknownPartner')) : <span className="text-slate-400 italic">{t(language, 'DirectAdvisor')}</span>}
                                            </div>
                                        </td>
                                    )}
                                    <td className="p-3 whitespace-nowrap">
                                        {ref.sale_advisor_id ? (
                                            <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg w-fit text-xs font-medium border border-blue-100">
                                                {accountsMap[ref.sale_advisor_id]?.name || t(language, 'Unknown')}
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 text-xs italic">{t(language, 'Unassigned')}</span>
                                        )}
                                    </td>
                                    <td className="p-3 whitespace-nowrap text-right tabular-nums font-semibold">
                                        {formatCurrency(ref.revenue_generated)}
                                    </td>
                                    {currentUser?.role !== 'sale advisor' && (
                                        <td className="p-3 whitespace-nowrap text-right tabular-nums font-bold text-purple-700">
                                            {formatCurrency(ref.commission_value || 0)}
                                        </td>
                                    )}
                                    <td className="p-3 whitespace-nowrap text-right tabular-nums font-bold text-emerald-700">
                                        {formatCurrency(ref.advisor_commission_value || 0)}
                                    </td>
                                    <td className="p-3 whitespace-nowrap">
                                        {(() => {
                                            if (ref.status === 'Cancelled') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-red-100 text-red-700 border-red-200">{t(language, 'Cancelled')}</span>;
                                            
                                            const hasPtnr = !!ref.payout_id;
                                            const hasAdv = !!ref.advisor_payout_id;
                                            const ptnrPaid = ref.partner_payout?.status === 'Paid';
                                            const advPaid = ref.advisor_payout?.status === 'Paid';
                                            
                                            // Determine composite status
                                            let compositeStatus = t(language, 'Pending');
                                            let colorClass = 'bg-amber-100 text-amber-700 border-amber-200';
                                            
                                            if (hasPtnr || hasAdv) {
                                                const allExistingPaid = (!hasPtnr || ptnrPaid) && (!hasAdv || advPaid);
                                                const somePaid = (hasPtnr && ptnrPaid) || (hasAdv && advPaid);
                                                
                                                if (allExistingPaid) {
                                                    compositeStatus = t(language, 'Paid');
                                                    colorClass = 'bg-emerald-100 text-emerald-700 border-emerald-200';
                                                } else if (somePaid) {
                                                    compositeStatus = t(language, 'PartiallyPaid');
                                                    colorClass = 'bg-blue-100 text-blue-700 border-blue-200';
                                                } else {
                                                    compositeStatus = t(language, 'InPayout');
                                                    colorClass = 'bg-blue-50 text-blue-600 border-blue-200';
                                                }
                                            }

                                            return (
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${colorClass}`}>
                                                    {compositeStatus}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    <td className="p-3 whitespace-nowrap">
                                        <div className="flex flex-col gap-1">
                                            {currentUser?.role !== 'sale advisor' && (
                                                <div className="flex items-center gap-1.5 text-xs">
                                                    <span className="font-medium text-slate-500 w-12 border-r border-slate-200">PTNR:</span>
                                                    {ref.payout_id ? (
                                                        ref.partner_payout?.status === 'Paid' ? (
                                                            <span className="text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> {t(language, 'Paid')}</span>
                                                        ) : (
                                                            <span className="text-amber-600 font-semibold flex items-center gap-1">{t(language, 'Processing')}</span>
                                                        )
                                                    ) : (
                                                        <span className="text-slate-400 italic">{t(language, 'NoPayout')}</span>
                                                    )}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <span className="font-medium text-slate-500 w-12 border-r border-slate-200">ADV:</span>
                                                {ref.advisor_payout_id ? (
                                                    ref.advisor_payout?.status === 'Paid' ? (
                                                        <span className="text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> {t(language, 'Paid')}</span>
                                                    ) : (
                                                        <span className="text-amber-600 font-semibold flex items-center gap-1">{t(language, 'Processing')}</span>
                                                    )
                                                ) : (
                                                    <span className="text-slate-400 italic">{t(language, 'NoPayout')}</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal Breakdown */}
            {selectedReferral && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-white">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900">{t(language, 'TransactionDetails') || 'Transaction Details'}</h2>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">REF: {selectedReferral.id.split('-')[0].toUpperCase()} • {new Date(selectedReferral.arrival_date || selectedReferral.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedReferral(null)} className="p-2 hover:bg-slate-100 rounded-xl transition text-slate-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        {/* Body */}
                        <div className="p-6 sm:p-8 space-y-6 bg-slate-50/50 max-h-[80vh] overflow-y-auto">
                            {/* Revenue Header - Clean & Simple */}
                            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="text-slate-500 text-sm font-semibold uppercase tracking-wider">{t(language, 'BaseRevenue')}</div>
                                        {(() => {
                                            if (selectedReferral.status === 'Cancelled') return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border bg-red-100 text-red-700 border-red-200 uppercase tracking-wider">{t(language, 'Cancelled')}</span>;
                                            const hasPtnr = !!selectedReferral.payout_id;
                                            const hasAdv = !!selectedReferral.advisor_payout_id;
                                            const ptnrPaid = selectedReferral.partner_payout?.status === 'Paid';
                                            const advPaid = selectedReferral.advisor_payout?.status === 'Paid';
                                            let compositeStatus = t(language, 'Pending');
                                            let colorClass = 'bg-amber-100 text-amber-700 border-amber-200';
                                            if (hasPtnr || hasAdv) {
                                                const allExistingPaid = (!hasPtnr || ptnrPaid) && (!hasAdv || advPaid);
                                                const somePaid = (hasPtnr && ptnrPaid) || (hasAdv && advPaid);
                                                if (allExistingPaid) {
                                                    compositeStatus = t(language, 'Paid');
                                                    colorClass = 'bg-emerald-100 text-emerald-700 border-emerald-200';
                                                } else if (somePaid) {
                                                    compositeStatus = t(language, 'PartiallyPaid');
                                                    colorClass = 'bg-blue-100 text-blue-700 border-blue-200';
                                                } else {
                                                    compositeStatus = t(language, 'InPayout');
                                                    colorClass = 'bg-blue-50 text-blue-600 border-blue-200';
                                                }
                                            }
                                            return <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider ${colorClass}`}>{compositeStatus}</span>;
                                        })()}
                                    </div>
                                    <div className="text-slate-500 text-sm font-medium">{t(language, 'GeneratedByTransaction')}</div>
                                </div>
                                <div className="text-3xl sm:text-4xl font-black text-slate-900 tabular-nums whitespace-nowrap">
                                    {formatCurrency(selectedReferral.revenue_generated)} <span className="text-xl sm:text-2xl font-semibold text-slate-400">{currency}</span>
                                </div>
                            </div>

                            {/* Partner & Advisor stack */}
                            <div className="space-y-4">
                                {/* Partner */}
                                {currentUser?.role !== 'sale advisor' && (
                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col gap-3 shadow-sm">
                                        <div className="flex justify-between items-start sm:items-center pb-3 border-b border-slate-100">
                                            <div>
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t(language, 'Partner')}</span>
                                                </div>
                                                <div className="font-semibold text-slate-900">
                                                    {selectedReferral.partner_id ? (selectedReferral.crm_partners?.name || t(language, 'UnknownPartner')) : <span className="text-slate-400 italic">{t(language, 'DirectAdvisor')}</span>}
                                                </div>
                                            </div>
                                            {selectedReferral.partner_id && (
                                                <div className="text-right">
                                                    {selectedReferral.payout_id ? (
                                                        selectedReferral.partner_payout?.status === 'Paid' ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-wider"><CheckCircle2 className="w-3 h-3"/> {t(language, 'Paid')}</span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-wider">{t(language, 'Processing')}</span>
                                                        )
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-slate-50 text-slate-500 border border-slate-200 uppercase tracking-wider">{t(language, 'NoPayout')}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {selectedReferral.partner_id && (
                                            <>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500 font-medium">{t(language, 'GrossCommission')}</span>
                                                    <span className="font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                                                        {formatCurrency((selectedReferral.crm_partners as any)?.issues_vat_invoice === true ? (selectedReferral.commission_value || 0) : (selectedReferral.commission_value || 0) / 0.9)} {currency}
                                                    </span>
                                                </div>
                                                {(selectedReferral.crm_partners as any)?.issues_vat_invoice !== true && (
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-rose-500 font-medium flex items-center gap-2">
                                                            PIT Deduction <span className="text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md font-bold border border-rose-100 tracking-wider">10%</span>
                                                        </span>
                                                        <span className="font-semibold text-rose-600 tabular-nums whitespace-nowrap">
                                                            -{formatCurrency(((selectedReferral.commission_value || 0) / 0.9) - (selectedReferral.commission_value || 0))} {currency}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between items-center pt-2 mt-1 border-t border-slate-50">
                                                    <span className="text-sm font-bold text-slate-900">{t(language, 'NetCommission')}</span>
                                                    <span className="font-black text-purple-700 text-xl tabular-nums whitespace-nowrap">
                                                        {formatCurrency(selectedReferral.commission_value || 0)} <span className="text-sm font-semibold text-purple-400">{currency}</span>
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Advisor */}
                                <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col gap-3 shadow-sm">
                                    <div className="flex justify-between items-start sm:items-center pb-3 border-b border-slate-100">
                                        <div>
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t(language, 'SalesAdvisor')}</span>
                                            </div>
                                            <div className="font-semibold text-slate-900">
                                                {selectedReferral.sale_advisor_id ? (accountsMap[selectedReferral.sale_advisor_id]?.name || t(language, 'UnknownAdvisor')) : <span className="text-slate-400 italic">{t(language, 'Unassigned')}</span>}
                                            </div>
                                        </div>
                                        {selectedReferral.sale_advisor_id && (
                                            <div className="text-right">
                                                {selectedReferral.advisor_payout_id ? (
                                                    selectedReferral.advisor_payout?.status === 'Paid' ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-wider"><CheckCircle2 className="w-3 h-3"/> {t(language, 'Paid')}</span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-wider">{t(language, 'Processing')}</span>
                                                    )
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-slate-50 text-slate-500 border border-slate-200 uppercase tracking-wider">{t(language, 'NoPayout')}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {selectedReferral.sale_advisor_id && (
                                        <>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500 font-medium">{t(language, 'GrossCommission')}</span>
                                                <span className="font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                                                    {formatCurrency(accountsMap[selectedReferral.sale_advisor_id]?.deduct_pit === false ? (selectedReferral.advisor_commission_value || 0) : (selectedReferral.advisor_commission_value || 0) / 0.9)} {currency}
                                                </span>
                                            </div>
                                            {accountsMap[selectedReferral.sale_advisor_id]?.deduct_pit !== false && (
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-rose-500 font-medium flex items-center gap-2">
                                                        PIT Deduction <span className="text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md font-bold border border-rose-100 tracking-wider">10%</span>
                                                    </span>
                                                    <span className="font-semibold text-rose-600 tabular-nums whitespace-nowrap">
                                                        -{formatCurrency(((selectedReferral.advisor_commission_value || 0) / 0.9) - (selectedReferral.advisor_commission_value || 0))} {currency}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center pt-2 mt-1 border-t border-slate-50">
                                                <span className="text-sm font-bold text-slate-900">{t(language, 'NetCommission')}</span>
                                                <span className="font-black text-emerald-700 text-xl tabular-nums whitespace-nowrap">
                                                    {formatCurrency(selectedReferral.advisor_commission_value || 0)} <span className="text-sm font-semibold text-emerald-400">{currency}</span>
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Total Net Payout */}
                            <div className="bg-slate-100 p-5 rounded-2xl border border-slate-200 flex justify-between items-center shadow-sm">
                                <div className="text-sm font-bold text-slate-700 uppercase tracking-wider">{t(language, 'TotalNetPayout')}</div>
                                <div className="text-2xl font-black text-slate-900 tabular-nums whitespace-nowrap">
                                    {formatCurrency((currentUser?.role !== 'sale advisor' ? (selectedReferral.commission_value || 0) : 0) + (selectedReferral.advisor_commission_value || 0))} <span className="text-lg font-semibold text-slate-500">{currency}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
