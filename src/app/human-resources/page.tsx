'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import {
    Briefcase,
    Users,
    TrendingUp,
    DollarSign,
    Calendar,
    Clock,
    Activity,
    Building,
    ArrowUpRight,
    UserCheck
} from 'lucide-react'
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    PieChart,
    Pie,
    Cell
} from 'recharts'

// Localized Dictionary
const dict = {
    en: {
        title: 'HR & Recruitment Dashboard',
        subtitle: 'Real-time overview of recruitment pipeline, staff metrics, and operational activities.',
        allCities: 'All Cities',
        city: 'City',
        kpis: {
            activeRequests: 'Active Hiring Requests',
            headcount: 'Target Headcount',
            candidatesPipeline: 'Candidates in Pipeline',
            conversionRate: 'Conversion Rate',
            activeStaff: 'Active Staff',
            probationStaff: 'Staff in Probation',
            recruitmentCost: 'Recruitment Cost',
            costPerHire: 'Cost per Hire'
        },
        sections: {
            recruitment: 'Recruitment Analytics',
            staff: 'Staff & Departments',
            recentActivity: 'Recent Activities',
            quickLinks: 'Operational Modules'
        },
        charts: {
            pipelineTitle: 'Candidate Stage Pipeline',
            departmentTitle: 'Staff Distribution by Department',
            sourceTitle: 'Candidate Sources Effectiveness',
            noData: 'No data available for the selected filter.'
        },
        links: {
            recruitment: 'Manage Hiring Requests',
            candidates: 'Manage Candidates',
            staff: 'Staff Directory',
            roster: 'Staff Roster',
            attendance: 'Time Keeping & Attendance',
            settings: 'HR Settings'
        },
        stages: {
            new: 'New',
            screened: 'Screened',
            interview_scheduled: 'Scheduled',
            interviewed: 'Interviewed',
            trial_shift: 'Onboarding',
            offer_sent: 'Offer Sent',
            hired: 'Hired',
            rejected: 'Rejected',
            withdrawn: 'Withdrawn'
        }
    },
    vi: {
        title: 'Bảng điều khiển Nhân sự & Tuyển dụng',
        subtitle: 'Tổng quan thời gian thực về quy trình tuyển dụng, chỉ số nhân sự và hoạt động vận hành.',
        allCities: 'Tất cả thành phố',
        city: 'Thành phố',
        kpis: {
            activeRequests: 'Yêu cầu tuyển dụng hoạt động',
            headcount: 'Chỉ tiêu tuyển dụng',
            candidatesPipeline: 'Ứng viên trong quy trình',
            conversionRate: 'Tỷ lệ nhận việc',
            activeStaff: 'Nhân viên đang làm việc',
            probationStaff: 'Nhân viên thử việc',
            recruitmentCost: 'Chi phí tuyển dụng',
            costPerHire: 'Chi phí mỗi lần tuyển'
        },
        sections: {
            recruitment: 'Phân tích Tuyển dụng',
            staff: 'Nhân viên & Bộ phận',
            recentActivity: 'Hoạt động gần đây',
            quickLinks: 'Phân hệ Vận hành'
        },
        charts: {
            pipelineTitle: 'Quy trình các giai đoạn ứng viên',
            departmentTitle: 'Phân bổ nhân viên theo bộ phận',
            sourceTitle: 'Hiệu quả các nguồn ứng viên',
            noData: 'Không có dữ liệu cho bộ lọc đã chọn.'
        },
        links: {
            recruitment: 'Quản lý yêu cầu tuyển dụng',
            candidates: 'Quản lý ứng viên',
            staff: 'Danh sách nhân viên',
            roster: 'Lịch làm việc ca',
            attendance: 'Chấm công & chuyên cần',
            settings: 'Cấu hình nhân sự'
        },
        stages: {
            new: 'Mới',
            screened: 'Đã lọc',
            interview_scheduled: 'Lịch hẹn',
            interviewed: 'Đã phỏng vấn',
            trial_shift: 'Chờ nhận việc',
            offer_sent: 'Gửi Offer',
            hired: 'Đã nhận',
            rejected: 'Từ chối',
            withdrawn: 'Rút lui'
        }
    }
}

// Chart Colors
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b', '#ef4444', '#14b8a6']

