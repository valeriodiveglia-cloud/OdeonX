'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { Search, Plus, FileText, X, Filter, Download, ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import type { FinInvoice, FinSupplier, FinChartOfAccount } from '@/types/finance'
import { INVOICE_STATUS_STYLES } from '@/types/finance'

function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

type ModalMode = 'none' | 'add' | 'edit'

export default function InvoicesPage() {
    const { currency } = useSettings()
    const [loading, setLoading] = useState(true)
    const [invoices, setInvoices] = useState<FinInvoice[]>([])
    const [suppliers, setSuppliers] = useState<FinSupplier[]>([])
    const [accounts, setAccounts] = useState<FinChartOfAccount[]>([])
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('All')
    const [branchFilter, setBranchFilter] = useState<string>('All')
    const [modalMode, setModalMode] = useState<ModalMode>('none')
    const [editingInvoice, setEditingInvoice] = useState<FinInvoice | null>(null)
    const [saving, setSaving] = useState(false)

    // Form state
    const [form, setForm] = useState({
        invoice_number: '', invoice_date: new Date().toISOString().split('T')[0],
        due_date: '', supplier_id: '', branch_ids: [] as string[], account_id: '',
        description: '', net_amount: '', vat_rate: '10', vat_amount: '',
        currency: '', notes: '',
    })
    // New supplier inline
    const [showNewSupplier, setShowNewSupplier] = useState(false)
    const [newSupplierName, setNewSupplierName] = useState('')

    const fetchData = async () => {
        setLoading(true)
        const [invRes, supRes, coaRes, brRes] = await Promise.all([
            supabase.from('fin_invoices').select('*, fin_suppliers(name, tax_id), fin_chart_of_accounts(code, name, simplified_name)').order('invoice_date', { ascending: false }),
            supabase.from('fin_suppliers').select('*').eq('is_active', true).order('name'),
            supabase.from('fin_chart_of_accounts').select('*').eq('is_group', false).eq('is_active', true).order('sort_order'),
            supabase.from('provider_branches').select('id, name').order('name'),
        ])
        if (invRes.data) setInvoices(invRes.data as any)
        if (supRes.data) setSuppliers(supRes.data as any)
        if (coaRes.data) setAccounts(coaRes.data as any)
        if (brRes.data) setBranches(brRes.data as any)
        setLoading(false)
    }

    useEffect(() => { fetchData() }, [])

    const filtered = useMemo(() => {
        return invoices.filter(inv => {
            if (statusFilter !== 'All' && inv.status !== statusFilter) return false
            if (branchFilter !== 'All') {
                if (branchFilter === 'General') {
                    if (inv.branch_ids && inv.branch_ids.length > 0) return false
                } else {
                    if (!inv.branch_ids || !inv.branch_ids.includes(branchFilter)) return false
                }
            }
            if (search) {
                const q = search.toLowerCase()
                const supplierName = ((inv as any).fin_suppliers?.name || '').toLowerCase()
                return inv.invoice_number.toLowerCase().includes(q) || supplierName.includes(q) || (inv.description || '').toLowerCase().includes(q)
            }
            return true
        })
    }, [invoices, statusFilter, branchFilter, search])

    const totalFiltered = filtered.reduce((s, i) => s + Number(i.gross_amount || 0), 0)

    const resetForm = () => {
        setForm({ invoice_number: '', invoice_date: new Date().toISOString().split('T')[0], due_date: '', supplier_id: '', branch_ids: [], account_id: '', description: '', net_amount: '', vat_rate: '10', vat_amount: '', currency: '', notes: '' })
        setShowNewSupplier(false)
        setNewSupplierName('')
    }

    const openAdd = () => { resetForm(); setForm(f => ({ ...f, currency })); setEditingInvoice(null); setModalMode('add') }

    const openEdit = (inv: FinInvoice) => {
        setEditingInvoice(inv)
        setForm({
            invoice_number: inv.invoice_number, invoice_date: inv.invoice_date,
            due_date: inv.due_date || '', supplier_id: inv.supplier_id, branch_ids: inv.branch_ids || [],
            account_id: inv.account_id || '', description: inv.description || '',
            net_amount: String(inv.net_amount), vat_rate: String(inv.vat_rate),
            vat_amount: String(inv.vat_amount), currency: inv.currency || currency, notes: inv.notes || '',
        })
        setModalMode('edit')
    }

    // Auto-calc VAT
    const handleNetChange = (val: string) => {
        const net = parseFloat(val) || 0
        const rate = parseFloat(form.vat_rate) || 0
        setForm(f => ({ ...f, net_amount: val, vat_amount: String(Math.round(net * rate / 100)) }))
    }
    const handleVatRateChange = (val: string) => {
        const net = parseFloat(form.net_amount) || 0
        const rate = parseFloat(val) || 0
        setForm(f => ({ ...f, vat_rate: val, vat_amount: String(Math.round(net * rate / 100)) }))
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.invoice_number || !form.invoice_date || (!form.supplier_id && !newSupplierName) || !form.net_amount) {
            alert('Please fill required fields'); return
        }
        setSaving(true)
        try {
            let supplierId = form.supplier_id
            // Create inline supplier if needed
            if (showNewSupplier && newSupplierName) {
                const { data: newSup, error: supErr } = await supabase.from('fin_suppliers').insert({ name: newSupplierName }).select().single()
                if (supErr) throw supErr
                supplierId = newSup.id
            }

            const payload = {
                invoice_number: form.invoice_number,
                invoice_date: form.invoice_date,
                due_date: form.due_date || null,
                supplier_id: supplierId,
                branch_ids: form.branch_ids.length > 0 ? form.branch_ids : null,
                account_id: form.account_id || null,
                description: form.description || null,
                net_amount: parseFloat(form.net_amount) || 0,
                vat_rate: parseFloat(form.vat_rate) || 0,
                vat_amount: parseFloat(form.vat_amount) || 0,
                currency: form.currency || currency,
                notes: form.notes || null,
            }

            if (modalMode === 'edit' && editingInvoice) {
                const { error } = await supabase.from('fin_invoices').update(payload).eq('id', editingInvoice.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('fin_invoices').insert(payload)
                if (error) throw error
            }

            setModalMode('none')
            fetchData()
        } catch (err: any) {
            console.error(err)
            alert('Failed to save: ' + err.message)
        }
        setSaving(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this invoice?')) return
        await supabase.from('fin_invoices').delete().eq('id', id)
        fetchData()
    }

    const statuses = ['All', 'Pending', 'In Payment', 'Paid', 'Overdue', 'Cancelled']

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Invoices</h1>
                    <p className="text-slate-500 mt-1">Track and manage all supplier invoices</p>
                </div>
                <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2">
                    <Plus className="w-4 h-4" /> New Invoice
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 shadow-sm" />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    <option value="All">All Branches</option>
                    <option value="General">General (Company)</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
            </div>

            {/* Summary bar */}
            <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-3 mb-4 shadow-sm">
                <span className="text-sm text-slate-600">{filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</span>
                <span className="text-sm font-bold text-slate-900 tabular-nums">Total: {currency} {fmt(totalFiltered)}</span>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                <table className="w-full table-auto text-sm text-gray-900 text-left border-collapse">
                    <thead>
                        <tr className="text-gray-500 font-semibold border-b border-slate-100 bg-slate-50/50">
                            <th className="p-3 whitespace-nowrap">Invoice #</th>
                            <th className="p-3 whitespace-nowrap">Date</th>
                            <th className="p-3 whitespace-nowrap">Due</th>
                            <th className="p-3 whitespace-nowrap">Supplier</th>
                            <th className="p-3 whitespace-nowrap">Branch</th>
                            <th className="p-3 whitespace-nowrap">Category</th>
                            <th className="p-3 whitespace-nowrap text-right">Net</th>
                            <th className="p-3 whitespace-nowrap text-right">VAT</th>
                            <th className="p-3 whitespace-nowrap text-right">Total</th>
                            <th className="p-3 whitespace-nowrap">Status</th>
                            <th className="p-3 whitespace-nowrap text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={11} className="p-8 text-center"><CircularLoader /></td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={11} className="p-8 text-center text-gray-500">No invoices found</td></tr>
                        ) : filtered.map(inv => {
                            const sty = INVOICE_STATUS_STYLES[inv.status] || INVOICE_STATUS_STYLES['Pending']
                            const today = new Date().toISOString().split('T')[0]
                            const isOverdue = inv.status === 'Pending' && inv.due_date && inv.due_date < today
                            return (
                                <tr key={inv.id} className={`border-t border-slate-100 hover:bg-blue-50/30 transition ${isOverdue ? 'bg-red-50/30' : ''}`}>
                                    <td className="p-3 font-semibold text-slate-800">{inv.invoice_number}</td>
                                    <td className="p-3 text-slate-600 whitespace-nowrap">{new Date(inv.invoice_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                                    <td className="p-3 whitespace-nowrap">
                                        {inv.due_date ? (
                                            <span className={isOverdue ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                                                {new Date(inv.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                            </span>
                                        ) : <span className="text-slate-400">—</span>}
                                    </td>
                                    <td className="p-3 text-slate-700 font-medium">{(inv as any).fin_suppliers?.name || '—'}</td>
                                    <td className="p-3 text-slate-600">
                                        {(!inv.branch_ids || inv.branch_ids.length === 0) ? <span className="text-slate-500 italic">General</span>
                                        : inv.branch_ids.length === 1 ? branches.find(b => b.id === inv.branch_ids![0])?.name || '—'
                                        : <span className="text-blue-600 font-medium" title={inv.branch_ids.map(id => branches.find(b => b.id === id)?.name).join(', ')}>{inv.branch_ids.length} Branches</span>}
                                    </td>
                                    <td className="p-3 text-slate-600 text-xs">
                                        {(inv as any).fin_chart_of_accounts?.simplified_name || (inv as any).fin_chart_of_accounts?.name || '—'}
                                    </td>
                                    <td className="p-3 text-right tabular-nums">{fmt(Number(inv.net_amount))}</td>
                                    <td className="p-3 text-right tabular-nums text-slate-500">{fmt(Number(inv.vat_amount))}</td>
                                    <td className="p-3 text-right tabular-nums font-bold">{fmt(Number(inv.gross_amount))}</td>
                                    <td className="p-3">
                                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isOverdue ? 'bg-red-100 text-red-700' : `${sty.bg} ${sty.text}`}`}>
                                            {isOverdue ? 'Overdue' : inv.status}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {inv.status === 'Pending' && (
                                                <>
                                                    <button onClick={() => openEdit(inv)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition" title="Edit">
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDelete(inv.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-red-600 transition" title="Delete">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Modal */}
            {modalMode !== 'none' && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-blue-500" />
                                {modalMode === 'edit' ? 'Edit Invoice' : 'New Invoice'}
                            </h2>
                            <button onClick={() => setModalMode('none')} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Invoice Number *</label>
                                    <input required value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white shadow-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Invoice Date *</label>
                                    <input type="date" required value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white shadow-sm" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Due Date</label>
                                    <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white shadow-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Branch Allocation</label>
                                    <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm max-h-32 overflow-y-auto space-y-2">
                                        <div className="flex gap-2 mb-2">
                                            <button type="button" onClick={() => setForm(f => ({ ...f, branch_ids: branches.map(b => b.id) }))} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 rounded-md border border-slate-200 transition">
                                                Select All
                                            </button>
                                            <button type="button" onClick={() => setForm(f => ({ ...f, branch_ids: [] }))} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 rounded-md border border-slate-200 transition">
                                                Clear
                                            </button>
                                        </div>
                                        <div className="h-px bg-slate-100 my-1"></div>
                                        {branches.map(b => (
                                            <label key={b.id} className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox"
                                                    checked={form.branch_ids.includes(b.id)}
                                                    onChange={(e) => {
                                                        setForm(f => {
                                                            const newIds = e.target.checked
                                                                ? [...f.branch_ids, b.id]
                                                                : f.branch_ids.filter(id => id !== b.id)
                                                            return { ...f, branch_ids: newIds }
                                                        })
                                                    }}
                                                    className="w-4 h-4 rounded border-slate-300 text-blue-600" />
                                                <span className="text-sm text-slate-700">{b.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Supplier */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-sm font-semibold text-slate-700">Supplier *</label>
                                    <button type="button" onClick={() => setShowNewSupplier(!showNewSupplier)}
                                        className="text-xs text-blue-600 hover:underline">{showNewSupplier ? 'Select existing' : '+ New supplier'}</button>
                                </div>
                                {showNewSupplier ? (
                                    <input placeholder="New supplier name" value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white shadow-sm" />
                                ) : (
                                    <select required value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white shadow-sm">
                                        <option value="">— Select supplier —</option>
                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                )}
                            </div>

                            {/* Category */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Category (Chart of Accounts)</label>
                                <select value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white shadow-sm">
                                    <option value="">— Select category —</option>
                                    {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white shadow-sm" />
                            </div>

                            {/* Amounts */}
                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Net Amount *</label>
                                        <input type="number" step="0.01" required value={form.net_amount} onChange={e => handleNetChange(e.target.value)}
                                            className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white text-sm tabular-nums" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">VAT Rate %</label>
                                        <input type="number" step="0.01" value={form.vat_rate} onChange={e => handleVatRateChange(e.target.value)}
                                            className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white text-sm tabular-nums" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">VAT Amount</label>
                                        <input type="number" step="0.01" value={form.vat_amount} onChange={e => setForm(f => ({ ...f, vat_amount: e.target.value }))}
                                            className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white text-sm tabular-nums" />
                                    </div>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                                    <span className="text-sm font-bold text-slate-700">Gross Total</span>
                                    <span className="text-lg font-black text-slate-900 tabular-nums">
                                        {form.currency || currency} {fmt((parseFloat(form.net_amount) || 0) + (parseFloat(form.vat_amount) || 0))}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Currency</label>
                                    <input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                                        placeholder={currency} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white shadow-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Notes</label>
                                    <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white shadow-sm" />
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                                <button type="button" onClick={() => setModalMode('none')} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition">Cancel</button>
                                <button type="submit" disabled={saving}
                                    className="px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl transition shadow-md flex items-center gap-2">
                                    {saving ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FileText className="w-4 h-4" />}
                                    {modalMode === 'edit' ? 'Update Invoice' : 'Create Invoice'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
