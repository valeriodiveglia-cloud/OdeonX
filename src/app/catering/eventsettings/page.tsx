// src/app/catering/eventsettings/page.tsx
'use client'

/**
 * CHANGELOG 2025-10-14
 * - Provider branches: aggiunti campi Bank, Bank account name, Account number (CRUD + upsert).
 * - Transport: salvataggio UNICO (markup + veicoli) via gTransport.saveAll() su tabella transport_defaults.
 *
 * CHANGELOG 2025-10-13
 * - Aggiunta la card "Provider branches" (CRUD completo, salvataggio via Supabase + LS fallback).
 * - Integrazione salvataggio provider branches dentro handleSaveAll().
 *
 * CHANGELOG 2025-09-30
 * - I Transport settings vengono salvati come GLOBAL tramite useGlobalTransportDefaults.
 * - Ripulita la UI: rimossi testi tra parentesi e il bottone “Apply globals to this event”.
 *
 * CHANGELOG 2025-09-25 (Step B.2 – fix build)
 * - Rimosse le righe di alias che rideclaravano `baseFDAny` / `baseMATAny`.
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { useEventCalc } from '@/app/catering/_state/EventCalcProvider'
import { useFinalDishes } from '@/app/catering/_data/useFinalDishes'
import useStaffSettings from '@/app/catering/_data/useEventStaffSettings'
import useGlobalTransportDefaults from '@/app/catering/_data/useGlobalTransportDefaults'
import { useMaterialCategories } from '@/app/catering/_data/useMaterialCategories'
import { PencilSquareIcon, TrashIcon, PlusIcon, XMarkIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { useRouter } from 'next/navigation'
import { useSettings } from '@/contexts/SettingsContext'

/* ====================== I18N ====================== */
type Lang = 'en' | 'it' | 'vi'
const I18N = {
  'event.title': { en: 'Event Settings', it: 'Impostazioni evento', vi: 'Cài đặt sự kiện' },

  'nav.back': { en: 'Back', it: 'Indietro', vi: 'Quay lại' },
  'nav.backToCatering': { en: 'Back to Catering', it: 'Torna a Catering', vi: 'Quay lại Catering' },

  'common.save': { en: 'Save', it: 'Salva', vi: 'Lưu' },
  'common.saving': { en: 'Saving…', it: 'Salvataggio…', vi: 'Đang lưu…' },
  'common.saved': { en: 'Saved', it: 'Salvato', vi: 'Đã lưu' },
  'common.saveFailed': { en: 'Save failed', it: 'Salvataggio fallito', vi: 'Lưu thất bại' },
  'common.cancel': { en: 'Cancel', it: 'Annulla', vi: 'Hủy' },
  'common.create': { en: 'Create', it: 'Crea', vi: 'Tạo' },
  'common.edit': { en: 'Edit', it: 'Modifica', vi: 'Sửa' },
  'common.delete': { en: 'Delete', it: 'Elimina', vi: 'Xóa' },
  'common.loading': { en: 'loading…', it: 'caricamento…', vi: 'đang tải…' },
  'common.required': { en: 'Required', it: 'Obbligatorio', vi: 'Bắt buộc' },
  'common.markup': { en: 'Markup', it: 'Markup', vi: 'Hệ số' },
  'common.name': { en: 'Name', it: 'Nome', vi: 'Tên' },

  // Provider branches
  'pb.title': { en: 'Provider branches', it: 'Sedi fornitore', vi: 'Chi nhánh nhà cung cấp' },
  'pb.none': { en: 'No providers', it: 'Nessun fornitore', vi: 'Chưa có nhà cung cấp' },
  'pb.add': { en: 'Add provider', it: 'Aggiungi fornitore', vi: 'Thêm nhà cung cấp' },
  'pb.hintCreate': {
    en: 'Create a provider with “+”, then select it from the dropdown.',
    it: 'Crea un fornitore con “+”, poi selezionalo dal menu.',
    vi: 'Tạo nhà cung cấp bằng “+”, sau đó chọn trong danh sách.',
  },
  'pb.delete': { en: 'Delete provider', it: 'Elimina fornitore', vi: 'Xóa nhà cung cấp' },

  'pb.providerName': { en: 'Provider name', it: 'Nome fornitore', vi: 'Tên nhà cung cấp' },
  'pb.companyName': { en: 'Company name', it: 'Ragione sociale', vi: 'Tên công ty' },
  'pb.address': { en: 'Address', it: 'Indirizzo', vi: 'Địa chỉ' },
  'pb.taxCode': { en: 'Tax code', it: 'Partita IVA / Codice fiscale', vi: 'Mã số thuế' },
  'pb.phone': { en: 'Phone', it: 'Telefono', vi: 'Điện thoại' },
  'pb.email': { en: 'Email', it: 'Email', vi: 'Email' },
  'pb.bank': { en: 'Bank', it: 'Banca', vi: 'Ngân hàng' },
  'pb.bankAccName': { en: 'Bank account name', it: 'Intestatario conto', vi: 'Tên chủ tài khoản' },
  'pb.accountNumber': { en: 'Account number', it: 'Numero conto', vi: 'Số tài khoản' },

  // Bundles
  'bt.title': { en: 'Bundle types', it: 'Tipi di bundle', vi: 'Loại gói' },
  'bt.none': { en: 'No bundles', it: 'Nessun bundle', vi: 'Chưa có gói' },
  'bt.addType': { en: 'Add type', it: 'Aggiungi tipo', vi: 'Thêm loại' },
  'bt.hintCreate': {
    en: 'Create a bundle type with “+”, then select it from the dropdown.',
    it: 'Crea un tipo con “+”, poi selezionalo dal menu.',
    vi: 'Tạo loại gói bằng “+”, sau đó chọn trong danh sách.',
  },
  'bt.editBasics': {
    en: 'Edit label, max & markup',
    it: 'Modifica etichetta, massimo e markup',
    vi: 'Sửa nhãn, tối đa & hệ số',
  },
  'bt.deleteBundle': { en: 'Delete bundle', it: 'Elimina bundle', vi: 'Xóa gói' },

  'bt.baseDishCats': { en: 'Base dish categories', it: 'Categorie piatti base', vi: 'Nhóm món cơ bản' },
  'bt.finalDishes': { en: 'Final dishes', it: 'Piatti finali', vi: 'Món đã chốt' },
  'bt.materials': { en: 'Materials', it: 'Materiali', vi: 'Vật tư' },

  'bt.modSlots': { en: 'Modifier slots', it: 'Slot modificatori', vi: 'Ô bổ sung' },
  'bt.addSlot': { en: '+ Add slot', it: '+ Aggiungi slot', vi: '+ Thêm ô' },
  'bt.noSlots': { en: 'No modifier slots', it: 'Nessuno slot', vi: 'Không có ô bổ sung' },
  'bt.slotLabel': { en: 'Slot {n} label', it: 'Etichetta slot {n}', vi: 'Nhãn ô {n}' },
  'bt.allowedCats': { en: 'Allowed categories', it: 'Categorie consentite', vi: 'Nhóm cho phép' },
  'bt.removeSlot': { en: 'Remove slot', it: 'Rimuovi slot', vi: 'Xóa ô' },

  // Staff
  'staff.title': { en: 'Staff settings', it: 'Impostazioni staff', vi: 'Cài đặt nhân sự' },

  // Transport
  'tr.title': { en: 'Transport settings', it: 'Impostazioni trasporto', vi: 'Cài đặt vận chuyển' },
  'tr.vehicleTypes': { en: 'Vehicle types', it: 'Tipi di veicolo', vi: 'Loại xe' },
  'tr.addVehicle': { en: '+ Add vehicle', it: '+ Aggiungi veicolo', vi: '+ Thêm xe' },
  'tr.noVehicles': {
    en: 'No vehicles yet. Add one.',
    it: 'Nessun veicolo. Aggiungine uno.',
    vi: 'Chưa có xe. Hãy thêm.',
  },
  'tr.costPerKm': { en: 'Cost per km', it: 'Costo per km', vi: 'Chi phí/km' },
  'tr.removeVehicle': { en: 'Remove vehicle', it: 'Rimuovi veicolo', vi: 'Xóa xe' },
  'tr.placeholder.vehicleName': { en: 'e.g. Van', it: 'es. Furgone', vi: 'ví dụ: Xe van' },

  // Create modal
  'cm.title': { en: 'Create new bundle type', it: 'Crea nuovo tipo di bundle', vi: 'Tạo loại gói mới' },
  'cm.bundleName': { en: 'Bundle name', it: 'Nome bundle', vi: 'Tên gói' },
  'cm.maxMods': { en: 'Max modifiers (0..{MAX})', it: 'Modificatori max (0..{MAX})', vi: 'Số bổ sung tối đa (0..{MAX})' },
  'cm.firstReq': { en: 'First modifier required', it: 'Primo modificatore obbligatorio', vi: 'Ô đầu tiên bắt buộc' },
  'cm.markupEg': {
    en: 'Markup (multiplier, e.g. 1.5)',
    it: 'Markup (moltiplicatore, es. 1.5)',
    vi: 'Hệ số (ví dụ 1.5)',
  },

  // Edit modal
  'em.title': { en: 'Edit bundle basics', it: 'Modifica base bundle', vi: 'Sửa thông tin gói' },
  'em.label': { en: 'Label', it: 'Etichetta', vi: 'Nhãn' },
  'em.maxMods': { en: 'Max modifiers (0..{MAX})', it: 'Modificatori max (0..{MAX})', vi: 'Số bổ sung tối đa (0..{MAX})' },
  'em.markup': { en: 'Markup (multiplier)', it: 'Markup (moltiplicatore)', vi: 'Hệ số' },

  // Contract Template card
  'ct.cardTitle': { en: 'Contract Template', it: 'Template Contratto', vi: 'Mẫu Hợp Đồng' },
  'ct.edit': { en: 'Edit Contract Template', it: 'Modifica Template Contratto', vi: 'Sửa Mẫu Hợp Đồng' },
} as const

