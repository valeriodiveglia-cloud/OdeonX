'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Loader2, Trash2, Pencil, NotebookPen, X, CheckCircle, Tag } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { HRDisciplinaryCatalog, HRDisciplinaryCategory } from '@/types/human-resources'

const fmt = (n: number | null) => {
    if (n === null || isNaN(n)) return '0'
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
}

export default function FinesTablePage() {
    const [catalog, setCatalog] = useState<HRDisciplinaryCatalog[]>([])
    const [categories, setCategories] = useState<HRDisciplinaryCategory[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [editingNode, setEditingNode] = useState<HRDisciplinaryCatalog | null>(null)

    const fetchCatalog = useCallback(async () => {
        setLoading(true)
        try {
            const [cRes, catRes] = await Promise.all([
                supabase.from('hr_disciplinary_catalog').select('*, category:hr_disciplinary_categories(*)').order('infraction_name', { ascending: true }),
                supabase.from('hr_disciplinary_categories').select('*').order('name', { ascending: true })
            ])
            if (cRes.error) throw cRes.error
            setCatalog(cRes.data as HRDisciplinaryCatalog[] || [])
            setCategories(catRes.data as HRDisciplinaryCategory[] || [])
        } catch (err) {
            console.error('Error fetching catalog', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchCatalog()
    }, [fetchCatalog])

    async function handleSave(formData: Partial<HRDisciplinaryCatalog>) {
        try {
            if (editingNode) {
                const { error } = await supabase.from('hr_disciplinary_catalog').update(formData).eq('id', editingNode.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('hr_disciplinary_catalog').insert([formData])
                if (error) throw error
            }
            fetchCatalog()
            setModalOpen(false)
        } catch (err) {
            console.error(err)
            alert('Failed to save infraction.')
        }
    }

    async function handleDelete(id: string) {
        if (!window.confirm('Delete this infraction template? This will not remove past fines, but it will remove the template.')) return
        try {
            const { error } = await supabase.from('hr_disciplinary_catalog').delete().eq('id', id)
            if (error) throw error
            fetchCatalog()
        } catch (err) {
            console.error(err)
            alert('Failed to delete infraction.')
        }
    }

    return (
        <div className="min-h-screen flex flex-col p-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">
                        Fines Table
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">Manage the predefined list of infractions and their default fine amounts.</p>
                </div>
                <button 
                    onClick={() => { setEditingNode(null); setModalOpen(true); }} 
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                >
                    <Plus className="w-4 h-4" /> Add Infraction
                </button>
            </div>

            {/* Table Area */}
            <div className="flex-1 bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4 border-r border-gray-100 w-1/2">Infraction / Reason</th>
                                <th className="px-6 py-4 border-r border-gray-100 w-1/4">Category</th>
                                <th className="px-6 py-4 border-r border-gray-100 text-right">Default Amount (VND)</th>
                                <th className="px-6 py-4 text-center w-32">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={3} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                            ) : catalog.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="text-center py-12 text-gray-400">
                                        No infractions found. Add one to build the disciplinary catalog.
                                    </td>
                                </tr>
                            ) : (
                                catalog.map(c => (
                                    <tr key={c.id} className="hover:bg-gray-50 transition-colors group">
                                        <td className="px-6 py-4 border-r border-gray-100 text-gray-900 font-medium">
                                            {c.infraction_name}
                                        </td>
                                        <td className="px-6 py-4 border-r border-gray-100">
                                            {c.category ? (
                                                <span className="text-sm font-medium text-gray-900">
                                                    {c.category.name}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 text-xs italic">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 border-r border-gray-100 text-right font-mono">
                                            <span className="text-gray-900 font-semibold">{fmt(c.default_amount)}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => { setEditingNode(c); setModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDelete(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-900">{editingNode ? 'Edit Infraction' : 'Add Infraction'}</h3>
                            <button onClick={() => setModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-900 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            <FormCatalog 
                                initialData={editingNode} 
                                categories={categories}
                                onSave={handleSave} 
                                onCancel={() => setModalOpen(false)} 
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function FormCatalog({ initialData, categories, onSave, onCancel }: { initialData: HRDisciplinaryCatalog | null, categories: HRDisciplinaryCategory[], onSave: (d: Partial<HRDisciplinaryCatalog>) => void, onCancel: () => void }) {
    const [name, setName] = useState(initialData?.infraction_name || '')
    const [amount, setAmount] = useState(initialData?.default_amount || 0)
    const [categoryId, setCategoryId] = useState(initialData?.category_id || '')
    const [displayAmount, setDisplayAmount] = useState(initialData?.default_amount ? Number(initialData.default_amount).toLocaleString('en-US') : '')
    const [submitting, setSubmitting] = useState(false)

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!name || amount < 0) return
        setSubmitting(true)
        onSave({
            infraction_name: name,
            default_amount: amount,
            category_id: categoryId || null
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Reason / Infraction Name <span className="text-red-500">*</span></label>
                <input 
                    type="text" 
                    required 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 text-gray-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                    placeholder="e.g. Late for Shift" 
                />
            </div>

            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Category</label>
                <select 
                    value={categoryId} 
                    onChange={e => setCategoryId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 text-gray-900 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                    <option value="">No Category</option>
                    {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>
            
            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Default Fine Amount (VND) <span className="text-red-500">*</span></label>
                <input 
                    type="text" 
                    required 
                    value={displayAmount} 
                    onChange={e => {
                        let val = e.target.value.replace(/[^0-9]/g, '');
                        if (val) {
                            setDisplayAmount(parseInt(val, 10).toLocaleString('en-US'))
                            setAmount(parseInt(val, 10))
                        } else {
                            setDisplayAmount('')
                            setAmount(0)
                        }
                    }}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 text-gray-900 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" 
                    placeholder="0" 
                />
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-6">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">Cancel</button>
                <button type="submit" disabled={submitting || !name || amount < 0} className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {submitting ? 'Saving...' : 'Save'}
                </button>
            </div>
        </form>
    )
}
