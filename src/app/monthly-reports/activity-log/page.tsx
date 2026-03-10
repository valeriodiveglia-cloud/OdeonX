'use client'

import React, { useMemo, useState, useEffect, useCallback } from 'react'
import {
    CalendarDaysIcon,
    MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { useSettings } from '@/contexts/SettingsContext'
import { getMonthlyReportsDictionary } from '../_i18n'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'

/* ── types ── */
type AuditRow = {
    id: number
    at: string
    table_name: string
    op: 'INSERT' | 'UPDATE' | 'DELETE'
    row_id: string | null
    old_data: Record<string, unknown> | null
    new_data: Record<string, unknown> | null
    user_id: string | null
    role: string | null
}

type UserInfo = { name: string | null; email: string | null }

/* ── human-readable table labels ── */
const TABLE_LABELS: Record<string, [string, string]> = {
    cashier_closings: ['Cashier Closings', 'Chốt ca'],
    cashout: ['Cash Out', 'Chi tiền'],
    credits: ['Credits', 'Công nợ'],
    credit_payments: ['Credit Payments', 'Thanh toán công nợ'],
    daily_report_bank_transfers: ['Bank Transfers', 'Chuyển khoản'],
    daily_report_settings: ['DR Settings', 'Cài đặt DR'],
    deposits: ['Deposits', 'Đặt cọc'],
    deposit_payments: ['Deposit Payments', 'Thanh toán đặt cọc'],
    wastage_entries: ['Wastage', 'Hao hụt'],
    categories: ['Categories', 'Danh mục'],
    dish_categories: ['Dish Categories', 'Danh mục món'],
    equipment_categories: ['Equipment Cat.', 'Danh mục thiết bị'],
    final_recipes: ['Final Recipes', 'Công thức'],
    final_recipe_items: ['Recipe Items', 'Nguyên liệu CT'],
    final_recipe_tags: ['Recipe Tags', 'Tag CT'],
    prep_recipes: ['Prep Recipes', 'Sơ chế'],
    prep_recipe_items: ['Prep Items', 'NL sơ chế'],
    prep_recipe_tags: ['Prep Tags', 'Tag sơ chế'],
    materials: ['Materials', 'Nguyên liệu'],
    recipe_categories: ['Recipe Categories', 'DM công thức'],
    suppliers: ['Suppliers', 'Nhà cung cấp'],
    tags: ['Tags', 'Tags'],
    uom: ['Units', 'Đơn vị'],
}

const OP_COLORS: Record<string, string> = {
    INSERT: 'bg-emerald-100 text-emerald-800',
    UPDATE: 'bg-amber-100 text-amber-800',
    DELETE: 'bg-red-100 text-red-800',
}

/* ── page ── */
export default function ActivityLogPage() {
    const { language } = useSettings()
    const dict = getMonthlyReportsDictionary(language)
    const t = (dict as any).activityLog ?? defaultT
    const isEN = language === 'en'

    /* auth guard — owner only */
    const [role, setRole] = useState<string | null>(null)
    const [authLoaded, setAuthLoaded] = useState(false)

    useEffect(() => {
        async function loadRole() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { setAuthLoaded(true); return }
            const { data } = await supabase
                .from('app_accounts')
                .select('role')
                .eq('email', user.email ?? '')
                .eq('is_active', true)
                .maybeSingle()
            setRole(data?.role ?? null)
            setAuthLoaded(true)
        }
        loadRole()
    }, [])

    /* month cursor */
    const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
    const monthInputValue = useMemo(() => toMonthInputValue(monthCursor), [monthCursor])

    /* filters */
    const [qText, setQText] = useState('')
    const [filterTable, setFilterTable] = useState<string>('all')
    const [filterOp, setFilterOp] = useState<string>('all')

    /* data */
    const [rows, setRows] = useState<AuditRow[]>([])
    const [users, setUsers] = useState<Record<string, UserInfo>>({})
    const [loading, setLoading] = useState(true)

    /* fetch audit rows */
    useEffect(() => {
        if (!authLoaded || role !== 'owner') return
        let cancelled = false
        async function load() {
            setLoading(true)
            const y = monthCursor.getFullYear()
            const m = monthCursor.getMonth()
            const pad = (n: number) => String(n).padStart(2, '0')
            const start = `${y}-${pad(m + 1)}-01T00:00:00Z`
            const endDate = new Date(Date.UTC(y, m + 1, 1))
            const end = `${endDate.getUTCFullYear()}-${pad(endDate.getUTCMonth() + 1)}-01T00:00:00Z`

            const params: Record<string, unknown> = {
                p_start: start,
                p_end: end,
                p_limit: 2000,
            }
            if (filterTable !== 'all') params.p_table = filterTable
            if (filterOp !== 'all') params.p_op = filterOp

            const { data } = await supabase.rpc('get_audit_log', params)
            if (!cancelled && data) setRows(data as AuditRow[])
            setLoading(false)
        }
        load()
        return () => { cancelled = true }
    }, [authLoaded, role, monthCursor, filterTable, filterOp])

    /* fetch user names for the unique user_ids in rows */
    useEffect(() => {
        const ids = [...new Set(rows.map(r => r.user_id).filter(Boolean))] as string[]
        const missing = ids.filter(id => !users[id])
        if (missing.length === 0) return
        async function loadUsers() {
            const { data } = await supabase
                .from('app_accounts')
                .select('user_id, name, email')
                .in('user_id', missing)
            if (data) {
                const map: Record<string, UserInfo> = { ...users }
                data.forEach((u: any) => { map[u.user_id] = { name: u.name, email: u.email } })
                setUsers(map)
            }
        }
        loadUsers()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows])

    /* search filter */
    const filtered = useMemo(() => {
        if (!qText.trim()) return rows
        const s = qText.trim().toLowerCase()
        return rows.filter(r => {
            const userName = r.user_id ? (users[r.user_id]?.name ?? users[r.user_id]?.email ?? '') : ''
            const tableLbl = TABLE_LABELS[r.table_name]?.[isEN ? 0 : 1] ?? r.table_name
            return (
                userName.toLowerCase().includes(s) ||
                tableLbl.toLowerCase().includes(s) ||
                r.op.toLowerCase().includes(s) ||
                r.table_name.toLowerCase().includes(s) ||
                (r.row_id ?? '').toLowerCase().includes(s) ||
                summarize(r, isEN).toLowerCase().includes(s)
            )
        })
    }, [rows, qText, users, isEN])

    /* unique tables in current data for the dropdown */
    const uniqueTables = useMemo(() => {
        const s = new Set<string>()
        rows.forEach(r => s.add(r.table_name))
        return [...s].sort()
    }, [rows])

    /* helpers */
    function prevMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), -1)) }
    function nextMonth() { setMonthCursor(addMonths(startOfMonth(monthCursor), 1)) }
    function onPickMonth(val: string) { const d = fromMonthInputValue(val); if (d) setMonthCursor(d) }

    function userName(uid: string | null) {
        if (!uid) return t.system
        const u = users[uid]
        return u?.name || u?.email || uid.slice(0, 8) + '…'
    }

    function tableLabel(tbl: string) {
        return TABLE_LABELS[tbl]?.[isEN ? 0 : 1] ?? tbl
    }

    /* render guards */
    if (!authLoaded) return <div className="flex justify-center p-12"><CircularLoader /></div>
    if (role !== 'owner') {
        return (
            <div className="flex items-center justify-center min-h-[60vh] text-gray-400 text-lg">
                {t.noAccess}
            </div>
        )
    }

    return (
        <div className="max-w-none mx-auto p-4 text-gray-100">
            {/* Header */}
            <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
                <h1 className="text-2xl font-bold text-white">{t.title}</h1>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Table filter */}
                    <select
                        value={filterTable}
                        onChange={e => setFilterTable(e.target.value)}
                        className="h-9 rounded-lg border border-blue-400/30 bg-blue-600/15 text-blue-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                    >
                        <option value="all">{t.allTables}</option>
                        {uniqueTables.map(tbl => (
                            <option key={tbl} value={tbl} className="text-gray-900">{tableLabel(tbl)}</option>
                        ))}
                    </select>

                    {/* Operation filter */}
                    <select
                        value={filterOp}
                        onChange={e => setFilterOp(e.target.value)}
                        className="h-9 rounded-lg border border-blue-400/30 bg-blue-600/15 text-blue-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                    >
                        <option value="all">{t.allOps}</option>
                        <option value="INSERT" className="text-gray-900">{t.ops.INSERT}</option>
                        <option value="UPDATE" className="text-gray-900">{t.ops.UPDATE}</option>
                        <option value="DELETE" className="text-gray-900">{t.ops.DELETE}</option>
                    </select>

                    {/* Search */}
                    <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                        <input
                            type="text"
                            placeholder={t.searchPlaceholder}
                            value={qText}
                            onChange={e => setQText(e.target.value)}
                            className="h-9 pl-9 pr-3 rounded-lg border border-blue-400/30 bg-blue-600/15
                         text-blue-100 placeholder-blue-300 caret-blue-200
                         focus:outline-none focus:ring-2 focus:ring-blue-400/40 w-[200px]"
                        />
                    </div>
                </div>
            </div>

            <div className="border-t border-blue-400/20 my-3" />

            {/* Month Nav */}
            <div className="mb-3 grid grid-cols-3 items-center">
                <div className="justify-self-start">
                    <button type="button" onClick={prevMonth}
                        className="text-blue-200 hover:text-white underline underline-offset-4 decoration-blue-300/40">
                        {t.monthNav.previous}
                    </button>
                </div>
                <div className="justify-self-center flex items-center gap-2">
                    <span className="text-white font-semibold">{formatMonthLabel(monthCursor)}</span>
                    <div className="relative w-6 h-6">
                        <CalendarDaysIcon className="w-6 h-6 text-blue-200" />
                        <input
                            type="month"
                            value={monthInputValue}
                            onChange={e => onPickMonth(e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                    </div>
                </div>
                <div className="justify-self-end">
                    <button type="button" onClick={nextMonth}
                        className="text-blue-200 hover:text-white underline underline-offset-4 decoration-blue-300/40">
                        {t.monthNav.next}
                    </button>
                </div>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-3 gap-2 mb-3">
                <StatPill label={t.totalEntries} value={filtered.length} />
                <StatPill label={t.inserts} value={filtered.filter(r => r.op === 'INSERT').length} />
                <StatPill label={t.deletes} value={filtered.filter(r => r.op === 'DELETE').length} />
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow p-3 overflow-x-auto">
                {loading ? (
                    <div className="flex justify-center py-12"><CircularLoader /></div>
                ) : (
                    <table className="w-full table-auto text-sm text-gray-900">
                        <thead>
                            <tr>
                                <th className="p-2 text-left font-semibold">{t.headers.timestamp}</th>
                                <th className="p-2 text-left font-semibold">{t.headers.user}</th>
                                <th className="p-2 text-left font-semibold">{t.headers.table}</th>
                                <th className="p-2 text-center font-semibold">{t.headers.operation}</th>
                                <th className="p-2 text-left font-semibold">{t.headers.summary}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr><td colSpan={5} className="text-center text-gray-500 py-6">{t.noRows}</td></tr>
                            )}
                            {filtered.map(r => (
                                <tr key={r.id} className="border-t hover:bg-blue-50/40">
                                    <td className="p-2 whitespace-nowrap text-gray-500 tabular-nums">
                                        {formatDateTime(r.at)}
                                    </td>
                                    <td className="p-2 whitespace-nowrap">
                                        <span className="font-medium">{userName(r.user_id)}</span>
                                        {r.role && <span className="ml-1 text-[10px] uppercase text-gray-400">{r.role}</span>}
                                    </td>
                                    <td className="p-2 whitespace-nowrap text-gray-600">
                                        {tableLabel(r.table_name)}
                                    </td>
                                    <td className="p-2 whitespace-nowrap text-center">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${OP_COLORS[r.op] ?? 'bg-gray-100 text-gray-600'}`}>
                                            {t.ops[r.op] ?? r.op}
                                        </span>
                                    </td>
                                    <td className="p-2 text-gray-600 max-w-[400px] truncate" title={summarize(r, isEN)}>
                                        {summarize(r, isEN)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}

/* ── helpers ── */
function summarize(r: AuditRow, _isEN: boolean): string {
    const d = r.op === 'DELETE' ? r.old_data : r.new_data
    if (!d) return ''

    const p = (v: unknown) => v != null && v !== '' && v !== 0
    const parts: string[] = []

    switch (r.table_name) {
        case 'cashier_closings':
            if (p(d.branch_name)) parts.push(String(d.branch_name))
            if (p(d.cashier_name)) parts.push(String(d.cashier_name))
            if (p(d.revenue_vnd)) parts.push(`Revenue: ${fmt(Number(d.revenue_vnd))}`)
            if (p(d.shift)) parts.push(`Shift: ${d.shift}`)
            break
        case 'cashout':
            if (p(d.branch)) parts.push(String(d.branch))
            if (p(d.description)) parts.push(String(d.description))
            if (p(d.amount)) parts.push(fmt(Number(d.amount)))
            if (p(d.category)) parts.push(String(d.category))
            break
        case 'daily_report_bank_transfers':
            if (p(d.branch)) parts.push(String(d.branch))
            if (p(d.note)) parts.push(String(d.note))
            if (p(d.amount)) parts.push(fmt(Number(d.amount)))
            break
        case 'wastage_entries':
            if (p(d.branch_name)) parts.push(String(d.branch_name))
            if (p(d.item_name)) parts.push(String(d.item_name))
            if (p(d.qty) && p(d.unit)) parts.push(`${d.qty} ${d.unit}`)
            else if (p(d.qty)) parts.push(`Qty: ${d.qty}`)
            if (p(d.total_cost_vnd)) parts.push(fmt(Number(d.total_cost_vnd)))
            if (p(d.reason)) parts.push(String(d.reason))
            break
        case 'credits':
        case 'credit_payments':
            if (p(d.customer_name)) parts.push(String(d.customer_name))
            if (p(d.branch)) parts.push(String(d.branch))
            if (p(d.amount)) parts.push(fmt(Number(d.amount)))
            if (p(d.initial_amount)) parts.push(fmt(Number(d.initial_amount)))
            break
        case 'deposits':
        case 'deposit_payments':
            if (p(d.customer_name)) parts.push(String(d.customer_name))
            if (p(d.branch)) parts.push(String(d.branch))
            if (p(d.amount)) parts.push(fmt(Number(d.amount)))
            if (p(d.initial_amount)) parts.push(fmt(Number(d.initial_amount)))
            break
        case 'daily_report_settings':
            if (p(d.branch)) parts.push(String(d.branch))
            if (p(d.name)) parts.push(String(d.name))
            break
        default: {
            // Generic: pick meaningful fields, skip date/id/timestamps
            const skip = new Set(['id', 'created_at', 'updated_at', 'date', 'report_date', 'created_by', 'updated_by'])
            if (p(d.branch)) parts.push(String(d.branch))
            if (p(d.branch_name)) parts.push(String(d.branch_name))
            if (p(d.name)) parts.push(String(d.name))
            if (p(d.description)) parts.push(String(d.description))
            if (p(d.amount)) parts.push(fmt(Number(d.amount)))
            if (parts.length === 0) {
                const keys = Object.keys(d).filter(k => !skip.has(k)).slice(0, 3)
                return keys.map(k => `${k}: ${String(d[k]).slice(0, 30)}`).join(', ')
            }
            break
        }
    }

    return parts.join(' · ')
}

function StatPill({ label, value }: { label: string; value: number }) {
    return (
        <div className="text-left rounded-xl border border-blue-400/30 bg-blue-600/10 text-blue-100 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide opacity-80">{label}</div>
            <div className="text-base font-semibold tabular-nums">{value}</div>
        </div>
    )
}

function fmt(n: number) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) }
function formatDateTime(iso: string) {
    const d = new Date(iso)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function toMonthInputValue(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function fromMonthInputValue(val: string) { const [y, m] = val.split('-').map(Number); return new Date(y, m - 1, 1) }
function formatMonthLabel(d: Date) { return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }

/* ── fallback dict ── */
const defaultT = {
    title: 'Activity Log',
    noAccess: 'Only the owner can view this page.',
    allTables: 'All tables',
    allOps: 'All operations',
    searchPlaceholder: 'Search...',
    system: 'System',
    totalEntries: 'Total entries',
    inserts: 'Inserts',
    deletes: 'Deletes',
    monthNav: { previous: 'Previous', next: 'Next' },
    headers: { timestamp: 'Timestamp', user: 'User', table: 'Table', operation: 'Operation', summary: 'Summary' },
    ops: { INSERT: 'Created', UPDATE: 'Updated', DELETE: 'Deleted' },
    noRows: 'No activity for this month.',
}
