import { supabase } from '@/lib/supabase_shim'

export type ChartDataPoint = {
    date: string
    value: number
}

// Helpers for Cash to Take calculation
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

type DenomKey = typeof DENOMS[number]['key']

function cashFromJson(raw: any): number {
    if (!raw) return 0
    let obj: Partial<Record<DenomKey, number>> | null = null

    if (typeof raw === 'string') {
        try {
            obj = JSON.parse(raw)
        } catch {
            obj = null
        }
    } else if (typeof raw === 'object') {
        obj = raw as any
    }

    if (!obj) return 0

    let sum = 0
    for (const d of DENOMS) {
        const pieces = Number((obj as any)[d.key] || 0)
        if (!Number.isFinite(pieces)) continue
        sum += pieces * d.face
    }
    return Math.round(sum)
}

// Generic fetcher params
type FetchParams = {
    startISO: string
    endISO: string
    branchName: string | null
}

// 1. Revenue
export async function fetchRevenue({ startISO, endISO, branchName }: FetchParams): Promise<ChartDataPoint[]> {
    let q = supabase
        .from('cashier_closings')
        .select('report_date, revenue_vnd, branch_name')
        .gte('report_date', startISO)
        .lt('report_date', endISO)

    if (branchName) q = q.eq('branch_name', branchName)

    const { data } = await q
    if (!data) return []

    const map = new Map<string, number>()
    data.forEach((r: any) => {
        const d = String(r.report_date).split('T')[0]
        const val = Number(r.revenue_vnd || 0)
        map.set(d, (map.get(d) || 0) + val)
    })

    return Array.from(map.entries()).map(([date, value]) => ({ date, value }))
}

// 2. Cost (Wastage + Cashout)
export async function fetchTotalCost({ startISO, endISO, branchName }: FetchParams): Promise<ChartDataPoint[]> {
    // Wastage
    let qWastage = supabase
        .from('wastage_entries')
        .select('date, total_cost_vnd, branch_name')
        .gte('date', startISO)
        .lt('date', endISO)

    if (branchName) qWastage = qWastage.eq('branch_name', branchName)

    // Cashout
    let qCashout = supabase
        .from('cashout')
        .select('date, amount, branch')
        .gte('date', startISO)
        .lt('date', endISO)

    if (branchName) qCashout = qCashout.eq('branch', branchName)

    const [wastageRes, cashoutRes] = await Promise.all([qWastage, qCashout])

    const map = new Map<string, number>()

    wastageRes.data?.forEach((r: any) => {
        const d = String(r.date).split('T')[0]
        const val = Number(r.total_cost_vnd || 0)
        map.set(d, (map.get(d) || 0) + val)
    })

    cashoutRes.data?.forEach((r: any) => {
        const d = String(r.date).split('T')[0]
        const val = Number(r.amount || 0)
        map.set(d, (map.get(d) || 0) + val)
    })

    return Array.from(map.entries()).map(([date, value]) => ({ date, value }))
}

// 3. Cash to Take
export async function fetchCashToTake({ startISO, endISO, branchName }: FetchParams): Promise<ChartDataPoint[]> {
    let q = supabase
        .from('cashier_closings')
        .select('report_date, opening_float_vnd, cash_json, float_plan_json, branch_name')
        .gte('report_date', startISO)
        .lt('report_date', endISO) // cashier_closings uses report_date which is usually date only, but let's be safe

    if (branchName) q = q.eq('branch_name', branchName)

    const { data } = await q
    if (!data) return []

    const map = new Map<string, number>()
    data.forEach((r: any) => {
        const d = String(r.report_date).split('T')[0]

        // Check if explicit plan exists
        const planTotal = cashFromJson(r.float_plan_json)

        let val = 0
        if (planTotal > 0) {
            val = planTotal
        } else {
            const floatTarget = Number(r.opening_float_vnd || 0)
            const countedCash = cashFromJson(r.cash_json)
            val = Math.max(0, countedCash - floatTarget)
        }

        map.set(d, (map.get(d) || 0) + val)
    })

    return Array.from(map.entries()).map(([date, value]) => ({ date, value }))
}

// 4. Bank Transfers
export async function fetchBankTransfers({ startISO, endISO, branchName }: FetchParams): Promise<ChartDataPoint[]> {
    let q = supabase
        .from('daily_report_bank_transfers')
        .select('date, amount, branch')
        .gte('date', startISO)
        .lt('date', endISO)

    if (branchName) q = q.eq('branch', branchName)

    const { data } = await q
    if (!data) return []

    const map = new Map<string, number>()
    data.forEach((r: any) => {
        const d = String(r.date).split('T')[0]
        const val = Number(r.amount || 0)
        map.set(d, (map.get(d) || 0) + val)
    })

    return Array.from(map.entries()).map(([date, value]) => ({ date, value }))
}

// 5. Deposits
export async function fetchDeposits({ startISO, endISO, branchName }: FetchParams): Promise<ChartDataPoint[]> {
    let q = supabase
        .from('deposits')
        .select('date, amount, branch')
        .gte('date', startISO)
        .lt('date', endISO)

    if (branchName) q = q.eq('branch', branchName)

    const { data } = await q
    if (!data) return []

    const map = new Map<string, number>()
    data.forEach((r: any) => {
        const d = String(r.date).split('T')[0]
        const val = Number(r.amount || 0)
        map.set(d, (map.get(d) || 0) + val)
    })

    return Array.from(map.entries()).map(([date, value]) => ({ date, value }))
}

// 6. Unpaid
export async function fetchUnpaid({ startISO, endISO, branchName }: FetchParams): Promise<ChartDataPoint[]> {
    let q = supabase
        .from('cashier_closings')
        .select('report_date, unpaid_vnd, branch_name')
        .gte('report_date', startISO)
        .lt('report_date', endISO)

    if (branchName) q = q.eq('branch_name', branchName)

    const { data } = await q
    if (!data) return []

    const map = new Map<string, number>()
    data.forEach((r: any) => {
        const d = String(r.report_date).split('T')[0]
        const val = Number(r.unpaid_vnd || 0)
        map.set(d, (map.get(d) || 0) + val)
    })

    return Array.from(map.entries()).map(([date, value]) => ({ date, value }))
}

// 7. Credit Card (MPOS)
export async function fetchCreditCard({ startISO, endISO, branchName }: FetchParams): Promise<ChartDataPoint[]> {
    let q = supabase
        .from('cashier_closings')
        .select('report_date, mpos_vnd, branch_name')
        .gte('report_date', startISO)
        .lt('report_date', endISO)

    if (branchName) q = q.eq('branch_name', branchName)

    const { data } = await q
    if (!data) return []

    const map = new Map<string, number>()
    data.forEach((r: any) => {
        const d = String(r.report_date).split('T')[0]
        const val = Number(r.mpos_vnd || 0)
        map.set(d, (map.get(d) || 0) + val)
    })

    return Array.from(map.entries()).map(([date, value]) => ({ date, value }))
}
