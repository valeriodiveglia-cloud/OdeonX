// /src/app/staff-portal/page.tsx
'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Calendar,
  User,
  FileText,
  Package,
  TrendingUp,
  AlertTriangle,
  Percent,
  Eye,
  EyeOff,
  Lock,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Clock,
  LogOut,
  Download,
  Info,
  Building2,
  Briefcase,
  DollarSign,
  CalendarDays,
  FileSignature,
  FileClock,
  Menu,
  X,
  Plus,
  Star,
  Bell,
  BellRing,
  CheckCircle2,
  CreditCard,
  Landmark,
  Flag,
  Award
} from 'lucide-react'
import MonthPicker from '@/components/MonthPicker'
import { supabase } from '@/lib/supabase'

/* ────────────────────── TYPES ────────────────────── */
type HRStaffMember = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  employment_type: string | null
  position: string | null
  department: string | null
  status: string
  start_date: string | null
  probation_end_date: string | null
  notes: string | null
  salary_amount?: number | null
  bank_name?: string | null
  bank_account_number?: string | null
  bank_account_name?: string | null
  city?: string | null
  address?: string | null
}

type Branch = {
  id: string
  name: string
  city: string | null
}

type Contract = {
  id: string
  signing_date: string | null
  expiration_date: string | null
  basic_salary: number
  uniforms_allowance: number
  lunch_allowance: number
  phone_allowance: number
  fuel_allowance: number
  home_support_allowance: number
  notes: string | null
  version: number
}

type Document = {
  id: string
  document_name: string
  document_type: string
  uploaded_at: string
  download_url: string
}

type AssetHistory = {
  id: string
  asset_id: string
  status: 'assigned' | 'returned' | 'damaged' | 'lost'
  changed_at: string
  notes: string | null
}

type Asset = {
  id: string
  asset_name: string
  serial_number: string | null
  status: 'assigned' | 'returned' | 'damaged' | 'lost'
  quantity: number
  assigned_date: string | null
  return_date: string | null
  initial_condition: string | null
  return_condition: string | null
  notes: string | null
  hr_staff_asset_history?: AssetHistory[]
}

type RoleHistory = {
  id: string
  effective_date: string
  old_position: { name: string } | null
  new_position: { name: string } | null
  notes: string | null
  reason: string | null
}

type SalaryHistory = {
  id: string
  effective_date: string
  previous_amount: number
  new_amount: number
  notes: string | null
  previous_position: { name: string } | null
  new_position: { name: string } | null
  reason?: string | null
}

type PerformanceReview = {
  id: string
  review_date: string
  score: number | null
  feedback: string | null
  notes: string | null
  reviewer_name: string | null
  period: string | null
  rating: number | null
  strengths: string | null
  improvements: string | null
  category_ratings: Record<string, number> | null
}

type DisciplinaryFine = {
  id: string
  date: string
  amount: number
  notes: string | null
  status: string
  deduction_source: string | null
  infraction: { infraction_name: string } | null
}

type StaffWarning = {
  id: string
  date: string
  flag_type: 'green' | 'yellow' | 'red'
  reason: string
  notified_by: string | null
}

type StaffAward = {
  id: string
  date: string
  award_name: string
  amount: number
  status: string
  deduction_source: string | null
  notified_by: string | null
}

type ServiceChargeRecord = {
  month_id: string
  city: string
  hours_worked: number
  total_pool: number
  total_hours: number
  amount_received: number
  percentage: number
}

type RosterAssignmentSnapshot = {
  branch_id: string
  week_start: string
  roster_snapshot: Record<string, string> // key format: branchId::staffId::YYYY-MM-DD -> val: "st-a1,st-pb1"
  shifts_snapshot: {
    id: string
    name: string
    code: string
    startTime: string
    endTime: string
    startTime2?: string
    endTime2?: string
    color: string
    type: 'work' | 'leave'
    hours: number
  }[]
}

type StaffNotification = {
  id: string
  staff_id: string
  title_en: string
  title_vi: string
  body_en: string
  body_vi: string
  category: 'roster' | 'info' | 'document' | 'asset' | 'career' | 'disciplinary' | 'service_charge'
  is_read: boolean
  created_at: string
}

type PortalData = {
  staff: HRStaffMember
  branches: Branch[]
  contracts: Contract[]
  documents: Document[]
  assets: Asset[]
  career: {
    roles: RoleHistory[]
    salaries: SalaryHistory[]
  }
  performance: PerformanceReview[]
  disciplinary: DisciplinaryFine[]
  warnings: StaffWarning[]
  awards: StaffAward[]
  serviceCharges: ServiceChargeRecord[]
  publishedRosters: RosterAssignmentSnapshot[]
  colleagues: Record<string, { id: string; name: string; position: string }>
  notifications: StaffNotification[]
}

type ViewState = 'loading' | 'login' | 'setup' | 'dashboard' | 'change-password'
type Lang = 'en' | 'vi'

