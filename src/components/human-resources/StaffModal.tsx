import { useState, useEffect } from 'react'
import { X, Star } from 'lucide-react'
import { HRStaffMember, HRDepartment, HRPosition, EmploymentType, SalaryType, StaffStatus } from '@/types/human-resources'
import { supabase } from '@/lib/supabase'
import { useSettings } from '@/contexts/SettingsContext'
import { getVietnamBanks, VietnamBank } from '@/lib/vietnamBanks'

export interface StaffModalProps {
    open: boolean
    onClose: () => void
    onSave: (data: Partial<HRStaffMember>, branchIds: string[]) => Promise<void>
    staff: HRStaffMember | null
    branches: { id: string; name: string; city?: string | null }[]
    departments: HRDepartment[]
    positions: HRPosition[]
    saving: boolean
    isRehire?: boolean
}

export function StaffModal({ open, onClose, onSave, staff, branches, departments, positions, saving, isRehire }: StaffModalProps) {
    const { language } = useSettings()
    const [lastName, setLastName]             = useState('')
    const [middleName, setMiddleName]         = useState('')
    const [firstName, setFirstName]           = useState('')
    const [departmentId, setDepartmentId]     = useState('')
    const [positionId, setPositionId]         = useState('')
    const [phone, setPhone]                   = useState('')
    const [email, setEmail]                   = useState('')
    const [employmentType, setEmploymentType] = useState<EmploymentType>('full_time')
    const [salaryType, setSalaryType]         = useState<SalaryType>('fixed')
    const [salaryAmount, setSalaryAmount]     = useState('')
    const [startDate, setStartDate]           = useState('')
    const [probationMonths, setProbationMonths] = useState('')
    const [probationSalaryPct, setProbationSalaryPct] = useState('100')
    const [status, setStatus]                 = useState<StaffStatus>('active')
    const [notes, setNotes]                   = useState('')
    const [city, setCity]                     = useState('')
    const [address, setAddress]               = useState('')
    const [skillLevel, setSkillLevel]         = useState('1')
    const [documentType, setDocumentType]     = useState<'id_card' | 'passport'>('id_card')
    const [documentNumber, setDocumentNumber] = useState('')
    const [selectedBranches, setSelectedBranches] = useState<string[]>([])
    const [bankName, setBankName] = useState('')
    const [bankAccountNumber, setBankAccountNumber] = useState('')
    const [bankAccountName, setBankAccountName] = useState('')
    const [bankSameAsStaff, setBankSameAsStaff] = useState(false)
    const [vietnamBanks, setVietnamBanks] = useState<VietnamBank[]>([])

    const [staffCode, setStaffCode] = useState('')
    const [dateOfBirth, setDateOfBirth] = useState('')
    const [gender, setGender] = useState('')
    const [maritalStatus, setMaritalStatus] = useState('')
    const [bankBranch, setBankBranch] = useState('')
    const [emergencyContactName, setEmergencyContactName] = useState('')
    const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('')
    const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
    const [documentIssueDate, setDocumentIssueDate] = useState('')
    const [documentIssuePlace, setDocumentIssuePlace] = useState('')

    useEffect(() => {
        getVietnamBanks().then(setVietnamBanks)
    }, [])

    useEffect(() => {
        if (bankSameAsStaff) {
            const buildFullName = [lastName.trim(), middleName.trim(), firstName.trim()]
                .filter(Boolean)
                .join(' ')
            setBankAccountName(buildFullName)
        }
    }, [lastName, middleName, firstName, bankSameAsStaff])

    // Filter positions by selected department
    const filteredPositions = departmentId
        ? positions.filter(p => !p.department_id || p.department_id === departmentId)
        : positions

    useEffect(() => {
        if (staff) {
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
            } else {
                setLastName('')
                setMiddleName('')
                setFirstName('')
            }
            
            setPhone(staff.phone || '')
            setEmail(staff.email || '')
            setCity(staff.city || '')
            setAddress(staff.address || '')
            setSkillLevel(staff.skill_level ? staff.skill_level.toString() : '1')
            setDocumentType(staff.document_type || 'id_card')
            setDocumentNumber(staff.document_number || '')
            
            setStaffCode(staff.staff_code || '')
            setDateOfBirth(staff.date_of_birth || '')
            setGender(staff.gender || 'Nam')
            setMaritalStatus(staff.marital_status || 'Độc thân')
            setBankBranch(staff.bank_branch || '')
            setEmergencyContactName(staff.emergency_contact_name || '')
            setEmergencyContactRelationship(staff.emergency_contact_relationship || '')
            setEmergencyContactPhone(staff.emergency_contact_phone || '')
            setDocumentIssueDate(staff.document_issue_date || '')
            setDocumentIssuePlace(staff.document_issue_place || '')
            
            if (isRehire) {
                // Clear employment data for re-hire
                setDepartmentId('')
                setPositionId('')
                setEmploymentType('full_time')
                setSalaryType('fixed')
                setSalaryAmount('')
                setStartDate('')
                setProbationMonths('')
                setProbationSalaryPct('100')
                setStatus('active')
                setNotes('')
                setSelectedBranches([])
                setBankName('')
                setBankAccountNumber('')
                setBankAccountName('')
                setBankSameAsStaff(false)
            } else {
                setDepartmentId(staff.department_id || '')
                setPositionId(staff.position_id || '')
                setEmploymentType(staff.employment_type)
                setSalaryType(staff.salary_type)
                setSalaryAmount(staff.salary_amount ? new Intl.NumberFormat('en-US').format(staff.salary_amount) : '')
                setStartDate(staff.start_date || '')
                setProbationMonths(staff.probation_months ? staff.probation_months.toString() : '')
                setProbationSalaryPct(staff.probation_salary_pct ? staff.probation_salary_pct.toString() : '100')
                setStatus(staff.status)
                setNotes(staff.notes || '')
                const branchIds = staff.hr_staff_branches?.map(b => b.branch_id) || []
                setSelectedBranches(branchIds)
                setBankName(staff.bank_name || '')
                setBankAccountNumber(staff.bank_account_number || '')
                setBankAccountName(staff.bank_account_name || '')
                setBankSameAsStaff(staff.bank_same_as_staff || false)
            }
        } else {
            setLastName(''); setMiddleName(''); setFirstName('')
            setDepartmentId(''); setPositionId(''); setPhone(''); setEmail('')
            setEmploymentType('full_time'); setSalaryType('fixed'); setSalaryAmount('')
            setStartDate(''); setProbationMonths(''); setProbationSalaryPct('100'); setStatus('active'); setNotes('')
            setSelectedBranches([])
            setBankName('')
            setBankAccountNumber('')
            setBankAccountName('')
            setBankSameAsStaff(false)
            setCity('')
            setAddress('')
            setSkillLevel('1')
            setDocumentType('id_card')
            setDocumentNumber('')
            setStaffCode('')
            setDateOfBirth('')
            setGender('Nam')
            setMaritalStatus('Độc thân')
            setBankBranch('')
            setEmergencyContactName('')
            setEmergencyContactRelationship('')
            setEmergencyContactPhone('')
            setDocumentIssueDate('')
            setDocumentIssuePlace('')
        }
    }, [staff, open, isRehire])

    const toggleBranch = (id: string) => {
        setSelectedBranches(prev => {
            if (prev.includes(id)) {
                return prev.filter(b => b !== id)
            }
            return [...prev, id]
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!selectedBranches || selectedBranches.length === 0) {
            alert(language === 'vi'
                ? 'Nhân viên phải được phân công ít nhất một chi nhánh.'
                : 'At least one branch must be assigned to the staff member.');
            return;
        }

        const phoneVal = phone.trim() || null;
        const emailVal = email.trim() || null;
        const docNumVal = documentNumber.trim() || null;

        // Check for duplicates in the database (active or archived) on Phone, Email or Document number
        if (phoneVal || emailVal || docNumVal) {
            let query = supabase.from('hr_staff').select('id, full_name, status, phone, email, document_number');
            let orParts: string[] = []
            if (phoneVal) orParts.push(`phone.eq."${phoneVal}"`)
            if (emailVal) orParts.push(`email.ilike."${emailVal}"`)
            if (docNumVal) orParts.push(`document_number.eq."${docNumVal}"`)
            
            query = query.or(orParts.join(','));

            if (staff) {
                query = query.neq('id', staff.id);
            }

            const { data, error } = await query;
            if (!error && data && data.length > 0) {
                const duplicate = data[0];
                const duplicateStatus = duplicate.status === 'active' 
                    ? (language === 'vi' ? 'Đang hoạt động' : 'active') 
                    : duplicate.status === 'inactive' 
                        ? (language === 'vi' ? 'Ngừng hoạt động' : 'inactive') 
                        : (language === 'vi' ? 'Đã thôi việc' : 'terminated');
                alert(language === 'vi' 
                    ? `Không thể lưu: Nhân viên "${duplicate.full_name}" (${duplicateStatus}) đã tồn tại với số điện thoại, email hoặc số giấy tờ này.` 
                    : `Cannot save: A staff member named "${duplicate.full_name}" (${duplicateStatus}) already exists with this phone, email, or document number.`);
                return; // Stop submission
            }
        }

        // Check for duplicate bank account + bank name
        const bankNameVal = bankName.trim() || null;
        const bankAccNumVal = bankAccountNumber.trim() || null;
        if (bankNameVal && bankAccNumVal) {
            let bankQuery = supabase.from('hr_staff')
                .select('id, full_name, status')
                .eq('bank_name', bankNameVal)
                .eq('bank_account_number', bankAccNumVal)
            
            if (staff) {
                bankQuery = bankQuery.neq('id', staff.id);
            }
            const { data: bankDupData, error: bankDupErr } = await bankQuery;
            if (!bankDupErr && bankDupData && bankDupData.length > 0) {
                const duplicate = bankDupData[0];
                const duplicateStatus = duplicate.status === 'active' 
                    ? (language === 'vi' ? 'Đang hoạt động' : 'active') 
                    : duplicate.status === 'inactive' 
                        ? (language === 'vi' ? 'Ngừng hoạt động' : 'inactive') 
                        : (language === 'vi' ? 'Đã thôi việc' : 'terminated');
                alert(language === 'vi'
                    ? `Không thể lưu: Tài khoản ngân hàng này đã được sử dụng bởi nhân viên "${duplicate.full_name}" (${duplicateStatus}).`
                    : `Cannot save: This bank account is already in use by staff member "${duplicate.full_name}" (${duplicateStatus}).`);
                return;
            }
        }

        const buildFullName = [lastName.trim(), middleName.trim(), firstName.trim()]
            .filter(Boolean)
            .join(' ')
            
        const deptName = departments.find(d => d.id === departmentId)?.name || null
        const posName = positions.find(p => p.id === positionId)?.name || ''
        
        let probationEndDate = null;
        const probMonths = parseInt(probationMonths, 10);
        if (startDate && !isNaN(probMonths) && probMonths > 0) {
            const dateObj = new Date(startDate);
            dateObj.setMonth(dateObj.getMonth() + probMonths);
            dateObj.setDate(dateObj.getDate() - 1);
            probationEndDate = dateObj.toISOString().split('T')[0];
        }

        await onSave(
            {
                full_name: buildFullName,
                position: posName,
                department: deptName,
                department_id: departmentId || null,
                position_id: positionId || null,
                phone: phone.trim() || null,
                email: email.trim() || null,
                city: city.trim() || null,
                address: address.trim() || null,
                skill_level: (staff && !isRehire) ? (skillLevel ? parseInt(skillLevel, 10) : undefined) : undefined,
                employment_type: employmentType,
                salary_type: salaryType,
                salary_amount: parseFloat(salaryAmount.replace(/,/g, '')) || 0,
                start_date: startDate || null,
                probation_months: isNaN(probMonths) ? 0 : probMonths,
                probation_salary_pct: parseFloat(probationSalaryPct) || 100,
                probation_end_date: probationEndDate,
                status,
                notes: notes.trim() || null,
                bank_name: bankName.trim() || null,
                bank_account_number: bankAccountNumber.trim() || null,
                bank_account_name: bankSameAsStaff ? buildFullName : (bankAccountName.trim() || null),
                bank_same_as_staff: bankSameAsStaff,
                document_type: documentType,
                document_number: documentNumber || null,
                staff_code: (staff && !isRehire) ? (staffCode.trim() || null) : null,
                date_of_birth: dateOfBirth || null,
                gender: gender.trim() || null,
                marital_status: maritalStatus.trim() || null,
                bank_branch: bankBranch.trim() || null,
                emergency_contact_name: emergencyContactName.trim() || null,
                emergency_contact_relationship: emergencyContactRelationship.trim() || null,
                emergency_contact_phone: emergencyContactPhone.trim() || null,
                document_issue_date: documentIssueDate || null,
                document_issue_place: documentIssuePlace.trim() || null,
            },
            selectedBranches
        )
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {isRehire 
                            ? (language === 'vi' ? 'Tuyển dụng lại nhân viên' : 'Re-hire Staff Member') 
                            : (staff 
                                ? (language === 'vi' ? 'Chỉnh sửa nhân viên' : 'Edit Staff Member') 
                                : (language === 'vi' ? 'Thêm nhân viên' : 'Add Staff'))}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Row 1: Name Parts */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Họ *' : 'Last Name *'}</label>
                            <input required value={lastName} onChange={e => setLastName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Tên đệm' : 'Middle Name'}</label>
                            <input value={middleName} onChange={e => setMiddleName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Tên *' : 'First Name *'}</label>
                            <input required value={firstName} onChange={e => setFirstName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                    </div>

                    {/* Row 2: Phone + Email + City */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Số điện thoại' : 'Phone'}</label>
                            <input value={phone} onChange={e => setPhone(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Email' : 'Email'}</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Thành phố' : 'City'}</label>
                            <select value={city} onChange={e => setCity(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                <option value="">{language === 'vi' ? 'Không' : 'None'}</option>
                                {Array.from(new Set(branches.map(b => (b as any).city).filter(Boolean))).sort().map((c: any) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Row 2.5: Address */}
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Địa chỉ' : 'Address'}</label>
                            <input 
                                value={address} 
                                onChange={e => setAddress(e.target.value)}
                                autoComplete="one-time-code"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                            />
                        </div>
                    </div>

                    {/* Row 2.6: Date of Birth + Gender + Marital Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Ngày sinh' : 'Date of Birth'}</label>
                            <input type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none h-10 bg-white" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Giới tính' : 'Gender'}</label>
                            <select value={gender} onChange={e => setGender(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white h-10">
                                <option value="Nam">{language === 'vi' ? 'Nam' : 'Male'}</option>
                                <option value="Nữ">{language === 'vi' ? 'Nữ' : 'Female'}</option>
                                <option value="Khác">{language === 'vi' ? 'Khác' : 'Other'}</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Tình trạng hôn nhân' : 'Marital Status'}</label>
                            <select value={maritalStatus} onChange={e => setMaritalStatus(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white h-10">
                                <option value="Độc thân">{language === 'vi' ? 'Độc thân' : 'Single'}</option>
                                <option value="Đã kết hôn">{language === 'vi' ? 'Đã kết hôn' : 'Married'}</option>
                                <option value="Ly hôn">{language === 'vi' ? 'Ly hôn' : 'Divorced'}</option>
                                <option value="Góa phụ">{language === 'vi' ? 'Góa phụ' : 'Widowed'}</option>
                            </select>
                        </div>
                    </div>

                    {/* Document Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="staff_document_type" className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Loại giấy tờ *' : 'Document Type *'}</label>
                            <select 
                                id="staff_document_type"
                                required 
                                value={documentType} 
                                onChange={e => setDocumentType(e.target.value as 'id_card' | 'passport')}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white h-10"
                            >
                                <option value="id_card">{language === 'vi' ? 'Căn cước công dân (ID Card)' : 'ID Card'}</option>
                                <option value="passport">{language === 'vi' ? 'Hộ chiếu (Passport)' : 'Passport'}</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="staff_document_number" className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Số giấy tờ *' : 'Document Number *'}</label>
                            <input 
                                id="staff_document_number"
                                required 
                                value={documentNumber} 
                                onChange={e => setDocumentNumber(e.target.value)}
                                placeholder={documentType === 'id_card' ? (language === 'vi' ? 'Nhập số CCCD...' : 'Enter ID number...') : (language === 'vi' ? 'Nhập số hộ chiếu...' : 'Enter passport number...')}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                            />
                        </div>
                    </div>

                    {/* Document Issue Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Ngày cấp giấy tờ' : 'Document Issue Date'}</label>
                            <input type="date" value={documentIssueDate} onChange={e => setDocumentIssueDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none h-10 bg-white" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Nơi cấp giấy tờ' : 'Document Place of Issue'}</label>
                            <input value={documentIssuePlace} onChange={e => setDocumentIssuePlace(e.target.value)}
                                placeholder={language === 'vi' ? 'Ví dụ: Cục Cảnh sát QLHC về TTXH' : 'e.g. Police Department'}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>
                    </div>

                    {/* Row 3: Department + Position + Tanca Staff Code */}
                    <div className={`grid grid-cols-1 gap-4 ${(staff && !isRehire) ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Phòng ban' : 'Department'}</label>
                            <select value={departmentId} onChange={e => { setDepartmentId(e.target.value); setPositionId('') }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white h-10">
                                <option value="">{language === 'vi' ? 'Chọn phòng ban…' : 'Select department…'}</option>
                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Chức vụ *' : 'Position *'}</label>
                            <select required value={positionId} onChange={e => setPositionId(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white h-10">
                                <option value="">{language === 'vi' ? 'Chọn chức vụ…' : 'Select position…'}</option>
                                {filteredPositions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        {(staff && !isRehire) && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Mã NV (Tanca)' : 'Tanca Staff Code'}</label>
                                <input value={staffCode} onChange={e => setStaffCode(e.target.value)}
                                    placeholder={language === 'vi' ? 'Ví dụ: TC001' : 'e.g. TC001'}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none h-10 bg-white" />
                            </div>
                        )}
                    </div>

                    {/* Row 3.5: Skill Level & Status */}
                    {(staff && !isRehire) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Trình độ kỹ năng vận hành' : 'Operational Skill Level'}</label>
                                <div className="flex items-center gap-2 h-10">
                                    <div className="flex items-center gap-0.5">
                                        {[1, 2, 3, 4, 5].map(i => {
                                            const currentLevel = parseInt(skillLevel, 10) || 1
                                            return (
                                                <button
                                                    type="button"
                                                    key={i}
                                                    onClick={() => setSkillLevel(i.toString())}
                                                    className="p-1 rounded-lg hover:bg-slate-50 transition-all active:scale-95 cursor-pointer"
                                                >
                                                    <Star 
                                                        className={`w-6 h-6 transition-colors ${
                                                            i <= currentLevel 
                                                                ? 'text-indigo-500 fill-indigo-500' 
                                                                : 'text-gray-200 hover:text-indigo-300'
                                                        }`} 
                                                    />
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <span className="text-xs font-semibold text-slate-500 ml-2">
                                        {parseInt(skillLevel, 10) === 1 && (language === 'vi' ? 'Cấp độ 1 (Cơ bản)' : 'Level 1 (Basic)')}
                                        {parseInt(skillLevel, 10) === 2 && (language === 'vi' ? 'Cấp độ 2' : 'Level 2')}
                                        {parseInt(skillLevel, 10) === 3 && (language === 'vi' ? 'Cấp độ 3' : 'Level 3')}
                                        {parseInt(skillLevel, 10) === 4 && (language === 'vi' ? 'Cấp độ 4' : 'Level 4')}
                                        {parseInt(skillLevel, 10) === 5 && (language === 'vi' ? 'Cấp độ 5 (Chuyên gia)' : 'Level 5 (Expert)')}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Trạng thái' : 'Status'}</label>
                                <select value={status} onChange={e => setStatus(e.target.value as StaffStatus)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                    <option value="active">{language === 'vi' ? 'Đang hoạt động' : 'Active'}</option>
                                    <option value="inactive">{language === 'vi' ? 'Ngừng hoạt động' : 'Inactive'}</option>
                                    <option value="terminated">{language === 'vi' ? 'Đã thôi việc' : 'Terminated'}</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Row 4: Employment + Salary */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Loại hình làm việc' : 'Employment Type'}</label>
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
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                <option value="full_time">{language === 'vi' ? 'Toàn thời gian' : 'Full-time'}</option>
                                <option value="part_time">{language === 'vi' ? 'Bán thời gian' : 'Part-time'}</option>
                                <option value="outsourced">{language === 'vi' ? 'Thuê ngoài' : 'Outsourced'}</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {language === 'vi' 
                                    ? `Lương (VND) ${employmentType === 'full_time' ? '/tháng' : '/giờ'}` 
                                    : `Amount (VND) ${employmentType === 'full_time' ? '/month' : '/hour'}`}
                            </label>
                            <input type="text" value={salaryAmount} onChange={e => {
                                const val = e.target.value.replace(/\D/g, '')
                                setSalaryAmount(val ? new Intl.NumberFormat('en-US').format(parseInt(val, 10)) : '')
                            }}
                                placeholder="0"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-right font-medium" />
                        </div>
                    </div>

                    {/* Row 5: Start Date + Probation */}
                    {employmentType !== 'outsourced' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Ngày bắt đầu' : 'Start Date'}</label>
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Thời gian thử việc (Tháng)' : 'Probation Time (Months)'}</label>
                                <input type="number" min="0" step="1" value={probationMonths} onChange={e => setProbationMonths(e.target.value)}
                                    placeholder={language === 'vi' ? 'Ví dụ: 2' : 'e.g. 2'}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Lương thử việc (%)' : 'Probation Salary (%)'}</label>
                                <div className="relative">
                                    <input type="number" min="0" max="100" step="1" value={probationSalaryPct} onChange={e => setProbationSalaryPct(e.target.value)}
                                        placeholder="100"
                                        className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Branch Assignment */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{language === 'vi' ? 'Phân công chi nhánh' : 'Branch Assignment'}</label>
                        <div className="flex flex-wrap gap-2">
                            {branches.map(branch => {
                                const isSelected = selectedBranches.includes(branch.id)
                                return (
                                    <button
                                        type="button"
                                        key={branch.id}
                                        onClick={() => toggleBranch(branch.id)}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                                            isSelected 
                                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                                            : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        {branch.name}
                                    </button>
                                )
                            })}
                        </div>
                        {branches.length === 0 && (
                            <p className="text-xs text-gray-400 mt-1">{language === 'vi' ? 'Không tìm thấy chi nhánh nào. Vui lòng thêm chi nhánh trong phần Cài đặt chung trước.' : 'No branches found. Add branches in General Settings first.'}</p>
                        )}
                    </div>

                    <hr className="border-gray-100" />

                    {/* Bank Details */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-1">
                            {language === 'vi' ? 'Thông tin ngân hàng' : 'Bank Details'}
                        </h4>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700">
                                        {language === 'vi' ? 'Tên chủ tài khoản' : 'Account Holder Name'}
                                    </label>
                                    <label className="flex items-center gap-1 text-xs text-blue-600 font-medium cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={bankSameAsStaff} 
                                            onChange={e => setBankSameAsStaff(e.target.checked)}
                                            className="rounded text-blue-600 focus:ring-blue-500 border-gray-300 w-3.5 h-3.5" 
                                        />
                                        {language === 'vi' ? 'Trùng tên nhân viên' : 'Same as staff'}
                                    </label>
                                </div>
                                <input 
                                    disabled={bankSameAsStaff}
                                    value={bankAccountName} 
                                    onChange={e => setBankAccountName(e.target.value)}
                                    placeholder={language === 'vi' ? 'Ví dụ: NGUYEN VAN A' : 'e.g. NGUYEN VAN A'}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed uppercase" 
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {language === 'vi' ? 'Tên ngân hàng' : 'Bank Name'}
                                </label>
                                <input 
                                    type="text"
                                    list="modal-banks-list"
                                    value={bankName} 
                                    onChange={e => setBankName(e.target.value)}
                                    placeholder={language === 'vi' ? 'Chọn hoặc nhập tên ngân hàng...' : 'Select or type bank...'}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white" 
                                />
                                <datalist id="modal-banks-list">
                                    {vietnamBanks.map(b => (
                                        <option key={b.bin} value={b.shortName}>
                                            {b.name} ({b.code})
                                        </option>
                                    ))}
                                </datalist>
                            </div>

                            <div className="sm:col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {language === 'vi' ? 'Số tài khoản' : 'Bank Account Number'}
                                </label>
                                <input 
                                    value={bankAccountNumber} 
                                    onChange={e => setBankAccountNumber(e.target.value)}
                                    placeholder={language === 'vi' ? 'Ví dụ: 1234567890' : 'e.g. 1234567890'}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                                />
                            </div>

                            <div className="sm:col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {language === 'vi' ? 'Chi nhánh ngân hàng' : 'Bank Branch'}
                                </label>
                                <input 
                                    value={bankBranch} 
                                    onChange={e => setBankBranch(e.target.value)}
                                    placeholder={language === 'vi' ? 'Ví dụ: Chi nhánh Bến Thành' : 'e.g. Ben Thanh Branch'}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                                />
                            </div>
                        </div>
                    </div>

                    <hr className="border-gray-100" />

                    {/* Emergency Contact */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-1">
                            {language === 'vi' ? 'Liên hệ khẩn cấp' : 'Emergency Contact'}
                        </h4>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {language === 'vi' ? 'Người liên hệ' : 'Contact Person'}
                                </label>
                                <input 
                                    value={emergencyContactName} 
                                    onChange={e => setEmergencyContactName(e.target.value)}
                                    placeholder={language === 'vi' ? 'Ví dụ: Nguyễn Văn A' : 'e.g. John Doe'}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {language === 'vi' ? 'Quan hệ với nhân viên' : 'Relationship'}
                                </label>
                                <input 
                                    value={emergencyContactRelationship} 
                                    onChange={e => setEmergencyContactRelationship(e.target.value)}
                                    placeholder={language === 'vi' ? 'Ví dụ: Bố, Mẹ, Vợ, Chồng...' : 'e.g. Father, Mother, Spouse...'}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {language === 'vi' ? 'Số di động khẩn cấp' : 'Emergency Mobile Phone'}
                                </label>
                                <input 
                                    value={emergencyContactPhone} 
                                    onChange={e => setEmergencyContactPhone(e.target.value)}
                                    placeholder={language === 'vi' ? 'Ví dụ: 0912345678' : 'e.g. 0912345678'}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                                />
                            </div>
                        </div>
                    </div>

                    <hr className="border-gray-100" />

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'vi' ? 'Ghi chú' : 'Notes'}</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none" />
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                            {language === 'vi' ? 'Hủy' : 'Cancel'}
                        </button>
                        <button type="submit" disabled={saving || !lastName.trim() || !firstName.trim() || !positionId}
                            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                            {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            {isRehire ? (language === 'vi' ? 'Tuyển dụng lại' : 'Re-hire Staff') : (staff ? (language === 'vi' ? 'Cập nhật' : 'Update') : (language === 'vi' ? 'Tạo mới' : 'Create'))}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
