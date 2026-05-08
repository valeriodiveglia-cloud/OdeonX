// app/general-settings/dailyreports.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { PlusIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
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
}

const LS_KEY = 'generalsettings.providerBranches.v1'
const LS_ORDER_KEY = 'generalsettings.providerBranchesOrder.v1'

/* -------- Small UI primitives (scoped to this file) -------- */
function Card(props: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">{props.children}</div>
}
function CardHeader(props: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">{props.title}</h2>
      </div>
      <div className="flex items-center gap-2">{props.right}</div>
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
      <span className="text-sm text-gray-800">{label}</span>
      <input
        className="mt-1 w-full border rounded-lg px-3 h-10 text-gray-900 bg-white"
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
  const base = 'p-2 rounded-lg border text-gray-700 hover:bg-gray-100'
  const danger = 'p-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50'
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
      <span className="text-sm text-gray-800">{label}</span>
      <input
        className="mt-1 w-full border rounded-lg px-3 h-10 text-gray-900 bg-white"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { setFocus(true); setOpen(true) }}
        onBlur={() => setTimeout(() => { setFocus(false); setOpen(false) }, 200)}
      />
      {(focus || open) && value.length >= 1 && filtered.length > 0 && (
        <ul className="absolute z-10 top-[100%] left-0 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1">
          {filtered.map(s => (
            <li
              key={s}
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-gray-900"
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
   Reusable Card: usala dentro l'index /general-settings/page.tsx
   =========================================================== */
export function DailyReportsCard() {
  const { language, currency } = useSettings()
  const [branches, setBranches] = useState<Record<string, ProviderBranch>>({})
  const [order, setOrder] = useState<string[]>([])
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
    }
    setBranches(prev => ({ ...prev, [id]: b }))
    setOrder(prev => [...prev, id])
    setBranchId(id)
  }

  async function deleteBranch() {
    if (!branchId) return
    const ok = window.confirm(t(language, 'GeneralSettingsConfirmDeleteBranch'))
    if (!ok) return
    try {
      const { error } = await supabase.from('provider_branches').delete().eq('id', branchId)
      if (error) throw error
    } catch {
      // fallback locale
    } finally {
      setBranches(prev => {
        const { [branchId]: _, ...rest } = prev
        return rest
      })
      setOrder(prev => prev.filter(id => id !== branchId))
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
                    }
                }
            });
            if (accRows.length > 0) {
                await supabase.from('fin_bank_accounts').upsert(accRows, { onConflict: 'id' });
            }
        } catch(e) { console.error('Failed to sync bank accounts', e) }
      }

      saveLS(branches)
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
            {!loading && loadMsg && <span className="text-xs text-gray-600">{loadMsg}</span>}
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="h-9 px-3 rounded-lg bg-blue-600 text-white hover:opacity-80 disabled:opacity-50"
            >
              {saving ? t(language, 'GeneralSettingsSaving') : t(language, 'Save')}
            </button>
            {saveMsg && <span className="text-xs text-gray-600">{saveMsg}</span>}
          </div>
        }
      />

      <div className="p-3 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            className="h-10 px-3 rounded-lg bg-white text-gray-900 border border-gray-300 min-w-56"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            {branchOptions.length === 0 && <option value="">{t(language, 'GeneralSettingsNoBranches')}</option>}
            {branchOptions.map(id => (
              <option key={id} value={id}>
                {branches[id]?.name || t(language, 'GeneralSettingsUntitled')}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={createBranch}
            className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-blue-600 text-white hover:opacity-80"
            title={t(language, 'GeneralSettingsAddBranch')}
            aria-label={t(language, 'GeneralSettingsAddBranch')}
          >
            <PlusIcon className="w-5 h-5" />
          </button>

          {branchId && (
            <>
              <IconBtn title={t(language, 'GeneralSettingsMoveUp')} onClick={() => moveCurrentBranch('up')}>
                <ChevronUpIcon className="w-5 h-5" />
              </IconBtn>
              <IconBtn title={t(language, 'GeneralSettingsMoveDown')} onClick={() => moveCurrentBranch('down')}>
                <ChevronDownIcon className="w-5 h-5" />
              </IconBtn>
              <IconBtn title={t(language, 'GeneralSettingsDeleteBranch')} onClick={deleteBranch} variant="danger">
                <TrashIcon className="w-5 h-5" />
              </IconBtn>
            </>
          )}
        </div>

        {!current ? (
          <div className="rounded-xl border p-4 text-sm text-gray-700">
            {t(language, 'GeneralSettingsEmpty')}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
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
          </div>
        )}
      </div>
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