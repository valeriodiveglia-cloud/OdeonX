'use client'

import React, { useState, useEffect } from 'react'
import { Eye, EyeOff, LogIn, Lock, TrendingUp, DollarSign, Users, Clock, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp, X } from 'lucide-react'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

/* ────────────────────── types ────────────────────── */
type PartnerData = {
  partner: { id: string; name: string; type: string | null; contact_name: string | null; partner_code: string; phone: string | null; issues_vat_invoice?: boolean }
  agreement: { commission_type: string; commission_value: number; client_discount_type: string | null; client_discount_value: number | null; status: string; valid_until: string | null } | null
  referrals: { id: string; guest_name: string; arrival_date: string | null; party_size: number; status: string; revenue_generated: number; commission_value: number; created_at: string; payout_id?: string | null; partner_payout?: { status: string } }[]
  payouts: { id: string; period: string; amount: number; status: string; payment_date: string | null; reference_number: string | null; notes: string | null; created_at: string }[]
  summary: { totalCommissions: number; paidCommissions: number; pendingCommissions: number; totalReferrals: number; validatedReferrals: number; pendingReferrals: number }
}

type ViewState = 'login' | 'setup' | 'dashboard'
type Lang = 'en' | 'vi'

const PORTAL_DICT = {
  en: {
    PartnerPortal: 'Partner Portal',
    Login: 'Login',
    PartnerCodeOrPhone: 'Partner Code or Phone',
    Password: 'Password',
    Show: 'Show',
    Hide: 'Hide',
    SignIn: 'Sign In',
    LoginHint: 'For your first login, use only your partner code. You will be asked to set a password.',
    SetupWelcome: 'Welcome, {name}!',
    SetupSubtitle: 'Set a password for your future logins',
    NewPassword: 'New Password',
    ConfirmPassword: 'Confirm Password',
    PasswordMin: 'Minimum 6 characters',
    RepeatPassword: 'Repeat password',
    SetPasswordBtn: 'Set Password',
    MismatchErr: 'Passwords do not match',
    Logout: 'Logout',
    Total: 'Total',
    Paid: 'Paid',
    Pending: 'Pending',
    ActiveAgreement: 'Active Agreement',
    Commission: 'Commission',
    ClientDiscount: 'Client Discount',
    ValidUntil: 'Valid until {date}',
    Referrals: 'Referrals',
    Validated: 'validated',
    PayoutHistory: 'Payout History',
    NoReferrals: 'No referrals',
    NoPayouts: 'No payouts',
    ShowMore: 'Show all ({n})',
    ShowLess: 'Show less',
    FooterInfo: 'For questions, contact us directly · Data shown is read-only',
    TotalBill: 'Total Bill',
    Language: 'Language',
    Connecting: 'Connecting...',
    Saving: 'Saving...',
    TransactionDetails: 'Transaction Details',
    BaseRevenue: 'Base Revenue',
    TransactionRef: 'Transaction Ref',
    GrossCommission: 'Gross Commission',
    NetCommission: 'Net Commission',
    PITDeduction: 'PIT Deduction',
    Processing: 'Processing',
    NoPayout: 'No Payout',
    Cancelled: 'Cancelled',
    PartiallyPaid: 'Partially Paid',
    InPayout: 'In Payout',
    Close: 'Close',
    Period: 'Period',
    Notes: 'Notes',
    PitNotDeductedBelowThresholdNotes: 'PIT not deducted because the payment ({amount} VND) is below the threshold of {threshold} VND.',
    PitNotDeductedBelowThreshold: 'PIT not deducted (below threshold)'
  },
  vi: {
    PartnerPortal: 'Cổng Đối Tác',
    Login: 'Đăng nhập',
    PartnerCodeOrPhone: 'Mã Đối Tác hoặc Số Điện Thoại',
    Password: 'Mật khẩu',
    Show: 'Hiện',
    Hide: 'Ẩn',
    SignIn: 'Đăng Nhập',
    LoginHint: 'Trong lần đăng nhập đầu tiên, chỉ sử dụng mã đối tác của bạn. Bạn sẽ được yêu cầu thiết lập mật khẩu.',
    SetupWelcome: 'Chào mừng, {name}!',
    SetupSubtitle: 'Thiết lập mật khẩu cho các lần truy cập tiếp theo',
    NewPassword: 'Mật khẩu mới',
    ConfirmPassword: 'Xác nhận mật khẩu',
    PasswordMin: 'Tối thiểu 6 ký tự',
    RepeatPassword: 'Lặp lại mật khẩu',
    SetPasswordBtn: 'Đặt Mật Khẩu',
    MismatchErr: 'Mật khẩu không khớp',
    Logout: 'Đăng xuất',
    Total: 'Tổng',
    Paid: 'Đã thanh toán',
    Pending: 'Đang chờ',
    ActiveAgreement: 'Thỏa Thuận Hiện Tại',
    Commission: 'Hoa Hồng',
    ClientDiscount: 'Chiết Khấu Khách',
    ValidUntil: 'Có hiệu lực đến {date}',
    Referrals: 'Lượt Giới Thiệu',
    Validated: 'đã xác nhận',
    PayoutHistory: 'Lịch Sử Thanh Toán',
    NoReferrals: 'Không có lượt giới thiệu',
    NoPayouts: 'Không có thông tin lịch sử',
    ShowMore: 'Hiển thị tất cả ({n})',
    ShowLess: 'Ẩn bớt',
    FooterInfo: 'Vui lòng liên hệ trực tiếp cho mọi câu hỏi · Dữ liệu chỉ dùng để xem',
    TotalBill: 'Tổng Hóa Đơn',
    Language: 'Ngôn ngữ',
    Connecting: 'Đang kết nối...',
    Saving: 'Đang lưu...',
    TransactionDetails: 'Chi Tiết Giao Dịch',
    BaseRevenue: 'Doanh Thu Gốc',
    TransactionRef: 'Mã Giao Dịch',
    GrossCommission: 'Hoa Hồng Gộp',
    NetCommission: 'Hoa Hồng Thực Nhận',
    PITDeduction: 'Khấu Trừ Thuế (PIT)',
    Processing: 'Đang xử lý',
    NoPayout: 'Chưa thanh toán',
    Cancelled: 'Đã hủy',
    PartiallyPaid: 'Thanh toán một phần',
    InPayout: 'Đang lên lịch',
    Close: 'Đóng',
    Period: 'Kỳ thanh toán',
    Notes: 'Ghi chú',
    PitNotDeductedBelowThresholdNotes: 'Không khấu trừ thuế TNCN vì khoản thanh toán ({amount} VND) dưới ngưỡng {threshold} VND.',
    PitNotDeductedBelowThreshold: 'Không khấu trừ thuế TNCN (dưới ngưỡng)'
  }
}

