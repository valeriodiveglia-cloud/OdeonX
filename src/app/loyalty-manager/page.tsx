'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import { getLoyaltyManagerDictionary } from './_i18n'
import MonthPicker from '@/components/MonthPicker'
import { format } from 'date-fns'
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    BarChart,
    Bar,
    Cell,
    PieChart,
    Pie
} from 'recharts'
import {
    CreditCard,
    Wallet,
    Coins,
    Ticket,
    ArrowUpRight,
    ArrowDownLeft,
    TrendingUp,
    Clock,
    Award,
    Plus,
    Activity,
    Users
} from 'lucide-react'

// Localized dictionary for analytical dashboard terms
const textDict = {
    en: {
        title: "Loyalty Manager Analytics",
        subtitle: "Real-time overview of loyalty tiers, customer prepaid wallets, and voucher metrics.",
        stats: {
            totalCards: "Total Cards",
            prepaidBalance: "Prepaid Wallet Balance",
            pointsOutstanding: "Points Outstanding",
            activeVouchers: "Vouchers Issued",
            usageVal: "Wallet Usage",
            topupVal: "Wallet Top-up",
            redeemedVal: "Redeemed Value",
            voucherRedemption: "Voucher Redemption",
            redemptionRate: "Redemption Rate",
            outstandingDesc: "Active Outstanding Balance",
            pointsDesc: "Total active points in circulation",
            topupDesc: "Prepaid loaded in selected month",
            usageDesc: "Prepaid spent in selected month"
        },
        charts: {
            walletActivity: "Wallet Activity Trends (Top-up vs. Usage)",
            tierDistribution: "Membership Tier Distribution",
            voucherStatus: "Vouchers Status Summary",
            noData: "No data available for this month"
        },
        recentActivity: {
            title: "Recent Transactions",
            card: "Card Number",
            customer: "Customer",
            type: "Type",
            amount: "Amount",
            points: "Points",
            date: "Date",
            noTransactions: "No transactions recorded in this month"
        },
        topCustomers: {
            title: "Top Customers by Spending",
            name: "Customer Name",
            spent: "Total Spent",
            balance: "Wallet Balance",
            noCustomers: "No customer records"
        },
        voucherStats: {
            title: "Voucher Stats",
            donorType: "Donor Distribution",
            restaurant: "Restaurant",
            partner: "Partner",
            customer: "Customer"
        }
    },
    vi: {
        title: "Phân tích chương trình Thành viên",
        subtitle: "Tổng quan thời gian thực về phân bổ hạng thành viên, ví khách hàng và thống kê voucher.",
        stats: {
            totalCards: "Tổng số thẻ",
            prepaidBalance: "Số dư ví thành viên",
            pointsOutstanding: "Điểm tích luỹ hiện tại",
            activeVouchers: "Voucher đã cấp",
            usageVal: "Sử dụng ví",
            topupVal: "Nạp tiền ví",
            redeemedVal: "Giá trị đã quy đổi",
            voucherRedemption: "Quy đổi Voucher",
            redemptionRate: "Tỷ lệ quy đổi",
            outstandingDesc: "Số dư khả dụng hiện tại",
            pointsDesc: "Tổng điểm đang lưu hành",
            topupDesc: "Tiền nạp vào ví trong tháng",
            usageDesc: "Tiền sử dụng ví trong tháng"
        },
        charts: {
            walletActivity: "Xu hướng ví thành viên (Nạp tiền vs Sử dụng)",
            tierDistribution: "Phân bổ hạng thành viên",
            voucherStatus: "Tóm tắt trạng thái Voucher",
            noData: "Không có dữ liệu trong tháng này"
        },
        recentActivity: {
            title: "Giao dịch gần đây",
            card: "Số thẻ",
            customer: "Khách hàng",
            type: "Loại giao dịch",
            amount: "Số tiền",
            points: "Điểm",
            date: "Ngày",
            noTransactions: "Không có giao dịch nào được ghi nhận trong tháng này"
        },
        topCustomers: {
            title: "Khách hàng chi tiêu nhiều nhất",
            name: "Tên khách hàng",
            spent: "Tổng chi tiêu",
            balance: "Số dư ví",
            noCustomers: "Không có hồ sơ khách hàng"
        },
        voucherStats: {
            title: "Thống kê Voucher",
            donorType: "Phân bổ nhà tài trợ",
            restaurant: "Nhà hàng",
            partner: "Đối tác",
            customer: "Khách hàng"
        }
    }
}

