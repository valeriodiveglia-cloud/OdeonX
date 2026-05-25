'use client'

import React, { useEffect, useState } from 'react'
import { ArrowLeft, Save, Plus, X, Wallet, CheckCircle2, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import { COACombobox } from '@/app/finance/components/COACombobox'
import type { FinChartOfAccount } from '@/types/finance'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'

export default function RevenueChannelsSettings() {
    const { language } = useSettings()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [channels, setChannels] = useState<{ label: string, type: 'third_party' | 'mpos' }[]>([])
    const [mappings, setMappings] = useState<any[]>([])
    const [coas, setCoas] = useState<FinChartOfAccount[]>([])
    
    // Form state
    const [showConfigModal, setShowConfigModal] = useState(false)
    const [configForm, setConfigForm] = useState<any>(null)

    const fetchData = async () => {
        setLoading(true)
        
        // 1. Fetch COAs
        const { data: coaData } = await supabase.from('fin_chart_of_accounts').select('*').eq('is_active', true).order('sort_order')
        if (coaData) setCoas(coaData)
            
        // 2. Fetch configured mappings
        const { data: mappingData } = await supabase.from('fin_revenue_channel_mapping').select(`
            *,
            wallet_account:fin_bank_accounts(account_name)
        `)
        if (mappingData) setMappings(mappingData)
            
        // 3. Fetch unique third parties from DR settings
        const { data: drSettings } = await supabase.from('daily_report_settings').select('settings')
        const uniqueTPs = new Set<string>()
        if (drSettings) {
            for (const row of drSettings) {
                const s = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings
                if (s?.initialInfo?.thirdParties && Array.isArray(s.initialInfo.thirdParties)) {
                    s.initialInfo.thirdParties.forEach((tp: string) => uniqueTPs.add(tp))
                }
            }
        }
        
        const ch: { label: string, type: 'third_party' | 'mpos' }[] = []
        uniqueTPs.forEach(tp => {
            ch.push({ label: tp, type: 'third_party' })
        })
        ch.push({ label: 'Card (MPOS)', type: 'mpos' })
        
        setChannels(ch)
        setLoading(false)
    }

    useEffect(() => {
        fetchData()
    }, [])

    const handleConfigure = (channel: { label: string, type: 'third_party' | 'mpos' }) => {
        const existing = mappings.find(m => m.channel_type === channel.type && (channel.type === 'mpos' || m.channel_label === channel.label))
        
        if (existing) {
            setConfigForm({
                ...existing,
                _label: channel.label
            })
        } else {
            setConfigForm({
                id: null,
                channel_type: channel.type,
                channel_label: channel.type === 'mpos' ? null : channel.label,
                _label: channel.label,
                commission_pct: '0',
                fee_coa_account_id: '',
                settlement_delay_days: '1',
                settlement_skip_weekends: false,
                cashflow_coa_account_id: '',
                is_active: true
            })
        }
        setShowConfigModal(true)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        
        try {
            let wallet_id = configForm.wallet_account_id
            
            // 1. If new mapping, create the wallet account first
            if (!configForm.id && configForm.is_active) {
                const walletName = configForm.channel_type === 'mpos' ? 'MPOS Wallet' : `${configForm.channel_label} Wallet`
                const { data: walletData, error: walletErr } = await supabase.from('fin_bank_accounts').insert({
                    account_name: walletName,
                    account_type: 'Wallet',
                    bank_name: 'Virtual',
                    branch_id: null,
                    opening_balance: 0,
                    current_balance: 0,
                    currency: 'VND'
                }).select('id').single()
                
                if (walletErr) throw walletErr
                wallet_id = walletData.id
            }
            
            // 2. Upsert mapping
            const payload = {
                channel_type: configForm.channel_type,
                channel_label: configForm.channel_label,
                wallet_account_id: wallet_id,
                commission_pct: parseFloat(configForm.commission_pct) || 0,
                fee_coa_account_id: configForm.fee_coa_account_id || null,
                settlement_delay_days: parseInt(configForm.settlement_delay_days) || 0,
                settlement_skip_weekends: configForm.settlement_skip_weekends,
                cashflow_coa_account_id: configForm.cashflow_coa_account_id || null,
                is_active: configForm.is_active
            }
            
            if (configForm.id) {
                const { error } = await supabase.from('fin_revenue_channel_mapping').update(payload).eq('id', configForm.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('fin_revenue_channel_mapping').insert(payload)
                if (error) throw error
            }
            
            setShowConfigModal(false)
            fetchData()
        } catch (err: any) {
            alert(t(language, 'FinRCSaveError') + err.message)
        }
        setSaving(false)
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <Link 
                    href="/finance/settings" 
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{t(language, 'BackToSettings')}</span>
                </Link>
            </div>
            
            <div className="flex items-center gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'FinRCTitle')}</h1>
                    <p className="text-sm text-slate-500 mt-1">{t(language, 'FinRCSubtitle')}</p>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-12"><CircularLoader /></div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-4">{t(language, 'FinRCColChannel')}</th>
                                <th className="px-6 py-4">{t(language, 'FinRCColStatus')}</th>
                                <th className="px-6 py-4">{t(language, 'FinRCColWallet')}</th>
                                <th className="px-6 py-4">{t(language, 'FinRCColCommission')}</th>
                                <th className="px-6 py-4">{t(language, 'FinRCColSettlement')}</th>
                                <th className="px-6 py-4 text-right">{t(language, 'FinRCColAction')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {channels.map((ch, i) => {
                                const mapping = mappings.find(m => m.channel_type === ch.type && (ch.type === 'mpos' || m.channel_label === ch.label))
                                const isConfigured = !!mapping
                                const isActive = isConfigured && mapping.is_active
                                
                                return (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-4 font-semibold text-slate-900 flex items-center gap-3">
                                            {ch.type === 'mpos' ? (
                                                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                                                    <Wallet className="w-4 h-4" />
                                                </div>
                                            ) : (
                                                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 font-bold">
                                                    {ch.label.charAt(0)}
                                                </div>
                                            )}
                                            {ch.label}
                                        </td>
                                        <td className="px-6 py-4">
                                            {isActive ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {t(language, 'FinRCStatusActive')}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> {t(language, 'FinRCStatusNotConfigured')}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {mapping?.wallet_account?.account_name || '—'}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {isConfigured ? `${mapping.commission_pct}%` : '—'}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {isConfigured ? `T+${mapping.settlement_delay_days}${mapping.settlement_skip_weekends ? ` (${t(language, 'Skip')} W/E)` : ''}` : '—'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => handleConfigure(ch)}
                                                className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors ${isConfigured ? 'text-slate-600 hover:bg-slate-200 bg-slate-100' : 'text-blue-600 hover:bg-blue-50 bg-blue-50'}`}
                                            >
                                                {isConfigured ? t(language, 'Edit') : t(language, 'FinRCConfigure')}
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                    
                    <div className="p-6 bg-blue-50/50 border-t border-blue-100">
                        <div className="flex gap-3 text-sm text-blue-800">
                            <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold mb-1">{t(language, 'FinRCRoutingHowTitle')}</p>
                                <ul className="list-disc pl-4 space-y-1 text-blue-700">
                                    <li><strong>{t(language, 'FinRCRoutingHowDest')}</strong> {t(language, 'FinRCRoutingHowDestDesc')}</li>
                                    <li><strong>{t(language, 'FinRCRoutingHowDep')}</strong> {t(language, 'FinRCRoutingHowDepDesc')}</li>
                                    <li><strong>{t(language, 'FinRCRoutingHowSettle')}</strong> {t(language, 'FinRCRoutingHowSettleDesc')}</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Config Modal */}
            {showConfigModal && configForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50 shrink-0">
                            <div>
                                <h3 className="font-bold text-lg text-slate-900">{t(language, 'FinRCModalTitle').replace('{channel}', configForm._label)}</h3>
                                {configForm.id && <p className="text-xs text-slate-500 mt-1">{t(language, 'FinRCModalWalletName').replace('{name}', mappings.find(m => m.id === configForm.id)?.wallet_account?.account_name)}</p>}
                            </div>
                            <button onClick={() => setShowConfigModal(false)} className="p-2 rounded-full hover:bg-slate-200 transition-colors text-slate-500">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSave} className="flex flex-col overflow-hidden">
                            <div className="p-6 space-y-5 overflow-y-auto">
                                <div>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={configForm.is_active} 
                                            onChange={e => setConfigForm({...configForm, is_active: e.target.checked})}
                                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                                        />
                                        <span className="text-sm font-semibold text-slate-900">{t(language, 'FinRCModalEnableRouting')}</span>
                                    </label>
                                    <p className="text-xs text-slate-500 ml-6 mt-1">{t(language, 'FinRCModalEnableRoutingDesc')}</p>
                                </div>
                                
                                <hr className="border-slate-100" />
                                
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'FinRCModalCommissionPct')}</label>
                                    <input 
                                        type="number" step="0.01" min="0" max="100" required
                                        value={configForm.commission_pct}
                                        onChange={e => setConfigForm({...configForm, commission_pct: e.target.value})}
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                                        disabled={!configForm.is_active}
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'FinRCModalCommissionFeeCoa')}</label>
                                    <div className={`rounded-xl border border-slate-200 shadow-sm transition-all focus-within:ring-2 focus-within:ring-blue-500 ${!configForm.is_active ? 'opacity-50 pointer-events-none' : 'bg-white'}`}>
                                        <COACombobox 
                                            coas={coas} 
                                            value={configForm.fee_coa_account_id} 
                                            onChange={val => setConfigForm({...configForm, fee_coa_account_id: val})} 
                                            placeholder={t(language, 'FinRCModalSelectExpenseCoa')}
                                        />
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'FinRCModalSettlementDelay')}</label>
                                        <input 
                                            type="number" min="0" required
                                            value={configForm.settlement_delay_days}
                                            onChange={e => setConfigForm({...configForm, settlement_delay_days: e.target.value})}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                                            disabled={!configForm.is_active}
                                        />
                                        <p className="text-xs text-slate-500 mt-1">{t(language, 'FinRCModalSettlementDelayDesc')}</p>
                                    </div>
                                    <div className="flex items-center pt-7">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={configForm.settlement_skip_weekends} 
                                                onChange={e => setConfigForm({...configForm, settlement_skip_weekends: e.target.checked})}
                                                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                                                disabled={!configForm.is_active}
                                            />
                                            <span className="text-sm font-medium text-slate-700">{t(language, 'FinRCModalSkipWeekends')}</span>
                                        </label>
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'FinRCModalCashflowCoa')}</label>
                                    <div className={`rounded-xl border border-slate-200 shadow-sm transition-all focus-within:ring-2 focus-within:ring-blue-500 ${!configForm.is_active ? 'opacity-50 pointer-events-none' : 'bg-white'}`}>
                                        <COACombobox 
                                            coas={coas} 
                                            value={configForm.cashflow_coa_account_id} 
                                            onChange={val => setConfigForm({...configForm, cashflow_coa_account_id: val})} 
                                            placeholder={t(language, 'FinRCModalSelectCashflowCoa')}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">{t(language, 'FinRCModalCashflowCoaDesc')}</p>
                                </div>
                            </div>
                            
                            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                                <button type="button" onClick={() => setShowConfigModal(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">
                                    {t(language, 'Cancel')}
                                </button>
                                <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors flex items-center gap-2">
                                    {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                                    {t(language, 'FinRCModalSave')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
