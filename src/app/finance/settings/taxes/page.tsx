'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { PlusIcon, PencilSquareIcon, TrashIcon, ArrowLeftIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import { COACombobox } from '@/app/finance/components/COACombobox'
import type { FinChartOfAccount } from '@/types/finance'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'

type TaxSetting = {
    id: string
    name: string
    account_id: string
    percentage: number
    is_active: boolean
}

export default function TaxesSettingsPage() {
    const { language } = useSettings()
    const [taxes, setTaxes] = useState<TaxSetting[]>([])
    const [accounts, setAccounts] = useState<FinChartOfAccount[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    
    // Modal State
    const [showModal, setShowModal] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formData, setFormData] = useState<Partial<TaxSetting>>({ is_active: true, percentage: 0 })

    const fetchTaxes = async () => {
        setLoading(true)
        const [taxRes, accRes] = await Promise.all([
            supabase.from('fin_tax_settings').select('*').order('created_at', { ascending: true }),
            supabase.from('fin_chart_of_accounts').select('*').eq('is_active', true).order('code')
        ])
        
        if (taxRes.data) setTaxes(taxRes.data)
        if (accRes.data) setAccounts(accRes.data)
        setLoading(false)
    }

    useEffect(() => {
        fetchTaxes()
    }, [])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.account_id || formData.percentage === undefined) {
            alert(t(language, 'FinTaxAlertRequired'))
            return
        }

        const selectedAccount = accounts.find(a => a.id === formData.account_id)
        if (!selectedAccount) return
        
        setSaving(true)
        if (!editingId) {
            const { error } = await supabase.from('fin_tax_settings').insert([{
                name: selectedAccount.name,
                account_id: formData.account_id,
                percentage: formData.percentage,
                is_active: formData.is_active ?? true
            }])
            if (!error) {
                setShowModal(false)
                fetchTaxes()
            } else {
                alert(error.message)
            }
        } else {
            const { error } = await supabase.from('fin_tax_settings')
                .update({
                    name: selectedAccount.name,
                    account_id: formData.account_id,
                    percentage: formData.percentage,
                    is_active: formData.is_active
                })
                .eq('id', editingId)
                
            if (!error) {
                setShowModal(false)
                fetchTaxes()
            } else {
                alert(error.message)
            }
        }
        setSaving(false)
    }

    const toggleStatus = async (tax: TaxSetting) => {
        const { error } = await supabase.from('fin_tax_settings').update({ is_active: !tax.is_active }).eq('id', tax.id)
        if (!error) {
            setTaxes(prev => prev.map(t => t.id === tax.id ? { ...t, is_active: !tax.is_active } : t))
        }
    }

    const handleDelete = async (tax: TaxSetting) => {
        if (!confirm(t(language, 'FinTaxConfirmDelete').replace('{name}', tax.name))) return
        
        const { error } = await supabase.from('fin_tax_settings').delete().eq('id', tax.id)
        if (!error) {
            setTaxes(prev => prev.filter(t => t.id !== tax.id))
        } else {
            alert(error.message)
        }
    }

    const openEditModal = (tax: TaxSetting) => {
        setEditingId(tax.id)
        setFormData(tax)
        setShowModal(true)
    }

    const openAddModal = () => {
        setEditingId(null)
        setFormData({ account_id: '', is_active: true, percentage: 0 })
        setShowModal(true)
    }

    const availableAccounts = accounts.filter(a => {
        // Must be valid type
        if (!['Revenue Deduction', 'Tax Expenses'].includes(a.account_type)) return false
        // Must not be already used (unless it's the one we are currently editing)
        const isUsed = taxes.some(t => t.account_id === a.id)
        if (isUsed && a.id !== formData.account_id) return false
        return true
    })

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Top minimalist back link */}
            <div>
                <Link
                    href="/finance/settings"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition"
                >
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>{t(language, 'BackToSettings')}</span>
                </Link>
            </div>

            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'FinTaxTitle')}</h1>
                    <p className="text-slate-500 mt-1">{t(language, 'FinTaxSubtitle')}</p>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={openAddModal}
                        className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium inline-flex items-center gap-2 transition"
                    >
                        <PlusIcon className="w-5 h-5" />
                        <span>{t(language, 'FinTaxAddTaxButton')}</span>
                    </button>
                </div>
            </div>

            <div className="bg-blue-50 text-blue-800 p-4 rounded-xl border border-blue-100 flex items-start gap-3 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                    <strong>{t(language, 'FinTaxHowTitle')}</strong>
                    <ul className="list-disc ml-5 mt-1 space-y-1 text-blue-700">
                        <li>{t(language, 'FinTaxHowFormulaRev')}</li>
                        <li>{t(language, 'FinTaxHowFormulaTax')}</li>
                    </ul>
                </div>
            </div>

            {/* List */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                {loading ? (
                    <div className="p-8 flex justify-center"><CircularLoader /></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3">{t(language, 'FinTaxColAccount')}</th>
                                    <th className="px-4 py-3">{t(language, 'FinTaxColAccountType')}</th>
                                    <th className="px-4 py-3">{t(language, 'FinTaxColPercentage')}</th>
                                    <th className="px-4 py-3">{t(language, 'FinTaxColStatus')}</th>
                                    <th className="px-4 py-3 text-right">{t(language, 'FinTaxColActions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {taxes.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                            {t(language, 'FinTaxNoTaxes')}
                                        </td>
                                    </tr>
                                ) : (
                                    taxes.map(tax => {
                                        const account = accounts.find(a => a.id === tax.account_id)
                                        return (
                                            <tr key={tax.id} className={`hover:bg-slate-50 transition group ${!tax.is_active ? 'opacity-60' : ''}`}>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-slate-900">{account?.name || 'Unknown Account'}</span>
                                                        <span className="text-xs text-slate-500">{account?.code}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {account?.account_type === 'Revenue Deduction' ? (
                                                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-md text-xs font-medium border border-amber-200">{t(language, 'RevenueDeductions')}</span>
                                                    ) : account?.account_type === 'Tax Expenses' ? (
                                                        <span className="px-2.5 py-1 bg-rose-50 text-rose-700 rounded-md text-xs font-medium border border-rose-200">{t(language, 'TaxExpenses')}</span>
                                                    ) : (
                                                        <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-md">{account?.account_type}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums">{tax.percentage}%</td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => toggleStatus(tax)}
                                                        className={`px-2 py-1 text-xs font-medium rounded-md flex items-center gap-1.5 transition ${
                                                            tax.is_active 
                                                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                        }`}
                                                    >
                                                        {tax.is_active ? t(language, 'Active') : t(language, 'Inactive')}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                                                        <button 
                                                            onClick={() => openEditModal(tax)} 
                                                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
                                                            title={t(language, 'Edit')}
                                                        >
                                                            <PencilSquareIcon className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDelete(tax)} 
                                                            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition"
                                                            title={t(language, 'Delete')}
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <h3 className="text-lg font-bold text-slate-900">
                                {editingId ? t(language, 'FinTaxModalTitleEdit') : t(language, 'FinTaxModalTitleAdd')}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200 transition">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t(language, 'FinTaxModalAccount')}</label>
                                    <COACombobox
                                        coas={availableAccounts}
                                        value={formData.account_id || null}
                                        onChange={(id) => setFormData({ ...formData, account_id: id })}
                                        placeholder={t(language, 'FinTaxModalSelectPlaceholder')}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t(language, 'FinTaxModalPercentage')}</label>
                                    <div className="relative max-w-[200px]">
                                        <input
                                            type="number"
                                            step="0.01"
                                            required
                                            value={formData.percentage === undefined ? '' : formData.percentage}
                                            onChange={e => setFormData({ ...formData, percentage: parseFloat(e.target.value) || 0 })}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                                            placeholder="e.g. 10"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">%</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <input
                                    type="checkbox"
                                    id="isActive"
                                    checked={formData.is_active}
                                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 bg-white"
                                />
                                <label htmlFor="isActive" className="text-sm font-medium text-slate-700 select-none cursor-pointer">
                                    {t(language, 'FinTaxModalIsActive')}
                                </label>
                            </div>

                            <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-5 py-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium transition"
                                >
                                    {t(language, 'Cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition flex items-center justify-center min-w-[100px]"
                                >
                                    {saving ? (
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : (editingId ? t(language, 'SaveChanges') : t(language, 'FinTaxModalAddButton'))}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
