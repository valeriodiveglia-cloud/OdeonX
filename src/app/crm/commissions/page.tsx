'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Search, Calendar, CheckCircle2, Activity, RefreshCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
import { CRMReferral } from '@/types/crm'

interface ExtendedReferral extends CRMReferral {
    sale_advisor_id?: string
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
    const [accountsMap, setAccountsMap] = useState<Record<string, string>>({})
    const [currentUser, setCurrentUser] = useState<{ id: string, role?: string } | null>(null)
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
                crm_partners (name, owner_id, crm_agreements (client_discount_value)),
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
            supabase.from('app_accounts').select('id, user_id, name, email')
        ])

        if (refsRes.error) {
            console.error('Error fetching referrals:', refsRes.error)
            alert('Failed to load commissions')
        } else {
            setReferrals(refsRes.data as unknown as ExtendedReferral[])
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

    const filteredReferrals = useMemo(() => {
        return referrals.filter(ref => {
            const matchesSearch = 
                (ref.guest_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (ref.crm_partners?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                ref.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (ref.sale_advisor_id && accountsMap[ref.sale_advisor_id]?.toLowerCase().includes(searchTerm.toLowerCase()))
            
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
                                <tr key={ref.id} className="border-t hover:bg-blue-50/40">
                                    <td className="p-3 whitespace-nowrap">
                                        <div className="flex items-center gap-2 font-medium">
                                            <Calendar className="w-4 h-4 text-gray-400"/> {ref.arrival_date ? new Date(ref.arrival_date).toLocaleDateString() : 'N/A'}
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
                                                {accountsMap[ref.sale_advisor_id] || t(language, 'Unknown')}
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
        </div>
    )
}
