'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowUturnLeftIcon
} from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'

type Kind = 'materials' | 'dish' | 'prep' | 'equipment'
type Category = {
  id: string | number
  name: string
}

async function api<T>(kind: Exclude<Kind,'materials'>, path: 'list'|'upsert'|'delete', init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/categories/${kind}/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  })
  let data: any = null
  try { data = await res.json() } catch {}
  if (!res.ok) throw new Error(data?.error || `Request failed ${res.status}`)
  return data as T
}

export default function CategoryManager({ kind }: { kind: Kind }) {
  const router = useRouter()
  const { language: lang } = useSettings()
  const [rows, setRows] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<null | Category>(null)
  const [msg, setMsg] = useState<string|null>(null)

  const titleByKind: Record<Kind,string> = {
    materials: 'Material Categories',
    dish: 'Dish Categories',
    prep: 'Prep Categories',
    equipment: 'Equipment Categories',
  }

  async function load() {
    setLoading(true)
    setMsg(null)
    try {
      if (kind === 'materials') {
        const { data, error } = await supabase
          .from('categories')
          .select('id, name')
          .order('name', { ascending: true })
        if (error) throw error
        setRows(data || [])
      } else {
        const payload = await api<any>(kind, 'list')
        const list: Category[] = payload?.data ?? payload?.rows ?? []
        setRows(list)
      }
    } catch (e: any) {
      setMsg(e.message || 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let alive = true
    ;(async () => { if (alive) await load() })()
    return () => { alive = false }
  }, [kind])

  async function upsert(row: Partial<Category>) {
    setBusy(true)
    const optimisticId = editing?.id ?? ('temp-' + Date.now())
    const optimistic = editing
      ? rows.map(r => (r.id === editing.id ? { ...r, ...row } as Category : r))
      : [{ id: optimisticId, name: String(row.name || '') } as Category, ...rows]
    setRows(optimistic)

    try {
      let saved: Category | null = null

      if (kind === 'materials') {
        if (editing) {
          const { data, error } = await supabase
            .from('categories')
            .update({ name: String(row.name || '') })
            .eq('id', editing.id)
            .select('id, name')
            .single()
          if (error) throw error
          saved = data as Category
        } else {
          const { data, error } = await supabase
            .from('categories')
            .insert({ name: String(row.name || '') })
            .select('id, name')
            .single()
          if (error) throw error
          saved = data as Category
        }
      } else {
        const payload = await api<any>(kind, 'upsert', {
          method: 'POST',
          body: JSON.stringify({ row: editing ? { ...editing, ...row } : row }),
        })
        saved = (payload?.data ?? payload) as Category
      }

      setRows(prev => {
        const idx = prev.findIndex(r => r.id === optimisticId || r.id === editing?.id)
        const next = [...prev]
        if (idx >= 0) next[idx] = saved!
        else next.unshift(saved!)
        return next
      })
      setMsg('Saved')
    } catch (e:any) {
      setMsg(e.message || 'Error')
      await load() // rollback soft: ricarica
    } finally {
      setBusy(false)
      setModalOpen(false)
      setEditing(null)
    }
  }

  async function remove(row: Category) {
    try {
      setBusy(true)
      let inUseNames: string[] = []
      let blockMessagePattern = ''

      if (kind === 'materials') {
        const { data, error } = await supabase
          .from('materials')
          .select('name')
          .eq('category_id', row.id)
          .is('deleted_at', null)
          .limit(5)
        if (error) throw error
        inUseNames = data?.map(m => m.name) || []
        blockMessagePattern = 'materials'
      } else if (kind === 'dish') {
        const { data, error } = await supabase
          .from('final_recipes')
          .select('name')
          .eq('category_id', row.id)
          .is('deleted_at', null)
          .limit(5)
        if (error) throw error
        inUseNames = data?.map(m => m.name) || []
        blockMessagePattern = 'dishes'
      } else if (kind === 'prep') {
        const { data, error } = await supabase
          .from('prep_recipes')
          .select('name')
          .eq('category_id', row.id)
          .is('deleted_at', null)
          .limit(5)
        if (error) throw error
        inUseNames = data?.map(m => m.name) || []
        blockMessagePattern = 'preps'
      } else if (kind === 'equipment') {
        const { data, error } = await supabase
          .from('rental_equipment')
          .select('name')
          .eq('category_id', row.id)
          .is('deleted_at', null)
          .limit(5)
        if (error) throw error
        inUseNames = data?.map(m => m.name) || []
        blockMessagePattern = 'equipment'
      }

      if (inUseNames.length > 0) {
        const names = inUseNames.join(', ')
        let warningMsg = ''
        const currentLang = lang as string

        if (blockMessagePattern === 'materials') {
          if (currentLang === 'vi') {
            warningMsg = `Danh mục này hiện đang được sử dụng bởi các nguyên liệu sau: ${names}. Vui lòng chuyển đổi hoặc xóa các nguyên liệu đó trước.`
          } else {
            warningMsg = `This category is currently in use by the following materials: ${names}. Please reassign or delete those materials first.`
          }
        } else if (blockMessagePattern === 'dishes') {
          if (currentLang === 'vi') {
            warningMsg = `Danh mục này hiện đang được sử dụng bởi các món ăn sau: ${names}. Vui lòng chuyển đổi hoặc xóa các món ăn đó trước.`
          } else {
            warningMsg = `This category is currently in use by the following dishes: ${names}. Please reassign or delete those dishes first.`
          }
        } else if (blockMessagePattern === 'preps') {
          if (currentLang === 'vi') {
            warningMsg = `Danh mục này hiện đang được sử dụng bởi các công thức chuẩn bị sau: ${names}. Vui lòng chuyển đổi oặc xóa các công thức đó trước.`
          } else {
            warningMsg = `This category is currently in use by the following prep recipes: ${names}. Please reassign or delete those prep recipes first.`
          }
        } else if (blockMessagePattern === 'equipment') {
          if (currentLang === 'vi') {
            warningMsg = `Danh mục này hiện đang được sử dụng bởi các thiết bị sau: ${names}. Vui lòng chuyển đổi hoặc xóa các thiết bị đó trước.`
          } else {
            warningMsg = `This category is currently in use by the following equipment: ${names}. Please reassign or delete those equipment first.`
          }
        }

        alert(warningMsg)
        return
      }
    } catch (e: any) {
      setMsg(e.message || 'Error checking constraints')
      return
    } finally {
      setBusy(false)
    }

    if (!confirm(lang === 'vi' ? 'Xóa danh mục này?' : 'Delete this category?')) return
    const snapshot = rows
    setRows(prev => prev.filter(r => r.id !== row.id))
    try {
      if (kind === 'materials') {
        const { error } = await supabase.from('categories').delete().eq('id', row.id)
        if (error) throw error
      } else {
        await api(kind, 'delete', { method: 'POST', body: JSON.stringify({ id: row.id }) })
      }
    } catch (e:any) {
      setMsg(e.message || 'Error')
      setRows(snapshot)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{titleByKind[kind]}</h1>
        <div className="flex gap-2">
          <button onClick={() => router.push('/settings')} className="px-3 h-9 rounded-lg border inline-flex items-center gap-2">
            <ArrowUturnLeftIcon className="w-4 h-4" /> Back
          </button>
          <button onClick={() => { setEditing(null); setModalOpen(true) }} className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white">
            <PlusIcon className="w-5 h-5" /> New
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="text-left p-2">Name</th>
              <th className="p-2 w-28" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={2} className="p-6 text-center text-gray-500">Loading…</td></tr>
            ) : rows.length ? rows.map(r => (
              <tr key={String(r.id)} className="border-t">
                <td className="p-2 text-gray-800">{r.name}</td>
                <td className="p-2">
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setEditing(r); setModalOpen(true) }}
                      className="px-2 h-8 rounded-lg border border-gray-700 text-gray-700 inline-flex items-center gap-1"
                    >
                      <PencilSquareIcon className="w-4 h-4" /> Edit
                    </button>
                    <button
                      onClick={() => remove(r)}
                      className="px-2 h-8 rounded-lg border border-red-600 text-red-600 inline-flex items-center gap-1"
                    >
                      <TrashIcon className="w-4 h-4" /> Del
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={2} className="p-6 text-center text-gray-500">No categories yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && <div className="mt-2 text-sm text-gray-600">{msg}</div>}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow p-4">
            <div className="font-semibold mb-2 text-gray-800">
              {editing ? 'Edit category' : 'New category'}
            </div>
            <form onSubmit={(e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget as HTMLFormElement)
              upsert({ name: String(f.get('name')||'').trim() })
            }}>
              <label className="block text-sm mb-1 text-gray-800">Name</label>
              <input
                name="name"
                defaultValue={editing?.name||''}
                className="w-full border rounded-lg px-2 py-1 mb-2 text-gray-800"
                required
              />
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-3 h-9 rounded-lg border text-gray-700">Cancel</button>
                <button disabled={busy} className={`px-3 h-9 rounded-lg bg-blue-600 text-white ${busy ? 'opacity-60':''}`}>{editing ? 'Save' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
