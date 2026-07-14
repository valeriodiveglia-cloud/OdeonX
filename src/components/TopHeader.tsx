// src/components/TopHeader.tsx
'use client'

import React, { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, X, ChevronDown, ChevronRight, CheckCheck, Briefcase, DollarSign, Handshake, Users, MapPin, Building2, CalendarDays, Clock, Package } from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'
import { supabase } from '@/lib/supabase_shim'

interface Notification {
    id: string
    created_at: string
    module: string
    title_en: string
    title_vi: string
    message_en: string
    message_vi: string
    isRead: boolean
    type?: string
    assetId?: string
    asset?: any
    branch_id?: string | null
}

const moduleLabels: Record<string, { en: string; vi: string; color: string }> = {
    hr: { 
        en: 'Human Resources', 
        vi: 'Nhân sự', 
        color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
    },
    finance: { 
        en: 'Finance', 
        vi: 'Tài chính', 
        color: 'bg-green-500/10 text-green-400 border-green-500/20' 
    },
    crm: { 
        en: 'CRM & Partners', 
        vi: 'CRM & Đối tác', 
        color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
    },
    loyalty: { 
        en: 'Loyalty Program', 
        vi: 'Khách hàng thân thiết', 
        color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' 
    },
    daily_reports: { 
        en: 'Daily Reports & Cash', 
        vi: 'Báo cáo ngày & Quỹ', 
        color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' 
    },
    catering: { 
        en: 'Catering Events', 
        vi: 'Sự kiện Catering', 
        color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' 
    },
    asset_inventory: {
        en: 'Asset Inventory',
        vi: 'Kiểm kê tài sản',
        color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    }
}

const moduleDotColors: Record<string, string> = {
    hr: 'bg-purple-500',
    finance: 'bg-green-500',
    crm: 'bg-blue-500',
    loyalty: 'bg-yellow-500',
    daily_reports: 'bg-orange-500',
    catering: 'bg-indigo-500',
    asset_inventory: 'bg-emerald-500'
}

const moduleIcons: Record<string, React.ComponentType<any>> = {
    hr: Users,
    finance: DollarSign,
    crm: Handshake,
    loyalty: Users,
    daily_reports: MapPin,
    catering: Building2,
    asset_inventory: Package
}

const hrSubcategoryLabels: Record<string, { en: string; vi: string }> = {
    recruitment: {
        en: 'Recruitment & Job Offers',
        vi: 'Tuyển dụng & Thư mời nhận việc'
    },
    management: {
        en: 'Staff Management',
        vi: 'Quản lý nhân sự'
    },
    operational: {
        en: 'Roster & Shifts',
        vi: 'Lịch làm việc & Ca trực'
    },
    time_keeping: {
        en: 'Time Keeping & Attendance',
        vi: 'Chấm công & Điểm danh'
    }
}

const hrSubcategoryOrder = ['recruitment', 'management', 'operational', 'time_keeping']

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

