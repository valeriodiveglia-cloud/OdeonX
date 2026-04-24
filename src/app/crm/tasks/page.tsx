'use client'

import React, { useState, useEffect } from 'react'
import { Plus, Search, CheckCircle2, Clock, CalendarIcon, AlertCircle, MoreHorizontal } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase_shim'
import type { CRMTask, CRMPartner } from '@/types/crm'
import CircularLoader from '@/components/CircularLoader'
import { format, formatDistanceToNow, isPast, isToday } from 'date-fns'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'

interface ExtendedTask extends CRMTask {
    crm_partners: {
        name: string
    } | null;
    creator?: {
        name: string;
        email: string;
    } | null;
}

const COLUMNS: { id: string, label: string, color: string }[] = [
    { id: 'Pending', label: 'Pending', color: 'bg-slate-100 border-slate-200 text-slate-700' },
    { id: 'In Progress', label: 'In Progress', color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { id: 'Completed', label: 'Completed', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    { id: 'Cancelled', label: 'Cancelled', color: 'bg-gray-100 border-gray-200 text-gray-500' },
]

export default function CRMTasksPage() {
    const { language } = useSettings()
    const [searchTerm, setSearchTerm] = useState('')
    const [tasks, setTasks] = useState<ExtendedTask[]>([])
    const [partners, setPartners] = useState<{id: string, name: string}[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [dragActiveCol, setDragActiveCol] = useState<string | null>(null)
    const [currentUser, setCurrentUser] = useState<{ id: string, role?: string } | null>(null)

    // Form State
    const [formData, setFormData] = useState({
        id: undefined as string | undefined,
        partner_id: '',
        title: '',
        description: '',
        due_date: '',
        priority: 'Medium',
        status: 'Pending'
    })

    const fetchTasksAndPartners = async () => {
        setLoading(true)
        const [tasksRes, partnersRes] = await Promise.all([
            // Use maybeSingle or let it just return array depending on row.
            supabase.from('crm_tasks').select(`*, crm_partners(name), creator:app_accounts!crm_tasks_created_by_fkey(name, email)`).order('created_at', { ascending: false }),
            supabase.from('crm_partners').select('id, name').order('name')
        ])

        if (tasksRes.data) setTasks(tasksRes.data as unknown as ExtendedTask[])
        if (partnersRes.data) setPartners(partnersRes.data)
        
        setLoading(false)
    }

    useEffect(() => {
        const fetchUser = async () => {
            const { data } = await supabase.auth.getUser()
            if (data?.user) {
                const { data: acc } = await supabase.from('app_accounts').select('role').eq('user_id', data.user.id).maybeSingle()
                setCurrentUser({ id: data.user.id, role: acc?.role })
            }
        }
        fetchUser()
        
        // Since crm_tasks might not exist until migration is applied, we capture error safely
        fetchTasksAndPartners().catch(err => {
            console.error("Error fetching tasks, implies table might not exist yet:", err)
            setLoading(false)
        })
    }, [])

    const handleDragOver = (e: React.DragEvent, colId: string) => {
        e.preventDefault()
        if (dragActiveCol !== colId) {
            setDragActiveCol(colId)
        }
    }

    const handleDragLeave = (e: React.DragEvent) => {
        setDragActiveCol(null)
    }

    const handleDrop = async (e: React.DragEvent, newStatus: string) => {
        e.preventDefault()
        setDragActiveCol(null)
        
        const taskId = e.dataTransfer.getData('taskId')
        if (!taskId) return

        const task = tasks.find(t => t.id === taskId)
        if (!task || (task.created_by !== currentUser?.id && currentUser?.role !== 'owner')) {
            alert(t(language, 'OwnersCannotModifyTasks') || 'Only the creator or owner can move this task.');
            return;
        }

        if (task.status === newStatus) return

        // Optimistic update
        setTasks(prev => prev.map(t => 
            t.id === taskId ? { ...t, status: newStatus } : t
        ))

        try {
            const { error } = await supabase
                .from('crm_tasks')
                .update({ status: newStatus })
                .eq('id', taskId)
            
            if (error) throw error
        } catch (error) {
            console.error('Error updating task status:', error)
            alert(t(language, 'FailedUpdateStatus'))
            fetchTasksAndPartners() // revert
        }
    }

    const filteredTasks = tasks.filter(t => 
        t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (t.crm_partners?.name && t.crm_partners.name.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    const handleSaveTask = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        try {
            const payload = {
                partner_id: formData.partner_id || null, // null if internal task without partner
                title: formData.title,
                description: formData.description || null,
                due_date: formData.due_date || null,
                priority: formData.priority,
                status: formData.status
            }

            let req
            if (formData.id) {
                req = supabase.from('crm_tasks').update(payload).eq('id', formData.id).select()
            } else {
                req = supabase.from('crm_tasks').insert([payload]).select()
            }

            const { data, error } = await req
            if (error) throw error
            if (!data || data.length === 0) {
                alert(t(language, 'FailedSaveTask') + ' (Permission denied)')
                return
            }

            setIsModalOpen(false)
            setFormData({
                id: undefined, partner_id: '', title: '', description: '', due_date: '', priority: 'Medium', status: 'Pending'
            })
            fetchTasksAndPartners()
        } catch (error) {
            console.error('Error saving task:', error)
            alert(t(language, 'FailedSaveTask'))
        } finally {
            setIsSubmitting(false)
        }
    }

    const openEditModal = (task: ExtendedTask) => {
        setFormData({
            id: task.id,
            partner_id: task.partner_id || '',
            title: task.title,
            description: task.description || '',
            due_date: task.due_date ? task.due_date.split('T')[0] : '',
            priority: task.priority || 'Medium',
            status: task.status || 'Pending'
        })
        setIsModalOpen(true)
    }

    const handleDeleteTask = async () => {
        if (!formData.id) return
        if (!confirm(t(language, 'ConfirmDeleteTask'))) return
        try {
            const { data, error } = await supabase.from('crm_tasks').delete().eq('id', formData.id).select()
            if (error) throw error
            if (!data || data.length === 0) {
                alert(t(language, 'FailedDeleteTask') + ' (Permission denied)')
                return
            }
            setTasks(tasks.filter(t => t.id !== formData.id))
            setIsModalOpen(false)
        } catch (error) {
            console.error('Error deleting task:', error)
            alert(t(language, 'FailedDeleteTask'))
        }
    }

    return (
        <div className="p-6 max-w-[1600px] h-screen flex flex-col mx-auto relative">
            <div className="flex justify-between items-end mb-6 shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'TasksAndFollowups')}</h1>
                    <p className="text-slate-500 mt-1">{t(language, 'TasksDesc')}</p>
                </div>
                <button 
                    onClick={() => {
                        setFormData({ id: undefined, partner_id: '', title: '', description: '', due_date: '', priority: 'Medium', status: 'Pending' })
                        setIsModalOpen(true)
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    {t(language, 'NewTask')}
                </button>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder={t(language, 'SearchTasksPartners')}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-64 shadow-sm"
                        />
                    </div>
                </div>
            </div>

            {/* Kanban Board Area */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <CircularLoader />
                </div>
            ) : (
                <div className="flex-1 min-h-0 relative">
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
                                    <span>{t(language, col.id.replace(/\s+/g, '') as any)}</span>
                                    <span className="bg-white/50 px-2 py-0.5 rounded-full text-xs">
                                        {filteredTasks.filter(t => t.status === col.id).length}
                                    </span>
                                </div>
                                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                                    {filteredTasks.filter(t => t.status === col.id).map(task => (
                                        <TaskCard 
                                            key={task.id} 
                                            task={task} 
                                            language={language}
                                            canEdit={currentUser?.id === task.created_by || currentUser?.role === 'owner'}
                                            onEdit={() => openEditModal(task)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Task Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h2 className="text-xl font-bold text-slate-900">
                                {formData.id ? 
                                    ((tasks.find(t => t.id === formData.id)?.created_by === currentUser?.id || currentUser?.role === 'owner') ? t(language, 'EditTask') : t(language, 'TaskDetails') || 'Task Details') 
                                    : t(language, 'NewTask')}
                            </h2>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-2"
                            >
                                ✕
                            </button>
                        </div>
                        
                        <form onSubmit={handleSaveTask} className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t(language, 'TitleStar')}</label>
                                    <input 
                                        type="text" 
                                        required
                                        disabled={formData.id ? (tasks.find(t => t.id === formData.id)?.created_by !== currentUser?.id && currentUser?.role !== 'owner') : false}
                                        value={formData.title}
                                        onChange={e => setFormData({...formData, title: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition disabled:opacity-60"
                                        placeholder={t(language, 'TaskTitlePlaceholder')}
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t(language, 'RelatedPartner')}</label>
                                    <select 
                                        value={formData.partner_id}
                                        disabled={formData.id ? (tasks.find(t => t.id === formData.id)?.created_by !== currentUser?.id && currentUser?.role !== 'owner') : false}
                                        onChange={e => setFormData({...formData, partner_id: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition disabled:opacity-60"
                                    >
                                        <option value="">{t(language, 'NoSpecificPartner')}</option>
                                        {partners.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">{t(language, 'DueDate')}</label>
                                        <input 
                                            type="date" 
                                            disabled={formData.id ? (tasks.find(t => t.id === formData.id)?.created_by !== currentUser?.id && currentUser?.role !== 'owner') : false}
                                            value={formData.due_date}
                                            onChange={e => setFormData({...formData, due_date: e.target.value})}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition disabled:opacity-60"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">{t(language, 'Priority')}</label>
                                        <select 
                                            value={formData.priority}
                                            disabled={formData.id ? (tasks.find(t => t.id === formData.id)?.created_by !== currentUser?.id && currentUser?.role !== 'owner') : false}
                                            onChange={e => setFormData({...formData, priority: e.target.value})}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition disabled:opacity-60"
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
                                        value={formData.status}
                                        disabled={formData.id ? (tasks.find(t => t.id === formData.id)?.created_by !== currentUser?.id && currentUser?.role !== 'owner') : false}
                                        onChange={e => setFormData({...formData, status: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition disabled:opacity-60"
                                    >
                                        <option value="Pending">{t(language, 'Pending')}</option>
                                        <option value="In Progress">{t(language, 'InProgress')}</option>
                                        <option value="Completed">{t(language, 'Completed')}</option>
                                        <option value="Cancelled">{t(language, 'Cancelled')}</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t(language, 'DescriptionLabel')}</label>
                                    <textarea 
                                        rows={3}
                                        disabled={formData.id ? (tasks.find(t => t.id === formData.id)?.created_by !== currentUser?.id && currentUser?.role !== 'owner') : false}
                                        value={formData.description}
                                        onChange={e => setFormData({...formData, description: e.target.value})}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 transition resize-none disabled:opacity-60"
                                        placeholder={t(language, 'TaskDescPlaceholder')}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                                <div>
                                    {formData.id && (tasks.find(t => t.id === formData.id)?.created_by === currentUser?.id || currentUser?.role === 'owner') && (
                                        <button 
                                            type="button"
                                            onClick={handleDeleteTask}
                                            className="px-4 py-2 rounded-xl text-red-600 font-medium hover:bg-red-50 transition"
                                        >
                                            {t(language, 'Delete')}
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-3">
                                    <button 
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                                    >
                                        {(!formData.id || tasks.find(t => t.id === formData.id)?.created_by === currentUser?.id || currentUser?.role === 'owner') ? t(language, 'Cancel') : (t(language, 'Close') || 'Close')}
                                    </button>
                                    {(!formData.id || tasks.find(t => t.id === formData.id)?.created_by === currentUser?.id || currentUser?.role === 'owner') && (
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
                                            ) : t(language, 'SaveTask')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

function TaskCard({ task, onEdit, language, canEdit }: { task: ExtendedTask, onEdit: () => void, language: string, canEdit: boolean }) {
    
    // Check if task is overdue
    let isOverdue = false;
    let dueStr = '';
    
    if (task.due_date) {
        const d = new Date(task.due_date);
        isOverdue = task.status !== 'Completed' && task.status !== 'Cancelled' && isPast(d) && !isToday(d);
        dueStr = format(d, 'MMM d, yyyy');
    }

    return (
        <div 
            draggable={canEdit}
            onDragStart={(e) => { if(canEdit) e.dataTransfer.setData('taskId', task.id) }}
            onClick={onEdit}
            className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition cursor-pointer group block ${!canEdit ? 'opacity-90' : ''}`}
        >
            <div className="flex pr-2 justify-between items-start mb-2 relative">
                <div className="font-semibold text-slate-900 leading-snug">{task.title}</div>
            </div>
            
            {task.crm_partners && (
               <div className="text-sm font-medium text-slate-600 mb-2 truncate">
                   {t(language, 'Partner')}: <Link href={`/crm/partners/${task.partner_id}`} className="text-blue-600 hover:underline">{task.crm_partners.name}</Link>
               </div>
            )}
            
            {task.description && (
                <div className="text-xs text-slate-500 mb-3 line-clamp-2">
                    {task.description}
                </div>
            )}
            
            {task.creator && (
                <div className="text-[11px] font-medium text-slate-400 mb-2 truncate">
                    {t(language, 'CreatedBy') || 'Created by'}: <span className="text-slate-500">{task.creator.name || task.creator.email}</span>
                </div>
            )}
            
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
                <div className="flex items-center gap-2">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        task.priority === 'High' ? 'bg-red-100 text-red-700' :
                        task.priority === 'Medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                    }`}>
                        {t(language, task.priority as any)}
                    </span>
                </div>
                
                {task.due_date && (
                    <div className={`flex items-center gap-1.5 text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
                        {isOverdue ? <AlertCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                        {dueStr}
                    </div>
                )}
            </div>
        </div>
    )
}