export default function HRDashboardPage() {
    const { language } = useSettings()
    const isVI = language === 'vi'
    const t = (key: string) => {
        const lang = isVI ? 'vi' : 'en'
        const keys = key.split('.')
        let current: any = dict[lang]
        for (const k of keys) {
            if (current && current[k] !== undefined) {
                current = current[k]
            } else {
                return key
            }
        }
        return current
    }

    const [loading, setLoading] = useState(true)
    const [mounted, setMounted] = useState(false)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [userBranches, setUserBranches] = useState<string[]>([])
    const [selectedCity, setSelectedCity] = useState<string>('all')

    // Data states
    const [branches, setBranches] = useState<any[]>([])
    const [requests, setRequests] = useState<any[]>([])
    const [staff, setStaff] = useState<any[]>([])
    const [postings, setPostings] = useState<any[]>([])
    const [packageCosts, setPackageCosts] = useState<Record<string, number>>({})
    const [overtime, setOvertime] = useState<any[]>([])
    const [activities, setActivities] = useState<any[]>([])

    useEffect(() => {
        setMounted(true)
        const loadInitialData = async () => {
            setLoading(true)
            await fetchUserRoleAndBranches()
            await fetchDashboardData()
            setLoading(false)
        }
        loadInitialData()

        // Set up Realtime subscriptions to auto-refresh dashboard data in real-time
        const channel = supabase
            .channel('hr-dashboard-realtime-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'hr_staff' }, () => {
                fetchDashboardData()
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'hiring_requests' }, () => {
                fetchDashboardData()
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, () => {
                fetchDashboardData()
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'recruitment_postings' }, () => {
                fetchDashboardData()
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'hr_staff_overtime' }, () => {
                fetchDashboardData()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    const fetchUserRoleAndBranches = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data } = await supabase
                    .from('app_accounts')
                    .select('role, branches')
                    .eq('user_id', user.id)
                    .single()
                if (data) {
                    setUserRole(data.role)
                    setUserBranches(data.branches || [])
                }
            }
        } catch (error) {
            console.error('Error fetching user account details:', error)
        }
    }

    const fetchDashboardData = async () => {
        try {
            // 1. Branches
            const { data: branchesData } = await supabase
                .from('provider_branches')
                .select('id, name, city')
            setBranches(branchesData || [])

            // 2. Hiring Requests with Candidates
            const { data: requestsData } = await supabase
                .from('hiring_requests')
                .select('*, candidates(id, stage, source, created_at, recruitment_posting_id)')
            setRequests(requestsData || [])

            // 3. HR Staff members with branches
            const { data: staffData } = await supabase
                .from('hr_staff')
                .select('*, hr_staff_branches(*)')
            setStaff(staffData || [])

            // 4. Recruitment Postings
            const { data: postingsData } = await supabase
                .from('recruitment_postings')
                .select('*, hiring_requests(branch_ids)')
            setPostings(postingsData || [])

            // Fetch packages to compute package cost per posting
            const { data: packagesData } = await supabase
                .from('recruitment_platform_packages')
                .select('id, total_cost')

            const pkgPostingsCount: Record<string, number> = {}
            if (postingsData) {
                postingsData.forEach(p => {
                    if (p.package_id) {
                        pkgPostingsCount[p.package_id] = (pkgPostingsCount[p.package_id] || 0) + 1
                    }
                })
            }

            const costsMap: Record<string, number> = {}
            if (packagesData) {
                packagesData.forEach(pkg => {
                    const count = pkgPostingsCount[pkg.id] || 0
                    costsMap[pkg.id] = count > 0 ? pkg.total_cost / count : pkg.total_cost
                })
            }
            setPackageCosts(costsMap)

            // 5. Overtime
            const { data: overtimeData } = await supabase
                .from('hr_staff_overtime')
                .select('*, hr_staff(id, city, hr_staff_branches(branch_id))')
            setOvertime(overtimeData || [])

            // 6. Activities Log
            const { data: logsData } = await supabase
                .from('hr_activity_log')
                .select('*, hiring_requests(position_title, branch_ids)')
                .order('created_at', { ascending: false })
                .limit(10)
            setActivities(logsData || [])
        } catch (error) {
            console.error('Error loading dashboard data:', error)
        }
    }

    // Cities available in provider branches
    const availableCities = Array.from(
        new Set(
            branches
                .filter(b => {
                    // Filter based on user access
                    if (!userRole) return false
                    if (['admin', 'owner', 'hr manager', 'manager', 'accountant'].includes(userRole)) return true
                    return userBranches.includes(String(b.id))
                })
                .map(b => b.city)
                .filter(Boolean)
        )
    ) as string[]

    // Get branch IDs for the selected city
    const branchIdsInCity = selectedCity === 'all'
        ? []
        : branches.filter(b => b.city === selectedCity).map(b => String(b.id))

    // Helper filter function
    const filterByCity = (branchIds: any) => {
        if (selectedCity === 'all') return true
        if (!branchIds) return false
        const ids = Array.isArray(branchIds) ? branchIds.map(String) : [String(branchIds)]
        return ids.some(id => branchIdsInCity.includes(id))
    }

    // ── Metric Calculations ──

    // 1. Hiring Requests
    const filteredRequests = requests.filter(r => filterByCity(r.branch_ids))
    const activeRequests = filteredRequests.filter(r => r.status !== 'closed')
    const totalTargetHeadcount = activeRequests.reduce((sum, r) => sum + (r.headcount || 0), 0)

    // 2. Candidates
    const filteredCandidates: any[] = []
    filteredRequests.forEach(r => {
        if (r.candidates) {
            r.candidates.forEach((c: any) => {
                filteredCandidates.push({
                    ...c,
                    position_title: r.position_title,
                    department: r.department
                })
            })
        }
    })

    const totalCandidatesCount = filteredCandidates.length
    const hiredCandidatesCount = filteredCandidates.filter(c => c.stage === 'hired').length
    const pipelineCandidatesCount = filteredCandidates.filter(c => !['hired', 'rejected', 'withdrawn'].includes(c.stage)).length
    const conversionRate = totalCandidatesCount > 0 ? Math.round((hiredCandidatesCount / totalCandidatesCount) * 100) : 0

    // 3. Postings & Costs
    const filteredPostings = postings.filter(p => filterByCity(p.hiring_requests?.branch_ids))
    
    const getPostingCost = (p: any) => {
        if (p.package_id && packageCosts[p.package_id] !== undefined) {
            return packageCosts[p.package_id]
        }
        return p.direct_cost || 0
    }

    const totalRecruitmentCost = filteredPostings.reduce((sum, p) => sum + getPostingCost(p), 0)

    const hiredFromPaidPostingsCount = filteredCandidates.filter(c => {
        if (c.stage !== 'hired') return false
        if (!c.recruitment_posting_id) return false
        const posting = postings.find(p => p.id === c.recruitment_posting_id)
        if (!posting) return false
        return getPostingCost(posting) > 0
    }).length

    const costPerHire = hiredFromPaidPostingsCount > 0 
        ? Math.round(totalRecruitmentCost / hiredFromPaidPostingsCount) 
        : 0

    // 4. HR Staff
    const filteredStaff = staff.filter(s => {
        if (selectedCity === 'all') return true
        if (s.city === selectedCity) return true
        return s.hr_staff_branches?.some((sb: any) => branchIdsInCity.includes(String(sb.branch_id)))
    })
    const activeStaff = filteredStaff.filter(s => s.status === 'active')
    const activeStaffCount = activeStaff.length
    const probationStaffCount = activeStaff.filter(s => {
        if (!s.probation_end_date) return false
        const todayStr = new Date().toISOString().substring(0, 10)
        return s.probation_end_date >= todayStr
    }).length

    // 5. Overtime
    const currentMonthStr = new Date().toISOString().substring(0, 7) // YYYY-MM
    const filteredOvertime = overtime.filter(o => {
        if (!o.date || !o.date.startsWith(currentMonthStr)) return false
        if (selectedCity === 'all') return true
        if (o.hr_staff?.city === selectedCity) return true
        const staffBranches = o.hr_staff?.hr_staff_branches || []
        return staffBranches.some((sb: any) => branchIdsInCity.includes(String(sb.branch_id)))
    })
    const totalOvertimeHours = filteredOvertime.reduce((sum, o) => sum + (o.hours || 0), 0)

    // 6. Activities Timeline
    const filteredActivities = activities.filter(act => {
        if (selectedCity === 'all') return true
        return filterByCity(act.hiring_requests?.branch_ids)
    }).slice(0, 5)

    // Helper to format currency
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat(isVI ? 'vi-VN' : 'en-US', {
            style: 'currency',
            currency: 'VND',
            maximumFractionDigits: 0
        }).format(amount)
    }

    const formatDateTime = (dateString?: string | null) => {
        if (!dateString) return '—'
        const date = new Date(dateString)
        if (isNaN(date.getTime())) return '—'
        const day = String(date.getDate()).padStart(2, '0')
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const year = date.getFullYear()
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${day}/${month}/${year} ${hours}:${minutes}`
    }

    // Localize activity message
    const getLocalizedMessage = (msg: string | null) => {
        if (!msg) return ''
        const parts = msg.split(' / ')
        return parts.length === 2 ? (isVI ? parts[1] : parts[0]) : msg
    }

    // ── Chart Data Building ──

    // 1. Pipeline Data
    const stageCounts = {
        new: 0,
        screened: 0,
        interview_scheduled: 0,
        interviewed: 0,
        trial_shift: 0,
        offer_sent: 0,
        hired: 0,
        rejected: 0,
        withdrawn: 0
    }
    filteredCandidates.forEach(c => {
        if (stageCounts[c.stage as keyof typeof stageCounts] !== undefined) {
            stageCounts[c.stage as keyof typeof stageCounts]++
        }
    })
    const pipelineChartData = [
        { stage: t('stages.new'), count: stageCounts.new, fill: '#3b82f6' },
        { stage: t('stages.screened'), count: stageCounts.screened, fill: '#6366f1' },
        { stage: t('stages.interview_scheduled'), count: stageCounts.interview_scheduled, fill: '#f59e0b' },
        { stage: t('stages.interviewed'), count: stageCounts.interviewed, fill: '#a855f7' },
        { stage: t('stages.trial_shift'), count: stageCounts.trial_shift, fill: '#f97316' },
        { stage: t('stages.offer_sent'), count: stageCounts.offer_sent, fill: '#ec4899' },
        { stage: t('stages.hired'), count: stageCounts.hired, fill: '#10b981' }
    ]

    // 2. Department Data
    const deptCounts: Record<string, number> = {}
    activeStaff.forEach(s => {
        const d = s.department || (isVI ? 'Khác' : 'Other')
        deptCounts[d] = (deptCounts[d] || 0) + 1
    })
    const departmentChartData = Object.entries(deptCounts).map(([name, value]) => ({
        name,
        value
    })).sort((a, b) => b.value - a.value)

    // 3. Source Data
    const sourceCounts: Record<string, number> = {}
    filteredCandidates.forEach(c => {
        const s = c.source || (isVI ? 'Khác' : 'Other')
        sourceCounts[s] = (sourceCounts[s] || 0) + 1
    })
    const sourceChartData = Object.entries(sourceCounts).map(([name, value]) => ({
        name,
        value
    })).sort((a, b) => b.value - a.value).slice(0, 5)

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <CircularLoader />
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-gray-700">
            {/* Header */}
            <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white sm:text-3xl tracking-tight leading-normal">
                        {t('title')}
                    </h1>
                    <p className="mt-1 text-sm text-slate-400">
                        {t('subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-2 self-start md:self-auto">
                    <Building className="w-4 h-4 text-slate-400 mr-1" />
                    {mounted ? (
                        <select
                            value={selectedCity}
                            onChange={e => setSelectedCity(e.target.value)}
                            className="bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm font-semibold text-white outline-none cursor-pointer focus:ring-2 focus:ring-blue-500 shadow-sm"
                        >
                            <option value="all">{t('allCities')}</option>
                            {availableCities.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    ) : (
                        <div className="h-9 w-28 bg-slate-800 animate-pulse rounded-xl" />
                    )}
                </div>
            </header>

            {/* KPI grid */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                {/* Active Requests */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500">{t('kpis.activeRequests')}</span>
                        <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                            <Briefcase className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-gray-900">{activeRequests.length}</span>
                        <span className="text-xs text-slate-400">
                            ({totalTargetHeadcount} {isVI ? 'chỉ tiêu' : 'target'})
                        </span>
                    </div>
                </div>

                {/* Candidates Pipeline */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500">{t('kpis.candidatesPipeline')}</span>
                        <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                            <Users className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-gray-900">{pipelineCandidatesCount}</span>
                        <span className="text-xs text-slate-400">
                            ({hiredCandidatesCount} {isVI ? 'đã nhận' : 'hired'})
                        </span>
                    </div>
                </div>

                {/* Conversion Rate */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500">{t('kpis.conversionRate')}</span>
                        <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="mt-3">
                        <span className="text-2xl font-bold text-gray-900">{conversionRate}%</span>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${conversionRate}%` }} />
                        </div>
                    </div>
                </div>

                {/* Recruitment Cost */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500">{t('kpis.recruitmentCost')}</span>
                        <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                            <DollarSign className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="mt-3 flex flex-col justify-start">
                        <span className="text-xl font-bold text-gray-900 truncate" title={formatCurrency(totalRecruitmentCost)}>
                            {formatCurrency(totalRecruitmentCost)}
                        </span>
                        <span className="text-xs text-slate-400 mt-1">
                            {t('kpis.costPerHire')}: {formatCurrency(costPerHire)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Sub-KPI Staff */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
                {/* Active Staff */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-teal-50 rounded-xl text-teal-600">
                            <UserCheck className="w-6 h-6" />
                        </div>
                        <div>
                            <span className="text-sm font-medium text-slate-500 block">{t('kpis.activeStaff')}</span>
                            <span className="text-xl font-bold text-gray-900">{activeStaffCount}</span>
                        </div>
                    </div>
                </div>

                {/* Staff in Probation */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
                            <Clock className="w-6 h-6" />
                        </div>
                        <div>
                            <span className="text-sm font-medium text-slate-500 block">{t('kpis.probationStaff')}</span>
                            <span className="text-xl font-bold text-gray-900">{probationStaffCount}</span>
                        </div>
                    </div>
                </div>

                {/* Overtime Hours */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
                            <Calendar className="w-6 h-6" />
                        </div>
                        <div>
                            <span className="text-sm font-medium text-slate-500 block">
                                {isVI ? 'Giờ tăng ca tháng này' : 'Overtime Hours (Month)'}
                            </span>
                            <span className="text-xl font-bold text-gray-900">{totalOvertimeHours}h</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main grid for charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Candidate Pipeline Graph */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm flex flex-col">
                    <h3 className="text-base font-bold text-gray-900 mb-4">{t('charts.pipelineTitle')}</h3>
                    <div className="h-72 w-full flex-1">
                        {mounted && totalCandidatesCount > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pipelineChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                    <XAxis dataKey="stage" stroke="#94a3b8" fontSize={11} tickLine={false} />
                                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#1e293b' }}
                                        cursor={{ fill: '#f8fafc' }}
                                    />
                                    <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={32}>
                                        {pipelineChartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium">
                                {t('charts.noData')}
                            </div>
                        )}
                    </div>
                </div>

                {/* Staff by Department (Pie Chart) */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm flex flex-col">
                    <h3 className="text-base font-bold text-gray-900 mb-4">{t('charts.departmentTitle')}</h3>
                    <div className="h-72 w-full flex-1 flex flex-col justify-center">
                        {mounted && departmentChartData.length > 0 ? (
                            <>
                                <div className="h-48 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={departmentChartData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={50}
                                                outerRadius={75}
                                                paddingAngle={4}
                                                dataKey="value"
                                            >
                                                {departmentChartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#1e293b' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2 max-h-16 overflow-y-auto px-2">
                                    {departmentChartData.map((entry, index) => (
                                        <div key={entry.name} className="flex items-center gap-1.5 text-xs text-slate-655 font-medium">
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                                            <span className="truncate max-w-[100px]">{entry.name}</span>
                                            <span className="font-bold text-slate-900">({entry.value})</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium">
                                {t('charts.noData')}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom grid: Sources & Recent Activities */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Candidate Sources */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm flex flex-col">
                    <h3 className="text-base font-bold text-gray-900 mb-4">{t('charts.sourceTitle')}</h3>
                    <div className="flex-1 flex flex-col gap-4">
                        {sourceChartData.length > 0 ? (
                            sourceChartData.map((item, index) => {
                                const percentage = totalCandidatesCount > 0 ? Math.round((item.value / totalCandidatesCount) * 100) : 0
                                return (
                                    <div key={item.name} className="flex flex-col">
                                        <div className="flex items-center justify-between text-xs font-semibold mb-1">
                                            <span className="text-slate-700">{item.name}</span>
                                            <span className="text-gray-900">{item.value} {isVI ? 'ứng viên' : 'candidates'} ({percentage}%)</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full"
                                                style={{
                                                    backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                                                    width: `${percentage}%`
                                                }}
                                            />
                                        </div>
                                    </div>
                                )
                            })
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-medium py-12">
                                {t('charts.noData')}
                            </div>
                        )}
                    </div>
                </div>

                {/* Recent Activity Log */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-blue-600" />
                            {t('sections.recentActivity')}
                        </h3>
                        <Link href="/human-resources/activity" className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition flex items-center gap-1">
                            {isVI ? 'Xem tất cả' : 'View all'}
                            <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                    <div className="flex-1 flex flex-col divide-y divide-slate-100">
                        {filteredActivities.length > 0 ? (
                            filteredActivities.map((act) => (
                                <div key={act.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-slate-750 font-medium break-words">
                                            {getLocalizedMessage(act.message)}
                                        </p>
                                        {act.hiring_requests?.position_title && (
                                            <span className="inline-block mt-1 text-[10px] font-bold bg-slate-100 text-slate-500 uppercase px-1.5 py-0.5 rounded">
                                                {act.hiring_requests.position_title}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs text-slate-400 whitespace-nowrap shrink-0 mt-0.5">
                                        {formatDateTime(act.created_at)}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-medium py-12">
                                {t('charts.noData')}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
