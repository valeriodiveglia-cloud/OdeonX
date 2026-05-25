'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { Save, AlertCircle, Plus, Trash2, Edit2 } from 'lucide-react'
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import { COACombobox } from '../components/COACombobox'
import { t } from '@/lib/i18n'

function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }
function formatMonthLabel(d: Date, language: string) { return d.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' }) }

const pnlGroups = [
    { code: '01', name: 'Operating Revenue' },
    { code: '02', name: 'Revenue deductions' },
    { code: '11', name: 'Cost of goods sold' },
    { code: '25', name: 'Selling expenses' },
    { code: '26', name: 'General & administration expenses' },
    { code: '27', name: 'Payroll' },
    { code: '31', name: 'Financial income' },
    { code: '32', name: 'Financial activities expenses' },
    { code: '33', name: 'Other income' },
    { code: '34', name: 'Other expenses' },
]

export interface CustomAdjustment {
    id: string;
    name: string;
    amount: number;
    target_group: string;
    method: 'add' | 'subtract' | 'extract';
    allocated_branches: string[];
    include_in_cashflow?: boolean;
}

export default function MonthlyAdjustmentsPage() {
    const { currency, language } = useSettings()
    
    // Auth & Role
    const [authLoaded, setAuthLoaded] = useState(false)
    const [role, setRole] = useState<string | null>(null)
    const [accounts, setAccounts] = useState<any[]>([])

    // Data state
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    
    const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
    const monthInputValue = useMemo(() => toMonthInputValue(monthCursor), [monthCursor])

    const [branchFilter, setBranchFilter] = useState('All')
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    
    // Adjustments state
    const [adjustments, setAdjustments] = useState<CustomAdjustment[]>([])
    const [dbRowId, setDbRowId] = useState<string | null>(null)

    // Form state
    const [editingId, setEditingId] = useState<string | null>(null)
    const [newName, setNewName] = useState('')
    const [newAmount, setNewAmount] = useState(0)
    const [newTargetGroup, setNewTargetGroup] = useState('')
    const [newMethod, setNewMethod] = useState<'add'|'subtract'|'extract'>('add')
    const [newIncludeInCashflow, setNewIncludeInCashflow] = useState(true)
    const [newAllocatedBranches, setNewAllocatedBranches] = useState<string[]>([])
    
    // Check if selected target is an Operating Revenue account
    const isRevenueAccount = useMemo(() => {
        const acc = accounts.find(a => a.id === newTargetGroup)
        return acc?.account_type === 'Operating Revenue'
    }, [newTargetGroup, accounts])

    useEffect(() => {
        if (!isRevenueAccount && newMethod === 'extract') {
            setNewMethod('add')
        }
    }, [isRevenueAccount, newMethod])

    // Auto-set cashflow toggle when method changes
    useEffect(() => {
        setNewIncludeInCashflow(newMethod !== 'extract')
    }, [newMethod])

    useEffect(() => {
        async function loadRole() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { setAuthLoaded(true); return }
            const { data } = await supabase
                .from('app_accounts')
                .select('role')
                .eq('email', user.email ?? '')
                .eq('is_active', true)
                .maybeSingle()
            setRole(data?.role ?? null)
            setAuthLoaded(true)
        }
        loadRole()
    }, [])

    useEffect(() => {
        if (!authLoaded) return
        if (role !== 'owner' && role !== 'accountant') {
            setLoading(false)
            return
        }

        async function fetchData() {
            setLoading(true)

            const [brRes, adjRes, accRes] = await Promise.all([
                supabase.from('provider_branches').select('id, name').order('name'),
                supabase.from('fin_monthly_adjustments')
                    .select('*')
                    .eq('month_key', monthInputValue)
                    .eq('branch_id', 'All')
                    .maybeSingle(),
                supabase.from('fin_chart_of_accounts').select('*').order('code')
            ])

            if (brRes.data) {
                setBranches(brRes.data as any)
                if (newAllocatedBranches.length === 0) {
                    setNewAllocatedBranches((brRes.data as any).map((b: any) => b.id))
                }
            }
            if (accRes.data) {
                setAccounts(accRes.data as any)
                if (accRes.data.length > 0 && !newTargetGroup) setNewTargetGroup(accRes.data[0].id)
            }
            if (adjRes.data) {
                setDbRowId(adjRes.data.id)
                setAdjustments(adjRes.data.custom_adjustments || [])
            } else {
                setDbRowId(null)
                setAdjustments([])
            }
            
            setLoading(false)
        }
        fetchData()
    }, [authLoaded, role, monthInputValue, branchFilter])

    const handleSave = async () => {
        setSaving(true)
        try {
            const payload = {
                month_key: monthInputValue,
                branch_id: 'All',
                custom_adjustments: adjustments,
                updated_at: new Date().toISOString()
            }
            
            const { error } = await supabase
                .from('fin_monthly_adjustments')
                .upsert(payload, { onConflict: 'month_key, branch_id' })
                
            if (error) throw error
            alert(t(language, 'FinMASavedSuccess'))
            
            // Reload row id just in case
            const { data } = await supabase
                .from('fin_monthly_adjustments')
                .select('id')
                .eq('branch_id', 'All')
                .maybeSingle()
            if (data) setDbRowId(data.id)

        } catch (err: any) {
            alert(t(language, 'FinMASaveError') + err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleAddAdjustment = () => {
        if (!newTargetGroup || newAmount <= 0) {
            alert(t(language, 'FinMAAlertValidAccountAmount'))
            return
        }
        
        const targetAccount = accounts.find(a => a.id === newTargetGroup)
        
        if (editingId) {
            setAdjustments(adjustments.map(a => a.id === editingId ? {
                ...a,
                name: targetAccount ? targetAccount.name : (language === 'vi' ? 'Điều chỉnh tùy chỉnh' : 'Custom Adjustment'),
                amount: newAmount,
                target_group: newTargetGroup,
                method: newMethod,
                include_in_cashflow: newIncludeInCashflow,
                allocated_branches: newAllocatedBranches
            } : a))
            setEditingId(null)
            setNewAmount(0)
            setNewMethod('add')
            setNewIncludeInCashflow(true)
            setNewAllocatedBranches(branches.map(b => b.id))
        } else {
            const newAdj: CustomAdjustment = {
                id: crypto.randomUUID(),
                name: targetAccount ? targetAccount.name : (language === 'vi' ? 'Điều chỉnh tùy chỉnh' : 'Custom Adjustment'),
                amount: newAmount,
                target_group: newTargetGroup,
                method: newMethod,
                include_in_cashflow: newIncludeInCashflow,
                allocated_branches: newAllocatedBranches
            }
            setAdjustments([...adjustments, newAdj])
            setNewAmount(0)
            setNewMethod('add')
            setNewIncludeInCashflow(true)
            setNewAllocatedBranches(branches.map(b => b.id))
        }
    }

    const handleEditAdjustment = (adj: CustomAdjustment) => {
        setEditingId(adj.id)
        setNewTargetGroup(adj.target_group)
        setNewAmount(adj.amount)
        // Treat subtract as add for UI simplification
        setNewMethod(adj.method === 'extract' ? 'extract' : 'add')
        setNewIncludeInCashflow(adj.include_in_cashflow ?? adj.method !== 'extract')
        setNewAllocatedBranches(adj.allocated_branches || branches.map(b => b.id))
        
        // Scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const handleCancelEdit = () => {
        setEditingId(null)
        setNewAmount(0)
        setNewMethod('add')
        setNewIncludeInCashflow(true)
        setNewAllocatedBranches(branches.map(b => b.id))
    }

    const handleRemoveAdjustment = (id: string) => {
        setAdjustments(adjustments.filter(a => a.id !== id))
    }

    function prevMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), -1)) }
    function nextMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), 1)) }
    function onPickMonth(val: string) {
        const d = fromMonthInputValue(val)
        if (d) setMonthCursor(d)
    }

    if (!authLoaded) {
        return <div className="flex items-center justify-center h-64"><CircularLoader /></div>
    }

    if (role !== 'owner' && role !== 'accountant') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500">
                <AlertCircle className="w-12 h-12 text-slate-300 mb-4" />
                <h2 className="text-xl font-bold text-slate-700">{t(language, 'FinMAAccessDenied')}</h2>
                <p className="mt-2">{t(language, 'FinMAOnlyOwnersAccountants')}</p>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-5xl mx-auto pb-32">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-slate-900">{t(language, 'FinMATitle')}</h1>
                <p className="text-slate-500 mt-1">{t(language, 'FinMASubtitle')}</p>
            </div>

            {/* Branch Dropdown */}
            <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinMABranchFilterLabel')}</label>
                <select
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    className="w-full sm:w-64 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-700 font-medium bg-white"
                >
                    <option value="All">{t(language, 'FinMAGlobalAdjustments')}</option>
                    {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>
            </div>

            {/* Month Navigation */}
            <div className="grid grid-cols-3 items-center mb-6 px-2">
                <button onClick={prevMonth} className="justify-self-start text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline transition flex items-center gap-1">
                    <ChevronLeftIcon className="w-4 h-4" /> {t(language, 'FinMAPrevious')}
                </button>
                <div className="justify-self-center flex items-center gap-2">
                    <span className="text-lg font-bold text-slate-900">
                        {formatMonthLabel(monthCursor, language)}
                    </span>
                    <div className="relative w-5 h-5">
                        <CalendarDaysIcon className="w-5 h-5 text-slate-400 hover:text-blue-500 cursor-pointer transition-colors" />
                        <input
                            type="month"
                            value={monthInputValue}
                            onChange={e => onPickMonth(e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                    </div>
                </div>
                <button onClick={nextMonth} className="justify-self-end text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline transition flex items-center gap-1">
                    {t(language, 'FinMANext')} <ChevronRightIcon className="w-4 h-4" />
                </button>
            </div>

            {loading ? <div className="flex justify-center py-16"><CircularLoader /></div> : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 space-y-8">
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-800">
                                <strong>{t(language, 'FinMAViewingAdjustmentsFor').replace('{branch}', branchFilter === 'All' ? t(language, 'FinMAGlobalAdjustments') : (branches.find(b=>b.id===branchFilter)?.name || ''))}</strong><br/>
                                {branchFilter === 'All' 
                                    ? t(language, 'FinMAShowingAllAdjustments')
                                    : t(language, 'FinMAShowingOnlyBranchAdjustments')}
                            </div>
                        </div>

                        {/* ADD ADJUSTMENT FORM */}
                        <div className={`p-5 rounded-2xl ${editingId ? 'bg-blue-50 border border-blue-200 shadow-inner' : 'bg-slate-50 border border-slate-200'}`}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                                    {editingId ? t(language, 'FinMAEditCustomAdjustment') : t(language, 'FinMAAddCustomAdjustment')}
                                </h3>
                                {editingId && (
                                    <button onClick={handleCancelEdit} className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline">
                                        {t(language, 'FinMACancelEdit')}
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col md:flex-row items-end gap-4">
                                    <div className="flex-1 w-full md:w-64">
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinMATargetCategory')}</label>
                                        <COACombobox 
                                            coas={accounts}
                                            value={newTargetGroup}
                                            onChange={setNewTargetGroup}
                                            placeholder={t(language, 'FinMASelectCategoryPlaceholder')}
                                        />
                                    </div>
                                    <div className="w-full md:w-48">
                                        {isRevenueAccount && (
                                            <>
                                                <label className="block text-sm font-semibold text-slate-700 mb-2">{t(language, 'FinMAExtractToggle')}</label>
                                                <button
                                                    type="button"
                                                    onClick={() => setNewMethod(newMethod === 'extract' ? 'add' : 'extract')}
                                                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none shadow-sm ${
                                                        newMethod === 'extract' ? 'bg-blue-600' : 'bg-slate-300'
                                                    }`}
                                                >
                                                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${
                                                        newMethod === 'extract' ? 'translate-x-7' : 'translate-x-1'
                                                    }`} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    <div className="w-full md:w-48">
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinMAAmountLabel')} ({currency})</label>
                                        <input 
                                            type="text" 
                                            value={newAmount ? newAmount.toLocaleString('en-US') : ''}
                                            onChange={e => {
                                                const raw = e.target.value.replace(/[^0-9]/g, '')
                                                if (raw === '') setNewAmount(0)
                                                else if (!isNaN(Number(raw))) setNewAmount(Number(raw))
                                            }}
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-sm tabular-nums bg-white text-slate-900 font-semibold text-right placeholder:text-slate-400"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                                {/* Cash Flow Toggle */}
                                <div className="flex items-center justify-between px-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-semibold text-slate-700">{t(language, 'FinMAIncludeInCashFlow')}</span>
                                        <span className="text-xs text-slate-400">
                                            {newMethod === 'extract' ? t(language, 'FinMAExtractNotice') : t(language, 'FinMAIncludeInCashFlowDesc')}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => newMethod !== 'extract' && setNewIncludeInCashflow(!newIncludeInCashflow)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                                            newMethod === 'extract' ? 'bg-slate-200 cursor-not-allowed opacity-50' :
                                            newIncludeInCashflow ? 'bg-blue-600' : 'bg-slate-300'
                                        }`}
                                        disabled={newMethod === 'extract'}
                                        title={newMethod === 'extract' ? 'Extract is always excluded from Cash Flow' : ''}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                                            newIncludeInCashflow && newMethod !== 'extract' ? 'translate-x-6' : 'translate-x-1'
                                        }`} />
                                    </button>
                                </div>
                                <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-100">
                                    <div className="w-full">
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">{t(language, 'FinMAAllocatedBranches')}</label>
                                        <div className="flex flex-wrap gap-4">
                                            {branches.map(b => (
                                                <label key={b.id} className="flex items-center gap-2 cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={newAllocatedBranches.includes(b.id)}
                                                        onChange={e => {
                                                            if (e.target.checked) setNewAllocatedBranches([...newAllocatedBranches, b.id])
                                                            else setNewAllocatedBranches(newAllocatedBranches.filter(id => id !== b.id))
                                                        }}
                                                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                                    />
                                                    <span className="text-sm text-slate-700 font-medium">{b.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleAddAdjustment}
                                        className="w-full md:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition flex items-center justify-center whitespace-nowrap"
                                    >
                                        {editingId ? <><Edit2 className="w-4 h-4 mr-1.5" /> {t(language, 'Save')}</> : <><Plus className="w-4 h-4 mr-1.5" /> {t(language, 'Add')}</>}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* LIST ADJUSTMENTS */}
                        <div>
                            <h3 className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wider">{t(language, 'FinMACurrentAdjustments')}</h3>
                            {(() => {
                                const visibleAdjustments = adjustments.filter(adj => {
                                    if (branchFilter === 'All') return true;
                                    return adj.allocated_branches?.includes(branchFilter);
                                });
                                
                                if (visibleAdjustments.length === 0) {
                                    return (
                                        <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-slate-500 text-sm font-medium">
                                            {t(language, 'FinMANoAdjustmentsFound')}
                                        </div>
                                    )
                                }

                                return (
                                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                        <table className="min-w-full divide-y divide-slate-200">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t(language, 'FinMATableCategory')}</th>
                                                    <th className="px-4 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t(language, 'FinMATableCashFlow')}</th>
                                                    <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t(language, 'FinMATableBranches')}</th>
                                                    <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t(language, 'FinMATableAmount')}</th>
                                                    <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t(language, 'FinMATableActions')}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-slate-100">
                                                {visibleAdjustments.map((adj) => {
                                                    const account = accounts.find(a => a.id === adj.target_group)
                                                    const allocatedCount = adj.allocated_branches?.length || 0;
                                                    const isAllBranches = allocatedCount === branches.length && branches.length > 0;
                                                    return (
                                                        <tr key={adj.id} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-4 py-3 whitespace-nowrap">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-semibold text-slate-900 text-xs">{account ? `${account.code} - ${language === 'vi' && account.simplified_name ? account.simplified_name.trim() : account.name}` : adj.target_group}</span>
                                                                    {adj.method === 'extract' && (
                                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[9px] font-bold uppercase tracking-wider">
                                                                            {language === 'vi' ? 'Trích xuất' : 'Extract'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                {(() => {
                                                                    const inCF = adj.include_in_cashflow ?? adj.method !== 'extract'
                                                                    return (
                                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                                            inCF ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                                                                        }`}>
                                                                            <span className={`w-1.5 h-1.5 rounded-full ${inCF ? 'bg-blue-500' : 'bg-slate-400'}`} />
                                                                            {inCF ? t(language, 'Yes') : t(language, 'No')}
                                                                        </span>
                                                                    )
                                                                })()}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex flex-wrap gap-1">
                                                                    {isAllBranches ? (
                                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">{t(language, 'FinMAGlobal')}</span>
                                                                    ) : (
                                                                        (adj.allocated_branches || []).map(bId => {
                                                                            const b = branches.find(x => x.id === bId)
                                                                            return b ? <span key={b.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">{b.name}</span> : null
                                                                        })
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-right">
                                                                <div className="font-bold text-slate-900 font-mono text-xs">
                                                                    {adj.method === 'subtract' ? '-' : ''}{fmt(adj.amount)} {currency}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-right">
                                                                <div className="flex items-center justify-end gap-1.5">
                                                                    <button 
                                                                        onClick={() => handleEditAdjustment(adj)}
                                                                        className="text-blue-500 hover:text-blue-700 p-1.5 rounded hover:bg-blue-50 transition"
                                                                        title={language === 'vi' ? 'Sửa điều chỉnh' : 'Edit adjustment'}
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                                        </svg>
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleRemoveAdjustment(adj.id)}
                                                                        className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition"
                                                                        title={language === 'vi' ? 'Xóa điều chỉnh' : 'Delete adjustment'}
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            })()}
                        </div>

                    </div>

                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-md shadow-blue-600/20 transition"
                        >
                            {saving ? <CircularLoader /> : <Save className="w-5 h-5" />}
                            {t(language, 'FinMASaveAdjustmentsButton')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