function computePeriodLabel(periodType: string, dateStr: string, offset: number, language = 'en'): string {
    if (!periodType || !dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return periodType;
    const [y, m, day] = parts.map(Number);
    let d = new Date(y, m - 1, day);
    
    const type = periodType.toLowerCase()

    if (type.includes('daily') || type.includes('giornal')) {
        d.setDate(d.getDate() + offset);
        return d.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (type.includes('week') || type.includes('settiman')) {
        d.setDate(d.getDate() + offset * 7);
        const dayOfWeek = d.getDay();
        const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const startOfWeek = new Date(y, m - 1, diff);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        return `${startOfWeek.getDate()} ${startOfWeek.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short' })} - ${endOfWeek.getDate()} ${endOfWeek.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', year: 'numeric' })}`;
    }
    if (type.includes('month') || type.includes('mensil')) {
        d.setMonth(d.getMonth() + offset);
        return d.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' });
    }
    if (type.includes('quarter') || type.includes('trimestr')) {
        d.setMonth(d.getMonth() + offset * 3);
        const q = Math.floor(d.getMonth() / 3) + 1;
        return language === 'vi' ? `Quý ${q} ${d.getFullYear()}` : `Q${q} ${d.getFullYear()}`;
    }
    if (type.includes('semi-annual') || type.includes('semestr')) {
        d.setMonth(d.getMonth() + offset * 6);
        const h = Math.floor(d.getMonth() / 6) + 1;
        return language === 'vi' ? `Nửa năm ${h} ${d.getFullYear()}` : `H${h} ${d.getFullYear()}`;
    }
    if (type.includes('annual') || type.includes('annua')) {
        d.setFullYear(d.getFullYear() + offset);
        return language === 'vi' ? `Năm ${d.getFullYear()}` : `${d.getFullYear()}`;
    }
    return '';
}

const getHrSubcategory = (n: Notification): string => {
    if (n.module === 'operational') return 'operational'
    if (n.module === 'time_keeping') return 'time_keeping'
    if (n.module === 'recruitment' || n.module === 'management' || n.module === 'hr') {
        const titleUpper = (n.title_en || '').toUpperCase()
        const msgUpper = (n.message_en || '').toUpperCase()
        const isManagement = 
            titleUpper.includes('WARNING') || 
            titleUpper.includes('FINE') || 
            titleUpper.includes('AWARD') || 
            titleUpper.includes('CONTRACT') || 
            titleUpper.includes('SALARY') || 
            titleUpper.includes('ONBOARD') || 
            titleUpper.includes('ACTIVE') || 
            titleUpper.includes('INFO') || 
            titleUpper.includes('BANK') || 
            titleUpper.includes('ASSET') || 
            titleUpper.includes('DOCUMENT') ||
            titleUpper.includes('PERFORMANCE') ||
            titleUpper.includes('REVIEW') ||
            msgUpper.includes('PROMOTED') ||
            msgUpper.includes('SALARY UPDATE')
        return isManagement ? 'management' : 'recruitment'
    }
    return 'recruitment' // default fallback per HR
}

const formatRole = (role: string | null) => {
    if (!role) return ''
    return role.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const getCalendarDay = (dateStr: string): string => {
    try {
        const d = new Date(dateStr)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    } catch {
        return dateStr
    }
}

const formatCalendarDay = (dateStr: string) => {
    try {
        const date = new Date(dateStr)
        const day = String(date.getDate()).padStart(2, '0')
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const year = date.getFullYear()
        return `${day}/${month}/${year}`
    } catch {
        return dateStr
    }
}

const formatTimeOnly = (dateStr: string) => {
    try {
        const date = new Date(dateStr)
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${hours}:${minutes}`
    } catch {
        return dateStr
    }
}

const groupDailyReports = (notifs: Notification[]) => {
    const groups: Record<string, Notification[]> = {}
    const orderedKeys: string[] = []

    notifs.forEach(n => {
        const day = getCalendarDay(n.created_at)
        const key = n.branch_id ? `${n.branch_id}_${day}` : `single_${n.id}`
        
        if (!groups[key]) {
            groups[key] = []
            orderedKeys.push(key)
        }
        groups[key].push(n)
    })

    return { groups, orderedKeys }
}

export default function TopHeader() {
    const pathname = usePathname()
    const { language, hrReviewFrequency } = useSettings()
    
    const [isOpen, setIsOpen] = useState(false)
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({})
    const [loading, setLoading] = useState(false)
    const [userDisplayName, setUserDisplayName] = useState<string | null>(null)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [userBranches, setUserBranches] = useState<string[]>([])
    const [branchesMap, setBranchesMap] = useState<Record<string, string>>({})
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

    const toggleGroup = (groupKey: string) => {
        setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }))
    }

    const isLocalNotificationRead = (id: string) => {
        if (typeof window === 'undefined') return false
        try {
            const stored = localStorage.getItem('odds-local-read-notifications')
            if (!stored) return false
            const readList = JSON.parse(stored)
            return Array.isArray(readList) && readList.includes(id)
        } catch {
            return false
        }
    }

    // Escludi la campanella e l'header sulla dashboard principale, login e portali partner/staff
    const isExcludedRoute = 
        pathname === '/login' || 
        pathname === '/' || 
        pathname?.startsWith('/partner-portal') ||
        pathname?.startsWith('/staff-portal')

    const isDashboardRoute = pathname === '/dashboard'

    const isVI = language === 'vi'

    // Carica dati utente loggato
    useEffect(() => {
        if (isExcludedRoute) return
        const fetchUserData = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const { data: acc } = await supabase
                        .from('app_accounts')
                        .select('name, role, branches')
                        .eq('user_id', user.id)
                        .single()
                    setUserDisplayName(acc?.name || user.email || null)
                    setUserRole(acc?.role || null)
                    setUserBranches(acc?.branches || [])
                }
            } catch (err) {
                console.warn('Could not fetch user details for TopHeader:', err)
            }
        }
        fetchUserData()
    }, [isExcludedRoute])

    // Carica la mappa delle filiali per risolvere i branch_id in nomi
    useEffect(() => {
        if (isExcludedRoute) return
        const fetchBranches = async () => {
            try {
                const { data, error } = await supabase
                    .from('provider_branches')
                    .select('id, name')
                if (error) throw error
                if (data) {
                    const map: Record<string, string> = {}
                    data.forEach((b: any) => {
                        map[b.id] = b.name
                    })
                    setBranchesMap(map)
                }
            } catch (err) {
                console.warn('Error fetching branches for TopHeader:', err)
            }
        }
        fetchBranches()
    }, [isExcludedRoute])

    const isCoreModule = 
        pathname?.startsWith('/materials') ||
        pathname?.startsWith('/recipes') ||
        pathname?.startsWith('/equipment') ||
        pathname?.startsWith('/suppliers') ||
        pathname === '/settings' ||
        pathname?.startsWith('/settings/')

    const headerBgClass = "bg-gradient-to-b from-slate-800 to-slate-900 border-b border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)]"

    // Gestione della classe nel body/html per regolare il padding-top del main
    useEffect(() => {
        const root = document.documentElement
        if (!isExcludedRoute && !isDashboardRoute) {
            root.classList.add('has-top-header')
        } else {
            root.classList.remove('has-top-header')
        }
        return () => {
            root.classList.remove('has-top-header')
        }
    }, [isExcludedRoute, isDashboardRoute])

    // Carica le notifiche dal server
    const fetchNotifications = async () => {
        try {
            setLoading(true)
            const res = await fetch('/api/notifications')
            if (res.status === 401 || res.status === 403) {
                setNotifications([])
                return
            }
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || `HTTP error! status: ${res.status}`)
            }
            const data = await res.json()
            setNotifications(data.notifications || [])
        } catch (err) {
            console.warn('Could not load notifications:', err)
        } finally {
            setLoading(false)
        }
    }

    // Carica periodicamente (ogni 60 secondi)
    useEffect(() => {
        if (isExcludedRoute) return
        fetchNotifications()
        fetchAssetNotifications()
        fetchPerformanceNotifications()

        const interval = setInterval(() => {
            fetchNotifications()
            fetchAssetNotifications()
            fetchPerformanceNotifications()
        }, 60000)
        return () => clearInterval(interval)
    }, [isExcludedRoute, userRole, userBranches, hrReviewFrequency])

    // Forza il ricaricamento quando si apre il drawer
    useEffect(() => {
        if (isOpen) {
            fetchNotifications()
            fetchAssetNotifications()
            fetchPerformanceNotifications()
        }
    }, [isOpen])

    const [assetNotifications, setAssetNotifications] = useState<Notification[]>([])
    const [perfNotification, setPerfNotification] = useState<Notification | null>(null)

    const fetchAssetNotifications = async () => {
        if (isExcludedRoute) return
        try {
            // Leggiamo gli asset in transito direttamente da Supabase
            const { data: transitAssets, error } = await supabase
                .from('assets')
                .select('*')
                .eq('status', 'in_transit')
            
            if (error) throw error
            if (!transitAssets) {
                setAssetNotifications([])
                return
            }

            // Otteniamo il branchName corrente dall'URL
            const params = new URLSearchParams(window.location.search)
            const urlBranch = params.get('branchName')

            const notifs: Notification[] = []

            transitAssets.forEach((a: any) => {
                const isSender = urlBranch && urlBranch !== 'all' 
                    ? a.branch === urlBranch 
                    : (!userRole || ['owner', 'admin'].includes(userRole) || userBranches.includes(a.branch) || userBranches.includes(String(a.branch)))

                const isReceiver = urlBranch && urlBranch !== 'all'
                    ? a.target_branch === urlBranch
                    : (!userRole || ['owner', 'admin'].includes(userRole) || userBranches.includes(a.target_branch) || userBranches.includes(String(a.target_branch)))

                if (isSender) {
                    const notifId = `asset-send-${a.id}-${a.updated_at || ''}`
                    notifs.push({
                        id: notifId,
                        created_at: a.updated_at || new Date().toISOString(),
                        module: 'asset_inventory',
                        type: 'sender_reminder',
                        assetId: a.id,
                        title_en: 'Asset Outgoing Transfer',
                        title_vi: 'Tài sản đang chuyển đi',
                        message_en: `Asset "${a.name}" is in transit to ${a.target_branch || 'target branch'}. Waiting for delivery confirmation.`,
                        message_vi: `Tài sản "${a.name}" đang được chuyển đến ${a.target_branch || 'chi nhánh đích'}. Chờ xác nhận nhận.`,
                        isRead: isLocalNotificationRead(notifId)
                    })
                }

                if (isReceiver) {
                    const notifId = `asset-recv-${a.id}-${a.updated_at || ''}`
                    notifs.push({
                        id: notifId,
                        created_at: a.updated_at || new Date().toISOString(),
                        module: 'asset_inventory',
                        type: 'receiver_alert',
                        assetId: a.id,
                        title_en: 'Asset Incoming Transfer',
                        title_vi: 'Yêu cầu nhận tài sản',
                        message_en: `Asset "${a.name}" is arriving from ${a.branch}. Confirm receipt.`,
                        message_vi: `Tài sản "${a.name}" đang được chuyển đến từ ${a.branch}. Xác nhận đã nhận.`,
                        isRead: isLocalNotificationRead(notifId),
                        asset: a
                    })
                }
            })

            setAssetNotifications(notifs)
        } catch (err) {
            console.warn('Error fetching transit assets for notifications:', err)
        }
    }

    const handleConfirmAssetReceipt = async (assetId: string, currentBranch: string) => {
        try {
            // 1. Carica l'asset corrente da DB
            const { data: asset, error: fetchErr } = await supabase
                .from('assets')
                .select('*')
                .eq('id', assetId)
                .single()
            
            if (fetchErr) throw fetchErr
            if (!asset) return

            const finalBranch = asset.target_branch || currentBranch

            // 2. Esegui update su Supabase
            const { error: updErr } = await supabase
                .from('assets')
                .update({
                    status: 'active',
                    branch: finalBranch,
                    target_branch: null,
                    transfer_date: null,
                    transfer_by: null
                })
                .eq('id', assetId)
            
            if (updErr) throw updErr

            // 3. Esegui insert log su Supabase
            const { error: logErr } = await supabase
                .from('asset_logs')
                .insert({
                    action: 'TRANSFER_RECEIVE',
                    details: `Received asset '${asset.name}' at ${finalBranch}`,
                    user: userDisplayName || 'Staff',
                    asset_id: assetId,
                    asset_name: asset.name
                })
            
            if (logErr) throw logErr

            // 4. Emetti gli eventi personalizzati per aggiornare in tempo reale la pagina e il drawer
            window.dispatchEvent(new CustomEvent('asset-received', { detail: { assetId } }))
            fetchAssetNotifications()
        } catch (err) {
            console.error('Error confirming asset receipt:', err)
        }
    }

    // Ascolta i cambiamenti per ricaricare le notifiche asset
    useEffect(() => {
        window.addEventListener('assets-updated', fetchAssetNotifications)
        window.addEventListener('asset-received', fetchAssetNotifications)
        return () => {
            window.removeEventListener('assets-updated', fetchAssetNotifications)
            window.removeEventListener('asset-received', fetchAssetNotifications)
        }
    }, [userRole, userBranches])

    const fetchPerformanceNotifications = async () => {
        if (isExcludedRoute || !userRole || !['owner', 'admin'].includes(userRole)) {
            setPerfNotification(null)
            return
        }
        try {
            const today = new Date().toISOString().slice(0, 10)
            const frequency = hrReviewFrequency || 'Quarterly'
            const dbPeriod = computePeriodLabel(frequency, today, 0, 'en')
            const displayPeriod = computePeriodLabel(frequency, today, 0, language)
            
            // Otteniamo la data di fine periodo
            const { end: periodEnd } = getPeriodDates(frequency, today, 0)
            const periodEndStr = periodEnd.toISOString().slice(0, 10)

            // Carichiamo lo staff attivo
            const { data: staffList, error: staffErr } = await supabase
                .from('hr_staff')
                .select('id, start_date')
                .eq('status', 'active')
            
            if (staffErr) throw staffErr

            // Carichiamo le valutazioni già fatte per il periodo corrente
            const { data: reviews, error: reviewsErr } = await supabase
                .from('hr_staff_performance')
                .select('staff_id')
                .eq('period', dbPeriod)
            
            if (reviewsErr) throw reviewsErr

            const doneStaffIds = new Set((reviews || []).map(r => r.staff_id))
            
            // Filtriamo lo staff che deve essere valutato
            const pendingCount = (staffList || []).filter(s => {
                if (s.start_date && s.start_date > periodEndStr) return false
                return !doneStaffIds.has(s.id)
            }).length

            if (pendingCount > 0) {
                const notifId = `hr-performance-pending-${dbPeriod}-${pendingCount}`
                setPerfNotification({
                    id: notifId,
                    created_at: new Date().toISOString(),
                    module: 'hr',
                    title_en: 'Performance Reviews Pending',
                    title_vi: 'Đánh giá hiệu suất đang chờ',
                    message_en: `There are ${pendingCount} active staff members pending performance reviews for ${displayPeriod}.`,
                    message_vi: `Có ${pendingCount} nhân viên chưa được đánh giá hiệu suất cho chu kỳ ${displayPeriod}.`,
                    isRead: isLocalNotificationRead(notifId)
                })
            } else {
                setPerfNotification(null)
            }
        } catch (err) {
            console.warn('Error fetching performance pending reviews:', err)
        }
    }

    // Ascolta i cambiamenti per ricaricare le notifiche performance
    useEffect(() => {
        window.addEventListener('performance-updated', fetchPerformanceNotifications)
        return () => {
            window.removeEventListener('performance-updated', fetchPerformanceNotifications)
        }
    }, [userRole, hrReviewFrequency])

    // Ascolta l'evento per aprire il drawer delle notifiche
    useEffect(() => {
        const handleOpen = () => setIsOpen(true)
        window.addEventListener('open-notifications-drawer', handleOpen)
        return () => window.removeEventListener('open-notifications-drawer', handleOpen)
    }, [])

    // Emette il conteggio delle notifiche non lette quando cambia lo stato
    useEffect(() => {
        const allNotifications = [...notifications, ...assetNotifications, ...(perfNotification ? [perfNotification] : [])]
        const totalUnread = allNotifications.filter(n => !n.isRead).length
        window.dispatchEvent(new CustomEvent('notifications-unread-count', { detail: { count: totalUnread } }))
    }, [notifications, assetNotifications, perfNotification])

    // Ascolta las richieste immediate del conteggio corrente delle notifiche non lette
    useEffect(() => {
        const handleRequest = () => {
            const allNotifications = [...notifications, ...assetNotifications, ...(perfNotification ? [perfNotification] : [])]
            const totalUnread = allNotifications.filter(n => !n.isRead).length
            window.dispatchEvent(new CustomEvent('notifications-unread-count', { detail: { count: totalUnread } }))
        }
        window.addEventListener('request-notifications-unread-count', handleRequest)
        return () => window.removeEventListener('request-notifications-unread-count', handleRequest)
    }, [notifications, assetNotifications, perfNotification])

    if (isExcludedRoute) return null

    // Unione notifiche da DB e notifiche dinamiche locali degli asset e delle performance
    const allNotifications = [
        ...notifications,
        ...assetNotifications,
        ...(perfNotification ? [perfNotification] : [])
    ]

    // Raggruppa le notifiche per modulo (unificando quelle HR sotto 'hr')
    const hrModules = ['recruitment', 'management', 'operational', 'time_keeping', 'hr']
    const grouped = allNotifications.reduce((acc, n) => {
        const moduleKey = hrModules.includes(n.module) ? 'hr' : n.module
        if (!acc[moduleKey]) acc[moduleKey] = []
        acc[moduleKey].push(n)
        return acc
    }, {} as Record<string, Notification[]>)

    // Calcola il numero totale di notifiche non lette
    const totalUnread = allNotifications.filter(n => !n.isRead).length

    // Segna come lette le notifiche specificate
    const markAsRead = async (ids: string[]) => {
        if (ids.length === 0) return
        
        // Filtriamo le notifiche reali (quelle del database che hanno un formato UUID valido)
        const dbIds = ids.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
        
        // Filtriamo le notifiche virtuali (tutti gli altri ID, come quelli degli asset o delle performance)
        const localIds = ids.filter(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
        
        if (localIds.length > 0) {
            try {
                const stored = localStorage.getItem('odds-local-read-notifications')
                const readList = stored ? JSON.parse(stored) : []
                const updatedList = Array.from(new Set([...readList, ...localIds]))
                localStorage.setItem('odds-local-read-notifications', JSON.stringify(updatedList))
                
                // Aggiorniamo ottimisticamente lo stato locale
                setAssetNotifications(prev => prev.map(n => localIds.includes(n.id) ? { ...n, isRead: true } : n))
                setPerfNotification(prev => {
                    if (prev && localIds.includes(prev.id)) {
                        return { ...prev, isRead: true }
                    }
                    return prev
                })
            } catch (err) {
                console.warn('Error saving local read notifications:', err)
            }
        }

        try {
            // Ottimizzazione UI ottimistica per le sole notifiche a DB
            setNotifications(prev => prev.map(n => dbIds.includes(n.id) ? { ...n, isRead: true } : n))
            
            if (dbIds.length > 0) {
                const res = await fetch('/api/notifications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notificationIds: dbIds })
                })
                if (!res.ok) throw new Error('Failed to mark notifications as read')
            }
        } catch (err) {
            console.error('Error marking notifications as read:', err)
            fetchNotifications()
        }
    }

    const handleNotificationClick = (n: Notification) => {
        if (n.id.startsWith('hr-performance-pending')) {
            setIsOpen(false)
            markAsRead([n.id])
            window.location.href = '/human-resources/management/performance'
            return
        }
        if (!n.isRead) {
            markAsRead([n.id])
        }
    }

    const toggleModule = (module: string) => {
        setExpandedModules(prev => ({ ...prev, [module]: !prev[module] }))
    }

    // Formatta la data
    const formatTime = (dateStr: string) => {
        try {
            const date = new Date(dateStr)
            const day = String(date.getDate()).padStart(2, '0')
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const year = date.getFullYear()
            const hours = String(date.getHours()).padStart(2, '0')
            const minutes = String(date.getMinutes()).padStart(2, '0')
            return `${day}/${month}/${year} ${hours}:${minutes}`
        } catch {
            return dateStr
        }
    }

    return (
        <>
            {/* Barra superiore ad L */}
            {!isDashboardRoute && (
                <header 
                    className={`fixed top-0 right-0 z-30 h-16 flex items-center justify-end px-6 gap-4 transition-all duration-150 ease-out ${headerBgClass}`}
                    style={{ left: 'var(--leftnav-w, 0px)' }}
                >
                    {userDisplayName && (
                        <>
                            <div className="flex flex-col items-end hidden sm:flex">
                                <span className="text-[13px] font-medium text-slate-200 leading-tight">
                                    {userDisplayName}
                                </span>
                                {userRole && (
                                    <span className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase leading-none mt-0.5">
                                        {formatRole(userRole)}
                                    </span>
                                )}
                            </div>
                            <div className="h-6 w-px bg-white/10 hidden sm:block" />
                        </>
                    )}
                    <button
                        onClick={() => setIsOpen(true)}
                        className="relative p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white flex items-center justify-center transition-all duration-200 cursor-pointer group hover:scale-105 active:scale-95"
                        title={isVI ? 'Thông báo' : 'Notifications'}
                    >
                        <Bell className="w-5 h-5 text-slate-350 group-hover:text-white transition-colors" />
                        {totalUnread > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1.5 rounded-full bg-red-500 border border-slate-950 flex items-center justify-center text-[10px] font-extrabold text-white animate-pulse">
                                {totalUnread}
                            </span>
                        )}
                    </button>
                </header>
            )}

            {/* Drawer delle notifiche */}
            <div 
                className={`fixed inset-y-0 right-0 z-50 w-85 border-l border-white/15 shadow-[-5px_0_30px_rgba(59,130,246,0.12)] transition-all duration-300 ease-out flex flex-col text-white
                    ${isOpen 
                        ? 'translate-x-0 opacity-100' 
                        : 'translate-x-full opacity-0 pointer-events-none'
                    }`}
                style={{
                    background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.55) 50%, rgba(11, 21, 48, 0.6) 100%)',
                    backdropFilter: 'blur(30px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(30px) saturate(180%)'
                }}
            >
                {/* Header del drawer */}
                <div className="h-16 px-4 flex items-center justify-between border-b border-white/10" style={{ background: 'rgba(255, 255, 255, 0.01)' }}>
                    <span className="font-bold text-slate-100 flex items-center gap-2 text-sm uppercase tracking-wider">
                        <Bell className="w-4 h-4 text-blue-400" />
                        {isVI ? 'Trung tâm thông báo' : 'Notification Center'}
                    </span>
                    <div className="flex items-center gap-2">
                        {totalUnread > 0 && (
                            <button
                                onClick={() => markAsRead(allNotifications.filter(n => !n.isRead).map(n => n.id))}
                                className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white cursor-pointer transition-colors"
                                title={isVI ? 'Đánh dấu tất cả đã đọc' : 'Mark all as read'}
                            >
                                <CheckCheck className="w-4 h-4 text-green-400" />
                            </button>
                        )}
                        <button 
                            onClick={() => setIsOpen(false)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Lista notifiche ad Accordion */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {allNotifications.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                            <Bell className="w-8 h-8 opacity-20" />
                            <span className="text-xs font-semibold">
                                {isVI ? 'Không có thông báo mới' : 'No new notifications'}
                            </span>
                        </div>
                    ) : (
                        Object.keys(grouped).map((moduleKey) => {
                            const moduleNotifs = grouped[moduleKey]
                            const moduleUnread = moduleNotifs.filter(n => !n.isRead)
                            const isExpanded = !!expandedModules[moduleKey]
                            const label = moduleLabels[moduleKey] || { en: moduleKey, vi: moduleKey }

                            return (
                                <div 
                                    key={moduleKey} 
                                    className="rounded-2xl border border-white/[0.08] overflow-hidden transition-all duration-200 shadow-sm"
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.04)',
                                        backdropFilter: 'blur(12px)',
                                        WebkitBackdropFilter: 'blur(12px)'
                                    }}
                                >
                                    {/* Intestazione Accordion */}
                                    <div 
                                        onClick={() => toggleModule(moduleKey)}
                                        className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors select-none"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            {isExpanded ? (
                                                <ChevronDown className="w-4 h-4 text-slate-400 transition-transform duration-200" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4 text-slate-400 transition-transform duration-200" />
                                            )}
                                            {/* Colored module icon on the left of the title */}
                                            {(() => {
                                                const IconComp = moduleIcons[moduleKey]
                                                const dotColorClass = moduleDotColors[moduleKey] || 'bg-slate-400'
                                                const textColorClass = dotColorClass.replace('bg-', 'text-')
                                                return IconComp ? (
                                                    <IconComp className={`w-4 h-4 ${textColorClass} shrink-0`} />
                                                ) : null
                                            })()}
                                            <span className="text-xs font-bold text-slate-200">
                                                {isVI ? label.vi : label.en}
                                            </span>
                                            {moduleUnread.length > 0 && (
                                                <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[9px] font-bold border border-red-500/10">
                                                    {moduleUnread.length}
                                                </span>
                                            )}
                                        </div>
                                        
                                        {/* Segna tutto il modulo come letto */}
                                        {moduleUnread.length > 0 && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    markAsRead(moduleUnread.map(n => n.id))
                                                }}
                                                className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-green-400 transition-colors"
                                                title={isVI ? 'Đánh dấu nhóm này đã đọc' : 'Mark group as read'}
                                            >
                                                <CheckCheck className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Contenuto Accordion */}
                                    {isExpanded && (
                                        <div 
                                            className="border-t border-white/[0.08] divide-y divide-white/5"
                                            style={{ background: 'rgba(0, 0, 0, 0.15)' }}
                                        >
                                            {moduleKey === 'hr' ? (
                                                (() => {
                                                    const subGrouped: Record<string, Notification[]> = {
                                                        recruitment: [],
                                                        management: [],
                                                        operational: [],
                                                        time_keeping: []
                                                    }
                                                    moduleNotifs.forEach(n => {
                                                        const subKey = getHrSubcategory(n)
                                                        if (subGrouped[subKey]) {
                                                            subGrouped[subKey].push(n)
                                                        } else {
                                                            subGrouped.recruitment.push(n)
                                                        }
                                                    })

                                                    return hrSubcategoryOrder.map(subKey => {
                                                        const subNotifs = subGrouped[subKey]
                                                        if (subNotifs.length === 0) return null
                                                        const subLabel = hrSubcategoryLabels[subKey] || { en: subKey, vi: subKey }

                                                        return (
                                                            <div key={subKey} className="flex flex-col">
                                                                {/* Titolo Sottocategoria non espandibile */}
                                                                <div className="px-3.5 py-2 bg-white/[0.02] text-[10px] font-extrabold text-slate-400 tracking-wider uppercase border-b border-white/5 flex items-center gap-1.5">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                                                    {isVI ? subLabel.vi : subLabel.en}
                                                                </div>
                                                                
                                                                {/* Notifiche della sottocategoria */}
                                                                <div className="divide-y divide-white/5">
                                                                    {subNotifs.map((n) => (
                                                                        <div 
                                                                            key={n.id} 
                                                                            onClick={() => handleNotificationClick(n)}
                                                                            className={`p-3.5 flex flex-col gap-1.5 transition-all relative
                                                                                ${n.isRead 
                                                                                    ? 'opacity-60 hover:bg-white/[0.02]' 
                                                                                    : 'bg-blue-500/[0.04] hover:bg-blue-500/[0.08] cursor-pointer'
                                                                                }`}
                                                                        >
                                                                            {/* Indicatore Notifica Non Letta */}
                                                                            {!n.isRead && (
                                                                                <span className="absolute top-4 left-2.5 w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                                                                            )}

                                                                            <div className="flex justify-between items-center pl-2.5">
                                                                                <span className="text-[10px] font-bold text-slate-100 leading-none">
                                                                                    {isVI ? n.title_vi : n.title_en}
                                                                                </span>
                                                                                <span className="text-[9px] text-slate-500 font-semibold leading-none">
                                                                                    {formatTime(n.created_at)}
                                                                                </span>
                                                                            </div>

                                                                            <p className="text-xs text-slate-300 leading-normal pl-2.5 font-medium">
                                                                                {isVI ? n.message_vi : n.message_en}
                                                                            </p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )
                                                    })
                                                })()
                                            ) : moduleKey === 'daily_reports' ? (
                                                (() => {
                                                    const { groups, orderedKeys } = groupDailyReports(moduleNotifs)

                                                    return orderedKeys.map((groupKey) => {
                                                        const groupNotifs = groups[groupKey]
                                                        const isGroup = groupNotifs.length > 1
                                                        
                                                        if (!isGroup) {
                                                            const n = groupNotifs[0]
                                                            return (
                                                                <div 
                                                                    key={n.id} 
                                                                    onClick={() => handleNotificationClick(n)}
                                                                    className={`p-3.5 flex flex-col gap-1.5 transition-all relative
                                                                        ${n.isRead 
                                                                            ? 'opacity-60 hover:bg-white/[0.02]' 
                                                                            : 'bg-blue-500/[0.04] hover:bg-blue-500/[0.08] cursor-pointer'
                                                                        }`}
                                                                >
                                                                    {/* Indicatore Notifica Non Letta */}
                                                                    {!n.isRead && (
                                                                        <span className="absolute top-4 left-2.5 w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                                                                    )}

                                                                    <div className="flex justify-between items-center pl-2.5">
                                                                        <span className="text-[10px] font-bold text-slate-100 leading-none">
                                                                            {isVI ? n.title_vi : n.title_en}
                                                                        </span>
                                                                        <span className="text-[9px] text-slate-500 font-semibold leading-none">
                                                                            {formatTime(n.created_at)}
                                                                        </span>
                                                                    </div>

                                                                    <p className="text-xs text-slate-300 leading-normal pl-2.5 font-medium">
                                                                        {isVI ? n.message_vi : n.message_en}
                                                                    </p>
                                                                </div>
                                                            )
                                                        }

                                                        const firstNotif = groupNotifs[0]
                                                        const branchId = firstNotif.branch_id
                                                        const branchName = branchId ? (branchesMap[branchId] || firstNotif.message_en.split('branch: ')[1]?.split(' (')[0] || firstNotif.message_vi.split('chi nhánh: ')[1]?.split(' (')[0] || 'Daily Reports & Cash') : 'Daily Reports & Cash'
                                                        const unreadChildren = groupNotifs.filter(c => !c.isRead)
                                                        const hasUnread = unreadChildren.length > 0
                                                        const isGroupExpanded = !!expandedGroups[groupKey]
                                                        const dateLabel = formatCalendarDay(firstNotif.created_at)

                                                        return (
                                                            <div key={groupKey} className="flex flex-col border-b border-white/5 last:border-b-0">
                                                                {/* Intestazione del Gruppo */}
                                                                <div 
                                                                    onClick={() => toggleGroup(groupKey)}
                                                                    className={`p-3.5 flex items-center justify-between cursor-pointer transition-all select-none
                                                                        ${hasUnread 
                                                                            ? 'bg-blue-500/[0.03] hover:bg-blue-500/[0.06]' 
                                                                            : 'hover:bg-white/[0.02]'
                                                                        }`}
                                                                >
                                                                    <div className="flex items-center gap-2 pl-2">
                                                                        {isGroupExpanded ? (
                                                                            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                                                        ) : (
                                                                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                                                        )}
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <span className="text-[11px] font-extrabold text-slate-200">
                                                                                {branchName}
                                                                            </span>
                                                                            <span className="text-[9px] text-slate-400 font-semibold">
                                                                                {dateLabel} • {groupNotifs.length} {isVI ? 'hoạt động' : 'updates'}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center gap-2">
                                                                        {hasUnread && (
                                                                            <>
                                                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation()
                                                                                        markAsRead(unreadChildren.map(c => c.id))
                                                                                    }}
                                                                                    className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-green-400 transition-colors"
                                                                                    title={isVI ? 'Đánh dấu nhóm này đã đọc' : 'Mark group as read'}
                                                                                >
                                                                                    <CheckCheck className="w-3.5 h-3.5" />
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Sotto-notifiche espandibili */}
                                                                {isGroupExpanded && (
                                                                    <div className="bg-black/25 divide-y divide-white/5 border-t border-white/5 pl-4">
                                                                        {groupNotifs.map((c) => (
                                                                            <div 
                                                                                key={c.id}
                                                                                onClick={() => handleNotificationClick(c)}
                                                                                className={`p-3 pr-4 flex flex-col gap-1 transition-all relative
                                                                                    ${c.isRead 
                                                                                        ? 'opacity-60 hover:bg-white/[0.01]' 
                                                                                        : 'bg-blue-500/[0.02] hover:bg-blue-500/[0.05] cursor-pointer'
                                                                                    }`}
                                                                            >
                                                                                {!c.isRead && (
                                                                                    <span className="absolute top-3.5 left-2 w-1 h-1 rounded-full bg-blue-400 animate-pulse"></span>
                                                                                )}
                                                                                
                                                                                <div className="flex justify-between items-center pl-2">
                                                                                    <span className="text-[10px] font-bold text-slate-350">
                                                                                        {isVI ? c.title_vi : c.title_en}
                                                                                    </span>
                                                                                    <span className="text-[9px] text-slate-500 font-semibold">
                                                                                        {formatTimeOnly(c.created_at)}
                                                                                    </span>
                                                                                </div>
                                                                                <p className="text-xs text-slate-400 leading-normal pl-2 font-medium">
                                                                                    {isVI ? c.message_vi : c.message_en}
                                                                                </p>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    })
                                                })()
                                            ) : (
                                                moduleNotifs.map((n) => (
                                                    <div 
                                                        key={n.id} 
                                                        onClick={() => handleNotificationClick(n)}
                                                        className={`p-3.5 flex flex-col gap-1.5 transition-all relative
                                                            ${n.isRead 
                                                                ? 'opacity-60 hover:bg-white/[0.02]' 
                                                                : 'bg-blue-500/[0.04] hover:bg-blue-500/[0.08] cursor-pointer'
                                                            }`}
                                                    >
                                                        {/* Indicatore Notifica Non Letta */}
                                                        {!n.isRead && (
                                                            <span className="absolute top-4 left-2.5 w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                                                        )}

                                                        <div className="flex justify-between items-center pl-2.5">
                                                            <span className="text-[10px] font-bold text-slate-100 leading-none">
                                                                {isVI ? n.title_vi : n.title_en}
                                                            </span>
                                                            <span className="text-[9px] text-slate-500 font-semibold leading-none">
                                                                {formatTime(n.created_at)}
                                                            </span>
                                                        </div>

                                                        <p className="text-xs text-slate-300 leading-normal pl-2.5 font-medium">
                                                            {isVI ? n.message_vi : n.message_en}
                                                        </p>

                                                        {/* Pulsante di Conferma Ricezione per Asset Inventory */}
                                                        {n.module === 'asset_inventory' && n.type === 'receiver_alert' && userRole !== 'accountant' && (
                                                            <div className="pl-2.5 pt-1">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        handleConfirmAssetReceipt(n.assetId!, n.asset?.target_branch || '')
                                                                    }}
                                                                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-extrabold rounded-lg transition-colors cursor-pointer shadow-sm active:scale-95 duration-100"
                                                                >
                                                                    <CheckCheck className="w-3.5 h-3.5" />
                                                                    {isVI ? 'Xác nhận đã nhận' : 'Confirm Receipt'}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Backdrop overlay */}
            {isOpen && (
                <div 
                    className="fixed inset-0 z-40 bg-black/35 backdrop-blur-3xs cursor-pointer"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </>
    )
}
