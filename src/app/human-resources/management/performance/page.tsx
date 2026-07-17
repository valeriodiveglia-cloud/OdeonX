'use client'

import { useState, useEffect, useMemo, useCallback, Fragment, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { HRStaffPerformance, HRStaffMember, HRRatingCategory, HRReviewPeriod } from '@/types/human-resources'
import { saveAs } from 'file-saver'

export type AppAccount = {
    id: string
    user_id?: string | null
    email: string
    phone: string | null
    name: string | null
    position: string | null
    role: 'owner' | 'admin' | 'staff' | 'manager'
    is_active: boolean
    created_at: string
}

import CircularLoader from '@/components/CircularLoader'
import { getCurrentUserPermissions } from '@/lib/user-branches'
import { useSettings } from '@/contexts/SettingsContext'
import {
    Star, Plus, Search, X, Pencil, Trash2,
    TrendingUp, TrendingDown, User, ChevronLeft, ChevronRight, FileDown, MoreVertical, Building2,
    ArrowUp, ArrowDown, Filter
} from 'lucide-react'

/* ─── Helpers ─── */
const fmtDate = (dStr: string | null | undefined) => {
    if (!dStr) return '—'
    try {
        const d = new Date(dStr)
        if (isNaN(d.getTime())) return '—'
        const day = String(d.getDate()).padStart(2, '0')
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const year = d.getFullYear()
        return `${day}/${month}/${year}`
    } catch {
        return '—'
    }
}

/* ═══════════════════════════════════════════════════════════
   Rating categories are now loaded dynamically from
   hr_rating_categories table via Settings page.
   ═══════════════════════════════════════════════════════════ */

import PerformanceModal, { OVERALL_LABELS, RatingStars, computePeriodLabel, computeAverage } from '@/components/human-resources/PerformanceModal'

const getOverallLabelTranslated = (rating: number, lang: string) => {
    const label = OVERALL_LABELS[rating]?.label || '';
    if (lang === 'vi') {
        switch (rating) {
            case 1: return 'Kém';
            case 2: return 'Dưới trung bình';
            case 3: return 'Trung bình';
            case 4: return 'Tốt';
            case 5: return 'Xuất sắc';
            default: return label;
        }
    }
    return label;
}

function localizePeriodLabel(label: string, lang: string): string {
    if (lang !== 'vi' || !label) return label;
    
    const monthsEn = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    for (let i = 0; i < monthsEn.length; i++) {
        if (label.startsWith(monthsEn[i])) {
            const yearPart = label.slice(monthsEn[i].length).trim();
            return `Tháng ${i + 1}${yearPart ? ' năm ' + yearPart : ''}`;
        }
    }
    
    const qMatch = label.match(/^Q([1-4])\s+(\d{4})$/);
    if (qMatch) {
        return `Quý ${qMatch[1]} năm ${qMatch[2]}`;
    }
    
    const hMatch = label.match(/^H([1-2])\s+(\d{4})$/);
    if (hMatch) {
        return `Nửa năm ${hMatch[1]} năm ${hMatch[2]}`;
    }
    
    const monthAbbrs = {
        'Jan': 'thg 1', 'Feb': 'thg 2', 'Mar': 'thg 3', 'Apr': 'thg 4',
        'May': 'thg 5', 'Jun': 'thg 6', 'Jul': 'thg 7', 'Aug': 'thg 8',
        'Sep': 'thg 9', 'Oct': 'thg 10', 'Nov': 'thg 11', 'Dec': 'thg 12'
    };
    
    let localized = label;
    Object.entries(monthAbbrs).forEach(([en, vi]) => {
        const regex = new RegExp(`\\b${en}\\b`, 'g');
        localized = localized.replace(regex, vi);
    });
    
    if (localized !== label && / \d{4}$/.test(localized)) {
        localized = localized.replace(/ (\d{4})$/, ' năm $1');
    }
    
    return localized;
}

const translateCategoryKey = (key: string, lang: string) => {
    if (lang !== 'vi') {
        return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    switch (key) {
        case 'job_knowledge':
            return 'Kiến thức công việc';
        case 'quality_of_work':
            return 'Chất lượng công việc';
        case 'productivity':
            return 'Năng suất làm việc';
        case 'dependability':
            return 'Độ tin cậy';
        case 'attendance_punctuality':
        case 'attendance_and_punctuality':
            return 'Chuyên cần & Đúng giờ';
        case 'communication_skills':
            return 'Kỹ năng giao tiếp';
        case 'initiative':
            return 'Sự chủ động';
        case 'cooperation_teamwork':
        case 'cooperation_and_teamwork':
            return 'Hợp tác & Làm việc nhóm';
        default:
            return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
}

interface SelectStaffModalProps {
    open: boolean;
    onClose: () => void;
    onSelect: (staffId: string) => void;
    staffList: any[];
    title?: string;
    subtitle?: string;
}

function SelectStaffModal({ open, onClose, onSelect, staffList, title, subtitle }: SelectStaffModalProps) {
    const { language } = useSettings()
    const [search, setSearch] = useState('')
    
    if (!open) return null

    const displayTitle = title || (language === 'vi' ? 'Chọn nhân viên' : 'Select Staff')
    const displaySubtitle = subtitle || (language === 'vi' ? 'Tìm kiếm và chọn một nhân viên đang hoạt động để đánh giá.' : 'Search and select an active staff member to review.')

    const filtered = staffList.filter(s => {
        const q = search.toLowerCase()
        return (
            (s.full_name || '').toLowerCase().includes(q) ||
            (s.position || '').toLowerCase().includes(q) ||
            (s.department || '').toLowerCase().includes(q)
        )
    })

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">{displayTitle}</h3>
                        <p className="text-sm text-gray-500 mt-1">{displaySubtitle}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition self-start">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-4 border-b border-gray-100 bg-slate-50 shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input type="text" placeholder={language === 'vi' ? 'Tìm kiếm theo tên, chức vụ hoặc bộ phận...' : 'Search by name, position or department...'} 
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                        />
                    </div>
                </div>

                <div className="overflow-y-auto p-2 flex-1 space-y-1">
                    {filtered.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">
                            {language === 'vi' ? 'Không tìm thấy nhân viên nào khớp với tìm kiếm của bạn.' : 'No staff found matching your search.'}
                        </div>
                    ) : (
                        filtered.map(s => (
                            <button key={s.id} type="button" onClick={() => onSelect(s.id)}
                                className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 transition flex items-center justify-between group">
                                <div>
                                    <div className="font-medium text-gray-900">{s.full_name}</div>
                                    <div className="text-sm text-gray-500 mt-0.5 flex items-center gap-2">
                                        <span>{s.position}</span>
                                        {s.department && (
                                            <>
                                                <span className="w-1 h-1 rounded-full bg-gray-300" />
                                                <span>{s.department}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                    <User className="w-4 h-4" />
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}


interface SelectAccountModalProps {
    open: boolean;
    onClose: () => void;
    onSelect: (accountId: string, accountName: string) => void;
    accountList: AppAccount[];
    title?: string;
    subtitle?: string;
}

function SelectAccountModal({ open, onClose, onSelect, accountList, title, subtitle }: SelectAccountModalProps) {
    const { language } = useSettings()
    const [search, setSearch] = useState('')
    
    if (!open) return null

    const displayTitle = title || (language === 'vi' ? 'Chọn tài khoản' : 'Select Account')
    const displaySubtitle = subtitle || (language === 'vi' ? 'Tìm kiếm và chọn một tài khoản đang hoạt động.' : 'Search and select an active account.')

    const filtered = accountList.filter(a => {
        if (!a.is_active) return false
        const q = search.toLowerCase()
        return (
            (a.name || '').toLowerCase().includes(q) ||
            (a.email || '').toLowerCase().includes(q) ||
            (a.role || '').toLowerCase().includes(q)
        )
    })

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md transition-all">
            <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full flex flex-col max-h-[85vh] border border-white/50 overflow-hidden ring-1 ring-black/5">
                <div className="flex items-start justify-between p-6 border-b border-gray-200/50 shrink-0 bg-white/50">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 tracking-tight">{displayTitle}</h3>
                        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{displaySubtitle}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100/80 rounded-full transition-all self-start">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-5 border-b border-gray-200/50 bg-gray-50/50 shrink-0">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                        </div>
                        <input type="text" placeholder={language === 'vi' ? 'Tìm kiếm theo tên, email hoặc vai trò...' : 'Search by name, email or role...'} 
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200/80 rounded-2xl text-sm text-gray-900 placeholder-gray-400 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all shadow-sm" 
                            autoFocus
                        />
                    </div>
                </div>

                <div className="overflow-y-auto p-3 flex-1">
                    {filtered.length === 0 ? (
                        <div className="text-center py-16 px-6">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                                <User className="w-8 h-8 text-gray-300" />
                            </div>
                            <h4 className="text-gray-900 text-base font-semibold mb-1">
                                {language === 'vi' ? 'Không tìm thấy tài khoản nào' : 'No accounts found'}
                            </h4>
                            <p className="text-gray-500 text-sm">
                                {language === 'vi' ? `Không tìm thấy ai khớp với "${search}".` : `We couldn't find anyone matching "${search}".`}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {filtered.map(acc => {
                                const initials = (acc.name || acc.email).substring(0, 2).toUpperCase()
                                const isOwner = acc.role === 'owner'
                                const isAdmin = acc.role === 'admin'
                                const isStaff = acc.role === 'staff'
                                
                                return (
                                    <button 
                                        key={acc.id} 
                                        type="button" 
                                        onClick={() => onSelect(acc.id, acc.name || acc.email)}
                                        className="w-full text-left p-3 rounded-2xl hover:bg-white focus:bg-white focus:ring-2 focus:ring-blue-500/20 active:scale-[0.98] transition-all flex items-center gap-4 group border border-transparent hover:border-gray-200/60 hover:shadow-sm"
                                    >
                                        <div className="relative shrink-0">
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-inner tracking-wider">
                                                {initials}
                                            </div>
                                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100">
                                                <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-gray-900 truncate">{acc.name || acc.email}</span>
                                                {isOwner && <span className="px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-bold uppercase tracking-wider border border-purple-100/50 shrink-0">{language === 'vi' ? 'Chủ sở hữu' : 'Owner'}</span>}
                                                {isAdmin && <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider border border-blue-100/50 shrink-0">{language === 'vi' ? 'Quản trị viên' : 'Admin'}</span>}
                                                {isStaff && <span className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-700 text-[10px] font-bold uppercase tracking-wider border border-gray-200/50 shrink-0">{language === 'vi' ? 'Nhân viên' : 'Staff'}</span>}
                                            </div>
                                            <div className="text-sm text-gray-500 mt-0.5 truncate flex items-center gap-2">
                                                <span className="truncate">{acc.email}</span>
                                                {acc.position && (
                                                    <>
                                                        <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0"></span>
                                                        <span className="truncate">{acc.position}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="w-8 h-8 rounded-full bg-blue-50/0 text-blue-600 flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:bg-blue-50 transition-all shrink-0">
                                            <svg className="w-4 h-4 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
 

/* ═══════════════════════════════════════════════════════
   Delete Confirm
   ═══════════════════════════════════════════════════════ */
function DeleteConfirm({ label, onConfirm, onCancel, deleting }: {
    label: string; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
    const { language } = useSettings()
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {language === 'vi' ? 'Xóa đánh giá' : 'Delete Review'}
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                    {language === 'vi' ? (
                        <>Bạn có chắc chắn muốn xóa đánh giá cho <strong>{label}</strong> không? Không thể hoàn tác hành động này.</>
                    ) : (
                        <>Are you sure you want to delete the review for <strong>{label}</strong>? This cannot be undone.</>
                    )}
                </p>
                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                        {language === 'vi' ? 'Hủy' : 'Cancel'}
                    </button>
                    <button onClick={onConfirm} disabled={deleting}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2">
                        {deleting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {language === 'vi' ? 'Xóa' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ═══════════════════════════════════════════════════════
   Expandable Row Detail – shows category breakdown
   ═══════════════════════════════════════════════════════ */
function CategoryBreakdown({ ratings }: { ratings: Record<string, number> }) {
    const { language } = useSettings()
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2 px-4 py-3 bg-gray-50/50">
            {Object.entries(ratings).map(([key, val]) => {
                if (val === 0) return null
                return (
                    <div key={key} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-500 truncate">{translateCategoryKey(key, language)}</span>
                        <div className="flex items-center gap-1 shrink-0">
                            <RatingStars rating={val} />
                            <span className="text-xs font-semibold text-gray-600 w-3 text-right">{val}</span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */
function getPeriodDates(periodType: string, dateStr: string, offset: number): { start: Date, end: Date } {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return { start: new Date(), end: new Date() };
    const [y, m, day] = parts.map(Number);
    let d = new Date(y, m - 1, day);
    const type = periodType.toLowerCase();

    if (type.includes('daily') || type.includes('giornal')) {
        d.setDate(d.getDate() + offset);
        const start = new Date(d); start.setHours(0,0,0,0);
        const end = new Date(d); end.setHours(23,59,59,999);
        return { start, end };
    }
    if (type.includes('week') || type.includes('settiman')) {
        d.setDate(d.getDate() + offset * 7);
        const dayOfWeek = d.getDay();
        const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const start = new Date(d.getFullYear(), d.getMonth(), diff);
        const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
        return { start, end };
    }
    if (type.includes('month') || type.includes('mensil')) {
        d.setMonth(d.getMonth() + offset);
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start, end };
    }
    if (type.includes('quarter') || type.includes('trimestr')) {
        d.setMonth(d.getMonth() + offset * 3);
        const q = Math.floor(d.getMonth() / 3);
        const start = new Date(d.getFullYear(), q * 3, 1);
        const end = new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
        return { start, end };
    }
    if (type.includes('semi-annual') || type.includes('semestr')) {
        d.setMonth(d.getMonth() + offset * 6);
        const h = Math.floor(d.getMonth() / 6);
        const start = new Date(d.getFullYear(), h * 6, 1);
        const end = new Date(d.getFullYear(), h * 6 + 6, 0, 23, 59, 59, 999);
        return { start, end };
    }
    if (type.includes('annual') || type.includes('annua')) {
        d.setFullYear(d.getFullYear() + offset);
        const start = new Date(d.getFullYear(), 0, 1);
        const end = new Date(d.getFullYear(), 12, 0, 23, 59, 59, 999);
        return { start, end };
    }
    return { start: d, end: d };
}

const BranchCell = ({ branchNames }: { branchNames: string[] }) => {
    const { language } = useSettings()
    const [isExpanded, setIsExpanded] = useState(false)
    if (branchNames.length === 0) return <span className="text-[11px] text-slate-400 italic">—</span>
    
    if (branchNames.length <= 2 || isExpanded) {
        return (
            <div className="flex flex-wrap gap-1">
                {branchNames.map((name, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200/80 bg-slate-50 text-[10px] font-semibold text-slate-500">
                        <Building2 className="w-2.5 h-2.5 text-slate-400" />
                        {name}
                    </span>
                ))}
                {isExpanded && branchNames.length > 2 && (
                    <button onClick={(e) => { e.stopPropagation(); setIsExpanded(false) }} className="text-[9px] font-bold text-blue-600 hover:text-blue-700 ml-1">
                        {language === 'vi' ? 'Thu gọn' : 'Show less'}
                    </button>
                )}
            </div>
        )
    }

    return (
        <div className="flex flex-wrap gap-1 items-center">
            {branchNames.slice(0, 2).map((name, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200/80 bg-slate-50 text-[10px] font-semibold text-slate-500">
                    <Building2 className="w-2.5 h-2.5 text-slate-400" />
                    {name}
                </span>
            ))}
            <button 
                onClick={(e) => { e.stopPropagation(); setIsExpanded(true) }}
                className="inline-flex items-center px-1.5 py-0.5 rounded border border-blue-200/80 bg-blue-50 text-[10px] font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
            >
                +{branchNames.length - 2} {language === 'vi' ? 'thêm' : 'more'}
            </button>
        </div>
    )
}

/* ═══════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════ */
export default function PerformancePage() {
    const { hrReviewFrequency, language } = useSettings()
    
    const [loading, setLoading]       = useState(true)
    const [reviews, setReviews]       = useState<(HRStaffPerformance & { hr_staff: HRStaffMember })[]>([])
    const [staffList, setStaffList]   = useState<(HRStaffMember & { termination_date?: string | null; hr_staff_branches?: any[] })[]>([])
    const [accountList, setAccountList] = useState<AppAccount[]>([])
    const [allCategories, setAllCategories] = useState<HRRatingCategory[]>([])
    const [branchMap, setBranchMap]   = useState<Record<string, string>>({})
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
    const [currentUserBranches, setCurrentUserBranches] = useState<string[] | null>(null)
    
    const [periodOffset, setPeriodOffset] = useState(0)
    const today = new Date().toISOString().slice(0, 10)
    const activePeriodLabel = useMemo(() => computePeriodLabel(hrReviewFrequency, today, periodOffset), [hrReviewFrequency, today, periodOffset])

    const [search, setSearch]         = useState('')
    const [expandedId, setExpandedId]     = useState<string | null>(null)

    const [isStaffSelectOpen, setStaffSelectOpen] = useState(false)
    const [preselectedStaffForNew, setPreselectedStaffForNew] = useState<string | null>(null)
    const [modalOpen, setModalOpen]       = useState(false)
    const [editingReview, setEditingReview] = useState<HRStaffPerformance | null>(null)
    const [saving, setSaving]             = useState(false)

    const [isAssignSelectOpen, setAssignSelectOpen] = useState(false)
    const [assigningForId, setAssigningForId] = useState<string | null>(null)

    const [sortKey, setSortKey] = useState<string>('')
    const [sortAsc, setSortAsc] = useState<boolean>(true)
    const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({})
    const [openMenu, setOpenMenu] = useState<string | null>(null)

    const dict = {
        sortAsc: language === 'vi' ? 'Sắp xếp tăng dần' : 'Sort ascending',
        sortDesc: language === 'vi' ? 'Sắp xếp giảm dần' : 'Sort descending',
        selectAll: language === 'vi' ? 'Chọn tất cả' : 'Select all',
        deselectAll: language === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect all',
        filterPlaceholder: language === 'vi' ? 'Tìm kiếm...' : 'Search...',
        clearFilters: language === 'vi' ? 'Xóa bộ lọc' : 'Clear filters',
        empty: language === 'vi' ? 'Rỗng' : 'Empty'
    }

    const applySort = (key: string, isAsc?: boolean) => {
        if (isAsc !== undefined) {
            setSortKey(key)
            setSortAsc(isAsc)
        } else {
            if (sortKey === key) {
                setSortAsc(!sortAsc)
            } else {
                setSortKey(key)
                setSortAsc(true)
            }
        }
    }

    const applyColumnFilter = (key: string, values: Set<string> | null) => {
        setColumnFilters(prev => {
            const next = { ...prev }
            if (values) next[key] = values; else delete next[key]
            return next
        })
    }

    const clearColumnFilter = (key: string) => {
        setColumnFilters(prev => {
            const next = { ...prev }
            delete next[key]
            return next
        })
    }

    const [deletingId, setDeletingId]     = useState<string | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [exportLoading, setExportLoading] = useState(false)

    const previousGoalsForModal = useMemo(() => {
        const staffId = editingReview ? editingReview.staff_id : preselectedStaffForNew;
        if (!staffId) return undefined;
        
        // Find all reviews for this staff member, sorted by date desc
        const staffReviews = [...reviews]
            .filter(r => r.staff_id === staffId)
            .sort((a, b) => new Date(b.review_date).getTime() - new Date(a.review_date).getTime());
            
        if (!editingReview) {
            return staffReviews.length > 0 ? staffReviews[0].goals || undefined : undefined;
        }
        
        const idx = staffReviews.findIndex(r => r.id === editingReview.id);
        if (idx >= 0 && idx + 1 < staffReviews.length) {
            return staffReviews[idx + 1].goals || undefined;
        }
        return undefined;
    }, [editingReview, preselectedStaffForNew, reviews]);

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            let userRole = currentUserRole
            let userBranches = currentUserBranches
            if (!userRole) {
                const perms = await getCurrentUserPermissions()
                userRole = perms.role
                userBranches = perms.branches
                setCurrentUserRole(userRole)
                setCurrentUserBranches(userBranches)
            }

            const [staffRes, reviewRes, catRes, accRes, historyRes, branchRes] = await Promise.all([
                supabase.from('hr_staff').select('*, hr_staff_branches(*)').order('full_name'),
                supabase.from('hr_staff_performance').select('*, hr_staff(*)').order('review_date', { ascending: false }),
                supabase.from('hr_rating_categories').select('*').order('sort_order'),
                supabase.from('app_accounts').select('*').order('name'),
                supabase.from('hr_staff_role_history').select('*').order('effective_date', { ascending: false }).order('created_at', { ascending: false }),
                supabase.from('provider_branches').select('id, name')
            ])
            if (branchRes.data) {
                let branchData = branchRes.data
                if (userRole && !['owner', 'admin'].includes(userRole) && userBranches) {
                    branchData = branchData.filter((b: any) => userBranches.includes(b.id))
                }
                const map: Record<string, string> = {}
                branchData.forEach((b: any) => {
                    map[b.id] = b.name
                })
                setBranchMap(map)
            }
            if (staffRes.data) {
                let filteredStaff = staffRes.data
                if (userRole && !['owner', 'admin'].includes(userRole) && userBranches) {
                    filteredStaff = filteredStaff.filter(s =>
                        (s.hr_staff_branches || []).some((sb: any) => userBranches.includes(sb.branch_id))
                    )
                }

                const allowedStaffIds = new Set(filteredStaff.map(s => s.id))

                const staffWithDeparture = filteredStaff.map(s => {
                    let termination_date = null
                    if (s.status !== 'active' && historyRes.data) {
                        const leaveEvent = historyRes.data.find(h => h.staff_id === s.id && String(h.reason).match(/^\[(RESIGNATION|DISMISSAL|REJECTION)\]/i))
                        if (leaveEvent) {
                            termination_date = leaveEvent.effective_date
                        }
                    }
                    return { ...s, termination_date }
                })
                setStaffList(staffWithDeparture)

                if (reviewRes.data) {
                    let filteredReviews = reviewRes.data
                    if (userRole && !['owner', 'admin'].includes(userRole) && userBranches) {
                        filteredReviews = filteredReviews.filter(r => allowedStaffIds.has(r.staff_id))
                    }
                    setReviews(filteredReviews as any)
                }
            }
            if (catRes.data) setAllCategories(catRes.data as HRRatingCategory[])
            if (accRes.data) setAccountList(accRes.data as AppAccount[])
        } catch (err) { console.error(err) }
        setLoading(false)
    }, [currentUserRole, currentUserBranches])

    useEffect(() => { fetchAll() }, [fetchAll])

    const { end: periodEnd } = useMemo(() => getPeriodDates(hrReviewFrequency, today, periodOffset), [hrReviewFrequency, today, periodOffset])
    const periodEndStr = periodEnd.toISOString().slice(0, 10)

    const columnValues = useMemo(() => {
        const out: Record<string, string[]> = {
            staff: [],
            branch: [],
            date: [],
            rating: [],
            reviewer: []
        }
        staffList.forEach(s => {
            const review = reviews.find(r => r.staff_id === s.id && r.period === activePeriodLabel)
            
            if (s.start_date && s.start_date > periodEndStr) return
            if (s.employment_type === 'outsourced' && !review) return
            if (s.status !== 'active') {
                if (!review) {
                    if (!s.termination_date) return
                    if (s.termination_date < periodEndStr) return
                }
            }

            const staffName = s.full_name || ''
            if (staffName && !out.staff.includes(staffName)) {
                out.staff.push(staffName)
            }

            const bNames = (s.hr_staff_branches || []).map((sb: any) => branchMap[sb.branch_id]).filter(Boolean)
            bNames.forEach((bn: string) => {
                if (bn && !out.branch.includes(bn)) {
                    out.branch.push(bn)
                }
            })

            if (review) {
                const dStr = fmtDate(review.review_date)
                if (dStr && !out.date.includes(dStr)) {
                    out.date.push(dStr)
                }
                
                const avg = computeAverage(review.category_ratings || {})
                const overallRounded = Math.round(avg) || review.rating || 0
                const rLabel = getOverallLabelTranslated(overallRounded, language)
                const ratingStr = `${overallRounded} — ${rLabel}`
                if (ratingStr && !out.rating.includes(ratingStr)) {
                    out.rating.push(ratingStr)
                }

                const reviewer = accountList.find(a => a.id === review.reviewer_id)
                const revName = review.reviewer_name || (reviewer ? (reviewer.name || reviewer.email) : (language === 'vi' ? 'Hệ thống' : 'System'))
                if (revName && !out.reviewer.includes(revName)) {
                    out.reviewer.push(revName)
                }
            } else {
                const pendingStr = language === 'vi' ? 'Chưa đánh giá' : 'Pending'
                if (!out.rating.includes(pendingStr)) {
                    out.rating.push(pendingStr)
                }
                const noneStr = '—'
                if (!out.reviewer.includes(noneStr)) {
                    out.reviewer.push(noneStr)
                }
            }
        })
        Object.keys(out).forEach(k => out[k].sort())
        return out
    }, [staffList, reviews, activePeriodLabel, periodEndStr, branchMap, language, accountList])

    const filteredStaff = useMemo(() => {
        let out = staffList.filter(s => {
            const review = reviews.find(r => r.staff_id === s.id && r.period === activePeriodLabel)
            
            if (s.start_date && s.start_date > periodEndStr) return false
            if (s.employment_type === 'outsourced' && !review) return false
            if (s.status !== 'active') {
                if (!review) {
                    if (!s.termination_date) return false
                    if (s.termination_date < periodEndStr) return false
                }
            }

            if (search) {
                const q = search.toLowerCase()
                if (!s.full_name?.toLowerCase().includes(q) && !s.position?.toLowerCase().includes(q)) return false
            }

            if (columnFilters['staff'] && columnFilters['staff'].size > 0) {
                if (!columnFilters['staff'].has(s.full_name || '')) return false
            }

            if (columnFilters['branch'] && columnFilters['branch'].size > 0) {
                const bNames = (s.hr_staff_branches || []).map((sb: any) => branchMap[sb.branch_id]).filter(Boolean)
                const matches = bNames.some((bn: string) => columnFilters['branch'].has(bn))
                if (!matches) return false
            }

            if (columnFilters['date'] && columnFilters['date'].size > 0) {
                const dStr = review ? fmtDate(review.review_date) : '—'
                if (!columnFilters['date'].has(dStr)) return false
            }

            if (columnFilters['rating'] && columnFilters['rating'].size > 0) {
                let ratingStr = ''
                if (review) {
                    const avg = computeAverage(review.category_ratings || {})
                    const overallRounded = Math.round(avg) || review.rating || 0
                    const rLabel = getOverallLabelTranslated(overallRounded, language)
                    ratingStr = `${overallRounded} — ${rLabel}`
                } else {
                    ratingStr = language === 'vi' ? 'Chưa đánh giá' : 'Pending'
                }
                if (!columnFilters['rating'].has(ratingStr)) return false
            }

            if (columnFilters['reviewer'] && columnFilters['reviewer'].size > 0) {
                let revName = '—'
                if (review) {
                    const reviewer = accountList.find(a => a.id === review.reviewer_id)
                    revName = review.reviewer_name || (reviewer ? (reviewer.name || reviewer.email) : (language === 'vi' ? 'Hệ thống' : 'System'))
                }
                if (!columnFilters['reviewer'].has(revName)) return false
            }

            return true
        })

        if (sortKey) {
            out.sort((a, b) => {
                const reviewA = reviews.find(r => r.staff_id === a.id && r.period === activePeriodLabel)
                const reviewB = reviews.find(r => r.staff_id === b.id && r.period === activePeriodLabel)
                
                let valA: any = ''
                let valB: any = ''

                if (sortKey === 'staff') {
                    valA = a.full_name || ''
                    valB = b.full_name || ''
                } else if (sortKey === 'branch') {
                    valA = (a.hr_staff_branches || []).map((sb: any) => branchMap[sb.branch_id]).filter(Boolean).join(', ')
                    valB = (b.hr_staff_branches || []).map((sb: any) => branchMap[sb.branch_id]).filter(Boolean).join(', ')
                } else if (sortKey === 'date') {
                    valA = reviewA ? reviewA.review_date : ''
                    valB = reviewB ? reviewB.review_date : ''
                } else if (sortKey === 'rating') {
                    const avgA = reviewA ? computeAverage(reviewA.category_ratings || {}) : 0
                    const ratingA = reviewA ? (Math.round(avgA) || reviewA.rating) : 0
                    const avgB = reviewB ? computeAverage(reviewB.category_ratings || {}) : 0
                    const ratingB = reviewB ? (Math.round(avgB) || reviewB.rating) : 0
                    valA = ratingA
                    valB = ratingB
                } else if (sortKey === 'reviewer') {
                    const reviewerA = reviewA ? accountList.find(al => al.id === reviewA.reviewer_id) : null
                    valA = reviewA ? (reviewA.reviewer_name || (reviewerA ? (reviewerA.name || reviewerA.email) : 'System')) : ''
                    const reviewerB = reviewB ? accountList.find(al => al.id === reviewB.reviewer_id) : null
                    valB = reviewB ? (reviewB.reviewer_name || (reviewerB ? (reviewerB.name || reviewerB.email) : 'System')) : ''
                }

                if (valA < valB) return sortAsc ? -1 : 1
                if (valA > valB) return sortAsc ? 1 : -1
                return 0
            })
        }

        return out
    }, [staffList, reviews, activePeriodLabel, periodEndStr, search, columnFilters, branchMap, language, accountList, sortKey, sortAsc])

    const eligibleForNewReview = useMemo(() => {
        return staffList.filter(s => 
            s.status === 'active' && 
            (!s.start_date || s.start_date <= periodEndStr) &&
            !reviews.some(r => r.staff_id === s.id && r.period === activePeriodLabel)
        )
    }, [staffList, reviews, activePeriodLabel, periodEndStr])

    /* Summary for selected tab */
    const reviewsInTab = useMemo(() => reviews.filter(r => r.period === activePeriodLabel), [reviews, activePeriodLabel])
    const avgRating = reviewsInTab.length > 0
        ? (reviewsInTab.reduce((s, r) => s + r.rating, 0) / reviewsInTab.length).toFixed(1)
        : '—'
    const completedCount = reviewsInTab.length
    const pendingCount = filteredStaff.length - completedCount

    const summaryCards = [
        { label: language === 'vi' ? 'Đánh giá hoàn thành' : 'Completed Reviews',  value: completedCount,          icon: Star,         color: 'text-blue-600',    bg: 'bg-blue-50' },
        { label: language === 'vi' ? 'Đánh giá chưa hoàn thành' : 'Pending Reviews',    value: pendingCount,            icon: User,         color: 'text-orange-600',  bg: 'bg-orange-50' },
        { label: language === 'vi' ? 'Điểm trung bình' : 'Avg Rating',         value: avgRating,               icon: TrendingUp,   color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: language === 'vi' ? 'Nhân viên đủ điều kiện' : 'Eligible Staff',     value: filteredStaff.length,    icon: User,         color: 'text-slate-600',   bg: 'bg-slate-50' },
    ]

    const handleSave = async (data: any) => {
        setSaving(true)
        try {
            if (editingReview) {
                const { error } = await supabase.from('hr_staff_performance').update(data).eq('id', editingReview.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('hr_staff_performance').insert([data])
                if (error) throw error
            }
            setModalOpen(false); setEditingReview(null)
            await fetchAll()
        } catch (err) { console.error(err); alert(language === 'vi' ? 'Lưu đánh giá thất bại' : 'Failed to save review') }
        setSaving(false)
    }

    const handleDelete = async () => {
        if (!deletingId) return
        setDeleteLoading(true)
        try {
            const { error } = await supabase.from('hr_staff_performance').delete().eq('id', deletingId)
            if (error) throw error
            setDeletingId(null); await fetchAll()
        } catch (err) { console.error(err); alert(language === 'vi' ? 'Xóa thất bại' : 'Failed to delete') }
        setDeleteLoading(false)
    }

    const handleExport = async () => {
        setExportLoading(true)
        try {
            const JSZip = (await import('jszip')).default
            const ExcelJS = (await import('exceljs')).default

            const zip = new JSZip()
            
            if (reviewsInTab.length === 0) {
                alert(language === 'vi' ? `Không tìm thấy đánh giá nào cho ${localizePeriodLabel(activePeriodLabel, language)}` : `No reviews found for ${activePeriodLabel}`)
                setExportLoading(false)
                return
            }

            const safePeriodFolder = activePeriodLabel.replace(/[^a-z0-9]/gi, '_')
            const folder = zip.folder(`Performance_Reviews_${safePeriodFolder}`)
            if (!folder) return

            for (const review of reviewsInTab) {
                const staffName = review.hr_staff?.full_name || 'Unknown_Staff'
                const safeName = staffName.replace(/[^a-z0-9]/gi, '_')
                const safePeriod = (review.period || 'Unknown').replace(/[^a-z0-9]/gi, '_')
                
                const workbook = new ExcelJS.Workbook()
                const sheet = workbook.addWorksheet('Review')

                sheet.getColumn(1).width = 30
                sheet.getColumn(2).width = 70

                // Title Row
                const titleRow = sheet.addRow([language === 'vi' ? 'ĐÁNH GIÁ HIỆU QUẢ CÔNG VIỆC' : 'PERFORMANCE REVIEW', ''])
                sheet.mergeCells('A1:B1')
                titleRow.height = 30
                titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
                titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } } // blue-900
                titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }

                sheet.addRow([])

                // Helper for key-value styling
                const addDataRow = (label: string, value: string | number, isHighlight = false) => {
                    const r = sheet.addRow([label, value])
                    r.getCell(1).font = { bold: true, color: { argb: 'FF374151' } }
                    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } } // gray-100
                    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'right', indent: 1 }
                    r.getCell(1).border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } }
                    
                    r.getCell(2).font = { bold: isHighlight, color: isHighlight ? { argb: 'FF1D4ED8' } : { argb: 'FF111827' } }
                    r.getCell(2).alignment = { vertical: 'top', horizontal: 'left', indent: 1, wrapText: true }
                    r.getCell(2).border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } }
                    return r
                }

                // General Info Section
                const headerGeneralRow = sheet.addRow([language === 'vi' ? 'Thông tin chung' : 'General Information', ''])
                sheet.mergeCells(`A${sheet.lastRow!.number}:B${sheet.lastRow!.number}`)
                headerGeneralRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
                headerGeneralRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } } // blue-500
                headerGeneralRow.getCell(1).alignment = { vertical: 'middle', indent: 1 }
                
                addDataRow(language === 'vi' ? 'Nhân viên' : 'Staff Member', staffName)
                addDataRow(language === 'vi' ? 'Kỳ đánh giá' : 'Period', review.period ? localizePeriodLabel(review.period, language) : '-')
                addDataRow(language === 'vi' ? 'Ngày' : 'Date', new Date(review.review_date).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-GB'))
                
                const reviewer = accountList.find(a => a.id === review.reviewer_id)
                addDataRow(language === 'vi' ? 'Người đánh giá' : 'Reviewer', review.reviewer_name || (reviewer ? (reviewer.name || reviewer.email) : (language === 'vi' ? 'Hệ thống' : 'System')))
                
                const avg = computeAverage(review.category_ratings || {})
                const overallRounded = Math.round(avg) || review.rating || 0
                const ratingLabel = getOverallLabelTranslated(overallRounded, language)
                addDataRow(language === 'vi' ? 'Đánh giá chung' : 'Overall Rating', `${avg.toFixed(1)} / 5 - ${ratingLabel}`, true)
                
                sheet.addRow([])

                // Categories Section
                const headerCatsRow = sheet.addRow([language === 'vi' ? 'Đánh giá theo danh mục' : 'Category Ratings', ''])
                sheet.mergeCells(`A${sheet.lastRow!.number}:B${sheet.lastRow!.number}`)
                headerCatsRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
                headerCatsRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } } // emerald-500
                headerCatsRow.getCell(1).alignment = { vertical: 'middle', indent: 1 }
                
                const cats = review.category_ratings || {}
                for (const [key, val] of Object.entries(cats)) {
                    if (val === 0) continue
                    const keyLabel = translateCategoryKey(key, language)
                    addDataRow(keyLabel, `${val} / 5`)
                }

                sheet.addRow([])

                // Text fields Section
                const headerTextRow = sheet.addRow([language === 'vi' ? 'Nhận xét & Mục tiêu' : 'Comments & Goals', ''])
                sheet.mergeCells(`A${sheet.lastRow!.number}:B${sheet.lastRow!.number}`)
                headerTextRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
                headerTextRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B5CF6' } } // violet-500
                headerTextRow.getCell(1).alignment = { vertical: 'middle', indent: 1 }

                addDataRow(language === 'vi' ? 'Nhận xét' : 'Comments', review.notes || (language === 'vi' ? 'Không có nhận xét.' : 'No comments provided.'))
                addDataRow(language === 'vi' ? 'Mục tiêu' : 'Goals', review.goals || (language === 'vi' ? 'Chưa đặt mục tiêu.' : 'No goals set.'))
                
                const buffer = await workbook.xlsx.writeBuffer()
                folder.file(`Review_${safeName}_${safePeriod}.xlsx`, buffer)
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' })
            saveAs(zipBlob, `Performance_Reviews_${safePeriodFolder}.zip`)
        } catch (e) {
            console.error('Export failed', e)
            alert(language === 'vi' ? 'Không thể tạo tệp xuất khẩu' : 'Failed to generate export')
        }
        setExportLoading(false)
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center"><CircularLoader /></div>

    return (
        <div className="min-h-screen text-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">
                            {language === 'vi' ? 'Đánh giá hiệu quả công việc' : 'Performance Reviews'}
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">
                            {language === 'vi' ? 'Đánh giá đa danh mục với điểm trung bình chung.' : 'Multi-category evaluations with overall average rating.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button 
                            onClick={handleExport}
                            disabled={exportLoading}
                            className="inline-flex items-center gap-2 bg-slate-850 hover:bg-slate-800 border border-white/10 text-slate-200 h-9 px-4 rounded-lg text-sm font-medium transition-all whitespace-nowrap shadow disabled:opacity-50"
                        >
                            {exportLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FileDown className="w-4 h-4" />} 
                            {language === 'vi' ? 'Xuất ZIP' : 'Export ZIP'}
                        </button>
                        <button onClick={() => { setEditingReview(null); setPreselectedStaffForNew(null); setStaffSelectOpen(true) }}
                            className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition shadow whitespace-nowrap">
                            <Plus className="w-4 h-4" />
                            {language === 'vi' ? 'Đánh giá mới' : 'New Review'}
                        </button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    {summaryCards.map(c => (
                        <div key={c.label} className="rounded-xl bg-white shadow-sm p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className={`p-1.5 rounded-lg ${c.bg}`}><c.icon className={`w-4 h-4 ${c.color}`} /></div>
                                <span className="text-xs text-gray-500">{c.label}</span>
                            </div>
                            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                        </div>
                    ))}
                </div>

                {/* Header Nav */}
                <div className="mt-3 mb-4 flex items-center justify-between text-sm text-blue-100">
                    <button type="button" onClick={() => setPeriodOffset(prev => prev - 1)} className="flex items-center gap-1 hover:text-white">
                        <ChevronLeft className="w-4 h-4" />
                        <span>{language === 'vi' ? 'Trước' : 'Previous'}</span>
                    </button>

                    <div className="flex items-center gap-2 text-white">
                        <span className="text-base font-semibold">{localizePeriodLabel(activePeriodLabel, language)}</span>
                    </div>

                    <button type="button" onClick={() => setPeriodOffset(prev => prev + 1)} className="flex items-center gap-1 hover:text-white">
                        <span>{language === 'vi' ? 'Tiếp' : 'Next'}</span>
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Table */}
                <div className="rounded-2xl bg-white shadow-md overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <ColumnHeader
                                        colKey="staff"
                                        label={language === 'vi' ? 'Nhân viên' : 'Staff Member'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['staff'] || []}
                                        activeFilter={columnFilters['staff'] || null}
                                        onFilter={(s) => applyColumnFilter('staff', s)}
                                        onClear={() => clearColumnFilter('staff')}
                                        open={openMenu === 'staff'}
                                        onToggle={() => setOpenMenu(openMenu === 'staff' ? null : 'staff')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                        className="text-left min-w-[200px]"
                                    />
                                    <ColumnHeader
                                        colKey="branch"
                                        label={language === 'vi' ? 'Chi nhánh' : 'Branch(es)'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['branch'] || []}
                                        activeFilter={columnFilters['branch'] || null}
                                        onFilter={(s) => applyColumnFilter('branch', s)}
                                        onClear={() => clearColumnFilter('branch')}
                                        open={openMenu === 'branch'}
                                        onToggle={() => setOpenMenu(openMenu === 'branch' ? null : 'branch')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                        className="text-left min-w-[150px]"
                                    />
                                    <ColumnHeader
                                        colKey="date"
                                        label={language === 'vi' ? 'Ngày đánh giá' : 'Review Date'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['date'] || []}
                                        activeFilter={columnFilters['date'] || null}
                                        onFilter={(s) => applyColumnFilter('date', s)}
                                        onClear={() => clearColumnFilter('date')}
                                        open={openMenu === 'date'}
                                        onToggle={() => setOpenMenu(openMenu === 'date' ? null : 'date')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                        className="text-left min-w-[140px]"
                                    />
                                    <ColumnHeader
                                        colKey="rating"
                                        label={language === 'vi' ? 'Trạng thái & Đánh giá' : 'Status & Overall'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['rating'] || []}
                                        activeFilter={columnFilters['rating'] || null}
                                        onFilter={(s) => applyColumnFilter('rating', s)}
                                        onClear={() => clearColumnFilter('rating')}
                                        open={openMenu === 'rating'}
                                        onToggle={() => setOpenMenu(openMenu === 'rating' ? null : 'rating')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                        center
                                        className="text-center min-w-[180px]"
                                    />
                                    <ColumnHeader
                                        colKey="reviewer"
                                        label={language === 'vi' ? 'Người đánh giá' : 'Reviewer'}
                                        sortKey={sortKey}
                                        sortAsc={sortAsc}
                                        onSort={applySort}
                                        values={columnValues['reviewer'] || []}
                                        activeFilter={columnFilters['reviewer'] || null}
                                        onFilter={(s) => applyColumnFilter('reviewer', s)}
                                        onClear={() => clearColumnFilter('reviewer')}
                                        open={openMenu === 'reviewer'}
                                        onToggle={() => setOpenMenu(openMenu === 'reviewer' ? null : 'reviewer')}
                                        onClose={() => setOpenMenu(null)}
                                        dict={dict}
                                        className="text-left min-w-[150px]"
                                    />
                                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-gray-500 w-24">
                                        {language === 'vi' ? 'Hành động' : 'Actions'}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStaff.map((staff, idx) => {
                                    const r = reviewsInTab.find(rev => rev.staff_id === staff.id)
                                    const avg = r ? computeAverage(r.category_ratings || {}) : 0
                                    const overallRounded = r ? (Math.round(avg) || r.rating) : 0
                                    const rl = overallRounded ? (OVERALL_LABELS[overallRounded] || OVERALL_LABELS[3]) : null

                                    return (
                                        <Fragment key={staff.id}>
                                            <tr className={`border-t border-gray-100 transition-colors ${idx % 2 === 0 ? 'bg-gray-50/30' : ''} cursor-pointer hover:bg-gray-100`}
                                                onClick={() => {
                                                    if (r) {
                                                        setEditingReview(r)
                                                        setModalOpen(true)
                                                    } else {
                                                        setEditingReview(null)
                                                        setPreselectedStaffForNew(staff.id)
                                                        setModalOpen(true)
                                                    }
                                                }}>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                                            {(staff.full_name || '').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <span className="text-sm font-medium text-gray-900 block truncate">{staff.full_name}</span>
                                                            <span className="text-xs text-gray-400 block">{staff.position}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <BranchCell 
                                                        branchNames={(staff.hr_staff_branches || [])
                                                            .map((br: any) => branchMap[br.branch_id])
                                                            .filter(Boolean)} 
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-600">
                                                    {r ? fmtDate(r.review_date) : <span className="text-slate-400">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {r ? (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <RatingStars rating={avg > 0 ? avg : r.rating} />
                                                            <span className={`text-xs font-bold ${rl?.color}`}>
                                                                {avg > 0 ? avg.toFixed(1) : r.rating} — {rl ? getOverallLabelTranslated(overallRounded, language) : ''}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="px-2 py-1 bg-amber-50 text-amber-600 font-semibold text-[10px] uppercase rounded-full tracking-wider border border-amber-100">
                                                            {language === 'vi' ? 'Chưa đánh giá' : 'Pending'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-600">{r?.reviewer_name || '—'}</td>
                                                <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                                    {!r && (
                                                        <button 
                                                            onClick={(e) => { 
                                                                e.stopPropagation()
                                                                setAssigningForId(staff.id)
                                                                setAssignSelectOpen(true)
                                                            }}
                                                            className="px-3 py-1 text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 rounded-lg transition whitespace-nowrap">
                                                            {language === 'vi' ? 'Giao việc đánh giá' : 'Assign Review'}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        </Fragment>
                                    )
                                })}
                                {filteredStaff.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-xs italic font-semibold">
                                            <p className="mb-1 text-gray-900 text-sm font-bold not-italic">
                                                {language === 'vi' ? 'Không tìm thấy kết quả' : 'No results found'}
                                            </p>
                                            <p className="text-gray-550 text-xs font-normal not-italic">
                                                {language === 'vi' ? 'Thử điều chỉnh bộ lọc của bạn.' : 'Try adjusting your filters.'}
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <SelectStaffModal 
                open={isStaffSelectOpen} 
                onClose={() => setStaffSelectOpen(false)} 
                staffList={eligibleForNewReview} 
                onSelect={(id) => {
                    setPreselectedStaffForNew(id)
                    setStaffSelectOpen(false)
                    setModalOpen(true)
                }} 
            />

            <SelectAccountModal 
                open={isAssignSelectOpen} 
                onClose={() => setAssignSelectOpen(false)}
                title={language === 'vi' ? 'Giao việc đánh giá cho' : 'Assign Review To'}
                subtitle={language === 'vi' ? `Chọn một người dùng ứng dụng để xử lý việc đánh giá cho ${staffList.find(s => s.id === assigningForId)?.full_name}.` : `Select an app user to handle the review for ${staffList.find(s => s.id === assigningForId)?.full_name}.`}
                accountList={accountList}
                onSelect={async (id, name) => {
                    const targetStaff = staffList.find(s => s.id === assigningForId);
                    if (!targetStaff) return;
                    
                    try {
                        const existing = reviews.find(r => r.staff_id === assigningForId && r.period === activePeriodLabel);
                        if (existing) {
                            const { error: updErr } = await supabase
                                .from('hr_staff_performance')
                                .update({
                                    reviewer_name: name,
                                    assigned_reviewer_id: id
                                })
                                .eq('id', existing.id);
                            if (updErr) throw updErr;
                        } else {
                            const { error: insErr } = await supabase
                                .from('hr_staff_performance')
                                .insert([{
                                    staff_id: assigningForId,
                                    review_date: today,
                                    period: activePeriodLabel,
                                    reviewer_name: name,
                                    rating: 0,
                                    category_ratings: {},
                                    assigned_reviewer_id: id
                                }]);
                            if (insErr) throw insErr;
                        }

                        // Inseriamo la notifica centralizzata per l'assegnatario
                        const { error: notifErr } = await supabase
                            .from('app_notifications')
                            .insert([{
                                module: 'hr',
                                title_en: 'Performance Review Assigned',
                                title_vi: 'Giao việc đánh giá hiệu suất',
                                message_en: `You have been assigned to conduct the performance review for ${targetStaff.full_name} for the period ${activePeriodLabel}.`,
                                message_vi: `Bạn đã được giao thực hiện đánh giá hiệu suất cho ${targetStaff.full_name} cho chu kỳ ${localizePeriodLabel(activePeriodLabel, 'vi')}.`,
                                target_user_id: id
                            }]);
                        if (notifErr) throw notifErr;

                        // Rinfreschiamo i dati
                        await fetchAll();
                        
                        // Notifichiamo la TopHeader
                        window.dispatchEvent(new CustomEvent('performance-updated'));
                        
                        setAssignSelectOpen(false);
                    } catch (err) {
                        console.error('Error assigning review:', err);
                        alert(language === 'vi' ? 'Giao việc thất bại' : 'Failed to assign review');
                    }
                }}
            />

            <PerformanceModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingReview(null) }}
                onSave={handleSave} review={editingReview} staffList={staffList} allCategories={allCategories} saving={saving} preselectedStaffId={preselectedStaffForNew} preselectedPeriod={activePeriodLabel} onDelete={(id) => setDeletingId(id)} previousGoals={previousGoalsForModal} />

            {deletingId && (
                <DeleteConfirm
                    label={reviews.find(r => r.id === deletingId)?.hr_staff?.full_name || ''}
                    onConfirm={handleDelete} onCancel={() => setDeletingId(null)} deleting={deleteLoading} />
            )}
        </div>
    )
}

interface ColumnHeaderProps {
    colKey: string
    label: string
    sortKey: string
    sortAsc: boolean
    onSort: (key: string, isAsc: boolean) => void
    values: string[]
    activeFilter: Set<string> | null
    onFilter: (values: Set<string> | null) => void
    onClear: () => void
    open: boolean
    onToggle: () => void
    onClose: () => void
    dict: {
        sortAsc: string
        sortDesc: string
        selectAll: string
        deselectAll: string
        filterPlaceholder: string
        clearFilters: string
        empty: string
    }
    className?: string
    center?: boolean
    right?: boolean
}

function ColumnHeader({
    colKey,
    label,
    sortKey,
    sortAsc,
    onSort,
    values,
    activeFilter,
    onFilter,
    onClear,
    open,
    onToggle,
    onClose,
    dict,
    className = '',
    center = false,
    right = false
}: ColumnHeaderProps) {
    const ref = useRef<HTMLDivElement>(null)
    const [filterSearch, setFilterSearch] = useState('')
    const [localChecked, setLocalChecked] = useState<Set<string>>(new Set(values))

    useEffect(() => {
        if (open) {
            setLocalChecked(activeFilter ? new Set(activeFilter) : new Set(values))
            setFilterSearch('')
        }
    }, [open, values, activeFilter])

    useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleScroll() {
      onClose();
    }
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [open, onClose])

    const isActive = sortKey === colKey
    const hasFilter = !!activeFilter
    const dropdownStyle = useMemo(() => {
        if (!open || !ref.current) return undefined
        const rect = ref.current.getBoundingClientRect()
        const width = 220;
      let left = right ? rect.right - width : rect.left;
      if (left + width > window.innerWidth) {
        left = window.innerWidth - width - 8;
      }
      if (left < 8) {
        left = 8;
      }
      return { top: rect.bottom + 4, left: left, width: `${width}px` };
    }, [open, right])

    const filteredValues = useMemo(() => {
        if (!filterSearch.trim()) return values
        const q = filterSearch.toLowerCase()
        return values.filter(v => (v || '').toLowerCase().includes(q))
    }, [values, filterSearch])

    const allVisibleChecked = filteredValues.length > 0 && filteredValues.every(v => localChecked.has(v))

    function toggleAll() {
        const next = new Set(localChecked)
        if (allVisibleChecked) { filteredValues.forEach(v => next.delete(v)) }
        else { filteredValues.forEach(v => next.add(v)) }
        setLocalChecked(next)
    }

    function toggleOne(v: string) {
        const next = new Set(localChecked)
        if (next.has(v)) next.delete(v); else next.add(v)
        setLocalChecked(next)
    }

    function handleApply() {
        let finalChecked = localChecked;
        if (filterSearch) {
            finalChecked = new Set([...localChecked].filter(x => filteredValues.includes(x)));
        }
        if (finalChecked.size >= values.length) onFilter(null); 
        else onFilter(finalChecked);
    }

    return (
        <th className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500 relative select-none ${className}`} ref={ref as any}>
            <div className={`flex items-center gap-1 ${center ? 'justify-center' : right ? 'justify-end' : 'justify-between'}`}>
                <span className="cursor-pointer hover:text-gray-900 transition-colors" onClick={() => onSort(colKey, !sortAsc)}>
                    {label}
                </span>
                
                <div className="flex items-center gap-0.5">
                    {isActive && (
                        sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    )}
                    
                    {hasFilter && (
                        <Filter className="w-3.5 h-3.5 text-orange-500 fill-current flex-shrink-0" />
                    )}
                    
                    <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onToggle(); }}
                        className="p-0.5 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700 flex-shrink-0 cursor-pointer"
                    >
                        <MoreVertical className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
            </div>

            {open && dropdownStyle && (
                <div 
                    className="fixed bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] min-w-[220px] text-left text-sm text-gray-700 normal-case font-normal" 
                    style={dropdownStyle}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="px-3 py-2 space-y-1">
                        <button 
                            type="button"
                            onClick={() => { onSort(colKey, true); onClose(); }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}
                        >
                            <ArrowUp className="w-4 h-4" />
                            {dict.sortAsc}
                        </button>
                        <button 
                            type="button"
                            onClick={() => { onSort(colKey, false); onClose(); }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isActive && !sortAsc ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}
                        >
                            <ArrowDown className="w-4 h-4" />
                            {dict.sortDesc}
                        </button>
                    </div>

                    <div className="border-t border-gray-200" />

                    <div className="px-3 py-2">
                        <input 
                            type="text" 
                            placeholder={dict.filterPlaceholder}
                            value={filterSearch}
                            onChange={(e) => setFilterSearch(e.target.value)}
                            className="w-full mb-2 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-gray-900"
                        />
                        <button
                            type="button"
                            onClick={toggleAll}
                            className="text-xs text-blue-600 hover:text-blue-800 mb-1 cursor-pointer font-medium"
                        >
                            {allVisibleChecked ? dict.deselectAll : dict.selectAll}
                        </button>

                        <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                            {filteredValues.map(v => (
                                <label key={v} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={localChecked.has(v)}
                                        onChange={() => toggleOne(v)}
                                        className="accent-blue-600 rounded"
                                    />
                                    <span className="truncate text-xs">{v || `[${dict.empty}]`}</span>
                                </label>
                            ))}
                            {filteredValues.length === 0 && (
                                <div className="text-xs text-gray-400 py-1 text-center">—</div>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
                        <button type="button" onClick={() => { onClear(); onClose(); }} className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer font-medium">
                            {dict.clearFilters}
                        </button>
                        <button type="button" onClick={() => { handleApply(); onClose(); }} className="px-3 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer font-medium">
                            OK
                        </button>
                    </div>
                </div>
            )}
        </th>
    )
}
