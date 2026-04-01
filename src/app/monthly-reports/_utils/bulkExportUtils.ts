// src/app/monthly-reports/_utils/bulkExportUtils.ts
// Standalone data-fetching + Excel buffer builders for bulk export.
// Each builder mirrors the exact export logic from the corresponding monthly report page.

import { supabase } from '@/lib/supabase_shim'
import { exportToExcelTable, type ExcelColumn } from '@/lib/exportUtils'

/* ──── Shared helpers ──── */

function pad2(n: number) { return String(n).padStart(2, '0') }

function dateRange(year: number, month: number) {
    const start = new Date(year, month, 1)
    const end = new Date(year, month + 1, 1)
    const startISO = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`
    const endISO = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`
    return { startISO, endISO }
}

function formatDMY(isoDate: string) {
    const d = new Date(isoDate)
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}

function dow3(isoDate: string) {
    return new Date(isoDate).toLocaleDateString('en-US', { weekday: 'short' })
}

function formatDay(d: Date) {
    return d.toLocaleDateString('en-US', { weekday: 'long' })
}

function extractHHMM(iso: string | null | undefined): string {
    if (!iso) return ''
    const d = new Date(iso)
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function formatTimeHM(d: Date): string {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function toNum(v: any): number {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

const DENOMS = [
    { key: 'd500k', face: 500_000 },
    { key: 'd200k', face: 200_000 },
    { key: 'd100k', face: 100_000 },
    { key: 'd50k', face: 50_000 },
    { key: 'd20k', face: 20_000 },
    { key: 'd10k', face: 10_000 },
    { key: 'd5k', face: 5_000 },
    { key: 'd2k', face: 2_000 },
    { key: 'd1k', face: 1_000 },
] as const

function cashFromJson(raw: any): number {
    if (!raw) return 0
    let obj: any = null
    if (typeof raw === 'string') { try { obj = JSON.parse(raw) } catch { obj = null } }
    else if (typeof raw === 'object') obj = raw
    if (!obj) return 0
    let sum = 0
    for (const d of DENOMS) {
        const pieces = Number(obj[d.key] || 0)
        if (Number.isFinite(pieces)) sum += pieces * d.face
    }
    return Math.round(sum)
}

const DEFAULT_FLOAT = 3_000_000

function fmtNum(n: number) {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
}

/* ──── Export type ──── */

export type ModuleKey = 'closingList' | 'cashout' | 'bankTransfers' | 'wastageReport' | 'credits' | 'deposits' | 'cashLedger'

export const MODULE_LABELS: Record<ModuleKey, string> = {
    closingList: 'Closing List',
    cashout: 'Cash Out',
    bankTransfers: 'Bank Transfers',
    wastageReport: 'Wastage Report',
    credits: 'Credits',
    deposits: 'Deposits',
    cashLedger: 'Cash Ledger',
}

export const MODULE_FILE_NAMES: Record<ModuleKey, (period: string) => string> = {
    closingList: p => `closing-list-${p}.xlsx`,
    cashout: p => `cashout-${p}.xlsx`,
    bankTransfers: p => `bank-transfers-${p}.xlsx`,
    wastageReport: p => `wastage-${p}.xlsx`,
    credits: p => `credits-${p}.xlsx`,
    deposits: p => `deposits-${p}.xlsx`,
    cashLedger: p => `cash-ledger-${p}.xlsx`,
}

/* ──── 1. Closing List ──── */

async function buildClosingList(year: number, month: number): Promise<Blob> {
    const { startISO, endISO } = dateRange(year, month)

    const { data, error } = await supabase
        .from('cashier_closings')
        .select('*')
        .gte('report_date', startISO)
        .lt('report_date', endISO)
        .order('report_date', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) throw error

    const rows = (data || []).map((r: any) => {
        const date = String(r.report_date)
        const created = r.created_at ? new Date(r.created_at) : null
        const time = created ? formatTimeHM(created) : '00:00'
        const revenue = toNum(r.revenue_vnd)
        const unpaid = toNum(r.unpaid_vnd)
        const cashout = toNum(r.cash_out_vnd)
        const floatTarget = toNum(r.opening_float_vnd) || DEFAULT_FLOAT
        const countedCash = cashFromJson(r.cash_json)
        const planTotal = cashFromJson(r.float_plan_json)
        const cashToTake = planTotal > 0 ? planTotal : Math.max(0, countedCash - floatTarget)

        const thirdPartyAmounts: { label: string; amount: number }[] =
            Array.isArray(r.third_party_amounts_json) ? r.third_party_amounts_json : []

        // Legacy fallback
        const tpList = thirdPartyAmounts.length > 0 ? thirdPartyAmounts : [
            ...(toNum(r.gojek_vnd) > 0 ? [{ label: 'Gojek', amount: toNum(r.gojek_vnd) }] : []),
            ...(toNum(r.grab_vnd) > 0 ? [{ label: 'Grab', amount: toNum(r.grab_vnd) }] : []),
            ...(toNum(r.capichi_vnd) > 0 ? [{ label: 'Capichi', amount: toNum(r.capichi_vnd) }] : []),
        ]

        return {
            date, time,
            branch: String(r.branch_name || ''),
            revenue, unpaid, cashout, cashToTake,
            card: toNum(r.mpos_vnd),
            transfer: toNum(r.bank_transfer_ewallet_vnd),
            tpList,
        }
    })

    // Discover dynamic third-party columns
    const uniqueApps = new Set<string>()
    rows.forEach(r => r.tpList.forEach((item: any) => {
        if (item.label && item.amount > 0) uniqueApps.add(item.label.trim())
    }))
    const sortedApps = Array.from(uniqueApps).sort()

    const columns: ExcelColumn[] = [
        { header: 'Date', key: 'date', width: 15, total: 'Totals:' },
        { header: 'Day', key: 'day', width: 8 },
        { header: 'Time', key: 'time', width: 10 },
        { header: 'Branch', key: 'branch', width: 25 },
        { header: 'Unpaid', key: 'unpaid', width: 15, total: true },
        { header: 'Cash Out', key: 'cashout', width: 15, total: true },
        { header: 'Card', key: 'card', width: 15, total: true },
        { header: 'Transfer', key: 'transfer', width: 15, total: true },
    ]
    sortedApps.forEach(app => columns.push({ header: app, key: `app_${app}`, width: 15, total: true }))
    columns.push({ header: 'Cash to Take', key: 'cashToTake', width: 15, total: true })
    columns.push({ header: 'Revenue', key: 'revenue', width: 15, total: true })

    const excelData = rows.map(r => {
        const row: any = {
            date: formatDMY(r.date),
            day: dow3(r.date),
            time: r.time,
            branch: r.branch,
            unpaid: r.unpaid,
            cashout: r.cashout,
            card: r.card,
            transfer: r.transfer,
            cashToTake: r.cashToTake,
            revenue: r.revenue,
        }
        const rowApps: Record<string, number> = {}
        r.tpList.forEach((item: any) => { if (item.label) rowApps[item.label.trim()] = item.amount })
        sortedApps.forEach(app => { row[`app_${app}`] = rowApps[app] || 0 })
        return row
    })

    return (await exportToExcelTable('Closing List', 'bulk.xlsx', columns, excelData, undefined, true)) as Blob
}

/* ──── 2. Cash Out ──── */

async function buildCashout(year: number, month: number): Promise<Blob> {
    const { startISO, endISO } = dateRange(year, month)

    // Fetch suppliers for name lookup
    const { data: suppliers } = await supabase.from('suppliers').select('id, name')
    const supMap = new Map((suppliers || []).map((s: any) => [String(s.id), s.name]))

    const { data, error } = await supabase
        .from('cashout')
        .select('*')
        .gte('date', startISO)
        .lt('date', endISO)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) throw error

    const columns: ExcelColumn[] = [
        { header: 'Date', key: 'date', width: 12, total: 'Totals:' },
        { header: 'Time', key: 'time', width: 8 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Amount', key: 'amount', width: 15, total: true, fmt: '#,##0' },
        { header: 'Supplier', key: 'supplier', width: 25 },
        { header: 'VAT Invoice', key: 'invoice', width: 10 },
        { header: 'Delivery Note', key: 'delivery', width: 10 },
        { header: 'Branch', key: 'branch', width: 15 },
        { header: 'Paid by', key: 'paidBy', width: 20 },
    ]

    const excelData = (data || []).map((r: any) => ({
        date: formatDMY(r.date),
        time: extractHHMM(r.created_at),
        description: r.description || '',
        category: r.category || '',
        amount: toNum(r.amount),
        supplier: r.supplier_id ? (supMap.get(String(r.supplier_id)) || '') : '',
        invoice: r.invoice ? 'Yes' : 'No',
        delivery: r.delivery_note ? 'Yes' : 'No',
        branch: r.branch || '',
        paidBy: r.paid_by || '',
    }))

    return (await exportToExcelTable('Cashout', 'bulk.xlsx', columns, excelData, undefined, true)) as Blob
}

/* ──── 3. Bank Transfers ──── */

async function buildBankTransfers(year: number, month: number): Promise<Blob> {
    const { startISO, endISO } = dateRange(year, month)

    const { data, error } = await supabase
        .from('daily_report_bank_transfers')
        .select('*')
        .gte('date', startISO)
        .lt('date', endISO)
        .order('date', { ascending: true })

    if (error) throw error

    const columns: ExcelColumn[] = [
        { header: 'Date', key: 'date', width: 12, total: 'Totals:' },
        { header: 'Amount', key: 'amount', width: 15, total: true, fmt: '#,##0' },
        { header: 'Note', key: 'note', width: 40 },
        { header: 'Branch', key: 'branch', width: 20 },
    ]

    const excelData = (data || []).map((r: any) => ({
        date: formatDMY(r.date),
        amount: toNum(r.amount),
        note: r.note || '',
        branch: r.branch || '',
    }))

    return (await exportToExcelTable('Bank Transfers', 'bulk.xlsx', columns, excelData, undefined, true)) as Blob
}

/* ──── 4. Wastage Report ──── */

async function buildWastageReport(year: number, month: number): Promise<Blob> {
    const { startISO, endISO } = dateRange(year, month)

    const { data, error } = await supabase
        .from('wastage_entries')
        .select('*')
        .gte('date', startISO)
        .lt('date', endISO)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) throw error

    const columns: ExcelColumn[] = [
        { header: 'Date', key: 'date', width: 12, total: 'Totals:' },
        { header: 'Day', key: 'day', width: 8 },
        { header: 'Time', key: 'time', width: 8 },
        { header: 'Branch', key: 'branch', width: 20 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Item', key: 'item', width: 30 },
        { header: 'Unit', key: 'unit', width: 10 },
        { header: 'Qty', key: 'qty', width: 10, fmt: '0.00' },
        { header: 'Unit cost', key: 'unitCost', width: 15, fmt: '#,##0' },
        { header: 'Total cost', key: 'totalCost', width: 15, total: true, fmt: '#,##0' },
        { header: 'Charge to', key: 'chargeTo', width: 15 },
    ]

    const excelData = (data || []).map((r: any) => ({
        date: formatDMY(r.date),
        day: dow3(r.date),
        time: r.time || '',
        branch: r.branch_name || '',
        type: r.wtype || '',
        category: r.category_name || '',
        item: r.item_name || '',
        unit: r.unit || '',
        qty: toNum(r.qty),
        unitCost: toNum(r.unit_cost_vnd),
        totalCost: toNum(r.total_cost_vnd),
        chargeTo: r.charge_target || '',
    }))

    return (await exportToExcelTable('Wastage Report', 'bulk.xlsx', columns, excelData, undefined, true)) as Blob
}

/* ──── 5. Credits ──── */

async function buildCredits(year: number, month: number): Promise<Blob> {
    const { startISO, endISO } = dateRange(year, month)

    const { data: credits, error } = await supabase
        .from('credits')
        .select('*')
        .gte('date', startISO)
        .lt('date', endISO)
        .order('date', { ascending: true })

    if (error) throw error

    // Compute totals from payments
    const creditIds = (credits || []).map((c: any) => String(c.id))
    let payments: any[] = []
    if (creditIds.length > 0) {
        const { data: payData } = await supabase
            .from('credit_payments')
            .select('*')
            .in('credit_id', creditIds)
        payments = payData || []
    }

    const paidMap = new Map<string, number>()
    payments.forEach((p: any) => {
        const key = String(p.credit_id)
        paidMap.set(key, (paidMap.get(key) || 0) + toNum(p.amount))
    })

    const columns: ExcelColumn[] = [
        { header: 'Date', key: 'date', width: 12, total: 'Totals:' },
        { header: 'Customer', key: 'customer', width: 20 },
        { header: 'Amount', key: 'amount', width: 15, total: true, fmt: '#,##0' },
        { header: 'Paid', key: 'paid', width: 15, total: true, fmt: '#,##0' },
        { header: 'Remaining', key: 'remaining', width: 15, total: true, fmt: '#,##0' },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Branch', key: 'branch', width: 20 },
        { header: 'Shift', key: 'shift', width: 15 },
        { header: 'Handled By', key: 'handledBy', width: 20 },
        { header: 'Reference', key: 'reference', width: 25 },
    ]

    const excelData = (credits || []).map((r: any) => {
        const amount = toNum(r.amount)
        const paid = paidMap.get(String(r.id)) || 0
        const remaining = Math.max(0, amount - paid)
        return {
            date: formatDMY(r.date),
            customer: r.customer_name || '',
            amount,
            paid,
            remaining,
            status: remaining <= 0 ? 'Paid' : 'Unpaid',
            branch: r.branch || '',
            shift: r.shift || '',
            handledBy: r.handled_by || '',
            reference: r.reference || '',
        }
    })

    return (await exportToExcelTable('Credits', 'bulk.xlsx', columns, excelData, undefined, true)) as Blob
}

/* ──── 6. Deposits ──── */

async function buildDeposits(year: number, month: number): Promise<Blob> {
    const { startISO, endISO } = dateRange(year, month)

    const { data: deposits, error } = await supabase
        .from('deposits')
        .select('*')
        .gte('date', startISO)
        .lt('date', endISO)
        .order('date', { ascending: true })

    if (error) throw error

    const depositIds = (deposits || []).map((d: any) => String(d.id))
    let payments: any[] = []
    if (depositIds.length > 0) {
        const { data: payData } = await supabase
            .from('deposit_payments')
            .select('*')
            .in('deposit_id', depositIds)
        payments = payData || []
    }

    const paidMap = new Map<string, number>()
    payments.forEach((p: any) => {
        const key = String(p.deposit_id)
        paidMap.set(key, (paidMap.get(key) || 0) + toNum(p.amount))
    })

    const columns: ExcelColumn[] = [
        { header: 'Date', key: 'date', width: 12, total: 'Totals:' },
        { header: 'Customer', key: 'customer', width: 20 },
        { header: 'Amount', key: 'amount', width: 15, total: true, fmt: '#,##0' },
        { header: 'Paid', key: 'paid', width: 15, total: true, fmt: '#,##0' },
        { header: 'Remaining', key: 'remaining', width: 15, total: true, fmt: '#,##0' },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Branch', key: 'branch', width: 20 },
        { header: 'Shift', key: 'shift', width: 15 },
        { header: 'Handled By', key: 'handledBy', width: 20 },
        { header: 'Reference', key: 'reference', width: 25 },
    ]

    const excelData = (deposits || []).map((r: any) => {
        const amount = toNum(r.amount)
        const paid = paidMap.get(String(r.id)) || 0
        const remaining = Math.max(0, amount - paid)
        return {
            date: formatDMY(r.date),
            customer: r.customer_name || '',
            amount,
            paid,
            remaining,
            status: remaining <= 0 ? 'Paid' : 'Unpaid',
            branch: r.branch || '',
            shift: r.shift || '',
            handledBy: r.handled_by || '',
            reference: r.reference || '',
        }
    })

    return (await exportToExcelTable('Deposits', 'bulk.xlsx', columns, excelData, undefined, true)) as Blob
}

/* ──── 7. Cash Ledger ──── */

async function buildCashLedger(year: number, month: number): Promise<Blob> {
    const { startISO, endISO } = dateRange(year, month)

    const [resClosings, resDeposits, resAllClosings, resAllDeposits] = await Promise.all([
        supabase.from('cashier_closings')
            .select('report_date, opening_float_vnd, cash_json, float_plan_json, branch_name')
            .gte('report_date', startISO).lt('report_date', endISO),
        supabase.from('cash_ledger_deposits')
            .select('id, date, amount, branch, deposit_date')
            .gte('date', startISO).lt('date', endISO),
        supabase.from('cashier_closings')
            .select('report_date, branch_name, opening_float_vnd, cash_json, float_plan_json'),
        supabase.from('cash_ledger_deposits')
            .select('date, branch, amount'),
    ])

    if (resClosings.error) throw resClosings.error
    if (resDeposits.error) throw resDeposits.error
    if (resAllClosings.error) throw resAllClosings.error
    if (resAllDeposits.error) throw resAllDeposits.error

    // Map deposits by date|branch
    const depositsMap = new Map<string, any[]>()
        ; (resDeposits.data || []).forEach((t: any) => {
            const key = `${t.date}|${t.branch}`
            const list = depositsMap.get(key) || []
            list.push(t)
            depositsMap.set(key, list)
        })

    const rows = (resClosings.data || []).map((r: any) => {
        const date = String(r.report_date).split('T')[0]
        const branch = r.branch_name
        const floatTarget = toNum(r.opening_float_vnd) || DEFAULT_FLOAT
        const countedCash = cashFromJson(r.cash_json)
        const planTotal = cashFromJson(r.float_plan_json)
        const cashToTake = planTotal > 0 ? planTotal : Math.max(0, countedCash - floatTarget)
        const key = `${date}|${branch}`
        const related = depositsMap.get(key) || []
        const totalDeposited = related.reduce((sum: number, t: any) => sum + toNum(t.amount), 0)
        const deposited = totalDeposited >= cashToTake && cashToTake > 0
        const depositDate = related[0]?.deposit_date || null

        return { date, branch, cashToTake, deposited, depositDate }
    })
    rows.sort((a, b) => b.date.localeCompare(a.date))

    // KPIs
    let kpiDeposited = 0, kpiPending = 0
    rows.forEach(r => { if (r.deposited) kpiDeposited += r.cashToTake; else kpiPending += r.cashToTake })

    // Total Pending (all time)
    const allDepositsMap = new Map<string, any[]>()
        ; (resAllDeposits.data || []).forEach((t: any) => {
            const key = `${t.date}|${t.branch}`
            const list = allDepositsMap.get(key) || []
            list.push(t)
            allDepositsMap.set(key, list)
        })
    let totalPending = 0
    for (const r of (resAllClosings.data || [])) {
        const date = String(r.report_date).split('T')[0]
        const branch = r.branch_name
        const floatTarget = toNum(r.opening_float_vnd) || DEFAULT_FLOAT
        const countedCash = cashFromJson(r.cash_json)
        const planTotal = cashFromJson(r.float_plan_json)
        const cashToTake = planTotal > 0 ? planTotal : Math.max(0, countedCash - floatTarget)
        if (cashToTake > 0) {
            const key = `${date}|${branch}`
            const related = allDepositsMap.get(key) || []
            const dep = related.reduce((sum: number, t: any) => sum + toNum(t.amount), 0)
            if (dep < cashToTake) totalPending += cashToTake
        }
    }

    const columns: ExcelColumn[] = [
        { header: 'Date', key: 'date', width: 12, total: 'Totals:' },
        { header: 'Day', key: 'day', width: 12 },
        { header: 'Branch', key: 'branch', width: 20 },
        { header: 'Cash Revenues', key: 'amount', width: 15, total: true, fmt: '#,##0' },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Deposit Date', key: 'depositDate', width: 15 },
    ]

    const excelData = rows.map(r => ({
        date: formatDMY(r.date),
        day: formatDay(new Date(r.date)),
        branch: r.branch,
        amount: r.cashToTake,
        status: r.cashToTake === 0 ? 'Null' : (r.deposited ? 'Deposited' : 'Pending'),
        depositDate: r.deposited && r.depositDate ? formatDMY(r.depositDate) : '',
    }))

    const extraRows = [
        ['Deposited (Current Month)', '', '', fmtNum(kpiDeposited)],
        ['Pending (Current Month)', '', '', fmtNum(kpiPending)],
        ['Total Pending', '', '', fmtNum(totalPending)],
    ]

    return (await exportToExcelTable('Cash Ledger', 'bulk.xlsx', columns, excelData, extraRows, true)) as Blob
}

/* ──── Unified builder map ──── */

export const MODULE_BUILDERS: Record<ModuleKey, (year: number, month: number) => Promise<Blob>> = {
    closingList: buildClosingList,
    cashout: buildCashout,
    bankTransfers: buildBankTransfers,
    wastageReport: buildWastageReport,
    credits: buildCredits,
    deposits: buildDeposits,
    cashLedger: buildCashLedger,
}
