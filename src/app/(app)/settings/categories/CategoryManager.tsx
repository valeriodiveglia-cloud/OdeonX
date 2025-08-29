'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowUturnLeftIcon
} from '@heroicons/react/24/outline'

type Kind = 'dish'|'prep'|'equipment'
type Category = {
  id: string | number
  name: string
}

async function api<T>(kind: Kind, path: 'list'|'upsert'|'delete', init?: RequestInit): Promise<T> {
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
  const [rows, setRows] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<null | Category>(null)
  const [msg, setMsg] = useState<string|null>(null)

  const titleByKind: Record<Kind,string> = {
    dish: 'Dish Categories',
    prep: 'Prep Categories',
    equipment: 'Equipment Categories',
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    api<any>(kind, 'list')
      .then(payload => {
        const list: Category[] = payload?.data ?? payload?.rows ?? []
        if (alive) setRows(list)
      })
      .catch(e => setMsg(e.message || 'Error'))
      .finally(() => alive && setLoading(false))
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
      const payload = await api<any>(kind, 'upsert', {
        method: 'POST',
        body: JSON.stringify({ row: editing ? { ...editing, ...row } : row }),
      })
      const saved: Category = payload?.data ?? payload
      setRows(prev => {
        const idx = prev.findIndex(r => r.id === optimisticId || r.id === editing?.id)
        const next = [...prev]
        if (idx >= 0) next[idx] = saved
        else next.unshift(saved)
        return next
      })
      setMsg('Saved')
    } catch (e:any) {
      setMsg(e.message || 'Error')
      try {
        const payload = await api<any>(kind, 'list')
        setRows(payload?.data ?? payload?.rows ?? [])
      } catch {}
    } finally {
      setBusy(false)
      setModalOpen(false)
      setEditing(null)
    }
  }

  async function remove(row: Category) {
    if (!confirm('Delete this category?')) return
    const snapshot = rows
    setRows(prev => prev.filter(r => r.id !== row.id))
    try {
      await api(kind, 'delete', { method: 'POST', body: JSON.stringify({ id: row.id }) })
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
