'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'

export default function FinancialGoLiveSettingsPage() {
    const { language } = useSettings()
    const [startDate, setStartDate] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        async function fetchSettings() {
            const { data, error } = await supabase.from('app_settings').select('finance_start_date').limit(1).single()
            if (data) {
                setStartDate(data.finance_start_date || '')
            }
            setLoading(false)
            if (error && error.code !== 'PGRST116') console.error("Fetch error:", error)
        }
        fetchSettings()
    }, [])

    const handleSave = async () => {
        setSaving(true)
        try {
            const { error } = await supabase
                .from('app_settings')
                .update({ finance_start_date: startDate || null })
                .eq('id', 'singleton')

            if (error) throw error

            // Ask if they want to initialize balances now
            if (startDate) {
                if (window.confirm(t(language, 'FinGLConfirmInitialize').replace('{date}', startDate))) {
                    await initializeCashBalances(startDate)
                } else {
                    alert(t(language, 'FinGLSavedNoInit'))
                }
            } else {
                alert(t(language, 'FinGLSavedSuccess'))
            }
        } catch (err: any) {
            console.error(err)
            alert(t(language, 'FinGLSaveFailed') + err.message)
        } finally {
            setSaving(false)
        }
    }

    const initializeCashBalances = async (goLiveDate: string) => {
        try {
            // 1. Fetch all Cash on Hand accounts
            const { data: accounts } = await supabase.from('fin_bank_accounts').select('*').eq('account_type', 'Cash').like('account_name', 'Cash on Hand - %')
            if (!accounts || accounts.length === 0) {
                alert(t(language, 'FinGLNoCashAccounts'))
                return
            }

            // 2. Fetch all cashier closings before goLiveDate
            const { data: closings } = await supabase.from('cashier_closings').select('branch_name, opening_float_vnd, cash_json, float_plan_json, report_date').lt('report_date', goLiveDate)
            
            // 3. Fetch all deposits before goLiveDate
            const { data: deposits } = await supabase.from('cash_ledger_deposits').select('branch, amount, date').lt('date', goLiveDate)

            let successCount = 0

            // 4. Calculate for each branch
            for (const acc of accounts) {
                // Find branch name from account name "Cash on Hand - BranchName"
                const branchName = acc.account_name.replace('Cash on Hand - ', '')
                
                // Filter data for this branch
                const branchClosings = (closings || []).filter(c => c.branch_name === branchName)
                const branchDeposits = (deposits || []).filter(d => d.branch === branchName)

                // Get latest float
                // Sort closings by date desc
                branchClosings.sort((a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime())
                const latestFloat = branchClosings.length > 0 ? (Number(branchClosings[0].opening_float_vnd) || 3000000) : 3000000

                // Map deposits by date to match Cash Ledger row-by-row logic
                const depositsMap = new Map<string, number>()
                for (const d of branchDeposits) {
                    const dDate = String(d.date).split('T')[0]
                    depositsMap.set(dDate, (depositsMap.get(dDate) || 0) + (Number(d.amount) || 0))
                }

                // Calculate pending cash row by row
                let pendingCash = 0
                for (const c of branchClosings) {
                    const cDate = String(c.report_date).split('T')[0]
                    const countedCash = cashFromJson(c.cash_json)
                    const planTotal = cashFromJson(c.float_plan_json)
                    const floatTarget = Number(c.opening_float_vnd) || 3000000
                    const cashToTake = planTotal > 0 ? planTotal : Math.max(0, countedCash - floatTarget)
                    
                    if (cashToTake > 0) {
                        const deposited = depositsMap.get(cDate) || 0
                        if (deposited < cashToTake) {
                            pendingCash += cashToTake
                        }
                    }
                }

                // Final Opening Balance
                const openingBalance = pendingCash + latestFloat

                // Update the account
                // Wait, if it already has transactions, changing opening balance will just shift current_balance.
                // It's safe to update opening_balance and recalculate current_balance.
                // For simplicity, assuming the account has NO transactions yet because it's newly created.
                // Or we just update opening_balance and current_balance = opening_balance + (current_balance - old_opening)
                const balanceDiff = openingBalance - (Number(acc.opening_balance) || 0)
                const newCurrent = (Number(acc.current_balance) || 0) + balanceDiff

                const { error: updErr } = await supabase.from('fin_bank_accounts').update({
                    opening_balance: openingBalance,
                    current_balance: newCurrent
                }).eq('id', acc.id)

                if (!updErr) successCount++
            }

            alert(t(language, 'FinGLInitSuccess').replace('{count}', String(successCount)))
            
        } catch (err: any) {
            console.error(err)
            alert(t(language, 'FinGLInitError') + err.message)
        }
    }

    // Helpers from useCashLedger
    const DENOMS = [
        { key: 'd500k', face: 500_000 }, { key: 'd200k', face: 200_000 }, { key: 'd100k', face: 100_000 },
        { key: 'd50k', face: 50_000 }, { key: 'd20k', face: 20_000 }, { key: 'd10k', face: 10_000 },
        { key: 'd5k', face: 5_000 }, { key: 'd2k', face: 2_000 }, { key: 'd1k', face: 1_000 }
    ] as const

    function cashFromJson(raw: any): number {
        if (!raw) return 0
        let obj: any = null
        if (typeof raw === 'string') {
            try { obj = JSON.parse(raw) } catch { obj = null }
        } else if (typeof raw === 'object') {
            obj = raw
        }
        if (!obj) return 0
        let sum = 0
        for (const d of DENOMS) {
            const pieces = Number(obj[d.key] || 0)
            if (Number.isFinite(pieces)) sum += pieces * d.face
        }
        return Math.round(sum)
    }

    if (loading) return <div className="flex justify-center p-12"><CircularLoader /></div>

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="mb-6">
                <div className="mb-6">
                    <Link 
                        href="/finance/settings" 
                        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                    >
                        <ArrowLeftIcon className="w-4 h-4" />
                        <span>{t(language, 'BackToSettings')}</span>
                    </Link>
                </div>
                <h1 className="text-3xl font-bold text-slate-900">{t(language, 'FinGLTitle')}</h1>
                <p className="text-slate-500 mt-1">{t(language, 'FinGLSubtitle')}</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 max-w-2xl">
                <h2 className="text-lg font-bold text-slate-900 mb-2">{t(language, 'FinGLSectionTitle')}</h2>
                <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                    {t(language, 'FinGLDescription')}
                </p>

                <div className="mb-6">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">{t(language, 'FinGLStartDateLabel')}</label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full sm:w-64 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm transition-all hover:border-slate-300 bg-slate-50 focus:bg-white"
                    />
                    <p className="text-xs text-slate-500 mt-2">{t(language, 'FinGLExampleDate')}</p>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-xl shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        {saving ? t(language, 'Saving') : t(language, 'Save')}
                    </button>
                </div>
            </div>
        </div>
    )
}

