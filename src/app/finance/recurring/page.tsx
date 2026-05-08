'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { Plus, X, Pencil, Trash2, Calendar, RefreshCw, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import { FinRecurringPayment, FinChartOfAccount, FinBankAccount } from '@/types/finance'

export default function RecurringPaymentsPage() {
    const { currency } = useSettings()
    function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }
    const [loading, setLoading] = useState(true)
    const [recurring, setRecurring] = useState<FinRecurringPayment[]>([])
    const [accounts, setAccounts] = useState<FinChartOfAccount[]>([])
    const [bankAccounts, setBankAccounts] = useState<FinBankAccount[]>([])
    const [branches, setBranches] = useState<any[]>([])

    // Filters
    const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('Active')
    const [search, setSearch] = useState('')

    // Modals
    const [showModal, setShowModal] = useState(false)
    const [editingItem, setEditingItem] = useState<FinRecurringPayment | null>(null)
    const [saving, setSaving] = useState(false)
    const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})

    // Confirm Modal
    const [showConfirmModal, setShowConfirmModal] = useState(false)
    const [confirmItem, setConfirmItem] = useState<FinRecurringPayment | null>(null)
    const [confirmAmountVND, setConfirmAmountVND] = useState(0)
    const [confirmAmountVNDStr, setConfirmAmountVNDStr] = useState('')
    const [confirming, setConfirming] = useState(false)

    // Form
    const [form, setForm] = useState({
        description: '',
        amount: 0,
        amountStr: '',
        currency: currency as string,
        is_variable_amount: false,
        frequency: 'Monthly',
        next_due_date: new Date().toISOString().split('T')[0],
        account_id: '',
        bank_account_id: '',
        branch_ids: [] as string[],
        is_active: true
    })

    const fetchData = async () => {
        setLoading(true)
        const [recRes, accRes, bankRes, brRes] = await Promise.all([
            supabase.from('fin_recurring_payments').select('*, fin_chart_of_accounts(code, name), fin_bank_accounts(account_name, bank_name)').order('next_due_date'),
            supabase.from('fin_chart_of_accounts').select('*').eq('is_active', true).eq('is_group', false).order('sort_order'),
            supabase.from('fin_bank_accounts').select('*').eq('is_active', true).order('account_name'),
            supabase.from('provider_branches').select('id, name').order('name')
        ])
        setRecurring(recRes.data || [])
        setAccounts(accRes.data || [])
        setBankAccounts(bankRes.data || [])
        setBranches(brRes.data || [])
        setLoading(false)
    }

    useEffect(() => {
        fetchData()
        if (currency) {
            fetch(`https://open.er-api.com/v6/latest/${currency}`)
                .then(res => res.json())
                .then(data => {
                    if (data && data.rates) setExchangeRates(data.rates)
                })
                .catch(console.error)
        }
    }, [currency])

    useEffect(() => {
        if (form.currency && form.currency !== currency) {
            setForm(f => ({ ...f, is_variable_amount: true }))
        }
    }, [form.currency, currency])

    const handleOpenModal = (item?: FinRecurringPayment) => {
        if (item) {
            setEditingItem(item)
            setForm({
                description: item.description,
                amount: item.amount,
                amountStr: item.amount ? item.amount.toLocaleString('en-US') : '',
                currency: item.currency,
                is_variable_amount: item.is_variable_amount,
                frequency: item.frequency,
                next_due_date: item.next_due_date,
                account_id: item.account_id || '',
                bank_account_id: item.bank_account_id || '',
                branch_ids: item.branch_ids || [],
                is_active: item.is_active
            })
        } else {
            setEditingItem(null)
            setForm({
                description: '',
                amount: 0,
                amountStr: '',
                currency: currency as string,
                is_variable_amount: false,
                frequency: 'Monthly',
                next_due_date: new Date().toISOString().split('T')[0],
                account_id: '',
                bank_account_id: '',
                branch_ids: [],
                is_active: true
            })
        }
        setShowModal(true)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            const payload = {
                description: form.description,
                amount: form.amount,
                currency: form.currency,
                is_variable_amount: form.is_variable_amount,
                frequency: form.frequency,
                next_due_date: form.next_due_date,
                account_id: form.account_id || null,
                bank_account_id: form.bank_account_id || null,
                branch_ids: form.branch_ids,
                is_active: form.is_active
            }

            if (editingItem) {
                const { error } = await supabase.from('fin_recurring_payments').update(payload).eq('id', editingItem.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('fin_recurring_payments').insert([payload])
                if (error) throw error
            }

            setShowModal(false)
            fetchData()
        } catch (err: any) {
            alert('Failed to save: ' + err.message)
        }
        setSaving(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this recurring payment?')) return
        try {
            const { error } = await supabase.from('fin_recurring_payments').delete().eq('id', id)
            if (error) throw error
            fetchData()
        } catch (err: any) {
            alert('Delete failed: ' + err.message)
        }
    }

    const toggleBranch = (bid: string) => {
        setForm(prev => {
            const next = [...prev.branch_ids]
            if (next.includes(bid)) return { ...prev, branch_ids: next.filter(id => id !== bid) }
            else return { ...prev, branch_ids: [...next, bid] }
        })
    }

    const handleOpenConfirm = (item: FinRecurringPayment) => {
        setConfirmItem(item)
        const rateToSystem = item.currency === currency ? 1 : (exchangeRates[item.currency] ? (1 / exchangeRates[item.currency]) : 1)
        const estimated = Math.round(item.amount * rateToSystem)
        setConfirmAmountVND(estimated)
        setConfirmAmountVNDStr(estimated.toLocaleString('en-US'))
        setShowConfirmModal(true)
    }

    const handleConfirmGenerate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!confirmItem) return
        setConfirming(true)
        try {
            // 1. Generate PO number
            const now = new Date()
            const prefix = `PO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
            const { count } = await supabase.from('fin_payment_orders').select('*', { count: 'exact', head: true }).ilike('order_number', `${prefix}%`)
            const orderNum = `${prefix}-${String((count || 0) + 1).padStart(3, '0')}`

            // 2. Insert PO
            const { data: po, error: poErr } = await supabase.from('fin_payment_orders').insert({
                order_number: orderNum,
                order_date: now.toISOString().split('T')[0],
                total_amount: confirmAmountVND,
                status: 'Draft',
                bank_account_id: confirmItem.bank_account_id,
                notes: `Generated from recurring payment: ${confirmItem.description}`
            }).select('id').single()
            if (poErr) throw poErr

            // 3. Insert PO Item
            const { error: poiErr } = await supabase.from('fin_payment_order_items').insert({
                payment_order_id: po.id,
                item_type: 'manual',
                description: confirmItem.description,
                account_id: confirmItem.account_id,
                amount: confirmAmountVND,
                branch_ids: confirmItem.branch_ids
            })
            if (poiErr) throw poiErr

            // 4. Roll forward next_due_date
            const d = new Date(confirmItem.next_due_date)
            if (confirmItem.frequency === 'Weekly') d.setDate(d.getDate() + 7)
            else if (confirmItem.frequency === 'Monthly') d.setMonth(d.getMonth() + 1)
            else if (confirmItem.frequency === 'Quarterly') d.setMonth(d.getMonth() + 3)
            else if (confirmItem.frequency === 'Bi-Annually') d.setMonth(d.getMonth() + 6)
            else if (confirmItem.frequency === 'Yearly') d.setFullYear(d.getFullYear() + 1)

            const { error: updErr } = await supabase.from('fin_recurring_payments').update({
                next_due_date: d.toISOString().split('T')[0]
            }).eq('id', confirmItem.id)
            if (updErr) throw updErr

            setShowConfirmModal(false)
            fetchData()
        } catch (err: any) {
            alert('Failed to confirm payment: ' + err.message)
        }
        setConfirming(false)
    }

    const filtered = recurring.filter(r => {
        if (statusFilter === 'Active' && !r.is_active) return false
        if (statusFilter === 'Inactive' && r.is_active) return false
        if (search && !r.description.toLowerCase().includes(search.toLowerCase())) return false
        return true
    })

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <RefreshCw className="w-6 h-6 text-blue-600" /> Recurring Payments
                    </h1>
                    <p className="text-slate-500 mt-1">Manage subscriptions, memberships, and automated fixed costs.</p>
                </div>
                <button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold transition shadow-md shadow-blue-600/20 flex items-center gap-2">
                    <Plus className="w-5 h-5" /> Add Recurring
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 shadow-sm flex flex-col sm:flex-row gap-4">
                <input type="text" placeholder="Search description..." value={search} onChange={e => setSearch(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm" />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                    className="border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm font-medium text-slate-700">
                    <option value="All">All Status</option>
                    <option value="Active">Active Only</option>
                    <option value="Inactive">Inactive Only</option>
                </select>
            </div>

            {/* List */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                            <tr>
                                <th className="p-4 font-semibold">Description</th>
                                <th className="p-4 font-semibold">Frequency</th>
                                <th className="p-4 font-semibold">Next Due Date</th>
                                <th className="p-4 font-semibold">COA / Account</th>
                                <th className="p-4 font-semibold">Branch</th>
                                <th className="p-4 font-semibold text-right">Amount</th>
                                <th className="p-4 font-semibold text-center">Status</th>
                                <th className="p-4 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} className="p-8 text-center"><CircularLoader /></td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-500">No recurring payments found.</td></tr>
                            ) : filtered.map(r => (
                                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                                    <td className="p-4 align-top">
                                        <div className="font-bold text-slate-900">{r.description}</div>
                                        {r.is_variable_amount && <div className="text-xs text-amber-600 font-medium flex items-center gap-1 mt-0.5"><AlertCircle className="w-3.5 h-3.5" /> Variable (Bank Exch. Rate)</div>}
                                    </td>
                                    <td className="p-4 font-medium text-slate-700 align-top">{r.frequency}</td>
                                    <td className="p-4 text-slate-600 flex items-center gap-1.5 align-top"><Calendar className="w-4 h-4 text-slate-400" /> {new Date(r.next_due_date).toLocaleDateString('en-GB')}</td>
                                    <td className="p-4 align-top">
                                        <div className="font-medium text-slate-800">{r.fin_chart_of_accounts ? `${r.fin_chart_of_accounts.code} - ${r.fin_chart_of_accounts.name}` : '—'}</div>
                                        <div className="text-xs text-slate-500">{r.fin_bank_accounts?.account_name || 'No Default Bank'}</div>
                                    </td>
                                    <td className="p-4 text-slate-600 align-top">
                                        {r.branch_ids.length === 0 ? <span className="italic text-slate-400">General</span>
                                        : r.branch_ids.length === 1 ? branches.find(b => b.id === r.branch_ids[0])?.name || '—'
                                        : <span className="text-blue-600 font-medium">{r.branch_ids.length} Branches</span>}
                                    </td>
                                    <td className="p-4 text-right align-top">
                                        <div className="font-black text-slate-900 tabular-nums text-base">
                                            {r.currency === currency 
                                                ? fmt(Number(r.amount)) 
                                                : fmt(Number(r.amount) * (exchangeRates[r.currency] ? (1 / exchangeRates[r.currency]) : 1))} 
                                            <span className="text-sm font-medium text-slate-500 ml-1">{currency}</span>
                                        </div>
                                        {r.currency !== currency && (
                                            <div className="text-xs text-slate-500 font-bold mt-0.5">{fmt(Number(r.amount))} {r.currency}</div>
                                        )}
                                    </td>
                                    <td className="p-4 text-center align-top">
                                        {r.is_active ? <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">Active</span> : <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">Inactive</span>}
                                    </td>
                                    <td className="p-4 text-right align-top">
                                        <div className="flex items-center justify-end gap-2">
                                            {new Date(r.next_due_date) <= new Date() && (
                                                <button onClick={() => handleOpenConfirm(r)} className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg shadow-sm transition" title="Confirm Payment">
                                                    <CheckCircle2 className="w-5 h-5" />
                                                </button>
                                            )}
                                            <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                                                <button onClick={() => handleOpenModal(r)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition" title="Edit">
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-red-600 transition" title="Delete">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
                            <h2 className="text-xl font-black text-slate-900">{editingItem ? 'Edit Recurring Payment' : 'New Recurring Payment'}</h2>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-5 overflow-y-auto max-h-[75vh]">
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">Description *</label>
                                        <input type="text" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                            placeholder="e.g. Google Workspace" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 font-medium" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">Estimated / Fixed Amount *</label>
                                        <input type="text" required placeholder="0" value={form.amountStr !== undefined ? form.amountStr : (form.amount ? form.amount.toLocaleString('en-US') : '')} onChange={e => {
                                                const clean = e.target.value.replace(/[^0-9]/g, '');
                                                const num = parseInt(clean, 10);
                                                setForm(f => ({ ...f, amount: isNaN(num) ? 0 : num, amountStr: isNaN(num) ? '' : num.toLocaleString('en-US') }));
                                            }}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm tabular-nums text-slate-900 font-medium" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">Currency *</label>
                                        <select required value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 font-medium">
                                            {Array.from(new Set([currency, 'USD', 'EUR', 'GBP', 'AUD', 'SGD', 'THB', 'VND'])).map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    {form.currency !== currency && (() => {
                                        const rateToSystem = exchangeRates[form.currency] ? (1 / exchangeRates[form.currency]) : null
                                        return (
                                            <div className="col-span-2 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between shadow-sm">
                                                <div>
                                                    <div className="text-sm font-bold text-blue-900">Converted Amount ({currency})</div>
                                                    <div className="text-xs text-blue-700">Live exchange rate approx.</div>
                                                </div>
                                                <div className="text-lg font-black text-blue-900 tabular-nums">
                                                    {rateToSystem ? fmt(form.amount * rateToSystem) : '...'} <span className="text-sm font-bold text-blue-700">{currency}</span>
                                                </div>
                                            </div>
                                        )
                                    })()}
                                    <div className="col-span-2">
                                        <label className="flex items-start gap-3 p-3 border border-amber-200 bg-amber-50 rounded-xl cursor-pointer">
                                            <input type="checkbox" checked={form.is_variable_amount} onChange={e => setForm(f => ({ ...f, is_variable_amount: e.target.checked }))} className="mt-1 w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500" />
                                            <div>
                                                <div className="font-bold text-amber-900 text-sm">Variable Amount (Requires Confirmation)</div>
                                                <div className="text-xs text-amber-700 mt-0.5">
                                                    {form.currency !== currency ? 'Automatically checked because the currency differs from your system currency, but you can uncheck it if the charge is strictly fixed.' : 'Check this if the final amount varies based on bank exchange rates. A notification will remind you to confirm the exact charged amount.'}
                                                </div>
                                            </div>
                                        </label>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">Frequency *</label>
                                        <select required value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 font-medium">
                                            <option>Weekly</option>
                                            <option>Monthly</option>
                                            <option>Quarterly</option>
                                            <option>Bi-Annually</option>
                                            <option>Yearly</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">Next Due Date *</label>
                                        <input type="date" required value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 font-medium" />
                                    </div>

                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">Chart of Account (COA)</label>
                                        <select value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 font-medium">
                                            <option value="">— Select COA —</option>
                                            {accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">Default Bank Account (Source)</label>
                                        <select value={form.bank_account_id} onChange={e => setForm(f => ({ ...f, bank_account_id: e.target.value }))}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 font-medium">
                                            <option value="">— Unassigned —</option>
                                            {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.account_name} {a.bank_name ? `(${a.bank_name})` : ''}</option>)}
                                        </select>
                                    </div>

                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">Attributed Branches</label>
                                        <div className="flex flex-wrap gap-2">
                                            {branches.map(b => {
                                                const active = form.branch_ids.includes(b.id)
                                                return (
                                                    <button key={b.id} type="button" onClick={() => toggleBranch(b.id)}
                                                        className={`px-3 py-1.5 rounded-xl border text-sm font-medium transition ${active ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-200'}`}>
                                                        {b.name}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                    
                                    <div className="col-span-2">
                                        <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                                            <span className="font-semibold text-slate-700 text-sm">Status: Active</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end pt-6 mt-6 border-t border-slate-100">
                                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition">Cancel</button>
                                <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl shadow-md transition flex items-center gap-2">
                                    {saving && <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    Save Recurring Payment
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Confirm Modal */}
            {showConfirmModal && confirmItem && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
                            <h2 className="text-xl font-black text-slate-900">Confirm Payment Amount</h2>
                            <button onClick={() => setShowConfirmModal(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleConfirmGenerate} className="p-5">
                            <div className="space-y-4">
                                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                                    <div className="text-sm font-bold text-blue-900">{confirmItem.description}</div>
                                    <div className="text-xs text-blue-700 mt-1">Generating Payment Order in {currency}</div>
                                    {confirmItem.currency !== currency && (
                                        <div className="mt-2 text-xs font-medium text-blue-800 bg-blue-100 p-2 rounded-lg inline-block">
                                            Original: {fmt(Number(confirmItem.amount))} {confirmItem.currency}
                                        </div>
                                    )}
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Final Amount ({currency}) *</label>
                                    <input type="text" required value={confirmAmountVNDStr} onChange={e => {
                                        const clean = e.target.value.replace(/[^0-9]/g, '');
                                        const num = parseInt(clean, 10);
                                        setConfirmAmountVND(isNaN(num) ? 0 : num);
                                        setConfirmAmountVNDStr(isNaN(num) ? '' : num.toLocaleString('en-US'));
                                    }} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-lg font-black focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm tabular-nums text-slate-900" />
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end pt-6 mt-6 border-t border-slate-100">
                                <button type="button" onClick={() => setShowConfirmModal(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition">Cancel</button>
                                <button type="submit" disabled={confirming} className="px-5 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl shadow-md transition flex items-center gap-2">
                                    {confirming && <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    Confirm & Create P.O.
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
