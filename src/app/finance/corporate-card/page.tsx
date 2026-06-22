'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { Plus, X, Pencil, Trash2, Calendar, CreditCard, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Repeat } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import { FinCorporateCardExpense, FinChartOfAccount, FinBankAccount } from '@/types/finance'
import { SupplierCombobox, AddSupplierModal } from '../components/SupplierComponents'
import { COACombobox } from '../components/COACombobox'
import { t } from '@/lib/i18n'

const BRANCH_COLORS = [
    { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
    { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
    { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
    { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
    { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', border: 'border-fuchsia-200' },
    { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' }
]

function getBranchColor(branchId: string, branchesList: { id: string; name: string }[]) {
    if (!branchId) return { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-200' };
    const idx = branchesList.findIndex(b => b.id === branchId);
    if (idx === -1) return { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-200' };
    return BRANCH_COLORS[idx % BRANCH_COLORS.length];
}

export default function CorporateCardPage() {
    const { currency, language } = useSettings()
    function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }
    
    const getFrequencyLabel = (freq: string) => {
        if (freq === 'One-Time') return language === 'vi' ? 'Một lần' : 'One-Time'
        if (freq === 'Weekly') return language === 'vi' ? 'Hàng tuần' : 'Weekly'
        if (freq === 'Monthly') return language === 'vi' ? 'Hàng tháng' : 'Monthly'
        if (freq === 'Quarterly') return language === 'vi' ? 'Hàng quý' : 'Quarterly'
        if (freq === 'Bi-Annual' || freq === 'Bi-Annually') return language === 'vi' ? 'Nửa năm' : 'Semi-Annual'
        if (freq === 'Yearly' || freq === 'Annually') return language === 'vi' ? 'Hàng năm' : 'Yearly'
        return freq
    }

    const translateStatus = (status: string) => {
        switch (status) {
            case 'Draft': return t(language, 'FinPayStatusDraft')
            case 'Pending Review': return t(language, 'FinPayStatusPendingReview')
            case 'Approved': return t(language, 'FinPayStatusApproved')
            case 'Paid': return t(language, 'FinPayStatusPaid')
            case 'Cancelled': return t(language, 'FinPayStatusCancelled')
            default: return status
        }
    }

    const [loading, setLoading] = useState(true)
    const [expenses, setExpenses] = useState<FinCorporateCardExpense[]>([])
    const [accounts, setAccounts] = useState<FinChartOfAccount[]>([])
    const [bankAccounts, setBankAccounts] = useState<FinBankAccount[]>([])
    const [branches, setBranches] = useState<any[]>([])
    const [suppliers, setSuppliers] = useState<{id: string; name: string}[]>([])
    const [showAddSupplier, setShowAddSupplier] = useState(false)
    const [invoices, setInvoices] = useState<any[]>([])
    const [newSupplierName, setNewSupplierName] = useState('')
    const [showAllInvoices, setShowAllInvoices] = useState(false)

    // Month navigation
    const [monthCursor, setMonthCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    const [search, setSearch] = useState('')

    // Modals
    const [showModal, setShowModal] = useState(false)
    const [editingItem, setEditingItem] = useState<FinCorporateCardExpense | null>(null)
    const [deletingRecurringItem, setDeletingRecurringItem] = useState<FinCorporateCardExpense | null>(null)
    const [saving, setSaving] = useState(false)
    const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})

    // Form
    const [form, setForm] = useState({
        description: '',
        amount: 0,
        amountStr: '',
        currency: currency as string,
        is_variable_amount: false,
        is_online_payment: false,
        is_recurring: false,
        frequency: 'One-Time',
        expense_date: new Date().toISOString().split('T')[0],
        account_id: '',
        bank_account_id: '',
        supplier_id: '' as string,
        vat_invoice_status: 'None' as 'Issued' | 'Pending' | 'None',
        invoice_id: '',
        branch_ids: [] as string[],
    })

    const filteredInvoices = useMemo(() => {
        if (showAllInvoices || !form.supplier_id) {
            return invoices
        }
        return invoices.filter(inv => inv.supplier_id === form.supplier_id)
    }, [invoices, form.supplier_id, showAllInvoices])

    const fetchData = async () => {
        setLoading(true)
        try { await supabase.rpc('fin_auto_generate_card_pos'); } catch (e) { console.warn('Auto-gen failed', e); }

        const [recRes, accRes, bankRes, brRes, supRes, invListRes] = await Promise.all([
            supabase.from('fin_corporate_card_expenses').select(`
                *,
                fin_chart_of_accounts(code, name, simplified_name),
                fin_bank_accounts(account_name, bank_name),
                suppliers(name),
                fin_invoices(invoice_number),
                fin_payment_order_items(
                    id,
                    fin_payment_orders(
                        id,
                        order_number,
                        status
                    )
                )
            `).order('expense_date', { ascending: false }),
            supabase.from('fin_chart_of_accounts').select('*').eq('is_active', true).eq('is_group', false).order('sort_order'),
            supabase.from('fin_bank_accounts').select('*').eq('is_active', true).in('account_type', ['Checking', 'Saving']).order('account_name'),
            supabase.from('provider_branches').select('id, name').order('name'),
            supabase.from('suppliers').select('id, name').order('name'),
            supabase.from('fin_invoices').select('id, invoice_number, supplier_id, suppliers(name), gross_amount, invoice_date').order('invoice_date', { ascending: false })
        ])
        setExpenses(recRes.data || [])
        setAccounts(accRes.data || [])
        setBankAccounts(bankRes.data || [])
        setBranches(brRes.data || [])
        setSuppliers(supRes.data || [])
        if (invListRes.data) setInvoices(invListRes.data)
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

    const handleOpenModal = (item?: FinCorporateCardExpense) => {
        setShowAllInvoices(false)
        const activeCards = bankAccounts.filter(a => a.is_corporate_card);
        const defaultCard = bankAccounts.find(a => a.is_default_corporate_card) || activeCards[0];
        const defaultCardId = defaultCard?.id || '';

        if (item) {
            setEditingItem(item)
            setForm({
                description: item.description,
                amount: item.amount,
                amountStr: item.amount.toString(),
                currency: item.currency,
                is_variable_amount: item.is_variable_amount,
                is_online_payment: item.is_online_payment || false,
                is_recurring: item.frequency !== 'One-Time',
                frequency: item.frequency,
                expense_date: item.expense_date,
                account_id: item.account_id || '',
                bank_account_id: item.bank_account_id || defaultCardId,
                supplier_id: item.supplier_id || '',
                vat_invoice_status: item.vat_invoice_status || 'None',
                invoice_id: item.invoice_id || '',
                branch_ids: item.branch_ids || [],
            })
        } else {
            setEditingItem(null)
            setForm({
                description: '',
                amount: 0,
                amountStr: '',
                currency: currency as string,
                is_variable_amount: false,
                is_online_payment: false,
                is_recurring: false,
                frequency: 'One-Time',
                expense_date: new Date().toISOString().split('T')[0],
                account_id: '',
                bank_account_id: defaultCardId,
                supplier_id: '',
                vat_invoice_status: 'None',
                invoice_id: '',
                branch_ids: [],
            })
        }
        setShowModal(true)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isFormInvalid) {
            alert(t(language, 'PleaseFillRequired')); return
        }
        setSaving(true)
        try {
            const payload = {
                description: form.description,
                amount: form.amount,
                currency: form.currency,
                is_variable_amount: form.currency !== currency ? form.is_variable_amount : false,
                is_online_payment: form.is_online_payment,
                frequency: form.is_recurring ? form.frequency : 'One-Time',
                expense_date: form.expense_date,
                account_id: form.account_id || null,
                bank_account_id: form.bank_account_id || null,
                supplier_id: form.supplier_id || null,
                vat_invoice_status: form.vat_invoice_status,
                has_vat_invoice: form.vat_invoice_status === 'Issued', // backward compat
                invoice_id: form.vat_invoice_status === 'Issued' && form.invoice_id ? form.invoice_id : null,
                branch_ids: form.branch_ids,
            }

            if (editingItem) {
                const { error } = await supabase.from('fin_corporate_card_expenses').update(payload).eq('id', editingItem.id)
                if (error) throw error

                const linkedPoItem = editingItem.fin_payment_order_items?.[0]
                const linkedPo = linkedPoItem?.fin_payment_orders
                if (linkedPo && linkedPo.status !== 'Paid') {
                    const { error: poItemErr } = await supabase.from('fin_payment_order_items').update({
                        description: form.description,
                        amount: form.amount,
                        account_id: form.account_id || null,
                        branch_ids: form.branch_ids,
                        supplier_id: form.supplier_id || null,
                    }).eq('id', linkedPoItem.id)
                    if (poItemErr) throw poItemErr

                    const { error: poErr } = await supabase.from('fin_payment_orders').update({
                        total_amount: form.amount,
                        bank_account_id: form.bank_account_id || null,
                        notes: 'Corporate card expense: ' + form.description,
                    }).eq('id', linkedPo.id)
                    if (poErr) throw poErr
                }
            } else {
                const { error } = await supabase.from('fin_corporate_card_expenses').insert([payload])
                if (error) throw error
            }

            setShowModal(false)
            fetchData()
        } catch (err: any) {
            alert(t(language, 'FinCCAlertSaveFailed') + err.message)
        }
        setSaving(false)
    }

    const handleDelete = async (id: string) => {
        const item = expenses.find(e => e.id === id)
        const linkedPoItem = item?.fin_payment_order_items?.[0]
        const linkedPo = linkedPoItem?.fin_payment_orders

        if (linkedPo) {
            const confirmMsg = language === 'vi'
                ? `Chi phí này được liên kết với Lệnh chi chưa thanh toán (${linkedPo.order_number}). Xóa chi phí này cũng sẽ xóa Lệnh chi liên kết. Bạn có muốn tiếp tục?`
                : `This expense is linked to the unpaid Payment Order (${linkedPo.order_number}). Deleting this expense will also delete the associated Payment Order. Do you want to proceed?`

            if (!confirm(confirmMsg)) return
        } else {
            if (!confirm(t(language, 'FinCCAlertDeleteConfirm'))) return
        }

        try {
            if (linkedPo) {
                const { error: poItemErr } = await supabase.from('fin_payment_order_items').delete().eq('payment_order_id', linkedPo.id)
                if (poItemErr) throw poItemErr
                const { error: poErr } = await supabase.from('fin_payment_orders').delete().eq('id', linkedPo.id)
                if (poErr) throw poErr
            }

            const { error } = await supabase.from('fin_corporate_card_expenses').delete().eq('id', id)
            if (error) throw error
            fetchData()
        } catch (err: any) {
            alert(t(language, 'FinCCAlertDeleteFailed') + err.message)
        }
    }

    const handleSkipRecurring = async () => {
        if (!deletingRecurringItem) return
        try {
            let next_date = new Date(deletingRecurringItem.expense_date)
            const freq = deletingRecurringItem.frequency
            
            if (freq === 'Weekly') next_date.setDate(next_date.getDate() + 7)
            else if (freq === 'Monthly') next_date.setMonth(next_date.getMonth() + 1)
            else if (freq === 'Quarterly') next_date.setMonth(next_date.getMonth() + 3)
            else if (freq === 'Bi-Annually') next_date.setMonth(next_date.getMonth() + 6)
            else if (freq === 'Yearly') next_date.setFullYear(next_date.getFullYear() + 1)
            else next_date.setMonth(next_date.getMonth() + 1)

            const { error } = await supabase.from('fin_corporate_card_expenses')
                .update({ expense_date: next_date.toISOString().split('T')[0] })
                .eq('id', deletingRecurringItem.id)
                
            if (error) throw error
            setDeletingRecurringItem(null)
            fetchData()
        } catch (err: any) {
            alert(t(language, 'FinCCAlertSkipFailed') + err.message)
        }
    }

    const handleDeleteRecurringSeries = async () => {
        if (!deletingRecurringItem) return
        const linkedPoItem = deletingRecurringItem.fin_payment_order_items?.[0]
        const linkedPo = linkedPoItem?.fin_payment_orders

        if (linkedPo) {
            const confirmMsg = language === 'vi'
                ? `Chi phí này được liên kết với Lệnh chi chưa thanh toán (${linkedPo.order_number}). Xóa chi phí này cũng sẽ xóa Lệnh chi liên kết. Bạn có muốn tiếp tục?`
                : `This expense is linked to the unpaid Payment Order (${linkedPo.order_number}). Deleting this expense will also delete the associated Payment Order. Do you want to proceed?`

            if (!confirm(confirmMsg)) return
        }

        try {
            if (linkedPo) {
                const { error: poItemErr } = await supabase.from('fin_payment_order_items').delete().eq('payment_order_id', linkedPo.id)
                if (poItemErr) throw poItemErr
                const { error: poErr } = await supabase.from('fin_payment_orders').delete().eq('id', linkedPo.id)
                if (poErr) throw poErr
            }

            const { error } = await supabase.from('fin_corporate_card_expenses').delete().eq('id', deletingRecurringItem.id)
            if (error) throw error
            setDeletingRecurringItem(null)
            fetchData()
        } catch (err: any) {
            alert(t(language, 'FinCCAlertDeleteFailed') + err.message)
        }
    }

    const toggleBranch = (bid: string) => {
        setForm(prev => {
            const next = [...prev.branch_ids]
            if (next.includes(bid)) return { ...prev, branch_ids: next.filter(id => id !== bid) }
            else return { ...prev, branch_ids: [...next, bid] }
        })
    }



    const filtered = useMemo(() => {
        const y = monthCursor.getFullYear()
        const m = monthCursor.getMonth()
        
        const result: FinCorporateCardExpense[] = []
        
        for (const r of expenses) {
            if (search && !r.description.toLowerCase().includes(search.toLowerCase())) continue;
            
            const d = new Date(r.expense_date)
            
            // Exact match month:
            if (d.getFullYear() === y && d.getMonth() === m) {
                result.push({ ...r, is_projection: false })
                continue
            }
            
            // Projection logic for future months
            if (r.frequency !== 'One-Time' && !r.is_paid) {
                const viewDate = new Date(y, m, 1)
                const expMonthDate = new Date(d.getFullYear(), d.getMonth(), 1)
                
                // If we are looking at a future month relative to the base date
                if (viewDate > expMonthDate) {
                    let projectedDate = new Date(d)
                    
                    while (projectedDate.getFullYear() < y || (projectedDate.getFullYear() === y && projectedDate.getMonth() < m)) {
                        if (r.frequency === 'Weekly') projectedDate.setDate(projectedDate.getDate() + 7)
                        else if (r.frequency === 'Monthly') projectedDate.setMonth(projectedDate.getMonth() + 1)
                        else if (r.frequency === 'Quarterly') projectedDate.setMonth(projectedDate.getMonth() + 3)
                        else if (r.frequency === 'Bi-Annually') projectedDate.setMonth(projectedDate.getMonth() + 6)
                        else if (r.frequency === 'Yearly') projectedDate.setFullYear(projectedDate.getFullYear() + 1)
                        else break
                    }
                    
                    if (projectedDate.getFullYear() === y && projectedDate.getMonth() === m) {
                        result.push({ ...r, id: r.id + '-proj', expense_date: projectedDate.toISOString(), is_projection: true })
                    }
                }
            }
        }
        
        return result.sort((a, b) => new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime())
    }, [expenses, monthCursor, search])

    const isFormInvalid = useMemo(() => {
        const hasDesc = !!form.description.trim()
        const hasAmount = form.amount > 0
        const hasSupplier = !!form.supplier_id
        const hasCategory = !!form.account_id
        const hasBank = !!form.bank_account_id
        const hasBranch = form.branch_ids.length >= 1

        return !(hasDesc && hasAmount && hasSupplier && hasCategory && hasBank && hasBranch)
    }, [form])

    return (
        <div className="p-6 max-w-[1400px] mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'FinCCTitle')}</h1>
                    <p className="text-slate-500 mt-1">{t(language, 'FinCCSubtitle')}</p>
                </div>
                <button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold transition shadow-md shadow-blue-600/20 flex items-center gap-2">
                    <Plus className="w-5 h-5" /> {t(language, 'FinCCAddExpenseButton')}
                </button>
            </div>

            {/* Month Navigation */}
            <div className="grid grid-cols-3 items-center mb-4">
                <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))} className="justify-self-start text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline transition flex items-center gap-1">
                    <ChevronLeft className="w-4 h-4" /> {t(language, 'FinCCPrevious')}
                </button>
                <div className="justify-self-center text-lg font-bold text-slate-900">
                    {monthCursor.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' })}
                </div>
                <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))} className="justify-self-end text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline transition flex items-center gap-1">
                    {t(language, 'FinCCNext')} <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* List */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px] table-auto text-left text-sm whitespace-nowrap border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                            <tr>
                                <th className="p-4 font-semibold">{t(language, 'FinCCColDate')}</th>
                                <th className="p-4 font-semibold">{t(language, 'FinCCColDescription')}</th>
                                <th className="p-4 font-semibold">{t(language, 'FinCCColCategory')}</th>
                                <th className="p-4 font-semibold">{t(language, 'FinCCColBranch')}</th>
                                <th className="p-4 font-semibold">{t(language, 'FinCCColVatStatus')}</th>
                                <th className="p-4 font-semibold text-right">{t(language, 'FinCCColAmount')}</th>
                                <th className="p-4 font-semibold">{t(language, 'FinCCColFrequency')}</th>
                                <th className="p-4 font-semibold text-right whitespace-nowrap min-w-[130px]">{t(language, 'FinCCColActions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} className="p-8 text-center"><CircularLoader /></td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-500">{t(language, 'FinCCNoExpenses')}</td></tr>
                            ) : filtered.map(r => {
                                const linkedPo = r.fin_payment_order_items?.[0]?.fin_payment_orders
                                const isPoPaid = linkedPo?.status === 'Paid'
                                return (
                                    <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition ${r.is_projection ? 'opacity-60 bg-slate-50/30' : ''}`}>
                                        <td className="p-4 text-slate-600 flex items-center gap-1.5 align-top">
                                            {r.is_projection ? <Repeat className="w-4 h-4 text-blue-400" /> : <Calendar className="w-4 h-4 text-slate-400" />} 
                                            {new Date(r.expense_date).toLocaleDateString('en-GB')}
                                        </td>
                                        <td className="p-4 align-top">
                                            <div className="font-bold text-slate-900">{r.description}</div>
                                            {r.is_variable_amount && <div className="text-xs text-amber-600 font-medium flex items-center gap-1 mt-0.5"><AlertCircle className="w-3.5 h-3.5" /> {t(language, 'FinCCVariableExRate')}</div>}
                                            {r.is_online_payment && <div className="text-xs text-indigo-600 font-medium flex items-center gap-1 mt-0.5"><AlertCircle className="w-3.5 h-3.5" /> {t(language, 'FinCCOnlinePayment')}</div>}
                                        </td>
                                        <td className="p-4 align-top">
                                            <div className="font-medium text-slate-800">{r.fin_chart_of_accounts ? `${r.fin_chart_of_accounts.code} - ${language === 'vi' ? (r.fin_chart_of_accounts.simplified_name || r.fin_chart_of_accounts.name) : r.fin_chart_of_accounts.name}` : '—'}</div>
                                            <div className="text-xs text-slate-500">{r.fin_bank_accounts?.account_name || t(language, 'FinCCModalUnassigned')}</div>
                                        </td>
                                        <td className="p-4 text-slate-600 align-top">
                                            {(!r.branch_ids || r.branch_ids.length === 0 || (branches.length > 0 && r.branch_ids.length === branches.length)) ? (
                                                <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                                                    {t(language, 'FinCFAllBranches')}
                                                </span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1">
                                                    {r.branch_ids.map(id => {
                                                        const br = branches.find(b => b.id === id);
                                                        if (!br) return null;
                                                        const col = getBranchColor(id, branches);
                                                        return (
                                                            <span key={id} className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${col.bg} ${col.text} border ${col.border} whitespace-nowrap`}>
                                                                {br.name}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 align-top">
                                            <div>
                                                {r.vat_invoice_status === 'Issued' ? (
                                                    <span className="inline-flex px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">{t(language, 'FinCCVatIssued')}</span>
                                                ) : r.vat_invoice_status === 'Pending' ? (
                                                    <span className="inline-flex px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">{t(language, 'FinCCVatPending')}</span>
                                                ) : (
                                                    <span className="inline-flex px-2 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">{t(language, 'FinCCVatNone')}</span>
                                                )}
                                                {r.fin_invoices?.invoice_number && (
                                                    <div className="text-[11px] font-bold text-blue-600 mt-1 leading-none">
                                                        {r.fin_invoices.invoice_number}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right align-top">
                                            <div className="font-black text-slate-900 tabular-nums text-base">
                                                {r.final_amount_vnd ? fmt(Number(r.final_amount_vnd)) : (r.currency === currency 
                                                    ? fmt(Number(r.amount)) 
                                                    : fmt(Number(r.amount) * (exchangeRates[r.currency] ? (1 / exchangeRates[r.currency]) : 1)))} 
                                                <span className="text-sm font-medium text-slate-500 ml-1">{currency}</span>
                                            </div>
                                            {r.currency !== currency && (
                                                <div className="text-xs text-slate-500 font-bold mt-0.5">
                                                    {fmt(Number(r.amount))} {r.currency} {r.final_amount_vnd && <span className="text-slate-400 font-normal ml-1">(from PO)</span>}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 font-medium text-slate-700 align-top">
                                            {r.frequency === 'One-Time' ? <span className="text-slate-400">—</span> : <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">{getFrequencyLabel(r.frequency)}</span>}
                                            {isPoPaid && <div className="mt-2"><span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">{t(language, 'FinCCPaid')}</span></div>}
                                            {linkedPo && !isPoPaid && <div className="mt-2"><span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold">{translateStatus(linkedPo.status)}</span></div>}
                                        </td>
                                        <td className="p-4 text-right align-top whitespace-nowrap min-w-[130px]">
                                            {isPoPaid ? (
                                                <div className="text-xs text-slate-400 font-medium italic mt-1 mr-2">{t(language, 'FinCCEditViaPo')}</div>
                                            ) : r.is_projection ? (
                                                <div className="text-xs text-slate-400 font-medium italic mt-1 mr-2 text-blue-400/80">{t(language, 'FinCCProjection')}</div>
                                            ) : (
                                                <div className="flex items-center justify-end gap-2">
                                                    <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                                                        <button onClick={() => handleOpenModal(r)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition" title={t(language, 'Edit')}>
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => {
                                                            if (r.frequency !== 'One-Time') {
                                                                setDeletingRecurringItem(r)
                                                            } else {
                                                                handleDelete(r.id)
                                                            }
                                                        }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-red-600 transition" title={t(language, 'Delete')}>
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
                            <h2 className="text-xl font-black text-slate-900">{editingItem ? t(language, 'FinCCModalEditExpense') : t(language, 'FinCCModalNewExpense')}</h2>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-5 overflow-y-auto max-h-[75vh]">
                            <div className="space-y-4">
                                {editingItem && (() => {
                                    const linkedPoItem = editingItem.fin_payment_order_items?.[0]
                                    const linkedPo = linkedPoItem?.fin_payment_orders
                                    if (linkedPo && linkedPo.status !== 'Paid') {
                                        return (
                                            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm font-medium flex items-start gap-2">
                                                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                                <div>
                                                    {language === 'vi'
                                                        ? `Chi phí này được liên kết với Lệnh chi chưa thanh toán (${linkedPo.order_number}). Việc chỉnh sửa tại đây cũng sẽ cập nhật Lệnh chi liên kết.`
                                                        : `This expense is linked to the unpaid Payment Order (${linkedPo.order_number}). Editing here will also update the Payment Order.`}
                                                </div>
                                            </div>
                                        )
                                    }
                                    return null
                                })()}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinCCModalDescription')} <span className="text-red-500">*</span></label>
                                        <input type="text" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                            placeholder="e.g. Google Workspace" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 font-medium" />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinCCModalSupplier')} <span className="text-red-500">*</span></label>
                                        <SupplierCombobox
                                            suppliers={suppliers}
                                            selectedId={form.supplier_id || null}
                                            onChange={(id) => setForm(f => ({ ...f, supplier_id: id || '' }))}
                                            onAddNew={(q) => { setNewSupplierName(q); setShowAddSupplier(true) }}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinCCModalAmount')} <span className="text-red-500">*</span></label>
                                        <input type="text" required placeholder="0" value={form.amountStr !== undefined ? form.amountStr : (form.amount ? form.amount.toLocaleString('en-US') : '')} onChange={e => {
                                                const clean = e.target.value.replace(/[^0-9]/g, '');
                                                const num = parseInt(clean, 10);
                                                setForm(f => ({ ...f, amount: isNaN(num) ? 0 : num, amountStr: isNaN(num) ? '' : num.toLocaleString('en-US') }));
                                            }}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm tabular-nums text-slate-900 font-medium" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinCCModalCurrency')}</label>
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
                                                    <div className="text-sm font-bold text-blue-900">{t(language, 'FinCCModalConvertedAmount').replace('{currency}', currency || '')}</div>
                                                    <div className="text-xs text-blue-700">{t(language, 'FinCCModalLiveExRate')}</div>
                                                </div>
                                                <div className="text-lg font-black text-blue-900 tabular-nums">
                                                    {rateToSystem ? fmt(form.amount * rateToSystem) : '...'} <span className="text-sm font-bold text-blue-700">{currency}</span>
                                                </div>
                                            </div>
                                        )
                                    })()}
                                    {form.currency !== currency && (
                                    <div className="col-span-2">
                                        <label className="flex items-start gap-3 p-3 border border-amber-200 bg-amber-50 rounded-xl cursor-pointer">
                                            <input type="checkbox" checked={form.is_variable_amount} onChange={e => setForm(f => ({ ...f, is_variable_amount: e.target.checked }))} className="mt-1 w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500" />
                                            <div>
                                                <div className="font-bold text-amber-900 text-sm">{t(language, 'FinCCModalVariableAmount')}</div>
                                                <div className="text-xs text-amber-700 mt-0.5">{t(language, 'FinCCModalVariableAmountDesc')}</div>
                                            </div>
                                        </label>
                                    </div>
                                    )}

                                    <div className="col-span-2">
                                        <label className="flex items-start gap-3 p-3 border border-indigo-200 bg-indigo-50 rounded-xl cursor-pointer">
                                            <input type="checkbox" checked={form.is_online_payment} onChange={e => setForm(f => ({ ...f, is_online_payment: e.target.checked }))} className="mt-1 w-4 h-4 text-indigo-600 rounded border-indigo-300 focus:ring-indigo-500" />
                                            <div>
                                                <div className="font-bold text-indigo-900 text-sm">{t(language, 'FinCCModalOnlinePayment')}</div>
                                                <div className="text-xs text-indigo-700 mt-0.5">{t(language, 'FinCCModalOnlinePaymentDesc')}</div>
                                            </div>
                                        </label>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinCCModalExpenseDate')}</label>
                                        <input type="date" required value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 font-medium" />
                                    </div>
                                    <div className="flex items-end">
                                        <div className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border cursor-pointer transition-colors ${form.is_recurring ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}
                                            onClick={() => setForm(f => ({ ...f, is_recurring: !f.is_recurring, frequency: !f.is_recurring ? 'Monthly' : 'One-Time' }))}>
                                            <span className="font-semibold text-slate-700 text-sm">{form.is_recurring ? t(language, 'FinCCModalRecurring') : t(language, 'FinCCModalOneTime')}</span>
                                            <div className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${form.is_recurring ? 'bg-blue-600' : 'bg-slate-300'}`}>
                                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_recurring ? 'translate-x-4' : ''}`} />
                                            </div>
                                        </div>
                                    </div>

                                    {form.is_recurring && (
                                        <div className="col-span-2">
                                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t(language, 'FinCCModalFrequency')}</label>
                                            <div className="grid grid-cols-5 gap-2">
                                                {['Weekly', 'Monthly', 'Quarterly', 'Bi-Annual', 'Yearly'].map(f => (
                                                    <button key={f} type="button" onClick={() => setForm(prev => ({ ...prev, frequency: f }))}
                                                        className={`py-2 rounded-xl text-sm font-semibold border transition-colors text-center ${form.frequency === f ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}>
                                                        {getFrequencyLabel(f)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinCCModalCoa')} <span className="text-red-500">*</span></label>
                                        <COACombobox 
                                            coas={accounts}
                                            value={form.account_id}
                                            onChange={(val) => setForm(f => ({ ...f, account_id: val }))}
                                            placeholder={t(language, 'FinCCModalSelectCoa')}
                                        />
                                    </div>

                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinCCModalDefaultBank')} <span className="text-red-500">*</span></label>
                                        <select value={form.bank_account_id} onChange={e => setForm(f => ({ ...f, bank_account_id: e.target.value }))}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 font-medium">
                                            {bankAccounts.filter(a => a.is_corporate_card).map(a => <option key={a.id} value={a.id}>{a.account_name} {a.bank_name ? `(${a.bank_name})` : ''}</option>)}
                                        </select>
                                    </div>

                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinCCModalVatStatus')} <span className="text-red-500">*</span></label>
                                        <select value={form.vat_invoice_status} onChange={e => setForm(f => ({ ...f, vat_invoice_status: e.target.value as any }))}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 font-medium col-span-2">
                                            <option value="None">{t(language, 'FinCCVatNone')}</option>
                                            <option value="Pending">{t(language, 'FinCCVatPending')}</option>
                                            <option value="Issued">{t(language, 'FinCCVatIssued')}</option>
                                        </select>
                                    </div>

                                    {form.vat_invoice_status === 'Issued' && (
                                        <div className="col-span-2">
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="block text-sm font-semibold text-slate-700">{language === 'vi' ? 'Liên kết với hóa đơn VAT' : 'Link to VAT Invoice'}</label>
                                                {form.supplier_id && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowAllInvoices(!showAllInvoices)}
                                                        className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline transition"
                                                    >
                                                        {showAllInvoices 
                                                            ? (language === 'vi' ? 'Lọc theo nhà cung cấp' : 'Filter by supplier')
                                                            : (language === 'vi' ? 'Xem tất cả hóa đơn VAT' : 'Browse all VAT invoices')
                                                        }
                                                    </button>
                                                )}
                                            </div>
                                            <select value={form.invoice_id} onChange={e => setForm(f => ({ ...f, invoice_id: e.target.value }))}
                                                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 font-medium">
                                                <option value="">{language === 'vi' ? '-- Chọn hóa đơn --' : '-- Select invoice --'}</option>
                                                {filteredInvoices.map(inv => (
                                                    <option key={inv.id} value={inv.id}>
                                                        {inv.invoice_number} - {inv.suppliers?.name || 'No Supplier'} ({fmt(Number(inv.gross_amount))} {currency})
                                                     </option>
                                                ))}
                                            </select>
                                            {form.supplier_id && (
                                                <div className="text-xs mt-1.5 font-medium text-slate-500">
                                                    {filteredInvoices.length === 0 ? (
                                                        <span className="text-amber-600">
                                                            {language === 'vi' 
                                                                ? 'Không tìm thấy hóa đơn nào cho nhà cung cấp này.' 
                                                                : 'No invoices found for this supplier.'}
                                                        </span>
                                                    ) : (
                                                        <span>
                                                            {showAllInvoices 
                                                                ? (language === 'vi' ? 'Đang hiển thị tất cả hóa đơn VAT.' : 'Showing all VAT invoices.')
                                                                : (language === 'vi' ? 'Đang hiển thị hóa đơn của nhà cung cấp này.' : 'Showing invoices for this supplier.')}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">{t(language, 'FinCCModalAttributedBranches')} <span className="text-red-500">*</span></label>
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
                                    

                                </div>
                            </div>

                            <div className="flex gap-3 justify-end pt-6 mt-6 border-t border-slate-100">
                                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition">{t(language, 'Cancel')}</button>
                                <button type="submit" disabled={saving || isFormInvalid} className="px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl shadow-md transition flex items-center gap-2">
                                    {saving && <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    {t(language, 'FinCCModalSave')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <AddSupplierModal
                isOpen={showAddSupplier}
                onClose={() => setShowAddSupplier(false)}
                onSaved={(s) => {
                    setSuppliers(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)))
                    setForm(f => ({ ...f, supplier_id: s.id }))
                    setShowAddSupplier(false)
                }}
                initialName={newSupplierName}
            />

            {/* Delete Recurring Modal */}
            {deletingRecurringItem && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-6">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                                <Trash2 className="w-6 h-6 text-red-600" />
                            </div>
                            <h2 className="text-xl font-black text-slate-900 mb-2">{t(language, 'FinCCDelModalTitle')}</h2>
                            <p className="text-slate-600 text-sm mb-6">{t(language, 'FinCCDelModalDesc')}</p>
                            
                            <div className="space-y-3">
                                <button onClick={handleSkipRecurring} className="w-full text-left p-4 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 rounded-xl transition group">
                                    <div className="font-bold text-slate-900 group-hover:text-blue-700">{t(language, 'FinCCDelModalSkipOccur')}</div>
                                    <div className="text-xs text-slate-500 mt-1">{t(language, 'FinCCDelModalSkipOccurDesc').replace('{date}', new Date(deletingRecurringItem.expense_date).toLocaleDateString('en-GB'))}</div>
                                </button>
                                
                                <button onClick={handleDeleteRecurringSeries} className="w-full text-left p-4 border border-slate-200 hover:border-red-300 hover:bg-red-50 rounded-xl transition group">
                                    <div className="font-bold text-slate-900 group-hover:text-red-700">{t(language, 'FinCCDelModalDelSeries')}</div>
                                    <div className="text-xs text-slate-500 mt-1">{t(language, 'FinCCDelModalDelSeriesDesc')}</div>
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end p-5 bg-slate-50 border-t border-slate-100">
                            <button onClick={() => setDeletingRecurringItem(null)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition">{t(language, 'Cancel')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