function pT(lang: Lang, key: keyof typeof PORTAL_DICT['en'], vars?: Record<string, string>) {
  let text = PORTAL_DICT[lang as keyof typeof PORTAL_DICT]?.[key] || PORTAL_DICT['en'][key] || key
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, v)
    })
  }
  return text
}

/* ────────────────── format helpers ────────────────── */
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return d }
}

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    Validated: 'bg-[#dcefe9] text-[#149372] border-[#149372]/30',
    Pending: 'bg-[#cbf0e6] text-[#149372] border-orange-200',
    Disputed: 'bg-red-100 text-red-700 border-red-200',
    Cancelled: 'bg-stone-100 text-[#755533] border-[#C2A580]',
    Paid: 'bg-[#dcefe9] text-[#149372] border-[#149372]/30',
  }
  return map[status] || 'bg-stone-100 text-[#61462A] border-[#C2A580]'
}

const statusIcon = (status: string) => {
  if (status === 'Validated' || status === 'Paid') return <CheckCircle className="w-3.5 h-3.5" />
  if (status === 'Pending') return <Clock className="w-3.5 h-3.5" />
  if (status === 'Disputed') return <AlertCircle className="w-3.5 h-3.5" />
  if (status === 'Cancelled') return <XCircle className="w-3.5 h-3.5" />
  return null
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function PartnerPortalPage() {
  const [view, setView] = useState<ViewState>('login')
  const [lang, setLang] = useState<Lang>('vi')
  const [logoUrl, setLogoUrl] = useState<string>('')

  useEffect(() => {
    fetch('/api/partner-portal/logo').then(r => r.json()).then(j => { if (j.url) setLogoUrl(j.url) }).catch(() => {})
  }, [])
  
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [partnerCode, setPartnerCode] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [data, setData] = useState<PartnerData | null>(null)
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null)

  /* ── Language Switcher Component ── */
  function LangSelector() {
    return (
      <div className="flex items-center justify-end gap-2 mb-4 w-full max-w-md mx-auto px-4 pt-4">
        <span className="text-xs text-[#755533] mr-1">{pT(lang, 'Language')}:</span>
        {(['en', 'vi'] as Lang[]).map(l => {
          const active = l === lang;
          return (
            <button
              key={l}
              onClick={() => setLang(l)}
              type="button"
              className={`px-2 py-1 rounded-lg text-sm border transition-colors ${
                active ? 'bg-[#149372] text-white border-[#0e755a]' : 'bg-[#fbf5e6] text-[#149372] border-[#8C673D] hover:bg-[#dcefe9]'
              }`}
            >
              {l.toUpperCase()}
            </button>
          )
        })}
      </div>
    )
  }

  /* ── Login ── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setAttemptsLeft(null)
    setMinutesLeft(null)
    setLoading(true)

    try {
      const res = await fetch('/api/partner-portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password })
      })
      const json = await res.json()

      if (json.needsSetup) {
        setPartnerCode(json.partnerCode)
        setPartnerName(json.partnerName)
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

      // Success → fetch data
      await fetchData(json.partnerId)
    } catch {
      setError('Connection Error')
    } finally {
      setLoading(false)
    }
  }

  /* ── Setup Password ── */
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (newPassword.length < 6) {
      setError(pT(lang, 'PasswordMin'))
      setLoading(false)
      return
    }
    if (newPassword !== confirmPassword) {
      setError(pT(lang, 'MismatchErr'))
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/partner-portal/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerCode, newPassword })
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Server error')
        return
      }

      await fetchData(json.partnerId)
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  /* ── Fetch Data ── */
  const fetchData = async (partnerId: string) => {
    const res = await fetch('/api/partner-portal/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partnerId })
    })
    const json = await res.json()
    if (res.ok) {
      setData(json)
      setView('dashboard')
    } else {
      setError(json.error || 'Error loading data')
    }
  }

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div className="min-h-screen bg-[#e8d5ae] text-[#3E2C19] font-sans flex flex-col">
      {view !== 'dashboard' && <LangSelector />}
      {view === 'login' && <LoginView
        lang={lang} logoUrl={logoUrl}
        identifier={identifier} setIdentifier={setIdentifier}
        password={password} setPassword={setPassword}
        showPassword={showPassword} setShowPassword={setShowPassword}
        error={error} loading={loading}
        attemptsLeft={attemptsLeft} minutesLeft={minutesLeft}
        onSubmit={handleLogin}
      />}
      {view === 'setup' && <SetupView
        lang={lang} logoUrl={logoUrl}
        partnerName={partnerName}
        newPassword={newPassword} setNewPassword={setNewPassword}
        confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
        showPassword={showPassword} setShowPassword={setShowPassword}
        error={error} loading={loading}
        onSubmit={handleSetup}
      />}
      {view === 'dashboard' && data && <DashboardView 
        lang={lang} logoUrl={logoUrl}
        data={data} 
        onLogout={() => {
        setView('login')
        setData(null)
        setPassword('')
        setIdentifier('')
        setError('')
      }} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   LOGIN VIEW
   ═══════════════════════════════════════════════════════ */
function LoginView({
  lang, logoUrl, identifier, setIdentifier, password, setPassword,
  showPassword, setShowPassword,
  error, loading, attemptsLeft, minutesLeft,
  onSubmit
}: any) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 pb-20">
      {/* Logo */}
      <div className="mb-8">
        {logoUrl && <img src={logoUrl} alt="Logo" className="h-24 w-auto object-contain" />}
      </div>

      <div className="bg-[#fbf5e6] rounded-2xl shadow-xl border border-[#D9BD9C] p-6 sm:p-10 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-[#149372] text-center">{pT(lang, 'PartnerPortal')}</h2>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#61462A] mb-1.5 uppercase tracking-wide">
              {pT(lang, 'PartnerCodeOrPhone')}
            </label>
            <div className="flex items-center gap-0">
              <input
                id="partner-identifier"
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder={pT(lang, 'PartnerCodeOrPhone')}
                className="w-full px-4 py-2.5 rounded-xl border border-[#8C673D] text-[#3E2C19] placeholder-[#A38562] bg-[#fbf5e6] focus:outline-none focus:ring-2 focus:ring-[#149372]/50 transition-all text-sm uppercase placeholder:normal-case"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#61462A] mb-1.5 uppercase tracking-wide">
              {pT(lang, 'Password')}
            </label>
            <div className="relative">
              <input
                id="partner-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-[#8C673D] text-[#3E2C19] placeholder-[#A38562] bg-[#fbf5e6] focus:outline-none focus:ring-2 focus:ring-[#149372]/50 transition-all text-sm pr-12"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-10 h-8 bg-[#fbf5e6] border border-[#8C673D] rounded-lg hover:bg-[#dcefe9] focus:outline-none text-[#149372] transition-colors">
                {showPassword ? <EyeSlashIcon className="w-5 h-5 text-[#149372]" /> : <EyeIcon className="w-5 h-5 text-[#149372]" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-red-700 font-medium">{error}</p>
                {attemptsLeft != null && <p className="text-xs text-red-600 mt-0.5">{attemptsLeft} attempts left</p>}
                {minutesLeft != null && <p className="text-xs text-red-600 mt-0.5">Wait {minutesLeft} minutes</p>}
              </div>
            </div>
          )}

          <button
            id="partner-login-btn"
            type="submit"
            disabled={loading || !identifier.trim()}
            className="w-full bg-[#149372] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl shadow-md shadow-orange-700/20 transition hover:bg-[#0e755a] flex items-center justify-center gap-2 mt-2"
          >
            {loading ? pT(lang, 'Connecting') : pT(lang, 'SignIn')}
          </button>

          <p className="text-center text-[13px] text-[#755533] mt-2 p-3 bg-[#eedebf] rounded-xl">
            {pT(lang, 'LoginHint')}
          </p>
        </form>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   SETUP PASSWORD VIEW
   ═══════════════════════════════════════════════════════ */
function SetupView({
  lang, logoUrl, partnerName, newPassword, setNewPassword,
  confirmPassword, setConfirmPassword,
  showPassword, setShowPassword,
  error, loading, onSubmit
}: any) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 pb-20">
      <div className="mb-6 text-center">
         {logoUrl && <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain mx-auto mb-6" />}
      </div>

      <div className="bg-[#fbf5e6] rounded-2xl shadow-xl border border-[#D9BD9C] p-6 sm:p-10 w-full max-w-md">
        <h1 className="text-2xl font-bold text-[#149372] text-center">{pT(lang, 'SetupWelcome', { name: partnerName })}</h1>
        <p className="text-[#755533] mt-1 text-sm text-center mb-6">{pT(lang, 'SetupSubtitle')}</p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#61462A] mb-1.5 uppercase tracking-wide">{pT(lang, 'NewPassword')}</label>
            <div className="relative">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder={pT(lang, 'PasswordMin')}
                className="w-full px-4 py-2.5 rounded-xl border border-[#8C673D] text-[#3E2C19] placeholder-[#A38562] focus:outline-none focus:ring-2 focus:ring-[#149372]/50 transition-all text-sm pr-12"
                autoComplete="new-password"
                required
                minLength={6}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-10 h-8 bg-[#fbf5e6] border border-[#8C673D] rounded-lg hover:bg-[#dcefe9] focus:outline-none text-[#149372] transition-colors">
                {showPassword ? <EyeSlashIcon className="w-5 h-5 font-bold" /> : <EyeIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#61462A] mb-1.5 uppercase tracking-wide">{pT(lang, 'ConfirmPassword')}</label>
            <input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder={pT(lang, 'RepeatPassword')}
              className="w-full px-4 py-2.5 rounded-xl border border-[#8C673D] text-[#3E2C19] placeholder-[#A38562] bg-[#fbf5e6] focus:outline-none focus:ring-2 focus:ring-[#149372]/50 transition-all text-sm"
              autoComplete="new-password"
              required
            />
          </div>

          {newPassword && confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-red-500 font-medium">{pT(lang, 'MismatchErr')}</p>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            id="setup-password-btn"
            type="submit"
            disabled={loading || newPassword.length < 6 || newPassword !== confirmPassword}
            className="w-full bg-[#149372] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl shadow-md shadow-orange-700/20 transition hover:bg-[#0e755a] flex items-center justify-center gap-2 mt-4"
          >
            {loading ? pT(lang, 'Saving') : pT(lang, 'SetPasswordBtn')}
          </button>
        </form>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   DASHBOARD VIEW
   ═══════════════════════════════════════════════════════ */
function DashboardView({ lang, logoUrl, data, onLogout }: { lang: Lang, logoUrl: string, data: PartnerData; onLogout: () => void }) {
  const { partner, agreement, referrals, payouts, summary } = data
  const [showAllReferrals, setShowAllReferrals] = useState(false)
  const [showAllPayouts, setShowAllPayouts] = useState(false)
  const [selectedReferral, setSelectedReferral] = useState<PartnerData['referrals'][0] | null>(null)
  const [selectedPayout, setSelectedPayout] = useState<PartnerData['payouts'][0] | null>(null)
  const displayedReferrals = showAllReferrals ? referrals : referrals.slice(0, 5)
  const displayedPayouts = showAllPayouts ? payouts : payouts.slice(0, 5)

  return (
    <div className="flex-1 bg-[#f9f4ea] min-h-screen pb-10">
      {/* Header aligned with main app */}
      <header className="bg-white border-b border-[#e1d5c3] sticky top-0 z-20 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
        <div className="max-w-4xl mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center gap-4">
             {logoUrl && <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" />}
             <div className="h-6 w-px bg-stone-200 hidden sm:block"></div>
             <div>
                <h1 className="text-[17px] font-bold text-[#3E2C19] leading-tight">{partner.name}</h1>
                <p className="text-xs font-semibold text-[#149372]">
                  {partner.partner_code} {partner.type ? `· ${partner.type}` : ''}
                </p>
             </div>
          </div>
          <button onClick={onLogout}
            className="text-[#755533] hover:text-[#3E2C19] hover:bg-stone-100 text-sm font-medium px-4 py-2 rounded-xl border border-transparent transition-all">
            {pT(lang, 'Logout')}
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 space-y-6 mt-6">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-3 sm:gap-6">
          <SummaryCard icon={<DollarSign className="w-5 h-5 text-[#149372]" />} label={pT(lang, 'Total')} value={fmtCurrency(summary.totalCommissions)} color="amber" />
          <SummaryCard icon={<CheckCircle className="w-5 h-5 text-[#149372]" />} label={pT(lang, 'Paid')} value={fmtCurrency(summary.paidCommissions)} color="emerald" />
          <SummaryCard icon={<Clock className="w-5 h-5 text-[#149372]" />} label={pT(lang, 'Pending')} value={fmtCurrency(summary.pendingCommissions)} color="amber" />
        </div>

        {/* Agreement Info */}
        {agreement && (
          <div className="bg-white rounded-2xl border border-[#e1d5c3] p-5 shadow-sm">
            <h2 className="text-[15px] font-bold text-[#3E2C19] mb-4 tracking-tight">{pT(lang, 'ActiveAgreement')}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#f9f4ea] border border-[#e1d5c3] rounded-xl p-4">
                <p className="text-xs font-semibold text-[#8c673d] uppercase tracking-wide">{pT(lang, 'Commission')}</p>
                <p className="text-2xl font-black text-[#3E2C19] mt-0.5">
                  {agreement.commission_value}{agreement.commission_type === 'Percentage' ? '%' : ''}
                </p>
              </div>
              {agreement.client_discount_value != null && agreement.client_discount_value > 0 && (
                <div className="bg-[#dcefe9] border border-orange-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-[#149372] uppercase tracking-wide">{pT(lang, 'ClientDiscount')}</p>
                  <p className="text-2xl font-black text-[#149372] mt-0.5">
                    {agreement.client_discount_value}{agreement.client_discount_type === 'Percentage' ? '%' : ''}
                  </p>
                </div>
              )}
            </div>
            {agreement.valid_until && (
              <p className="text-xs font-medium text-[#755533] mt-3 flex items-center gap-1.5 bg-[#f9f4ea] p-2 rounded-lg inline-flex">
                <Clock className="w-4 h-4 text-[#8C6B45]" />
                {pT(lang, 'ValidUntil', { date: fmtDate(agreement.valid_until) })}
              </p>
            )}
          </div>
        )}

        {/* Referrals */}
        <div className="bg-white rounded-2xl border border-[#e1d5c3] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-bold text-[#3E2C19] flex items-center gap-2">
              <Users className="w-5 h-5 text-[#149372]" /> {pT(lang, 'Referrals')} ({summary.totalReferrals})
            </h2>
            <div className="flex gap-2 text-[13px] font-semibold bg-[#f9f4ea] px-3 py-1.5 rounded-lg border border-[#e1d5c3]">
              <span className="text-[#149372]">{summary.validatedReferrals} {pT(lang, 'Validated')}</span>
              <span className="text-[#a48866]">|</span>
              <span className="text-[#149372]">{summary.pendingReferrals} {pT(lang, 'Pending')}</span>
            </div>
          </div>

          {referrals.length === 0 ? (
            <div className="text-center py-10 bg-[#f9f4ea] rounded-xl border border-[#e1d5c3] border-dashed">
              <p className="text-sm font-medium text-[#755533]">{pT(lang, 'NoReferrals')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedReferrals.map(r => (
                <div key={r.id} onClick={() => setSelectedReferral(r)} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white border border-[#e1d5c3] rounded-xl p-4 gap-3 sm:gap-0 hover:border-[#d2c2ad] hover:shadow-sm transition-all cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-[#3E2C19] truncate">{pT(lang, 'TotalBill')}: {fmtCurrency(r.revenue_generated)}</p>
                    <p className="text-[13px] font-medium text-[#755533] mt-0.5">{fmtDate(r.arrival_date)} · {r.party_size} pax</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 sm:ml-4 justify-between sm:justify-end">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusBadge(r.status)}`}>
                      {statusIcon(r.status)} {r.status}
                    </span>
                    <span className="text-lg font-black text-[#3E2C19] w-24 text-right">{fmtCurrency(r.commission_value)}</span>
                  </div>
                </div>
              ))}
              {referrals.length > 5 && (
                <button onClick={() => setShowAllReferrals(!showAllReferrals)}
                  className="w-full py-3 text-[13px] font-bold text-[#149372] bg-[#dcefe9] hover:bg-[#cbf0e6] rounded-xl flex items-center justify-center gap-1.5 transition-colors mt-2">
                  {showAllReferrals ? <><ChevronUp className="w-4 h-4" /> {pT(lang, 'ShowLess')}</> : <><ChevronDown className="w-4 h-4" /> {pT(lang, 'ShowMore', { n: String(referrals.length) })}</>}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Payouts */}
        <div className="bg-white rounded-2xl border border-[#e1d5c3] p-5 shadow-sm">
          <h2 className="text-[15px] font-bold text-[#3E2C19] flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-[#149372]" /> {pT(lang, 'PayoutHistory')} ({payouts.length})
          </h2>

          {payouts.length === 0 ? (
            <div className="text-center py-10 bg-[#f9f4ea] rounded-xl border border-[#e1d5c3] border-dashed">
               <p className="text-sm font-medium text-[#755533]">{pT(lang, 'NoPayouts')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedPayouts.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => setSelectedPayout(p)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between bg-white border border-[#e1d5c3] rounded-xl p-4 gap-3 sm:gap-0 hover:border-[#d2c2ad] hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-[#3E2C19]">{p.period}</p>
                    <p className="text-[13px] font-medium text-[#755533] mt-0.5">
                      {p.payment_date ? fmtDate(p.payment_date) : pT(lang, 'Pending')}
                      {p.reference_number ? ` · Ref: ${p.reference_number}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 sm:ml-4 justify-between sm:justify-end">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusBadge(p.status)}`}>
                      {statusIcon(p.status)} {p.status}
                    </span>
                    <span className="text-lg font-black text-[#3E2C19] w-24 text-right">{fmtCurrency(p.amount)}</span>
                  </div>
                </div>
              ))}
              {payouts.length > 5 && (
                <button onClick={() => setShowAllPayouts(!showAllPayouts)}
                  className="w-full py-3 text-[13px] font-bold text-[#149372] bg-[#dcefe9] hover:bg-[#cbf0e6] rounded-xl flex items-center justify-center gap-1.5 transition-colors mt-2">
                  {showAllPayouts ? <><ChevronUp className="w-4 h-4" /> {pT(lang, 'ShowLess')}</> : <><ChevronDown className="w-4 h-4" /> {pT(lang, 'ShowMore', { n: String(payouts.length) })}</>}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[12px] font-medium text-[#a48866] pt-4 pb-8">
          {pT(lang, 'FooterInfo')}
        </p>
      </div>

      {/* Modal Breakdown */}
      {selectedReferral && (
        <div className="fixed inset-0 bg-[#3E2C19]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#f9f4ea] rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-[#e1d5c3]">
            {/* Header */}
            <div className="bg-white px-6 py-5 border-b border-[#e1d5c3] flex justify-between items-center sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#dcefe9] flex items-center justify-center border border-[#149372]/20">
                  <DollarSign className="w-5 h-5 text-[#149372]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#3E2C19]">{pT(lang, 'TransactionDetails')}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-medium text-[#755533] uppercase tracking-wider">{pT(lang, 'TransactionRef')}</span>
                    <span className="text-xs font-mono bg-[#fefaf0] px-1.5 py-0.5 rounded text-[#8c673d] border border-[#ede0c9]">{selectedReferral.id.split('-')[0]}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedReferral(null)}
                className="p-2 text-[#a48866] hover:bg-[#fefaf0] rounded-full transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 sm:p-8 space-y-6 bg-[#fbf5e6] max-h-[80vh] overflow-y-auto">
              {/* Revenue Header */}
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-[#e1d5c3] shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-[#8c673d] text-sm font-semibold uppercase tracking-wider">{pT(lang, 'BaseRevenue')}</div>
                    {(() => {
                        let compositeStatus = pT(lang, 'Pending');
                        let colorClass = 'bg-[#fefaf0] text-[#a48866] border-[#ede0c9]';
                        if (selectedReferral.status === 'Cancelled') {
                            compositeStatus = pT(lang, 'Cancelled');
                            colorClass = 'bg-red-100 text-red-700 border-red-200';
                        } else if (selectedReferral.payout_id) {
                            if (selectedReferral.partner_payout?.status === 'Paid') {
                                compositeStatus = pT(lang, 'Paid');
                                colorClass = 'bg-[#dcefe9] text-[#149372] border-[#149372]/30';
                            } else {
                                compositeStatus = pT(lang, 'InPayout');
                                colorClass = 'bg-[#f0f7ff] text-[#0369a1] border-[#bae6fd]';
                            }
                        }
                        return <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider ${colorClass}`}>{compositeStatus}</span>;
                    })()}
                  </div>
                  <div className="text-[#a48866] text-sm font-medium">{selectedReferral.party_size} pax · {fmtDate(selectedReferral.arrival_date)}</div>
                </div>
                <div className="text-3xl sm:text-4xl font-black text-[#3E2C19] tabular-nums whitespace-nowrap">
                  {fmtCurrency(selectedReferral.revenue_generated)} <span className="text-xl sm:text-2xl font-semibold text-[#8c673d]">đ</span>
                </div>
              </div>

              {/* Partner Card */}
              <div className="bg-white p-5 rounded-2xl border border-[#e1d5c3] flex flex-col gap-3 shadow-sm">
                <div className="flex justify-between items-start sm:items-center pb-3 border-b border-[#f9f4ea]">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="w-2 h-2 rounded-full bg-[#149372]"></div>
                      <span className="text-xs font-bold text-[#8c673d] uppercase tracking-wider">{partner.name}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    {selectedReferral.payout_id ? (
                        selectedReferral.partner_payout?.status === 'Paid' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-[#dcefe9] text-[#149372] border border-[#149372]/30 uppercase tracking-wider"><CheckCircle className="w-3 h-3"/> {pT(lang, 'Paid')}</span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-[#fefaf0] text-[#a48866] border border-[#ede0c9] uppercase tracking-wider">{pT(lang, 'Processing')}</span>
                        )
                    ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-stone-100 text-[#a48866] border border-[#e1d5c3] uppercase tracking-wider">{pT(lang, 'NoPayout')}</span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-[#755533] font-medium">{pT(lang, 'GrossCommission')}</span>
                  <span className="font-semibold text-[#3E2C19] tabular-nums whitespace-nowrap">
                    {fmtCurrency(partner.issues_vat_invoice === true ? selectedReferral.commission_value : selectedReferral.commission_value / 0.9)} đ
                  </span>
                </div>
                {partner.issues_vat_invoice !== true && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-rose-600 font-medium flex items-center gap-2">
                      {pT(lang, 'PITDeduction')} <span className="text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md font-bold border border-rose-100 tracking-wider">10%</span>
                    </span>
                    <span className="font-semibold text-rose-600 tabular-nums whitespace-nowrap">
                      -{fmtCurrency((selectedReferral.commission_value / 0.9) - selectedReferral.commission_value)} đ
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 mt-1 border-t border-[#f9f4ea]">
                  <span className="text-sm font-bold text-[#3E2C19]">{pT(lang, 'NetCommission')}</span>
                  <span className="font-black text-[#149372] text-xl tabular-nums whitespace-nowrap">
                    {fmtCurrency(selectedReferral.commission_value)} <span className="text-sm font-semibold text-[#149372]/70">đ</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAYOUT MODAL */}
      {selectedPayout && (
        <div className="fixed inset-0 bg-[#3E2C19]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#fcfaf7] rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 border border-[#e1d5c3]">
            
            {/* Header */}
            <div className="p-6 sm:p-8 bg-white border-b border-[#e1d5c3] rounded-t-3xl relative">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#fefaf0] border border-[#ede0c9] flex items-center justify-center">
                      {selectedPayout.status === 'Paid' ? <CheckCircle className="w-6 h-6 text-[#149372]" /> : <Clock className="w-6 h-6 text-[#a48866]" />}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-[#3E2C19] tabular-nums">
                        {fmtCurrency(selectedPayout.amount)} <span className="text-lg font-semibold text-[#8c673d]">đ</span>
                      </h3>
                      <p className={`text-xs font-bold mt-1 uppercase tracking-wider ${
                        selectedPayout.status === 'Paid' ? 'text-[#149372]' : 'text-[#a48866]'
                      }`}>
                        {selectedPayout.status === 'Paid' ? pT(lang, 'Paid') : pT(lang, 'Processing')}
                      </p>
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedPayout(null)} className="p-2 hover:bg-[#f9f4ea] rounded-xl transition text-[#a38562]">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 sm:p-8 space-y-6">
              <div className="bg-white rounded-2xl border border-[#e1d5c3] p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b border-[#f9f4ea] pb-3">
                  <span className="text-sm font-medium text-[#755533]">{pT(lang, 'Period')}</span>
                  <span className="text-sm font-bold text-[#3E2C19]">
                    {selectedPayout.period.split('-')[1]}/{selectedPayout.period.split('-')[0]}
                  </span>
                </div>
                {agreement && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-[#755533]">Commission Rate</span>
                    <span className="text-sm font-bold text-[#3E2C19]">
                      {agreement.commission_value}{agreement.commission_type === 'Percentage' ? '%' : ' đ'}
                    </span>
                  </div>
                )}
              </div>

              {selectedPayout.notes && (
                <div>
                  <h4 className="text-[11px] font-bold text-[#8c673d] uppercase tracking-wider mb-2">{pT(lang, 'Notes')}</h4>
                  <p className="text-sm text-[#3E2C19] bg-white p-4 rounded-xl border border-[#e1d5c3]">
                    {selectedPayout.notes}
                  </p>
                </div>
              )}

              {/* Referrals Table */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold text-[#8c673d] uppercase tracking-wider">Transactions Included</h4>
                <div className="bg-white rounded-2xl border border-[#e1d5c3] overflow-x-auto shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-[#fefaf0] border-b border-[#e1d5c3]">
                      <tr className="text-[11px] font-bold text-[#8c673d] uppercase tracking-wider">
                        <th className="p-4">Ref</th>
                        <th className="p-4">Date</th>
                        <th className="p-4">Pax</th>
                        <th className="p-4 text-right">Total Bill</th>
                        <th className="p-4 text-right">Rate %</th>
                        <th className="p-4 text-right">Gross Comm.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f9f4ea]">
                      {referrals.filter(r => r.payout_id === selectedPayout.id).map(r => {
                        const gross = partner.issues_vat_invoice === true ? r.commission_value : r.commission_value / 0.9
                        const pct = r.revenue_generated > 0 ? (gross / r.revenue_generated) * 100 : 0
                        const displayRate = pct % 1 === 0 ? pct.toFixed(0) + '%' : pct.toFixed(1) + '%'

                        return (
                          <tr key={r.id} className="text-sm hover:bg-[#fefaf0] transition-colors">
                            <td className="p-4 font-mono text-xs text-[#a48866] uppercase">{r.id.split('-')[0]}</td>
                            <td className="p-4 text-[#3E2C19] whitespace-nowrap">{r.arrival_date ? new Date(r.arrival_date).toLocaleDateString('en-GB') : new Date(r.created_at).toLocaleDateString('en-GB')}</td>
                            <td className="p-4 font-bold text-[#3E2C19]">{r.party_size}</td>
                            <td className="p-4 text-right text-[#3E2C19] whitespace-nowrap">{fmtCurrency(r.revenue_generated)} đ</td>
                            <td className="p-4 text-right font-semibold text-[#a48866] whitespace-nowrap">{displayRate}</td>
                            <td className="p-4 text-right font-black text-[#149372] whitespace-nowrap">
                              {fmtCurrency(gross)} đ
                            </td>
                          </tr>
                        )
                      })}
                      {referrals.filter(r => r.payout_id === selectedPayout.id).length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-sm font-medium text-[#a48866]">
                            No transactions found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              {partner.issues_vat_invoice !== true && (() => {
                const payoutReferrals = referrals.filter(r => r.payout_id === selectedPayout.id)
                const netSum = payoutReferrals.reduce((sum, r) => sum + Number(r.commission_value || 0), 0)
                const pitWasDeducted = Math.abs(selectedPayout.amount - netSum) < 10

                return (
                  <div className="bg-[#fefaf0] rounded-2xl border border-[#ede0c9] p-5 space-y-3 mt-6 animate-in fade-in duration-200">
                    {pitWasDeducted ? (
                      <>
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-medium text-[#755533]">{pT(lang, 'GrossCommission')}</span>
                          <span className="font-bold text-[#3E2C19]">{fmtCurrency(selectedPayout.amount / 0.9)} đ</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-medium text-rose-600 flex items-center gap-2">
                            {pT(lang, 'PITDeduction')} <span className="text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md font-bold border border-rose-100 tracking-wider">10%</span>
                          </span>
                          <span className="font-bold text-rose-600">-{fmtCurrency((selectedPayout.amount / 0.9) - selectedPayout.amount)} đ</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-medium text-[#755533]">{pT(lang, 'GrossCommission')}</span>
                          <span className="font-bold text-[#3E2C19]">{fmtCurrency(selectedPayout.amount)} đ</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-medium text-stone-500 flex items-center gap-2">
                            {pT(lang, 'PITDeduction')} <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-md font-bold border border-stone-200 tracking-wider">0%</span>
                          </span>
                          <span className="font-bold text-stone-500">0 đ</span>
                        </div>
                        <div className="text-[11px] text-amber-800 bg-[#eedebf] p-2 rounded-lg border border-[#ede0c9] mt-1 font-semibold leading-normal">
                          {pT(lang, 'PitNotDeductedBelowThreshold')}
                        </div>
                      </>
                    )}
                    <div className="flex justify-between items-center text-sm pt-3 mt-1 border-t border-[#ede0c9]">
                      <span className="font-bold text-[#3E2C19]">{pT(lang, 'NetCommission')}</span>
                      <span className="font-black text-[#149372] text-lg">{fmtCurrency(selectedPayout.amount)} đ</span>
                    </div>
                  </div>
                )
              })()}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Summary Card ── */
function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    amber: 'bg-[#fefaf0] border-[#ede0c9]',
    emerald: 'bg-[#f4faf8] border-[#c1e8dd]',
  }
  return (
    <div className={`${colorMap[color]} shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)] border rounded-2xl p-4 sm:p-5 flex flex-col items-center sm:items-start text-center sm:text-left`}>
      <div className="sm:hidden mb-2">{icon}</div>
      <div className="hidden sm:flex items-center gap-2 mb-3 bg-white p-1.5 rounded-lg border border-[#ede0c9] shadow-sm self-start">
         {icon} 
      </div>
      <p className="text-[11px] sm:text-[12px] font-bold uppercase tracking-wider text-[#8c673d]">{label}</p>
      <p className="text-xl sm:text-3xl font-black text-[#3E2C19] mt-1">{value}</p>
    </div>
  )
}
