'use client'

import React, { useState, useEffect } from 'react'
import { useSettings } from '@/contexts/SettingsContext'
import { Save, Settings, Users, Briefcase, Key, X, Search, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { t } from '@/lib/i18n'

export default function CRMSettingsPage() {
    const { 
        language,
        currency,
        crmAdvisorCommissionPct, setCrmAdvisorCommissionPct,
        crmCommissionType, setCrmCommissionType,
        crmCommissionRules, setCrmCommissionRules,
        crmPartnerRules, setCrmPartnerRules,
        saveAllCrmSettings
    } = useSettings()
    const [activeTab, setActiveTab] = useState<'advisor' | 'partner' | 'advisors_list'>('advisors_list')
    const [role, setRole] = useState<string | null>(null)
    const [loadingRole, setLoadingRole] = useState(true)

    useEffect(() => {
        async function checkAccess() {
            const { data: user } = await supabase.auth.getUser()
            if (user?.user) {
                const { data } = await supabase.from('app_accounts').select('role').eq('user_id', user.user.id).single()
                const userRole = data?.role || 'staff'
                setRole(userRole)
                if (userRole !== 'owner' && userRole !== 'admin' && userRole !== 'manager') {
                    if (userRole === 'sale advisor') {
                        window.location.href = '/crm/settings/password'
                    } else {
                        window.location.href = '/dashboard'
                    }
                    return
                }
            } else {
                window.location.href = '/login'
                return
            }
            setLoadingRole(false)
        }
        checkAccess()
    }, [])
    
    // Form state for Advisor Commissions
    const [advisorFormData, setAdvisorFormData] = useState({
        commissionType: 'Acquisition + Maintenance',
        acquisitionPct: 10,
        maintenancePct: 4,
        fixedBonus: 100,
        directCommissionType: 'Percentage',
        directCommissionValue: 10,
        directCommissionBase: 'Before Discount',
        hasDirectDiscount: true,
        directDiscountType: 'Percentage',
        directDiscountValue: 10
    })
    const [fixedBonusInput, setFixedBonusInput] = useState('100')
    const [advisors, setAdvisors] = useState<any[]>([])
    const [allUsers, setAllUsers] = useState<any[]>([])
    const [selectedNewAdvisor, setSelectedNewAdvisor] = useState<string>('')
    const [isAdvisorModalOpen, setIsAdvisorModalOpen] = useState(false)
    const [searchAdvisorTerm, setSearchAdvisorTerm] = useState('')

    // Form state for Partner Incentives
    const [partnerFormData, setPartnerFormData] = useState({
        has_commission: true,
        commission_type: 'Percentage',
        commission_value: 10,
        has_discount: false,
        client_discount_type: 'Percentage',
        client_discount_value: 0,
        commission_base: 'Before Discount',
        details: '',
        pit_threshold_vnd: 2000000
    })
    const [pitThresholdInput, setPitThresholdInput] = useState('2,000,000')

    const [isSaving, setIsSaving] = useState(false)
    const [savedMsg, setSavedMsg] = useState(false)

    const formatCurrencyInput = (val: string) => {
        const cleaned = val.replace(/[^\d.]/g, '');
        const parts = cleaned.split('.');
        if (parts[0]) {
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }
        return parts.slice(0, 2).join('.');
    }

    // Wait for context to hydrate
    useEffect(() => {
        const bonus = crmCommissionRules?.fixed_bonus || 100
        setAdvisorFormData({
            commissionType: crmCommissionType || 'Acquisition + Maintenance',
            acquisitionPct: crmCommissionRules?.acquisition_pct || 10,
            maintenancePct: crmCommissionRules?.maintenance_pct || 4,
            fixedBonus: bonus,
            directCommissionType: crmCommissionRules?.direct_commission_type || 'Percentage',
            directCommissionValue: crmCommissionRules?.direct_commission_value || 10,
            hasDirectDiscount: (crmCommissionRules?.has_direct_discount === false || crmCommissionRules?.has_direct_discount === 'false') ? false : true,
            directDiscountType: crmCommissionRules?.direct_discount_type || 'Percentage',
            directDiscountValue: crmCommissionRules?.direct_discount_value || 10,
            directCommissionBase: crmCommissionRules?.direct_commission_base || 'Before Discount'
        })
        setFixedBonusInput(formatCurrencyInput(bonus.toString()))

        if (crmPartnerRules) {
            const threshold = crmPartnerRules.pit_threshold_vnd ?? 2000000
            setPartnerFormData({
                has_commission: crmPartnerRules.has_commission ?? true,
                commission_type: crmPartnerRules.commission_type || 'Percentage',
                commission_value: crmPartnerRules.commission_value || 10,
                has_discount: crmPartnerRules.has_discount ?? false,
                client_discount_type: crmPartnerRules.client_discount_type || 'Percentage',
                client_discount_value: crmPartnerRules.client_discount_value || 0,
                commission_base: crmPartnerRules.commission_base || 'Before Discount',
                details: crmPartnerRules.details || '',
                pit_threshold_vnd: threshold
            })
            setPitThresholdInput(formatCurrencyInput(threshold.toString()))
        }
    }, [crmAdvisorCommissionPct, crmCommissionType, crmCommissionRules, crmPartnerRules])

    const fetchAdvisors = async () => {
        const { data } = await supabase.from('app_accounts').select('*').or('role.eq."sale advisor",is_sale_advisor.eq.true')
        if (data) setAdvisors(data)
    }

    const fetchAllUsers = async () => {
        const { data } = await supabase.from('app_accounts').select('*').neq('role', 'sale advisor').or('is_sale_advisor.eq.false,is_sale_advisor.is.null')
        if (data) setAllUsers(data)
    }

    useEffect(() => {
        if (activeTab === 'advisors_list') {
            fetchAdvisors()
            fetchAllUsers()
        }
    }, [activeTab])

    const handleAddAdvisor = async (userId: string) => {
        const user = allUsers.find(u => u.id === userId)
        if (!user) return

        let generatedReferralCode = user.referral_code
        if (!generatedReferralCode) {
            const parts = (user.name || user.email || 'Advisor').split(' ')
            const first = parts[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
            generatedReferralCode = `${first}10`
        }

        await supabase.from('app_accounts').update({ 
            is_sale_advisor: true, 
            ...(user.referral_code ? {} : { referral_code: generatedReferralCode })
        }).eq('id', userId)

        setIsAdvisorModalOpen(false)
        fetchAdvisors()
        fetchAllUsers()
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSaving(true)
        setSavedMsg(false)
        
        try {
            let rules: any = { 
                maintenance_pct: advisorFormData.maintenancePct,
                direct_commission_type: advisorFormData.directCommissionType,
                direct_commission_value: advisorFormData.directCommissionValue,
                direct_commission_base: advisorFormData.directCommissionBase,
                has_direct_discount: advisorFormData.hasDirectDiscount,
                direct_discount_type: advisorFormData.directDiscountType,
                direct_discount_value: advisorFormData.directDiscountValue
            }
            if (advisorFormData.commissionType === 'Acquisition + Maintenance') {
                rules.acquisition_pct = advisorFormData.acquisitionPct
            } else if (advisorFormData.commissionType === 'Fixed Activation Bonus + Maintenance') {
                rules.fixed_bonus = advisorFormData.fixedBonus
            } else if (advisorFormData.commissionType === 'Standard Flat Percentage') {
                setCrmAdvisorCommissionPct(advisorFormData.maintenancePct)
                rules.acquisition_pct = advisorFormData.maintenancePct
            }

            // We use the new bulk-save function to prevent concurrent row upserts
            saveAllCrmSettings(advisorFormData.commissionType, rules, partnerFormData)

            setSavedMsg(true)
            setTimeout(() => setSavedMsg(false), 3000)
        } catch (error) {
            console.error(error)
            alert(t(language, 'FailedToSave'))
        } finally {
            setIsSaving(false)
        }
    }

    if (loadingRole) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
        )
    }

    return (
        <div className="p-6 max-w-7xl mx-auto h-[calc(100vh-2rem)] flex flex-col">
            <div className="flex justify-between items-center mb-8 shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">
                        {t(language, 'CRMSettings')}
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">{t(language, 'CRMSettingsDesc')}</p>
                </div>
                <div className="flex items-center gap-3">
                    {savedMsg && (
                        <span className="text-sm font-bold text-emerald-600 animate-in fade-in duration-300">
                            {t(language, 'Saved')}
                        </span>
                    )}
                    <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`px-4 py-2.5 rounded-xl text-sm font-medium text-white transition flex items-center gap-2 shadow-sm ${isSaving ? 'bg-blue-600/60 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                        {t(language, 'SaveChanges')}
                    </button>
                </div>
            </div>

            <div className="flex gap-6 border-b border-slate-200 mb-6">
                <button
                    onClick={() => setActiveTab('advisors_list')}
                    className={`flex items-center gap-2 pb-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition ${activeTab === 'advisors_list' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Key className="w-4 h-4" />
                    {t(language, 'ActiveSaleAdvisorsTitle')}
                </button>
                <button
                    onClick={() => setActiveTab('advisor')}
                    className={`flex items-center gap-2 pb-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition ${activeTab === 'advisor' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Briefcase className="w-4 h-4" />
                    {t(language, 'SalesAdvisorRulesTitle')}
                </button>
                <button
                    onClick={() => setActiveTab('partner')}
                    className={`flex items-center gap-2 pb-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition ${activeTab === 'partner' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Users className="w-4 h-4" />
                    {t(language, 'PartnerIncentivesTitle')}
                </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0 bg-slate-50/50 p-1 rounded-3xl">
                <div className="flex-1 overflow-y-auto w-full max-w-4xl mx-auto px-2 pb-6">
                    
                    {/* ADVISOR COLUMN */}
                    {activeTab === 'advisor' && (
                    <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 h-fit">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                <Briefcase className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">{t(language, 'SalesAdvisorCommissionsTitle')}</h2>
                                <p className="text-sm text-slate-500">{t(language, 'SalesAdvisorCommissionsDesc')}</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">{t(language, 'CommissionStructure')}</label>
                                <select 
                                    value={advisorFormData.commissionType}
                                    onChange={e => setAdvisorFormData({...advisorFormData, commissionType: e.target.value})}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-slate-50 text-slate-900 font-medium transition"
                                >
                                    <option value="Acquisition + Maintenance">{t(language, 'AcquisitionMaintenanceFee')}</option>
                                    <option value="Fixed Activation Bonus + Maintenance">{t(language, 'FixedBonusMaintenanceFee')}</option>
                                    <option value="Standard Flat Percentage">{t(language, 'StandardFlatPercentage')}</option>
                                </select>
                                
                                {advisorFormData.commissionType === 'Acquisition + Maintenance' && (
                                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">{t(language, 'AcqMaintDesc')}</p>
                                )}
                                {advisorFormData.commissionType === 'Fixed Activation Bonus + Maintenance' && (
                                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">{t(language, 'FixedMaintDesc')}</p>
                                )}
                                {advisorFormData.commissionType === 'Standard Flat Percentage' && (
                                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">{t(language, 'StandardDesc')}</p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {advisorFormData.commissionType === 'Acquisition + Maintenance' && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">{t(language, 'AcquisitionFeeFirst')}</label>
                                        <div className="relative">
                                            <input 
                                                type="number" min="0" max="100" step="0.1" required
                                                value={advisorFormData.acquisitionPct}
                                                onChange={e => setAdvisorFormData({...advisorFormData, acquisitionPct: parseFloat(e.target.value) || 0})}
                                                className="w-full pl-4 pr-10 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 bg-emerald-50 text-emerald-900 border-emerald-100 font-semibold transition"
                                            />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">%</div>
                                        </div>
                                    </div>
                                )}

                                {advisorFormData.commissionType === 'Fixed Activation Bonus + Maintenance' && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">{t(language, 'ActivationBonusFirst')}</label>
                                        <div className="relative">
                                            <input 
                                                type="text" required
                                                value={fixedBonusInput}
                                                onChange={e => {
                                                    const formatted = formatCurrencyInput(e.target.value)
                                                    setFixedBonusInput(formatted)
                                                    setAdvisorFormData({...advisorFormData, fixedBonus: parseFloat(formatted.replace(/,/g, '')) || 0})
                                                }}
                                                className="w-full pl-4 pr-14 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 bg-emerald-50 text-emerald-900 border-emerald-100 font-semibold transition"
                                            />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">{currency}</div>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        {advisorFormData.commissionType === 'Standard Flat Percentage' ? t(language, 'FlatPercentage') : t(language, 'MaintenanceFee')}
                                    </label>
                                    <div className="relative">
                                        <input 
                                            type="number" min="0" max="100" step="0.1" required
                                            value={advisorFormData.maintenancePct}
                                            onChange={e => setAdvisorFormData({...advisorFormData, maintenancePct: parseFloat(e.target.value) || 0})}
                                            className="w-full pl-4 pr-10 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-blue-50 text-blue-900 border-blue-100 font-semibold transition"
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-500 font-bold">%</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Direct Referral Rules Card */}
                        <div className="mt-8 border-t border-slate-200 pt-8">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <Key className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">{t(language, 'DirectReferralsTitle')}</h2>
                                    <p className="text-sm text-slate-500">{t(language, 'DirectReferralsDesc')}</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {/* Commission Section */}
                                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="font-bold text-slate-800">{t(language, 'AdvisorCommissionTitle')}</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 mt-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{t(language, 'Type')}</label>
                                            <select 
                                                value={advisorFormData.directCommissionType}
                                                onChange={e => setAdvisorFormData({...advisorFormData, directCommissionType: e.target.value})}
                                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-900 text-sm font-medium transition"
                                            >
                                                <option value="Percentage">{t(language, 'PercentageLabel')}</option>
                                                <option value="Fixed">{t(language, 'FixedAmount')}</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{t(language, 'Value')}</label>
                                            <div className="relative">
                                                <input 
                                                    type="number"
                                                    required
                                                    min="0"
                                                    step={advisorFormData.directCommissionType === 'Percentage' ? "0.1" : "1"}
                                                    value={advisorFormData.directCommissionValue}
                                                    onChange={e => setAdvisorFormData({...advisorFormData, directCommissionValue: parseFloat(e.target.value) || 0})}
                                                    className="w-full pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-900 text-sm font-bold transition"
                                                />
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">
                                                    {advisorFormData.directCommissionType === 'Percentage' ? '%' : currency}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>


                            </div>
                        </div>
                    </div>
                    )}

                    {/* ADVISORS LIST COLUMN */}
                    {activeTab === 'advisors_list' && (
                    <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 h-fit">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center">
                                <Key className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">{t(language, 'ActiveSaleAdvisorsTitle')}</h2>
                                <p className="text-sm text-slate-500">{t(language, 'ManageReferralCodes')}</p>
                            </div>
                        </div>

        <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">{t(language, 'AdvisorsListing')}</h3>
            <button
                type="button"
                onClick={() => setIsAdvisorModalOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition shadow-sm flex items-center gap-2"
            >
                <Users className="w-4 h-4" /> {t(language, 'AddAdvisor')}
            </button>
        </div>
        {advisors.length === 0 ? (
            <p className="text-sm text-slate-500 italic">{t(language, 'NoSaleAdvisors')}</p>
        ) : (
            <div className="space-y-3">
                {advisors.map(adv => (
                    <div key={adv.id} className="flex flex-wrap items-center justify-between gap-4 p-4 border border-slate-200 rounded-2xl bg-slate-50 hover:bg-slate-100/50 transition">
                        <div>
                            <div className="font-semibold text-slate-900">{adv.name || adv.email}</div>
                            <div className="text-xs text-slate-500">{adv.email}</div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-slate-600 uppercase">{t(language, 'ReferralCode')}</span>
                                <input 
                                    type="text" 
                                    value={adv.referral_code || ''}
                                    onChange={async (e) => {
                                        const newVal = e.target.value.toUpperCase().replace(/\s/g, '')
                                        setAdvisors(prev => prev.map(a => a.id === adv.id ? {...a, referral_code: newVal} : a))
                                    }}
                                    onBlur={async (e) => {
                                        const newVal = e.target.value.toUpperCase().replace(/\s/g, '')
                                        await supabase.from('app_accounts').update({ referral_code: newVal || null }).eq('id', adv.id)
                                    }}
                                    placeholder={t(language, 'ReferralCodeExpl')}
                                    className="w-32 px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                                />
                            </div>
                            <div className="flex flex-col gap-2 border-l border-slate-200 pl-4">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-xs font-semibold text-slate-600 uppercase">{t(language, 'CommissionsUppercase')}</span>
                                    <label className="flex items-center cursor-pointer">
                                        <div className="relative">
                                            <input type="checkbox" className="sr-only" 
                                                checked={adv.earns_commission !== false}
                                                onChange={async (e) => {
                                                    const checked = e.target.checked
                                                    setAdvisors(prev => prev.map(a => a.id === adv.id ? {...a, earns_commission: checked} : a))
                                                    await supabase.from('app_accounts').update({ earns_commission: checked }).eq('id', adv.id)
                                                }}
                                            />
                                            <div className={`block w-10 h-6 rounded-full transition-colors ${adv.earns_commission !== false ? 'bg-blue-500' : 'bg-slate-300'}`}></div>
                                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${adv.earns_commission !== false ? 'transform translate-x-4' : ''}`}></div>
                                        </div>
                                    </label>
                                </div>
                                <div className={`flex items-center justify-between gap-3 transition-opacity ${adv.earns_commission === false ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <span className="text-xs font-semibold text-slate-600 uppercase">{t(language, 'PitDeductionUppercase')}</span>
                                    <label className="flex items-center cursor-pointer">
                                        <div className="relative">
                                            <input type="checkbox" className="sr-only" 
                                                checked={adv.deduct_pit !== false}
                                                disabled={adv.earns_commission === false}
                                                onChange={async (e) => {
                                                    const checked = e.target.checked
                                                    setAdvisors(prev => prev.map(a => a.id === adv.id ? {...a, deduct_pit: checked} : a))
                                                    await supabase.from('app_accounts').update({ deduct_pit: checked }).eq('id', adv.id)
                                                }}
                                            />
                                            <div className={`block w-10 h-6 rounded-full transition-colors ${adv.deduct_pit !== false ? 'bg-blue-500' : 'bg-slate-300'}`}></div>
                                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${adv.deduct_pit !== false ? 'transform translate-x-4' : ''}`}></div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                            <div className="border-l border-slate-200 pl-4 w-20 flex items-center justify-center">
                                {adv.role !== 'sale advisor' && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            await supabase.from('app_accounts').update({ is_sale_advisor: false }).eq('id', adv.id)
                                            fetchAdvisors()
                                            fetchAllUsers()
                                        }}
                                        className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                <p className="text-xs text-slate-500 mt-2">{t(language, 'ChangesSaveAuto')}</p>
            </div>
        )}
</div>
)}

{/* PARTNER COLUMN */}
{activeTab === 'partner' && (
<div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 h-fit">
    <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
        </div>
        <div>
            <h2 className="text-xl font-bold text-slate-900">{t(language, 'PartnerIncentivesAndRules')}</h2>
            <p className="text-sm text-slate-500">{t(language, 'RewardReferringHotels')}</p>
        </div>
    </div>

    <div className="space-y-6">
        {/* Commission Section */}
        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800">{t(language, 'PartnerCommissionTitle')}</h3>
                <label className="flex items-center cursor-pointer">
                    <div className="relative">
                        <input type="checkbox" className="sr-only" 
                            checked={partnerFormData.has_commission}
                            onChange={e => setPartnerFormData({...partnerFormData, has_commission: e.target.checked})}
                        />
                        <div className={`block w-10 h-6 rounded-full transition-colors ${partnerFormData.has_commission ? 'bg-blue-500' : 'bg-slate-300'}`}></div>
                        <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${partnerFormData.has_commission ? 'transform translate-x-4' : ''}`}></div>
                    </div>
                </label>
            </div>

            {partnerFormData.has_commission && (
                <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{t(language, 'Type')}</label>
                        <select 
                            value={partnerFormData.commission_type}
                            onChange={e => setPartnerFormData({...partnerFormData, commission_type: e.target.value})}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-slate-900 text-sm font-medium transition"
                        >
                            <option value="Percentage">{t(language, 'PercentageLabel')}</option>
                            <option value="Fixed">{t(language, 'FixedAmount')}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{t(language, 'Value')}</label>
                        <div className="relative">
                            <input 
                                type="number"
                                required
                                min="0"
                                step={partnerFormData.commission_type === 'Percentage' ? "0.1" : "1"}
                                value={partnerFormData.commission_value}
                                onChange={e => setPartnerFormData({...partnerFormData, commission_value: parseFloat(e.target.value) || 0})}
                                className="w-full pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-slate-900 text-sm font-bold transition"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">
                                {partnerFormData.commission_type === 'Percentage' ? '%' : currency}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* PIT Deduction Settings Section */}
        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 mt-6">
            <h3 className="font-bold text-slate-800 mb-4">{t(language, 'PitDeductionSettingsTitle')}</h3>
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{t(language, 'PitDeductionThreshold')}</label>
                    <div className="relative">
                        <input 
                            type="text"
                            required
                            value={pitThresholdInput}
                            onChange={e => {
                                const formatted = formatCurrencyInput(e.target.value)
                                setPitThresholdInput(formatted)
                                setPartnerFormData(prev => ({
                                    ...prev,
                                    pit_threshold_vnd: parseFloat(formatted.replace(/,/g, '')) || 0
                                }))
                            }}
                            className="w-full pl-3 pr-14 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-slate-900 text-sm font-bold transition"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">{currency}</div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">{t(language, 'PitDeductionThresholdDesc')}</p>
                </div>
            </div>
        </div>

        <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t(language, 'DealTerms')}</label>
            <textarea 
                rows={3}
                value={partnerFormData.details}
                onChange={e => setPartnerFormData({...partnerFormData, details: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-slate-900 transition resize-none placeholder-slate-400"
                placeholder={t(language, 'DealTermsPlaceholder')}
            ></textarea>
        </div>

    </div>
</div>
)}
</div>
</form>

{/* ADD ADVISOR MODAL */}
{isAdvisorModalOpen && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
<div className="bg-white rounded-3xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            {t(language, 'AddAdvisor')}
        </h3>
        <button onClick={() => setIsAdvisorModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition text-slate-500">
            <X className="w-5 h-5" />
        </button>
    </div>
    <div className="p-4 border-b border-slate-100">
        <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
                type="text" 
                placeholder={t(language, 'SearchUsers')}
                value={searchAdvisorTerm}
                onChange={e => setSearchAdvisorTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
        </div>
    </div>
    <div className="p-2 overflow-y-auto flex-1">
        {allUsers
            .filter(u => (u.name || '').toLowerCase().includes(searchAdvisorTerm.toLowerCase()) || (u.email || '').toLowerCase().includes(searchAdvisorTerm.toLowerCase()))
            .map(u => (
            <button 
                key={u.id}
                onClick={() => handleAddAdvisor(u.id)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 rounded-xl transition flex items-center justify-between group"
            >
                <div>
                    <div className="font-bold text-slate-900 group-hover:text-blue-600 transition">{u.name || 'No Name'}</div>
                    <div className="text-xs text-slate-500">{u.email} &bull; <span className="uppercase">{u.role}</span></div>
                </div>
                <div className="text-blue-600 font-bold text-sm opacity-0 group-hover:opacity-100 transition">
                    {t(language, 'Add')}
                </div>
            </button>
        ))}
                            {allUsers.filter(u => (u.name || '').toLowerCase().includes(searchAdvisorTerm.toLowerCase()) || (u.email || '').toLowerCase().includes(searchAdvisorTerm.toLowerCase())).length === 0 && (
                                <div className="p-8 text-center text-slate-500 text-sm">
                                    No users found matching "{searchAdvisorTerm}"
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
