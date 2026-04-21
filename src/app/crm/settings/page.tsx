'use client'

import React, { useState, useEffect } from 'react'
import { useSettings } from '@/contexts/SettingsContext'
import { Save, Settings, Users, Briefcase, Key } from 'lucide-react'
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

    // Form state for Partner Incentives
    const [partnerFormData, setPartnerFormData] = useState({
        has_commission: true,
        commission_type: 'Percentage',
        commission_value: 10,
        has_discount: false,
        client_discount_type: 'Percentage',
        client_discount_value: 0,
        commission_base: 'Before Discount',
        details: ''
    })

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
            setPartnerFormData({
                has_commission: crmPartnerRules.has_commission ?? true,
                commission_type: crmPartnerRules.commission_type || 'Percentage',
                commission_value: crmPartnerRules.commission_value || 10,
                has_discount: crmPartnerRules.has_discount ?? false,
                client_discount_type: crmPartnerRules.client_discount_type || 'Percentage',
                client_discount_value: crmPartnerRules.client_discount_value || 0,
                commission_base: crmPartnerRules.commission_base || 'Before Discount',
                details: crmPartnerRules.details || ''
            })
        }
    }, [crmAdvisorCommissionPct, crmCommissionType, crmCommissionRules, crmPartnerRules])

    const fetchAdvisors = async () => {
        const { data } = await supabase.from('app_accounts').select('*').eq('role', 'sale advisor')
        if (data) setAdvisors(data)
    }

    useEffect(() => {
        if (activeTab === 'advisors_list') fetchAdvisors()
    }, [activeTab])

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

                                {/* Client Discount Section */}
                                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="font-bold text-slate-800">{t(language, 'ClientDiscountTitle')}</h3>
                                        <label className="flex items-center cursor-pointer">
                                            <div className="relative">
                                                <input type="checkbox" className="sr-only" 
                                                    checked={advisorFormData.hasDirectDiscount}
                                                    onChange={() => setAdvisorFormData(prev => ({...prev, hasDirectDiscount: !prev.hasDirectDiscount}))}
                                                />
                                                <div className={`block w-10 h-6 rounded-full transition-colors ${advisorFormData.hasDirectDiscount ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
                                                <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${advisorFormData.hasDirectDiscount ? 'transform translate-x-4' : ''}`}></div>
                                            </div>
                                        </label>
                                    </div>

                                    {advisorFormData.hasDirectDiscount && (
                                        <div className="grid grid-cols-2 gap-4 mt-3">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{t(language, 'Type')}</label>
                                                <select 
                                                    value={advisorFormData.directDiscountType}
                                                    onChange={e => setAdvisorFormData({...advisorFormData, directDiscountType: e.target.value})}
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
                                                        step={advisorFormData.directDiscountType === 'Percentage' ? "0.1" : "1"}
                                                        value={advisorFormData.directDiscountValue}
                                                        onChange={e => setAdvisorFormData({...advisorFormData, directDiscountValue: parseFloat(e.target.value) || 0})}
                                                        className="w-full pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-900 text-sm font-bold transition"
                                                    />
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">
                                                        {advisorFormData.directDiscountType === 'Percentage' ? '%' : currency}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Base calculation for Advisor Direct Commission */}
                                {(advisorFormData.hasDirectDiscount && advisorFormData.directCommissionType === 'Percentage') && (
                                    <div className="mt-4">
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">{t(language, 'CommissionBaseStructure')}</label>
                                        <select 
                                            value={advisorFormData.directCommissionBase}
                                            onChange={e => setAdvisorFormData({...advisorFormData, directCommissionBase: e.target.value})}
                                            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 bg-white text-slate-900 font-medium transition"
                                        >
                                            <option value="Before Discount">{t(language, 'BeforeDiscount')}</option>
                                            <option value="After Discount">{t(language, 'AfterDiscount')}</option>
                                        </select>
                                    </div>
                                )}
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

                            <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">{t(language, 'AdvisorsListing')}</h3>
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

                            {/* Client Discount Section */}
                            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-slate-800">{t(language, 'ClientDiscountTitle')}</h3>
                                    <label className="flex items-center cursor-pointer">
                                        <div className="relative">
                                            <input type="checkbox" className="sr-only" 
                                                checked={partnerFormData.has_discount}
                                                onChange={e => setPartnerFormData({...partnerFormData, has_discount: e.target.checked})}
                                            />
                                            <div className={`block w-10 h-6 rounded-full transition-colors ${partnerFormData.has_discount ? 'bg-blue-500' : 'bg-slate-300'}`}></div>
                                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${partnerFormData.has_discount ? 'transform translate-x-4' : ''}`}></div>
                                        </div>
                                    </label>
                                </div>

                                {partnerFormData.has_discount && (
                                    <div className="grid grid-cols-2 gap-4 mt-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{t(language, 'Type')}</label>
                                            <select 
                                                value={partnerFormData.client_discount_type}
                                                onChange={e => setPartnerFormData({...partnerFormData, client_discount_type: e.target.value})}
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
                                                    step={partnerFormData.client_discount_type === 'Percentage' ? "0.1" : "1"}
                                                    value={partnerFormData.client_discount_value}
                                                    onChange={e => setPartnerFormData({...partnerFormData, client_discount_value: parseFloat(e.target.value) || 0})}
                                                    className="w-full pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-slate-900 text-sm font-bold transition"
                                                />
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">
                                                    {partnerFormData.client_discount_type === 'Percentage' ? '%' : currency}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Base calculation */}
                            {(partnerFormData.has_commission && partnerFormData.has_discount && partnerFormData.commission_type === 'Percentage') && (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">{t(language, 'CommissionBaseStructure')}</label>
                                    <select 
                                        value={partnerFormData.commission_base}
                                        onChange={e => setPartnerFormData({...partnerFormData, commission_base: e.target.value})}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white text-slate-900 font-medium transition"
                                    >
                                        <option value="Before Discount">{t(language, 'BeforeDiscount')}</option>
                                        <option value="After Discount">{t(language, 'AfterDiscount')}</option>
                                    </select>
                                </div>
                            )}

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
        </div>
    )
}
