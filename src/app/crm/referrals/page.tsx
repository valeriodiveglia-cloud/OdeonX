'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Minus, Search, Filter, CheckCircle2, XCircle, AlertCircle, ChevronLeft, ChevronRight, Calendar, RefreshCcw, Ticket, Users, Banknote } from 'lucide-react'
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

export default function CRMReferralsPage() {
    const [searchTerm, setSearchTerm] = useState('')
    const [referrals, setReferrals] = useState<ExtendedReferral[]>([])
    const [partners, setPartners] = useState<{id: string, name: string, owner_id?: string, partner_code?: string}[]>([])
    const [advisors, setAdvisors] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [accountsMap, setAccountsMap] = useState<Record<string, string>>({})
    const [currentUser, setCurrentUser] = useState<{ id: string, role?: string } | null>(null)
    const [selectedReferral, setSelectedReferral] = useState<ExtendedReferral | null>(null)
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
    const { currency, crmAdvisorCommissionPct, crmCommissionType, crmCommissionRules, crmPartnerRules, language } = useSettings()

    /* month cursor */
    const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
    const monthInputValue = useMemo(() => toMonthInputValue(monthCursor), [monthCursor])

    function prevMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), -1)) }
    function nextMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), 1)) }
    function onPickMonth(val: string) { const d = fromMonthInputValue(val); if (d) setMonthCursor(d) }

    // Form State
    const [formData, setFormData] = useState({
        id: undefined as string | undefined,
        sourceType: 'partner', // 'partner' | 'advisor'
        partner_id: '',
        advisor_user_id: '',
        referral_code: '',
        arrival_date: new Date().toISOString().split('T')[0],
        party_size: 2,
        revenue_generated: 0,
        status: 'Pending'
    })
    
    const [matchedSource, setMatchedSource] = useState<{ type: 'partner'|'advisor', name: string } | null>(null)
    // No activeAgreement state needed anymore

    const fetchData = async () => {
        setLoading(true)
        const [refsRes, partnersRes, accountsRes] = await Promise.all([
            supabase
                .from('crm_referrals')
                .select(`
                *, 
                crm_partners (name, owner_id, crm_agreements (client_discount_value)),
                partner_payout:crm_payouts!crm_referrals_payout_id_fkey(status),
                advisor_payout:crm_payouts!crm_referrals_advisor_payout_id_fkey(status)
            `)
                .order('created_at', { ascending: false }),
            supabase
                .from('crm_partners')
                .select('id, name, owner_id, partner_code')
                .or('pipeline_stage.eq.Waiting for Activation,pipeline_stage.eq.Active')
                .order('name'),
            supabase
                .from('app_accounts')
                .select('id, user_id, name, email, referral_code, role')
        ])

        if (refsRes.error) {
            console.error('Error fetching referrals:', refsRes.error)
            alert('Failed to load referrals')
        } else {
            setReferrals(refsRes.data as unknown as ExtendedReferral[])
        }

        if (partnersRes.data) {
            setPartners(partnersRes.data)
        }
        
        if (accountsRes.data) {
            setAdvisors(accountsRes.data.filter(a => a.role === 'sale advisor' && a.referral_code))

            const map: Record<string, string> = {}
            for (const acc of accountsRes.data) {
                if (acc.user_id) map[acc.user_id] = acc.name || acc.email || 'Unknown User'
            }
            setAccountsMap(map)
        }
        
        setLoading(false)
    }

    const [revenueInput, setRevenueInput] = useState('')

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data } = await supabase.from('app_accounts').select('role').eq('user_id', user.id).single()
                setCurrentUser({ id: user.id, role: data?.role })
            }
            fetchData()
        }
        init()
    }, [])

    const calculatedCommission = React.useMemo(() => {
        if (formData.sourceType === 'advisor') return 0; // Advisor direct referral doesn't pay a partner
        if (!crmPartnerRules?.has_commission || isNaN(formData.revenue_generated)) return 0;
        
        let baseAmount = formData.revenue_generated;
        if (crmPartnerRules.commission_type === 'Percentage') {
            if (crmPartnerRules.commission_base === 'After Discount' && crmPartnerRules.has_discount) {
                const discount = crmPartnerRules.client_discount_type === 'Percentage' 
                    ? baseAmount * ((crmPartnerRules.client_discount_value || 0) / 100)
                    : (crmPartnerRules.client_discount_value || 0);
                baseAmount = Math.max(0, baseAmount - discount);
            }
            return baseAmount * ((crmPartnerRules.commission_value || 0) / 100);
        }
        return crmPartnerRules.commission_value || 0;
    }, [formData.revenue_generated, crmPartnerRules, formData.sourceType]);

    const calculatedDiscount = React.useMemo(() => {
        if (isNaN(formData.revenue_generated)) return 0;
        if (formData.sourceType === 'advisor') {
            if (crmCommissionRules?.has_direct_discount === false) return 0;
            if (crmCommissionRules?.direct_discount_type === 'Fixed') {
                return crmCommissionRules.direct_discount_value || 0;
            }
            return formData.revenue_generated * ((crmCommissionRules?.direct_discount_value || crmCommissionRules?.direct_discount_pct || 0) / 100);
        }

        if (!crmPartnerRules?.has_discount) return 0;
        if (crmPartnerRules.client_discount_type === 'Percentage') {
            return formData.revenue_generated * ((crmPartnerRules.client_discount_value || 0) / 100);
        }
        return crmPartnerRules.client_discount_value || 0;
    }, [formData.revenue_generated, crmPartnerRules, crmCommissionRules, formData.sourceType]);

    const calculatedAdvisorCommission = React.useMemo(() => {
        if (formData.sourceType !== 'advisor' || isNaN(formData.revenue_generated)) return 0;
        let baseAmount = formData.revenue_generated;
        if (crmCommissionRules?.has_direct_discount !== false && crmCommissionRules?.direct_commission_base === 'After Discount') {
            baseAmount = Math.max(0, baseAmount - calculatedDiscount);
        }
        if (crmCommissionRules?.direct_commission_type === 'Fixed') {
            return crmCommissionRules.direct_commission_value || 0;
        } else {
            return baseAmount * ((crmCommissionRules?.direct_commission_value || crmCommissionRules?.direct_commission_pct || 10) / 100);
        }
    }, [formData.revenue_generated, formData.sourceType, crmCommissionRules, calculatedDiscount]);

    const formatCurrencyInput = (val: string) => {
        const cleaned = val.replace(/[^\d.]/g, '');
        const parts = cleaned.split('.');
        if (parts[0]) {
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }
        return parts.slice(0, 2).join('.');
    }

    const handleRevenueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = formatCurrencyInput(e.target.value)
        setRevenueInput(formatted)
        const parsed = parseFloat(formatted.replace(/,/g, ''))
        setFormData(prev => ({ ...prev, revenue_generated: isNaN(parsed) ? 0 : parsed }))
    }

    const handleCodeChange = (val: string) => {
        const code = val.toUpperCase().trim()
        setFormData(prev => ({ ...prev, referral_code: code }))
        
        if (!code) {
            setMatchedSource(null)
            setFormData(prev => ({ ...prev, sourceType: 'partner', partner_id: '', advisor_user_id: '' }))
            return
        }

        // Try to match partner first
        const matchedPartner = partners.find(p => p.partner_code === code)
        if (matchedPartner) {
            setMatchedSource({ type: 'partner', name: matchedPartner.name })
            setFormData(prev => ({ ...prev, sourceType: 'partner', partner_id: matchedPartner.id, advisor_user_id: '' }))
            return
        }

        // Try to match advisor
        const matchedAdvisor = advisors.find(a => a.referral_code === code)
        if (matchedAdvisor) {
            setMatchedSource({ type: 'advisor', name: matchedAdvisor.name || matchedAdvisor.email })
            setFormData(prev => ({ ...prev, sourceType: 'advisor', partner_id: '', advisor_user_id: matchedAdvisor.user_id }))
            return
        }

        // No match
        setMatchedSource(null)
        setFormData(prev => ({ ...prev, sourceType: 'partner', partner_id: '', advisor_user_id: '' }))
    }

    const handleCreateReferral = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        try {
            let advisor_commission_value = 0
            let targetPartnerId = null
            let targetSaleAdvisorId = null

            if (formData.sourceType === 'advisor') {
                targetSaleAdvisorId = formData.advisor_user_id || null
                advisor_commission_value = calculatedAdvisorCommission;
            } else {
                targetPartnerId = formData.partner_id || null
                const partner = partners.find(p => p.id === formData.partner_id)
                targetSaleAdvisorId = partner?.owner_id || null

                if (partner?.owner_id) {
                    const activeCommType = crmCommissionType
                    const activeRules = crmCommissionRules
                    
                    const flatRatePct = crmAdvisorCommissionPct

                    if (activeCommType === 'Standard Flat Percentage') {
                        advisor_commission_value = formData.revenue_generated * (flatRatePct / 100)
                    } else if (activeCommType === 'Acquisition + Maintenance' || activeCommType === 'Fixed Activation Bonus + Maintenance') {
                        // We must count previous referrals for this partner to know if it's the first
                        const { count, error: countErr } = await supabase
                            .from('crm_referrals')
                            .select('*', { count: 'exact', head: true })
                            .eq('partner_id', formData.partner_id)
                        
                        if (countErr) throw countErr

                        const isFirstReferral = count === 0
                        
                        if (activeCommType === 'Acquisition + Maintenance') {
                            const pct = isFirstReferral ? (activeRules?.acquisition_pct || 10) : (activeRules?.maintenance_pct || 4)
                            advisor_commission_value = formData.revenue_generated * (pct / 100)
                        } else if (activeCommType === 'Fixed Activation Bonus + Maintenance') {
                            if (isFirstReferral) {
                                advisor_commission_value = activeRules?.fixed_bonus || 100
                            } else {
                                advisor_commission_value = formData.revenue_generated * ((activeRules?.maintenance_pct || 4) / 100)
                            }
                        }
                    }
                }
            }

            if (formData.id) {
                const { error } = await supabase.from('crm_referrals').update({
                    partner_id: targetPartnerId,
                    arrival_date: formData.arrival_date || null,
                    party_size: formData.party_size,
                    revenue_generated: formData.revenue_generated,
                    commission_value: calculatedCommission,
                    status: formData.status,
                    sale_advisor_id: targetSaleAdvisorId,
                    advisor_commission_value: advisor_commission_value
                }).eq('id', formData.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('crm_referrals').insert([
                    {
                        partner_id: targetPartnerId,
                        guest_name: 'N/A', // Default value since it's no longer requested in UI
                        guest_contact: null,
                        arrival_date: formData.arrival_date || null,
                        party_size: formData.party_size,
                        revenue_generated: formData.revenue_generated,
                        commission_value: calculatedCommission,
                        status: formData.status,
                        sale_advisor_id: targetSaleAdvisorId,
                        advisor_commission_value: advisor_commission_value
                    }
                ])
                if (error) throw error
            }

            // Automatically upgrade partner to 'Active'
            if (!formData.id && targetPartnerId) {
                await supabase
                    .from('crm_partners')
                    .update({ pipeline_stage: 'Active', status: 'Active' })
                    .eq('id', targetPartnerId)
                    .eq('pipeline_stage', 'Waiting for Activation')
            }

            setIsModalOpen(false)
            setFormData({
                id: undefined, sourceType: 'partner', partner_id: '', advisor_user_id: '', referral_code: '', arrival_date: new Date().toISOString().split('T')[0],
                party_size: 2, revenue_generated: 0, status: 'Pending'
            })
            setRevenueInput('')
            fetchData()
        } catch (error) {
            console.error('Error creating referral:', error)
            alert('Error creating referral. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const filteredReferrals = referrals.filter(r => {
        const matchesSearch = (r.crm_partners?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                              r.id.toLowerCase().includes(searchTerm.toLowerCase())
        if (!matchesSearch) return false

        if (!r.arrival_date) return false
        const d = new Date(r.arrival_date)
        return d.getFullYear() === monthCursor.getFullYear() && d.getMonth() === monthCursor.getMonth()
    })

    const totalPax = filteredReferrals.reduce((sum, r) => sum + (r.party_size || 0), 0)
    const totalRevenue = filteredReferrals.reduce((sum, r) => sum + (r.revenue_generated || 0), 0)
    // Add up both partner commissions and advisor direct commissions for the 'totals' in the table
    const totalCommission = filteredReferrals.reduce((sum, r) => {
        return sum + (r.advisor_commission_value || 0) + (r.commission_value || 0);
    }, 0)
    
    // Check if either partner or advisor has discount
    const hasDiscounts = filteredReferrals.some(r => 
        (r.crm_partners?.crm_agreements?.some((a: any) => a.client_discount_value && a.client_discount_value > 0)) ||
        (r.sale_advisor_id && crmCommissionRules?.has_direct_discount !== false && crmCommissionRules?.direct_discount_value > 0)
    )
    
    // Note: totalDiscount is tricky because we didn't save historical discount values, we compute them dynamically!
    const totalDiscount = hasDiscounts ? filteredReferrals.reduce((sum, r) => {
        let discount = 0;
        if (r.partner_id) {
             const maxDiscount = Math.max(...(r.crm_partners?.crm_agreements?.map((a: any) => a.client_discount_value || 0) || [0]))
             discount = (r.revenue_generated * (maxDiscount / 100))
        } else if (r.sale_advisor_id && crmCommissionRules?.has_direct_discount !== false) {
             if (crmCommissionRules?.direct_discount_type === 'Fixed') {
                 discount = crmCommissionRules.direct_discount_value || 0;
             } else {
                 discount = (r.revenue_generated * ((crmCommissionRules?.direct_discount_value || 0) / 100));
             }
        }
        return sum + discount;
    }, 0) : 0

    const handleOpenEdit = () => {
        if (!selectedReferral) return;
        const isPartner = !!selectedReferral.partner_id;
        let codeStr = '';
        let matchName = '';
        if (isPartner) {
            const p = partners.find(p => p.id === selectedReferral.partner_id);
            codeStr = p?.partner_code || '';
            matchName = p?.name || '';
        } else {
            const a = advisors.find(a => a.user_id === selectedReferral.sale_advisor_id);
            codeStr = a?.referral_code || '';
            matchName = a?.name || a?.email || '';
        }

        setFormData({
            id: selectedReferral.id,
            sourceType: isPartner ? 'partner' : 'advisor',
            partner_id: selectedReferral.partner_id || '',
            advisor_user_id: selectedReferral.sale_advisor_id || '',
            referral_code: codeStr,
            arrival_date: selectedReferral.arrival_date ? new Date(selectedReferral.arrival_date).toISOString().split('T')[0] : '',
            party_size: selectedReferral.party_size || 1,
            revenue_generated: selectedReferral.revenue_generated || 0,
            status: selectedReferral.status || 'Pending'
        });
        setRevenueInput(formatCurrencyInput((selectedReferral.revenue_generated || 0).toString()));
        if (codeStr) setMatchedSource({ type: isPartner ? 'partner' : 'advisor', name: matchName });
        else setMatchedSource(null);

        setIsDetailModalOpen(false);
        setIsModalOpen(true);
    }

    const handleDelete = async () => {
        if (!selectedReferral || !confirm(t(language, 'ConfirmDelete') || 'Are you sure you want to delete this referral?')) return;
        try {
            const { error } = await supabase.from('crm_referrals').delete().eq('id', selectedReferral.id);
            if (error) throw error;
            setIsDetailModalOpen(false);
            fetchData();
        } catch (e) {
            console.error(e);
            alert('Failed to delete');
        }
    }

    const isEditable = () => {
        if (!selectedReferral) return false;
        if (currentUser?.role === 'admin' || currentUser?.role === 'owner' || currentUser?.role === 'manager') return true;
        if (currentUser?.role === 'staff') {
            const created = new Date(selectedReferral.created_at).getTime();
            const now = new Date().getTime();
            const diffHours = (now - created) / (1000 * 60 * 60);
            return diffHours <= 24;
        }
        return false;
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'Referrals')}</h1>
                    <p className="text-gray-500 mt-1">{t(language, 'ReferralsDesc')}</p>
                </div>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    {t(language, 'RegisterReferral')}
                </button>
            </div>

            {/* Toolbar */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                        <div className="flex gap-2">
                            <div className="relative">
                                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder={t(language, 'SearchClientPartner')}
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

                    {/* Referrals Table */}
                    <div className="bg-white rounded-2xl shadow p-3 overflow-x-auto">
                        <table className="w-full table-auto text-sm text-gray-900 text-left border-collapse">
                            <thead>
                                <tr className="text-gray-500 font-semibold">
                                    <th className="p-2 whitespace-nowrap">{t(language, 'DateAndRef')}</th>
                                    <th className="p-2 whitespace-nowrap">{t(language, 'Partner')}</th>
                                    <th className="p-2 whitespace-nowrap">{t(language, 'SalesAdvisor')}</th>
                                    <th className="p-2 whitespace-nowrap">{t(language, 'Pax')}</th>
                                    <th className="p-2 whitespace-nowrap text-right">{t(language, 'Revenue')} ({currency})</th>
                                    {hasDiscounts && (
                                        <th className="p-2 whitespace-nowrap text-right">{t(language, 'Discount')} ({currency})</th>
                                    )}
                                    <th className="p-2 whitespace-nowrap text-right">{t(language, 'Commission')} ({currency})</th>
                                    <th className="p-2 whitespace-nowrap">{t(language, 'TaskStatus')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={hasDiscounts ? 8 : 7} className="p-8 text-center text-gray-500">
                                            <div className="animate-pulse flex flex-col items-center">
                                                <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                                                {t(language, 'Loading')}
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredReferrals.length === 0 ? (
                                    <tr>
                                        <td colSpan={hasDiscounts ? 8 : 7} className="p-8 text-center text-gray-500">
                                            {t(language, 'NoReferralsFound')}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredReferrals.map(ref => (
                                        <tr 
                                            key={ref.id} 
                                            className="border-t hover:bg-blue-50/40 cursor-pointer"
                                            onClick={() => { setSelectedReferral(ref); setIsDetailModalOpen(true); }}
                                        >
                                            <td className="p-2 whitespace-nowrap">
                                                <div className="flex items-center gap-2 font-medium">
                                                    <Calendar className="w-4 h-4 text-gray-400"/> {ref.arrival_date ? new Date(ref.arrival_date).toLocaleDateString() : 'N/A'}
                                                </div>
                                                <div className="text-xs text-gray-500 mt-0.5 uppercase font-mono">{ref.id.split('-')[0]}</div>
                                            </td>
                                            <td className="p-2 whitespace-nowrap">
                                                <div className="font-semibold text-gray-900">
                                                    {ref.partner_id ? (ref.crm_partners?.name || t(language, 'UnknownPartner')) : <span className="text-slate-400 italic">{t(language, 'DirectAdvisor')}</span>}
                                                </div>
                                            </td>
                                            <td className="p-2 whitespace-nowrap">
                                                {ref.sale_advisor_id ? (
                                                    <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg w-fit text-xs font-medium border border-blue-100">
                                                        {accountsMap[ref.sale_advisor_id] || t(language, 'Unknown')}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400 text-xs italic">{t(language, 'Unassigned')}</span>
                                                )}
                                            </td>
                                            <td className="p-2 whitespace-nowrap">
                                                <div className="font-medium text-gray-900">{ref.party_size}</div>
                                            </td>
                                            <td className="p-2 whitespace-nowrap text-right tabular-nums font-semibold">
                                                {formatCurrencyInput(ref.revenue_generated.toFixed(0))}
                                            </td>
                                            {hasDiscounts && (
                                                <td className="p-2 whitespace-nowrap text-right">
                                                    {(() => {
                                                        if (ref.partner_id && ref.crm_partners?.crm_agreements?.some((a: any) => a.client_discount_value && a.client_discount_value > 0)) {
                                                            return (
                                                                <div className="font-semibold text-emerald-600 tabular-nums">
                                                                    {formatCurrencyInput((ref.revenue_generated * (Math.max(...(ref.crm_partners?.crm_agreements?.map((a: any) => a.client_discount_value || 0) || [0])) / 100)).toFixed(0))}
                                                                </div>
                                                            )
                                                        } else if (ref.sale_advisor_id && !ref.partner_id && crmCommissionRules?.has_direct_discount !== false && crmCommissionRules?.direct_discount_value > 0) {
                                                            const discountAmt = crmCommissionRules.direct_discount_type === 'Fixed' 
                                                                ? crmCommissionRules.direct_discount_value 
                                                                : ref.revenue_generated * (crmCommissionRules.direct_discount_value / 100);
                                                            return (
                                                                <div className="font-semibold text-emerald-600 tabular-nums">
                                                                    {formatCurrencyInput(discountAmt.toFixed(0))}
                                                                </div>
                                                            )
                                                        }
                                                        return null;
                                                    })()}
                                                </td>
                                            )}
                                            <td className="p-2 whitespace-nowrap text-right text-amber-600 font-semibold tabular-nums">
                                                {formatCurrencyInput((ref.partner_id ? (ref.commission_value || 0) : (ref.advisor_commission_value || 0)).toFixed(0))}
                                            </td>
                                            <td className="p-2 whitespace-nowrap">
                                                {(() => {
                                                    if (ref.status === 'Cancelled') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-red-100 text-red-700 border-red-200">{t(language, 'Cancelled')}</span>;
                                                    
                                                    const hasPtnr = !!ref.payout_id;
                                                    const hasAdv = !!ref.advisor_payout_id;
                                                    const ptnrPaid = ref.partner_payout?.status === 'Paid';
                                                    const advPaid = ref.advisor_payout?.status === 'Paid';
                                                    
                                                    let compositeStatus = 'Pending';
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
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {!loading && filteredReferrals.length > 0 && (
                                <tbody>
                                    <tr className="border-t bg-gray-50 font-semibold">
                                        <td colSpan={2} className="p-2 text-right">
                                            {t(language, 'Totals')}
                                        </td>
                                        <td className="p-2">
                                            {totalPax}
                                        </td>
                                        <td className="p-2 text-right tabular-nums">
                                            {formatCurrencyInput(totalRevenue.toFixed(0))}
                                        </td>
                                        {hasDiscounts && (
                                            <td className="p-2 text-right text-emerald-600 tabular-nums">
                                                {formatCurrencyInput(totalDiscount.toFixed(0))}
                                            </td>
                                        )}
                                        <td className="p-2 text-right text-amber-600 tabular-nums">
                                            {formatCurrencyInput(totalCommission.toFixed(0))}
                                        </td>
                                        <td className="p-2"></td>
                                    </tr>
                                </tbody>
                            )}
                        </table>
                    </div>

            {/* Create Referral Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h2 className="text-xl font-bold text-slate-900">{formData.id ? (t(language, 'EditReferral') || 'Edit Referral') : t(language, 'RegisterNewReferral')}</h2>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-2"
                            >
                                ✕
                            </button>
                        </div>
                        
                        <form onSubmit={handleCreateReferral} className="p-6 space-y-6">
                            
                            {/* Hero Section: Referral Code */}
                            <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100">
                                <label className="block text-sm font-semibold text-blue-900 mb-3">{t(language, 'ReferralCodeStar')}</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Ticket className="h-5 w-5 text-blue-400" />
                                    </div>
                                    <input 
                                        type="text" 
                                        required
                                        value={formData.referral_code}
                                        onChange={e => handleCodeChange(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-blue-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 bg-white text-slate-900 transition-all font-mono uppercase text-lg shadow-sm placeholder:text-slate-300 placeholder:normal-case"
                                        placeholder={t(language, 'EnterCodePlaceholder')}
                                    />
                                </div>
                                {matchedSource && (
                                    <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl border border-emerald-200 flex items-center gap-2 animate-in fade-in zoom-in shadow-sm w-full">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                        <span>
                                            {matchedSource.type === 'partner' ? t(language, 'PartnerColon') : t(language, 'SalesAdvisorColon')} <strong className="text-emerald-800 ml-1">{matchedSource.name}</strong>
                                        </span>
                                    </div>
                                )}
                                {!matchedSource && formData.referral_code.length > 2 && (
                                    <div className="mt-3 text-sm text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200 flex items-center gap-2 animate-in fade-in zoom-in shadow-sm w-full">
                                        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                                        <span>{t(language, 'NoPartnerAdvisorFound')}</span>
                                    </div>
                                )}
                            </div>

                            {/* Details Section */}
                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                                <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                    {t(language, 'ReferralDetails')}
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <div className="space-y-2">
                                        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">{t(language, 'ArrivalDateStar')}</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <Calendar className="h-4 w-4 text-slate-400" />
                                            </div>
                                            <input 
                                                type="date" 
                                                value={formData.arrival_date}
                                                onChange={e => setFormData({...formData, arrival_date: e.target.value})}
                                                className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-slate-900 transition shadow-sm"
                                            />
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">{t(language, 'Pax')}</label>
                                        <div className="relative flex items-center">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                                                <Users className="h-4 w-4 text-slate-400" />
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => setFormData(prev => ({...prev, party_size: Math.max(1, prev.party_size - 1)}))}
                                                className="absolute left-9 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition z-10"
                                            >
                                                <Minus className="w-3.5 h-3.5" />
                                            </button>
                                            <input 
                                                type="number" 
                                                min="1"
                                                value={formData.party_size}
                                                onChange={e => setFormData({...formData, party_size: parseInt(e.target.value) || 1})}
                                                className="w-full pl-16 pr-10 py-2.5 text-center rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-slate-900 transition shadow-sm font-semibold [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none relative"
                                                style={{ MozAppearance: 'textfield' }}
                                            />
                                            <button 
                                                type="button"
                                                onClick={() => setFormData(prev => ({...prev, party_size: prev.party_size + 1}))}
                                                className="absolute right-2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition z-10"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-2 sm:col-span-2">
                                        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">{t(language, 'TotalRevenueStar')}</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <Banknote className="h-4 w-4 text-slate-400" />
                                            </div>
                                            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                                <span className="text-slate-400 font-semibold">{currency}</span>
                                            </div>
                                            <input 
                                                type="text" 
                                                required
                                                value={revenueInput}
                                                onChange={handleRevenueChange}
                                                placeholder="0"
                                                className="w-full pl-10 pr-12 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white text-slate-900 font-semibold text-lg transition shadow-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button 
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                                >
                                    {t(language, 'Cancel')}
                                </button>
                                <button 
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            {t(language, 'Saving')}
                                        </>
                                    ) : t(language, 'SaveReferral')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        
            {/* Detail Modal */}
            {isDetailModalOpen && selectedReferral && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white/95 backdrop-blur z-10">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                    <Ticket className="w-5 h-5 text-blue-500" />
                                    {t(language, 'Referrals')} {t(language, 'Details') || 'Details'}
                                </h2>
                                <p className="text-xs text-slate-500 mt-1 font-mono uppercase">{selectedReferral.id}</p>
                            </div>
                            <button onClick={() => setIsDetailModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 bg-white rounded-full shadow-sm">✕</button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{t(language, 'ArrivalDateStar')}</div>
                                    <div className="font-semibold text-slate-900">{new Date(selectedReferral.arrival_date || '').toLocaleDateString()}</div>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{t(language, 'Pax')}</div>
                                    <div className="font-semibold text-slate-900 flex items-center gap-1.5"><Users className="w-4 h-4 text-slate-400"/> {selectedReferral.party_size}</div>
                                </div>
                            </div>
                            
                            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                                <div className="text-xs text-blue-500 uppercase tracking-wider mb-1 font-semibold">{t(language, 'Source')}</div>
                                <div className="font-semibold text-slate-900 text-lg">
                                    {selectedReferral.partner_id ? selectedReferral.crm_partners?.name : accountsMap[selectedReferral.sale_advisor_id || '']}
                                </div>
                                <div className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                                    {selectedReferral.partner_id ? <Users className="w-4 h-4"/> : <Banknote className="w-4 h-4"/>}
                                    {selectedReferral.partner_id ? t(language, 'Partner') : t(language, 'SalesAdvisor')}
                                </div>
                                {selectedReferral.partner_id && selectedReferral.sale_advisor_id && (
                                    <div className="text-sm text-slate-500 mt-3 pt-2 border-t border-blue-100 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5"><Banknote className="w-4 h-4" /> {t(language, 'SalesAdvisor')}</div>
                                        <span className="font-medium text-slate-700 bg-white px-2 py-0.5 rounded-md shadow-sm border border-blue-50">{accountsMap[selectedReferral.sale_advisor_id] || t(language, 'Unknown')}</span>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b border-slate-100 border-dashed">
                                    <span className="text-slate-500">{t(language, 'Revenue')}</span>
                                    <span className="font-semibold text-slate-900">{formatCurrencyInput((selectedReferral.revenue_generated || 0).toFixed(0))} {currency}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-slate-100 border-dashed">
                                    <span className="text-slate-500">{t(language, 'Commission')}</span>
                                    <span className="font-semibold text-amber-600">{formatCurrencyInput((selectedReferral.partner_id ? (selectedReferral.commission_value || 0) : (selectedReferral.advisor_commission_value || 0)).toFixed(0))} {currency}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-slate-100 border-dashed">
                                    <span className="text-slate-500">{t(language, 'TaskStatus')}</span>
                                    <span className="font-semibold text-blue-600">{selectedReferral.status}</span>
                                </div>
                            </div>

                            {isEditable() && (
                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={handleOpenEdit}
                                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-medium transition flex items-center justify-center gap-2"
                                    >
                                        {t(language, 'Edit')}
                                    </button>
                                    <button
                                        onClick={handleDelete}
                                        className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 py-2.5 rounded-xl font-medium transition flex items-center justify-center gap-2 border border-red-100"
                                    >
                                        {t(language, 'Delete')}
                                    </button>
                                </div>
                            )}
                            {(!isEditable() && currentUser?.role === 'staff') && (
                                <div className="text-center mt-4">
                                    <span className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 flex items-center justify-center gap-1.5">
                                        <AlertCircle className="w-3.5 h-3.5" />
                                        {t(language, 'EditDelete24hLimit') || 'Can only be edited/deleted within 24 hours of creation.'}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
