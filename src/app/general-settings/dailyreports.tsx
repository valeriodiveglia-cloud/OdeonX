// app/general-settings/dailyreports.tsx
'use client'

import { useEffect, useMemo, useState, Fragment } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { PlusIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon, XCircleIcon, ArrowsUpDownIcon, Bars3Icon } from '@heroicons/react/24/outline'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'

type ProviderBranch = {
  id: string
  name: string
  company_name?: string
  address?: string
  city?: string
  tax_code?: string
  phone?: string
  email?: string
  bank?: string
  bank_account_name?: string
  account_number?: string
  sort_order?: number | null
  is_active?: boolean
  isNew?: boolean
}

const LS_KEY = 'generalsettings.providerBranches.v1'
const LS_ORDER_KEY = 'generalsettings.providerBranchesOrder.v1'

/* -------- Small UI primitives (scoped to this file) -------- */
function Card(props: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-100 bg-white text-slate-800 shadow-xl overflow-hidden">{props.children}</div>
}
function CardHeader(props: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 gap-3 flex-wrap bg-slate-50/50 rounded-t-2xl">
      <h2 className="text-lg font-bold text-slate-800 tracking-tight">{props.title}</h2>
      <div className="flex items-center gap-3">{props.right}</div>
    </div>
  )
}
function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label className="flex flex-col">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        className="mt-1.5 w-full border border-slate-200 rounded-xl px-3.5 h-11 text-slate-800 bg-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm outline-none shadow-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
      />
    </label>
  )
}
function IconBtn({
  title,
  onClick,
  children,
  variant = 'default',
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  variant?: 'default' | 'danger'
}) {
  const base = 'h-10 w-10 inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-800 transition-all active:scale-95 shadow-sm'
  const danger = 'h-10 w-10 inline-flex items-center justify-center rounded-xl border border-red-200 text-red-600 bg-white hover:bg-red-50 transition-all active:scale-95 shadow-sm'
  return (
    <button type="button" title={title} onClick={onClick} className={variant === 'danger' ? danger : base}>
      {children}
    </button>
  )
}

