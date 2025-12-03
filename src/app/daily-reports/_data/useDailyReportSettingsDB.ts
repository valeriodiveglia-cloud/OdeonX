'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useBranchUnified } from './useBranchUnified'

export type ShiftItem = {
    name: string
    start: string
    end: string
}

export type SettingsDB = {
    initialInfo?: {
        staff?: string[]
        shifts?: ShiftItem[] | string[]
        thirdParties?: string[]
    }
    cashOut?: {
        categories?: string[]
    }
}

export function useDailyReportSettingsDB(overrideBranchName?: string | null) {
    const { name: unifiedName } = useBranchUnified()
    const branchName = (overrideBranchName || unifiedName || '').trim()

    const [settings, setSettings] = useState<SettingsDB | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!branchName) {
            setLoading(false)
            return
        }

        let active = true
        setLoading(true)

        async function fetch() {
            try {
                const { data, error } = await supabase
                    .from('daily_report_settings')
                    .select('settings')
                    .eq('branch_name', branchName)
                    .maybeSingle()

                if (!active) return

                if (error) {
                    console.error('Error fetching daily report settings:', error)
                    setSettings(null)
                } else if (data?.settings) {
                    const parsed = typeof data.settings === 'string'
                        ? JSON.parse(data.settings)
                        : data.settings
                    setSettings(parsed)
                } else {
                    setSettings(null)
                }
            } catch (err) {
                console.error('Exception fetching daily report settings:', err)
            } finally {
                if (active) setLoading(false)
            }
        }

        fetch()

        return () => {
            active = false
        }
    }, [branchName])

    // Listen for realtime updates from Settings page
    useEffect(() => {
        if (!branchName) return

        const bc = new BroadcastChannel('dr-settings')
        const onMsg = (ev: MessageEvent) => {
            const d = ev.data
            if (d?.type === 'update' && d?.branch === branchName && d?.settings) {
                setSettings(d.settings)
            }
        }
        bc.addEventListener('message', onMsg)
        return () => {
            bc.removeEventListener('message', onMsg)
            bc.close()
        }
    }, [branchName])

    return { settings, loading }
}

/* ---------- Utils ---------- */

function hhmmToMin(t: string): number {
    const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/)
    if (!m) return NaN
    const h = Number(m[1])
    const min = Number(m[2])
    if (h < 0 || h > 23 || min < 0 || min > 59) return NaN
    return h * 60 + min
}

type ShiftWin = { name: string; startMin: number; endMin: number }

export function parseShiftWindows(shifts: (ShiftItem | string)[]): ShiftWin[] {
    const out: ShiftWin[] = []
    for (const item of shifts) {
        if (typeof item === 'string') {
            // Legacy string format support if any
            const m = item.match(/^(.+?)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/)
            if (m) {
                const name = m[1].trim()
                const s = hhmmToMin(m[2])
                const e = hhmmToMin(m[3])
                if (name && Number.isFinite(s) && Number.isFinite(e)) out.push({ name, startMin: s, endMin: e })
            }
        } else if (item && typeof item === 'object') {
            const name = String(item.name || '').trim()
            const s = hhmmToMin(String(item.start || ''))
            const e = hhmmToMin(String(item.end || ''))
            if (name && Number.isFinite(s) && Number.isFinite(e)) out.push({ name, startMin: s, endMin: e })
        }
    }
    return out
}

export function pickCurrentShiftName(shifts: (ShiftItem | string)[]): string {
    const wins = parseShiftWindows(shifts)
    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()

    for (const w of wins) {
        const inWin =
            w.startMin <= w.endMin
                ? nowMin >= w.startMin && nowMin < w.endMin
                : nowMin >= w.startMin || nowMin < w.endMin
        if (inWin) return w.name
    }

    // Fallback to first available label if no window matches
    const labels = shifts.map(s => typeof s === 'string' ? s : s.name).filter(Boolean)
    if (labels.includes('All day')) return 'All day' // Only if explicitly present
    if (labels.includes('Lunch') && nowMin < 16 * 60) return 'Lunch'
    if (labels.includes('Dinner')) return 'Dinner'
    return labels[0] || ''
}

