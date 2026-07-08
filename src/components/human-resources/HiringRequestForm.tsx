'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase_shim'
import { HiringRequest, HiringRequestPriority, RecruitmentJobTemplate } from '@/types/human-resources'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import { Bold, Italic, List, Copy, Check, Save, FolderOpen, X, Trash2 } from 'lucide-react'

// Helper for currency formatting (1,000,000)
const formatCurrency = (value: string | number) => {
    if (!value) return ''
    const cleanValue = String(value).replace(/\D/g, '')
    return cleanValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// Helper to parse currency back to number
const parseCurrency = (value: string) => {
    if (!value) return null
    return parseFloat(value.replace(/,/g, ''))
}

interface HiringRequestFormProps {
    initialData?: HiringRequest
}

const formDict = {
    en: {
        sectionGeneral: 'General Information',
        sectionBranches: 'Target Branches',
        sectionCompensation: 'Salary & Terms',
        sectionDetails: 'Job Specifications',
        positionTitle: 'Position Title',
        department: 'Department',
        selectDepartment: 'Select Department',
        selectPosition: 'Select Position',
        selectDeptFirst: 'Please select a department first',
        branches: 'Branches',
        minBranchError: 'Please select at least one branch',
        headcount: 'Headcount',
        priority: 'Priority',
        minSalary: 'Min Salary (optional)',
        maxSalary: 'Max Salary',
        jobDescription: 'Job Description & Specifications',
        cancel: 'Cancel',
        saving: 'Saving...',
        updateRequest: 'Update Request',
        createDraft: 'Create Draft',
        failedSave: 'Failed to save request. Please try again.',
        deptKitchen: 'Kitchen',
        deptService: 'Service',
        deptBar: 'Bar',
        deptManagement: 'Management',
        deptCleaning: 'Cleaning',
        deptOther: 'Other / Custom',
        priorityLow: 'Low',
        priorityMedium: 'Medium',
        priorityHigh: 'High',
        priorityUrgent: 'Urgent',
        notes: 'Notes',
        employmentType: 'Employment Type',
        typeFullTime: 'Full-time',
        typePartTime: 'Part-time'
    },
    vi: {
        sectionGeneral: 'Thông tin chung',
        sectionBranches: 'Chi nhánh áp dụng',
        sectionCompensation: 'Lương & Chế độ',
        sectionDetails: 'Chi tiết công việc',
        positionTitle: 'Tiêu đề vị trí',
        department: 'Bộ phận',
        selectDepartment: 'Chọn bộ phận',
        selectPosition: 'Chọn vị trí',
        selectDeptFirst: 'Vui lòng chọn bộ phận trước',
        branches: 'Chi nhánh',
        minBranchError: 'Vui lòng chọn ít nhất một chi nhánh',
        headcount: 'Số lượng tuyển',
        priority: 'Độ ưu tiên',
        minSalary: 'Lương tối thiểu (tùy chọn)',
        maxSalary: 'Lương tối đa',
        jobDescription: 'Mô tả & Chi tiết công việc',
        cancel: 'Hủy',
        saving: 'Đang lưu...',
        updateRequest: 'Cập nhật yêu cầu',
        createDraft: 'Tạo bản nháp',
        failedSave: 'Lưu yêu cầu thất bại. Vui lòng thử lại.',
        deptKitchen: 'Bếp',
        deptService: 'Phục vụ',
        deptBar: 'Quầy bar',
        deptManagement: 'Quản lý',
        deptCleaning: 'Dọn dẹp',
        deptOther: 'Khác / Tùy chỉnh',
        priorityLow: 'Thấp',
        priorityMedium: 'Trung bình',
        priorityHigh: 'Cao',
        priorityUrgent: 'Khẩn cấp',
        notes: 'Ghi chú',
        employmentType: 'Loại hình làm việc',
        typeFullTime: 'Toàn thời gian',
        typePartTime: 'Bán thời gian'
    }
}

export function HiringRequestForm({ initialData }: HiringRequestFormProps) {
    const router = useRouter()
    const { language } = useSettings()
    const lang = language === 'vi' ? 'vi' : 'en'

    const t = (key: keyof typeof formDict['en']) => {
        return formDict[lang][key] || formDict['en'][key] || key
    }

    const [submitting, setSubmitting] = useState(false)
    const [branches, setBranches] = useState<{ id: string, name: string, is_active?: boolean }[]>([])
    const [dbDepartments, setDbDepartments] = useState<{ id: string, name: string }[]>([])
    const [dbPositions, setDbPositions] = useState<{ id: string, name: string, department_id: string }[]>([])
    const [loadingData, setLoadingData] = useState(true)
    const [selectedDeptId, setSelectedDeptId] = useState<string>('')
    
    // Copy/Rich Text Editor ref and states
    const editorRef = useRef<HTMLDivElement>(null)
    const [descriptionHtml, setDescriptionHtml] = useState(initialData?.description || '')
    const [copied, setCopied] = useState(false)

    // Job description templates states & handlers
    const [templates, setTemplates] = useState<RecruitmentJobTemplate[]>([])
    const [showTemplatePicker, setShowTemplatePicker] = useState(false)
    const [showSavedIndicator, setShowSavedIndicator] = useState(false)

    const fetchTemplates = async () => {
        try {
            const { data } = await supabase.from('recruitment_job_templates').select('*').order('position_title')
            if (data) setTemplates(data as RecruitmentJobTemplate[])
        } catch (err) {
            console.error('Failed to load templates', err)
        }
    }

    const loadTemplateForPosition = async (positionName: string, empType: string) => {
        if (!positionName || !empType) return
        try {
            const { data } = await supabase
                .from('recruitment_job_templates')
                .select('description')
                .eq('position_title', positionName)
                .eq('employment_type', empType)
                .maybeSingle()
            if (data && data.description) {
                setDescriptionHtml(data.description)
                if (editorRef.current) {
                    editorRef.current.innerHTML = data.description
                }
            } else {
                setDescriptionHtml('')
                if (editorRef.current) {
                    editorRef.current.innerHTML = ''
                }
            }
        } catch (err) {
            console.error('Error auto loading template:', err)
        }
    }

    const handleSaveTemplate = async () => {
        if (!formData.position_title) {
            alert(lang === 'vi' ? 'Vui lòng chọn vị trí trước khi lưu mẫu!' : 'Please select a position before saving the template!')
            return
        }
        const cleanDescription = descriptionHtml.replace(/<p><br><\/p>|<br>/g, '').trim()
        if (!cleanDescription) {
            alert(lang === 'vi' ? 'Mô tả công việc trống!' : 'Job description is empty!')
            return
        }

        try {
            const { error } = await supabase
                .from('recruitment_job_templates')
                .upsert({
                    position_title: formData.position_title,
                    department: formData.department,
                    employment_type: formData.employment_type,
                    description: descriptionHtml
                }, { onConflict: 'position_title,employment_type' })
            if (error) throw error
            setShowSavedIndicator(true)
            setTimeout(() => setShowSavedIndicator(false), 3000)
            fetchTemplates()
        } catch (err: any) {
            console.error('Failed to save template', err)
            alert(lang === 'vi' ? 'Lưu mẫu thất bại: ' + err.message : 'Failed to save template: ' + err.message)
        }
    }

    const [formData, setFormData] = useState({
        position_title: initialData?.position_title || '',
        department: initialData?.department || '',
        branch_ids: initialData?.branch_ids || [],
        headcount: initialData?.headcount || 1,
        employment_type: initialData?.employment_type || 'full_time',
        priority: (initialData?.priority || 'medium') as HiringRequestPriority,
        salary_min: formatCurrency(initialData?.salary_min || ''),
        salary_max: formatCurrency(initialData?.salary_max || ''),
        currency: initialData?.currency || 'VND',
        notes: initialData?.notes || ''
    })

    useEffect(() => {
        const loadFormDependencies = async () => {
            try {
                const [branchesRes, deptsRes, positionsRes] = await Promise.all([
                    supabase.from('provider_branches').select('id, name, is_active').order('name'),
                    supabase.from('hr_departments').select('id, name').order('sort_order'),
                    supabase.from('hr_positions').select('id, name, department_id').order('sort_order'),
                    fetchTemplates()
                ])

                if (branchesRes.data) {
                    let list = branchesRes.data.map(b => ({ id: String(b.id), name: b.name, is_active: b.is_active }))
                    
                    const { data: { user } } = await supabase.auth.getUser()
                    if (user) {
                        const { data: acc } = await supabase
                            .from('app_accounts')
                            .select('role, branches')
                            .eq('user_id', user.id)
                            .single()
                        if (acc && acc.role === 'manager') {
                            list = list.filter(b => (acc.branches || []).includes(b.id))
                        }
                    }
                    
                    setBranches(list)
                }
                if (deptsRes.data) {
                    setDbDepartments(deptsRes.data)
                }
                if (positionsRes.data) {
                    setDbPositions(positionsRes.data)
                }
            } catch (err) {
                console.error('Failed to load form dependencies', err)
            } finally {
                setLoadingData(false)
            }
        }
        loadFormDependencies()
    }, [])

    // Map initialData.department to selectedDeptId once dbDepartments is loaded
    useEffect(() => {
        if (dbDepartments.length > 0 && initialData?.department) {
            const found = dbDepartments.find(d => d.name.toLowerCase() === initialData.department.toLowerCase())
            if (found) {
                setSelectedDeptId(found.id)
            } else {
                setSelectedDeptId('other')
            }
        }
        if (editorRef.current && initialData?.description) {
            editorRef.current.innerHTML = initialData.description
        }
    }, [dbDepartments, initialData])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target

        if (name === 'salary_min' || name === 'salary_max') {
            const formatted = formatCurrency(value)
            setFormData(prev => ({ ...prev, [name]: formatted }))
        } else {
            setFormData(prev => ({ ...prev, [name]: value }))
            if (name === 'position_title' && !initialData) {
                loadTemplateForPosition(value, formData.employment_type)
            } else if (name === 'employment_type' && !initialData) {
                loadTemplateForPosition(formData.position_title, value)
            }
        }
    }

    const handleBranchToggle = (branchId: string) => {
        setFormData(prev => {
            const current = prev.branch_ids as string[]
            if (current.includes(branchId)) {
                return { ...prev, branch_ids: current.filter(id => id !== branchId) }
            } else {
                return { ...prev, branch_ids: [...current, branchId] }
            }
        })
    }

    const handleDeptSelect = (deptId: string) => {
        setSelectedDeptId(deptId)
        if (deptId === 'other') {
            setFormData(prev => ({
                ...prev,
                department: 'Other',
                position_title: ''
            }))
        } else {
            const dept = dbDepartments.find(d => d.id === deptId)
            setFormData(prev => ({
                ...prev,
                department: dept ? dept.name : '',
                position_title: ''
            }))
        }
    }

    // Format selection using native document.execCommand
    const handleFormat = (command: string) => {
        document.execCommand(command, false)
        if (editorRef.current) {
            setDescriptionHtml(editorRef.current.innerHTML)
            editorRef.current.focus()
        }
    }

    const handleInput = () => {
        if (editorRef.current) {
            setDescriptionHtml(editorRef.current.innerHTML)
        }
    }

    const handleCopy = () => {
        if (editorRef.current) {
            // Extract innerText to copy clean plain text without HTML tags for pasting to other platforms
            const plainText = editorRef.current.innerText
            navigator.clipboard.writeText(plainText)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const handleDelete = async () => {
        if (!initialData) return
        const confirmMsg = language === 'vi'
            ? `Bạn có chắc chắn muốn XÓA hoàn toàn yêu cầu tuyển dụng này? Hành động này không thể hoàn tác.`
            : `Are you sure you want to completely DELETE this hiring request? This action cannot be undone.`
        
        if (confirm(confirmMsg)) {
            setSubmitting(true)
            try {
                const { error } = await supabase
                    .from('hiring_requests')
                    .delete()
                    .eq('id', initialData.id)

                if (error) throw error

                await supabase.from('hr_activity_log').insert([{
                    hiring_request_id: null,
                    action_type: 'deleted',
                    message: `Hiring request "${initialData.position_title}" was deleted / Yêu cầu tuyển dụng "${initialData.position_title}" đã bị xóa`,
                }])

                router.push('/human-resources/recruitment')
            } catch (err) {
                console.error('Error deleting request:', err)
                alert(language === 'vi' ? 'Lỗi khi xóa yêu cầu.' : 'Failed to delete request.')
            } finally {
                setSubmitting(false)
            }
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)

        if ((formData.branch_ids as string[]).length === 0) {
            alert(t('minBranchError'))
            setSubmitting(false)
            return
        }

        // Clean up empty tag placeholders from editor
        const cleanDescription = descriptionHtml.replace(/<p><br><\/p>|<br>/g, '').trim()
        if (!cleanDescription) {
            alert(t('jobDescription'))
            setSubmitting(false)
            return
        }

        try {
            const payload = {
                ...formData,
                salary_min: parseCurrency(formData.salary_min),
                salary_max: parseCurrency(formData.salary_max),
                headcount: Number(formData.headcount),
                description: descriptionHtml, // HTML description
                requirements: null, // consolidated
                benefits: null, // consolidated
                status: initialData?.status || 'submitted'
            }

            let result

            if (initialData) {
                const { data, error } = await supabase
                    .from('hiring_requests')
                    .update(payload)
                    .eq('id', initialData.id)
                    .select()
                    .single()

                if (error) throw error
                result = data

                await supabase.from('hr_activity_log').insert([{
                    hiring_request_id: result.id,
                    action_type: 'updated',
                    message: `Hiring request "${result.position_title}" was updated / Yêu cầu tuyển dụng "${result.position_title}" đã được cập nhật`,
                }])
            } else {
                const { data, error } = await supabase
                    .from('hiring_requests')
                    .insert([payload])
                    .select()
                    .single()

                if (error) throw error
                result = data

                await supabase.from('hr_activity_log').insert([{
                    hiring_request_id: result.id,
                    action_type: 'created',
                    message: `Hiring request "${result.position_title}" was created / Yêu cầu tuyển dụng "${result.position_title}" đã được tạo`,
                }])
            }

            router.push(`/human-resources/recruitment/${result.id}`)
            router.refresh()
        } catch (error) {
            console.error('Error saving request:', error)
            alert(t('failedSave'))
        } finally {
            setSubmitting(false)
        }
    }

    if (loadingData) {
        return (
            <div className="flex justify-center py-12">
                <CircularLoader />
            </div>
        )
    }

    const selectedBranchCount = (formData.branch_ids as string[]).length
    const filteredPositions = dbPositions.filter(p => p.department_id === selectedDeptId)

    return (
        <>
            <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-2xl shadow-lg border border-gray-250/80">
            
            {/* Row 1: Department & Position Title */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Department Select */}
                <div>
                    <label htmlFor="department" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                        {t('department')}
                    </label>
                    <select
                        id="department"
                        name="department"
                        required
                        value={selectedDeptId}
                        onChange={(e) => handleDeptSelect(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900"
                    >
                        <option value="">{t('selectDepartment')}</option>
                        {dbDepartments.map((dept) => (
                            <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                        <option value="other">{t('deptOther')}</option>
                    </select>
                </div>

                {/* Position Title Select / Input */}
                <div>
                    <label htmlFor="position_title" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                        {t('positionTitle')}
                    </label>
                    
                    {selectedDeptId === 'other' ? (
                        <input
                            type="text"
                            name="position_title"
                            id="position_title"
                            required
                            placeholder="e.g. Hostess, Cleaner..."
                            value={formData.position_title}
                            onChange={handleChange}
                            className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900"
                        />
                    ) : (
                        <select
                            id="position_title"
                            name="position_title"
                            required
                            disabled={!selectedDeptId}
                            value={formData.position_title}
                            onChange={handleChange}
                            className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 disabled:bg-slate-50 disabled:text-slate-400"
                        >
                            <option value="">{!selectedDeptId ? t('selectDeptFirst') : t('selectPosition')}</option>
                            {filteredPositions.map((pos) => (
                                <option key={pos.id} value={pos.name}>{pos.name}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* Row 2: Headcount & Employment Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Headcount */}
                <div>
                    <label htmlFor="headcount" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                        {t('headcount')}
                    </label>
                    <input
                        type="number"
                        name="headcount"
                        id="headcount"
                        min="1"
                        required
                        value={formData.headcount}
                        onChange={handleChange}
                        className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900"
                    />
                </div>

                {/* Employment Type */}
                <div>
                    <label htmlFor="employment_type" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                        {t('employmentType')}
                    </label>
                    <select
                        id="employment_type"
                        name="employment_type"
                        required
                        value={formData.employment_type}
                        onChange={handleChange}
                        className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900"
                    >
                        <option value="full_time">{t('typeFullTime')}</option>
                        <option value="part_time">{t('typePartTime')}</option>
                    </select>
                </div>
            </div>

            {/* Row 3: Priority (Interactive Badge Selection) */}
            <div className="border-b border-slate-100 pb-5">
                <label className="block text-xs font-bold text-slate-500 mb-2.5 uppercase tracking-wider">
                    {t('priority')}
                </label>
                <div className="flex flex-wrap gap-2">
                    {(['low', 'medium', 'high', 'urgent'] as HiringRequestPriority[]).map((pri) => {
                        const isSelected = formData.priority === pri
                        const getColors = () => {
                            if (!isSelected) return 'bg-white border-gray-200 text-slate-600 hover:bg-slate-50'
                            switch (pri) {
                                case 'low': return 'bg-slate-600 border-slate-600 text-white shadow-sm'
                                case 'medium': return 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                case 'high': return 'bg-amber-600 border-amber-600 text-white shadow-sm'
                                case 'urgent': return 'bg-red-600 border-red-600 text-white shadow-sm'
                            }
                        }
                        const getLabel = () => {
                            switch (pri) {
                                case 'low': return t('priorityLow')
                                case 'medium': return t('priorityMedium')
                                case 'high': return t('priorityHigh')
                                case 'urgent': return t('priorityUrgent')
                            }
                        }
                        return (
                            <button
                                key={pri}
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, priority: pri }))}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${getColors()}`}
                            >
                                {getLabel()}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Row 4: Target Branches (Interactive Badge Selection) */}
            <div className="border-b border-slate-100 pb-5">
                <label className="block text-xs font-bold text-slate-500 mb-2.5 uppercase tracking-wider">
                    {t('sectionBranches')}
                </label>
                <div className="flex flex-wrap gap-2">
                    {branches
                        .filter(b => b.is_active !== false || (formData.branch_ids as string[]).includes(b.id))
                        .map((b) => {
                            const isChecked = (formData.branch_ids as string[]).includes(b.id)
                            return (
                                <button
                                    key={b.id}
                                    type="button"
                                    onClick={() => handleBranchToggle(b.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                        isChecked 
                                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm' 
                                            : 'bg-white border-gray-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    {b.name}
                                </button>
                            )
                        })}
                </div>
            </div>

            {/* Row 4: Compensation & Salary */}
            <div className="border-b border-slate-100 pb-5">
                <h3 className="text-xs font-bold text-slate-400 mb-4 tracking-wide uppercase">
                    {t('sectionCompensation')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Salary Min */}
                    <div>
                        <label htmlFor="salary_min" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                            {t('minSalary')}
                        </label>
                        <div className="relative rounded-xl shadow-sm">
                            <input
                                type="text"
                                name="salary_min"
                                id="salary_min"
                                placeholder="0"
                                value={formData.salary_min}
                                onChange={handleChange}
                                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 pr-24 text-gray-900"
                            />
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 select-none">
                                <span className="text-gray-400 text-xs font-semibold">
                                    {formData.employment_type === 'part_time'
                                        ? (lang === 'vi' ? 'VND / giờ' : 'VND / hr')
                                        : (lang === 'vi' ? 'VND / tháng' : 'VND / mo')
                                    }
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Salary Max */}
                    <div>
                        <label htmlFor="salary_max" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                            {t('maxSalary')}
                        </label>
                        <div className="relative rounded-xl shadow-sm">
                            <input
                                type="text"
                                name="salary_max"
                                id="salary_max"
                                required
                                placeholder="0"
                                value={formData.salary_max}
                                onChange={handleChange}
                                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 pr-24 text-gray-900"
                            />
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 select-none">
                                <span className="text-gray-400 text-xs font-semibold">
                                    {formData.employment_type === 'part_time'
                                        ? (lang === 'vi' ? 'VND / giờ' : 'VND / hr')
                                        : (lang === 'vi' ? 'VND / tháng' : 'VND / mo')
                                    }
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Row 5: Descriptions and Details (Stacked with Spacing) */}
            <div className="space-y-6">
                {/* Job Description (Visual Rich Text Editor based on contenteditable) */}
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                        {t('jobDescription')}
                    </label>
                    
                    {/* Formatting Toolbar */}
                    <div className="flex items-center justify-between border border-gray-300 border-b-0 bg-slate-50 px-3 py-1.5 rounded-t-xl gap-2 select-none">
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => handleFormat('bold')}
                                onMouseDown={(e) => e.preventDefault()}
                                title="Bold"
                                className="p-1.5 rounded hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                            >
                                <Bold className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleFormat('italic')}
                                onMouseDown={(e) => e.preventDefault()}
                                title="Italic"
                                className="p-1.5 rounded hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                            >
                                <Italic className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleFormat('insertUnorderedList')}
                                onMouseDown={(e) => e.preventDefault()}
                                title="Bulleted List"
                                className="p-1.5 rounded hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                            >
                                <List className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                            {showSavedIndicator && (
                                <span className="text-xs font-bold text-green-600 mr-1.5 transition-all animate-fade-in select-none">
                                    {lang === 'vi' ? 'Đã lưu!' : 'Saved!'}
                                </span>
                            )}
                            {/* Copy button */}
                            <button
                                type="button"
                                onClick={handleCopy}
                                onMouseDown={(e) => e.preventDefault()}
                                title={copied ? (lang === 'vi' ? 'Đã sao chép!' : 'Copied!') : (lang === 'vi' ? 'Sao chép' : 'Copy')}
                                className={`p-1.5 rounded transition cursor-pointer border ${
                                    copied 
                                        ? 'bg-green-50 text-green-700 border-green-200' 
                                        : 'bg-white hover:bg-slate-100 text-slate-600 border-gray-200 shadow-sm'
                                }`}
                            >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>

                            {/* Load Template */}
                            <button
                                type="button"
                                onClick={() => setShowTemplatePicker(true)}
                                onMouseDown={(e) => e.preventDefault()}
                                title={lang === 'vi' ? 'Nạp mẫu' : 'Load Template'}
                                className="p-1.5 rounded bg-white hover:bg-slate-100 text-slate-600 border border-gray-200 shadow-sm transition cursor-pointer"
                            >
                                <FolderOpen className="w-4 h-4" />
                            </button>

                            {/* Save Template */}
                            <button
                                type="button"
                                onClick={handleSaveTemplate}
                                onMouseDown={(e) => e.preventDefault()}
                                title={lang === 'vi' ? 'Lưu thành mẫu' : 'Save as Template'}
                                className="p-1.5 rounded bg-white hover:bg-slate-100 text-slate-600 border border-gray-200 shadow-sm transition cursor-pointer"
                            >
                                <Save className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Contenteditable Rich Text Editor Area */}
                    <div
                        id="description-editor"
                        ref={editorRef}
                        contentEditable={true}
                        onInput={handleInput}
                        className="w-full min-h-[220px] max-h-[450px] overflow-y-auto px-4 py-3 rounded-b-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-gray-900 border-t-0 outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_li]:list-item"
                        style={{ whiteSpace: 'pre-wrap' }}
                    />
                </div>

                {/* Notes (Optional) */}
                <div>
                    <label htmlFor="notes" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                        {t('notes')}
                    </label>
                    <textarea
                        id="notes"
                        name="notes"
                        rows={2}
                        value={formData.notes}
                        onChange={handleChange}
                        className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-gray-900"
                    />
                </div>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center justify-between pt-5 border-t border-slate-150">
                <div>
                    {initialData && (
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={handleDelete}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100 transition shadow hover:shadow-md disabled:opacity-50 cursor-pointer"
                        >
                            <Trash2 className="w-4 h-4" />
                            {language === 'vi' ? 'Xóa yêu cầu' : 'Delete Request'}
                        </button>
                    )}
                </div>
                <div className="flex items-center">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="px-5 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm cursor-pointer"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="ml-3 inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition shadow hover:shadow-md disabled:opacity-50 cursor-pointer"
                    >
                        {submitting ? t('saving') : (initialData ? t('updateRequest') : t('createDraft'))}
                    </button>
                </div>
            </div>
        </form>

        {showTemplatePicker && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowTemplatePicker(false)}>
                <div className="bg-white rounded-2xl border border-gray-250 shadow-2xl w-full max-w-lg p-6 text-gray-900" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                        <h3 className="text-lg font-bold text-gray-900">
                            {lang === 'vi' ? 'Chọn Mẫu Mô Tả Công Việc' : 'Select Job Description Template'}
                        </h3>
                        <button onClick={() => setShowTemplatePicker(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors cursor-pointer">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="max-h-[350px] overflow-y-auto space-y-2">
                        {templates.map(tmpl => (
                            <button
                                key={tmpl.id}
                                type="button"
                                onClick={() => {
                                    setDescriptionHtml(tmpl.description)
                                    if (editorRef.current) {
                                        editorRef.current.innerHTML = tmpl.description
                                    }
                                    const dept = dbDepartments.find(d => d.name.toLowerCase() === tmpl.department.toLowerCase())
                                    if (dept) {
                                        setSelectedDeptId(dept.id)
                                    } else {
                                        setSelectedDeptId('other')
                                    }
                                    setFormData(prev => ({
                                        ...prev,
                                        department: tmpl.department,
                                        position_title: tmpl.position_title,
                                        employment_type: tmpl.employment_type || 'full_time'
                                    }))
                                    setShowTemplatePicker(false)
                                }}
                                className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition cursor-pointer flex flex-col gap-1"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-sm text-slate-800">{tmpl.position_title}</span>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                            tmpl.employment_type === 'part_time'
                                                ? 'bg-purple-50 text-purple-700 border-purple-200/50'
                                                : 'bg-blue-50 text-blue-700 border-blue-200/50'
                                        }`}>
                                            {tmpl.employment_type === 'part_time'
                                                ? (lang === 'vi' ? 'Bán TG' : 'PT')
                                                : (lang === 'vi' ? 'Toàn TG' : 'FT')
                                            }
                                        </span>
                                    </div>
                                    <span className="text-xs bg-slate-100 text-slate-650 px-2 py-0.5 rounded-md font-medium">{tmpl.department}</span>
                                </div>
                                <div className="text-xs text-slate-400 line-clamp-2" dangerouslySetInnerHTML={{ __html: tmpl.description }} />
                            </button>
                        ))}
                        {templates.length === 0 && (
                            <div className="text-center py-8 text-gray-400 text-sm">
                                {lang === 'vi' ? 'Chưa có mẫu nào được lưu.' : 'No templates saved.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>
    )
}
