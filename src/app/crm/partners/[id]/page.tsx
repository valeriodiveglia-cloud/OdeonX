'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, UserPlus, Target, MessageSquare, HandCoins, FileText, Activity, MapPin, Mail, Phone, Calendar, Plus, Clock, Check, CheckCircle2, AlertCircle, XCircle, X, Download, Trash2, UploadCloud, Edit3, ChevronLeft, ChevronRight, CalendarCheck2, Briefcase, MoreHorizontal, User } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Menu } from '@headlessui/react'
import { supabase } from '@/lib/supabase_shim'
import type { CRMPartner, CRMInteraction, CRMReferral, CRMDocument, CRMTask } from '@/types/crm'
import CircularLoader from '@/components/CircularLoader'
import { formatDistanceToNow, format } from 'date-fns'
import { vi, enUS } from 'date-fns/locale'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }
function formatMonthLabel(d: Date, language?: string) { return d.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' }) }

const getTabs = (language: string) => [
    { id: 'overview', label: t(language, 'OverviewTab'), icon: Activity },
    { id: 'negotiations', label: t(language, 'AgreementsTab'), icon: HandCoins },
    { id: 'referrals', label: t(language, 'Referrals'), icon: Target },
    { id: 'interactions', label: t(language, 'Interactions'), icon: MessageSquare },
    { id: 'tasks', label: t(language, 'Tasks'), icon: CalendarCheck2 },
    { id: 'documents', label: t(language, 'Documents'), icon: FileText },
]

export default function PartnerDetail() {
    const params = useParams()
    const router = useRouter()
    const { language, currency, crmPartnerRules, crmCommissionRules, crmCommissionType, crmAdvisorCommissionPct } = useSettings()
    const partnerId = params.id as string
    const TABS = getTabs(language)

    /* month cursor */
    const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
    const monthInputValue = React.useMemo(() => toMonthInputValue(monthCursor), [monthCursor])

    function prevMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), -1)) }
    function nextMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), 1)) }
    function onPickMonth(val: string) { const d = fromMonthInputValue(val); if (d) setMonthCursor(d) }

    const [activeTab, setActiveTab] = useState('overview')
    const [partner, setPartner] = useState<CRMPartner | null>(null)
    const [ownerName, setOwnerName] = useState<string>('')
    const [createdByName, setCreatedByName] = useState<string>('')
    const [currentUser, setCurrentUser] = useState<{ id: string, name: string, role?: string } | null>(null)

    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false)
    const [rejectReasonText, setRejectReasonText] = useState('')
    const [isSubmittingReject, setIsSubmittingReject] = useState(false)

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

    const [assignees, setAssignees] = useState<{id: string, name: string}[]>([])

    useEffect(() => {
        const fetchNames = async () => {
            if (partner?.owner_id) {
                const { data } = await supabase.from('app_accounts').select('name,email').eq('user_id', partner.owner_id).maybeSingle()
                if (data) {
                    setOwnerName(data.name || data.email || '')
                }
            } else {
                setOwnerName('')
            }
            if (partner?.created_by) {
                const { data } = await supabase.from('app_accounts').select('name,email').eq('user_id', partner.created_by).maybeSingle()
                if (data) {
                    setCreatedByName(data.name || data.email || '')
                }
            } else {
                setCreatedByName('')
            }
        }
        fetchNames()
        
        const fetchAssignees = async () => {
            const { data } = await supabase.from('app_accounts').select('user_id, name, email').eq('role', 'sale advisor')
            if (data) {
                const formatted = data
                    .filter(acc => acc.user_id)
                    .map(acc => ({ id: acc.user_id, name: acc.name || acc.email || 'Unknown User' }))
                setAssignees(formatted.sort((a,b) => a.name.localeCompare(b.name)))
            }
        }
        fetchAssignees()
    }, [partner?.owner_id])
    const [interactions, setInteractions] = useState<CRMInteraction[]>([])
    const [referrals, setReferrals] = useState<CRMReferral[]>([])
    const [documents, setDocuments] = useState<CRMDocument[]>([])
    const [tasks, setTasks] = useState<CRMTask[]>([])
    

    const [loading, setLoading] = useState(true)
    const [isUploadingDocument, setIsUploadingDocument] = useState(false)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const [isInteractionModalOpen, setIsInteractionModalOpen] = useState(false)
    const [isSubmittingInteraction, setIsSubmittingInteraction] = useState(false)
    const [interactionFormData, setInteractionFormData] = useState({
        type: 'Note',
        date: new Date().toISOString().substring(0, 10),
        notes: ''
    })

    const handleLogInteraction = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmittingInteraction(true);
        try {
            const { error, data } = await supabase
                .from('crm_interactions')
                .insert([{
                    partner_id: partnerId,
                    type: interactionFormData.type,
                    date: interactionFormData.date,
                    notes: interactionFormData.notes
                }])
                .select()
                .single();

            if (error) throw error;

            setInteractions([data, ...interactions]);
            setIsInteractionModalOpen(false);
            setInteractionFormData({ type: 'Note', date: new Date().toISOString().substring(0, 10), notes: '' });
        } catch (error) {
            console.error('Error logging interaction:', error);
            alert('Failed to log interaction.');
        } finally {
            setIsSubmittingInteraction(false);
        }
    }

    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
    const [isSubmittingTask, setIsSubmittingTask] = useState(false)
    const [taskFormData, setTaskFormData] = useState<Partial<CRMTask>>({
        priority: 'Medium',
        status: 'Pending'
    })

    const handleTaskSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmittingTask(true)
        try {
            const payload = {
                partner_id: partnerId,
                title: taskFormData.title,
                description: taskFormData.description || null,
                due_date: taskFormData.due_date || null,
                priority: taskFormData.priority,
                status: taskFormData.status,
            }
            if (taskFormData.id) {
                const { error } = await supabase.from('crm_tasks').update(payload).eq('id', taskFormData.id)
                if (error) throw error
                setTasks(tasks.map(t => t.id === taskFormData.id ? { ...t, ...payload } as CRMTask : t))
            } else {
                const { data, error } = await supabase.from('crm_tasks').insert([payload]).select().single()
                if (error) throw error
                setTasks([data, ...tasks])
            }
            setIsTaskModalOpen(false)
            setTaskFormData({ priority: 'Medium', status: 'Pending' })
        } catch (error) {
            console.error('Error saving task:', error)
            alert('Failed to save task.')
        } finally {
            setIsSubmittingTask(false)
        }
    }

    const handleTaskDelete = async () => {
        if (!taskFormData.id) return
        if (!confirm('Are you sure you want to delete this task?')) return
        try {
            const { error } = await supabase.from('crm_tasks').delete().eq('id', taskFormData.id)
            if (error) throw error
            setTasks(tasks.filter(t => t.id !== taskFormData.id))
            setIsTaskModalOpen(false)
        } catch (error) {
            console.error('Error deleting task:', error)
            alert('Failed to delete task.')
        }
    }

    const formatCurrencyInput = (val: string) => {
        const cleaned = val.replace(/[^\d.]/g, '');
        const parts = cleaned.split('.');
        if (parts[0]) {
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }
        return parts.slice(0, 2).join('.');
    }


    const [editFormData, setEditFormData] = useState({
        name: '',
        type: '',
        contact_name: '',
        email: '',
        phone: '',
        location: '',
        notes: '',
        owner_id: ''
    })

    const handleUpdatePartner = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        try {
            const upd = {
                name: editFormData.name,
                type: editFormData.type || null,
                contact_name: editFormData.contact_name || null,
                email: editFormData.email || null,
                phone: editFormData.phone || null,
                location: editFormData.location || null,
                notes: editFormData.notes || null,
                owner_id: editFormData.owner_id || null,
            }

            const isDowngradingAccess = currentUser?.role === 'sale advisor' && upd.owner_id !== currentUser.id;

            const req = supabase.from('crm_partners').update(upd).eq('id', partnerId)

            if (isDowngradingAccess) {
                const { error } = await req;
                if (error) throw error;
                alert('Partner reassigned successfully. You lose access and will be redirected.')
                router.push('/crm/partners')
                return // Halt completion
            } else {
                const { error, data } = await req.select().single()
                if (error) throw error
                setPartner(data)
                setIsEditModalOpen(false)
            }
        } catch (error) {
            console.error('Error updating partner:', error)
            alert('Error updating partner. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAction = async (action: 'reject' | 'delete' | 'restore' | 'hard_delete' | 'recover_from_rejected' | 'set_inactive') => {
        if (!partner) return;
        if (action === 'reject') {
            setRejectReasonText('');
            setIsRejectModalOpen(true);
            return;
        } else if (action === 'delete') {
            if (!confirm(`Are you sure you want to delete ${partner.name}?`)) return;
            try {
                const { error } = await supabase.from('crm_partners').update({ is_deleted: true }).eq('id', partnerId);
                if (error) throw error;
                setPartner({ ...partner, is_deleted: true });
                router.push('/crm/partners'); // Go back to list since it's deleted
            } catch (err) {
                console.error('Error deleting:', err);
                alert("Failed to delete partner");
            }
        } else if (action === 'restore') {
            try {
                const { error } = await supabase.from('crm_partners').update({ is_deleted: false }).eq('id', partnerId);
                if (error) throw error;
                setPartner({ ...partner, is_deleted: false });
            } catch (err) {
                console.error(err);
                alert("Failed to restore partner");
            }
        } else if (action === 'hard_delete') {
            if (!confirm(`Are you sure you want to PERMANENTLY delete ${partner.name}? This action cannot be undone.`)) return;
            try {
                const { error } = await supabase.from('crm_partners').delete().eq('id', partnerId);
                if (error) throw error;
                router.push('/crm/partners');
            } catch (err) {
                console.error(err);
                alert("Failed to delete partner");
            }
        } else if (action === 'recover_from_rejected') {
            try {
                const upd = { pipeline_stage: 'Leads', status: 'Active', rejection_reason: null };
                const { error } = await supabase.from('crm_partners').update(upd).eq('id', partnerId);
                if (error) throw error;
                setPartner({ ...partner, ...upd });
                alert("Partner restored to the pipeline!");
            } catch (err) {
                console.error(err);
                alert("Failed to restore partner from rejected state");
            }
        } else if (action === 'set_inactive') {
            if (!confirm(`Are you sure you want to mark ${partner.name} as Inactive/Paused?`)) return;
            try {
                const upd = { pipeline_stage: 'Inactive/Paused', status: 'Inactive' };
                const { error } = await supabase.from('crm_partners').update(upd).eq('id', partnerId);
                if (error) throw error;
                setPartner({ ...partner, ...upd });
                alert("Partner marked as Inactive.");
            } catch (err) {
                console.error(err);
                alert("Failed to set partner to inactive");
            }
        }
    }

    const confirmReject = async () => {
        if (!partner) return;
        if (rejectReasonText.trim() === '') {
            alert("A reason is required to reject a partner.");
            return;
        }
        setIsSubmittingReject(true);
        try {
            const upd = { pipeline_stage: 'Rejected', status: 'Rejected', rejection_reason: rejectReasonText };
            const { error } = await supabase.from('crm_partners').update(upd).eq('id', partnerId);
            if (error) throw error;
            setPartner({ ...partner, ...upd });
            setIsRejectModalOpen(false);
        } catch (err) {
            console.error('Error rejecting:', err);
            alert("Failed to reject partner");
        } finally {
            setIsSubmittingReject(false);
        }
    }


    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        setIsUploadingDocument(true);

        try {
            const fileExt = file.name.includes('.') ? file.name.split('.').pop() : '';
            const fileName = `${partnerId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('crm-documents')
                .upload(fileName, file, { upsert: true, cacheControl: '3600' });
            
            if (uploadError) throw uploadError;

            const { data: docData, error: dbError } = await supabase.from('crm_documents').insert([{
                partner_id: partnerId,
                name: file.name,
                file_path: uploadData.path,
                file_type: file.type || fileExt || 'application/octet-stream',
                file_size: file.size
            }]).select().single();

            if (dbError) throw dbError;

            setDocuments([docData, ...documents]);
        } catch (error: any) {
            console.error('Error uploading document:', error);
            alert(`Upload failed: ${error.message}`);
        } finally {
            setIsUploadingDocument(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleDeleteDocument = async (id: string, filePath: string) => {
        if (!confirm('Are you sure you want to delete this document?')) return;
        
        try {
            const { error: storageError } = await supabase.storage.from('crm-documents').remove([filePath]);
            if (storageError) console.error('Storage deletion error:', storageError);

            const { error: dbError } = await supabase.from('crm_documents').delete().eq('id', id);
            if (dbError) throw dbError;

            setDocuments(documents.filter(d => d.id !== id));
        } catch (error: any) {
            console.error('Error deleting document:', error);
            alert(`Deletion failed: ${error.message}`);
        }
    };

    const handleDownloadDocument = async (filePath: string, fileName: string) => {
        try {
            const { data, error } = await supabase.storage.from('crm-documents').createSignedUrl(filePath, 3600);
            if (error) throw error;
            
            const link = document.createElement('a');
            link.href = data.signedUrl;
            link.download = fileName;
            link.target = "_blank";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error: any) {
            console.error('Error downloading document:', error);
            alert(`Download failed: ${error.message}`);
        }
    };

    useEffect(() => {
        if (!partnerId) return

        async function fetchData() {
            const [partnerRes, interactionsRes, referralsRes, documentsRes, tasksRes] = await Promise.all([
                supabase.from('crm_partners').select('*').eq('id', partnerId).single(),
                supabase.from('crm_interactions').select('*').eq('partner_id', partnerId).order('date', { ascending: false }),
                supabase.from('crm_referrals').select('*').eq('partner_id', partnerId),
                supabase.from('crm_documents').select('*').eq('partner_id', partnerId).order('created_at', { ascending: false }),
                supabase.from('crm_tasks').select('*').eq('partner_id', partnerId).order('created_at', { ascending: false })
            ])

            if (partnerRes.data) setPartner(partnerRes.data)
            if (interactionsRes.data) setInteractions(interactionsRes.data)
            if (referralsRes.data) setReferrals(referralsRes.data)
            if (documentsRes.data) setDocuments(documentsRes.data)
            if (tasksRes && tasksRes.data) setTasks(tasksRes.data)
            setLoading(false)
        }

        fetchData()
    }, [partnerId])

    const filteredReferrals = React.useMemo(() => referrals.filter(r => {
        if (!r.arrival_date) return false
        const d = new Date(r.arrival_date)
        return d.getFullYear() === monthCursor.getFullYear() && d.getMonth() === monthCursor.getMonth()
    }), [referrals, monthCursor])

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <CircularLoader />
            </div>
        )
    }

    if (!partner) {
        return (
            <div className="flex flex-col h-screen items-center justify-center bg-slate-50">
                <h2 className="text-xl font-bold text-slate-800">{t(language, 'PartnerNotFound')}</h2>
                <button onClick={() => router.push('/crm/partners')} className="mt-4 text-blue-600 hover:underline">
                    {t(language, 'BackToPipeline')}
                </button>
            </div>
        )
    }

    const totalPax = filteredReferrals.reduce((sum, r) => sum + (r.party_size || 0), 0)
    const maturedRevenue = filteredReferrals.reduce((sum, r) => sum + (r.revenue_generated || 0), 0)
    
    // Using filteredReferrals instead of referrals
    const hasDiscounts = crmPartnerRules?.has_discount || false
    const totalCommission = filteredReferrals.reduce((sum, r) => sum + (r.commission_value || 0), 0)
    const totalDiscount = hasDiscounts ? filteredReferrals.reduce((sum, r) => {
        const discountValue = crmPartnerRules?.client_discount_value || 0
        return sum + (r.revenue_generated * (discountValue / 100))
    }, 0) : 0

    const completedReferrals = filteredReferrals.filter(r => r.status === 'Paid').length
    const validationRate = filteredReferrals.length > 0 ? Math.round((completedReferrals / filteredReferrals.length) * 100) : 0

    // All-time metrics for Overview Tab
    const allTimeRevenue = referrals.reduce((sum, r) => sum + (r.revenue_generated || 0), 0)
    const allTimeReferrals = referrals.length
    
    const maxDiscountAllTime = crmPartnerRules?.has_discount ? (crmPartnerRules.client_discount_value || 0) : 0
    const allTimeDiscounts = maxDiscountAllTime > 0 ? referrals.reduce((sum, r) => sum + ((r.revenue_generated || 0) * (maxDiscountAllTime / 100)), 0) : 0

    const pendingCommissions = referrals.filter(r => r.status === 'Pending').reduce((sum, r) => sum + (r.commission_value || 0), 0)
    const paidCommissions = referrals.filter(r => r.status === 'Paid').reduce((sum, r) => sum + (r.commission_value || 0), 0)

    let activeMonths = 1;
    if (referrals.length > 0) {
        const dates = referrals.filter(r => r.arrival_date).map(r => new Date(r.arrival_date!).getTime()).filter(t => !isNaN(t))
        if (dates.length > 0) {
            const minDate = new Date(Math.min(...dates))
            const maxDate = new Date(Math.max(...dates))
            activeMonths = Math.max(1, (maxDate.getFullYear() - minDate.getFullYear()) * 12 + (maxDate.getMonth() - minDate.getMonth()) + 1)
        }
    }
    
    const avgMonthlyRevenue = allTimeRevenue / activeMonths
    const avgMonthlyReferrals = allTimeReferrals / activeMonths

    const chartData = (() => {
        const obj = referrals.reduce((acc, r) => {
            if(!r.arrival_date) return acc;
            const date = new Date(r.arrival_date);
            const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
            const label = format(date, 'MMM yy');
            
            if (!acc[key]) acc[key] = { sortKey: key, label, referrals: 0, revenue: 0 };
            acc[key].referrals += 1;
            acc[key].revenue += r.revenue_generated || 0;
            return acc;
        }, {} as any);

        return Object.values(obj).sort((a: any, b: any) => a.sortKey.localeCompare(b.sortKey));
    })();

    const canEdit = currentUser?.role === 'sale advisor' ? partner?.owner_id === currentUser.id : true;

    return (
        <div className="flex flex-col h-screen overflow-hidden">
            {/* Header Section */}
            <div className="bg-white border-b border-slate-200 shrink-0">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <button 
                        onClick={() => router.push('/crm/partners')}
                        className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-sm font-medium mb-4"
                    >
                        <ArrowLeft className="w-4 h-4" /> {t(language, 'BackToPipeline')}
                    </button>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-700 text-2xl font-bold uppercase">
                                {partner.name.charAt(0)}
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900">{partner.name}</h1>
                                <div className="flex flex-wrap items-center gap-3 mt-1">
                                    <p className="text-slate-500 font-medium">{t(language, partner.type?.replace(/\s+/g, '') as any) || partner.type || t(language, 'UnknownType')} {partner.location ? `at ${partner.location}` : ''}</p>
                                    <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                                        {ownerName ? (
                                            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-medium flex items-center gap-1.5 border border-indigo-100 w-fit font-semibold">
                                                <Briefcase className="w-3 h-3" />
                                                {t(language, 'AssignedTo')} {ownerName}
                                            </span>
                                        ) : (
                                            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-medium flex items-center gap-1.5 border border-slate-200 w-fit font-medium">
                                                <Briefcase className="w-3 h-3" />
                                                {t(language, 'Unassigned')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className={`px-3 py-1 rounded-full font-semibold text-sm ${
                                partner.pipeline_stage === 'Active' ? 'bg-emerald-100 text-emerald-700' :
                                partner.pipeline_stage === 'Waiting for Activation' ? 'bg-orange-100 text-orange-700' :
                                partner.pipeline_stage === 'Waiting for Material' ? 'bg-amber-100 text-amber-700' :
                                partner.pipeline_stage === 'Approached' ? 'bg-blue-100 text-blue-700' :
                                partner.pipeline_stage === 'Leads' ? 'bg-slate-200 text-slate-700' :
                                partner.pipeline_stage === 'Rejected' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-500'
                            }`}>
                                {t(language, (partner.pipeline_stage || partner.status)?.replace(/[\s\/]+/g, '') as any) || partner.pipeline_stage || partner.status}
                            </div>
                            
                            {canEdit && (
                                <button 
                                    onClick={() => {
                                        setEditFormData({
                                            name: partner.name,
                                            type: partner.type || '',
                                            contact_name: partner.contact_name || '',
                                            email: partner.email || '',
                                            phone: partner.phone || '',
                                            location: partner.location || '',
                                            notes: partner.notes || '',
                                            owner_id: partner.owner_id || ''
                                        })
                                        setIsEditModalOpen(true)
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm"
                                >
                                    {t(language, 'EditDetails')}
                                </button>
                            )}

                            {canEdit && (
                                <Menu as="div" className="relative">
                                    <Menu.Button className="p-2 text-slate-400 hover:text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition">
                                        <MoreHorizontal className="w-5 h-5" />
                                    </Menu.Button>
                                    
                                    <Menu.Items className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50 focus:outline-none">
                                        {partner.is_deleted && currentUser?.role === 'owner' ? (
                                            <>
                                                <Menu.Item>
                                                    {({ active }) => (
                                                        <button
                                                            onClick={() => handleAction('restore')}
                                                            className={`${active ? 'bg-slate-50' : ''} flex w-full items-center px-4 py-2 text-sm text-emerald-600 font-medium`}
                                                        >
                                                            {t(language, 'RestoreLead')}
                                                        </button>
                                                    )}
                                                </Menu.Item>
                                                <Menu.Item>
                                                    {({ active }) => (
                                                        <button
                                                            onClick={() => handleAction('hard_delete')}
                                                            className={`${active ? 'bg-red-50' : ''} flex w-full items-center px-4 py-2 text-sm text-red-600 font-medium`}
                                                        >
                                                            {t(language, 'PermanentlyDelete')}
                                                        </button>
                                                    )}
                                                </Menu.Item>
                                            </>
                                        ) : (
                                            <>
                                                {partner.pipeline_stage === 'Rejected' ? (
                                                    <Menu.Item>
                                                        {({ active }) => (
                                                            <button
                                                                onClick={() => handleAction('recover_from_rejected')}
                                                                className={`${active ? 'bg-slate-50' : ''} flex w-full items-center px-4 py-2 text-sm text-blue-600 font-medium`}
                                                            >
                                                                {t(language, 'RestoreToPipeline')}
                                                            </button>
                                                        )}
                                                    </Menu.Item>
                                                ) : partner.pipeline_stage === 'Active' ? (
                                                    <Menu.Item>
                                                        {({ active }) => (
                                                            <button
                                                                onClick={() => handleAction('set_inactive')}
                                                                className={`${active ? 'bg-slate-50' : ''} flex w-full items-center px-4 py-2 text-sm text-slate-700 font-medium`}
                                                            >
                                                                {t(language, 'SetInactive')}
                                                            </button>
                                                        )}
                                                    </Menu.Item>
                                                ) : (
                                                    <Menu.Item>
                                                        {({ active }) => (
                                                            <button
                                                                onClick={() => handleAction('reject')}
                                                                className={`${active ? 'bg-slate-50' : ''} flex w-full items-center px-4 py-2 text-sm text-slate-700 font-medium`}
                                                            >
                                                                {t(language, 'RejectLead')}
                                                            </button>
                                                        )}
                                                    </Menu.Item>
                                                )}
                                                <Menu.Item>
                                                    {({ active }) => (
                                                        <button
                                                            onClick={() => handleAction('delete')}
                                                            className={`${active ? 'bg-red-50' : ''} flex w-full items-center px-4 py-2 text-sm text-red-600 font-medium`}
                                                        >
                                                            {t(language, 'DeleteLead')}
                                                        </button>
                                                    )}
                                                </Menu.Item>
                                            </>
                                        )}
                                    </Menu.Items>
                                </Menu>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                {canEdit && (
                <div className="max-w-7xl mx-auto px-6 mt-4">
                    <div className="flex gap-6 border-b border-slate-200 overflow-x-auto no-scrollbar">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 pb-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition ${
                                    activeTab === tab.id 
                                        ? 'border-blue-600 text-blue-600' 
                                        : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto bg-slate-50">
                <div className="max-w-7xl mx-auto px-6 py-6">
                    {!canEdit && (
                        <div className="max-w-2xl mx-auto mt-8">
                            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                                <h3 className="font-bold text-slate-900 mb-6">{t(language, 'ContactInfo')}</h3>
                                <div className="space-y-6">
                                    <div className="flex items-start gap-4 text-slate-600 text-sm">
                                        <div className="p-3 bg-slate-50 rounded-xl text-slate-400 shrink-0">
                                            <User className="w-5 h-5" />
                                        </div>
                                        <div className="py-1">
                                            <div className="font-medium text-slate-900 text-base mb-0.5">{partner.contact_name || '-'}</div>
                                            <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">{t(language, 'ContactPerson')}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4 text-slate-600 text-sm">
                                        <div className="p-3 bg-slate-50 rounded-xl text-slate-400 shrink-0">
                                            <Phone className="w-5 h-5" />
                                        </div>
                                        <div className="py-1">
                                            <div className="font-medium text-slate-900 text-base mb-0.5">{partner.phone || '-'}</div>
                                            <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">{t(language, 'PhoneNumber')}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4 text-slate-600 text-sm">
                                        <div className="p-3 bg-slate-50 rounded-xl text-slate-400 shrink-0">
                                            <Mail className="w-5 h-5" />
                                        </div>
                                        <div className="py-1">
                                            <div className="font-medium text-slate-900 text-base mb-0.5">{partner.email || '-'}</div>
                                            <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">{t(language, 'EmailAddress')}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4 text-slate-600 text-sm">
                                        <div className="p-3 bg-slate-50 rounded-xl text-slate-400 shrink-0">
                                            <MapPin className="w-5 h-5" />
                                        </div>
                                        <div className="py-1">
                                            <div className="font-medium text-slate-900 text-base mb-0.5">{partner.location || '-'}</div>
                                            <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">{t(language, 'LocationZone')}</div>
                                        </div>
                                    </div>
                                    <div className="border-t border-slate-100 my-2 pt-2"></div>
                                    <div className="flex items-start gap-4 text-slate-600 text-sm">
                                        <div className="p-3 bg-indigo-50 rounded-xl text-indigo-500 shrink-0">
                                            <Briefcase className="w-5 h-5" />
                                        </div>
                                        <div className="py-1">
                                            <div className="font-medium text-slate-900 text-base mb-0.5">{ownerName || t(language, 'UnassignedCompany')}</div>
                                            <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">{t(language, 'AssignedTo')}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4 text-slate-600 text-sm">
                                        <div className="p-3 bg-slate-50 rounded-xl text-slate-400 shrink-0">
                                            <UserPlus className="w-5 h-5" />
                                        </div>
                                        <div className="py-1">
                                            <div className="font-medium text-slate-900 text-base mb-0.5">{createdByName || t(language, 'System')}</div>
                                            <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">{t(language, 'Creator')}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'overview' && canEdit && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Detailed Info Card */}
                            <div className="lg:col-span-1 space-y-6 flex flex-col">
                                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm shrink-0">
                                    <h3 className="font-bold text-slate-900 mb-4">{t(language, 'ContactInfo')}</h3>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2.5 text-slate-600 text-sm">
                                            <User className="w-4 h-4 text-slate-400 shrink-0" />
                                            <div className="font-medium text-slate-900 truncate" title={partner.contact_name || undefined}>{partner.contact_name || '-'}</div>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-slate-600 text-sm">
                                            <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                                            <div className="font-medium text-slate-900 truncate" title={partner.phone || undefined}>{partner.phone || '-'}</div>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-slate-600 text-sm">
                                            <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                                            <div className="font-medium text-slate-900 truncate" title={partner.email || undefined}>{partner.email || '-'}</div>
                                        </div>
                                        <div className="flex items-start gap-2.5 text-slate-600 text-sm">
                                            <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                            <div className="font-medium text-slate-900 line-clamp-2" title={partner.location || undefined}>{partner.location || '-'}</div>
                                        </div>
                                        <div className="border-t border-slate-100 my-2"></div>
                                        <div className="flex items-center gap-2.5 text-slate-600 text-sm">
                                            <Briefcase className="w-4 h-4 text-indigo-400 shrink-0" />
                                            <div className="text-xs text-slate-500 mr-1">{t(language, 'Advisor')}:</div>
                                            <div className="font-medium text-slate-900 truncate">{ownerName || t(language, 'Unassigned')}</div>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-slate-600 text-sm">
                                            <UserPlus className="w-4 h-4 text-slate-400 shrink-0" />
                                            <div className="text-xs text-slate-500 mr-1">{t(language, 'Creator')}:</div>
                                            <div className="font-medium text-slate-900 truncate">{createdByName || t(language, 'System')}</div>
                                        </div>
                                    </div>

                                    {(partner.notes && partner.notes.trim() !== '') && (
                                        <>
                                            <hr className="my-5 border-slate-100" />
                                            <h3 className="font-bold text-slate-900 mb-3">{t(language, 'Notes')}</h3>
                                            <p className="text-sm text-slate-600 bg-amber-50 border border-amber-100 p-3 rounded-xl leading-relaxed whitespace-pre-wrap">
                                                {partner.notes}
                                            </p>
                                        </>
                                    )}
                                </div>
                                
                                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0">
                                    <div className="flex justify-between items-center mb-4 shrink-0">
                                        <h3 className="font-bold text-slate-900">{t(language, 'RecentActivity')}</h3>
                                        {canEdit && (
                                            <button onClick={() => setIsInteractionModalOpen(true)} className="text-sm font-medium text-blue-600">{t(language, 'LogInteraction')}</button>
                                        )}
                                    </div>
                                    
                                    <div className="relative border-l-2 border-slate-100 ml-3 space-y-6 pb-4 overflow-y-auto flex-1 pr-2">
                                        {interactions.length === 0 ? (
                                            <div className="text-slate-500 text-sm ml-4 border-none">{t(language, 'NoRecentInteractions')}</div>
                                        ) : null}
                                        {interactions.slice(0, 10).map(interaction => (
                                            <div key={interaction.id} className="relative pl-6">
                                                <div className="absolute w-3 h-3 bg-blue-600 rounded-full -left-[7px] top-1.5 ring-4 ring-white"></div>
                                                <div className="text-sm text-slate-500 mb-1 flex items-center gap-1">
                                                    <Calendar className="w-3.5 h-3.5"/> 
                                                    {formatDistanceToNow(new Date(interaction.date), { addSuffix: true, locale: language === 'vi' ? vi : enUS })}
                                                </div>
                                                <div className="font-medium text-slate-900 mb-1">{interaction.type}</div>
                                                <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
                                                    {interaction.notes}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            {/* Highlights */}
                            <div className="lg:col-span-2 space-y-6">
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* Prominent Row */}
                                    <div className="col-span-2 bg-blue-50 border border-blue-100 rounded-2xl p-5 border-l-[4px] border-l-blue-500 relative overflow-hidden group">
                                        <div className="absolute right-0 top-0 w-24 h-24 bg-blue-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                                        <div className="text-blue-600 text-xs font-bold uppercase tracking-wider mb-1 relative z-10">{t(language, 'TotalRevenue')}</div>
                                        <div className="text-3xl font-black text-slate-900 relative z-10">{currency} {allTimeRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                                    </div>
                                    <div className="col-span-2 bg-emerald-50 border border-emerald-100 rounded-2xl p-5 border-l-[4px] border-l-emerald-500 relative overflow-hidden group">
                                        <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                                        <div className="text-emerald-700 text-xs font-bold uppercase tracking-wider mb-1 relative z-10">{t(language, 'TotalReferrals')}</div>
                                        <div className="text-3xl font-black text-slate-900 relative z-10">{allTimeReferrals}</div>
                                    </div>
                                    
                                    {/* Secondary Row */}
                                    <div className="col-span-1 bg-purple-50 border border-purple-100 rounded-2xl p-3 sm:p-4 border-l-[4px] border-l-purple-500 flex flex-col justify-center">
                                        <div className="text-purple-700 leading-tight text-[10px] font-bold uppercase tracking-wider mb-0.5 opacity-80">{t(language, 'AvgMonthlyRev')}</div>
                                        <div className="text-lg font-black text-slate-900 truncate" title={`${currency} ${avgMonthlyRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}>{currency} {avgMonthlyRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                                    </div>
                                    <div className="col-span-1 bg-orange-50 border border-orange-100 rounded-2xl p-3 sm:p-4 border-l-[4px] border-l-orange-500 flex flex-col justify-center">
                                        <div className="text-orange-700 leading-tight text-[10px] font-bold uppercase tracking-wider mb-0.5 opacity-80">{t(language, 'AvgMonthlyRefs')}</div>
                                        <div className="text-lg font-black text-slate-900">{avgMonthlyReferrals.toFixed(1)}</div>
                                    </div>
                                    
                                    <div className="col-span-1 bg-amber-50 border border-amber-100 rounded-2xl p-3 sm:p-4 border-l-[4px] border-l-amber-500 flex flex-col justify-center">
                                        <div className="text-amber-700 leading-tight text-[10px] font-bold uppercase tracking-wider mb-0.5 opacity-80">{t(language, 'PendingComm')}</div>
                                        <div className="text-lg font-black text-slate-900 truncate" title={`${currency} ${pendingCommissions.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}>{currency} {pendingCommissions.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                                    </div>
                                    <div className="col-span-1 bg-emerald-50 border border-emerald-100 rounded-2xl p-3 sm:p-4 border-l-[4px] border-l-emerald-500 flex flex-col justify-center">
                                        <div className="text-emerald-700 leading-tight text-[10px] font-bold uppercase tracking-wider mb-0.5 opacity-80">{t(language, 'PaidComm')}</div>
                                        <div className="text-lg font-black text-slate-900 truncate" title={`${currency} ${paidCommissions.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}>{currency} {paidCommissions.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                                    </div>

                                    {/* Conditional Row */}
                                    {(allTimeDiscounts > 0 || hasDiscounts) && (
                                        <div className="col-span-2 lg:col-span-4 bg-cyan-50 border border-cyan-100 rounded-2xl p-4 sm:p-5 border-l-[4px] border-l-cyan-500 flex flex-col sm:flex-row justify-between sm:items-center mt-1">
                                            <div className="text-cyan-700 text-xs font-bold uppercase tracking-wider mb-1 sm:mb-0">{t(language, 'TotalActiveDiscounts')}</div>
                                            <div className="text-2xl font-black text-slate-900">{currency} {allTimeDiscounts.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                                        </div>
                                    )}
                                </div>

                                {chartData.length > 0 && (
                                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mt-6">
                                        <div className="flex justify-between items-center mb-6">
                                            <h3 className="font-bold text-slate-900">{t(language, 'ReferralsGrowthTrend')}</h3>
                                        </div>
                                        <div className="h-56">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="colorRefs" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis 
                                                        dataKey="label" 
                                                        axisLine={false} 
                                                        tickLine={false} 
                                                        tick={{ fontSize: 12, fill: '#94a3b8' }} 
                                                        dy={10}
                                                    />
                                                    <YAxis 
                                                        axisLine={false} 
                                                        tickLine={false} 
                                                        tick={{ fontSize: 12, fill: '#94a3b8' }}
                                                        allowDecimals={false}
                                                    />
                                                    <Tooltip 
                                                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                    />
                                                    <Area 
                                                        type="monotone" 
                                                        dataKey="referrals" 
                                                        name="Referrals"
                                                        stroke="#3b82f6" 
                                                        strokeWidth={3}
                                                        fillOpacity={1} 
                                                        fill="url(#colorRefs)" 
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'negotiations' && canEdit && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">{t(language, 'GlobalAgreementsTerms')}</h3>
                                    <p className="text-slate-500 text-sm mt-1">{t(language, 'GlobalAgreementsSubtitle')}</p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                {/* ADVISOR OVERVIEW */}
                                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 h-fit">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                            <Briefcase className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-slate-900">{t(language, 'SalesAdvisorCommissions')}</h2>
                                            <p className="text-sm text-slate-500">{t(language, 'InternalRepCompensation')}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{t(language, 'Type')}</div>
                                            <div className="font-bold text-slate-900">
                                                {crmCommissionType === 'Acquisition + Maintenance' ? t(language, 'AcquisitionMaintenanceFee') : 
                                                 crmCommissionType === 'Fixed Activation Bonus + Maintenance' ? t(language, 'FixedBonusMaintenanceFee') : 
                                                 crmCommissionType === 'Standard Flat Percentage' ? t(language, 'StandardFlatPercentage') : 
                                                 crmCommissionType}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            {crmCommissionType === 'Fixed Activation Bonus + Maintenance' && (
                                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex flex-col justify-center">
                                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{t(language, 'Bonus')}</div>
                                                    <div className="font-bold text-slate-900 text-xl">{currency} {crmCommissionRules?.fixed_bonus}</div>
                                                </div>
                                            )}
                                            {crmCommissionType !== 'Fixed Activation Bonus + Maintenance' && (
                                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex flex-col justify-center">
                                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{t(language, 'FirstClient')}</div>
                                                    <div className="font-bold text-slate-900 text-xl">{crmCommissionRules?.acquisition_pct}%</div>
                                                </div>
                                            )}
                                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex flex-col justify-center">
                                                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{t(language, 'Subsequent')}</div>
                                                <div className="font-bold text-slate-900 text-xl">{crmCommissionRules?.maintenance_pct}%</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* PARTNER OVERVIEW */}
                                {crmPartnerRules && (
                                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 h-fit">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-12 h-12 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center">
                                            <HandCoins className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-slate-900">{t(language, 'PartnerIncentivesRules')}</h2>
                                            <p className="text-sm text-slate-500">{t(language, 'PartnerRewardDesc')}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {crmPartnerRules?.has_commission && (
                                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 font-semibold text-violet-600">{t(language, 'PartnerCommission')}</div>
                                            <div className="font-bold text-slate-900 text-3xl">
                                                {crmPartnerRules.commission_type === 'Percentage' ? `${crmPartnerRules.commission_value}%` : `${currency} ${crmPartnerRules.commission_value}`}
                                            </div>
                                        </div>
                                        )}
                                        {crmPartnerRules?.has_discount && (
                                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 font-semibold text-emerald-600">{t(language, 'ClientDiscount')}</div>
                                            <div className="font-bold text-slate-900 text-3xl">
                                                {crmPartnerRules.client_discount_type === 'Percentage' ? `${crmPartnerRules.client_discount_value}%` : `${currency} ${crmPartnerRules.client_discount_value}`}
                                            </div>
                                        </div>
                                        )}
                                        {(crmPartnerRules?.has_commission && crmPartnerRules?.has_discount && crmPartnerRules?.commission_type === 'Percentage') && (
                                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{t(language, 'BaseStructure')}</div>
                                            <div className="font-bold text-slate-900">{t(language, crmPartnerRules.commission_base?.replace(/\s+/g, '') as any) || crmPartnerRules.commission_base}</div>
                                        </div>
                                        )}
                                    </div>
                                    {crmPartnerRules?.details && (
                                        <div className="mt-4 text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100 whitespace-pre-wrap leading-relaxed">
                                            <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t(language, 'TermsConditions')}</span>
                                            {crmPartnerRules.details}
                                        </div>
                                    )}
                                </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'referrals' && canEdit && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">{t(language, 'ReferralsHistory')}</h3>
                                    <p className="text-slate-500 text-sm mt-1">{t(language, 'ReferralsHistoryDesc')}</p>
                                </div>
                            </div>

                            <div className="mb-4 grid grid-cols-3 items-center">
                                <div className="justify-self-start">
                                    <button onClick={prevMonth} className="text-blue-600 hover:text-blue-800 underline underline-offset-4 decoration-blue-300/40 text-sm font-medium">
                                        {t(language, 'Previous')}
                                    </button>
                                </div>
                                <div className="justify-self-center flex items-center gap-2">
                                    <span className="text-slate-700 font-semibold">{formatMonthLabel(monthCursor, language)}</span>
                                    <Calendar className="w-5 h-5 text-slate-400" />
                                </div>
                                <div className="justify-self-end">
                                    <button onClick={nextMonth} className="text-blue-600 hover:text-blue-800 underline underline-offset-4 decoration-blue-300/40 text-sm font-medium">
                                        {t(language, 'Next')}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl shadow p-3 overflow-x-auto">
                                <div className="overflow-x-auto">
                                    <table className="w-full table-auto text-sm text-gray-900 text-left border-collapse min-w-[800px]">
                                        <thead>
                                            <tr className="text-gray-500 font-semibold border-b border-gray-200">
                                                <th className="p-2 whitespace-nowrap">{t(language, 'DateRef')}</th>
                                                <th className="p-2 whitespace-nowrap">{t(language, 'Pax')}</th>
                                                <th className="p-2 whitespace-nowrap text-right">{t(language, 'Revenue')} ({currency})</th>
                                                {hasDiscounts && (
                                                    <th className="p-2 whitespace-nowrap text-right">{t(language, 'Discount')} ({currency})</th>
                                                )}
                                                <th className="p-2 whitespace-nowrap text-right">{t(language, 'Commission')} ({currency})</th>
                                                <th className="p-2 whitespace-nowrap">{t(language, 'Status')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredReferrals.length === 0 ? (
                                                <tr>
                                                    <td colSpan={hasDiscounts ? 6 : 5} className="p-8 text-center text-gray-500">
                                                        {t(language, 'NoReferralsFound')}
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredReferrals.map(ref => (
                                                    <tr key={ref.id} className="border-t hover:bg-blue-50/40">
                                                        <td className="p-2 whitespace-nowrap">
                                                            <div className="flex items-center gap-2 font-medium whitespace-nowrap">
                                                                <Calendar className="w-4 h-4 text-gray-400"/> {ref.arrival_date ? new Date(ref.arrival_date).toLocaleDateString() : 'N/A'}
                                                            </div>
                                                            <div className="text-xs text-gray-500 mt-0.5 uppercase font-mono">{ref.id.split('-')[0]}</div>
                                                        </td>
                                                        <td className="p-2 whitespace-nowrap">
                                                            <div className="font-medium text-gray-900">{ref.party_size}</div>
                                                        </td>
                                                        <td className="p-2 whitespace-nowrap text-right tabular-nums font-semibold">
                                                            {formatCurrencyInput((ref.revenue_generated || 0).toFixed(0))}
                                                        </td>
                                                        {hasDiscounts && (
                                                            <td className="p-2 whitespace-nowrap text-right">
                                                                <div className="font-semibold text-emerald-600 tabular-nums">
                                                                    {formatCurrencyInput((ref.revenue_generated * ((crmPartnerRules?.client_discount_value || 0) / 100)).toFixed(0))}
                                                                </div>
                                                            </td>
                                                        )}
                                                        <td className="p-2 whitespace-nowrap text-right text-amber-600 font-semibold tabular-nums">
                                                            {formatCurrencyInput((ref.commission_value || 0).toFixed(0))}
                                                        </td>
                                                        <td className="p-2 whitespace-nowrap">
                                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                                ref.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                                                                ref.status === 'Pending' ? 'bg-blue-100 text-blue-700' :
                                                                ref.status === 'Cancelled' ? 'bg-slate-100 text-slate-600' :
                                                                'bg-red-100 text-red-700'
                                                            }`}>
                                                                {ref.status === 'Paid' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                                                {ref.status === 'Pending' && <AlertCircle className="w-3.5 h-3.5" />}
                                                                {ref.status === 'Disputed' && <XCircle className="w-3.5 h-3.5" />}
                                                                {ref.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                        {filteredReferrals.length > 0 && (
                                            <tbody>
                                                <tr className="border-t bg-gray-50 font-semibold">
                                                    <td className="p-2 text-right">
                                                        {t(language, 'Totals')}
                                                    </td>
                                                    <td className="p-2">
                                                        {totalPax}
                                                    </td>
                                                    <td className="p-2 text-right tabular-nums">
                                                        {formatCurrencyInput(maturedRevenue.toFixed(0))}
                                                    </td>
                                                    {hasDiscounts && (
                                                        <td className="p-2 text-right text-emerald-600 tabular-nums">
                                                            {formatCurrencyInput(totalDiscount.toFixed(0))}
                                                        </td>
                                                    )}
                                                    <td className="p-2 text-right text-amber-600 tabular-nums">
                                                        {formatCurrencyInput(totalCommission.toFixed(0))}
                                                    </td>
                                                    <td className="p-2"></td>
                                                </tr>
                                            </tbody>
                                        )}
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'interactions' && canEdit && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">{t(language, 'InteractionsHistory')}</h3>
                                    <p className="text-slate-500 text-sm mt-1">{t(language, 'InteractionsHistoryDesc')}</p>
                                </div>
                                {canEdit && (
                                <button 
                                    onClick={() => setIsInteractionModalOpen(true)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    {t(language, 'LogInteraction')}
                                </button>
                                )}
                            </div>

                            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative">
                                <div className="absolute top-0 bottom-0 left-10 w-0.5 bg-slate-100"></div>
                                <div className="space-y-8 relative">
                                    {interactions.length === 0 ? (
                                        <div className="text-center py-10 text-slate-500 bg-slate-50 rounded-xl border border-slate-200 border-dashed ml-12">
                                            {t(language, 'NoInteractionsLogged')}
                                        </div>
                                    ) : (
                                        interactions.map(interaction => (
                                            <div key={interaction.id} className="relative pl-12 group">
                                                <div className="absolute w-4 h-4 bg-blue-600 outline outline-4 outline-white rounded-full -left-[7px] top-1 transition-transform group-hover:scale-125"></div>
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2">
                                                    <div className="flex items-center gap-3">
                                                        <div className="font-bold text-slate-900 text-base">{interaction.type}</div>
                                                    </div>
                                                    <div className="text-sm text-slate-500 font-medium flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 w-fit">
                                                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                        {formatDistanceToNow(new Date(interaction.date), { addSuffix: true, locale: language === 'vi' ? vi : enUS })}
                                                        <span className="text-slate-300 mx-1">•</span>
                                                        <span>{format(new Date(interaction.date), 'MMM d, yyyy')}</span>
                                                    </div>
                                                </div>
                                                <div className="text-sm text-slate-600 bg-slate-50 hover:bg-white p-4 rounded-xl border border-slate-100 hover:shadow-sm hover:border-slate-200 transition-all whitespace-pre-wrap leading-relaxed">
                                                    {interaction.notes}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {activeTab === 'tasks' && canEdit && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">{t(language, 'PartnerTasks')}</h3>
                                    <p className="text-slate-500 text-sm mt-1">{t(language, 'PartnerTasksDesc')}</p>
                                </div>
                                {canEdit && (
                                <button 
                                    onClick={() => {
                                        setTaskFormData({ priority: 'Medium', status: 'Pending' })
                                        setIsTaskModalOpen(true)
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    {t(language, 'NewTask')}
                                </button>
                                )}
                            </div>

                            <div className="flex flex-col gap-3">
                                {tasks.length === 0 ? (
                                    <div className="py-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 border-dashed">
                                        {t(language, 'NoTasksCreated')}
                                    </div>
                                ) : (
                                    tasks.map(task => (
                                        <div key={task.id} onClick={() => { if(canEdit) { setTaskFormData(task); setIsTaskModalOpen(true); } }} className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${canEdit ? 'hover:border-blue-300 hover:shadow-md cursor-pointer' : ''}`}>
                                            <div className="flex flex-col">
                                                <div className="font-semibold text-slate-900 leading-snug">{task.title}</div>
                                                {task.description && (
                                                    <div className="text-sm text-slate-500 line-clamp-1 mt-0.5">
                                                        {task.description}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex items-center gap-4 shrink-0">
                                                {task.due_date && (
                                                    <div className="flex items-center gap-1.5 text-sm text-slate-500 font-medium whitespace-nowrap">
                                                        <Clock className="w-4 h-4" />
                                                        {format(new Date(task.due_date), 'MMM d, yyyy')}
                                                    </div>
                                                )}
                                                <span className={`inline-flex px-2 py-1 rounded text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
                                                    task.priority === 'High' ? 'bg-red-100 text-red-700' :
                                                    task.priority === 'Medium' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-slate-100 text-slate-600'
                                                }`}>
                                                    {task.priority}
                                                </span>
                                                <span className={`inline-flex px-2 py-1 rounded text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
                                                    task.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                                                    task.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                                                    task.status === 'Pending' ? 'bg-slate-100 text-slate-700' :
                                                    'bg-gray-100 text-gray-500'
                                                }`}>
                                                    {task.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'documents' && canEdit && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">{t(language, 'PartnerDocuments')}</h3>
                                    <p className="text-slate-500 text-sm mt-1">{t(language, 'PartnerDocumentsDesc')}</p>
                                </div>
                                {canEdit && (
                                <div className="relative">
                                    <input 
                                        type="file" 
                                        id="document-upload" 
                                        className="hidden" 
                                        onChange={handleFileUpload} 
                                        disabled={isUploadingDocument} 
                                    />
                                    <label 
                                        htmlFor="document-upload"
                                        className={`bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2 cursor-pointer ${isUploadingDocument ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {isUploadingDocument ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                {t(language, 'Uploading')}
                                            </>
                                        ) : (
                                            <>
                                                <UploadCloud className="w-4 h-4" />
                                                {t(language, 'UploadFile')}
                                            </>
                                        )}
                                    </label>
                                </div>
                                )}
                            </div>
                            
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                {documents.length === 0 ? (
                                    <div className="p-12 text-center flex flex-col items-center justify-center">
                                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                            <FileText className="w-8 h-8 text-slate-300" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 mb-1">{t(language, 'NoDocumentsYet')}</h3>
                                        <p className="text-slate-500">{t(language, 'UploadFirstDocumentDesc')}</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {documents.map(doc => (
                                            <div key={doc.id} className="p-4 hover:bg-slate-50 transition flex items-center justify-between group">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                                        <FileText className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-semibold text-slate-900 text-sm truncate max-w-xs sm:max-w-md">{doc.name}</h4>
                                                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                                                            <span>{(doc.file_size / 1024 / 1024).toFixed(2)} MB</span>
                                                            <span className="text-slate-300">•</span>
                                                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {format(new Date(doc.created_at), 'MMM d, yyyy')}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {canEdit && (
                                                    <button onClick={() => handleDownloadDocument(doc.file_path, doc.name)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors group/btn">
                                                        <Download className="w-4 h-4 text-slate-400 group-hover/btn:text-blue-600" />
                                                    </button>
                                                    )}
                                                    {canEdit && (
                                                    <button onClick={() => handleDeleteDocument(doc.id, doc.file_path)} className="p-2 hover:bg-red-50 rounded-lg transition-colors group/btn">
                                                        <Trash2 className="w-4 h-4 text-slate-400 group-hover/btn:text-red-500" />
                                                    </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab !== 'overview' && activeTab !== 'tasks' && activeTab !== 'negotiations' && activeTab !== 'referrals' && activeTab !== 'interactions' && activeTab !== 'documents' && (
                        <div className="bg-white rounded-2xl p-10 border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                <Target className="w-8 h-8 text-slate-400" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900 mb-2">{t(language, 'ComingSoon')}</h2>
                            <p className="text-slate-500 max-w-sm">{t(language, 'ComingSoonDesc')}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Partner Modal */}
            {isEditModalOpen && partner && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h2 className="text-xl font-bold text-slate-900">{t(language, 'EditDetails')}</h2>
                            <button 
                                onClick={() => setIsEditModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-2"
                            >
                                ✕
                            </button>
                        </div>
                        
                        <form onSubmit={handleUpdatePartner} className="p-6 space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-2 sm:col-span-2">
                                    <label className="block text-sm font-medium text-slate-700">{t(language, 'CompanyName')}</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={editFormData.name}
                                        onChange={e => setEditFormData({...editFormData, name: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="e.g. Grand Hotel Rome"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">{t(language, 'TypeCategory')}</label>
                                    <select 
                                        value={editFormData.type}
                                        onChange={e => setEditFormData({...editFormData, type: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                    >
                                        <option value="">{t(language, 'SelectCategory')}</option>
                                        <option value="Hotel">{t(language, 'Hotel')}</option>
                                        <option value="Tour Operator">{t(language, 'TourOperator')}</option>
                                        <option value="Concierge">{t(language, 'Concierge')}</option>
                                        <option value="Corporate">{t(language, 'Corporate')}</option>
                                        <option value="Influencer">{t(language, 'Influencer')}</option>
                                        <option value="Other">{t(language, 'Other')}</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">{t(language, 'ContactPerson')}</label>
                                    <input 
                                        type="text" 
                                        value={editFormData.contact_name}
                                        onChange={e => setEditFormData({...editFormData, contact_name: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="e.g. Mario Rossi"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">{t(language, 'LocationZone')}</label>
                                    <input 
                                        type="text" 
                                        value={editFormData.location}
                                        onChange={e => setEditFormData({...editFormData, location: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="e.g. Centro Storico"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">{t(language, 'EmailAddress')}</label>
                                    <input 
                                        type="email" 
                                        value={editFormData.email}
                                        onChange={e => setEditFormData({...editFormData, email: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="info@partner.com"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">{t(language, 'PhoneNumber')}</label>
                                    <input 
                                        type="tel" 
                                        value={editFormData.phone}
                                        onChange={e => setEditFormData({...editFormData, phone: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="+39 333 1234567"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700">{t(language, 'AssignedAdvisor')}</label>
                                <select 
                                    value={editFormData.owner_id}
                                    onChange={e => setEditFormData({...editFormData, owner_id: e.target.value})}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                >
                                    <option value="">{t(language, 'UnassignedCompany')}</option>
                                    {assignees.map(a => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700">{t(language, 'NotesContext')}</label>
                                <textarea 
                                    rows={3}
                                    value={editFormData.notes}
                                    onChange={e => setEditFormData({...editFormData, notes: e.target.value})}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition resize-none"
                                    placeholder={t(language, 'NotesContextPlaceholder')}
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button 
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
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
                                    ) : t(language, 'SaveChanges')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}


            {/* Log Interaction Modal */}
            {isInteractionModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100">
                            <h3 className="text-lg font-bold text-slate-900">{t(language, 'LogInteraction')}</h3>
                            <button 
                                onClick={() => {
                                    setIsInteractionModalOpen(false);
                                    setInteractionFormData({ type: 'Note', date: new Date().toISOString().substring(0, 10), notes: '' });
                                }}
                                className="text-slate-400 hover:text-slate-600 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <form onSubmit={handleLogInteraction} className="p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-5">
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">{t(language, 'Type')}</label>
                                    <select 
                                        value={interactionFormData.type}
                                        onChange={e => setInteractionFormData({...interactionFormData, type: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition appearance-none"
                                    >
                                        <option value="Note">{t(language, 'Note')}</option>
                                        <option value="Meeting">{t(language, 'Meeting')}</option>
                                        <option value="Call">{t(language, 'Call')}</option>
                                        <option value="Email">{t(language, 'Email')}</option>
                                        <option value="Accident">{t(language, 'Accident')}</option>
                                    </select>
                                </div>
                                
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">{t(language, 'Date')}</label>
                                    <input 
                                        type="date"
                                        value={interactionFormData.date}
                                        onChange={e => setInteractionFormData({...interactionFormData, date: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        required
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700">{t(language, 'Notes')}</label>
                                <textarea 
                                    rows={5}
                                    placeholder="Enter details about the interaction..."
                                    value={interactionFormData.notes}
                                    onChange={e => setInteractionFormData({...interactionFormData, notes: e.target.value})}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition resize-none"
                                    required
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setIsInteractionModalOpen(false);
                                        setInteractionFormData({ type: 'Note', date: new Date().toISOString().substring(0, 10), notes: '' });
                                    }}
                                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                                >
                                    {t(language, 'Cancel')}
                                </button>
                                <button 
                                    type="submit"
                                    disabled={isSubmittingInteraction}
                                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isSubmittingInteraction ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            {t(language, 'Saving')}
                                        </>
                                    ) : t(language, 'SaveInteraction')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Task Modal */}
            {isTaskModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h2 className="text-xl font-bold text-slate-900">{taskFormData.id ? t(language, 'EditTask') : t(language, 'NewTask')}</h2>
                            <button 
                                onClick={() => setIsTaskModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-2"
                            >
                                ✕
                            </button>
                        </div>
                        
                        <form onSubmit={handleTaskSubmit} className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t(language, 'TaskTitle')}</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={taskFormData.title || ''}
                                        onChange={e => setTaskFormData({...taskFormData, title: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder={t(language, 'TaskTitlePlaceholder')}
                                    />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">{t(language, 'DueDate')}</label>
                                        <input 
                                            type="date" 
                                            value={taskFormData.due_date ? taskFormData.due_date.split('T')[0] : ''}
                                            onChange={e => setTaskFormData({...taskFormData, due_date: e.target.value})}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">{t(language, 'Priority')}</label>
                                        <select 
                                            value={taskFormData.priority}
                                            onChange={e => setTaskFormData({...taskFormData, priority: e.target.value})}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        >
                                            <option value="Low">{t(language, 'Low')}</option>
                                            <option value="Medium">{t(language, 'Medium')}</option>
                                            <option value="High">{t(language, 'High')}</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t(language, 'TaskStatus')}</label>
                                    <select 
                                        value={taskFormData.status}
                                        onChange={e => setTaskFormData({...taskFormData, status: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                    >
                                        <option value="Pending">{t(language, 'Pending')}</option>
                                        <option value="In Progress">{t(language, 'InProgress')}</option>
                                        <option value="Completed">{t(language, 'Completed')}</option>
                                        <option value="Cancelled">{t(language, 'Cancelled')}</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t(language, 'TaskDescription')}</label>
                                    <textarea 
                                        rows={3}
                                        value={taskFormData.description || ''}
                                        onChange={e => setTaskFormData({...taskFormData, description: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition resize-none"
                                        placeholder={t(language, 'TaskDescPlaceholder')}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                                <div>
                                    {taskFormData.id && (
                                        <button 
                                            type="button"
                                            onClick={handleTaskDelete}
                                            className="px-4 py-2 rounded-xl text-red-600 font-medium hover:bg-red-50 transition"
                                        >
                                            {t(language, 'DeleteTask')}
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-3">
                                    <button 
                                        type="button"
                                        onClick={() => setIsTaskModalOpen(false)}
                                        className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                                    >
                                        {t(language, 'Cancel')}
                                    </button>
                                    <button 
                                        type="submit"
                                        disabled={isSubmittingTask}
                                        className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {isSubmittingTask ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                {t(language, 'Saving')}
                                            </>
                                        ) : t(language, 'SaveTask')}
                                    </button>
                                </div>
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
                                {t(language, 'RejectReasonDesc1')}<strong>{partner?.name}</strong>{t(language, 'RejectReasonDesc2')}
                            </p>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700">{t(language, 'Reason')}</label>
                                <textarea 
                                    rows={4}
                                    value={rejectReasonText}
                                    onChange={e => setRejectReasonText(e.target.value)}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition resize-none"
                                    placeholder={t(language, 'ReasonPlaceholder')}
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
                                disabled={isSubmittingReject || !rejectReasonText.trim()}
                                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSubmittingReject ? (
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

