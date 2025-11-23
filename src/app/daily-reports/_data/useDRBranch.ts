// src/app/daily-reports/_data/useDRBranch.ts
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

export type DRBranch = { id: string; name: string; address?: string }

const LS_KEY = 'dailyreports.selectedBranch'      // JSON con id, name, address
const LS_KEY_NAME = 'DR_BRANCH_NAME'             // solo nome, per bridge legacy
const EVT_MAIN = 'dailyreports:branch:changed'   // nuovo formato usato dagli hook
const EVT_LEGACY = 'dailyreports:branch-changed' // compat con codice vecchio

function readLS(): DRBranch | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (v && typeof v.id === 'string') return v
    return null
  } catch {
    return null
  }
}

function writeLS(b: DRBranch | null) {
  try {
    if (b) {
      localStorage.setItem(LS_KEY, JSON.stringify(b))
      if (b.name && b.name.trim()) {
        localStorage.setItem(LS_KEY_NAME, b.name.trim())
      }
    } else {
      localStorage.removeItem(LS_KEY)
      // non tocchiamo LS_KEY_NAME per non rompere altre schermate
    }
  } catch {}
}

function emitBranchChange(b: DRBranch | null) {
  try {
    // nuovo evento standard
    window.dispatchEvent(new CustomEvent(EVT_MAIN, { detail: b }))
  } catch {}

  try {
    // evento legacy, nel dubbio lo teniamo ancora
    window.dispatchEvent(new CustomEvent(EVT_LEGACY, { detail: b }))
  } catch {}

  try {
    // bridge via localStorage per hook che ascoltano solo storage
    localStorage.setItem('dr_branch_last_emit_at', String(Date.now()))
  } catch {}
}

export function useDRBranch(opts?: { validate?: boolean }) {
  const [branch, setBranchState] = useState<DRBranch | null>(() =>
    typeof window !== 'undefined' ? readLS() : null
  )
  const [validating, setValidating] = useState(false)
  const [invalid, setInvalid] = useState(false)

  // guard per evitare setState dopo wake / unmount
  const isActiveRef = useRef(true)

  // safe setters
  const safeSetBranchState = (value: DRBranch | null | ((prev: DRBranch | null) => DRBranch | null)) => {
    if (!isActiveRef.current) return
    setBranchState(value as any)
  }
  const safeSetValidating = (value: boolean) => {
    if (!isActiveRef.current) return
    setValidating(value)
  }
  const safeSetInvalid = (value: boolean) => {
    if (!isActiveRef.current) return
    setInvalid(value)
  }

  useEffect(() => {
    isActiveRef.current = true
    return () => {
      isActiveRef.current = false
    }
  }, [])

  const setBranch = useCallback((b: DRBranch | null) => {
    safeSetBranchState(b)
    writeLS(b)
    emitBranchChange(b)
  }, [])

  useEffect(() => {
    if (!opts?.validate) return
    let ignore = false
    const b = readLS()
    if (!b?.id) return
    safeSetValidating(true)

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('provider_branches')
          .select('id,name,address')
          .eq('id', b.id)
          .maybeSingle()
        if (error) throw error
        if (!ignore && isActiveRef.current) {
          if (!data) {
            safeSetInvalid(true)
            setBranch(null)
          } else {
            safeSetInvalid(false)
            setBranch({
              id: String(data.id),
              name: data.name || '',
              address: data.address || '',
            })
          }
        }
      } catch {
        // se la validazione fallisce per rete, non invalidiamo
      } finally {
        if (!ignore && isActiveRef.current) safeSetValidating(false)
      }
    })()

    return () => {
      ignore = true
    }
  }, [opts?.validate, setBranch])

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent
      const b = ce.detail as DRBranch | null
      if (b && typeof b.id === 'string') {
        safeSetBranchState(b)
      } else {
        // se il dettaglio non è valido, ripieghiamo su localStorage
        safeSetBranchState(readLS())
      }
    }

    window.addEventListener(EVT_MAIN, handler as EventListener)
    window.addEventListener(EVT_LEGACY, handler as EventListener)

    return () => {
      window.removeEventListener(EVT_MAIN, handler as EventListener)
      window.removeEventListener(EVT_LEGACY, handler as EventListener)
    }
  }, [])

  const clearBranch = useCallback(() => setBranch(null), [setBranch])

  return useMemo(
    () => ({
      branch,
      setBranch,
      clearBranch,
      validating,
      invalid,
    }),
    [branch, setBranch, clearBranch, validating, invalid]
  )
}