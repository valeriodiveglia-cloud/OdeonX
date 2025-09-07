// src/contexts/SettingsContext.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase_shim'
import type { Lang } from '@/lib/i18n'

type Currency = 'VND' | 'USD' | 'EUR' | 'GBP'

/* ---------------- Helpers ---------------- */

export function toBool(v: any, fallback: boolean): boolean {
  if (v === true || v === 'true' || v === 1 || v === '1') return true
  if (v === false || v === 'false' || v === 0 || v === '0') return false
  return fallback
}

function clampPct(p: number) {
  const safe = Math.max(0, Math.min(100, Number(p)))
  return Math.round(safe * 100) / 100
}
// moltiplicatore ×: limiti ampi (0..1000)
function clampMarkup(m: number) {
  const safe = Math.max(0, Math.min(1000, Number(m)))
  return Math.round(safe * 100) / 100
}
function clampMonths(n: number) {
  const safe = Math.max(0, Math.min(12, Math.round(Number(n))))
  return safe
}

/* ---------------- Ctx ---------------- */

type Ctx = {
  hydrated: boolean

  language: Lang
  setLanguage: (l: Lang) => void
  currency: Currency
  setCurrency: (c: Currency) => void

  // VAT
  vatEnabled: boolean
  setVatEnabled: (on: boolean) => void
  vatRate: number
  setVatRate: (p: number) => void

  // Markup globale ricette in percentuale (0..100)
  defaultMarkupPct: number
  setDefaultMarkupPct: (p: number) => void

  // Markup attrezzature (moltiplicatore ×)
  defaultMarkupEquipmentPct: number
  setDefaultMarkupEquipmentPct: (m: number) => void

  // Alias retro-compatibile (moltiplicatore ×)
  equipmentDefaultMarkup: number
  setEquipmentDefaultMarkup: (m: number) => void

  // Materials settings
  reviewMonths: number
  setReviewMonths: (n: number) => void
  askCsvConfirm: boolean
  setAskCsvConfirm: (v: boolean) => void
  materialsExclusiveDefault: boolean
  setMaterialsExclusiveDefault: (v: boolean) => void

  // Equipment settings
  equipmentReviewMonths: number
  setEquipmentReviewMonths: (n: number) => void
  equipmentCsvConfirm: boolean
  setEquipmentCsvConfirm: (v: boolean) => void

  // Forzare ricarica
  reloadSettings: () => Promise<void>

  // Forzare remount di componenti ostinate
  revision: number
}

const SettingsCtx = createContext<Ctx>({
  hydrated: false,

  language: 'en',
  setLanguage: () => {},
  currency: 'VND',
  setCurrency: () => {},

  vatEnabled: false,
  setVatEnabled: () => {},
  vatRate: 10,
  setVatRate: () => {},

  defaultMarkupPct: 30,
  setDefaultMarkupPct: () => {},

  defaultMarkupEquipmentPct: 1.5,
  setDefaultMarkupEquipmentPct: () => {},

  equipmentDefaultMarkup: 1.5,
  setEquipmentDefaultMarkup: () => {},

  reviewMonths: 4,
  setReviewMonths: () => {},
  askCsvConfirm: true,
  setAskCsvConfirm: () => {},
  materialsExclusiveDefault: true,
  setMaterialsExclusiveDefault: () => {},

  equipmentReviewMonths: 4,
  setEquipmentReviewMonths: () => {},
  equipmentCsvConfirm: true,
  setEquipmentCsvConfirm: () => {},

  reloadSettings: async () => {},
  revision: 0,
})

