'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useBranchUnified } from './useBranchUnified'

type SettingsJson = {
    cashCount?: { cashFloatVND?: number }
    initialInfo?: {
        staff?: string[]
        shifts?: Array<{ name: string; start: string; end: string }>
        thirdParties?: string[]
    }
    cashOut?: {
        categories?: string[]
    }
}

type DailyReportSettingsContextType = {
    loading: boolean
    error: string | null
    settings: SettingsJson
    updateDraft: (section: keyof SettingsJson, data: any) => void
    saveAll: () => Promise<void>
    refresh: () => Promise<void>
    isDirty: boolean
}

const DailyReportSettingsContext = createContext<DailyReportSettingsContextType | null>(null)

export function DailyReportSettingsProvider({ children }: { children: React.ReactNode }) {
    const { name: branchNameRaw } = useBranchUnified()
    const branchName = (branchNameRaw || '').trim()

    const [originalSettings, setOriginalSettings] = useState<SettingsJson>({})
    const [draftSettings, setDraftSettings] = useState<SettingsJson>({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const savingRef = useRef(false)
    const mountedRef = useRef(true)

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    const fetchSettings = async (bname: string) => {
        if (!bname) {
            setLoading(false)
            return
        }
        setLoading(true)
        setError(null)
        try {
            const { data, error } = await supabase
                .from('daily_report_settings')
                .select('settings')
                .eq('branch_name', bname)
                .maybeSingle()

            if (error) throw error

            const loaded = typeof data?.settings === 'string'
                ? JSON.parse(data.settings)
                : (data?.settings ?? {})

            if (mountedRef.current) {
                setOriginalSettings(loaded)
                setDraftSettings(loaded)
            }
        } catch (err: any) {
            if (mountedRef.current) setError(err.message)
        } finally {
            if (mountedRef.current) setLoading(false)
        }
    }

    useEffect(() => {
        fetchSettings(branchName)
    }, [branchName])

    const updateDraft = (section: keyof SettingsJson, data: any) => {
        setDraftSettings(prev => ({
            ...prev,
            [section]: data
        }))
    }

    const saveAll = async () => {
        if (!branchName) return
        if (savingRef.current) return
        savingRef.current = true

        try {
            const { error } = await supabase
                .from('daily_report_settings')
                .upsert({
                    branch_name: branchName,
                    settings: draftSettings,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'branch_name' })

            if (error) throw error

            setOriginalSettings(draftSettings)

            // Broadcast changes
            try {
                const bc = new BroadcastChannel('dr-settings')
                bc.postMessage({ type: 'update', branch: branchName, settings: draftSettings })
                bc.close()
            } catch { }

        } catch (err: any) {
            setError(err.message)
            throw err
        } finally {
            savingRef.current = false
        }
    }

    const isDirty = useMemo(() => {
        return JSON.stringify(originalSettings) !== JSON.stringify(draftSettings)
    }, [originalSettings, draftSettings])

    return (
        <DailyReportSettingsContext.Provider value={{
            loading,
            error,
            settings: draftSettings,
            updateDraft,
            saveAll,
            refresh: () => fetchSettings(branchName),
            isDirty
        }}>
            {children}
        </DailyReportSettingsContext.Provider>
    )
}

export function useDailyReportSettingsContext() {
    const ctx = useContext(DailyReportSettingsContext)
    if (!ctx) throw new Error('useDailyReportSettingsContext must be used within DailyReportSettingsProvider')
    return ctx
}
