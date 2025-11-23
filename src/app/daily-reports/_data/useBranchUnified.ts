// src/app/daily-reports/_data/useBranchUnified.ts
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDRBranch } from './useDRBranch'

const LS_KEY = 'DR_BRANCH_NAME'
const LS_BUMP_KEY = 'dr_branch_last_emit_at'

function emitBranchEvents(name: string) {
  try {
    window.dispatchEvent(new CustomEvent('dr:branch:changed', { detail: { name } }))
    window.dispatchEvent(new CustomEvent('dailyreports:branch:changed', { detail: { name } }))
    window.dispatchEvent(new CustomEvent('cashier:branch:changed', { detail: { name } }))
  } catch {
    // ignore
  }
}

function writeToLS(name: string) {
  try {
    if (typeof window === 'undefined') return
    localStorage.setItem(LS_KEY, name)
    // bump per cross-tab / altri hook che ascoltano il cambio branch
    localStorage.setItem(LS_BUMP_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

function readFromLS(): string {
  try {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(LS_KEY) || ''
  } catch {
    return ''
  }
}

export function useBranchUnified() {
  // Branch “ufficiale” dall’hook centrale
  const { branch } = useDRBranch({ validate: false })
  const official = branch?.name || ''

  // Mirror locale di DR_BRANCH_NAME
  const [stored, setStored] = useState<string>(() => readFromLS())

  // Per evitare loop tra effetti/setName
  const lastWritten = useRef<string>('')

  // Ascolta cambi provenienti da altre tab o da altri pezzi di codice
  useEffect(() => {
    if (typeof window === 'undefined') return

    const onStorage = (e: StorageEvent) => {
      if (!e.key) return

      // Se cambia DR_BRANCH_NAME o il bump, rileggiamo
      if (e.key === LS_KEY || e.key === LS_BUMP_KEY) {
        const next = readFromLS()
        setStored(next)
        lastWritten.current = next
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Quando l’ufficiale arriva o cambia, lo propaghiamo a LS + eventi (una sola volta per valore)
  useEffect(() => {
    if (!official) return
    if (lastWritten.current === official) return

    writeToLS(official)
    lastWritten.current = official
    setStored(official)
    emitBranchEvents(official)
  }, [official])

  // Nome effettivo: preferisci ufficiale, altrimenti quello in LS
  const name = useMemo(
    () => (official || stored || '').trim(),
    [official, stored],
  )

  // Ready: abbiamo un branch da usare (anche solo da LS)
  const ready = Boolean(name)

  // Setter manuale: aggiorna LS + evento + stato locale
  const setName = (v: string) => {
    const clean = String(v || '').trim()
    writeToLS(clean)
    lastWritten.current = clean
    setStored(clean)
    emitBranchEvents(clean)
  }

  return { name, ready, setName }
}