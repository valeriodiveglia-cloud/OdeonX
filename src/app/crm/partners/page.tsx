'use client'

import React, { useState, useEffect } from 'react'
import { Plus, Search, Filter, MoreHorizontal, MapPin, Mail, Phone, LayoutList, Columns3, X, Archive, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase_shim'
import type { CRMPartner } from '@/types/crm'
import CircularLoader from '@/components/CircularLoader'
import { formatDistanceToNow } from 'date-fns'
import { vi, enUS } from 'date-fns/locale'

import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'

const getColumns = (lang: string): { id: string, label: string, color: string }[] => [
    { id: 'Leads', label: t(lang, 'Leads'), color: 'bg-slate-100 border-slate-200 text-slate-700' },
    { id: 'Approached', label: t(lang, 'Approached'), color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { id: 'Waiting for Material', label: t(lang, 'WaitingForMaterial'), color: 'bg-amber-50 border-amber-200 text-amber-700' },
    { id: 'Waiting for Activation', label: t(lang, 'WaitingForActivation'), color: 'bg-orange-50 border-orange-200 text-orange-700' },
    { id: 'Active', label: t(lang, 'Active'), color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
]

export default function CRMPartnersPage() {
    const { language } = useSettings()
    const columns = getColumns(language)
    const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'archive' | 'deleted'>('kanban')
    const [searchTerm, setSearchTerm] = useState('')
    const [filterAssignee, setFilterAssignee] = useState<string>('all')
    const [partners, setPartners] = useState<CRMPartner[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false)
    const [partnerToReject, setPartnerToReject] = useState<CRMPartner | null>(null)
    const [rejectReasonText, setRejectReasonText] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [dragActiveCol, setDragActiveCol] = useState<string | null>(null)
    const [currentUser, setCurrentUser] = useState<{ id: string, name: string, role?: string } | null>(null)
    const [accountsMap, setAccountsMap] = useState<Record<string, string>>({})

    useEffect(() => {
        const fetchUser = async () => {
            const { data: auth } = await supabase.auth.getUser()
            if (auth?.user) {
                const { data } = await supabase.from('app_accounts').select('name,email,role').eq('user_id', auth.user.id).maybeSingle()
                setCurrentUser({
                    id: auth.user.id,
                    name: data?.name || auth.user.user_metadata?.full_name || data?.email || auth.user.email || 'You',
                    role: data?.role
                })
            }
        }
        fetchUser()
    }, [])

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        type: '',
        contact_name: '',
        email: '',
        phone: '',
        location: '',
        pipeline_stage: 'Leads',
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

        if (newStage === 'Active') {
            alert('Partners can only automatically transition to Active once the first transaction is registered in the Referrals module.')
            return
        }

        if (newStage === 'Inactive/Paused') {
            if (currentUser?.role === 'sale advisor') {
                alert('Only Owners and Managers can move a partner to Inactive / Paused.')
                return
            }
            if ((partner?.pipeline_stage || partner?.status) !== 'Active') {
                alert('Partners can only be moved to Inactive / Paused if they are currently Active.')
                return
            }
        }

        // Optimistic update
        setPartners(prev => prev.map(p => 
            p.id === partnerId ? { 
                ...p, 
                pipeline_stage: newStage, 
                status: newStage 
            } : p
        ))

        try {
            const { error } = await supabase
                .from('crm_partners')
                .update({ 
                    pipeline_stage: newStage,
                    status: newStage
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
        const [partnersRes, accountsRes] = await Promise.all([
            supabase.from('crm_partners').select('*').order('created_at', { ascending: false }),
            supabase.from('app_accounts').select('user_id, name, email, role').in('role', ['sale advisor', 'manager', 'admin', 'owner'])
        ])
        
        if (partnersRes.data) setPartners(partnersRes.data)
        
        if (accountsRes.data) {
            const accMap: Record<string, string> = {}
            for (const acc of accountsRes.data) {
                if (acc.user_id) {
                    accMap[acc.user_id] = acc.name || acc.email || 'Unknown User'
                }
            }
            setAccountsMap(accMap)
        }
        
        setLoading(false)
        setLoading(false)
    }

    const handlePartnerAction = async (action: 'reject' | 'delete' | 'restore' | 'hard_delete' | 'recover_from_rejected' | 'set_inactive', partner: CRMPartner) => {
        if (action === 'reject') {
            setPartnerToReject(partner);
            setRejectReasonText('');
            setIsRejectModalOpen(true);
        } else if (action === 'delete') {
            if (!confirm(`Are you sure you want to delete ${partner.name}?`)) return;
            try {
                const { error } = await supabase.from('crm_partners').update({ is_deleted: true }).eq('id', partner.id);
                if (error) throw error;
                fetchPartners();
            } catch (err) {
                console.error(err);
                alert("Failed to delete partner");
            }
        } else if (action === 'restore') {
             try {
                const { error } = await supabase.from('crm_partners').update({ is_deleted: false }).eq('id', partner.id);
                if (error) throw error;
                fetchPartners();
            } catch (err) {
                console.error(err);
                alert("Failed to restore partner");
            }
        } else if (action === 'hard_delete') {
            if (!confirm(`Are you sure you want to PERMANENTLY delete ${partner.name}? This action cannot be undone.`)) return;
            try {
                const { error } = await supabase.from('crm_partners').delete().eq('id', partner.id);
                if (error) throw error;
                fetchPartners();
            } catch (err) {
                console.error(err);
                alert("Failed to delete partner");
            }
        } else if (action === 'recover_from_rejected') {
             try {
                const { error } = await supabase.from('crm_partners').update({ pipeline_stage: 'Leads', status: 'Active', rejection_reason: null }).eq('id', partner.id);
                if (error) throw error;
                fetchPartners();
            } catch (err) {
                console.error(err);
                alert("Failed to restore partner from rejected state");
            }
        } else if (action === 'set_inactive') {
            if (!confirm(`Are you sure you want to mark ${partner.name} as Inactive/Paused?`)) return;
            try {
                const { error } = await supabase.from('crm_partners').update({ pipeline_stage: 'Inactive/Paused', status: 'Inactive' }).eq('id', partner.id);
                if (error) throw error;
                fetchPartners();
            } catch (err) {
                console.error(err);
                alert("Failed to set partner to inactive");
            }
        }
    }

    useEffect(() => {
        fetchPartners()
    }, [])

    const filteredPartners = partners.filter(p => {
        if (viewMode === 'deleted') {
            if (!p.is_deleted) return false;
            // standard filters
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              p.contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              p.partner_code?.toLowerCase().includes(searchTerm.toLowerCase())
            const matchesAssignee = filterAssignee === 'all' ? true : 
                                  filterAssignee === 'unassigned' ? !p.owner_id : 
                                  p.owner_id === filterAssignee
            return matchesSearch && matchesAssignee;
        }

        if (p.is_deleted) return false;

        const stage = p.pipeline_stage || p.status
        const isArchiveStage = stage === 'Inactive/Paused' || stage === 'Rejected'
        
        if (viewMode === 'kanban' && isArchiveStage) return false
        if (viewMode === 'archive' && !isArchiveStage) return false

        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              p.contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              p.partner_code?.toLowerCase().includes(searchTerm.toLowerCase())
        
        const matchesAssignee = filterAssignee === 'all' ? true : 
                              filterAssignee === 'unassigned' ? !p.owner_id : 
                              p.owner_id === filterAssignee
                              
        return matchesSearch && matchesAssignee
    })

    const assigneesOptions = Object.entries(accountsMap).map(([id, name]) => ({ id, name })).sort((a,b) => a.name.localeCompare(b.name))

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
                    status: formData.pipeline_stage,
                    pipeline_stage: formData.pipeline_stage,
                    priority: 'Medium',
                    notes: formData.notes || null,
                    owner_id: currentUser?.role === 'sale advisor' ? currentUser.id : undefined,
                    created_by: currentUser?.id || null,
                }
            ])

            if (error) throw error

            setIsModalOpen(false)
            setFormData({
                name: '', type: '', contact_name: '', email: '', phone: '', location: '', pipeline_stage: 'Leads', notes: ''
            })
            fetchPartners()
        } catch (error) {
            console.error('Error creating partner:', error)
            alert('Error creating partner. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const confirmReject = async () => {
        if (!partnerToReject) return;
        if (rejectReasonText.trim() === '') {
            alert("A reason is required to reject a partner.");
            return;
        }
        setIsSubmitting(true)
        try {
            const upd = { pipeline_stage: 'Rejected', status: 'Rejected', rejection_reason: rejectReasonText };
            const { error } = await supabase.from('crm_partners').update(upd).eq('id', partnerToReject.id);
            if (error) throw error;
            setIsRejectModalOpen(false);
            fetchPartners();
        } catch (err) {
            console.error(err);
            alert("Failed to reject partner");
        } finally {
            setIsSubmitting(false)
            setPartnerToReject(null)
        }
    }

    return (
        <div className="p-6 max-w-[1600px] h-screen flex flex-col mx-auto relative">
            <div className="flex justify-between items-end mb-6 shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'PartnersAndPipeline')}</h1>
                    <p className="text-slate-500 mt-1">{t(language, 'PartnersAndPipelineDesc')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        {t(language, 'NewLead')}
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex gap-2">
                        <div className="relative">
                            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder={t(language, 'SearchPartners')}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-64 shadow-sm text-sm text-slate-900 placeholder:text-slate-400"
                            />
                        </div>
                        {currentUser?.role !== 'sale advisor' && (
                            <select
                                value={filterAssignee}
                                onChange={(e) => setFilterAssignee(e.target.value)}
                                className="px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm text-sm text-slate-900"
                            >
                                <option value="all">{t(language, 'AllAssignees')}</option>
                                <option value="unassigned">{t(language, 'Unassigned')}</option>
                                {assigneesOptions.map(opt => (
                                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div className="h-5 w-px bg-slate-300 hidden sm:block"></div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setViewMode('archive')}
                            className={`flex items-center gap-1.5 text-sm font-medium transition ${viewMode === 'archive' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            <Archive className="w-4 h-4" />
                            {t(language, 'Archive')}
                        </button>
                        {currentUser?.role === 'owner' && (
                            <button
                                onClick={() => setViewMode('deleted')}
                                className={`flex items-center gap-1.5 text-sm font-medium transition ${viewMode === 'deleted' ? 'text-red-500' : 'text-slate-500 hover:text-red-500'}`}
                            >
                                <Trash2 className="w-4 h-4" />
                                {t(language, 'Trash')}
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                            onClick={() => setViewMode('kanban')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition ${viewMode === 'kanban' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Columns3 className="w-4 h-4" />
                            {t(language, 'Pipeline')}
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <LayoutList className="w-4 h-4" />
                            {t(language, 'List')}
                        </button>
                    </div>
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
                            {columns.map(col => (
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
                                            {filteredPartners
                                                .filter(p => currentUser?.role === 'sale advisor' ? p.owner_id === currentUser.id : true)
                                                .filter(p => (p.pipeline_stage || p.status) === col.id).length}
                                        </span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                                        {filteredPartners
                                            .filter(p => currentUser?.role === 'sale advisor' ? p.owner_id === currentUser.id : true)
                                            .filter(p => (p.pipeline_stage || p.status) === col.id)
                                            .map(partner => (
                                            <PartnerCard key={partner.id} partner={partner} accountsMap={accountsMap} onAction={handlePartnerAction} currentUserRole={currentUser?.role} language={language} />
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
                                        <th className="p-4 font-semibold">{t(language, 'Partner')}</th>
                                        <th className="p-4 font-semibold">{t(language, 'Code')}</th>
                                        <th className="p-4 font-semibold">{t(language, 'Contact')}</th>
                                        <th className="p-4 font-semibold">{t(language, 'Zone')}</th>
                                        <th className="p-4 font-semibold">{t(language, 'AssignedTo')}</th>
                                        <th className="p-4 font-semibold">{t(language, 'Status')}</th>
                                        <th className="p-4 font-semibold text-right">{t(language, 'Actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredPartners.map(partner => (
                                        <tr key={partner.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                                            <td className="p-4 align-top w-1/4">
                                                <div className="font-semibold text-slate-900">{partner.name}</div>
                                                <div className="text-sm text-slate-500">{partner.type ? t(language, partner.type) : t(language, 'Unknown')} </div>
                                                {partner.rejection_reason && (
                                                    <div className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded-lg border border-red-100 max-w-sm line-clamp-3" title={partner.rejection_reason}>
                                                        <span className="font-semibold">{t(language, 'Reason')}:</span> {partner.rejection_reason}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4 align-top">
                                                {partner.partner_code && (
                                                    <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-mono font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">
                                                        {partner.partner_code}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-sm text-slate-600 align-top">
                                                <div>{partner.phone || '-'}</div>
                                                <div>{partner.email || '-'}</div>
                                            </td>
                                            <td className="p-4 text-sm text-slate-600 align-top">
                                                <div className="inline-flex items-center gap-1"><MapPin className="w-3 h-3"/> {partner.location || '-'}</div>
                                            </td>
                                            <td className="p-4 align-top">
                                                <div className="text-sm font-medium text-slate-700 font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md inline-block w-fit">
                                                    {partner.owner_id ? (accountsMap[partner.owner_id] || t(language, 'Unknown')) : t(language, 'Unassigned')}
                                                </div>
                                            </td>
                                            <td className="p-4 align-top">
                                                <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${
                                                    partner.status === 'Active' ? 'bg-emerald-100 text-emerald-700' :
                                                    partner.status === 'Waiting for Activation' ? 'bg-orange-100 text-orange-700' :
                                                    partner.status === 'Waiting for Material' ? 'bg-amber-100 text-amber-700' :
                                                    partner.status === 'Approached' ? 'bg-blue-100 text-blue-700' :
                                                    partner.status === 'Leads' ? 'bg-slate-200 text-slate-700' :
                                                    partner.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                                                    'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {t(language, partner.status.replace(/\/?\s/g, ''))}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {partner.is_deleted && currentUser?.role === 'owner' ? (
                                                        <>
                                                            <button 
                                                                onClick={() => handlePartnerAction('restore', partner)}
                                                                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1 rounded-md text-sm font-medium transition"
                                                            >
                                                                {t(language, 'Restore')}
                                                            </button>
                                                            <button 
                                                                onClick={() => handlePartnerAction('hard_delete', partner)}
                                                                className="text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded-md text-sm font-medium transition"
                                                            >
                                                                {t(language, 'PermanentlyDelete')}
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            {partner.pipeline_stage === 'Rejected' && (
                                                                <button 
                                                                    onClick={() => handlePartnerAction('recover_from_rejected', partner)}
                                                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1 rounded-md text-sm font-medium transition"
                                                                >
                                                                    {t(language, 'Restore')}
                                                                </button>
                                                            )}
                                                            <Link href={`/crm/partners/${partner.id}`} className="text-slate-600 hover:text-blue-600 hover:underline text-sm font-medium ml-2">{t(language, 'Details')}</Link>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredPartners.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-slate-500">{t(language, 'NoPartnersFound')}</td>
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
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">{t(language, 'AddNewLead')}</h2>
                                {currentUser && (
                                    <p className="text-sm text-slate-500 mt-1">{t(language, 'CreatedBy')}: <span className="font-medium text-slate-700">{currentUser.name}</span></p>
                                )}
                            </div>
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
                                    <label className="block text-sm font-medium text-slate-700">{t(language, 'CompanyPartnerName')}</label>
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
                                    <label className="block text-sm font-medium text-slate-700">{t(language, 'TypeCategory')}</label>
                                    <select 
                                        value={formData.type}
                                        onChange={e => setFormData({...formData, type: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                    >
                                        <option value="">{t(language, 'SelectCategory')}</option>
                                        <option value="Hotel">{t(language, 'Hotel')}</option>
                                        <option value="Tour Operator">{t(language, 'TourOperator')}</option>
                                        <option value="Concierge">{t(language, 'Concierge')}</option>
                                        <option value="Corporate">{t(language, 'Corporate')}</option>
                                        <option value="Influencer">{t(language, 'Influencer')}</option>
                                        <option value="Guesthouse">{t(language, 'Guesthouse')}</option>
                                        <option value="Homestay">{t(language, 'Homestay')}</option>
                                        <option value="Coffee Shop">{t(language, 'CoffeeShop')}</option>
                                        <option value="Restaurant">{t(language, 'Restaurant')}</option>
                                        <option value="Bus Company">{t(language, 'BusCompany')}</option>
                                        <option value="Other">{t(language, 'Other')}</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">{t(language, 'ContactPerson')}</label>
                                    <input 
                                        type="text" 
                                        value={formData.contact_name}
                                        onChange={e => setFormData({...formData, contact_name: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="Add name..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">{t(language, 'LocationZone')}</label>
                                    <input 
                                        type="text" 
                                        value={formData.location}
                                        onChange={e => setFormData({...formData, location: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="Add address..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">{t(language, 'EmailAddress')}</label>
                                    <input 
                                        type="email" 
                                        value={formData.email}
                                        onChange={e => setFormData({...formData, email: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="info@partner.com"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">{t(language, 'PhoneNumber')}</label>
                                    <input 
                                        type="tel" 
                                        value={formData.phone}
                                        onChange={e => setFormData({...formData, phone: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="Add phone number..."
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700">{t(language, 'NotesContext')}</label>
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
                                    {t(language, 'Cancel')}
                                </button>
                                <button 
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            {t(language, 'Saving')}
                                        </>
                                    ) : t(language, 'CreateLead')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isRejectModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10 shrink-0">
                            <h2 className="text-xl font-bold text-slate-900">{t(language, 'MarkAsRejected')}</h2>
                            <button 
                                onClick={() => setIsRejectModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-2"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
                            <p className="text-slate-600 mb-6 text-sm">
                                {t(language, 'RejectReasonDesc1')} <strong>({partnerToReject?.name})</strong> {t(language, 'RejectReasonDesc2')}
                            </p>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700">{t(language, 'Reason')}</label>
                                <textarea 
                                    rows={4}
                                    value={rejectReasonText}
                                    onChange={e => setRejectReasonText(e.target.value)}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition resize-none"
                                    placeholder="Add the reason..."
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0 bg-white shrink-0">
                            <button 
                                onClick={() => setIsRejectModalOpen(false)}
                                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                            >
                                {t(language, 'Cancel')}
                            </button>
                            <button 
                                onClick={confirmReject}
                                disabled={isSubmitting || !rejectReasonText.trim()}
                                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        {t(language, 'Saving')}
                                    </>
                                ) : t(language, 'SaveStatus')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function PartnerCard({ partner, accountsMap, onAction, currentUserRole, language }: { partner: CRMPartner, accountsMap: Record<string, string>, onAction: (action: 'reject' | 'delete' | 'restore' | 'hard_delete' | 'recover_from_rejected' | 'set_inactive', partner: CRMPartner) => void, currentUserRole?: string, language: string }) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const router = useRouter();

    return (
        <div 
            onClick={() => router.push(`/crm/partners/${partner.id}`)}
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData('partnerId', partner.id)
            }}
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition group relative block cursor-pointer"
        >
            <div className="flex justify-between items-start mb-2">
                <div className="font-semibold text-slate-900 group-hover:text-blue-600 transition flex-1">
                    {partner.name}
                </div>
                <div className="relative">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen) }}
                        className="text-slate-400 hover:text-slate-600 shrink-0 p-1"
                    >
                        <MoreHorizontal className="w-5 h-5" />
                    </button>
                    {isMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false) }}></div>
                            <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-20">
                                {partner.pipeline_stage === 'Rejected' ? (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setIsMenuOpen(false)
                                                onAction('recover_from_rejected', partner)
                                            }}
                                            className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm text-blue-600 font-medium transition"
                                        >
                                            {t(language, 'RestoreToPipeline')}
                                        </button>
                                ) : partner.pipeline_stage === 'Active' ? (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setIsMenuOpen(false)
                                                onAction('set_inactive', partner)
                                            }}
                                            className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 transition"
                                        >
                                            {t(language, 'SetInactive')}
                                        </button>
                                ) : (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setIsMenuOpen(false)
                                                onAction('reject', partner)
                                            }}
                                            className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 transition"
                                        >
                                            {t(language, 'RejectLead')}
                                        </button>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setIsMenuOpen(false)
                                        onAction('delete', partner)
                                    }}
                                    className="w-full text-left px-4 py-2 hover:bg-red-50 text-sm text-red-600 transition"
                                >
                                    {t(language, 'DeleteLead')}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
            <div className="text-sm font-medium text-slate-700 mb-1">{partner.contact_name}</div>
            <div className="text-xs text-slate-500 mb-1">{partner.type ? t(language, partner.type) : t(language, 'Unknown')}</div>
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
            
            <div className="flex items-center gap-2 mb-3 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 w-fit">
                <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                    {partner.owner_id && accountsMap[partner.owner_id] ? accountsMap[partner.owner_id].charAt(0).toUpperCase() : '?'}
                </div>
                <span className="text-xs text-slate-700 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]">
                    {partner.owner_id ? (accountsMap[partner.owner_id] || t(language, 'Unknown')) : t(language, 'Unassigned')}
                </span>
            </div>

            <div className="flex items-center justify-end mt-4 pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">
                    {t(language, 'Added')} {formatDistanceToNow(new Date(partner.created_at), { addSuffix: true, locale: language === 'vi' ? vi : enUS })}
                </span>
            </div>
        </div>
    )
}
