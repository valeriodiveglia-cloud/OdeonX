'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, UserPlus, Target, MessageSquare, HandCoins, FileText, Activity, MapPin, Mail, Phone, Calendar, Plus, Clock, Check, CheckCircle2, AlertCircle, XCircle, X, Download, Trash2, UploadCloud, Edit3, ChevronLeft, ChevronRight, CalendarCheck2 } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase_shim'
import type { CRMPartner, CRMInteraction, CRMReferral, CRMAgreement, CRMDocument, CRMTask } from '@/types/crm'
import CircularLoader from '@/components/CircularLoader'
import { formatDistanceToNow, format } from 'date-fns'
import { useSettings } from '@/contexts/SettingsContext'

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }
function formatMonthLabel(d: Date) { return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }

const TABS = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'negotiations', label: 'Agreements & Terms', icon: HandCoins },
    { id: 'referrals', label: 'Referrals', icon: Target },
    { id: 'interactions', label: 'Interactions', icon: MessageSquare },
    { id: 'tasks', label: 'Tasks', icon: CalendarCheck2 },
    { id: 'documents', label: 'Documents', icon: FileText },
]

export default function PartnerDetail() {
    const params = useParams()
    const router = useRouter()
    const { currency } = useSettings()
    const partnerId = params.id as string

    /* month cursor */
    const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
    const monthInputValue = React.useMemo(() => toMonthInputValue(monthCursor), [monthCursor])

    function prevMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), -1)) }
    function nextMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), 1)) }
    function onPickMonth(val: string) { const d = fromMonthInputValue(val); if (d) setMonthCursor(d) }

    const [activeTab, setActiveTab] = useState('overview')
    const [partner, setPartner] = useState<CRMPartner | null>(null)
    const [interactions, setInteractions] = useState<CRMInteraction[]>([])
    const [referrals, setReferrals] = useState<CRMReferral[]>([])
    const [agreements, setAgreements] = useState<CRMAgreement[]>([])
    const [documents, setDocuments] = useState<CRMDocument[]>([])
    const [tasks, setTasks] = useState<CRMTask[]>([])
    const [loading, setLoading] = useState(true)
    const [isUploadingDocument, setIsUploadingDocument] = useState(false)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isAgreementModalOpen, setIsAgreementModalOpen] = useState(false)
    const [isSubmittingAgreement, setIsSubmittingAgreement] = useState(false)
    const [agreementFormData, setAgreementFormData] = useState({
        id: undefined as string | undefined,
        has_commission: true,
        commission_type: 'Percentage',
        commission_value: '' as string | number,
        has_discount: false,
        client_discount_type: 'Percentage',
        client_discount_value: '' as string | number,
        commission_base: 'Before Discount',
        details: ''
    })
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

    const handleCommissionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setAgreementFormData({ ...agreementFormData, commission_value: formatCurrencyInput(e.target.value) });
    }

    const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setAgreementFormData({ ...agreementFormData, client_discount_value: formatCurrencyInput(e.target.value) });
    }
    const [editFormData, setEditFormData] = useState({
        name: '',
        type: '',
        contact_name: '',
        email: '',
        phone: '',
        location: '',
        notes: ''
    })

    const handleUpdatePartner = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        try {
            const { error, data } = await supabase
                .from('crm_partners')
                .update({
                    name: editFormData.name,
                    type: editFormData.type || null,
                    contact_name: editFormData.contact_name || null,
                    email: editFormData.email || null,
                    phone: editFormData.phone || null,
                    location: editFormData.location || null,
                    notes: editFormData.notes || null,
                })
                .eq('id', partnerId)
                .select()
                .single()
            
            if (error) throw error

            setPartner(data)
            setIsEditModalOpen(false)
        } catch (error) {
            console.error('Error updating partner:', error)
            alert('Error updating partner. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleCreateAgreement = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmittingAgreement(true)

        if (!agreementFormData.has_commission && !agreementFormData.has_discount) {
            alert('Please enable at least a commission or a client discount.');
            setIsSubmittingAgreement(false);
            return;
        }

        try {
            const parsedCommission = agreementFormData.has_commission
                ? (typeof agreementFormData.commission_value === 'string'
                    ? parseFloat(agreementFormData.commission_value.replace(/,/g, '')) || 0
                    : agreementFormData.commission_value)
                : 0;

            const parsedDiscount = agreementFormData.has_discount
                ? (typeof agreementFormData.client_discount_value === 'string'
                    ? parseFloat(agreementFormData.client_discount_value.replace(/,/g, '')) || 0
                    : agreementFormData.client_discount_value)
                : 0;

            const payload = {
                partner_id: partnerId,
                commission_type: agreementFormData.has_commission ? agreementFormData.commission_type : null,
                commission_value: parsedCommission,
                client_discount_type: agreementFormData.has_discount ? agreementFormData.client_discount_type : null,
                client_discount_value: parsedDiscount,
                commission_base: (agreementFormData.has_commission && agreementFormData.has_discount) ? agreementFormData.commission_base : 'Before Discount',
                status: 'Active',
                valid_until: null,
                details: agreementFormData.details || null
            }

            let req;
            if (agreementFormData.id) {
                req = supabase.from('crm_agreements').update(payload).eq('id', agreementFormData.id).select().single()
            } else {
                await supabase.from('crm_agreements').update({ status: 'Expired' }).eq('partner_id', partnerId).eq('status', 'Active');
                req = supabase.from('crm_agreements').insert([payload]).select().single()
            }

            const { error, data } = await req;

            if (error) throw error

            if (agreementFormData.id) {
                setAgreements(agreements.map(a => a.id === agreementFormData.id ? data : a))
            } else {
                const updatedAgreements = agreements.map(a => a.status === 'Active' ? { ...a, status: 'Expired' as const } : a);
                setAgreements([data, ...updatedAgreements])
            }
            setIsAgreementModalOpen(false)
            setAgreementFormData({ id: undefined, has_commission: true, commission_type: 'Percentage', commission_value: '', has_discount: false, client_discount_type: 'Percentage', client_discount_value: '', commission_base: 'Before Discount', details: '' })
        } catch (error) {
            console.error('Error creating agreement:', error)
            alert('Failed to save agreement.')
        } finally {
            setIsSubmittingAgreement(false)
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
            const [partnerRes, interactionsRes, referralsRes, agreementsRes, documentsRes, tasksRes] = await Promise.all([
                supabase.from('crm_partners').select('*').eq('id', partnerId).single(),
                supabase.from('crm_interactions').select('*').eq('partner_id', partnerId).order('date', { ascending: false }),
                supabase.from('crm_referrals').select('*').eq('partner_id', partnerId),
                supabase.from('crm_agreements').select('*').eq('partner_id', partnerId).order('created_at', { ascending: false }),
                supabase.from('crm_documents').select('*').eq('partner_id', partnerId).order('created_at', { ascending: false }),
                supabase.from('crm_tasks').select('*').eq('partner_id', partnerId).order('created_at', { ascending: false })
            ])

            if (partnerRes.data) setPartner(partnerRes.data)
            if (interactionsRes.data) setInteractions(interactionsRes.data)
            if (referralsRes.data) setReferrals(referralsRes.data)
            if (agreementsRes.data) setAgreements(agreementsRes.data)
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
                <h2 className="text-xl font-bold text-slate-800">Partner Not Found</h2>
                <button onClick={() => router.push('/crm/partners')} className="mt-4 text-blue-600 hover:underline">
                    Back to Pipeline
                </button>
            </div>
        )
    }

    const totalPax = filteredReferrals.reduce((sum, r) => sum + (r.party_size || 0), 0)
    const maturedRevenue = filteredReferrals.reduce((sum, r) => sum + (r.revenue_generated || 0), 0)
    
    // Using filteredReferrals instead of referrals
    const hasDiscounts = filteredReferrals.some(r => agreements.some(a => a.client_discount_value && a.client_discount_value > 0))
    const totalCommission = filteredReferrals.reduce((sum, r) => sum + (r.commission_value || 0), 0)
    const totalDiscount = hasDiscounts ? filteredReferrals.reduce((sum, r) => {
        const maxDiscount = Math.max(...agreements.map((a: any) => a.client_discount_value || 0))
        return sum + (r.revenue_generated * (maxDiscount / 100))
    }, 0) : 0

    const completedReferrals = filteredReferrals.filter(r => r.status === 'Paid').length
    const validationRate = filteredReferrals.length > 0 ? Math.round((completedReferrals / filteredReferrals.length) * 100) : 0

    // All-time metrics for Overview Tab
    const allTimeRevenue = referrals.reduce((sum, r) => sum + (r.revenue_generated || 0), 0)
    const allTimeReferrals = referrals.length
    
    const maxDiscountAllTime = agreements.length > 0 ? Math.max(...agreements.map(a => a.client_discount_value || 0), 0) : 0
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

    return (
        <div className="flex flex-col h-screen overflow-hidden">
            {/* Header Section */}
            <div className="bg-white border-b border-slate-200 shrink-0">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <button 
                        onClick={() => router.push('/crm/partners')}
                        className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-sm font-medium mb-4"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to Pipeline
                    </button>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-700 text-2xl font-bold uppercase">
                                {partner.name.charAt(0)}
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900">{partner.name}</h1>
                                <p className="text-slate-500 font-medium">{partner.type || 'Unknown Type'} {partner.location ? `at ${partner.location}` : ''}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className={`px-3 py-1 rounded-full font-semibold text-sm ${
                                partner.pipeline_stage === 'Active' ? 'bg-emerald-100 text-emerald-700' :
                                partner.pipeline_stage === 'Negotiating' ? 'bg-amber-100 text-amber-700' :
                                partner.pipeline_stage === 'Paused' ? 'bg-gray-100 text-gray-500' :
                                partner.pipeline_stage === 'Approached' ? 'bg-blue-100 text-blue-700' :
                                'bg-slate-100 text-slate-700'
                            }`}>
                                {partner.pipeline_stage || partner.status}
                            </div>
                            <button 
                                onClick={() => {
                                    setEditFormData({
                                        name: partner.name,
                                        type: partner.type || '',
                                        contact_name: partner.contact_name || '',
                                        email: partner.email || '',
                                        phone: partner.phone || '',
                                        location: partner.location || '',
                                        notes: partner.notes || ''
                                    })
                                    setIsEditModalOpen(true)
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm"
                            >
                                Edit Details
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
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
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto bg-slate-50">
                <div className="max-w-7xl mx-auto px-6 py-6">
                    {activeTab === 'overview' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Detailed Info Card */}
                            <div className="lg:col-span-1 space-y-6">
                                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                                    <h3 className="font-bold text-slate-900 mb-4">Contact Info</h3>
                                    <div className="space-y-4">
                                        <div className="flex items-start gap-3 text-slate-600 text-sm">
                                            <Phone className="w-5 h-5 text-slate-400 shrink-0" />
                                            <div>
                                                <div className="font-medium text-slate-900">{partner.phone || '-'}</div>
                                                <div className="text-xs text-slate-500">Phone Number</div>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3 text-slate-600 text-sm">
                                            <Mail className="w-5 h-5 text-slate-400 shrink-0" />
                                            <div>
                                                <div className="font-medium text-slate-900">{partner.email || '-'}</div>
                                                <div className="text-xs text-slate-500">Email Address</div>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3 text-slate-600 text-sm">
                                            <MapPin className="w-5 h-5 text-slate-400 shrink-0" />
                                            <div>
                                                <div className="font-medium text-slate-900">{partner.location || '-'}</div>
                                                <div className="text-xs text-slate-500">Operating Zone</div>
                                            </div>
                                        </div>
                                    </div>

                                    {(partner.notes && partner.notes.trim() !== '') && (
                                        <>
                                            <hr className="my-5 border-slate-100" />
                                            <h3 className="font-bold text-slate-900 mb-3">Notes</h3>
                                            <p className="text-sm text-slate-600 bg-amber-50 border border-amber-100 p-3 rounded-xl leading-relaxed whitespace-pre-wrap">
                                                {partner.notes}
                                            </p>
                                        </>
                                    )}
                                </div>
                                
                                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-bold text-slate-900">Recent Activity</h3>
                                        <button onClick={() => setIsInteractionModalOpen(true)} className="text-sm font-medium text-blue-600">Log Interaction</button>
                                    </div>
                                    
                                    <div className="relative border-l-2 border-slate-100 ml-3 space-y-6 pb-4">
                                        {interactions.length === 0 ? (
                                            <div className="text-slate-500 text-sm ml-4 border-none">No recent interactions logged.</div>
                                        ) : null}
                                        {interactions.map(interaction => (
                                            <div key={interaction.id} className="relative pl-6">
                                                <div className="absolute w-3 h-3 bg-blue-600 rounded-full -left-[7px] top-1.5 ring-4 ring-white"></div>
                                                <div className="text-sm text-slate-500 mb-1 flex items-center gap-1">
                                                    <Calendar className="w-3.5 h-3.5"/> 
                                                    {formatDistanceToNow(new Date(interaction.date), { addSuffix: true })}
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
                                        <div className="text-blue-600 text-xs font-bold uppercase tracking-wider mb-1 relative z-10">Total Revenue</div>
                                        <div className="text-3xl font-black text-slate-900 relative z-10">{currency} {allTimeRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                                    </div>
                                    <div className="col-span-2 bg-emerald-50 border border-emerald-100 rounded-2xl p-5 border-l-[4px] border-l-emerald-500 relative overflow-hidden group">
                                        <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                                        <div className="text-emerald-700 text-xs font-bold uppercase tracking-wider mb-1 relative z-10">Total Referrals</div>
                                        <div className="text-3xl font-black text-slate-900 relative z-10">{allTimeReferrals}</div>
                                    </div>
                                    
                                    {/* Secondary Row */}
                                    <div className="col-span-1 bg-purple-50 border border-purple-100 rounded-2xl p-3 sm:p-4 border-l-[4px] border-l-purple-500 flex flex-col justify-center">
                                        <div className="text-purple-700 leading-tight text-[10px] font-bold uppercase tracking-wider mb-0.5 opacity-80">Avg Monthly Rev.</div>
                                        <div className="text-lg font-black text-slate-900 truncate" title={`${currency} ${avgMonthlyRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}>{currency} {avgMonthlyRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                                    </div>
                                    <div className="col-span-1 bg-orange-50 border border-orange-100 rounded-2xl p-3 sm:p-4 border-l-[4px] border-l-orange-500 flex flex-col justify-center">
                                        <div className="text-orange-700 leading-tight text-[10px] font-bold uppercase tracking-wider mb-0.5 opacity-80">Avg Monthly Refs.</div>
                                        <div className="text-lg font-black text-slate-900">{avgMonthlyReferrals.toFixed(1)}</div>
                                    </div>
                                    
                                    <div className="col-span-1 bg-amber-50 border border-amber-100 rounded-2xl p-3 sm:p-4 border-l-[4px] border-l-amber-500 flex flex-col justify-center">
                                        <div className="text-amber-700 leading-tight text-[10px] font-bold uppercase tracking-wider mb-0.5 opacity-80">Pending Comm.</div>
                                        <div className="text-lg font-black text-slate-900 truncate" title={`${currency} ${pendingCommissions.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}>{currency} {pendingCommissions.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                                    </div>
                                    <div className="col-span-1 bg-emerald-50 border border-emerald-100 rounded-2xl p-3 sm:p-4 border-l-[4px] border-l-emerald-500 flex flex-col justify-center">
                                        <div className="text-emerald-700 leading-tight text-[10px] font-bold uppercase tracking-wider mb-0.5 opacity-80">Paid Comm.</div>
                                        <div className="text-lg font-black text-slate-900 truncate" title={`${currency} ${paidCommissions.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}>{currency} {paidCommissions.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                                    </div>

                                    {/* Conditional Row */}
                                    {(allTimeDiscounts > 0 || hasDiscounts) && (
                                        <div className="col-span-2 lg:col-span-4 bg-cyan-50 border border-cyan-100 rounded-2xl p-4 sm:p-5 border-l-[4px] border-l-cyan-500 flex flex-col sm:flex-row justify-between sm:items-center mt-1">
                                            <div className="text-cyan-700 text-xs font-bold uppercase tracking-wider mb-1 sm:mb-0">Total Active Discounts</div>
                                            <div className="text-2xl font-black text-slate-900">{currency} {allTimeDiscounts.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                                        </div>
                                    )}
                                </div>

                                {chartData.length > 0 && (
                                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mt-6">
                                        <div className="flex justify-between items-center mb-6">
                                            <h3 className="font-bold text-slate-900">Referrals Growth Trend</h3>
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

                    {activeTab === 'negotiations' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Agreements & Terms</h3>
                                    <p className="text-slate-500 text-sm mt-1">Manage commission rates, contracts, and negotiation terms for this partner.</p>
                                </div>
                                <button 
                                    onClick={() => setIsAgreementModalOpen(true)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    New Agreement
                                </button>
                            </div>

                            {(() => {
                                const activeAgreement = agreements.find(a => a.status === 'Active');
                                const historicalAgreements = agreements.filter(a => a.status !== 'Active');

                                return (
                                    <div className="space-y-8">
                                        {/* Active Agreement Section */}
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Current Active Agreement</h4>
                                            {!activeAgreement ? (
                                                <div className="py-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 border-dashed">
                                                    No active agreement found. Please add one.
                                                </div>
                                            ) : (
                                                <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-6 lg:p-8 relative overflow-hidden group hover:shadow-md transition">
                                                    <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                                                        Active
                                                    </div>
                                                    
                                                    <div className="flex justify-between items-start mb-8 border-b border-slate-100 pb-6">
                                                        <div className="pr-12">
                                                            <div className="text-xl font-bold text-slate-900 leading-snug">Current Deal Terms</div>
                                                            <div className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                                                                <Calendar className="w-4 h-4 text-emerald-600/70" />
                                                                Started on <span className="font-medium text-slate-700">{format(new Date(activeAgreement.created_at), 'MMM d, yyyy')}</span>
                                                            </div>
                                                        </div>
                                                        <button 
                                                            onClick={() => {
                                                                setAgreementFormData({
                                                                    id: activeAgreement.id,
                                                                    has_commission: !!activeAgreement.commission_type,
                                                                    commission_type: activeAgreement.commission_type || 'Percentage',
                                                                    commission_value: activeAgreement.commission_value || '',
                                                                    has_discount: !!activeAgreement.client_discount_type,
                                                                    client_discount_type: activeAgreement.client_discount_type || 'Percentage',
                                                                    client_discount_value: activeAgreement.client_discount_value || '',
                                                                    commission_base: (activeAgreement as any).commission_base || 'Before Discount',
                                                                    details: activeAgreement.details || ''
                                                                });
                                                                setIsAgreementModalOpen(true);
                                                            }}
                                                            className="text-slate-400 hover:text-emerald-600 transition bg-slate-50 p-2.5 rounded-xl hover:bg-emerald-50 border border-slate-100 shadow-sm"
                                                            title="Edit Current Terms"
                                                        >
                                                            <Edit3 className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        {activeAgreement.commission_type && (
                                                            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 shadow-sm">
                                                                <div className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5"><HandCoins className="w-4 h-4 text-blue-500/70" /> Partner Commission</div>
                                                                <div className="text-4xl font-black text-slate-900 tracking-tight">
                                                                    {activeAgreement.commission_type === 'Percentage' ? `${activeAgreement.commission_value}%` : `${currency} ${activeAgreement.commission_value?.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`}
                                                                    <span className="text-sm font-semibold text-slate-400 block mt-1 tracking-normal">
                                                                        {activeAgreement.commission_type}
                                                                        {activeAgreement.commission_type === 'Percentage' && activeAgreement.client_discount_type ? ` (${(activeAgreement as any).commission_base || 'Before Discount'})` : ''}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {activeAgreement.client_discount_type && (
                                                            <div className="bg-emerald-50/50 rounded-2xl p-6 border border-emerald-100 shadow-sm">
                                                                <div className="text-emerald-700 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5"><Target className="w-4 h-4 text-emerald-500/80" /> Client Discount</div>
                                                                <div className="text-4xl font-black text-emerald-600 tracking-tight">
                                                                    {activeAgreement.client_discount_type === 'Percentage' ? `${activeAgreement.client_discount_value}%` : `${currency} ${activeAgreement.client_discount_value?.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`}
                                                                    <span className="text-sm font-semibold text-emerald-600/70 block mt-1 tracking-normal">{activeAgreement.client_discount_type}</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {activeAgreement.valid_until && (
                                                        <div className="mb-6 flex items-center gap-2 text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100 font-medium">
                                                            <Clock className="w-5 h-5 text-amber-500" />
                                                            Valid until cutoff date: <span className="text-slate-900 font-bold">{format(new Date(activeAgreement.valid_until), 'MMM d, yyyy')}</span>
                                                        </div>
                                                    )}

                                                    {activeAgreement.details && (
                                                        <div className="text-sm text-slate-600 bg-slate-50 p-5 rounded-2xl border border-slate-100 whitespace-pre-wrap leading-relaxed shadow-inner">
                                                            <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Terms & Conditions Notes</span>
                                                            {activeAgreement.details}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Agreement History Section */}
                                        {historicalAgreements.length > 0 && (
                                            <div>
                                                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 mt-10">Agreement History</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {historicalAgreements.map(agreement => (
                                                        <div key={agreement.id} className="bg-slate-50 p-5 rounded-2xl border border-slate-200/60 shadow-sm relative opacity-90 hover:opacity-100 transition-opacity">
                                                            <div className="flex justify-between items-center mb-3">
                                                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-200/80 px-2 py-0.5 rounded-md">
                                                                    {agreement.status}
                                                                </div>
                                                                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                                                                    <Calendar className="w-3.5 h-3.5" />
                                                                    {format(new Date(agreement.created_at), 'MMM d, yyyy')}
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-3 mt-4 mb-2">
                                                                {agreement.commission_type && (
                                                                    <div>
                                                                        <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Comm.</div>
                                                                        <div className="text-base font-bold text-slate-700">
                                                                            {agreement.commission_type === 'Percentage' ? `${agreement.commission_value}%` : `${currency} ${agreement.commission_value?.toLocaleString('it-IT')}`}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {agreement.client_discount_type && (
                                                                    <div>
                                                                        <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Discount</div>
                                                                        <div className="text-base font-bold text-slate-700">
                                                                            {agreement.client_discount_type === 'Percentage' ? `${agreement.client_discount_value}%` : `${currency} ${agreement.client_discount_value?.toLocaleString('it-IT')}`}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {agreement.details && (
                                                                <div className="text-xs text-slate-500 line-clamp-2 mt-4 pt-3 border-t border-slate-200/70">
                                                                    {agreement.details}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {activeTab === 'referrals' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Referrals History</h3>
                                    <p className="text-slate-500 text-sm mt-1">View all referrals generated by this partner.</p>
                                </div>
                            </div>

                            <div className="mb-4 grid grid-cols-3 items-center">
                                <div className="justify-self-start">
                                    <button onClick={prevMonth} className="text-blue-600 hover:text-blue-800 underline underline-offset-4 decoration-blue-300/40 text-sm font-medium">
                                        Previous
                                    </button>
                                </div>
                                <div className="justify-self-center flex items-center gap-2">
                                    <span className="text-slate-700 font-semibold">{formatMonthLabel(monthCursor)}</span>
                                    <Calendar className="w-5 h-5 text-slate-400" />
                                </div>
                                <div className="justify-self-end">
                                    <button onClick={nextMonth} className="text-blue-600 hover:text-blue-800 underline underline-offset-4 decoration-blue-300/40 text-sm font-medium">
                                        Next
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl shadow p-3 overflow-x-auto">
                                <div className="overflow-x-auto">
                                    <table className="w-full table-auto text-sm text-gray-900 text-left border-collapse min-w-[800px]">
                                        <thead>
                                            <tr className="text-gray-500 font-semibold border-b border-gray-200">
                                                <th className="p-2 whitespace-nowrap">Date & Ref</th>
                                                <th className="p-2 whitespace-nowrap">Pax</th>
                                                <th className="p-2 whitespace-nowrap text-right">Revenue ({currency})</th>
                                                {hasDiscounts && (
                                                    <th className="p-2 whitespace-nowrap text-right">Discount ({currency})</th>
                                                )}
                                                <th className="p-2 whitespace-nowrap text-right">Commission ({currency})</th>
                                                <th className="p-2 whitespace-nowrap">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredReferrals.length === 0 ? (
                                                <tr>
                                                    <td colSpan={hasDiscounts ? 6 : 5} className="p-8 text-center text-gray-500">
                                                        No referrals found for this period.
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
                                                                    {formatCurrencyInput((ref.revenue_generated * (Math.max(...agreements.map((a: any) => a.client_discount_value || 0)) / 100)).toFixed(0))}
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
                                                        Totals
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

                    {activeTab === 'interactions' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Interactions History</h3>
                                    <p className="text-slate-500 text-sm mt-1">View the complete log of touches and communications with this partner.</p>
                                </div>
                                <button 
                                    onClick={() => setIsInteractionModalOpen(true)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    Log Interaction
                                </button>
                            </div>

                            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative">
                                <div className="absolute top-0 bottom-0 left-10 w-0.5 bg-slate-100"></div>
                                <div className="space-y-8 relative">
                                    {interactions.length === 0 ? (
                                        <div className="text-center py-10 text-slate-500 bg-slate-50 rounded-xl border border-slate-200 border-dashed ml-12">
                                            No interactions have been logged yet.
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
                                                        {formatDistanceToNow(new Date(interaction.date), { addSuffix: true })}
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
                    
                    {activeTab === 'tasks' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Partner Tasks</h3>
                                    <p className="text-slate-500 text-sm mt-1">Pending and completed tasks for this specific partner.</p>
                                </div>
                                <button 
                                    onClick={() => {
                                        setTaskFormData({ priority: 'Medium', status: 'Pending' })
                                        setIsTaskModalOpen(true)
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    New Task
                                </button>
                            </div>

                            <div className="flex flex-col gap-3">
                                {tasks.length === 0 ? (
                                    <div className="py-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 border-dashed">
                                        No tasks created for this partner yet.
                                    </div>
                                ) : (
                                    tasks.map(task => (
                                        <div key={task.id} onClick={() => { setTaskFormData(task); setIsTaskModalOpen(true); }} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
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

                    {activeTab === 'documents' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Partner Documents</h3>
                                    <p className="text-slate-500 text-sm mt-1">Manage contracts, invoices, and other materials securely.</p>
                                </div>
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
                                                Uploading...
                                            </>
                                        ) : (
                                            <>
                                                <UploadCloud className="w-4 h-4" />
                                                Upload File
                                            </>
                                        )}
                                    </label>
                                </div>
                            </div>
                            
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                {documents.length === 0 ? (
                                    <div className="p-12 text-center flex flex-col items-center justify-center">
                                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                            <FileText className="w-8 h-8 text-slate-300" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 mb-1">No documents yet</h3>
                                        <p className="text-slate-500">Upload your first document by clicking the button above.</p>
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
                                                    <button 
                                                        onClick={() => handleDownloadDocument(doc.file_path, doc.name)}
                                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                        title="Download"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteDocument(doc.id, doc.file_path)}
                                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
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
                            <h2 className="text-xl font-bold text-slate-900 mb-2">Coming Soon</h2>
                            <p className="text-slate-500 max-w-sm">This section will be hooked up to managing data directly in subsequent phases.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Partner Modal */}
            {isEditModalOpen && partner && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h2 className="text-xl font-bold text-slate-900">Edit Partner Details</h2>
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
                                    <label className="block text-sm font-medium text-slate-700">Company/Partner Name *</label>
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
                                    <label className="block text-sm font-medium text-slate-700">Type Category</label>
                                    <select 
                                        value={editFormData.type}
                                        onChange={e => setEditFormData({...editFormData, type: e.target.value})}
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
                                    <label className="block text-sm font-medium text-slate-700">Contact Person</label>
                                    <input 
                                        type="text" 
                                        value={editFormData.contact_name}
                                        onChange={e => setEditFormData({...editFormData, contact_name: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="e.g. Mario Rossi"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">Location / Zone</label>
                                    <input 
                                        type="text" 
                                        value={editFormData.location}
                                        onChange={e => setEditFormData({...editFormData, location: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="e.g. Centro Storico"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">Email Address</label>
                                    <input 
                                        type="email" 
                                        value={editFormData.email}
                                        onChange={e => setEditFormData({...editFormData, email: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="info@partner.com"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">Phone Number</label>
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
                                <label className="block text-sm font-medium text-slate-700">Notes & Context</label>
                                <textarea 
                                    rows={3}
                                    value={editFormData.notes}
                                    onChange={e => setEditFormData({...editFormData, notes: e.target.value})}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition resize-none"
                                    placeholder="Add any initial thoughts, background info, or strategic value for this partner..."
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button 
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
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
                                    ) : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Create Agreement Modal */}
            {isAgreementModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h2 className="text-xl font-bold text-slate-900">{agreementFormData.id ? 'Edit Agreement' : 'New Agreement'}</h2>
                            <button 
                                onClick={() => setIsAgreementModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-2"
                            >
                                ✕
                            </button>
                        </div>
                        
                        <form onSubmit={handleCreateAgreement} className="p-6 space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-4 border-b border-slate-100">
                                <label htmlFor="has_commission" className="flex items-center gap-3 text-slate-800 cursor-pointer">
                                    <span className="text-sm font-medium flex-1">Include Partner Commission</span>
                                    <input
                                        type="checkbox"
                                        id="has_commission"
                                        checked={agreementFormData.has_commission}
                                        onChange={e => setAgreementFormData({...agreementFormData, has_commission: e.target.checked})}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-200 rounded-full peer-checked:bg-blue-600 relative transition-colors
                                                    after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border border-slate-300
                                                    after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-full" />
                                </label>

                                <label htmlFor="has_discount" className="flex items-center gap-3 text-slate-800 cursor-pointer">
                                    <span className="text-sm font-medium flex-1">Include Client Discount</span>
                                    <input
                                        type="checkbox"
                                        id="has_discount"
                                        checked={agreementFormData.has_discount}
                                        onChange={e => setAgreementFormData({...agreementFormData, has_discount: e.target.checked})}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-200 rounded-full peer-checked:bg-blue-600 relative transition-colors
                                                    after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border border-slate-300
                                                    after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-full" />
                                </label>
                            </div>

                            {agreementFormData.has_commission && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                                    <div className="sm:col-span-2">
                                        <h4 className="text-sm font-bold text-slate-900">Commission Details</h4>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700">Commission Type</label>
                                        <select 
                                            required
                                            value={agreementFormData.commission_type}
                                            onChange={e => setAgreementFormData({...agreementFormData, commission_type: e.target.value})}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        >
                                            <option value="Percentage">Percentage</option>
                                            <option value="Fixed">Fixed Amount</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700">
                                            Value {agreementFormData.commission_type === 'Percentage' ? '(%)' : `(${currency})`}
                                        </label>
                                        <input 
                                            required
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="0.00"
                                            value={agreementFormData.commission_value || ''}
                                            onChange={handleCommissionChange}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        />
                                        {agreementFormData.commission_type === 'Fixed' && (
                                            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wide">Enter the amount in your primary currency</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {agreementFormData.has_discount && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                                    <div className="sm:col-span-2">
                                        <h4 className="text-sm font-bold text-slate-900">Discount Details</h4>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700">Discount Type</label>
                                        <select 
                                            required
                                            value={agreementFormData.client_discount_type}
                                            onChange={e => setAgreementFormData({...agreementFormData, client_discount_type: e.target.value})}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        >
                                            <option value="Percentage">Percentage</option>
                                            <option value="Fixed">Fixed Amount</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700">
                                            Value {agreementFormData.client_discount_type === 'Percentage' ? '(%)' : `(${currency})`}
                                        </label>
                                        <input 
                                            required
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="0.00"
                                            value={agreementFormData.client_discount_value || ''}
                                            onChange={handleDiscountChange}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        />
                                    </div>
                                </div>
                            )}

                            {agreementFormData.has_commission && agreementFormData.has_discount && (
                                <div className="space-y-2 pt-2 border-t border-slate-100">
                                    <label className="block text-sm font-medium text-slate-700">Commission Calculated On *</label>
                                    <select 
                                        required
                                        value={agreementFormData.commission_base}
                                        onChange={e => setAgreementFormData({...agreementFormData, commission_base: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                    >
                                        <option value="Before Discount">Total Revenue (Before Discount)</option>
                                        <option value="After Discount">Net Revenue (After Discount)</option>
                                    </select>
                                </div>
                            )}

                            <div className="space-y-2 pt-2">
                                <label className="block text-sm font-medium text-slate-700">Details & Terms</label>
                                <textarea 
                                    rows={4}
                                    placeholder="Enter contract terms, notes, or specific clauses..."
                                    value={agreementFormData.details}
                                    onChange={e => setAgreementFormData({...agreementFormData, details: e.target.value})}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition resize-none"
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setIsAgreementModalOpen(false);
                                        setAgreementFormData({ id: undefined, has_commission: true, commission_type: 'Percentage', commission_value: '', has_discount: false, client_discount_type: 'Percentage', client_discount_value: '', commission_base: 'Before Discount', details: '' });
                                    }}
                                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={isSubmittingAgreement}
                                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isSubmittingAgreement ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            Saving...
                                        </>
                                    ) : (agreementFormData.id ? 'Save Changes' : 'Create Agreement')}
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
                            <h3 className="text-lg font-bold text-slate-900">Log Interaction</h3>
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
                                    <label className="block text-sm font-medium text-slate-700">Type</label>
                                    <select 
                                        value={interactionFormData.type}
                                        onChange={e => setInteractionFormData({...interactionFormData, type: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition appearance-none"
                                    >
                                        <option value="Note">Note</option>
                                        <option value="Meeting">Meeting</option>
                                        <option value="Call">Call</option>
                                        <option value="Email">Email</option>
                                        <option value="Accident">Accident</option>
                                    </select>
                                </div>
                                
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700">Date</label>
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
                                <label className="block text-sm font-medium text-slate-700">Notes</label>
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
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={isSubmittingInteraction}
                                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isSubmittingInteraction ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            Saving...
                                        </>
                                    ) : 'Save Interaction'}
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
                            <h2 className="text-xl font-bold text-slate-900">{taskFormData.id ? 'Edit Task' : 'New Task'}</h2>
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
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={taskFormData.title || ''}
                                        onChange={e => setTaskFormData({...taskFormData, title: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        placeholder="e.g. Call to finalize agreement"
                                    />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                                        <input 
                                            type="date" 
                                            value={taskFormData.due_date ? taskFormData.due_date.split('T')[0] : ''}
                                            onChange={e => setTaskFormData({...taskFormData, due_date: e.target.value})}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                                        <select 
                                            value={taskFormData.priority}
                                            onChange={e => setTaskFormData({...taskFormData, priority: e.target.value})}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                        >
                                            <option value="Low">Low</option>
                                            <option value="Medium">Medium</option>
                                            <option value="High">High</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                                    <select 
                                        value={taskFormData.status}
                                        onChange={e => setTaskFormData({...taskFormData, status: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition"
                                    >
                                        <option value="Pending">Pending</option>
                                        <option value="In Progress">In Progress</option>
                                        <option value="Completed">Completed</option>
                                        <option value="Cancelled">Cancelled</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                    <textarea 
                                        rows={3}
                                        value={taskFormData.description || ''}
                                        onChange={e => setTaskFormData({...taskFormData, description: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition resize-none"
                                        placeholder="Add any extra details, zoom links, or notes..."
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
                                            Delete
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-3">
                                    <button 
                                        type="button"
                                        onClick={() => setIsTaskModalOpen(false)}
                                        className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit"
                                        disabled={isSubmittingTask}
                                        className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {isSubmittingTask ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                Saving...
                                            </>
                                        ) : 'Save Task'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
