// src/components/modals/TagManagerModal.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
import {
  XMarkIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'

type TagRow = { id: number; name: string }

type Props = {
  open: boolean
  onClose: () => void
}

export default function TagManagerModal({ open, onClose }: Props) {
  const { language: lang } = useSettings()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [rows, setRows] = useState<TagRow[]>([])
  const [filter, setFilter] = useState('')

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  // nuovo: modale "Add tag"
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return
      if (e.key === 'Escape') {
        if (addOpen) setAddOpen(false)
        else onClose()
      }
      if (e.key === 'Enter' && editingId != null && !addOpen) {
        e.preventDefault()
        commitEdit()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, editingId, addOpen, onClose])

  useEffect(() => { if (open) fetchRows() }, [open])

  useEffect(() => {
    if (!addOpen) return
    const id = setTimeout(() => addInputRef.current?.focus(), 50)
    return () => clearTimeout(id)
  }, [addOpen])

  async function fetchRows() {
    setLoading(true)
    const { data, error } = await supabase.from('tags').select('*').order('name', { ascending: true })
    if (error) console.error('tags select error:', error)
    setRows(data ?? [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.name.toLowerCase().includes(q))
  }, [rows, filter])

  function nameExistsCaseInsensitive(name: string, excludeId?: number) {
    const n = name.trim().toLowerCase()
    return rows.some(r => r.id !== excludeId && r.name.trim().toLowerCase() === n)
  }

  async function handleAdd() {
    const name = addName.trim()
    if (!name) return
    if (nameExistsCaseInsensitive(name)) {
      alert((t('SavedErr', lang) || 'Error') + ': ' + (t('AlreadyExists', lang) || 'Already exists'))
      return
    }
    setSaving(true)
    const { data, error } = await supabase.from('tags').insert([{ name }]).select().single()
    setSaving(false)
    if (error) {
      alert((t('SavedErr', lang) || 'Error') + ': ' + error.message)
      return
    }
    setRows(prev => [...prev, data as TagRow].sort((a, b) => a.name.localeCompare(b.name)))
    setAddName('')
    setAddOpen(false)
  }

  function startEdit(r: TagRow) {
    setEditingId(r.id)
    setEditName(r.name)
    setTimeout(() => editInputRef.current?.focus(), 0)
  }

  async function commitEdit() {
    if (editingId == null) return
    const name = editName.trim()
    if (!name) { setEditingId(null); setEditName(''); return }
    if (nameExistsCaseInsensitive(name, editingId)) {
      alert((t('SavedErr', lang) || 'Error') + ': ' + (t('AlreadyExists', lang) || 'Already exists'))
      return
    }
    setSaving(true)
    const { error } = await supabase.from('tags').update({ name }).eq('id', editingId)
    setSaving(false)
    if (error) {
      alert((t('SavedErr', lang) || 'Error') + ': ' + error.message)
      return
    }
    setRows(prev => prev.map(r => r.id === editingId ? { ...r, name } : r).sort((a, b) => a.name.localeCompare(b.name)))
    setEditingId(null)
    setEditName('')
  }

  async function getUsageCount(tagId: number) {
    const { count: finalCnt } = await supabase.from('final_recipe_tags').select('*', { count: 'exact', head: true }).eq('tag_id', tagId)
    const { count: prepCnt }  = await supabase.from('prep_recipe_tags').select('*', { count: 'exact', head: true }).eq('tag_id', tagId)
    return (finalCnt ?? 0) + (prepCnt ?? 0)
  }

  async function handleDelete(r: TagRow) {
    const count = await getUsageCount(r.id)
    const msg = count > 0
      ? `${t('Delete', lang) || 'Delete'} “${r.name}”? ${count} ${t('Usages', lang) || 'usages'} ${t('Found', lang) || 'found'}. ${t('ThisCannotBeUndone', lang) || 'This cannot be undone.'}`
      : `${t('Delete', lang) || 'Delete'} “${r.name}”? ${t('ThisCannotBeUndone', lang) || 'This cannot be undone.'}`
    if (!window.confirm(msg)) return

    setSaving(true)
    const { error } = await supabase.from('tags').delete().eq('id', r.id)
    setSaving(false)
    if (error) {
      alert((t('SavedErr', lang) || 'Error') + ': ' + error.message)
      return
    }
    setRows(prev => prev.filter(x => x.id !== r.id))
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-black/10">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
          <h2 className="text-lg font-semibold text-gray-900">{t('ManageTags', lang) || 'Manage tags'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" aria-label={t('Close', lang) || 'Close'}>
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 text-gray-900">
          {/* Toolbar: New + Filter */}
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center mb-3">
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1 px-3 h-9 rounded-lg text-white bg-blue-600 hover:opacity-90"
            >
              <PlusIcon className="w-5 h-5" />
              {t('NewTag', lang) || 'New tag'}
            </button>
            <div className="sm:ml-auto" />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder={t('Search', lang) || 'Search'}
              className="sm:w-56 border rounded-lg px-2 h-9"
            />
          </div>

          {/* Table */}
          <div className="overflow-auto border rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left p-2 w-16">ID</th>
                  <th className="text-left p-2">{t('Name', lang) || 'Name'}</th>
                  <th className="text-right p-2 w-40">{t('Actions', lang) || 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="p-3" colSpan={3}>{t('Loading', lang) || 'Loading…'}</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td className="p-3" colSpan={3}>{t('NoData', lang) || 'No data'}</td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 text-gray-600">{r.id}</td>
                    <td className="p-2">
                      {editingId === r.id ? (
                        <input
                          ref={editInputRef}
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full border rounded-lg px-2 h-8"
                        />
                      ) : r.name}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center justify-end gap-2">
                        {editingId === r.id ? (
                          <button onClick={commitEdit} disabled={saving} className="px-2 h-8 rounded-lg border bg-green-600 text-white hover:opacity-90" title={t('Save', lang) || 'Save'}>
                            <CheckIcon className="w-5 h-5" />
                          </button>
                        ) : (
                          <button onClick={() => startEdit(r)} className="px-2 h-8 rounded-lg border hover:bg-gray-50" title={t('Edit', lang) || 'Edit'}>
                            <PencilSquareIcon className="w-5 h-5" />
                          </button>
                        )}
                        <button onClick={() => handleDelete(r)} className="px-2 h-8 rounded-lg border border-red-300 text-red-600 hover:bg-red-50" title={t('Delete', lang) || 'Delete'}>
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="mt-3 flex justify-end">
            <button onClick={onClose} className="inline-flex items-center px-4 h-9 rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50">
              {t('Close', lang) || 'Close'}
            </button>
          </div>
        </div>
      </div>

      {/* Add Tag modal */}
      {addOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAddOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-black/10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
              <div className="text-base font-semibold text-gray-900">{t('NewTag', lang) || 'New tag'}</div>
              <button onClick={() => setAddOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" aria-label={t('Close', lang) || 'Close'}>
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 text-gray-900">
              <label className="text-sm text-gray-800">{t('Name', lang) || 'Name'}</label>
              <input
                ref={addInputRef}
                value={addName}
                onChange={e => setAddName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                className="mt-1 w-full border rounded-lg px-2 h-10"
                placeholder=" "
              />
              <div className="mt-4 flex items-center justify-end gap-2">
                <button onClick={() => setAddOpen(false)} className="px-3 h-9 rounded-lg border hover:bg-gray-50">
                  {t('Cancel', lang) || 'Cancel'}
                </button>
                <button onClick={handleAdd} disabled={saving || !addName.trim()} className={`px-3 h-9 rounded-lg text-white ${saving || !addName.trim() ? 'bg-blue-600/60' : 'bg-blue-600 hover:opacity-90'}`}>
                  {t('Save', lang) || 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
