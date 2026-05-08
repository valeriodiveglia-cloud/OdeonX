'use client'

import React, { useEffect, useState } from 'react'
import { Landmark, Plus, X, ArrowUpRight, ArrowDownRight, ArrowLeftRight, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import type { FinBankAccount, FinBankTransaction } from '@/types/finance'

function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

export default function BankAccountsPage() {
    const { currency } = useSettings()
    const [loading, setLoading] = useState(true)
    const [accounts, setAccounts] = useState<FinBankAccount[]>([])
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
    const [selectedAccount, setSelectedAccount] = useState<FinBankAccount | null>(null)
    const [transactions, setTransactions] = useState<FinBankTransaction[]>([])
    const [loadingTx, setLoadingTx] = useState(false)

    // Modals
    const [showAddAccount, setShowAddAccount] = useState(false)
    const [editingAccount, setEditingAccount] = useState<FinBankAccount | null>(null)
    const [showAddTx, setShowAddTx] = useState(false)
    const [saving, setSaving] = useState(false)

    const syncLock = React.useRef(false)

    // Account form
    const [accForm, setAccForm] = useState({ account_name: '', bank_name: '', account_number: '', account_type: 'Checking' as string, opening_balance: '', branch_id: '', notes: '' })
    // Transaction form
    const [txForm, setTxForm] = useState({ type: 'Inflow' as string, category: '', description: '', amount: '', transaction_date: new Date().toISOString().split('T')[0], notes: '' })

    const fetchAccounts = async () => {
        setLoading(true)
        const [accRes, brRes] = await Promise.all([
            supabase.from('fin_bank_accounts').select('*, provider_branches(name)').order('account_name'),
            supabase.from('provider_branches').select('id, name, bank, account_number, bank_account_name').order('name'),
        ])
        
        let fetchedAccounts = accRes.data as any[] || []
        const fetchedBranches = brRes.data as any[] || []
        
        // Auto-sync missing branches into fin_bank_accounts
        if (!syncLock.current) {
            const missingBranches = fetchedBranches.filter(b => !fetchedAccounts.some(a => a.branch_id === b.id))
            if (missingBranches.length > 0) {
                syncLock.current = true
                const newAccs = missingBranches.map(b => ({
                    id: crypto.randomUUID(),
                    account_name: b.bank_account_name || `${b.name.split(' ').map((w: string) => w[0]?.toUpperCase()).join('')} (Pasta Fresca ${b.name})`,
                    bank_name: b.bank || null,
                    account_number: b.account_number || null,
                    account_type: 'Checking',
                    branch_id: b.id,
                    opening_balance: 0,
                    current_balance: 0,
                    currency: currency || 'VND'
                }))
                await supabase.from('fin_bank_accounts').insert(newAccs)
                
                // Re-fetch after inserting
                const refreshRes = await supabase.from('fin_bank_accounts').select('*, provider_branches(name)').order('account_name')
                if (refreshRes.data) fetchedAccounts = refreshRes.data
            }
        }
        
        setAccounts(fetchedAccounts)
        setBranches(fetchedBranches)
        setLoading(false)
    }

    useEffect(() => { fetchAccounts() }, [])

    const selectAccount = async (acc: FinBankAccount) => {
        setSelectedAccount(acc)
        setLoadingTx(true)
        const { data } = await supabase.from('fin_bank_transactions').select('*').eq('account_id', acc.id).order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).limit(50)
        setTransactions((data || []) as any)
        setLoadingTx(false)
    }

    const handleSaveAccount = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!accForm.account_name) { alert('Account name required'); return }
        setSaving(true)
        try {
            const bal = parseFloat(accForm.opening_balance) || 0
            if (editingAccount) {
                const { error } = await supabase.from('fin_bank_accounts').update({
                    account_name: accForm.account_name, bank_name: accForm.bank_name || null,
                    account_number: accForm.account_number || null, account_type: accForm.account_type,
                    branch_id: accForm.branch_id || null, notes: accForm.notes || null,
                }).eq('id', editingAccount.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('fin_bank_accounts').insert({
                    account_name: accForm.account_name, bank_name: accForm.bank_name || null,
                    account_number: accForm.account_number || null, account_type: accForm.account_type,
                    opening_balance: bal, current_balance: bal,
                    branch_id: accForm.branch_id || null, notes: accForm.notes || null, currency,
                })
                if (error) throw error
            }
            setShowAddAccount(false)
            setEditingAccount(null)
            setAccForm({ account_name: '', bank_name: '', account_number: '', account_type: 'Checking', opening_balance: '', branch_id: '', notes: '' })
            fetchAccounts()
        } catch (err: any) { alert('Failed: ' + err.message) }
        setSaving(false)
    }

    const handleEditAccount = (acc: FinBankAccount) => {
        setEditingAccount(acc)
        setAccForm({
            account_name: acc.account_name, bank_name: acc.bank_name || '', account_number: acc.account_number || '',
            account_type: acc.account_type, opening_balance: String(acc.opening_balance), branch_id: acc.branch_id || '', notes: acc.notes || ''
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
        } catch (err: any) { alert('Failed: ' + err.message) }
        setSaving(false)
    }

    const handleDeleteAccount = async (id: string) => {
        if (!confirm('Delete this account? All transactions will be lost.')) return
        await supabase.from('fin_bank_transactions').delete().eq('account_id', id)
        await supabase.from('fin_bank_accounts').delete().eq('id', id)
        if (selectedAccount?.id === id) { setSelectedAccount(null); setTransactions([]) }
        fetchAccounts()
    }

    const totalBalance = accounts.reduce((s, a) => s + Number(a.current_balance || 0), 0)

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Bank Accounts</h1>
                    <p className="text-slate-500 mt-1">Manage accounts, balances, and transactions</p>
                </div>
                <button onClick={() => setShowAddAccount(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Add Account
                </button>
            </div>

            {/* Total Balance Banner */}
            <div className="bg-gradient-to-r from-slate-900 to-blue-900 rounded-2xl p-6 mb-6 text-white shadow-lg">
                <div className="text-sm font-medium text-blue-200">Total Cash Position</div>
                <div className="text-4xl font-black tabular-nums mt-1">{currency} {fmt(totalBalance)}</div>
                <div className="text-xs text-blue-300 mt-2">{accounts.length} active account{accounts.length !== 1 ? 's' : ''}</div>
            </div>

            {loading ? <CircularLoader /> : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Account Cards */}
                    <div className="lg:col-span-1 space-y-3">
                        {accounts.length === 0 ? (
                            <div className="text-center text-slate-500 bg-white rounded-2xl border border-slate-200 p-8">No accounts yet</div>
                        ) : accounts.map(acc => (
                            <div key={acc.id} onClick={() => selectAccount(acc)} role="button" tabIndex={0}
                                className={`w-full text-left p-4 rounded-2xl border transition group cursor-pointer ${selectedAccount?.id === acc.id ? 'border-blue-300 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm'}`}>
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2.5 rounded-xl ${selectedAccount?.id === acc.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                            <Landmark className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-900">{acc.account_name}</div>
                                            <div className="text-xs text-slate-500">
                                                {acc.account_number && <span className="font-semibold text-slate-600 mr-1">{acc.account_number}</span>}
                                                {acc.bank_name || acc.account_type}{acc.provider_branches ? ` • ${(acc as any).provider_branches.name}` : ''}
                                            </div>
                                        </div>
                                    </div>
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
                                </div>
                                <div className="mt-3 text-2xl font-black text-slate-900 tabular-nums">{fmt(Number(acc.current_balance))} <span className="text-sm font-medium text-slate-500">{acc.currency || currency}</span></div>
                            </div>
                        ))}
                    </div>

                    {/* Transaction Ledger */}
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                        {selectedAccount ? (
                            <>
                                <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900">{selectedAccount.account_name}</h2>
                                        <div className="text-sm text-slate-500">Balance: {currency} {fmt(Number(selectedAccount.current_balance))}</div>
                                    </div>
                                    <button onClick={() => { setShowAddTx(true); setTxForm({ type: 'Inflow', category: '', description: '', amount: '', transaction_date: new Date().toISOString().split('T')[0], notes: '' }) }}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-sm font-medium transition flex items-center gap-1.5">
                                        <Plus className="w-4 h-4" /> Transaction
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    {loadingTx ? <div className="p-8 flex justify-center"><CircularLoader /></div> : transactions.length === 0 ? (
                                        <div className="p-8 text-center text-slate-500">No transactions yet</div>
                                    ) : (
                                        <div className="divide-y divide-slate-100">
                                            {transactions.map(tx => (
                                                <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-2 rounded-xl ${tx.type === 'Inflow' ? 'bg-emerald-100' : tx.type === 'Outflow' ? 'bg-red-100' : 'bg-blue-100'}`}>
                                                            {tx.type === 'Inflow' ? <ArrowDownRight className="w-4 h-4 text-emerald-600" /> : tx.type === 'Outflow' ? <ArrowUpRight className="w-4 h-4 text-red-600" /> : <ArrowLeftRight className="w-4 h-4 text-blue-600" />}
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-slate-800 text-sm">{tx.description || tx.category || tx.type}</div>
                                                            <div className="text-xs text-slate-500">{new Date(tx.transaction_date).toLocaleDateString('en-GB')} {tx.category ? `• ${tx.category}` : ''}</div>
                                                        </div>
                                                    </div>
                                                    <div className={`font-bold tabular-nums ${tx.type === 'Inflow' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        {tx.type === 'Inflow' ? '+' : '−'}{fmt(Number(tx.amount))}
                                                    </div>
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
                                    <div className="font-medium">Select an account to view transactions</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Add Account Modal */}
            {showAddAccount && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-900">{editingAccount ? 'Edit Bank Account' : 'Add Bank Account'}</h2>
                            <button type="button" onClick={() => { setShowAddAccount(false); setEditingAccount(null) }} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSaveAccount} className="p-5 space-y-4">
                            <div><label className="block text-sm font-semibold text-slate-700 mb-1">Account Name *</label>
                                <input required value={accForm.account_name} onChange={e => setAccForm(f => ({ ...f, account_name: e.target.value }))} placeholder="e.g. Main Business Account"
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm" /></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="block text-sm font-semibold text-slate-700 mb-1">Bank Name</label>
                                    <input value={accForm.bank_name} onChange={e => setAccForm(f => ({ ...f, bank_name: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm" /></div>
                                <div><label className="block text-sm font-semibold text-slate-700 mb-1">Account Number</label>
                                    <input value={accForm.account_number} onChange={e => setAccForm(f => ({ ...f, account_number: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm" /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="block text-sm font-semibold text-slate-700 mb-1">Type</label>
                                    <select value={accForm.account_type} onChange={e => setAccForm(f => ({ ...f, account_type: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm">
                                        <option>Checking</option><option>Savings</option><option>Cash</option><option>Credit Card</option>
                                    </select></div>
                                <div><label className="block text-sm font-semibold text-slate-700 mb-1">Opening Balance</label>
                                    <input type="number" step="0.01" disabled={!!editingAccount} value={accForm.opening_balance} onChange={e => setAccForm(f => ({ ...f, opening_balance: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm tabular-nums disabled:opacity-50 disabled:bg-slate-50" /></div>
                            </div>
                            <div><label className="block text-sm font-semibold text-slate-700 mb-1">Branch</label>
                                <select value={accForm.branch_id} onChange={e => setAccForm(f => ({ ...f, branch_id: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm">
                                    <option value="">— All branches —</option>
                                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select></div>
                            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                                <button type="button" onClick={() => setShowAddAccount(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                                <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl shadow-md">
                                    {saving ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (editingAccount ? 'Save Changes' : 'Add Account')}
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
                            <h2 className="text-xl font-bold text-slate-900">Record Transaction</h2>
                            <button onClick={() => setShowAddTx(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleAddTransaction} className="p-5 space-y-4">
                            <div className="flex gap-2">
                                {['Inflow', 'Outflow'].map(t => (
                                    <button key={t} type="button" onClick={() => setTxForm(f => ({ ...f, type: t }))}
                                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${txForm.type === t ? (t === 'Inflow' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white') : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                        {t === 'Inflow' ? '↓ Inflow' : '↑ Outflow'}
                                    </button>
                                ))}
                            </div>
                            <div><label className="block text-sm font-semibold text-slate-700 mb-1">Amount *</label>
                                <input type="number" step="0.01" required value={txForm.amount} onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm text-lg font-bold tabular-nums" /></div>
                            <div><label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
                                <input type="date" value={txForm.transaction_date} onChange={e => setTxForm(f => ({ ...f, transaction_date: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm" /></div>
                            <div><label className="block text-sm font-semibold text-slate-700 mb-1">Category</label>
                                <input value={txForm.category} onChange={e => setTxForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Revenue, Rent, Salary..."
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm" /></div>
                            <div><label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                                <input value={txForm.description} onChange={e => setTxForm(f => ({ ...f, description: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 shadow-sm" /></div>
                            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                                <button type="button" onClick={() => setShowAddTx(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                                <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl shadow-md">
                                    {saving ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Record'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