export default function LoyaltyManagerDashboard() {
    const { language } = useSettings()
    const t = getLoyaltyManagerDictionary(language)
    const d = language === 'vi' ? textDict.vi : textDict.en

    const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'))
    const [loading, setLoading] = useState(true)
    const [cards, setCards] = useState<any[]>([])
    const [transactions, setTransactions] = useState<any[]>([])
    const [vouchers, setVouchers] = useState<any[]>([])
    const [settings, setSettings] = useState<any>(null)

    const fetchData = async () => {
        setLoading(true)
        try {
            const [cardsRes, txRes, vouchersRes, settingsRes] = await Promise.all([
                supabase.from('loyalty_cards').select('*'),
                supabase.from('loyalty_card_transactions').select('*, loyalty_cards(customer_name, card_number)').order('created_at', { ascending: false }),
                supabase.from('gift_vouchers').select('*'),
                supabase.from('loyalty_settings').select('*').single()
            ])

            if (cardsRes.data) setCards(cardsRes.data)
            if (txRes.data) setTransactions(txRes.data)
            if (vouchersRes.data) setVouchers(vouchersRes.data)
            if (settingsRes.data) {
                const rawClasses = Array.isArray(settingsRes.data.classes) ? settingsRes.data.classes : []
                const classes = rawClasses.map((c: any) => ({
                    ...c,
                    color: c.color || '#3b82f6'
                }))
                setSettings({ ...settingsRes.data, classes })
            }
        } catch (err) {
            console.error('Error fetching dashboard data:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
    }

    // Filter data based on selected month
    const monthData = useMemo(() => {
        const [year, monthVal] = month.split('-').map(Number)
        const startOfMonth = new Date(year, monthVal - 1, 1)
        const endOfMonth = new Date(year, monthVal, 0, 23, 59, 59, 999)

        const monthTx = transactions.filter(tx => {
            const date = new Date(tx.created_at)
            return date >= startOfMonth && date <= endOfMonth
        })

        const monthVouchers = vouchers.filter(v => {
            const date = new Date(v.created_at || v.issued_on)
            return date >= startOfMonth && date <= endOfMonth
        })

        return {
            transactions: monthTx,
            vouchers: monthVouchers,
            year,
            monthVal
        }
    }, [month, transactions, vouchers])

    // Calculate KPI Totals
    const kpiStats = useMemo(() => {
        // Global stats (all cards currently active)
        const totalCardsCount = cards.length
        const totalPrepaidBalance = cards
            .filter(c => c.status !== 'blocked')
            .reduce((sum, c) => sum + (Number(c.balance) || 0), 0)

        const totalPointsOutstanding = cards
            .filter(c => c.status !== 'blocked')
            .reduce((sum, c) => sum + (Number(c.points) || 0), 0)

        // Monthly stats
        const monthTx = monthData.transactions
        const monthTopups = monthTx
            .filter(tx => tx.type === 'topup' && !tx.is_voided)
            .reduce((sum, tx) => sum + (Number(tx.total_amount) || 0), 0)

        const monthUsage = monthTx
            .filter(tx => tx.type === 'usage' && !tx.is_voided)
            .reduce((sum, tx) => sum + (Number(tx.total_amount) || 0), 0)

        // Voucher monthly stats
        const monthV = monthData.vouchers
        const vouchersIssued = monthV.length
        const vouchersRedeemed = monthV.filter(v => v.status === 'redeemed').length
        const vouchersActive = monthV.filter(v => v.status === 'active').length
        
        const redemptionRate = vouchersIssued > 0
            ? Math.round((vouchersRedeemed / vouchersIssued) * 100)
            : 0

        return {
            totalCardsCount,
            totalPrepaidBalance,
            totalPointsOutstanding,
            monthTopups,
            monthUsage,
            vouchersIssued,
            vouchersRedeemed,
            vouchersActive,
            redemptionRate
        }
    }, [cards, monthData])

    // 1. Daily wallet activity timeline (Top-up vs Usage)
    const walletActivityChartData = useMemo(() => {
        const { year, monthVal, transactions: monthTx } = monthData
        const daysInMonth = new Date(year, monthVal, 0).getDate()
        
        const dayMap = Array.from({ length: daysInMonth }, (_, i) => {
            const dayNum = i + 1
            const dayStr = String(dayNum).padStart(2, '0')
            return {
                day: dayStr,
                topup: 0,
                usage: 0
            }
        })

        monthTx.forEach(tx => {
            if (tx.is_voided) return
            const date = new Date(tx.created_at)
            const dayIdx = date.getDate() - 1
            if (dayIdx >= 0 && dayIdx < daysInMonth) {
                if (tx.type === 'topup') {
                    dayMap[dayIdx].topup += Number(tx.total_amount) || 0
                } else if (tx.type === 'usage') {
                    dayMap[dayIdx].usage += Number(tx.total_amount) || 0
                }
            }
        })

        return dayMap
    }, [monthData])

    // 2. Member classes distribution
    const tierDistributionData = useMemo(() => {
        const counts: Record<string, number> = {}
        cards.forEach(c => {
            const cls = c.class || 'Standard'
            counts[cls] = (counts[cls] || 0) + 1
        })

        // Ensure configured classes exist in list even if 0 count
        const configClasses = settings?.classes || []
        configClasses.forEach((c: any) => {
            if (!(c.name in counts)) {
                counts[c.name] = 0
            }
        })

        return Object.entries(counts).map(([name, count]) => {
            const targetClass = settings?.classes?.find((cls: any) => cls.name === name)
            return {
                name,
                count,
                color: targetClass?.color || '#3b82f6'
            }
        }).sort((a, b) => b.count - a.count)
    }, [cards, settings])

    // 3. Vouchers status overview
    const voucherStatusData = useMemo(() => {
        const { vouchers: monthV } = monthData
        const counts = { active: 0, redeemed: 0, expired: 0, blocked: 0 }
        monthV.forEach(v => {
            if (v.status in counts) {
                counts[v.status as keyof typeof counts]++
            }
        })

        return [
            { name: language === 'vi' ? 'Hoạt động' : 'Active', value: counts.active, color: '#10b981' },
            { name: language === 'vi' ? 'Đã dùng' : 'Redeemed', value: counts.redeemed, color: '#3b82f6' },
            { name: language === 'vi' ? 'Hết hạn' : 'Expired', value: counts.expired, color: '#ef4444' },
            { name: language === 'vi' ? 'Bị khoá' : 'Blocked', value: counts.blocked, color: '#6b7280' }
        ].filter(item => item.value > 0)
    }, [monthData, language])

    // 4. Voucher Donor Distribution
    const donorTypeData = useMemo(() => {
        const { vouchers: monthV } = monthData
        const counts = { restaurant: 0, partner: 0, customer: 0 }
        monthV.forEach(v => {
            if (v.donor_type in counts) {
                counts[v.donor_type as keyof typeof counts]++
            }
        })

        return [
            { name: d.voucherStats.restaurant, value: counts.restaurant, color: '#f59e0b' },
            { name: d.voucherStats.partner, value: counts.partner, color: '#8b5cf6' },
            { name: d.voucherStats.customer, value: counts.customer, color: '#ec4899' }
        ].filter(item => item.value > 0)
    }, [monthData, d, language])

    // Top 5 customers by spending
    const top5Customers = useMemo(() => {
        return [...cards]
            .filter(c => c.customer_name)
            .sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))
            .slice(0, 5)
    }, [cards])

    // Recent 5 transactions
    const recentTransactions = useMemo(() => {
        return monthData.transactions.slice(0, 5)
    }, [monthData])

    if (loading && cards.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[500px]">
                <div className="flex flex-col items-center gap-2">
                    <Clock className="w-8 h-8 animate-spin text-blue-600" />
                    <span className="text-slate-500 font-medium">{t.cards.loading}</span>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
            {/* Header (Text White on Dark Blue background) */}
            <header className="mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white sm:text-3xl tracking-tight leading-normal">
                        {d.title}
                    </h1>
                    <p className="mt-1 text-sm text-slate-400">
                        {d.subtitle}
                    </p>
                </div>

                <div className="border-b border-white/10 my-6" />

                {/* Month Picker directly on dark background */}
                <div className="mt-4">
                    <MonthPicker
                        value={month}
                        onChange={setMonth}
                        language={language}
                        colorClass="text-blue-100 hover:text-white"
                        labelColorClass="text-white"
                        iconColorClass="text-blue-200 hover:text-white"
                        className="mb-4"
                    />
                </div>
            </header>

            {/* Stats KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Saldo Outstanding */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
                    <div className="space-y-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{d.stats.prepaidBalance}</span>
                        <h3 className="text-2xl font-bold text-slate-900">{formatCurrency(kpiStats.totalPrepaidBalance)}</h3>
                        <p className="text-xs text-slate-500">{d.stats.outstandingDesc}</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                        <Wallet className="w-6 h-6" />
                    </div>
                </div>

                {/* Points Outstanding */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
                    <div className="space-y-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{d.stats.pointsOutstanding}</span>
                        <h3 className="text-2xl font-bold text-slate-900">{kpiStats.totalPointsOutstanding.toLocaleString()} pts</h3>
                        <p className="text-xs text-slate-500">{d.stats.pointsDesc}</p>
                    </div>
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                        <Coins className="w-6 h-6" />
                    </div>
                </div>

                {/* Monthly Topups */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
                    <div className="space-y-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{d.stats.topupVal}</span>
                        <h3 className="text-2xl font-bold text-green-600">+{formatCurrency(kpiStats.monthTopups)}</h3>
                        <p className="text-xs text-slate-500">{d.stats.topupDesc}</p>
                    </div>
                    <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center shrink-0">
                        <ArrowUpRight className="w-6 h-6" />
                    </div>
                </div>

                {/* Monthly Usage */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
                    <div className="space-y-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{d.stats.usageVal}</span>
                        <h3 className="text-2xl font-bold text-blue-600">-{formatCurrency(kpiStats.monthUsage)}</h3>
                        <p className="text-xs text-slate-500">{d.stats.usageDesc}</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                        <ArrowDownLeft className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Daily Wallet Activity Area Chart */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-sm flex flex-col justify-between lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-blue-600" />
                            {d.charts.walletActivity}
                        </h3>
                    </div>
                    <div className="h-[320px] w-full mt-2">
                        {walletActivityChartData.some(d => d.topup > 0 || d.usage > 0) ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={walletActivityChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorTopup" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} tickLine={false} />
                                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => val >= 1000000 ? `${(val/1000000).toFixed(0)}M` : val.toLocaleString()} />
                                    <Tooltip
                                        formatter={(value: any, name: any) => [
                                            formatCurrency(Number(value)),
                                            name === 'topup' ? d.stats.topupVal : d.stats.usageVal
                                        ]}
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend formatter={(value) => value === 'topup' ? d.stats.topupVal : d.stats.usageVal} wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                    <Area type="monotone" dataKey="topup" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorTopup)" name="topup" />
                                    <Area type="monotone" dataKey="usage" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorUsage)" name="usage" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm italic font-medium">
                                {d.charts.noData}
                            </div>
                        )}
                    </div>
                </div>

                {/* Membership Tiers Bar Chart */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-sm flex flex-col justify-between">
                    <div className="mb-4">
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Award className="w-5 h-5 text-amber-500" />
                            {d.charts.tierDistribution}
                        </h3>
                    </div>
                    <div className="h-[320px] w-full">
                        {tierDistributionData.some(t => t.count > 0) ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={tierDistributionData} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} />
                                    <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} tickLine={false} width={80} />
                                    <Tooltip
                                        formatter={(value) => [`${value} ${language === 'vi' ? 'Khách' : 'Members'}`, 'Count']}
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                    />
                                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
                                        {tierDistributionData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm italic font-medium">
                                {d.charts.noData}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Vouchers Section & Distribution */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Vouchers Stats Overview Card */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-sm flex flex-col justify-between">
                    <div className="space-y-4">
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Ticket className="w-5 h-5 text-purple-600" />
                            {d.stats.voucherRedemption}
                        </h3>
                        <div className="py-2">
                            <div className="flex justify-between items-baseline mb-2">
                                <span className="text-sm font-semibold text-slate-500">{d.stats.redemptionRate}</span>
                                <span className="text-3xl font-extrabold text-slate-900">{kpiStats.redemptionRate}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
                                <div className="bg-purple-600 h-full rounded-full transition-all duration-500" style={{ width: `${kpiStats.redemptionRate}%` }} />
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 mt-4">
                        <div className="space-y-0.5">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{language === 'vi' ? 'Đã Cấp' : 'Issued'}</span>
                            <p className="text-lg font-bold text-slate-800">{kpiStats.vouchersIssued}</p>
                        </div>
                        <div className="space-y-0.5">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{language === 'vi' ? 'Đã Dùng' : 'Redeemed'}</span>
                            <p className="text-lg font-bold text-purple-600">{kpiStats.vouchersRedeemed}</p>
                        </div>
                    </div>
                </div>

                {/* Vouchers Status Pie Chart */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 mb-2">{d.charts.voucherStatus}</h3>
                    </div>
                    <div className="h-[180px] w-full flex items-center justify-center">
                        {voucherStatusData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={voucherStatusData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={45}
                                        outerRadius={70}
                                        paddingAngle={3}
                                        dataKey="value"
                                    >
                                        {voucherStatusData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <span className="text-slate-400 text-sm italic font-medium">{d.charts.noData}</span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center text-xs mt-2">
                        {voucherStatusData.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                <span className="text-slate-500 font-medium">{item.name} ({item.value})</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Voucher Donor Distribution Pie Chart */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 mb-2">{d.voucherStats.donorType}</h3>
                    </div>
                    <div className="h-[180px] w-full flex items-center justify-center">
                        {donorTypeData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={donorTypeData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={45}
                                        outerRadius={70}
                                        paddingAngle={3}
                                        dataKey="value"
                                    >
                                        {donorTypeData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <span className="text-slate-400 text-sm italic font-medium">{d.charts.noData}</span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center text-xs mt-2">
                        {donorTypeData.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                <span className="text-slate-500 font-medium">{item.name} ({item.value})</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom details grids */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Transactions List */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-sm flex flex-col justify-between lg:col-span-2">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-slate-500" />
                            {d.recentActivity.title}
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-100 text-slate-400 font-semibold">
                                        <th className="pb-3 pr-2">{d.recentActivity.date}</th>
                                        <th className="pb-3 pr-2">{d.recentActivity.card}</th>
                                        <th className="pb-3 pr-2">{d.recentActivity.customer}</th>
                                        <th className="pb-3 pr-2">{d.recentActivity.type}</th>
                                        <th className="pb-3 text-right pr-2">{d.recentActivity.amount}</th>
                                        <th className="pb-3 text-right">{d.recentActivity.points}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {recentTransactions.map((tx) => (
                                        <tr key={tx.id} className="text-slate-700">
                                            <td className="py-2.5 pr-2 font-medium text-slate-500">
                                                {format(new Date(tx.created_at), 'dd/MM HH:mm')}
                                            </td>
                                            <td className="py-2.5 pr-2 font-mono font-medium text-blue-600">
                                                {tx.loyalty_cards?.card_number || '—'}
                                            </td>
                                            <td className="py-2.5 pr-2 font-medium text-slate-900 truncate max-w-[120px]">
                                                {tx.loyalty_cards?.customer_name || <span className="text-slate-400 italic">{t.cards.status.unassigned}</span>}
                                            </td>
                                            <td className="py-2.5 pr-2">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                                    tx.type === 'topup' ? 'bg-green-100 text-green-700' :
                                                    tx.type === 'usage' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                                                }`}>
                                                    {tx.type === 'topup' ? d.stats.topupVal :
                                                     tx.type === 'usage' ? d.stats.usageVal : tx.type}
                                                </span>
                                            </td>
                                            <td className={`py-2.5 text-right font-bold pr-2 ${tx.type === 'topup' ? 'text-green-600' : 'text-slate-900'}`}>
                                                {tx.type === 'topup' ? '+' : '-'}{formatCurrency(tx.total_amount || 0)}
                                            </td>
                                            <td className={`py-2.5 text-right font-semibold ${tx.points_change >= 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                                {tx.points_change > 0 ? `+${tx.points_change}` : tx.points_change || 0}
                                            </td>
                                        </tr>
                                    ))}
                                    {recentTransactions.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                                                {d.recentActivity.noTransactions}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Top Spending Customers */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-slate-500" />
                            {d.topCustomers.title}
                        </h3>
                        <div className="space-y-4">
                            {top5Customers.map((customer, idx) => {
                                const matchedClass = settings?.classes?.find((c: any) => c.name === customer.class)
                                return (
                                    <div key={customer.id} className="flex items-center justify-between text-xs border-b border-slate-50 pb-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-bold text-slate-400 w-4">{idx + 1}</span>
                                            <div className="min-w-0">
                                                <p className="font-bold text-slate-900 truncate">{customer.customer_name}</p>
                                                <span
                                                    className="px-1.5 py-0.5 rounded text-[9px] font-semibold text-white mt-0.5 inline-block"
                                                    style={{ backgroundColor: matchedClass?.color || '#3b82f6' }}
                                                >
                                                    {customer.class || 'Standard'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="font-bold text-slate-900">{formatCurrency(customer.total_spent || 0)}</p>
                                            <p className="text-[10px] text-slate-400 font-medium">Bal: {formatCurrency(customer.balance || 0)}</p>
                                        </div>
                                    </div>
                                )
                            })}
                            {top5Customers.length === 0 && (
                                <div className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                                    {d.topCustomers.noCustomers}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
