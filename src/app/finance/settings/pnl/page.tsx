'use client'

import React, { useEffect, useState } from 'react'
import { ArrowLeft, Save, Plus, Trash2, PieChart, SplitSquareHorizontal } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import { FinChartOfAccount } from '@/types/finance'
import { COACombobox } from '../../components/COACombobox'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'

interface AllocationSetting {
    id: string
    global_strategy: 'equal' | 'revenue'
    exceptions: { account_id: string; strategy: 'equal' | 'revenue' }[]
    gross_up_accounts: string[]
}

export default function PnlAllocationSettingsPage() {
    const { language } = useSettings()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [setting, setSetting] = useState<AllocationSetting | null>(null)
    const [accounts, setAccounts] = useState<FinChartOfAccount[]>([])

    // Exception form state
    const [selectedAccountId, setSelectedAccountId] = useState('')
    const [selectedStrategy, setSelectedStrategy] = useState<'equal' | 'revenue'>('equal')

    useEffect(() => {
        async function load() {
            setLoading(true)
            const [setRes, coaRes] = await Promise.all([
                supabase.from('fin_pnl_allocation_settings').select('*').limit(1).single(),
                supabase.from('fin_chart_of_accounts').select('*').order('code')
            ])
            
            if (setRes.data) {
                setSetting(setRes.data)
            }
            if (coaRes.data) {
                setAccounts(coaRes.data as FinChartOfAccount[])
            }
            setLoading(false)
        }
        load()
    }, [])

    const handleSave = async () => {
        if (!setting) return
        setSaving(true)
        try {
            const { error } = await supabase
                .from('fin_pnl_allocation_settings')
                .update({ 
                    global_strategy: setting.global_strategy,
                    exceptions: setting.exceptions,
                    gross_up_accounts: setting.gross_up_accounts
                })
                .eq('id', setting.id)
            if (error) throw error
            alert(t(language, 'FinSetPnLSaveSuccess'))
        } catch (error: any) {
            alert(t(language, 'FinSetPnLSaveError') + error.message)
        } finally {
            setSaving(false)
        }
    }

    const handleAddException = () => {
        if (!setting || !selectedAccountId) return
        
        // Don't add duplicate exceptions
        if (setting.exceptions.some(e => e.account_id === selectedAccountId)) {
            alert(t(language, 'FinSetPnLDuplicateException'))
            return
        }

        setSetting({
            ...setting,
            exceptions: [...setting.exceptions, { account_id: selectedAccountId, strategy: selectedStrategy }]
        })
        setSelectedAccountId('')
    }

    const handleRemoveException = (accountId: string) => {
        if (!setting) return
        setSetting({
            ...setting,
            exceptions: setting.exceptions.filter(e => e.account_id !== accountId)
        })
    }

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <CircularLoader />
            </div>
        )
    }

    if (!setting) return <div className="p-6">{t(language, 'FinSetPnLErrorLoading')}</div>

    // Options for the dropdown (exclude already added exceptions and groups)
    const availableAccounts = accounts.filter(a => !a.is_group && !setting.exceptions.some(e => e.account_id === a.id))

    return (
        <div className="p-6 max-w-4xl mx-auto pb-32">
            <div className="flex items-center justify-between mb-8">
                <div>
                <div className="mb-6">
                    <Link 
                        href="/finance/settings" 
                        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span>{t(language, 'BackToSettings')}</span>
                    </Link>
                </div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'FinSetPnLTitle')}</h1>
                    <p className="text-slate-500 mt-1">{t(language, 'FinSetPnLSubtitle')}</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center transition-colors"
                >
                    {saving ? (
                        <span className="flex items-center">
                            <span className="w-5 h-5 mr-2 inline-block border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                            {t(language, 'Saving')}
                        </span>
                    ) : (
                        <>
                            <Save className="w-5 h-5 mr-2" />
                            {t(language, 'FinSetPnLSaveButton')}
                        </>
                    )}
                </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-10">
                {/* Revenue Reconciliation */}
                <div>
                    <h2 className="text-xl font-semibold text-slate-900 mb-1">{t(language, 'FinSetPnLRevReconTitle')}</h2>
                    <p className="text-sm text-slate-500 mb-6">{t(language, 'FinSetPnLRevReconDesc')}</p>
                    
                    <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">{t(language, 'FinSetPnLGrossUpAccounts')}</label>
                        <div className="z-50 relative">
                            <COACombobox 
                                coas={accounts.filter(a => !(setting.gross_up_accounts || []).includes(a.id))}
                                value={null}
                                onChange={(val) => {
                                    if (val && !setting.gross_up_accounts.includes(val)) {
                                        setSetting({
                                            ...setting,
                                            gross_up_accounts: [...(setting.gross_up_accounts || []), val]
                                        })
                                    }
                                }}
                                placeholder={t(language, 'FinSetPnLGrossUpPlaceholder')}
                            />
                        </div>

                        {(setting.gross_up_accounts || []).length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-4">
                                {(setting.gross_up_accounts || []).map(id => {
                                    const acc = accounts.find(a => a.id === id);
                                    if (!acc) return null;
                                    return (
                                        <div key={id} className="group flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm hover:border-red-200 hover:bg-red-50 transition-colors">
                                            <span>{acc.name}</span>
                                            <button 
                                                onClick={() => setSetting({
                                                    ...setting,
                                                    gross_up_accounts: setting.gross_up_accounts.filter(a => a !== id)
                                                })}
                                                className="text-slate-400 group-hover:text-red-500 transition-colors focus:outline-none"
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <hr className="border-slate-100" />

                {/* Global Strategy */}
                <div>
                    <h2 className="text-xl font-semibold text-slate-900 mb-4">{t(language, 'FinSetPnLGlobalStrategyTitle')}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className={`flex flex-col p-5 border-2 rounded-2xl cursor-pointer transition-colors ${setting.global_strategy === 'equal' ? 'border-blue-500 bg-blue-50/30' : 'border-slate-100 hover:border-slate-300'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold text-slate-900 flex items-center text-lg">
                                    <SplitSquareHorizontal className="w-5 h-5 mr-2 text-blue-500" />
                                    {t(language, 'FinSetPnLEqualParts')}
                                </span>
                                <input
                                    type="radio"
                                    name="global_strategy"
                                    checked={setting.global_strategy === 'equal'}
                                    onChange={() => setSetting({ ...setting, global_strategy: 'equal' })}
                                    className="w-5 h-5 text-blue-600 focus:ring-blue-500 border-gray-300"
                                />
                            </div>
                            <p className="text-sm text-slate-500">
                                {t(language, 'FinSetPnLEqualPartsDesc')}
                            </p>
                        </label>

                        <label className={`flex flex-col p-5 border-2 rounded-2xl cursor-pointer transition-colors ${setting.global_strategy === 'revenue' ? 'border-blue-500 bg-blue-50/30' : 'border-slate-100 hover:border-slate-300'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold text-slate-900 flex items-center text-lg">
                                    <PieChart className="w-5 h-5 mr-2 text-blue-500" />
                                    {t(language, 'FinSetPnLRevenuePercentage')}
                                </span>
                                <input
                                    type="radio"
                                    name="global_strategy"
                                    checked={setting.global_strategy === 'revenue'}
                                    onChange={() => setSetting({ ...setting, global_strategy: 'revenue' })}
                                    className="w-5 h-5 text-blue-600 focus:ring-blue-500 border-gray-300"
                                />
                            </div>
                            <p className="text-sm text-slate-500">
                                {t(language, 'FinSetPnLRevenuePercentageDesc')}
                            </p>
                        </label>
                    </div>
                </div>

                <hr className="border-slate-100" />

                {/* Exceptions */}
                <div>
                    <h2 className="text-xl font-semibold text-slate-900 mb-1">{t(language, 'FinSetPnLCategoryExceptionsTitle')}</h2>
                    <p className="text-sm text-slate-500 mb-6">{t(language, 'FinSetPnLCategoryExceptionsDesc')}</p>
                    
                    {/* Add new exception form */}
                    <div className="flex flex-col md:flex-row items-end gap-4 mb-8 p-5 bg-slate-50 rounded-2xl border border-slate-200">
                        <div className="flex-1 w-full">
                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t(language, 'FinSetPnLSelectCategory')}</label>
                            <div className="z-40 relative">
                                <COACombobox 
                                    coas={availableAccounts}
                                    value={selectedAccountId || null}
                                    onChange={(val) => setSelectedAccountId(val)}
                                    placeholder={t(language, 'FinSetPnLSelectCategoryPlaceholder')}
                                />
                            </div>
                        </div>
                        <div className="w-full md:w-64">
                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t(language, 'FinSetPnLOverrideStrategy')}</label>
                            <select
                                value={selectedStrategy}
                                onChange={(e) => setSelectedStrategy(e.target.value as any)}
                                className="w-full p-3 rounded-xl border border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-500 text-base"
                            >
                                <option value="equal">{t(language, 'FinSetPnLEqualParts')}</option>
                                <option value="revenue">{t(language, 'FinSetPnLRevenuePercentage')}</option>
                            </select>
                        </div>
                        <button
                            onClick={handleAddException}
                            disabled={!selectedAccountId}
                            className="w-full md:w-auto px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center transition-colors h-[50px]"
                        >
                            <Plus className="w-5 h-5 mr-1" />
                            {t(language, 'FinSetPnLAddException')}
                        </button>
                    </div>

                    {/* List exceptions */}
                    {setting.exceptions.length === 0 ? (
                        <div className="text-center py-10 bg-slate-50 text-slate-500 text-sm border border-dashed border-slate-200 rounded-2xl">
                            {t(language, 'FinSetPnLNoExceptions')}
                        </div>
                    ) : (
                        <div className="border border-slate-200 rounded-2xl overflow-hidden">
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{t(language, 'FinSetPnLTableCategory')}</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{t(language, 'FinSetPnLTableStrategy')}</th>
                                        <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">{t(language, 'FinSetPnLTableActions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {setting.exceptions.map((exc, idx) => {
                                        const acc = accounts.find(a => a.id === exc.account_id)
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-semibold text-slate-900 text-base">{acc?.code || 'Unknown'} - {acc?.name || 'Unknown Category'}</div>
                                                    <div className="text-sm text-slate-500 mt-0.5">{acc?.account_type || ''}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                                        exc.strategy === 'equal' ? 'bg-slate-100 text-slate-700' : 'bg-blue-50 text-blue-700'
                                                    }`}>
                                                        {exc.strategy === 'equal' ? t(language, 'FinSetPnLEqualParts') : t(language, 'FinSetPnLRevenuePercentage')}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                                    <button 
                                                        onClick={() => handleRemoveException(exc.account_id)}
                                                        className="text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg font-medium text-sm transition-colors inline-flex items-center"
                                                        title={t(language, 'FinSetPnLTableRemove')}
                                                    >
                                                        <Trash2 className="w-4 h-4 mr-1.5" />
                                                        {t(language, 'FinSetPnLTableRemove')}
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

