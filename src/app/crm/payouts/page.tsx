'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Search, Download, CreditCard, Clock, CheckCircle2, RefreshCcw, Calendar, FileText, X, Cog } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { CRMPayout } from '@/types/crm'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
import { useRouter } from 'next/navigation'

interface ExtendedPayout extends CRMPayout {
    payout_type?: string
    sale_advisor_id?: string
    crm_partners: {
        name: string
        type?: string
        contact_name?: string
        email?: string
        phone?: string
        location?: string
        bank_name?: string
        bank_account_name?: string
        bank_account_number?: string
        issues_vat_invoice?: boolean
        partner_code?: string
        owner_id?: string
        crm_agreements?: { commission_value: number; commission_type: string }[]
    } | null
}

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function formatMonthLabel(d: Date, language?: string) { return d.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' }) }
function fmt(n: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }

export default function CRMPayoutsPage() {
    const router = useRouter()
    const { currency, language, crmPartnerRules, crmCommissionRules, crmCommissionType, crmAdvisorCommissionPct } = useSettings()
    const [searchTerm, setSearchTerm] = useState('')
    const [payouts, setPayouts] = useState<ExtendedPayout[]>([])
    const [loading, setLoading] = useState(true)
    const [isGenerating, setIsGenerating] = useState(false)
    const [activeTab, setActiveTab] = useState<'partner' | 'advisor'>('partner')

    /* month cursor */
    const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))

    function prevMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), -1)) }
    function nextMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), 1)) }

    /* Modals State */
    const [selectedPayout, setSelectedPayout] = useState<ExtendedPayout | null>(null)
    const [modalMode, setModalMode] = useState<'none' | 'markPaid' | 'viewReceipt'>('none')
    const [receiptReferrals, setReceiptReferrals] = useState<any[]>([])
    const [loadingReceipt, setLoadingReceipt] = useState(false)
    // Form fields for Mark Paid
    const [paymentDate, setPaymentDate] = useState('')
    const [paymentMethod, setPaymentMethod] = useState('Cash')
    const [paymentNotes, setPaymentNotes] = useState('')

    const [currentUser, setCurrentUser] = useState<{ id: string, role?: string } | null>(null)
    const [accountsMap, setAccountsMap] = useState<Record<string, string>>({})
    const [accountsEmailMap, setAccountsEmailMap] = useState<Record<string, string>>({})
    const [accountsDeductPitMap, setAccountsDeductPitMap] = useState<Record<string, boolean>>({})
    const [accountsReferralCodeMap, setAccountsReferralCodeMap] = useState<Record<string, string>>({})

    const fetchData = async () => {
        setLoading(true)
        const { data: userData } = await supabase.auth.getUser()
        let userRole = 'staff'
        let userId = ''
        
        if (userData?.user) {
            userId = userData.user.id
            const { data: acc } = await supabase.from('app_accounts').select('role').eq('user_id', userId).maybeSingle()
            if (acc) {
                userRole = acc.role
                if (userRole === 'sale advisor') {
                    setActiveTab('advisor')
                }
            }
            setCurrentUser({ id: userId, role: userRole })
        }

        let query = supabase
            .from('crm_payouts')
            .select(`
                *,
                crm_partners (
                    name,
                    type,
                    contact_name,
                    email,
                    phone,
                    location,
                    bank_name,
                    bank_account_name,
                    bank_account_number,
                    issues_vat_invoice,
                    partner_code,
                    owner_id,
                    crm_agreements (
                        commission_value,
                        commission_type
                    )
                )
            `)
            .order('created_at', { ascending: false })
            
        if (userRole === 'sale advisor') {
            query = query.eq('sale_advisor_id', userId)
        }

        const [payoutsRes, accountsRes] = await Promise.all([
            query,
            supabase.from('app_accounts').select('user_id, name, email, deduct_pit, referral_code')
        ])

        if (payoutsRes.error) {
            console.error('Error fetching payouts:', payoutsRes.error)
            alert('Failed to load payouts')
        } else {
            setPayouts(payoutsRes.data as unknown as ExtendedPayout[])
        }

        if (accountsRes.data) {
            const map: Record<string, string> = {}
            const emailMap: Record<string, string> = {}
            const deductMap: Record<string, boolean> = {}
            const refCodeMap: Record<string, string> = {}
            for (const acc of accountsRes.data) {
                if (acc.user_id) {
                    map[acc.user_id] = acc.name || acc.email || 'Unknown User'
                    emailMap[acc.user_id] = acc.email || ''
                    deductMap[acc.user_id] = acc.deduct_pit !== false
                    refCodeMap[acc.user_id] = acc.referral_code || ''
                }
            }
            setAccountsMap(map)
            setAccountsEmailMap(emailMap)
            setAccountsDeductPitMap(deductMap)
            setAccountsReferralCodeMap(refCodeMap)
        }

        setLoading(false)
    }

    useEffect(() => {
        fetchData()
    }, [])

    /* Generate automatic payouts from pending referrals */
    const generatePayouts = async () => {
        const confirmMsg = (t(language, 'ConfirmGeneratePayouts') || 'Are you sure you want to generate payouts for {type}s for {month}?')
            .replace('{type}', activeTab)
            .replace('{month}', formatMonthLabel(monthCursor, language))
        if (!confirm(confirmMsg)) return

        setIsGenerating(true)
        try {
            const periodKey = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, '0')}`

            // Fetch validated referrals for this month using local date parts to prevent timezone shifts
            const year = monthCursor.getFullYear()
            const month = monthCursor.getMonth()
            const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`
            const lastDayDate = new Date(year, month + 1, 0)
            const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`

            const isPartner = activeTab === 'partner'
            const payoutField = isPartner ? 'payout_id' : 'advisor_payout_id'

            const { data: refs, error: refErr } = await supabase
                .from('crm_referrals')
                .select(`
                    *,
                    crm_partners ( owner_id, issues_vat_invoice )
                `)
                .eq('status', 'Pending')
                .is(payoutField, null)
                .gte('arrival_date', firstDay)
                .lte('arrival_date', lastDay)

            if (refErr) throw refErr

            let insertedCount = 0

            if (isPartner) {
                const partnerGroups: Record<string, { netAmount: number, grossAmount: number, refIds: string[], owner_id: string | null, issues_vat_invoice: boolean }> = {}
                for (const r of refs || []) {
                    if (!r.partner_id) continue
                    const partnerVat = r.crm_partners?.issues_vat_invoice === true
                    if (!partnerGroups[r.partner_id]) {
                        // @ts-ignore
                        partnerGroups[r.partner_id] = { netAmount: 0, grossAmount: 0, refIds: [], owner_id: r.sale_advisor_id || r.crm_partners?.owner_id || null, issues_vat_invoice: partnerVat }
                    }
                    const netVal = Number(r.commission_value || 0)
                    const grossVal = partnerVat ? netVal : netVal / 0.9
                    partnerGroups[r.partner_id].netAmount += netVal
                    partnerGroups[r.partner_id].grossAmount += grossVal
                    partnerGroups[r.partner_id].refIds.push(r.id)
                }

                if (Object.keys(partnerGroups).length === 0) {
                    alert(`No pending unassigned referrals found to generate partner payouts for ${formatMonthLabel(monthCursor, language)}.`)
                    setIsGenerating(false)
                    return
                }

                const threshold = crmPartnerRules?.pit_threshold_vnd ?? 2000000

                for (const [partnerId, group] of Object.entries(partnerGroups)) {
                    if (group.grossAmount <= 0) continue

                    let finalAmount = group.netAmount
                    let payoutNotes = ''

                    if (!group.issues_vat_invoice && group.grossAmount < threshold) {
                        finalAmount = group.grossAmount
                        const noteEn = (t('en', 'PitNotDeductedBelowThresholdNotes') || 'PIT not deducted because the payment ({amount} VND) is below the threshold of {threshold} VND.')
                            .replace('{amount}', fmt(group.grossAmount))
                            .replace('{threshold}', fmt(threshold))
                        const noteVi = (t('vi', 'PitNotDeductedBelowThresholdNotes') || 'Không khấu trừ thuế TNCN vì khoản thanh toán ({amount} VND) dưới ngưỡng {threshold} VND.')
                            .replace('{amount}', fmt(group.grossAmount))
                            .replace('{threshold}', fmt(threshold))
                        payoutNotes = `${noteEn} / ${noteVi}`
                    }

                    const { data: newPayout, error: insErr } = await supabase.from('crm_payouts').insert({
                        partner_id: partnerId,
                        period: periodKey,
                        amount: finalAmount,
                        status: 'Pending',
                        sale_advisor_id: group.owner_id,
                        payout_type: 'partner',
                        notes: payoutNotes || null
                    }).select().single()

                    if (insErr) throw insErr

                    await supabase
                        .from('crm_referrals')
                        .update({ payout_id: newPayout.id })
                        .in('id', group.refIds)

                    insertedCount++
                }
            } else {
                const advisorGroups: Record<string, { amount: number, refIds: string[] }> = {}
                for (const r of refs || []) {
                    const advId = r.sale_advisor_id
                    if (!advId) continue
                    if (!advisorGroups[advId]) {
                        advisorGroups[advId] = { amount: 0, refIds: [] }
                    }
                    advisorGroups[advId].amount += Number(r.advisor_commission_value || 0)
                    advisorGroups[advId].refIds.push(r.id)
                }

                if (Object.keys(advisorGroups).length === 0) {
                    alert(`No pending referrals with advisor commission found for ${formatMonthLabel(monthCursor, language)}.`)
                    setIsGenerating(false)
                    return
                }

                for (const [advisorId, group] of Object.entries(advisorGroups)) {
                    if (group.amount <= 0) continue

                    const { data: newPayout, error: insErr } = await supabase.from('crm_payouts').insert({
                        period: periodKey,
                        amount: group.amount,
                        status: 'Pending',
                        sale_advisor_id: advisorId,
                        payout_type: 'advisor'
                    }).select().single()

                    if (insErr) throw insErr

                    await supabase
                        .from('crm_referrals')
                        .update({ advisor_payout_id: newPayout.id })
                        .in('id', group.refIds)

                    insertedCount++
                }
            }

            if (insertedCount > 0) {
                alert(`Successfully generated ${insertedCount} new payout(s).`)
                fetchData()
            } else {
                alert('No payouts were generated (amounts were 0).')
            }
        } catch (error: any) {
            console.error('Error generating payouts:', error)
            alert('Failed to generate payouts: ' + error.message)
        }
        setIsGenerating(false)
    }

    const openMarkPaid = (payout: ExtendedPayout) => {
        setSelectedPayout(payout)
        const today = new Date()
        const y = today.getFullYear()
        const m = String(today.getMonth() + 1).padStart(2, '0')
        const d = String(today.getDate()).padStart(2, '0')
        setPaymentDate(`${y}-${m}-${d}`)
        setPaymentMethod('Cash')
        setPaymentNotes('')
        setModalMode('markPaid')
    }

    const openViewReceipt = async (payout: ExtendedPayout) => {
        setSelectedPayout(payout)
        setModalMode('viewReceipt')
        setLoadingReceipt(true)
        
        const isPartner = activeTab === 'partner'
        const column = isPartner ? 'payout_id' : 'advisor_payout_id'
        
        const { data, error } = await supabase
            .from('crm_referrals')
            .select('*')
            .eq(column, payout.id)
            .order('created_at', { ascending: false })
            
        if (!error && data) {
            setReceiptReferrals(data)
        } else {
            setReceiptReferrals([])
        }
        setLoadingReceipt(false)
    }

    const exportMinutesOfPayment = async () => {
        if (!selectedPayout) return

        try {
            const ExcelJS = (await import('exceljs')).default
            const wb = new ExcelJS.Workbook()
            const ws = wb.addWorksheet('Minutes of Payment')

            // Show grid lines
            ws.views = [{ showGridLines: true }]

            // Determine Branch
            let branchName = 'Pasta Fresca Saigon'
            const loc = selectedPayout.crm_partners?.location?.toLowerCase() || ''
            if (loc.includes('đà lạt') || loc.includes('da lat') || loc.includes('yersin') || loc.includes('tô hiến thành') || loc.includes('hùng vương') || loc.includes('hồ tùng mậu')) {
                branchName = 'Pasta Fresca Da Lat'
            } else if (loc.includes('thảo điền') || loc.includes('thao dien') || loc.includes('an khánh') || loc.includes('an khanh')) {
                branchName = 'Pasta Fresca Thao Dien'
            } else if (loc.includes('thanh mỹ') || loc.includes('thanh my')) {
                branchName = 'Pasta Fresca Thanh My Loi'
            } else if (activeTab === 'advisor' && selectedPayout.sale_advisor_id) {
                branchName = 'Pasta Fresca Da Lat'
            }

            let address = '28 Thảo Điền, Phường An Khánh, TP Thủ Đức, TP Hồ Chí Minh, Việt Nam'
            if (branchName === 'Pasta Fresca Da Lat') {
                address = '03 Yersin, Phường 9, Đà Lạt, Lâm Đồng'
            } else if (branchName === 'Pasta Fresca Thanh My Loi') {
                address = '49 Hà Huy Tập, Phường 3, Đà Lạt'
            }

            const fontName = 'Arial'
            const [year, month] = selectedPayout.period.split('-')
            
            const today = new Date()
            const todayD = today.getDate().toString().padStart(2, '0')
            const todayM = (today.getMonth() + 1).toString().padStart(2, '0')
            const todayY = today.getFullYear()

            // Styling colors
            const yellowFill: any = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFED7A' } // Professional soft pastel yellow
            }

            // Helper to add merged bilingual rows (6 columns)
            const addMergedTitleRow = (
                val: string, 
                size = 11, 
                bold = false, 
                italic = false, 
                color = '000000', 
                align: 'center' | 'left' | 'right' | 'justify' | 'fill' | 'centerContinuous' | 'distributed' | undefined = 'center'
            ) => {
                const row = ws.addRow([val])
                ws.mergeCells(row.number, 1, row.number, 6)
                row.getCell(1).font = { name: fontName, size, bold, italic, color: { argb: 'FF' + color } }
                row.getCell(1).alignment = { horizontal: align, vertical: 'middle' }
                return row
            }

            // Headers
            addMergedTitleRow('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 11, true, false, '000000', 'center')
            addMergedTitleRow('SOCIALIST REPUBLIC OF VIETNAM', 10, true, false, '334155', 'center')
            addMergedTitleRow('Độc lập – Tự do – Hạnh phúc', 11, true, false, '000000', 'center')
            addMergedTitleRow('Independence – Freedom – Happiness', 10, false, true, '334155', 'center')
            addMergedTitleRow('─────────────', 10, false, false, '94A3B8', 'center')
            ws.addRow([]) // Spacer

            addMergedTitleRow('BIÊN BẢN XÁC NHẬN HOA HỒNG GIỚI THIỆU', 14, true, false, '1E293B', 'center')
            addMergedTitleRow('MINUTES OF REFERRAL COMMISSION CONFIRMATION', 12, true, false, '1E293B', 'center')
            addMergedTitleRow(`Số: ……/BB-GTKH/${year} – Kỳ thanh toán: Tháng ${month} năm ${year}`, 10, false, false, '475569', 'center')
            addMergedTitleRow(`No.: ……/BB-GTKH/${year} – Payment period: Month ${month} Year ${year}`, 10, false, true, '475569', 'center')
            ws.addRow([]) // Spacer

            // Introduction text
            const todayTextVi = `Hôm nay, ngày ${todayD} tháng ${todayM} năm ${todayY}, tại …………………………, căn cứ Hợp đồng hợp tác giới thiệu khách hàng số ……/HĐHT-GTKH/${todayY} ngày …………… (sau đây gọi là “Hợp đồng”), chúng tôi gồm:`
            const todayTextEn = `Today, on ${todayD}/${todayM}/${todayY}, at ……………………………, pursuant to Customer Referral Cooperation Agreement No. ……/HDHT-GTKH/${todayY} dated …………… (the “Agreement”), the undersigned Parties are:`

            const r10 = ws.addRow([todayTextVi])
            ws.mergeCells(r10.number, 1, r10.number, 6)
            r10.getCell(1).font = { name: fontName, size: 10 }
            r10.getCell(1).alignment = { horizontal: 'left', wrapText: true }
            r10.height = 30

            const r11 = ws.addRow([todayTextEn])
            ws.mergeCells(r11.number, 1, r11.number, 6)
            r11.getCell(1).font = { name: fontName, size: 10, italic: true, color: { argb: 'FF475569' } }
            r11.getCell(1).alignment = { horizontal: 'left', wrapText: true }
            r11.height = 30
            ws.addRow([]) // Spacer

            // Helper to add double-column or single-column detail row for parties (6 columns)
            const addPartyRow = (labelVi: string, labelEn: string, value: string, valueCol2Vi = '', valueCol2En = '', value2 = '') => {
                if (!valueCol2Vi) {
                    const row = ws.addRow([`- ${labelVi} / ${labelEn}:`, '', value])
                    ws.mergeCells(row.number, 1, row.number, 2)
                    ws.mergeCells(row.number, 3, row.number, 6)
                    
                    const labelCell = row.getCell(1)
                    labelCell.font = { name: fontName, size: 10, bold: true, color: { argb: 'FF475569' } }
                    labelCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
                    
                    const valCell = row.getCell(3)
                    valCell.font = { name: fontName, size: 10, color: { argb: 'FF0F172A' } }
                    valCell.alignment = { horizontal: 'left', vertical: 'middle' }
                    if (!value || value === 'Unknown' || value.trim() === '') {
                        valCell.fill = yellowFill
                        valCell.value = ''
                    }
                    row.height = 24
                    return row
                } else {
                    const row = ws.addRow([`- ${labelVi} / ${labelEn}:`, '', value, `- ${valueCol2Vi} / ${valueCol2En}:`, value2])
                    ws.mergeCells(row.number, 1, row.number, 2)
                    ws.mergeCells(row.number, 3, row.number, 3)
                    ws.mergeCells(row.number, 5, row.number, 6)
                    
                    const labelCell = row.getCell(1)
                    labelCell.font = { name: fontName, size: 10, bold: true, color: { argb: 'FF475569' } }
                    labelCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
                    
                    const valCell1 = row.getCell(3)
                    valCell1.font = { name: fontName, size: 10, color: { argb: 'FF0F172A' } }
                    valCell1.alignment = { horizontal: 'left', vertical: 'middle' }
                    if (!value || value === 'Unknown' || value.trim() === '') {
                        valCell1.fill = yellowFill
                        valCell1.value = ''
                    }

                    const labelCell2 = row.getCell(4)
                    labelCell2.font = { name: fontName, size: 10, bold: true, color: { argb: 'FF475569' } }
                    labelCell2.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
                    
                    const valCell2 = row.getCell(6)
                    valCell2.font = { name: fontName, size: 10, color: { argb: 'FF0F172A' } }
                    valCell2.alignment = { horizontal: 'left', vertical: 'middle' }
                    if (!value2 || value2 === 'Unknown' || value2.trim() === '') {
                        valCell2.fill = yellowFill
                        valCell2.value = ''
                    }
                    row.height = 24
                    return row
                }
            }

            // Party A
            const rPartyAHeader = ws.addRow(['BÊN A: CÔNG TY TNHH RUSTICO / PARTY A: RUSTICO COMPANY LIMITED'])
            ws.mergeCells(rPartyAHeader.number, 1, rPartyAHeader.number, 6)
            rPartyAHeader.getCell(1).font = { name: fontName, size: 11, bold: true, color: { argb: 'FF0F172A' } }
            
            addPartyRow('Mã số thuế', 'Tax ID', '0313797471')
            addPartyRow('Đại diện', 'Representative', '', 'Chức vụ', 'Position', '')
            addPartyRow('Địa chỉ', 'Address', address)
            ws.addRow([]) // Spacer

            // Resolve Party B details
            const isPartner = activeTab === 'partner'
            let partnerName = 'Unknown'
            let contactName = ''
            let phone = ''
            let email = ''
            let bankName = ''
            let bankAccountName = ''
            let bankAccountNumber = ''
            let referralCode = ''

            if (isPartner) {
                const partner = selectedPayout.crm_partners
                partnerName = partner?.name || 'Unknown'
                contactName = partner?.contact_name || ''
                phone = partner?.phone || ''
                email = partner?.email || ''
                bankName = partner?.bank_name || ''
                bankAccountName = partner?.bank_account_name || ''
                bankAccountNumber = partner?.bank_account_number || ''
                referralCode = partner?.partner_code || (partner?.owner_id ? accountsReferralCodeMap[partner.owner_id] : '') || ''
            } else {
                const advName = selectedPayout.sale_advisor_id ? accountsMap[selectedPayout.sale_advisor_id] || 'Unknown Advisor' : 'Unknown'
                partnerName = advName
                contactName = 'N/A'
                referralCode = selectedPayout.sale_advisor_id ? accountsReferralCodeMap[selectedPayout.sale_advisor_id] || '' : ''
                email = selectedPayout.sale_advisor_id ? accountsEmailMap[selectedPayout.sale_advisor_id] || '' : ''
            }

            // Party B
            const rPartyBHeader = ws.addRow([`BÊN B: ${partnerName.toUpperCase()} / PARTY B: ${partnerName.toUpperCase()}`])
            ws.mergeCells(rPartyBHeader.number, 1, rPartyBHeader.number, 6)
            rPartyBHeader.getCell(1).font = { name: fontName, size: 11, bold: true, color: { argb: 'FF0F172A' } }

            addPartyRow('Mã số thuế / CCCD', 'Tax ID / Citizen ID', '')
            addPartyRow('Đại diện (nếu là tổ chức)', 'Representative (if entity)', contactName, 'Chức vụ', 'Position', '')
            addPartyRow('Số tài khoản', 'Bank Account No.', bankAccountNumber, 'Tại Ngân hàng', 'at Bank', bankName)
            addPartyRow('Mã giới thiệu', 'Referral Code', referralCode)
            ws.addRow([]) // Spacer

            // Transition text
            const rTransVi = ws.addRow([`Hai Bên cùng tiến hành đối chiếu, xác nhận số liệu hoa hồng giới thiệu phát sinh trong tháng ${month} năm ${year} như sau:`])
            ws.mergeCells(rTransVi.number, 1, rTransVi.number, 6)
            rTransVi.getCell(1).font = { name: fontName, size: 10 }

            const rTransEn = ws.addRow([`The Parties jointly reconcile and confirm the referral commission figures arising in Month ${month} Year ${year} as follows:`])
            ws.mergeCells(rTransEn.number, 1, rTransEn.number, 6)
            rTransEn.getCell(1).font = { name: fontName, size: 10, italic: true, color: { argb: 'FF475569' } }
            ws.addRow([]) // Spacer

            // Section I - Table of Invoices
            const rSec1Header1 = ws.addRow(['I. DANH SÁCH HÓA ĐƠN PHÁT SINH TỪ MÃ GIỚI THIỆU CỦA BÊN B'])
            ws.mergeCells(rSec1Header1.number, 1, rSec1Header1.number, 6)
            rSec1Header1.getCell(1).font = { name: fontName, size: 11, bold: true, color: { argb: 'FF0F172A' } }

            const rSec1Header2 = ws.addRow(['I. LIST OF INVOICES GENERATED FROM PARTY B’S REFERRAL CODE'])
            ws.mergeCells(rSec1Header2.number, 1, rSec1Header2.number, 6)
            rSec1Header2.getCell(1).font = { name: fontName, size: 10, bold: true, italic: true, color: { argb: 'FF475569' } }

            // Determine commission rates dynamically (handling potential mix of rates like 4% and 10%)
            let commRateText = '10%'
            if (receiptReferrals.length > 0) {
                const rates = new Set<string>()
                receiptReferrals.forEach(r => {
                    const gross = isPartner 
                        ? (selectedPayout.crm_partners?.issues_vat_invoice === false ? Number(r.commission_value) / 0.9 : Number(r.commission_value)) 
                        : (selectedPayout.sale_advisor_id && accountsDeductPitMap[selectedPayout.sale_advisor_id] ? Number(r.advisor_commission_value) / 0.9 : Number(r.advisor_commission_value))
                    const pctVal = r.revenue_generated > 0 ? (gross / r.revenue_generated) * 100 : 0
                    if (pctVal > 0) {
                        const fmtPct = pctVal % 1 === 0 ? pctVal.toFixed(0) + '%' : pctVal.toFixed(1) + '%'
                        rates.add(fmtPct)
                    }
                })
                if (rates.size > 0) {
                    commRateText = Array.from(rates).sort((a, b) => parseFloat(a) - parseFloat(b)).join(' & ')
                }
            }

            const tableHeadersVi = [
                'STT',
                'Ngày',
                'Mã tham chiếu',
                'Giá trị HĐ (VNĐ, chưa VAT)',
                'Tỷ lệ hoa hồng',
                'Hoa hồng (VNĐ)'
            ]
            const tableHeadersEn = [
                'No.',
                'Date',
                'Reference number',
                'Invoice value (VND, ex-VAT)',
                'Commission rate',
                'Commission (VND)'
            ]

            const rHeaderVi = ws.addRow(tableHeadersVi);
            const rHeaderEn = ws.addRow(tableHeadersEn);

            // Format headers
            [rHeaderVi, rHeaderEn].forEach((row: any) => {
                row.font = { name: fontName, size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } }
                row.eachCell((cell: any) => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FF1E293B' } // Slate-800
                    }
                    cell.alignment = { horizontal: 'center', vertical: 'middle' }
                })
            });
            rHeaderVi.height = 20
            rHeaderEn.height = 20

            // Fill transactions data
            const issuesVat = isPartner ? selectedPayout.crm_partners?.issues_vat_invoice === true : false
            const deductPit = isPartner ? !issuesVat : (selectedPayout.sale_advisor_id && accountsDeductPitMap[selectedPayout.sale_advisor_id])

            let totalRevenue = 0
            let totalGross = 0

            receiptReferrals.forEach((r, idx) => {
                const gross = isPartner 
                    ? (selectedPayout.crm_partners?.issues_vat_invoice === false ? Number(r.commission_value) / 0.9 : Number(r.commission_value)) 
                    : (selectedPayout.sale_advisor_id && accountsDeductPitMap[selectedPayout.sale_advisor_id] ? Number(r.advisor_commission_value) / 0.9 : Number(r.advisor_commission_value))
                
                totalRevenue += Number(r.revenue_generated || 0)
                totalGross += gross

                const pct = r.revenue_generated > 0 ? (gross / r.revenue_generated) : 0
                const dateStr = new Date(r.created_at).toLocaleDateString('en-GB')

                const row = ws.addRow([
                    idx + 1,
                    dateStr,
                    r.id.split('-')[0].toUpperCase(),
                    Number(r.revenue_generated),
                    pct,
                    gross
                ])

                row.height = 22
                row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
                row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' }
                row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' }
                row.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' }
                row.getCell(4).numFmt = '#,##0'
                row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' }
                row.getCell(5).numFmt = '0%'
                row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' }
                row.getCell(6).numFmt = '#,##0'
                
                row.eachCell(cell => {
                    cell.font = { name: fontName, size: 10 }
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                    }
                })
            })

            // Totals Row
            const rTotal = ws.addRow([
                'TỔNG CỘNG / TOTAL',
                '',
                '',
                totalRevenue,
                '',
                totalGross
            ])
            ws.mergeCells(rTotal.number, 1, rTotal.number, 3)
            rTotal.height = 24
            rTotal.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
            rTotal.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' }
            rTotal.getCell(4).numFmt = '#,##0'
            rTotal.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' }
            rTotal.getCell(6).numFmt = '#,##0'
            
            rTotal.eachCell(cell => {
                cell.font = { name: fontName, size: 10, bold: true }
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF1F5F9' } // Slate-100
                }
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF94A3B8' } },
                    bottom: { style: 'double', color: { argb: 'FF94A3B8' } },
                    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                }
            })
            ws.addRow([]) // Spacer

            // Format total text summary rows
            const formatVND = (val: number) => {
                return new Intl.NumberFormat('vi-VN').format(Math.round(val)) + ' VNĐ'
            }

            const rTotalInvoiceTextVi = ws.addRow([`Tổng giá trị hóa đơn phát sinh trong kỳ (chưa bao gồm VAT): ${formatVND(totalRevenue)}`])
            ws.mergeCells(rTotalInvoiceTextVi.number, 1, rTotalInvoiceTextVi.number, 6)
            rTotalInvoiceTextVi.getCell(1).font = { name: fontName, size: 10 }

            const rTotalInvoiceTextEn = ws.addRow([`Total invoice value during the period (excluding VAT): ${formatVND(totalRevenue)}`])
            ws.mergeCells(rTotalInvoiceTextEn.number, 1, rTotalInvoiceTextEn.number, 6)
            rTotalInvoiceTextEn.getCell(1).font = { name: fontName, size: 10, italic: true, color: { argb: 'FF475569' } }

            const rTotalCommTextVi = ws.addRow([`Tổng hoa hồng giới thiệu phải trả cho Bên B (${commRateText}): ${formatVND(totalGross)}`])
            ws.mergeCells(rTotalCommTextVi.number, 1, rTotalCommTextVi.number, 6)
            rTotalCommTextVi.getCell(1).font = { name: fontName, size: 10, bold: true }

            const rTotalCommTextEn = ws.addRow([`Total referral commission payable to Party B (${commRateText}): ${formatVND(totalGross)}`])
            ws.mergeCells(rTotalCommTextEn.number, 1, rTotalCommTextEn.number, 6)
            rTotalCommTextEn.getCell(1).font = { name: fontName, size: 10, bold: true, italic: true, color: { argb: 'FF475569' } }
            ws.addRow([]) // Spacer

            // Section II - Tax Method
            const rSec2Header1 = ws.addRow(['II. PHƯƠNG THỨC XỬ LÝ CHỨNG TỪ THUẾ'])
            ws.mergeCells(rSec2Header1.number, 1, rSec2Header1.number, 6)
            rSec2Header1.getCell(1).font = { name: fontName, size: 11, bold: true, color: { argb: 'FF0F172A' } }

            const rSec2Header2 = ws.addRow(['II. TAX DOCUMENTATION METHOD'])
            ws.mergeCells(rSec2Header2.number, 1, rSec2Header2.number, 6)
            rSec2Header2.getCell(1).font = { name: fontName, size: 10, bold: true, italic: true, color: { argb: 'FF475569' } }

            const netAmount = Number(selectedPayout.amount)
            const pitWasDeducted = Math.abs(netAmount - receiptReferrals.reduce((sum, r) => sum + Number((isPartner ? r.commission_value : r.advisor_commission_value) || 0), 0)) < 10

            // Apply PIT logic
            let finalGross = totalGross
            let pitRate = 0
            let pitAmount = 0
            let finalNet = netAmount

            if (deductPit) {
                if (pitWasDeducted) {
                    pitRate = 0.1
                    pitAmount = finalGross - finalNet
                } else {
                    pitRate = 0
                    pitAmount = 0
                    finalGross = finalNet
                }
            } else {
                pitRate = 0
                pitAmount = 0
                finalGross = finalNet
            }

            if (issuesVat) {
                // CASE 1 Header
                const rCase1Vi = ws.addRow(['Bên B xuất hóa đơn (theo Khoản 4.1 Hợp đồng)'])
                ws.mergeCells(rCase1Vi.number, 1, rCase1Vi.number, 6)
                rCase1Vi.getCell(1).font = { name: fontName, size: 10, bold: true }

                const rCase1En = ws.addRow(['Party B issues invoice (under Clause 4.1 of the Agreement)'])
                ws.mergeCells(rCase1En.number, 1, rCase1En.number, 6)
                rCase1En.getCell(1).font = { name: fontName, size: 10, bold: true, italic: true, color: { argb: 'FF475569' } }
                ws.addRow([]) // Spacer

                // CASE 1 Sub-fields
                const addCase1Field = (labelVi: string, labelEn: string, val: string, isPrefilled = false) => {
                    const r = ws.addRow([`- ${labelVi} / ${labelEn}:`, '', val])
                    ws.mergeCells(r.number, 1, r.number, 2)
                    ws.mergeCells(r.number, 3, r.number, 6)
                    
                    const labelCell = r.getCell(1)
                    labelCell.font = { name: fontName, size: 10, bold: true, color: { argb: 'FF475569' } }
                    labelCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
                    
                    const valCell = r.getCell(3)
                    valCell.font = { name: fontName, size: 10, color: { argb: 'FF0F172A' } }
                    valCell.alignment = { horizontal: 'left', vertical: 'middle' }
                    if (!isPrefilled) {
                        valCell.fill = yellowFill
                        valCell.value = '' // empty value highlighted in yellow
                    }
                    r.height = 24
                }

                addCase1Field('Số hóa đơn', 'Invoice number', '')
                addCase1Field('Ngày lập', 'Issue date', '')
                addCase1Field('Ký hiệu', 'Serial', '')
                addCase1Field('Giá trị hóa đơn (chưa VAT)', 'Invoice value (ex-VAT)', formatVND(finalNet), true)
                addCase1Field('VAT (nếu có)', 'VAT (if any)', '')
                addCase1Field('Tổng giá trị hóa đơn', 'Total invoice value', '')
                ws.addRow([]) // Spacer

                const rCase1FootVi = ws.addRow(['Bên A sẽ chuyển khoản số tiền theo hóa đơn cho Bên B trong vòng 05 (năm) ngày làm việc kể từ ngày nhận được hóa đơn hợp lệ.'])
                ws.mergeCells(rCase1FootVi.number, 1, rCase1FootVi.number, 6)
                rCase1FootVi.getCell(1).font = { name: fontName, size: 10 }
                rCase1FootVi.getCell(1).alignment = { horizontal: 'left', wrapText: true, vertical: 'middle' }
                rCase1FootVi.height = 32

                const rCase1FootEn = ws.addRow(['Party A shall transfer the invoice amount to Party B within 5 (five) working days from receipt of the valid invoice.'])
                ws.mergeCells(rCase1FootEn.number, 1, rCase1FootEn.number, 6)
                rCase1FootEn.getCell(1).font = { name: fontName, size: 10, italic: true, color: { argb: 'FF475569' } }
                rCase1FootEn.getCell(1).alignment = { horizontal: 'left', wrapText: true, vertical: 'middle' }
                rCase1FootEn.height = 32
                ws.addRow([]) // Spacer
            } else {
                // CASE 2 Header
                const rCase2Vi = ws.addRow(['Bên A khấu trừ 10% thuế TNCN tại nguồn (theo Khoản 4.2 Hợp đồng)'])
                ws.mergeCells(rCase2Vi.number, 1, rCase2Vi.number, 6)
                rCase2Vi.getCell(1).font = { name: fontName, size: 10, bold: true }

                const rCase2En = ws.addRow(['Party A withholds 10% PIT at source (under Clause 4.2 of the Agreement)'])
                ws.mergeCells(rCase2En.number, 1, rCase2En.number, 6)
                rCase2En.getCell(1).font = { name: fontName, size: 10, bold: true, italic: true, color: { argb: 'FF475569' } }
                ws.addRow([]) // Spacer

                // Table for A, B, C calculations:
                const addCase2Row = (labelLetter: string, labelVi: string, labelEn: string, valStr: string) => {
                    const r = ws.addRow([
                        `   ${labelLetter}`,
                        `${labelVi}\n   ${labelEn}`,
                        '', '', '',
                        valStr
                    ])
                    ws.mergeCells(r.number, 2, r.number, 5) // Merges Columns 2, 3, 4, 5 (leaving Column 6 for values)
                    const approxLinesVi = Math.ceil(labelVi.length / 70)
                    const approxLinesEn = Math.ceil(labelEn.length / 70)
                    r.height = Math.max(45, (approxLinesVi + approxLinesEn) * 16)
                    r.getCell(1).font = { name: fontName, size: 10, bold: true }
                    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
                    r.getCell(2).font = { name: fontName, size: 9.5, color: { argb: 'FF475569' } }
                    r.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
                    r.getCell(6).font = { name: fontName, size: 10, bold: true }
                    r.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' }
                    
                    r.eachCell(cell => {
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                        }
                    })
                    return r
                }

                const valA = formatVND(finalGross)
                
                let labelBVi = 'Khấu trừ thuế TNCN 10% (theo Điểm i Khoản 1 Điều 25 Thông tư 111/2013/TT-BTC)'
                let labelBEn = '10% PIT withholding (per Point i, Clause 1, Article 25 of Circular 111/2013/TT-BTC)'
                let valB = ''

                if (pitWasDeducted) {
                    valB = `(${formatVND(pitAmount)})`
                } else {
                    labelBVi = 'Khấu trừ thuế TNCN 10% (Dưới ngưỡng / Below threshold) (theo Điểm i Khoản 1 Điều 25 Thông tư 111/2013/TT-BTC)'
                    labelBEn = '10% PIT withholding (Below threshold) (per Point i, Clause 1, Article 25 of Circular 111/2013/TT-BTC)'
                    valB = '0 VNĐ'
                }
                
                const valC = formatVND(finalNet)

                const labelAVi = activeTab === 'advisor'
                    ? 'Hoa hồng trước thuế (Kích hoạt & Trực tiếp: 10%, Duy trì: 4%)'
                    : `Hoa hồng trước thuế (${commRateText} × Tổng giá trị hóa đơn)`
                
                const labelAEn = activeTab === 'advisor'
                    ? 'Pre-tax commission (Activation & Direct: 10%, Maintenance: 4%)'
                    : `Pre-tax commission (${commRateText} × Total invoice value)`

                addCase2Row(
                    '(A)', 
                    labelAVi, 
                    labelAEn, 
                    valA
                )
                addCase2Row(
                    '(B)', 
                    labelBVi, 
                    labelBEn, 
                    valB
                )
                const rNet = addCase2Row(
                    '(C)', 
                    'SỐ TIỀN THỰC NHẬN CỦA BÊN B (A − B)', 
                    'NET AMOUNT PAYABLE TO PARTY B (A − B)', 
                    valC
                )
                rNet.getCell(6).font = { name: fontName, size: 11, bold: true, color: { argb: 'FF16803D' } } // Green for net amount
                ws.addRow([]) // Spacer

                const rCase2FootVi = ws.addRow(['Bên A sẽ cấp Chứng từ khấu trừ thuế TNCN cho Bên B và chuyển khoản số tiền thực nhận trong vòng 05 (năm) ngày làm việc kể từ ngày ký Biên bản này.'])
                ws.mergeCells(rCase2FootVi.number, 1, rCase2FootVi.number, 6)
                rCase2FootVi.getCell(1).font = { name: fontName, size: 10 }
                rCase2FootVi.getCell(1).alignment = { horizontal: 'left', wrapText: true, vertical: 'middle' }
                rCase2FootVi.height = 32

                const rCase2FootEn = ws.addRow(['Party A shall issue a PIT Withholding Certificate to Party B and transfer the net amount within 5 (five) working days from the signing of these Minutes.'])
                ws.mergeCells(rCase2FootEn.number, 1, rCase2FootEn.number, 6)
                rCase2FootEn.getCell(1).font = { name: fontName, size: 10, italic: true, color: { argb: 'FF475569' } }
                rCase2FootEn.getCell(1).alignment = { horizontal: 'left', wrapText: true, vertical: 'middle' }
                rCase2FootEn.height = 32
                ws.addRow([]) // Spacer
            }

            // Exemption detail/general note
            if (selectedPayout.notes) {
                const rNotesVi = ws.addRow([`* Ghi chú / Notes: ${selectedPayout.notes}`])
                ws.mergeCells(rNotesVi.number, 1, rNotesVi.number, 6)
                rNotesVi.getCell(1).font = { name: fontName, size: 9.5, italic: true, color: { argb: 'FF475569' } }
                rNotesVi.getCell(1).alignment = { horizontal: 'left', wrapText: true, vertical: 'top' }
                
                const approxLines = Math.ceil((selectedPayout.notes.length + 18) / 80)
                rNotesVi.height = Math.max(20, approxLines * 16)
                ws.addRow([]) // Spacer
            }

            // Section III - Confirmations and Commitments
            const rSec3Header1 = ws.addRow(['III. XÁC NHẬN VÀ CAM KẾT CỦA HAI BÊN'])
            ws.mergeCells(rSec3Header1.number, 1, rSec3Header1.number, 6)
            rSec3Header1.getCell(1).font = { name: fontName, size: 11, bold: true, color: { argb: 'FF0F172A' } }

            const rSec3Header2 = ws.addRow(['III. CONFIRMATIONS AND COMMITMENTS OF THE PARTIES'])
            ws.mergeCells(rSec3Header2.number, 1, rSec3Header2.number, 6)
            rSec3Header2.getCell(1).font = { name: fontName, size: 10, bold: true, italic: true, color: { argb: 'FF475569' } }
            ws.addRow([]) // Spacer

            const commitments = [
                {
                    vi: '3.1. Hai Bên xác nhận các số liệu nêu tại Mục I là chính xác, đúng với phát sinh thực tế trong kỳ và đúng với số liệu do hệ thống phần mềm của Bên A tự động ghi nhận.',
                    en: '3.1. The Parties confirm that the figures stated in Section I are accurate, consistent with actual transactions during the period and consistent with the data automatically recorded by Party A’s software system.'
                },
                {
                    vi: '3.2. Sau khi ký Biên bản này, Bên B không có quyền khiếu nại về số liệu của kỳ thanh toán nêu trên, trừ trường hợp phát hiện sai sót do nguyên nhân kỹ thuật của hệ thống và được Bên A xác nhận bằng văn bản.',
                    en: '3.2. Upon signing these Minutes, Party B shall not have the right to dispute the figures for the above payment period, except where errors caused by system technical issues are identified and confirmed by Party A in writing.'
                },
                {
                    vi: '3.3. Đối với Trường hợp 1, Bên B cam kết hóa đơn đã xuất là hóa đơn hợp lệ theo quy định của Nghị định 123/2020/NĐ-CP và Thông tư 78/2021/TT-BTC. Bên B chịu hoàn toàn trách nhiệm về tính hợp pháp của hóa đơn và thực hiện đầy đủ nghĩa vụ kê khai, nộp thuế đối với khoản hoa hồng nhận được.',
                    en: '3.3. For Case 1, Party B warrants that the issued invoice is valid under Decree No. 123/2020/ND-CP and Circular No. 78/2021/TT-BTC. Party B is fully responsible for the legality of the invoice and shall fully comply with declaration and tax payment obligations on the commission received.'
                },
                {
                    vi: '3.4. Đối với Trường hợp 2, Bên A khấu trừ 10% thuế TNCN tại nguồn và cấp Chứng từ khấu trừ thuế TNCN cho Bên B. Bên B có trách nhiệm tự thực hiện quyết toán thuế TNCN cuối năm theo quy định pháp luật.',
                    en: '3.4. For Case 2, Party A withholds 10% PIT at source and issues a PIT Withholding Certificate to Party B. Party B is responsible for performing year-end PIT finalization in accordance with applicable law.'
                },
                {
                    vi: '3.5. Trường hợp cơ quan thuế truy thu, xử phạt hoặc tính lãi chậm nộp đối với Bên A do nguyên nhân từ hóa đơn không hợp lệ hoặc từ việc Bên B không thực hiện đúng nghĩa vụ thuế, Bên B có nghĩa vụ hoàn trả toàn bộ cho Bên A theo quy định tại Khoản 4.4 Hợp đồng.',
                    en: '3.5. If the tax authority imposes any tax assessment, penalty or late-payment interest on Party A due to invalid invoices or Party B’s failure to comply with tax obligations, Party B shall fully indemnify Party A under Clause 4.4 of the Agreement.'
                },
                {
                    vi: '3.6. Biên bản này là chứng từ kế toán e là một phần không tách rời của Hợp đồng. Biên bản được lập thành 02 (hai) bản tiếng Việt – Anh có giá trị pháp lý ngang nhau, mỗi Bên giữ 01 (một) bản. Trường hợp có khác biệt giữa hai ngôn ngữ, bản tiếng Việt được ưu tiên áp dụng.',
                    en: '3.6. These Minutes constitute an accounting record and are an integral part of the Agreement. They are made in 2 (two) Vietnamese–English copies of equal legal validity, with each Party keeping 1 (one) copy. In case of discrepancy, the Vietnamese version shall prevail.'
                }
            ]

            commitments.forEach(item => {
                const rVi = ws.addRow([item.vi])
                ws.mergeCells(rVi.number, 1, rVi.number, 6)
                rVi.getCell(1).font = { name: fontName, size: 9.5 }
                rVi.getCell(1).alignment = { horizontal: 'left', wrapText: true, vertical: 'top' }
                
                const rEn = ws.addRow([item.en])
                ws.mergeCells(rEn.number, 1, rEn.number, 6)
                rEn.getCell(1).font = { name: fontName, size: 9.5, italic: true, color: { argb: 'FF475569' } }
                rEn.getCell(1).alignment = { horizontal: 'left', wrapText: true, vertical: 'top' }
                
                const approxLinesVi = Math.ceil(item.vi.length / 80)
                const approxLinesEn = Math.ceil(item.en.length / 80)
                rVi.height = Math.max(16, approxLinesVi * 16)
                rEn.height = Math.max(16, approxLinesEn * 16)
                ws.addRow([]) // Spacer
            })

            // Signatures
            const rSig1 = ws.addRow([
                'ĐẠI DIỆN BÊN A', '', '',
                'ĐẠI DIỆN BÊN B'
            ])
            ws.mergeCells(rSig1.number, 1, rSig1.number, 3)
            ws.mergeCells(rSig1.number, 4, rSig1.number, 6)
            rSig1.getCell(1).font = { name: fontName, size: 10, bold: true }
            rSig1.getCell(1).alignment = { horizontal: 'center' }
            rSig1.getCell(4).font = { name: fontName, size: 10, bold: true }
            rSig1.getCell(4).alignment = { horizontal: 'center' }

            const rSig2 = ws.addRow([
                'ON BEHALF OF PARTY A', '', '',
                'ON BEHALF OF PARTY B'
            ])
            ws.mergeCells(rSig2.number, 1, rSig2.number, 3)
            ws.mergeCells(rSig2.number, 4, rSig2.number, 6)
            rSig2.getCell(1).font = { name: fontName, size: 9.5, bold: true, italic: true, color: { argb: 'FF475569' } }
            rSig2.getCell(1).alignment = { horizontal: 'center' }
            rSig2.getCell(4).font = { name: fontName, size: 9.5, bold: true, italic: true, color: { argb: 'FF475569' } }
            rSig2.getCell(4).alignment = { horizontal: 'center' }

            const rSig3 = ws.addRow([
                '(Ký, ghi rõ họ tên, đóng dấu)', '', '',
                '(Ký, ghi rõ họ tên, đóng dấu nếu có)'
            ])
            ws.mergeCells(rSig3.number, 1, rSig3.number, 3)
            ws.mergeCells(rSig3.number, 4, rSig3.number, 6)
            rSig3.getCell(1).font = { name: fontName, size: 9, italic: true, color: { argb: 'FF64748B' } }
            rSig3.getCell(1).alignment = { horizontal: 'center' }
            rSig3.getCell(4).font = { name: fontName, size: 9, italic: true, color: { argb: 'FF64748B' } }
            rSig3.getCell(4).alignment = { horizontal: 'center' }

            const rSig4 = ws.addRow([
                '(Signature, full name, stamp)', '', '',
                '(Signature, full name, stamp if any)'
            ])
            ws.mergeCells(rSig4.number, 1, rSig4.number, 3)
            ws.mergeCells(rSig4.number, 4, rSig4.number, 6)
            rSig4.getCell(1).font = { name: fontName, size: 8.5, italic: true, color: { argb: 'FF64748B' } }
            rSig4.getCell(1).alignment = { horizontal: 'center' }
            rSig4.getCell(4).font = { name: fontName, size: 8.5, italic: true, color: { argb: 'FF64748B' } }
            rSig4.getCell(4).alignment = { horizontal: 'center' }

            // Add spaces for signing
            for (let s = 0; s < 5; s++) {
                ws.addRow([])
            }

            // Set explicit column widths
            ws.getColumn(1).width = 8
            ws.getColumn(2).width = 15
            ws.getColumn(3).width = 20
            ws.getColumn(4).width = 28
            ws.getColumn(5).width = 18
            ws.getColumn(6).width = 28

            // Generate file
            const buf = await wb.xlsx.writeBuffer()
            const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            const url = URL.createObjectURL(blob)
            
            const a = document.createElement('a')
            a.href = url
            const safeName = (isPartner ? selectedPayout.crm_partners?.name : (selectedPayout.sale_advisor_id ? accountsMap[selectedPayout.sale_advisor_id] : null)) || 'payout'
            const cleanName = safeName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
            a.download = `minutes_of_payment_${cleanName}_${selectedPayout.period}.xlsx`
            
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)

        } catch (err: any) {
            console.error('Error exporting minutes of payment:', err)
            alert('Failed to export minutes of payment: ' + err.message)
        }
    }

    const closeModal = () => {
        setModalMode('none')
        setSelectedPayout(null)
    }

    const submitMarkPaid = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedPayout || !paymentDate || !paymentMethod) {
            alert('Please fill out all required fields')
            return
        }
        
        try {
            const { error: payoutErr } = await supabase
                .from('crm_payouts')
                .update({ 
                    status: 'Paid', 
                    payment_date: paymentDate,
                    reference_number: paymentMethod,
                    notes: paymentNotes
                })
                .eq('id', selectedPayout.id)

            if (payoutErr) throw payoutErr

            setPayouts(prev => prev.map(p => p.id === selectedPayout.id ? { 
                ...p, 
                status: 'Paid', 
                payment_date: paymentDate,
                reference_number: paymentMethod,
                notes: paymentNotes 
            } : p))

            closeModal()
        } catch (err) {
            console.error(err)
            alert('Failed to mark as paid')
        }
    }

    // Filter by search + month
    const filteredPayouts = useMemo(() => {
        return payouts.filter(p => {
            // Filter by Active Tab
            if ((p.payout_type || 'partner') !== activeTab) return false

            const matchesSearch = (p.crm_partners?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                p.period.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (activeTab === 'advisor' && accountsMap[p.sale_advisor_id || '']?.toLowerCase().includes(searchTerm.toLowerCase()))
            
            if (!matchesSearch) return false

            // Filter by month based on period string (e.g. "2026-04" or "April 2026")
            const periodStr = p.period?.toLowerCase() || ''
            const monthLabel = formatMonthLabel(monthCursor, language).toLowerCase()
            const monthKey = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, '0')}`
            return periodStr.includes(monthLabel) || periodStr.includes(monthKey) || !p.period
        })
    }, [payouts, searchTerm, monthCursor, activeTab, accountsMap])

    const totalPending = filteredPayouts.filter(p => p.status === 'Pending').reduce((acc, curr) => acc + Number(curr.amount || 0), 0)
    const totalPaid = filteredPayouts.filter(p => p.status !== 'Pending').reduce((acc, curr) => acc + Number(curr.amount || 0), 0)
    const totalAmount = filteredPayouts.reduce((acc, curr) => acc + Number(curr.amount || 0), 0)

    return (
        <div className="p-6 max-w-7xl mx-auto relative">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t(language, 'Payouts')}</h1>
                    <p className="text-slate-500 mt-1">{t(language, 'PayoutsDesc')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {currentUser && currentUser.role !== 'sale advisor' && (
                        <button 
                            onClick={generatePayouts}
                            disabled={isGenerating}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2"
                        >
                            {isGenerating ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Cog className="w-4 h-4" />}
                            {t(language, 'GeneratePayouts')}
                        </button>
                    )}
                    <button className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium transition shadow-sm flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        {t(language, 'Export')}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 mb-6 sticky top-0 bg-slate-50/80 backdrop-blur z-10 pt-2">
                <button
                    onClick={() => setActiveTab('partner')}
                    className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 whitespace-nowrap ${
                        activeTab === 'partner' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    {t(language, 'PartnerPayouts')}
                </button>
                <button
                    onClick={() => setActiveTab('advisor')}
                    className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 whitespace-nowrap ${
                        activeTab === 'advisor' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    {t(language, 'AdvisorPayouts')}
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-5 border border-amber-200">
                    <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-1">
                        <Clock className="w-4 h-4" /> {t(language, 'PendingPayouts')}
                    </div>
                    <div className="text-2xl font-black text-amber-900 tabular-nums">{fmt(totalPending)} <span className="text-sm font-medium">{currency}</span></div>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-5 border border-emerald-200">
                    <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm mb-1">
                        <CheckCircle2 className="w-4 h-4" /> {t(language, 'Paid')}
                    </div>
                    <div className="text-2xl font-black text-emerald-900 tabular-nums">{fmt(totalPaid)} <span className="text-sm font-medium">{currency}</span></div>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-200">
                    <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm mb-1">
                        <CreditCard className="w-4 h-4" /> {t(language, 'TotalTitle')}
                    </div>
                    <div className="text-2xl font-black text-blue-900 tabular-nums">{fmt(totalAmount)} <span className="text-sm font-medium">{currency}</span></div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder={t(language, 'SearchPartners')}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-64 text-slate-900 shadow-sm"
                        />
                    </div>
                </div>
            </div>

            {/* Month Nav */}
            <div className="mb-4 grid grid-cols-3 items-center">
                <div className="justify-self-start">
                    <button onClick={prevMonth} className="text-blue-600 hover:text-blue-800 underline underline-offset-4 decoration-blue-300/40 text-sm font-medium">
                        {t(language, 'Previous')}
                    </button>
                </div>
                <div className="justify-self-center flex items-center gap-2">
                    <span className="text-slate-700 font-semibold">{formatMonthLabel(monthCursor, language)}</span>
                    <Calendar className="w-5 h-5 text-slate-400" />
                </div>
                <div className="justify-self-end">
                    <button onClick={nextMonth} className="text-blue-600 hover:text-blue-800 underline underline-offset-4 decoration-blue-300/40 text-sm font-medium">
                        {t(language, 'Next')}
                    </button>
                </div>
            </div>

            {/* Payouts Table */}
            <div className="bg-white rounded-2xl shadow p-3 overflow-x-auto">
                <table className="w-full table-auto text-sm text-gray-900 text-left border-collapse">
                    <thead>
                        <tr className="text-gray-500 font-semibold">
                            <th className="p-2 whitespace-nowrap">{t(language, 'PayoutID')}</th>
                            {activeTab === 'partner' ? (
                                <th className="p-2 whitespace-nowrap">{t(language, 'Partner')}</th>
                            ) : (
                                <th className="p-2 whitespace-nowrap">{t(language, 'AdvisorTitle')}</th>
                            )}
                            <th className="p-2 whitespace-nowrap">{t(language, 'Period')}</th>
                            <th className="p-2 whitespace-nowrap text-right">{t(language, 'Amount')} ({currency})</th>
                            <th className="p-2 whitespace-nowrap">{t(language, 'TaskStatus')}</th>
                            <th className="p-2 whitespace-nowrap text-right">{t(language, 'Actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-gray-500">
                                    <div className="animate-pulse flex flex-col items-center">
                                        <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                                        {t(language, 'Loading')}
                                    </div>
                                </td>
                            </tr>
                        ) : filteredPayouts.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-gray-500">
                                    {t(language, 'NoPayoutsFound')}
                                </td>
                            </tr>
                        ) : (
                            filteredPayouts.map(payout => (
                                <tr key={payout.id} onClick={() => openViewReceipt(payout)} className="border-t hover:bg-blue-50/40 transition cursor-pointer">
                                    <td className="p-2 whitespace-nowrap">
                                        <div className="text-sm font-medium text-slate-700">{payout.id.slice(0, 8).toUpperCase()}</div>
                                    </td>
                                    {activeTab === 'partner' ? (
                                        <td className="p-2 whitespace-nowrap">
                                            <div className="font-semibold text-gray-900">{payout.crm_partners?.name || t(language, 'UnknownPartner')}</div>
                                            <div className="text-xs text-slate-500">{t(language, 'AdvisorTitle')}: {payout.sale_advisor_id ? accountsMap[payout.sale_advisor_id] : t(language, 'NoAdvisor')}</div>
                                        </td>
                                    ) : (
                                        <td className="p-2 whitespace-nowrap">
                                            <div className="font-semibold text-gray-900">{payout.sale_advisor_id ? accountsMap[payout.sale_advisor_id] || t(language, 'UnknownAdvisor') : t(language, 'UnknownAdvisor')}</div>
                                        </td>
                                    )}
                                    <td className="p-2 whitespace-nowrap text-slate-500">{payout.period || '-'}</td>
                                    <td className="p-2 whitespace-nowrap text-right tabular-nums font-semibold">
                                        {fmt(Number(payout.amount))}
                                    </td>
                                    <td className="p-2 whitespace-nowrap">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                            payout.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                                            payout.status === 'Processing' ? 'bg-blue-100 text-blue-700' :
                                            'bg-amber-100 text-amber-700'
                                        }`}>
                                            {t(language, payout.status as any)}
                                        </span>
                                        {payout.payment_date && (
                                            <div className="text-xs text-gray-500 mt-0.5">on {new Date(payout.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                                        )}
                                    </td>
                                    <td className="p-2 whitespace-nowrap text-right">
                                        {payout.status === 'Pending' && currentUser?.role !== 'sale advisor' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); openMarkPaid(payout); }}
                                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ml-auto"
                                            >
                                                <CreditCard className="w-3.5 h-3.5"/> {t(language, 'MarkPaid')}
                                            </button>
                                        )}
                                        {payout.status === 'Paid' && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); openViewReceipt(payout); }}
                                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ml-auto"
                                            >
                                                <FileText className="w-3.5 h-3.5" /> {t(language, 'ViewReceipt')}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                    {!loading && filteredPayouts.length > 0 && (
                        <tbody>
                            <tr className="border-t bg-gray-50 font-semibold">
                                <td colSpan={3} className="p-2 text-right">
                                    {t(language, 'Totals')}
                                </td>
                                <td className="p-2 text-right tabular-nums">
                                    {fmt(totalAmount)}
                                </td>
                                <td colSpan={2} className="p-2"></td>
                            </tr>
                        </tbody>
                    )}
                </table>
            </div>

            {/* Modals */}
            {modalMode !== 'none' && selectedPayout && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className={`bg-white rounded-2xl shadow-xl w-full ${modalMode === 'viewReceipt' ? 'max-w-3xl' : 'max-w-md'} overflow-hidden animate-in fade-in zoom-in-95 duration-200`}>
                        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                {modalMode === 'markPaid' ? <CreditCard className="w-5 h-5 text-blue-500" /> : <FileText className="w-5 h-5 text-blue-500" />}
                                {modalMode === 'markPaid' ? t(language, 'MarkPayoutAsPaid') : t(language, 'PayoutReceipt')}
                            </h2>
                            <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition p-1 hover:bg-slate-100 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {modalMode === 'markPaid' && (
                            <form onSubmit={submitMarkPaid} className="p-4 sm:p-6 flex flex-col gap-5">
                                
                                <div className="bg-blue-50 p-4 rounded-xl flex justify-between items-center border border-blue-100">
                                    <div className="text-sm font-medium text-blue-800">
                                        {activeTab === 'partner' ? t(language, 'Partner') + ':' : t(language, 'AdvisorTitle') + ':'} <span className="font-bold">
                                            {activeTab === 'partner' ? 
                                                (selectedPayout.crm_partners?.name || t(language, 'Unknown')) :
                                                (selectedPayout.sale_advisor_id ? accountsMap[selectedPayout.sale_advisor_id] || t(language, 'UnknownAdvisor') : t(language, 'Unknown'))
                                            }
                                        </span>
                                    </div>
                                    <div className="text-lg font-black text-blue-900 tabular-nums">
                                        {fmt(Number(selectedPayout.amount))} {currency}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'PaymentDateStar')}</label>
                                    <input 
                                        type="date" 
                                        required
                                        value={paymentDate}
                                        onChange={e => setPaymentDate(e.target.value)}
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 bg-white"
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'PaymentMethodStar')}</label>
                                    <select 
                                        required
                                        value={paymentMethod}
                                        onChange={e => setPaymentMethod(e.target.value)}
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 bg-white"
                                    >
                                        <option value="Cash">{t(language, 'Cash')}</option>
                                        <option value="Bank Transfer">{t(language, 'BankTransfer')}</option>
                                        <option value="Other">{t(language, 'Other')}</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'InternalNotes')}</label>
                                    <textarea 
                                        rows={3}
                                        placeholder={t(language, 'InternalNotesPlaceholder')}
                                        value={paymentNotes}
                                        onChange={e => setPaymentNotes(e.target.value)}
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm resize-none text-slate-900 bg-white placeholder:text-slate-400"
                                    />
                                </div>

                                <div className="flex gap-3 justify-end mt-2 pt-4 border-t border-slate-100">
                                    <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition">
                                        {t(language, 'Cancel')}
                                    </button>
                                    <button type="submit" className="px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition flex items-center gap-2 shadow-md hover:shadow-lg">
                                        <CheckCircle2 className="w-4 h-4"/> {t(language, 'ConfirmPayment')}
                                    </button>
                                </div>
                            </form>
                        )}

                        {modalMode === 'viewReceipt' && (
                            <div className="p-4 sm:p-6 flex flex-col gap-6 max-h-[85vh] overflow-y-auto">
                                <div className="text-center">
                                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${
                                        selectedPayout.status === 'Paid' ? 'bg-emerald-100' :
                                        selectedPayout.status === 'Processing' ? 'bg-blue-100' : 'bg-amber-100'
                                    }`}>
                                        {selectedPayout.status === 'Paid' ? <CheckCircle2 className="w-8 h-8 text-emerald-600" /> : <Clock className={`w-8 h-8 ${selectedPayout.status === 'Processing' ? 'text-blue-600' : 'text-amber-600'}`} />}
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900">
                                        {fmt(Number(selectedPayout.amount))} {currency}
                                    </h3>
                                    <p className={`text-sm font-semibold mt-1 uppercase tracking-wider ${
                                        selectedPayout.status === 'Paid' ? 'text-emerald-600' :
                                        selectedPayout.status === 'Processing' ? 'text-blue-600' : 'text-amber-600'
                                    }`}>
                                        {selectedPayout.status === 'Paid' ? t(language, 'TransactionSuccessful') || 'Transaction Successful' : t(language, selectedPayout.status as any)}
                                    </p>
                                </div>

                                <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-4">
                                    <div className="flex justify-between items-center border-b border-slate-200/60 pb-3">
                                        <span className="text-sm text-slate-500">{activeTab === 'partner' ? t(language, 'Partner') : t(language, 'AdvisorTitle')}</span>
                                        <span className="text-sm font-semibold text-slate-900">
                                            {activeTab === 'partner' ? 
                                                (selectedPayout.crm_partners?.name || t(language, 'Unknown')) :
                                                (selectedPayout.sale_advisor_id ? accountsMap[selectedPayout.sale_advisor_id] || t(language, 'UnknownAdvisor') : t(language, 'Unknown'))
                                            }
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-slate-200/60 pb-3">
                                        <span className="text-sm text-slate-500">{t(language, 'Period')}</span>
                                        <span className="text-sm font-semibold text-slate-900">{selectedPayout.period.split('-')[1]}/{selectedPayout.period.split('-')[0]}</span>
                                    </div>
                                    {activeTab === 'partner' && (selectedPayout.crm_partners?.crm_agreements?.[0] || crmPartnerRules) && (
                                        <div className="flex justify-between items-center pt-3 border-t border-slate-200/60">
                                            <span className="text-sm text-slate-500">Commission Rate</span>
                                            <span className="text-sm font-semibold text-slate-900">
                                                {selectedPayout.crm_partners?.crm_agreements?.[0]?.commission_value ?? crmPartnerRules?.commission_value}
                                                {(selectedPayout.crm_partners?.crm_agreements?.[0]?.commission_type ?? crmPartnerRules?.commission_type) === 'Percentage' ? '%' : ` ${currency}`}
                                            </span>
                                        </div>
                                    )}
                                    {activeTab === 'advisor' && (
                                        <div className="pt-3 border-t border-slate-200/60 space-y-2">
                                            {crmCommissionType === 'Standard Flat Percentage' ? (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm text-slate-500">Commission Rate</span>
                                                    <span className="text-sm font-semibold text-slate-900">{crmAdvisorCommissionPct}%</span>
                                                </div>
                                            ) : crmCommissionType === 'Acquisition + Maintenance' ? (
                                                <>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-slate-500">Acquisition Commission</span>
                                                        <span className="text-sm font-semibold text-slate-900">{crmCommissionRules?.acquisition_pct}%</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-slate-500">Maintenance Commission</span>
                                                        <span className="text-sm font-semibold text-slate-900">{crmCommissionRules?.maintenance_pct}%</span>
                                                    </div>
                                                </>
                                            ) : crmCommissionType === 'Fixed Activation Bonus + Maintenance' ? (
                                                <>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-slate-500">Activation Bonus</span>
                                                        <span className="text-sm font-semibold text-slate-900">{fmt(crmCommissionRules?.fixed_bonus || 0)} {currency}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-slate-500">Maintenance Commission</span>
                                                        <span className="text-sm font-semibold text-slate-900">{crmCommissionRules?.maintenance_pct}%</span>
                                                    </div>
                                                </>
                                            ) : null}
                                        </div>
                                    )}
                                </div>

                                {selectedPayout.notes && (
                                    <div>
                                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t(language, 'Notes')}</h4>
                                        <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                            {selectedPayout.notes}
                                        </p>
                                    </div>
                                )}

                                {/* New Referrals Breakdown */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t(language, 'TransactionsIncluded') || 'Transactions Included'}</h4>
                                    {loadingReceipt ? (
                                        <div className="flex justify-center p-4"><div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>
                                    ) : receiptReferrals.length > 0 ? (
                                        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                                        <th className="p-3">{t(language, 'TransactionRef') || 'Ref'}</th>
                                                        <th className="p-3">{t(language, 'Date') || 'Date'} & Time</th>
                                                        <th className="p-3">{t(language, 'Pax') || 'Pax'}</th>
                                                        <th className="p-3 text-right">{t(language, 'TotalBill') || 'Total Bill'}</th>
                                                        <th className="p-3 text-right">Rate %</th>
                                                        <th className="p-3 text-right">{t(language, 'GrossCommission') || 'Gross Comm.'}</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {receiptReferrals.map(r => {
                                                        const gross = activeTab === 'partner' 
                                                            ? (selectedPayout.crm_partners?.issues_vat_invoice === false ? Number(r.commission_value) / 0.9 : r.commission_value) 
                                                            : (selectedPayout.sale_advisor_id && accountsDeductPitMap[selectedPayout.sale_advisor_id] ? Number(r.advisor_commission_value) / 0.9 : r.advisor_commission_value)
                                                        const pct = r.revenue_generated > 0 ? (gross / r.revenue_generated) * 100 : 0
                                                        const displayRate = pct % 1 === 0 ? pct.toFixed(0) + '%' : pct.toFixed(1) + '%'

                                                        return (
                                                            <tr key={r.id} className="text-sm hover:bg-slate-50/50">
                                                                <td className="p-3 font-mono text-xs text-slate-500 uppercase">{r.id.split('-')[0]}</td>
                                                                <td className="p-3 text-slate-600 whitespace-nowrap">{new Date(r.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                                                <td className="p-3 font-semibold text-slate-900">{r.party_size}</td>
                                                                <td className="p-3 text-right text-slate-600">{fmt(r.revenue_generated)} đ</td>
                                                                <td className="p-3 text-right font-semibold text-emerald-600 bg-slate-50/50 whitespace-nowrap">{displayRate}</td>
                                                                <td className="p-3 text-right font-semibold text-emerald-600 whitespace-nowrap">
                                                                    {fmt(gross)} đ
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="text-center p-4 text-sm text-slate-500 bg-slate-50 rounded-xl border border-slate-100">
                                            {t(language, 'NoTransactionsFound') || 'No transactions found.'}
                                        </div>
                                    )}
                                </div>

                                {/* Totals with deductions if partner or advisor */}
                                {(() => {
                                    const isPartner = activeTab === 'partner'
                                    const issuesVat = isPartner ? selectedPayout.crm_partners?.issues_vat_invoice === true : false
                                    const normalPitDeduct = isPartner ? !issuesVat : (selectedPayout.sale_advisor_id && accountsDeductPitMap[selectedPayout.sale_advisor_id])

                                    if (!normalPitDeduct) return null

                                    const netSum = receiptReferrals.reduce((sum, r) => sum + Number((isPartner ? r.commission_value : r.advisor_commission_value) || 0), 0)
                                    const grossSum = receiptReferrals.reduce((sum, r) => {
                                        const val = Number((isPartner ? r.commission_value : r.advisor_commission_value) || 0)
                                        const deduct = isPartner ? !issuesVat : (selectedPayout.sale_advisor_id && accountsDeductPitMap[selectedPayout.sale_advisor_id])
                                        return sum + (deduct ? val / 0.9 : val)
                                    }, 0)

                                    const pitWasDeducted = Math.abs(Number(selectedPayout.amount) - netSum) < 10

                                    return (
                                        <div className="bg-rose-50/50 rounded-xl border border-rose-100 p-3 space-y-2 mt-4 animate-in fade-in duration-200">
                                            {pitWasDeducted ? (
                                                <>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-slate-600">{t(language, 'GrossCommission')}</span>
                                                        <span className="font-semibold text-slate-900">{fmt(Number(selectedPayout.amount) / 0.9)} đ</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-rose-600 flex items-center gap-2">{t(language, 'PITDeduction')} <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold border border-rose-200">10%</span></span>
                                                        <span className="font-semibold text-rose-600">-{fmt((Number(selectedPayout.amount) / 0.9) - Number(selectedPayout.amount))} đ</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-slate-600">{t(language, 'GrossCommission')}</span>
                                                        <span className="font-semibold text-slate-900">{fmt(Number(selectedPayout.amount))} đ</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-slate-500 flex items-center gap-2">{t(language, 'PITDeduction')} <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold border border-slate-200">0%</span></span>
                                                        <span className="font-semibold text-slate-500">0 đ</span>
                                                    </div>
                                                    <div className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-100/60 mt-1 font-semibold leading-normal">
                                                        {t(language, 'PitNotDeductedBelowThreshold')}
                                                    </div>
                                                </>
                                            )}
                                            <div className="flex justify-between items-center text-sm font-bold pt-2 border-t border-rose-100">
                                                <span className="text-slate-900">{t(language, 'NetCommission')}</span>
                                                <span className="text-emerald-600">{fmt(Number(selectedPayout.amount))} đ</span>
                                            </div>
                                        </div>
                                    )
                                })()}

                                <div className="flex gap-3 justify-end mt-2">
                                    <button 
                                        onClick={exportMinutesOfPayment}
                                        className="w-full px-5 py-2.5 text-sm font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                                    >
                                        <Download className="w-4 h-4" />
                                        {t(language, 'ExportMinutesOfPayment')}
                                    </button>
                                    <button onClick={closeModal} className="w-full px-5 py-2.5 text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition shadow-md cursor-pointer">
                                        {t(language, 'CloseReceipt')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