/* ---------------- Provider ---------------- */

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [revision, setRevision] = useState(0)

  const [language, setLanguageState] = useState<Lang>('en')
  const [currency, setCurrencyState] = useState<Currency>('VND')

  // VAT
  const [vatEnabled, setVatEnabledState] = useState<boolean>(false)
  const [vatRate, setVatRateState] = useState<number>(10)

  // Ricette %
  const [defaultMarkupPct, setDefaultMarkupPctState] = useState<number>(30)

  // Attrezzature ×
  const [defaultMarkupEquipmentPct, setDefaultMarkupEquipmentPctState] = useState<number>(1.5)

  // Materials
  const [reviewMonths, setReviewMonthsState] = useState<number>(4)
  const [askCsvConfirm, setAskCsvConfirmState] = useState<boolean>(true)
  const [materialsExclusiveDefault, setMaterialsExclusiveDefaultState] = useState<boolean>(true)

  // Equipment
  const [equipmentReviewMonths, setEquipmentReviewMonthsState] = useState<number>(4)
  const [equipmentCsvConfirm, setEquipmentCsvConfirmState] = useState<boolean>(true)

  // Chiavi localStorage usate dall’app
  const LS_KEYS = [
    'app_materials_review_months',
    'app_csv_require_confirm_refs',
    'app_materials_exclusive_default',
    'app_equipment_review_months',
    'app_equipment_csv_require_confirm_refs',
    'app_lang',
  ] as const

  function clearLocalSettings() {
    try {
      for (const k of LS_KEYS) localStorage.removeItem(k)
    } catch {}
  }

  /** Upsert “sparse”: scrivo solo i campi presenti.
   *  Al termine: dispatch di 'settings-changed' e bump revision per propagare subito. */
  async function saveToDb(partial: {
    language?: Lang
    currency?: Currency
    vatEnabled?: boolean
    vatRate?: number
    defaultMarkupPct?: number
    defaultMarkupEquipmentPct?: number
    equipmentDefaultMarkup?: number // alias in ingresso
    reviewMonths?: number
    askCsvConfirm?: boolean
    materialsExclusiveDefault?: boolean
    equipmentReviewMonths?: number
    equipmentCsvConfirm?: boolean
  }) {
    const patch: Record<string, any> = { id: 'singleton' }

    if ('language' in partial) patch.language_code = partial.language === 'vi' ? 'vi' : 'en'
    if ('currency' in partial) patch.currency = partial.currency
    if ('vatEnabled' in partial) patch.vat_enabled = partial.vatEnabled
    if ('vatRate' in partial) patch.vat_rate = partial.vatRate
    if ('defaultMarkupPct' in partial) patch.default_markup_pct = partial.defaultMarkupPct

    // accetto sia defaultMarkupEquipmentPct che alias equipmentDefaultMarkup
    const equipMul =
      'defaultMarkupEquipmentPct' in partial
        ? partial.defaultMarkupEquipmentPct
        : 'equipmentDefaultMarkup' in partial
          ? partial.equipmentDefaultMarkup
          : undefined
    if (typeof equipMul !== 'undefined') {
      patch.default_markup_equipment_pct = equipMul
    }

    if ('reviewMonths' in partial) patch.materials_review_months = partial.reviewMonths
    if ('askCsvConfirm' in partial) patch.csv_require_confirm_refs = partial.askCsvConfirm
    if ('materialsExclusiveDefault' in partial) patch.materials_exclusive_default = partial.materialsExclusiveDefault

    if ('equipmentReviewMonths' in partial) patch.equipment_review_months = partial.equipmentReviewMonths
    if ('equipmentCsvConfirm' in partial) patch.equipment_csv_require_confirm_refs = partial.equipmentCsvConfirm

    const { error } = await supabase.from('app_settings').upsert(patch, { onConflict: 'id' })
    if (error) {
      console.warn('Settings save error', error)
      return
    }

    // 🔔 notifica TUTTI i tab/componenti
    try { window.dispatchEvent(new CustomEvent('settings-changed')) } catch {}
    try { new BroadcastChannel('app-events').postMessage('settings-changed') } catch {}

    // 🔁 bump revision per forzare re-render immediato nel tab corrente
    setRevision(r => r + 1)
  }

  // Lettura unica DB + rispetta LS/override
  async function hydrateFromSources() {
    const { data, error } = await supabase
      .from('app_settings')
      .select(
        'language_code, currency, vat_enabled, vat_rate, default_markup_pct, default_markup_equipment_pct, materials_review_months, csv_require_confirm_refs, materials_exclusive_default, equipment_review_months, equipment_csv_require_confirm_refs'
      )
      .eq('id', 'singleton')
      .maybeSingle()
    if (error) console.warn('Settings load error', error)

    const lang = data?.language_code === 'vi' ? 'vi' : 'en'
    const curRaw = (data?.currency as Currency) ?? 'VND'
    const cur: Currency = (['VND', 'USD', 'EUR', 'GBP'] as const).includes(curRaw) ? curRaw : 'VND'

    // Applica lingua subito a <html lang> e salva in LS
    try {
      document.documentElement.lang = lang
      localStorage.setItem('app_lang', lang)
    } catch {}

    setLanguageState(lang)
    setCurrencyState(cur)
    setVatEnabledState(toBool(data?.vat_enabled, false))

    const parsedRate = typeof data?.vat_rate === 'number' ? data.vat_rate : Number(data?.vat_rate)
    setVatRateState(Number.isFinite(parsedRate) ? clampPct(parsedRate) : 10)

    const parsedMarkupPct =
      typeof data?.default_markup_pct === 'number' ? data.default_markup_pct : Number(data?.default_markup_pct)
    setDefaultMarkupPctState(Number.isFinite(parsedMarkupPct) ? clampPct(parsedMarkupPct) : 30)

    // Moltiplicatore × attrezzature
    const parsedEquipMul =
      typeof data?.default_markup_equipment_pct === 'number'
        ? data.default_markup_equipment_pct
        : Number(data?.default_markup_equipment_pct)

    setDefaultMarkupEquipmentPctState(
      Number.isFinite(parsedEquipMul) && parsedEquipMul > 0 ? clampMarkup(parsedEquipMul) : 1.5
    )

    // Materials da DB con fallback a localStorage
    const matMonthsDb = Number.isFinite(Number(data?.materials_review_months))
      ? clampMonths(Number(data?.materials_review_months))
      : undefined
    const csvConfirmDb =
      'csv_require_confirm_refs' in (data || {})
        ? toBool((data as any).csv_require_confirm_refs, true)
        : undefined
    const matExclusiveDb =
      'materials_exclusive_default' in (data || {})
        ? toBool((data as any).materials_exclusive_default, true)
        : undefined

    // Equipment da DB con fallback a localStorage
    const eqMonthsDb = Number.isFinite(Number(data?.equipment_review_months))
      ? clampMonths(Number(data?.equipment_review_months))
      : undefined
    const eqCsvDb =
      'equipment_csv_require_confirm_refs' in (data || {})
        ? toBool((data as any).equipment_csv_require_confirm_refs, true)
        : undefined

    try {
      // Local overrides
      const storedMatReview = localStorage.getItem('app_materials_review_months')
      const storedCsvConfirm = localStorage.getItem('app_csv_require_confirm_refs')
      const storedMatExclusive = localStorage.getItem('app_materials_exclusive_default')

      setReviewMonthsState(
        matMonthsDb ??
          (storedMatReview != null && Number.isFinite(parseInt(storedMatReview, 10))
            ? clampMonths(parseInt(storedMatReview, 10))
            : 4)
      )
      setAskCsvConfirmState(
        typeof csvConfirmDb === 'boolean'
          ? csvConfirmDb
          : storedCsvConfirm != null
            ? storedCsvConfirm === 'true'
            : true
      )
      setMaterialsExclusiveDefaultState(
        typeof matExclusiveDb === 'boolean'
          ? matExclusiveDb
          : storedMatExclusive != null
            ? storedMatExclusive === 'true'
            : true
      )

      const storedEqReview = localStorage.getItem('app_equipment_review_months')
      const storedEqCsv = localStorage.getItem('app_equipment_csv_require_confirm_refs')

      setEquipmentReviewMonthsState(
        eqMonthsDb ??
          (storedEqReview != null && Number.isFinite(parseInt(storedEqReview, 10))
            ? clampMonths(parseInt(storedEqReview, 10))
            : 4)
      )
      setEquipmentCsvConfirmState(
        typeof eqCsvDb === 'boolean' ? eqCsvDb : storedEqCsv != null ? storedEqCsv === 'true' : true
      )
    } catch (e) {
      console.warn('Settings localStorage load error', e)
    }
  }

  // Caricamento iniziale + listeners
  useEffect(() => {
    let mounted = true
    ;(async () => {
      // Prova a leggere la lingua dal LS per evitare flicker
      try {
        const lsLang = localStorage.getItem('app_lang') as Lang | null
        if (lsLang === 'en' || lsLang === 'vi') {
          setLanguageState(lsLang)
          document.documentElement.lang = lsLang
        }
      } catch {}
      await hydrateFromSources()
      if (!mounted) return
      setHydrated(true)
      try { window.dispatchEvent(new CustomEvent('settings-hydrated')) } catch {}
    })()

    // Sync via storage
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === 'app_lang' && ev.newValue) {
        const l = ev.newValue as Lang
        if (l === 'en' || l === 'vi') {
          setLanguageState(l)
          try { document.documentElement.lang = l } catch {}
        }
      }
      if (ev.key === 'app_materials_review_months' && ev.newValue != null) {
        const n = parseInt(ev.newValue, 10)
        if (Number.isFinite(n)) setReviewMonthsState(clampMonths(n))
      }
      if (ev.key === 'app_csv_require_confirm_refs' && ev.newValue != null) {
        setAskCsvConfirmState(ev.newValue === 'true')
      }
      if (ev.key === 'app_materials_exclusive_default' && ev.newValue != null) {
        setMaterialsExclusiveDefaultState(ev.newValue === 'true')
      }
      if (ev.key === 'app_equipment_review_months' && ev.newValue != null) {
        const n = parseInt(ev.newValue, 10)
        if (Number.isFinite(n)) setEquipmentReviewMonthsState(clampMonths(n))
      }
      if (ev.key === 'app_equipment_csv_require_confirm_refs' && ev.newValue != null) {
        setEquipmentCsvConfirmState(ev.newValue === 'true')
      }
    }
    window.addEventListener('storage', onStorage)

    // BroadcastChannel: reset / lingua / settings-changed
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('app-events')
      bc.onmessage = (e) => {
        if (e?.data === 'data-reset' || e?.data === 'settings-changed') {
          void reloadSettings()
        }
        if (e?.data?.type === 'lang' && (e.data.value === 'en' || e.data.value === 'vi')) {
          setLanguageState(e.data.value)
          try { document.documentElement.lang = e.data.value } catch {}
          try { localStorage.setItem('app_lang', e.data.value) } catch {}
        }
      }
    } catch {}

    // Listener diretto su window (stesso tab)
    const onSettingsChanged = () => { void reloadSettings() }
    window.addEventListener('settings-changed' as any, onSettingsChanged)

    return () => {
      mounted = false
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('settings-changed' as any, onSettingsChanged)
      try { bc?.close() } catch {}
    }
  }, [])

  // API pubblica per ricaricare tutto dopo un reset
  const reloadSettings = async () => {
    setHydrated(false)
    clearLocalSettings()
    await hydrateFromSources()
    setRevision((r) => r + 1)
    setHydrated(true)
    try { window.dispatchEvent(new CustomEvent('settings-hydrated')) } catch {}
  }

  /* -------- Setters DB-backed -------- */

  function setLanguage(l: Lang) {
    setLanguageState(l)
    try {
      document.documentElement.lang = l
      localStorage.setItem('app_lang', l)
      new BroadcastChannel('app-events').postMessage({ type: 'lang', value: l })
    } catch {}
    void saveToDb({ language: l })
  }
  function setCurrency(c: Currency) {
    setCurrencyState(c)
    void saveToDb({ currency: c })
  }

  function setVatEnabled(on: boolean) {
    setVatEnabledState(on)
    void saveToDb({ vatEnabled: on })
    ;(async () => {
      const { data, error } = await supabase.rpc('set_vat_and_recalc', { p_vat_enabled: on })
      if (error) {
        console.error('Recalc failed', error)
        return
      }
      console.log('Recalc stats', data?.[0])
      try { window.dispatchEvent(new CustomEvent('costs-recalculated')) } catch {}
    })()
  }

  function setVatRate(p: number) {
    const rounded = clampPct(p)
    setVatRateState(rounded)
    void saveToDb({ vatRate: rounded })
  }

  function setDefaultMarkupPct(p: number) {
    const rounded = clampPct(p)
    setDefaultMarkupPctState(rounded)
    void saveToDb({ defaultMarkupPct: rounded })
  }

  // Setter unico (valore ×)
  function _setEquipmentMultiplierRaw(m: number) {
    const rounded = clampMarkup(m)
    setDefaultMarkupEquipmentPctState(rounded)
    void saveToDb({ defaultMarkupEquipmentPct: rounded })
  }
  // Nome “nuovo/corretto”
  function setDefaultMarkupEquipmentPct(m: number) {
    _setEquipmentMultiplierRaw(m)
  }
  // Alias retro-compatibile
  function setEquipmentDefaultMarkup(m: number) {
    _setEquipmentMultiplierRaw(m)
  }

  // Setters con localStorage + DB
  function setReviewMonths(n: number) {
    const v = clampMonths(n)
    setReviewMonthsState(v)
    try { localStorage.setItem('app_materials_review_months', String(v)) } catch {}
    void saveToDb({ reviewMonths: v })
  }
  function setAskCsvConfirm(v: boolean) {
    setAskCsvConfirmState(!!v)
    try { localStorage.setItem('app_csv_require_confirm_refs', String(!!v)) } catch {}
    void saveToDb({ askCsvConfirm: !!v })
  }
  function setMaterialsExclusiveDefault(v: boolean) {
    setMaterialsExclusiveDefaultState(!!v)
    try { localStorage.setItem('app_materials_exclusive_default', String(!!v)) } catch {}
    void saveToDb({ materialsExclusiveDefault: !!v })
  }

  function setEquipmentReviewMonths(n: number) {
    const v = clampMonths(n)
    setEquipmentReviewMonthsState(v)
    try { localStorage.setItem('app_equipment_review_months', String(v)) } catch {}
    void saveToDb({ equipmentReviewMonths: v })
  }
  function setEquipmentCsvConfirm(v: boolean) {
    setEquipmentCsvConfirmState(!!v)
    try { localStorage.setItem('app_equipment_csv_require_confirm_refs', String(!!v)) } catch {}
    void saveToDb({ equipmentCsvConfirm: !!v })
  }

  if (!hydrated) return null

  return (
    <SettingsCtx.Provider
      value={{
        hydrated,

        language,
        setLanguage,
        currency,
        setCurrency,

        vatEnabled,
        setVatEnabled,
        vatRate,
        setVatRate,

        defaultMarkupPct,
        setDefaultMarkupPct,

        defaultMarkupEquipmentPct,
        setDefaultMarkupEquipmentPct,

        // alias: SEMPRE lo stesso valore del moltiplicatore ×
        equipmentDefaultMarkup: defaultMarkupEquipmentPct,
        setEquipmentDefaultMarkup,

        reviewMonths,
        setReviewMonths,
        askCsvConfirm,
        setAskCsvConfirm,
        materialsExclusiveDefault,
        setMaterialsExclusiveDefault,

        equipmentReviewMonths,
        setEquipmentReviewMonths,
        equipmentCsvConfirm,
        setEquipmentCsvConfirm,

        reloadSettings,
        revision,
      }}
    >
      {children}
    </SettingsCtx.Provider>
  )
}

/* ---------------- Hook ---------------- */

export function useSettings() {
  return useContext(SettingsCtx)
}
