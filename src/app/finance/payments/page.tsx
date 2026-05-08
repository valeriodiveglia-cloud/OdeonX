'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { CreditCard, Plus, X, CheckCircle2, Clock, FileText, Eye, ChevronDown, Trash2, Search, PlusCircle, Briefcase, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import type { FinPaymentOrder, FinInvoice, FinBankAccount, FinChartOfAccount } from '@/types/finance'
import { PAYMENT_ORDER_STATUS_STYLES } from '@/types/finance'

type ManualItem = { id: string; description: string; amount: number; amountStr?: string; account_id: string; branch_ids: string[] }

function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

export default function PaymentOrdersPage() {
    const { currency } = useSettings()
    const [loading, setLoading] = useState(true)
    const [orders, setOrders] = useState<FinPaymentOrder[]>([])
    const [pendingInvoices, setPendingInvoices] = useState<FinInvoice[]>([])
    const [bankAccounts, setBankAccounts] = useState<FinBankAccount[]>([])
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('All')

    // Modals
    const [showCreate, setShowCreate] = useState(false)
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
    const [createAccountId, setCreateAccountId] = useState('')
    const [createTab, setCreateTab] = useState<'invoices' | 'manual'>('invoices')
    const [showDetail, setShowDetail] = useState<FinPaymentOrder | null>(null)
    const [showMarkPaid, setShowMarkPaid] = useState<FinPaymentOrder | null>(null)
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())
    const [manualItems, setManualItems] = useState<ManualItem[]>([])
    const [coaAccounts, setCoaAccounts] = useState<FinChartOfAccount[]>([])
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    const [saving, setSaving] = useState(false)

    // Mark paid form
    const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0])
    const [paidMethod, setPaidMethod] = useState('Bank Transfer')
    const [paidAccountId, setPaidAccountId] = useState('')
    const [paidNotes, setPaidNotes] = useState('')

    const fetchData = async () => {
        setLoading(true)
        const [ordRes, invRes, accRes, coaRes, brRes] = await Promise.all([
            supabase.from('fin_payment_orders').select('*, fin_bank_accounts(account_name, bank_name), fin_payment_order_items(*, fin_invoices(invoice_number, gross_amount, description, fin_suppliers(name)), fin_chart_of_accounts(code, name))').order('created_at', { ascending: false }),
            supabase.from('fin_invoices').select('*, fin_suppliers(name)').in('status', ['Pending', 'Overdue', 'In Payment']).order('invoice_date'),
            supabase.from('fin_bank_accounts').select('*').eq('is_active', true).order('account_name'),
            supabase.from('fin_chart_of_accounts').select('*').eq('is_active', true).eq('is_group', false).order('sort_order'),
            supabase.from('provider_branches').select('id, name').order('name'),
        ])
        if (ordRes.data) setOrders(ordRes.data as any)
        if (invRes.data) setPendingInvoices(invRes.data as any)
        if (accRes.data) setBankAccounts(accRes.data as any)
        if (coaRes.data) setCoaAccounts(coaRes.data as any)
        if (brRes.data) setBranches(brRes.data as any)
        setLoading(false)
    }

    useEffect(() => { fetchData() }, [])

    const filtered = useMemo(() => {
        return orders.filter(o => {
            if (statusFilter !== 'All' && o.status !== statusFilter) return false
            if (search) {
                const q = search.toLowerCase()
                return o.order_number.toLowerCase().includes(q) || (o.notes || '').toLowerCase().includes(q)
            }
            return true
        })
    }, [orders, statusFilter, search])

    const toggleInvoice = (id: string) => {
        setSelectedInvoiceIds(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const availableInvoices = useMemo(() => pendingInvoices.filter(i => i.status === 'Pending' || i.status === 'Overdue' || (editingOrderId && i.payment_order_id === editingOrderId)), [pendingInvoices, editingOrderId])

    const invoiceTotal = useMemo(() =>
        availableInvoices.filter(i => selectedInvoiceIds.has(i.id)).reduce((s, i) => s + Number(i.gross_amount || 0), 0),
        [availableInvoices, selectedInvoiceIds])

    const manualTotal = useMemo(() => manualItems.reduce((s, m) => s + (m.amount || 0), 0), [manualItems])
    const selectedTotal = invoiceTotal + manualTotal

    const addManualItem = () => setManualItems(prev => [...prev, { id: crypto.randomUUID(), description: '', amount: 0, account_id: '', branch_ids: [] }])
    const removeManualItem = (id: string) => setManualItems(prev => prev.filter(m => m.id !== id))
    const updateManualItem = (id: string, field: keyof ManualItem, value: string | number | string[]) => {
        setManualItems(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m))
    }

    const handleEditOrder = (po: FinPaymentOrder) => {
        const items = po.fin_payment_order_items || [];
        const invIds = new Set(items.filter(i => i.item_type === 'invoice' || i.invoice_id).map(i => i.invoice_id).filter(Boolean) as string[]);
        const mItems = items.filter(i => i.item_type === 'manual').map(i => ({
            id: crypto.randomUUID(),
            description: i.description || '',
            amount: Number(i.amount) || 0,
            account_id: i.account_id || '',
            branch_ids: i.branch_ids || []
        }));
        setEditingOrderId(po.id);
        setCreateAccountId(po.bank_account_id || '');
        setSelectedInvoiceIds(invIds);
        setManualItems(mItems);
        setShowCreate(true);
        setCreateTab(invIds.size > 0 ? 'invoices' : 'manual');
    }

    const handleCreateOrder = async () => {
        const validManual = manualItems.filter(m => m.description.trim() && m.amount > 0)
        if (selectedInvoiceIds.size === 0 && validManual.length === 0) { alert('Select at least one invoice or add a manual item'); return }
        setSaving(true)
        try {
            let orderId = editingOrderId;

            if (editingOrderId) {
                // Remove old links
                await supabase.from('fin_invoices').update({ status: 'Pending', payment_order_id: null }).eq('payment_order_id', editingOrderId);
                await supabase.from('fin_payment_order_items').delete().eq('payment_order_id', editingOrderId);
                await supabase.from('fin_payment_orders').update({ total_amount: selectedTotal, bank_account_id: createAccountId || null }).eq('id', editingOrderId);
            } else {
                // Generate order number
                const now = new Date()
                const prefix = `PO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                const { count } = await supabase.from('fin_payment_orders').select('*', { count: 'exact', head: true }).ilike('order_number', `${prefix}%`)
                const orderNum = `${prefix}-${String((count || 0) + 1).padStart(3, '0')}`

                const { data: order, error: ordErr } = await supabase.from('fin_payment_orders').insert({
                    order_number: orderNum,
                    total_amount: selectedTotal,
                    status: 'Pending Review',
                    bank_account_id: createAccountId || null
                }).select().single()
                if (ordErr) throw ordErr
                orderId = order.id
            }

            // Create invoice items
            const invoiceItems = Array.from(selectedInvoiceIds).map(invId => {
                const inv = availableInvoices.find(i => i.id === invId)
                return { payment_order_id: orderId, invoice_id: invId, item_type: 'invoice' as const, amount: Number(inv?.gross_amount || 0) }
            })
            // Create manual items
            const manualDbItems = validManual.map(m => ({
                payment_order_id: orderId, invoice_id: null, item_type: 'manual' as const,
                description: m.description, account_id: m.account_id || null, amount: m.amount,
                branch_ids: m.branch_ids.length > 0 ? m.branch_ids : null
            }))
            const allItems = [...invoiceItems, ...manualDbItems]
            if (allItems.length > 0) {
                const { error: itemErr } = await supabase.from('fin_payment_order_items').insert(allItems)
                if (itemErr) throw itemErr
            }

            // Update invoices status
            if (selectedInvoiceIds.size > 0) {
                const { error: invErr } = await supabase.from('fin_invoices').update({ status: 'In Payment', payment_order_id: orderId }).in('id', Array.from(selectedInvoiceIds))
                if (invErr) throw invErr
            }

            setShowCreate(false)
            setEditingOrderId(null)
            setCreateAccountId('')
            setSelectedInvoiceIds(new Set())
            setManualItems([])
            fetchData()
        } catch (err: any) {
            alert('Failed: ' + err.message)
        }
        setSaving(false)
    }

    const handleMarkPaid = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!showMarkPaid || !paidDate) return
        setSaving(true)
        try {
            // Update payment order
            const { error: poErr } = await supabase.from('fin_payment_orders').update({
                status: 'Paid', paid_date: paidDate, payment_method: paidMethod,
                bank_account_id: paidAccountId || null, notes: paidNotes || showMarkPaid.notes,
            }).eq('id', showMarkPaid.id)
            if (poErr) throw poErr

            // Update all child invoices
            const { error: invErr } = await supabase.from('fin_invoices').update({
                status: 'Paid', paid_date: paidDate, paid_via: paidMethod,
                paid_from_account_id: paidAccountId || null,
            }).eq('payment_order_id', showMarkPaid.id)
            if (invErr) throw invErr

            // Create bank transaction if account selected
            if (paidAccountId) {
                const items = showMarkPaid.fin_payment_order_items || []
                const hasInvoices = items.some(i => i.item_type === 'invoice' || i.invoice_id)
                const hasManual = items.some(i => i.item_type === 'manual')
                const txCategory = hasInvoices && hasManual ? 'Mixed Payment' : hasManual ? 'Operational Payment' : 'Supplier Payment'

                const { error: txErr } = await supabase.from('fin_bank_transactions').insert({
                    account_id: paidAccountId, transaction_date: paidDate, type: 'Outflow',
                    category: txCategory, description: `Payment Order ${showMarkPaid.order_number}`,
                    amount: Number(showMarkPaid.total_amount), reference_id: showMarkPaid.id, reference_type: 'payment_order',
                })
                if (txErr) console.warn('Transaction log failed:', txErr)

                // Update balance
                const { error: rpcErr } = await supabase.rpc('fin_update_account_balance', { p_account_id: paidAccountId })
                if (rpcErr) {
                    // If RPC doesn't exist yet, manual update skipped (will rely on next fetch or backend triggers)
                    console.warn('Balance RPC failed, might need manual refresh', rpcErr)
                }
            }

            setShowMarkPaid(null)
            fetchData()
        } catch (err: any) {
            alert('Failed: ' + err.message)
        }
        setSaving(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this payment order? Invoices will be set back to Pending.')) return
        // Set invoices back to pending
        await supabase.from('fin_invoices').update({ status: 'Pending', payment_order_id: null }).eq('payment_order_id', id)
        await supabase.from('fin_payment_order_items').delete().eq('payment_order_id', id)
        await supabase.from('fin_payment_orders').delete().eq('id', id)
        fetchData()
    }

    const statuses = ['All', 'Draft', 'Pending Review', 'Approved', 'Paid', 'Cancelled']

    const selectedCreateAccount = useMemo(() => bankAccounts.find(a => a.id === createAccountId), [bankAccounts, createAccountId])
    const selectedPaidAccount = useMemo(() => bankAccounts.find(a => a.id === paidAccountId), [bankAccounts, paidAccountId])

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Payment Orders</h1>
                    <p className="text-slate-500 mt-1">Group invoices into payment batches and track payments</p>
                </div>
                <button onClick={() => { setShowCreate(true); setSelectedInvoiceIds(new Set()); setCreateTab('invoices') }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Create Payment Order
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 shadow-sm" />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-700 shadow-sm">
                    {statuses.map(s => <option key={s}>{s}</option>)}
                </select>
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                <table className="w-full table-auto text-sm text-gray-900 text-left border-collapse">
                    <thead>
                        <tr className="text-gray-500 font-semibold border-b border-slate-100 bg-slate-50/50">
                            <th className="p-3">Order #</th>
                            <th className="p-3">Date</th>
                            <th className="p-3 text-right">Invoices</th>
                            <th className="p-3 text-right">Total ({currency})</th>
                            <th className="p-3">Payment From</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} className="p-8 text-center"><CircularLoader /></td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={7} className="p-8 text-center text-gray-500">No payment orders found</td></tr>
                        ) : filtered.map(po => {
                            const sty = PAYMENT_ORDER_STATUS_STYLES[po.status] || PAYMENT_ORDER_STATUS_STYLES['Draft']
                            const itemCount = po.fin_payment_order_items?.length || 0
                            return (
                                <tr key={po.id} className="border-t border-slate-100 hover:bg-blue-50/30 transition cursor-pointer" onClick={() => setShowDetail(po)}>
                                    <td className="p-3 font-semibold text-slate-800">{po.order_number}</td>
                                    <td className="p-3 text-slate-600">{new Date(po.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                                    <td className="p-3 text-right tabular-nums">{itemCount}</td>
                                    <td className="p-3 text-right tabular-nums font-bold">{fmt(Number(po.total_amount))}</td>
                                    <td className="p-3 text-slate-600">{po.fin_bank_accounts?.account_name || '—'}</td>
                                    <td className="p-3">
                                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${sty.bg} ${sty.text}`}>{po.status}</span>
                                        {po.paid_date && <div className="text-xs text-gray-500 mt-0.5">Paid {new Date(po.paid_date).toLocaleDateString('en-GB')}</div>}
                                    </td>
                                    <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1">
                                            {(po.status === 'Pending Review' || po.status === 'Approved') && (
                                                <button onClick={(e) => { e.stopPropagation(); setShowMarkPaid(po); setPaidDate(new Date().toISOString().split('T')[0]); setPaidAccountId(po.bank_account_id || ''); setPaidNotes('') }}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1" title="Mark Paid">
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Mark Paid
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Create Payment Order Modal */}
            {showCreate && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-900">Create Payment Order</h2>
                            <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        {/* Tabs */}
                        <div className="flex border-b border-slate-100 px-5 gap-6 bg-slate-50">
                            <button onClick={() => setCreateTab('invoices')} className={`pt-4 pb-3 text-sm font-semibold border-b-2 transition ${createTab === 'invoices' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                                Invoices ({selectedInvoiceIds.size})
                            </button>
                            <button onClick={() => setCreateTab('manual')} className={`pt-4 pb-3 text-sm font-semibold border-b-2 transition ${createTab === 'manual' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                                Other Payments ({manualItems.filter(m => m.description && m.amount > 0).length})
                            </button>
                        </div>
                        <div className="p-5 border-b border-slate-100 bg-white">
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Pay from Account</label>
                            <select value={createAccountId} onChange={e => setCreateAccountId(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900">
                                <option value="">— Unassigned (Select later) —</option>
                                {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.account_number ? `${a.account_number} - ` : ''}{a.account_name} {a.bank_name ? `(${a.bank_name})` : ''}</option>)}
                            </select>
                            {selectedCreateAccount && (
                                <div className="mt-2 text-xs text-slate-500 flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                                    <span>Current Balance:</span>
                                    <span className="font-bold text-slate-900 tabular-nums">{fmt(Number(selectedCreateAccount.current_balance))} {selectedCreateAccount.currency || currency}</span>
                                </div>
                            )}
                        </div>
                        <div className="p-5 max-h-[50vh] overflow-y-auto space-y-5">
                            {createTab === 'invoices' && (
                            <div>
                                {/* Section 1: Invoices */}
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                        <FileText className="w-4 h-4" /> Invoices
                                    </h3>
                                </div>
                                {availableInvoices.length === 0 ? (
                                    <div className="text-center text-slate-400 py-4 text-sm border border-dashed border-slate-200 rounded-xl">No pending invoices</div>
                                ) : (
                                    <div className="space-y-2">
                                        {availableInvoices.map(inv => (
                                            <label key={inv.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${selectedInvoiceIds.has(inv.id) ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-blue-200'}`}>
                                                <input type="checkbox" checked={selectedInvoiceIds.has(inv.id)} onChange={() => toggleInvoice(inv.id)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-slate-800 text-sm">{inv.invoice_number} — {(inv as any).fin_suppliers?.name}</div>
                                                    <div className="text-xs text-slate-500">{inv.description || 'No description'} • {new Date(inv.invoice_date).toLocaleDateString('en-GB')}</div>
                                                </div>
                                                <div className="font-bold text-slate-900 tabular-nums text-sm">{fmt(Number(inv.gross_amount))} {inv.currency || currency}</div>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                            )}

                            {createTab === 'manual' && (
                            <div>
                                {/* Section 2: Manual Items */}
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                        <Briefcase className="w-4 h-4" /> Other Payments
                                    </h3>
                                    <button type="button" onClick={addManualItem}
                                        className="text-blue-600 hover:text-blue-800 text-xs font-semibold flex items-center gap-1 transition">
                                        <PlusCircle className="w-3.5 h-3.5" /> Add Item
                                    </button>
                                </div>
                                <p className="text-xs text-slate-500 mb-3">Payroll, taxes, reimbursements, or any non-invoice expense.</p>
                                {manualItems.length === 0 ? (
                                    <div className="text-center text-slate-400 py-4 text-sm border border-dashed border-slate-200 rounded-xl">No manual items added</div>
                                ) : (
                                    <div className="space-y-2">
                                        {manualItems.map(m => (
                                            <div key={m.id} className="flex items-start gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                                                <div className="flex-1 space-y-2">
                                                    <input type="text" placeholder="Description (e.g. May Payroll, VAT Q2...)" value={m.description}
                                                        onChange={e => updateManualItem(m.id, 'description', e.target.value)}
                                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900" />
                                                    <div className="flex gap-2">
                                                        <select value={m.account_id} onChange={e => updateManualItem(m.id, 'account_id', e.target.value)}
                                                            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-700">
                                                            <option value="">— Account Category —</option>
                                                            {coaAccounts.filter(a => ['OPEX','Salary','Tax','Other Expense','COGS'].includes(a.account_type)).map(a => (
                                                                <option key={a.id} value={a.id}>{a.code} – {a.name}</option>
                                                            ))}
                                                        </select>
                                                        <div className="relative w-40 sm:w-48">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">{currency}</span>
                                                            <input type="text" placeholder="Amount" value={m.amountStr !== undefined ? m.amountStr : (m.amount ? m.amount.toLocaleString('en-US') : '')}
                                                                onChange={e => {
                                                                    const clean = e.target.value.replace(/[^0-9]/g, '');
                                                                    const num = parseInt(clean, 10);
                                                                    updateManualItem(m.id, 'amount', isNaN(num) ? 0 : num);
                                                                    updateManualItem(m.id, 'amountStr', isNaN(num) ? '' : num.toLocaleString('en-US'));
                                                                }}
                                                                className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm text-right tabular-nums focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 font-bold" />
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        <button type="button" onClick={() => updateManualItem(m.id, 'branch_ids', branches.map(b => b.id))} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 rounded-md border border-slate-200 transition">
                                                            Select All
                                                        </button>
                                                        <button type="button" onClick={() => updateManualItem(m.id, 'branch_ids', [])} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 rounded-md border border-slate-200 transition">
                                                            Clear
                                                        </button>
                                                        {branches.map(b => (
                                                            <label key={b.id} className="flex items-center gap-1.5 cursor-pointer bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm transition hover:border-blue-300">
                                                                <input type="checkbox" checked={m.branch_ids.includes(b.id)} onChange={e => {
                                                                    const newIds = e.target.checked ? [...m.branch_ids, b.id] : m.branch_ids.filter(id => id !== b.id)
                                                                    updateManualItem(m.id, 'branch_ids', newIds)
                                                                }} className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                                                                <span className="text-xs text-slate-700">{b.name}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                                <button type="button" onClick={() => removeManualItem(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition mt-1">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            )}
                        </div>
                        <div className="flex items-center justify-between p-5 border-t border-slate-100 bg-slate-50">
                            <div>
                                <span className="text-sm text-slate-600">{selectedInvoiceIds.size} invoice{selectedInvoiceIds.size !== 1 ? 's' : ''}{manualItems.filter(m => m.description && m.amount > 0).length > 0 ? ` + ${manualItems.filter(m => m.description && m.amount > 0).length} manual` : ''}</span>
                                <span className="ml-4 text-lg font-black text-slate-900 tabular-nums">{currency} {fmt(selectedTotal)}</span>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition">Cancel</button>
                                <button onClick={handleCreateOrder} disabled={saving || (selectedInvoiceIds.size === 0 && manualItems.filter(m => m.description.trim() && m.amount > 0).length === 0)}
                                    className="px-4 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl shadow-md transition flex items-center gap-2">
                                    {saving && <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    Create Order
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {showDetail && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-900">{showDetail.order_number}</h2>
                            <div className="flex items-center gap-2">
                                {(showDetail.status === 'Draft' || showDetail.status === 'Pending Review') && (
                                    <>
                                        <button onClick={() => { handleEditOrder(showDetail); setShowDetail(null); }} className="text-slate-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded-lg transition" title="Edit Order">
                                            <Pencil className="w-5 h-5" />
                                        </button>
                                        <button onClick={() => { handleDelete(showDetail.id); setShowDetail(null); }} className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition" title="Delete Order">
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </>
                                )}
                                <button onClick={() => setShowDetail(null)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
                            </div>
                        </div>
                        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 flex justify-between items-center">
                                <div>
                                    <div className="text-sm text-blue-700 font-medium">Total Amount</div>
                                    <div className="text-2xl font-black text-blue-900 tabular-nums">{currency} {fmt(Number(showDetail.total_amount))}</div>
                                </div>
                                <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${(PAYMENT_ORDER_STATUS_STYLES[showDetail.status] || {}).bg} ${(PAYMENT_ORDER_STATUS_STYLES[showDetail.status] || {}).text}`}>
                                    {showDetail.status}
                                </span>
                            </div>
                            {(() => {
                                const items = showDetail.fin_payment_order_items || []
                                const invItems = items.filter(i => i.item_type === 'invoice' || i.invoice_id)
                                const manItems = items.filter(i => i.item_type === 'manual')

                                return (
                                    <>
                                        {invItems.length > 0 && (
                                            <>
                                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Invoices Included</h3>
                                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                                    <table className="w-full text-sm">
                                                        <thead><tr className="bg-slate-50 text-xs text-slate-500 uppercase"><th className="p-3 text-left">Invoice</th><th className="p-3 text-left">Supplier</th><th className="p-3 text-right">Amount</th></tr></thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {invItems.map(item => (
                                                                <tr key={item.id}>
                                                                    <td className="p-3 font-semibold text-slate-800">{item.fin_invoices?.invoice_number || '—'}</td>
                                                                    <td className="p-3 text-slate-600">{(item.fin_invoices as any)?.fin_suppliers?.name || '—'}</td>
                                                                    <td className="p-3 text-right tabular-nums font-bold text-slate-900">{fmt(Number(item.amount))}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </>
                                        )}
                                        {manItems.length > 0 && (
                                            <>
                                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4">Other Payments</h3>
                                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                                    <table className="w-full text-sm">
                                                        <thead><tr className="bg-slate-50 text-xs text-slate-500 uppercase"><th className="p-3 text-left">Description</th><th className="p-3 text-left">Account</th><th className="p-3 text-left">Branch</th><th className="p-3 text-right">Amount</th></tr></thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {manItems.map(item => (
                                                                <tr key={item.id}>
                                                                    <td className="p-3 font-semibold text-slate-800">{item.description || '—'}</td>
                                                                    <td className="p-3 text-slate-600">{item.fin_chart_of_accounts ? `${item.fin_chart_of_accounts.code} - ${item.fin_chart_of_accounts.name}` : '—'}</td>
                                                                    <td className="p-3 text-slate-600">
                                                                        {(!item.branch_ids || item.branch_ids.length === 0) ? <span className="text-slate-500 italic">General</span>
                                                                        : item.branch_ids.length === 1 ? branches.find(b => b.id === item.branch_ids![0])?.name || '—'
                                                                        : <span className="text-blue-600 font-medium" title={item.branch_ids.map(id => branches.find(b => b.id === id)?.name).join(', ')}>{item.branch_ids.length} Branches</span>}
                                                                    </td>
                                                                    <td className="p-3 text-right tabular-nums font-bold text-slate-900">{fmt(Number(item.amount))}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )
                            })()}
                            {showDetail.notes && <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">{showDetail.notes}</div>}
                        </div>
                        <div className="p-5 border-t border-slate-100 flex justify-end">
                            <button onClick={() => setShowDetail(null)} className="px-5 py-2.5 text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-md">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mark Paid Modal */}
            {showMarkPaid && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-900">Mark as Paid</h2>
                            <button onClick={() => setShowMarkPaid(null)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleMarkPaid} className="p-5 space-y-4">
                            <div className="bg-blue-50 p-4 rounded-xl flex justify-between items-center border border-blue-100">
                                <div className="text-sm font-medium text-blue-800">Order: <span className="font-bold">{showMarkPaid.order_number}</span></div>
                                <div className="text-lg font-black text-blue-900 tabular-nums">{fmt(Number(showMarkPaid.total_amount))} {currency}</div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Payment Date *</label>
                                <input type="date" required value={paidDate} onChange={e => setPaidDate(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Payment Method</label>
                                <select value={paidMethod} onChange={e => setPaidMethod(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900">
                                    <option>Bank Transfer</option><option>Cash</option><option>Credit Card</option><option>Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">From Account</label>
                                <select value={paidAccountId} onChange={e => setPaidAccountId(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900">
                                    <option value="">— Select account —</option>
                                    {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.account_number ? `${a.account_number} - ` : ''}{a.account_name} {a.bank_name ? `(${a.bank_name})` : ''}</option>)}
                                </select>
                                {selectedPaidAccount && (
                                    <div className="mt-2 text-xs text-slate-500 flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                                        <span>Current Balance:</span>
                                        <span className="font-bold text-slate-900 tabular-nums">{fmt(Number(selectedPaidAccount.current_balance))} {selectedPaidAccount.currency || currency}</span>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Notes</label>
                                <textarea rows={2} value={paidNotes} onChange={e => setPaidNotes(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm resize-none text-slate-900" />
                            </div>
                            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                                <button type="button" onClick={() => setShowMarkPaid(null)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                                <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl shadow-md flex items-center gap-2">
                                    {saving && <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    <CheckCircle2 className="w-4 h-4" /> Confirm Payment
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
