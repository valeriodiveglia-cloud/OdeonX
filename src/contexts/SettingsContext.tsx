// src/contexts/SettingsContext.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Lang } from '@/lib/i18n'

type Currency = 'VND' | 'USD' | 'EUR' | 'GBP'

// Helper robusto per normalizzare booleani potenzialmente stringa/numero
export function toBool(v: any, fallback: boolean): boolean {
  if (v === true || v === 'true' || v === 1 || v === '1') return true
  if (v === false || v === 'false' || v === 0 || v === '0') return false
  return fallback
}

type Ctx = {
  hydrated: boolean

  language: Lang
  setLanguage: (l: Lang) => void
  currency: Currency
  setCurrency: (c: Currency) => void

  // VAT
  vatEnabled: boolean
  setVatEnabled: (on: boolean) => void
  vatRate: number // percent
  setVatRate: (p: number) => void

  // Markup globale
  defaultMarkupPct: number
  setDefaultMarkupPct: (p: number) => void

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

  // Revision per forzare remount delle sezioni ostinate (usalo come key)
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

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [revision, setRevision] = useState(0)

  const [language, setLanguageState] = useState<Lang>('en')
  const [currency, setCurrencyState] = useState<Currency>('VND')

  // VAT
  const [vatEnabled, setVatEnabledState] = useState<boolean>(false)
  const [vatRate, setVatRateState] = useState<number>(10)

  // Markup globale
  const [defaultMarkupPct, setDefaultMarkupPctState] = useState<number>(30)

  // Materials
  const [reviewMonths, setReviewMonthsState] = useState<number>(4)
  const [askCsvConfirm, setAskCsvConfirmState] = useState<boolean>(true)
  const [materialsExclusiveDefault, setMaterialsExclusiveDefaultState] = useState<boolean>(true)

  // Equipment
  const [equipmentReviewMonths, setEquipmentReviewMonthsState] = useState<number>(4)
  const [equipmentCsvConfirm, setEquipmentCsvConfirmState] = useState<boolean>(true)

  // Helpers
  function clampPct(p: number) {
    const safe = Math.max(0, Math.min(100, Number(p)))
    return Math.round(safe * 100) / 100
  }
  function clampMarkup(p: number) {
    const safe = Math.max(0, Math.min(1000, Number(p)))
    return Math.round(safe * 100) / 100
  }
  function clampMonths(n: number) {
    const safe = Math.max(0, Math.min(12, Math.round(Number(n))))
    return safe
  }

  // Chiavi localStorage usate dall’app
  const LS_KEYS = [
    'app_materials_review_months',
    'app_csv_require_confirm_refs',
    'app_materials_exclusive_default',
    'app_equipment_review_months',
    'app_equipment_csv_require_confirm_refs',
  ] as const

  function clearLocalSettings() {
    try {
      for (const k of LS_KEYS) localStorage.removeItem(k)
    } catch {}
  }

  // 🔧 Salvataggio "sparse": scrive SOLO i campi presenti nel partial
  async function saveToDb(partial: {
    language?: Lang
    currency?: Currency
    vatEnabled?: boolean
    vatRate?: number
    defaultMarkupPct?: number
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

    if ('reviewMonths' in partial) patch.materials_review_months = partial.reviewMonths
    if ('askCsvConfirm' in partial) patch.csv_require_confirm_refs = partial.askCsvConfirm
    if ('materialsExclusiveDefault' in partial) patch.materials_exclusive_default = partial.materialsExclusiveDefault

    if ('equipmentReviewMonths' in partial) patch.equipment_review_months = partial.equipmentReviewMonths
    if ('equipmentCsvConfirm' in partial) patch.equipment_csv_require_confirm_refs = partial.equipmentCsvConfirm

    const { error } = await supabase.from('app_settings').upsert(patch, { onConflict: 'id' })
    if (error) console.warn('Settings save error', error)
  }

  // Funzione unica di idratazione da DB + localStorage
  async function hydrateFromSources() {
    // 1) DB
    const { data, error } = await supabase
      .from('app_settings')
      .select(
        'language_code, currency, vat_enabled, vat_rate, default_markup_pct, materials_review_months, csv_require_confirm_refs, materials_exclusive_default, equipment_review_months, equipment_csv_require_confirm_refs'
      )
      .eq('id', 'singleton')
      .maybeSingle()
    if (error) console.warn('Settings load error', error)

    const lang = data?.language_code === 'vi' ? 'vi' : 'en'
    const curRaw = (data?.currency as Currency) ?? 'VND'
    const cur: Currency = (['VND', 'USD', 'EUR', 'GBP'] as const).includes(curRaw) ? curRaw : 'VND'

    setLanguageState(lang)
    setCurrencyState(cur)
    setVatEnabledState(toBool(data?.vat_enabled, false))

    const parsedRate = typeof data?.vat_rate === 'number' ? data.vat_rate : Number(data?.vat_rate)
    setVatRateState(Number.isFinite(parsedRate) ? clampPct(parsedRate) : 10)

    const parsedMarkup =
      typeof data?.default_markup_pct === 'number' ? data.default_markup_pct : Number(data?.default_markup_pct)
    setDefaultMarkupPctState(Number.isFinite(parsedMarkup) ? clampMarkup(parsedMarkup) : 30)

    // 2) Materials da DB con fallback a localStorage
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

    // 3) Equipment da DB con fallback a localStorage
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

  // Caricamento iniziale
  useEffect(() => {
    let mounted = true
    ;(async () => {
      await hydrateFromSources()
      if (!mounted) return
      setHydrated(true)
      try { window.dispatchEvent(new CustomEvent('settings-hydrated')) } catch {}
    })()

    // Storage sync tra tab
    const onStorage = (ev: StorageEvent) => {
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

    // Opzionale: ascolta un broadcast "data-reset" e re-idrata
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('app-events')
      bc.onmessage = (e) => {
        if (e?.data === 'data-reset') {
          void reloadSettings()
        }
      }
    } catch {}

    return () => {
      mounted = false
      window.removeEventListener('storage', onStorage)
      try { bc?.close() } catch {}
    }
  }, [])

  // API pubblica per ricaricare tutto dopo un reset
  const reloadSettings = async () => {
    // 1) stop rendering per evitare flicker incoerenti
    setHydrated(false)

    // 2) pulizia forte delle preferenze locali
    clearLocalSettings()

    // 3) re-idrata dal DB (che ora è “reset”)
    await hydrateFromSources()

    // 4) bump revision per forzare remount di sezioni che memorizzano stato interno
    setRevision((r) => r + 1)

    // 5) ri-attiva rendering + annuncio
    setHydrated(true)
    try { window.dispatchEvent(new CustomEvent('settings-hydrated')) } catch {}
  }

  // Setters DB-backed
  function setLanguage(l: Lang) {
    setLanguageState(l)
    void saveToDb({ language: l })
  }
  function setCurrency(c: Currency) {
    setCurrencyState(c)
    void saveToDb({ currency: c })
  }

  // VAT toggle con ricalcolo server
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
    const rounded = clampMarkup(p)
    setDefaultMarkupPctState(rounded)
    void saveToDb({ defaultMarkupPct: rounded })
  }

  // Setters con localStorage e DB
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

export function useSettings() {
  return useContext(SettingsCtx)
}
