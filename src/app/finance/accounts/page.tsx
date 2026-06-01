'use client'

import React, { useEffect, useState } from 'react'
import { Landmark, Plus, X, ArrowUpRight, ArrowDownRight, ArrowLeftRight, Pencil, Trash2, Briefcase, CircleDollarSign, CheckCircle2, ChevronLeft, ChevronRight, Search, Filter, MoreVertical, Wallet, AlertTriangle, CreditCard, Coins } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import type { FinBankAccount, FinBankTransaction, FinChartOfAccount } from '@/types/finance'
import { COACombobox } from '../components/COACombobox'
import { format } from 'date-fns'
import { t } from '@/lib/i18n'

function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

export default function BankAccountsPage() {
    const { currency, language } = useSettings()

    const getAccountTypeLabel = (type: string) => {
        if (type === 'Checking') return t(language, 'FinAccChecking')
        if (type === 'Saving') return t(language, 'FinAccSaving')
        if (type === 'Capital') return t(language, 'FinAccCapital')
        if (type === 'Cash') return t(language, 'FinAccCash')
        if (type === 'Wallet') return t(language, 'FinAccWallet')
        return type
    }
    const [loading, setLoading] = useState(true)
    const [accounts, setAccounts] = useState<FinBankAccount[]>([])
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    const [mappings, setMappings] = useState<any[]>([])
    const [selectedAccount, setSelectedAccount] = useState<FinBankAccount | null>(null)
    const [transactions, setTransactions] = useState<FinBankTransaction[]>([])
    const [loadingTx, setLoadingTx] = useState(false)
    const [dateRange, setDateRange] = useState({
        start: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`,
        end: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()).padStart(2, '0')}`
    })
    const [showCustomRange, setShowCustomRange] = useState(false)

    const renderDateRangeText = () => {
        const [sy, sm, sd] = dateRange.start.split('-')
        const [ey, em, ed] = dateRange.end.split('-')
        if (!sy || !ey) return '...'
        const lastDay = new Date(parseInt(ey), parseInt(em), 0).getDate()
        if (sy === ey && sm === em && sd === '01' && parseInt(ed) === lastDay) {
            return new Date(parseInt(sy), parseInt(sm) - 1, 1).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' })
        }
        const d1 = new Date(parseInt(sy), parseInt(sm) - 1, parseInt(sd)).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', day: 'numeric', year: '2-digit' })
        const d2 = new Date(parseInt(ey), parseInt(em) - 1, parseInt(ed)).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', day: 'numeric', year: '2-digit' })
        return `${d1} - ${d2}`
    }
    const [monthlyOpeningBalance, setMonthlyOpeningBalance] = useState<number | null>(null)
    const [monthlyClosingBalance, setMonthlyClosingBalance] = useState<number | null>(null)
    const [txSearch, setTxSearch] = useState('')
    const [txTypeFilter, setTxTypeFilter] = useState('All')
    const [txBranchFilter, setTxBranchFilter] = useState('All')

    // Modals
    const [showAddAccount, setShowAddAccount] = useState(false)
    const [editingAccount, setEditingAccount] = useState<FinBankAccount | null>(null)
    const [showAddTx, setShowAddTx] = useState(false)
    const [saving, setSaving] = useState(false)
    const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})

    const [activeTab, setActiveTab] = useState<'Bank' | 'Cash' | 'Wallet'>('Bank')
    const [syncWarnings, setSyncWarnings] = useState<string[]>([])

    const syncLock = React.useRef(false)

    const [coas, setCoas] = useState<FinChartOfAccount[]>([])

    // Account form
    const [accForm, setAccForm] = useState({ account_name: '', bank_name: '', account_number: '', account_type: 'Checking' as string, opening_balance: '', branch_id: '', notes: '', online_payment_fee: '0', bank_transfer_fee: '0', fee_account_id: '', currency: '', is_corporate_card: false, is_default_corporate_card: false })
    // Transaction form
    const [txForm, setTxForm] = useState({ type: 'Inflow' as string, category: '', description: '', amount: '', transaction_date: new Date().toISOString().split('T')[0], notes: '' })

    const isFormInvalid = React.useMemo(() => {
        if (!accForm.account_name.trim()) return true;

        const isBankType = accForm.account_type === 'Checking' || accForm.account_type === 'Saving' || accForm.account_type === 'Capital';
        if (isBankType) {
            if (!accForm.bank_name.trim()) return true;
            if (!accForm.account_number.trim()) return true;
        }

        const transferFee = parseFloat(String(accForm.bank_transfer_fee).replace(/,/g, '')) || 0;
        const onlineFee = parseFloat(String(accForm.online_payment_fee).replace(/,/g, '')) || 0;
        if (transferFee > 0 || onlineFee > 0) {
            if (!accForm.fee_account_id) return true;
        }

        return false;
    }, [accForm]);

    const fetchAccounts = async () => {
        setLoading(true)
        const [accRes, brRes, coaRes, mapRes] = await Promise.all([
            supabase.from('fin_bank_accounts').select('*, provider_branches(name)').order('account_name'),
            supabase.from('provider_branches').select('id, name, bank, account_number, bank_account_name').order('name'),
            supabase.from('fin_chart_of_accounts').select('*').eq('is_active', true).order('sort_order'),
            supabase.from('fin_revenue_channel_mapping').select('*')
        ])
        
        let fetchedAccounts = accRes.data as any[] || []
        const fetchedBranches = brRes.data as any[] || []
        const fetchedCoas = coaRes.data as FinChartOfAccount[] || []
        const fetchedMappings = mapRes.data as any[] || []
        setMappings(fetchedMappings)
        
        // Auto-sync missing branches into fin_bank_accounts
        if (!syncLock.current) {
            let needsRefresh = false
            const newAccs: any[] = []
            const warnings: string[] = []

            for (const b of fetchedBranches) {
                // 1. Check Main Checking Account
                const hasChecking = fetchedAccounts.some(a => a.branch_id === b.id && a.account_type !== 'Cash')
                if (!hasChecking) {
                    if (!b.bank || !b.account_number) {
                        warnings.push(t(language, 'FinAccAlertBranchMissingDetails').replace('{name}', b.name))
                    }
                    newAccs.push({
                        id: crypto.randomUUID(),
                        account_name: b.bank_account_name || `${b.name.split(' ').map((w: string) => w[0]?.toUpperCase()).join('')} (Pasta Fresca ${b.name})`,
                        bank_name: b.bank || null,
                        account_number: b.account_number || null,
                        account_type: 'Checking',
                        branch_id: b.id,
                        opening_balance: 0,
                        current_balance: 0,
                        currency: currency || 'VND'
                    })
                }

                // 2. Check Cash on Hand
                const hasCashOnHand = fetchedAccounts.some(a => a.branch_id === b.id && a.account_type === 'Cash' && a.account_name.startsWith('Cash on Hand'))
                if (!hasCashOnHand) {
                    newAccs.push({
                        id: crypto.randomUUID(),
                        account_name: `Cash on Hand - ${b.name}`,
                        account_type: 'Cash',
                        branch_id: b.id,
                        opening_balance: 0,
                        current_balance: 0,
                        currency: currency || 'VND'
                    })
                }
            }

            if (warnings.length > 0) {
                setSyncWarnings(warnings)
            }

            if (newAccs.length > 0) {
                syncLock.current = true
                await supabase.from('fin_bank_accounts').insert(newAccs)
                needsRefresh = true
            }
            
            if (needsRefresh) {
                // Re-fetch after inserting
                const refreshRes = await supabase.from('fin_bank_accounts').select('*, provider_branches(name)').order('account_name')
                if (refreshRes.data) fetchedAccounts = refreshRes.data
            }
        }
        
        // Calculate pending balances for wallets
        const walletAccIds = fetchedAccounts.filter(a => a.account_type === 'Wallet').map(a => a.id)
        if (walletAccIds.length > 0) {
            const todayStr = format(new Date(), 'yyyy-MM-dd')
            const { data: pendingTxs } = await supabase.from('fin_bank_transactions')
                .select('account_id, amount, type, category')
                .in('account_id', walletAccIds)
                .gt('transaction_date', todayStr)
                
            if (pendingTxs) {
                fetchedAccounts = fetchedAccounts.map(acc => {
                    if (acc.account_type === 'Wallet') {
                        // The pending balance should be the NET amount only (excluding fees).
                        // So we sum future Outflows that are NOT Bank Fees.
                        let pendingBal = 0;
                        let pendingFees = 0;
                        pendingTxs.filter(tx => tx.account_id === acc.id).forEach(tx => {
                            if (tx.type === 'Outflow' && tx.category !== 'Bank Fees') {
                                pendingBal += Number(tx.amount)
                            } else if (tx.type === 'Inflow') {
                                pendingBal -= Number(tx.amount)
                            }
                            
                            if (tx.type === 'Outflow' && tx.category === 'Bank Fees') {
                                pendingFees += Number(tx.amount)
                            }
                        })
                        return { ...acc, current_balance: pendingBal, pending_fees: pendingFees }
                    }
                    return acc
                })
            }
        }
        
        setAccounts(fetchedAccounts)
        setBranches(fetchedBranches)
        setCoas(fetchedCoas)
        setLoading(false)
    }

    useEffect(() => {
        fetchAccounts()
    }, [currency])

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

    const fetchTransactions = async (acc: FinBankAccount, startStr: string, endStr: string) => {
        setLoadingTx(true)
        
        const { data } = await supabase.from('fin_bank_transactions')
            .select('*')
            .eq('account_id', acc.id)
            .gte('transaction_date', startStr)
            .lte('transaction_date', endStr)
            .order('transaction_date', { ascending: false })
            .order('created_at', { ascending: false })
            
        // Calculate Opening and Closing Balances
        const { data: priorTx } = await supabase.from('fin_bank_transactions')
            .select('amount, type')
            .eq('account_id', acc.id)
            .lt('transaction_date', startStr)

        let openBal = Number(acc.opening_balance) || 0
        if (priorTx) {
            for (const tx of priorTx) {
                if (tx.type === 'Inflow') openBal += Number(tx.amount)
                else openBal -= Number(tx.amount)
            }
        }
        
        let closeBal = openBal
        if (data) {
            for (const tx of data) {
                if (tx.type === 'Inflow') closeBal += Number(tx.amount)
                else closeBal -= Number(tx.amount)
            }
        }

        setMonthlyOpeningBalance(openBal)
        setMonthlyClosingBalance(closeBal)
            
        setTransactions((data || []) as any)
        setLoadingTx(false)
    }

    const selectAccount = async (acc: FinBankAccount) => {
        setSelectedAccount(acc)
        fetchTransactions(acc, dateRange.start, dateRange.end)
    }

    useEffect(() => {
        if (selectedAccount) {
            fetchTransactions(selectedAccount, dateRange.start, dateRange.end)
        }
    }, [dateRange])

    const handleSaveAccount = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isFormInvalid) return
        setSaving(true)
        try {
            const bal = parseFloat(String(accForm.opening_balance).replace(/,/g, '')) || 0
            if (accForm.is_default_corporate_card) {
                await supabase.from('fin_bank_accounts').update({ is_default_corporate_card: false }).eq('is_default_corporate_card', true)
            }
            if (editingAccount) {
                const balDiff = bal - Number(editingAccount.opening_balance || 0);
                const { error } = await supabase.from('fin_bank_accounts').update({
                    account_name: accForm.account_name, bank_name: accForm.bank_name || null,
                    account_number: accForm.account_number || null, account_type: accForm.account_type,
                    branch_id: accForm.branch_id || null, notes: accForm.notes || null,
                    opening_balance: bal,
                    current_balance: Number(editingAccount.current_balance || 0) + balDiff,
                    online_payment_fee: parseFloat(String(accForm.online_payment_fee).replace(/,/g, '')) || 0,
                    bank_transfer_fee: parseFloat(String(accForm.bank_transfer_fee).replace(/,/g, '')) || 0,
                    fee_account_id: accForm.fee_account_id || null,
                    currency: accForm.currency || currency,
                    is_corporate_card: accForm.is_corporate_card,
                    is_default_corporate_card: accForm.is_default_corporate_card,
                }).eq('id', editingAccount.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('fin_bank_accounts').insert({
                    account_name: accForm.account_name, bank_name: accForm.bank_name || null,
                    account_number: accForm.account_number || null, account_type: accForm.account_type,
                    opening_balance: bal, current_balance: bal,
                    branch_id: accForm.branch_id || null, notes: accForm.notes || null, currency: accForm.currency || currency,
                    online_payment_fee: parseFloat(String(accForm.online_payment_fee).replace(/,/g, '')) || 0,
                    bank_transfer_fee: parseFloat(String(accForm.bank_transfer_fee).replace(/,/g, '')) || 0,
                    fee_account_id: accForm.fee_account_id || null,
                    is_corporate_card: accForm.is_corporate_card,
                    is_default_corporate_card: accForm.is_default_corporate_card,
                })
                if (error) throw error
            }
            setShowAddAccount(false)
            setEditingAccount(null)
            setAccForm({ account_name: '', bank_name: '', account_number: '', account_type: 'Checking', opening_balance: '', branch_id: '', notes: '', online_payment_fee: '0', bank_transfer_fee: '0', fee_account_id: '', currency: '', is_corporate_card: false, is_default_corporate_card: false })
            fetchAccounts()
        } catch (err: any) { alert(t(language, 'FinAccAlertFailed') + err.message) }
        setSaving(false)
    }

    const handleEditAccount = (acc: FinBankAccount) => {
        setEditingAccount(acc)
        setAccForm({
            account_name: acc.account_name, bank_name: acc.bank_name || '', account_number: acc.account_number || '',
            account_type: acc.account_type, opening_balance: acc.opening_balance ? acc.opening_balance.toLocaleString('en-US') : '0', branch_id: acc.branch_id || '', notes: acc.notes || '',
            online_payment_fee: acc.online_payment_fee ? acc.online_payment_fee.toLocaleString('en-US') : '0',
            bank_transfer_fee: acc.bank_transfer_fee ? acc.bank_transfer_fee.toLocaleString('en-US') : '0',
            fee_account_id: acc.fee_account_id || '',
            currency: acc.currency || currency,
            is_corporate_card: acc.is_corporate_card || false,
            is_default_corporate_card: acc.is_default_corporate_card || false
        })
        setShowAddAccount(true)
    }

    const handleAddTransaction = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedAccount || !txForm.amount) return
        setSaving(true)
        try {
            const amt = parseFloat(txForm.amount) || 0
            const { error } = await supabase.from('fin_bank_transactions').insert({
                account_id: selectedAccount.id, type: txForm.type, category: txForm.category || null,
                description: txForm.description || null, amount: amt,
                transaction_date: txForm.transaction_date, notes: txForm.notes || null, reference_type: 'manual',
            })
            if (error) throw error

            // Update balance
            const delta = txForm.type === 'Inflow' ? amt : -amt
            await supabase.from('fin_bank_accounts').update({ current_balance: Number(selectedAccount.current_balance) + delta }).eq('id', selectedAccount.id)

            setShowAddTx(false)
            setTxForm({ type: 'Inflow', category: '', description: '', amount: '', transaction_date: new Date().toISOString().split('T')[0], notes: '' })
            fetchAccounts()
            selectAccount({ ...selectedAccount, current_balance: Number(selectedAccount.current_balance) + delta })
        } catch (err: any) { alert(t(language, 'FinAccAlertFailed') + err.message) }
        setSaving(false)
    }

    const handleDeleteAccount = async (id: string) => {
        if (!confirm(t(language, 'FinAccAlertDeleteAccountConfirm'))) return
        await supabase.from('fin_bank_transactions').delete().eq('account_id', id)
        await supabase.from('fin_bank_accounts').delete().eq('id', id)
        if (selectedAccount?.id === id) { setSelectedAccount(null); setTransactions([]) }
        fetchAccounts()
    }

    const activeBaseCurrency = currency || 'VND'

    const getConvertedBalance = (balance: number, accCurrency: string) => {
        if (!accCurrency || accCurrency === activeBaseCurrency) return balance
        const rate = exchangeRates[accCurrency]
        if (rate) {
            return balance / rate
        }
        // Fallback for VND/USD
        if (activeBaseCurrency === 'VND' && accCurrency === 'USD') return balance * 25400
        if (activeBaseCurrency === 'USD' && accCurrency === 'VND') return balance / 25400
        return balance
    }

    const bankAccounts = accounts.filter(a => a.account_type !== 'Cash' && a.account_type !== 'Wallet')
    const cashAccounts = accounts.filter(a => a.account_type === 'Cash')
    const walletAccounts = accounts.filter(a => a.account_type === 'Wallet')

    const totalBank = bankAccounts.reduce((s, a) => s + getConvertedBalance(Number(a.current_balance || 0), a.currency), 0)
    const totalCash = cashAccounts.reduce((s, a) => s + getConvertedBalance(Number(a.current_balance || 0), a.currency), 0)
    const totalWallet = walletAccounts.reduce((s, a) => s + getConvertedBalance(Number(a.current_balance || 0), a.currency), 0)
    const totalPendingFees = walletAccounts.reduce((s, a) => s + Number((a as any).pending_fees || 0), 0)
    const totalBalance = totalBank + totalCash + totalWallet

    // Dynamic Currency distinctions
    const getUniqueCurrencies = (accList: FinBankAccount[]) => {
        return Array.from(new Set(accList.map(a => a.currency || activeBaseCurrency))).filter(c => c !== activeBaseCurrency)
    }

    const foreignCurrencies = getUniqueCurrencies(accounts)
    const totalBaseOnly = accounts
        .filter(a => !a.currency || a.currency === activeBaseCurrency)
        .reduce((s, a) => s + Number(a.current_balance || 0), 0)

    const bankForeignCurrencies = getUniqueCurrencies(bankAccounts)
    const totalBankBaseOnly = bankAccounts
        .filter(a => !a.currency || a.currency === activeBaseCurrency)
        .reduce((s, a) => s + Number(a.current_balance || 0), 0)

    const cashForeignCurrencies = getUniqueCurrencies(cashAccounts)
    const totalCashBaseOnly = cashAccounts
        .filter(a => !a.currency || a.currency === activeBaseCurrency)
        .reduce((s, a) => s + Number(a.current_balance || 0), 0)

    const walletForeignCurrencies = getUniqueCurrencies(walletAccounts)
    const totalWalletBaseOnly = walletAccounts
        .filter(a => !a.currency || a.currency === activeBaseCurrency)
        .reduce((s, a) => s + Number(a.current_balance || 0), 0)
    
    const visibleAccounts = activeTab === 'Bank' ? bankAccounts : activeTab === 'Cash' ? cashAccounts : walletAccounts

    const transactionsWithBalances = React.useMemo(() => {
        if (monthlyOpeningBalance === null) return transactions.map(tx => ({ ...tx, runningBalance: 0 }))
        
        const result = []
        let currentBal = monthlyOpeningBalance
        
        // transactions are newest-first. Process oldest-first.
        for (let i = transactions.length - 1; i >= 0; i--) {
            const tx = transactions[i]
            if (tx.type === 'Inflow') {
                currentBal += Number(tx.amount)
            } else {
                currentBal -= Number(tx.amount)
            }
            result.push({ ...tx, runningBalance: currentBal })
        }
        
        // Reverse back to newest-first
        return result.reverse()
    }, [transactions, monthlyOpeningBalance])

    const filteredTx = transactionsWithBalances.filter(tx => {
        if (txTypeFilter !== 'All' && tx.type !== txTypeFilter) return false
        if (txBranchFilter !== 'All' && tx.description && !tx.description.toLowerCase().includes(txBranchFilter.toLowerCase())) return false
        if (txSearch) {
            const q = txSearch.toLowerCase()
            const matchDesc = tx.description?.toLowerCase().includes(q)
            const matchCat = tx.category?.toLowerCase().includes(q)
            const matchDate = tx.transaction_date.includes(q)
            const matchAmount = String(tx.amount).includes(q)
            if (!matchDesc && !matchCat && !matchDate && !matchAmount) return false
        }
        return true
    })

    const walletGroupedTx = React.useMemo(() => {
        if (activeTab !== 'Wallet') return filteredTx;
        const grouped: any[] = [];
        const processedIds = new Set();
        for (const tx of filteredTx) {
            if (processedIds.has(tx.id)) continue;
            if (tx.reference_type === 'Cashier Closing' && tx.reference_id) {
                const related = filteredTx.filter(r => r.reference_id === tx.reference_id);
                const parent = related.find(r => r.category === 'Revenue') || tx;
                const children = related.filter(r => r.id !== parent.id);
                grouped.push({ ...parent, children });
                related.forEach(r => processedIds.add(r.id));
            } else {
                grouped.push({ ...tx, children: [] });
                processedIds.add(tx.id);
            }
        }
        return grouped;
    }, [filteredTx, activeTab]);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {syncWarnings.length > 0 && (
                <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex flex-col gap-2">
                    {syncWarnings.map((warning, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm font-medium">
                            <CheckCircle2 className="w-4 h-4 text-amber-500" />
                            {warning}
                        </div>
                    ))}
                </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'FinAccTitle')}</h1>
                    <p className="text-slate-500 mt-1">{t(language, 'FinAccSubtitle')}</p>
                </div>
                <button onClick={() => { setAccForm(f => ({ ...f, currency })); setShowAddAccount(true) }} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2">
                    <Plus className="w-4 h-4" /> {t(language, 'FinAccAddAccountButton')}
                </button>
            </div>

            {/* Total Balance Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {/* Total Position Card */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 rounded-2xl p-5 text-white shadow-md flex flex-col">
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-200">
                        <Coins className="w-4 h-4 text-blue-400" />
                        <span>{t(language, 'FinAccTotalTreasuryPosition')}</span>
                    </div>
                    <div className="mt-4">
                        <div className="text-[10px] font-bold text-blue-300 tracking-wider uppercase">{activeBaseCurrency}</div>
                        <div className="text-2xl font-black tabular-nums mt-0.5 tracking-tight leading-none">
                            {fmt(totalBalance)}
                        </div>
                        {foreignCurrencies.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-blue-800/40 text-[11px] text-blue-200 space-y-1.5">
                                <div className="flex justify-between font-medium">
                                    <span>{activeBaseCurrency}</span>
                                    <span>{fmt(totalBaseOnly)}</span>
                                </div>
                                {foreignCurrencies.map(curr => {
                                    const totalForeign = accounts.filter(a => a.currency === curr).reduce((s, a) => s + Number(a.current_balance || 0), 0)
                                    const totalForeignConverted = getConvertedBalance(totalForeign, curr)
                                    if (totalForeign === 0) return null
                                    return (
                                        <div key={curr} className="flex justify-between font-medium">
                                            <span>{curr}</span>
                                            <span>{fmt(totalForeign)} (≈ {fmt(totalForeignConverted)} {activeBaseCurrency})</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Bank Accounts Card */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 text-slate-900 shadow-sm flex flex-col hover:shadow-md transition">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                        <Landmark className="w-4 h-4 text-slate-400" />
                        <span>{t(language, 'FinAccBankAccounts')}</span>
                    </div>
                    <div className="mt-4">
                        <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">{activeBaseCurrency}</div>
                        <div className="text-xl font-bold tabular-nums mt-0.5 tracking-tight leading-none text-slate-900">
                            {fmt(totalBank)}
                        </div>
                        {bankForeignCurrencies.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1.5">
                                <div className="flex justify-between font-medium">
                                    <span>{activeBaseCurrency}</span>
                                    <span>{fmt(totalBankBaseOnly)}</span>
                                </div>
                                {bankForeignCurrencies.map(curr => {
                                    const totalForeign = bankAccounts.filter(a => a.currency === curr).reduce((s, a) => s + Number(a.current_balance || 0), 0)
                                    const totalForeignConverted = getConvertedBalance(totalForeign, curr)
                                    if (totalForeign === 0) return null
                                    return (
                                        <div key={curr} className="flex justify-between font-medium">
                                            <span>{curr}</span>
                                            <span>{fmt(totalForeign)} (≈ {fmt(totalForeignConverted)} {activeBaseCurrency})</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Cash on Hand Card */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 text-slate-900 shadow-sm flex flex-col hover:shadow-md transition">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                        <CircleDollarSign className="w-4 h-4 text-slate-400" />
                        <span>{t(language, 'FinAccCashOnHand')}</span>
                    </div>
                    <div className="mt-4">
                        <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">{activeBaseCurrency}</div>
                        <div className="text-xl font-bold tabular-nums mt-0.5 tracking-tight leading-none text-slate-900">
                            {fmt(totalCash)}
                        </div>
                        {cashForeignCurrencies.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1.5">
                                <div className="flex justify-between font-medium">
                                    <span>{activeBaseCurrency}</span>
                                    <span>{fmt(totalCashBaseOnly)}</span>
                                </div>
                                {cashForeignCurrencies.map(curr => {
                                    const totalForeign = cashAccounts.filter(a => a.currency === curr).reduce((s, a) => s + Number(a.current_balance || 0), 0)
                                    const totalForeignConverted = getConvertedBalance(totalForeign, curr)
                                    if (totalForeign === 0) return null
                                    return (
                                        <div key={curr} className="flex justify-between font-medium">
                                            <span>{curr}</span>
                                            <span>{fmt(totalForeign)} (≈ {fmt(totalForeignConverted)} {activeBaseCurrency})</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Wallets Card */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 text-slate-900 shadow-sm flex flex-col hover:shadow-md transition">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                        <Wallet className="w-4 h-4 text-slate-400" />
                        <span>{t(language, 'FinAccChannelWallets')}</span>
                    </div>
                    <div className="mt-4">
                        <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">{activeBaseCurrency}</div>
                        <div className="text-xl font-bold tabular-nums mt-0.5 tracking-tight leading-none text-slate-900">
                            {fmt(totalWallet)}
                        </div>
                        {walletForeignCurrencies.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1.5">
                                <div className="flex justify-between font-medium">
                                    <span>{activeBaseCurrency}</span>
                                    <span>{fmt(totalWalletBaseOnly)}</span>
                                </div>
                                {walletForeignCurrencies.map(curr => {
                                    const totalForeign = walletAccounts.filter(a => a.currency === curr).reduce((s, a) => s + Number(a.current_balance || 0), 0)
                                    const totalForeignConverted = getConvertedBalance(totalForeign, curr)
                                    if (totalForeign === 0) return null
                                    return (
                                        <div key={curr} className="flex justify-between font-medium">
                                            <span>{curr}</span>
                                            <span>{fmt(totalForeign)} (≈ {fmt(totalForeignConverted)} {activeBaseCurrency})</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                    {totalPendingFees > 0 && (
                        <div className="text-xs text-slate-400 mt-4 font-medium">
                            {t(language, 'FinAccFeesLabel').replace('{amount}', fmt(totalPendingFees))}
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-4 border-b border-slate-200 mb-6">
                <button
                    onClick={() => { setActiveTab('Bank'); setSelectedAccount(null) }}
                    className={`pb-3 px-1 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === 'Bank' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                >
                    <Landmark className="w-4 h-4" />
                    {t(language, 'FinAccTabBankAccounts')}
                </button>
                <button
                    onClick={() => { setActiveTab('Cash'); setSelectedAccount(null) }}
                    className={`pb-3 px-1 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === 'Cash' ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                >
                    <CircleDollarSign className="w-4 h-4" />
                    {t(language, 'FinAccTabCashOnHand')}
                </button>
                <button
                    onClick={() => { setActiveTab('Wallet'); setSelectedAccount(null) }}
                    className={`pb-3 px-1 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === 'Wallet' ? 'border-orange-500 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                >
                    <Wallet className="w-4 h-4" />
                    {t(language, 'FinAccTabPaymentChannels')}
                </button>
            </div>

            {loading ? <CircularLoader /> : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Account Cards */}
                    <div className="lg:col-span-1 space-y-3">
                        {visibleAccounts.length === 0 ? (
                            <div className="text-center text-slate-500 bg-white rounded-2xl border border-slate-200 p-8">
                                {t(language, 'FinAccNoAccountsYet').replace('{type}', 
                                    activeTab === 'Bank' 
                                        ? t(language, 'FinAccTabBankAccounts').toLowerCase() 
                                        : activeTab === 'Cash' 
                                            ? t(language, 'FinAccTabCashOnHand').toLowerCase() 
                                            : t(language, 'FinAccTabPaymentChannels').toLowerCase()
                                )}
                            </div>
                        ) : visibleAccounts.map(acc => {
                            const mapping = activeTab === 'Wallet' ? mappings.find(m => m.wallet_account_id === acc.id) : null;

                            return (
                            <div key={acc.id} onClick={() => selectAccount(acc)} role="button" tabIndex={0}
                                className={`w-full text-left p-4 rounded-2xl border transition group cursor-pointer ${selectedAccount?.id === acc.id ? 'border-blue-300 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm'}`}>
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2.5 rounded-xl ${selectedAccount?.id === acc.id ? (activeTab === 'Bank' ? 'bg-blue-600 text-white' : activeTab === 'Cash' ? 'bg-amber-500 text-white' : 'bg-orange-500 text-white') : 'bg-slate-100 text-slate-600'}`}>
                                            {activeTab === 'Bank' ? <Landmark className="w-5 h-5" /> : activeTab === 'Cash' ? <CircleDollarSign className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-900">{acc.account_name}</div>
                                            <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                                                {acc.account_number && <span className="font-semibold text-slate-600">{acc.account_number}</span>}
                                                <span>{acc.bank_name || getAccountTypeLabel(acc.account_type)}{acc.provider_branches ? ` • ${(acc as any).provider_branches.name}` : ''}</span>
                                                {mapping && (
                                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium text-[10px] ml-1">
                                                        {language === 'vi' 
                                                            ? `Phí ${mapping.commission_pct}% • T+${mapping.settlement_delay_days}` 
                                                            : `${mapping.commission_pct}% Fee • T+${mapping.settlement_delay_days}`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {activeTab !== 'Wallet' && (
                                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition">
                                            <button onClick={(e) => { e.stopPropagation(); handleEditAccount(acc) }}
                                                className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-500 transition">
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteAccount(acc.id) }}
                                                className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="mt-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-2xl font-black tabular-nums text-slate-900">
                                                {fmt(Number(acc.current_balance))} <span className="text-sm font-medium text-slate-500">{acc.currency || currency}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {acc.currency && acc.currency !== currency && exchangeRates[acc.currency] && (
                                        <div className="text-sm text-emerald-600 font-semibold mt-1">
                                            ≈ {fmt(Number(acc.current_balance) * (1 / exchangeRates[acc.currency]))} {currency}
                                        </div>
                                    )}
                                    {activeTab === 'Wallet' && (acc as any).pending_fees > 0 && (
                                        <div className="text-xs text-slate-500 font-semibold mt-1">
                                            {t(language, 'FinAccFeesLabel').replace('{amount}', fmt((acc as any).pending_fees))} {acc.currency || currency}
                                        </div>
                                    )}
                                </div>
                            </div>
                            )
                        })}
                    </div>

                    {/* Transaction Ledger */}
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                        {selectedAccount ? (
                            <>
                                <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900">{selectedAccount.account_name}</h2>
                                        <div className="text-sm text-slate-500">
                                            {language === 'vi' ? 'Số dư' : 'Balance'}: {fmt(Number(selectedAccount.current_balance))} {selectedAccount.currency || currency}
                                            {selectedAccount.currency && selectedAccount.currency !== currency && exchangeRates[selectedAccount.currency] && (
                                                <span className="ml-2 text-emerald-600 font-medium">(≈ {fmt(Number(selectedAccount.current_balance) * (1 / exchangeRates[selectedAccount.currency]))} {currency})</span>
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={() => { setShowAddTx(true); setTxForm({ type: 'Inflow', category: '', description: '', amount: '', transaction_date: new Date().toISOString().split('T')[0], notes: '' }) }}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-sm font-medium transition flex items-center gap-1.5">
                                        <Plus className="w-4 h-4" /> {t(language, 'FinAccAddTransactionButton')}
                                    </button>
                                </div>
                                <div className="grid grid-cols-3 items-center p-3 border-b border-slate-100 bg-slate-50/50 relative">
                                    <button onClick={() => {
                                        const d = new Date(dateRange.start)
                                        const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1)
                                        const prevEnd = new Date(d.getFullYear(), d.getMonth(), 0)
                                        setDateRange({
                                            start: `${prevStart.getFullYear()}-${String(prevStart.getMonth() + 1).padStart(2, '0')}-01`,
                                            end: `${prevEnd.getFullYear()}-${String(prevEnd.getMonth() + 1).padStart(2, '0')}-${String(prevEnd.getDate()).padStart(2, '0')}`
                                        })
                                    }} className="justify-self-start text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline transition flex items-center gap-1">
                                        <ChevronLeft className="w-4 h-4" /> {t(language, 'FinAccPrevMonth')}
                                    </button>
                                    <div className="justify-self-center flex items-center gap-1.5 relative">
                                        <div className="text-sm font-bold text-slate-900">
                                            {renderDateRangeText()}
                                        </div>
                                        <button onClick={() => setShowCustomRange(!showCustomRange)} className="p-1 hover:bg-slate-200 rounded-full text-slate-500 transition">
                                            <MoreVertical className="w-4 h-4" />
                                        </button>
                                        
                                        {showCustomRange && (
                                            <>
                                                <div className="fixed inset-0 z-10" onClick={() => setShowCustomRange(false)} />
                                                <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 bg-white border border-slate-100 shadow-2xl rounded-2xl p-5 z-20 w-72 origin-top ring-1 ring-slate-900/5">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div className="text-sm font-bold text-slate-800">{t(language, 'FinAccCustomDateRange')}</div>
                                                        <button onClick={() => setShowCustomRange(false)} className="text-slate-400 hover:text-slate-600 transition"><X className="w-4 h-4" /></button>
                                                    </div>
                                                    <div className="space-y-4">
                                                        <div>
                                                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">{t(language, 'FinAccStartDate')}</label>
                                                            <div className="relative">
                                                                <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} 
                                                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm bg-slate-50 hover:bg-white transition" />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">{t(language, 'FinAccEndDate')}</label>
                                                            <div className="relative">
                                                                <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} 
                                                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm bg-slate-50 hover:bg-white transition" />
                                                            </div>
                                                        </div>
                                                        <button onClick={() => setShowCustomRange(false)} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl mt-2 transition shadow-sm flex items-center justify-center gap-2">
                                                            <CheckCircle2 className="w-4 h-4" /> {t(language, 'FinAccApplyFilter')}
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <button onClick={() => {
                                        const d = new Date(dateRange.start)
                                        const nextStart = new Date(d.getFullYear(), d.getMonth() + 1, 1)
                                        const nextEnd = new Date(d.getFullYear(), d.getMonth() + 2, 0)
                                        setDateRange({
                                            start: `${nextStart.getFullYear()}-${String(nextStart.getMonth() + 1).padStart(2, '0')}-01`,
                                            end: `${nextEnd.getFullYear()}-${String(nextEnd.getMonth() + 1).padStart(2, '0')}-${String(nextEnd.getDate()).padStart(2, '0')}`
                                        })
                                    }} className="justify-self-end text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline transition flex items-center gap-1">
                                        {t(language, 'FinAccNextMonth')} <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="flex flex-wrap items-center justify-between p-2.5 border-b border-slate-100 bg-slate-50 text-xs shrink-0 gap-4">
                                    <div className="flex-1 min-w-[200px] flex items-center gap-2">
                                        <div className="relative flex-1 max-w-xs">
                                            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input type="text" placeholder={t(language, 'FinAccSearchPlaceholder')} value={txSearch} onChange={e => setTxSearch(e.target.value)}
                                                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 shadow-sm text-xs" />
                                        </div>
                                        <select value={txTypeFilter} onChange={e => setTxTypeFilter(e.target.value)}
                                            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                            <option value="All">{t(language, 'FinAccAllTypes')}</option>
                                            <option value="Inflow">{t(language, 'FinAccInflow')}</option>
                                            <option value="Outflow">{t(language, 'FinAccOutflow')}</option>
                                        </select>
                                        {activeTab === 'Wallet' && (
                                            <select value={txBranchFilter} onChange={e => setTxBranchFilter(e.target.value)}
                                                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[150px]">
                                                <option value="All">{t(language, 'FinAccAllBranches')}</option>
                                                {branches.map(b => (
                                                    <option key={b.id} value={b.name}>{b.name}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 pr-2">
                                        <div className="bg-white border border-slate-200 shadow-sm rounded-md px-2.5 py-1 flex items-center gap-2">
                                            <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">{t(language, 'FinAccOpening')}</span>
                                            <span className="font-black text-slate-700 tabular-nums">{monthlyOpeningBalance !== null ? fmt(monthlyOpeningBalance) : '...'}</span>
                                        </div>
                                        <div className="bg-white border border-slate-200 shadow-sm rounded-md px-2.5 py-1 flex items-center gap-2">
                                            <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">{t(language, 'FinAccClosing')}</span>
                                            <span className="font-black text-slate-900 tabular-nums">{monthlyClosingBalance !== null ? fmt(monthlyClosingBalance) : '...'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    {loadingTx ? <div className="p-8 flex justify-center"><CircularLoader /></div> : walletGroupedTx.length === 0 ? (
                                        <div className="p-8 text-center text-slate-500">{t(language, 'FinAccNoTransactionsFound')}</div>
                                    ) : (
                                        <div className="divide-y divide-slate-100">
                                            {walletGroupedTx.map(tx => (
                                                <div key={tx.id} className="flex flex-col hover:bg-slate-50 transition">
                                                    <div className="p-4 flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-xl ${tx.type === 'Inflow' ? 'bg-emerald-100' : tx.type === 'Outflow' ? 'bg-red-100' : 'bg-blue-100'}`}>
                                                                {tx.type === 'Inflow' ? <ArrowDownRight className="w-4 h-4 text-emerald-600" /> : tx.type === 'Outflow' ? <ArrowUpRight className="w-4 h-4 text-red-600" /> : <ArrowLeftRight className="w-4 h-4 text-blue-600" />}
                                                            </div>
                                                            <div>
                                                                <div className="font-medium text-slate-800 text-sm">
                                                                    {tx.description || tx.category || (tx.type === 'Inflow' ? t(language, 'FinAccInflow') : t(language, 'FinAccOutflow'))}
                                                                </div>
                                                                <div className="text-xs text-slate-500">
                                                                    {new Date(tx.transaction_date).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-GB')} {tx.category ? `• ${tx.category}` : ''}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className={`font-bold tabular-nums ${tx.type === 'Inflow' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                {tx.type === 'Inflow' ? '+' : '−'}{fmt(Number(tx.amount))}
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 font-medium tabular-nums mt-0.5">
                                                                {language === 'vi' ? 'S.dư:' : 'Bal:'} {fmt(tx.runningBalance)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {tx.children && tx.children.length > 0 && (
                                                        <div className="bg-slate-50/50 pl-14 pr-4 pb-3 space-y-2">
                                                            {tx.children.map((child: any) => (
                                                                <div key={child.id} className="flex items-center justify-between border-t border-slate-100/60 pt-2">
                                                                    <div className="text-xs text-slate-500 flex items-center gap-2">
                                                                        {child.type === 'Outflow' ? <ArrowUpRight className="w-3 h-3 text-red-400" /> : <ArrowDownRight className="w-3 h-3 text-emerald-400" />}
                                                                        {child.description || child.category}
                                                                        <span className="text-[10px] text-slate-400">
                                                                            ({new Date(child.transaction_date).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-GB')})
                                                                        </span>
                                                                    </div>
                                                                    <div className={`text-xs font-semibold tabular-nums ${child.type === 'Inflow' ? 'text-emerald-500' : 'text-red-500'}`}>
                                                                        {child.type === 'Inflow' ? '+' : '−'}{fmt(Number(child.amount))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-400 p-8">
                                <div className="text-center">
                                    <Landmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <div className="font-medium">{t(language, 'FinAccSelectAccountPrompt')}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Add Account Modal */}
            {showAddAccount && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-slate-900/5">
                        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50 shrink-0">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">
                                    {editingAccount ? t(language, 'FinAccModalTitleEdit') : t(language, 'FinAccModalTitleAdd')}
                                </h2>
                                <p className="text-sm text-slate-500 mt-1">{t(language, 'FinAccModalSubtitle')}</p>
                            </div>
                            <button type="button" onClick={() => { setShowAddAccount(false); setEditingAccount(null) }} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSaveAccount} className="flex flex-col overflow-hidden">
                            <div className="p-6 space-y-6 overflow-y-auto">
                            
                            {/* General Details Section */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Landmark className="w-4 h-4 text-blue-500" />
                                    {t(language, 'FinAccModalSectionGeneral')}
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'FinAccModalAccountName')} <span className="text-red-500">*</span></label>
                                        <input required value={accForm.account_name} onChange={e => setAccForm(f => ({ ...f, account_name: e.target.value }))} placeholder={language === 'vi' ? 'ví dụ: Tài khoản kinh doanh chính' : 'e.g. Main Business Account'}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm transition-all hover:border-slate-300 bg-slate-50 focus:bg-white" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'FinAccModalAccountType')}</label>
                                        <select value={accForm.account_type} onChange={e => setAccForm(f => ({ ...f, account_type: e.target.value }))}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm transition-all hover:border-slate-300 bg-slate-50 focus:bg-white"
                                            disabled={accForm.account_type === 'Cash'}
                                        >
                                            <option value="Checking">{t(language, 'FinAccChecking')}</option>
                                            <option value="Saving">{t(language, 'FinAccSaving')}</option>
                                            <option value="Capital">{t(language, 'FinAccCapital')}</option>
                                            {accForm.account_type === 'Cash' && <option value="Cash">{t(language, 'FinAccCash')}</option>}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'FinAccModalBranch')}</label>
                                        <select value={accForm.branch_id} onChange={e => setAccForm(f => ({ ...f, branch_id: e.target.value }))}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm transition-all hover:border-slate-300 bg-slate-50 focus:bg-white">
                                            <option value="">{t(language, 'FinAccModalAllBranches')}</option>
                                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Bank Details Section */}
                            {(accForm.account_type === 'Checking' || accForm.account_type === 'Saving' || accForm.account_type === 'Capital') && (
                                <>
                                    <hr className="border-slate-100" />
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <Briefcase className="w-4 h-4 text-emerald-500" />
                                            {t(language, 'FinAccModalSectionBank')}
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'FinAccModalBankName')} <span className="text-red-500">*</span></label>
                                                <input value={accForm.bank_name} onChange={e => setAccForm(f => ({ ...f, bank_name: e.target.value }))} placeholder={language === 'vi' ? 'ví dụ: Sacombank' : 'e.g. Sacombank'}
                                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm transition-all hover:border-slate-300 bg-slate-50 focus:bg-white" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'FinAccModalAccountNumber')} <span className="text-red-500">*</span></label>
                                                <input value={accForm.account_number} onChange={e => setAccForm(f => ({ ...f, account_number: e.target.value }))} placeholder="e.g. 111111111111"
                                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm transition-all hover:border-slate-300 bg-slate-50 focus:bg-white" />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {(accForm.account_type === 'Checking' || accForm.account_type === 'Saving') && (
                                <>
                                    <hr className="border-slate-100" />
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <CreditCard className="w-4 h-4 text-orange-500" />
                                            {t(language, 'FinAccModalSectionCorpCard')}
                                        </h3>
                                        <div className="flex flex-col gap-3">
                                            <label className="flex items-center gap-3 p-3 border border-slate-200 bg-white rounded-xl cursor-pointer hover:border-blue-300 transition">
                                                <input type="checkbox" checked={accForm.is_corporate_card} onChange={e => {
                                                    const isChecked = e.target.checked;
                                                    setAccForm(f => ({ ...f, is_corporate_card: isChecked, is_default_corporate_card: isChecked ? f.is_default_corporate_card : false }));
                                                }} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                                                <div>
                                                    <div className="font-bold text-slate-900 text-sm">{t(language, 'FinAccModalCanUseCorpCard')}</div>
                                                    <div className="text-xs text-slate-500 mt-0.5">{t(language, 'FinAccModalCanUseCorpCardDesc')}</div>
                                                </div>
                                            </label>
                                            {accForm.is_corporate_card && (
                                                <label className="flex items-center gap-3 p-3 border border-orange-200 bg-orange-50 rounded-xl cursor-pointer hover:border-orange-300 transition">
                                                    <input type="checkbox" checked={accForm.is_default_corporate_card} onChange={e => setAccForm(f => ({ ...f, is_default_corporate_card: e.target.checked }))} className="w-4 h-4 text-orange-600 rounded border-orange-300 focus:ring-orange-500" />
                                                    <div>
                                                        <div className="font-bold text-orange-900 text-sm">{t(language, 'FinAccModalDefaultCorpCard')}</div>
                                                        <div className="text-xs text-orange-700 mt-0.5">{t(language, 'FinAccModalDefaultCorpCardDesc')}</div>
                                                    </div>
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}

                            <hr className="border-slate-100" />

                            {/* Financial Settings Section */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <CircleDollarSign className="w-4 h-4 text-purple-500" />
                                    {t(language, 'FinAccModalSectionFinancials')}
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'FinAccModalCurrency')}</label>
                                        <select value={accForm.currency} onChange={e => setAccForm(f => ({ ...f, currency: e.target.value }))}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm transition-all hover:border-slate-300 bg-slate-50 focus:bg-white">
                                            <option value="VND">{language === 'vi' ? 'VND - Đồng Việt Nam' : 'VND - Vietnamese Dong'}</option>
                                            <option value="USD">{language === 'vi' ? 'USD - Đô la Mỹ' : 'USD - US Dollar'}</option>
                                            <option value="EUR">{language === 'vi' ? 'EUR - Euro' : 'EUR - Euro'}</option>
                                            <option value="GBP">{language === 'vi' ? 'GBP - Bảng Anh' : 'GBP - British Pound'}</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'FinAccModalOpeningBalance')}</label>
                                        <div className="relative">
                                            <input type="text" value={accForm.opening_balance} onChange={e => {
                                                const clean = e.target.value.replace(/[^0-9-]/g, '');
                                                const num = parseInt(clean, 10);
                                                setAccForm(f => ({ ...f, opening_balance: isNaN(num) ? '' : num.toLocaleString('en-US') }));
                                            }}
                                                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm transition-all tabular-nums disabled:opacity-50 disabled:bg-slate-100 bg-slate-50 focus:bg-white pr-16" />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">{accForm.currency || currency}</div>
                                        </div>
                                    </div>
                                    <div className="col-span-2 sm:col-span-1">
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'FinAccModalOnlinePaymentFee')}</label>
                                        <div className="relative">
                                            <input type="text" value={accForm.online_payment_fee} onChange={e => {
                                                const clean = e.target.value.replace(/[^0-9]/g, '');
                                                const num = parseInt(clean, 10);
                                                setAccForm(f => ({ ...f, online_payment_fee: isNaN(num) ? '' : num.toLocaleString('en-US') }));
                                            }}
                                                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm transition-all tabular-nums hover:border-slate-300 bg-slate-50 focus:bg-white pr-16" />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">{accForm.currency || currency}</div>
                                        </div>
                                    </div>
                                    <div className="col-span-2 sm:col-span-1">
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'FinAccModalBankTransferFee')}</label>
                                        <div className="relative">
                                            <input type="text" value={accForm.bank_transfer_fee} onChange={e => {
                                                const clean = e.target.value.replace(/[^0-9]/g, '');
                                                const num = parseInt(clean, 10);
                                                setAccForm(f => ({ ...f, bank_transfer_fee: isNaN(num) ? '' : num.toLocaleString('en-US') }));
                                            }}
                                                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm transition-all tabular-nums hover:border-slate-300 bg-slate-50 focus:bg-white pr-16" />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">{accForm.currency || currency}</div>
                                        </div>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                            {t(language, 'FinAccModalFeeCoaCategory')}
                                            {(parseFloat(String(accForm.bank_transfer_fee).replace(/,/g, '')) > 0 || parseFloat(String(accForm.online_payment_fee).replace(/,/g, '')) > 0) && <span className="text-red-500"> *</span>}
                                        </label>
                                        <div className="rounded-xl border border-slate-200 shadow-sm bg-slate-50 transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:bg-white">
                                            <COACombobox 
                                                coas={coas} 
                                                value={accForm.fee_account_id} 
                                                onChange={val => setAccForm(f => ({ ...f, fee_account_id: val }))} 
                                                placeholder={t(language, 'FinAccModalSelectCoaFeesPlaceholder')}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            </div>
                            <div className="flex gap-3 justify-end p-6 border-t border-slate-100 bg-slate-50 shrink-0">
                                <button type="button" onClick={() => setShowAddAccount(false)} className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors">
                                    {t(language, 'Cancel')}
                                </button>
                                <button type="submit" disabled={saving || isFormInvalid} className="px-6 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2">
                                    {saving ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                                        <>
                                            <CheckCircle2 className="w-4 h-4" />
                                            {editingAccount ? t(language, 'Save') : t(language, 'FinAccModalCreateButton')}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Transaction Modal */}
            {showAddTx && selectedAccount && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-900">{t(language, 'FinAccModalTxTitle')}</h2>
                            <button onClick={() => setShowAddTx(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleAddTransaction} className="p-5 space-y-4">
                            <div className="flex gap-2">
                                {['Inflow', 'Outflow'].map(typeVal => (
                                    <button key={typeVal} type="button" onClick={() => setTxForm(f => ({ ...f, type: typeVal }))}
                                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${txForm.type === typeVal ? (typeVal === 'Inflow' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white') : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                        {typeVal === 'Inflow' ? t(language, 'FinAccModalTxInflow') : t(language, 'FinAccModalTxOutflow')}
                                    </button>
                                ))}
                            </div>
                            <div><label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinAccModalTxAmount')}</label>
                                <input type="number" step="0.01" required value={txForm.amount} onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm text-lg font-bold tabular-nums" /></div>
                            <div><label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinAccModalTxDate')}</label>
                                <input type="date" value={txForm.transaction_date} onChange={e => setTxForm(f => ({ ...f, transaction_date: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm" /></div>
                            {selectedAccount.account_type !== 'Wallet' && (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinAccModalTxCategory')}</label>
                                    <div className="rounded-xl border border-slate-200 shadow-sm bg-white transition-all focus-within:ring-2 focus-within:ring-blue-500">
                                        <COACombobox 
                                            coas={coas} 
                                            value={coas.find(c => c.name === txForm.category)?.id || ''} 
                                            onChange={val => setTxForm(f => ({ ...f, category: coas.find(c => c.id === val)?.name || val }))} 
                                            placeholder={t(language, 'FinAccModalTxSelectCategoryPlaceholder')}
                                        />
                                    </div>
                                </div>
                            )}
                            <div><label className="block text-sm font-semibold text-slate-700 mb-1">{t(language, 'FinAccModalTxDescription')}</label>
                                <input value={txForm.description} onChange={e => setTxForm(f => ({ ...f, description: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm" /></div>
                            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                                <button type="button" onClick={() => setShowAddTx(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">{t(language, 'Cancel')}</button>
                                <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl shadow-md">
                                    {saving ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t(language, 'FinAccModalTxRecordButton')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