function useI18n() {
  const { language } = useSettings()
  const lang: Lang = language === 'vi' ? 'vi' : 'en'
  const t = (key: keyof typeof I18N | string, params?: Record<string, string | number>) => {
    const rec: any = (I18N as any)[key] || {}
    let s: string = rec[lang] || rec['en'] || String(key)
    if (params) {
      for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
    }
    return s
  }
  return t
}

/* ====================== Page logic ====================== */

const ANY = 'Any'
const MAX_MODS = 5
const LS_BUNDLE_SETTINGS_KEY = 'eventcalc.bundleSettings'
const LS_PROVIDER_BRANCHES_KEY = 'eventcalc.providerBranches'

type BundleType = string
type ModifierSlotCfg = { label: string; categories: string[]; required: boolean }
export type BundleConfig = {
  label: string
  maxModifiers: number
  dishCategories: string[]
  modifierSlots: ModifierSlotCfg[]
  markupX?: number
}

/** Provider Branch type con campi Bank */
type ProviderBranch = {
  id: string
  name: string
  company_name?: string
  address?: string
  tax_code?: string
  phone?: string
  email?: string
  bank?: string
  bank_account_name?: string
  account_number?: string
}

function clamp(n: number, min: number, max: number) { if (!Number.isFinite(n)) return min; return Math.max(min, Math.min(max, n)) }
function round(n: number, dp = 6) { const f = Math.pow(10, dp); return Math.round(n * f) / f }
function fmtMx(mx?: number) { const m = Number(mx ?? 1); if (!Number.isFinite(m)) return '×1'; const s = m.toFixed(3).replace(/\.?0+$/, ''); return `×${s}` }
function uniq(arr: string[]) { return Array.from(new Set(arr)) }
function intersect(arr: string[], pool: string[]) { const p = new Set(pool); return arr.filter(x => p.has(x)) }
function uid() { return `pb_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}` }

