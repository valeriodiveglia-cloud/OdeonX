'use client'

import { useState, useEffect, Fragment } from 'react'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { 
    XMarkIcon, 
    PaperClipIcon, 
    CalendarIcon, 
    MapPinIcon, 
    StarIcon, 
    CheckCircleIcon,
    BriefcaseIcon,
    UserIcon,
    PhoneIcon,
    EnvelopeIcon,
    CreditCardIcon,
    ChatBubbleBottomCenterTextIcon,
    InboxIcon,
    BuildingOfficeIcon,
    ArrowUpTrayIcon,
    PlayIcon,
    ArrowPathIcon,
    XCircleIcon
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import { supabase } from '@/lib/supabase_shim'
import { Candidate, CandidateStage, HRDepartment, HRPosition, EmploymentType, SalaryType, HRInterviewTemplate, InterviewTemplateSection, InterviewQuestion, HiringRequest, HRStaffMember } from '@/types/human-resources'
import { useSettings } from '@/contexts/SettingsContext'
import { getVietnamBanks, VietnamBank } from '@/lib/vietnamBanks'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas-pro'


interface CandidateWorkflowModalProps {
    candidateId: string
    onClose: () => void
    onSuccess: (action?: string) => void
}

// Structured 10 Interview Questions for Restaurant Staff
export const INTERVIEW_QUESTIONS = [
    {
        key: 'q1_background',
        label_en: '1. Tell us briefly about your professional career in the industry. What tasks did you perform?',
        label_vi: '1. Hãy chia sẻ ngắn gọn về quá trình làm việc của bạn trong ngành này. Bạn đã làm những công việc gì?'
    },
    {
        key: 'q2_motivation',
        label_en: '2. What attracts you most about this position and our brand?',
        label_vi: '2. Điều gì thu hút bạn nhất ở vị trí này và thương hiệu của chúng tôi?'
    },
    {
        key: 'q3_skills',
        label_en: '3. Cooking/Service: How do you manage order times, table organization, and rush hours?',
        label_vi: '3. Bếp/Phục vụ: Bạn quản lý thời gian ra món, sắp xếp bàn và các khung giờ cao điểm như thế nào?'
    },
    {
        key: 'q4_customer',
        label_en: '4. Describe how you handle a difficult customer or a mistake during service.',
        label_vi: '4. Mô tả cách bạn xử lý một khách hàng khó tính hoặc một sai sót trong quá trình phục vụ.'
    },
    {
        key: 'q5_haccp',
        label_en: '5. Do you regularly apply HACCP and food safety procedures? Give us an example.',
        label_vi: '5. Bạn có thường xuyên áp dụng quy trình HACCP và an toàn thực phẩm không? Cho ví dụ.'
    },
    {
        key: 'q6_feedback',
        label_en: '6. How do you react to constructive feedback or criticism from a manager or chef?',
        label_vi: '6. Bạn phản ứng thế nào trước phản hồi mang tính xây dựng hoặc sự phê bình từ quản lý hoặc bếp trưởng?'
    },
    {
        key: 'q7_teamwork',
        label_en: '7. Tell us about a time when you had to help a colleague in difficulty during service.',
        label_vi: '7. Kể về một lần bạn phải giúp đỡ một đồng nghiệp gặp khó khăn trong quá trình làm việc.'
    },
    {
        key: 'q8_stress',
        label_en: '8. How do you maintain calm and efficiency under stress in a chaotic moment?',
        label_vi: '8. Làm thế nào để bạn giữ bình tĩnh và hiệu quả dưới áp lực trong những thời điểm hỗn loạn?'
    },
    {
        key: 'q9_availability',
        label_en: '9. What is your actual availability for split shifts, evening shifts, and weekends?',
        label_vi: '9. Khả năng làm việc thực tế của bạn đối với ca gãy, ca tối và cuối tuần là gì?'
    },
    {
        key: 'q10_transport',
        label_en: '10. Do you have transport or distance issues reaching the premises at these times?',
        label_vi: '10. Bạn có gặp khó khăn về phương tiện đi lại hoặc khoảng cách khi đến quán vào những khung giờ này không?'
    }
]

export const DEFAULT_SECTIONS: InterviewTemplateSection[] = [
    {
        id: 'sec_1',
        name_en: 'Background & Motivation',
        name_vi: 'Thông tin cơ bản & Động lực',
        questions: [
            {
                id: 'q1_background',
                text_en: 'Tell us briefly about your professional career in the industry. What tasks did you perform?',
                text_vi: 'Hãy chia sẻ ngắn gọn về quá trình làm việc của bạn trong ngành này. Bạn đã làm những công việc gì?',
                type: 'text'
            },
            {
                id: 'q2_motivation',
                text_en: 'What attracts you most about this position and our brand?',
                text_vi: 'Điều gì thu hút bạn nhất ở vị trí này và thương hiệu của chúng tôi?',
                type: 'text'
            }
        ]
    },
    {
        id: 'sec_2',
        name_en: 'Professional Skills & Scenarios',
        name_vi: 'Kỹ năng chuyên môn & Tình huống',
        questions: [
            {
                id: 'q3_skills',
                text_en: 'Cooking/Service: How do you manage order times, table organization, and rush hours?',
                text_vi: 'Bếp/Phục vụ: Bạn quản lý thời gian ra món, sắp xếp bàn và các khung giờ cao điểm như thế nào?',
                type: 'text'
            },
            {
                id: 'q4_customer',
                text_en: 'Describe how you handle a difficult customer or a mistake during service.',
                text_vi: 'Mô tả cách bạn xử lý một khách hàng khó tính hoặc một sai sót trong quá trình phục vụ.',
                type: 'text'
            },
            {
                id: 'q5_haccp',
                text_en: 'Do you regularly apply HACCP and food safety procedures? Give us an example.',
                text_vi: 'Bạn có thường xuyên áp dụng quy trình HACCP và an toàn thực phẩm không? Cho ví dụ.',
                type: 'text'
            }
        ]
    },
    {
        id: 'sec_3',
        name_en: 'Teamwork & Stress Management',
        name_vi: 'Lực lượng phối hợp & Khả năng chịu áp lực',
        questions: [
            {
                id: 'q6_feedback',
                text_en: 'How do you react to constructive feedback or criticism from a manager or chef?',
                text_vi: 'Bạn phản ứng thế nào trước phản hồi mang tính xây dựng o sự phê bình từ quản lý o bếp trưởng?',
                type: 'text'
            },
            {
                id: 'q7_teamwork',
                text_en: 'Tell us about a time when you had to help a colleague in difficulty during service.',
                text_vi: 'Kể về một lần bạn phải giúp đỡ một đồng nghiệp gặp khó khăn trong quá trình làm việc.',
                type: 'text'
            },
            {
                id: 'q8_stress',
                text_en: 'How do you maintain calm and efficiency under stress in a chaotic moment?',
                text_vi: 'Làm thế nào để bạn giữ bình tĩnh và hiệu quả dưới áp lực trong những thời điểm hỗn loạn?',
                type: 'text'
            }
        ]
    },
    {
        id: 'sec_4',
        name_en: 'Logistics & Availability',
        name_vi: 'Logistics & Sự linh hoạt thời gian',
        questions: [
            {
                id: 'q9_availability',
                text_en: 'What is your actual availability for split shifts, evening shifts, and weekends?',
                text_vi: 'Khả năng làm việc thực tế của bạn đối với ca gãy, ca tối và cuối tuần là gì?',
                type: 'text'
            },
            {
                id: 'q10_transport',
                text_en: 'Do you have transport or distance issues reaching the premises at these times?',
                text_vi: 'Bạn có gặp khó khăn về phương tiện đi lại o khoảng cách khi đến quán vào những khung giờ này no?',
                type: 'text'
            }
        ]
    }
]

// Helper to determine the active stage step
const getActiveStepForCandidate = (cand: Candidate | null) => {
    if (!cand) return 1
    if (cand.stage === 'new') return 1
    if (cand.stage === 'screened') return 2
    if (cand.stage === 'interview_scheduled') return 3
    if (cand.stage === 'interviewed') return 4
    if (cand.stage === 'offer_sent') return 5
    if (cand.stage === 'trial_shift') return 6
    if (cand.stage === 'hired') return 6
    if (cand.stage === 'rejected') {
        // 1. Check if it's a No Show (happens at Step 6 Onboard)
        if (cand.rejection_reason && cand.rejection_reason.includes('No Show')) {
            return 6
        }
        // 2. Check if the offer was rejected by candidate or admin (happens at Step 5 Job Offer)
        if (cand.rejection_reason || (cand as any).offer_approval_status === 'rejected') {
            return 5
        }
        // 3. Check if they failed at interview evaluation (happens at Step 4)
        if (cand.interview_rating !== null || cand.interview_feedback !== null) {
            return 4
        }
        // 4. Otherwise, they failed at CV screening (step 1)
        return 1
    }
    return 1 // default
}

export function CandidateWorkflowModal({ candidateId, onClose, onSuccess }: CandidateWorkflowModalProps) {
    const { language } = useSettings()
    const isVI = language === 'vi'

    const formatToDDMMYYYY = (dateStr: string | Date | null | undefined): string => {
        if (!dateStr) return '-'
        if (typeof dateStr === 'string' && dateStr.trim() === '') return '-'
        // Handle input dates of format YYYY-MM-DD
        if (typeof dateStr === 'string') {
            const parts = dateStr.split(' ')[0].split('-')
            if (parts.length === 3 && parts[0].length === 4) {
                return `${parts[2]}/${parts[1]}/${parts[0]}`
            }
        }
        const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
        if (isNaN(date.getTime())) return '-'
        const dd = String(date.getDate()).padStart(2, '0')
        const mm = String(date.getMonth() + 1).padStart(2, '0')
        const yyyy = date.getFullYear()
        return `${dd}/${mm}/${yyyy}`
    }

    const formatDateTime = (dateStr: string | Date | null | undefined): string => {
        if (!dateStr) return '—'
        const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
        if (isNaN(date.getTime())) return '—'
        const dd = String(date.getDate()).padStart(2, '0')
        const mm = String(date.getMonth() + 1).padStart(2, '0')
        const yyyy = date.getFullYear()
        const hh = String(date.getHours()).padStart(2, '0')
        const min = String(date.getMinutes()).padStart(2, '0')
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`
    }
    
    const [candidate, setCandidate] = useState<Candidate | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [branches, setBranches] = useState<{ id: string; name: string; address: string; city?: string | null }[]>([])
    const [selectedTab, setSelectedTab] = useState<number>(1)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [currentUserName, setCurrentUserName] = useState<string | null>(null)
    const [offerApprovalNotes, setOfferApprovalNotes] = useState('')

    // Form states for Step 1: CV Screening
    const [englishLevel, setEnglishLevel] = useState('Basic')
    const [experienceYears, setExperienceYears] = useState('')
    const [initialRating, setInitialRating] = useState(3)
    const [screeningNotes, setScreeningNotes] = useState('')

    // Form states for Step 2: Schedule Interview
    const [interviewDate, setInterviewDate] = useState('')
    const [interviewTime, setInterviewTime] = useState('')
    const [locationType, setLocationType] = useState<'online' | 'branch'>('branch')
    const [branchId, setBranchId] = useState('')
    const [onlineLink, setOnlineLink] = useState('')

    // Form states for Step 3: Interview Questionnaire Answers
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [activeTemplate, setActiveTemplate] = useState<HRInterviewTemplate | null>(null)
    const [templateSections, setTemplateSections] = useState<InterviewTemplateSection[]>(DEFAULT_SECTIONS)

    // Form states for Step 4: Interview Evaluation
    const [interviewRating, setInterviewRating] = useState(3)
    const [interviewFeedback, setInterviewFeedback] = useState('')

    // Form states for Step 5: Onboarding & Hire (matches StaffModal)
    const [lastName, setLastName] = useState('')
    const [middleName, setMiddleName] = useState('')
    const [firstName, setFirstName] = useState('')
    const [phone, setPhone] = useState('')
    const [email, setEmail] = useState('')
    const [departmentId, setDepartmentId] = useState('')
    const [positionId, setPositionId] = useState('')
    const [employmentType, setEmploymentType] = useState<EmploymentType>('full_time')
    const [salaryType, setSalaryType] = useState<SalaryType>('fixed')
    const [salaryAmount, setSalaryAmount] = useState('')
    const [startDate, setStartDate] = useState('')
    const [probationMonths, setProbationMonths] = useState('')
    const [probationSalaryPct, setProbationSalaryPct] = useState('100')
    const [probationSalaryPcts, setProbationSalaryPcts] = useState<string[]>([])
    const [selectedBranches, setSelectedBranches] = useState<string[]>([])
    const [bankName, setBankName] = useState('')
    const [bankAccountNumber, setBankAccountNumber] = useState('')
    const [bankAccountName, setBankAccountName] = useState('')
    const [bankSameAsStaff, setBankSameAsStaff] = useState(true)
    const [notes, setNotes] = useState('')
    const [city, setCity] = useState('')
    const [address, setAddress] = useState('')
    const [docPhotoFile, setDocPhotoFile] = useState<File | null>(null)
    const [skillLevel, setSkillLevel] = useState('1')
    const [staffCode, setStaffCode] = useState('')
    const [dateOfBirth, setDateOfBirth] = useState('')
    const [gender, setGender] = useState('Nam')
    const [maritalStatus, setMaritalStatus] = useState('Độc thân')
    const [bankBranch, setBankBranch] = useState('')
    const [emergencyContactName, setEmergencyContactName] = useState('')
    const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('')
    const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
    const [documentIssueDate, setDocumentIssueDate] = useState('')
    const [documentIssuePlace, setDocumentIssuePlace] = useState('')
    const [restaurantLogoUrl, setRestaurantLogoUrl] = useState<string | null>(null)
    const [offerStartDate, setOfferStartDate] = useState('')
    const [offerStartTime, setOfferStartTime] = useState('')
    const [defineStartDate, setDefineStartDate] = useState(false)
    const [defineStartLocation, setDefineStartLocation] = useState(false)
    const [offerBranchId, setOfferBranchId] = useState('')
    const [offerExpiryDate, setOfferExpiryDate] = useState('')
    const [pdfLangModalOpen, setPdfLangModalOpen] = useState(false)
    const [pdfLanguageMode, setPdfLanguageMode] = useState<'vi' | 'en' | 'both'>('both')
    const [rejectionModalOpen, setRejectionModalOpen] = useState(false)
    const [rejectionReasonText, setRejectionReasonText] = useState('')
    const [interviewModeActive, setInterviewModeActive] = useState(false)
    
    // Master data loaded for onboarding
    const [departments, setDepartments] = useState<HRDepartment[]>([])
    const [positions, setPositions] = useState<HRPosition[]>([])
    const [vietnamBanks, setVietnamBanks] = useState<VietnamBank[]>([])
    const [onboardingFormInitialized, setOnboardingFormInitialized] = useState(false)

    // New states for document_type, document_number, previous staff and restore candidate
    const [documentType, setDocumentType] = useState<'id_card' | 'passport'>('id_card')
    const [documentNumber, setDocumentNumber] = useState('')
    const [openRestoreDialog, setOpenRestoreDialog] = useState(false)
    const [activeRequests, setActiveRequests] = useState<HiringRequest[]>([])
    const [selectedTargetRequestId, setSelectedTargetRequestId] = useState('')
    const [restoring, setRestoring] = useState(false)
    const [previousStaffMember, setPreviousStaffMember] = useState<HRStaffMember | null>(null)
    const [staffDocuments, setStaffDocuments] = useState<any[]>([])
    const [loadingStaffDocs, setLoadingStaffDocs] = useState(false)
    const hasExistingIdPhoto = !!(previousStaffMember && staffDocuments.some(d => d.document_category === 'ID Card'))

    const fetchRestaurantLogo = async () => {
        try {
            const res = await fetch('/api/staff-portal/logo')
            if (res.ok) {
                const text = await res.text()
                if (text) {
                    const data = JSON.parse(text)
                    if (data && data.url) {
                        setRestaurantLogoUrl(data.url)
                        return
                    }
                }
            }
            setRestaurantLogoUrl(null)
        } catch (err) {
            console.error('Error fetching restaurant logo:', err)
            setRestaurantLogoUrl(null)
        }
    }

    useEffect(() => {
        fetchCandidateDetails()
        fetchBranches()
        fetchDepartmentsAndPositions()
        fetchRestaurantLogo()
        getVietnamBanks().then(setVietnamBanks)
        fetchUserRole()
    }, [candidateId])

    useEffect(() => {
        setEnglishLevel('beginner')
        setExperienceYears('')
        setInitialRating(3)
        setScreeningNotes('')
        setInterviewDate('')
        setInterviewTime('')
        setLocationType('branch')
        setBranchId('')
        setOnlineLink('')
        setAnswers({})
        setInterviewRating(3)
        setInterviewFeedback('')
        setOnboardingFormInitialized(false)
    }, [candidateId])

    useEffect(() => {
        if (candidate && !onboardingFormInitialized && departments.length > 0 && positions.length > 0 && branches.length > 0) {
            // Split name
            const parts = (candidate.full_name || '').split(' ').filter(Boolean)
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

            setPhone(candidate.phone || '')
            setEmail(candidate.email || '')

            const hiringReq = (candidate as any).hiring_requests
            const reqEmpType = hiringReq?.employment_type || 'full_time'
            setEmploymentType(reqEmpType)

            const candidateOfferSalaryType = (candidate as any).offer_salary_type
            if (candidateOfferSalaryType) {
                setSalaryType(candidateOfferSalaryType)
            } else {
                setSalaryType(reqEmpType === 'full_time' ? 'fixed' : 'hourly')
            }

            const candidateOfferSalaryAmt = (candidate as any).offer_salary_amount
            if (candidateOfferSalaryAmt !== undefined && candidateOfferSalaryAmt !== null) {
                setSalaryAmount(Number(candidateOfferSalaryAmt).toLocaleString())
            } else {
                const minSal = hiringReq?.salary_min
                if (minSal) {
                    setSalaryAmount(new Intl.NumberFormat('en-US').format(parseFloat(minSal)))
                } else {
                    setSalaryAmount('')
                }
            }

            const candidateProbationMonths = (candidate as any).probation_months
            if (candidateProbationMonths !== undefined && candidateProbationMonths !== null) {
                setProbationMonths(candidateProbationMonths.toString())
            } else {
                setProbationMonths('')
            }

            const candidateProbationPct = (candidate as any).probation_salary_pct
            if (candidateProbationPct !== undefined && candidateProbationPct !== null) {
                setProbationSalaryPct(candidateProbationPct.toString())
            } else {
                setProbationSalaryPct('100')
            }

            const candidateProbationPcts = (candidate as any).probation_salary_pcts
            if (candidateProbationPcts && Array.isArray(candidateProbationPcts) && candidateProbationPcts.length > 0) {
                setProbationSalaryPcts(candidateProbationPcts.map(String))
            } else if (candidateProbationMonths && candidateProbationPct !== undefined && candidateProbationPct !== null) {
                setProbationSalaryPcts(Array(candidateProbationMonths).fill(candidateProbationPct.toString()))
            } else {
                setProbationSalaryPcts([])
            }

            const candidateOfferBranchId = (candidate as any).offer_branch_id
            const requestBranches = hiringReq?.branch_ids || []
            if (candidateOfferBranchId) {
                setSelectedBranches([candidateOfferBranchId])
            } else {
                setSelectedBranches(requestBranches)
            }

            // Pre-select city based on candidate or hiring request branches
            if (candidate.city) {
                setCity(candidate.city)
            } else {
                const matchedBranch = branches.find(b => requestBranches.includes(b.id))
                if (matchedBranch && matchedBranch.city) {
                    setCity(matchedBranch.city)
                } else {
                    setCity('')
                }
            }
            setAddress(candidate.address || '')
            setSkillLevel('1')

            const candidateOfferStartDate = (candidate as any).offer_start_date
            if (candidateOfferStartDate && candidateOfferStartDate !== 'TBD') {
                const datePart = candidateOfferStartDate.split(' ')[0]
                setStartDate(datePart)
            } else {
                const today = new Date().toISOString().split('T')[0]
                setStartDate(today)
            }

            // Pre-select department and position by name match
            const matchedDept = departments.find(d => d.name.toLowerCase() === hiringReq?.department?.toLowerCase())
            if (matchedDept) {
                setDepartmentId(matchedDept.id)
            } else {
                setDepartmentId('')
            }
            
            const matchedPos = positions.find(p => p.name.toLowerCase() === hiringReq?.position_title?.toLowerCase())
            if (matchedPos) {
                setPositionId(matchedPos.id)
            } else {
                setPositionId('')
            }

            setBankSameAsStaff(true)
            setDocumentType(candidate.document_type || 'id_card')
            setDocumentNumber(candidate.document_number || '')
            setStaffCode('')
            const candidateDob = candidate.date_of_birth || ''
            if (candidateDob && candidateDob.endsWith('-01-01')) {
                setDateOfBirth('')
            } else {
                setDateOfBirth(candidateDob)
            }
            setGender(candidate.gender || 'Nam')
            setMaritalStatus('Độc thân')
            setBankBranch('')
            setEmergencyContactName('')
            setEmergencyContactRelationship('')
            setEmergencyContactPhone('')
            setDocumentIssueDate('')
            setDocumentIssuePlace('')
            setOnboardingFormInitialized(true)
        }
    }, [candidate, departments, positions, branches, onboardingFormInitialized])

    useEffect(() => {
        const fetchPreviousStaffData = async () => {
            const staffId = candidate?.related_staff_id
            const phoneVal = candidate?.phone?.trim()
            const emailVal = candidate?.email?.trim()
            const docNumVal = candidate?.document_number?.trim()

            if (!staffId && !phoneVal && !emailVal && !docNumVal) {
                setPreviousStaffMember(null)
                setStaffDocuments([])
                return
            }

            try {
                setLoadingStaffDocs(true)
                let query = supabase.from('hr_staff').select('*, hr_staff_branches(branch_id)')
                
                if (staffId) {
                    query = query.eq('id', staffId)
                } else {
                    let orParts: string[] = []
                    if (phoneVal) orParts.push(`phone.eq."${phoneVal}"`)
                    if (emailVal) orParts.push(`email.ilike."${emailVal}"`)
                    if (docNumVal) orParts.push(`document_number.eq."${docNumVal}"`)
                    query = query.or(orParts.join(','))
                }

                const { data, error } = await query.limit(1)
                if (!error && data && data.length > 0) {
                    const matchedStaff = data[0] as HRStaffMember
                    setPreviousStaffMember(matchedStaff)

                    // Fetch documents
                    const { data: docData, error: docErr } = await supabase
                        .from('hr_staff_documents')
                        .select('*')
                        .eq('staff_id', matchedStaff.id)

                    if (!docErr && docData) {
                        setStaffDocuments(docData)
                    }
                } else {
                    setPreviousStaffMember(null)
                    setStaffDocuments([])
                }
            } catch (err) {
                console.error('Error fetching previous staff data:', err)
            } finally {
                setLoadingStaffDocs(false)
            }
        }

        if (candidate) {
            fetchPreviousStaffData()
        }
    }, [candidate])

    useEffect(() => {
        if (previousStaffMember) {
            const staff = previousStaffMember as any
            // Split name
            const parts = (staff.full_name || '').split(' ').filter(Boolean)
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

            if (staff.phone) setPhone(staff.phone)
            if (staff.email) setEmail(staff.email)
            if (staff.city) setCity(staff.city)
            if (staff.address) setAddress(staff.address)
            
            if (staff.bank_name) setBankName(staff.bank_name)
            if (staff.bank_account_number) setBankAccountNumber(staff.bank_account_number)
            if (staff.bank_account_name) setBankAccountName(staff.bank_account_name)
            setBankSameAsStaff(!!staff.bank_same_as_staff)
            
            if (staff.document_type) setDocumentType(staff.document_type as any)
            if (staff.document_number) setDocumentNumber(staff.document_number)
            if (staff.skill_level !== undefined && staff.skill_level !== null) {
                setSkillLevel(staff.skill_level.toString())
            }
            if (staff.notes) setNotes(staff.notes)
            
            // Only set employment, salary, and dates if they are present
            if (staff.employment_type) setEmploymentType(staff.employment_type)
            if (staff.salary_type) setSalaryType(staff.salary_type)
            if (staff.salary_amount !== undefined && staff.salary_amount !== null) {
                setSalaryAmount(Number(staff.salary_amount).toLocaleString())
            }
            if (staff.start_date) setStartDate(staff.start_date)
            if (staff.probation_months !== undefined && staff.probation_months !== null) {
                setProbationMonths(staff.probation_months.toString())
            }
            if (staff.probation_salary_pct !== undefined && staff.probation_salary_pct !== null) {
                setProbationSalaryPct(staff.probation_salary_pct.toString())
            }
            if (staff.probation_salary_pcts && Array.isArray(staff.probation_salary_pcts) && staff.probation_salary_pcts.length > 0) {
                setProbationSalaryPcts(staff.probation_salary_pcts.map(String))
            } else if (staff.probation_months && staff.probation_salary_pct !== undefined && staff.probation_salary_pct !== null) {
                setProbationSalaryPcts(Array(staff.probation_months).fill(staff.probation_salary_pct.toString()))
            } else {
                setProbationSalaryPcts([])
            }

            // Restore branches if loaded
            if (staff.hr_staff_branches && Array.isArray(staff.hr_staff_branches)) {
                const branchIds = staff.hr_staff_branches.map((b: any) => b.branch_id)
                if (branchIds.length > 0) {
                    setSelectedBranches(branchIds)
                }
            }
        }
    }, [previousStaffMember])

    useEffect(() => {
        if (openRestoreDialog) {
            const fetchActiveRequests = async () => {
                try {
                    const { data, error } = await supabase
                        .from('hiring_requests')
                        .select('id, position_title, department')
                        .neq('status', 'closed')
                        .order('position_title')
                    if (!error && data) {
                        setActiveRequests(data as HiringRequest[])
                        if (data.length > 0) {
                            setSelectedTargetRequestId(data[0].id)
                        }
                    }
                } catch (err) {
                    console.error('Error fetching active hiring requests:', err)
                }
            }
            fetchActiveRequests()
        }
    }, [openRestoreDialog])

    useEffect(() => {
        if (bankSameAsStaff) {
            const buildFullName = [lastName.trim(), middleName.trim(), firstName.trim()]
                .filter(Boolean)
                .join(' ')
            setBankAccountName(buildFullName)
        }
    }, [lastName, middleName, firstName, bankSameAsStaff])

    const fetchUserRole = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setCurrentUserId(user.id)
                const { data } = await supabase
                    .from('app_accounts')
                    .select('role, name')
                    .eq('user_id', user.id)
                    .single()
                if (data) {
                    setUserRole(data.role)
                    setCurrentUserName(data.name || '')
                }
            }
        } catch (err) {
            console.error('Error fetching role in CandidateWorkflowModal:', err)
        }
    }

    const fetchCandidateDetails = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('candidates')
                .select(`
                    *,
                    screener:app_accounts!candidates_screened_by_fkey(name),
                    interviewer:app_accounts!candidates_interviewed_by_fkey(name),
                    approver:app_accounts!candidates_offer_approval_by_fkey(name),
                    hiring_requests (
                        id,
                        position_title,
                        department,
                        branch_ids,
                        employment_type,
                        salary_min
                    ),
                    related_staff: hr_staff (
                        status
                    )
                `)
                .eq('id', candidateId)
                .single()

            if (error) throw error
            const candData = data as Candidate
            setCandidate(candData)

            // Resolve Interview Questionnaire Template based on Position, Department, and Contract Type
            if (candData && (candData as any).hiring_requests) {
                try {
                    const hr = (candData as any).hiring_requests
                    const targetPos = hr.position_title ? hr.position_title.toLowerCase().trim() : ''
                    const targetDept = hr.department ? hr.department.toLowerCase().trim() : ''
                    const targetEmp = hr.employment_type ? hr.employment_type.toLowerCase().trim() : ''

                    // Fetch templates
                    const { data: dbTemplates, error: templatesErr } = await supabase
                        .from('hr_interview_templates')
                        .select('*')

                    if (!templatesErr && dbTemplates && dbTemplates.length > 0) {
                        let matchedTmpl: HRInterviewTemplate | null = null

                        // 1. Position + Employment Type
                        if (targetPos && targetEmp) {
                            matchedTmpl = dbTemplates.find(t => 
                                t.position_title && t.position_title.toLowerCase().trim() === targetPos &&
                                t.employment_type && t.employment_type.toLowerCase().trim() === targetEmp
                            )
                        }

                        // 2. Position
                        if (!matchedTmpl && targetPos) {
                            matchedTmpl = dbTemplates.find(t => 
                                t.position_title && t.position_title.toLowerCase().trim() === targetPos &&
                                !t.employment_type
                            )
                        }

                        // 3. Department + Employment Type
                        if (!matchedTmpl && targetDept && targetEmp) {
                            matchedTmpl = dbTemplates.find(t => 
                                t.department && t.department.toLowerCase().trim() === targetDept &&
                                t.employment_type && t.employment_type.toLowerCase().trim() === targetEmp
                            )
                        }

                        // 4. Department
                        if (!matchedTmpl && targetDept) {
                            matchedTmpl = dbTemplates.find(t => 
                                t.department && t.department.toLowerCase().trim() === targetDept &&
                                !t.position_title
                            )
                        }

                        // 5. Default Template
                        if (!matchedTmpl) {
                            matchedTmpl = dbTemplates.find(t => t.is_default)
                        }

                        if (matchedTmpl) {
                            setActiveTemplate(matchedTmpl)
                            if (matchedTmpl.sections && Array.isArray(matchedTmpl.sections)) {
                                setTemplateSections(matchedTmpl.sections)
                            } else {
                                setTemplateSections(DEFAULT_SECTIONS)
                            }
                        } else {
                            setTemplateSections(DEFAULT_SECTIONS)
                        }
                    } else {
                        setTemplateSections(DEFAULT_SECTIONS)
                    }
                } catch (tempErr) {
                    console.error('Error resolving template:', tempErr)
                    setTemplateSections(DEFAULT_SECTIONS)
                }
            } else {
                setTemplateSections(DEFAULT_SECTIONS)
            }

            // Populate form states from existing candidate data (only overwrite if not null to preserve typed text on revert)
            if (data) {
                if (data.english_level !== null) setEnglishLevel(data.english_level)
                if (data.experience_years !== null) setExperienceYears(data.experience_years)
                if (data.initial_rating !== null) setInitialRating(data.initial_rating)
                if (data.screening_notes !== null) setScreeningNotes(data.screening_notes)
                if (data.interview_rating !== null) setInterviewRating(data.interview_rating)
                if (data.interview_feedback !== null) setInterviewFeedback(data.interview_feedback)
                if (data.interview_answers !== null) setAnswers(data.interview_answers)
                if (data.offer_salary_amount !== null && data.offer_salary_amount !== undefined) {
                    setSalaryAmount(Number(data.offer_salary_amount).toLocaleString())
                }
                if (data.offer_salary_type !== null && data.offer_salary_type !== undefined) {
                    setSalaryType(data.offer_salary_type as any)
                }
                if (data.probation_months !== null && data.probation_months !== undefined) {
                    setProbationMonths(data.probation_months.toString())
                }
                if (data.probation_salary_pct !== null && data.probation_salary_pct !== undefined) {
                    setProbationSalaryPct(data.probation_salary_pct.toString())
                }
                if (data.probation_salary_pcts && Array.isArray(data.probation_salary_pcts) && data.probation_salary_pcts.length > 0) {
                    setProbationSalaryPcts(data.probation_salary_pcts.map(String))
                } else if (data.probation_months && data.probation_salary_pct !== null && data.probation_salary_pct !== undefined) {
                    setProbationSalaryPcts(Array(data.probation_months).fill(data.probation_salary_pct.toString()))
                } else {
                    setProbationSalaryPcts([])
                }
                if (data.offer_branch_id !== null && data.offer_branch_id !== undefined) {
                    setOfferBranchId(data.offer_branch_id)
                    setDefineStartLocation(true)
                } else {
                    setOfferBranchId('')
                    setDefineStartLocation(false)
                }
                if (data.offer_expiry_date !== null && data.offer_expiry_date !== undefined) {
                    setOfferExpiryDate(data.offer_expiry_date)
                } else {
                    setOfferExpiryDate('')
                }
                if (data.offer_start_date !== null && data.offer_start_date !== undefined) {
                    if (data.offer_start_date === 'TBD') {
                        setDefineStartDate(false)
                        setOfferStartDate('')
                        setOfferStartTime('')
                    } else {
                        setDefineStartDate(true)
                        const parts = data.offer_start_date.split(' ')
                        setOfferStartDate(parts[0] || '')
                        setOfferStartTime(parts[1] || '')
                    }
                } else {
                    setDefineStartDate(false)
                }

                const act = getActiveStepForCandidate(candData)
                setSelectedTab(act)

                if (data.interview_scheduled_at) {
                    const d = new Date(data.interview_scheduled_at)
                    // local date in format YYYY-MM-DD
                    const year = d.getFullYear()
                    const month = String(d.getMonth() + 1).padStart(2, '0')
                    const date = String(d.getDate()).padStart(2, '0')
                    setInterviewDate(`${year}-${month}-${date}`)

                    // local time in format HH:MM
                    const hours = String(d.getHours()).padStart(2, '0')
                    const minutes = String(d.getMinutes()).padStart(2, '0')
                    setInterviewTime(`${hours}:${minutes}`)
                }

                if (data.interview_location) {
                    if (data.interview_location.startsWith('Online')) {
                        setLocationType('online')
                        const match = data.interview_location.match(/Online:\s*(.*)/)
                        setOnlineLink(match ? match[1] : '')
                    } else {
                        setLocationType('branch')
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching candidate details:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchDepartmentsAndPositions = async () => {
        try {
            const [deptRes, posRes] = await Promise.all([
                supabase.from('hr_departments').select('*').order('sort_order'),
                supabase.from('hr_positions').select('*').order('sort_order')
            ])
            if (deptRes.error) throw deptRes.error
            if (posRes.error) throw posRes.error
            setDepartments(deptRes.data || [])
            setPositions(posRes.data || [])
        } catch (err) {
            console.error('Error fetching departments/positions:', err)
        }
    }


    const fetchBranches = async () => {
        try {
            const { data, error } = await supabase
                .from('provider_branches')
                .select('id, name, address, city')
                .eq('is_active', true)
                .order('sort_order', { ascending: true })

            if (error) throw error
            setBranches(data || [])
            if (data && data.length > 0) {
                setBranchId(data[0].id)
            }
        } catch (err) {
            console.error('Error fetching branches:', err)
        }
    }

    // Attempt to match branchId from saved interview_location name
    useEffect(() => {
        if (candidate && candidate.interview_location && !candidate.interview_location.startsWith('Online') && branches.length > 0) {
            const branchName = candidate.interview_location.split(' - ')[0]
            const foundBranch = branches.find(b => b.name === branchName)
            if (foundBranch) {
                setBranchId(foundBranch.id)
            }
        }
    }, [candidate, branches])
    const handleUpdateStage = async (newStage: string, payload: any, activityMsg: string, actionType?: string) => {
        if (!candidate) return
        try {
            setSaving(true)
            const { error } = await supabase
                .from('candidates')
                .update({
                    stage: newStage,
                    updated_at: new Date().toISOString(),
                    ...payload
                })
                .eq('id', candidate.id)

            if (error) throw error

            // Log activity
            await supabase.from('hr_activity_log').insert([{
                hiring_request_id: candidate.hiring_request_id,
                action_type: 'candidate_status_changed',
                message: activityMsg
            }])

            // Force refresh of recruitment statistics
            await supabase.from('app_settings').select('id').limit(1)
            
            await fetchCandidateDetails()
            onSuccess(actionType)
        } catch (error: any) {
            console.error('Error updating candidate workflow:', error)
            alert(error.message || 'Failed to update candidate')
        } finally {
            setSaving(false)
        }
    }

    const handleSaveScreening = async (pass: boolean) => {
        if (!candidate) return
        if (!pass && !screeningNotes.trim()) {
            alert(isVI
                ? 'Vui lòng nhập ghi chú vòng lọc (lý do từ chối).'
                : 'Please enter screening notes (rejection reason).')
            return
        }
        const newStage = pass ? 'screened' : 'rejected'
        const payload = {
            english_level: englishLevel,
            experience_years: experienceYears,
            initial_rating: initialRating,
            screening_notes: screeningNotes,
            screened_by: currentUserId
        }
        const activityMsg = pass
            ? `Candidate ${candidate.full_name} passed CV screening (English: ${englishLevel}, Exp: ${experienceYears}) / Ứng viên ${candidate.full_name} đã đạt vòng lọc hồ sơ (Tiếng Anh: ${englishLevel}, Kn: ${experienceYears})`
            : `Candidate ${candidate.full_name} failed CV screening / Ứng viên ${candidate.full_name} không đạt vòng lọc hồ sơ`

        await handleUpdateStage(newStage, payload, activityMsg)
    }

    const handleSaveSchedule = async () => {
        if (!candidate || !interviewDate || !interviewTime) return

        let interview_location = 'Online'
        if (locationType === 'online') {
            interview_location = onlineLink.trim() ? `Online: ${onlineLink.trim()}` : 'Online'
        } else {
            const selectedBranch = branches.find(b => b.id === branchId)
            if (selectedBranch) {
                interview_location = `${selectedBranch.name} - ${selectedBranch.address}`
            }
        }

        const scheduledAt = new Date(`${interviewDate}T${interviewTime}`).toISOString()

        const payload = {
            interview_scheduled_at: scheduledAt,
            interview_location: interview_location
        }
        const activityMsg = `Scheduled interview for candidate ${candidate.full_name} at ${interviewDate} ${interviewTime} / Đã lên lịch phỏng vấn cho ứng viên ${candidate.full_name} lúc ${interviewDate} ${interviewTime}`

        await handleUpdateStage('interview_scheduled', payload, activityMsg)
    }

    const handleSaveInterviewQuestionnaire = async () => {
        if (!candidate) return
        try {
            const payload = {
                interview_answers: answers
            }
            const isEditing = candidate.stage !== 'interview_scheduled'
            const nextStage = isEditing ? candidate.stage : 'interviewed'
            const activityMsg = isEditing
                ? `Updated interview questionnaire for candidate ${candidate.full_name} / Đã cập nhật phiếu phỏng vấn cho ứng viên ${candidate.full_name}`
                : `Completed interview questionnaire for candidate ${candidate.full_name} / Đã hoàn thành phiếu phỏng vấn cho ứng viên ${candidate.full_name}`

            await handleUpdateStage(nextStage, payload, activityMsg)
            setInterviewModeActive(false)
        } catch (err) {
            console.error('Error saving interview questionnaire:', err)
        }
    }

    const handleSaveInterviewEvaluation = async (pass: boolean) => {
        if (!candidate) return
        if (!interviewFeedback.trim()) {
            if (pass) {
                alert(isVI
                    ? 'Vui lòng nhập nhận xét phỏng vấn.'
                    : 'Please enter interview feedback.')
            } else {
                alert(isVI
                    ? 'Vui lòng nhập nhận xét phỏng vấn (lý do từ chối).'
                    : 'Please enter interview feedback (rejection reason).')
            }
            return
        }
        const newStage = pass ? 'offer_sent' : 'rejected'
        const payload: any = {
            interview_rating: interviewRating,
            interview_feedback: interviewFeedback,
            interviewed_by: currentUserId
        }
        if (pass) {
            payload.offer_approval_status = 'approved'
        }
        if (!pass) {
            payload.offer_salary_amount = null
            payload.offer_salary_type = null
            payload.probation_months = null
            payload.probation_salary_pct = null
            payload.probation_salary_pcts = null
            payload.offer_start_date = null
            payload.offer_branch_id = null
            payload.offer_expiry_date = null
        }
        const activityMsg = pass
            ? `Candidate ${candidate.full_name} passed interview (Rating: ${interviewRating}/5) / Ứng viên ${candidate.full_name} đã vượt qua vòng phỏng vấn (Đánh giá: ${interviewRating}/5)`
            : `Candidate ${candidate.full_name} failed interview / Ứng viên ${candidate.full_name} không đạt vòng phỏng vấn`

        await handleUpdateStage(newStage, payload, activityMsg)
    }

    const handleSaveJobOffer = async (proceedToOnboard: boolean) => {
        if (!candidate) return
        try {
            setSaving(true)
            const salaryAmtVal = parseFloat(salaryAmount.replace(/,/g, '')) || 0
            const probationMonthsVal = probationMonths ? parseInt(probationMonths, 10) : 0
            const probationSalaryPctVal = probationSalaryPct ? parseFloat(probationSalaryPct) : 100
            const startVal = defineStartDate ? `${offerStartDate} ${offerStartTime}`.trim() : 'TBD'

            const nextStage = proceedToOnboard ? 'trial_shift' : 'offer_sent'

            const payload: any = {
                offer_salary_amount: salaryAmtVal,
                offer_salary_type: salaryType,
                probation_months: probationMonthsVal,
                probation_salary_pct: probationSalaryPcts.length > 0 ? (parseFloat(probationSalaryPcts[0]) || 100) : probationSalaryPctVal,
                probation_salary_pcts: probationSalaryPcts.length > 0 ? probationSalaryPcts.map(parseFloat) : null,
                offer_start_date: startVal,
                offer_branch_id: (defineStartDate && defineStartLocation) ? (offerBranchId || null) : null,
                offer_expiry_date: offerExpiryDate || null,
                offer_approval_status: 'approved'
            }

            const activityMsg = proceedToOnboard
                ? `Candidate ${candidate.full_name} accepted job offer and proceeded to onboarding / Ứng viên ${candidate.full_name} đã đồng ý offer và chuyển sang bước nhận việc`
                : `Job offer saved and sent for candidate ${candidate.full_name} / Thư mời nhận việc đã được lưu và gửi cho ứng viên ${candidate.full_name}`

            await handleUpdateStage(nextStage, payload, activityMsg)
        } catch (err: any) {
            console.error('Error saving job offer:', err)
            alert(err.message || 'Failed to save job offer')
        } finally {
            setSaving(false)
        }
    }

    const handleApproveOffer = async (approved: boolean) => {
        if (!candidate) return
        try {
            setSaving(true)
            const { data: { user } } = await supabase.auth.getUser()
            
            const payload: any = {
                offer_approval_status: approved ? 'approved' : 'rejected',
                offer_approval_notes: approved ? null : offerApprovalNotes,
                offer_approval_by: user?.id || null,
                offer_approval_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
            
            const activityMsg = approved
                ? `Job offer for candidate ${candidate.full_name} was approved by Admin / Lời mời nhận việc cho ứng viên ${candidate.full_name} đã được phê duyệt bởi Quản trị viên`
                : `Job offer for candidate ${candidate.full_name} was rejected by Admin / Lời mời nhận việc cho ứng viên ${candidate.full_name} đã bị từ chối bởi Quản trị viên`

            // Aggiorna lo stato del candidato
            const { error: updErr } = await supabase
                .from('candidates')
                .update(payload)
                .eq('id', candidate.id)

            if (updErr) throw updErr

            // Inserisci log attività
            await supabase.from('hr_activity_log').insert([{
                hiring_request_id: candidate.hiring_request_id,
                actor_id: user?.id || null,
                action_type: approved ? 'approved' : 'rejected',
                message: activityMsg
            }])

            // Ricarica dettagli
            await fetchCandidateDetails()
            if (approved) {
                alert(isVI ? 'Đã phê duyệt offer thành công!' : 'Offer approved successfully!')
            } else {
                alert(isVI ? 'Đã từ chối offer thành công!' : 'Offer rejected successfully!')
            }
        } catch (err: any) {
            console.error('Error in handleApproveOffer:', err)
            alert(err.message || 'Failed to update offer approval status')
        } finally {
            setSaving(false)
        }
    }

    const handleDownloadOfferPDF = () => {
        setPdfLangModalOpen(true)
    }

    const executeDownloadPDF = async () => {
        if (!candidate) return
        
        const isRejection = candidate.stage === 'rejected'

        try {
            setSaving(true)
            
            if (!isRejection) {
                // 1. Auto-save current inputs to candidate table so DB is synchronized
                const salaryAmtVal = parseFloat(salaryAmount.replace(/,/g, '')) || 0
                const probationMonthsVal = probationMonths ? parseInt(probationMonths, 10) : 0
                const probationSalaryPctVal = probationSalaryPct ? parseFloat(probationSalaryPct) : 100

                const startVal = defineStartDate ? `${offerStartDate} ${offerStartTime}`.trim() : 'TBD'
                const { error: saveErr } = await supabase
                    .from('candidates')
                    .update({
                        offer_salary_amount: salaryAmtVal,
                        offer_salary_type: salaryType,
                        probation_months: probationMonthsVal,
                        probation_salary_pct: probationSalaryPcts.length > 0 ? (parseFloat(probationSalaryPcts[0]) || 100) : probationSalaryPctVal,
                        probation_salary_pcts: probationSalaryPcts.length > 0 ? probationSalaryPcts.map(parseFloat) : null,
                        offer_start_date: startVal,
                        offer_branch_id: (defineStartDate && defineStartLocation) ? (offerBranchId || null) : null,
                        offer_expiry_date: offerExpiryDate || null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', candidate.id)

                if (saveErr) throw saveErr

                // Force refetch local details to sync UI
                await fetchCandidateDetails()
            }

            const generateSinglePDF = async (lang: 'vi' | 'en') => {
                // Wait a split second for React DOM to complete rendering in the new language mode
                await new Promise(resolve => setTimeout(resolve, 300))

                const element = document.getElementById('recruitment-offer-letter-pdf-template')
                if (!element) {
                    throw new Error('PDF template element not found')
                }

                const canvas = await html2canvas(element, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff'
                })

                const imgData = canvas.toDataURL('image/jpeg', 1.0)
                const pdf = new jsPDF({
                    orientation: 'p',
                    unit: 'mm',
                    format: 'a4'
                })

                const imgWidth = 210 // mm
                const imgHeight = (canvas.height * imgWidth) / canvas.width // mm
                pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight)
                
                const langSuffix = pdfLanguageMode === 'both' ? (lang === 'vi' ? '_VI' : '_EN') : ''
                const filename = lang === 'vi'
                    ? (isRejection
                        ? `Thu_thong_bao_ket_qua_phong_van_${candidate.full_name.replace(/\s+/g, '_')}${langSuffix}.pdf`
                        : `Thu_moi_nhan_viec_${candidate.full_name.replace(/\s+/g, '_')}${langSuffix}.pdf`)
                    : (isRejection
                        ? `Interview_Outcome_${candidate.full_name.replace(/\s+/g, '_')}${langSuffix}.pdf`
                        : `Job_Offer_Letter_${candidate.full_name.replace(/\s+/g, '_')}${langSuffix}.pdf`)
                pdf.save(filename)
            }

            if (pdfLanguageMode === 'both') {
                // 1. Download Vietnamese version
                setPdfLanguageMode('vi')
                await generateSinglePDF('vi')

                // 2. Download English version
                setPdfLanguageMode('en')
                await generateSinglePDF('en')

                // 3. Reset state back to 'both'
                setPdfLanguageMode('both')
            } else {
                await generateSinglePDF(pdfLanguageMode)
            }

        } catch (err: any) {
            console.error('Error generating PDF:', err)
            alert(err.message || 'Failed to generate PDF')
        } finally {
            setSaving(false)
        }
    }

    const handleOfferRejected = () => {
        setRejectionReasonText('')
        setRejectionModalOpen(true)
    }

    const submitOfferRejection = async () => {
        if (!candidate || !rejectionReasonText.trim()) return

        const payload = {
            rejection_reason: rejectionReasonText.trim(),
            offer_approval_status: 'none'
        }
        const activityMsg = `Candidate ${candidate.full_name} rejected the job offer (Reason: ${rejectionReasonText.trim()}) / Ứng viên ${candidate.full_name} đã từ chối offer (Lý do: ${rejectionReasonText.trim()})`
        
        setRejectionModalOpen(false)
        await handleUpdateStage('rejected', payload, activityMsg)
    }

    const handleSaveOnboarding = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!candidate) return

        if (!lastName.trim() || !firstName.trim() || !phone.trim() || !email.trim() || !city.trim() || !address.trim()) {
            alert(isVI
                ? 'Vui lòng điền đầy đủ các trường bắt buộc (Họ, Tên, Số điện thoại, Email, Thành phố, Địa chỉ).'
                : 'Please fill in all required fields (Last name, First name, Phone, Email, City, Address).');
            return
        }

        if (!dateOfBirth || dateOfBirth.trim() === '') {
            alert(isVI
                ? 'Vui lòng nhập đầy đủ ngày sinh (ngày, tháng, năm) của nhân viên.'
                : 'Please enter the complete date of birth (day, month, year) for the staff member.');
            return
        }

        if (!docPhotoFile && !hasExistingIdPhoto) {
            alert(isVI
                ? 'Vui lòng đính kèm ảnh CCCD / CMND / Hộ chiếu.'
                : 'Please attach an ID Card / Passport photo.');
            return
        }

        if (selectedBranches.length === 0) {
            alert(isVI
                ? 'Nhân viên phải được phân công ít nhất một chi nhánh.'
                : 'At least one branch must be assigned to the staff member.');
            return
        }

        try {
            setSaving(true)

            // 1. Check for duplicates in hr_staff
            const phoneVal = phone.trim() || null
            const emailVal = email.trim() || null
            const docNumVal = documentNumber?.trim() || null
            let existingStaffIdToUpdate = candidate.related_staff_id || null

            if (phoneVal || emailVal || docNumVal) {
                let query = supabase.from('hr_staff').select('id, full_name, status, phone, email, document_number, rehire_eligible')
                let orParts: string[] = []
                if (phoneVal) orParts.push(`phone.eq."${phoneVal}"`)
                if (emailVal) orParts.push(`email.ilike."${emailVal}"`)
                if (docNumVal) orParts.push(`document_number.eq."${docNumVal}"`)
                
                query = query.or(orParts.join(','))
                const { data, error } = await query
                if (!error && data && data.length > 0) {
                    const duplicate = data[0]
                    if (duplicate.rehire_eligible === false) {
                        alert(isVI 
                            ? `Không thể tuyển dụng: Nhân sự "${duplicate.full_name}" đã được đánh dấu là Không đủ điều kiện tuyển dụng lại.` 
                            : `Cannot onboard: Staff member "${duplicate.full_name}" is marked as Not Eligible for rehire.`);
                        setSaving(false)
                        return
                    }
                    if (duplicate.id !== candidate.related_staff_id) {
                        if (duplicate.status === 'active') {
                            alert(isVI 
                                ? `Không thể lưu: Nhân viên "${duplicate.full_name}" đang hoạt động đã tồn tại với thông tin liên hệ/giấy tờ này.` 
                                : `Cannot save: An active staff member named "${duplicate.full_name}" already exists with this contact/document info.`);
                            setSaving(false)
                            return
                        } else {
                            const statusLabel = duplicate.status === 'terminated' 
                                ? (isVI ? 'đã thôi việc' : 'terminated') 
                                : duplicate.status === 'inactive' 
                                    ? (isVI ? 'ngừng hoạt động' : 'inactive') 
                                    : (isVI ? 'chờ duyệt' : 'pending');
                                    
                            const confirmOverwrite = isVI
                                ? `Tìm thấy hồ sơ nhân viên "${duplicate.full_name}" (trạng thái: ${statusLabel}) trùng khớp với thông tin liên hệ/giấy tờ này. Bạn có chắc chắn muốn liên kết và ghi đè thông tin mới lên hồ sơ này không?`
                                : `Found an existing staff profile for "${duplicate.full_name}" (status: ${statusLabel}) with matching contact/document details. Are you sure you want to link and overwrite this profile with the new onboarding details?`;
                            
                            if (!confirm(confirmOverwrite)) {
                                setSaving(false)
                                return
                            }
                            existingStaffIdToUpdate = duplicate.id
                        }
                    } else {
                        existingStaffIdToUpdate = duplicate.id
                    }
                }
            }

            // Check for duplicate bank account + bank name
            const bankNameVal = bankName.trim() || null
            const bankAccNumVal = bankAccountNumber.trim() || null
            if (bankNameVal && bankAccNumVal) {
                let bankQuery = supabase.from('hr_staff')
                    .select('id, full_name, status')
                    .eq('bank_name', bankNameVal)
                    .eq('bank_account_number', bankAccNumVal)
                
                if (existingStaffIdToUpdate) {
                    bankQuery = bankQuery.neq('id', existingStaffIdToUpdate)
                }
                const { data: bankDupData, error: bankDupErr } = await bankQuery
                if (!bankDupErr && bankDupData && bankDupData.length > 0) {
                    const duplicate = bankDupData[0]
                    const duplicateStatus = duplicate.status === 'active' 
                        ? (isVI ? 'Đang hoạt động' : 'active') 
                        : duplicate.status === 'inactive' 
                            ? (isVI ? 'Ngừng hoạt động' : 'inactive') 
                            : (isVI ? 'Đã thôi việc' : 'terminated')
                            
                    alert(isVI
                        ? `Không thể lưu: Tài khoản ngân hàng này đã được sử dụng bởi nhân viên "${duplicate.full_name}" (${duplicateStatus}).`
                        : `Cannot save: This bank account is already in use by staff member "${duplicate.full_name}" (${duplicateStatus}).`)
                    setSaving(false)
                    return
                }
            }

            const buildFullName = [lastName.trim(), middleName.trim(), firstName.trim()]
                .filter(Boolean)
                .join(' ')
            const deptName = departments.find(d => d.id === departmentId)?.name || null
            const posName = positions.find(p => p.id === positionId)?.name || ''

            let probationEndDate = null
            const probMonths = parseInt(probationMonths, 10)
            if (startDate && !isNaN(probMonths) && probMonths > 0) {
                const dateObj = new Date(startDate)
                dateObj.setMonth(dateObj.getMonth() + probMonths)
                dateObj.setDate(dateObj.getDate() - 1)
                probationEndDate = dateObj.toISOString().split('T')[0]
            }

            const staffPayload = {
                full_name: buildFullName,
                position: posName,
                department: deptName,
                department_id: departmentId || null,
                position_id: positionId || null,
                phone: phone.trim() || null,
                email: email.trim() || null,
                city: city.trim() || null,
                address: address.trim() || null,
                skill_level: null,
                employment_type: employmentType,
                salary_type: salaryType,
                salary_amount: parseFloat(salaryAmount.replace(/,/g, '')) || 0,
                start_date: startDate || null,
                probation_months: isNaN(probMonths) ? 0 : probMonths,
                probation_salary_pct: probationSalaryPcts.length > 0 ? (parseFloat(probationSalaryPcts[0]) || 100) : (parseFloat(probationSalaryPct) || 100),
                probation_salary_pcts: probationSalaryPcts.length > 0 ? probationSalaryPcts.map(parseFloat) : null,
                probation_end_date: probationEndDate,
                status: 'active',
                notes: notes.trim() || null,
                bank_name: bankName.trim() || null,
                bank_account_number: bankAccountNumber.trim() || null,
                bank_account_name: bankSameAsStaff ? buildFullName : (bankAccountName.trim() || null),
                bank_same_as_staff: bankSameAsStaff,
                cv_doc_url: candidate.cv_url || null,
                document_type: documentType,
                document_number: documentNumber || null,
                staff_code: null,
                date_of_birth: dateOfBirth || null,
                gender: gender.trim() || null,
                marital_status: maritalStatus.trim() || null,
                bank_branch: bankBranch.trim() || null,
                emergency_contact_name: emergencyContactName.trim() || null,
                emergency_contact_relationship: emergencyContactRelationship.trim() || null,
                emergency_contact_phone: emergencyContactPhone.trim() || null,
                document_issue_date: documentIssueDate || null,
                document_issue_place: documentIssuePlace.trim() || null,
            }

            // 3. Save staff (Update or Insert)
            let savedStaff = null
            if (existingStaffIdToUpdate) {
                const { data, error: staffErr } = await supabase
                    .from('hr_staff')
                    .update({
                        ...staffPayload,
                        portal_password_hash: null, // Clear old password on re-hire
                        application_count: previousStaffMember ? (previousStaffMember.application_count || 1) + 1 : 2,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existingStaffIdToUpdate)
                    .select()
                    .single()

                if (staffErr) throw staffErr
                savedStaff = data

                // Role and Salary history logs
                const typeLabel = employmentType === 'full_time' ? 'full-time' : employmentType === 'part_time' ? 'part-time' : 'outsourced'
                await supabase.from('hr_staff_role_history').insert([{
                    staff_id: savedStaff.id,
                    effective_date: startDate || new Date().toISOString().split('T')[0],
                    new_position_id: positionId || null,
                    new_department_id: departmentId || null,
                    reason: `[RE-HIRED] Re-hired as ${typeLabel} - ${posName}`,
                    notes: 'Re-hired through recruitment flow'
                }])

                await supabase.from('hr_staff_salary_history').insert([{
                    staff_id: savedStaff.id,
                    effective_date: startDate || new Date().toISOString().split('T')[0],
                    new_amount: parseFloat(salaryAmount.replace(/,/g, '')) || 0,
                    salary_type: salaryType,
                    record_type: 'promotion',
                    reason: `Re-hired with basic salary ${parseFloat(salaryAmount.replace(/,/g, '')).toLocaleString('en-US')} VND`,
                    notes: 'Re-hired through recruitment flow'
                }])
            } else {
                const { data, error: staffErr } = await supabase
                    .from('hr_staff')
                    .insert([{
                        ...staffPayload,
                        application_count: 1
                    }])
                    .select()
                    .single()

                if (staffErr) throw staffErr
                savedStaff = data
            }

            // Link candidate CV to hr_staff_documents if present (only if not already linked)
            if (savedStaff && candidate.cv_url) {
                const cvExists = staffDocuments.some(d => d.document_category === 'CV')
                if (!cvExists) {
                    const { error: cvErr } = await supabase
                        .from('hr_staff_documents')
                        .insert({
                            staff_id: savedStaff.id,
                            document_name: 'Curriculum Vitae',
                            document_category: 'CV',
                            file_url: candidate.cv_url
                        })
                    if (cvErr) {
                        console.error('Error linking CV to staff documents:', cvErr)
                    }
                }
            }

            // Upload document photo to storage and link to staff documents
            if (savedStaff && docPhotoFile) {
                const ext = docPhotoFile.name.split('.').pop() || 'jpg'
                const fileName = `${savedStaff.id}/id_card_${Date.now()}.${ext}`

                const { error: uploadError } = await supabase.storage
                    .from('hr-documents')
                    .upload(fileName, docPhotoFile)

                if (uploadError) throw uploadError

                const { data: urlData } = supabase.storage
                    .from('hr-documents')
                    .getPublicUrl(fileName)

                const { error: docErr } = await supabase
                    .from('hr_staff_documents')
                    .insert({
                        staff_id: savedStaff.id,
                        document_name: isVI ? 'Ảnh CCCD / CMND' : 'ID Card Photo',
                        document_category: 'ID Card',
                        file_url: urlData.publicUrl
                    })

                if (docErr) {
                    console.error('Error linking document photo to staff:', docErr)
                }
            }

            // 4. Insert staff branches
            if (savedStaff && selectedBranches.length > 0) {
                if (existingStaffIdToUpdate) {
                    await supabase.from('hr_staff_branches').delete().eq('staff_id', savedStaff.id)
                }
                const rows = selectedBranches.map(bid => ({
                    staff_id: savedStaff.id,
                    branch_id: bid,
                    is_primary: false,
                }))
                const { error: brErr } = await supabase.from('hr_staff_branches').insert(rows)
                if (brErr) throw brErr
            }

            // 5. Update Candidate status to 'hired' and link related_staff_id
            const activityMsg = `Candidate ${candidate.full_name} successfully onboarded and added to active staff / Ứng viên ${candidate.full_name} đã hoàn tất nhận việc và được thêm vào danh sách nhân sự.`
            
            const { error: candErr } = await supabase
                .from('candidates')
                .update({
                    stage: 'hired',
                    related_staff_id: savedStaff.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', candidate.id)

            if (candErr) throw candErr

            // Log activity
            await supabase.from('hr_activity_log').insert([{
                hiring_request_id: candidate.hiring_request_id,
                action_type: 'candidate_status_changed',
                message: activityMsg
            }])

            // Trigger automatic enrollment/onboarding activation email
            if (savedStaff && savedStaff.email) {
                try {
                    const enrollRes = await fetch('/api/staff-portal/enroll', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ staffId: savedStaff.id, action: 'enroll' })
                    })
                    if (!enrollRes.ok) {
                        let errorMsg = 'Failed to enroll';
                        try {
                            const text = await enrollRes.text();
                            if (text) {
                                const parsed = JSON.parse(text);
                                errorMsg = parsed.error || text;
                            }
                        } catch (_) {}
                        console.warn('Auto-enrollment warning:', errorMsg);
                    }
                } catch (enrollErr) {
                    console.error('Failed to trigger auto-enrollment email:', enrollErr)
                }
            }

            // Force refresh of recruitment statistics
            await supabase.from('app_settings').select('id').limit(1)

            await fetchCandidateDetails()
            onSuccess('onboard')
        } catch (err: any) {
            console.error('Error hiring staff:', err)
            alert(err.message || 'Failed to onboard candidate')
        } finally {
            setSaving(false)
        }
    }

    const handleRevertOnboarding = async () => {
        if (!candidate) return
        
        const confirmMsg = isVI
            ? 'Bạn có chắc chắn muốn hủy nhận việc của ứng viên này?'
            : 'Are you sure you want to revert onboarding for this candidate?'
        
        if (!confirm(confirmMsg)) return

        try {
            setSaving(true)

            // Find staff member by matching email, phone or name
            let staffIdToDelete = null
            let isPortalActive = false
            if (candidate.email || candidate.phone || candidate.full_name) {
                let q = supabase.from('hr_staff').select('id, portal_password_hash')
                if (candidate.email && candidate.phone) {
                    q = q.or(`email.eq."${candidate.email}",phone.eq."${candidate.phone}"`)
                } else if (candidate.email) {
                    q = q.eq('email', candidate.email)
                } else if (candidate.phone) {
                    q = q.eq('phone', candidate.phone)
                } else {
                    q = q.eq('full_name', candidate.full_name).eq('status', 'active')
                }
                const { data } = await q
                if (data && data.length > 0) {
                    staffIdToDelete = data[0].id
                    isPortalActive = !!data[0].portal_password_hash
                }
            }

            if (isPortalActive) {
                alert(isVI
                    ? 'Không thể hoàn tác nhận việc vì nhân viên này đã kích hoạt tài khoản cổng thông tin.'
                    : 'Cannot revert onboarding because this staff member has already activated their portal account.')
                setSaving(false)
                return
            }

            if (staffIdToDelete) {
                // Fetch current application count
                const { data: staffData } = await supabase
                    .from('hr_staff')
                    .select('application_count')
                    .eq('id', staffIdToDelete)
                    .single()

                const appCount = staffData ? (staffData.application_count || 1) : 1

                if (appCount > 1) {
                    // It was an ex-employee re-hired. Restore status to terminated, decrement application count
                    const { error: updateErr } = await supabase
                        .from('hr_staff')
                        .update({
                            status: 'terminated',
                            application_count: appCount - 1,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', staffIdToDelete)
                    if (updateErr) throw updateErr
                } else {
                    // It was a new hire. Change status to pending to preserve form fields
                    const { error: updateErr } = await supabase
                        .from('hr_staff')
                        .update({
                            status: 'pending',
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', staffIdToDelete)
                    if (updateErr) throw updateErr
                }

                // Clean up any onboarding salary/role history logs that were created during onboarding
                await supabase
                    .from('hr_staff_role_history')
                    .delete()
                    .eq('staff_id', staffIdToDelete)
                    .eq('notes', 'Re-hired through recruitment flow')

                await supabase
                    .from('hr_staff_salary_history')
                    .delete()
                    .eq('staff_id', staffIdToDelete)
                    .eq('notes', 'Re-hired through recruitment flow')
            }

            const payload = {}
            const activityMsg = `Reverted onboarding for candidate ${candidate.full_name} back to onboarding stage / Hủy nhận việc cho ứng viên ${candidate.full_name}, chuyển lại về trạng thái onboarding`
            await handleUpdateStage('trial_shift', payload, activityMsg, 'revert')
        } catch (err: any) {
            console.error('Error reverting onboarding:', err)
            alert(err.message || 'Failed to revert onboarding')
        } finally {
            setSaving(false)
        }
    }

    const handleMarkNoShow = async () => {
        if (!candidate) return
        
        const confirmMsg = isVI
            ? 'Bạn có chắc chắn muốn đánh dấu ứng viên này là Không đến nhận việc (No Show)? Việc này cũng sẽ xóa hồ sơ nhân sự đã tạo.'
            : 'Are you sure you want to mark this candidate as a No Show? This will delete the created staff profile.'
        
        if (!confirm(confirmMsg)) return

        try {
            setSaving(true)

            // Find staff member by matching email, phone or name
            let staffIdToDelete = null
            let isPortalActive = false
            if (candidate.email || candidate.phone || candidate.full_name) {
                let q = supabase.from('hr_staff').select('id, portal_password_hash')
                if (candidate.email && candidate.phone) {
                    q = q.or(`email.eq."${candidate.email}",phone.eq."${candidate.phone}"`)
                } else if (candidate.email) {
                    q = q.eq('email', candidate.email)
                } else if (candidate.phone) {
                    q = q.eq('phone', candidate.phone)
                } else {
                    q = q.eq('full_name', candidate.full_name).eq('status', 'active')
                }
                const { data } = await q
                if (data && data.length > 0) {
                    staffIdToDelete = data[0].id
                    isPortalActive = !!data[0].portal_password_hash
                }
            }

            if (isPortalActive) {
                alert(isVI
                    ? 'Không thể hoàn tác nhận việc vì nhân viên này đã kích hoạt tài khoản cổng thông tin.'
                    : 'Cannot revert onboarding because this staff member has already activated their portal account.')
                setSaving(false)
                return
            }

            if (staffIdToDelete) {
                // Delete linked branches
                await supabase.from('hr_staff_branches').delete().eq('staff_id', staffIdToDelete)
                // Delete linked documents
                await supabase.from('hr_staff_documents').delete().eq('staff_id', staffIdToDelete)
                // Delete staff member itself
                const { error: deleteErr } = await supabase.from('hr_staff').delete().eq('id', staffIdToDelete)
                if (deleteErr) throw deleteErr
            }

            const payload = {
                rejection_reason: 'No Show - Candidate did not present themselves on the first day / Không đến nhận việc',
                screening_notes: 'No Show - Candidate did not present themselves on the first day / Không đến nhận việc'
            }
            const activityMsg = `Candidate ${candidate.full_name} marked as No Show, staff profile deleted / Ứng viên ${candidate.full_name} được đánh dấu là Không đến nhận việc, đã xóa hồ sơ nhân viên.`
            await handleUpdateStage('rejected', payload, activityMsg)
        } catch (err: any) {
            console.error('Error marking candidate as no show:', err)
            alert(err.message || 'Failed to mark candidate as no show')
        } finally {
            setSaving(false)
        }
    }

    const handleRevertToOffer = async () => {
        if (!candidate) return
        const activityMsg = `Reverted onboarding and went back to Job Offer for candidate ${candidate.full_name} / Hủy onboarding và quay lại bước Offer cho ứng viên ${candidate.full_name}`
        await handleUpdateStage('offer_sent', { offer_approval_status: 'approved' }, activityMsg)
    }

    const handleRevertInterviewEvaluation = async () => {
        if (!candidate) return
        const payload = {
            interview_rating: null,
            interview_feedback: null,
            interviewed_by: null,
            offer_approval_status: 'none'
        }
        const activityMsg = `Reverted interview evaluation for candidate ${candidate.full_name} / Hủy đánh giá phỏng vấn cho ứng viên ${candidate.full_name}, chuyển về trạng thái đã phỏng vấn`
        await handleUpdateStage('interviewed', payload, activityMsg)
    }

    const handleRevertInterview = async () => {
        if (!candidate) return

        const confirmMsg = isVI
            ? "⚠️ Cảnh báo: Việc hủy (Undo) sẽ xóa vĩnh viễn tất cả câu trả lời và đánh giá của buổi phỏng vấn này. Bạn có chắc chắn muốn tiếp tục?"
            : "⚠️ Warning: Reverting (Undo) will permanently delete all questionnaire answers and evaluations for this interview. Are you sure you want to proceed?"

        if (!window.confirm(confirmMsg)) return

        const payload = {
            interview_answers: null,
            interview_rating: null,
            interview_feedback: null,
            interviewed_by: null
        }
        const activityMsg = `Reverted interview questionnaire for candidate ${candidate.full_name} / Hủy phỏng vấn cho ứng viên ${candidate.full_name}, chuyển về trạng thái đặt lịch`
        await handleUpdateStage('interview_scheduled', payload, activityMsg)
    }

    const handleRevertSchedule = async () => {
        if (!candidate) return
        const payload = {
            interview_scheduled_at: null,
            interview_location: null,
            interview_answers: null,
            interview_rating: null,
            interview_feedback: null,
            interviewed_by: null
        }
        const activityMsg = `Reverted scheduled interview for candidate ${candidate.full_name} / Hủy lịch phỏng vấn cho ứng viên ${candidate.full_name}, chuyển về trạng thái đã lọc`
        await handleUpdateStage('screened', payload, activityMsg)
    }

    const handleRevertScreening = async () => {
        if (!candidate) return
        const payload = {
            english_level: null,
            experience_years: null,
            initial_rating: null,
            screening_notes: null,
            screened_by: null,
            interview_scheduled_at: null,
            interview_location: null,
            interview_answers: null,
            interview_rating: null,
            interview_feedback: null,
            interviewed_by: null
        }
        const activityMsg = `Reverted screening for candidate ${candidate.full_name} / Hủy lọc hồ sơ cho ứng viên ${candidate.full_name}, chuyển về trạng thái mới`
        await handleUpdateStage('new', payload, activityMsg)
    }

    const handleRestoreCandidate = async () => {
        setOpenRestoreDialog(true)
    }

    const executeRestoreCandidate = async () => {
        if (!candidate || !selectedTargetRequestId) return
        setRestoring(true)
        try {
            // 1. Save old data to activity log
            const prevHiringReq = (candidate as any).hiring_requests
            const oldDetails = {
                previous_hiring_request_id: candidate.hiring_request_id,
                previous_position: prevHiringReq?.position_title || 'Unknown',
                previous_department: prevHiringReq?.department || 'Unknown',
                previous_stage: candidate.stage,
                previous_screening_notes: candidate.screening_notes || null,
                previous_interview_rating: candidate.interview_rating || null,
                previous_interview_feedback: candidate.interview_feedback || null,
                previous_interview_answers: candidate.interview_answers || null,
                previous_rejection_reason: candidate.rejection_reason || null,
                application_number: candidate.application_count || 1
            }

            const logMsg = `Candidate restored for new application (Hiring Request: ${selectedTargetRequestId}). Previous application status: ${candidate.stage} / Khôi phục ứng viên cho đợt tuyển dụng mới. Trạng thái ứng tuyển trước đó: ${candidate.stage}`

            await supabase.from('hr_activity_log').insert([{
                hiring_request_id: candidate.hiring_request_id,
                action_type: 'candidate_restored',
                message: logMsg,
                payload: oldDetails
            }])

            // 2. Update candidates table record
            const newCount = (candidate.application_count || 1) + 1
            const { error: updateErr } = await supabase
                .from('candidates')
                .update({
                    hiring_request_id: selectedTargetRequestId,
                    stage: 'new',
                    related_staff_id: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    application_count: newCount,
                    screening_notes: null,
                    initial_rating: 3,
                    experience_years: null,
                    english_level: 'Basic',
                    interview_scheduled_at: null,
                    interview_location: null,
                    interview_rating: null,
                    interview_feedback: null,
                    interview_answers: null,
                    offer_salary_amount: null,
                    offer_salary_type: null,
                    probation_months: null,
                    probation_salary_pct: null,
                    probation_salary_pcts: null,
                    offer_start_date: null,
                    offer_branch_id: null,
                    offer_expiry_date: null,
                    rejection_reason: null,
                    offer_approval_status: 'none',
                    offer_approval_notes: null,
                    offer_approval_by: null,
                    offer_approval_at: null
                })
                .eq('id', candidate.id)

            if (updateErr) throw updateErr

            // 3. Update staff application counter if linked
            if (candidate.related_staff_id) {
                const { data: stData } = await supabase
                    .from('hr_staff')
                    .select('application_count')
                    .eq('id', candidate.related_staff_id)
                    .single()
                const currentCount = stData?.application_count || 1
                await supabase
                    .from('hr_staff')
                    .update({ application_count: currentCount + 1 })
                    .eq('id', candidate.related_staff_id)
            }

            alert(isVI ? 'Khôi phục ứng viên thành công!' : 'Candidate restored successfully!')
            setOpenRestoreDialog(false)
            onSuccess('restore')
            onClose()
        } catch (err: any) {
            console.error('Error restoring candidate:', err)
            alert(err.message || 'Failed to restore candidate')
        } finally {
            setRestoring(false)
        }
    }

    const renderStars = (rating: number, interactive = false, onChange?: (val: number) => void) => {
        return (
            <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(star => {
                    const active = star <= rating
                    if (interactive && onChange) {
                        return (
                            <button
                                key={star}
                                type="button"
                                onClick={() => onChange(star)}
                                className="p-0.5 hover:scale-110 transition cursor-pointer"
                            >
                                {active ? (
                                    <StarIconSolid className="h-5 w-5 text-amber-500" />
                                ) : (
                                    <StarIcon className="h-5 w-5 text-slate-300 hover:text-amber-400" />
                                )}
                            </button>
                        )
                    }
                    return active ? (
                        <StarIconSolid key={star} className="h-4 w-4 text-amber-500" />
                    ) : (
                        <StarIcon key={star} className="h-4 w-4 text-slate-205" />
                    )
                })}
            </div>
        )
    }

    const activeStep = getActiveStepForCandidate(candidate)
    const matchedBranches = branches.filter(b => 
        (candidate as any)?.hiring_requests?.branch_ids?.includes(b.id)
    )
    const companyName = (matchedBranches[0] as any)?.company_name || 'Pasta Fresca'
    const branchNames = matchedBranches.map(b => b.address ? `${b.name} - ${b.address}` : b.name).join(', ')

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
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
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
                            <DialogPanel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl border border-gray-100 transition-all text-gray-900">
                                
                                <div className="flex items-center justify-between mb-5 pb-3 border-b border-gray-100">
                                    <div className="text-left">
                                        <DialogTitle as="h3" className="text-lg font-bold text-slate-800">
                                            {isVI ? 'Hồ sơ & Workflow ứng viên' : 'Candidate Profile & Workflow'}
                                        </DialogTitle>
                                        <p className="text-xs text-slate-500 font-semibold mt-0.5">
                                            {isVI ? 'Theo dõi và cập nhật trạng thái tuyển dụng' : 'Track and update candidate recruitment status'}
                                        </p>
                                    </div>
                                    <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 transition cursor-pointer">
                                        <XMarkIcon className="h-5 w-5 text-slate-400" />
                                    </button>
                                </div>

                                {loading ? (
                                    <div className="py-20 text-center text-sm font-semibold text-slate-500">
                                        {isVI ? 'Đang tải thông tin ứng viên...' : 'Loading candidate details...'}
                                    </div>
                                ) : !candidate ? (
                                    <div className="py-20 text-center text-sm font-bold text-red-500">
                                        {isVI ? 'Không tìm thấy thông tin ứng viên' : 'Candidate details not found'}
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {/* Candidate Card Summary */}
                                        <div className="p-5 bg-slate-50 border border-slate-150 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-start gap-6 lg:gap-5">
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
                                                {/* Initials Avatar */}
                                                <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-150 flex items-center justify-center shrink-0 text-blue-650 font-bold text-lg">
                                                    {candidate.full_name ? candidate.full_name.split(' ').pop()?.charAt(0).toUpperCase() : '?'}
                                                </div>
                                                
                                                <div className="space-y-1.5 flex-1 min-w-0 text-left">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h4 className="text-base font-extrabold text-slate-800 leading-snug">{candidate.full_name}</h4>
                                                        {candidate.source && (
                                                            <span className="bg-slate-200 text-slate-650 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">
                                                                {isVI ? 'Nguồn:' : 'Source:'} {candidate.source}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-semibold">
                                                        {candidate.phone && (
                                                            <span className="flex items-center gap-1">
                                                                <span className="text-slate-400">📞</span> {candidate.phone}
                                                            </span>
                                                        )}
                                                        {candidate.email && (
                                                            <>
                                                                <span className="text-slate-300">•</span>
                                                                <span className="flex items-center gap-1 min-w-0 truncate" title={candidate.email}>
                                                                    <span className="text-slate-400">✉</span> {candidate.email}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Structured Meta Fields with light dividers (shifted to the left) */}
                                            <div className="flex flex-col gap-3 border-t lg:border-t-0 lg:border-l border-slate-200 pt-4 lg:pt-0 lg:pl-3 shrink-0 text-xs text-slate-600 font-bold">
                                                <div className="flex items-center gap-6">
                                                    {candidate.date_of_birth && (
                                                        <div className="space-y-0.5 text-left">
                                                            <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{isVI ? 'Ngày sinh' : 'Date of Birth'}</span>
                                                            <span className="text-slate-800 flex items-center gap-1">🎂 {candidate.date_of_birth.endsWith('-01-01') ? candidate.date_of_birth.substring(0, 4) : formatToDDMMYYYY(candidate.date_of_birth)}</span>
                                                        </div>
                                                    )}
                                                    {candidate.gender && (
                                                        <div className="space-y-0.5 text-left">
                                                            <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{isVI ? 'Giới tính' : 'Gender'}</span>
                                                            <span className="text-slate-800 flex items-center gap-1">👤 {candidate.gender === 'Nam' ? (isVI ? 'Nam' : 'Male') : candidate.gender === 'Nữ' ? (isVI ? 'Nữ' : 'Female') : (isVI ? 'Khác' : 'Other')}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {(candidate.city || candidate.address) && (
                                                    <div className="space-y-0.5 text-left min-w-[150px] max-w-[240px]">
                                                        <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{isVI ? 'Địa chỉ' : 'Address'}</span>
                                                        <span className="text-slate-800 flex items-center gap-1 truncate" title={candidate.address ? `${candidate.address}, ${candidate.city || ''}` : candidate.city || ''}>
                                                            📍 {candidate.address ? `${candidate.address}, ` : ''}{candidate.city || ''}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action Buttons pushed to the right */}
                                            <div className="flex items-center gap-2 lg:ml-auto">
                                                {candidate.cv_url && (
                                                    <a
                                                        href={candidate.cv_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:border-blue-200 hover:bg-blue-50/50 text-xs font-semibold text-slate-600 hover:text-blue-650 transition cursor-pointer flex items-center gap-1.5"
                                                    >
                                                        <PaperClipIcon className="h-4 w-4" />
                                                        <span>{isVI ? 'Xem CV' : 'View CV'}</span>
                                                    </a>
                                                )}
                                                {(() => {
                                                    const relatedStaffStatus = (candidate as any).related_staff?.status;
                                                    const isHiredAndActive = candidate.stage === 'hired' && 
                                                        relatedStaffStatus && 
                                                        (relatedStaffStatus === 'active' || relatedStaffStatus === 'pending');
                                                    
                                                    const canRestore = (candidate.stage === 'rejected' || candidate.stage === 'withdrawn');
                                                    
                                                    if (!canRestore) return null;
                                                    
                                                    return (
                                                        <button
                                                            onClick={handleRestoreCandidate}
                                                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline transition flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer"
                                                        >
                                                            <ArrowPathIcon className="h-3.5 w-3.5" />
                                                            <span>{isVI ? 'Khôi phục ứng viên' : 'Restore Candidate'}</span>
                                                        </button>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        {/* Workflow Steps Line / Stepper acting as tabs */}
                                        <div className="relative">
                                            {/* Line */}
                                            <div className="absolute top-4 left-4 right-4 h-0.5 bg-slate-100 -z-10 hidden sm:block" />
                                            
                                            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                                                {[
                                                    { num: 1, label_en: 'CV Screening', label_vi: 'Lọc hồ sơ' },
                                                    { num: 2, label_en: 'Schedule', label_vi: 'Đặt lịch' },
                                                    { num: 3, label_en: 'Interview', label_vi: 'Phỏng vấn' },
                                                    { num: 4, label_en: 'Evaluation', label_vi: 'Đánh giá' },
                                                    { num: 5, label_en: 'Job Offer', label_vi: 'Offer' },
                                                    { num: 6, label_en: 'Onboard', label_vi: 'Nhận việc' }
                                                ].map(step => {
                                                     const isCompleted = (candidate.stage === 'hired') || (step.num < activeStep && candidate.stage !== 'rejected')
                                                     const isCurrent = step.num === activeStep && candidate.stage !== 'rejected' && candidate.stage !== 'hired'
                                                     const isSelected = selectedTab === step.num
                                                     const isRejectedFutureStep = candidate.stage === 'rejected' && step.num > activeStep
                                                     
                                                     let circleClass = 'bg-slate-100 text-slate-400 border-slate-200'
                                                     if (isCompleted) circleClass = 'bg-green-600 border-green-600 text-white'
                                                     if (isCurrent) circleClass = 'bg-blue-650 border-blue-650 text-white'
                                                     if (isRejectedFutureStep) circleClass = 'bg-red-50/50 border-red-100/80 text-red-500'
                                                     if (isSelected) {
                                                         circleClass += ' ring-4 ring-blue-100'
                                                     }
                                                     
                                                     const isDisabled = isRejectedFutureStep

                                                     return (
                                                         <button
                                                             key={step.num}
                                                             type="button"
                                                             disabled={isDisabled}
                                                             onClick={() => !isDisabled && setSelectedTab(step.num)}
                                                             className={`flex sm:flex-col items-center gap-3 sm:gap-2 focus:outline-none group w-full text-center ${
                                                                 isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                                                             }`}
                                                         >
                                                             <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold transition-all ${circleClass} ${
                                                                 isDisabled ? '' : 'group-hover:scale-105'
                                                             }`}>
                                                                 {isCompleted ? '✓' : isRejectedFutureStep ? '✗' : step.num}
                                                             </div>
                                                            <div className="text-left sm:text-center">
                                                                <span className={`block text-xs font-bold transition-colors ${
                                                                    isSelected
                                                                        ? 'text-blue-650 underline decoration-2 underline-offset-4'
                                                                        : isCurrent
                                                                        ? 'text-blue-500'
                                                                        : isCompleted
                                                                        ? 'text-green-700 font-semibold'
                                                                        : 'text-slate-400'
                                                                }`}>
                                                                    {isVI ? step.label_vi : step.label_en}
                                                                </span>
                                                            </div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>

                                        {/* Tab Content Display Area */}
                                        <div className="pt-2">
                                            {/* Candidate Stage is REJECTED Banner for the step where they failed */}
                                            {candidate.stage === 'rejected' && selectedTab === activeStep && (
                                                <div className="flex items-start gap-4 p-5 bg-slate-50 border border-slate-200 rounded-2xl text-left mb-4 relative">
                                                    <XMarkIcon className="h-8 w-8 text-red-600 bg-red-50 p-1.5 rounded-xl border border-red-100 shrink-0 mt-0.5" />
                                                    <div className="flex-1 space-y-1">
                                                        <h5 className="text-sm font-bold text-slate-800">
                                                            {(() => {
                                                                if (activeStep === 6) {
                                                                    return isVI ? 'Ứng viên không đến nhận việc' : 'Candidate No Show'
                                                                }
                                                                if (activeStep === 5) {
                                                                    return isVI ? 'Ứng viên từ chối lời mời nhận việc' : 'Job Offer Rejected'
                                                                }
                                                                return isVI ? 'Ứng viên đã bị từ chối' : 'Candidate Rejected'
                                                            })()}
                                                        </h5>
                                                        <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                                                            {(() => {
                                                                if (activeStep === 6) {
                                                                    return isVI
                                                                        ? 'Ứng viên đã hoàn thành nhận việc nhưng không đến nhận việc vào ngày đầu tiên đi làm. Bạn có thể khôi phục lại hồ sơ để đánh giá lại.'
                                                                        : 'The candidate completed onboarding but did not show up on the first day of work. You can restore their profile to re-evaluate.'
                                                                }
                                                                if (activeStep === 5) {
                                                                    return isVI
                                                                        ? 'Ứng viên đã từ chối thư mời nhận việc. Bạn có thể khôi phục lại hồ sơ để đánh giá lại hoặc gửi offer mới.'
                                                                        : 'The candidate rejected the job offer. You can restore their profile to re-evaluate or draft a new offer.'
                                                                }
                                                                if (activeStep === 4) {
                                                                    return isVI
                                                                        ? 'Ứng viên không đạt vòng đánh giá phỏng vấn. Bạn có thể khôi phục lại hồ sơ để tiến hành đánh giá lại.'
                                                                        : 'The candidate did not pass the interview evaluation. You can restore their profile to re-evaluate.'
                                                                }
                                                                return isVI
                                                                    ? 'Ứng viên không đạt yêu cầu tuyển dụng cho đợt này. Bạn có thể khôi phục lại hồ sơ để tiến hành đánh giá lại.'
                                                                    : 'The candidate did not meet the recruitment requirements. You can restore their profile to re-evaluate.'
                                                            })()}
                                                        </p>
                                                        {/* Show additional rejection/feedback details if available */}
                                                        {(() => {
                                                            if (activeStep === 6 && candidate.rejection_reason) {
                                                                return (
                                                                    <p className="text-[11px] text-amber-800 font-bold bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/50 mt-2 max-w-lg">
                                                                        ⚠️ {isVI ? 'Chi tiết: ' : 'Details: '} {(() => {
                                                                             const parts = candidate.rejection_reason.split(' / ')
                                                                             return parts.length === 2 ? (isVI ? parts[1] : parts[0]) : candidate.rejection_reason
                                                                         })()}
                                                                    </p>
                                                                )
                                                            }
                                                            if (activeStep === 5 && candidate.rejection_reason) {
                                                                return (
                                                                    <p className="text-[11px] text-red-800 font-bold bg-red-50/50 p-2.5 rounded-lg border border-red-100/50 mt-2 max-w-lg">
                                                                        📌 {isVI ? 'Lý do từ chối: ' : 'Rejection Reason: '} {(() => {
                                                                             const parts = candidate.rejection_reason.split(' / ')
                                                                             return parts.length === 2 ? (isVI ? parts[1] : parts[0]) : candidate.rejection_reason
                                                                         })()}
                                                                    </p>
                                                                )
                                                            }
                                                            if (activeStep === 4 && candidate.interview_feedback) {
                                                                return (
                                                                    <p className="text-[11px] text-slate-700 font-bold bg-slate-100/60 p-2.5 rounded-lg border border-slate-200/50 mt-2 max-w-lg">
                                                                        💬 {isVI ? 'Nhận xét phỏng vấn: ' : 'Interview Feedback: '} {candidate.interview_feedback}
                                                                    </p>
                                                                )
                                                            }
                                                            return null
                                                        })()}
                                                        <div className="pt-2">
                                                            <button
                                                                type="button"
                                                                disabled={saving}
                                                                onClick={handleRestoreCandidate}
                                                                className="text-blue-600 hover:text-blue-700 hover:underline font-bold text-xs cursor-pointer bg-transparent border-0 p-0 outline-none inline-block"
                                                            >
                                                                {saving ? '...' : (isVI ? 'Khôi phục hồ sơ' : 'Restore Candidate')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* TAB 1: CV SCREENING */}
                                            {selectedTab === 1 && (
                                                <div>
                                                    {activeStep > 1 ? (
                                                        /* Summary view when step is passed */
                                                        <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl text-left relative pr-20 space-y-3 font-semibold text-xs text-slate-700">
                                                            <h5 className="text-sm font-bold text-slate-800 pb-2 border-b border-slate-200">
                                                                 {isVI ? 'Kết quả lọc hồ sơ' : 'CV Screening Result'}
                                                            </h5>
                                                            <p>💬 {isVI ? 'Tiếng Anh:' : 'English:'} <span className="text-slate-900 font-bold">{englishLevel}</span></p>
                                                            <p>💼 {isVI ? 'Kinh nghiệm:' : 'Experience:'} <span className="text-slate-900 font-bold">{experienceYears || 'N/A'}</span></p>
                                                            <div className="flex items-center gap-1">
                                                                <span>⭐ {isVI ? 'Đánh giá:' : 'Rating:'}</span>
                                                                {renderStars(initialRating)}
                                                            </div>
                                                            {candidate.screener?.name && (
                                                                <p>👤 {isVI ? 'Người đánh giá:' : 'Assessed by:'} <span className="text-slate-900 font-bold">{candidate.screener.name}</span></p>
                                                            )}
                                                            {screeningNotes && (
                                                                <div className="pt-2 border-t border-slate-200">
                                                                    <p className="text-slate-400 mb-1">📝 {isVI ? 'Ghi chú vòng lọc:' : 'Screening Notes:'}</p>
                                                                    <p className="italic font-normal text-slate-600 whitespace-pre-line">{screeningNotes}</p>
                                                                </div>
                                                            )}
                                                            {activeStep > 1 && (
                                                                <button
                                                                    type="button"
                                                                    disabled={saving}
                                                                    onClick={handleRevertScreening}
                                                                    className="absolute top-4 right-4 text-xs font-bold text-slate-450 hover:text-red-500 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {saving ? '...' : (isVI ? 'Hủy' : 'Undo')}
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : candidate.stage !== 'rejected' ? (
                                                        /* Active form view */
                                                        <div className="border border-slate-100 rounded-2xl p-6 bg-white shadow-sm space-y-5">
                                                            <div className="pb-2 border-b border-slate-100 flex justify-between items-center">
                                                                <h5 className="text-sm font-bold text-slate-800 text-left">
                                                                    {isVI ? 'Vòng lọc hồ sơ & Scrutinio CV' : 'CV Screening & Initial Scrutiny'}
                                                                </h5>
                                                                {currentUserName && (
                                                                    <span className="text-xs text-slate-500 font-semibold bg-slate-100 px-2.5 py-0.5 rounded-md">
                                                                        👤 {isVI ? 'Người đánh giá: ' : 'Assessor: '}{currentUserName}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                <div className="space-y-4">
                                                                    <div>
                                                                        <label htmlFor="english_level" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider text-left">
                                                                            {isVI ? 'Trình độ Tiếng Anh' : 'English Level'}
                                                                        </label>
                                                                        <select
                                                                            id="english_level"
                                                                            value={englishLevel}
                                                                            onChange={e => setEnglishLevel(e.target.value)}
                                                                            className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm h-10 text-gray-900 font-semibold"
                                                                        >
                                                                            <option value="None">{isVI ? 'Không có' : 'None'}</option>
                                                                            <option value="Basic">{isVI ? 'Cơ bản (Basic)' : 'Basic'}</option>
                                                                            <option value="Intermediate">{isVI ? 'Trung cấp (Intermediate)' : 'Intermediate'}</option>
                                                                            <option value="Advanced">{isVI ? 'Thành thạo (Advanced)' : 'Advanced'}</option>
                                                                        </select>
                                                                    </div>
                                                                    <div>
                                                                        <label htmlFor="experience_years" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider text-left">
                                                                            {isVI ? 'Kinh nghiệm làm việc' : 'Work Experience'}
                                                                        </label>
                                                                        <input
                                                                            type="text"
                                                                            id="experience_years"
                                                                            value={experienceYears}
                                                                            onChange={e => setExperienceYears(e.target.value)}
                                                                            placeholder={isVI ? 'Ví dụ: 2 năm, Chưa có kinh nghiệm' : 'e.g. 2 years, Entry-level'}
                                                                            className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm h-10 text-gray-900 font-semibold"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider text-left">
                                                                            {isVI ? 'Đánh giá hồ sơ' : 'CV Rating'}
                                                                        </label>
                                                                        <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex items-center justify-between w-full h-10">
                                                                            <span className="text-[10px] text-slate-550 font-bold uppercase tracking-wider pl-1">
                                                                                {isVI ? 'Đánh giá:' : 'Rating:'}
                                                                            </span>
                                                                            {renderStars(initialRating, true, setInitialRating)}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="flex flex-col justify-between">
                                                                    <div>
                                                                        <label htmlFor="screening_notes" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider text-left">
                                                                            {isVI ? 'Ghi chú vòng lọc' : 'Screening Notes'}
                                                                        </label>
                                                                        <textarea
                                                                            id="screening_notes"
                                                                            rows={6}
                                                                            value={screeningNotes}
                                                                            onChange={e => setScreeningNotes(e.target.value)}
                                                                            placeholder={isVI ? 'Nhập nhận xét nhanh về hồ sơ ứng viên...' : 'Enter quick remarks about candidate CV...'}
                                                                            className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm text-gray-900 font-semibold"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-100 font-bold">
                                                                <button
                                                                    type="button"
                                                                    disabled={saving}
                                                                    onClick={() => handleSaveScreening(false)}
                                                                    className="px-4 py-2 rounded-lg border border-red-200 text-xs font-bold text-red-650 hover:bg-red-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {isVI ? 'Từ chối' : 'Reject'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={saving}
                                                                    onClick={() => handleSaveScreening(true)}
                                                                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {saving ? '...' : (isVI ? 'Đạt & Đi tiếp' : 'Pass Screening')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            )}

                                            {/* TAB 2: SCHEDULE INTERVIEW */}
                                            {selectedTab === 2 && (
                                                <div>
                                                    {activeStep < 2 ? (
                                                        /* Locked state */
                                                        <div className="p-8 bg-slate-50 border border-slate-200 border-dashed rounded-2xl text-center text-slate-400 font-semibold text-xs">
                                                            🔒 {isVI ? 'Yêu cầu vượt qua Vòng lọc hồ sơ để đặt lịch phỏng vấn.' : 'Requires passing CV screening to schedule an interview.'}
                                                        </div>
                                                    ) : activeStep > 2 ? (
                                                        /* Summary view when step is passed */
                                                        <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl text-left relative pr-20 space-y-3 font-semibold text-xs text-slate-700">
                                                            <h5 className="text-sm font-bold text-slate-800 pb-2 border-b border-slate-200">
                                                                {isVI ? 'Chi tiết lịch phỏng vấn' : 'Scheduled Interview Details'}
                                                            </h5>
                                                            <div className="flex items-center gap-2">
                                                                <CalendarIcon className="h-4.5 w-4.5 text-slate-400" />
                                                                <span>📅 {candidate.interview_scheduled_at
                                                                    ? formatDateTime(candidate.interview_scheduled_at)
                                                                    : '...'}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <MapPinIcon className="h-4.5 w-4.5 text-slate-400" />
                                                                <span className="truncate" title={candidate.interview_location || undefined}>📍 {candidate.interview_location || '...'}</span>
                                                            </div>
                                                            {activeStep > 2 && (
                                                                <button
                                                                    type="button"
                                                                    disabled={saving}
                                                                    onClick={handleRevertSchedule}
                                                                    className="absolute top-4 right-4 text-xs font-bold text-slate-450 hover:text-red-500 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {saving ? '...' : (isVI ? 'Hủy' : 'Undo')}
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        /* Active form view */
                                                        <div className="border border-slate-100 rounded-2xl p-6 bg-white shadow-sm space-y-5">
                                                            <div className="pb-2 border-b border-slate-100 flex justify-between items-center">
                                                                <h5 className="text-sm font-bold text-slate-800 text-left">
                                                                    {isVI ? 'Đặt lịch phỏng vấn' : 'Schedule Interview'}
                                                                </h5>
                                                                {currentUserName && (
                                                                    <span className="text-xs text-slate-500 font-semibold bg-slate-100 px-2.5 py-0.5 rounded-md">
                                                                        👤 {isVI ? 'Người lên lịch: ' : 'Scheduler: '}{currentUserName}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                                                                <div>
                                                                    <label htmlFor="interview_date_input" className="block text-xs font-bold text-slate-500 mb-1">
                                                                        {isVI ? 'Ngày phỏng vấn *' : 'Interview Date *'}
                                                                    </label>
                                                                    <input
                                                                        id="interview_date_input"
                                                                        required
                                                                        type="date"
                                                                        value={interviewDate}
                                                                        onChange={e => setInterviewDate(e.target.value)}
                                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label htmlFor="interview_time_input" className="block text-xs font-bold text-slate-500 mb-1">
                                                                        {isVI ? 'Giờ phỏng vấn *' : 'Interview Time *'}
                                                                    </label>
                                                                    <input
                                                                        id="interview_time_input"
                                                                        required
                                                                        type="time"
                                                                        value={interviewTime}
                                                                        onChange={e => setInterviewTime(e.target.value)}
                                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="space-y-3 text-left">
                                                                <label className="block text-xs font-bold text-slate-500">
                                                                    {isVI ? 'Hình thức phỏng vấn *' : 'Interview Type *'}
                                                                </label>
                                                                <div className="flex gap-3">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setLocationType('branch')}
                                                                        className={`px-4 py-2 border rounded-lg text-xs font-bold cursor-pointer transition ${
                                                                            locationType === 'branch'
                                                                                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                                                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                                                        }`}
                                                                    >
                                                                        {isVI ? 'Trực tiếp (Offline)' : 'Offline / In-person'}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setLocationType('online')}
                                                                        className={`px-4 py-2 border rounded-lg text-xs font-bold cursor-pointer transition ${
                                                                            locationType === 'online'
                                                                                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                                                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                                                        }`}
                                                                    >
                                                                        {isVI ? 'Trực tuyến (Online)' : 'Online / Video call'}
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {locationType === 'online' ? (
                                                                <div className="text-left">
                                                                    <label htmlFor="online_link_input" className="block text-xs font-bold text-slate-500 mb-1">
                                                                        {isVI ? 'Link phỏng vấn trực tuyến (Zoom, Meet, ect.)' : 'Online Interview Link (Zoom, Meet, etc.)'}
                                                                    </label>
                                                                    <input
                                                                        id="online_link_input"
                                                                        type="text"
                                                                        value={onlineLink}
                                                                        onChange={e => setOnlineLink(e.target.value)}
                                                                        placeholder="https://meet.google.com/..."
                                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="text-left">
                                                                    <label htmlFor="branch_select" className="block text-xs font-bold text-slate-500 mb-1">
                                                                        {isVI ? 'Chi nhánh phỏng vấn *' : 'Interview Branch *'}
                                                                    </label>
                                                                    <select
                                                                        id="branch_select"
                                                                        value={branchId}
                                                                        onChange={e => setBranchId(e.target.value)}
                                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white"
                                                                    >
                                                                        <option value="">{isVI ? '-- Chọn chi nhánh --' : '-- Select Branch --'}</option>
                                                                        {branches.map(b => (
                                                                            <option key={b.id} value={b.id}>{b.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            )}

                                                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 font-bold">
                                                                <button
                                                                    type="button"
                                                                    disabled={saving || !interviewDate || !interviewTime || (locationType === 'branch' && !branchId)}
                                                                    onClick={handleSaveSchedule}
                                                                    className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition cursor-pointer shadow-sm w-full md:w-auto text-center disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {saving ? '...' : (isVI ? 'Đặt lịch' : 'Schedule')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* TAB 3: INTERVIEW QUESTIONNAIRE */}
                                            {selectedTab === 3 && (
                                                <div>
                                                    {activeStep < 3 ? (
                                                        /* Locked state */
                                                        <div className="p-8 bg-slate-50 border border-slate-200 border-dashed rounded-2xl text-center text-slate-400 font-semibold text-xs">
                                                            🔒 {isVI ? 'Yêu cầu đặt lịch phỏng vấn trước.' : 'Requires scheduling an interview first.'}
                                                        </div>
                                                    ) : activeStep > 3 ? (
                                                        /* Summary view when step is passed */
                                                        <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl text-left relative pr-20 space-y-4 font-semibold text-xs text-slate-700">
                                                            <h5 className="text-sm font-bold text-slate-800 pb-2 border-b border-slate-200 flex items-center gap-1.5">
                                                                <ChatBubbleBottomCenterTextIcon className="h-4.5 w-4.5 text-blue-650" />
                                                                {isVI ? 'Phiếu câu hỏi phỏng vấn đã hoàn thành' : 'Completed Interview Questionnaire'}
                                                            </h5>
                                                             {candidate.stage !== 'hired' && (
                                                                 <div className="absolute top-4 right-4 flex items-center gap-3">
                                                                     <button
                                                                         type="button"
                                                                         onClick={() => setInterviewModeActive(true)}
                                                                         className="text-xs font-bold text-blue-650 hover:text-blue-700 hover:underline cursor-pointer"
                                                                     >
                                                                         {isVI ? 'Sửa' : 'Edit'}
                                                                     </button>
                                                                     <span className="text-slate-350 font-normal">|</span>
                                                                     <button
                                                                         type="button"
                                                                         disabled={saving}
                                                                         onClick={handleRevertInterview}
                                                                         className="text-xs font-bold text-slate-450 hover:text-red-500 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                                     >
                                                                         {saving ? '...' : (isVI ? 'Hủy' : 'Undo')}
                                                                     </button>
                                                                 </div>
                                                             )}
                                                            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                                                                {(() => {
                                                                    let globalQIdx = 0
                                                                    return templateSections.map((sect, sidx) => {
                                                                        const cleanSectEn = sect.name_en.replace(/^\d+\.\s*/, '')
                                                                        const cleanSectVi = sect.name_vi.replace(/^\d+\.\s*/, '')
                                                                        return (
                                                                            <div key={sect.id} className="space-y-3 bg-white border border-slate-150 rounded-2xl p-4 text-left shadow-sm">
                                                                                <h6 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-1.5 mb-2">
                                                                                    {sidx + 1}. {isVI ? cleanSectVi : cleanSectEn}
                                                                                </h6>
                                                                                <div className="space-y-3">
                                                                                    {sect.questions.map(q => {
                                                                                        globalQIdx++
                                                                                        const cleanQTextEn = q.text_en.replace(/^\d+\.\s*/, '')
                                                                                        const cleanQTextVi = q.text_vi.replace(/^\d+\.\s*/, '')
                                                                                        return (
                                                                                            <div key={q.id} className="space-y-1 bg-slate-50 border border-slate-100 rounded-xl p-3 text-left">
                                                                                                <p className="text-slate-450 font-bold text-[11px]">
                                                                                                    {globalQIdx}. {isVI ? cleanQTextVi : cleanQTextEn}
                                                                                                </p>
                                                                                                {q.type === 'yes_no' ? (
                                                                                                    <p className="text-slate-800 font-bold text-xs pt-1">
                                                                                                        {answers[q.id] === 'yes' ? (isVI ? '✅ Có / Yes' : '✅ Yes') :
                                                                                                         answers[q.id] === 'no' ? (isVI ? '❌ Không / No' : '❌ No') :
                                                                                                         (isVI ? '(Chưa trả lời)' : '(No answer)')}
                                                                                                    </p>
                                                                                                ) : (
                                                                                                    <p className="text-slate-800 whitespace-pre-line font-semibold text-xs pt-1">
                                                                                                        {answers[q.id] || (isVI ? '(Chưa trả lời)' : '(No answer)')}
                                                                                                    </p>
                                                                                                )}
                                                                                            </div>
                                                                                        )
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        )
                                                                    })
                                                                })()}
                                                            </div>
                                                        </div>
                                                    ) : !interviewModeActive ? (
                                                        /* Invitation Card to start focused interview */
                                                        <div className="border border-slate-200 border-dashed rounded-2xl p-8 bg-slate-50 text-center space-y-5 animate-in fade-in duration-200">
                                                            <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-150 flex items-center justify-center mx-auto text-blue-650 shadow-sm">
                                                                <ChatBubbleBottomCenterTextIcon className="h-8 w-8" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <h5 className="text-sm font-extrabold text-slate-800">
                                                                    {isVI ? 'Bắt đầu phỏng vấn ứng viên' : 'Start Candidate Interview'}
                                                                </h5>
                                                                <p className="text-xs text-slate-500 font-semibold mt-1 max-w-sm mx-auto leading-relaxed">
                                                                    {isVI
                                                                        ? 'Nhấp vào nút bên dưới để mở bảng câu hỏi phỏng vấn tập trung dành cho ứng viên.'
                                                                        : 'Click the button below to open the focused interview questionnaire for the candidate.'}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setInterviewModeActive(true)}
                                                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition text-xs cursor-pointer shadow-sm inline-flex items-center gap-2"
                                                                >
                                                                    <PlayIcon className="h-4.5 w-4.5 fill-current" />
                                                                    {isVI ? 'Bắt đầu phỏng vấn' : 'Start Interview'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* Interview in progress placeholder state */
                                                        <div className="border border-slate-200 border-dashed rounded-2xl p-8 bg-slate-50 text-center space-y-4 animate-in fade-in duration-200">
                                                            <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-150 flex items-center justify-center mx-auto text-blue-600 animate-pulse shadow-sm">
                                                                <ChatBubbleBottomCenterTextIcon className="h-8 w-8" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <h5 className="text-sm font-extrabold text-blue-800 flex items-center justify-center gap-2">
                                                                    {isVI ? 'Đang thực hiện phỏng vấn...' : 'Interview in Progress...'}
                                                                    {currentUserName && (
                                                                        <span className="text-[10px] text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded">
                                                                            👤 {isVI ? 'Người phỏng vấn: ' : 'Interviewer: '}{currentUserName}
                                                                        </span>
                                                                    )}
                                                                </h5>
                                                                <p className="text-xs text-slate-500 font-semibold mt-1 max-w-sm mx-auto leading-relaxed">
                                                                    {isVI
                                                                        ? 'Bảng câu hỏi phỏng vấn tập trung đang được mở trong cửa sổ modale.'
                                                                        : 'The focused interview questionnaire window is currently open.'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* TAB 4: INTERVIEW EVALUATION */}
                                            {selectedTab === 4 && (
                                                <div>
                                                    {activeStep < 4 ? (
                                                        /* Locked state */
                                                        <div className="p-8 bg-slate-50 border border-slate-200 border-dashed rounded-2xl text-center text-slate-400 font-semibold text-xs">
                                                            🔒 {isVI ? 'Yêu cầu hoàn thành phiếu phỏng vấn trước.' : 'Requires completing the interview questionnaire first.'}
                                                        </div>
                                                    ) : activeStep > 4 || candidate.stage === 'rejected' ? (
                                                        /* Summary view when step is passed / rejected */
                                                        <div className={`p-5 rounded-2xl text-left relative pr-20 space-y-3 font-semibold text-xs ${
                                                            candidate.stage === 'rejected' 
                                                            ? 'bg-red-50 border border-red-200 text-red-750' 
                                                            : 'bg-slate-50 border border-slate-150 text-slate-700'
                                                        }`}>
                                                            <h5 className={`text-sm font-bold pb-2 border-b ${
                                                                candidate.stage === 'rejected' ? 'text-red-800 border-red-200' : 'text-slate-800 border-slate-200'
                                                            }`}>
                                                                {isVI ? 'Kết quả đánh giá phỏng vấn' : 'Interview Evaluation Result'}
                                                            </h5>
                                                            <div className="flex items-center gap-1">
                                                                <span>⭐ {isVI ? 'Đánh giá:' : 'Rating:'}</span>
                                                                {renderStars(interviewRating)}
                                                            </div>
                                                            {candidate.interviewer?.name && (
                                                                <p>👤 {isVI ? 'Người phỏng vấn:' : 'Interviewed by:'} <span className="text-slate-900 font-bold">{candidate.interviewer.name}</span></p>
                                                            )}
                                                            {interviewFeedback && (
                                                                <div className={`pt-2 border-t ${candidate.stage === 'rejected' ? 'border-red-200' : 'border-slate-200'}`}>
                                                                    <p className="text-slate-450 mb-1">📝 {isVI ? 'Nhận xét & Feedback:' : 'Feedback & Remarks:'}</p>
                                                                    <p className="italic font-normal whitespace-pre-line">{interviewFeedback}</p>
                                                                </div>
                                                            )}
                                                            {candidate.stage === 'rejected' && (
                                                                <div className="pt-2.5 border-t border-red-200">
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleDownloadOfferPDF}
                                                                        className="text-blue-600 hover:text-blue-700 hover:underline font-bold text-xs cursor-pointer bg-transparent border-0 p-0 outline-none inline-block mt-0.5"
                                                                    >
                                                                        {isVI ? 'Tải thư kết quả phỏng vấn' : 'Download Rejection Letter'}
                                                                    </button>
                                                                </div>
                                                            )}

                                                            {activeStep > 4 && candidate.stage !== 'hired' && (
                                                                <button
                                                                    type="button"
                                                                    disabled={saving}
                                                                    onClick={handleRevertInterviewEvaluation}
                                                                    className="absolute top-4 right-4 text-xs font-bold text-slate-450 hover:text-red-500 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {saving ? '...' : (isVI ? 'Hủy' : 'Undo')}
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        /* Active form view */
                                                        <div className="border border-slate-100 rounded-2xl p-6 bg-white shadow-sm space-y-5">
                                                            <div className="pb-2 border-b border-slate-100 flex justify-between items-center">
                                                                <h5 className="text-sm font-bold text-slate-800 text-left">
                                                                    {isVI ? 'Đánh giá cuộc phỏng vấn' : 'Interview Evaluation'}
                                                                </h5>
                                                                {currentUserName && (
                                                                    <span className="text-xs text-slate-500 font-semibold bg-slate-100 px-2.5 py-0.5 rounded-md">
                                                                        👤 {isVI ? 'Người phỏng vấn: ' : 'Interviewer: '}{currentUserName}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                <div className="space-y-4">
                                                                    <div>
                                                                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider text-left">
                                                                            {isVI ? 'Đánh giá phỏng vấn' : 'Interview Rating'}
                                                                        </label>
                                                                        <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex items-center justify-between w-full h-10">
                                                                            <span className="text-[10px] text-slate-550 font-bold uppercase tracking-wider pl-1">
                                                                                {isVI ? 'Đánh giá:' : 'Rating:'}
                                                                            </span>
                                                                            {renderStars(interviewRating, true, setInterviewRating)}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div>
                                                                    <label htmlFor="interview_feedback" className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider text-left">
                                                                        {isVI ? 'Nhận xét & Feedback' : 'Feedback & Remarks'}
                                                                    </label>
                                                                    <textarea
                                                                        id="interview_feedback"
                                                                        rows={3}
                                                                        value={interviewFeedback}
                                                                        onChange={e => setInterviewFeedback(e.target.value)}
                                                                        className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm text-gray-900 font-semibold"
                                                                        placeholder={isVI ? 'Nhận xét chi tiết...' : 'Detailed feedback...'}
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-100 font-bold">
                                                                <button
                                                                    type="button"
                                                                    disabled={saving}
                                                                    onClick={() => handleSaveInterviewEvaluation(false)}
                                                                    className="px-4 py-2.5 rounded-lg border border-red-200 text-xs font-bold text-red-655 hover:bg-red-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {isVI ? 'Không đạt' : 'Fail'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={saving}
                                                                    onClick={() => handleSaveInterviewEvaluation(true)}
                                                                    className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {saving ? '...' : (isVI ? 'Đạt phỏng vấn' : 'Pass Interview')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* TAB 5: JOB OFFER */}
                                            {selectedTab === 5 && (
                                                <div>
                                                    {activeStep < 5 ? (
                                                        /* Locked state */
                                                        <div className="p-8 bg-slate-50 border border-slate-200 border-dashed rounded-2xl text-center text-slate-400 font-semibold text-xs">
                                                            🔒 {isVI ? 'Yêu cầu vượt qua đánh giá phỏng vấn.' : 'Requires passing the interview evaluation.'}
                                                        </div>
                                                    ) : activeStep > 5 ? (
                                                        /* Summary view of the offer details when they are onboarded or proceeding */
                                                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-150 text-slate-700 text-left font-semibold text-xs space-y-3 relative pr-20">
                                                            <h5 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2">
                                                                {isVI ? 'Thông tin Lời mời nhận việc đã gửi' : 'Sent Job Offer Details'}
                                                            </h5>
                                                            <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-700">
                                                                <div>
                                                                    <span className="text-slate-400">{isVI ? 'Lương: ' : 'Salary: '}</span>
                                                                    <span className="font-bold text-slate-800">{candidate && candidate.offer_salary_amount !== undefined && candidate.offer_salary_amount !== null ? Number(candidate.offer_salary_amount).toLocaleString() : '0'} VND / {candidate?.offer_salary_type === 'fixed' ? (isVI ? 'Tháng' : 'Month') : (isVI ? 'Giờ' : 'Hour')}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-slate-400">{isVI ? 'Thử việc: ' : 'Probation: '}</span>
                                                                    <span className="font-bold text-slate-800">
                                                                        {candidate?.probation_months || 0} {isVI ? 'tháng' : 'months'}
                                                                        {candidate?.probation_months && candidate.probation_months > 0 && (
                                                                            <>
                                                                                {' ('}
                                                                                {(candidate as any).probation_salary_pcts && Array.isArray((candidate as any).probation_salary_pcts) && (candidate as any).probation_salary_pcts.length > 0 ? (
                                                                                    (candidate as any).probation_salary_pcts.map((pct: any) => `${pct}%`).join(' / ')
                                                                                ) : (
                                                                                    `${candidate?.probation_salary_pct || 100}%`
                                                                                )}
                                                                                {')'}
                                                                            </>
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                <div className="col-span-2">
                                                                    <span className="text-slate-400">{isVI ? 'Ngày bắt đầu: ' : 'Start Date: '}</span>
                                                                    <span className="font-bold text-slate-800">
                                                                        {(() => {
                                                                            const startVal = candidate?.offer_start_date
                                                                            if (!startVal || startVal === 'TBD') {
                                                                                return isVI ? 'Sẽ thỏa thuận (TBD)' : 'To Be Decided (TBD)'
                                                                            }
                                                                            const parts = startVal.split(' ')
                                                                            const datePart = parts[0]
                                                                            const timePart = parts[1]
                                                                            const formattedDate = formatToDDMMYYYY(datePart)
                                                                            return timePart ? `${timePart} - ${formattedDate}` : formattedDate
                                                                        })()}
                                                                    </span>
                                                                </div>
                                                                <div className="col-span-2">
                                                                    <span className="text-slate-400">{isVI ? 'Địa điểm ngày đầu: ' : 'First Day Location: '}</span>
                                                                    <span className="font-bold text-slate-800">
                                                                        {(() => {
                                                                            const br = branches.find(b => b.id === candidate?.offer_branch_id)
                                                                            return br ? `${br.name} - ${br.address}` : (isVI ? 'Sẽ thỏa thuận (TBD)' : 'To Be Decided (TBD)')
                                                                        })()}
                                                                    </span>
                                                                </div>
                                                                <div className="col-span-2">
                                                                    <span className="text-slate-400">{isVI ? 'Chi nhánh phân công: ' : 'Assigned Branches: '}</span>
                                                                    <span className="font-bold text-slate-800">{branchNames || '-'}</span>
                                                                </div>
                                                                <div className="col-span-2">
                                                                    <span className="text-slate-400">{isVI ? 'Hạn phản hồi: ' : 'Response Deadline: '}</span>
                                                                    <span className="font-bold text-slate-850 font-extrabold text-blue-700">{formatToDDMMYYYY(candidate?.offer_expiry_date)}</span>
                                                                </div>
                                                            </div>
                                                            <div className="pt-2.5 border-t border-slate-100">
                                                                <button
                                                                    type="button"
                                                                    onClick={handleDownloadOfferPDF}
                                                                    className="text-blue-600 hover:text-blue-700 hover:underline font-bold text-xs cursor-pointer bg-transparent border-0 p-0 outline-none inline-block mt-0.5"
                                                                >
                                                                    {isVI ? 'Tải lại thư mời nhận việc' : 'Re-download Offer Letter'}
                                                                </button>
                                                            </div>
                                                            {candidate?.stage !== 'hired' && (
                                                                <button
                                                                    type="button"
                                                                    disabled={saving}
                                                                    onClick={handleRevertToOffer}
                                                                    className="absolute top-4 right-4 text-xs font-bold text-slate-450 hover:text-red-500 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {saving ? '...' : (isVI ? 'Hủy' : 'Undo')}
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        /* Active form view: Job Offer Details */
                                                        <div className="border border-slate-100 rounded-2xl p-6 bg-white shadow-sm space-y-6">
                                                            <div className="pb-2 border-b border-slate-100 flex justify-between items-center">
                                                                <div className="text-left">
                                                                    <h5 className="text-sm font-bold text-slate-800">
                                                                        {isVI ? 'Chi tiết lời mời nhận việc' : 'Job Offer Details'}
                                                                    </h5>
                                                                    <p className="text-xs text-slate-500 font-semibold mt-0.5">
                                                                        {isVI ? 'Cấu hình thông tin lương, thử việc và ngày bắt đầu để gửi offer cho ứng viên' : 'Configure compensation, probation, and start date to draft candidate job offer'}
                                                                    </p>
                                                                </div>
                                                                {currentUserName && (
                                                                    <span className="text-xs text-slate-500 font-semibold bg-slate-100 px-2.5 py-0.5 rounded-md shrink-0">
                                                                        👤 {isVI ? 'Người đề xuất: ' : 'Proposer: '}{currentUserName}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Salary Offer and Probation details */}
                                                            <div className="space-y-4 text-left">
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                    <div>
                                                                        <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Loại lương' : 'Salary Type'}</label>
                                                                        <select value={salaryType} onChange={e => setSalaryType(e.target.value as SalaryType)}
                                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white font-semibold h-10">
                                                                            <option value="fixed">{isVI ? 'Cố định (Fixed)' : 'Fixed'}</option>
                                                                            <option value="hourly">{isVI ? 'Theo giờ (Hourly)' : 'Hourly'}</option>
                                                                        </select>
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Mức lương (VND) *' : 'Salary Amount (VND) *'}</label>
                                                                        <input required value={salaryAmount} onChange={e => {
                                                                            const val = e.target.value.replace(/[^0-9.]/g, '')
                                                                            setSalaryAmount(val ? Number(val).toLocaleString() : '')
                                                                        }}
                                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold bg-white" />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Thời gian thử việc (Tháng)' : 'Probation Months'}</label>
                                                                        <select value={probationMonths} onChange={e => {
                                                                            const val = e.target.value;
                                                                            setProbationMonths(val);
                                                                            const m = parseInt(val, 10);
                                                                            if (!isNaN(m) && m > 0) {
                                                                                let newPcts = [...probationSalaryPcts];
                                                                                if (newPcts.length !== m) {
                                                                                    newPcts = Array(m).fill('100');
                                                                                    if (m >= 1) newPcts[0] = '85';
                                                                                    if (m >= 2) newPcts[1] = '100';
                                                                                    if (m >= 3) newPcts[2] = '100';
                                                                                }
                                                                                setProbationSalaryPcts(newPcts);
                                                                                if (newPcts[0]) setProbationSalaryPct(newPcts[0]);
                                                                            } else {
                                                                                setProbationSalaryPcts([]);
                                                                                setProbationSalaryPct('100');
                                                                            }
                                                                        }}
                                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white font-semibold h-10">
                                                                            <option value="">{isVI ? 'Không có' : 'None'}</option>
                                                                            <option value="1">1 {isVI ? 'tháng' : 'month'}</option>
                                                                            <option value="2">2 {isVI ? 'tháng' : 'months'}</option>
                                                                            <option value="3">3 {isVI ? 'tháng' : 'months'}</option>
                                                                        </select>
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Lương thử việc (%)' : 'Probation Salary (%)'}</label>
                                                                        <div className="flex items-center gap-1.5 h-10">
                                                                            {probationMonths && parseInt(probationMonths, 10) > 1 ? (
                                                                                Array.from({ length: parseInt(probationMonths, 10) }).map((_, idx) => {
                                                                                    const currentVal = probationSalaryPcts[idx] || '100'
                                                                                    return (
                                                                                        <div key={idx} className="flex-1 min-w-[70px] flex items-center bg-white border border-gray-300 rounded-lg overflow-hidden h-10 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                                                                                            <div className="flex items-center justify-center px-2.5 bg-gray-100 border-r border-gray-300 text-xs font-bold text-gray-500 h-full select-none">
                                                                                                {isVI ? `T${idx + 1}` : `M${idx + 1}`}
                                                                                            </div>
                                                                                            <select
                                                                                                value={currentVal}
                                                                                                onChange={(e) => {
                                                                                                    const newPcts = [...probationSalaryPcts]
                                                                                                    newPcts[idx] = e.target.value
                                                                                                    setProbationSalaryPcts(newPcts)
                                                                                                    if (idx === 0) setProbationSalaryPct(e.target.value)
                                                                                                }}
                                                                                                className="flex-1 bg-white px-3 py-2 text-sm text-gray-900 outline-none h-full border-none focus:ring-0 font-semibold"
                                                                                            >
                                                                                                <option value="100">100%</option>
                                                                                                <option value="95">95%</option>
                                                                                                <option value="90">90%</option>
                                                                                                <option value="85">85%</option>
                                                                                                <option value="80">80%</option>
                                                                                                <option value="75">75%</option>
                                                                                            </select>
                                                                                        </div>
                                                                                    )
                                                                                })
                                                                            ) : probationMonths && parseInt(probationMonths, 10) === 1 ? (
                                                                                <select
                                                                                    value={probationSalaryPct || '100'}
                                                                                    onChange={(e) => {
                                                                                        setProbationSalaryPct(e.target.value)
                                                                                        setProbationSalaryPcts([e.target.value])
                                                                                    }}
                                                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white font-semibold h-10"
                                                                                >
                                                                                    <option value="100">100%</option>
                                                                                    <option value="95">95%</option>
                                                                                    <option value="90">90%</option>
                                                                                    <option value="85">85%</option>
                                                                                    <option value="80">80%</option>
                                                                                    <option value="75">75%</option>
                                                                                </select>
                                                                            ) : (
                                                                                <select disabled className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-450 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-100 font-semibold h-10">
                                                                                    <option value="100">100%</option>
                                                                                </select>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="col-span-1 sm:col-span-2">
                                                                        <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Hạn phản hồi *' : 'Response Deadline *'}</label>
                                                                        <input
                                                                            type="date"
                                                                            required
                                                                            value={offerExpiryDate}
                                                                            onChange={e => setOfferExpiryDate(e.target.value)}
                                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold bg-white h-10"
                                                                        />
                                                                    </div>
                                                                    <div className="col-span-1 sm:col-span-2 space-y-4 pt-2">
                                                                        <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                                                            <div className="text-left">
                                                                                <p className="text-xs font-bold text-slate-700">{isVI ? 'Xác định ngày bắt đầu' : 'Define start date & time'}</p>
                                                                                <p className="text-[10px] text-slate-450 font-semibold">{isVI ? 'Bật để chọn cụ thể hoặc tắt để mặc định là Sẽ thỏa thuận (TBD)' : 'Toggle to select a specific date/time, or leave off for To Be Decided (TBD)'}</p>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    const newVal = !defineStartDate
                                                                                    setDefineStartDate(newVal)
                                                                                    if (!newVal) {
                                                                                        setOfferStartDate('')
                                                                                        setOfferStartTime('')
                                                                                        setDefineStartLocation(false)
                                                                                        setOfferBranchId('')
                                                                                    }
                                                                                }}
                                                                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${defineStartDate ? 'bg-blue-600' : 'bg-slate-200'}`}
                                                                            >
                                                                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${defineStartDate ? 'translate-x-5' : 'translate-x-0'}`} />
                                                                            </button>
                                                                        </div>

                                                                        {defineStartDate && (
                                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                                <div>
                                                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Ngày bắt đầu' : 'Start Date'}</label>
                                                                                    <input
                                                                                        type="date"
                                                                                        required
                                                                                        value={offerStartDate}
                                                                                        onChange={e => setOfferStartDate(e.target.value)}
                                                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold bg-white h-10"
                                                                                    />
                                                                                </div>
                                                                                <div>
                                                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Giờ bắt đầu' : 'Start Time'}</label>
                                                                                    <input
                                                                                        type="time"
                                                                                        required
                                                                                        value={offerStartTime}
                                                                                        onChange={e => setOfferStartTime(e.target.value)}
                                                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold bg-white h-10"
                                                                                    />
                                                                                </div>

                                                                                {/* Toggle 2: Define start location */}
                                                                                <div className="col-span-1 sm:col-span-2 pt-2 border-t border-slate-100">
                                                                                    <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                                                                        <div className="text-left">
                                                                                            <p className="text-xs font-bold text-slate-700">{isVI ? 'Xác định địa điểm bắt đầu' : 'Define starting work location'}</p>
                                                                                            <p className="text-[10px] text-slate-450 font-semibold">{isVI ? 'Bật để chọn cụ thể hoặc tắt để mặc định là Sẽ thỏa thuận (TBD)' : 'Toggle to select a specific starting branch, or leave off for To Be Decided (TBD)'}</p>
                                                                                        </div>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => {
                                                                                                const newVal = !defineStartLocation
                                                                                                setDefineStartLocation(newVal)
                                                                                                if (!newVal) {
                                                                                                    setOfferBranchId('')
                                                                                                }
                                                                                            }}
                                                                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${defineStartLocation ? 'bg-blue-600' : 'bg-slate-200'}`}
                                                                                        >
                                                                                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${defineStartLocation ? 'translate-x-5' : 'translate-x-0'}`} />
                                                                                        </button>
                                                                                    </div>
                                                                                </div>

                                                                                {defineStartLocation && (
                                                                                    <div className="col-span-1 sm:col-span-2">
                                                                                        <label className="block text-xs font-bold text-slate-500 mb-1.5">
                                                                                            {isVI ? 'Chi nhánh bắt đầu làm việc *' : 'Starting Work Branch *'}
                                                                                        </label>
                                                                                        <select required value={offerBranchId} onChange={e => setOfferBranchId(e.target.value)}
                                                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white font-semibold h-10">
                                                                                            <option value="">{isVI ? 'Chọn chi nhánh…' : 'Select branch…'}</option>
                                                                                            {branches.map(b => (
                                                                                                <option key={b.id} value={b.id}>{b.name}</option>
                                                                                            ))}
                                                                                        </select>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Status Notification Boxes */}
                                                            <div className="space-y-3">
                                                                {/* Admin Approval Control Panel */}
                                                                {(userRole === 'admin' || userRole === 'owner') && candidate?.offer_approval_status === 'pending' && (
                                                                    <div className="p-4 rounded-xl border border-yellow-200 bg-yellow-50/50 text-left space-y-3">
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-xs font-bold text-yellow-800 uppercase tracking-wide">
                                                                                ⚠️ {isVI ? 'Yêu cầu phê duyệt Lời mời nhận việc' : 'Pending Job Offer Approval'}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-xs text-slate-600 font-semibold mt-0.5">
                                                                            {isVI ? 'Vui lòng kiểm tra thông tin đề xuất lương bên trên. Bạn có thể chấp thuận hoặc từ chối đề xuất này.' : 'Please review the proposed salary details above. You can approve or reject this offer proposal.'}
                                                                        </p>
                                                                        <div className="space-y-2">
                                                                            <textarea
                                                                                value={offerApprovalNotes}
                                                                                onChange={e => setOfferApprovalNotes(e.target.value)}
                                                                                placeholder={isVI ? 'Ghi chú phê duyệt hoặc lý do từ chối (tùy chọn)...' : 'Approval notes or rejection reason (optional)...'}
                                                                                className="w-full p-2 border border-gray-300 rounded-lg text-xs bg-white text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                                                                                rows={2}
                                                                            />
                                                                            <div className="flex gap-2 justify-end">
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={saving}
                                                                                    onClick={() => handleApproveOffer(false)}
                                                                                    className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-bold text-red-700 bg-white hover:bg-red-50 transition cursor-pointer"
                                                                                >
                                                                                    {isVI ? 'Từ chối' : 'Reject'}
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={saving}
                                                                                    onClick={() => handleApproveOffer(true)}
                                                                                    className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-xs font-bold text-white transition cursor-pointer"
                                                                                >
                                                                                    {isVI ? 'Phê duyệt' : 'Approve'}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Rejected Offer Indicator */}
                                                                {candidate?.offer_approval_status === 'rejected' && (
                                                                    <div className="p-4 rounded-xl border border-red-200 bg-red-50/50 text-left">
                                                                        <span className="text-xs font-bold text-red-800 uppercase tracking-wide block mb-1">
                                                                            ❌ {isVI ? 'Đề xuất lời mời nhận việc bị từ chối' : 'Job Offer Proposal Rejected'}
                                                                        </span>
                                                                        <p className="text-xs text-slate-600 font-semibold mt-0.5">
                                                                            {isVI ? 'Đề xuất này đã bị từ chối bởi ' : 'This offer proposal was rejected by '}
                                                                            {candidate.approver?.name || (isVI ? 'Quản trị viên.' : 'the Administrator.')}
                                                                            {candidate.offer_approval_notes && (
                                                                                <span className="block mt-1 font-bold text-red-700">
                                                                                    {isVI ? 'Lý do: ' : 'Reason: '} {candidate.offer_approval_notes}
                                                                                </span>
                                                                            )}
                                                                        </p>
                                                                    </div>
                                                                )}

                                                                {/* Approved Offer Indicator */}
                                                                {candidate?.offer_approval_status === 'approved' && (
                                                                    <div className="p-3 rounded-xl border border-green-200 bg-green-50/30 text-left">
                                                                        <span className="text-xs font-bold text-green-800 flex items-center gap-1.5">
                                                                            ✅ {isVI ? 'Lời mời nhận việc đã được phê duyệt bởi ' : 'Job Offer Approved by '}
                                                                            {candidate.approver?.name || (isVI ? 'Quản trị viên' : 'the Administrator')}
                                                                        </span>
                                                                    </div>
                                                                )}

                                                                {/* Pending Offer Indicator for Manager/HR */}
                                                                {userRole !== 'admin' && userRole !== 'owner' && candidate?.offer_approval_status === 'pending' && (
                                                                    <div className="p-3 rounded-xl border border-yellow-200 bg-yellow-50/30 text-left">
                                                                        <span className="text-xs font-bold text-yellow-800 flex items-center gap-1.5">
                                                                            ⏳ {isVI ? 'Đề xuất đang chờ phê duyệt' : 'Offer Proposal Pending Approval'}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Actions */}
                                                            {(() => {
                                                                const isAdminOrOwner = userRole === 'admin' || userRole === 'owner';
                                                                const isApproved = true; // No approval required, always treat as approved
                                                                const isOfferFormInvalid = !offerExpiryDate || (defineStartDate && defineStartLocation && !offerBranchId);
                                                                return (
                                                                    <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2.5 border-t border-slate-100 font-bold">
                                                                        <button
                                                                            type="button"
                                                                            disabled={saving || isOfferFormInvalid || (!isApproved && !isAdminOrOwner)}
                                                                            onClick={handleDownloadOfferPDF}
                                                                            className="text-blue-600 hover:text-blue-700 hover:underline font-bold text-xs cursor-pointer bg-transparent border-0 p-0 outline-none disabled:opacity-50 disabled:cursor-not-allowed inline-block self-start mt-0.5 sm:mt-1"
                                                                        >
                                                                            {isVI 
                                                                                ? (!isApproved && !isAdminOrOwner ? 'Tải thư mời nhận việc (Chờ duyệt)' : 'Tải thư mời nhận việc') 
                                                                                : (!isApproved && !isAdminOrOwner ? 'Download Offer Letter (Pending)' : 'Download Offer Letter')
                                                                            }
                                                                        </button>
                                                                        <div className="flex gap-3 w-full sm:w-auto justify-end">
                                                                            {!isApproved && !isAdminOrOwner ? (
                                                                                <>
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={saving || isOfferFormInvalid}
                                                                                        onClick={() => handleSaveJobOffer(false)}
                                                                                        className="px-4 py-2.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                                                    >
                                                                                        {isVI ? 'Lưu nháp' : 'Save Draft'}
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={saving || isOfferFormInvalid}
                                                                                        onClick={() => handleSaveJobOffer(false)}
                                                                                        className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                                                    >
                                                                                        {saving ? '...' : (isVI ? 'Gửi duyệt Offer' : 'Submit for Approval')}
                                                                                    </button>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={saving || isOfferFormInvalid}
                                                                                        onClick={() => handleSaveJobOffer(false)}
                                                                                        className="px-4 py-2.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                                                    >
                                                                                        {isVI ? 'Lưu nháp' : 'Save Draft'}
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={saving || isOfferFormInvalid}
                                                                                        onClick={() => handleSaveJobOffer(true)}
                                                                                        className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                                                    >
                                                                                        {saving ? '...' : (isVI ? 'Đồng ý & Nhận việc' : 'Accept & Proceed')}
                                                                                    </button>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* TAB 6: ONBOARDING & HIRE */}
                                            {selectedTab === 6 && (
                                                <div>
                                                    {activeStep < 6 ? (
                                                        /* Locked state */
                                                        <div className="p-8 bg-slate-50 border border-slate-200 border-dashed rounded-2xl text-center text-slate-400 font-semibold text-xs">
                                                            🔒 {isVI ? 'Yêu cầu đồng ý offer và bắt đầu nhận việc.' : 'Requires accepting the offer and proceeding to onboarding.'}
                                                        </div>
                                                    ) : candidate.stage === 'hired' ? (
                                                         !(candidate as any).related_staff ? (
                                                             /* Hired but staff deleted */
                                                             <div className="flex flex-col items-center justify-center p-8 bg-rose-50/50 border border-rose-200 rounded-2xl text-center space-y-4 relative">
                                                                 <XCircleIcon className="h-16 w-16 text-rose-600 bg-white p-2.5 rounded-full border border-rose-200 shadow-sm" />
                                                                 <div>
                                                                     <h5 className="text-base font-bold text-rose-800">
                                                                         {isVI ? 'Nhân viên liên kết đã bị xóa!' : 'Linked Staff Profile Deleted!'}
                                                                     </h5>
                                                                     <p className="text-xs text-rose-700 font-semibold mt-2.5 max-w-sm leading-relaxed">
                                                                         {isVI
                                                                             ? 'Hồ sơ nhân viên liên kết với ứng viên này đã bị xóa khỏi danh sách nhân sự. Bạn có thể khôi phục lại ứng viên này để tiếp tục quản lý tuyển dụng.'
                                                                             : 'The staff profile linked to this candidate was deleted from the staff list. You can restore this candidate to continue managing recruitment.'}
                                                                     </p>
                                                                 </div>
                                                                 <button
                                                                     type="button"
                                                                     disabled={saving}
                                                                     onClick={handleRestoreCandidate}
                                                                     className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl transition-all text-xs cursor-pointer shadow-md shadow-blue-500/20 disabled:opacity-50"
                                                                 >
                                                                     {saving ? '...' : (isVI ? 'Khôi phục ứng viên' : 'Restore Candidate')}
                                                                 </button>
                                                             </div>
                                                         ) : (
                                                             /* Summary / Success celebration view */
                                                             <div className="flex flex-col items-center justify-center p-8 bg-green-50 border border-green-200 rounded-2xl text-center space-y-4 relative">
                                                                 <CheckCircleIcon className="h-16 w-16 text-green-600 bg-white p-2.5 rounded-full border border-green-200 shadow-sm" />
                                                                 <div>
                                                                     <h5 className="text-base font-bold text-green-800">
                                                                         {isVI ? 'Tuyển dụng thành công!' : 'Successfully Hired & Onboarded!'}
                                                                     </h5>
                                                                     <p className="text-xs text-green-700 font-semibold mt-2.5 max-w-sm">
                                                                         {isVI
                                                                             ? 'Ứng viên đã hoàn thành tất cả các bước tuyển dụng, được tạo hồ sơ nhân sự chính thức và thêm vào danh sách nhân viên.'
                                                                             : 'The candidate has successfully completed all stages of the recruitment workflow. The staff profile was created and added to active staff.'}
                                                                     </p>
                                                                 </div>
                                                                 <button
                                                                     type="button"
                                                                     disabled={saving}
                                                                     onClick={handleMarkNoShow}
                                                                     className="bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold px-4 py-2 rounded-lg transition-colors text-xs mt-2 cursor-pointer disabled:opacity-50"
                                                                 >
                                                                     {saving ? '...' : (isVI ? 'Không đến nhận việc (No Show)' : 'Mark as No Show')}
                                                                 </button>
                                                                 <button
                                                                     type="button"
                                                                     disabled={saving}
                                                                     onClick={handleRevertOnboarding}
                                                                     className="absolute top-4 right-4 text-xs font-bold text-slate-450 hover:text-red-500 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                                 >
                                                                     {saving ? '...' : (isVI ? 'Hủy' : 'Undo')}
                                                                 </button>
                                                             </div>
                                                         )
                                                     ) : (
                                                        /* Active form view: Staff Onboarding */
                                                        <form onSubmit={handleSaveOnboarding} className="border border-slate-100 rounded-2xl p-6 bg-white shadow-sm space-y-6">
                                                            <div className="pb-2 border-b border-slate-100 flex justify-between items-center">
                                                                <div className="text-left">
                                                                    <h5 className="text-sm font-bold text-slate-800">
                                                                        {isVI ? 'Hồ sơ tuyển dụng nhân sự (Onboarding)' : 'Staff Onboarding & Creation Form'}
                                                                    </h5>
                                                                    <p className="text-xs text-slate-500 font-semibold mt-0.5">
                                                                        {isVI ? 'Điền đầy đủ thông tin để tạo nhân sự chính thức từ ứng viên này' : 'Fill out the details below to register this candidate as active staff'}
                                                                    </p>
                                                                </div>
                                                                {currentUserName && (
                                                                    <span className="text-xs text-slate-500 font-semibold bg-slate-100 px-2.5 py-0.5 rounded-md shrink-0">
                                                                        👤 {isVI ? 'Người tiếp nhận: ' : 'HR Specialist: '}{currentUserName}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <div className="max-h-[500px] overflow-y-auto pr-2 space-y-5">
                                                                {/* Section 1: Personal Info */}
                                                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-4">
                                                                    <h6 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                                                                        <UserIcon className="h-4.5 w-4.5 text-blue-650" />
                                                                        {isVI ? 'Thông tin cá nhân' : 'Personal Information'}
                                                                    </h6>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Họ *' : 'Last Name *'}</label>
                                                                            <input required value={lastName} onChange={e => setLastName(e.target.value)}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold bg-white" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Tên đệm' : 'Middle Name'}</label>
                                                                            <input value={middleName} onChange={e => setMiddleName(e.target.value)}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold bg-white" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Tên *' : 'First Name *'}</label>
                                                                            <input required value={firstName} onChange={e => setFirstName(e.target.value)}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold bg-white" />
                                                                        </div>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Số điện thoại *' : 'Phone *'}</label>
                                                                            <input required value={phone} onChange={e => setPhone(e.target.value)}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold bg-white" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Email *' : 'Email *'}</label>
                                                                            <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold bg-white" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Thành phố *' : 'City *'}</label>
                                                                            <select required value={city} onChange={e => setCity(e.target.value)}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white font-semibold h-10">
                                                                                <option value="">{isVI ? 'Chọn thành phố...' : 'Select city...'}</option>
                                                                                {Array.from(new Set(branches.map(b => (b as any).city).filter(Boolean))).sort().map((c: any) => (
                                                                                    <option key={c} value={c}>{c}</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 gap-4">
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Địa chỉ *' : 'Address *'}</label>
                                                                            <input required value={address} onChange={e => setAddress(e.target.value)}
                                                                                autoComplete="one-time-code"
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold bg-white" />
                                                                        </div>
                                                                    </div>
                                                                    {/* DOB + Gender + Marital Status */}
                                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Ngày sinh *' : 'Date of Birth *'}</label>
                                                                            <input required type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold bg-white h-10" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Giới tính' : 'Gender'}</label>
                                                                            <select value={gender} onChange={e => setGender(e.target.value)}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white font-semibold h-10">
                                                                                <option value="Nam">{isVI ? 'Nam' : 'Male'}</option>
                                                                                <option value="Nữ">{isVI ? 'Nữ' : 'Female'}</option>
                                                                                <option value="Khác">{isVI ? 'Khác' : 'Other'}</option>
                                                                            </select>
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Tình trạng hôn nhân' : 'Marital Status'}</label>
                                                                            <select value={maritalStatus} onChange={e => setMaritalStatus(e.target.value)}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white font-semibold h-10">
                                                                                <option value="Độc thân">{isVI ? 'Độc thân' : 'Single'}</option>
                                                                                <option value="Đã kết hôn">{isVI ? 'Đã kết hôn' : 'Married'}</option>
                                                                                <option value="Ly hôn">{isVI ? 'Ly hôn' : 'Divorced'}</option>
                                                                                <option value="Góa phụ">{isVI ? 'Góa phụ' : 'Widowed'}</option>
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                        <div>
                                                                            <label htmlFor="onboard_document_type" className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Loại giấy tờ *' : 'Document Type *'}</label>
                                                                            <select 
                                                                                id="onboard_document_type"
                                                                                required 
                                                                                value={documentType} 
                                                                                onChange={e => setDocumentType(e.target.value as 'id_card' | 'passport')}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white font-semibold h-10"
                                                                            >
                                                                                <option value="id_card">{isVI ? 'Căn cước công dân (ID Card)' : 'ID Card'}</option>
                                                                                <option value="passport">{isVI ? 'Hộ chiếu (Passport)' : 'Passport'}</option>
                                                                            </select>
                                                                        </div>
                                                                        <div>
                                                                            <label htmlFor="onboard_document_number" className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Số giấy tờ *' : 'Document Number *'}</label>
                                                                            <input 
                                                                                id="onboard_document_number"
                                                                                required 
                                                                                value={documentNumber} 
                                                                                onChange={e => setDocumentNumber(e.target.value)}
                                                                                placeholder={documentType === 'id_card' ? (isVI ? 'Nhập số CCCD...' : 'Enter ID number...') : (isVI ? 'Nhập số hộ chiếu...' : 'Enter passport number...')}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold bg-white" 
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    {/* Document Issue Details */}
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Ngày cấp giấy tờ' : 'Document Issue Date'}</label>
                                                                            <input type="date" value={documentIssueDate} onChange={e => setDocumentIssueDate(e.target.value)}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold bg-white h-10" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Nơi cấp giấy tờ' : 'Document Place of Issue'}</label>
                                                                            <input value={documentIssuePlace} onChange={e => setDocumentIssuePlace(e.target.value)}
                                                                                placeholder={isVI ? 'Ví dụ: Cục Cảnh sát QLHC về TTXH' : 'e.g. Police Department'}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold bg-white" />
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Section 2: Work & Position */}
                                                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-4">
                                                                    <h6 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                                                                        <BriefcaseIcon className="h-4.5 w-4.5 text-blue-650" />
                                                                        {isVI ? 'Thông tin công việc & Lương' : 'Job Assignment & Compensation'}
                                                                    </h6>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Phòng ban' : 'Department'}</label>
                                                                            <select value={departmentId} onChange={e => { setDepartmentId(e.target.value); setPositionId('') }}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white font-semibold h-10">
                                                                                <option value="">{isVI ? 'Chọn phòng ban…' : 'Select department…'}</option>
                                                                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                                            </select>
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Chức vụ *' : 'Position *'}</label>
                                                                            <select required value={positionId} onChange={e => setPositionId(e.target.value)}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white font-semibold h-10">
                                                                                <option value="">{isVI ? 'Chọn chức vụ…' : 'Select position…'}</option>
                                                                                {(departmentId ? positions.filter(p => !p.department_id || p.department_id === departmentId) : positions).map(p => (
                                                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Loại hình làm việc' : 'Employment Type'}</label>
                                                                            <select value={employmentType} onChange={e => {
                                                                                const val = e.target.value as EmploymentType;
                                                                                setEmploymentType(val);
                                                                                if (val === 'part_time') setSalaryType('hourly');
                                                                                if (val === 'full_time') setSalaryType('fixed');
                                                                                if (val === 'outsourced') {
                                                                                    setSalaryType('hourly');
                                                                                    setProbationMonths('');
                                                                                    setProbationSalaryPct('100');
                                                                                }
                                                                            }}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white font-semibold h-10">
                                                                                <option value="full_time">{isVI ? 'Toàn thời gian' : 'Full-time'}</option>
                                                                                <option value="part_time">{isVI ? 'Bán thời gian' : 'Part-time'}</option>
                                                                                <option value="outsourced">{isVI ? 'Thuê ngoài' : 'Outsourced'}</option>
                                                                            </select>
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">
                                                                                {isVI 
                                                                                    ? `Lương (VND) ${employmentType === 'full_time' ? '/tháng' : '/giờ'}` 
                                                                                    : `Amount (VND) ${employmentType === 'full_time' ? '/month' : '/hour'}`}
                                                                            </label>
                                                                            <input type="text" value={salaryAmount} onChange={e => {
                                                                                const val = e.target.value.replace(/\D/g, '')
                                                                                setSalaryAmount(val ? new Intl.NumberFormat('en-US').format(parseInt(val, 10)) : '')
                                                                            }}
                                                                                placeholder="0"
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-right font-bold h-10 bg-white" />
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Section 3: Start Date & Probation */}
                                                                {employmentType !== 'outsourced' && (
                                                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-4">
                                                                        <h6 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                                                                            <CalendarIcon className="h-4.5 w-4.5 text-blue-650" />
                                                                            {isVI ? 'Thời gian nhận việc & Thử việc' : 'Start & Probation Details'}
                                                                        </h6>
                                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                                            <div>
                                                                                <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Ngày bắt đầu' : 'Start Date'}</label>
                                                                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white" />
                                                                            </div>
                                                                            <div>
                                                                                <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Thời gian thử việc (Tháng)' : 'Probation Time (Months)'}</label>
                                                                                <input type="number" min="0" max="3" step="1" value={probationMonths} onChange={e => {
                                                                                    let val = e.target.value;
                                                                                    const m = parseInt(val, 10);
                                                                                    if (m > 3) val = '3';
                                                                                    setProbationMonths(val);
                                                                                    const mVal = parseInt(val, 10);
                                                                                    if (!isNaN(mVal) && mVal > 0) {
                                                                                        let newPcts = [...probationSalaryPcts];
                                                                                        if (newPcts.length !== mVal) {
                                                                                            newPcts = Array(mVal).fill('100');
                                                                                            if (mVal >= 1) newPcts[0] = '85';
                                                                                            if (mVal >= 2) newPcts[1] = '100';
                                                                                            if (mVal >= 3) newPcts[2] = '100';
                                                                                        }
                                                                                        setProbationSalaryPcts(newPcts);
                                                                                        if (newPcts[0]) setProbationSalaryPct(newPcts[0]);
                                                                                    } else {
                                                                                        setProbationSalaryPcts([]);
                                                                                        setProbationSalaryPct('100');
                                                                                    }
                                                                                }}
                                                                                    placeholder={isVI ? 'Ví dụ: 2' : 'e.g. 2'}
                                                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white" />
                                                                            </div>
                                                                            <div>
                                                                                <label className="block text-xs font-bold text-slate-500 mb-1.5">{isVI ? 'Lương thử việc (%)' : 'Probation Salary (%)'}</label>
                                                                                <div className="flex items-center gap-1.5 h-10">
                                                                                    {probationMonths && parseInt(probationMonths, 10) > 1 ? (
                                                                                        Array.from({ length: parseInt(probationMonths, 10) }).map((_, idx) => {
                                                                                            const currentVal = probationSalaryPcts[idx] || '100'
                                                                                            return (
                                                                                                <div key={idx} className="flex-1 min-w-[70px] flex items-center bg-white border border-gray-300 rounded-lg overflow-hidden h-10 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                                                                                                    <div className="flex items-center justify-center px-2.5 bg-gray-100 border-r border-gray-300 text-xs font-bold text-gray-500 h-full select-none">
                                                                                                        {isVI ? `T${idx + 1}` : `M${idx + 1}`}
                                                                                                    </div>
                                                                                                    <input type="number" min="0" max="100" value={currentVal}
                                                                                                        onChange={(e) => {
                                                                                                            const newPcts = [...probationSalaryPcts]
                                                                                                            newPcts[idx] = e.target.value
                                                                                                            setProbationSalaryPcts(newPcts)
                                                                                                            if (idx === 0) setProbationSalaryPct(e.target.value)
                                                                                                        }}
                                                                                                        className="flex-1 bg-white px-3 py-2 text-sm text-gray-900 outline-none h-full border-none focus:ring-0 font-semibold text-left" />
                                                                                                    <span className="pr-3 text-sm text-gray-400 font-bold select-none">%</span>
                                                                                                </div>
                                                                                            )
                                                                                        })
                                                                                    ) : probationMonths && parseInt(probationMonths, 10) === 1 ? (
                                                                                        <div className="relative w-full">
                                                                                            <input
                                                                                                key="probation-salary-active"
                                                                                                type="number"
                                                                                                min="0"
                                                                                                max="100"
                                                                                                value={probationSalaryPct || '100'}
                                                                                                onChange={(e) => {
                                                                                                    setProbationSalaryPct(e.target.value)
                                                                                                    setProbationSalaryPcts([e.target.value])
                                                                                                }}
                                                                                                className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white" />
                                                                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-bold">%</span>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="relative w-full">
                                                                                            <input 
                                                                                                key="probation-salary-disabled"
                                                                                                disabled 
                                                                                                type="number" 
                                                                                                placeholder="100"
                                                                                                className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm text-gray-405 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-gray-100" />
                                                                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-bold">%</span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Section 4: Branch Assignment */}
                                                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-4">
                                                                    <h6 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                                                                        <BuildingOfficeIcon className="h-4.5 w-4.5 text-blue-650" />
                                                                        {isVI ? 'Phân công chi nhánh' : 'Branch Assignment'}
                                                                    </h6>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {branches.map(branch => {
                                                                            const isSelected = selectedBranches.includes(branch.id)
                                                                            return (
                                                                                <button
                                                                                    type="button"
                                                                                    key={branch.id}
                                                                                    onClick={() => {
                                                                                        setSelectedBranches(prev => {
                                                                                            if (prev.includes(branch.id)) {
                                                                                                return prev.filter(b => b !== branch.id)
                                                                                            }
                                                                                            return [...prev, branch.id]
                                                                                        })
                                                                                    }}
                                                                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                                                                                        isSelected 
                                                                                        ? 'bg-blue-600 text-white shadow-sm'
                                                                                        : 'bg-white border border-gray-200 text-gray-650 hover:bg-gray-50'
                                                                                    }`}
                                                                                >
                                                                                    {branch.name}
                                                                                </button>
                                                                            )
                                                                        })}
                                                                    </div>
                                                                </div>

                                                                {/* Section 5: Bank Details */}
                                                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-4">
                                                                    <h6 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                                                                        <CreditCardIcon className="h-4.5 w-4.5 text-blue-650" />
                                                                        {isVI ? 'Thông tin ngân hàng' : 'Bank Account'}
                                                                    </h6>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                        <div>
                                                                            <div className="flex items-center justify-between mb-1.5">
                                                                                <label className="block text-xs font-bold text-slate-500">{isVI ? 'Tên chủ tài khoản' : 'Account Holder Name'}</label>
                                                                                <label className="flex items-center gap-1 text-[10px] text-blue-600 font-bold cursor-pointer">
                                                                                    <input 
                                                                                        type="checkbox" 
                                                                                        checked={bankSameAsStaff} 
                                                                                        onChange={e => setBankSameAsStaff(e.target.checked)}
                                                                                        className="rounded text-blue-600 focus:ring-blue-500 border-gray-300 w-3 h-3 cursor-pointer" 
                                                                                    />
                                                                                    {isVI ? 'Trùng tên nhân viên' : 'Same as staff'}
                                                                                </label>
                                                                            </div>
                                                                            <input 
                                                                                disabled={bankSameAsStaff}
                                                                                value={bankAccountName} 
                                                                                onChange={e => setBankAccountName(e.target.value)}
                                                                                placeholder={isVI ? 'Ví dụ: NGUYEN VAN A' : 'e.g. NGUYEN VAN A'}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-150 disabled:text-gray-500 disabled:cursor-not-allowed uppercase font-semibold h-10 bg-white" 
                                                                            />
                                                                        </div>

                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">
                                                                                {isVI ? 'Tên ngân hàng' : 'Bank Name'}
                                                                            </label>
                                                                            <input 
                                                                                type="text"
                                                                                list="onboard-banks-list"
                                                                                value={bankName} 
                                                                                onChange={e => setBankName(e.target.value)}
                                                                                placeholder={isVI ? 'Chọn hoặc nhập tên ngân hàng...' : 'Select or type bank...'}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white font-semibold h-10" 
                                                                            />
                                                                            <datalist id="onboard-banks-list">
                                                                                {vietnamBanks.map(b => (
                                                                                    <option key={b.bin} value={b.shortName}>
                                                                                        {b.name} ({b.code})
                                                                                    </option>
                                                                                ))}
                                                                            </datalist>
                                                                        </div>

                                                                        <div className="sm:col-span-1">
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">
                                                                                {isVI ? 'Số tài khoản' : 'Bank Account Number'}
                                                                            </label>
                                                                            <input 
                                                                                value={bankAccountNumber} 
                                                                                onChange={e => setBankAccountNumber(e.target.value)}
                                                                                placeholder={isVI ? 'Ví dụ: 1234567890' : 'e.g. 1234567890'}
                                                                                className="w-full px-3 py-2 border border-gray-350 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white" 
                                                                            />
                                                                        </div>

                                                                        <div className="sm:col-span-1">
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">
                                                                                {isVI ? 'Chi nhánh ngân hàng' : 'Bank Branch'}
                                                                            </label>
                                                                            <input 
                                                                                value={bankBranch} 
                                                                                onChange={e => setBankBranch(e.target.value)}
                                                                                placeholder={isVI ? 'Ví dụ: Chi nhánh Bến Thành' : 'e.g. Ben Thanh Branch'}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white" 
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Section 5.5: Emergency Contact */}
                                                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-4">
                                                                    <h6 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                                                                        <UserIcon className="h-4.5 w-4.5 text-blue-650" />
                                                                        {isVI ? 'Liên hệ khẩn cấp' : 'Emergency Contact'}
                                                                    </h6>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">
                                                                                {isVI ? 'Người liên hệ' : 'Contact Person'}
                                                                            </label>
                                                                            <input 
                                                                                value={emergencyContactName} 
                                                                                onChange={e => setEmergencyContactName(e.target.value)}
                                                                                placeholder={isVI ? 'Ví dụ: Nguyễn Văn A' : 'e.g. John Doe'}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white" 
                                                                            />
                                                                        </div>

                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">
                                                                                {isVI ? 'Quan hệ với nhân viên' : 'Relationship'}
                                                                            </label>
                                                                            <input 
                                                                                value={emergencyContactRelationship} 
                                                                                onChange={e => setEmergencyContactRelationship(e.target.value)}
                                                                                placeholder={isVI ? 'Ví dụ: Bố, Mẹ, Vợ, Chồng...' : 'e.g. Father, Mother, Spouse...'}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white" 
                                                                            />
                                                                        </div>

                                                                        <div>
                                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">
                                                                                {isVI ? 'Số di động khẩn cấp' : 'Emergency Mobile Phone'}
                                                                            </label>
                                                                            <input 
                                                                                value={emergencyContactPhone} 
                                                                                onChange={e => setEmergencyContactPhone(e.target.value)}
                                                                                placeholder={isVI ? 'Ví dụ: 0912345678' : 'e.g. 0912345678'}
                                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-semibold h-10 bg-white" 
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Section 6: Document Attachment */}
                                                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-4">
                                                                    <h6 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                                                                        <PaperClipIcon className="h-4.5 w-4.5 text-blue-650" />
                                                                        {isVI 
                                                                            ? `Đính kèm tài liệu cá nhân ${hasExistingIdPhoto ? '(Không bắt buộc)' : '*'}` 
                                                                            : `Personal Document Attachment ${hasExistingIdPhoto ? '(Optional)' : '*'}`}
                                                                    </h6>
                                                                    <div>
                                                                        <label className="block text-xs font-bold text-slate-500 mb-1.5">
                                                                            {isVI 
                                                                                ? `Ảnh CCCD / CMND / Hộ chiếu ${hasExistingIdPhoto ? '(Không bắt buộc)' : '*'}` 
                                                                                : `ID Card / Passport Photo ${hasExistingIdPhoto ? '(Optional)' : '*'}`}
                                                                        </label>
                                                                        <div className="flex items-center gap-3">
                                                                            <input 
                                                                                required={!hasExistingIdPhoto}
                                                                                type="file" 
                                                                                accept="image/*,application/pdf"
                                                                                onChange={e => {
                                                                                    if (e.target.files && e.target.files.length > 0) {
                                                                                        setDocPhotoFile(e.target.files[0])
                                                                                    }
                                                                                }}
                                                                                className="hidden"
                                                                                id="onboard-doc-photo-upload"
                                                                            />
                                                                            <label 
                                                                                htmlFor="onboard-doc-photo-upload"
                                                                                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-750 hover:bg-gray-50 transition cursor-pointer flex items-center gap-2"
                                                                            >
                                                                                <ArrowUpTrayIcon className="h-4 w-4 text-blue-650" />
                                                                                {isVI ? 'Chọn ảnh/tài liệu...' : 'Select photo/file...'}
                                                                            </label>
                                                                            <span className="text-xs text-gray-500 font-semibold truncate max-w-xs">
                                                                                {docPhotoFile 
                                                                                    ? docPhotoFile.name 
                                                                                    : (hasExistingIdPhoto 
                                                                                        ? (isVI ? '✓ Đã có ảnh tài liệu trong hệ thống' : '✓ Existing document in system') 
                                                                                        : (isVI ? 'Chưa chọn tệp *' : 'No file selected *'))}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Section 7: Notes */}
                                                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-4">
                                                                    <h6 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                                                                        <InboxIcon className="h-4.5 w-4.5 text-blue-650" />
                                                                        {isVI ? 'Ghi chú thêm' : 'Additional Notes'}
                                                                    </h6>
                                                                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none font-semibold bg-white" />
                                                                </div>
                                                            </div>

                                                             {/* Form Actions */}
                                                             <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 font-bold">
                                                                 <button 
                                                                     type="button" 
                                                                     disabled={saving}
                                                                     onClick={handleOfferRejected}
                                                                     className="px-5 py-2.5 text-xs font-bold text-red-650 bg-red-50 hover:bg-red-100/80 border border-red-200 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer shadow-sm justify-center"
                                                                 >
                                                                     {isVI ? 'Từ chối Offer' : 'Offer Rejected'}
                                                                 </button>

                                                                 <button type="submit" disabled={saving || !lastName.trim() || !firstName.trim() || !positionId}
                                                                     className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer shadow-sm justify-center">
                                                                     {saving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                                                     {isVI ? 'Nhận việc' : 'Onboard'}
                                                                 </button>
                                                             </div>
                                                        </form>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>

            {/* Rejection Reason Modal */}
            <Dialog open={rejectionModalOpen} onClose={() => setRejectionModalOpen(false)} className="relative z-[60]">
                <Transition show={rejectionModalOpen} as={Fragment}>
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" />
                </Transition>

                <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                    <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            enterTo="opacity-100 translate-y-0 sm:scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                            <DialogPanel className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-slate-100">
                                <div className="p-6 space-y-4">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                        <DialogTitle className="text-base font-black text-slate-800 tracking-tight">
                                            {isVI ? 'Lý do từ chối Offer' : 'Offer Rejection Reason'}
                                        </DialogTitle>
                                        <button
                                            type="button"
                                            onClick={() => setRejectionModalOpen(false)}
                                            className="text-slate-500 hover:text-slate-700 cursor-pointer"
                                        >
                                            <XMarkIcon className="h-5 w-5" />
                                        </button>
                                    </div>

                                    <div className="space-y-3 font-semibold text-sm">
                                        <label htmlFor="rejection_reason_input" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                                            {isVI ? 'Lý do từ chối *' : 'Reason for rejection *'}
                                        </label>
                                        <textarea
                                            id="rejection_reason_input"
                                            required
                                            rows={4}
                                            value={rejectionReasonText}
                                            onChange={e => setRejectionReasonText(e.target.value)}
                                            placeholder={isVI ? 'Vui lòng nhập lý do cụ thể vì sao ứng viên từ chối offer...' : 'Please enter the specific reason why the candidate rejected the offer...'}
                                            className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm text-gray-900 font-semibold resize-none"
                                        />
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 font-bold">
                                        <button
                                            type="button"
                                            onClick={() => setRejectionModalOpen(false)}
                                            className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                                        >
                                            {isVI ? 'Hủy' : 'Cancel'}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={saving || !rejectionReasonText.trim()}
                                            onClick={submitOfferRejection}
                                            className="px-5 py-2.5 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {saving ? '...' : (isVI ? 'Xác nhận' : 'Confirm')}
                                        </button>
                                    </div>
                                </div>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
             </Dialog>

            {/* Restore Candidate Modal */}
            <Dialog open={openRestoreDialog} onClose={() => setOpenRestoreDialog(false)} className="relative z-[60]">
                <Transition show={openRestoreDialog} as={Fragment}>
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" />
                </Transition>

                <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                    <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            enterTo="opacity-100 translate-y-0 sm:scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                            <DialogPanel className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-slate-100">
                                <div className="p-6 space-y-4">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                        <DialogTitle className="text-base font-black text-slate-800 tracking-tight">
                                            {isVI ? 'Khôi phục hồ sơ ứng viên' : 'Restore Candidate Profile'}
                                        </DialogTitle>
                                        <button
                                            type="button"
                                            onClick={() => setOpenRestoreDialog(false)}
                                            className="text-slate-500 hover:text-slate-700 cursor-pointer"
                                        >
                                            <XMarkIcon className="h-5 w-5" />
                                        </button>
                                    </div>

                                    <div className="text-xs text-amber-800 bg-amber-50/50 p-3.5 rounded-xl border border-amber-100 font-semibold leading-relaxed">
                                        ⚠️ {isVI 
                                            ? 'Ứng viên này đã kết thúc quy trình ứng tuyển trước đó. Khôi phục hồ sơ sẽ reset trạng thái về Lọc Hồ Sơ để bắt đầu quy trình ứng tuyển mới. Thông tin cũ sẽ được lưu trữ.'
                                            : 'This candidate has already completed their previous recruitment flow. Restoring will reset their state to CV Screening for a new application instance. Historical data will be preserved.'}
                                    </div>

                                    <div className="space-y-3 font-semibold text-sm">
                                        <label htmlFor="restore_target_request" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                                            {isVI ? 'Chọn đợt tuyển dụng mới *' : 'Select target hiring request *'}
                                        </label>
                                        {activeRequests.length === 0 ? (
                                            <p className="text-xs text-red-500 font-bold">
                                                {isVI ? 'Không tìm thấy đợt tuyển dụng hoạt động nào.' : 'No active hiring requests found.'}
                                            </p>
                                        ) : (
                                            <select
                                                id="restore_target_request"
                                                required
                                                value={selectedTargetRequestId}
                                                onChange={e => setSelectedTargetRequestId(e.target.value)}
                                                className="w-full h-10 px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm text-gray-900 font-semibold"
                                            >
                                                {activeRequests.map(req => (
                                                    <option key={req.id} value={req.id}>
                                                        {req.position_title} ({req.department})
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 font-bold">
                                        <button
                                            type="button"
                                            onClick={() => setOpenRestoreDialog(false)}
                                            className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                                        >
                                            {isVI ? 'Hủy' : 'Cancel'}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={restoring || !selectedTargetRequestId || activeRequests.length === 0}
                                            onClick={executeRestoreCandidate}
                                            className="px-5 py-2.5 text-xs font-bold text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {restoring ? '...' : (isVI ? 'Xác nhận' : 'Confirm')}
                                        </button>
                                    </div>
                                </div>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>

            {/* PDF Language Selector Modal */}
            <Dialog open={pdfLangModalOpen} onClose={() => setPdfLangModalOpen(false)} className="relative z-[60]">
                <Transition show={pdfLangModalOpen} as={Fragment}>
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-fade-in" />
                </Transition>

                <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                    <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            enterTo="opacity-100 translate-y-0 sm:scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                            <DialogPanel className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-slate-100">
                                <div className="p-6 space-y-4">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                        <DialogTitle className="text-base font-black text-slate-800 tracking-tight">
                                            {isVI ? 'Chọn ngôn ngữ tài liệu' : 'Select Document Language'}
                                        </DialogTitle>
                                        <button
                                            type="button"
                                            onClick={() => setPdfLangModalOpen(false)}
                                            className="text-slate-500 hover:text-slate-700 cursor-pointer"
                                        >
                                            <XMarkIcon className="h-5 w-5" />
                                        </button>
                                    </div>

                                    <div className="space-y-3 font-semibold text-sm">
                                        <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                                            {isVI ? 'Tải PDF bằng ngôn ngữ:' : 'Download PDF in language:'}
                                        </p>
                                        
                                        <div className="space-y-2">
                                            <button
                                                type="button"
                                                onClick={() => setPdfLanguageMode('vi')}
                                                className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left cursor-pointer transition ${
                                                    pdfLanguageMode === 'vi'
                                                        ? 'border-blue-500 bg-blue-50/30 text-blue-700 font-extrabold'
                                                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                                                }`}
                                            >
                                                <span>{isVI ? 'Tiếng Việt' : 'Vietnamese'}</span>
                                                {pdfLanguageMode === 'vi' && <span className="text-blue-600 font-black">✓</span>}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setPdfLanguageMode('en')}
                                                className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left cursor-pointer transition ${
                                                    pdfLanguageMode === 'en'
                                                        ? 'border-blue-500 bg-blue-50/30 text-blue-700 font-extrabold'
                                                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                                                }`}
                                            >
                                                <span>{isVI ? 'Tiếng Anh' : 'English'}</span>
                                                {pdfLanguageMode === 'en' && <span className="text-blue-600 font-black">✓</span>}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setPdfLanguageMode('both')}
                                                className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left cursor-pointer transition ${
                                                    pdfLanguageMode === 'both'
                                                        ? 'border-blue-500 bg-blue-50/30 text-blue-700 font-extrabold'
                                                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                                                }`}
                                            >
                                                <span>{isVI ? 'Cả hai' : 'Both'}</span>
                                                {pdfLanguageMode === 'both' && <span className="text-blue-600 font-black">✓</span>}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 font-bold">
                                        <button
                                            type="button"
                                            onClick={() => setPdfLangModalOpen(false)}
                                            className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                                        >
                                            {isVI ? 'Hủy' : 'Cancel'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPdfLangModalOpen(false)
                                                executeDownloadPDF()
                                            }}
                                            className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition cursor-pointer shadow-sm"
                                        >
                                            {isVI ? 'Tải xuống' : 'Download'}
                                        </button>
                                    </div>
                                </div>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>

            {/* Focused Interview Questionnaire Modal */}
            <Dialog open={interviewModeActive} onClose={() => setInterviewModeActive(false)} className="relative z-[60]">
                <Transition show={interviewModeActive} as={Fragment}>
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" />
                </Transition>

                <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                    <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            enterTo="opacity-100 translate-y-0 sm:scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                            <DialogPanel className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-5xl border border-slate-100">
                                <div className="p-6 space-y-4">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                        <div>
                                            <DialogTitle className="text-base font-black text-slate-800 tracking-tight">
                                                {isVI ? 'Bảng câu hỏi phỏng vấn tập trung' : 'Focused Interview Questionnaire'}
                                            </DialogTitle>
                                            <p className="text-xs text-slate-500 font-semibold mt-0.5">
                                                {isVI ? `Đang phỏng vấn: ${candidate?.full_name}` : `Interviewing: ${candidate?.full_name}`}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setInterviewModeActive(false)}
                                            className="text-slate-500 hover:text-slate-700 cursor-pointer"
                                        >
                                            <XMarkIcon className="h-5 w-5" />
                                        </button>
                                    </div>

                                    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 font-semibold text-sm">
                                        {(() => {
                                            let globalQIdx = 0
                                            return templateSections.map((sect, sidx) => {
                                                const icons = [UserIcon, BriefcaseIcon, ChatBubbleBottomCenterTextIcon, CalendarIcon]
                                                const Icon = icons[sidx % icons.length]
                                                const cleanSectEn = sect.name_en.replace(/^\d+\.\s*/, '')
                                                const cleanSectVi = sect.name_vi.replace(/^\d+\.\s*/, '')
                                                return (
                                                    <div key={sect.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 text-left">
                                                        <h6 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                                                            <Icon className="h-4.5 w-4.5 text-blue-650" />
                                                            {sidx + 1}. {isVI ? cleanSectVi : cleanSectEn}
                                                        </h6>
                                                        <div className="space-y-4">
                                                            {sect.questions.map(q => {
                                                                globalQIdx++
                                                                const cleanQTextEn = q.text_en.replace(/^\d+\.\s*/, '')
                                                                const cleanQTextVi = q.text_vi.replace(/^\d+\.\s*/, '')
                                                                return (
                                                                    <div key={q.id} className="space-y-1.5">
                                                                        <label htmlFor={`modal-${q.id}`} className="block text-xs font-bold text-slate-500 mb-1">
                                                                            {globalQIdx}. {isVI ? cleanQTextVi : cleanQTextEn}
                                                                        </label>
                                                                        {q.type === 'yes_no' ? (
                                                                            <div className="flex gap-2 max-w-[200px] font-bold">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setAnswers(prev => ({ ...prev, [q.id]: 'yes' }))}
                                                                                    className={`flex-1 py-1.5 rounded-lg text-xs transition cursor-pointer text-center border font-bold ${
                                                                                        answers[q.id] === 'yes'
                                                                                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                                                                            : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                                                                    }`}
                                                                                >
                                                                                    {isVI ? 'Có' : 'Yes'}
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setAnswers(prev => ({ ...prev, [q.id]: 'no' }))}
                                                                                    className={`flex-1 py-1.5 rounded-lg text-xs transition cursor-pointer text-center border font-bold ${
                                                                                        answers[q.id] === 'no'
                                                                                            ? 'bg-red-600 border-red-600 text-white shadow-sm'
                                                                                            : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                                                                    }`}
                                                                                >
                                                                                    {isVI ? 'Không' : 'No'}
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <textarea
                                                                                id={`modal-${q.id}`}
                                                                                rows={3}
                                                                                value={answers[q.id] || ''}
                                                                                onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                                                                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                                                                                placeholder={isVI ? 'Nhập câu trả lời...' : 'Enter response...'}
                                                                            />
                                                                        )}
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                )
                                            })
                                        })()}
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 font-bold">
                                        <button
                                            type="button"
                                            onClick={() => setInterviewModeActive(false)}
                                            className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                                        >
                                            {isVI ? 'Hủy' : 'Cancel'}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={saving}
                                            onClick={handleSaveInterviewQuestionnaire}
                                            className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition cursor-pointer shadow-sm disabled:opacity-50"
                                        >
                                            {saving ? '...' : (isVI ? 'Hoàn thành & Lưu' : 'Complete & Save')}
                                        </button>
                                    </div>
                                </div>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>

            {/* Hidden PDF Template for Offer or Rejection Letter */}
            <div
                id="recruitment-offer-letter-pdf-template"
                className="p-16 bg-white text-slate-800 space-y-8 font-sans"
                style={{
                    width: '794px', // A4 pixel width at 96 DPI
                    minHeight: '1123px', // A4 pixel height at 96 DPI
                    position: 'absolute',
                    left: '-9999px',
                    top: '-9999px',
                    boxSizing: 'border-box'
                }}
            >
                {/* Header with Logo and Company Name */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-5">
                    <div>
                        {restaurantLogoUrl ? (
                            <img src={restaurantLogoUrl} alt="Logo" className="h-14 w-auto object-contain" />
                        ) : (
                            <div className="text-lg font-black text-slate-800 tracking-tight uppercase">{companyName}</div>
                        )}
                    </div>
                    <div className="text-right">
                        <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{companyName}</h2>
                        <p className="text-[9px] text-slate-400 font-semibold uppercase">
                            {pdfLanguageMode === 'vi' ? 'Thư tuyển dụng' : pdfLanguageMode === 'en' ? 'Recruitment Letter' : 'Thư tuyển dụng / Recruitment Letter'}
                        </p>
                    </div>
                </div>

                {/* Document Title */}
                <div className="text-center space-y-1 pt-2">
                    <h1 className="text-lg font-black text-blue-700 uppercase tracking-wide">
                        {pdfLanguageMode === 'vi' ? (
                            candidate?.stage === 'rejected' ? 'Thư Thông Báo Kết Quả Phỏng Vấn' : 'Thư Mời Nhận Việc'
                        ) : (
                            candidate?.stage === 'rejected' ? 'Interview Outcome' : 'Job Offer'
                        )}
                    </h1>
                </div>

                {/* Date & Details */}
                <div className="text-right text-[10px] font-semibold text-slate-400">
                    {pdfLanguageMode === 'vi' ? `Ngày: ${formatToDDMMYYYY(new Date())}` : `Date: ${formatToDDMMYYYY(new Date())}`}
                </div>

                {/* Candidate Info */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-2 text-left">
                    <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1">
                        {pdfLanguageMode === 'vi' ? 'Kính gửi:' : pdfLanguageMode === 'en' ? 'To:' : 'Kính gửi / To:'}
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-semibold">
                        <div>
                            <span className="text-slate-400">
                                {pdfLanguageMode === 'vi' ? 'Họ và Tên:' : pdfLanguageMode === 'en' ? 'Full Name:' : 'Họ và Tên / Full Name:'}{' '}
                            </span>
                            <span className="font-bold text-slate-800">{candidate?.full_name}</span>
                        </div>
                        <div>
                            <span className="text-slate-400">
                                {pdfLanguageMode === 'vi' ? 'Số điện thoại:' : pdfLanguageMode === 'en' ? 'Phone:' : 'Số điện thoại / Phone:'}{' '}
                            </span>
                            <span className="font-bold text-slate-800">{candidate?.phone || '-'}</span>
                        </div>
                        <div className="col-span-2">
                            <span className="text-slate-400">Email: </span>
                            <span className="font-bold text-slate-800">{candidate?.email || '-'}</span>
                        </div>
                    </div>
                </div>

                {candidate?.stage === 'rejected' ? (
                    /* REJECTION LETTER CONTENT */
                    <div className="text-[11px] font-medium space-y-4 text-slate-700 leading-relaxed text-left">
                        <p>
                            {pdfLanguageMode === 'vi' ? 'Thân gửi' : pdfLanguageMode === 'en' ? 'Dear' : 'Thân gửi / Dear'} {candidate?.full_name},
                        </p>
                        
                        {(pdfLanguageMode === 'vi' || pdfLanguageMode === 'both') && (
                            <p>
                                Cảm ơn bạn đã dành thời gian gặp gỡ chúng tôi và vì sự quan tâm của bạn dành cho {companyName}.
                            </p>
                        )}
                        {(pdfLanguageMode === 'en' || pdfLanguageMode === 'both') && (
                            <p className={pdfLanguageMode === 'both' ? "italic text-slate-450 text-[10px] -mt-2.5" : ""}>
                                Thank you for taking the time to meet with us and for your interest in {companyName}.
                            </p>
                        )}

                        {(pdfLanguageMode === 'vi' || pdfLanguageMode === 'both') && (
                            <p>
                                Sau khi xem xét kỹ lưỡng hồ sơ ứng tuyển của bạn, chúng tôi rất tiếc phải thông báo rằng chúng tôi quyết định không tiếp tục tiến trình tuyển dụng với hồ sơ của bạn cho vị trí này.
                            </p>
                        )}
                        {(pdfLanguageMode === 'en' || pdfLanguageMode === 'both') && (
                            <p className={pdfLanguageMode === 'both' ? "italic text-slate-450 text-[10px] -mt-2.5" : ""}>
                                After carefully reviewing your application, we have decided not to move forward with your profile for this position.
                            </p>
                        )}

                        {(pdfLanguageMode === 'vi' || pdfLanguageMode === 'both') && (
                            <p>
                                Chúng tôi rất trân trọng thời gian và nỗ lực của bạn đã đầu tư vào quá trình tuyển dụng. Mặc dù vị trí này chưa thực sự phù hợp ở thời điểm hiện tại, chúng tôi rất mong muốn được lưu giữ hồ sơ của bạn để liên hệ cho các cơ hội trong tương lai phù hợp hơn với kinh nghiệm của bạn.
                            </p>
                        )}
                        {(pdfLanguageMode === 'en' || pdfLanguageMode === 'both') && (
                            <p className={pdfLanguageMode === 'both' ? "italic text-slate-450 text-[10px] -mt-2.5" : ""}>
                                We appreciate the time and effort you invested in the recruitment process. Although this role is not the right match at this stage, we would be happy to keep your profile on file for future opportunities that may better fit your experience.
                            </p>
                        )}

                        {(pdfLanguageMode === 'vi' || pdfLanguageMode === 'both') && (
                            <p>
                                Chúng tôi xin chúc bạn luôn gặp nhiều may mắn và thành công trên con đường sự nghiệp của mình.
                            </p>
                        )}
                        {(pdfLanguageMode === 'en' || pdfLanguageMode === 'both') && (
                            <p className={pdfLanguageMode === 'both' ? "italic text-slate-450 text-[10px] -mt-2.5" : ""}>
                                We wish you all the best in your professional journey.
                            </p>
                        )}

                        <div className="pt-6 border-t border-slate-100 text-left text-[11px] font-bold text-slate-700 space-y-1">
                            <p>
                                {pdfLanguageMode === 'vi' ? 'Trân trọng,' : pdfLanguageMode === 'en' ? 'Kind regards,' : 'Trân trọng / Kind regards,'}
                            </p>
                        </div>
                    </div>
                ) : (
                    /* OFFER LETTER CONTENT */
                    <div className="space-y-6">
                        <div className="text-[11px] font-medium space-y-4 text-slate-700 leading-relaxed text-left">
                            <p>
                                {pdfLanguageMode === 'vi' ? 'Thân gửi' : pdfLanguageMode === 'en' ? 'Dear' : 'Thân gửi / Dear'} {candidate?.full_name},
                            </p>

                            {(pdfLanguageMode === 'vi' || pdfLanguageMode === 'both') && (
                                <p>
                                    Cảm ơn bạn đã dành thời gian gặp gỡ chúng tôi và chia sẻ những kinh nghiệm của mình trong quá trình phỏng vấn vừa qua.
                                </p>
                            )}
                            {(pdfLanguageMode === 'en' || pdfLanguageMode === 'both') && (
                                <p className={pdfLanguageMode === 'both' ? "italic text-slate-450 text-[10px] -mt-2.5" : ""}>
                                    Thank you for taking the time to meet with us and for sharing your experience during the interview process.
                                </p>
                            )}

                            {(pdfLanguageMode === 'vi' || pdfLanguageMode === 'both') && (
                                <p>
                                    Chúng tôi rất vui mừng thông báo rằng chúng tôi muốn đề xuất lời mời nhận việc cho bạn ở vị trí {(candidate as any)?.hiring_requests?.position_title || '-'} tại {companyName}.
                                </p>
                            )}
                            {(pdfLanguageMode === 'en' || pdfLanguageMode === 'both') && (
                                <p className={pdfLanguageMode === 'both' ? "italic text-slate-450 text-[10px] -mt-2.5" : ""}>
                                    We are pleased to inform you that we would like to offer you the position of {(candidate as any)?.hiring_requests?.position_title || '-'} at {companyName}.
                                </p>
                            )}

                            {(pdfLanguageMode === 'vi' || pdfLanguageMode === 'both') && (
                                <p>
                                    Chúng tôi tin tưởng rằng hồ sơ, thái độ và kinh nghiệm của bạn rất phù hợp với vai trò này, và chúng tôi rất hân hạnh được chào đón bạn gia nhập đội ngũ.
                                </p>
                            )}
                            {(pdfLanguageMode === 'en' || pdfLanguageMode === 'both') && (
                                <p className={pdfLanguageMode === 'both' ? "italic text-slate-450 text-[10px] -mt-2.5" : ""}>
                                    We believe your profile, attitude, and experience are a good match for the role, and we would be happy to welcome you to our team.
                                </p>
                            )}
                        </div>

                        {/* Offer Details */}
                        <div className="space-y-3 pt-3 border-t border-slate-100 text-left">
                            <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-1.5">
                                {pdfLanguageMode === 'vi' ? 'Tóm tắt Offer:' : pdfLanguageMode === 'en' ? 'Offer Summary:' : 'Tóm tắt Offer / Offer Summary:'}
                            </h3>
                            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-[11px] font-semibold text-slate-700">
                                <div className="border-b border-slate-50 pb-1">
                                    <p className="text-slate-450 uppercase text-[8px]">
                                        {pdfLanguageMode === 'vi' ? 'Vị trí công việc' : pdfLanguageMode === 'en' ? 'Position' : 'Vị trí công việc / Position'}
                                    </p>
                                    <p className="text-xs font-bold text-slate-800">{(candidate as any)?.hiring_requests?.position_title || '-'}</p>
                                </div>
                                <div className="border-b border-slate-50 pb-1">
                                    <p className="text-slate-450 uppercase text-[8px]">
                                        {pdfLanguageMode === 'vi' ? 'Ngày bắt đầu' : pdfLanguageMode === 'en' ? 'Start Date' : 'Ngày bắt đầu / Start Date'}
                                    </p>
                                    <p className="text-xs font-bold text-slate-800">
                                        {(() => {
                                            const startVal = (candidate as any)?.offer_start_date
                                            if (!startVal || startVal === 'TBD') {
                                                return pdfLanguageMode === 'vi' ? 'Sẽ thỏa thuận (TBD)' : 'To Be Decided (TBD)'
                                            }
                                            const parts = startVal.split(' ')
                                            const datePart = parts[0]
                                            const timePart = parts[1]
                                            const formattedDate = formatToDDMMYYYY(datePart)
                                            return timePart ? `${timePart} - ${formattedDate}` : formattedDate
                                        })()}
                                    </p>
                                </div>
                                <div className="border-b border-slate-50 pb-1">
                                    <p className="text-slate-450 uppercase text-[8px]">
                                        {pdfLanguageMode === 'vi' ? 'Mức lương' : pdfLanguageMode === 'en' ? 'Salary' : 'Mức lương / Salary'}
                                    </p>
                                    <p className="text-xs font-bold text-blue-700">
                                        {salaryAmount || '0'} VND / {
                                            pdfLanguageMode === 'vi' ? (salaryType === 'fixed' ? 'Tháng' : 'Giờ') :
                                            pdfLanguageMode === 'en' ? (salaryType === 'fixed' ? 'Month' : 'Hour') :
                                            (salaryType === 'fixed' ? 'Tháng (Month)' : 'Giờ (Hour)')
                                        }
                                    </p>
                                </div>
                                <div className="border-b border-slate-50 pb-1">
                                    <p className="text-slate-450 uppercase text-[8px]">
                                        {pdfLanguageMode === 'vi' ? 'Loại hợp đồng' : pdfLanguageMode === 'en' ? 'Employment Type' : 'Loại hợp đồng / Employment Type'}
                                    </p>
                                    <p className="text-xs font-bold text-slate-800">
                                        {(() => {
                                            const isFullTime = (candidate as any)?.hiring_requests?.employment_type === 'full_time'
                                            if (pdfLanguageMode === 'vi') return isFullTime ? 'Toàn thời gian' : 'Bán thời gian'
                                            if (pdfLanguageMode === 'en') return isFullTime ? 'Full-time' : 'Part-time'
                                            return isFullTime ? 'Toàn thời gian (Full-time)' : 'Bán thời gian (Part-time)'
                                        })()}
                                    </p>
                                </div>
                                <div className="border-b border-slate-50 pb-1 col-span-2">
                                    <p className="text-slate-450 uppercase text-[8px]">
                                        {pdfLanguageMode === 'vi' ? 'Địa điểm ngày đầu' : pdfLanguageMode === 'en' ? 'First Day Location' : 'Địa điểm ngày đầu / First Day Location'}
                                    </p>
                                    <p className="text-xs font-bold text-slate-800">
                                        {(() => {
                                            const br = branches.find(b => b.id === (candidate as any)?.offer_branch_id || b.id === offerBranchId)
                                            if (!br) {
                                                return pdfLanguageMode === 'vi' ? 'Sẽ thỏa thuận (TBD)' : pdfLanguageMode === 'en' ? 'To Be Decided (TBD)' : 'Sẽ thỏa thuận (TBD) / To Be Decided (TBD)'
                                            }
                                            return `${br.name} - ${br.address}`
                                        })()}
                                    </p>
                                </div>
                                <div className="border-b border-slate-50 pb-1 col-span-2">
                                    <p className="text-slate-450 uppercase text-[8px]">
                                        {pdfLanguageMode === 'vi' ? 'Chi nhánh phân công' : pdfLanguageMode === 'en' ? 'Assigned Branches' : 'Chi nhánh phân công / Assigned Branches'}
                                    </p>
                                    <p className="text-xs font-bold text-slate-800">{branchNames || '-'}</p>
                                </div>
                                <div className="border-b border-slate-50 pb-1 col-span-2">
                                    <p className="text-slate-450 uppercase text-[8px]">
                                        {pdfLanguageMode === 'vi' ? 'Thời gian thử việc' : pdfLanguageMode === 'en' ? 'Probation Period' : 'Thời gian thử việc / Probation Period'}
                                    </p>
                                    <p className="text-xs font-bold text-slate-800">
                                        {(() => {
                                            const m = parseInt(probationMonths, 10);
                                            if (isNaN(m) || m <= 0) {
                                                return pdfLanguageMode === 'vi' ? 'Không thử việc' : 
                                                       pdfLanguageMode === 'en' ? 'None' : 
                                                       'Không thử việc / None';
                                            }
                                            
                                            const pcts = Array.from({ length: m }).map((_, idx) => {
                                                return probationSalaryPcts[idx] || probationSalaryPct || '100';
                                            });

                                            if (m === 1) {
                                                const pctStr = `${pcts[0]}%`;
                                                return pdfLanguageMode === 'vi' ? `1 tháng - ${pctStr} lương` :
                                                       pdfLanguageMode === 'en' ? `1 month - ${pctStr} salary` :
                                                       `1 tháng - ${pctStr} lương / 1 month - ${pctStr} salary`;
                                            }

                                            const viDetails = pcts.map((p, i) => `T${i + 1}: ${p}%`).join(', ');
                                            const enDetails = pcts.map((p, i) => `M${i + 1}: ${p}%`).join(', ');

                                            return pdfLanguageMode === 'vi' ? `${m} tháng (${viDetails}) lương` :
                                                   pdfLanguageMode === 'en' ? `${m} months (${enDetails}) salary` :
                                                   `${m} tháng (${viDetails}) lương / ${m} months (${enDetails}) salary`;
                                        })()}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Deadline */}
                        <div className="text-[11px] font-semibold space-y-2 pt-4 text-slate-650 leading-relaxed text-left border-t border-slate-100">
                            {(pdfLanguageMode === 'vi' || pdfLanguageMode === 'both') && (
                                <p>
                                    Vui lòng phản hồi quyết định của bạn trước ngày {formatToDDMMYYYY((candidate as any)?.offer_expiry_date || offerExpiryDate)}
                                </p>
                            )}
                            {(pdfLanguageMode === 'en' || pdfLanguageMode === 'both') && (
                                <p className={pdfLanguageMode === 'both' ? "italic text-slate-500" : ""}>
                                    Please let us know your decision by {formatToDDMMYYYY((candidate as any)?.offer_expiry_date || offerExpiryDate)}
                                </p>
                            )}
                        </div>

                        {/* Footer Signature */}
                        <div className="pt-8 text-left text-[11px] font-bold text-slate-700 space-y-1">
                            <p>
                                {pdfLanguageMode === 'vi' ? 'Trân trọng,' : pdfLanguageMode === 'en' ? 'Kind regards,' : 'Trân trọng / Kind regards,'}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </Transition>
    )
}