import { useState, useEffect, Fragment } from 'react'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { XMarkIcon, PaperClipIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import { HiringRequest, RecruitmentPosting, Candidate } from '@/types/human-resources'
import { useSettings } from '@/contexts/SettingsContext'
import { CandidateWorkflowModal } from './CandidateWorkflowModal'

interface AddCandidateModalProps {
    hiringRequest: HiringRequest | null
    candidateToEdit?: Candidate | null
    onClose: () => void
    onSuccess: () => void
}

export function AddCandidateModal({ hiringRequest, candidateToEdit = null, onClose, onSuccess }: AddCandidateModalProps) {
    const { language } = useSettings()
    const isVI = language === 'vi'
    const [submitting, setSubmitting] = useState(false)
    const [lastName, setLastName] = useState('')
    const [middleName, setMiddleName] = useState('')
    const [firstName, setFirstName] = useState('')
    const [formData, setFormData] = useState({
        email: '',
        phone: '',
        document_type: 'id_card',
        document_number: '',
        source: 'Referral',
        notes: '',
        gender: '',
        address: '',
        city: '',
        date_of_birth: ''
    })
    const [onlyYear, setOnlyYear] = useState(false)
    const [birthYear, setBirthYear] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [currentCvUrl, setCurrentCvUrl] = useState<string | null>(null)
    const [shouldRemoveCv, setShouldRemoveCv] = useState(false)
    const [postings, setPostings] = useState<RecruitmentPosting[]>([])
    const [selectedPostingId, setSelectedPostingId] = useState<string>('')
    const [activeRequests, setActiveRequests] = useState<HiringRequest[]>([])
    const [selectedRequestId, setSelectedRequestId] = useState<string>('')
    const [branches, setBranches] = useState<any[]>([])

    // Duplicate check states
    const [duplicateCandidate, setDuplicateCandidate] = useState<any>(null)
    const [duplicateStaff, setDuplicateStaff] = useState<any>(null)
    const [isNotEligible, setIsNotEligible] = useState(false)
    const [checkingDuplicates, setCheckingDuplicates] = useState(false)
    const [openWorkflowId, setOpenWorkflowId] = useState<string | null>(null)

    const getBranchInitials = (branchIds: string[] | undefined | null) => {
        if (!branchIds || branchIds.length === 0) return ''
        const initialsList = branchIds
            .map(id => branches.find(b => String(b.id) === String(id))?.initials)
            .filter(Boolean)
        if (initialsList.length === 0) return ''
        return initialsList.join(', ')
    }

    useEffect(() => {
        if (candidateToEdit) {
            // Split full name
            const parts = (candidateToEdit.full_name || '').split(' ').filter(Boolean)
            if (parts.length === 1) {
                setLastName(parts[0])
                setMiddleName('')
                setFirstName('')
            } else if (parts.length === 2) {
                setLastName(parts[0])
                setMiddleName('')
                setFirstName(parts[1])
            } else if (parts.length > 2) {
                const firstWordLower = parts[0].toLowerCase()
                const westernLastNamePrefixes = ['di', 'de', 'da', 'la', 'lo', 'della', 'dalla', 'del', 'du', 'van', 'von', 'le']
                if (westernLastNamePrefixes.includes(firstWordLower)) {
                    setLastName(parts.slice(0, 2).join(' '))
                    setFirstName(parts[parts.length - 1])
                    setMiddleName(parts.slice(2, parts.length - 1).join(' '))
                } else {
                    setLastName(parts[0])
                    setFirstName(parts[parts.length - 1])
                    setMiddleName(parts.slice(1, parts.length - 1).join(' '))
                }
            }

            setFormData({
                email: candidateToEdit.email || '',
                phone: candidateToEdit.phone || '',
                document_type: candidateToEdit.document_type || 'id_card',
                document_number: candidateToEdit.document_number || '',
                source: candidateToEdit.source || 'Referral',
                notes: candidateToEdit.notes || '',
                gender: candidateToEdit.gender || '',
                address: candidateToEdit.address || '',
                city: candidateToEdit.city || '',
                date_of_birth: candidateToEdit.date_of_birth || ''
            })
            const dob = candidateToEdit.date_of_birth || ''
            if (dob && dob.endsWith('-01-01')) {
                setOnlyYear(true)
                setBirthYear(dob.substring(0, 4))
            } else {
                setOnlyYear(false)
                setBirthYear('')
            }
            setSelectedPostingId(candidateToEdit.recruitment_posting_id || '')
            setSelectedRequestId(candidateToEdit.hiring_request_id || '')
            setCurrentCvUrl(candidateToEdit.cv_url || null)
            setShouldRemoveCv(false)
        } else {
            setLastName('')
            setMiddleName('')
            setFirstName('')
            setFormData({
                email: '',
                phone: '',
                document_type: 'id_card',
                document_number: '',
                source: 'Referral',
                notes: '',
                gender: '',
                address: '',
                city: '',
                date_of_birth: ''
            })
            setOnlyYear(false)
            setBirthYear('')
            setSelectedPostingId('')
            setSelectedRequestId('')
            setCurrentCvUrl(null)
            setShouldRemoveCv(false)
        }
        setDuplicateCandidate(null)
        setDuplicateStaff(null)
    }, [candidateToEdit])

    useEffect(() => {
        const fetchActivePostings = async () => {
            const hrId = hiringRequest ? hiringRequest.id : selectedRequestId
            if (!hrId) {
                setPostings([])
                return
            }
            try {
                const { data, error } = await supabase
                    .from('recruitment_postings')
                    .select('*')
                    .eq('hiring_request_id', hrId)
                    .eq('status', 'active')

                if (error) throw error

                // Filter out expired postings client-side
                const active = (data || []).filter((p: any) => {
                    if (!p.expires_at) return true
                    return new Date(p.expires_at) > new Date()
                })
                setPostings(active)
            } catch (error) {
                console.error('Error fetching postings in AddCandidate:', error)
            }
        }
        fetchActivePostings()
    }, [hiringRequest?.id, selectedRequestId])

    useEffect(() => {
        if (!hiringRequest) {
            const fetchRequests = async () => {
                const { data } = await supabase
                    .from('hiring_requests')
                    .select('id, position_title, department, status, branch_ids')
                    .neq('status', 'closed')
                    .order('position_title')
                if (data) {
                    setActiveRequests(data as HiringRequest[])
                }
            }
            fetchRequests()
        }
    }, [hiringRequest])

    useEffect(() => {
        const fetchBranches = async () => {
            const { data } = await supabase
                .from('provider_branches')
                .select('id, name, city, initials')
            if (data) setBranches(data)
        }
        fetchBranches()
    }, [])

    useEffect(() => {
        const checkContactDuplicates = async () => {
            const phoneVal = formData.phone.trim()
            const emailVal = formData.email.trim()
            const docNumVal = formData.document_number?.trim()

            if (!phoneVal && !emailVal && !docNumVal) {
                setDuplicateCandidate(null)
                setDuplicateStaff(null)
                return
            }

            setCheckingDuplicates(true)
            setIsNotEligible(false)
            try {
                // 1. Check candidates table
                let candidateQuery = supabase.from('candidates').select('id, full_name, stage, phone, email, document_number, rehire_eligible')
                
                let orParts: string[] = []
                if (phoneVal) orParts.push(`phone.eq."${phoneVal}"`)
                if (emailVal) orParts.push(`email.ilike."${emailVal}"`)
                if (docNumVal) orParts.push(`document_number.eq."${docNumVal}"`)
                
                if (orParts.length > 0) {
                    const { data: candData, error: candErr } = await candidateQuery.or(orParts.join(','))
                    if (!candErr && candData && candData.length > 0) {
                        const blockedCand = candData.find(c => c.rehire_eligible === false)
                        if (blockedCand) {
                            setIsNotEligible(true)
                        }
                        const filtered = candData.filter(c => !candidateToEdit || c.id !== candidateToEdit.id)
                        if (filtered.length > 0) {
                            setDuplicateCandidate(filtered[0])
                        } else {
                            setDuplicateCandidate(null)
                        }
                    } else {
                        setDuplicateCandidate(null)
                    }
                } else {
                    setDuplicateCandidate(null)
                }

                // 2. Check hr_staff table
                let staffQuery = supabase.from('hr_staff').select('id, full_name, status, phone, email, document_number, rehire_eligible')
                let staffOrParts: string[] = []
                if (phoneVal) staffOrParts.push(`phone.eq."${phoneVal}"`)
                if (emailVal) staffOrParts.push(`email.ilike."${emailVal}"`)
                if (docNumVal) staffOrParts.push(`document_number.eq."${docNumVal}"`)

                if (staffOrParts.length > 0) {
                    const { data: staffData, error: staffErr } = await staffQuery.or(staffOrParts.join(','))
                    if (!staffErr && staffData && staffData.length > 0) {
                        const blockedStaff = staffData.find(s => s.rehire_eligible === false)
                        if (blockedStaff) {
                            setIsNotEligible(true)
                        }
                        setDuplicateStaff(staffData[0])
                    } else {
                        setDuplicateStaff(null)
                    }
                } else {
                    setDuplicateStaff(null)
                }
            } catch (err) {
                console.error('Error checking contact duplicates:', err)
            } finally {
                setCheckingDuplicates(false)
            }
        }

        const delayDebounce = setTimeout(() => {
            checkContactDuplicates()
        }, 500)

        return () => clearTimeout(delayDebounce)
    }, [formData.phone, formData.email, formData.document_number, candidateToEdit])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
            setShouldRemoveCv(false)
        }
    }

    const handleRemoveCurrentCv = () => {
        setShouldRemoveCv(true)
        setCurrentCvUrl(null)
        setFile(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isNotEligible) {
            alert(language === 'vi' 
                ? 'Không thể lưu ứng viên: Người này đã được đánh dấu là Không đủ điều kiện tuyển dụng lại.' 
                : 'Cannot save candidate: This person has been marked as Not Eligible for rehire.')
            return
        }
        setSubmitting(true)

        try {
            let cv_url = candidateToEdit ? candidateToEdit.cv_url : null

            if (shouldRemoveCv) {
                cv_url = null
            }

            if (file) {
                const fileExt = file.name.split('.').pop()
                const folderId = hiringRequest ? hiringRequest.id : (selectedRequestId || 'global')
                const fileName = `${folderId}/${Math.random().toString(36).substring(2)}.${fileExt}`
                const filePath = `${fileName}`

                const { error: uploadError } = await supabase.storage
                    .from('hr-documents')
                    .upload(filePath, file)

                if (uploadError) {
                    console.error('Upload Error:', uploadError)
                    throw new Error('Failed to upload CV: ' + uploadError.message)
                }

                const { data: urlData } = supabase.storage
                    .from('hr-documents')
                    .getPublicUrl(filePath)

                cv_url = urlData.publicUrl
            }

            const buildFullName = [lastName.trim(), middleName.trim(), firstName.trim()]
                .filter(Boolean)
                .join(' ')

            let dobValue: string | null = null
            if (onlyYear) {
                if (birthYear && birthYear.trim()) {
                    dobValue = `${birthYear.trim()}-01-01`
                }
            } else {
                dobValue = formData.date_of_birth || null
            }

            if (candidateToEdit) {
                const { error } = await supabase
                    .from('candidates')
                    .update({
                        hiring_request_id: hiringRequest ? hiringRequest.id : (selectedRequestId || null),
                        recruitment_posting_id: selectedPostingId || null,
                        full_name: buildFullName,
                        email: formData.email || null,
                        phone: formData.phone || null,
                        document_type: formData.document_type || null,
                        document_number: formData.document_number || null,
                        related_staff_id: duplicateStaff ? duplicateStaff.id : (candidateToEdit.related_staff_id || null),
                        source: formData.source,
                        notes: formData.notes || null,
                        cv_url: cv_url,
                        gender: formData.gender || null,
                        address: formData.address || null,
                        city: formData.city || null,
                        date_of_birth: dobValue,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', candidateToEdit.id)

                if (error) throw error

                // Log Activity
                const activityMessage = `Updated candidate ${buildFullName} details / Đã cập nhật thông tin ứng viên ${buildFullName}`

                await supabase.from('hr_activity_log').insert([{
                    hiring_request_id: hiringRequest ? hiringRequest.id : (selectedRequestId || null),
                    action_type: 'candidate_updated',
                    message: activityMessage
                }])
            } else {
                const { error } = await supabase
                    .from('candidates')
                    .insert([{
                        hiring_request_id: hiringRequest ? hiringRequest.id : (selectedRequestId || null),
                        recruitment_posting_id: selectedPostingId || null,
                        full_name: buildFullName,
                        email: formData.email || null,
                        phone: formData.phone || null,
                        document_type: formData.document_type || null,
                        document_number: formData.document_number || null,
                        related_staff_id: duplicateStaff ? duplicateStaff.id : null,
                        source: formData.source,
                        notes: formData.notes || null,
                        cv_url: cv_url,
                        gender: formData.gender || null,
                        address: formData.address || null,
                        city: formData.city || null,
                        date_of_birth: dobValue,
                        stage: 'new'
                    }])

                if (error) throw error

                // Log Activity
                const activityMessage = `Added candidate ${buildFullName} from ${formData.source} / Đã thêm ứng viên ${buildFullName} từ ${formData.source}`

                await supabase.from('hr_activity_log').insert([{
                    hiring_request_id: hiringRequest ? hiringRequest.id : (selectedRequestId || null),
                    action_type: 'candidate_added',
                    message: activityMessage
                }])
            }

            onSuccess()
            onClose()
        } catch (error: any) {
            console.error('Error saving candidate:', error)
            alert(error.message || 'Failed to save candidate')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Transition appear show={true} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" />
                </TransitionChild>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <DialogPanel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl border border-gray-100 transition-all text-gray-900">
                                <div className="flex items-center justify-between mb-5 pb-3 border-b border-gray-100">
                                    <DialogTitle as="h3" className="text-lg font-bold text-slate-800">
                                        {candidateToEdit ? (isVI ? 'Cập nhật thông tin ứng viên' : 'Edit Candidate Details') : (isVI ? 'Thêm ứng viên' : 'Add Candidate')}
                                    </DialogTitle>
                                    <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 transition cursor-pointer">
                                        <XMarkIcon className="h-5 w-5 text-slate-400" />
                                    </button>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-5">
                                    {/* Hiring Request Selector (only when global/null) */}
                                    {!hiringRequest && (
                                        <div>
                                            <label htmlFor="hiring_request_select" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {isVI ? 'Yêu cầu tuyển dụng / Vị trí' : 'Hiring Request / Position'}
                                            </label>
                                            <select
                                                id="hiring_request_select"
                                                value={selectedRequestId}
                                                onChange={e => {
                                                    const val = e.target.value
                                                    setSelectedRequestId(val)
                                                    if (!val) {
                                                        setFormData(prev => ({ ...prev, source: 'Other' }))
                                                    }
                                                }}
                                                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-semibold cursor-pointer"
                                            >
                                                <option value="">{isVI ? 'Ứng tuyển tự do' : 'Spontaneous Application'}</option>
                                                {activeRequests.map(req => {
                                                    const initials = getBranchInitials(req.branch_ids)
                                                    return (
                                                        <option key={req.id} value={req.id}>
                                                            {req.position_title} ({req.department}) {initials ? `-[${initials}]` : ''}
                                                        </option>
                                                    )
                                                })}
                                            </select>
                                        </div>
                                    )}

                                    {/* Row 1: Name Parts */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div>
                                            <label htmlFor="last_name" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {isVI ? 'Họ' : 'Last Name'} <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                id="last_name"
                                                required
                                                value={lastName}
                                                onChange={e => setLastName(e.target.value)}
                                                placeholder={isVI ? 'Họ' : 'Last Name'}
                                                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-semibold"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="middle_name" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {isVI ? 'Tên đệm' : 'Middle Name'}
                                            </label>
                                            <input
                                                type="text"
                                                id="middle_name"
                                                value={middleName}
                                                onChange={e => setMiddleName(e.target.value)}
                                                placeholder={isVI ? 'Tên đệm' : 'Middle Name'}
                                                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-semibold"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="first_name" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {isVI ? 'Tên' : 'First Name'} <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                id="first_name"
                                                required
                                                value={firstName}
                                                onChange={e => setFirstName(e.target.value)}
                                                placeholder={isVI ? 'Tên' : 'First Name'}
                                                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-semibold"
                                            />
                                        </div>
                                    </div>

                                    {/* Row 2: Contact Info */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="phone" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {isVI ? 'Số điện thoại' : 'Phone'} <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="phone"
                                                id="phone"
                                                required
                                                value={formData.phone}
                                                onChange={handleChange}
                                                placeholder="0901234567"
                                                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-semibold"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="email" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {isVI ? 'Email' : 'Email'}
                                            </label>
                                            <input
                                                type="email"
                                                name="email"
                                                id="email"
                                                value={formData.email}
                                                onChange={handleChange}
                                                placeholder="example@mail.com"
                                                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-semibold"
                                            />
                                        </div>
                                    </div>

                                    {/* Row: Date of Birth & Gender & City */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div>
                                            <label htmlFor="date_of_birth" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {isVI ? 'Ngày sinh' : 'Date of Birth'}
                                            </label>
                                            {onlyYear ? (
                                                <input
                                                    type="number"
                                                    min="1940"
                                                    max={new Date().getFullYear()}
                                                    placeholder="YYYY"
                                                    value={birthYear}
                                                    onChange={(e) => setBirthYear(e.target.value)}
                                                    className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-semibold"
                                                />
                                            ) : (
                                                <input
                                                    type="date"
                                                    name="date_of_birth"
                                                    id="date_of_birth"
                                                    value={formData.date_of_birth}
                                                    onChange={handleChange}
                                                    className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-semibold"
                                                />
                                            )}
                                            <div className="mt-1 flex items-center">
                                                <input
                                                    type="checkbox"
                                                    id="only_year"
                                                    checked={onlyYear}
                                                    onChange={(e) => setOnlyYear(e.target.checked)}
                                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                />
                                                <label htmlFor="only_year" className="ml-2 text-[10px] font-bold text-slate-500 cursor-pointer select-none">
                                                    {isVI ? 'Chỉ nhập năm sinh' : 'Only year of birth'}
                                                </label>
                                            </div>
                                        </div>
                                        <div>
                                            <label htmlFor="gender" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {isVI ? 'Giới tính' : 'Gender'} <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                name="gender"
                                                id="gender"
                                                required
                                                value={formData.gender}
                                                onChange={handleChange}
                                                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-semibold"
                                            >
                                                <option value="">{isVI ? 'Chọn giới tính...' : 'Select gender...'}</option>
                                                <option value="Nam">{isVI ? 'Nam' : 'Male'}</option>
                                                <option value="Nữ">{isVI ? 'Nữ' : 'Female'}</option>
                                                <option value="Khác">{isVI ? 'Khác' : 'Other'}</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label htmlFor="city" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {isVI ? 'Thành phố' : 'City'} <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                name="city"
                                                id="city"
                                                required
                                                value={formData.city}
                                                onChange={handleChange}
                                                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-semibold"
                                            >
                                                <option value="">{isVI ? 'Chọn thành phố...' : 'Select city...'}</option>
                                                {Array.from(new Set(branches.map(b => b.city).filter(Boolean))).sort().map((c: any) => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Row: Address */}
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label htmlFor="address" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {isVI ? 'Địa chỉ' : 'Address'}
                                            </label>
                                            <input
                                                type="text"
                                                name="address"
                                                id="address"
                                                value={formData.address}
                                                onChange={handleChange}
                                                placeholder={isVI ? '123 Đường...' : '123 Street...'}
                                                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-semibold"
                                            />
                                        </div>
                                    </div>

                                    {/* Row 3: Source */}
                                    <div>
                                        <label htmlFor="source_select" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                            {isVI ? 'Nguồn ứng viên' : 'Candidate Source'} <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            id="source_select"
                                            value={selectedPostingId ? `post:${selectedPostingId}` : `manual:${formData.source}`}
                                            onChange={e => {
                                                const val = e.target.value
                                                if (val.startsWith('post:')) {
                                                    const pId = val.substring(5)
                                                    setSelectedPostingId(pId)
                                                    const matched = postings.find(p => p.id === pId)
                                                    setFormData(prev => ({ ...prev, source: matched ? matched.platform : 'Other' }))
                                                } else {
                                                    const src = val.substring(7)
                                                    setSelectedPostingId('')
                                                    setFormData(prev => ({ ...prev, source: src }))
                                                }
                                            }}
                                            className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-10 text-gray-900 font-semibold cursor-pointer"
                                        >
                                            <optgroup label={isVI ? 'Kênh thủ công' : 'Manual Channels'}>
                                                <option value="manual:Referral">{isVI ? 'Giới thiệu (Referral)' : 'Referral'}</option>
                                                <option value="manual:Walk-in">{isVI ? 'Khách tự đến (Walk-in)' : 'Walk-in'}</option>
                                                <option value="manual:Other">{isVI ? 'Khác (Other)' : 'Other'}</option>
                                            </optgroup>
                                            {postings.length > 0 && (
                                                <optgroup label={isVI ? 'Bài đăng hoạt động' : 'Active Postings'}>
                                                     {postings.map(p => (
                                                         <option key={p.id} value={`post:${p.id}`}>
                                                             {p.platform} {p.package_name ? `(${p.package_name})` : ''}
                                                         </option>
                                                     ))}
                                                </optgroup>
                                            )}
                                        </select>
                                    </div>

                                    {/* Row 4: CV Upload & Notes */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="cv" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {isVI ? 'Hồ sơ ứng viên (CV)' : 'Candidate CV'}
                                            </label>
                                            <div className="mt-1 flex justify-center rounded-xl border-2 border-dashed border-slate-350 hover:border-blue-400 hover:bg-slate-50/50 transition-all px-4 py-5 cursor-pointer relative h-[142px] items-center">
                                                <div className="space-y-1.5 text-center">
                                                    <PaperClipIcon className="mx-auto h-8 w-8 text-blue-500/80" />
                                                    <div className="flex flex-col items-center justify-center text-xs text-slate-700 font-medium">
                                                        <label
                                                            htmlFor="file-upload"
                                                            className="relative cursor-pointer rounded-md bg-transparent font-bold text-blue-600 hover:text-blue-700 hover:underline focus-within:outline-none"
                                                        >
                                                            <span>{isVI ? 'Tải tệp lên' : 'Upload a file'}</span>
                                                            <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />
                                                        </label>
                                                        <span className="text-slate-500 mt-0.5">{isVI ? 'hoặc kéo thả vào đây' : 'or drag and drop'}</span>
                                                    </div>
                                                    <p className="text-[10px] text-slate-550 font-semibold">
                                                        {isVI ? 'PDF, DOC, PNG, JPG tối đa 10MB' : 'PDF, DOC, PNG, JPG up to 10MB'}
                                                    </p>
                                                </div>
                                            </div>
                                            {file && (
                                                <div className="mt-2 flex items-center justify-between p-1.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                        <span className="font-semibold shrink-0">{isVI ? 'Đã chọn:' : 'Selected:'}</span>
                                                        <span className="truncate font-mono">{file.name}</span>
                                                    </div>
                                                    <button 
                                                        type="button" 
                                                        onClick={() => setFile(null)}
                                                        className="text-slate-500 hover:text-slate-700 font-bold px-1 shrink-0 ml-1"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            )}
                                            {!file && currentCvUrl && (
                                                <div className="mt-2 flex items-center justify-between p-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold">{isVI ? 'CV hiện tại:' : 'Current CV:'}</span>
                                                        <a href={currentCvUrl} target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-blue-800 flex items-center gap-1">
                                                            <span>{isVI ? 'Xem CV' : 'View CV'}</span>
                                                            <span className="text-[10px]">↗</span>
                                                        </a>
                                                    </div>
                                                    <button 
                                                        type="button" 
                                                        onClick={handleRemoveCurrentCv}
                                                        className="text-red-500 hover:text-red-700 font-extrabold px-1 text-sm transition-colors"
                                                        title={isVI ? 'Xóa CV hiện tại' : 'Remove current CV'}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            )}
                                            {shouldRemoveCv && (
                                                <div className="mt-2 p-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-semibold">
                                                    {isVI ? 'CV hiện tại sẽ bị xóa sau khi lưu.' : 'Current CV will be removed upon saving.'}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <label htmlFor="notes" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                {isVI ? 'Ghi chú' : 'Notes'}
                                            </label>
                                            <textarea
                                                name="notes"
                                                id="notes"
                                                rows={5}
                                                value={formData.notes}
                                                onChange={handleChange}
                                                placeholder={isVI ? 'Nhập ghi chú thêm về ứng viên...' : 'Enter any notes about the candidate...'}
                                                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-gray-900 font-semibold h-[142px] resize-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Duplicate Warnings */}
                                    {isNotEligible ? (
                                        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 space-y-1">
                                            <div className="font-bold">
                                                {isVI 
                                                    ? `❌ Nhân sự/ứng viên này không đủ điều kiện ứng tuyển lại`
                                                    : `❌ This person is not eligible for rehire`}
                                            </div>
                                            <p className="text-xs text-red-700 leading-relaxed">
                                                {isVI 
                                                    ? 'Hồ sơ này đã được đánh dấu là không đủ điều kiện tuyển dụng/ứng tuyển trong danh sách lưu trữ. Bạn không thể tạo hoặc cập nhật ứng viên này.'
                                                    : 'This contact profile has been marked as NOT eligible for rehire/application in archives. You cannot save or update this candidate.'}
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            {duplicateCandidate && (
                                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 space-y-2">
                                                    <div className="font-semibold">
                                                        {isVI 
                                                            ? `⚠️ Ứng viên này đã tồn tại: ${duplicateCandidate.full_name} (Trạng thái: ${duplicateCandidate.stage})`
                                                            : `⚠️ This candidate already exists: ${duplicateCandidate.full_name} (Stage: ${duplicateCandidate.stage})`}
                                                    </div>
                                                    <p className="text-xs text-amber-700">
                                                        {isVI 
                                                            ? 'Không thể tạo hồ sơ mới. Bạn có thể mở hồ sơ của họ per vedere i dettagli o ripristinarlo per ricominciare il processo.'
                                                            : 'Cannot create a new duplicate profile. You can open their profile to view details or restore/restart the recruitment process.'}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenWorkflowId(duplicateCandidate.id)}
                                                        className="inline-flex items-center px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                                                    >
                                                        {isVI ? 'Mở hồ sơ ứng viên' : 'Open Candidate Profile'}
                                                    </button>
                                                </div>
                                            )}

                                            {duplicateStaff && (
                                                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800 space-y-1">
                                                    <div className="font-semibold">
                                                        {isVI 
                                                            ? `ℹ️ Thông tin liên hệ thuộc về nhân sự: ${duplicateStaff.full_name} (Trạng thái: ${duplicateStaff.status === 'terminated' ? 'Đã nghỉ việc' : duplicateStaff.status === 'inactive' ? 'Ngừng hoạt động' : 'Đang làm việc'})`
                                                            : `ℹ️ This contact belongs to staff: ${duplicateStaff.full_name} (Status: ${duplicateStaff.status})`}
                                                    </div>
                                                    <p className="text-xs text-blue-700">
                                                        {isVI 
                                                            ? 'Hồ sơ tuyển dụng này sarà collegato al profilo staff esistente per riutilizzare documenti e dati storici.'
                                                            : 'This candidate application will automatically link to their existing/previous staff record to reuse documents.'}
                                                    </p>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    <div className="flex justify-end gap-3 pt-4 mt-5 border-t border-gray-100">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-550 hover:bg-slate-105 transition cursor-pointer h-10 flex items-center justify-center"
                                        >
                                            {isVI ? 'Hủy' : 'Cancel'}
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submitting || !lastName.trim() || !firstName.trim() || !formData.gender || !formData.city || !!duplicateCandidate || checkingDuplicates}
                                            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white shadow-sm hover:shadow-md transition-all cursor-pointer h-10 flex items-center justify-center disabled:opacity-40"
                                        >
                                            {submitting ? (isVI ? 'Đang lưu...' : 'Saving...') : candidateToEdit ? (isVI ? 'Lưu thay đổi' : 'Save Changes') : (isVI ? 'Thêm ứng viên' : 'Add Candidate')}
                                        </button>
                                    </div>
                                </form>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
                {openWorkflowId && (
                    <CandidateWorkflowModal
                        candidateId={openWorkflowId}
                        onClose={() => {
                            setOpenWorkflowId(null)
                            onClose()
                        }}
                        onSuccess={() => {
                            setOpenWorkflowId(null)
                            onSuccess()
                        }}
                    />
                )}
            </Dialog>
        </Transition>
    )
}