/* ────────────────────── TRANSLATIONS ────────────────────── */
const STAFF_PORTAL_DICT = {
  en: {
    StaffPortal: 'Staff Portal',
    Login: 'Login',
    EmailOrPhone: 'Email or Phone',
    Password: 'Password',
    Show: 'Show',
    Hide: 'Hide',
    SignIn: 'Sign In',
    LoginHint: 'If this is your first login, use your Email or Phone. You will be prompted to set a password.',
    AccountAlreadyActive: 'Account already active. Please log in.',
    InvalidEnrollLink: 'Invalid or expired activation link',
    LoadInviteErr: 'Failed to load activation details',
    SetupWelcome: 'Welcome, {name}!',
    SetupSubtitle: 'Set a password for your future logins',
    NewPassword: 'New Password',
    ConfirmPassword: 'Confirm Password',
    PasswordMin: 'Minimum 6 characters',
    RepeatPassword: 'Repeat password',
    SetPasswordBtn: 'Set Password',
    MismatchErr: 'Passwords do not match',
    Logout: 'Logout',
    Language: 'Language',
    Connecting: 'Connecting...',
    Saving: 'Saving...',
    Close: 'Close',
    Roster: 'Roster',
    MyInfo: 'Profile & Contract',
    Documents: 'HR Documents',
    Assets: 'Assigned Assets',
    Career: 'Career & Reviews',
    Disciplinary: 'Disciplinary',
    ServiceCharge: 'Service Charge',
    MyShifts: 'My Shifts',
    AllStaff: 'All Staff',
    WeeklyView: 'Weekly View',
    DailyView: 'Daily View',
    NoRoster: 'Roster not published for this week',
    Colleagues: 'Colleagues',
    Branch: 'Branch',
    SelectBranch: 'Select Branch',
    NextWeek: 'Next Week',
    PrevWeek: 'Prev Week',
    DayOff: 'Day Off',
    Hours: 'Hours',
    Shift: 'Shift',
    GeneralInfo: 'General Information',
    FullName: 'Full Name',
    Email: 'Email',
    Phone: 'Phone',
    Role: 'Role',
    Department: 'Department',
    EmploymentType: 'Employment Type',
    StartDate: 'Start Date',
    ProbationEnd: 'Probation End',
    Contracts: 'Contracts History',
    SigningDate: 'Signing Date',
    ExpirationDate: 'Expiration Date',
    BasicSalary: 'Basic Salary',
    Allowances: 'Allowances',
    UniformAllowance: 'Uniform Allowance',
    LunchAllowance: 'Lunch Allowance',
    PhoneAllowance: 'Phone Allowance',
    FuelAllowance: 'Fuel Allowance',
    HomeAllowance: 'Home Support Allowance',
    Notes: 'Notes',
    NoContracts: 'No contract files found',
    NoDocuments: 'No uploaded HR documents',
    UploadDate: 'Upload Date',
    ChangePassword: 'Change Password',
    CurrentPassword: 'Current Password',
    NewPasswordConfirm: 'Confirm New Password',
    UpdatePasswordBtn: 'Update Password',
    PasswordChangedSuccess: 'Password updated successfully!',
    BankName: 'Bank Name',
    BankAccountNumber: 'Bank Account Number',
    BankAccountName: 'Account Holder Name',
    GrossSalary: 'Gross Salary',
    DocName: 'Document Name',
    DocType: 'Type',
    Action: 'Action',
    DownloadBtn: 'Download',
    SerialNo: 'Serial Number',
    Status: 'Status',
    Qty: 'Qty',
    AssignedAt: 'Assigned At',
    ReturnedAt: 'Returned At',
    InitialCondition: 'Initial Condition',
    ReturnCondition: 'Return Condition',
    AssetHistory: 'Asset Status Logs',
    NoAssets: 'No assets assigned yet',
    Date: 'Date',
    CareerJourney: 'Career & Timeline',
    RoleHistory: 'Role History',
    SalaryHistory: 'Salary History',
    EffectiveDate: 'Effective Date',
    OldPos: 'Old Position',
    NewPos: 'New Position',
    OldSal: 'Old Salary',
    NewSal: 'New Salary',
    NoHistory: 'No events registered in timeline',
    NoSalHistory: 'No salary history logs',
    Performance: 'Performance Reviews',
    Score: 'Score',
    Feedback: 'Feedback',
    NoReviews: 'No performance reviews published',
    DisciplinaryHistory: 'Disciplinary Fines',
    Amount: 'Amount',
    Infraction: 'Infraction',
    Source: 'Deduction Source',
    NoFines: 'No disciplinary logs',
    WarningsHistory: 'Warnings & Flags',
    NoWarnings: 'No warning flags recorded',
    AwardsHistory: 'Awards & Recognitions',
    NoAwards: 'No awards recorded',
    Reason: 'Reason',
    AwardName: 'Award Name',
    CreditSource: 'Credit Source',
    FlagLevel: 'Flag Level',
    PositiveNote: 'Positive Note',
    Caution: 'Caution',
    Warning: 'Flag',
    Month: 'Month',
    HoursWorked: 'Hours Worked',
    TotalPool: 'Total Pool',
    SharePercentage: 'Share %',
    AmountReceived: 'Amount Received',
    NoSC: 'No service charge records found',
    ColleagueName: 'Colleague Name',
    NoShiftsToday: 'No scheduled shifts',
    SCDynamicNote: 'Calculated dynamically based on hours worked in your city for this period. Subject to adjustments.',
    Menu: 'Menu',
    IncorrectPassword: 'Incorrect password',
    TooManyAttempts: 'Too many attempts. Account locked for 15 minutes.',
    AttemptsLeft: '{count} attempts left',
    AttemptsLeftOne: '1 attempt left',
    TryAgainIn: 'Try again in {mins} minutes',
    StaffNotFound: 'Staff member not found',
    AccountNotActive: 'Staff account is not active',
    NoteLabel: 'Note',
    Hired: 'Hired',
    JoinedAs: 'Joined the company as {role} in {dept}',
    RoleTransition: 'Role Changed',
    SalaryAdjustment: 'Salary Changed',
    CategoryRatings: 'Detailed Ratings',
    Strengths: 'Strengths',
    Improvements: 'Areas for Improvement',
    Period: 'Period',
    Reviewer: 'Reviewer',
    Notifications: 'Notifications',
    MarkAllAsRead: 'Mark all as read',
    NoNotifications: 'No new notifications',
    ClearAll: 'Clear all',
    PushSettings: 'Phone Notifications',
    PushEnabled: 'Notifications Enabled',
    PushDisabled: 'Notifications Blocked',
    PushPrompt: 'Click the button below to receive instant shift updates directly on your phone.',
    PushEnableBtn: 'Enable Notifications',
    PushTestBtn: 'Send Test Notification',
    PushUnsupported: 'Not supported by this browser/device',
    PushDeniedInstructions: 'Notifications are blocked. Please enable them in your browser site settings.'
  },
  vi: {
    StaffPortal: 'Cổng Nhân Viên',
    Login: 'Đăng nhập',
    EmailOrPhone: 'Email hoặc Số Điện Thoại',
    Password: 'Mật khẩu',
    Show: 'Hiện',
    Hide: 'Ẩn',
    SignIn: 'Đăng Nhập',
    LoginHint: 'Nếu đăng nhập lần đầu, nhập Email hoặc Số điện thoại. Bạn sẽ được yêu cầu tạo mật khẩu.',
    AccountAlreadyActive: 'Tài khoản đã kích hoạt. Vui lòng đăng nhập.',
    InvalidEnrollLink: 'Liên kết kích hoạt không hợp lệ hoặc đã hết hạn',
    LoadInviteErr: 'Không thể tải thông tin kích hoạt tài khoản',
    SetupWelcome: 'Chào mừng, {name}!',
    SetupSubtitle: 'Đặt mật khẩu cho những lần truy cập tiếp theo',
    NewPassword: 'Mật khẩu mới',
    ConfirmPassword: 'Xác nhận mật khẩu',
    PasswordMin: 'Tối thiểu 6 ký tự',
    RepeatPassword: 'Lặp lại mật khẩu',
    SetPasswordBtn: 'Đặt Mật Khẩu',
    MismatchErr: 'Mật khẩu không khớp',
    Logout: 'Đăng xuất',
    Language: 'Ngôn ngữ',
    Connecting: 'Đang kết nối...',
    Saving: 'Đang lưu...',
    Close: 'Đóng',
    Roster: 'Lịch Làm Việc',
    MyInfo: 'Hồ Sơ & Hợp Đồng',
    Documents: 'Tài Liệu HR',
    Assets: 'Tài Sản Được Giao',
    Career: 'Lịch Sử & Đánh Giá',
    Disciplinary: 'Kỷ Luật & Phạt',
    ServiceCharge: 'Phí dịch vụ',
    MyShifts: 'Ca Làm Của Tôi',
    AllStaff: 'Lịch Nhân Viên',
    WeeklyView: 'Xem Theo Tuần',
    DailyView: 'Xem Theo Ngày',
    NoRoster: 'Lịch làm việc chưa được công bố cho tuần này',
    Colleagues: 'Đồng nghiệp',
    Branch: 'Chi nhánh',
    SelectBranch: 'Chọn chi nhánh',
    NextWeek: 'Tuần sau',
    PrevWeek: 'Tuần trước',
    DayOff: 'Ngày nghỉ',
    Hours: 'Giờ làm',
    Shift: 'Ca làm',
    GeneralInfo: 'Thông Tin Chung',
    FullName: 'Họ và Tên',
    Email: 'Email',
    Phone: 'Số điện thoại',
    Role: 'Vị trí',
    Department: 'Phòng ban',
    EmploymentType: 'Loại hình làm việc',
    StartDate: 'Ngày bắt đầu',
    ProbationEnd: 'Hết thử việc',
    Contracts: 'Lịch Sử Hợp Đồng',
    SigningDate: 'Ngày ký',
    ExpirationDate: 'Ngày hết hạn',
    BasicSalary: 'Lương cơ bản',
    Allowances: 'Phụ cấp',
    UniformAllowance: 'Phụ cấp đồng phục',
    LunchAllowance: 'Phụ cấp ăn trưa',
    PhoneAllowance: 'Phụ cấp điện thoại',
    FuelAllowance: 'Phụ cấp xăng xe',
    HomeAllowance: 'Phụ cấp hỗ trợ nhà ở',
    Notes: 'Ghi chú',
    NoContracts: 'Không tìm thấy thông tin hợp đồng',
    NoDocuments: 'Không có tài liệu nhân sự',
    UploadDate: 'Ngày tải lên',
    ChangePassword: 'Đổi Mật Khẩu',
    CurrentPassword: 'Mật khẩu hiện tại',
    NewPasswordConfirm: 'Xác nhận mật khẩu mới',
    UpdatePasswordBtn: 'Cập nhật mật khẩu',
    PasswordChangedSuccess: 'Đổi mật khẩu thành công!',
    BankName: 'Tên ngân hàng',
    BankAccountNumber: 'Số tài khoản',
    BankAccountName: 'Tên chủ tài khoản',
    GrossSalary: 'Lương gộp',
    DocName: 'Tên tài liệu',
    DocType: 'Loại',
    Action: 'Hành động',
    DownloadBtn: 'Tải về',
    SerialNo: 'Số seri',
    Status: 'Trạng thái',
    Qty: 'Số lượng',
    AssignedAt: 'Ngày cấp phát',
    ReturnedAt: 'Ngày thu hồi',
    InitialCondition: 'Tình trạng ban đầu',
    ReturnCondition: 'Tình trạng khi trả',
    AssetHistory: 'Lịch sử thay đổi trạng thái tài sản',
    NoAssets: 'Chưa được cấp phát tài sản nào',
    Date: 'Ngày',
    CareerJourney: 'Quá trình sự nghiệp',
    RoleHistory: 'Lịch sử vị trí',
    SalaryHistory: 'Lịch sử lương',
    EffectiveDate: 'Ngày hiệu lực',
    OldPos: 'Vị trí cũ',
    NewPos: 'Vị trí mới',
    OldSal: 'Lương cũ',
    NewSal: 'Lương mới',
    NoHistory: 'Chưa có sự kiện nào trong quá trình sự nghiệp',
    NoSalHistory: 'Chưa có lịch sử thay đổi lương',
    Performance: 'Đánh Giá Hiệu Suất',
    Score: 'Điểm số',
    Feedback: 'Nhận xét',
    NoReviews: 'Chưa có đánh giá hiệu suất nào',
    DisciplinaryHistory: 'Tiền phạt kỷ luật',
    Amount: 'Số tiền phạt',
    Infraction: 'Lỗi vi phạm',
    Source: 'Nguồn khấu trừ',
    NoFines: 'Chưa có vi phạm kỷ luật nào',
    WarningsHistory: 'Cảnh Cáo & Thẻ',
    NoWarnings: 'Chưa có thẻ phạt hay cảnh cáo nào được ghi nhận',
    AwardsHistory: 'Khen Thưởng',
    NoAwards: 'Chưa có khen thưởng nào',
    Reason: 'Lý do',
    AwardName: 'Tên khen thưởng',
    CreditSource: 'Nguồn cộng tiền',
    FlagLevel: 'Mức cảnh báo',
    PositiveNote: 'Ghi nhận tích cực',
    Caution: 'Nhắc nhở',
    Warning: 'Cảnh Cáo',
    Month: 'Tháng',
    HoursWorked: 'Số giờ đã làm',
    TotalPool: 'Tổng quỹ phí dịch vụ',
    SharePercentage: 'Tỷ lệ chia %',
    AmountReceived: 'Số tiền nhận được',
    NoSC: 'Chưa có thông tin phí dịch vụ',
    ColleagueName: 'Tên đồng nghiệp',
    NoShiftsToday: 'Không có lịch làm việc',
    SCDynamicNote: 'Được tính toán động dựa trên số giờ làm việc tại thành phố của bạn trong giai đoạn này. Có thể được điều chỉnh.',
    Menu: 'Menu',
    IncorrectPassword: 'Mật khẩu không chính xác',
    TooManyAttempts: 'Quá nhiều lần thử. Tài khoản bị khóa trong 15 phút.',
    AttemptsLeft: 'Còn {count} lần thử',
    AttemptsLeftOne: 'Còn 1 lần thử',
    TryAgainIn: 'Thử lại sau {mins} phút',
    StaffNotFound: 'Không tìm thấy nhân viên',
    AccountNotActive: 'Tài khoản nhân viên chưa được kích hoạt',
    NoteLabel: 'Lưu ý',
    Hired: 'Nhận việc',
    JoinedAs: 'Gia nhập công ty với vai trò {role} tại bộ phận {dept}',
    RoleTransition: 'Thay đổi vị trí',
    SalaryAdjustment: 'Điều chỉnh lương',
    CategoryRatings: 'Điểm chi tiết',
    Strengths: 'Điểm mạnh',
    Improvements: 'Điểm cần cải thiện',
    Period: 'Kỳ đánh giá',
    Reviewer: 'Người đánh giá',
    Notifications: 'Thông báo',
    MarkAllAsRead: 'Đánh dấu tất cả đã đọc',
    NoNotifications: 'Không có thông báo mới',
    ClearAll: 'Xóa tất cả',
    PushSettings: 'Thông báo trên điện thoại',
    PushEnabled: 'Đã bật thông báo',
    PushDisabled: 'Đã chặn thông báo',
    PushPrompt: 'Bấm nút bên dưới để nhận thông tin cập nhật lịch làm việc tức thì trên điện thoại.',
    PushEnableBtn: 'Bật thông báo',
    PushTestBtn: 'Gửi thông báo thử nghiệm',
    PushUnsupported: 'Trình duyệt/thiết bị không hỗ trợ',
    PushDeniedInstructions: 'Thông báo đã bị chặn. Vui lòng bật lại trong cài đặt trang web của trình duyệt.'
  }
}

const CATEGORY_NAMES = {
  en: {
    teamwork: 'Teamwork',
    leadership: 'Leadership',
    communication: 'Communication',
    problem_solving: 'Problem Solving',
    quality_of_work: 'Quality of Work',
    initiative_proactivity: 'Initiative & Proactivity',
    punctuality_attendance: 'Punctuality & Attendance'
  },
  vi: {
    teamwork: 'Làm việc nhóm',
    leadership: 'Năng lực lãnh đạo',
    communication: 'Giao tiếp',
    problem_solving: 'Giải quyết vấn đề',
    quality_of_work: 'Chất lượng công việc',
    initiative_proactivity: 'Sự chủ động & Tích cực',
    punctuality_attendance: 'Tác phong & Điểm danh'
  }
} as Record<string, Record<string, string>>

function sT(lang: Lang, key: keyof typeof STAFF_PORTAL_DICT['en'], vars?: Record<string, string>) {
  let text = STAFF_PORTAL_DICT[lang as keyof typeof STAFF_PORTAL_DICT]?.[key] || STAFF_PORTAL_DICT['en'][key] || key
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, v)
    })
  }
  return text
}

/* ────────────────── FORMAT HELPERS ────────────────── */
const fmtVnd = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n)

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  } catch {
    return d
  }
}

const getWeekDateDetails = (mondayStr: string, lang: Lang) => {
  if (!mondayStr) return { range: '—', year: '—' }
  try {
    const [y, m, d] = mondayStr.split('-').map(Number)
    const monday = new Date(y, m - 1, d)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)

    const monDay = monday.getDate()
    const sunDay = sunday.getDate()

    const year = String(sunday.getFullYear())

    if (lang === 'vi') {
      const monMonthNum = String(monday.getMonth() + 1).padStart(2, '0')
      const sunMonthNum = String(sunday.getMonth() + 1).padStart(2, '0')
      const formattedMonDay = String(monDay).padStart(2, '0')
      const formattedSunDay = String(sunDay).padStart(2, '0')
      return {
        range: `${formattedMonDay}/${monMonthNum} - ${formattedSunDay}/${sunMonthNum}`,
        year
      }
    } else {
      const monMonth = monday.toLocaleDateString('en-US', { month: 'short' })
      const sunMonth = sunday.toLocaleDateString('en-US', { month: 'short' })
      return {
        range: `${monDay} ${monMonth} - ${sunDay} ${sunMonth}`,
        year
      }
    }
  } catch {
    return { range: mondayStr, year: '' }
  }
}

const getStartOfWeek = (d: Date) => {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
  const start = new Date(d.setDate(diff))
  start.setHours(0, 0, 0, 0)
  return start
}

const getDatesForWeek = (mondayStr: string) => {
  const dates = []
  const [y, m, d] = mondayStr.split('-').map(Number)
  const monday = new Date(y, m - 1, d)
  for (let i = 0; i < 7; i++) {
    const temp = new Date(monday)
    temp.setDate(monday.getDate() + i)
    dates.push(temp)
  }
  return dates
}

