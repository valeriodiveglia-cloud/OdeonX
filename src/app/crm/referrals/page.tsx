'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Minus, Search, Filter, CheckCircle2, XCircle, AlertCircle, ChevronLeft, ChevronRight, Calendar, RefreshCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import { CRMReferral, CRMAgreement } from '@/types/crm'

interface ExtendedReferral extends CRMReferral {
    crm_partners: {
        name: string
        crm_agreements?: { client_discount_value: number | null }[]
    } | null
}

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }
function formatMonthLabel(d: Date) { return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }

export default function CRMReferralsPage() {
    const [searchTerm, setSearchTerm] = useState('')
    const [referrals, setReferrals] = useState<ExtendedReferral[]>([])
    const [partners, setPartners] = useState<{id: string, name: string}[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const { currency } = useSettings()

    /* month cursor */
    const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
    const monthInputValue = useMemo(() => toMonthInputValue(monthCursor), [monthCursor])

    function prevMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), -1)) }
    function nextMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), 1)) }
    function onPickMonth(val: string) { const d = fromMonthInputValue(val); if (d) setMonthCursor(d) }

    // Form State
    const [formData, setFormData] = useState({
        partner_id: '',
        arrival_date: new Date().toISOString().split('T')[0],
        party_size: 2,
        revenue_generated: 0,
        status: 'Pending'
    })
    const [activeAgreement, setActiveAgreement] = useState<CRMAgreement | null>(null)

    const fetchData = async () => {
        setLoading(true)
        const [refsRes, partnersRes] = await Promise.all([
            supabase
                .from('crm_referrals')
                .select(`*, crm_partners (name, crm_agreements (client_discount_value))`)
                .order('created_at', { ascending: false }),
            supabase
                .from('crm_partners')
                .select('id, name')
                .or('status.eq.Active,pipeline_stage.eq.Active')
                .order('name')
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
        setLoading(false)
    }

    const [revenueInput, setRevenueInput] = useState('')

    useEffect(() => {
        fetchData()
    }, [])

    useEffect(() => {
        async function fetchAgreement() {
            if (!formData.partner_id) {
                setActiveAgreement(null)
                return
            }
            const { data } = await supabase
                .from('crm_agreements')
                .select('*')
                .eq('partner_id', formData.partner_id)
                .eq('status', 'Active')
                .order('created_at', { ascending: false })
                .limit(1)
                .single()
            
            if (data) setActiveAgreement(data as CRMAgreement)
            else setActiveAgreement(null)
        }
        fetchAgreement()
    }, [formData.partner_id])

    const calculatedCommission = React.useMemo(() => {
        if (!activeAgreement || isNaN(formData.revenue_generated)) return 0;
        
        let baseAmount = formData.revenue_generated;
        if (activeAgreement.commission_type === 'Percentage') {
            if ((activeAgreement as any).commission_base === 'After Discount') {
                const discount = activeAgreement.client_discount_type === 'Percentage' 
                    ? baseAmount * ((activeAgreement.client_discount_value || 0) / 100)
                    : (activeAgreement.client_discount_value || 0);
                baseAmount = Math.max(0, baseAmount - discount);
            }
            return baseAmount * (activeAgreement.commission_value / 100);
        }
        return activeAgreement.commission_value || 0;
    }, [formData.revenue_generated, activeAgreement]);

    const calculatedDiscount = React.useMemo(() => {
        if (!activeAgreement || isNaN(formData.revenue_generated)) return 0;
        if (activeAgreement.client_discount_type === 'Percentage') {
            return formData.revenue_generated * ((activeAgreement.client_discount_value || 0) / 100);
        }
        return activeAgreement.client_discount_value || 0;
    }, [formData.revenue_generated, activeAgreement]);

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

    const handleCreateReferral = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        try {
            const { error } = await supabase.from('crm_referrals').insert([
                {
                    partner_id: formData.partner_id,
                    guest_name: 'N/A', // Default value since it's no longer requested in UI
                    guest_contact: null,
                    arrival_date: formData.arrival_date || null,
                    party_size: formData.party_size,
                    revenue_generated: formData.revenue_generated,
                    commission_value: calculatedCommission,
                    status: formData.status
                }
            ])

            if (error) throw error

            setIsModalOpen(false)
            setFormData({
                partner_id: '', arrival_date: new Date().toISOString().split('T')[0],
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
    const totalCommission = filteredReferrals.reduce((sum, r) => sum + (r.commission_value || 0), 0)
    
    const hasDiscounts = filteredReferrals.some(r => r.crm_partners?.crm_agreements?.some(a => a.client_discount_value && a.client_discount_value > 0))
    const totalDiscount = hasDiscounts ? filteredReferrals.reduce((sum, r) => {
        const maxDiscount = Math.max(...(r.crm_partners?.crm_agreements?.map(a => a.client_discount_value || 0) || [0]))
        return sum + (r.revenue_generated * (maxDiscount / 100))
    }, 0) : 0

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Referrals</h1>
                    <p className="text-gray-500 mt-1">Track and validate clients sent by your partners.</p>
                </div>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Register Referral
                </button>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search client, partner..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-64 text-slate-900 shadow-sm"
                        />
                    </div>
                </div>
                <button 
                    onClick={fetchData}
                    className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition"
                    title="Refresh referrals"
                >
                    <RefreshCcw className="w-5 h-5" />
                </button>
            </div>

            {/* Month Nav */}
            <div className="mb-4 grid grid-cols-3 items-center">
                <div className="justify-self-start">
                    <button onClick={prevMonth} className="text-blue-600 hover:text-blue-800 underline underline-offset-4 decoration-blue-300/40 text-sm font-medium">
                        Previous
                    </button>
                </div>
                <div className="justify-self-center flex items-center gap-2">
                    <span className="text-slate-700 font-semibold">{formatMonthLabel(monthCursor)}</span>
                    <Calendar className="w-5 h-5 text-slate-400" />
                </div>
                <div className="justify-self-end">
                    <button onClick={nextMonth} className="text-blue-600 hover:text-blue-800 underline underline-offset-4 decoration-blue-300/40 text-sm font-medium">
                        Next
                    </button>
                </div>
            </div>

            {/* Referrals Table */}
            <div className="bg-white rounded-2xl shadow p-3 overflow-x-auto">
                <table className="w-full table-auto text-sm text-gray-900 text-left border-collapse">
                    <thead>
                        <tr className="text-gray-500 font-semibold">
                            <th className="p-2 whitespace-nowrap">Date & Ref</th>
                            <th className="p-2 whitespace-nowrap">Partner</th>
                            <th className="p-2 whitespace-nowrap">Pax</th>
                            <th className="p-2 whitespace-nowrap text-right">Revenue ({currency})</th>
                            {hasDiscounts && (
                                <th className="p-2 whitespace-nowrap text-right">Discount ({currency})</th>
                            )}
                            <th className="p-2 whitespace-nowrap text-right">Commission ({currency})</th>
                            <th className="p-2 whitespace-nowrap">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-gray-500">
                                    <div className="animate-pulse flex flex-col items-center">
                                        <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                                        Loading referrals...
                                    </div>
                                </td>
                            </tr>
                        ) : filteredReferrals.length === 0 ? (
                            <tr>
                                <td colSpan={hasDiscounts ? 7 : 6} className="p-8 text-center text-gray-500">
                                    No referrals found for this period.
                                </td>
                            </tr>
                        ) : (
                            filteredReferrals.map(ref => (
                                <tr key={ref.id} className="border-t hover:bg-blue-50/40">
                                    <td className="p-2 whitespace-nowrap">
                                        <div className="flex items-center gap-2 font-medium">
                                            <Calendar className="w-4 h-4 text-gray-400"/> {ref.arrival_date ? new Date(ref.arrival_date).toLocaleDateString() : 'N/A'}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-0.5 uppercase font-mono">{ref.id.split('-')[0]}</div>
                                    </td>
                                    <td className="p-2 whitespace-nowrap">
                                        <div className="font-semibold text-gray-900">{ref.crm_partners?.name || 'Unknown Partner'}</div>
                                    </td>
                                    <td className="p-2 whitespace-nowrap">
                                        <div className="font-medium text-gray-900">{ref.party_size}</div>
                                    </td>
                                    <td className="p-2 whitespace-nowrap text-right tabular-nums font-semibold">
                                        {formatCurrencyInput(ref.revenue_generated.toFixed(0))}
                                    </td>
                                    {hasDiscounts && (
                                        <td className="p-2 whitespace-nowrap text-right">
                                            {ref.crm_partners?.crm_agreements?.some(a => a.client_discount_value && a.client_discount_value > 0) && (
                                                <div className="font-semibold text-emerald-600 tabular-nums">
                                                    {formatCurrencyInput((ref.revenue_generated * (Math.max(...(ref.crm_partners?.crm_agreements?.map(a => a.client_discount_value || 0) || [0])) / 100)).toFixed(0))}
                                                </div>
                                            )}
                                        </td>
                                    )}
                                    <td className="p-2 whitespace-nowrap text-right text-amber-600 font-semibold tabular-nums">
                                        {formatCurrencyInput(ref.commission_value.toFixed(0))}
                                    </td>
                                    <td className="p-2 whitespace-nowrap">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                            ref.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                                            ref.status === 'Pending' ? 'bg-blue-100 text-blue-700' :
                                            ref.status === 'Cancelled' ? 'bg-slate-100 text-slate-600' :
                                            'bg-red-100 text-red-700'
                                        }`}>
                                            {ref.status === 'Paid' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                            {ref.status === 'Pending' && <AlertCircle className="w-3.5 h-3.5" />}
                                            {ref.status === 'Disputed' && <XCircle className="w-3.5 h-3.5" />}
                                            {ref.status}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                    {!loading && filteredReferrals.length > 0 && (
                        <tbody>
                            <tr className="border-t bg-gray-50 font-semibold">
                                <td colSpan={2} className="p-2 text-right">
                                    Totals
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
                            <h2 className="text-xl font-bold text-slate-900">Register New Referral</h2>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-2"
                            >
                                ✕
                            </button>
                        </div>
                        
                        <form onSubmit={handleCreateReferral} className="p-6 space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-2 sm:col-span-2">
                                    <label className="block text-sm font-medium text-slate-700">Select Partner *</label>
                                    <select 
                                        required
                                        value={formData.partner_id}
                                        onChange={e => setFormData({...formData, partner_id: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                    >
                                        <option value="">Choose partner...</option>
                                        {partners.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">Arrival Date / Reservation</label>
                                    <input 
                                        type="date" 
                                        value={formData.arrival_date}
                                        onChange={e => setFormData({...formData, arrival_date: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">Pax</label>
                                    <div className="relative flex items-center">
                                        <button 
                                            type="button"
                                            onClick={() => setFormData(prev => ({...prev, party_size: Math.max(1, prev.party_size - 1)}))}
                                            className="absolute left-2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                        >
                                            <Minus className="w-4 h-4" />
                                        </button>
                                        <input 
                                            type="number" 
                                            min="1"
                                            value={formData.party_size}
                                            onChange={e => setFormData({...formData, party_size: parseInt(e.target.value) || 1})}
                                            className="w-full px-10 py-2 text-center rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                            style={{ MozAppearance: 'textfield' }}
                                        />
                                        <button 
                                            type="button"
                                            onClick={() => setFormData(prev => ({...prev, party_size: prev.party_size + 1}))}
                                            className="absolute right-2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">Total Revenue ({currency}) - Before Discount *</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={revenueInput}
                                        onChange={handleRevenueChange}
                                        placeholder="0"
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700 flex items-center gap-2">
                                        Calculated Commission ({currency})
                                    </label>
                                    <div className="w-full px-4 py-2 flex items-center bg-slate-100 rounded-xl border border-slate-200 text-slate-500 font-medium cursor-not-allowed">
                                        {formatCurrencyInput(calculatedCommission.toFixed(0))}
                                    </div>
                                </div>
                                {activeAgreement && activeAgreement.client_discount_value ? (
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 flex items-center gap-2">
                                            Discount to Client ({currency})
                                        </label>
                                        <div className="w-full px-4 py-2 flex items-center bg-slate-100 rounded-xl border border-slate-200 text-slate-500 font-medium cursor-not-allowed">
                                            {formatCurrencyInput(calculatedDiscount.toFixed(0))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button 
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            Saving...
                                        </>
                                    ) : 'Save Referral'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
