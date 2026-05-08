'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, PlusIcon, PencilSquareIcon, TrashIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
import CircularLoader from '@/components/CircularLoader'
import type { FinChartOfAccount } from '@/types/finance'

export default function ChartOfAccountsPage() {
  const { language } = useSettings()
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<FinChartOfAccount[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [editingAccount, setEditingAccount] = useState<FinChartOfAccount | null>(null)
  
  // Form State
  const [formData, setFormData] = useState<Partial<FinChartOfAccount>>({
    code: '', name: '', simplified_name: '', account_type: 'Asset', is_active: true, description: ''
  })
  const [saving, setSaving] = useState(false)

  const accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'COGS', 'OPEX', 'Salary', 'Tax', 'Depreciation', 'Other Expense', 'Other Income']

  useEffect(() => {
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('fin_chart_of_accounts').select('*').order('code', { ascending: true })
    if (data) setAccounts(data)
    setLoading(false)
  }

  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      if (typeFilter !== 'All' && a.account_type !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.simplified_name || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [accounts, search, typeFilter])

  const openAddModal = () => {
    setEditingAccount(null)
    setFormData({ code: '', name: '', simplified_name: '', account_type: 'Asset', is_active: true, description: '' })
    setShowModal(true)
  }

  const openEditModal = (acc: FinChartOfAccount) => {
    setEditingAccount(acc)
    setFormData({
      code: acc.code,
      name: acc.name,
      simplified_name: acc.simplified_name || '',
      account_type: acc.account_type,
      is_active: acc.is_active,
      description: acc.description || ''
    })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.code || !formData.name || !formData.account_type) {
      alert('Code, Name, and Type are required.')
      return
    }

    setSaving(true)
    const payload = {
      code: formData.code,
      name: formData.name,
      simplified_name: formData.simplified_name || null,
      account_type: formData.account_type as any,
      is_active: formData.is_active ?? true,
      description: formData.description || null
    }

    if (editingAccount) {
      const { error } = await supabase.from('fin_chart_of_accounts').update(payload).eq('id', editingAccount.id)
      if (!error) {
        setAccounts(prev => prev.map(a => a.id === editingAccount.id ? { ...a, ...payload } : a))
      } else {
        alert(error.message)
      }
    } else {
      const id = crypto.randomUUID()
      const { error } = await supabase.from('fin_chart_of_accounts').insert([{ id, ...payload, sort_order: 0, is_group: false }])
      if (!error) {
        fetchAccounts() // refresh to get the new account in correct order
      } else {
        alert(error.message)
      }
    }
    setSaving(false)
    setShowModal(false)
  }

  const toggleStatus = async (acc: FinChartOfAccount) => {
    const { error } = await supabase.from('fin_chart_of_accounts').update({ is_active: !acc.is_active }).eq('id', acc.id)
    if (!error) {
      setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, is_active: !acc.is_active } : a))
    }
  }

  const handleDelete = async (acc: FinChartOfAccount) => {
    if (!confirm(`Are you sure you want to delete ${acc.code} - ${acc.name}?`)) return
    
    // Check if referenced
    const { count: poCount } = await supabase.from('fin_payment_order_items').select('*', { count: 'exact', head: true }).eq('account_id', acc.id)
    const { count: invCount } = await supabase.from('fin_invoices').select('*', { count: 'exact', head: true }).eq('account_id', acc.id)
    
    if ((poCount && poCount > 0) || (invCount && invCount > 0)) {
      alert('Cannot delete this account because it is used in existing invoices or payment orders. Please deactivate it instead.')
      return
    }

    const { error } = await supabase.from('fin_chart_of_accounts').delete().eq('id', acc.id)
    if (!error) {
      setAccounts(prev => prev.filter(a => a.id !== acc.id))
    } else {
      alert(error.message)
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-slate-900">Chart of Accounts</h1>
          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full border border-slate-200">
            {accounts.length} Accounts
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openAddModal}
            className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium inline-flex items-center gap-2 transition"
          >
            <PlusIcon className="w-5 h-5" />
            <span>Add Account</span>
          </button>
          <Link
            href="/finance/settings"
            className="h-10 px-4 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium inline-flex items-center gap-2 transition shadow-sm"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            <span>Back to Settings</span>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 shadow-sm p-4 rounded-xl flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="sm:w-64">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="All">All Account Types</option>
            {accountTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center"><CircularLoader /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Account Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No accounts found.
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map(acc => {
                    // Indent based on code length
                    const depth = acc.code.length <= 3 ? 0 : acc.code.length - 3
                    const indentPx = depth * 16

                    return (
                      <tr key={acc.id} className="hover:bg-slate-50 transition group">
                        <td className="px-4 py-3 font-mono text-blue-600 font-medium">
                          {acc.code}
                        </td>
                        <td className="px-4 py-3">
                          <div style={{ paddingLeft: `${indentPx}px` }} className="flex flex-col">
                            <span className="font-medium text-slate-900">{acc.name}</span>
                            {acc.simplified_name && <span className="text-xs text-slate-500">{acc.simplified_name}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-md">
                            {acc.account_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleStatus(acc)}
                            className={`px-2 py-1 text-xs font-medium rounded-md flex items-center gap-1.5 transition ${
                              acc.is_active 
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {acc.is_active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={() => openEditModal(acc)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
                              title="Edit Account"
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(acc)}
                              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition"
                              title="Delete Account"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900">
                {editingAccount ? 'Edit Account' : 'Add New Account'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200 transition">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Account Code *</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 6421"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Account Type *</label>
                  <select
                    required
                    value={formData.account_type}
                    onChange={e => setFormData({ ...formData, account_type: e.target.value as any })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {accountTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Account Name (English) *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Marketing Expense"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Local Name (Vietnamese)</label>
                <input
                  type="text"
                  value={formData.simplified_name || ''}
                  onChange={e => setFormData({ ...formData, simplified_name: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Chi phí Marketing"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.is_active}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 bg-white"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-slate-700 select-none cursor-pointer">
                  Account is Active (available for selection)
                </label>
              </div>

              <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition flex items-center justify-center min-w-[100px]"
                >
                  {saving ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (editingAccount ? 'Save Changes' : 'Add Account')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
