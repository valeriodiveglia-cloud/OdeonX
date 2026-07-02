'use client'

import React, { useEffect, useState, useMemo, Fragment } from 'react'
import { CreditCard, Plus, PlusCircle, X, CheckCircle2, Clock, FileText, Eye, ChevronDown, ChevronLeft, ChevronRight, Trash2, Search, Briefcase, Pencil, ArrowLeftRight, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
import CircularLoader from '@/components/CircularLoader'
import type { FinPaymentOrder, FinInvoice, FinBankAccount, FinChartOfAccount } from '@/types/finance'
import { PAYMENT_ORDER_STATUS_STYLES } from '@/types/finance'

type ManualItem = { id: string; description: string; amount: number; amountStr?: string; account_id: string; branch_ids: string[]; requires_invoice: boolean; supplier_id?: string | null; corporate_card_expense_id?: string | null }

import { SupplierCombobox, AddSupplierModal } from '../components/SupplierComponents'
import { COACombobox } from '../components/COACombobox'

function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function toLocalDateStr(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

export default function PaymentOrdersPage() {
    const { currency, language } = useSettings()
    const [loading, setLoading] = useState(true)
    const [orders, setOrders] = useState<FinPaymentOrder[]>([])
    const [pendingInvoices, setPendingInvoices] = useState<FinInvoice[]>([])
    const [bankAccounts, setBankAccounts] = useState<FinBankAccount[]>([])
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('All')
    const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
    const [globalPendingCount, setGlobalPendingCount] = useState(0)

    const translateStatus = (status: string) => {
        switch (status) {
            case 'Draft': return t(language, 'FinPayStatusDraft')
            case 'Pending Review': return t(language, 'FinPayStatusPendingReview')
            case 'Approved': return t(language, 'FinPayStatusApproved')
            case 'Paid': return t(language, 'FinPayStatusPaid')
            case 'Cancelled': return t(language, 'FinPayStatusCancelled')
            case 'All': return language === 'vi' ? 'Tất cả' : 'All'
            default: return status
        }
    }

    // Modals
    const [showCreate, setShowCreate] = useState(false)
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
    const [createAccountId, setCreateAccountId] = useState('')
    const [vatInvoiceStatus, setVatInvoiceStatus] = useState<'Issued' | 'Pending' | 'None'>('None')
    const [createTab, setCreateTab] = useState<'invoices' | 'manual' | 'transfer'>('invoices')
    const [transferDestinationAccountId, setTransferDestinationAccountId] = useState('')
    const [transferAmount, setTransferAmount] = useState(0)
    const [transferAmountStr, setTransferAmountStr] = useState('')
    const [transferDescription, setTransferDescription] = useState('')
    const [hasTransferFee, setHasTransferFee] = useState(false)
    const [transferFeeAmount, setTransferFeeAmount] = useState(0)
    const [transferFeeAmountStr, setTransferFeeAmountStr] = useState('')
    const [showDetail, setShowDetail] = useState<FinPaymentOrder | null>(null)
    const [showMarkPaid, setShowMarkPaid] = useState<FinPaymentOrder | null>(null)
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())
    const [manualItems, setManualItems] = useState<ManualItem[]>([])
    const [coaAccounts, setCoaAccounts] = useState<FinChartOfAccount[]>([])
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
    const [saving, setSaving] = useState(false)
    const [supplierModalForId, setSupplierModalForId] = useState<string | null>(null)
    const [supplierModalQuery, setSupplierModalQuery] = useState('')
    const [invoiceSearch, setInvoiceSearch] = useState('')
    const [showOnlySelectedInvoices, setShowOnlySelectedInvoices] = useState(false)


    // Mark paid form
    const [paidDate, setPaidDate] = useState(() => toLocalDateStr(new Date()))
    const [paidMethod, setPaidMethod] = useState('Bank Transfer')
    const [paidAccountId, setPaidAccountId] = useState('')
    const [paidNotes, setPaidNotes] = useState('')
    const [paidFinalAmountVND, setPaidFinalAmountVND] = useState(0)
    const [paidFinalAmountVNDStr, setPaidFinalAmountVNDStr] = useState('')
    const [paidFeeVND, setPaidFeeVND] = useState(0)
    const [paidFeeVNDStr, setPaidFeeVNDStr] = useState('')
    const [itemFees, setItemFees] = useState<Record<string, number>>({})
    const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
    const [showFeeBreakdown, setShowFeeBreakdown] = useState(false)

    const fetchData = async () => {
        setLoading(true)
        try { await supabase.rpc('fin_auto_generate_card_pos'); } catch (e) { console.warn('Auto-gen failed', e); }
        
        const startStr = toLocalDateStr(monthCursor)
        const endStr = toLocalDateStr(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0))

        const [ordRes, invRes, accRes, coaRes, brRes, supRes, globalPendingRes] = await Promise.all([
            supabase.from('fin_payment_orders')
                .select('*, app_accounts!fin_payment_orders_created_by_fkey(name), fin_bank_accounts:fin_bank_accounts!fin_payment_orders_bank_account_id_fkey(account_name, bank_name), destination_bank_account:fin_bank_accounts!fin_payment_orders_destination_account_id_fkey(account_name, bank_name), fin_payment_order_items(*, fin_invoices(invoice_number, gross_amount, description, custom_supplier_name, suppliers(name)), fin_chart_of_accounts(code, name), fin_corporate_card_expenses(amount, currency, is_variable_amount))')
                .gte('order_date', startStr)
                .lte('order_date', endStr)
                .order('order_date', { ascending: false }),
            supabase.from('fin_invoices')
                .select('*, suppliers(name), fin_payment_order_items(amount, corporate_card_expense_id, fin_payment_orders(status)), cashout(amount), fin_corporate_card_expenses(amount)')
                .in('status', ['Pending', 'Overdue', 'In Payment'])
                .order('invoice_date'),
            supabase.from('fin_bank_accounts').select('*').eq('is_active', true).in('account_type', ['Checking', 'Saving']).order('account_name'),
            supabase.from('fin_chart_of_accounts').select('*').eq('is_active', true).eq('is_group', false).order('sort_order'),
            supabase.from('provider_branches').select('id, name, is_active').order('name'),
            supabase.from('suppliers').select('id, name').order('name'),
            supabase.from('fin_payment_orders').select('id', { count: 'exact', head: true }).eq('status', 'Pending Review'),
        ])
        if (ordRes.data) setOrders(ordRes.data as any)
        if (invRes.data) setPendingInvoices(invRes.data as any)
        if (accRes.data) setBankAccounts(accRes.data as any)
        if (coaRes.data) setCoaAccounts(coaRes.data as any)
        if (brRes.data) setBranches(brRes.data as any)
        if (supRes.data) setSuppliers(supRes.data as any)
        if (globalPendingRes.count !== null) setGlobalPendingCount(globalPendingRes.count)
        setLoading(false)
    }

    useEffect(() => { fetchData() }, [monthCursor])

    useEffect(() => {
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
        if (!showCreate) {
            setTransferDestinationAccountId('')
            setTransferAmount(0)
            setTransferAmountStr('')
            setTransferDescription('')
            setHasTransferFee(false)
            setTransferFeeAmount(0)
            setTransferFeeAmountStr('')
            setInvoiceSearch('')
            setShowOnlySelectedInvoices(false)
        }
    }, [showCreate])

    useEffect(() => {
        if (hasTransferFee && createTab === 'transfer' && createAccountId) {
            const sourceAcc = bankAccounts.find(a => a.id === createAccountId);
            const defaultFee = sourceAcc?.bank_transfer_fee ? Number(sourceAcc.bank_transfer_fee) : 0;
            setTransferFeeAmount(defaultFee);
            setTransferFeeAmountStr(defaultFee > 0 ? defaultFee.toLocaleString('en-US') : '');
        }
    }, [createAccountId, hasTransferFee, createTab, bankAccounts])

    useEffect(() => {
        if (!showMarkPaid) return;
        if (!paidAccountId) {
            setPaidFeeVND(0);
            setPaidFeeVNDStr('');
            return;
        }
        const acc = bankAccounts.find(b => b.id === paidAccountId);
        if (!acc) return;

        let fee = 0;
        if (showMarkPaid.is_online_payment && acc.online_payment_fee) {
            fee = Number(acc.online_payment_fee);
        } else if (!showMarkPaid.is_online_payment && acc.bank_transfer_fee) {
            fee = Number(acc.bank_transfer_fee);
        }
        
        // Apply this single fee to all items by default
        const newFees: Record<string, number> = {};
        if (showMarkPaid.fin_payment_order_items) {
            showMarkPaid.fin_payment_order_items.forEach(it => {
                newFees[it.id] = fee;
            });
        }
        
        setItemFees(newFees);
        setPaidFeeVND(fee);
        setPaidFeeVNDStr(fee > 0 ? fee.toLocaleString('en-US') : '');
    }, [paidAccountId, showMarkPaid?.id])

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

    const getInvoiceBalance = (inv: any) => {
        const paidItems = (inv.fin_payment_order_items || []).filter((pi: any) => 
            (pi.fin_payment_orders?.status === 'Paid' || pi.fin_payment_orders?.status === 'Approved') &&
            !pi.corporate_card_expense_id
        )
        let paidAmount = paidItems.reduce((sum: number, pi: any) => sum + Number(pi.amount), 0)
        paidAmount += (inv.cashout || []).reduce((sum: number, c: any) => sum + Number(c.amount), 0)
        paidAmount += (inv.fin_corporate_card_expenses || []).reduce((sum: number, cc: any) => sum + Number(cc.amount), 0)
        return Math.max(0, Number(inv.gross_amount) - paidAmount)
    }

    const availableInvoices = useMemo(() => pendingInvoices.filter(i => {
        // Exclude if already fully paid, unless we are currently editing the order it's in (for backward compat)
        if (editingOrderId && i.payment_order_id === editingOrderId) return true;
        return getInvoiceBalance(i) > 0;
    }), [pendingInvoices, editingOrderId])

    const filteredAvailableInvoices = useMemo(() => {
        return availableInvoices.filter(inv => {
            const matchesSearch = !invoiceSearch.trim() || 
                inv.invoice_number.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
                ((inv as any).suppliers?.name || inv.custom_supplier_name || '').toLowerCase().includes(invoiceSearch.toLowerCase()) ||
                (inv.description || '').toLowerCase().includes(invoiceSearch.toLowerCase());
                
            const matchesSelected = !showOnlySelectedInvoices || selectedInvoiceIds.has(inv.id);
            
            return matchesSearch && matchesSelected;
        });
    }, [availableInvoices, invoiceSearch, showOnlySelectedInvoices, selectedInvoiceIds]);

    const invoiceTotal = useMemo(() =>
        availableInvoices.filter(i => selectedInvoiceIds.has(i.id)).reduce((s, i) => s + getInvoiceBalance(i), 0),
        [availableInvoices, selectedInvoiceIds])

    const manualTotal = useMemo(() => manualItems.reduce((s, m) => s + (m.amount || 0), 0), [manualItems])
    const selectedTotal = invoiceTotal + manualTotal

    const isFormInvalid = useMemo(() => {
        if (!createAccountId) return true;

        if (createTab === 'transfer') {
            return !transferDestinationAccountId || createAccountId === transferDestinationAccountId || transferAmount <= 0 || (hasTransferFee && transferFeeAmount < 0);
        } else if (createTab === 'invoices') {
            return selectedInvoiceIds.size === 0;
        } else {
            if (manualItems.length === 0) return true;
            return manualItems.some(m => 
                !m.description.trim() || 
                m.amount <= 0 || 
                !m.supplier_id || 
                !m.account_id || 
                !m.branch_ids || 
                m.branch_ids.length === 0
            );
        }
    }, [createTab, createAccountId, transferDestinationAccountId, transferAmount, selectedInvoiceIds, manualItems, hasTransferFee, transferFeeAmount])

    const displayTotal = createTab === 'transfer' ? transferAmount + (hasTransferFee ? transferFeeAmount : 0) : selectedTotal;

    const addManualItem = () => setManualItems(prev => [...prev, { id: crypto.randomUUID(), description: '', amount: 0, account_id: '', branch_ids: [], requires_invoice: false }])
    const removeManualItem = (id: string) => setManualItems(prev => prev.filter(m => m.id !== id))
    const updateManualItem = (id: string, field: keyof ManualItem, value: any) => {
        setManualItems(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m))
    }

    const handleEditOrder = (po: FinPaymentOrder) => {
        setEditingOrderId(po.id);
        setCreateAccountId(po.bank_account_id || '');
        setVatInvoiceStatus(po.vat_invoice_status || 'None');
        setShowCreate(true);

        if (po.destination_account_id) {
            setTransferDestinationAccountId(po.destination_account_id);
            const items = po.fin_payment_order_items || [];
            const mainItem = items.find(i => i.account_id === null);
            const feeItem = items.find(i => i.account_id !== null);

            const mainAmt = mainItem ? Number(mainItem.amount) : Number(po.total_amount);
            setTransferAmount(mainAmt);
            setTransferAmountStr(mainAmt ? mainAmt.toLocaleString('en-US') : '');
            setTransferDescription(po.notes || '');

            if (feeItem) {
                setHasTransferFee(true);
                setTransferFeeAmount(Number(feeItem.amount));
                setTransferFeeAmountStr(Number(feeItem.amount) ? Number(feeItem.amount).toLocaleString('en-US') : '');
            } else {
                setHasTransferFee(false);
                setTransferFeeAmount(0);
                setTransferFeeAmountStr('');
            }

            setCreateTab('transfer');
            setSelectedInvoiceIds(new Set());
            setManualItems([]);
        } else {
            const items = po.fin_payment_order_items || [];
            const invIds = new Set(items.filter(i => i.item_type === 'invoice' || i.invoice_id).map(i => i.invoice_id).filter(Boolean) as string[]);
            const mItems = items.filter(i => i.item_type === 'manual').map(i => ({
                id: crypto.randomUUID(),
                description: i.description || '',
                amount: Number(i.amount) || 0,
                account_id: i.account_id || '',
                branch_ids: i.branch_ids || [],
                requires_invoice: !!i.requires_invoice,
                supplier_id: i.supplier_id || null,
                corporate_card_expense_id: i.corporate_card_expense_id || null
            }));
            setSelectedInvoiceIds(invIds);
            setManualItems(mItems);
            setCreateTab(invIds.size > 0 ? 'invoices' : 'manual');
        }
    }

    const handleCreateOrder = async (isDraft: boolean = false) => {
        if (isFormInvalid) {
            alert(language === 'vi' ? 'Vui lòng điền và chọn đầy đủ tất cả các trường.' : 'Please fill and select all required fields.');
            return;
        }

        setSaving(true)
        try {
            let orderId = editingOrderId;
            const validManual = manualItems;

            if (editingOrderId) {
                // Revert any corporate card expenses linked to this PO
                const { data: oldItems } = await supabase.from('fin_payment_order_items').select('corporate_card_expense_id').eq('payment_order_id', editingOrderId).not('corporate_card_expense_id', 'is', null)
                if (oldItems && oldItems.length > 0) {
                    await supabase.from('fin_corporate_card_expenses').update({ is_paid: false, final_amount_vnd: null }).in('id', oldItems.map(i => i.corporate_card_expense_id))
                }
                // Remove old links
                await supabase.from('fin_payment_order_items').delete().eq('payment_order_id', editingOrderId);

                if (createTab === 'transfer') {
                    await supabase.from('fin_payment_orders').update({
                        total_amount: transferAmount + (hasTransferFee ? transferFeeAmount : 0),
                        bank_account_id: createAccountId,
                        destination_account_id: transferDestinationAccountId,
                        vat_invoice_status: 'None',
                        status: isDraft ? 'Draft' : 'Pending Review',
                        notes: transferDescription || null
                    }).eq('id', editingOrderId);
                } else {
                    // Compute VAT status based on contents
                    let finalVatStatus = vatInvoiceStatus;
                    if (selectedInvoiceIds.size > 0) finalVatStatus = 'Issued';
                    else if (validManual.some(m => m.requires_invoice)) finalVatStatus = 'Pending';
                    else if (!editingOrderId) finalVatStatus = 'None';

                    await supabase.from('fin_payment_orders').update({ 
                        total_amount: selectedTotal, 
                        bank_account_id: createAccountId || null,
                        destination_account_id: null,
                        vat_invoice_status: finalVatStatus,
                        status: isDraft ? 'Draft' : 'Pending Review',
                        notes: null
                    }).eq('id', editingOrderId);
                }
            } else {
                // Generate order number
                const now = new Date()
                const prefix = `PO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                const { count } = await supabase.from('fin_payment_orders').select('*', { count: 'exact', head: true }).ilike('order_number', `${prefix}%`)
                const orderNum = `${prefix}-${String((count || 0) + 1).padStart(3, '0')}`

                const { data: { session } } = await supabase.auth.getSession()

                if (createTab === 'transfer') {
                    const { data: order, error: ordErr } = await supabase.from('fin_payment_orders').insert({
                        order_number: orderNum,
                        order_date: toLocalDateStr(new Date()),
                        total_amount: transferAmount + (hasTransferFee ? transferFeeAmount : 0),
                        status: isDraft ? 'Draft' : 'Pending Review',
                        bank_account_id: createAccountId,
                        destination_account_id: transferDestinationAccountId,
                        vat_invoice_status: 'None',
                        notes: transferDescription || null,
                        created_by: session?.user?.id || null
                    }).select().single()
                    if (ordErr) throw ordErr
                    orderId = order.id
                } else {
                    // Compute VAT status based on contents
                    let finalVatStatus: 'Issued' | 'Pending' | 'None' = 'None';
                    if (selectedInvoiceIds.size > 0) finalVatStatus = 'Issued';
                    else if (validManual.some(m => m.requires_invoice)) finalVatStatus = 'Pending';

                    const { data: order, error: ordErr } = await supabase.from('fin_payment_orders').insert({
                        order_number: orderNum,
                        order_date: toLocalDateStr(new Date()),
                        total_amount: selectedTotal,
                        status: isDraft ? 'Draft' : 'Pending Review',
                        bank_account_id: createAccountId || null,
                        destination_account_id: null,
                        vat_invoice_status: finalVatStatus,
                        created_by: session?.user?.id || null
                    }).select().single()
                    if (ordErr) throw ordErr
                    orderId = order.id
                }
            }

            if (createTab === 'transfer') {
                const sourceAcc = bankAccounts.find(a => a.id === createAccountId);
                const feeAccountId = sourceAcc?.fee_account_id || null;

                const itemsToInsert = [
                    {
                        payment_order_id: orderId,
                        invoice_id: null,
                        item_type: 'manual' as const,
                        description: transferDescription || (language === 'vi' ? 'Chuyển khoản nội bộ' : 'Internal Transfer'),
                        amount: transferAmount,
                        account_id: null as string | null,
                        supplier_id: null as string | null,
                        branch_ids: null as string[] | null,
                        requires_invoice: false
                    }
                ];

                if (hasTransferFee && transferFeeAmount > 0) {
                    itemsToInsert.push({
                        payment_order_id: orderId,
                        invoice_id: null,
                        item_type: 'manual' as const,
                        description: language === 'vi' ? 'Phí chuyển khoản nội bộ' : 'Bank Fee for Internal Transfer',
                        amount: transferFeeAmount,
                        account_id: feeAccountId,
                        supplier_id: null as string | null,
                        branch_ids: null as string[] | null,
                        requires_invoice: false
                    });
                }

                const { error: itemErr } = await supabase.from('fin_payment_order_items').insert(itemsToInsert)
                if (itemErr) throw itemErr
            } else {
                // Create invoice items
                const invoiceItems = Array.from(selectedInvoiceIds).map(invId => {
                    const inv = availableInvoices.find(i => i.id === invId)
                    const amt = inv ? getInvoiceBalance(inv) : 0;
                    return { 
                        payment_order_id: orderId, 
                        invoice_id: invId, 
                        item_type: 'invoice' as const, 
                        amount: amt,
                        account_id: inv?.account_id || null,
                        branch_ids: inv?.branch_ids || null,
                        supplier_id: inv?.supplier_id || null
                    }
                })
                // Create manual items
                const manualDbItems = validManual.map(m => ({
                    payment_order_id: orderId, invoice_id: null, item_type: 'manual' as const,
                    description: m.description, account_id: m.account_id || null, amount: m.amount,
                    branch_ids: m.branch_ids.length > 0 ? m.branch_ids : null,
                    requires_invoice: m.requires_invoice, supplier_id: m.supplier_id || null,
                    corporate_card_expense_id: m.corporate_card_expense_id || null
                }))
                const allItems = [...invoiceItems, ...manualDbItems]
                if (allItems.length > 0) {
                    const { error: itemErr } = await supabase.from('fin_payment_order_items').insert(allItems)
                    if (itemErr) throw itemErr
                    
                    const cardExpenseIds = manualDbItems.map(m => m.corporate_card_expense_id).filter(Boolean)
                    if (cardExpenseIds.length > 0) {
                        await supabase.from('fin_corporate_card_expenses').update({ is_paid: true }).in('id', cardExpenseIds)
                    }
                }

                // Update invoices status
                if (selectedInvoiceIds.size > 0) {
                    const { error: invErr } = await supabase.from('fin_invoices').update({ status: 'In Payment' }).in('id', Array.from(selectedInvoiceIds))
                    if (invErr) throw invErr
                }
            }

            setShowCreate(false)
            setEditingOrderId(null)
            setCreateAccountId('')
            setVatInvoiceStatus('None')
            setSelectedInvoiceIds(new Set())
            setManualItems([])
            setInvoiceSearch('')
            setShowOnlySelectedInvoices(false)
            fetchData()
        } catch (err: any) {
            alert((language === 'vi' ? 'Thất bại: ' : 'Failed: ') + err.message)
        }
        setSaving(false)
    }

    const handleMarkPaid = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!showMarkPaid || !paidDate) return
        setSaving(true)
        try {
            const isTransfer = !!showMarkPaid.destination_account_id
            const previousStatus = showMarkPaid.status
            const txErrors: string[] = []

            if (isTransfer) {
                const items = showMarkPaid.fin_payment_order_items || [];
                const mainItem = items.find(i => i.account_id === null);
                const feeItem = items.find(i => i.account_id !== null);

                const transferAmt = mainItem ? Number(mainItem.amount) : Number(showMarkPaid.total_amount);
                const feeAmt = feeItem ? Number(feeItem.amount) : 0;
                const totalAmt = transferAmt + feeAmt;

                const destAccountId = showMarkPaid.destination_account_id!
                const sourceAccName = bankAccounts.find(a => a.id === paidAccountId)?.account_name || 'Source Account'
                const destAccName = bankAccounts.find(a => a.id === destAccountId)?.account_name || 'Destination Account'

                // Update payment order status to Paid
                const { error: poErr } = await supabase.from('fin_payment_orders').update({
                    status: 'Paid', paid_date: paidDate, payment_method: paidMethod,
                    bank_account_id: paidAccountId || null, notes: paidNotes || showMarkPaid.notes,
                    total_amount: totalAmt
                }).eq('id', showMarkPaid.id)
                if (poErr) throw poErr

                // Insert bank transactions
                if (paidAccountId) {
                    // Outflow transaction on source account
                    const { error: txErr1 } = await supabase.from('fin_bank_transactions').insert({
                        account_id: paidAccountId,
                        transaction_date: paidDate,
                        type: 'Outflow',
                        category: 'Internal Transfer',
                        description: `Internal Transfer to ${destAccName} (PO ${showMarkPaid.order_number})`,
                        amount: transferAmt,
                        reference_id: showMarkPaid.id,
                        reference_type: 'payment_order',
                        counterpart_account_id: destAccountId
                    })
                    if (txErr1) txErrors.push(language === 'vi' ? `Giao dịch nguồn thất bại: ${txErr1.message}` : `Source transaction failed: ${txErr1.message}`)

                    if (feeAmt > 0) {
                        const { error: feeErr } = await supabase.from('fin_bank_transactions').insert({
                            account_id: paidAccountId,
                            transaction_date: paidDate,
                            type: 'Outflow',
                            category: 'Bank Fees',
                            description: `Bank Fee for Internal Transfer to ${destAccName} (PO ${showMarkPaid.order_number})`,
                            amount: feeAmt,
                            reference_id: showMarkPaid.id,
                            reference_type: 'payment_order',
                        })
                        if (feeErr) txErrors.push(language === 'vi' ? `Giao dịch phí thất bại: ${feeErr.message}` : `Fee transaction failed: ${feeErr.message}`)
                    }

                    // Inflow transaction on destination account
                    const { error: txErr2 } = await supabase.from('fin_bank_transactions').insert({
                        account_id: destAccountId,
                        transaction_date: paidDate,
                        type: 'Inflow',
                        category: 'Internal Transfer',
                        description: `Internal Transfer from ${sourceAccName} (PO ${showMarkPaid.order_number})`,
                        amount: transferAmt,
                        reference_id: showMarkPaid.id,
                        reference_type: 'payment_order',
                        counterpart_account_id: paidAccountId
                    })
                    if (txErr2) txErrors.push(language === 'vi' ? `Giao dịch đích thất bại: ${txErr2.message}` : `Destination transaction failed: ${txErr2.message}`)

                    // Update balances in PostgreSQL via RPC if no transaction errors occurred
                    if (txErrors.length === 0) {
                        const { error: balErr1 } = await supabase.rpc('fin_update_account_balance', { p_account_id: paidAccountId })
                        if (balErr1) txErrors.push(language === 'vi' ? `Cập nhật số dư nguồn thất bại: ${balErr1.message}` : `Source balance update failed: ${balErr1.message}`)
                        
                        const { error: balErr2 } = await supabase.rpc('fin_update_account_balance', { p_account_id: destAccountId })
                        if (balErr2) txErrors.push(language === 'vi' ? `Cập nhật số dư đích thất bại: ${balErr2.message}` : `Destination balance update failed: ${balErr2.message}`)
                    }
                }

                if (txErrors.length > 0) {
                    // Rollback internal transfer changes
                    await supabase.from('fin_bank_transactions').delete().eq('reference_id', showMarkPaid.id).eq('reference_type', 'payment_order')
                    await supabase.from('fin_payment_orders').update({
                        status: previousStatus, paid_date: null, bank_account_id: showMarkPaid.bank_account_id,
                        notes: showMarkPaid.notes, total_amount: showMarkPaid.total_amount
                    }).eq('id', showMarkPaid.id)

                    throw new Error(
                        language === 'vi'
                            ? `Giao dịch chuyển khoản nội bộ thất bại. Đã khôi phục trạng thái lệnh chi thành ${previousStatus}. Chi tiết:\n${txErrors.join('\n')}`
                            : `Internal transfer transactions failed. Reverted payment order status to ${previousStatus}. Details:\n${txErrors.join('\n')}`
                    )
                }
            } else {
                const totalFeeVND = Object.values(itemFees).reduce((s, v) => s + v, 0);
                const finalTotal = paidFinalAmountVND + totalFeeVND

                // Update payment order
                const { error: poErr } = await supabase.from('fin_payment_orders').update({
                    status: 'Paid', paid_date: paidDate, payment_method: paidMethod,
                    bank_account_id: paidAccountId || null, notes: paidNotes || showMarkPaid.notes,
                    total_amount: finalTotal
                }).eq('id', showMarkPaid.id)
                if (poErr) throw poErr

                // Add fee items if needed
                const items = showMarkPaid.fin_payment_order_items || []
                for (const item of items) {
                    const feeAmt = itemFees[item.id] || 0;
                    if (feeAmt > 0) {
                        const feeDesc = `Bank Fee for ${item.item_type === 'invoice' && item.fin_invoices ? item.fin_invoices.invoice_number : item.description}`
                        const { error: feeItemErr } = await supabase.from('fin_payment_order_items').insert({
                            payment_order_id: showMarkPaid.id,
                            item_type: 'manual',
                            description: feeDesc,
                            amount: feeAmt,
                            account_id: selectedPaidAccount?.fee_account_id || item.account_id || null,
                            branch_ids: item.branch_ids || null
                        })
                        if (feeItemErr) txErrors.push(language === 'vi' ? `Thêm phí giao dịch thất bại: ${feeItemErr.message}` : `Failed to add fee item: ${feeItemErr.message}`)
                    }
                }

                // Update manual item amount if changed
                const firstManual = showMarkPaid.fin_payment_order_items?.find(i => i.item_type === 'manual')
                if (firstManual && txErrors.length === 0) {
                    if (paidFinalAmountVND !== showMarkPaid.total_amount) {
                        const { error: manItemErr } = await supabase.from('fin_payment_order_items').update({ amount: paidFinalAmountVND }).eq('id', firstManual.id)
                        if (manItemErr) txErrors.push(language === 'vi' ? `Cập nhật số tiền thủ công thất bại: ${manItemErr.message}` : `Failed to update manual item amount: ${manItemErr.message}`)
                    }
                    if (firstManual.corporate_card_expense_id) {
                        const { error: ccErr } = await supabase.from('fin_corporate_card_expenses').update({ final_amount_vnd: paidFinalAmountVND }).eq('id', firstManual.corporate_card_expense_id)
                        if (ccErr) txErrors.push(language === 'vi' ? `Cập nhật chi phí thẻ thất bại: ${ccErr.message}` : `Failed to update corporate card expense: ${ccErr.message}`)
                    }
                }

                // Update all child invoices
                const invoiceIds = items.filter(i => i.invoice_id).map(i => i.invoice_id as string)
                
                if (invoiceIds.length > 0 && txErrors.length === 0) {
                    const { data: invData, error: invFetchErr } = await supabase.from('fin_invoices').select('id, gross_amount, fin_payment_order_items(amount, corporate_card_expense_id, fin_payment_orders(status, id)), cashout(amount), fin_corporate_card_expenses(amount)').in('id', invoiceIds)
                    if (invFetchErr) {
                        txErrors.push(language === 'vi' ? `Lấy dữ liệu hóa đơn thất bại: ${invFetchErr.message}` : `Failed to fetch invoice data: ${invFetchErr.message}`)
                    } else if (invData) {
                        for (const inv of invData) {
                            const paidItems = (inv.fin_payment_order_items || []).filter((pi: any) => 
                                (pi.fin_payment_orders?.status === 'Paid' || pi.fin_payment_orders?.status === 'Approved' || pi.fin_payment_orders?.id === showMarkPaid.id) &&
                                !pi.corporate_card_expense_id
                            )
                            let paidAmount = paidItems.reduce((sum: number, pi: any) => sum + Number(pi.amount), 0)
                            paidAmount += (inv.cashout || []).reduce((sum: number, c: any) => sum + Number(c.amount), 0)
                            paidAmount += (inv.fin_corporate_card_expenses || []).reduce((sum: number, cc: any) => sum + Number(cc.amount), 0)
                            if (paidAmount >= Number(inv.gross_amount)) {
                                const { error: invUpdErr } = await supabase.from('fin_invoices').update({
                                    status: 'Paid', paid_date: paidDate, paid_via: paidMethod, paid_from_account_id: paidAccountId || null,
                                }).eq('id', inv.id)
                                if (invUpdErr) txErrors.push(language === 'vi' ? `Cập nhật trạng thái hóa đơn ${inv.id} thất bại: ${invUpdErr.message}` : `Failed to update invoice ${inv.id} to Paid: ${invUpdErr.message}`)
                            } else {
                                const { error: invUpdErr } = await supabase.from('fin_invoices').update({ status: 'In Payment' }).eq('id', inv.id)
                                if (invUpdErr) txErrors.push(language === 'vi' ? `Cập nhật hóa đơn ${inv.id} thành Đang thanh toán thất bại: ${invUpdErr.message}` : `Failed to update invoice ${inv.id} to In Payment: ${invUpdErr.message}`)
                            }
                        }
                    }
                }

                // Create bank transactions if account selected
                if (paidAccountId && txErrors.length === 0) {
                    const hasInvoices = items.some(i => i.item_type === 'invoice' || i.invoice_id)
                    const hasManual = items.some(i => i.item_type === 'manual' && !i.invoice_id)
                    const txCategory = hasInvoices && hasManual ? 'Mixed Payment' : hasManual ? 'Operational Payment' : 'Supplier Payment'

                    const baseAmount = showMarkPaid.is_variable_amount || showMarkPaid.is_online_payment ? paidFinalAmountVND : Number(showMarkPaid.total_amount)

                    const { error: txErr } = await supabase.from('fin_bank_transactions').insert({
                        account_id: paidAccountId, transaction_date: paidDate, type: 'Outflow',
                        category: txCategory, description: `Payment Order ${showMarkPaid.order_number}`,
                        amount: baseAmount, reference_id: showMarkPaid.id, reference_type: 'payment_order',
                    })
                    if (txErr) txErrors.push(language === 'vi' ? `Ghi nhận giao dịch ngân hàng thất bại: ${txErr.message}` : `Bank transaction failed: ${txErr.message}`)

                    for (const item of items) {
                        const feeAmt = itemFees[item.id] || 0;
                        if (feeAmt > 0) {
                            const feeDesc = `Bank Fee for ${item.item_type === 'invoice' && item.fin_invoices ? item.fin_invoices.invoice_number : item.description}`
                            const { error: feeErr } = await supabase.from('fin_bank_transactions').insert({
                                account_id: paidAccountId, transaction_date: paidDate, type: 'Outflow',
                                category: 'Bank Fees', description: feeDesc,
                                amount: feeAmt, reference_id: showMarkPaid.id, reference_type: 'payment_order',
                            })
                            if (feeErr) txErrors.push(language === 'vi' ? `Ghi nhận giao dịch phí thất bại: ${feeErr.message}` : `Fee transaction failed: ${feeErr.message}`)
                        }
                    }

                    // Update balance
                    if (txErrors.length === 0) {
                        const { error: balErr } = await supabase.rpc('fin_update_account_balance', { p_account_id: paidAccountId })
                        if (balErr) txErrors.push(language === 'vi' ? `Ricalcolo số dư thất bại: ${balErr.message}` : `Balance update failed: ${balErr.message}`)
                    }
                }

                if (txErrors.length > 0) {
                    // Rollback standard payment changes
                    await supabase.from('fin_bank_transactions').delete().eq('reference_id', showMarkPaid.id).eq('reference_type', 'payment_order')
                    await supabase.from('fin_payment_order_items').delete().eq('payment_order_id', showMarkPaid.id).like('description', 'Bank Fee for %')
                    if (invoiceIds.length > 0) {
                        await supabase.from('fin_invoices').update({ status: 'Pending', paid_date: null, paid_via: null, paid_from_account_id: null }).in('id', invoiceIds)
                    }
                    if (firstManual) {
                        await supabase.from('fin_payment_order_items').update({ amount: showMarkPaid.total_amount }).eq('id', firstManual.id)
                        if (firstManual.corporate_card_expense_id) {
                            await supabase.from('fin_corporate_card_expenses').update({ final_amount_vnd: null }).eq('id', firstManual.corporate_card_expense_id)
                        }
                    }
                    await supabase.from('fin_payment_orders').update({
                        status: previousStatus, paid_date: null, bank_account_id: showMarkPaid.bank_account_id,
                        notes: showMarkPaid.notes, total_amount: showMarkPaid.total_amount
                    }).eq('id', showMarkPaid.id)

                    throw new Error(
                        language === 'vi'
                            ? `Giao dịch thanh toán thất bại. Đã khôi phục trạng thái lệnh chi thành ${previousStatus}. Chi tiết:\n${txErrors.join('\n')}`
                            : `Payment transactions failed. Reverted payment order status to ${previousStatus}. Details:\n${txErrors.join('\n')}`
                    )
                }
            }

            setShowMarkPaid(null)
            fetchData()
        } catch (err: any) {
            alert((language === 'vi' ? 'Thất bại: ' : 'Failed: ') + err.message)
        }
        setSaving(false)
    }

    const handleUndoPayment = async (po: FinPaymentOrder) => {
        if (!confirm(language === 'vi' ? 'Bạn có chắc chắn muốn hoàn tác khoản thanh toán này? Thao tác này sẽ xóa các giao dịch ngân hàng và đặt lại lệnh chi.' : 'Are you sure you want to undo this payment? This will delete the bank transactions and reset the order.')) return
        setLoading(true)
        try {
            // Delete bank transactions
            const { error: delTxErr } = await supabase.from('fin_bank_transactions').delete().eq('reference_id', po.id).eq('reference_type', 'payment_order')
            if (delTxErr) throw delTxErr
            
            const isTransfer = !!po.destination_account_id

            if (isTransfer) {
                const { error: poErr } = await supabase.from('fin_payment_orders').update({
                    status: 'Pending Review', paid_date: null, bank_account_id: null
                }).eq('id', po.id)
                if (poErr) throw poErr

                if (po.bank_account_id) {
                    const { error: balErr1 } = await supabase.rpc('fin_update_account_balance', { p_account_id: po.bank_account_id })
                    if (balErr1) throw balErr1
                }
                if (po.destination_account_id) {
                    const { error: balErr2 } = await supabase.rpc('fin_update_account_balance', { p_account_id: po.destination_account_id })
                    if (balErr2) throw balErr2
                }
            } else {
                // Delete fee item(s) if they exist
                const feeItems = po.fin_payment_order_items?.filter(i => i.description === 'Online Payment / Bank Fee' || i.description?.startsWith('Bank Fee for ')) || []
                const totalFees = feeItems.reduce((sum, item) => sum + Number(item.amount), 0)
                
                if (feeItems.length > 0) {
                    const { error: delFeesErr } = await supabase.from('fin_payment_order_items').delete().in('id', feeItems.map(i => i.id))
                    if (delFeesErr) throw delFeesErr
                }

                // Update invoices back to Pending
                const items = po.fin_payment_order_items || []
                const invoiceIds = items.filter(i => i.invoice_id).map(i => i.invoice_id as string)
                if (invoiceIds.length > 0) {
                    const { error: invErr } = await supabase.from('fin_invoices').update({ status: 'Pending', paid_date: null, paid_via: null, paid_from_account_id: null }).in('id', invoiceIds)
                    if (invErr) throw invErr
                }

                // Reset linked card expense final_amount_vnd
                const firstManual = items.find(i => i.item_type === 'manual')
                if (firstManual && firstManual.corporate_card_expense_id) {
                    const { error: ccErr } = await supabase.from('fin_corporate_card_expenses').update({ final_amount_vnd: null }).eq('id', firstManual.corporate_card_expense_id)
                    if (ccErr) throw ccErr
                }

                const { error: poErr } = await supabase.from('fin_payment_orders').update({
                    status: 'Pending Review', paid_date: null, bank_account_id: null,
                    total_amount: po.total_amount - totalFees
                }).eq('id', po.id)
                if (poErr) throw poErr

                if (po.bank_account_id) {
                    const { error: balErr } = await supabase.rpc('fin_update_account_balance', { p_account_id: po.bank_account_id })
                    if (balErr) throw balErr
                }
            }
            
            fetchData()
        } catch (err: any) {
            alert((language === 'vi' ? 'Thất bại khi hoàn tác: ' : 'Failed to undo: ') + err.message)
        }
        setLoading(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm(language === 'vi' ? 'Xóa lệnh chi này? Trạng thái các hóa đơn liên quan sẽ được đặt lại thành Chờ thanh toán.' : 'Delete this payment order? Invoices will be set back to Pending.')) return
        const { data: oldItems } = await supabase.from('fin_payment_order_items').select('corporate_card_expense_id').eq('payment_order_id', id).not('corporate_card_expense_id', 'is', null)
        if (oldItems && oldItems.length > 0) {
            await supabase.from('fin_corporate_card_expenses').update({ is_paid: false, final_amount_vnd: null }).in('id', oldItems.map(i => i.corporate_card_expense_id))
        }
        await supabase.from('fin_payment_order_items').delete().eq('payment_order_id', id)
        await supabase.from('fin_payment_orders').delete().eq('id', id)
        // Note: Invoices remain in their current status or can be re-evaluated on next fetch
        fetchData()
    }

    const statuses = ['All', 'Draft', 'Pending Review', 'Approved', 'Paid', 'Cancelled']

    const selectedCreateAccount = useMemo(() => bankAccounts.find(a => a.id === createAccountId), [bankAccounts, createAccountId])
    const selectedPaidAccount = useMemo(() => bankAccounts.find(a => a.id === paidAccountId), [bankAccounts, paidAccountId])

    const paidThisMonth = orders.filter(o => o.status === 'Paid')
    const paidAmount = paidThisMonth.reduce((s, o) => s + (o.total_amount || 0), 0)

    const toPayThisMonth = orders.filter(o => ['Draft', 'Pending Review', 'Approved'].includes(o.status))
    const toPayAmount = toPayThisMonth.reduce((s, o) => s + (o.total_amount || 0), 0)

    const pendingReviewThisMonth = orders.filter(o => o.status === 'Pending Review')

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'FinPayTitle')}</h1>
                    <p className="text-slate-500 mt-1">{t(language, 'FinPaySubtitle')}</p>
                </div>
                <button onClick={() => { setShowCreate(true); setSelectedInvoiceIds(new Set()); setCreateTab('invoices') }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2">
                    <Plus className="w-4 h-4" /> {t(language, 'FinPayCreateOrder')}
                </button>
            </div>


            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t(language, 'FinPayPaidThisMonth')}</p>
                        <p className="text-xl font-black text-slate-900 mt-0.5">{fmt(paidAmount)} <span className="text-sm text-slate-500">{currency}</span></p>
                        <p className="text-xs text-slate-400 mt-1">{paidThisMonth.length} {language === 'vi' ? 'lệnh chi' : paidThisMonth.length === 1 ? 'order' : 'orders'}</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                        <Clock className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t(language, 'FinPayToPayThisMonth')}</p>
                        <p className="text-xl font-black text-slate-900 mt-0.5">{fmt(toPayAmount)} <span className="text-sm text-slate-500">{currency}</span></p>
                        <p className="text-xs text-slate-400 mt-1">{toPayThisMonth.length} {language === 'vi' ? 'lệnh chi' : toPayThisMonth.length === 1 ? 'order' : 'orders'}</p>
                    </div>
                </div>

                <div className={`rounded-2xl p-5 border shadow-sm flex items-center gap-4 ${pendingReviewThisMonth.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${pendingReviewThisMonth.length > 0 ? 'bg-amber-100' : 'bg-slate-100'}`}>
                        <Eye className={`w-6 h-6 ${pendingReviewThisMonth.length > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
                    </div>
                    <div>
                        <p className={`text-xs font-bold uppercase tracking-wider ${pendingReviewThisMonth.length > 0 ? 'text-amber-700' : 'text-slate-500'}`}>{t(language, 'FinPayReviewThisMonth')}</p>
                        <p className={`text-xl font-black mt-0.5 ${pendingReviewThisMonth.length > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{pendingReviewThisMonth.length}</p>
                        <p className={`text-xs mt-1 ${pendingReviewThisMonth.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{t(language, 'FinPayOrdersWaiting')}</p>
                    </div>
                </div>

                <div className={`rounded-2xl p-5 border shadow-sm flex items-center gap-4 ${globalPendingCount > 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'}`}>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${globalPendingCount > 0 ? 'bg-indigo-100' : 'bg-emerald-100'}`}>
                        {globalPendingCount > 0 ? <AlertCircle className="w-6 h-6 text-indigo-600" /> : <CheckCircle2 className="w-6 h-6 text-emerald-600" />}
                    </div>
                    <div>
                        <p className={`text-xs font-bold uppercase tracking-wider ${globalPendingCount > 0 ? 'text-indigo-700' : 'text-slate-500'}`}>{t(language, 'FinPayGlobalAction')}</p>
                        <p className={`text-xl font-black mt-0.5 ${globalPendingCount > 0 ? 'text-indigo-700' : 'text-slate-900'}`}>{globalPendingCount}</p>
                        <p className={`text-xs mt-1 ${globalPendingCount > 0 ? 'text-indigo-600' : 'text-slate-400'}`}>{t(language, 'FinPayTotalPendingReview')}</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder={t(language, 'FinPaySearchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 shadow-sm" />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-700 shadow-sm">
                    {statuses.map(s => <option key={s} value={s}>{translateStatus(s)}</option>)}
                </select>
            </div>

            {/* Month Navigation */}
            <div className="grid grid-cols-3 items-center mb-6">
                <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))} className="justify-self-start text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline transition flex items-center gap-1">
                    <ChevronLeft className="w-4 h-4" /> {t(language, 'Previous')}
                </button>
                <div className="justify-self-center text-lg font-bold text-slate-900">
                    {monthCursor.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' })}
                </div>
                <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))} className="justify-self-end text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline transition flex items-center gap-1">
                    {t(language, 'Next')} <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                <table className="w-full table-auto text-sm text-gray-900 text-left border-collapse">
                    <thead>
                        <tr className="text-gray-500 font-semibold border-b border-slate-100 bg-slate-50/50">
                            <th className="p-3">{t(language, 'FinPayOrderNo')}</th>
                            <th className="p-3">{t(language, 'FinPayDate')}</th>
                            <th className="p-3 text-right">{t(language, 'FinPayInvoices')}</th>
                            <th className="p-3 text-right">{t(language, 'FinPayTotal')} ({currency})</th>
                            <th className="p-3">{t(language, 'FinPayPaymentFrom')}</th>
                            <th className="p-3">{t(language, 'FinPayMethod')}</th>
                            <th className="p-3">{t(language, 'FinPayCreatedBy')}</th>
                            <th className="p-3">{t(language, 'FinPayStatus')}</th>
                            <th className="p-3 text-right">{t(language, 'FinPayActions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={9} className="p-8 text-center"><CircularLoader /></td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={9} className="p-8 text-center text-gray-500">{t(language, 'FinPayNoOrders')}</td></tr>
                        ) : filtered.map(po => {
                            const sty = PAYMENT_ORDER_STATUS_STYLES[po.status] || PAYMENT_ORDER_STATUS_STYLES['Draft']
                            const itemCount = po.fin_payment_order_items?.filter(i => !(i.description === 'Online Payment / Bank Fee' || i.description?.startsWith('Bank Fee for '))).length || 0
                            return (
                                <tr key={po.id} className="border-t border-slate-100 hover:bg-blue-50/30 transition cursor-pointer" onClick={() => setShowDetail(po)}>
                                    <td className="p-3 font-semibold text-slate-800">{po.order_number}</td>
                                    <td className="p-3 text-slate-600">{new Date(po.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                                    <td className="p-3 text-right tabular-nums">{itemCount}</td>
                                    <td className="p-3 text-right tabular-nums">
                                        {(() => {
                                            const cardExpenseItem = po.fin_payment_order_items?.find(i => i.corporate_card_expense_id)?.fin_corporate_card_expenses
                                            if (cardExpenseItem && cardExpenseItem.currency !== currency) {
                                                return (
                                                    <div className="text-right">
                                                        <div className="font-bold text-amber-700">
                                                            {po.status === 'Paid' ? `${fmt(Number(po.total_amount))} ${currency}` : `${cardExpenseItem.amount} ${cardExpenseItem.currency}`}
                                                        </div>
                                                        {po.status !== 'Paid' && (
                                                            <div className="text-[10px] text-slate-400 font-medium leading-none mt-0.5">~ {fmt(Number(po.total_amount))} {currency}</div>
                                                        )}
                                                        {po.status === 'Paid' && (
                                                            <div className="text-[10px] text-slate-400 font-medium leading-none mt-0.5">{cardExpenseItem.amount} {cardExpenseItem.currency}</div>
                                                        )}
                                                    </div>
                                                )
                                            }
                                            return <span className="font-bold">{fmt(Number(po.total_amount))}</span>
                                        })()}
                                    </td>
                                    <td className="p-3 text-slate-600">
                                        {po.destination_account_id ? (
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-semibold text-slate-800">{po.fin_bank_accounts?.account_name || '—'}</span>
                                                <span className="text-slate-400">→</span>
                                                <span className="font-semibold text-blue-600">{po.destination_bank_account?.account_name || '—'}</span>
                                            </div>
                                        ) : (
                                            po.fin_bank_accounts?.account_name || '—'
                                        )}
                                    </td>
                                    <td className="p-3">
                                        {po.destination_account_id ? (
                                            <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 uppercase tracking-wider items-center gap-1"><ArrowLeftRight className="w-3 h-3" /> {language === 'vi' ? 'Chuyển khoản nội bộ' : 'Internal Transfer'}</span>
                                        ) : po.fin_payment_order_items?.some(i => i.corporate_card_expense_id) ? (
                                            <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 uppercase tracking-wider items-center gap-1"><CreditCard className="w-3 h-3" /> {t(language, 'FinInvCard')}</span>
                                        ) : (
                                            <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-wider items-center gap-1"><ArrowLeftRight className="w-3 h-3" /> {t(language, 'FinInvTransfer')}</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-slate-600 font-medium">{po.app_accounts?.name || 'System'}</td>
                                    <td className="p-3">
                                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${sty.bg} ${sty.text}`}>{translateStatus(po.status)}</span>
                                        {po.paid_date && <div className="text-xs text-gray-500 mt-0.5">{language === 'vi' ? 'Đã chi' : 'Paid'} {new Date(po.paid_date).toLocaleDateString('en-GB')}</div>}
                                    </td>
                                    <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1">
                                            {(po.status === 'Pending Review' || po.status === 'Approved' || po.status === 'Draft') && (
                                                <button onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    setShowMarkPaid(po); 
                                                    setPaidDate(toLocalDateStr(new Date())); 
                                                    setPaidAccountId(po.bank_account_id || ''); 
                                                    setPaidNotes('');
                                                    const cardExpenseItem = po.fin_payment_order_items?.find(i => i.corporate_card_expense_id)?.fin_corporate_card_expenses;
                                                    let initialAmount = po.total_amount;
                                                    if (cardExpenseItem && cardExpenseItem.currency !== currency) {
                                                        const rate = exchangeRates[cardExpenseItem.currency];
                                                        if (rate && rate > 0) {
                                                            initialAmount = Math.round(cardExpenseItem.amount / rate);
                                                        }
                                                    }
                                                    setPaidFinalAmountVND(initialAmount);
                                                    setPaidFinalAmountVNDStr(initialAmount.toLocaleString('en-US'));
                                                }}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1" title="Mark Paid">
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> {t(language, 'FinPayMarkPaid')}
                                                </button>
                                            )}
                                            {po.status === 'Paid' && (
                                                <button onClick={(e) => { e.stopPropagation(); handleUndoPayment(po); }}
                                                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1" title="Undo Payment">
                                                    <ArrowLeftRight className="w-3.5 h-3.5" /> {t(language, 'FinPayUndo')}
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
                            <h2 className="text-xl font-bold text-slate-900">
                                {editingOrderId ? (language === 'vi' ? 'Sửa lệnh chi' : 'Edit Payment Order') : t(language, 'FinPayCreateOrder')}
                            </h2>
                            <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        {/* Tabs */}
                        <div className="flex border-b border-slate-100 px-5 gap-6 bg-slate-50">
                            <button onClick={() => setCreateTab('invoices')} className={`pt-4 pb-3 text-sm font-semibold border-b-2 transition ${createTab === 'invoices' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                                {t(language, 'FinPayInvoices')} ({selectedInvoiceIds.size})
                            </button>
                            <button onClick={() => setCreateTab('manual')} className={`pt-4 pb-3 text-sm font-semibold border-b-2 transition ${createTab === 'manual' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                                {t(language, 'FinPayOtherPayments')} ({manualItems.filter(m => m.description && m.amount > 0).length})
                            </button>
                            <button onClick={() => setCreateTab('transfer')} className={`pt-4 pb-3 text-sm font-semibold border-b-2 transition ${createTab === 'transfer' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                                {language === 'vi' ? 'Chuyển khoản nội bộ' : 'Internal Transfer'}
                            </button>
                        </div>
                        <div className="px-5 pt-4 pb-2 flex justify-end bg-white border-b border-slate-50">
                            <button onClick={() => handleCreateOrder(true)} disabled={saving || isFormInvalid}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-50 transition">
                                {t(language, 'FinPaySaveAsDraft')}
                            </button>
                        </div>
                        <div className="px-5 pt-3 pb-5 border-b border-slate-100 bg-white">
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                {t(language, 'FinPayPayFromAccount')} <span className="text-red-500">*</span>
                            </label>
                            <select value={createAccountId} onChange={e => setCreateAccountId(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 font-medium">
                                <option value="" disabled>{language === 'vi' ? 'Chọn tài khoản ngân hàng...' : 'Select bank account...'}</option>
                                {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.account_number ? `${a.account_number} - ` : ''}{a.account_name} {a.bank_name ? `(${a.bank_name})` : ''}</option>)}
                            </select>
                            {selectedCreateAccount && (
                                <div className="mt-2 text-xs text-slate-500 flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                                    <span>{t(language, 'FinPayCurrentBalance')}</span>
                                    <span className="font-bold text-slate-900 tabular-nums">{fmt(Number(selectedCreateAccount.current_balance))} {selectedCreateAccount.currency || currency}</span>
                                </div>
                            )}
                        </div>
                        <div className="p-5 max-h-[50vh] overflow-y-auto space-y-5">
                            {createTab === 'invoices' && (
                            <div className="space-y-4">
                                {/* Section 1: Invoices header and Search */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-blue-500" /> {t(language, 'FinPayInvoices')}
                                    </h3>
                                    <div className="flex items-center gap-3">
                                        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer font-medium select-none">
                                            <input 
                                                type="checkbox" 
                                                checked={showOnlySelectedInvoices} 
                                                onChange={e => setShowOnlySelectedInvoices(e.target.checked)} 
                                                className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 bg-white" 
                                            />
                                            {language === 'vi' ? 'Đã chọn' : 'Selected only'} ({selectedInvoiceIds.size})
                                        </label>
                                    </div>
                                </div>

                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input 
                                        type="text" 
                                        placeholder={language === 'vi' ? 'Tìm hóa đơn (số, nhà cung cấp, mô tả)...' : 'Search invoices (number, supplier, desc)...'} 
                                        value={invoiceSearch} 
                                        onChange={e => setInvoiceSearch(e.target.value)}
                                        className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm text-slate-900 shadow-sm" 
                                    />
                                    {invoiceSearch && (
                                        <button 
                                            type="button" 
                                            onClick={() => setInvoiceSearch('')} 
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 hover:bg-slate-100 rounded-full"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                {filteredAvailableInvoices.length === 0 ? (
                                    <div className="text-center text-slate-400 py-8 text-sm border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                        {invoiceSearch || showOnlySelectedInvoices ? (
                                            language === 'vi' ? 'Không tìm thấy hóa đơn nào phù hợp với bộ lọc' : 'No invoices matched your filters'
                                        ) : (
                                            language === 'vi' ? 'Không có hóa đơn chờ thanh toán' : 'No pending invoices'
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                                        {filteredAvailableInvoices.map(inv => (
                                            <label key={inv.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${selectedInvoiceIds.has(inv.id) ? 'border-blue-300 bg-blue-50/70 shadow-sm' : 'border-slate-200 hover:border-blue-200 hover:bg-slate-50/30'}`}>
                                                <input type="checkbox" checked={selectedInvoiceIds.has(inv.id)} onChange={() => toggleInvoice(inv.id)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 bg-white" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-slate-800 text-sm flex items-center gap-2 flex-wrap">
                                                        <span>{inv.invoice_number}</span>
                                                        <span className="text-slate-300">•</span>
                                                        <span className="text-slate-600 font-medium text-xs">{(inv as any).suppliers?.name || inv.custom_supplier_name || t(language, 'FinCCModalUnassigned')}</span>
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-0.5 truncate">{inv.description || (language === 'vi' ? 'Không có mô tả' : 'No description')}</div>
                                                    <div className="text-[10px] text-slate-400 mt-0.5">{new Date(inv.invoice_date).toLocaleDateString('en-GB')}</div>
                                                </div>
                                                <div className="font-bold text-slate-900 tabular-nums text-sm text-right shrink-0">
                                                    {fmt(getInvoiceBalance(inv))} {inv.currency || currency}
                                                </div>
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
                                        <Briefcase className="w-4 h-4" /> {t(language, 'FinPayOtherPayments')}
                                    </h3>
                                    <button type="button" onClick={addManualItem}
                                        className="text-blue-600 hover:text-blue-800 text-xs font-semibold flex items-center gap-1 transition">
                                        <PlusCircle className="w-3.5 h-3.5" /> {t(language, 'FinPayAddItem')}
                                    </button>
                                </div>
                                <p className="text-xs text-slate-500 mb-3">{t(language, 'FinPayManualDesc')}</p>
                                {manualItems.length === 0 ? (
                                    <div className="text-center text-slate-400 py-4 text-sm border border-dashed border-slate-200 rounded-xl">{t(language, 'FinPayNoManualItems')}</div>
                                ) : (
                                    <div className="space-y-2">
                                        {manualItems.map(m => (
                                            <div key={m.id} className="flex items-start gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                                                <div className="flex-1 space-y-2">
                                                    <div className="flex gap-2">
                                                        <div className="flex-1">
                                                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                                                {t(language, 'FinInvDescription')} <span className="text-red-500">*</span>
                                                            </label>
                                                            <input type="text" placeholder={t(language, 'FinPayDescriptionPlaceholder')} value={m.description}
                                                                onChange={e => updateManualItem(m.id, 'description', e.target.value)}
                                                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 bg-white" />
                                                        </div>
                                                        <div className="w-40 sm:w-48">
                                                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                                                {t(language, 'Amount')} <span className="text-red-500">*</span>
                                                            </label>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-xs">{currency}</span>
                                                                <input type="text" placeholder="0" value={m.amountStr !== undefined ? m.amountStr : (m.amount ? m.amount.toLocaleString('en-US') : '')}
                                                                    onChange={e => {
                                                                        const clean = e.target.value.replace(/[^0-9]/g, '');
                                                                        const num = parseInt(clean, 10);
                                                                        updateManualItem(m.id, 'amount', isNaN(num) ? 0 : num);
                                                                        updateManualItem(m.id, 'amountStr', isNaN(num) ? '' : num.toLocaleString('en-US'));
                                                                    }}
                                                                    className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm text-right tabular-nums focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 font-bold bg-white" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <div className="flex-1">
                                                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                                                {t(language, 'Supplier')} <span className="text-red-500">*</span>
                                                            </label>
                                                            <SupplierCombobox
                                                                suppliers={suppliers}
                                                                selectedId={m.supplier_id || null}
                                                                onChange={(id) => updateManualItem(m.id, 'supplier_id', id || '')}
                                                                onAddNew={(query) => {
                                                                    setSupplierModalQuery(query)
                                                                    setSupplierModalForId(m.id)
                                                                }}
                                                                placeholder={t(language, 'FinPaySelectSupplier')}
                                                            />
                                                        </div>
                                                        <div className="flex-1 min-w-[200px]">
                                                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                                                {t(language, 'FinInvCategory')} <span className="text-red-500">*</span>
                                                            </label>
                                                            <COACombobox
                                                                coas={coaAccounts}
                                                                value={m.account_id}
                                                                onChange={val => updateManualItem(m.id, 'account_id', val)}
                                                                placeholder={t(language, 'FinPayAccountCategory')}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="mt-2 flex items-center bg-white px-3 py-2 rounded-lg border border-slate-200">
                                                        <div className="flex items-center gap-3 w-full">
                                                            <div
                                                                onClick={() => updateManualItem(m.id, 'requires_invoice', !m.requires_invoice)}
                                                                className={`w-10 h-5 flex shrink-0 items-center rounded-full p-1 cursor-pointer transition-colors ${m.requires_invoice ? 'bg-blue-600' : 'bg-slate-300'}`}
                                                            >
                                                                <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${m.requires_invoice ? 'translate-x-5' : 'translate-x-0'}`} />
                                                            </div>
                                                            <span className="text-sm font-semibold text-slate-800">{t(language, 'FinPayExpectedVatInvoice')}</span>
                                                        </div>
                                                    </div>
                                                    <div className="mt-2">
                                                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                                                            {t(language, 'FinInvBranchAllocation')} <span className="text-red-500">*</span>
                                                        </label>
                                                        <div className="flex flex-wrap gap-2">
                                                            <button type="button" onClick={() => updateManualItem(m.id, 'branch_ids', branches.filter(b => (b as any).is_active !== false).map(b => b.id))} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 rounded-md border border-slate-200 transition">
                                                                {t(language, 'FinInvSelectAll')}
                                                            </button>
                                                            <button type="button" onClick={() => updateManualItem(m.id, 'branch_ids', [])} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 rounded-md border border-slate-200 transition">
                                                                {t(language, 'FinInvClear')}
                                                            </button>
                                                            {branches.filter(b => (b as any).is_active !== false || m.branch_ids.includes(b.id)).map(b => (
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
                            {createTab === 'transfer' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{language === 'vi' ? 'Tài khoản nhận *' : 'Destination Account *'}</label>
                                        <select value={transferDestinationAccountId} onChange={e => setTransferDestinationAccountId(e.target.value)}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 font-medium">
                                            <option value="">{language === 'vi' ? 'Chọn tài khoản nhận...' : 'Select destination account...'}</option>
                                            {bankAccounts.map(a => (
                                                <option key={a.id} value={a.id}>
                                                    {a.account_number ? `${a.account_number} - ` : ''}{a.account_name} {a.bank_name ? `(${a.bank_name})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{language === 'vi' ? 'Số tiền chuyển *' : 'Transfer Amount *'}</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">{currency}</span>
                                            <input type="text" required placeholder="0" value={transferAmountStr} onChange={e => {
                                                const clean = e.target.value.replace(/[^0-9]/g, '');
                                                const num = parseInt(clean, 10);
                                                setTransferAmount(isNaN(num) ? 0 : num);
                                                setTransferAmountStr(isNaN(num) ? '' : num.toLocaleString('en-US'));
                                            }} className="w-full border border-slate-200 rounded-xl pl-12 pr-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 font-bold tabular-nums text-right" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinInvDescription')}</label>
                                        <textarea rows={3} placeholder={language === 'vi' ? 'Mô tả chuyển khoản...' : 'Transfer description...'} value={transferDescription} onChange={e => setTransferDescription(e.target.value)}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm resize-none text-slate-900" />
                                    </div>
                                    <div className="space-y-3 pt-1">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={hasTransferFee} 
                                                onChange={e => {
                                                    const active = e.target.checked;
                                                    setHasTransferFee(active);
                                                    if (active) {
                                                        const sourceAcc = bankAccounts.find(a => a.id === createAccountId);
                                                        const defaultFee = sourceAcc?.bank_transfer_fee ? Number(sourceAcc.bank_transfer_fee) : 0;
                                                        setTransferFeeAmount(defaultFee);
                                                        setTransferFeeAmountStr(defaultFee > 0 ? defaultFee.toLocaleString('en-US') : '');
                                                    } else {
                                                        setTransferFeeAmount(0);
                                                        setTransferFeeAmountStr('');
                                                    }
                                                }}
                                                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 bg-white"
                                            />
                                            <span className="text-sm font-semibold text-slate-900">
                                                {language === 'vi' ? 'Áp dụng phí chuyển khoản' : 'Apply Bank Transfer Fee'}
                                            </span>
                                        </label>
                                        
                                        {hasTransferFee && (
                                            <div className="pl-6 space-y-1">
                                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                                    {language === 'vi' ? `Phí chuyển khoản (${currency})` : `Bank Transfer Fee (${currency})`}
                                                </label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">{currency}</span>
                                                    <input 
                                                        type="text" 
                                                        placeholder="0" 
                                                        value={transferFeeAmountStr} 
                                                        onChange={e => {
                                                            const clean = e.target.value.replace(/[^0-9]/g, '');
                                                            const num = parseInt(clean, 10);
                                                            setTransferFeeAmount(isNaN(num) ? 0 : num);
                                                            setTransferFeeAmountStr(isNaN(num) ? '' : num.toLocaleString('en-US'));
                                                        }} 
                                                        className="w-full border border-indigo-200 bg-indigo-50/50 rounded-xl pl-12 pr-4 py-2.5 text-indigo-900 font-bold tabular-nums text-right focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-sm" 
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-between p-5 border-t border-slate-100 bg-slate-50">
                            <div className="flex items-baseline gap-4">
                                <span className="text-sm text-slate-600">
                                    {createTab === 'transfer' ? (
                                        language === 'vi' ? 'Chuyển khoản nội bộ' : 'Internal Transfer'
                                    ) : (
                                        <>
                                            {selectedInvoiceIds.size} {selectedInvoiceIds.size === 1 ? t(language, 'FinPayInvoiceSingular') : t(language, 'FinPayInvoicePlural')}
                                            {manualItems.filter(m => m.description && m.amount > 0).length > 0 ? ` ${t(language, 'FinPayManualItemsCount').replace('{n}', String(manualItems.filter(m => m.description && m.amount > 0).length))}` : ''}
                                        </>
                                    )}
                                </span>
                                <span className="text-lg font-black text-slate-900 tabular-nums">{currency} {fmt(displayTotal)}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition">{t(language, 'Cancel')}</button>
                                <button onClick={() => handleCreateOrder(false)} disabled={saving || isFormInvalid}
                                    className="px-4 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl shadow-md transition flex items-center gap-2">
                                    {saving && <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    {editingOrderId ? (language === 'vi' ? 'Cập nhật lệnh' : 'Update Order') : (language === 'vi' ? 'Tạo lệnh chi' : 'Create Order')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {showDetail && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden">
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
                                    <div className="text-sm text-blue-700 font-medium">{t(language, 'FinPayTotalAmount')}</div>
                                    <div className="text-2xl font-black text-blue-900 tabular-nums">
                                        {(() => {
                                            const cardExpenseItem = showDetail.fin_payment_order_items?.find(i => i.corporate_card_expense_id)?.fin_corporate_card_expenses
                                            if (cardExpenseItem && cardExpenseItem.currency !== currency) {
                                                return (
                                                    <div>
                                                        <div>{currency} {fmt(Number(showDetail.total_amount))}</div>
                                                        <div className="text-xs font-semibold text-slate-500 mt-1">Original: {cardExpenseItem.amount} {cardExpenseItem.currency}</div>
                                                    </div>
                                                )
                                            }
                                            return `${currency} ${fmt(Number(showDetail.total_amount))}`
                                        })()}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${(PAYMENT_ORDER_STATUS_STYLES[showDetail.status] || {}).bg} ${(PAYMENT_ORDER_STATUS_STYLES[showDetail.status] || {}).text}`}>
                                        {translateStatus(showDetail.status)}
                                    </span>
                                </div>
                            </div>
                                {(() => {
                                    const items = showDetail.fin_payment_order_items || []
                                    const isFeeItem = (i: any) => i.description === 'Online Payment / Bank Fee' || i.description?.startsWith('Bank Fee for ')
                                    const feeItems = items.filter(isFeeItem)
                                    const invItems = items.filter(i => (i.item_type === 'invoice' || i.invoice_id) && !isFeeItem(i))
                                    const mainManItems = items.filter(i => i.item_type === 'manual' && !i.invoice_id && !isFeeItem(i))
                                    
                                    const unmatchedFees = feeItems.filter(f => 
                                        !invItems.some(i => f.description === `Bank Fee for ${i.fin_invoices?.invoice_number}`) && 
                                        !mainManItems.some(i => f.description === `Bank Fee for ${i.description}`)
                                    )

                                    return (
                                        <>
                                            {showDetail.destination_account_id ? (
                                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
                                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{language === 'vi' ? 'Chi tiết chuyển khoản nội bộ' : 'Internal Transfer Details'}</h3>
                                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2">
                                                        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm w-full sm:w-5/12 text-center">
                                                            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{language === 'vi' ? 'Tài khoản chuyển' : 'Source Account'}</span>
                                                            <span className="font-bold text-slate-900 text-sm block">{showDetail.fin_bank_accounts?.account_name || '—'}</span>
                                                            {showDetail.fin_bank_accounts?.bank_name && <span className="text-xs text-slate-500 block mt-0.5">{showDetail.fin_bank_accounts.bank_name}</span>}
                                                        </div>
                                                        
                                                        <div className="flex flex-col items-center shrink-0">
                                                            <ArrowLeftRight className="w-6 h-6 text-blue-600 animate-pulse" />
                                                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mt-1">{language === 'vi' ? 'Chuyển tiền' : 'Transfer'}</span>
                                                        </div>
                                                        
                                                        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm w-full sm:w-5/12 text-center">
                                                            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{language === 'vi' ? 'Tài khoản nhận' : 'Destination Account'}</span>
                                                            <span className="font-bold text-blue-600 text-sm block">{showDetail.destination_bank_account?.account_name || '—'}</span>
                                                            {showDetail.destination_bank_account?.bank_name && <span className="text-xs text-slate-500 block mt-0.5">{showDetail.destination_bank_account.bank_name}</span>}
                                                        </div>
                                                    </div>
                                                    {(() => {
                                                        const feeItem = (showDetail.fin_payment_order_items || []).find(i => i.account_id !== null);
                                                        if (!feeItem) return null;
                                                        return (
                                                            <div className="pt-3 border-t border-slate-200 flex justify-between items-center text-sm">
                                                                <span className="text-slate-500 font-semibold">{language === 'vi' ? 'Phí chuyển khoản nội bộ' : 'Bank Fee for Internal Transfer'}:</span>
                                                                <span className="font-bold text-slate-900 tabular-nums">{currency} {fmt(Number(feeItem.amount))}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            ) : (
                                                <>
                                                    {invItems.length > 0 && (
                                                        <>
                                                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t(language, 'FinPayInvoicesIncluded')}</h3>
                                                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                                                <table className="w-full text-sm">
                                                                    <thead><tr className="bg-slate-50 text-xs text-slate-500 uppercase"><th className="p-3 text-left">{language === 'vi' ? 'Hóa đơn' : 'Invoice'}</th><th className="p-3 text-left">{t(language, 'FinInvSupplier')}</th><th className="p-3 text-left">{t(language, 'FinInvCategory')}</th><th className="p-3 text-left">{t(language, 'FinPayExpectedVatInvoiceCol')}</th><th className="p-3 text-right">{language === 'vi' ? 'Số tiền' : 'Amount'}</th></tr></thead>
                                                                    <tbody className="divide-y divide-slate-100">
                                                                        {invItems.map(item => {
                                                                            const feeName = `Bank Fee for ${item.fin_invoices?.invoice_number}`
                                                                            const matchedFee = feeItems.find(f => f.description === feeName)
                                                                            return (
                                                                                <Fragment key={item.id}>
                                                                                    <tr>
                                                                                        <td className="p-3 font-semibold text-slate-800">{item.fin_invoices?.invoice_number || '—'}</td>
                                                                                        <td className="p-3 text-slate-600">{(item.fin_invoices as any)?.suppliers?.name || (item.fin_invoices as any)?.custom_supplier_name || '—'}</td>
                                                                                        <td className="p-3 text-slate-600 text-sm">{item.fin_chart_of_accounts ? `${item.fin_chart_of_accounts.code} - ${item.fin_chart_of_accounts.name}` : <span className="italic text-slate-400">{t(language, 'FinPayUncategorized')}</span>}</td>
                                                                                        <td className="p-3">
                                                                                            <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wider">{t(language, 'FinPayIssued')}</span>
                                                                                        </td>
                                                                                        <td className="p-3 text-right tabular-nums font-bold text-slate-900">{fmt(Number(item.amount))}</td>
                                                                                    </tr>
                                                                                    {matchedFee && (
                                                                                        <tr className="bg-slate-50/30">
                                                                                            <td className="p-3 pl-8 text-sm text-slate-500 border-l-2 border-slate-200 flex items-center gap-2">
                                                                                                <span className="text-slate-300">↳</span> {t(language, 'FinPayBankFee')}
                                                                                            </td>
                                                                                            <td className="p-3"></td>
                                                                                            <td className="p-3 text-slate-500 text-sm">
                                                                                                {matchedFee.fin_chart_of_accounts ? `${matchedFee.fin_chart_of_accounts.code} - ${matchedFee.fin_chart_of_accounts.name}` : <span className="italic text-slate-400">{t(language, 'FinPayUncategorized')}</span>}
                                                                                            </td>
                                                                                            <td className="p-3"></td>
                                                                                            <td className="p-3 text-right tabular-nums text-slate-600">{fmt(Number(matchedFee.amount))}</td>
                                                                                        </tr>
                                                                                    )}
                                                                                </Fragment>
                                                                            )
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </>
                                                    )}
                                                    {(mainManItems.length > 0 || unmatchedFees.length > 0) && (
                                                        <>
                                                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4">{t(language, 'FinPayOtherPayments')}</h3>
                                                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                                                <table className="w-full text-sm">
                                                                    <thead><tr className="bg-slate-50 text-xs text-slate-500 uppercase"><th className="p-3 text-left">{t(language, 'FinInvDescription')}</th><th className="p-3 text-left">{language === 'vi' ? 'Tài khoản' : 'Account'}</th><th className="p-3 text-left">{t(language, 'FinInvBranch')}</th><th className="p-3 text-left">{t(language, 'FinPayExpectedVatInvoiceCol')}</th><th className="p-3 text-right">{language === 'vi' ? 'Số tiền' : 'Amount'}</th></tr></thead>
                                                                    <tbody className="divide-y divide-slate-100">
                                                                        {mainManItems.map(item => {
                                                                            const feeName = `Bank Fee for ${item.description}`
                                                                            const matchedFee = feeItems.find(f => f.description === feeName)
                                                                            return (
                                                                                <Fragment key={item.id}>
                                                                                    <tr>
                                                                                        <td className="p-3 font-semibold text-slate-800">{item.description || '—'}</td>
                                                                                        <td className="p-3 text-slate-600">{item.fin_chart_of_accounts ? `${item.fin_chart_of_accounts.code} - ${item.fin_chart_of_accounts.name}` : '—'}</td>
                                                                                        <td className="p-3 text-slate-600">
                                                                                            {(!item.branch_ids || item.branch_ids.length === 0) ? (
                                                                                                <span className="text-slate-500 italic text-xs">{t(language, 'FinInvGeneral')}</span>
                                                                                            ) : (
                                                                                                <div className="flex flex-wrap gap-1">
                                                                                                    {item.branch_ids.map(bId => {
                                                                                                        const bName = branches.find(b => b.id === bId)?.name || bId
                                                                                                        return (
                                                                                                            <span key={bId} className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 border border-blue-200 text-blue-700 whitespace-nowrap">
                                                                                                                {bName}
                                                                                                            </span>
                                                                                                        )
                                                                                                    })}
                                                                                                </div>
                                                                                            )}
                                                                                        </td>
                                                                                        <td className="p-3">
                                                                                            {item.invoice_id ? (
                                                                                                <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wider">{t(language, 'FinPayIssued')}</span>
                                                                                            ) : item.requires_invoice ? (
                                                                                                <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 uppercase tracking-wider">{t(language, 'FinPayPending')}</span>
                                                                                            ) : (
                                                                                                <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 uppercase tracking-wider">{t(language, 'FinPayNone')}</span>
                                                                                            )}
                                                                                        </td>
                                                                                        <td className="p-3 text-right tabular-nums font-bold text-slate-900">
                                                                                            {item.fin_corporate_card_expenses && item.fin_corporate_card_expenses.currency !== currency ? (
                                                                                                <div>
                                                                                                    <div>{fmt(Number(item.amount))} {currency}</div>
                                                                                                    <div className="text-xs text-slate-400 font-medium">{item.fin_corporate_card_expenses.amount} {item.fin_corporate_card_expenses.currency}</div>
                                                                                                </div>
                                                                                            ) : (
                                                                                                fmt(Number(item.amount))
                                                                                            )}
                                                                                        </td>
                                                                                    </tr>
                                                                                    {matchedFee && (
                                                                                        <tr className="bg-slate-50/30">
                                                                                            <td className="p-3 pl-8 text-sm text-slate-500 border-l-2 border-slate-200 flex items-center gap-2">
                                                                                                <span className="text-slate-300">↳</span> {t(language, 'FinPayBankFee')}
                                                                                            </td>
                                                                                            <td className="p-3 text-slate-500 text-sm">
                                                                                                {matchedFee.fin_chart_of_accounts ? `${matchedFee.fin_chart_of_accounts.code} - ${matchedFee.fin_chart_of_accounts.name}` : <span className="italic text-slate-400">{t(language, 'FinPayUncategorized')}</span>}
                                                                                            </td>
                                                                                            <td colSpan={2}></td>
                                                                                            <td className="p-3 text-right tabular-nums text-slate-600">{fmt(Number(matchedFee.amount))}</td>
                                                                                        </tr>
                                                                                    )}
                                                                                </Fragment>
                                                                            )
                                                                        })}
                                                                        {unmatchedFees.map(item => (
                                                                            <tr key={item.id} className="bg-slate-50/30">
                                                                                <td className="p-3 font-medium text-slate-600 italic">{item.description || t(language, 'FinPayGeneralBankFee')}</td>
                                                                                <td className="p-3 text-slate-500">{item.fin_chart_of_accounts ? `${item.fin_chart_of_accounts.code} - ${item.fin_chart_of_accounts.name}` : <span className="italic text-slate-400">{t(language, 'FinPayUncategorized')}</span>}</td>
                                                                                <td className="p-3 text-slate-500">
                                                                                    {(!item.branch_ids || item.branch_ids.length === 0) ? (
                                                                                        <span className="text-slate-500 italic text-xs">{t(language, 'FinInvGeneral')}</span>
                                                                                    ) : (
                                                                                        <div className="flex flex-wrap gap-1">
                                                                                            {item.branch_ids.map(bId => {
                                                                                                const bName = branches.find(b => b.id === bId)?.name || bId
                                                                                                return (
                                                                                                    <span key={bId} className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 border border-blue-200 text-blue-700 whitespace-nowrap">
                                                                                                        {bName}
                                                                                                    </span>
                                                                                                )
                                                                                            })}
                                                                                        </div>
                                                                                    )}
                                                                                </td>
                                                                                <td className="p-3">
                                                                                    <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 uppercase tracking-wider">{t(language, 'FinPayNone')}</span>
                                                                                </td>
                                                                                <td className="p-3 text-right tabular-nums font-medium text-slate-700">{fmt(Number(item.amount))}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </>
                                    )
                                })()}
                            {showDetail.notes && <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">{showDetail.notes}</div>}
                        </div>
                        <div className="p-5 border-t border-slate-100 flex justify-end">
                            <button onClick={() => setShowDetail(null)} className="px-5 py-2.5 text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-md">{language === 'vi' ? 'Đóng' : 'Close'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mark Paid Modal */}
            {showMarkPaid && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 flex-shrink-0">
                            <h2 className="text-xl font-bold text-slate-900">{t(language, 'FinPayMarkAsPaid')}</h2>
                            <button onClick={() => setShowMarkPaid(null)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleMarkPaid} className="p-5 space-y-4 overflow-y-auto">
                            <div className="bg-blue-50 p-4 rounded-xl flex justify-between items-center border border-blue-100 flex-shrink-0">
                                <div className="text-sm font-medium text-blue-800">{t(language, 'FinPayOrderLabel')} <span className="font-bold">{showMarkPaid.order_number}</span></div>
                                <div className="text-lg font-black text-blue-900 tabular-nums">
                                    {fmt(paidFinalAmountVND + Object.values(itemFees).reduce((a,b)=>a+b, 0))} {currency}
                                </div>
                            </div>
                            
                            {(() => {
                                const cardExpenseItem = showMarkPaid.fin_payment_order_items?.find(i => i.corporate_card_expense_id)?.fin_corporate_card_expenses
                                if (cardExpenseItem && cardExpenseItem.currency !== currency) {
                                    return (
                                        <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 flex justify-between items-center text-sm flex-shrink-0 mb-3">
                                            <span className="font-semibold text-amber-800">{language === 'vi' ? 'Số tiền gốc:' : 'Original Amount:'}</span>
                                            <span className="font-bold text-amber-900">{cardExpenseItem.amount} {cardExpenseItem.currency}</span>
                                        </div>
                                    )
                                }
                                return null
                            })()}
                            
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                                {(showMarkPaid.is_variable_amount || showMarkPaid.is_online_payment || showMarkPaid.fin_payment_order_items?.some(i => i.corporate_card_expense_id && i.fin_corporate_card_expenses && i.fin_corporate_card_expenses.currency !== currency)) && (
                                    <>
                                        <div className="text-sm font-semibold text-slate-800 mb-2 border-b border-slate-200 pb-2">{t(language, 'FinPayFinalAmountAdjustments')}</div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1">{language === 'vi' ? `Số tiền cơ bản cuối cùng (${currency})` : `Final Base Amount (${currency})`}</label>
                                            <input type="text" required value={paidFinalAmountVNDStr} onChange={e => {
                                                const clean = e.target.value.replace(/[^0-9]/g, '');
                                                const num = parseInt(clean, 10);
                                                setPaidFinalAmountVND(isNaN(num) ? 0 : num);
                                                setPaidFinalAmountVNDStr(isNaN(num) ? '' : num.toLocaleString('en-US'));
                                            }} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm tabular-nums text-slate-900" />
                                            {(() => {
                                                const cardExpenseItem = showMarkPaid.fin_payment_order_items?.find(i => i.corporate_card_expense_id)?.fin_corporate_card_expenses
                                                if (cardExpenseItem && cardExpenseItem.currency !== currency && exchangeRates[cardExpenseItem.currency]) {
                                                    return (
                                                        <div className="mt-1.5 text-xs text-amber-600 font-semibold leading-normal">
                                                            {language === 'vi' 
                                                                ? `Tỷ giá hiện tại: 1 ${cardExpenseItem.currency} = ${fmt(Math.round(1 / exchangeRates[cardExpenseItem.currency]))} VND. Vui lòng điều chỉnh số tiền thực tế theo sao kê ngân hàng.` 
                                                                : `Current rate: 1 ${cardExpenseItem.currency} = ${fmt(Math.round(1 / exchangeRates[cardExpenseItem.currency]))} VND. Please adjust to match your bank statement.`}
                                                        </div>
                                                    )
                                                }
                                                return null
                                            })()}
                                        </div>
                                    </>
                                )}
                                
                                {showMarkPaid.is_online_payment ? (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">{language === 'vi' ? `Phí thanh toán trực tuyến (${currency})` : `Online Payment Fee (${currency})`}</label>
                                    <input type="text" value={paidFeeVNDStr} onChange={e => {
                                        const clean = e.target.value.replace(/[^0-9]/g, '');
                                        const num = parseInt(clean, 10);
                                        const finalNum = isNaN(num) ? 0 : num;
                                        setPaidFeeVND(finalNum);
                                        setPaidFeeVNDStr(isNaN(num) ? '' : num.toLocaleString('en-US'));
                                        if (showMarkPaid.fin_payment_order_items) {
                                            const updatedFees: Record<string, number> = {};
                                            showMarkPaid.fin_payment_order_items.forEach(it => { updatedFees[it.id] = finalNum });
                                            setItemFees(updatedFees);
                                        }
                                    }} placeholder="0" className="w-full border border-indigo-200 bg-indigo-50/50 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-sm tabular-nums text-indigo-900" />
                                </div>
                                ) : (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">{language === 'vi' ? `Phí chuyển khoản (${currency})` : `Bank Transfer Fee (${currency})`}</label>
                                    <input type="text" value={paidFeeVNDStr} onChange={e => {
                                        const clean = e.target.value.replace(/[^0-9]/g, '');
                                        const num = parseInt(clean, 10);
                                        const finalNum = isNaN(num) ? 0 : num;
                                        setPaidFeeVND(finalNum);
                                        setPaidFeeVNDStr(isNaN(num) ? '' : num.toLocaleString('en-US'));
                                        if (showMarkPaid.fin_payment_order_items) {
                                            const updatedFees: Record<string, number> = {};
                                            showMarkPaid.fin_payment_order_items.forEach(it => { updatedFees[it.id] = finalNum });
                                            setItemFees(updatedFees);
                                        }
                                    }} placeholder="0" className="w-full border border-indigo-200 bg-indigo-50/50 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-sm tabular-nums text-indigo-900" />
                                </div>
                                )}
                                <div className="mt-1.5 flex justify-end">
                                    <button type="button" onClick={() => setShowFeeBreakdown(true)} className="text-sm text-indigo-600 hover:text-indigo-800 font-bold hover:underline transition">
                                        {language === 'vi' ? 'Tổng phí:' : 'Total Fees:'} {fmt(Object.values(itemFees).reduce((a,b)=>a+b, 0))} {currency}
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{language === 'vi' ? 'Ngày tạo' : 'Creation Date'}</label>
                                    <div className="w-full border-none bg-slate-50 rounded-xl px-4 py-2.5 text-slate-500 font-medium">
                                        {new Date(showMarkPaid.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">{language === 'vi' ? 'Ngày thanh toán *' : 'Payment Date *'}</label>
                                    <input type="date" required value={paidDate} onChange={e => setPaidDate(e.target.value)}
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 font-medium" />
                                </div>
                            </div>

                            <div className="pt-2">
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{language === 'vi' ? 'Từ tài khoản' : 'From Account'}</label>
                                {showMarkPaid.bank_account_id && selectedPaidAccount ? (
                                    <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-slate-900">{selectedPaidAccount.account_name}</div>
                                                <div className="text-xs text-slate-500 font-medium">{selectedPaidAccount.bank_name || 'Bank Account'}</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-slate-400 font-medium mb-0.5">{t(language, 'FinPayCurrentBalance')}</div>
                                            <div className="text-sm font-bold text-slate-900 tabular-nums">{fmt(Number(selectedPaidAccount.current_balance))} {selectedPaidAccount.currency || currency}</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <select value={paidAccountId} onChange={e => setPaidAccountId(e.target.value)}
                                            className="w-full border-none bg-transparent text-blue-600 font-semibold cursor-pointer focus:ring-0 px-0 py-2 hover:underline">
                                            <option value="" className="text-slate-500">{language === 'vi' ? 'Chọn tài khoản để chi...' : 'Select an account to pay from...'}</option>
                                            {bankAccounts.map(a => <option key={a.id} value={a.id} className="text-slate-900">{a.account_number ? `${a.account_number} - ` : ''}{a.account_name} {a.bank_name ? `(${a.bank_name})` : ''}</option>)}
                                        </select>
                                        {selectedPaidAccount && (
                                            <div className="mt-2 text-xs text-slate-500 flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                                                <span>{t(language, 'FinPayCurrentBalance')}</span>
                                                <span className="font-bold text-slate-900 tabular-nums">{fmt(Number(selectedPaidAccount.current_balance))} {selectedPaidAccount.currency || currency}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinInvNotes')}</label>
                                <textarea rows={2} value={paidNotes} onChange={e => setPaidNotes(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm resize-none text-slate-900" />
                            </div>
                            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                                <button type="button" onClick={() => setShowMarkPaid(null)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">{t(language, 'Cancel')}</button>
                                <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl shadow-md flex items-center gap-2">
                                    {saving && <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    <CheckCircle2 className="w-4 h-4" /> {language === 'vi' ? 'Xác nhận thanh toán' : 'Confirm Payment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showFeeBreakdown && showMarkPaid && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 flex-shrink-0">
                            <h2 className="text-xl font-bold text-slate-900">{language === 'vi' ? 'Chi tiết phí từng hạng mục' : 'Per-Item Fee Breakdown'}</h2>
                            <button onClick={() => setShowFeeBreakdown(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 overflow-y-auto space-y-3">
                            {(showMarkPaid.fin_payment_order_items || []).map(item => (
                                <div key={item.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <div className="text-sm font-semibold text-slate-700 truncate pr-4">
                                        {item.item_type === 'invoice' && item.fin_invoices ? item.fin_invoices.invoice_number : item.description}
                                    </div>
                                    <div className="w-32 flex-shrink-0">
                                        <div className="relative">
                                            <input type="text" value={itemFees[item.id] > 0 ? itemFees[item.id].toLocaleString('en-US') : itemFees[item.id] === 0 ? '0' : ''} onChange={e => {
                                                const clean = e.target.value.replace(/[^0-9]/g, '');
                                                const num = parseInt(clean, 10);
                                                const finalNum = isNaN(num) ? 0 : num;
                                                setItemFees(prev => ({ ...prev, [item.id]: finalNum }));
                                            }} className="w-full border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-sm tabular-nums text-indigo-900 text-sm pr-12 text-right" />
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">{currency}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-5 border-t border-slate-100 flex justify-between items-center bg-slate-50">
                            <div className="text-sm font-semibold text-slate-600">{language === 'vi' ? 'Tổng phí:' : 'Total Fees:'}</div>
                            <div className="text-lg font-black text-indigo-700 tabular-nums">{fmt(Object.values(itemFees).reduce((a,b)=>a+b, 0))} {currency}</div>
                        </div>
                    </div>
                </div>
            )}
            <AddSupplierModal
                isOpen={!!supplierModalForId}
                onClose={() => setSupplierModalForId(null)}
                initialName={supplierModalQuery}
                onSaved={(newSup) => {
                    setSuppliers(prev => [...prev, newSup].sort((a, b) => a.name.localeCompare(b.name)))
                    if (supplierModalForId) {
                        updateManualItem(supplierModalForId, 'supplier_id', newSup.id)
                    }
                    setSupplierModalForId(null)
                }}
            />
        </div>
    )
}
