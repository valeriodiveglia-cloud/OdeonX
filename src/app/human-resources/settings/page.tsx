'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase_shim'
import { RecruitmentPlatform, RecruitmentJobTemplate, HRDepartment, HRPosition, HRInterviewTemplate, InterviewTemplateSection, InterviewQuestion } from '@/types/human-resources'
import { 
    Plus, 
    Pencil, 
    Trash2, 
    X, 
    ChevronUp, 
    ChevronDown, 
    ChevronLeft,
    ChevronRight,
    Check, 
    Globe, 
    FileText,
    Bold,
    Italic,
    List,
    Package,
    GripVertical
} from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import { PackageManagerModal } from '@/components/human-resources/PackageManagerModal'

/* ─── Comprehensive icon library organized by category ─── */
const ICON_CATEGORIES: { name: string; icons: string[] }[] = [
    {
        name: 'Social & Communication',
        icons: ['📘', '💬', '💼', '📱', '📧', '📩', '📨', '✉️', '📞', '☎️', '🗣️', '💭', '📣', '📢', '🔔', '📲', '🌐', '🔗'],
    },
    {
        name: 'Business & Work',
        icons: ['🏢', '🏨', '🏬', '🏪', '🏗️', '🏛️', '🏠', '🏭', '🏦', '💳', '💰', '🤝', '👔', '📋', '📊', '📈', '📉', '📌'],
    },
    {
        name: 'People & Gestures',
        icons: ['👤', '👥', '🚶', '🧑‍💼', '👨‍💻', '👩‍💻', '🧑‍🍳', '👨‍🍳', '🙋', '🙋‍♂️', '🙋‍♀️', '🤵', '💁', '🙌', '👋', '✋', '🖐️', '✌️'],
    },
    {
        name: 'Tech & Tools',
        icons: ['🖥️', '💻', '⌨️', '🖱️', '📡', '🔍', '🔎', '⚙️', '🔧', '🛠️', '📐', '📏', '🗄️', '📂', '📁', '🗃️', '📎', '✏️'],
    },
    {
        name: 'Flags & Countries',
        icons: ['🇻🇳', '🇺🇸', '🇬🇧', '🇫🇷', '🇩🇪', '🇯🇵', '🇰🇷', '🇨🇳', '🇮🇹', '🇪🇸', '🇧🇷', '🇮🇳', '🇦🇺', '🇨🇦', '🇷🇺', '🇹🇭', '🇸🇬', '🇲🇾'],
    },
    {
        name: 'Symbols & Misc',
        icons: ['⭐', '🌟', '✨', '💡', '🎯', '🏷️', '🔖', '❤️', '💙', '💚', '💛', '🧡', '💜', '🖤', '🔴', '🟢', '🔵', '🟡'],
    },
]

/* ─── Color presets ─── */
const COLOR_PRESETS = [
    { bg: 'bg-blue-100', text: 'text-blue-800', preview: 'bg-blue-500' },
    { bg: 'bg-sky-100', text: 'text-sky-800', preview: 'bg-sky-500' },
    { bg: 'bg-indigo-100', text: 'text-indigo-800', preview: 'bg-indigo-500' },
    { bg: 'bg-purple-100', text: 'text-purple-800', preview: 'bg-purple-500' },
    { bg: 'bg-violet-100', text: 'text-violet-800', preview: 'bg-violet-500' },
    { bg: 'bg-pink-100', text: 'text-pink-800', preview: 'bg-pink-500' },
    { bg: 'bg-red-100', text: 'text-red-800', preview: 'bg-red-500' },
    { bg: 'bg-orange-100', text: 'text-orange-800', preview: 'bg-orange-500' },
    { bg: 'bg-amber-100', text: 'text-amber-800', preview: 'bg-amber-500' },
    { bg: 'bg-green-100', text: 'text-green-800', preview: 'bg-green-500' },
    { bg: 'bg-teal-100', text: 'text-teal-800', preview: 'bg-teal-500' },
    { bg: 'bg-cyan-100', text: 'text-cyan-800', preview: 'bg-cyan-500' },
    { bg: 'bg-gray-100', text: 'text-gray-800', preview: 'bg-gray-500' },
]

interface EditingPlatform {
    id: string | null
    label: string
    icon: string
    color_bg: string
    color_text: string
    has_packages: boolean
}

interface EditingTemplate {
    id: string | null
    position_title: string
    department: string
    description: string
    employment_type: string
}

