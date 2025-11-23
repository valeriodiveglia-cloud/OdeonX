// src/app/daily-reports/_data/useBridgeLegacyBranch.ts
'use client'

import { useEffect, useRef, useState } from 'react'

type Bridge = { name: string; setName: (v: string) => void }

/**
 * Bridge di compatibilità per il branch tra codice nuovo e legacy.
 * Sorgenti lette in ordine di priorità:
 * 1) window.DR_ACTIVE_BRANCH
 * 2) localStorage.dailyreports.selectedBranchName
 * 3) localStorage.dailyreports.selectedBranch
 * 4) localStorage.DR_BRANCH_NAME
 */
export function useBridgeLegacyBranch(): Bridge {
  const readAll = (): string => {
    try {
      // 1) global
      const g = (globalThis as any)
      if (g && typeof g.DR_ACTIVE_BRANCH === 'string' && g.DR_ACTIVE_BRANCH.trim()) {
        return g.DR_ACTIVE_BRANCH.trim()
      }

      // 2) legacy keys
      const k1 = localStorage.getItem('dailyreports.selectedBranchName')
      if (k1 && k1.trim()) return k1.trim()

      const k2 = localStorage.getItem('dailyreports.selectedBranch')
      if (k2 && k2.trim()) return k2.trim()

      const k3 = localStorage.getItem('DR_BRANCH_NAME')
      if (k3 && k3.trim()) return k3.trim()

      return ''
    } catch {
      return ''
    }
  }

  const [name, setNameState] = useState<string>(readAll())
  const lastEmit = useRef<number>(0)

  const setName = (v: string) => {
    const val = (v || '').trim()
    try {
      const g = (globalThis as any)
      if (g) g.DR_ACTIVE_BRANCH = val

      if (val) {
        localStorage.setItem('dailyreports.selectedBranchName', val)
        localStorage.setItem('dailyreports.selectedBranch', val)
        localStorage.setItem('DR_BRANCH_NAME', val)
      } else {
        localStorage.setItem('dailyreports.selectedBranchName', '')
        localStorage.removeItem('dailyreports.selectedBranch')
        localStorage.removeItem('DR_BRANCH_NAME')
      }

      const now = Date.now()
      lastEmit.current = now
      localStorage.setItem('dr_branch_last_emit_at', String(now))

      const detail = { name: val }
      window.dispatchEvent(new CustomEvent('dr:branch:changed', { detail }))
      window.dispatchEvent(new CustomEvent('dailyreports:branch:changed', { detail }))
      window.dispatchEvent(new CustomEvent('credits:branch:changed', { detail }))

      setNameState(val)
    } catch {
      setNameState(val)
    }
  }

  useEffect(() => {
    const syncFromSources = () => {
      setNameState(prev => {
        const next = readAll()
        return next === prev ? prev : next
      })
    }

    syncFromSources()

    const onStorage = (e: StorageEvent) => {
      if (!e) return
      if (
        e.key === 'DR_BRANCH_NAME' ||
        e.key === 'dailyreports.selectedBranch' ||
        e.key === 'dailyreports.selectedBranchName' ||
        e.key === 'dr_branch_last_emit_at'
      ) {
        if (e.key === 'dr_branch_last_emit_at') {
          const ts = Number(e.newValue || '0')
          if (ts && ts === lastEmit.current) return
        }
        syncFromSources()
      }
    }

    window.addEventListener('storage', onStorage)

    const onLocal = (ev: any) => {
      const nm = ev?.detail?.name
      if (typeof nm === 'string') setNameState(nm)
    }
    window.addEventListener('dr:branch:changed', onLocal as any)
    window.addEventListener('dailyreports:branch:changed', onLocal as any)
    window.addEventListener('credits:branch:changed', onLocal as any)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') syncFromSources()
    }
    const onFocus = () => syncFromSources()
    const onOnline = () => syncFromSources()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)

    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('dr:branch:changed', onLocal as any)
      window.removeEventListener('dailyreports:branch:changed', onLocal as any)
      window.removeEventListener('credits:branch:changed', onLocal as any)

      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  return { name, setName }
}