/** ---- Helpers per la logica "Any isolato" ---- */
function splitUnionToRows(union: string[], fdAll: string[], matAll: string[]) {
  let fdSel = intersect(union, fdAll)
  let matSel = intersect(union, matAll)
  if (union.includes(ANY)) { fdSel = fdAll; matSel = matAll }
  return { fdSel, matSel }
}
function mergeRowsToUnion(fdSel: string[], matSel: string[]) { return uniq([...fdSel, ...matSel]) }
function isAllSelected(sel: string[], all: string[]) { return all.length > 0 && sel.length === all.length }

export default function EventSettingsPage() {
  const t = useI18n()
  const router = useRouter()
  const { bundleSettings, setBundleSettings } = useEventCalc()

  const { dishes, loading: dishesLoading } = useFinalDishes()
  const { cats: matCatsRaw, loading: materialsLoading } = useMaterialCategories()

  const ctx = useEventCalc()
  const eventId = (ctx as any)?.eventId || (ctx as any)?.draftEventId || null

  // Staff per-evento
  const staff = useStaffSettings(eventId)

  // Transport GLOBAL defaults (tabella transport_defaults)
  const gTransport = useGlobalTransportDefaults()

  /* ================= PROVIDER BRANCHES ================= */
  const [branches, setBranches] = useState<Record<string, ProviderBranch>>({})
  const branchIds = useMemo(() => Object.keys(branches), [branches])
  const branchOptions = useMemo(
    () => branchIds.sort((a, b) => (branches[a]?.name || '').localeCompare(branches[b]?.name || '')),
    [branchIds, branches]
  )
  const [branchId, setBranchId] = useState<string>(() => branchOptions[0] || '')
  useEffect(() => { if (!branchOptions.includes(branchId)) setBranchId(branchOptions[0] || '') }, [branchOptions, branchId])

  // Load branches from DB (fallback LS)
  useEffect(() => {
    let ignore = false
    async function loadBranches() {
      try {
        const { data, error } = await supabase
          .from('provider_branches')
          .select('*')
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
            tax_code: row.tax_code ?? '',
            phone: row.phone ?? '',
            email: row.email ?? '',
            bank: row.bank ?? '',
            bank_account_name: row.bank_account_name ?? '',
            account_number: row.account_number ?? '',
          }
        }
        if (!ignore) {
          setBranches(map)
          try { localStorage.setItem(LS_PROVIDER_BRANCHES_KEY, JSON.stringify(map)) } catch {}
        }
      } catch (e) {
        console.warn('[provider_branches] load error, fallback to LS:', (e as any)?.message || e)
        try {
          const raw = localStorage.getItem(LS_PROVIDER_BRANCHES_KEY)
          if (!ignore && raw) setBranches(JSON.parse(raw))
        } catch {}
      }
    }
    loadBranches()
    return () => { ignore = true }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(LS_PROVIDER_BRANCHES_KEY, JSON.stringify(branches)) } catch {}
  }, [branches])

  const createBranch = () => {
    const id = uid()
    const b: ProviderBranch = {
      id,
      name: 'New Provider',
      company_name: '',
      address: '',
      tax_code: '',
      phone: '',
      email: '',
      bank: '',
      bank_account_name: '',
      account_number: '',
    }
    setBranches(prev => ({ ...prev, [id]: b }))
    setBranchId(id)
  }
  const deleteCurrentBranch = async () => {
    if (!branchId) return
    try {
      const { error } = await supabase.from('provider_branches').delete().eq('id', branchId)
      if (error) throw error
    } catch (e) {
      console.warn('[provider_branches] delete error:', (e as any)?.message || e)
    } finally {
      setBranches(prev => { const { [branchId]: _, ...rest } = prev; return rest })
    }
  }
  const updateBranch = (patch: Partial<ProviderBranch>) => {
    if (!branchId) return
    setBranches(prev => ({ ...prev, [branchId]: { ...prev[branchId], ...patch } }))
  }

  // ---- Bundle types bootstrap ----
  useEffect(() => {
    let ignore = false
    async function loadFromDB() {
      const { data, error } = await supabase.from('bundle_types').select('*').order('key', { ascending: true })
      if (error) { console.warn('[bundle_types] load error:', error.message); return }
      const map: Record<string, BundleConfig> = {}
      for (const row of data || []) {
        map[row.key as string] = {
          label: row.label ?? '',
          maxModifiers: row.max_modifiers ?? 0,
          dishCategories: Array.isArray(row.dish_categories) ? row.dish_categories : [],
          modifierSlots: Array.isArray(row.modifier_slots) ? row.modifier_slots : [],
          markupX: Number(row.markup_x) > 0 ? Number(row.markup_x) : 1,
        }
      }
      if (!ignore && Object.keys(map).length) {
        setBundleSettings(() => map)
        try { localStorage.setItem(LS_BUNDLE_SETTINGS_KEY, JSON.stringify(map)) } catch {}
      }
    }
    if (!Object.keys(bundleSettings || {}).length) loadFromDB()
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!bundleSettings || !Object.keys(bundleSettings).length) return
    try { localStorage.setItem(LS_BUNDLE_SETTINGS_KEY, JSON.stringify(bundleSettings)) } catch {}
  }, [bundleSettings])

  // Categorie disponibili (incluso ANY)
  const dishCats = useMemo(() => {
    const s = new Set<string>()
    for (const d of dishes) if (d.category_name) s.add(d.category_name)
    return [ANY, ...Array.from(s).sort((a, b) => a.localeCompare(b))]
  }, [dishes])
  const matCats = useMemo(() => [ANY, ...matCatsRaw], [matCatsRaw])

  // Liste "ALL" (senza ANY)
  const dishCatsAll = useMemo(() => dishCats.filter(c => c !== ANY), [dishCats])
  const matCatsAll  = useMemo(() => matCats.filter(c => c !== ANY), [matCats])

  const bundleTypes = useMemo(() => Object.keys(bundleSettings), [bundleSettings])
  const [cfgType, setCfgType] = useState<BundleType>(() => bundleTypes[0] || '')
  useEffect(() => { if (!bundleTypes.includes(cfgType)) setCfgType(bundleTypes[0] || '') }, [bundleTypes, cfgType])

  const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `bundle-${Date.now()}`
  const [showCreate, setShowCreate] = useState(false)
  const [createLabel, setCreateLabel] = useState('New Bundle')
  const [createMax, setCreateMax] = useState(0)
  const [createFirstReq, setCreateFirstReq] = useState(false)
  const [createMarkupX, setCreateMarkupX] = useState(1)

  const resetCreate = () => { setCreateLabel('New Bundle'); setCreateMax(0); setCreateFirstReq(false); setCreateMarkupX(1) }
  const openCreate = () => { resetCreate(); setShowCreate(true) }

  const applyCreate = () => {
    const label = (createLabel || 'New Bundle').trim()
    const max = clamp(createMax, 0, MAX_MODS)
    const mx = round(Math.max(createMarkupX || 1, 0.1), 6)

    const base = slugify(label)
    let key = base, i = 1
    while (bundleSettings[key]) key = `${base}-${i++}`

    const modifierSlots: ModifierSlotCfg[] = createFirstReq ? [{ label: 'Add-On', categories: [], required: true }] : []

    const def: BundleConfig = {
      label,
      maxModifiers: Math.min(Math.max(max, modifierSlots.length), MAX_MODS),
      dishCategories: [],
      modifierSlots,
      markupX: mx,
    }
    setBundleSettings(prev => ({ ...prev, [key]: def }))
    setCfgType(key)
    setShowCreate(false)
  }

  const removeTypeFromEditor = async () => {
    if (!cfgType) return
    try {
      const { error } = await supabase.from('bundle_types').delete().eq('key', cfgType)
      if (error) throw error
      setBundleSettings(prev => { const { [cfgType]: _, ...rest } = prev; return rest })
    } catch (e) {
      console.warn('[bundle_types] delete error:', (e as any)?.message)
      setBundleSettings(prev => { const { [cfgType]: _, ...rest } = prev; return rest })
    }
  }

  const updateCfg = (patch: Partial<BundleConfig>) => {
    if (!cfgType) return
    setBundleSettings(prev => ({ ...prev, [cfgType]: { ...prev[cfgType], ...patch } }))
  }

  // ----- Base dish: split/merge FD ⟂ MAT, "Any" isolato -----
  function getBaseRows() {
    const union = bundleSettings[cfgType]?.dishCategories ?? []
    return splitUnionToRows(union, dishCatsAll, matCatsAll)
  }
  function setBaseRows(fdSel: string[], matSel: string[]) {
    updateCfg({ dishCategories: mergeRowsToUnion(fdSel, matSel) })
  }

  const { fdSel: baseFD, matSel: baseMAT } = getBaseRows()
  const baseFDChecked = useMemo(() => new Set(baseFD), [baseFD])
  const baseMATChecked = useMemo(() => new Set(baseMAT), [baseMAT])
  const baseFDAny  = useMemo(() => isAllSelected(baseFD, dishCatsAll), [baseFD, dishCatsAll])
  const baseMATAny = useMemo(() => isAllSelected(baseMAT, matCatsAll), [baseMAT, matCatsAll])

  const toggleDishCatFD = (cat: string) => {
    const { fdSel, matSel } = getBaseRows()
    if (cat === ANY) { setBaseRows(dishCatsAll, matSel); return }
    let nextFD: string[]
    if (isAllSelected(fdSel, dishCatsAll)) nextFD = [cat]
    else nextFD = fdSel.includes(cat) ? fdSel.filter(c => c !== cat) : [...fdSel, cat]
    setBaseRows(nextFD, matSel)
  }

  const toggleDishCatMAT = (cat: string) => {
    const { fdSel, matSel } = getBaseRows()
    if (cat === ANY) { setBaseRows(fdSel, matCatsAll); return }
    let nextMAT: string[]
    if (isAllSelected(matSel, matCatsAll)) nextMAT = [cat]
    else nextMAT = matSel.includes(cat) ? matSel.filter(c => c !== cat) : [...matSel, cat]
    setBaseRows(fdSel, nextMAT)
  }

  // ----- Slots -----
  const updateSlot = (idx: number, patch: Partial<ModifierSlotCfg>) => {
    if (!cfgType) return
    setBundleSettings(prev => {
      const slots = [...(prev[cfgType]?.modifierSlots || [])]
      slots[idx] = { ...slots[idx], ...patch }
      return { ...prev, [cfgType]: { ...prev[cfgType], modifierSlots: slots } }
    })
  }
  const addSlot = () => {
    if (!cfgType) return
    setBundleSettings(prev => {
      const curr = prev[cfgType]; if (!curr || curr.modifierSlots.length >= MAX_MODS) return prev
      const slots = [...curr.modifierSlots, { label: 'Add-On', categories: [], required: false }]
      const next: BundleConfig = { ...curr, modifierSlots: slots, maxModifiers: Math.min(Math.max(curr.maxModifiers, slots.length), MAX_MODS) }
      return { ...prev, [cfgType]: next }
    })
  }
  const removeSlot = (idx: number) => {
    if (!cfgType) return
    setBundleSettings(prev => {
      const curr = prev[cfgType]; if (!curr) return prev
      const slots = curr.modifierSlots.filter((_, i) => i !== idx)
      const next: BundleConfig = { ...curr, modifierSlots: slots, maxModifiers: Math.min(curr.maxModifiers, slots.length, MAX_MODS) }
      return { ...prev, [cfgType]: next }
    })
  }

  function splitSlotRows(union: string[]) { return splitUnionToRows(union || [], dishCatsAll, matCatsAll) }
  function mergeSlotRows(fdSel: string[], matSel: string[]) { return mergeRowsToUnion(fdSel, matSel) }

  const toggleSlotCatFD = (idx: number, cat: string) => {
    const slot = bundleSettings[cfgType]?.modifierSlots[idx]; if (!slot) return
    const { fdSel, matSel } = splitSlotRows(slot.categories || [])
    if (cat === ANY) { updateSlot(idx, { categories: mergeSlotRows(dishCatsAll, matSel) }); return }
    let nextFD: string[]
    if (isAllSelected(fdSel, dishCatsAll)) nextFD = [cat]
    else nextFD = fdSel.includes(cat) ? fdSel.filter(c => c !== cat) : [...fdSel, cat]
    updateSlot(idx, { categories: mergeSlotRows(nextFD, matSel) })
  }
  const toggleSlotCatMAT = (idx: number, cat: string) => {
    const slot = bundleSettings[cfgType]?.modifierSlots[idx]; if (!slot) return
    const { fdSel, matSel } = splitSlotRows(slot.categories || [])
    if (cat === ANY) { updateSlot(idx, { categories: mergeSlotRows(fdSel, matCatsAll) }); return }
    let nextMAT: string[]
    if (isAllSelected(matSel, matCatsAll)) nextMAT = [cat]
    else nextMAT = matSel.includes(cat) ? matSel.filter(c => c !== cat) : [...matSel, cat]
    updateSlot(idx, { categories: mergeSlotRows(fdSel, nextMAT) })
  }

  /* ===================== SAVE ===================== */
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  async function handleSaveAll() {
    setSaving(true)
    try {
      // 0) Provider branches → DB
      const pbRows = Object.values(branches).map(b => ({
        id: b.id,
        name: (b.name || '').trim(),
        company_name: (b.company_name || '').trim(),
        address: (b.address || '').trim(),
        tax_code: (b.tax_code || '').trim(),
        phone: (b.phone || '').trim(),
        email: (b.email || '').trim(),
        bank: (b.bank || '').trim(),
        bank_account_name: (b.bank_account_name || '').trim(),
        account_number: (b.account_number || '').trim(),
      }))
      if (pbRows.length > 0) {
        const { error } = await supabase.from('provider_branches').upsert(pbRows, { onConflict: 'id' })
        if (error) throw error
        try { localStorage.setItem(LS_PROVIDER_BRANCHES_KEY, JSON.stringify(branches)) } catch {}
      }

      // 1) Bundle types → DB
      const rows = Object.entries(bundleSettings).map(([key, cfg]) => ({
        key,
        label: cfg.label,
        max_modifiers: cfg.maxModifiers,
        dish_categories: cfg.dishCategories ?? [],
        modifier_slots: (cfg.modifierSlots ?? []).map(s => ({ ...s, categories: s.categories ?? [] })),
        markup_x: Number(cfg.markupX) > 0 ? round(Number(cfg.markupX), 6) : 1,
      }))
      if (rows.length > 0) {
        const { error } = await supabase.from('bundle_types').upsert(rows, { onConflict: 'key' })
        if (error) throw error
        try { localStorage.setItem(LS_BUNDLE_SETTINGS_KEY, JSON.stringify(bundleSettings)) } catch {}
      }

      // 2) Staff per-evento
      if (eventId) {
        const sVal = Number(staffMarkupDraft); const sMul = Number.isFinite(sVal) && sVal > 0 ? sVal : 1
        await staff.setMarkupX(sMul)
      }

      // 3) TRANSPORT GLOBALS — upsert unico su transport_defaults + refresh
      const tVal = Number(transportMarkupDraft)
      const tMul = Number.isFinite(tVal) && tVal > 0 ? tVal : 1
      const vehiclePayload = vtDrafts
        .map(v => ({ id: String(v.id), name: (v.name || '').trim(), cost_per_km: Number(v.costPerKm) || 0 }))
        .filter(v => v.name.length > 0)

      await gTransport.saveAll({ markupX: tMul, vehicleTypes: vehiclePayload })
      await gTransport.refresh()

      setSaveMsg(t('common.saved'))
    } catch (e: any) {
      console.warn('[eventsettings] save all error:', e?.message || e)
      setSaveMsg(t('common.saveFailed'))
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 2500)
    }
  }

  // ---- Modali, editor state ----
  const [showEditModal, setShowEditModal] = useState(false)
  const [editLabel, setEditLabel] = useState('')
  const [editMax, setEditMax] = useState(0)
  const [editMarkupX, setEditMarkupX] = useState(1)
  useEffect(() => {
    if (!cfgType) return
    const cfg = bundleSettings[cfgType]; if (!cfg) return
    setEditLabel(cfg.label ?? ''); setEditMax(cfg.maxModifiers ?? 0); setEditMarkupX(Number(cfg.markupX) > 0 ? Number(cfg.markupX) : 1)
  }, [showEditModal, cfgType, bundleSettings])
  const applyEditBasics = () => {
    const v = clamp(editMax, 0, MAX_MODS)
    const mk = round(Math.max(editMarkupX || 1, 0.1), 6)
    updateCfg({ label: editLabel.trim() || 'Untitled', maxModifiers: v, markupX: mk })
    setShowEditModal(false)
  }

  const cfg = cfgType ? bundleSettings[cfgType] : null
  const typeOptions = useMemo(
    () => bundleTypes.sort((a, b) => (bundleSettings[a]?.label || a).localeCompare(bundleSettings[b]?.label || b)),
    [bundleTypes, bundleSettings]
  )

  /* ===================== STAFF (per-evento) ===================== */
  const [staffMarkupDraft, setStaffMarkupDraft] = useState<string>('1')
  useEffect(() => { setStaffMarkupDraft(String(staff.settings?.markup_x ?? 1)) }, [staff.settings?.markup_x])

  /* ===================== TRANSPORT GLOBAL DRAFT ===================== */
  const [transportMarkupDraft, setTransportMarkupDraft] = useState<string>(String(gTransport.defaults.markupX))
  useEffect(() => { setTransportMarkupDraft(String(gTransport.defaults.markupX)) }, [gTransport.defaults.markupX])

  const [vtDrafts, setVtDrafts] = useState(
    gTransport.defaults.vehicleTypes.map(v => ({ id: String(v.id), name: v.name, costPerKm: Number(v.cost_per_km) || 0 }))
  )
  useEffect(() => {
    setVtDrafts(gTransport.defaults.vehicleTypes.map(v => ({ id: String(v.id), name: v.name, costPerKm: Number(v.cost_per_km) || 0 })))
  }, [gTransport.defaults.vehicleTypes])

  /* ===================== Render ===================== */
  return (
    <div className="max-w-7xl mx-auto p-4 text-gray-100">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{t('event.title')}</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Back button */}
          <button
            type="button"
            onClick={() => router.push('/catering')}
            className="h-10 px-3 rounded-lg border border-white/20 text-white hover:bg-white/10 inline-flex items-center gap-2"
            title={t('nav.backToCatering')}
            aria-label={t('nav.backToCatering')}
          >
            <ArrowLeftIcon className="w-5 h-5" />
            <span>{t('nav.back')}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="h-10 px-3 rounded-lg bg-blue-600 text-white hover:opacity-80 disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
          {saveMsg && <span className="text-xs text-gray-300">{saveMsg}</span>}
        </div>
      </div>

      {/* ===== Provider branches ===== */}
      <div className="bg-white rounded-2xl shadow p-4 text-gray-900 space-y-4 mb-6">
        <div className="mb-2 flex items-center gap-3">
          <h2 className="text-lg font-semibold">{t('pb.title')}</h2>
          <select className="h-10 px-3 rounded-lg bg-white text-gray-900 border border-gray-300 min-w-56" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branchOptions.length === 0 && <option value="">{t('pb.none')}</option>}
            {branchOptions.map(id => (<option key={id} value={id}>{branches[id]?.name || '(untitled)'}</option>))}
          </select>
          <button type="button" onClick={createBranch} className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-blue-600 text-white hover:opacity-80" title={t('pb.add')} aria-label={t('pb.add')}>
            <PlusIcon className="w-5 h-5" />
          </button>
        </div>

        {!branchId ? (
          <div className="rounded-xl border p-4 text-sm text-gray-700">{t('pb.hintCreate')}</div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold truncate">
                {branches[branchId]?.name || '(untitled)'}
              </div>
              <div className="flex items-center gap-2">
                <IconBtn title={t('pb.delete')} variant="danger" onClick={deleteCurrentBranch}><TrashIcon className="w-5 h-5" /></IconBtn>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <Field label={t('pb.providerName')} value={branches[branchId]?.name || ''} onChange={v => updateBranch({ name: v })} />

              <Field label={t('pb.companyName')} value={branches[branchId]?.company_name || ''} onChange={v => updateBranch({ company_name: v })} />
              <Field label={t('pb.address')} value={branches[branchId]?.address || ''} onChange={v => updateBranch({ address: v })} />
              <Field label={t('pb.taxCode')} value={branches[branchId]?.tax_code || ''} onChange={v => updateBranch({ tax_code: v })} />
              <Field label={t('pb.phone')} value={branches[branchId]?.phone || ''} onChange={v => updateBranch({ phone: v })} />
              <Field label={t('pb.email')} value={branches[branchId]?.email || ''} onChange={v => updateBranch({ email: v })} />

              {/* Campi bancari */}
              <Field label={t('pb.bank')} value={branches[branchId]?.bank || ''} onChange={v => updateBranch({ bank: v })} />
              <Field label={t('pb.bankAccName')} value={branches[branchId]?.bank_account_name || ''} onChange={v => updateBranch({ bank_account_name: v })} />
              <Field label={t('pb.accountNumber')} value={branches[branchId]?.account_number || ''} onChange={v => updateBranch({ account_number: v })} />
            </div>
          </>
        )}
      </div>

      {/* ===== Bundle types ===== */}
      <div className="bg-white rounded-2xl shadow p-4 text-gray-900 space-y-4 mb-6">
        <div className="mb-2 flex items-center gap-3">
          <h2 className="text-lg font-semibold">{t('bt.title')}</h2>
          <select className="h-10 px-3 rounded-lg bg-white text-gray-900 border border-gray-300 min-w-56" value={cfgType} onChange={(e) => setCfgType(e.target.value)}>
            {typeOptions.length === 0 && <option value="">{t('bt.none')}</option>}
            {typeOptions.map(bt => (<option key={bt} value={bt}>{bundleSettings[bt]?.label || bt}</option>))}
          </select>
          <button type="button" onClick={openCreate} className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-blue-600 text-white hover:opacity-80" title={t('bt.addType')} aria-label={t('bt.addType')}>
            <PlusIcon className="w-5 h-5" />
          </button>
        </div>

        {!cfg ? (
          <div className="rounded-xl border p-4 text-sm text-gray-700">{t('bt.hintCreate')}</div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold truncate">
                {cfg.label}<span className="ml-2 text-sm text-gray-500">· {t('common.markup')} {fmtMx(cfg.markupX)}</span>
              </div>
              <div className="flex items-center gap-2">
                <IconBtn title={t('bt.editBasics')} onClick={() => setShowEditModal(true)}><PencilSquareIcon className="w-5 h-5" /></IconBtn>
                <IconBtn title={t('bt.deleteBundle')} variant="danger" onClick={removeTypeFromEditor}><TrashIcon className="w-5 h-5" /></IconBtn>
              </div>
            </div>

            {/* Base dish categories */}
            <div className="space-y-2">
              <div className="text-sm text-gray-800">
                {t('bt.baseDishCats')} {dishesLoading && <span className="opacity-60">({t('common.loading')})</span>}
              </div>

              {/* Final dishes row */}
              <div>
                <div className="text-[11px] text-gray-500 mb-1">{t('bt.finalDishes')}</div>
                <div className="flex flex-wrap gap-2">
                  {dishCats.map(cat => {
                    const isAny = cat === ANY
                    const checked = isAny ? baseFDAny : (!baseFDAny && baseFDChecked.has(cat))
                    return (
                      <label key={`d-${cat}`} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs cursor-pointer ${checked ? 'bg-black text-white border-black' : 'bg-white border-gray-300'}`}>
                        <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleDishCatFD(cat)} />
                        <span>{cat}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Materials row */}
              <div>
                <div className="text-[11px] text-gray-500 mb-1">
                  {t('bt.materials')} {materialsLoading && <span className="opacity-60">({t('common.loading')})</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {matCats.map(cat => {
                    const isAny = cat === ANY
                    const checked = isAny ? baseMATAny : (!baseMATAny && baseMATChecked.has(cat))
                    return (
                      <label key={`m-${cat}`} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs cursor-pointer ${checked ? 'bg-black text-white border-black' : 'bg-white border-gray-300'}`}>
                        <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleDishCatMAT(cat)} />
                        <span>{cat}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Modifier slots */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">{t('bt.modSlots')}</div>
                <button type="button" onClick={addSlot} disabled={cfg.modifierSlots.length >= MAX_MODS} className="px-3 h-9 rounded-lg border text-sm disabled:opacity-50">
                  {t('bt.addSlot')}
                </button>
              </div>

              {cfg.modifierSlots.length === 0 && (<div className="text-sm opacity-70">{t('bt.noSlots')}</div>)}

              <div className="grid gap-3">
                {cfg.modifierSlots.map((s, i) => {
                  const { fdSel, matSel } = splitSlotRows(s.categories || [])
                  const fdChecked = new Set(fdSel)
                  const matChecked = new Set(matSel)
                  const anyFD  = isAllSelected(fdSel, dishCatsAll)
                  const anyMAT = isAllSelected(matSel, matCatsAll)

                  return (
                    <div key={i} className="grid md:grid-cols-3 gap-3 items-start border rounded-lg p-3">
                      <Field label={t('bt.slotLabel', { n: i + 1 })} value={s.label} onChange={(v) => updateSlot(i, { label: v })} />

                      <div className="md:col-span-2">
                        <div className="text-sm text-gray-800 mb-1">{t('bt.allowedCats')}</div>

                        <div className="mb-2">
                          <div className="text-[11px] text-gray-500 mb-1">{t('bt.finalDishes')}</div>
                          <div className="flex flex-wrap gap-2">
                            {dishCats.map(cat => {
                              const isAny = cat === ANY
                              const checked = isAny ? anyFD : (!anyFD && fdChecked.has(cat))
                              return (
                                <label key={`slot-${i}-d-${cat}`} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs cursor-pointer ${checked ? 'bg-black text-white border-black' : 'bg-white border-gray-300'}`}>
                                  <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={checked}
                                    onChange={() => toggleSlotCatFD(i, cat)}
                                  />
                                  <span>{cat}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-gray-500 mb-1">{t('bt.materials')} {materialsLoading && <span className="opacity-60">({t('common.loading')})</span>}</div>
                          <div className="flex flex-wrap gap-2">
                            {matCats.map(cat => {
                              const isAny = cat === ANY
                              const checked = isAny ? anyMAT : (!anyMAT && matChecked.has(cat))
                              return (
                                <label key={`slot-${i}-m-${cat}`} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs cursor-pointer ${checked ? 'bg-black text-white border-black' : 'bg-white border-gray-300'}`}>
                                  <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={checked}
                                    onChange={() => toggleSlotCatMAT(i, cat)}
                                  />
                                  <span>{cat}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 md:col-span-3">
                        <label className="inline-flex items-center gap-2">
                          <input type="checkbox" checked={s.required} onChange={e => updateSlot(i, { required: e.target.checked })} />
                          <span className="text-sm">{t('common.required')}</span>
                        </label>
                        <button type="button" onClick={() => removeSlot(i)} className="text-red-600 text-sm">{t('bt.removeSlot')}</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Staff settings */}
      <div className="bg-white rounded-2xl shadow p-4 text-gray-900 space-y-4 mb-6">
        <div className="mb-2"><h2 className="text-lg font-semibold">{t('staff.title')}</h2></div>
        <div className="grid sm:grid-cols-[320px] gap-3">
          <Field label={t('common.markup')} type="number" stepAttr="0.1" value={staffMarkupDraft} onChange={setStaffMarkupDraft} />
        </div>
      </div>

      {/* Transport settings */}
      <div className="bg-white rounded-2xl shadow p-4 text-gray-900 space-y-4 mb-6">
        <div className="mb-2"><h2 className="text-lg font-semibold">{t('tr.title')}</h2></div>

        <div className="grid sm:grid-cols-[320px] gap-3">
          <Field label={t('common.markup')} type="number" stepAttr="0.1" value={transportMarkupDraft} onChange={setTransportMarkupDraft} />
        </div>

        <div className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">{t('tr.vehicleTypes')}</div>
            <button
              type="button"
              className="px-3 h-9 rounded-lg border text-sm"
              onClick={() => setVtDrafts(d => [...d, { id: `tmp_${Date.now()}`, name: '', costPerKm: 0 }])}
            >
              {t('tr.addVehicle')}
            </button>
          </div>

          {vtDrafts.length === 0 ? (
            <div className="text-sm text-gray-600">{t('tr.noVehicles')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-700">
                    <th className="text-left px-3 py-2 min-w-[260px]">{t('common.name')}</th>
                    <th className="text-right px-3 py-2 w-[220px]">{t('tr.costPerKm')}</th>
                    <th className="px-3 py-2 w-[80px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vtDrafts.map(v => (
                    <tr key={v.id}>
                      <td className="px-3 py-2 align-middle">
                        <input
                          className="w-full border rounded-lg px-3 h-10"
                          value={v.name}
                          onChange={e => setVtDrafts(d => d.map(x => x.id === v.id ? { ...x, name: e.target.value } : x))}
                          placeholder={t('tr.placeholder.vehicleName')}
                        />
                      </td>
                      <td className="px-3 py-2 text-right align-middle">
                        <input
                          className="w-40 border rounded-lg px-3 h-10 text-right"
                          type="number"
                          step="0.01"
                          value={String(v.costPerKm)}
                          onChange={e => {
                            const n = Number(e.target.value)
                            setVtDrafts(d => d.map(x => x.id === v.id ? { ...x, costPerKm: Number.isFinite(n) ? n : 0 } : x))
                          }}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-2 text-center align-middle">
                        <button
                          type="button"
                          className="text-red-600 hover:text-red-500"
                          title={t('tr.removeVehicle')}
                          onClick={() => setVtDrafts(d => d.filter(x => x.id !== v.id))}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ===== Contract Template (card con solo bottone) ===== */}
      <div className="bg-white rounded-2xl shadow p-4 text-gray-900 mb-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('ct.cardTitle')}</h2>
          <button
            type="button"
            onClick={() => router.push('../catering/eventsettings/contract-template')}
            className="h-10 px-3 rounded-lg bg-blue-600 text-white hover:opacity-80"
          >
            {t('ct.edit')}
          </button>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <Modal title={t('cm.title')} onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <Field label={t('cm.bundleName')} value={createLabel} onChange={setCreateLabel} />
            <Field label={t('cm.maxMods', { MAX: MAX_MODS })} type="number" value={String(createMax)} onChange={(v) => setCreateMax(clamp(Number(v) || 0, 0, MAX_MODS))} />
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={createFirstReq} onChange={e => setCreateFirstReq(e.target.checked)} />
              <span className="text-sm text-gray-800">{t('cm.firstReq')}</span>
            </label>
            <Field label={t('cm.markupEg')} type="number" value={String(createMarkupX)} onChange={(v) => setCreateMarkupX(Number(v))} stepAttr="0.1" />
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50">{t('common.cancel')}</button>
              <button type="button" onClick={applyCreate} className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:opacity-80">{t('common.create')}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {showEditModal && cfg && (
        <Modal title={t('em.title')} onClose={() => setShowEditModal(false)}>
          <div className="space-y-4">
            <Field label={t('em.label')} value={editLabel} onChange={setEditLabel} />
            <Field label={t('em.maxMods', { MAX: MAX_MODS })} type="number" value={String(editMax)} onChange={(v) => setEditMax(clamp(Number(v) || 0, 0, MAX_MODS))} />
            <Field label={t('em.markup')} type="number" value={String(editMarkupX)} onChange={(v) => setEditMarkupX(Number(v))} stepAttr="0.1" />
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowEditModal(false)} className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50">{t('common.cancel')}</button>
              <button type="button" onClick={applyEditBasics} className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:opacity-80">{t('common.save')}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** ---- Tiny UI atoms ---- */
function Field({ label, value, onChange, type = 'text', stepAttr }: { label: string; value: string; onChange: (v: string) => void; type?: string; stepAttr?: string }) {
  return (
    <label className="flex flex-col">
      <span className="text-sm text-gray-800">{label}</span>
      <input className="mt-1 w-full border rounded-lg px-3 h-10 text-gray-900 bg-white" value={value} type={type} step={stepAttr} onChange={e => onChange(e.target.value)} />
    </label>
  )
}

function IconBtn({ children, title, onClick, variant = 'default' }: { children: React.ReactNode; title: string; onClick: () => void; variant?: 'default' | 'danger' }) {
  const base = 'p-2 rounded-lg border text-gray-700 hover:bg-gray-100'
  const danger = 'p-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50'
  return <button type="button" title={title} onClick={onClick} className={variant === 'danger' ? danger : base}>{children}</button>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="text-base font-semibold text-gray-900">{title}</div>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close"><XMarkIcon className="w-5 h-5 text-gray-600" /></button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  )
}