'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { Search, Plus, FileText, X, Filter, Download, ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import MonthPicker from '@/components/MonthPicker'
import { t } from '@/lib/i18n'
import CircularLoader from '@/components/CircularLoader'
import type { FinInvoice, Supplier, FinChartOfAccount } from '@/types/finance'
import { INVOICE_STATUS_STYLES } from '@/types/finance'
import { COACombobox } from '@/app/finance/components/COACombobox'
import { SupplierCombobox, AddSupplierModal } from '../components/SupplierComponents'

function fmt(n: number, isVND = false) {
    const val = isNaN(n) ? 0 : (n || 0)
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: isVND ? 0 : 2,
        maximumFractionDigits: isVND ? 0 : 2
    }).format(val)
}

function parseFormattedNumber(val: string): number {
    if (!val) return 0
    let clean = val;
    if (!clean.includes('.') && clean.includes(',')) {
        const commaCount = (clean.match(/,/g) || []).length;
        if (commaCount === 1) {
            const idx = clean.indexOf(',');
            const afterComma = clean.substring(idx + 1);
            if (afterComma === '' || afterComma.length === 1 || afterComma.length === 2) {
                clean = clean.replace(',', '.');
            } else {
                clean = clean.replace(/,/g, '');
            }
        } else {
            clean = clean.replace(/,/g, '');
        }
    } else {
        clean = clean.replace(/,/g, '');
    }
    const parsed = parseFloat(clean)
    return isNaN(parsed) ? 0 : parsed
}

function formatNumericInput(val: string, isVND: boolean): string {
    if (!val) return ''

    if (isVND) {
        const clean = val.replace(/[^0-9]/g, '')
        const num = parseInt(clean, 10)
        return isNaN(num) ? '' : num.toLocaleString('en-US')
    }

    let cleanedVal = val;
    if (cleanedVal.includes('.')) {
        cleanedVal = cleanedVal.replace(/,/g, '');
    } else if (cleanedVal.includes(',')) {
        const commaCount = (cleanedVal.match(/,/g) || []).length;
        if (commaCount === 1) {
            const idx = cleanedVal.indexOf(',');
            const afterComma = cleanedVal.substring(idx + 1);
            if (afterComma === '' || afterComma.length === 1 || afterComma.length === 2) {
                cleanedVal = cleanedVal.replace(',', '.');
            } else {
                cleanedVal = cleanedVal.replace(/,/g, '');
            }
        } else {
            cleanedVal = cleanedVal.replace(/,/g, '');
        }
    }

    cleanedVal = cleanedVal.replace(/[^0-9.]/g, '');
    const parts = cleanedVal.split('.');
    const integerPart = parts[0];
    const decimalPart = parts.length > 1 ? parts.slice(1).join('') : null;

    const num = parseInt(integerPart, 10);
    const formattedInt = isNaN(num) ? (integerPart === '' ? '' : '0') : num.toLocaleString('en-US');

    if (decimalPart !== null) {
        return (formattedInt || '0') + '.' + decimalPart.slice(0, 2);
    }
    return formattedInt;
}

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

type ModalMode = 'none' | 'add' | 'edit'