/* -------- Utils -------- */
function uid() {
  return `pb_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}
function saveLS(map: Record<string, ProviderBranch>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map))
  } catch { }
}
function loadLS(): Record<string, ProviderBranch> | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (p && typeof p === 'object') return p
    return null
  } catch {
    return null
  }
}
function saveOrderLS(order: string[]) {
  try {
    localStorage.setItem(LS_ORDER_KEY, JSON.stringify(order))
  } catch { }
}
function loadOrderLS(): string[] | null {
  try {
    const raw = localStorage.getItem(LS_ORDER_KEY)
    if (!raw) return null
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.filter(x => typeof x === 'string')
    return null
  } catch {
    return null
  }
}

/* -------- City Autocomplete -------- */
function CityAutocomplete({
  label,
  value,
  onChange,
  suggestions
}: {
  label: string
  value: string
  onChange: (v: string) => void
  suggestions: string[]
}) {
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState(false)

  // alias matching
  const aliases: Record<string, string> = {
    'saigon': 'Ho Chi Minh',
    'hcm': 'Ho Chi Minh',
    'hcmc': 'Ho Chi Minh',
  }

  function handleChange(v: string) {
    const lower = v.toLowerCase()
    if (aliases[lower]) {
      onChange(aliases[lower])
    } else {
      onChange(v)
    }
    setOpen(true)
  }

  let finalSuggestions = [...suggestions];
  for (const canonical of Object.values(aliases)) {
    if (!finalSuggestions.includes(canonical)) {
      finalSuggestions.push(canonical);
    }
  }

  const filtered = Array.from(new Set(finalSuggestions)).filter(s => {
    if (s.toLowerCase().includes(value.toLowerCase())) return true;
    for (const [alias, canonical] of Object.entries(aliases)) {
      if (canonical.toLowerCase() === s.toLowerCase() && alias.includes(value.toLowerCase())) {
        return true;
      }
    }
    return false;
  }).filter(s => s.toLowerCase() !== value.toLowerCase())

  return (
    <div className="relative flex flex-col">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        className="mt-1.5 w-full border border-slate-200 rounded-xl px-3.5 h-11 text-slate-800 bg-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm outline-none shadow-sm"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { setFocus(true); setOpen(true) }}
        onBlur={() => setTimeout(() => { setFocus(false); setOpen(false) }, 200)}
      />
      {(focus || open) && value.length >= 1 && filtered.length > 0 && (
        <ul className="absolute z-10 top-[100%] left-0 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto mt-1.5 py-1 text-slate-800">
          {filtered.map(s => (
            <li
              key={s}
              className="px-3.5 py-2.5 hover:bg-slate-50 cursor-pointer text-sm font-medium transition-colors text-slate-700"
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(s)
                setOpen(false)
                setFocus(false)
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ===========================================================
   Helper: Controlla se la filiale ha record in una delle tabelle
   =========================================================== */
async function checkIfBranchHasRecords(id: string, name: string): Promise<boolean> {
  if (!id) return false
  const trimmedName = (name || '').trim()

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  const queries = [
    supabase.from('hr_staff_branches').select('id', { count: 'exact', head: true }).eq('branch_id', id).limit(1),
    supabase.from('fin_bank_transactions').select('id', { count: 'exact', head: true }).eq('branch_id', id).limit(1),
    supabase.from('fin_invoices').select('id', { count: 'exact', head: true }).contains('branch_ids', [id]).limit(1),
    supabase.from('fin_corporate_card_expenses').select('id', { count: 'exact', head: true }).contains('branch_ids', [id]).limit(1),
    supabase.from('event_headers').select('id', { count: 'exact', head: true }).eq('provider_branch_id', id).limit(1),
    supabase.from('fin_inventory_records').select('id', { count: 'exact', head: true }).eq('branch_id', id).limit(1),
  ]

  if (trimmedName) {
    queries.push(
      supabase.from('cashout').select('id', { count: 'exact', head: true }).eq('branch', trimmedName).limit(1),
      supabase.from('wastage_entries').select('id', { count: 'exact', head: true }).eq('branch_name', trimmedName).limit(1),
      supabase.from('deposits').select('id', { count: 'exact', head: true }).eq('branch', trimmedName).limit(1),
      supabase.from('cash_ledger_deposits').select('id', { count: 'exact', head: true }).eq('branch', trimmedName).limit(1)
    )

    if (isUUID) {
      queries.push(
        supabase.from('cashier_closings').select('id', { count: 'exact', head: true }).or(`branch_id.eq.${id},branch_name.eq.${trimmedName}`).limit(1)
      )
    } else {
      queries.push(
        supabase.from('cashier_closings').select('id', { count: 'exact', head: true }).eq('branch_name', trimmedName).limit(1)
      )
    }
  } else if (isUUID) {
    queries.push(
      supabase.from('cashier_closings').select('id', { count: 'exact', head: true }).eq('branch_id', id).limit(1)
    )
  }

  try {
    const results = await Promise.all(queries)
    return results.some(res => {
      if (res.error) {
        console.warn('Query error in checkIfBranchHasRecords:', res.error)
        return false
      }
      return res.count !== null && res.count > 0
    })
  } catch (err) {
    console.error('Failed checking branch records:', err)
    return false
  }
}

/* ===========================================================
   Reusable Card: usala dentro l'index /general-settings/page.tsx
   =========================================================== */
export function DailyReportsCard() {
  const { language, currency } = useSettings()
  const [branches, setBranches] = useState<Record<string, ProviderBranch>>({})
  const [order, setOrder] = useState<string[]>([])
  const [branchHasRecords, setBranchHasRecords] = useState(false)

  const [isReorderOpen, setIsReorderOpen] = useState(false)
  const [tempOrder, setTempOrder] = useState<string[]>([])
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)

  function handleDragStart(index: number) {
    setDraggedIdx(index)
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    if (draggedIdx === null || draggedIdx === index) return

    const nextOrder = [...tempOrder]
    const draggedItem = nextOrder[draggedIdx]
    nextOrder.splice(draggedIdx, 1)
    nextOrder.splice(index, 0, draggedItem)

    setDraggedIdx(index)
    setTempOrder(nextOrder)
  }

  function handleDragEnd() {
    setDraggedIdx(null)
  }

  const branchOptions = useMemo(() => {
    const knownOrdered = order.filter(id => branches[id])
    const remaining = Object.keys(branches).filter(id => !knownOrdered.includes(id))
    return [...knownOrdered, ...remaining]
  }, [order, branches])

  const uniqueCities = useMemo(() => {
    const cities = new Set<string>()
    Object.values(branches).forEach(b => {
      if (b.city) cities.add(b.city.trim())
    })
    return Array.from(cities).sort()
  }, [branches])

  const [branchId, setBranchId] = useState<string>('')

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState<string | null>(null)

  // Sincronizza selezione se il branch corrente sparisce o è vuoto
  useEffect(() => {
    if (!branchId) {
      if (branchOptions.length > 0) setBranchId(branchOptions[0])
      return
    }
    if (!branches[branchId]) {
      if (branchOptions.length > 0) setBranchId(branchOptions[0])
      else setBranchId('')
    }
  }, [branchId, branchOptions, branches])

  // Controlla se la filiale corrente ha record associati
  useEffect(() => {
    if (!branchId) {
      setBranchHasRecords(false)
      return
    }
    const current = branches[branchId]
    if (!current) {
      setBranchHasRecords(false)
      return
    }
    if (current.isNew) {
      setBranchHasRecords(false)
      return
    }

    let ignore = false
    async function check() {
      const hasRecords = await checkIfBranchHasRecords(branchId, current.name)
      if (!ignore) {
        setBranchHasRecords(hasRecords)
      }
    }
    check()
    return () => {
      ignore = true
    }
  }, [branchId, branches])

  // Load from DB with LS fallback
  useEffect(() => {
    let ignore = false
    async function load() {
      setLoading(true)
      setLoadMsg(t(language, 'GeneralSettingsLoading'))
      try {
        const { data, error } = await supabase
          .from('provider_branches')
          .select('*')
          .order('sort_order', { ascending: true, nullsFirst: true })
          .order('name', { ascending: true })

        if (error) throw error

        const map: Record<string, ProviderBranch> = {}
        for (const row of data || []) {
          const id = String(row.id)
          map[id] = {
            id,
            name: row.name ?? '',
            company_name: row.company_name ?? '',
            address: row.address ?? '',
            city: row.city ?? '',
            tax_code: row.tax_code ?? '',
            phone: row.phone ?? '',
            email: row.email ?? '',
            bank: row.bank ?? '',
            bank_account_name: row.bank_account_name ?? '',
            account_number: row.account_number ?? '',
            sort_order: row.sort_order ?? null,
            is_active: row.is_active ?? true,
          }
        }

        // Always use DB order as source of truth
        const finalOrder = (data || []).map(row => String(row.id))

        if (!ignore) {
          setBranches(map)
          setOrder(finalOrder)
          setBranchId(finalOrder[0] || '')
          saveLS(map)
          saveOrderLS(finalOrder)
          setLoadMsg(null)
        }
      } catch {
        const ls = loadLS()
        if (!ignore && ls) {
          const storedOrder = loadOrderLS()
          const normalizedOrder = (storedOrder || []).filter(id => ls[id])
          const remaining = Object.keys(ls).filter(id => !normalizedOrder.includes(id))
          const finalOrder = [...normalizedOrder, ...remaining]

          setBranches(ls)
          setOrder(finalOrder)
          setBranchId(finalOrder[0] || '')
          setLoadMsg(t(language, 'GeneralSettingsLoadLocal'))
        } else {
          setLoadMsg(t(language, 'GeneralSettingsNothingToLoad'))
        }
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [])

  // Keep LS updated
  useEffect(() => {
    saveLS(branches)
  }, [branches])
  useEffect(() => {
    saveOrderLS(order)
  }, [order])

  const current = branchId ? branches[branchId] : null

  function createBranch() {
    const id = uid()
    const b: ProviderBranch = {
      id,
      name: t(language, 'GeneralSettingsNewBranch'),
      company_name: '',
      address: '',
      city: '',
      tax_code: '',
      phone: '',
      email: '',
      bank: '',
      bank_account_name: '',
      account_number: '',
      sort_order: null,
      is_active: true,
      isNew: true,
    }
    setBranches(prev => ({ ...prev, [id]: b }))
    setOrder(prev => [...prev, id])
    setBranchId(id)
  }

  async function deleteBranch() {
    if (!branchId) return
    const current = branches[branchId]
    if (!current) return

    if (current.isNew) {
      setBranches(prev => {
        const { [branchId]: _, ...rest } = prev
        return rest
      })
      setOrder(prev => prev.filter(id => id !== branchId))
      return
    }

    if (branchHasRecords) {
      const ok = window.confirm(t(language, 'GeneralSettingsConfirmDeactivateBranch'))
      if (!ok) return
      try {
        setSaving(true)
        const { error } = await supabase
          .from('provider_branches')
          .update({ is_active: false })
          .eq('id', branchId)

        if (error) throw error

        // Also deactivate the linked bank account(s)
        await supabase
          .from('fin_bank_accounts')
          .update({ is_active: false })
          .eq('branch_id', branchId)

        setBranches(prev => ({
          ...prev,
          [branchId]: { ...prev[branchId], is_active: false }
        }))
        setSaveMsg(t(language, 'GeneralSettingsDeactivated') || 'Deactivated')
      } catch (err: any) {
        console.error('Failed to deactivate branch:', err)
        alert(language === 'vi' ? 'Không thể ngừng hoạt động chi nhánh.' : 'Failed to deactivate branch.')
      } finally {
        setSaving(false)
        setTimeout(() => setSaveMsg(null), 2200)
      }
    } else {
      const ok = window.confirm(t(language, 'GeneralSettingsConfirmDeleteBranch'))
      if (!ok) return
      try {
        setSaving(true)

        // Delete the auto-created empty bank accounts associated with this branch first
        await supabase
          .from('fin_bank_accounts')
          .delete()
          .eq('branch_id', branchId)

        // Then delete the branch
        const { error } = await supabase
          .from('provider_branches')
          .delete()
          .eq('id', branchId)

        if (error) throw error

        setBranches(prev => {
          const { [branchId]: _, ...rest } = prev
          return rest
        })
        setOrder(prev => prev.filter(id => id !== branchId))
      } catch (err: any) {
        console.error('Failed to delete branch:', err)
        alert(language === 'vi' ? 'Không thể xóa chi nhánh.' : 'Failed to delete branch.')
      } finally {
        setSaving(false)
      }
    }
  }

  async function reactivateBranch() {
    if (!branchId) return
    const current = branches[branchId]
    if (!current) return

    try {
      setSaving(true)
      const { error } = await supabase
        .from('provider_branches')
        .update({ is_active: true })
        .eq('id', branchId)

      if (error) throw error

      // Also reactivate the linked bank account(s)
      await supabase
        .from('fin_bank_accounts')
        .update({ is_active: true })
        .eq('branch_id', branchId)

      setBranches(prev => ({
        ...prev,
        [branchId]: { ...prev[branchId], is_active: true }
      }))
      setSaveMsg(language === 'vi' ? 'Đã kích hoạt' : 'Reactivated')
    } catch (err: any) {
      console.error('Failed to reactivate branch:', err)
      alert(language === 'vi' ? 'Không thể kích hoạt lại chi nhánh.' : 'Failed to reactivate branch.')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 2200)
    }
  }

  function updateBranch(patch: Partial<ProviderBranch>) {
    if (!branchId) return
    setBranches(prev => ({ ...prev, [branchId]: { ...prev[branchId], ...patch } }))
  }

  function moveCurrentBranch(direction: 'up' | 'down') {
    if (!branchId) return
    setOrder(prev => {
      const idx = prev.indexOf(branchId)
      if (idx === -1) return prev
      const swapWith = direction === 'up' ? idx - 1 : idx + 1
      if (swapWith < 0 || swapWith >= prev.length) return prev
      const next = [...prev]
      const tmp = next[swapWith]
      next[swapWith] = next[idx]
      next[idx] = tmp
      return next
    })
  }

  async function handleSaveAll() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const sortMap: Record<string, number> = {}
      order.forEach((id, idx) => {
        sortMap[id] = idx + 1
      })

      const rows = Object.values(branches).map(b => ({
        id: b.id,
        name: (b.name || '').trim(),
        company_name: (b.company_name || '').trim(),
        address: (b.address || '').trim(),
        city: (b.city || '').trim(),
        tax_code: (b.tax_code || '').trim(),
        phone: (b.phone || '').trim(),
        email: (b.email || '').trim(),
        bank: (b.bank || '').trim(),
        bank_account_name: (b.bank_account_name || '').trim(),
        account_number: (b.account_number || '').trim(),
        sort_order: sortMap[b.id] ?? null,
        is_active: b.is_active ?? true,
      }))

      if (rows.length > 0) {
        const { error } = await supabase
          .from('provider_branches')
          .upsert(rows, { onConflict: 'id' })

        if (error) throw error

        // Sync branch bank accounts to fin_bank_accounts
        try {
            const { data: existingAccs } = await supabase.from('fin_bank_accounts').select('*').not('branch_id', 'is', null);
            const accRows = rows.map(r => {
                const ext = existingAccs?.find(a => a.branch_id === r.id);
                if (ext) {
                    return {
                        ...ext,
                        account_name: r.bank_account_name || ext.account_name,
                        bank_name: r.bank || ext.bank_name,
                        account_number: r.account_number || ext.account_number,
                        is_active: r.is_active ?? true,
                    }
                } else {
                    return {
                        id: crypto.randomUUID(),
                        account_name: r.bank_account_name || `${r.name.split(' ').map((w: string) => w[0]?.toUpperCase()).join('')} (Pasta Fresca ${r.name})`,
                        bank_name: r.bank || null,
                        account_number: r.account_number || null,
                        account_type: 'Checking',
                        branch_id: r.id,
                        opening_balance: 0,
                        current_balance: 0,
                        currency: currency || 'VND',
                        is_active: r.is_active ?? true,
                    }
                }
            });
            if (accRows.length > 0) {
                await supabase.from('fin_bank_accounts').upsert(accRows, { onConflict: 'id' });
            }
        } catch(e) { console.error('Failed to sync bank accounts', e) }
      }

      const updatedBranches = { ...branches }
      Object.keys(updatedBranches).forEach(k => {
        if (updatedBranches[k].isNew) {
          updatedBranches[k] = { ...updatedBranches[k], isNew: false }
        }
      })
      setBranches(updatedBranches)
      saveLS(updatedBranches)
      saveOrderLS(order)
      setSaveMsg(t(language, 'SavedOk'))
    } catch {
      setSaveMsg(t(language, 'SavedErr'))
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 2200)
    }
  }

  if (loading) return <CircularLoader />

  return (
    <Card>
      <CardHeader
        title={t(language, 'GeneralSettingsDRTitle')}
        right={
          <div className="flex items-center gap-2">
            {!loading && loadMsg && <span className="text-xs text-slate-500">{loadMsg}</span>}
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all active:scale-95 shadow-sm shadow-blue-500/20 disabled:opacity-50"
            >
              {saving ? t(language, 'GeneralSettingsSaving') : t(language, 'Save')}
            </button>
            {saveMsg && <span className="text-xs text-slate-600 font-semibold">{saveMsg}</span>}
          </div>
        }
      />

      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4 flex-wrap bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <select
            className="h-10 px-4 rounded-xl bg-white text-slate-800 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium text-sm transition-all shadow-sm outline-none min-w-64 cursor-pointer"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            {branchOptions.length === 0 && <option value="">{t(language, 'GeneralSettingsNoBranches')}</option>}
            {branchOptions.map(id => {
              const b = branches[id]
              const suffix = b?.is_active === false ? ` (${language === 'vi' ? 'Ngừng hoạt động' : 'Shutdown'})` : ''
              return (
                <option key={id} value={id}>
                  {(b?.name || t(language, 'GeneralSettingsUntitled')) + suffix}
                </option>
              )
            })}
          </select>

          <div className="flex items-center gap-3 flex-wrap sm:ml-auto">
            {branchOptions.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setTempOrder(branchOptions)
                  setIsReorderOpen(true)
                }}
                className="h-10 px-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-800 transition-all active:scale-95 shadow-sm cursor-pointer"
                title={language === 'vi' ? 'Sắp xếp chi nhánh' : 'Reorder branches'}
              >
                <ArrowsUpDownIcon className="w-4 h-4" />
                <span>{language === 'vi' ? 'Sắp xếp' : 'Reorder'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={createBranch}
              className="h-10 px-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all active:scale-95 shadow-sm shadow-blue-500/20 cursor-pointer"
              title={t(language, 'GeneralSettingsAddBranch')}
            >
              <PlusIcon className="w-4 h-4" />
              <span>{t(language, 'GeneralSettingsAddBranch')}</span>
            </button>
          </div>
        </div>

        {!current ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 bg-slate-50/50">
            {t(language, 'GeneralSettingsEmpty')}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-5">
            <Field label={t(language, 'GeneralSettingsBranchName')} value={current.name || ''} onChange={v => updateBranch({ name: v })} />
            <Field label={t(language, 'GeneralSettingsCompanyName')} value={current.company_name || ''} onChange={v => updateBranch({ company_name: v })} />
            <Field label={t(language, 'GeneralSettingsAddress')} value={current.address || ''} onChange={v => updateBranch({ address: v })} />
            <CityAutocomplete
              label={t(language, 'City') || 'City'}
              value={current.city || ''}
              onChange={v => updateBranch({ city: v })}
              suggestions={uniqueCities}
            />
            <Field label={t(language, 'GeneralSettingsTaxCode')} value={current.tax_code || ''} onChange={v => updateBranch({ tax_code: v })} />
            <Field label={t(language, 'GeneralSettingsPhone')} value={current.phone || ''} onChange={v => updateBranch({ phone: v })} />
            <Field label={t(language, 'GeneralSettingsEmail')} value={current.email || ''} onChange={v => updateBranch({ email: v })} />

            <Field label={t(language, 'GeneralSettingsBank')} value={current.bank || ''} onChange={v => updateBranch({ bank: v })} />
            <Field
              label={t(language, 'GeneralSettingsBankAccountName')}
              value={current.bank_account_name || ''}
              onChange={v => updateBranch({ bank_account_name: v })}
            />
            <Field label={t(language, 'GeneralSettingsAccountNumber')} value={current.account_number || ''} onChange={v => updateBranch({ account_number: v })} />

            {/* Status and Action row */}
            <div className="md:col-span-2 bg-slate-50 rounded-2xl p-5 border border-slate-100 flex items-center justify-between flex-wrap gap-4 mt-6">
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-bold text-slate-600">
                  {language === 'vi' ? 'Trạng thái chi nhánh:' : 'Branch Status:'}
                </span>
                {current.is_active === false ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    {language === 'vi' ? 'Đã ngừng hoạt động' : 'Shutdown'}
                  </span>
                ) : branchHasRecords ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {language === 'vi' ? 'Đang hoạt động' : 'Active'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    {language === 'vi' ? 'Mới' : 'New'}
                  </span>
                )}
              </div>

              <div>
                {current.is_active !== false ? (
                  branchHasRecords ? (
                    <button
                      type="button"
                      onClick={deleteBranch}
                      className="h-11 px-5 inline-flex items-center gap-2 rounded-xl border border-red-200 text-red-600 bg-white hover:bg-red-50 text-sm font-bold shadow-sm transition active:scale-95 cursor-pointer"
                    >
                      <XCircleIcon className="w-5 h-5" />
                      {t(language, 'GeneralSettingsDeactivateBranch') || 'Shutdown'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={deleteBranch}
                      className="h-11 px-5 inline-flex items-center gap-2 rounded-xl border border-red-200 text-red-600 bg-white hover:bg-red-50 text-sm font-bold shadow-sm transition active:scale-95 cursor-pointer"
                    >
                      <TrashIcon className="w-5 h-5" />
                      {t(language, 'GeneralSettingsDeleteBranch')}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={reactivateBranch}
                    className="h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-md shadow-emerald-600/10 transition active:scale-95 cursor-pointer"
                  >
                    <PlusIcon className="w-5 h-5" />
                    {language === 'vi' ? 'Kích hoạt lại' : 'Reactivate'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reorder Modal */}
      <Transition show={isReorderOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setIsReorderOpen(false)}>
          {/* Backdrop */}
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-3xl bg-white p-6 text-left align-middle shadow-2xl transition-all border border-slate-100">
                  <DialogTitle as="h3" className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2 border-b border-slate-100 pb-3">
                    <ArrowsUpDownIcon className="w-5 h-5 text-blue-600" />
                    {language === 'vi' ? 'Sắp xếp chi nhánh' : 'Reorder Branches'}
                  </DialogTitle>

                  <p className="text-xs text-slate-500 mt-2 mb-4 leading-relaxed">
                    {language === 'vi'
                      ? 'Kéo thả các chi nhánh hoặc sử dụng phím mũi tên để thay đổi thứ tự hiển thị của chúng.'
                      : 'Drag and drop the branches or use the arrows to change their display order.'}
                  </p>

                  <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {tempOrder.map((id, index) => {
                      const b = branches[id]
                      if (!b) return null
                      const isDragged = index === draggedIdx

                      return (
                        <div
                          key={id}
                          draggable
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-center gap-3 p-3 rounded-2xl border transition-all select-none ${
                            isDragged
                              ? 'opacity-40 border-dashed border-blue-300 bg-blue-50/20'
                              : 'border-slate-100 bg-white hover:bg-slate-50 shadow-sm'
                          }`}
                        >
                          {/* Drag Handle */}
                          <div className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 p-1">
                            <Bars3Icon className="w-5 h-5" />
                          </div>

                          {/* Branch Name */}
                          <span className="text-sm font-semibold text-slate-700 truncate flex-1">
                            {b.name || t(language, 'GeneralSettingsUntitled')}
                            {b.is_active === false && (
                              <span className="text-xs font-medium text-rose-500 ml-1.5 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                {language === 'vi' ? 'Ngừng hoạt động' : 'Shutdown'}
                              </span>
                            )}
                          </span>

                          {/* Up/Down buttons for fallback */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => {
                                const next = [...tempOrder]
                                const tmp = next[index - 1]
                                next[index - 1] = next[index]
                                next[index] = tmp
                                setTempOrder(next)
                              }}
                              className="p-1.5 rounded-lg border border-slate-100 text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                              title={t(language, 'GeneralSettingsMoveUp')}
                            >
                              <ChevronUpIcon className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={index === tempOrder.length - 1}
                              onClick={() => {
                                const next = [...tempOrder]
                                const tmp = next[index + 1]
                                next[index + 1] = next[index]
                                next[index] = tmp
                                setTempOrder(next)
                              }}
                              className="p-1.5 rounded-lg border border-slate-100 text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                              title={t(language, 'GeneralSettingsMoveDown')}
                            >
                              <ChevronDownIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => setIsReorderOpen(false)}
                      className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-semibold transition-all cursor-pointer"
                    >
                      {t(language, 'Cancel') || 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOrder(tempOrder)
                        setIsReorderOpen(false)
                      }}
                      className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-all active:scale-95 shadow-sm shadow-blue-500/20 cursor-pointer"
                    >
                      {t(language, 'Confirm') || 'Confirm'}
                    </button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    </Card>
  )
}

/* ===========================================================
   Standalone page (facoltativa): mostra solo la card
   =========================================================== */
export default function GeneralDailyReportsSettingsPage() {
  const { language } = useSettings()
  return (
    <div className="max-w-6xl mx-auto p-4 text-gray-100">
      <h1 className="text-2xl font-bold text-white mb-3">{t(language, 'GeneralSettingsDRStandaloneTitle')}</h1>
      <DailyReportsCard />
    </div>
  )
}