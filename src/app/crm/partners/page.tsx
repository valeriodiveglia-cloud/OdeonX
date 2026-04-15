'use client'

import React, { useState, useEffect } from 'react'
import { Plus, Search, Filter, MoreHorizontal, MapPin, Mail, Phone, LayoutList, Columns3 } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase_shim'
import type { CRMPartner } from '@/types/crm'
import CircularLoader from '@/components/CircularLoader'
import { formatDistanceToNow } from 'date-fns'

const COLUMNS: { id: string, label: string, color: string }[] = [
    { id: 'New Leads', label: 'New Leads', color: 'bg-slate-100 border-slate-200 text-slate-700' },
    { id: 'Approached', label: 'Approached', color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { id: 'Negotiating', label: 'Negotiating', color: 'bg-amber-50 border-amber-200 text-amber-700' },
    { id: 'Active', label: 'Active Partners', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    { id: 'Paused', label: 'Paused / Inactive', color: 'bg-gray-100 border-gray-200 text-gray-500' },
]

export default function CRMPartnersPage() {
    const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
    const [searchTerm, setSearchTerm] = useState('')
    const [partners, setPartners] = useState<CRMPartner[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [dragActiveCol, setDragActiveCol] = useState<string | null>(null)

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        type: '',
        contact_name: '',
        email: '',
        phone: '',
        location: '',
        pipeline_stage: 'New Leads',
        notes: ''
    })

    const handleDragOver = (e: React.DragEvent, colId: string) => {
        e.preventDefault()
        if (dragActiveCol !== colId) {
            setDragActiveCol(colId)
        }
    }

    const handleDragLeave = (e: React.DragEvent) => {
        setDragActiveCol(null)
    }

    const handleDrop = async (e: React.DragEvent, newStage: string) => {
        e.preventDefault()
        setDragActiveCol(null)
        const partnerId = e.dataTransfer.getData('partnerId')
        if (!partnerId) return

        const partner = partners.find(p => p.id === partnerId)
        if (partner && (partner.pipeline_stage || partner.status) === newStage) return

        // Optimistic update
        setPartners(prev => prev.map(p => 
            p.id === partnerId ? { 
                ...p, 
                pipeline_stage: newStage, 
                status: newStage === 'Active' ? 'Active' : newStage === 'Negotiating' ? 'Negotiating' : newStage === 'Paused' ? 'Paused' : 'Lead' 
            } : p
        ))

        try {
            const { error } = await supabase
                .from('crm_partners')
                .update({ 
                    pipeline_stage: newStage,
                    status: newStage === 'Active' ? 'Active' : newStage === 'Negotiating' ? 'Negotiating' : newStage === 'Paused' ? 'Paused' : 'Lead'
                })
                .eq('id', partnerId)
            
            if (error) throw error
        } catch (error) {
            console.error('Error updating partner stage:', error)
            alert('Failed to update stage.')
            fetchPartners() // revert
        }
    }

    const fetchPartners = async () => {
        const { data } = await supabase.from('crm_partners').select('*').order('created_at', { ascending: false })
        if (data) setPartners(data)
        setLoading(false)
    }

    useEffect(() => {
        fetchPartners()
    }, [])

    const filteredPartners = partners.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (p.contact_name && p.contact_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.type && p.type.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    const handleCreatePartner = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        try {
            const { error } = await supabase.from('crm_partners').insert([
                {
                    name: formData.name,
                    type: formData.type || null,
                    contact_name: formData.contact_name || null,
                    email: formData.email || null,
                    phone: formData.phone || null,
                    location: formData.location || null,
                    status: formData.pipeline_stage === 'Active' ? 'Active' : formData.pipeline_stage === 'Negotiating' ? 'Negotiating' : 'Lead',
                    pipeline_stage: formData.pipeline_stage,
                    priority: 'Medium',
                    notes: formData.notes || null,
                }
            ])

            if (error) throw error

            setIsModalOpen(false)
            setFormData({
                name: '', type: '', contact_name: '', email: '', phone: '', location: '', pipeline_stage: 'New Leads', notes: ''
            })
            fetchPartners()
        } catch (error) {
            console.error('Error creating partner:', error)
            alert('Error creating partner. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="p-6 max-w-[1600px] h-screen flex flex-col mx-auto relative">
            <div className="flex justify-between items-end mb-6 shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Partners & Pipeline</h1>
                    <p className="text-slate-500 mt-1">Manage external collaborations, agencies, and referrers.</p>
                </div>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    New Partner
                </button>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search partners..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-64 shadow-sm"
                        />
                    </div>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                        onClick={() => setViewMode('kanban')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition ${viewMode === 'kanban' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Columns3 className="w-4 h-4" />
                        Pipeline
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <LayoutList className="w-4 h-4" />
                        List
                    </button>
                </div>
            </div>

            {/* Content Area */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <CircularLoader />
                </div>
            ) : (
                <div className="flex-1 min-h-0 relative">
                    {viewMode === 'kanban' ? (
                        <div className="absolute inset-0 flex gap-4 overflow-x-auto pb-4">
                            {COLUMNS.map(col => (
                                <div 
                                    key={col.id} 
                                    className={`min-w-[320px] w-[320px] flex flex-col rounded-2xl border p-3 h-full transition-colors ${dragActiveCol === col.id ? 'bg-blue-50/50 border-blue-400' : 'bg-slate-50/50 border-slate-200'}`}
                                    onDragOver={(e) => handleDragOver(e, col.id)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, col.id)}
                                >
                                    <div className={`px-3 py-1.5 rounded-lg border text-sm font-semibold mb-3 flex justify-between items-center ${col.color}`}>
                                        <span>{col.label}</span>
                                        <span className="bg-white/50 px-2 py-0.5 rounded-full text-xs">
                                            {filteredPartners.filter(p => (p.pipeline_stage || p.status) === col.id).length}
                                        </span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                                        {filteredPartners.filter(p => (p.pipeline_stage || p.status) === col.id).map(partner => (
                                            <PartnerCard key={partner.id} partner={partner} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="absolute inset-0 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-sm">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-sm">
                                        <th className="p-4 font-semibold">Partner</th>
                                        <th className="p-4 font-semibold">Code</th>
                                        <th className="p-4 font-semibold">Contact</th>
                                        <th className="p-4 font-semibold">Zone</th>
                                        <th className="p-4 font-semibold">Status</th>
                                        <th className="p-4 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredPartners.map(partner => (
                                        <tr key={partner.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                                            <td className="p-4">
                                                <div className="font-semibold text-slate-900">{partner.name}</div>
                                                <div className="text-sm text-slate-500">{partner.type || 'Unknown'} </div>
                                            </td>
                                            <td className="p-4">
                                                {partner.partner_code && (
                                                    <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-mono font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">
                                                        {partner.partner_code}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-sm text-slate-600">
                                                <div>{partner.phone || '-'}</div>
                                                <div>{partner.email || '-'}</div>
                                            </td>
                                            <td className="p-4 text-sm text-slate-600">
                                                <div className="inline-flex items-center gap-1"><MapPin className="w-3 h-3"/> {partner.location || '-'}</div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${
                                                    partner.status === 'Active' ? 'bg-emerald-100 text-emerald-700' :
                                                    partner.status === 'Negotiating' ? 'bg-amber-100 text-amber-700' :
                                                    partner.status === 'Approached' ? 'bg-blue-100 text-blue-700' :
                                                    partner.status === 'New' || partner.status === 'Lead' ? 'bg-slate-200 text-slate-700' :
                                                    'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {partner.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <Link href={`/crm/partners/${partner.id}`} className="text-blue-600 hover:underline text-sm font-medium">Details</Link>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredPartners.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-slate-500">No partners found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Create Partner Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h2 className="text-xl font-bold text-slate-900">Add New Partner</h2>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-2"
                            >
                                ✕
                            </button>
                        </div>
                        
                        <form onSubmit={handleCreatePartner} className="p-6 space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-2 sm:col-span-2">
                                    <label className="block text-sm font-medium text-slate-700">Company/Partner Name *</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({...formData, name: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="e.g. Grand Hotel Rome"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">Type Category</label>
                                    <select 
                                        value={formData.type}
                                        onChange={e => setFormData({...formData, type: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                    >
                                        <option value="">Select Category...</option>
                                        <option value="Hotel">Hotel</option>
                                        <option value="Tour Operator">Tour Operator</option>
                                        <option value="Concierge">Concierge</option>
                                        <option value="Corporate">Corporate</option>
                                        <option value="Influencer">Influencer</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">Pipeline Stage</label>
                                    <select 
                                        required
                                        value={formData.pipeline_stage}
                                        onChange={e => setFormData({...formData, pipeline_stage: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                    >
                                        <option value="New Leads">New Lead</option>
                                        <option value="Approached">Approached</option>
                                        <option value="Negotiating">Negotiating</option>
                                        <option value="Active">Active Partner</option>
                                        <option value="Paused">Paused / Inactive</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">Contact Person</label>
                                    <input 
                                        type="text" 
                                        value={formData.contact_name}
                                        onChange={e => setFormData({...formData, contact_name: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="e.g. Mario Rossi"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">Location / Zone</label>
                                    <input 
                                        type="text" 
                                        value={formData.location}
                                        onChange={e => setFormData({...formData, location: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="e.g. Centro Storico"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">Email Address</label>
                                    <input 
                                        type="email" 
                                        value={formData.email}
                                        onChange={e => setFormData({...formData, email: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="info@partner.com"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">Phone Number</label>
                                    <input 
                                        type="tel" 
                                        value={formData.phone}
                                        onChange={e => setFormData({...formData, phone: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="+39 333 1234567"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700">Notes & Context</label>
                                <textarea 
                                    rows={3}
                                    value={formData.notes}
                                    onChange={e => setFormData({...formData, notes: e.target.value})}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition resize-none"
                                    placeholder="Add any initial thoughts, background info, or strategic value for this partner..."
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button 
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            Saving...
                                        </>
                                    ) : 'Create Partner'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

function PartnerCard({ partner }: { partner: CRMPartner }) {
    return (
        <Link 
            href={`/crm/partners/${partner.id}`} 
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData('partnerId', partner.id)
            }}
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition cursor-pointer group block"
        >
            <div className="flex justify-between items-start mb-2">
                <div className="font-semibold text-slate-900 group-hover:text-blue-600 transition">{partner.name}</div>
                <button className="text-slate-400 hover:text-slate-600 shrink-0">
                    <MoreHorizontal className="w-5 h-5" />
                </button>
            </div>
            <div className="text-sm font-medium text-slate-700 mb-1">{partner.contact_name}</div>
            <div className="text-xs text-slate-500 mb-1">{partner.type}</div>
            {partner.partner_code && (
                <div className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-indigo-50 text-indigo-600 border border-indigo-100 mb-3">
                    {partner.partner_code}
                </div>
            )}
            
            <div className="space-y-1.5 mb-3">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{partner.location || '-'}</span>
                </div>
                {partner.phone && (
                   <div className="flex items-center gap-2 text-xs text-slate-600">
                       <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                       <span className="truncate">{partner.phone}</span>
                   </div>
                )}
                {partner.email && (
                   <div className="flex items-center gap-2 text-xs text-slate-600">
                       <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                       <span className="truncate">{partner.email}</span>
                   </div>
                )}
            </div>

            <div className="flex items-center justify-end mt-4 pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">
                    Added {formatDistanceToNow(new Date(partner.created_at), { addSuffix: true })}
                </span>
            </div>
        </Link>
    )
}