export default function InvoicesPage() {
    const { currency, financeStartDate, language } = useSettings()
    const [loading, setLoading] = useState(true)
    const [invoices, setInvoices] = useState<FinInvoice[]>([])
    const [suppliers, setSuppliers] = useState<Supplier[]>([])
    const [accounts, setAccounts] = useState<FinChartOfAccount[]>([])
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('All')
    const [branchFilter, setBranchFilter] = useState<string>('All')
    const [modalMode, setModalMode] = useState<ModalMode>('none')
    const [editingInvoice, setEditingInvoice] = useState<FinInvoice | null>(null)
    const [saving, setSaving] = useState(false)
    const [unlinkedManualItems, setUnlinkedManualItems] = useState<any[]>([])
    const [linkableCardExpenses, setLinkableCardExpenses] = useState<any[]>([])
    const [linkableCashOuts, setLinkableCashOuts] = useState<any[]>([])
    const [showLinkModal, setShowLinkModal] = useState(false)
    const [showAllPendingVat, setShowAllPendingVat] = useState(false)
    const [showPersonalOption, setShowPersonalOption] = useState(false)
    const [activeTab, setActiveTab] = useState<'invoices' | 'awaiting'>('invoices')

    const [month, setMonth] = useState(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
    
    // Form state
    const [form, setForm] = useState({
        invoice_number: '', invoice_date: new Date().toISOString().split('T')[0],
        due_date: '', supplier_id: '', branch_ids: [] as string[], account_id: '',
        description: '', net_amount: '', vat_rate: '10', vat_amount: '',
        currency: '', notes: '', linked_item_ids: [] as string[], linked_card_ids: [] as string[], linked_cashout_ids: [] as string[],
        is_already_paid: false,
        is_personal_deduction: false,
        custom_supplier_name: ''
    })
    const [showNewSupplier, setShowNewSupplier] = useState(false)
    const [supplierModalQuery, setSupplierModalQuery] = useState('')

    const fetchData = async () => {
        setLoading(true)
        const [yr, mo] = month.split('-').map(Number)
        const start = new Date(yr, mo - 1, 1).toISOString().split('T')[0]
        const end = new Date(yr, mo, 0).toISOString().split('T')[0]

        let manQuery = supabase.from('fin_payment_order_items').select('*, fin_payment_orders!inner(order_number, order_date, status)').eq('item_type', 'manual').is('invoice_id', null).eq('requires_invoice', true).neq('fin_payment_orders.status', 'Cancelled').order('created_at', { ascending: false })
        let cardQuery = supabase.from('fin_corporate_card_expenses').select('*, suppliers(name)').eq('has_vat_invoice', true).eq('is_paid', true).is('invoice_id', null).order('expense_date', { ascending: false })
        let cashoutQuery = supabase.from('cashout').select('id, date, amount, description, category, supplier_id, branch, paid_by').eq('invoice', true).is('invoice_id', null).order('date', { ascending: false })

        if (financeStartDate) {
            manQuery = manQuery.gte('fin_payment_orders.order_date', financeStartDate)
            cardQuery = cardQuery.gte('expense_date', financeStartDate)
            cashoutQuery = cashoutQuery.gte('date', financeStartDate)
        }

        const [invRes, supRes, coaRes, brRes, manRes, cardRes, cashoutRes] = await Promise.all([
            supabase.from('fin_invoices')
                .select('*, suppliers(name), fin_chart_of_accounts(code, name, simplified_name), fin_payment_order_items(id, amount, corporate_card_expense_id, fin_payment_orders(status)), cashout(id, amount), fin_corporate_card_expenses(id, amount)')
                .gte('invoice_date', start).lte('invoice_date', end)
                .order('invoice_date', { ascending: false }),
            supabase.from('suppliers').select('*').order('name'),
            supabase.from('fin_chart_of_accounts').select('*').eq('is_group', false).eq('is_active', true).order('sort_order'),
            supabase.from('provider_branches').select('id, name, is_active').order('name'),
            manQuery,
            cardQuery,
            cashoutQuery,
        ])
        if (invRes.data) setInvoices(invRes.data as any)
        if (supRes.data) setSuppliers(supRes.data as any)
        if (coaRes.data) setAccounts(coaRes.data as any)
        if (brRes.data) setBranches(brRes.data as any)
        if (manRes.data) setUnlinkedManualItems(manRes.data)
        if (cardRes.data) setLinkableCardExpenses(cardRes.data)
        if (cashoutRes.data) setLinkableCashOuts(cashoutRes.data)
        setLoading(false)
    }

    useEffect(() => { fetchData() }, [month, financeStartDate])

    const handleCreateInvoiceFromPending = (item: any, type: 'Payment Order' | 'Card' | 'Cash Out') => {
        resetForm()
        const newForm = {
            invoice_number: '',
            invoice_date: new Date().toISOString().split('T')[0],
            due_date: '',
            supplier_id: item.supplier_id || '',
            branch_ids: [] as string[],
            account_id: item.account_id || '',
            description: item.description || '',
            net_amount: '',
            vat_rate: '10',
            vat_amount: '',
            currency: item.currency || currency || 'VND',
            notes: '',
            linked_item_ids: [] as string[],
            linked_card_ids: [] as string[],
            linked_cashout_ids: [] as string[],
            is_already_paid: true,
            is_personal_deduction: false,
            custom_supplier_name: ''
        }

        if (type === 'Payment Order') {
            newForm.linked_item_ids = [item.id]
            newForm.branch_ids = item.branch_ids || []
        } else if (type === 'Card') {
            newForm.linked_card_ids = [item.id]
            if (item.branch_id) newForm.branch_ids = [item.branch_id]
        } else if (type === 'Cash Out') {
            newForm.linked_cashout_ids = [item.id]
            if (item.branch) {
                const br = branches.find(b => b.id === item.branch || b.name === item.branch)
                if (br) newForm.branch_ids = [br.id]
            }
        }

        const gross = Number(item.amount)
        if (gross > 0) {
            const net = Math.round(gross / 1.1)
            const vat = gross - net
            newForm.net_amount = String(net)
            newForm.vat_amount = String(vat)
        }

        setForm(newForm)
        setEditingInvoice(null)
        setModalMode('add')
    }

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search)
            const tabParam = params.get('tab')
            if (tabParam === 'awaiting') {
                setActiveTab('awaiting')
            }
            
            const action = params.get('action')
            const linkId = params.get('linkId')
            const linkType = params.get('linkType')
            
            if (action === 'create' && linkId && linkType && (unlinkedManualItems.length > 0 || linkableCardExpenses.length > 0 || linkableCashOuts.length > 0)) {
                let targetItem: any = null
                if (linkType === 'Payment Order') {
                    targetItem = unlinkedManualItems.find(i => i.id === linkId)
                } else if (linkType === 'Card') {
                    targetItem = linkableCardExpenses.find(i => i.id === linkId)
                } else if (linkType === 'Cash Out') {
                    targetItem = linkableCashOuts.find(i => i.id === linkId)
                }
                
                if (targetItem) {
                    handleCreateInvoiceFromPending(targetItem, linkType as any)
                    window.history.replaceState({}, '', window.location.pathname + `?tab=awaiting`)
                }
            }
        }
    }, [unlinkedManualItems, linkableCardExpenses, linkableCashOuts])

    const combinedAwaitingItems = useMemo(() => {
        const manItems = unlinkedManualItems.map(item => ({
            id: item.id,
            date: item.fin_payment_orders?.order_date || '',
            description: item.description || '',
            amount: Number(item.amount),
            type: 'Payment Order' as const,
            ref: item.fin_payment_orders?.order_number || '',
            supplier_id: item.supplier_id,
            supplier_name: item.suppliers?.name || '',
            branch_ids: item.branch_ids || [],
            raw: item
        }))

        const cardItems = linkableCardExpenses.map(item => ({
            id: item.id,
            date: item.expense_date || '',
            description: item.description || '',
            amount: Number(item.amount),
            type: 'Card' as const,
            ref: item.frequency || '',
            supplier_id: item.supplier_id,
            supplier_name: item.suppliers?.name || '',
            branch_ids: item.branch_id ? [item.branch_id] : [],
            raw: item
        }))

        const cashoutItems = linkableCashOuts.map(item => {
            let branchIds: string[] = []
            if (item.branch) {
                const br = branches.find(b => b.id === item.branch || b.name === item.branch)
                if (br) branchIds = [br.id]
            }
            return {
                id: item.id,
                date: item.date || '',
                description: item.description || '',
                amount: Number(item.amount),
                type: 'Cash Out' as const,
                ref: 'Cash Out',
                supplier_id: item.supplier_id,
                supplier_name: suppliers.find(s => s.id === item.supplier_id)?.name || '',
                branch_ids: branchIds,
                raw: item
            }
        })

        const all = [...manItems, ...cardItems, ...cashoutItems]
            .filter(item => {
                if (search.trim()) {
                    const q = search.toLowerCase()
                    const matchesSearch = item.description.toLowerCase().includes(q) ||
                        item.supplier_name.toLowerCase().includes(q) ||
                        item.ref.toLowerCase().includes(q)
                    if (!matchesSearch) return false
                }
                if (branchFilter !== 'All') {
                    if (branchFilter === 'General') {
                        if (item.branch_ids.length > 0) return false
                    } else {
                        if (!item.branch_ids.includes(branchFilter)) return false
                    }
                }
                return true
            })
            .sort((a, b) => b.date.localeCompare(a.date))
        return all
    }, [unlinkedManualItems, linkableCardExpenses, linkableCashOuts, search, branchFilter, branches, suppliers])

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
                const supplierName = ((inv as any).suppliers?.name || inv.custom_supplier_name || '').toLowerCase()
                return inv.invoice_number.toLowerCase().includes(q) || supplierName.includes(q) || (inv.description || '').toLowerCase().includes(q)
            }
            return true
        })
    }, [invoices, statusFilter, branchFilter, search])

    const totalFiltered = filtered.reduce((s, i) => s + Number(i.gross_amount || 0), 0)

    const hasAnyBalanceDue = useMemo(() => {
        return filtered.some(inv => {
            if (inv.is_personal_deduction || inv.status === 'Cancelled') return false
            const paidItems = ((inv as any).fin_payment_order_items || []).filter((i: any) => 
                (i.fin_payment_orders?.status === 'Paid' || i.fin_payment_orders?.status === 'Approved') &&
                !i.corporate_card_expense_id
            )
            let paidAmount = paidItems.reduce((sum: number, i: any) => sum + Number(i.amount), 0)
            paidAmount += ((inv as any).cashout || []).reduce((sum: number, i: any) => sum + Number(i.amount), 0)
            paidAmount += ((inv as any).fin_corporate_card_expenses || []).reduce((sum: number, i: any) => sum + Number(i.amount), 0)
            const balanceDue = Math.max(0, Number(inv.gross_amount) - paidAmount)
            return balanceDue > 0
        })
    }, [filtered])

    const isFormInvalid = useMemo(() => {
        const hasNumber = !!form.invoice_number.trim()
        const hasDate = !!form.invoice_date
        const hasNet = !!form.net_amount
        const hasCategory = !!form.account_id
        const hasDesc = !!form.description.trim()
        const hasBranch = form.branch_ids.length >= 1
        const hasSupplier = form.is_personal_deduction 
            ? !!form.custom_supplier_name.trim() 
            : !!form.supplier_id

        return !(hasNumber && hasDate && hasNet && hasCategory && hasDesc && hasBranch && hasSupplier)
    }, [form])

    const resetForm = () => {
        setForm({
            invoice_number: '', invoice_date: new Date().toISOString().split('T')[0],
            due_date: '', supplier_id: '', branch_ids: [], account_id: '',
            description: '', net_amount: '', vat_rate: '10', vat_amount: '',
            currency: '', notes: '', linked_item_ids: [], linked_card_ids: [],
            linked_cashout_ids: [], is_already_paid: false,
            is_personal_deduction: false,
            custom_supplier_name: ''
        })
        setShowNewSupplier(false)
        setShowLinkModal(false)
        setShowAllPendingVat(false)
        setShowPersonalOption(false)
    }

    const openAdd = () => { resetForm(); setForm(f => ({ ...f, currency })); setEditingInvoice(null); setModalMode('add') }

    const openEdit = (inv: FinInvoice) => {
        setEditingInvoice(inv)
        const isVND = (inv.currency || currency) === 'VND'
        const netVal = inv.net_amount || 0
        const vatVal = inv.vat_amount || 0
        const rateVal = inv.vat_rate || 0

        const netStr = isVND 
            ? Math.round(netVal).toLocaleString('en-US') 
            : netVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            
        const vatStr = isVND 
            ? Math.round(vatVal).toLocaleString('en-US') 
            : vatVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            
        const rateStr = String(rateVal)

        setForm({
            invoice_number: inv.invoice_number, invoice_date: inv.invoice_date,
            due_date: inv.due_date || '', supplier_id: inv.supplier_id || '', branch_ids: inv.branch_ids || [],
            account_id: inv.account_id || '', description: inv.description || '',
            net_amount: netStr, vat_rate: rateStr,
            vat_amount: vatStr, currency: inv.currency || currency, notes: inv.notes || '',
            linked_item_ids: [], linked_card_ids: [], linked_cashout_ids: [], // We only link new items, already linked items are not in this list
            is_already_paid: inv.status === 'Paid',
            is_personal_deduction: inv.is_personal_deduction || false,
            custom_supplier_name: inv.custom_supplier_name || ''
        })
        setShowPersonalOption(!!inv.is_personal_deduction)
        setModalMode('edit')
    }

    // Auto-calc VAT
    const handleNetChange = (val: string) => {
        const isVND = (form.currency || currency) === 'VND'
        const formattedNet = formatNumericInput(val, isVND)
        const net = parseFormattedNumber(formattedNet)
        const rate = parseFormattedNumber(form.vat_rate)
        const vat = net * rate / 100
        const formattedVat = isVND 
            ? Math.round(vat).toLocaleString('en-US') 
            : vat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        setForm(f => ({ ...f, net_amount: formattedNet, vat_amount: formattedNet === '' ? '' : formattedVat }))
    }

    const handleVatRateChange = (val: string) => {
        let cleanVal = val.replace(/,/g, '.').replace(/[^0-9.]/g, '');
        const parts = cleanVal.split('.');
        if (parts.length > 1) {
            cleanVal = parts[0] + '.' + parts.slice(1).join('').slice(0, 2);
        }
        const rate = parseFloat(cleanVal) || 0
        const isVND = (form.currency || currency) === 'VND'
        
        setForm(f => {
            const currentNet = parseFormattedNumber(f.net_amount)
            const currentVat = parseFormattedNumber(f.vat_amount)
            
            if (f.linked_item_ids.length > 0 || f.linked_card_ids.length > 0 || f.linked_cashout_ids.length > 0) {
                // Keep gross fixed, recalculate net
                const gross = currentNet + currentVat
                const net = gross / (1 + (rate / 100))
                const vat = gross - net
                
                const formattedNet = isVND 
                    ? Math.round(net).toLocaleString('en-US') 
                    : net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    
                const formattedVat = isVND 
                    ? Math.round(vat).toLocaleString('en-US') 
                    : vat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    
                return {
                    ...f,
                    vat_rate: cleanVal,
                    net_amount: formattedNet,
                    vat_amount: formattedVat
                }
            } else {
                const vat = currentNet * (rate / 100)
                const formattedVat = isVND 
                    ? Math.round(vat).toLocaleString('en-US') 
                    : vat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    
                return {
                    ...f,
                    vat_rate: cleanVal,
                    vat_amount: f.net_amount === '' ? '' : formattedVat
                }
            }
        })
    }

    const handleVatAmountChange = (val: string) => {
        const isVND = (form.currency || currency) === 'VND'
        const formattedVat = formatNumericInput(val, isVND)
        setForm(f => ({ ...f, vat_amount: formattedVat }))
    }

    const handleDoneLinking = async () => {
        setShowLinkModal(false)
        try {
            const selectedManual = unlinkedManualItems.filter(i => form.linked_item_ids.includes(i.id))
            const selectedCard = linkableCardExpenses.filter(i => form.linked_card_ids.includes(i.id))
            const selectedCashOut = linkableCashOuts.filter(i => form.linked_cashout_ids.includes(i.id))
            
            if (selectedManual.length === 0 && selectedCard.length === 0 && selectedCashOut.length === 0) return
            
            let grossTotal = 0
            const categories = new Set<string>()
            const branchIds = new Set<string>()

            let firstCategory: string | null = null
            let firstBranch: string | null = null
            let firstSupplierId: string | null = null

            selectedManual.forEach(i => {
                grossTotal += Number(i.amount || 0)
                if (i.account_id) { categories.add(i.account_id); if (!firstCategory) firstCategory = i.account_id }
                if (i.branch_ids && i.branch_ids.length > 0) { branchIds.add(i.branch_ids[0]); if (!firstBranch) firstBranch = i.branch_ids[0] }
                if (i.supplier_id && !firstSupplierId) firstSupplierId = i.supplier_id
            })
            selectedCard.forEach(i => {
                grossTotal += Number(i.amount || 0)
                if (i.account_id) { categories.add(i.account_id); if (!firstCategory) firstCategory = i.account_id }
                if (i.branch_ids && i.branch_ids.length > 0) { branchIds.add(i.branch_ids[0]); if (!firstBranch) firstBranch = i.branch_ids[0] }
                if (i.supplier_id && !firstSupplierId) firstSupplierId = i.supplier_id
            })

            // Resolve cashout branch name → branch_id and category → CoA account_id
            for (const co of selectedCashOut) {
                grossTotal += Number(co.amount || 0)
                if (co.supplier_id && !firstSupplierId) firstSupplierId = co.supplier_id

                // Resolve branch name to branch_id
                if (co.branch) {
                    const matchedBranch = branches.find(b => b.name === co.branch)
                    if (matchedBranch) {
                        branchIds.add(matchedBranch.id)
                        if (!firstBranch) firstBranch = matchedBranch.id
                    }
                }

                // Resolve cashout category → CoA account_id via mapping table
                if (co.branch && (co as any).category) {
                    const { data: mapping, error: mappingErr } = await supabase
                        .from('fin_cashout_category_mapping')
                        .select('account_id')
                        .eq('branch_name', co.branch)
                        .eq('category_name', (co as any).category)
                        .limit(1)
                        .maybeSingle()
                    
                    if (mappingErr) {
                        console.warn("Could not map cashout category:", mappingErr)
                    } else if (mapping?.account_id) {
                        categories.add(mapping.account_id)
                        if (!firstCategory) firstCategory = mapping.account_id
                    }
                }
            }

            if (categories.size > 1 || branchIds.size > 1) {
                alert(t(language, 'FinInvIncongruenceWarn'))
            }

            setForm(f => {
                const cleanRateStr = String(f.vat_rate || '10').replace(/,/g, '')
                const rate = parseFloat(cleanRateStr) || 0
                const isVND = (f.currency || currency) === 'VND'
                const net = grossTotal / (1 + (rate / 100))
                const vat = grossTotal - net
                
                const netStr = isVND 
                    ? Math.round(net).toLocaleString('en-US') 
                    : net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    
                const vatStr = isVND 
                    ? Math.round(vat).toLocaleString('en-US') 
                    : vat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    
                return {
                    ...f,
                    net_amount: netStr,
                    vat_amount: vatStr,
                    account_id: firstCategory || f.account_id,
                    branch_ids: firstBranch ? [firstBranch] : f.branch_ids,
                    supplier_id: f.supplier_id || firstSupplierId || ''
                }
            })
        } catch (err: any) {
            console.error("Error in handleDoneLinking:", err)
            alert("Error: " + err.message)
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isFormInvalid) {
            alert(t(language, 'PleaseFillRequired')); return
        }
        setSaving(true)
        try {
            let supplierId = form.is_personal_deduction ? null : (form.supplier_id || null)
            let customSupplierName = form.is_personal_deduction
                ? form.custom_supplier_name
                : (suppliers.find(s => s.id === form.supplier_id)?.name || null)

            const payload = {
                invoice_number: form.invoice_number,
                invoice_date: form.invoice_date,
                due_date: form.due_date || null,
                supplier_id: supplierId,
                custom_supplier_name: customSupplierName,
                is_personal_deduction: form.is_personal_deduction,
                branch_ids: form.branch_ids.length > 0 ? form.branch_ids : null,
                account_id: form.account_id || null,
                description: form.description || null,
                net_amount: parseFormattedNumber(form.net_amount),
                vat_rate: parseFormattedNumber(form.vat_rate),
                vat_amount: parseFormattedNumber(form.vat_amount),
                currency: form.currency || currency,
                notes: form.notes || null,
                status: form.is_personal_deduction ? 'Paid' : (form.is_already_paid ? 'Paid' : 'Pending'),
            }

            let savedInvId = editingInvoice?.id;
            if (modalMode === 'edit' && editingInvoice) {
                const { error } = await supabase.from('fin_invoices').update(payload).eq('id', editingInvoice.id)
                if (error) throw error
            } else {
                const { data: newInv, error } = await supabase.from('fin_invoices').insert(payload).select().single()
                if (error) throw error
                savedInvId = newInv.id;
            }

            // Link manual items
            if (savedInvId && form.linked_item_ids.length > 0) {
                const { error: linkErr } = await supabase.from('fin_payment_order_items')
                    .update({ invoice_id: savedInvId, item_type: 'invoice' })
                    .in('id', form.linked_item_ids)
                if (linkErr) throw linkErr
            }

            // Link corporate card expenses
            if (savedInvId && form.linked_card_ids.length > 0) {
                const { error: cardLinkErr } = await supabase.from('fin_corporate_card_expenses')
                    .update({ invoice_id: savedInvId })
                    .in('id', form.linked_card_ids)
                if (cardLinkErr) throw cardLinkErr
            }

            // Link cash outs
            if (savedInvId && form.linked_cashout_ids.length > 0) {
                const { error: cashoutLinkErr } = await supabase.from('cashout')
                    .update({ invoice_id: savedInvId })
                    .in('id', form.linked_cashout_ids)
                if (cashoutLinkErr) throw cashoutLinkErr
            }

            setModalMode('none')
            fetchData()
        } catch (err: any) {
            console.error(err)
            alert(t(language, 'SaveFailed') + ': ' + err.message)
        }
        setSaving(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm(t(language, 'FinInvDeleteConfirm'))) return
        await supabase.from('fin_invoices').delete().eq('id', id)
        fetchData()
    }

    const statuses = ['All', 'Pending', 'In Payment', 'Paid', 'Overdue', 'Cancelled']

    const translateStatus = (status: string) => {
        switch (status) {
            case 'Pending': return t(language, 'FinInvStatusPending')
            case 'In Payment': return t(language, 'FinInvStatusInPayment')
            case 'Paid': return t(language, 'FinInvStatusPaid')
            case 'Overdue': return t(language, 'FinInvStatusOverdue')
            case 'Cancelled': return t(language, 'FinInvStatusCancelled')
            case 'All': return t(language, 'All')
            default: return status
        }
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'FinInvTitle')}</h1>
                    <p className="text-slate-500 mt-1">{t(language, 'FinInvSubtitle')}</p>
                </div>
                <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2">
                    <Plus className="w-4 h-4" /> {t(language, 'FinInvNewInvoice')}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-6 border-b border-slate-200 mb-6">
                <button
                    type="button"
                    onClick={() => setActiveTab('invoices')}
                    className={`pb-3 px-1 text-sm font-bold transition-all border-b-2 ${
                        activeTab === 'invoices' 
                            ? 'border-blue-600 text-blue-700' 
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    {t(language, 'FinInvTitle')}
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('awaiting')}
                    className={`pb-3 px-1 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${
                        activeTab === 'awaiting' 
                            ? 'border-blue-600 text-blue-700' 
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    {t(language, 'PaymentsAwaitingInvoice')}
                    {(unlinkedManualItems.length + linkableCardExpenses.length + linkableCashOuts.length) > 0 && (
                        <span className={`py-0.5 px-2 rounded-full text-xs font-bold ${activeTab === 'awaiting' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                            {unlinkedManualItems.length + linkableCardExpenses.length + linkableCashOuts.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder={t(language, 'FinInvSearchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 shadow-sm" />
                </div>
                {activeTab === 'invoices' && (
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                        className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        {statuses.map(s => <option key={s} value={s}>{translateStatus(s)}</option>)}
                    </select>
                )}
                <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    <option value="All">{t(language, 'FinInvAllBranches')}</option>
                    <option value="General">{t(language, 'FinInvGeneralCompany')}</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
            </div>

            {/* Month Navigation */}
            {activeTab === 'invoices' ? (
                    <MonthPicker
                        value={month}
                        onChange={setMonth}
                        language={language}
                        colorClass="text-blue-600 hover:text-blue-800"
                    />
            ) : (
                <div className="flex items-center justify-between mb-4">
                    <span className="text-slate-500 text-sm font-semibold">{t(language, 'FinCFStatutory')} ({t(language, 'AllTime') || 'All Time'})</span>
                </div>
            )}

            {/* Summary bar */}
            <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-3 mb-4 shadow-sm">
                {activeTab === 'invoices' ? (
                    <>
                        <span className="text-sm text-slate-600">{filtered.length} {filtered.length === 1 ? t(language, 'FinPayInvoiceSingular') : t(language, 'FinPayInvoicePlural')}</span>
                        <span className="text-sm font-bold text-slate-900 tabular-nums">{t(language, 'FinPayTotal')}: {currency} {fmt(totalFiltered, currency === 'VND')}</span>
                    </>
                ) : (
                    <>
                        <span className="text-sm text-slate-600">{combinedAwaitingItems.length} {t(language, 'FinPayTitle')}</span>
                        <span className="text-sm font-bold text-slate-900 tabular-nums">
                            {t(language, 'FinPayTotal')}: {currency} {fmt(combinedAwaitingItems.reduce((s, i) => s + i.amount, 0), currency === 'VND')}
                        </span>
                    </>
                )}
            </div>

            {/* Table */}
            {activeTab === 'invoices' ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                    <table className="w-full table-auto text-sm text-gray-900 text-left border-collapse">
                        <thead>
                            <tr className="text-gray-500 font-semibold border-b border-slate-100 bg-slate-50/50">
                                <th className="p-3 whitespace-nowrap">{t(language, 'FinInvInvoiceNo')}</th>
                                <th className="p-3 whitespace-nowrap">{t(language, 'FinInvDate')}</th>
                                <th className="p-3 whitespace-nowrap">{t(language, 'FinInvSupplier')}</th>
                                <th className="p-3 whitespace-nowrap">{t(language, 'FinInvBranch')}</th>
                                <th className="p-3 whitespace-nowrap">{t(language, 'FinInvCategory')}</th>
                                <th className="p-3 whitespace-nowrap text-right">{t(language, 'FinInvNet')}</th>
                                <th className="p-3 whitespace-nowrap text-right">{t(language, 'FinInvVat')}</th>
                                <th className="p-3 whitespace-nowrap text-right">{t(language, 'FinInvGross')}</th>
                                {hasAnyBalanceDue && <th className="p-3 whitespace-nowrap text-right">{t(language, 'FinInvBalance')}</th>}
                                <th className="p-3 whitespace-nowrap">{t(language, 'FinInvStatus')}</th>
                                <th className="p-3 whitespace-nowrap text-right">{t(language, 'FinInvActions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={hasAnyBalanceDue ? 11 : 10} className="p-8 text-center"><CircularLoader /></td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={hasAnyBalanceDue ? 11 : 10} className="p-8 text-center text-gray-500">{t(language, 'FinInvNoInvoices')}</td></tr>
                            ) : filtered.map(inv => {
                                const paidItems = ((inv as any).fin_payment_order_items || []).filter((i: any) => 
                                    (i.fin_payment_orders?.status === 'Paid' || i.fin_payment_orders?.status === 'Approved') &&
                                    !i.corporate_card_expense_id
                                )
                                let paidAmount = paidItems.reduce((sum: number, i: any) => sum + Number(i.amount), 0)
                                paidAmount += ((inv as any).cashout || []).reduce((sum: number, i: any) => sum + Number(i.amount), 0)
                                paidAmount += ((inv as any).fin_corporate_card_expenses || []).reduce((sum: number, i: any) => sum + Number(i.amount), 0)
                                
                                const balanceDue = (inv.is_personal_deduction || inv.status === 'Cancelled') ? 0 : Math.max(0, Number(inv.gross_amount) - paidAmount)
                                const displayStatus = (inv.is_personal_deduction || balanceDue <= 0 || inv.status === 'Paid') ? 'Paid' : inv.status;
                                const sty = INVOICE_STATUS_STYLES[displayStatus] || INVOICE_STATUS_STYLES['Pending']
                                const today = new Date().toISOString().split('T')[0]
                                const isOverdue = displayStatus === 'Pending' && inv.due_date && inv.due_date < today
                                return (
                                    <tr key={inv.id} className={`border-t border-slate-100 align-top hover:bg-blue-50/30 transition ${isOverdue ? 'bg-red-50/30' : ''}`}>
                                        <td className="p-3 text-slate-800">
                                            <div className="font-semibold">{inv.invoice_number}</div>
                                            {inv.is_personal_deduction && (
                                                <div className="text-[10px] text-amber-600 font-semibold mt-0.5 whitespace-nowrap">
                                                    {t(language, 'FinInvPersonalExpense')}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3 text-slate-600 whitespace-nowrap">{new Date(inv.invoice_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                                        <td className="p-3 text-slate-700 font-medium">
                                            {inv.is_personal_deduction ? inv.custom_supplier_name : ((inv as any).suppliers?.name || inv.custom_supplier_name || '—')}
                                        </td>
                                        <td className="p-3 text-slate-600 whitespace-nowrap">
                                            <div className="flex flex-row items-center gap-1 overflow-hidden">
                                                {(!inv.branch_ids || inv.branch_ids.length === 0) ? (
                                                    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 whitespace-nowrap">
                                                        {t(language, 'FinInvGeneral')}
                                                    </span>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1">
                                                        {inv.branch_ids.map(id => {
                                                            const br = branches.find(b => b.id === id);
                                                            if (!br) return null;
                                                            const col = getBranchColor(id, branches);
                                                            return (
                                                                <span key={id} className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${col.bg} ${col.text} whitespace-nowrap`}>
                                                                    {br.name}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            {(inv as any).fin_chart_of_accounts ? (
                                                <span className="text-sm font-medium text-slate-800">
                                                    {language === 'vi' 
                                                        ? ((inv as any).fin_chart_of_accounts.simplified_name || (inv as any).fin_chart_of_accounts.name)
                                                        : (inv as any).fin_chart_of_accounts.name}
                                                </span>
                                            ) : <span className="text-slate-400">—</span>}
                                        </td>
                                        <td className="p-3 text-right tabular-nums">{fmt(Number(inv.net_amount), (inv.currency || currency) === 'VND')}</td>
                                        <td className="p-3 text-right tabular-nums text-slate-500">{fmt(Number(inv.vat_amount), (inv.currency || currency) === 'VND')}</td>
                                        <td className="p-3 text-right tabular-nums font-bold text-slate-900">{fmt(Number(inv.gross_amount), (inv.currency || currency) === 'VND')}</td>
                                        {hasAnyBalanceDue && (
                                            <td className="p-3 text-right tabular-nums font-bold text-amber-600">{balanceDue <= 0 ? <span className="text-emerald-600">0</span> : fmt(balanceDue, (inv.currency || currency) === 'VND')}</td>
                                        )}
                                        <td className="p-3 whitespace-nowrap">
                                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isOverdue ? 'bg-red-100 text-red-700' : `${sty.bg} ${sty.text}`}`}>
                                                {isOverdue ? t(language, 'FinInvStatusOverdue') : translateStatus(displayStatus)}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button onClick={() => openEdit(inv)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition" title={t(language, 'Edit')}>
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDelete(inv.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-red-600 transition" title={t(language, 'Delete')}>
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
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                    <table className="w-full table-auto text-sm text-gray-900 text-left border-collapse">
                        <thead>
                            <tr className="text-gray-500 font-semibold border-b border-slate-100 bg-slate-50/50">
                                <th className="p-3 whitespace-nowrap">{t(language, 'FinInvDate')}</th>
                                <th className="p-3 whitespace-nowrap">{t(language, 'FinInvDescription')}</th>
                                <th className="p-3 whitespace-nowrap">{t(language, 'FinInvSupplier')}</th>
                                <th className="p-3 whitespace-nowrap">{t(language, 'FinInvBranch')}</th>
                                <th className="p-3 whitespace-nowrap">{language === 'vi' ? 'Phương thức' : 'Method / Ref'}</th>
                                <th className="p-3 whitespace-nowrap text-right">{language === 'vi' ? 'Số tiền' : 'Amount'}</th>
                                <th className="p-3 whitespace-nowrap text-right">{t(language, 'FinInvActions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7} className="p-8 text-center"><CircularLoader /></td></tr>
                            ) : combinedAwaitingItems.length === 0 ? (
                                <tr><td colSpan={7} className="p-8 text-center text-gray-500">{t(language, 'FinInvNoUnlinkedPayments')}</td></tr>
                            ) : combinedAwaitingItems.map(item => {
                                return (
                                    <tr key={item.id} className="border-t border-slate-100 align-middle hover:bg-blue-50/30 transition">
                                        <td className="p-3 text-slate-600 whitespace-nowrap">
                                            {new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                        </td>
                                        <td className="p-3 text-slate-800 font-semibold">
                                            {item.description || t(language, 'NoDescription')}
                                        </td>
                                        <td className="p-3 text-slate-700 font-medium">
                                            {item.supplier_name || '—'}
                                        </td>
                                        <td className="p-3 text-slate-600 whitespace-nowrap">
                                            <div className="flex flex-row items-center gap-1 overflow-hidden">
                                                {(item.branch_ids.length === 0 || item.branch_ids.length === branches.length) ? (
                                                    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 whitespace-nowrap">
                                                        {t(language, 'FinInvGeneral')}
                                                    </span>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1">
                                                        {item.branch_ids.map((id: string) => {
                                                            const br = branches.find(b => b.id === id);
                                                            if (!br) return null;
                                                            const col = getBranchColor(id, branches);
                                                            return (
                                                                <span key={id} className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${col.bg} ${col.text} whitespace-nowrap`}>
                                                                    {br.name}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            <div className="flex flex-col items-start gap-1">
                                                <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider whitespace-nowrap ${
                                                    item.type === 'Payment Order' 
                                                        ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                                        : item.type === 'Card'
                                                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                            : 'bg-orange-50 text-orange-700 border-orange-200'
                                                }`}>
                                                    {item.type === 'Payment Order' 
                                                        ? t(language, 'FinDsbPaymentOrder') 
                                                        : item.type === 'Card' 
                                                            ? t(language, 'FinInvCard') 
                                                            : t(language, 'CashOut')}
                                                </span>
                                                {item.type === 'Payment Order' && item.ref && (
                                                    <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">({item.ref})</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-3 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                                            {fmt(item.amount, (item.type === 'Cash Out' || (item.raw.currency || currency) === 'VND'))} {item.raw.currency || (item.type === 'Cash Out' ? 'VND' : currency)}
                                        </td>
                                        <td className="p-3 text-right">
                                            <button
                                                onClick={() => handleCreateInvoiceFromPending(item.raw, item.type)}
                                                className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm animate-in fade-in duration-200"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                {language === 'vi' ? 'Tạo Hóa Đơn' : 'Create Invoice'}
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Add/Edit Modal */}
            {modalMode !== 'none' && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-blue-500" />
                                {modalMode === 'edit' ? t(language, 'FinInvEditInvoice') : t(language, 'FinInvNewInvoice')}
                            </h2>
                            <button onClick={() => setModalMode('none')} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* General Details Header and Collapsible Personal Trigger */}
                                <div className="col-span-1 md:col-span-2 flex justify-between items-center border-b border-slate-100 pb-2">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t(language, 'FinInvGeneralDetails')}</span>
                                    <button
                                        type="button"
                                        onClick={() => setShowPersonalOption(!showPersonalOption)}
                                        className={`text-xs font-bold transition flex items-center gap-1 select-none ${
                                            form.is_personal_deduction ? 'text-amber-600 hover:text-amber-700' : 'text-slate-500 hover:text-blue-600'
                                        }`}
                                    >
                                        <span>{t(language, 'FinInvAdvancedSettings')}</span>
                                        {form.is_personal_deduction && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block mr-0.5" />}
                                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showPersonalOption ? 'rotate-180' : ''}`} />
                                    </button>
                                </div>

                                {/* Row 1: Invoice Number */}
                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinInvInvoiceNumberStar')}</label>
                                    <input required value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white shadow-sm" />
                                </div>

                                {/* Row 1.5: Personal Expense Toggle (Collapsible) */}
                                {showPersonalOption && (
                                    <div className="col-span-1 md:col-span-2">
                                        <div className="flex items-center gap-3 bg-amber-50/50 p-3 rounded-xl border border-amber-200/50 shadow-sm transition-all">
                                            <div
                                                onClick={() => setForm(f => {
                                                    const nextVal = !f.is_personal_deduction;
                                                    return { 
                                                        ...f, 
                                                        is_personal_deduction: nextVal,
                                                        is_already_paid: nextVal ? true : f.is_already_paid
                                                    };
                                                })}
                                                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${form.is_personal_deduction ? 'bg-amber-600' : 'bg-slate-300'}`}
                                            >
                                                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${form.is_personal_deduction ? 'translate-x-5' : 'translate-x-0'}`} />
                                            </div>
                                            <div>
                                                <span className="text-sm font-semibold text-slate-800 block">{t(language, 'FinInvPersonalExpenseDeduction')}</span>
                                                <span className="text-xs text-slate-500">{t(language, 'FinInvPersonalExpenseDesc')}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Row 2: Supplier */}
                                <div className="col-span-1 md:col-span-2">
                                    {form.is_personal_deduction ? (
                                        <>
                                            <label className="text-sm font-semibold text-slate-700 block mb-1">{t(language, 'FinInvSupplierNameStar')}</label>
                                            <input 
                                                required 
                                                placeholder={t(language, 'FinInvCustomSupplierPlaceholder')}
                                                value={form.custom_supplier_name} 
                                                onChange={e => setForm(f => ({ ...f, custom_supplier_name: e.target.value }))}
                                                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white shadow-sm" 
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <label className="text-sm font-semibold text-slate-700 block mb-1">{t(language, 'FinInvSupplierStar')}</label>
                                            <SupplierCombobox
                                                suppliers={suppliers}
                                                selectedId={form.supplier_id || null}
                                                onChange={(id) => setForm({ ...form, supplier_id: id || '' })}
                                                onAddNew={(query) => {
                                                    setSupplierModalQuery(query)
                                                    setShowNewSupplier(true)
                                                 }}
                                                placeholder={t(language, 'FinInvSelectSupplier')}
                                            />
                                        </>
                                    )}
                                </div>

                                {/* Row 3: Link Prior Payments */}
                                {!form.is_personal_deduction && (
                                    <div className="col-span-1 md:col-span-2">
                                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    onClick={() => setForm(f => ({ ...f, is_already_paid: !f.is_already_paid }))}
                                                    className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${form.is_already_paid ? 'bg-blue-600' : 'bg-slate-300'}`}
                                                >
                                                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${form.is_already_paid ? 'translate-x-5' : 'translate-x-0'}`} />
                                                </div>
                                                <span className="text-sm font-semibold text-slate-800">{form.is_already_paid ? t(language, 'FinInvPaid') : t(language, 'FinInvUnpaid')}</span>
                                            </div>
                                            
                                            {form.is_already_paid && (
                                                <button type="button" onClick={() => { setShowLinkModal(true); setShowAllPendingVat(false); }} className="px-3 py-1.5 text-sm font-semibold bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 text-slate-700 transition flex items-center gap-2">
                                                    {t(language, 'FinInvLinkPriorPayments')}
                                                    {(form.linked_item_ids.length + form.linked_card_ids.length + form.linked_cashout_ids.length) > 0 && <span className="bg-blue-100 text-blue-700 py-0.5 px-2 rounded-full text-xs font-bold">{form.linked_item_ids.length + form.linked_card_ids.length + form.linked_cashout_ids.length}</span>}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Row 4: Dates */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinInvInvoiceDateStar')}</label>
                                    <input type="date" required value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white shadow-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinInvDueDate')}</label>
                                    <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                                        disabled={form.is_already_paid || form.is_personal_deduction}
                                        className={`w-full border rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm ${(form.is_already_paid || form.is_personal_deduction) ? 'bg-slate-100 border-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white border-slate-200'}`} />
                                </div>

                                {/* Row 4: Branch Allocation */}
                                <div className="col-span-1 md:col-span-2">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm font-semibold text-slate-700">
                                            {t(language, 'FinInvBranchAllocation')} <span className="text-red-500">*</span>
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <button type="button" onClick={() => setForm(f => ({ ...f, branch_ids: branches.filter(b => (b as any).is_active !== false).map(b => b.id) }))} className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline transition">
                                                {t(language, 'FinInvSelectAll')}
                                            </button>
                                            <button type="button" onClick={() => setForm(f => ({ ...f, branch_ids: [] }))} className="text-xs font-bold text-slate-500 hover:text-slate-700 hover:underline transition">
                                                {t(language, 'FinInvClear')}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 items-center bg-slate-50/50 p-3 rounded-xl border border-slate-200">
                                        {branches.filter(b => (b as any).is_active !== false || form.branch_ids.includes(b.id)).map(b => (
                                            <button
                                                type="button"
                                                key={b.id}
                                                onClick={() => {
                                                    setForm(f => {
                                                        const newIds = f.branch_ids.includes(b.id)
                                                            ? f.branch_ids.filter(id => id !== b.id)
                                                            : [...f.branch_ids, b.id]
                                                        return { ...f, branch_ids: newIds }
                                                    })
                                                }}
                                                className={`px-4 py-2 rounded-full text-xs font-semibold border shadow-sm transition-all select-none ${form.branch_ids.includes(b.id) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'}`}
                                            >
                                                {b.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Row 5: Category */}
                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                                        {t(language, 'FinInvCategoryCoa')} <span className="text-red-500">*</span>
                                    </label>
                                    <COACombobox
                                        coas={accounts}
                                        value={form.account_id || null}
                                        onChange={(id) => setForm(f => ({ ...f, account_id: id }))}
                                        placeholder={t(language, 'FinInvSelectCategory')}
                                    />
                                </div>

                                {/* Row 6: Description */}
                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                                        {t(language, 'FinInvDescription')} <span className="text-red-500">*</span>
                                    </label>
                                    <input required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white shadow-sm" />
                                </div>

                                {/* Row 5: Amounts */}
                                <div className="col-span-1 md:col-span-2 bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3 mt-2">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">{t(language, 'FinInvNetAmountStar')}</label>
                                            <input type="text" inputMode="decimal" required value={form.net_amount} onChange={e => handleNetChange(e.target.value)}
                                                className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white text-sm tabular-nums shadow-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">{t(language, 'FinInvVatRatePct')}</label>
                                            <input type="number" step="any" value={form.vat_rate} onChange={e => handleVatRateChange(e.target.value)}
                                                className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white text-sm tabular-nums shadow-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">{t(language, 'FinInvVatAmount')}</label>
                                            <input type="text" inputMode="decimal" value={form.vat_amount} onChange={e => handleVatAmountChange(e.target.value)}
                                                className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white text-sm tabular-nums shadow-sm" />
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                                        <span className="text-sm font-bold text-slate-700">{t(language, 'FinInvGrossTotal')}</span>
                                        <span className="text-xl font-black text-slate-900 tabular-nums">
                                            {currency} {fmt(parseFormattedNumber(form.net_amount) + parseFormattedNumber(form.vat_amount), (form.currency || currency) === 'VND')}
                                        </span>
                                    </div>
                                </div>



                                {/* Row 7: Extras */}
                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinInvNotes')}</label>
                                    <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white shadow-sm" />
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end pt-4 mt-4 border-t border-slate-100">
                                <button type="button" onClick={() => setModalMode('none')} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition">{t(language, 'Cancel')}</button>
                                <button type="submit" disabled={saving || isFormInvalid}
                                    className="px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl transition shadow-md flex items-center gap-2">
                                    {saving ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FileText className="w-4 h-4" />}
                                    {modalMode === 'edit' ? t(language, 'FinInvUpdateInvoice') : t(language, 'FinInvCreateInvoice')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Link Payments Modal */}
            {showLinkModal && (
                <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">{t(language, 'FinInvLinkPriorPayments')}</h2>
                                <p className="text-xs text-slate-500 mt-1">{t(language, 'FinInvLinkPriorPaymentsDesc')}</p>
                            </div>
                            <button type="button" onClick={() => setShowLinkModal(false)} className="p-1.5 text-slate-400 hover:bg-slate-200 rounded-lg transition"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-4 overflow-y-auto">
                            {(!form.supplier_id && !showAllPendingVat) ? (
                                <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                                    <div className="text-sm text-slate-500 italic mb-3">{t(language, 'FinInvSelectSupplierFirst')}</div>
                                    <button type="button" onClick={() => setShowAllPendingVat(true)} className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline transition">
                                        {t(language, 'FinInvShowAllPendingVat')}
                                    </button>
                                </div>
                            ) : (() => {
                                const filteredManual = unlinkedManualItems.filter(item => showAllPendingVat || item.supplier_id === form.supplier_id)
                                const filteredCard = linkableCardExpenses.filter(item => showAllPendingVat || item.supplier_id === form.supplier_id)
                                const filteredCashOuts = linkableCashOuts.filter(item => showAllPendingVat || item.supplier_id === form.supplier_id)
                                if (filteredManual.length === 0 && filteredCard.length === 0 && filteredCashOuts.length === 0) {
                                    return <div className="text-center py-8 text-sm text-slate-500 italic bg-slate-50 border border-dashed border-slate-200 rounded-xl">{t(language, 'FinInvNoUnlinkedPayments')}</div>
                                }
                                return (
                                    <div className="space-y-4">
                                        {filteredManual.length > 0 && (
                                            <div>
                                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t(language, 'FinPayTitle')}</div>
                                                <div className="space-y-2">
                                                    {filteredManual.map(item => (
                                                        <label key={item.id} className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl border transition ${form.linked_item_ids.includes(item.id) ? 'border-blue-400 bg-blue-50/50 shadow-sm' : 'border-slate-200 hover:border-blue-200 bg-white shadow-sm'}`}>
                                                            <input type="checkbox" checked={form.linked_item_ids.includes(item.id)} onChange={e => {
                                                                setForm(f => ({ ...f, linked_item_ids: e.target.checked ? [...f.linked_item_ids, item.id] : f.linked_item_ids.filter(id => id !== item.id) }))
                                                            }} className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                                            <div className="flex-1 min-w-0">
                                                                 <div className="text-sm font-semibold text-slate-800 truncate">{item.description || t(language, 'NoDescription')}</div>
                                                                 <div className="text-xs text-slate-500 truncate">{item.fin_payment_orders?.order_number} • {new Date(item.fin_payment_orders?.order_date).toLocaleDateString('en-GB')}</div>
                                                            </div>
                                                            <div className="text-sm font-black text-slate-900 tabular-nums">{fmt(Number(item.amount), currency === 'VND')} {currency}</div>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {filteredCard.length > 0 && (
                                            <div>
                                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t(language, 'FinInvCard')}</div>
                                                <div className="space-y-2">
                                                    {filteredCard.map(item => (
                                                        <label key={item.id} className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl border transition ${form.linked_card_ids.includes(item.id) ? 'border-emerald-400 bg-emerald-50/50 shadow-sm' : 'border-slate-200 hover:border-emerald-200 bg-white shadow-sm'}`}>
                                                            <input type="checkbox" checked={form.linked_card_ids.includes(item.id)} onChange={e => {
                                                                setForm(f => ({ ...f, linked_card_ids: e.target.checked ? [...f.linked_card_ids, item.id] : f.linked_card_ids.filter(id => id !== item.id) }))
                                                            }} className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-sm font-semibold text-slate-800 truncate">{item.description}</div>
                                                                <div className="text-xs text-slate-500">{new Date(item.expense_date).toLocaleDateString('en-GB')} • {item.frequency}</div>
                                                            </div>
                                                            <div className="text-sm font-black text-slate-900 tabular-nums">{fmt(Number(item.amount), (item.currency || currency) === 'VND')} {item.currency}</div>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {filteredCashOuts.length > 0 && (
                                            <div>
                                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t(language, 'CashOut')}</div>
                                                <div className="space-y-2">
                                                    {filteredCashOuts.map(item => (
                                                        <label key={item.id} className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl border transition ${form.linked_cashout_ids.includes(item.id) ? 'border-amber-400 bg-amber-50/50 shadow-sm' : 'border-slate-200 hover:border-amber-200 bg-white shadow-sm'}`}>
                                                            <input type="checkbox" checked={form.linked_cashout_ids.includes(item.id)} onChange={e => {
                                                                setForm(f => ({ ...f, linked_cashout_ids: e.target.checked ? [...f.linked_cashout_ids, item.id] : f.linked_cashout_ids.filter(id => id !== item.id) }))
                                                            }} className="w-5 h-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-sm font-semibold text-slate-800 truncate">{item.description || t(language, 'CashOut')}</div>
                                                                <div className="text-xs text-slate-500">{new Date(item.date).toLocaleDateString('en-GB')} • {item.branch || t(language, 'FinInvUnknownBranch')} • {item.paid_by || t(language, 'FinInvUnknownUser')}</div>
                                                            </div>
                                                            <div className="text-sm font-black text-slate-900 tabular-nums">{fmt(Number(item.amount), true)} VND</div>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })()}
                        </div>
                        <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50">
                            <span className="text-sm font-medium text-slate-600">{form.linked_item_ids.length + form.linked_card_ids.length + form.linked_cashout_ids.length} {t(language, 'FinInvSelectedSuffix')}</span>
                            <button type="button" onClick={handleDoneLinking} className="px-6 py-2.5 text-sm font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-md transition">{t(language, 'FinInvDone')}</button>
                        </div>
                    </div>
                </div>
            )}
            <AddSupplierModal
                isOpen={showNewSupplier}
                onClose={() => setShowNewSupplier(false)}
                initialName={supplierModalQuery}
                onSaved={(newSup) => {
                    setSuppliers(prev => [...prev, newSup].sort((a, b) => a.name.localeCompare(b.name)))
                    setForm({ ...form, supplier_id: newSup.id })
                    setShowNewSupplier(false)
                }}
            />
        </div>
    )
}