export default function HRSettingsPage() {
    const { language } = useSettings()
    const isVI = language === 'vi'

    // Tab controls
    const [activeTab, setActiveTab] = useState<'platforms' | 'templates' | 'interview_templates'>('platforms')

    // Data lists
    const [platforms, setPlatforms] = useState<RecruitmentPlatform[]>([])
    const [templates, setTemplates] = useState<RecruitmentJobTemplate[]>([])
    const [dbDepartments, setDbDepartments] = useState<HRDepartment[]>([])
    const [dbPositions, setDbPositions] = useState<HRPosition[]>([])
    const [interviewTemplates, setInterviewTemplates] = useState<HRInterviewTemplate[]>([])

    // Load states
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Platform form states
    const [editingPlatform, setEditingPlatform] = useState<EditingPlatform | null>(null)
    const [platformDeleteConfirm, setPlatformDeleteConfirm] = useState<string | null>(null)
    const [draggedIdx, setDraggedIdx] = useState<number | null>(null)
    const [draggedQuestionIdx, setDraggedQuestionIdx] = useState<number | null>(null)
    const [showIconPicker, setShowIconPicker] = useState(false)
    const [showColorPicker, setShowColorPicker] = useState(false)
    
    // Package modal state
    const [selectedPlatformForPackages, setSelectedPlatformForPackages] = useState<{ value: string; label: string } | null>(null)

    // Template form states
    const [editingTemplate, setEditingTemplate] = useState<EditingTemplate | null>(null)
    const [templateDeleteConfirm, setTemplateDeleteConfirm] = useState<string | null>(null)
    const [templateSelectedDeptId, setTemplateSelectedDeptId] = useState<string>('')

    // Interview Template form states
    const [editingInterviewTemplate, setEditingInterviewTemplate] = useState<HRInterviewTemplate | null>(null)
    const [interviewTemplateDeleteConfirm, setInterviewTemplateDeleteConfirm] = useState<string | null>(null)
    const [builderSelectedDeptId, setBuilderSelectedDeptId] = useState<string>('')
    const [activeSectionTabIdx, setActiveSectionTabIdx] = useState<number>(0)

    const templateEditorRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (editingTemplate && templateEditorRef.current) {
            if (templateEditorRef.current.innerHTML !== editingTemplate.description) {
                templateEditorRef.current.innerHTML = editingTemplate.description
            }
        }
    }, [editingTemplate])

    const handleTemplateFormat = (command: string) => {
        document.execCommand(command, false)
        if (templateEditorRef.current) {
            setEditingTemplate(prev => prev ? { ...prev, description: templateEditorRef.current!.innerHTML } : null)
            templateEditorRef.current.focus()
        }
    }

    const handleTemplateInput = () => {
        if (templateEditorRef.current && editingTemplate) {
            setEditingTemplate(prev => prev ? { ...prev, description: templateEditorRef.current!.innerHTML } : null)
        }
    }


    useEffect(() => {
        const initData = async () => {
            setLoading(true)
            await Promise.all([
                fetchPlatforms(),
                fetchTemplates(),
                fetchDeptsAndPositions(),
                fetchInterviewTemplates()
            ])
            setLoading(false)
        }
        initData()
    }, [])

    const fetchPlatforms = async () => {
        try {
            const { data, error } = await supabase
                .from('recruitment_platforms')
                .select('*')
                .order('sort_order', { ascending: true })
            if (error) throw error
            setPlatforms(data as RecruitmentPlatform[])
        } catch (error) {
            console.error('Error fetching platforms:', error)
        }
    }

    const fetchTemplates = async () => {
        try {
            const { data, error } = await supabase
                .from('recruitment_job_templates')
                .select('*')
                .order('position_title', { ascending: true })
            if (error) throw error
            setTemplates(data as RecruitmentJobTemplate[])
        } catch (error) {
            console.error('Error fetching job templates:', error)
        }
    }

    const fetchDeptsAndPositions = async () => {
        try {
            const [deptsRes, positionsRes] = await Promise.all([
                supabase.from('hr_departments').select('id, name').order('sort_order'),
                supabase.from('hr_positions').select('id, name, department_id').order('sort_order')
            ])
            if (deptsRes.data) setDbDepartments(deptsRes.data as HRDepartment[])
            if (positionsRes.data) setDbPositions(positionsRes.data as HRPosition[])
        } catch (error) {
            console.error('Error loading departments/positions:', error)
        }
    }

    /* ─── Platform Actions ─── */
    const startAddPlatform = () => {
        setEditingPlatform({ id: null, label: '', icon: '📌', color_bg: 'bg-blue-100', color_text: 'text-blue-800', has_packages: false })
        setShowIconPicker(false)
        setShowColorPicker(false)
    }

    const startEditPlatform = (p: RecruitmentPlatform) => {
        setEditingPlatform({ id: p.id, label: p.label, icon: p.icon, color_bg: p.color_bg, color_text: p.color_text, has_packages: p.has_packages })
        setShowIconPicker(false)
        setShowColorPicker(false)
    }

    const cancelEditPlatform = () => {
        setEditingPlatform(null)
        setShowIconPicker(false)
        setShowColorPicker(false)
    }

    const savePlatformEdit = async () => {
        if (!editingPlatform || !editingPlatform.label.trim()) return
        setSaving(true)
        const value = editingPlatform.label.trim().replace(/\s+/g, '-')

        try {
            if (editingPlatform.id) {
                const { error } = await supabase
                    .from('recruitment_platforms')
                    .update({ 
                        value, 
                        label: editingPlatform.label.trim(), 
                        icon: editingPlatform.icon, 
                        color_bg: editingPlatform.color_bg, 
                        color_text: editingPlatform.color_text,
                        has_packages: editingPlatform.has_packages || false
                    })
                    .eq('id', editingPlatform.id)
                if (error) throw error

                await supabase.from('hr_activity_log').insert([{
                    hiring_request_id: null,
                    action_type: 'platform_updated',
                    message: `Recruitment platform "${editingPlatform.label.trim()}" was updated / Nền tảng tuyển dụng "${editingPlatform.label.trim()}" đã được cập nhật`
                }])
            } else {
                const maxSort = platforms.length > 0 ? Math.max(...platforms.map(p => p.sort_order)) : 0
                const { error } = await supabase
                    .from('recruitment_platforms')
                    .insert([{ 
                        value, 
                        label: editingPlatform.label.trim(), 
                        icon: editingPlatform.icon, 
                        color_bg: editingPlatform.color_bg, 
                        color_text: editingPlatform.color_text, 
                        sort_order: maxSort + 1,
                        has_packages: editingPlatform.has_packages || false
                    }])
                if (error) throw error

                await supabase.from('hr_activity_log').insert([{
                    hiring_request_id: null,
                    action_type: 'platform_created',
                    message: `Recruitment platform "${editingPlatform.label.trim()}" was created / Nền tảng tuyển dụng "${editingPlatform.label.trim()}" đã được tạo`
                }])
            }
            await fetchPlatforms()
            cancelEditPlatform()
        } catch (error: any) {
            console.error('Error saving platform:', error)
            alert(error.message || 'Failed to save platform')
        } finally {
            setSaving(false)
        }
    }

    const deletePlatform = async (id: string) => {
        try {
            const platformToDelete = platforms.find(p => p.id === id)
            const { error } = await supabase.from('recruitment_platforms').delete().eq('id', id)
            if (error) throw error

            if (platformToDelete) {
                await supabase.from('hr_activity_log').insert([{
                    hiring_request_id: null,
                    action_type: 'platform_deleted',
                    message: `Recruitment platform "${platformToDelete.label}" was deleted / Nền tảng tuyển dụng "${platformToDelete.label}" đã bị xóa`
                }])
            }

            setPlatforms(prev => prev.filter(p => p.id !== id))
            setPlatformDeleteConfirm(null)
        } catch (error: any) {
            console.error('Error deleting platform:', error)
            alert(error.message || 'Failed to delete platform')
        }
    }

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIdx(index)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/html', e.currentTarget.outerHTML)
    }

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }

    const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault()
        if (draggedIdx === null || draggedIdx === targetIndex) return

        const reordered = [...platforms]
        const [draggedItem] = reordered.splice(draggedIdx, 1)
        reordered.splice(targetIndex, 0, draggedItem)

        setPlatforms(reordered)
        setDraggedIdx(null)

        try {
            for (let i = 0; i < reordered.length; i++) {
                const item = reordered[i]
                const newSortOrder = i + 1
                if (item.sort_order !== newSortOrder) {
                    await supabase
                        .from('recruitment_platforms')
                        .update({ sort_order: newSortOrder })
                        .eq('id', item.id)
                }
            }
            await fetchPlatforms()
        } catch (error) {
            console.error('Failed to save platform order:', error)
            await fetchPlatforms()
        }
    }

    const handleDragEnd = () => {
        setDraggedIdx(null)
    }

    /* ─── Template Actions ─── */
    const startAddTemplate = () => {
        setEditingTemplate({ id: null, position_title: '', department: '', description: '', employment_type: 'full_time' })
        setTemplateSelectedDeptId('')
    }

    const startEditTemplate = (t: RecruitmentJobTemplate) => {
        setEditingTemplate({ id: t.id, position_title: t.position_title, department: t.department, description: t.description, employment_type: t.employment_type || 'full_time' })
        // Set selected dept id by department name match
        const matchedDept = dbDepartments.find(d => d.name === t.department)
        setTemplateSelectedDeptId(matchedDept ? matchedDept.id : '')
    }

    const cancelEditTemplate = () => {
        setEditingTemplate(null)
        setTemplateSelectedDeptId('')
    }

    const saveTemplateEdit = async () => {
        if (!editingTemplate || !editingTemplate.position_title || !editingTemplate.department) {
            alert(isVI ? 'Vui lòng chọn bộ phận và vị trí' : 'Please select department and position')
            return
        }
        setSaving(true)

        try {
            if (editingTemplate.id) {
                const { error } = await supabase
                    .from('recruitment_job_templates')
                    .update({
                        position_title: editingTemplate.position_title,
                        department: editingTemplate.department,
                        description: editingTemplate.description,
                        employment_type: editingTemplate.employment_type
                    })
                    .eq('id', editingTemplate.id)
                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('recruitment_job_templates')
                    .insert([{
                        position_title: editingTemplate.position_title,
                        department: editingTemplate.department,
                        description: editingTemplate.description,
                        employment_type: editingTemplate.employment_type
                    }])
                if (error) throw error
            }
            await fetchTemplates()
            cancelEditTemplate()
        } catch (error: any) {
            console.error('Error saving template:', error)
            alert(error.message || 'Failed to save template')
        } finally {
            setSaving(false)
        }
    }

    const deleteTemplate = async (id: string) => {
        try {
            const { error } = await supabase.from('recruitment_job_templates').delete().eq('id', id)
            if (error) throw error
            setTemplates(prev => prev.filter(t => t.id !== id))
            setTemplateDeleteConfirm(null)
        } catch (error: any) {
            console.error('Error deleting template:', error)
            alert(error.message || 'Failed to delete template')
        }
    }

    const fetchInterviewTemplates = async () => {
        try {
            const { data, error } = await supabase
                .from('hr_interview_templates')
                .select('*')
                .order('is_default', { ascending: false })
                .order('name', { ascending: true })
            if (error) throw error
            setInterviewTemplates(data as HRInterviewTemplate[])
        } catch (error) {
            console.error('Error fetching interview templates:', error)
        }
    }

    const startAddInterviewTemplate = () => {
        setEditingInterviewTemplate({
            id: null as any,
            name: '',
            department: '',
            position_title: '',
            employment_type: 'full_time',
            is_default: false,
            sections: []
        })
        setBuilderSelectedDeptId('')
        setActiveSectionTabIdx(0)
    }

    const startEditInterviewTemplate = (t: HRInterviewTemplate) => {
        setEditingInterviewTemplate({
            id: t.id,
            name: t.name,
            department: t.department || '',
            position_title: t.position_title || '',
            employment_type: t.employment_type || 'full_time',
            is_default: t.is_default,
            sections: t.sections ? JSON.parse(JSON.stringify(t.sections)) : []
        })
        const matchedDept = dbDepartments.find(d => d.name === t.department)
        setBuilderSelectedDeptId(matchedDept ? matchedDept.id : '')
        setActiveSectionTabIdx(0)
    }

    const cancelEditInterviewTemplate = () => {
        setEditingInterviewTemplate(null)
        setBuilderSelectedDeptId('')
        setActiveSectionTabIdx(0)
    }

    const saveInterviewTemplate = async () => {
        if (!editingInterviewTemplate || !editingInterviewTemplate.name.trim()) {
            alert(isVI ? 'Vui lòng nhập tên mẫu câu hỏi' : 'Please enter template name')
            return
        }
        setSaving(true)
        try {
            const payload = {
                name: editingInterviewTemplate.name.trim(),
                department: editingInterviewTemplate.department || null,
                position_title: editingInterviewTemplate.position_title || null,
                employment_type: editingInterviewTemplate.employment_type || null,
                is_default: editingInterviewTemplate.is_default || false,
                sections: editingInterviewTemplate.sections
            }

            if (editingInterviewTemplate.is_default) {
                await supabase
                    .from('hr_interview_templates')
                    .update({ is_default: false })
                    .eq('is_default', true)
            }

            if (editingInterviewTemplate.id) {
                const { error } = await supabase
                    .from('hr_interview_templates')
                    .update(payload)
                    .eq('id', editingInterviewTemplate.id)
                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('hr_interview_templates')
                    .insert([payload])
                if (error) throw error
            }

            await fetchInterviewTemplates()
            cancelEditInterviewTemplate()
        } catch (error: any) {
            console.error('Error saving interview template:', error)
            alert(error.message || 'Failed to save template')
        } finally {
            setSaving(false)
        }
    }

    const deleteInterviewTemplate = async (id: string) => {
        try {
            const { error } = await supabase.from('hr_interview_templates').delete().eq('id', id)
            if (error) throw error
            setInterviewTemplates(prev => prev.filter(t => t.id !== id))
            setInterviewTemplateDeleteConfirm(null)
        } catch (error: any) {
            console.error('Error deleting interview template:', error)
            alert(error.message || 'Failed to delete template')
        }
    }

    const addInterviewSection = () => {
        const newSec: InterviewTemplateSection = {
            id: `sec_${Date.now()}`,
            name_en: '',
            name_vi: '',
            questions: []
        }
        setEditingInterviewTemplate(prev => {
            if (!prev) return null
            const updated = [...prev.sections, newSec]
            setActiveSectionTabIdx(updated.length - 1)
            return { ...prev, sections: updated }
        })
    }

    const removeInterviewSection = (index: number) => {
        setEditingInterviewTemplate(prev => {
            if (!prev) return null
            const updated = [...prev.sections]
            updated.splice(index, 1)
            setActiveSectionTabIdx(current => {
                if (updated.length === 0) return 0
                if (current >= updated.length) return updated.length - 1
                return current
            })
            return { ...prev, sections: updated }
        })
    }

    const moveInterviewSection = (index: number, direction: 'up' | 'down') => {
        setEditingInterviewTemplate(prev => {
            if (!prev) return null
            const targetIndex = direction === 'up' ? index - 1 : index + 1
            if (targetIndex < 0 || targetIndex >= prev.sections.length) return prev
            const updated = [...prev.sections]
            const temp = updated[index]
            updated[index] = updated[targetIndex]
            updated[targetIndex] = temp
            setActiveSectionTabIdx(current => {
                if (current === index) return targetIndex
                if (current === targetIndex) return index
                return current
            })
            return { ...prev, sections: updated }
        })
    }

    const updateInterviewSectionName = (index: number, value: string, lang: 'en' | 'vi') => {
        setEditingInterviewTemplate(prev => {
            if (!prev) return null
            const updated = [...prev.sections]
            if (lang === 'en') {
                updated[index] = { ...updated[index], name_en: value }
            } else {
                updated[index] = { ...updated[index], name_vi: value }
            }
            return { ...prev, sections: updated }
        })
    }

    const addInterviewQuestion = (sectionIndex: number) => {
        const newQ: InterviewQuestion = {
            id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            text_en: '',
            text_vi: '',
            type: 'text'
        }
        setEditingInterviewTemplate(prev => {
            if (!prev) return null
            const updated = [...prev.sections]
            updated[sectionIndex] = {
                ...updated[sectionIndex],
                questions: [...updated[sectionIndex].questions, newQ]
            }
            return { ...prev, sections: updated }
        })
    }

    const removeInterviewQuestion = (sectionIndex: number, questionIndex: number) => {
        setEditingInterviewTemplate(prev => {
            if (!prev) return null
            const updated = [...prev.sections]
            const qs = [...updated[sectionIndex].questions]
            qs.splice(questionIndex, 1)
            updated[sectionIndex] = { ...updated[sectionIndex], questions: qs }
            return { ...prev, sections: updated }
        })
    }

    const handleQuestionDragStart = (e: React.DragEvent, index: number) => {
        setDraggedQuestionIdx(index)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/html', e.currentTarget.outerHTML)
    }

    const handleQuestionDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }

    const handleQuestionDrop = (e: React.DragEvent, sectionIndex: number, targetIndex: number) => {
        e.preventDefault()
        if (draggedQuestionIdx === null || draggedQuestionIdx === targetIndex) return

        setEditingInterviewTemplate(prev => {
            if (!prev) return null
            const updatedSections = [...prev.sections]
            const section = updatedSections[sectionIndex]
            const reorderedQs = [...section.questions]
            
            const [draggedItem] = reorderedQs.splice(draggedQuestionIdx, 1)
            reorderedQs.splice(targetIndex, 0, draggedItem)

            updatedSections[sectionIndex] = {
                ...section,
                questions: reorderedQs
            }
            return {
                ...prev,
                sections: updatedSections
            }
        })
        setDraggedQuestionIdx(null)
    }

    const handleQuestionDragEnd = () => {
        setDraggedQuestionIdx(null)
    }

    const updateInterviewQuestionProp = (sectionIndex: number, questionIndex: number, key: keyof InterviewQuestion, value: any) => {
        setEditingInterviewTemplate(prev => {
            if (!prev) return null
            const updated = [...prev.sections]
            const qs = [...updated[sectionIndex].questions]
            qs[questionIndex] = { ...qs[questionIndex], [key]: value }
            updated[sectionIndex] = { ...updated[sectionIndex], questions: qs }
            return { ...prev, sections: updated }
        })
    }

    // Filter positions by selected department ID in template editor
    const filteredPositions = dbPositions.filter(pos => pos.department_id === templateSelectedDeptId)

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0b1530] flex items-center justify-center">
                <CircularLoader />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#0b1530] text-gray-100 p-6 animate-in fade-in duration-300">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                        {isVI ? 'Cài đặt HR' : 'HR Settings'}
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                        {isVI ? 'Cấu hình các thiết lập và tùy chọn cho tuyển dụng.' : 'Configure recruitment platforms and other HR preferences.'}
                    </p>
                </div>

                {/* Tabs */}
                <div className="border-b border-white/10 mb-6">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button onClick={() => setActiveTab('platforms')}
                            className={`
                                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all cursor-pointer
                                ${activeTab === 'platforms'
                                    ? 'border-blue-500 text-blue-500'
                                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}
                            `}
                        >
                            {isVI ? 'Nền tảng đăng tuyển' : 'Posting Platforms'}
                        </button>
                        <button onClick={() => setActiveTab('templates')}
                            className={`
                                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all cursor-pointer
                                ${activeTab === 'templates'
                                    ? 'border-blue-500 text-blue-500'
                                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}
                            `}
                        >
                            {isVI ? 'Mẫu mô tả công việc' : 'Job Description Templates'}
                        </button>
                        <button onClick={() => setActiveTab('interview_templates')}
                            className={`
                                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all cursor-pointer
                                ${activeTab === 'interview_templates'
                                    ? 'border-blue-500 text-blue-500'
                                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}
                            `}
                        >
                            {isVI ? 'Mẫu câu hỏi phỏng vấn' : 'Interview Questionnaire Templates'}
                        </button>
                    </nav>
                </div>

                {/* Posting Platforms Tab Content */}
                {activeTab === 'platforms' && (
                    <>
                        <div className="flex justify-end gap-2 mb-4">
                            <button
                                onClick={startAddPlatform}
                                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition shadow cursor-pointer"
                            >
                                <Plus className="w-4 h-4" />
                                {isVI ? 'Thêm Nền tảng' : 'Add Platform'}
                            </button>
                        </div>

                        {/* Platforms Table Card */}
                        <div className="rounded-2xl bg-white shadow-md overflow-hidden text-gray-900">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200">
                                        <th className="w-10"></th>
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{isVI ? 'Tên nền tảng' : 'Platform Name'}</th>
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{isVI ? 'Nhãn xem trước' : 'Preview Badge'}</th>
                                        <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-[120px]">{isVI ? 'Hành động' : 'Actions'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {platforms.map((platform, idx) => (
                                        <tr 
                                            key={platform.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, idx)}
                                            onDragOver={(e) => handleDragOver(e, idx)}
                                            onDragEnd={handleDragEnd}
                                            onDrop={(e) => handleDrop(e, idx)}
                                            className={`border-t border-gray-100 ${idx % 2 === 0 ? 'bg-gray-50/50' : ''} hover:bg-gray-50 transition cursor-grab active:cursor-grabbing ${draggedIdx === idx ? 'opacity-40 bg-blue-50/20' : ''}`}
                                        >
                                            <td className="px-3 py-3 text-center text-gray-400">
                                                <GripVertical className="w-4 h-4 mx-auto text-slate-350 cursor-grab active:cursor-grabbing" />
                                            </td>
                                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                                                <div className="flex items-center gap-2">
                                                    <span>{platform.label}</span>
                                                    {platform.has_packages ? (
                                                        <button
                                                            onClick={() => setSelectedPlatformForPackages({ value: platform.value, label: platform.label })}
                                                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition cursor-pointer border border-blue-200"
                                                        >
                                                            <Package className="w-3 h-3" />
                                                            {isVI ? 'Xem gói dịch vụ' : 'View Packages'}
                                                        </button>
                                                    ) : (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                                                            {isVI ? 'Không dùng gói (Free)' : 'No Packages (Free)'}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${platform.color_bg} ${platform.color_text}`}>
                                                    <span>{platform.label}</span>
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button onClick={() => startEditPlatform(platform)}
                                                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition cursor-pointer"
                                                        title={isVI ? 'Sửa' : 'Edit'}
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    {platformDeleteConfirm === platform.id ? (
                                                        <div className="flex items-center gap-1 ml-1 bg-red-50 rounded-lg p-1 border border-red-150">
                                                            <span className="text-[11px] text-red-600 font-bold mr-1 px-1">{isVI ? 'Xóa?' : 'Delete?'}</span>
                                                            <button onClick={() => deletePlatform(platform.id)}
                                                                className="p-1 rounded bg-red-600 text-white hover:bg-red-700 transition cursor-pointer">
                                                                <Check className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button onClick={() => setPlatformDeleteConfirm(null)}
                                                                className="p-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-350 transition cursor-pointer">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button onClick={() => setPlatformDeleteConfirm(platform.id)}
                                                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition cursor-pointer"
                                                            title={isVI ? 'Xóa' : 'Delete'}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {platforms.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-12 text-center text-gray-400 bg-white">
                                                {isVI ? 'Chưa cấu hình nền tảng nào.' : 'No platforms configured.'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* Job Description Templates Tab Content */}
                {activeTab === 'templates' && (
                    <>
                        <div className="flex justify-end gap-2 mb-4">
                            <button
                                onClick={startAddTemplate}
                                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition shadow cursor-pointer"
                            >
                                <Plus className="w-4 h-4" />
                                {isVI ? 'Thêm Mẫu' : 'Add Template'}
                            </button>
                        </div>

                        {/* Templates Table Card */}
                        <div className="rounded-2xl bg-white shadow-md overflow-hidden text-gray-900">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200">
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{isVI ? 'Vị trí' : 'Position'}</th>
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-[180px]">{isVI ? 'Bộ phận' : 'Department'}</th>
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-[160px]">{isVI ? 'Loại hình' : 'Employment Type'}</th>
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-[160px]">{isVI ? 'Ngày tạo' : 'Created At'}</th>
                                        <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-[120px]">{isVI ? 'Hành động' : 'Actions'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {templates.map((template) => {
                                        const formattedDate = new Date(template.created_at).toLocaleDateString(isVI ? 'vi-VN' : 'en-US', {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric'
                                        })
                                        return (
                                            <tr key={template.id} className="border-t border-gray-100 hover:bg-gray-50 transition">
                                                <td className="px-4 py-3 text-sm font-semibold text-gray-900">{template.position_title}</td>
                                                <td className="px-4 py-3 text-sm text-gray-650">{template.department}</td>
                                                <td className="px-4 py-3 text-sm">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                                        template.employment_type === 'part_time'
                                                            ? 'bg-purple-50 text-purple-700 border-purple-250/30'
                                                            : 'bg-blue-50 text-blue-700 border-blue-250/30'
                                                    }`}>
                                                        {template.employment_type === 'part_time'
                                                            ? (isVI ? 'Bán thời gian' : 'Part-time')
                                                            : (isVI ? 'Toàn thời gian' : 'Full-time')
                                                        }
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500">{formattedDate}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button onClick={() => startEditTemplate(template)}
                                                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition cursor-pointer">
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        {templateDeleteConfirm === template.id ? (
                                                            <div className="flex items-center gap-1 ml-1 bg-red-50 rounded-lg p-1 border border-red-150">
                                                                <span className="text-[11px] text-red-600 font-bold mr-1 px-1">{isVI ? 'Xóa?' : 'Delete?'}</span>
                                                                <button onClick={() => deleteTemplate(template.id)}
                                                                    className="p-1 rounded bg-red-600 text-white hover:bg-red-700 transition cursor-pointer">
                                                                    <Check className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button onClick={() => setTemplateDeleteConfirm(null)}
                                                                    className="p-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-350 transition cursor-pointer">
                                                                    <X className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button onClick={() => setTemplateDeleteConfirm(template.id)}
                                                                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition cursor-pointer">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {templates.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-12 text-center text-gray-400 bg-white">
                                                {isVI ? 'Chưa cấu hình mẫu mô tả công việc nào.' : 'No job description templates configured.'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* Interview Questionnaire Templates Tab Content */}
                {activeTab === 'interview_templates' && (
                    <>
                        <div className="flex justify-end gap-2 mb-4">
                            <button
                                onClick={startAddInterviewTemplate}
                                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition shadow cursor-pointer animate-in fade-in duration-200"
                            >
                                <Plus className="w-4 h-4" />
                                {isVI ? 'Thêm Mẫu Câu Hỏi' : 'Add Interview Template'}
                            </button>
                        </div>

                        {/* Interview Templates Table Card */}
                        <div className="rounded-2xl bg-white shadow-md overflow-hidden text-gray-900 animate-in fade-in duration-200">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200">
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{isVI ? 'Tên mẫu' : 'Template Name'}</th>
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{isVI ? 'Tiêu chí áp dụng' : 'Target Criteria'}</th>
                                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-[140px]">{isVI ? 'Mặc định' : 'Default'}</th>
                                        <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-[120px]">{isVI ? 'Hành động' : 'Actions'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {interviewTemplates.map(template => (
                                        <tr key={template.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 text-sm font-semibold text-gray-800">{template.name}</td>
                                            <td className="px-4 py-3 text-xs text-gray-655 font-medium">
                                                <div className="flex flex-wrap gap-1">
                                                    {template.department && (
                                                        <span className="inline-flex items-center bg-blue-50 text-blue-800 px-2 py-0.5 rounded">
                                                            📁 {template.department}
                                                        </span>
                                                    )}
                                                    {template.position_title && (
                                                        <span className="inline-flex items-center bg-purple-50 text-purple-800 px-2 py-0.5 rounded">
                                                            👤 {template.position_title}
                                                        </span>
                                                    )}
                                                    {template.employment_type && (
                                                        <span className="inline-flex items-center bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded">
                                                            💼 {
                                                                template.employment_type === 'full_time' ? (isVI ? 'Toàn thời gian' : 'Full-time') :
                                                                template.employment_type === 'part_time' ? (isVI ? 'Bán thời gian' : 'Part-time') :
                                                                template.employment_type === 'intern' ? (isVI ? 'Thực tập sinh' : 'Intern') :
                                                                template.employment_type === 'temporary' ? (isVI ? 'Tạm thời' : 'Temporary') :
                                                                template.employment_type === 'casual' ? (isVI ? 'Thời vụ' : 'Casual') :
                                                                template.employment_type
                                                            }
                                                        </span>
                                                    )}
                                                    {!template.department && !template.position_title && !template.employment_type && (
                                                        <span className="text-gray-400 italic">
                                                            {isVI ? 'Tất cả vị trí' : 'All Roles / Catch-All'}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500">
                                                {template.is_default ? (
                                                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-full text-xs">
                                                        ⭐ {isVI ? 'Mặc định' : 'Default'}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button onClick={() => startEditInterviewTemplate(template)}
                                                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition cursor-pointer">
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    {interviewTemplateDeleteConfirm === template.id ? (
                                                        <div className="flex items-center gap-1 ml-1 bg-red-50 rounded-lg p-1 border border-red-150">
                                                            <span className="text-[11px] text-red-600 font-bold mr-1 px-1">{isVI ? 'Xóa?' : 'Delete?'}</span>
                                                            <button onClick={() => deleteInterviewTemplate(template.id)}
                                                                className="p-1 rounded bg-red-600 text-white hover:bg-red-700 transition cursor-pointer">
                                                                <Check className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button onClick={() => setInterviewTemplateDeleteConfirm(null)}
                                                                className="p-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-350 transition cursor-pointer">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button 
                                                            onClick={() => setInterviewTemplateDeleteConfirm(template.id)}
                                                            disabled={template.is_default}
                                                            title={template.is_default ? (isVI ? 'Không thể xóa mẫu mặc định' : 'Cannot delete default template') : ''}
                                                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition cursor-pointer disabled:opacity-40 disabled:hover:bg-transparent"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {interviewTemplates.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-12 text-center text-gray-400 bg-white">
                                                {isVI ? 'Chưa cấu hình mẫu câu hỏi phỏng vấn nào.' : 'No interview templates configured.'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* Edit/New Platform modal */}
                {editingPlatform && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={cancelEditPlatform}>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md p-6 text-gray-900" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                                <h3 className="text-lg font-bold text-gray-900">
                                    {editingPlatform.id === null ? (isVI ? 'Thêm nền tảng mới' : 'Add New Platform') : (isVI ? 'Sửa nền tảng' : 'Edit Platform')}
                                </h3>
                                <button onClick={cancelEditPlatform} className="p-1.5 rounded-lg hover:bg-gray-100 text-slate-500 transition-colors cursor-pointer">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">{isVI ? 'Tên nền tảng' : 'Platform Name'}</label>
                                    <input
                                        type="text"
                                        value={editingPlatform.label}
                                        onChange={e => setEditingPlatform({ ...editingPlatform, label: e.target.value })}
                                        placeholder={isVI ? 'ví dụ: LinkedIn' : 'e.g. LinkedIn'}
                                        className="w-full bg-white border border-slate-350 placeholder:text-slate-400 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all h-10 font-semibold"
                                    />
                                </div>

                                {/* Toggle has_packages */}
                                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-300 bg-slate-50">
                                    <div className="pr-4">
                                        <span className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider">{isVI ? 'Quản lý gói dịch vụ' : 'Package Management'}</span>
                                        <span className="block text-[10px] text-slate-500 font-bold leading-normal mt-0.5">
                                            {isVI ? 'Bật nếu đây là kênh trả phí có gói dịch vụ (Hoteljob, TopCV, ecc.)' : 'Enable if this is a paid recruitment channel with packages (Hoteljob, TopCV, etc.)'}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setEditingPlatform({ ...editingPlatform, has_packages: !editingPlatform.has_packages })}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 ${
                                            editingPlatform.has_packages ? 'bg-blue-600' : 'bg-slate-300'
                                        }`}
                                    >
                                        <span
                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                editingPlatform.has_packages ? 'translate-x-5' : 'translate-x-0'
                                            }`}
                                        />
                                    </button>
                                </div>

                                <div className="relative">
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">{isVI ? 'Màu nhãn' : 'Badge Color'}</label>
                                    <button
                                        type="button"
                                        onClick={() => { setShowColorPicker(!showColorPicker); setShowIconPicker(false) }}
                                        className="inline-flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-300 hover:border-slate-450 hover:bg-slate-50 transition bg-white cursor-pointer h-10 w-full justify-between"
                                    >
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold ${editingPlatform.color_bg} ${editingPlatform.color_text}`}>
                                            <span>{editingPlatform.label || 'Platform'}</span>
                                        </span>
                                        <span className="text-xs text-slate-500 font-bold">{isVI ? 'Nhấp để thay đổi' : 'Click to change'}</span>
                                    </button>

                                    {showColorPicker && (
                                        <div className="absolute left-0 right-0 z-20 mt-1 bg-white border border-slate-300 rounded-2xl shadow-xl p-4">
                                            <div className="flex flex-wrap gap-2">
                                                {COLOR_PRESETS.map(c => (
                                                    <button
                                                        key={c.preview}
                                                        type="button"
                                                        onClick={() => { setEditingPlatform({ ...editingPlatform, color_bg: c.bg, color_text: c.text }); setShowColorPicker(false) }}
                                                        className={`w-8 h-8 rounded-full ${c.preview} hover:scale-110 transition-transform cursor-pointer
                                                            ${editingPlatform.color_bg === c.bg ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
                                                        title={c.bg}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 mt-5 border-t border-gray-100">
                                <button onClick={cancelEditPlatform} className="px-4 py-2 rounded-lg text-sm font-bold text-slate-550 hover:bg-slate-105 transition cursor-pointer">
                                    {isVI ? 'Hủy' : 'Cancel'}
                                </button>
                                <button
                                    onClick={savePlatformEdit}
                                    disabled={saving || !editingPlatform.label.trim()}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-bold text-white transition shadow disabled:opacity-40 cursor-pointer"
                                >
                                    {saving ? (isVI ? 'Đang lưu...' : 'Saving...') : (isVI ? 'Lưu' : 'Save')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit/New Job Description Template modal */}
                {editingTemplate && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={cancelEditTemplate}>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-2xl p-6 text-gray-900" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                                <h3 className="text-lg font-bold text-gray-900">
                                    {editingTemplate.id === null ? (isVI ? 'Thêm mẫu mô tả công việc' : 'Add Job Description Template') : (isVI ? 'Sửa mẫu mô tả công việc' : 'Edit Job Description Template')}
                                </h3>
                                <button onClick={cancelEditTemplate} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors cursor-pointer">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                    {/* Department selection */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{isVI ? 'Bộ phận' : 'Department'}</label>
                                        <select
                                            value={templateSelectedDeptId}
                                            onChange={e => {
                                                const dId = e.target.value
                                                setTemplateSelectedDeptId(dId)
                                                const matched = dbDepartments.find(d => d.id === dId)
                                                setEditingTemplate({ 
                                                    ...editingTemplate, 
                                                    department: matched ? matched.name : '',
                                                    position_title: '' // Reset position when dept changes
                                                })
                                            }}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow h-10"
                                        >
                                            <option value="">{isVI ? 'Chọn bộ phận' : 'Select Department'}</option>
                                            {dbDepartments.map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Position selection */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{isVI ? 'Vị trí' : 'Position'}</label>
                                        <select
                                            disabled={!templateSelectedDeptId}
                                            value={editingTemplate.position_title}
                                            onChange={e => setEditingTemplate({ ...editingTemplate, position_title: e.target.value })}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow h-10 disabled:bg-slate-100 disabled:text-slate-450"
                                        >
                                            <option value="">{!templateSelectedDeptId ? (isVI ? 'Vui lòng chọn bộ phận trước' : 'Select department first') : (isVI ? 'Chọn vị trí' : 'Select Position')}</option>
                                            {filteredPositions.map(p => (
                                                <option key={p.id} value={p.name}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Employment Type selection */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{isVI ? 'Loại hình' : 'Employment Type'}</label>
                                        <select
                                            value={editingTemplate.employment_type}
                                            onChange={e => setEditingTemplate({ ...editingTemplate, employment_type: e.target.value })}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow h-10"
                                        >
                                            <option value="full_time">{isVI ? 'Toàn thời gian' : 'Full-time'}</option>
                                            <option value="part_time">{isVI ? 'Bán thời gian' : 'Part-time'}</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Description rich text editor */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{isVI ? 'Chi tiết mô tả công việc' : 'Job Description Details'}</label>
                                    
                                    {/* Formatting Toolbar */}
                                    <div className="flex items-center border border-gray-300 border-b-0 bg-slate-50 px-3 py-1.5 rounded-t-xl gap-1 select-none">
                                        <button
                                            type="button"
                                            onClick={() => handleTemplateFormat('bold')}
                                            onMouseDown={(e) => e.preventDefault()}
                                            title="Bold"
                                            className="p-1.5 rounded hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                                        >
                                            <Bold className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleTemplateFormat('italic')}
                                            onMouseDown={(e) => e.preventDefault()}
                                            title="Italic"
                                            className="p-1.5 rounded hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                                        >
                                            <Italic className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleTemplateFormat('insertUnorderedList')}
                                            onMouseDown={(e) => e.preventDefault()}
                                            title="Bulleted List"
                                            className="p-1.5 rounded hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                                        >
                                            <List className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Contenteditable Editor Area */}
                                    <div
                                        id="template-description-editor"
                                        ref={templateEditorRef}
                                        contentEditable={true}
                                        onInput={handleTemplateInput}
                                        className="w-full min-h-[220px] max-h-[350px] overflow-y-auto px-4 py-3 rounded-b-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-gray-900 border-t-0 outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_li]:list-item"
                                        style={{ whiteSpace: 'pre-wrap' }}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 mt-5 border-t border-gray-100">
                                <button onClick={cancelEditTemplate} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 transition cursor-pointer">
                                    {isVI ? 'Hủy' : 'Cancel'}
                                </button>
                                <button
                                    onClick={saveTemplateEdit}
                                    disabled={saving || !editingTemplate.position_title || !editingTemplate.description.trim()}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition shadow disabled:opacity-40 cursor-pointer"
                                >
                                    {saving ? (isVI ? 'Đang lưu...' : 'Saving...') : (isVI ? 'Lưu' : 'Save')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit/New Interview Template modal */}
                {editingInterviewTemplate && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={cancelEditInterviewTemplate}>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-6xl p-6 text-gray-900 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                            {/* Modal Header */}
                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 shrink-0">
                                <h3 className="text-lg font-bold text-gray-900">
                                    {editingInterviewTemplate.id === null ? (isVI ? 'Thêm mẫu câu hỏi phỏng vấn' : 'Add Interview Template') : (isVI ? 'Sửa mẫu câu hỏi phỏng vấn' : 'Edit Interview Template')}
                                </h3>
                                <button onClick={cancelEditInterviewTemplate} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors cursor-pointer">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Body (Scrollable content) */}
                            <div className="flex-1 overflow-y-auto space-y-5 pr-1 min-h-0">
                                {/* Metadata Group */}
                                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-4 text-left">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{isVI ? 'Tên mẫu' : 'Template Name'}</label>
                                            <input
                                                type="text"
                                                value={editingInterviewTemplate.name}
                                                onChange={e => setEditingInterviewTemplate({ ...editingInterviewTemplate, name: e.target.value })}
                                                placeholder={isVI ? 'Ví dụ: Mẫu Bếp - Chef' : 'e.g. Kitchen - Chef'}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{isVI ? 'Bộ phận' : 'Department'}</label>
                                            <select
                                                value={builderSelectedDeptId}
                                                onChange={e => {
                                                    const dId = e.target.value
                                                    setBuilderSelectedDeptId(dId)
                                                    const matched = dbDepartments.find(d => d.id === dId)
                                                    setEditingInterviewTemplate({
                                                        ...editingInterviewTemplate,
                                                        department: matched ? matched.name : '',
                                                        position_title: '' // Reset position when dept changes
                                                    })
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white"
                                            >
                                                <option value="">{isVI ? '-- Tất cả --' : '-- All Departments --'}</option>
                                                {dbDepartments.map(d => (
                                                    <option key={d.id} value={d.id}>{d.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{isVI ? 'Vị trí' : 'Position'}</label>
                                            <select
                                                value={editingInterviewTemplate.position_title || ''}
                                                onChange={e => setEditingInterviewTemplate({ ...editingInterviewTemplate, position_title: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white"
                                            >
                                                <option value="">{isVI ? '-- Tất cả --' : '-- All Positions --'}</option>
                                                {(builderSelectedDeptId ? dbPositions.filter(p => p.department_id === builderSelectedDeptId) : dbPositions).map(p => (
                                                    <option key={p.id} value={p.name}>{p.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{isVI ? 'Loại hình hợp đồng' : 'Employment Type'}</label>
                                            <select
                                                value={editingInterviewTemplate.employment_type || ''}
                                                onChange={e => setEditingInterviewTemplate({ ...editingInterviewTemplate, employment_type: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white"
                                            >
                                                <option value="">{isVI ? '-- Tất cả --' : '-- All Types --'}</option>
                                                <option value="full_time">{isVI ? 'Toàn thời gian (Full-time)' : 'Full-time'}</option>
                                                <option value="part_time">{isVI ? 'Bán thời gian (Part-time)' : 'Part-time'}</option>
                                                <option value="intern">{isVI ? 'Thực tập sinh (Intern)' : 'Intern'}</option>
                                                <option value="casual">{isVI ? 'Thời vụ (Casual)' : 'Casual'}</option>
                                                <option value="temporary">{isVI ? 'Tạm thời (Temporary)' : 'Temporary'}</option>
                                            </select>
                                        </div>
                                        <div className="flex items-center pt-5">
                                            <label className="inline-flex items-center gap-2 cursor-pointer font-bold text-sm text-slate-700">
                                                <input
                                                    type="checkbox"
                                                    checked={editingInterviewTemplate.is_default || false}
                                                    onChange={e => setEditingInterviewTemplate({ ...editingInterviewTemplate, is_default: e.target.checked })}
                                                    className="w-4.5 h-4.5 rounded border-gray-300 text-blue-650 focus:ring-blue-500"
                                                />
                                                {isVI ? 'Đặt làm mẫu câu hỏi mặc định' : 'Set as Default Questionnaire Template'}
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* Section Tabs Header */}
                                <div className="border-b border-slate-150 pb-px flex items-center justify-between shrink-0 mb-4">
                                    <div className="flex gap-4 overflow-x-auto scrollbar-thin">
                                        {editingInterviewTemplate.sections.map((section, sidx) => {
                                            const cleanNameEn = section.name_en.replace(/^\d+\.\s*/, '')
                                            const cleanNameVi = section.name_vi.replace(/^\d+\.\s*/, '')
                                            const displayName = isVI
                                                ? (cleanNameVi || `Thẻ ${sidx + 1}`)
                                                : (cleanNameEn || `Section ${sidx + 1}`)
                                            const isActive = activeSectionTabIdx === sidx
                                            return (
                                                <button
                                                    key={section.id}
                                                    type="button"
                                                    onClick={() => setActiveSectionTabIdx(sidx)}
                                                    className={`py-2 px-1 text-xs font-bold transition cursor-pointer border-b-2 -mb-px outline-none whitespace-nowrap ${
                                                        isActive
                                                            ? 'border-blue-655 text-blue-655 font-bold'
                                                            : 'border-transparent text-slate-455 hover:text-slate-700'
                                                    }`}
                                                >
                                                    {sidx + 1}. {displayName}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={addInterviewSection}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition cursor-pointer shrink-0 ml-4 mb-2"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        {isVI ? 'Thêm Thẻ (Card)' : 'Add Section (Card)'}
                                    </button>
                                </div>

                                {/* Active Section Content */}
                                <div className="space-y-5 flex-1 overflow-y-auto min-h-0 pr-1">
                                    {editingInterviewTemplate.sections.length > 0 ? (() => {
                                        const sidx = activeSectionTabIdx >= editingInterviewTemplate.sections.length 
                                            ? editingInterviewTemplate.sections.length - 1 
                                            : activeSectionTabIdx
                                        if (sidx < 0) return null
                                        const section = editingInterviewTemplate.sections[sidx]
                                        if (!section) return null
                                        return (
                                            <div key={section.id} className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-5 animate-in fade-in duration-200 text-left">
                                                {/* Section Header Controls */}
                                                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                        {isVI ? `Chi tiết Thẻ ${sidx + 1}` : `Section ${sidx + 1} Details`}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            disabled={sidx === 0}
                                                            onClick={() => moveInterviewSection(sidx, 'up')}
                                                            className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 disabled:opacity-30 cursor-pointer shadow-sm flex items-center justify-center"
                                                            title={isVI ? 'Di chuyển sang trái' : 'Move Left'}
                                                        >
                                                            <ChevronLeft className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={sidx === editingInterviewTemplate.sections.length - 1}
                                                            onClick={() => moveInterviewSection(sidx, 'down')}
                                                            className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 disabled:opacity-30 cursor-pointer shadow-sm flex items-center justify-center"
                                                            title={isVI ? 'Di chuyển sang phải' : 'Move Right'}
                                                        >
                                                            <ChevronRight className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeInterviewSection(sidx)}
                                                            className="p-1.5 rounded-lg bg-white border border-red-200 hover:bg-red-50 text-red-500 hover:text-red-750 cursor-pointer shadow-sm ml-1 flex items-center justify-center"
                                                            title={isVI ? 'Xóa thẻ' : 'Delete Section'}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Section Title Fields */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">{isVI ? 'Tên thẻ (EN)' : 'Section Name (EN)'}</label>
                                                        <input
                                                            type="text"
                                                            value={section.name_en}
                                                            onChange={e => updateInterviewSectionName(sidx, e.target.value, 'en')}
                                                            placeholder="e.g. Background & Motivation"
                                                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-9 bg-white"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">{isVI ? 'Tên thẻ (VI)' : 'Section Name (VI)'}</label>
                                                        <input
                                                            type="text"
                                                            value={section.name_vi}
                                                            onChange={e => updateInterviewSectionName(sidx, e.target.value, 'vi')}
                                                            placeholder="Ví dụ: Động lực & Lý lịch"
                                                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-9 bg-white"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Section Questions */}
                                                <div className="space-y-3 pt-3 border-t border-slate-200">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{isVI ? 'Danh sách câu hỏi' : 'Questions List'}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => addInterviewQuestion(sidx)}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-100 text-blue-650 font-bold border border-slate-200 rounded-lg text-xs transition cursor-pointer shadow-sm"
                                                        >
                                                            <Plus className="w-3.5 h-3.5" />
                                                            {isVI ? 'Thêm câu hỏi' : 'Add Question'}
                                                        </button>
                                                    </div>

                                                    <div className="space-y-3 pl-2 border-l-2 border-slate-200 text-left">
                                                        {section.questions.map((q, qidx) => (
                                                            <div 
                                                                key={q.id}
                                                                draggable
                                                                onDragStart={(e) => handleQuestionDragStart(e, qidx)}
                                                                onDragOver={(e) => handleQuestionDragOver(e, qidx)}
                                                                onDragEnd={handleQuestionDragEnd}
                                                                onDrop={(e) => handleQuestionDrop(e, sidx, qidx)}
                                                                className={`bg-white border border-slate-150 p-4 rounded-xl shadow-sm relative pl-10 pr-10 space-y-3 cursor-grab active:cursor-grabbing transition-all ${draggedQuestionIdx === qidx ? 'opacity-40 bg-blue-50/20' : ''}`}
                                                            >
                                                                {/* Drag Handle */}
                                                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-350">
                                                                    <GripVertical className="w-4 h-4 cursor-grab active:cursor-grabbing" />
                                                                </div>

                                                                {/* Delete Control */}
                                                                <div className="absolute top-4 right-4">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeInterviewQuestion(sidx, qidx)}
                                                                        className="p-1 rounded hover:bg-red-50 text-red-500 hover:text-red-700 cursor-pointer transition-colors shadow-none"
                                                                        title={isVI ? 'Xóa' : 'Delete'}
                                                                    >
                                                                        <X className="w-4 h-4" />
                                                                    </button>
                                                                </div>

                                                                {/* Question Inputs */}
                                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                                    <div className="md:col-span-2 space-y-2.5 text-left">
                                                                        <div>
                                                                            <label className="block text-[10px] font-bold text-slate-400 mb-0.5 uppercase tracking-wider">{isVI ? 'Câu hỏi EN' : 'Question EN'}</label>
                                                                            <input
                                                                                type="text"
                                                                                value={q.text_en}
                                                                                onChange={e => updateInterviewQuestionProp(sidx, qidx, 'text_en', e.target.value)}
                                                                                placeholder="e.g. What attracts you most about this position?"
                                                                                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none font-semibold h-8 bg-white"
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] font-bold text-slate-400 mb-0.5 uppercase tracking-wider">{isVI ? 'Câu hỏi VI' : 'Question VI'}</label>
                                                                            <input
                                                                                type="text"
                                                                                value={q.text_vi}
                                                                                onChange={e => updateInterviewQuestionProp(sidx, qidx, 'text_vi', e.target.value)}
                                                                                placeholder="Ví dụ: Điều gì thu hút bạn ở công việc này?"
                                                                                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none font-semibold h-8 bg-white"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-left">
                                                                        <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">{isVI ? 'Loại phản hồi' : 'Response Type'}</label>
                                                                        <select
                                                                            value={q.type}
                                                                            onChange={e => updateInterviewQuestionProp(sidx, qidx, 'type', e.target.value)}
                                                                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none font-semibold h-8 bg-white"
                                                                        >
                                                                            <option value="text">{isVI ? 'Câu trả lời mở (Văn bản)' : 'Open response (Text)'}</option>
                                                                            <option value="yes_no">{isVI ? 'Có / Không' : 'Yes / No'}</option>
                                                                        </select>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {section.questions.length === 0 && (
                                                            <div className="text-center py-4 text-xs text-gray-400 italic bg-white rounded-lg border border-dashed border-gray-200">
                                                                {isVI ? 'Chưa có câu hỏi nào trong nhóm này.' : 'No questions in this section.'}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })() : (
                                        <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs italic bg-slate-50">
                                            {isVI ? 'Chưa có thẻ câu hỏi nào. Cần thêm ít nhất một thẻ.' : 'No sections configured. Add at least one section.'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-gray-150 shrink-0">
                                <button onClick={cancelEditInterviewTemplate} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 transition cursor-pointer">
                                    {isVI ? 'Hủy' : 'Cancel'}
                                </button>
                                <button
                                    onClick={saveInterviewTemplate}
                                    disabled={saving || !editingInterviewTemplate.name.trim() || editingInterviewTemplate.sections.length === 0}
                                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition shadow disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    {saving ? (isVI ? 'Đang lưu...' : 'Saving...') : (isVI ? 'Lưu' : 'Save')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Package Manager Modal */}
                {selectedPlatformForPackages && (
                    <PackageManagerModal
                        platformValue={selectedPlatformForPackages.value}
                        platformLabel={selectedPlatformForPackages.label}
                        onClose={() => setSelectedPlatformForPackages(null)}
                    />
                )}
            </div>
        </div>
    )
}
