// src/app/catering/_data/useMaterialCategories.ts
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'

type State = { cats: string[]; loading: boolean; error: string | null }

const CAT_TABLE = 'categories'
const CAT_COLS = ['name', 'name_key'] as const

// ⚠️ niente 'name' qui: su materials 'name' è l’item, non la categoria
const MAT_CANDIDATE_COLS = [
  'category_name',
  'category',
  'mat_category',
  'material_category',
  'group_name',
  'group',          // parola riservata → la quotiamo
  'type',
  'family',
  'class',
  'class_name',
  'subcategory',
  'sub_category',
] as const

const MAT_SOURCES = ['materials', 'materials_vw'] as const

function q(col: string) {
  const reserved = new Set(['group','user','order','where'])
  return reserved.has(col.toLowerCase()) || /[^a-z0-9_]/i.test(col) ? `"${col}"` : col
}
function norm(v: any): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined' ? s : null
}

export function useMaterialCategories(): State {
  const [cats, setCats] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setError(null)

      try {
        /* ---- 1) categories: name / name_key ---- */
        try {
          // provo a prendere entrambe e uso name come preferenza
          const { data, error } = await supabase
            .from(CAT_TABLE)
            .select('name,name_key')
            .order('name', { ascending: true })

          if (!error) {
            const out = new Set<string>()
            for (const r of (data ?? [])) {
              const val = norm((r as any).name) ?? norm((r as any).name_key)
              if (val) out.add(val)
            }
            if (out.size) {
              if (!alive) return
              setCats(Array.from(out))
              setLoading(false)
              return
            }
          }
        } catch { /* passa al fallback */ }

        /* ---- 2) fallback: “auto-scoperta” da materials/materials_vw ---- */
        let foundSource: string | null = null
        let foundCol: string | null = null

        for (const src of MAT_SOURCES) {
          try {
            const probe = await supabase.from(src).select('*').limit(1)
            if (!probe.error && probe.data && probe.data.length) {
              const keys = Object.keys(probe.data[0] as any)
              const hit = MAT_CANDIDATE_COLS.find(c => keys.includes(c))
              if (hit) { foundSource = src; foundCol = hit; break }
            }
          } catch { /* next */ }
        }

        if (!foundSource || !foundCol) {
          if (!alive) return
          setCats([]); setLoading(false)
          setError('No category column found for materials')
          return
        }

        const sel = q(foundCol)
        const { data: rows, error: selErr } = await supabase
          .from(foundSource)
          .select(sel)
          .limit(5000)

        if (selErr) {
          if (!alive) return
          setCats([]); setLoading(false)
          setError(selErr.message || 'Materials select failed')
          return
        }

        const out = new Set<string>()
        for (const r of (rows ?? [])) {
          const v = norm((r as any)[foundCol])
          if (v) out.add(v)
        }

        if (!alive) return
        setCats(Array.from(out).sort((a, b) => a.localeCompare(b)))
        setLoading(false)
      } catch (e: any) {
        if (!alive) return
        setCats([]); setLoading(false)
        setError(e?.message || String(e))
      }
    })()

    return () => { alive = false }
  }, [])

  return { cats, loading, error }
}