const formatIsoDate = (d: Date) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/* ────────────────── MAIN PAGE COMPONENT ────────────────── */
export default function StaffPortalPage() {
  const [view, setView] = useState<ViewState>('loading')
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('oddsOffStaffLang')
      if (saved === 'en' || saved === 'vi') return saved as Lang
    }
    return 'vi'
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('oddsOffStaffLang', lang)
    }
  }, [lang])
  const [logoUrl, setLogoUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('oddsOffStaffLogo')
      const cachedTime = localStorage.getItem('oddsOffStaffLogoTime')
      if (cached && cachedTime) {
        const ageMs = Date.now() - parseInt(cachedTime, 10)
        // Il signed URL dura 1 ora (3600000 ms), usiamo 50 minuti come limite di sicurezza
        if (ageMs < 50 * 60 * 1000) {
          return cached
        }
      }
    }
    return ''
  })

  // Form states
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pushStatus, setPushStatus] = useState<'supported' | 'unsupported' | 'granted' | 'denied' | 'prompt'>('prompt')
  const [pushLoading, setPushLoading] = useState(false)
  
  // Auth details
  const [staffId, setStaffId] = useState('')
  const [staffName, setStaffName] = useState('')
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null)

  // Portal data
  const [data, setData] = useState<PortalData | null>(null)
  const [activeTab, setActiveTab] = useState<'roster' | 'info' | 'docs' | 'assets' | 'career' | 'disciplinary' | 'service_charge'>('roster')
  const [disciplinaryTab, setDisciplinaryTab] = useState<'fines' | 'warnings' | 'awards'>('fines')

  // Password change states
  const [currentPassword, setCurrentPassword] = useState('')
  const [changeNewPassword, setChangeNewPassword] = useState('')
  const [changeConfirmPassword, setChangeConfirmPassword] = useState('')
  const [changePasswordLoading, setChangePasswordLoading] = useState(false)
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null)
  const [changePasswordSuccess, setChangePasswordSuccess] = useState(false)

  // Mobile menu/drawer state
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  // Notifications state
  const [notifications, setNotifications] = useState<StaffNotification[]>([])
  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications])
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null)
  const notificationsRef = useRef<StaffNotification[]>([])
  useEffect(() => {
    notificationsRef.current = notifications
  }, [notifications])

  const langRef = useRef<Lang>('vi')
  useEffect(() => {
    langRef.current = lang
  }, [lang])

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setChangePasswordError(null)
    setChangePasswordSuccess(false)

    if (!currentPassword) {
      setChangePasswordError(lang === 'vi' ? 'Vui lòng nhập mật khẩu hiện tại' : 'Please enter your current password')
      return
    }
    if (changeNewPassword.length < 6) {
      setChangePasswordError(lang === 'vi' ? 'Mật khẩu mới phải từ 6 ký tự' : 'New password must be at least 6 characters')
      return
    }
    if (changeNewPassword !== changeConfirmPassword) {
      setChangePasswordError(lang === 'vi' ? 'Xác nhận mật khẩu mới không khớp' : 'New password confirmation does not match')
      return
    }

    setChangePasswordLoading(true)
    try {
      const res = await fetch('/api/staff-portal/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: data?.staff?.id,
          currentPassword,
          newPassword: changeNewPassword
        })
      })

      const json = await res.json()
      if (!res.ok) {
        setChangePasswordError(json.error || (lang === 'vi' ? 'Đã xảy ra lỗi' : 'An error occurred'))
      } else {
        setChangePasswordSuccess(true)
        setCurrentPassword('')
        setChangeNewPassword('')
        setChangeConfirmPassword('')
      }
    } catch (err) {
      console.error(err)
      setChangePasswordError(lang === 'vi' ? 'Lỗi kết nối' : 'Connection error')
    } finally {
      setChangePasswordLoading(false)
    }
  }

  // Expanded reviews in career timeline
  const [expandedReviews, setExpandedReviews] = useState<Record<string, boolean>>({})

  // Dashboard interaction states
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [selectedWeek, setSelectedWeek] = useState(() => formatIsoDate(getStartOfWeek(new Date())))
  const [rosterTab, setRosterTab] = useState<'my' | 'all'>('my')
  const [rosterViewMode, setRosterViewMode] = useState<'day' | 'week'>('day')
  const [selectedDayIdx, setSelectedDayIdx] = useState(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1) // 0=Mon, 6=Sun
  const [scMonth, setScMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // Load logo
  useEffect(() => {
    fetch('/api/staff-portal/logo')
      .then(r => r.json())
      .then(j => {
        if (j.url) {
          setLogoUrl(j.url)
          localStorage.setItem('oddsOffStaffLogo', j.url)
          localStorage.setItem('oddsOffStaffLogoTime', String(Date.now()))
        }
      })
      .catch(() => {})
  }, [])

  // Auto-select first branch when data loads
  useEffect(() => {
    if (data?.branches && data.branches.length > 0) {
      setSelectedBranchId(data.branches[0].id)
    }
  }, [data])

  const getLocalizedError = (err: string) => {
    if (err.includes('Too many attempts')) {
      return sT(lang, 'TooManyAttempts')
    }
    if (err.toLowerCase().includes('incorrect password')) {
      return sT(lang, 'IncorrectPassword')
    }
    if (err.toLowerCase().includes('staff member not found') || err.toLowerCase().includes('staff not found')) {
      return sT(lang, 'StaffNotFound')
    }
    if (err.toLowerCase().includes('not active')) {
      return sT(lang, 'AccountNotActive')
    }
    return err
  }

  const getLocalizedAssetStatus = (status: string) => {
    const map: Record<string, string> = {
      assigned: lang === 'vi' ? 'Đã giao' : 'Assigned',
      returned: lang === 'vi' ? 'Đã trả' : 'Returned',
      damaged: lang === 'vi' ? 'Hỏng' : 'Damaged',
      lost: lang === 'vi' ? 'Mất' : 'Lost'
    }
    return map[status] || status
  }

  const getLocalizedFineStatus = (status: string) => {
    const map: Record<string, string> = {
      pending: lang === 'vi' ? 'Chờ duyệt' : 'Pending',
      paid: lang === 'vi' ? 'Đã thanh toán' : 'Paid',
      waived: lang === 'vi' ? 'Được miễn' : 'Waived',
      disputed: lang === 'vi' ? 'Khiếu nại' : 'Disputed',
      approved: lang === 'vi' ? 'Đã duyệt' : 'Approved',
      rejected: lang === 'vi' ? 'Từ chối' : 'Rejected'
    }
    return map[status] || status
  }

  const formatWarningReason = (reason: string) => {
    if (!reason) return ''
    const match = reason.match(/Automatic warning generated for accumulation of (\d+) yellow flags/i)
    if (match) {
      const count = match[1]
      return lang === 'vi' 
        ? `Cảnh cáo tự động được tạo do tích lũy ${count} thẻ vàng`
        : `Automatic warning generated for accumulation of ${count} yellow flags`
    }
    const matchIt = reason.match(/Warning automatico generato per accumulo di (\d+) bandierine gialle/i)
    if (matchIt) {
      const count = matchIt[1]
      return lang === 'vi'
        ? `Cảnh cáo tự động được tạo do tích lũy ${count} thẻ vàng`
        : `Automatic warning generated for accumulation of ${count} yellow flags`
    }
    return reason
  }

  /* ── Notification Handlers ── */
  const handleMarkAllRead = async () => {
    try {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      await fetch('/api/staff-portal/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, all: true })
      })
    } catch (e) {
      console.error('Failed to mark all as read:', e)
    }
  }

  const handleMarkOneRead = async (notificationId: string) => {
    try {
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n))
      await fetch('/api/staff-portal/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, notificationId })
      })
    } catch (e) {
      console.error('Failed to mark notification as read:', e)
    }
  }

  const getNotificationIcon = (cat: string) => {
    switch (cat) {
      case 'roster': return CalendarDays
      case 'info': return User
      case 'document': return FileText
      case 'asset': return Package
      case 'career': return TrendingUp
      case 'disciplinary': return AlertTriangle
      case 'service_charge': return DollarSign
      default: return Bell
    }
  }

  const fmtRelativeTime = (dateStr: string, lang: Lang) => {
    try {
      const past = new Date(dateStr)
      const now = new Date()
      const diffMs = now.getTime() - past.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMins / 60)
      const diffDays = Math.floor(diffHours / 24)

      if (diffMins < 1) return lang === 'vi' ? 'Vừa xong' : 'Just now'
      if (diffMins < 60) return lang === 'vi' ? `${diffMins} phút trước` : `${diffMins}m ago`
      if (diffHours < 24) return lang === 'vi' ? `${diffHours} giờ trước` : `${diffHours}h ago`
      if (diffDays === 1) return lang === 'vi' ? 'Hôm qua' : 'Yesterday'
      if (diffDays < 7) return lang === 'vi' ? `${diffDays} ngày trước` : `${diffDays}d ago`
      
      return past.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { day: 'numeric', month: 'short' })
    } catch {
      return '—'
    }
  }

  /* ── Fetch Data ── */
  const fetchData = async (sId: string) => {
    const res = await fetch('/api/staff-portal/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: sId })
    })
    const json = await res.json()
    if (res.ok) {
      const prevNotifs = notificationsRef.current
      const newNotifs = json.notifications || []
      
      console.log('fetchData notifications comparison:', {
        prevNotifsCount: prevNotifs.length,
        newNotifsCount: newNotifs.length,
        prevNotifs,
        newNotifs
      })

      if (prevNotifs.length > 0) {
        const prevIds = new Set(prevNotifs.map(n => n.id))
        const addedNotifs = newNotifs.filter((n: any) => !prevIds.has(n.id))
        console.log('fetchData added notifications:', addedNotifs)
        addedNotifs.forEach((newNotif: any) => {
          const title = langRef.current === 'vi' ? newNotif.title_vi : newNotif.title_en
          const body = langRef.current === 'vi' ? newNotif.body_vi : newNotif.body_en
          setToast({ title, body })
        })
      }

      setData(json)
      setNotifications(newNotifs)
      setView('dashboard')
    } else {
      setError(json.error || 'Error loading staff data')
    }
  }

  // Restore session or process enroll link on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const enrollId = params.get('enroll')
      
      if (enrollId) {
        setLoading(true)
        fetch(`/api/staff-portal/enroll-info?id=${enrollId}`)
          .then(async res => {
            const json = await res.json()
            if (!res.ok) {
              setError(json.error || sT(lang, 'InvalidEnrollLink'))
              setView('login')
              return
            }
            if (json.hasPassword) {
              setError(sT(lang, 'AccountAlreadyActive'))
              setView('login')
              return
            }
            setStaffId(json.id)
            setStaffName(json.full_name)
            setView('setup')
          })
          .catch(() => {
            setError(sT(lang, 'LoadInviteErr'))
            setView('login')
          })
          .finally(() => setLoading(false))
      } else {
        const savedId = localStorage.getItem('oddsOffStaffId')
        const savedName = localStorage.getItem('oddsOffStaffName')
        if (savedId && savedName) {
          setStaffId(savedId)
          setStaffName(savedName)
          setLoading(true)
          fetchData(savedId)
            .catch(() => {
              setView('login')
            })
            .finally(() => setLoading(false))
        } else {
          setView('login')
        }
      }
    }
  }, [])

  // Register service worker and check push notification support/permission
  useEffect(() => {
    if (typeof window === 'undefined') return

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported')
      return
    }

    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('Service Worker registered with scope:', reg.scope)
        if (Notification.permission === 'granted') {
          setPushStatus('granted')
        } else if (Notification.permission === 'denied') {
          setPushStatus('denied')
        } else {
          setPushStatus('prompt')
        }
      })
      .catch(err => {
        console.error('Service Worker registration failed:', err)
        setPushStatus('unsupported')
      })
  }, [])

  const handleEnablePush = async () => {
    if (typeof window === 'undefined') return
    setPushLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'denied') {
        setPushStatus('denied')
        setPushLoading(false)
        return
      }
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready
        
        const response = await fetch('/api/staff-portal/notifications/vapid-public-key')
        const { publicKey } = await response.json()
        
        const convertedKey = urlBase64ToUint8Array(publicKey)
        
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey
        })
        
        const subResponse = await fetch('/api/staff-portal/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staffId,
            subscription
          })
        })
        
        if (subResponse.ok) {
          setPushStatus('granted')
        } else {
          console.error('Failed to save push subscription on server')
        }
      }
    } catch (err) {
      console.error('Error enabling push notifications:', err)
    } finally {
      setPushLoading(false)
    }
  }

  const handleSendTestPush = async () => {
    if (!staffId) return
    try {
      await fetch('/api/staff-portal/notifications/test-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId })
      })
    } catch (err) {
      console.error('Error sending test push:', err)
    }
  }

  // Realtime subscription for incoming notifications via ephemeral pings (to bypass anonymous RLS limitations)
  useEffect(() => {
    if (!staffId) return

    console.log('Initiating Supabase Realtime subscription for staffId:', staffId)

    const channel = supabase
      .channel(`staff_realtime_pings_${staffId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hr_realtime_pings'
        },
        (payload: any) => {
          console.log('Realtime ping payload received:', payload)
          const ping = payload.new
          if (ping && ping.staff_id === staffId) {
            console.log('New realtime ping matches staffId! Re-fetching data...')
            fetchData(staffId).catch(() => {})
          }
        }
      )
      .subscribe((status, err) => {
        console.log(`Supabase Realtime subscription status: ${status}`, err)
      })

    return () => {
      console.log('Cleaning up Realtime subscription')
      supabase.removeChannel(channel)
    }
  }, [staffId])

  // Toast auto-dismiss timer
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null)
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  /* ── Handle Login ── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setAttemptsLeft(null)
    setMinutesLeft(null)
    setLoading(true)

    try {
      const res = await fetch('/api/staff-portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password })
      })
      const json = await res.json()

      if (json.needsSetup) {
        setStaffId(json.staffId)
        setStaffName(json.staffName)
        setView('setup')
        return
      }

      if (json.locked) {
        setMinutesLeft(json.minutesLeft)
        setError(json.error)
        return
      }

      if (!res.ok) {
        setError(json.error || 'Login Error')
        if (json.attemptsLeft != null) setAttemptsLeft(json.attemptsLeft)
        return
      }

      setStaffId(json.staffId)
      setStaffName(json.staffName)
      if (typeof window !== 'undefined') {
        localStorage.setItem('oddsOffStaffId', json.staffId)
        localStorage.setItem('oddsOffStaffName', json.staffName)
      }
      await fetchData(json.staffId)
    } catch {
      setError('Connection Error')
    } finally {
      setLoading(false)
    }
  }

  /* ── Handle Setup Password ── */
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (newPassword.length < 6) {
      setError(sT(lang, 'PasswordMin'))
      setLoading(false)
      return
    }
    if (newPassword !== confirmPassword) {
      setError(sT(lang, 'MismatchErr'))
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/staff-portal/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, newPassword })
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Server error')
        return
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('oddsOffStaffId', json.staffId)
        localStorage.setItem('oddsOffStaffName', staffName)
      }
      await fetchData(json.staffId)
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  // Active roster snapshot for selected branch and week
  const currentRosterSnapshot = useMemo(() => {
    if (!data?.publishedRosters) return null
    return data.publishedRosters.find(
      r => r.branch_id === selectedBranchId && formatIsoDate(new Date(r.week_start)) === selectedWeek
    ) || null
  }, [data, selectedBranchId, selectedWeek])

  const weekDates = useMemo(() => getDatesForWeek(selectedWeek), [selectedWeek])

  // Colleagues assigned shifts for current day
  const dailyColleaguesShifts = useMemo(() => {
    if (!currentRosterSnapshot || !data?.colleagues) return []
    const targetDateStr = formatIsoDate(weekDates[selectedDayIdx])
    
    return Object.values(data.colleagues).map((colleague: any) => {
      const key = `${selectedBranchId}::${colleague.id}::${targetDateStr}`
      const shiftIdsStr = currentRosterSnapshot.roster_snapshot[key] || ''
      const assignedShifts = shiftIdsStr ? shiftIdsStr.split(',') : []
      const shiftsDetails = assignedShifts.map(sId => {
        const sType = currentRosterSnapshot.shifts_snapshot.find(s => s.id === sId)
        return sType || ({ id: sId, name: sId, code: sId, startTime: '', endTime: '', color: '#6B7280', type: 'work', hours: 0 } as any)
      })
      return {
        colleague,
        shifts: shiftsDetails
      }
    }).filter(item => item.shifts.length > 0)
  }, [currentRosterSnapshot, data, selectedBranchId, weekDates, selectedDayIdx])

  const myWeeklyShifts = useMemo(() => {
    if (!currentRosterSnapshot) return []
    return weekDates.map((dateObj, idx) => {
      const dateStr = formatIsoDate(dateObj)
      const key = `${selectedBranchId}::${staffId}::${dateStr}`
      const shiftIdsStr = currentRosterSnapshot.roster_snapshot[key] || ''
      const assignedShifts = shiftIdsStr ? shiftIdsStr.split(',') : []
      const shiftsDetails = assignedShifts.map(sId => {
        const sType = currentRosterSnapshot.shifts_snapshot.find(s => s.id === sId)
        return sType || ({ id: sId, name: sId, code: sId, startTime: '', endTime: '', color: '#6B7280', type: 'work', hours: 0 } as any)
      })
      return {
        date: dateObj,
        dayIdx: idx,
        shifts: shiftsDetails
      }
    })
  }, [currentRosterSnapshot, weekDates, selectedBranchId, staffId])

  // Colleagues weekly shifts grid
  const colleaguesWeeklyGrid = useMemo(() => {
    if (!currentRosterSnapshot || !data?.colleagues) return []
    
    return Object.values(data.colleagues).map((colleague: any) => {
      const weekShifts = weekDates.map(dateObj => {
        const dateStr = formatIsoDate(dateObj)
        const key = `${selectedBranchId}::${colleague.id}::${dateStr}`
        const shiftIdsStr = currentRosterSnapshot.roster_snapshot[key] || ''
        const assignedShifts = shiftIdsStr ? shiftIdsStr.split(',') : []
        const shiftsDetails = assignedShifts.map(sId => {
          const sType = currentRosterSnapshot.shifts_snapshot.find(s => s.id === sId)
          return sType || ({ id: sId, name: sId, code: sId, startTime: '', endTime: '', color: '#6B7280', type: 'work', hours: 0 } as any)
        })
        return {
          dateStr,
          shifts: shiftsDetails
        }
      })
      return {
        colleague,
        weekShifts
      }
    })
  }, [currentRosterSnapshot, data, selectedBranchId, weekDates])

  // Unified Career & Performance Timeline items
  const timelineItems = useMemo(() => {
    if (!data) return []
    const items: {
      id: string
      date: string
      type: 'hired' | 'role' | 'salary' | 'review'
      title: string
      icon: any
      description: string
      raw: any
    }[] = []

    // 1. Hiring Date
    if (data.staff.start_date) {
      items.push({
        id: `hired-${data.staff.id}`,
        date: data.staff.start_date,
        type: 'hired',
        title: sT(lang, 'Hired'),
        icon: Plus,
        description: sT(lang, 'JoinedAs', {
          role: data.staff.position || 'Staff',
          dept: data.staff.department || '—'
        }),
        raw: data.staff
      })
    }

    // 2. Role changes
    if (data.career?.roles) {
      data.career.roles.forEach((role) => {
        let desc = ''
        if (!role.old_position?.name && !role.new_position?.name) {
          desc = role.reason || (lang === 'vi' ? 'Thay đổi vị trí công việc' : 'Position transition')
        } else if (!role.old_position?.name) {
          desc = lang === 'vi'
            ? `Bổ nhiệm vị trí: ${role.new_position?.name || '—'}`
            : `Assigned position: ${role.new_position?.name || '—'}`
        } else {
          desc = `${role.old_position.name} → ${role.new_position?.name || '—'}`
        }

        items.push({
          id: `role-${role.id}`,
          date: role.effective_date,
          type: 'role',
          title: sT(lang, 'RoleTransition'),
          icon: User,
          description: desc,
          raw: role
        })
      })
    }

    // 3. Salary changes
    if (data.career?.salaries) {
      data.career.salaries.forEach((sal) => {
        items.push({
          id: `salary-${sal.id}`,
          date: sal.effective_date,
          type: 'salary',
          title: sT(lang, 'SalaryAdjustment'),
          icon: DollarSign,
          description: `${fmtVnd(sal.previous_amount)} → ${fmtVnd(sal.new_amount)}`,
          raw: sal
        })
      })
    }

    // 4. Performance reviews
    if (data.performance) {
      data.performance.forEach((review) => {
        const isExit = review.notes?.includes('[EXIT REVIEW]') || review.feedback?.includes('[EXIT REVIEW]')
        let cleanNotes = review.notes
        if (cleanNotes && cleanNotes.includes('[EXIT REVIEW]')) {
          cleanNotes = cleanNotes.replace('[EXIT REVIEW]', '').trim()
        }

        items.push({
          id: `review-${review.id}`,
          date: review.review_date,
          type: 'review',
          title: sT(lang, 'Performance'),
          icon: Star,
          description: review.reviewer_name
            ? (lang === 'vi' ? `Được đánh giá bởi ${review.reviewer_name}` : `Reviewed by ${review.reviewer_name}`)
            : (lang === 'vi' ? 'Đánh giá hiệu suất định kỳ' : 'Periodic performance evaluation'),
          raw: {
            ...review,
            notes: cleanNotes,
            isExitReview: isExit
          }
        })
      })
    }

    // Sort descending by date
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [data, lang])

  const changeWeek = (direction: number) => {
    const [y, m, d] = selectedWeek.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    date.setDate(date.getDate() + (direction * 7))
    setSelectedWeek(formatIsoDate(date))
  }

  // Filtered service charges by selected month
  const activeServiceChargeRecord = useMemo(() => {
    if (!data?.serviceCharges) return null
    return data.serviceCharges.find(sc => sc.month_id === scMonth) || null
  }, [data, scMonth])

  function LanguageSwitcher() {
    return (
      <div className="flex items-center justify-end gap-2 mb-4 w-full max-w-sm mx-auto px-4 pt-4">
        <span className="text-xs text-slate-500 mr-1">{sT(lang, 'Language')}:</span>
        {(['en', 'vi'] as Lang[]).map(l => {
          const active = l === lang
          return (
            <button
              key={l}
              onClick={() => setLang(l)}
              type="button"
              className={`px-2.5 py-1 rounded-lg text-xs border font-bold transition-all cursor-pointer ${
                active
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {l.toUpperCase()}
            </button>
          )
        })}
      </div>
    )
  }

  /* ────────────────── RENDER VIEW LOGIC ────────────────── */
  if (view === 'loading') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-slate-50 text-slate-800">
        <div className="flex flex-col items-center gap-4">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt="Logo" 
              className="h-20 w-auto object-contain animate-pulse" 
              onError={() => {
                setLogoUrl('')
                localStorage.removeItem('oddsOffStaffLogo')
                localStorage.removeItem('oddsOffStaffLogoTime')
              }}
            />
          ) : (
            <div className="h-20" />
          )}
          <div className="relative mt-4">
            <div className="w-10 h-10 rounded-full border-[3px] border-slate-200 border-t-blue-600 animate-spin"></div>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'login') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-slate-50 text-slate-800">
        <LanguageSwitcher />
        
        {/* Logo */}
        <div className="mb-8 select-none">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt="Logo" 
              className="h-20 w-auto object-contain drop-shadow-sm" 
              onError={() => {
                setLogoUrl('')
                localStorage.removeItem('oddsOffStaffLogo')
                localStorage.removeItem('oddsOffStaffLogoTime')
              }}
            />
          ) : (
            <div className="text-3xl font-extrabold tracking-wider text-blue-600">ODDSOFF</div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-10 w-full max-w-sm animate-in fade-in duration-300">
          <h2 className="text-xl font-bold mb-6 text-slate-900 text-center tracking-wide uppercase">{sT(lang, 'StaffPortal')}</h2>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                {sT(lang, 'EmailOrPhone')}
              </label>
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder="email@example.com / 0912..."
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-12"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                {sT(lang, 'Password')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm pr-12 h-12"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-10 h-8 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 focus:outline-none text-slate-500 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-red-700 font-medium">{getLocalizedError(error)}</p>
                  {attemptsLeft !== null && (
                    <p className="text-xs text-red-600 mt-0.5">
                      {attemptsLeft === 1 ? sT(lang, 'AttemptsLeftOne') : sT(lang, 'AttemptsLeft', { count: String(attemptsLeft) })}
                    </p>
                  )}
                  {minutesLeft !== null && (
                    <p className="text-xs text-red-600 mt-0.5">
                      {sT(lang, 'TryAgainIn', { mins: String(minutesLeft) })}
                    </p>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer active:scale-95 h-12"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : sT(lang, 'SignIn')}
            </button>

            <div className="flex gap-2.5 items-start text-xs text-slate-500 mt-2 p-3.5 bg-blue-50/50 border border-blue-100 rounded-xl leading-relaxed">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <span>{sT(lang, 'LoginHint')}</span>
            </div>
          </form>
        </div>
      </div>
    )
  }

  if (view === 'setup') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-slate-50 text-slate-800">
        <LanguageSwitcher />

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-10 w-full max-w-sm animate-in fade-in duration-300">
          <h2 className="text-xl font-bold mb-2 text-slate-900 text-center">{sT(lang, 'SetupWelcome', { name: staffName })}</h2>
          <p className="text-sm text-slate-500 text-center mb-6">{sT(lang, 'SetupSubtitle')}</p>

          <form onSubmit={handleSetup} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                {sT(lang, 'NewPassword')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm pr-12 h-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-10 h-8 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 focus:outline-none text-slate-500 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                {sT(lang, 'ConfirmPassword')}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-12"
                required
              />
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer h-12 active:scale-95"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : sT(lang, 'SetPasswordBtn')}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (view === 'change-password') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-slate-50 text-slate-800">
        <LanguageSwitcher />

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-10 w-full max-w-sm animate-in fade-in duration-300">
          
          <button
            onClick={() => {
              setView('dashboard')
              setChangePasswordError(null)
              setChangePasswordSuccess(false)
            }}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 font-bold mb-6 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            {lang === 'vi' ? 'Quay lại' : 'Back'}
          </button>

          <h2 className="text-xl font-bold mb-2 text-slate-900 text-center">{sT(lang, 'ChangePassword')}</h2>
          <p className="text-sm text-slate-500 text-center mb-6">
            {lang === 'vi' ? 'Vui lòng điền thông tin bên dưới để đổi mật khẩu.' : 'Please fill in the details below to change your password.'}
          </p>

          <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                {sT(lang, 'CurrentPassword')}
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-12"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                {lang === 'vi' ? 'Mật khẩu mới' : 'New Password'}
              </label>
              <input
                type="password"
                value={changeNewPassword}
                onChange={(e) => setChangeNewPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-12"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                {sT(lang, 'NewPasswordConfirm')}
              </label>
              <input
                type="password"
                value={changeConfirmPassword}
                onChange={(e) => setChangeConfirmPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-12"
                required
              />
            </div>

            {changePasswordError && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 font-medium">{changePasswordError}</p>
              </div>
            )}

            {changePasswordSuccess && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-green-50 border border-green-200">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <p className="text-sm text-green-700 font-medium">{sT(lang, 'PasswordChangedSuccess')}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={changePasswordLoading}
              className="w-full bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer h-12 active:scale-95 text-sm"
            >
              {changePasswordLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : sT(lang, 'UpdatePasswordBtn')}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Dashboard view
  if (!data) return null

  const { staff } = data
  const showProbation = (() => {
    if (!staff.probation_end_date) return false
    const probDate = new Date(staff.probation_end_date)
    probDate.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return probDate >= today
  })()

  // Navigation Items
  const navItems = [
    { id: 'roster', label: sT(lang, 'Roster'), icon: Calendar },
    { id: 'info', label: sT(lang, 'MyInfo'), icon: User },
    { id: 'docs', label: sT(lang, 'Documents'), icon: FileText },
    { id: 'assets', label: sT(lang, 'Assets'), icon: Package },
    { id: 'career', label: sT(lang, 'Career'), icon: TrendingUp },
    { id: 'disciplinary', label: sT(lang, 'Disciplinary'), icon: AlertTriangle },
    { id: 'service_charge', label: sT(lang, 'ServiceCharge'), icon: Percent }
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      
      {/* MOBILE HEADER BAR */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-base shadow-md shadow-blue-500/10">
            OX
          </div>
          <div>
            <h1 className="font-bold text-sm text-slate-900 block truncate max-w-[160px] sm:max-w-none">{staff.full_name}</h1>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{staff.position || 'Staff'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Notifications Bell Button */}
          <button
            onClick={() => {
              setNotificationsOpen(true)
              handleMarkAllRead()
            }}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 w-11 h-11 flex items-center justify-center cursor-pointer transition-colors active:scale-95 relative"
            title={sT(lang, 'Notifications')}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center border-2 border-white animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Hamburger Menu Button */}
          <button
            onClick={() => setMenuOpen(true)}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 w-11 h-11 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
            title="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* HAMBURGER SLIDE-OVER MENU (DRAWER) */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
          
          {/* Backdrop */}
          <div
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm cursor-pointer"
          />

          {/* Drawer panel */}
          <div className="relative ml-auto w-72 max-w-full bg-white h-full shadow-2xl flex flex-col justify-between border-l border-slate-200 p-6 z-10 animate-in slide-in-from-right duration-250">
            
            <div className="space-y-6">
              {/* Header inside drawer */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-sm">
                    OX
                  </div>
                  <span className="font-extrabold text-sm text-slate-950 uppercase tracking-wide">{sT(lang, 'Menu')}</span>
                </div>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Items (Tabs) */}
              <nav className="flex flex-col gap-2">
                {navItems.map(item => {
                  const active = activeTab === item.id
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id as any)
                        setMenuOpen(false)
                      }}
                      className={`w-full flex items-center gap-3.5 px-3 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                        active
                          ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </nav>
            </div>

            {/* Language & Logout footer inside drawer */}
            <div className="border-t border-slate-100 pt-5 space-y-4">
              
              {/* Language toggler */}
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{sT(lang, 'Language')}</span>
                <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                  {(['en', 'vi'] as Lang[]).map(l => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={`px-3 py-1 rounded text-xs font-bold uppercase transition-all cursor-pointer ${
                        l === lang ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Logout button */}
              <button
                onClick={() => {
                  setView('login')
                  setData(null)
                  setStaffId('')
                  setStaffName('')
                  setPassword('')
                  setIdentifier('')
                  setError('')
                  setMenuOpen(false)
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('oddsOffStaffId')
                    localStorage.removeItem('oddsOffStaffName')
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-3 border border-red-200 bg-red-50/50 hover:bg-red-50 text-red-600 font-bold rounded-xl text-sm transition-colors cursor-pointer active:scale-95"
              >
                <LogOut className="w-4 h-4" />
                <span>{sT(lang, 'Logout')}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* NOTIFICATIONS SLIDE-OVER DRAWER */}
      {notificationsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
          
          {/* Backdrop */}
          <div
            onClick={() => setNotificationsOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm cursor-pointer"
          />

          {/* Drawer panel */}
          <div className="relative w-full max-w-[340px] bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-250 z-10">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-150 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">{sT(lang, 'Notifications')}</h3>
              </div>
              <button
                onClick={() => setNotificationsOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer active:scale-95 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Actions (Mark all read) */}
            {unreadCount > 0 && (
              <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-end">
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 underline cursor-pointer active:scale-95"
                >
                  {sT(lang, 'MarkAllAsRead')}
                </button>
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 h-full">
                  <Bell className="w-10 h-10 text-slate-350 mb-3 opacity-40" />
                  <p className="text-xs font-semibold">{sT(lang, 'NoNotifications')}</p>
                </div>
              ) : (
                notifications.map((notif) => {
                  const Icon = getNotificationIcon(notif.category)
                  const title = lang === 'vi' ? notif.title_vi : notif.title_en
                  const body = lang === 'vi' ? notif.body_vi : notif.body_en
                  const isRead = notif.is_read

                  return (
                    <div
                      key={notif.id}
                      onClick={() => {
                        if (!isRead) handleMarkOneRead(notif.id)
                      }}
                      className={`p-3.5 flex gap-3 cursor-pointer transition-colors ${
                        isRead ? 'bg-white hover:bg-slate-50/50' : 'bg-blue-50/20 hover:bg-blue-50/40'
                      }`}
                    >
                      {/* Category Icon */}
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${
                        isRead ? 'bg-slate-100 text-slate-500 border border-slate-200' : 'bg-blue-50 text-blue-600 border border-blue-100'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </span>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className={`text-xs truncate ${isRead ? 'font-semibold text-slate-700' : 'font-extrabold text-slate-900'}`}>
                            {title}
                          </h4>
                          {!isRead && (
                            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1" />
                          )}
                        </div>
                        <p className={`text-[11px] leading-relaxed ${isRead ? 'text-slate-500 font-medium' : 'text-slate-700 font-semibold'}`}>
                          {body}
                        </p>
                        <span className="text-[9px] text-slate-400 font-bold block pt-0.5">
                          {fmtRelativeTime(notif.created_at, lang)}
                        </span>
                      </div>

                    </div>
                  )
                })
              )}
            </div>

          </div>
        </div>
      )}

      {/* DASHBOARD CONTENT BODY */}
      <main className="flex-1 p-4 max-w-md sm:max-w-xl mx-auto w-full pb-20 animate-in fade-in duration-200">
        
        {/* TAB 1: ROSTER turni */}
        {activeTab === 'roster' && (
          <div className="space-y-4">
            
            {/* Branch and week selection (Clean White Card) */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">{sT(lang, 'Branch')}</span>
                </div>
                {data.branches.length > 1 ? (
                  <select
                    value={selectedBranchId}
                    onChange={e => setSelectedBranchId(e.target.value)}
                    className="h-9 px-3 rounded-lg border border-slate-350 text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                  >
                    {data.branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs font-extrabold text-slate-800 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                    {data.branches[0]?.name || '—'}
                  </span>
                )}
              </div>

              {/* Large week navigation (Highly Tappable, min 48px height) */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3.5">
                <button
                  onClick={() => changeWeek(-1)}
                  className="flex-1 max-w-[100px] h-12 flex items-center justify-center gap-1 text-xs font-bold text-blue-600 bg-blue-50/50 border border-blue-100 rounded-xl active:scale-95 transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>{sT(lang, 'PrevWeek')}</span>
                </button>
                {(() => {
                  const { range, year } = getWeekDateDetails(selectedWeek, lang)
                  return (
                    <div className="flex-1 flex flex-col items-center justify-center min-w-0 mx-2 px-3 h-12 bg-slate-50/60 border border-slate-200/60 rounded-xl select-none">
                      <span className="text-xs font-black text-slate-800 tracking-tight leading-none block">
                        {range}
                      </span>
                      {year && (
                        <span className="text-[9px] font-bold text-slate-400 mt-1 leading-none tracking-wider block">
                          {year}
                        </span>
                      )}
                    </div>
                  )
                })()}
                <button
                  onClick={() => changeWeek(1)}
                  className="flex-1 max-w-[100px] h-12 flex items-center justify-center gap-1 text-xs font-bold text-blue-600 bg-blue-50/50 border border-blue-100 rounded-xl active:scale-95 transition-all cursor-pointer"
                >
                  <span>{sT(lang, 'NextWeek')}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Roster tab selector: My Shifts vs All Staff (Clean Pill Selector) */}
            <div className="flex p-1 bg-slate-200/60 border border-slate-200 rounded-2xl">
              <button
                onClick={() => setRosterTab('my')}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  rosterTab === 'my' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {sT(lang, 'MyShifts')}
              </button>
              <button
                onClick={() => setRosterTab('all')}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  rosterTab === 'all' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {sT(lang, 'AllStaff')}
              </button>
            </div>

            {/* Published State Check */}
            {!currentRosterSnapshot ? (
              <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-dashed border-slate-300 text-center shadow-sm">
                <CalendarDays className="w-12 h-12 text-slate-400 mb-3.5" />
                <p className="text-sm font-semibold text-slate-500">{sT(lang, 'NoRoster')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                
                {/* MY SHIFTS WEEK VIEW */}
                {rosterTab === 'my' && (
                  <div className="space-y-3">
                    {myWeeklyShifts.map((dayData) => {
                      const hasShifts = dayData.shifts.length > 0
                      const dayNameStr = dayData.date.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'long' })
                      return (
                        <div
                          key={dayData.dayIdx}
                          className={`p-4 rounded-2xl border transition-all ${
                            hasShifts
                              ? 'bg-white border-slate-200 shadow-sm'
                              : 'bg-white/50 border-slate-200/60 opacity-60'
                          }`}
                        >
                          <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-3">
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider">{dayNameStr}</span>
                              <h4 className="text-sm font-extrabold text-slate-900 mt-0.5">
                                {dayData.date.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { day: 'numeric', month: 'short' })}
                              </h4>
                            </div>
                            {!hasShifts && (
                              <span className="px-3 py-1.5 rounded-xl text-xs font-black text-slate-400 bg-slate-100 border border-slate-200 uppercase tracking-wide">
                                {sT(lang, 'DayOff')}
                              </span>
                            )}
                          </div>

                          {hasShifts && (
                            <div className="space-y-2">
                              {dayData.shifts.map((sh: any, sIdx: number) => {
                                const displayColor = sh.color || '#3B82F6'
                                const durationText = sh.hours ? (lang === 'vi' ? `${sh.hours} giờ` : `${sh.hours} hrs`) : ''
                                return (
                                  <div
                                    key={sIdx}
                                    className="p-3.5 rounded-xl text-white shadow-sm flex flex-col gap-1.5 transition-transform active:scale-[0.98]"
                                    style={{ backgroundColor: displayColor }}
                                  >
                                    <div className="flex justify-between items-center">
                                      <span className="text-base font-black tracking-wide uppercase">{sh.name || sh.code}</span>
                                      {durationText && (
                                        <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                                          {durationText}
                                        </span>
                                      )}
                                    </div>
                                    {sh.startTime && (
                                      <div className="text-sm font-extrabold flex items-center gap-1.5 mt-0.5">
                                        <Clock className="w-4 h-4 text-white/80 shrink-0" />
                                        <span>
                                          {sh.startTime} - {sh.endTime}
                                          {sh.startTime2 && ` / ${sh.startTime2} - ${sh.endTime2}`}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* ALL STAFF ROSTER VIEW */}
                {rosterTab === 'all' && (
                  <div className="space-y-4">
                    {/* View mode toggle: Week vs Day */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRosterViewMode('day')}
                        className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                          rosterViewMode === 'day'
                            ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-500'
                        }`}
                      >
                        {sT(lang, 'DailyView')}
                      </button>
                      <button
                        onClick={() => setRosterViewMode('week')}
                        className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                          rosterViewMode === 'week'
                            ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-500'
                        }`}
                      >
                        {sT(lang, 'WeeklyView')}
                      </button>
                    </div>

                    {/* DAILY VIEW GRID */}
                    {rosterViewMode === 'day' && (
                      <div className="space-y-4 animate-in fade-in duration-200">
                        {/* Day Index Slider (Large Touch Elements) */}
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none select-none">
                          {weekDates.map((dateObj, idx) => {
                            const active = idx === selectedDayIdx
                            const dayLetter = dateObj.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'short' })
                            return (
                              <button
                                key={idx}
                                onClick={() => setSelectedDayIdx(idx)}
                                className={`flex-1 min-w-[54px] p-2.5 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer min-h-[54px] ${
                                  active
                                    ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10'
                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                }`}
                              >
                                <span className="text-[9px] font-bold uppercase">{dayLetter}</span>
                                <span className="text-sm font-black mt-0.5">{dateObj.getDate()}</span>
                              </button>
                            )
                          })}
                        </div>

                        {/* List of colleagues and their shifts for the day */}
                        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 shadow-sm">
                          {dailyColleaguesShifts.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 text-xs font-medium">
                              {sT(lang, 'NoShiftsToday')}
                            </div>
                          ) : (
                            dailyColleaguesShifts.map(({ colleague, shifts }, idx) => (
                              <div key={idx} className="p-4 flex justify-between items-center gap-4">
                                <div>
                                  <h5 className="text-xs font-extrabold text-slate-900">{colleague.name}</h5>
                                  <p className="text-[10px] text-slate-500 capitalize mt-0.5 font-medium">{colleague.position}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                  {shifts.map((sh: any, sIdx: number) => {
                                    const isOff = sh.code?.toUpperCase() === 'DO' || sh.code?.toUpperCase() === 'OFF' || sh.type === 'leave';
                                    return (
                                      <div
                                        key={sIdx}
                                        className="px-3 py-1.5 rounded-xl text-[10px] font-black text-white shadow-sm flex flex-col justify-center items-center w-[110px] h-[46px] leading-tight shrink-0"
                                        style={{ backgroundColor: sh.color || '#3B82F6' }}
                                      >
                                        <span className="uppercase font-black text-xs leading-none">{sh.code}</span>
                                        {!isOff && (
                                          sh.startTime ? (
                                            <span className="text-[9px] opacity-90 font-bold mt-1">
                                              {sh.startTime} - {sh.endTime}
                                            </span>
                                          ) : (
                                            <span className="text-[9px] opacity-90 font-bold mt-1">
                                              {sh.hours ? `${sh.hours}h` : '0h'}
                                            </span>
                                          )
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* WEEKLY VIEW LIST FOR ALL STAFF */}
                    {rosterViewMode === 'week' && (
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100 shadow-sm animate-in fade-in duration-200">
                        {colleaguesWeeklyGrid.map(({ colleague, weekShifts }, idx) => (
                          <div key={idx} className="p-4 space-y-3">
                            <div>
                              <h5 className="text-xs font-bold text-slate-900">{colleague.name}</h5>
                              <p className="text-[10px] text-slate-550 capitalize font-semibold">{colleague.position}</p>
                            </div>
                            
                            {/* 7-column layout (no scrolling, clean mobile layout) */}
                            <div className="grid grid-cols-7 gap-1.5 select-none mt-1">
                              {weekShifts.map((dayShift, sIdx) => {
                                const hasS = dayShift.shifts.length > 0
                                const dObj = weekDates[sIdx]
                                const label = dObj.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'narrow' })
                                return (
                                  <div key={sIdx} className="flex flex-col items-center gap-1.5 min-w-0">
                                    <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">{label}</span>
                                    {hasS ? (
                                      <div className="flex flex-col gap-1 w-full min-w-0">
                                        {dayShift.shifts.map((sh: any, ssIdx: number) => (
                                          <div
                                            key={ssIdx}
                                            className="py-1.5 px-0.5 rounded-lg text-[9px] font-black text-white text-center flex flex-col items-center justify-center min-h-[52px] w-full shadow-sm leading-none"
                                            style={{ backgroundColor: sh.color || '#3B82F6' }}
                                            title={`${sh.name} (${sh.hours}h)`}
                                          >
                                            <span className="uppercase block font-black text-[9px]">{sh.code}</span>
                                            {sh.startTime && (
                                              <span className="text-[7px] font-bold opacity-90 block mt-1">
                                                {sh.startTime}
                                              </span>
                                            )}
                                            {sh.endTime && (
                                              <span className="text-[7px] font-bold opacity-90 block mt-0.5">
                                                {sh.endTime}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center min-h-[52px] rounded-lg text-[9px] font-black text-slate-400 bg-slate-100 text-center leading-none w-full">
                                        OFF
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PROFILE & CONTRACT info */}
        {activeTab === 'info' && (
          <div className="space-y-4">
            
            {/* General Info Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                <User className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{sT(lang, 'GeneralInfo')}</h3>
              </div>
              <div className="space-y-4 text-xs">
                {[
                  { label: sT(lang, 'FullName'), value: staff.full_name, style: 'font-bold text-slate-900' },
                  { label: sT(lang, 'Phone'), value: staff.phone || '—' },
                  { label: sT(lang, 'Email'), value: staff.email || '—' },
                  { label: lang === 'vi' ? 'Thành phố' : 'City', value: staff.city || '—' },
                  { label: lang === 'vi' ? 'Địa chỉ' : 'Address', value: staff.address || '—' },
                  { label: sT(lang, 'Department'), value: staff.department || '—' },
                  { label: sT(lang, 'Role'), value: staff.position || '—' },
                  { label: sT(lang, 'StartDate'), value: fmtDate(staff.start_date) },
                  ...(showProbation ? [{ label: sT(lang, 'ProbationEnd'), value: fmtDate(staff.probation_end_date), style: 'text-amber-600 font-bold' }] : []),
                  { label: sT(lang, 'EmploymentType'), value: staff.employment_type || '—', style: 'capitalize text-blue-600 font-bold' },
                  { label: sT(lang, 'GrossSalary'), value: staff.salary_amount ? `${fmtVnd(staff.salary_amount)}${staff.employment_type === 'full_time' ? ` /${lang === 'vi' ? 'tháng' : 'month'}` : ` /${lang === 'vi' ? 'giờ' : 'hour'}`}` : '—', style: 'font-bold text-slate-850' }
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start gap-4">
                    <span className="text-slate-550 font-semibold">{item.label}</span>
                    <span className={`text-slate-800 text-right ${item.style || ''}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bank Details Card (Bank Details goes before Contract History) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                <CreditCard className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{lang === 'vi' ? 'Thông Tin Ngân Hàng' : 'Bank Details'}</h3>
              </div>
              <div className="space-y-4 text-xs">
                {[
                  { label: sT(lang, 'BankName'), value: staff.bank_name || '—', style: 'font-semibold text-slate-850' },
                  { label: sT(lang, 'BankAccountNumber'), value: staff.bank_account_number || '—', style: 'font-bold text-slate-900' },
                  { label: sT(lang, 'BankAccountName'), value: staff.bank_account_name || '—', style: 'capitalize text-slate-800' }
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start gap-4">
                    <span className="text-slate-550 font-semibold">{item.label}</span>
                    <span className={`text-slate-800 text-right ${item.style || ''}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Contracts Card (Contract History) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                <FileSignature className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{sT(lang, 'Contracts')}</h3>
              </div>
              
              {data.contracts.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs font-semibold">
                  {sT(lang, 'NoContracts')}
                </div>
              ) : (
                <div className="space-y-4">
                  {data.contracts.map((contract) => (
                    <div key={contract.id} className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                          v{contract.version}
                        </span>
                        <span className="text-[10px] text-slate-500 font-semibold">
                          {sT(lang, 'SigningDate')}: {fmtDate(contract.signing_date)}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3.5 text-xs pt-2 border-t border-slate-200">
                        <div>
                          <p className="text-slate-500 font-semibold">{sT(lang, 'ExpirationDate')}</p>
                          <p className="text-slate-900 font-extrabold mt-0.5">{fmtDate(contract.expiration_date)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 font-semibold">{sT(lang, 'BasicSalary')}</p>
                          <p className="text-green-600 font-extrabold mt-0.5">{fmtVnd(contract.basic_salary)}</p>
                        </div>
                      </div>

                      {/* Allowances */}
                      <div className="bg-white p-3 rounded-xl space-y-1.5 text-[11px] border border-slate-200">
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-wide border-b border-slate-100 pb-1 mb-1">{sT(lang, 'Allowances')}</p>
                        {[
                          { label: sT(lang, 'UniformAllowance'), val: contract.uniforms_allowance },
                          { label: sT(lang, 'LunchAllowance'), val: contract.lunch_allowance },
                          { label: sT(lang, 'PhoneAllowance'), val: contract.phone_allowance },
                          { label: sT(lang, 'FuelAllowance'), val: contract.fuel_allowance },
                          { label: sT(lang, 'HomeAllowance'), val: contract.home_support_allowance }
                        ].map((allow, aIdx) => (
                          <div key={aIdx} className="flex justify-between text-slate-600 font-medium">
                            <span>{allow.label}</span>
                            <span className="font-bold text-slate-800">{fmtVnd(allow.val)}</span>
                          </div>
                        ))}
                      </div>

                      {contract.notes && (
                        <p className="text-[11px] text-slate-500 italic bg-white p-2.5 rounded-lg border border-slate-200">
                          * {contract.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Phone Push Notifications Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                <Bell className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{sT(lang, 'PushSettings')}</h3>
              </div>
              <div className="text-xs space-y-3">
                <p className="text-slate-500 font-semibold leading-relaxed">
                  {sT(lang, 'PushPrompt')}
                </p>

                <div className="pt-2">
                  {pushStatus === 'supported' || pushStatus === 'prompt' ? (
                    <button
                      onClick={handleEnablePush}
                      disabled={pushLoading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold cursor-pointer transition-all active:scale-[0.98] shadow-md shadow-blue-500/10 disabled:opacity-50"
                    >
                      <BellRing className="w-4 h-4" />
                      {pushLoading ? sT(lang, 'Connecting') : sT(lang, 'PushEnableBtn')}
                    </button>
                  ) : pushStatus === 'granted' ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 font-bold">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          {sT(lang, 'PushEnabled')}
                        </span>
                      </div>
                      <button
                        onClick={handleSendTestPush}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer transition-all active:scale-[0.98]"
                      >
                        <Bell className="w-4 h-4" />
                        {sT(lang, 'PushTestBtn')}
                      </button>
                    </div>
                  ) : pushStatus === 'denied' ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle className="w-4 h-4 text-red-650" />
                        {sT(lang, 'PushDisabled')}
                      </div>
                      <p className="text-[10px] text-red-650 font-semibold leading-relaxed">
                        {sT(lang, 'PushDeniedInstructions')}
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-semibold text-center">
                      {sT(lang, 'PushUnsupported')}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Change Password Button Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">{sT(lang, 'ChangePassword')}</span>
                </div>
                <button
                  onClick={() => setView('change-password')}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer transition-all active:scale-[0.98] text-xs border border-slate-200 shadow-sm"
                >
                  {lang === 'vi' ? 'Đổi mật khẩu' : 'Change Password'} &nbsp;→
                </button>
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: HR DOCUMENTS docs */}
        {activeTab === 'docs' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
              <FileClock className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{sT(lang, 'Documents')}</h3>
            </div>
            
            {data.documents.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs font-semibold">
                {sT(lang, 'NoDocuments')}
              </div>
            ) : (
              <div className="space-y-3">
                {data.documents.map((doc) => (
                  <div key={doc.id} className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200 flex justify-between items-center gap-3">
                    <div className="space-y-1 block min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{doc.document_name}</h4>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                        <span className="capitalize px-1.5 py-0.5 rounded bg-slate-200 border border-slate-300/40 text-slate-700">{doc.document_type}</span>
                        <span>•</span>
                        <span>{fmtDate(doc.uploaded_at)}</span>
                      </div>
                    </div>
                    {doc.download_url && (
                      <a
                        href={doc.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 h-10 rounded-xl transition-all cursor-pointer shrink-0 active:scale-95 shadow-sm"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{sT(lang, 'DownloadBtn')}</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ASSIGNED ASSETS assets */}
        {activeTab === 'assets' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
              <Package className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{sT(lang, 'Assets')}</h3>
            </div>
            
            {data.assets.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs font-semibold">
                {sT(lang, 'NoAssets')}
              </div>
            ) : (
              <div className="space-y-4">
                {data.assets.map((asset) => {
                  const statusMap: Record<string, string> = {
                    assigned: 'bg-blue-550/10 text-blue-700 border-blue-200/50',
                    returned: 'bg-green-550/10 text-green-700 border-green-200/50',
                    damaged: 'bg-amber-550/10 text-amber-700 border-amber-200/50',
                    lost: 'bg-red-550/10 text-red-700 border-red-200/50'
                  }
                  const statusClass = statusMap[asset.status] || 'bg-slate-100 text-slate-600 border-slate-200'

                  return (
                    <div key={asset.id} className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-3">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">{asset.asset_name}</h4>
                          {asset.serial_number && (
                            <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{sT(lang, 'SerialNo')}: {asset.serial_number}</p>
                          )}
                        </div>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${statusClass}`}>
                          {getLocalizedAssetStatus(asset.status)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-2 border-t border-slate-200">
                        <div>
                          <span className="text-slate-500 font-semibold">{sT(lang, 'AssignedAt')}</span>
                          <p className="text-slate-800 font-bold mt-0.5">{fmtDate(asset.assigned_date)}</p>
                        </div>
                        <div>
                          <span className="text-slate-500 font-semibold">{sT(lang, 'Qty')}</span>
                          <p className="text-slate-800 font-bold mt-0.5">{asset.quantity}</p>
                        </div>
                        {asset.initial_condition && (
                          <div>
                            <span className="text-slate-500 font-semibold">{sT(lang, 'InitialCondition')}</span>
                            <p className="text-slate-800 font-bold mt-0.5 capitalize">{asset.initial_condition}</p>
                          </div>
                        )}
                        {asset.return_date && (
                          <div>
                            <span className="text-slate-500 font-semibold">{sT(lang, 'ReturnedAt')}</span>
                            <p className="text-slate-800 font-bold mt-0.5">{fmtDate(asset.return_date)}</p>
                          </div>
                        )}
                        {asset.return_condition && (
                          <div>
                            <span className="text-slate-500 font-semibold">{sT(lang, 'ReturnCondition')}</span>
                            <p className="text-slate-800 font-bold mt-0.5 capitalize">{asset.return_condition}</p>
                          </div>
                        )}
                      </div>

                      {asset.notes && (
                        <div className="text-xs bg-slate-100/50 p-2 rounded-lg border border-slate-200/50 text-slate-600">
                          <span className="font-semibold text-slate-700 block mb-0.5">{lang === 'vi' ? 'Ghi chú' : 'Notes'}:</span>
                          <p className="margin-0 italic">{asset.notes}</p>
                        </div>
                      )}

                      {/* Log history of asset status */}
                      {asset.hr_staff_asset_history && asset.hr_staff_asset_history.length > 0 && (
                        <div className="bg-white p-3 rounded-xl space-y-2 border border-slate-200">
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-wide border-b border-slate-100 pb-1">{sT(lang, 'AssetHistory')}</p>
                          <div className="space-y-1.5">
                            {asset.hr_staff_asset_history.map((log) => (
                              <div key={log.id} className="flex justify-between items-start text-[10px] text-slate-600">
                                <div className="space-y-0.5">
                                  <span className="font-bold text-slate-800 capitalize">{getLocalizedAssetStatus(log.status)}</span>
                                  {log.notes && <p className="text-[9px] text-slate-500 italic font-medium">{log.notes}</p>}
                                </div>
                                <span className="text-slate-400 shrink-0 font-semibold">{fmtDate(log.changed_at)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: CAREER & REVIEWS career */}
        {activeTab === 'career' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{sT(lang, 'CareerJourney')}</h3>
            </div>

            {timelineItems.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs font-semibold">
                {sT(lang, 'NoHistory')}
              </div>
            ) : (
              <div className="relative pl-6 space-y-6">
                {/* Vertical connecting line */}
                <div className="absolute left-2.5 top-2.5 bottom-2.5 w-0.5 bg-slate-200" />

                {timelineItems.map((item) => {
                  const Icon = item.icon
                  const isReview = item.type === 'review'
                  const isExpanded = expandedReviews[item.id] || false
                  
                  return (
                    <div key={item.id} className="relative group">
                      
                      {/* Timeline Dot/Icon */}
                      <span className="absolute -left-[27.5px] top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white border border-slate-300 text-slate-500 shadow-sm ring-4 ring-white">
                        <Icon className="w-3 h-3 text-slate-500" />
                      </span>

                      {/* Timeline Content */}
                      <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-[10px] text-slate-500 font-semibold">{fmtDate(item.date)}</span>
                          <div className="flex items-center gap-1.5">
                            {isReview && item.raw.isExitReview && (
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-red-100 text-red-750 border border-red-200 animate-pulse shrink-0">
                                {lang === 'vi' ? 'Đánh giá nghỉ việc' : 'Exit Review'}
                              </span>
                            )}
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                              {item.title}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs text-slate-850 font-bold leading-normal">
                          {item.description}
                        </div>

                        {/* Extra logic for Performance Review */}
                        {isReview && (
                          <div className="pt-1.5 border-t border-slate-200/50 space-y-2">
                            <div className="flex justify-between items-center">
                              {item.raw.rating !== null && (
                                <div className="flex gap-0.5 text-amber-500 font-bold">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <span key={i} className="text-sm">
                                      {i < item.raw.rating ? '★' : '☆'}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <button
                                onClick={() => {
                                  setExpandedReviews(prev => ({
                                    ...prev,
                                    [item.id]: !prev[item.id]
                                  }))
                                }}
                                className="text-[10px] font-bold text-blue-600 hover:text-blue-700 underline cursor-pointer"
                              >
                                {isExpanded ? (lang === 'vi' ? 'Thu gọn' : 'Collapse') : (lang === 'vi' ? 'Xem chi tiết' : 'View details')}
                              </button>
                            </div>

                            {isExpanded && (
                              <div className="text-[11px] text-slate-650 space-y-2.5 pt-2 border-t border-dashed border-slate-200 animate-in fade-in duration-200">
                                <div className="grid grid-cols-2 gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
                                  {item.raw.period && (
                                    <div>
                                      <span className="font-semibold text-slate-400 uppercase text-[8px] tracking-wide block">{sT(lang, 'Period')}</span>
                                      <span className="font-bold text-slate-800 block mt-0.5">{item.raw.period}</span>
                                    </div>
                                  )}
                                  {item.raw.reviewer_name && (
                                    <div>
                                      <span className="font-semibold text-slate-400 uppercase text-[8px] tracking-wide block">{sT(lang, 'Reviewer')}</span>
                                      <span className="font-bold text-slate-800 block mt-0.5">{item.raw.reviewer_name}</span>
                                    </div>
                                  )}
                                </div>

                                {item.raw.feedback && (
                                  <div className="bg-white p-3 rounded-xl border border-slate-200 italic leading-relaxed">
                                    <span className="font-extrabold text-[8px] text-slate-400 uppercase tracking-wide not-italic block mb-1">{sT(lang, 'Feedback')}</span>
                                    "{item.raw.feedback}"
                                  </div>
                                )}

                                {item.raw.strengths && (
                                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                                    <span className="font-extrabold text-[8px] text-slate-400 uppercase tracking-wide block mb-1">{sT(lang, 'Strengths')}</span>
                                    <p className="font-medium text-slate-800">{item.raw.strengths}</p>
                                  </div>
                                )}

                                {item.raw.improvements && (
                                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                                    <span className="font-extrabold text-[8px] text-slate-400 uppercase tracking-wide block mb-1">{sT(lang, 'Improvements')}</span>
                                    <p className="font-medium text-slate-800">{item.raw.improvements}</p>
                                  </div>
                                )}

                                {item.raw.category_ratings && (() => {
                                  const ratings = Object.values(item.raw.category_ratings).map(Number).filter(v => !isNaN(v) && v > 0)
                                  const average = ratings.length > 0 ? (ratings.reduce((sum, val) => sum + val, 0) / ratings.length).toFixed(2) : null
                                  
                                  return (
                                    <div className="space-y-1.5">
                                      <span className="font-extrabold text-[8px] text-slate-400 uppercase tracking-wide block">{sT(lang, 'CategoryRatings')}</span>
                                      <div className="grid grid-cols-1 gap-2 bg-white p-2.5 rounded-xl border border-slate-200 animate-in fade-in duration-250">
                                        {Object.entries(item.raw.category_ratings).map(([catKey, val]) => {
                                          const catName = CATEGORY_NAMES[lang]?.[catKey] || catKey
                                          return (
                                            <div key={catKey} className="flex justify-between items-center text-slate-600 font-medium">
                                              <span className="truncate mr-1.5">{catName}</span>
                                              <span className="font-bold text-slate-850 shrink-0">{String(val)}/5</span>
                                            </div>
                                          )
                                        })}
                                        {average !== null && (
                                          <div className="flex justify-between items-center pt-2 mt-1 border-t border-slate-100 text-xs font-bold text-slate-900">
                                            <span>{lang === 'vi' ? 'Điểm trung bình' : 'Average Score'}</span>
                                            <span className="text-blue-600 font-black">{average}/5</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })()}

                                {item.raw.notes && (
                                  <p className="text-[10px] text-slate-400 italic">
                                    * {item.raw.notes}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Extra notes if present in Role or Salary */}
                        {(item.type === 'role' || item.type === 'salary') && item.raw.notes && (
                          <p className="text-[10px] text-slate-500 italic mt-1 border-t border-slate-200/50 pt-1">
                            {sT(lang, 'NoteLabel')}: {item.raw.notes}
                          </p>
                        )}
                        {item.type === 'role' && item.raw.reason && (
                          <p className="text-[10px] text-slate-500 italic mt-1 border-t border-slate-200/50 pt-1">
                            {sT(lang, 'NoteLabel')}: {item.raw.reason}
                          </p>
                        )}
                        {item.type === 'salary' && item.raw.reason && (
                          <p className="text-[10px] text-slate-500 italic mt-1 border-t border-slate-200/50 pt-1">
                            {sT(lang, 'NoteLabel')}: {item.raw.reason}
                          </p>
                        )}

                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: DISCIPLINARY sanzioni, warnings e premi */}
        {activeTab === 'disciplinary' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{sT(lang, 'Disciplinary')}</h3>
            </div>

            {/* Sotto-tab minimaliste */}
            <div className="flex border-b border-slate-150 gap-4 mb-2">
              <button 
                onClick={() => setDisciplinaryTab('fines')}
                className={`pb-2.5 text-xs font-bold border-b-2 transition-all ${disciplinaryTab === 'fines' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400 hover:text-slate-650'}`}
              >
                {sT(lang, 'DisciplinaryHistory')}
              </button>
              <button 
                onClick={() => setDisciplinaryTab('warnings')}
                className={`pb-2.5 text-xs font-bold border-b-2 transition-all ${disciplinaryTab === 'warnings' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400 hover:text-slate-650'}`}
              >
                {sT(lang, 'WarningsHistory')}
              </button>
              <button 
                onClick={() => setDisciplinaryTab('awards')}
                className={`pb-2.5 text-xs font-bold border-b-2 transition-all ${disciplinaryTab === 'awards' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400 hover:text-slate-650'}`}
              >
                {sT(lang, 'AwardsHistory')}
              </button>
            </div>
            
            {/* FINES */}
            {disciplinaryTab === 'fines' && (
              data.disciplinary.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs font-semibold">
                  {sT(lang, 'NoFines')}
                </div>
              ) : (
                <div className="space-y-3.5">
                  {data.disciplinary.map((fine) => {
                    const statusMap: Record<string, string> = {
                      pending: 'bg-amber-550/10 text-amber-700 border-amber-200/50',
                      paid: 'bg-emerald-550/10 text-emerald-700 border-emerald-200/50',
                      waived: 'bg-slate-100 text-slate-600 border-slate-200',
                      disputed: 'bg-red-550/10 text-red-750 border-red-200/50'
                    }
                    const statusClass = statusMap[fine.status] || 'bg-slate-100 text-slate-650'

                    return (
                      <div key={fine.id} className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-3">
                        <div className="flex justify-between items-start gap-3">
                          <div>
                            <h4 className="text-xs font-bold text-slate-900">
                              {fine.infraction?.infraction_name || (typeof fine.infraction === 'string' ? fine.infraction : '—')}
                            </h4>
                            <span className="text-[10px] text-slate-500 font-semibold mt-0.5 block">{fmtDate(fine.date)}</span>
                          </div>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${statusClass}`}>
                            {getLocalizedFineStatus(fine.status)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200/60">
                          <div>
                            <span className="text-slate-500 font-semibold block text-[9px] uppercase tracking-wide">{sT(lang, 'Amount')}</span>
                            <span className="text-red-650 font-black mt-0.5">-{fmtVnd(fine.amount)}</span>
                          </div>
                          {fine.deduction_source && (
                            <div className="text-right">
                              <span className="text-slate-500 font-semibold block text-[9px] uppercase tracking-wide">{sT(lang, 'Source')}</span>
                              <span className="text-slate-700 capitalize font-bold mt-0.5 block">{fine.deduction_source.replace('_', ' ')}</span>
                            </div>
                          )}
                        </div>

                        {fine.notes && (
                          <p className="text-[10px] text-slate-500 italic bg-white p-2.5 rounded-lg border border-slate-200">
                            * {fine.notes}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            )}

            {/* WARNINGS */}
            {disciplinaryTab === 'warnings' && (
              (data.warnings || []).length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs font-semibold">
                  {sT(lang, 'NoWarnings')}
                </div>
              ) : (
                <div className="space-y-3.5">
                  {(data.warnings || []).map((warning) => {
                    const flagColors = {
                      green: 'bg-emerald-50 text-emerald-700 border-emerald-200/50',
                      yellow: 'bg-amber-50 text-amber-700 border-amber-200/50',
                      red: 'bg-red-50 text-red-700 border-red-200/50'
                    }
                    const flagLabels = {
                      green: sT(lang, 'PositiveNote'),
                      yellow: sT(lang, 'Caution'),
                      red: sT(lang, 'Warning')
                    }
                    const flagClass = flagColors[warning.flag_type] || 'bg-slate-50 text-slate-750'
                    const flagLabel = flagLabels[warning.flag_type] || warning.flag_type

                    return (
                      <div key={warning.id} className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-3">
                        <div className="flex justify-between items-start gap-3">
                          <div>
                            <span className="text-[10px] text-slate-500 font-semibold block">{fmtDate(warning.date)}</span>
                          </div>
                          <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2.5 py-0.5 rounded border ${flagClass}`}>
                            <Flag className={`w-2.5 h-2.5 ${warning.flag_type === 'green' ? 'fill-emerald-500 text-emerald-500' : warning.flag_type === 'yellow' ? 'fill-amber-500 text-amber-500' : 'fill-red-500 text-red-500'}`} />
                            {flagLabel}
                          </span>
                        </div>

                        <div className="text-xs pt-2 border-t border-slate-200/60">
                          <span className="text-slate-500 font-semibold block text-[9px] uppercase tracking-wide">{sT(lang, 'Reason')}</span>
                          <p className="text-slate-700 font-medium mt-1 leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200">
                            {formatWarningReason(warning.reason)}
                          </p>
                        </div>

                        {warning.notified_by && (
                          <div className="flex justify-end text-[9px] text-slate-400 font-semibold">
                            By: {warning.notified_by}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            )}

            {/* AWARDS */}
            {disciplinaryTab === 'awards' && (
              (data.awards || []).length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs font-semibold">
                  {sT(lang, 'NoAwards')}
                </div>
              ) : (
                <div className="space-y-3.5">
                  {(data.awards || []).map((award) => {
                    const statusMap: Record<string, string> = {
                      pending: 'bg-amber-550/10 text-amber-700 border-amber-200/50',
                      paid: 'bg-emerald-550/10 text-emerald-700 border-emerald-200/50',
                      waived: 'bg-slate-100 text-slate-650 border-slate-200',
                      disputed: 'bg-red-550/10 text-red-750 border-red-200/50'
                    }
                    const statusClass = statusMap[award.status] || 'bg-slate-100 text-slate-650'

                    return (
                      <div key={award.id} className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-3">
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex items-center gap-1.5">
                            <Award className="w-4 h-4 text-emerald-600 shrink-0" />
                            <div>
                              <h4 className="text-xs font-bold text-slate-900">
                                {award.award_name}
                              </h4>
                              <span className="text-[10px] text-slate-500 font-semibold mt-0.5 block">{fmtDate(award.date)}</span>
                            </div>
                          </div>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${statusClass}`}>
                            {getLocalizedFineStatus(award.status)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200/60">
                          <div>
                            <span className="text-slate-500 font-semibold block text-[9px] uppercase tracking-wide">{sT(lang, 'Amount')}</span>
                            <span className="text-emerald-650 font-black mt-0.5">+{fmtVnd(award.amount)}</span>
                          </div>
                          {award.deduction_source && (
                            <div className="text-right">
                              <span className="text-slate-500 font-semibold block text-[9px] uppercase tracking-wide">{sT(lang, 'CreditSource')}</span>
                              <span className="text-slate-700 capitalize font-bold mt-0.5 block">{award.deduction_source.replace('_', ' ')}</span>
                            </div>
                          )}
                        </div>

                        {award.notified_by && (
                          <div className="flex justify-end text-[9px] text-slate-400 font-semibold">
                            Enforced by: {award.notified_by}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </div>
        )}

        {/* TAB 7: SERVICE CHARGE */}
        {activeTab === 'service_charge' && (
          <div className="space-y-4">
            
            {/* Monthpicker row (Standard style conforming to MonthPicker rules) */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <MonthPicker
                value={scMonth}
                onChange={setScMonth}
                language={lang}
                labelColorClass="text-slate-900"
                colorClass="text-blue-600 hover:text-blue-700 font-bold"
                iconColorClass="text-slate-500 hover:text-slate-700"
                className="mb-0"
              />
            </div>

            {/* Calculations metrics card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                <Percent className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{sT(lang, 'ServiceCharge')}</h3>
              </div>

              {!activeServiceChargeRecord ? (
                <div className="text-center py-10 text-slate-400 text-xs font-semibold">
                  {sT(lang, 'NoSC')}
                </div>
              ) : (
                <div className="space-y-5 animate-in fade-in duration-200">
                  
                  {/* Big primary KPI block */}
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 text-center relative overflow-hidden shadow-sm">
                    <div className="absolute -top-10 -right-10 w-24 h-24 bg-blue-500/5 rounded-full blur-xl" />
                    <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest">{sT(lang, 'AmountReceived')}</p>
                    <p className="text-2xl font-black text-green-600 mt-1.5">
                      {fmtVnd(activeServiceChargeRecord.amount_received)}
                    </p>
                  </div>

                  {/* Calculations details */}
                  <div className="space-y-3.5 text-xs">
                    {[
                      { label: sT(lang, 'HoursWorked'), value: `${activeServiceChargeRecord.hours_worked} ${sT(lang, 'Hours')}` },
                      { label: sT(lang, 'TotalPool'), value: fmtVnd(activeServiceChargeRecord.total_pool) },
                      { label: sT(lang, 'SharePercentage'), value: `${activeServiceChargeRecord.percentage.toFixed(2)} %`, style: 'text-blue-600 font-bold' }
                    ].map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                        <span className="text-slate-500 font-semibold">{item.label}</span>
                        <span className={`text-slate-800 font-bold ${item.style || ''}`}>{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2.5 items-start text-xs text-blue-800 leading-normal p-3.5 bg-blue-50/70 border border-blue-100/60 rounded-2xl mt-2">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>{sT(lang, 'SCDynamicNote')}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* FLOATING TOAST NOTIFICATION POPUP */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-55 w-full max-w-sm px-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-xl flex gap-3 items-start border border-slate-800">
            <span className="p-1.5 rounded-lg bg-blue-600 text-white shrink-0">
              <Bell className="w-4 h-4 animate-bounce" />
            </span>
            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-black tracking-wide uppercase">{toast.title}</h5>
              <p className="text-[11px] text-slate-300 font-semibold mt-0.5 leading-relaxed">{toast.body}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="p-1 hover:bg-white/10 rounded text-white/60 hover:text-white cursor-pointer active:scale-95"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
