// app/general-settings/dailyreports.tsx
'use client'

import { useEffect, useMemo, useState, Fragment } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { PlusIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon, XCircleIcon, QueueListIcon, Bars3Icon, BuildingStorefrontIcon } from '@heroicons/react/24/outline'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
import Button from '@/components/Button'
import { getVietnamBanks, VietnamBank } from '@/lib/vietnamBanks'

type ProviderBranch = {
  id: string
  name: string
  initials?: string
  company_name?: string
  address?: string
  city?: string
  country?: string
  tax_code?: string
  phone?: string
  email?: string
  website?: string
  bank?: string
  bank_branch?: string
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
  return <div className="rounded-2xl border border-slate-100 bg-white text-slate-800 shadow-sm overflow-hidden p-6">{props.children}</div>
}
function CardHeader(props: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6 gap-3 flex-wrap">
      <h2 className="text-lg font-bold text-slate-850 tracking-tight">{props.title}</h2>
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
  list,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  list?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        className="w-full border border-slate-200/30 rounded-lg px-3 h-10 text-slate-800 bg-slate-50/40 hover:bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none shadow-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        list={list}
      />
    </label>
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
    <div className="relative flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        className="w-full border border-slate-200/30 rounded-lg px-3 h-10 text-slate-800 bg-slate-50/40 hover:bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none shadow-xs"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { setFocus(true); setOpen(true) }}
        onBlur={() => setTimeout(() => { setFocus(false); setOpen(false) }, 200)}
      />
      {(focus || open) && value.length >= 1 && filtered.length > 0 && (
        <ul className="absolute z-10 top-[100%] left-0 w-full bg-white border border-slate-200 rounded-lg shadow-md max-h-48 overflow-y-auto mt-1.5 py-1 text-slate-800">
          {filtered.map(s => (
            <li
              key={s}
              className="px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm font-medium transition-colors text-slate-700"
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

function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function parseVietnameseAddress(label: string, branchName?: string): { address: string; city: string; country: string } {
  let cleaned = label.trim()
  let city = ''
  let country = ''

  if (branchName) {
    const bNameLower = branchName.toLowerCase().trim()
    const prefixesToRemove = [
      bNameLower + ',',
      bNameLower + ' -',
      bNameLower
    ]
    for (const prefix of prefixesToRemove) {
      if (cleaned.toLowerCase().startsWith(prefix)) {
        cleaned = cleaned.slice(prefix.length).trim()
        cleaned = cleaned.replace(/^[,\s-]+/, '')
        break
      }
    }
  }

  const lower = cleaned.toLowerCase()
  if (lower.includes('viet nam') || lower.includes('việt nam') || lower.includes('vietnam')) {
    country = 'Vietnam'
  }

  if (lower.includes('hồ chí minh') || lower.includes('ho chi minh') || lower.includes('sài gòn') || lower.includes('saigon')) {
    city = 'Ho Chi Minh'
  } else if (lower.includes('đà nẵng') || lower.includes('da nang')) {
    city = 'Da Nang'
  } else if (lower.includes('đà lạt') || lower.includes('da lat')) {
    city = 'Da Lat'
  } else if (lower.includes('hà nội') || lower.includes('hanoi')) {
    city = 'Hanoi'
  }

  const parts = cleaned.split(',').map(p => p.trim())
  const filteredParts = parts.filter(part => {
    const pLower = part.toLowerCase()
    if (pLower === 'viet nam' || pLower === 'việt nam' || pLower === 'vietnam') return false
    if (city === 'Ho Chi Minh' && (pLower.includes('hồ chí minh') || pLower.includes('ho chi minh') || pLower.includes('sài gòn') || pLower.includes('saigon'))) return false
    if (city === 'Da Nang' && (pLower.includes('đà nẵng') || pLower.includes('da nang'))) return false
    if (city === 'Da Lat' && (pLower.includes('đà lạt') || pLower.includes('da lat') || pLower.includes('lâm đồng') || pLower.includes('lam dong'))) return false
    if (city === 'Hanoi' && (pLower.includes('hà nội') || pLower.includes('hanoi'))) return false
    return true
  })

  cleaned = filteredParts.join(', ')
  return { address: cleaned, city, country }
}

function AddressAutocomplete({
  label,
  value,
  onChange,
  placeholder,
  branchName,
}: {
  label: string
  value: string
  onChange: (addr: string, city?: string, country?: string) => void
  placeholder?: string
  branchName?: string
}) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [focus, setFocus] = useState(false)

  const debounced = useDebouncedValue(value, 300)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const q = (debounced ?? '').trim()
      if (q.length < 3) {
        setOptions([])
        return
      }
      setLoading(true)
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(q)}&country=VN&size=6`)
        const j = await r.json()
        if (!cancelled) setOptions(Array.isArray(j?.items) ? j.items : [])
      } catch {
        if (!cancelled) setOptions([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [debounced])

  return (
    <div className="relative flex flex-col gap-1.5 w-full">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="text"
        className="w-full border border-slate-200/30 rounded-lg px-3 h-10 text-slate-800 bg-slate-50/40 hover:bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none shadow-xs"
        value={value ?? ''}
        onChange={e => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          setFocus(true)
          setOpen(true)
        }}
        onBlur={() => {
          setTimeout(() => {
            setFocus(false)
            setOpen(false)
          }, 200)
        }}
        placeholder={placeholder}
      />
      {open && (options.length > 0 || loading) && (
        <ul className="absolute z-10 top-[100%] left-0 w-full bg-white border border-slate-200 rounded-lg shadow-md max-h-48 overflow-y-auto mt-1.5 py-1 text-slate-800">
          {loading && <li className="px-3 py-2 text-xs text-slate-400 italic">Searching...</li>}
          {!loading && options.map(opt => (
            <li
              key={opt.id}
              className="px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm font-medium transition-colors text-slate-700 truncate"
              onMouseDown={(e) => {
                e.preventDefault()
                const parsed = parseVietnameseAddress(opt.label, branchName)
                onChange(parsed.address, parsed.city, parsed.country)
                setOpen(false)
                setFocus(false)
              }}
              title={opt.label}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PhoneField({
  label,
  value,
  country,
  onChange,
}: {
  label: string
  value: string
  country: string
  onChange: (v: string) => void
}) {
  const countryKey = (country || '').trim().toLowerCase()
  let prefix = ''

  if (countryKey.includes('vietnam')) {
    prefix = '+84 (0)'
  } else if (countryKey.includes('italy') || countryKey.includes('italia')) {
    prefix = '+39 (0)'
  } else if (countryKey.includes('singapore')) {
    prefix = '+65'
  } else if (countryKey.includes('united kingdom') || countryKey.includes('uk')) {
    prefix = '+44 (0)'
  } else if (countryKey.includes('united states') || countryKey.includes('usa') || countryKey.includes('america')) {
    prefix = '+1'
  }

  let displayValue = value || ''
  if (prefix && displayValue.startsWith(prefix)) {
    displayValue = displayValue.slice(prefix.length).trim()
  }

  const handlePhoneChange = (rawNum: string) => {
    const cleanedRaw = rawNum.trim()
    const fullNumber = prefix ? `${prefix} ${cleanedRaw}` : cleanedRaw
    onChange(fullNumber)
  }

  return (
    <label className="flex flex-col gap-1.5 w-full">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex w-full items-stretch border border-slate-200/30 rounded-lg bg-slate-50/40 hover:bg-slate-50 focus-within:bg-white focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all shadow-xs overflow-hidden h-10">
        {prefix && (
          <span className="flex items-center bg-slate-100/50 px-3 text-slate-400 text-sm font-semibold border-r border-slate-200/40 select-none">
            {prefix}
          </span>
        )}
        <input
          type="text"
          className="flex-1 bg-transparent px-3 text-slate-800 text-sm outline-none font-medium"
          value={displayValue}
          onChange={e => handlePhoneChange(e.target.value)}
          placeholder="901234567..."
        />
      </div>
    </label>
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

  const [vietnamBanks, setVietnamBanks] = useState<VietnamBank[]>([])

  useEffect(() => {
    getVietnamBanks().then(setVietnamBanks)
  }, [])

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
        initials: (b.initials || '').trim() || null,
        company_name: (b.company_name || '').trim(),
        address: (b.address || '').trim(),
        city: (b.city || '').trim(),
        country: (b.country || '').trim() || null,
        tax_code: (b.tax_code || '').trim(),
        phone: (b.phone || '').trim(),
        email: (b.email || '').trim(),
        website: (b.website === 'https://www.' ? '' : (b.website || '')).trim() || null,
        bank: (b.bank || '').trim(),
        bank_branch: (b.bank_branch || '').trim() || null,
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

  // 1. Notifica lo stato corrente del form alla pagina principale
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('generalsettings:state-change', {
        detail: {
          hasCurrent: !!current,
          saving: saving,
        },
      }),
    )
  }, [current, saving])

  // 2. Ascolta l'evento di salvataggio scatenato dal PageHeader in alto
  useEffect(() => {
    const handleTrigger = () => {
      handleSaveAll()
    }
    window.addEventListener('generalsettings:trigger-save', handleTrigger)
    return () => {
      window.removeEventListener('generalsettings:trigger-save', handleTrigger)
    }
  }, [branches, branchId, order])

  if (loading) return <CircularLoader />

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden min-h-[650px] flex flex-col md:flex-row text-slate-800">
      
      {/* Sidebar Sinistra: Lista Filiali (Master) */}
      <div className="w-full md:w-80 border-r border-slate-100 flex flex-col bg-slate-50/50">
        {/* Header Sidebar */}
        <div className="p-4 border-b border-slate-100/60 flex items-center justify-between bg-white">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {language === 'vi' ? 'Chi nhánh' : 'Branches'}
          </span>
          <div className="flex items-center gap-1.5">
            {branchOptions.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTempOrder(branchOptions)
                  setIsReorderOpen(true)
                }}
                icon={QueueListIcon}
                title={language === 'vi' ? 'Sắp xếp' : 'Reorder'}
                className="p-0 w-8 h-8 rounded-lg flex items-center justify-center border-slate-100"
              />
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={createBranch}
              icon={PlusIcon}
              title={t(language, 'GeneralSettingsAddBranch')}
              className="p-0 w-8 h-8 rounded-lg flex items-center justify-center"
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 max-h-[600px]">
          {branchOptions.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-xs italic font-medium">
              {t(language, 'GeneralSettingsNoBranches')}
            </div>
          )}
          {branchOptions.map(id => {
            const b = branches[id]
            if (!b) return null
            const isSelected = id === branchId
            const isInactive = b.is_active === false

            return (
              <div
                key={id}
                onClick={() => setBranchId(id)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                  isSelected
                    ? 'border-slate-200 bg-white shadow-xs'
                    : 'border-transparent bg-transparent hover:bg-slate-100/40 hover:border-slate-200/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800 text-sm truncate">
                    {b.name || t(language, 'GeneralSettingsUntitled')}
                  </span>
                  {isInactive ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" title="Shutdown" />
                  ) : b.isNew ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 animate-pulse" title="New" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Active" />
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="truncate max-w-[125px]">{b.city || (language === 'vi' ? 'Không có TP' : 'No city')}</span>
                  <span className="truncate max-w-[110px] font-medium text-[10px] text-slate-450">{b.tax_code || b.phone}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Area Dettaglio Destra (Detail) */}
      <div className="flex-1 flex flex-col bg-white">
        {current ? (
          <div className="flex-1 flex flex-col">
            
            {/* Header Dettaglio */}
            <div className="p-5 border-b border-slate-100/60 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-850 tracking-tight">
                  {current.name || t(language, 'GeneralSettingsUntitled')}
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {language === 'vi' ? 'Cấu hình thông tin chi tiết của chi nhánh' : 'Configure detailed branch information'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!loading && loadMsg && <span className="text-[11px] text-slate-400">{loadMsg}</span>}
                {saveMsg && <span className="text-xs text-slate-600 font-semibold">{saveMsg}</span>}
              </div>
            </div>

            {/* Form */}
            <div className="flex-1 p-6 space-y-8">
              
              {/* Sezione 1: Informazioni Generali */}
              <div className="space-y-3.5">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {language === 'vi' ? 'Thông tin chung' : 'General Information'}
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label={t(language, 'GeneralSettingsBranchName')} value={current.name || ''} onChange={v => updateBranch({ name: v })} />
                  <Field label={language === 'vi' ? 'Chữ viết tắt' : 'Initials'} value={current.initials || ''} onChange={v => updateBranch({ initials: v })} />
                  <Field label={t(language, 'GeneralSettingsCompanyName')} value={current.company_name || ''} onChange={v => updateBranch({ company_name: v })} />
                  <Field label={t(language, 'GeneralSettingsTaxCode')} value={current.tax_code || ''} onChange={v => updateBranch({ tax_code: v })} />
                </div>
              </div>

              {/* Sezione 2: Indirizzo e Contatti */}
              <div className="space-y-3.5">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {language === 'vi' ? 'Địa chỉ & Liên hệ' : 'Address & Contacts'}
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <AddressAutocomplete
                      label={t(language, 'GeneralSettingsAddress')}
                      value={current.address || ''}
                      branchName={current.name || ''}
                      onChange={(addr, city, country) => {
                        const updates: Partial<ProviderBranch> = { address: addr }
                        if (city) updates.city = city
                        if (country) updates.country = country
                        updateBranch(updates)
                      }}
                    />
                  </div>
                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <CityAutocomplete
                      label={t(language, 'City') || 'City'}
                      value={current.city || ''}
                      onChange={v => updateBranch({ city: v })}
                      suggestions={uniqueCities}
                    />
                    <Field
                      label={language === 'vi' ? 'Quốc gia' : 'Country'}
                      value={current.country || ''}
                      onChange={v => updateBranch({ country: v })}
                      placeholder={language === 'vi' ? 'Ví dụ: Vietnam' : 'e.g. Vietnam'}
                    />
                    <PhoneField
                      label={t(language, 'GeneralSettingsPhone')}
                      value={current.phone || ''}
                      country={current.country || ''}
                      onChange={v => updateBranch({ phone: v })}
                    />
                  </div>
                  <Field label={t(language, 'GeneralSettingsEmail')} value={current.email || ''} onChange={v => updateBranch({ email: v })} />
                  <Field
                    label={language === 'vi' ? 'Trang web' : 'Website'}
                    value={current.website || 'https://www.'}
                    onChange={v => {
                      let val = v.trim()
                      const prefix = 'https://www.'
                      if (val.length < prefix.length) {
                        val = prefix
                      } else if (!val.startsWith(prefix)) {
                        let cleaned = val.replace(/^https?:\/\//i, '')
                        cleaned = cleaned.replace(/^www\./i, '')
                        val = prefix + cleaned
                      }
                      updateBranch({ website: val })
                    }}
                    placeholder="https://www."
                  />
                </div>
              </div>

              {/* Sezione 3: Coordinate Bancarie */}
              <div className="space-y-3.5">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {language === 'vi' ? 'Thông tin ngân hàng' : 'Bank Details'}
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label={t(language, 'GeneralSettingsBank')} value={current.bank || ''} onChange={v => updateBranch({ bank: v })} list="general-banks-list" />
                  <Field label={language === 'vi' ? 'Chi nhánh ngân hàng' : 'Bank Branch'} value={current.bank_branch || ''} onChange={v => updateBranch({ bank_branch: v })} />
                  <Field label={t(language, 'GeneralSettingsBankAccountName')} value={current.bank_account_name || ''} onChange={v => updateBranch({ bank_account_name: v })} />
                  <Field label={t(language, 'GeneralSettingsAccountNumber')} value={current.account_number || ''} onChange={v => updateBranch({ account_number: v })} />
                </div>
                <datalist id="general-banks-list">
                  {vietnamBanks.map(b => (
                    <option key={b.bin} value={b.shortName}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </datalist>
              </div>

              {/* Sezione 4: Stato e Azioni di eliminazione */}
              <div className="border border-slate-100 rounded-xl p-4 flex items-center justify-between flex-wrap gap-4 bg-white shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {language === 'vi' ? 'Trạng thái:' : 'Status:'}
                  </span>
                  {current.is_active === false ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      {language === 'vi' ? 'Đã ngừng hoạt động' : 'Shutdown'}
                    </span>
                  ) : branchHasRecords ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {language === 'vi' ? 'Đang hoạt động' : 'Active'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      {language === 'vi' ? 'Mới' : 'New'}
                    </span>
                  )}
                </div>

                <div>
                  {current.is_active !== false ? (
                    branchHasRecords ? (
                      <Button
                        variant="danger-light"
                        onClick={deleteBranch}
                        icon={XCircleIcon}
                        size="sm"
                        className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg px-4 h-9 shadow-2xs transition-colors font-semibold"
                      >
                        {t(language, 'GeneralSettingsDeactivateBranch') || 'Shutdown'}
                      </Button>
                    ) : (
                      <Button
                        variant="danger-light"
                        onClick={deleteBranch}
                        icon={TrashIcon}
                        size="sm"
                        className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg px-4 h-9 shadow-2xs transition-colors font-semibold"
                      >
                        {t(language, 'GeneralSettingsDeleteBranch')}
                      </Button>
                    )
                  ) : (
                    <Button
                      variant="success"
                      onClick={reactivateBranch}
                      icon={PlusIcon}
                      size="sm"
                    >
                      {language === 'vi' ? 'Kích hoạt lại' : 'Reactivate'}
                    </Button>
                  )}
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/20">
            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3 border border-slate-100">
              <BuildingStorefrontIcon className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {t(language, 'GeneralSettingsEmpty') || 'No branches found'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {language === 'vi'
                ? 'Chọn một chi nhánh từ danh sách bên trái để cấu hình hoặc tạo chi nhánh mới.'
                : 'Select a branch from the left list to configure or create a new one.'}
            </p>
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
                <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-2xl transition-all border border-slate-100">
                  <DialogTitle as="h3" className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2 border-b border-slate-100 pb-3">
                    <QueueListIcon className="w-5 h-5 text-blue-600" />
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
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={index === 0}
                              onClick={() => {
                                const next = [...tempOrder]
                                const tmp = next[index - 1]
                                next[index - 1] = next[index]
                                next[index] = tmp
                                setTempOrder(next)
                              }}
                              icon={ChevronUpIcon}
                              title={t(language, 'GeneralSettingsMoveUp')}
                              className="p-0 w-8 h-8"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={index === tempOrder.length - 1}
                              onClick={() => {
                                const next = [...tempOrder]
                                const tmp = next[index + 1]
                                next[index + 1] = next[index]
                                next[index] = tmp
                                setTempOrder(next)
                              }}
                              icon={ChevronDownIcon}
                              title={t(language, 'GeneralSettingsMoveDown')}
                              className="p-0 w-8 h-8"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setIsReorderOpen(false)}
                    >
                      {t(language, 'Cancel') || 'Cancel'}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => {
                        setOrder(tempOrder)
                        setIsReorderOpen(false)
                      }}
                    >
                      {t(language, 'Confirm') || 'Confirm'}
                    </Button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
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