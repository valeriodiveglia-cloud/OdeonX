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

  // HR Review Frequency
  hrReviewFrequency: string
  setHrReviewFrequency: (v: string) => void

  // HR Bonus Config
  hrBonus14thBaseYears: number
  setHrBonus14thBaseYears: (n: number) => void
  hrBonus14thSteps: { years: number, pct: number }[]
  setHrBonus14thSteps: (s: { years: number, pct: number }[]) => void

  hrBonusPtMaxCap: number
  setHrBonusPtMaxCap: (n: number) => void
  hrBonusPtTargetHours: number
  setHrBonusPtTargetHours: (n: number) => void
  hrBonusPtMinHours: number
  setHrBonusPtMinHours: (n: number) => void

  hrBonusPtMinRating: number
  setHrBonusPtMinRating: (n: number) => void
  hrBonus14thMinRating: number
  setHrBonus14thMinRating: (n: number) => void
  hrBonus13thGuaranteedPct: number
  setHrBonus13thGuaranteedPct: (n: number) => void
  hrBonus13thPerfPct: number
  setHrBonus13thPerfPct: (n: number) => void
  hrBonus13thPerfTiers: { min_rating: number, multiplier_pct: number }[]
  setHrBonus13thPerfTiers: (t: { min_rating: number, multiplier_pct: number }[]) => void

  // CRM Global Settings
  crmAdvisorCommissionPct: number
  setCrmAdvisorCommissionPct: (p: number) => void
  crmCommissionType: string
  setCrmCommissionType: (t: string) => void
  crmCommissionRules: any
  setCrmCommissionRules: (r: any) => void

  crmPartnerRules: any
  setCrmPartnerRules: (r: any) => void

  saveAllCrmSettings: (type: string, rules: any, partnerRules: any) => void

  // System Go-Live
  financeStartDate: string
  setFinanceStartDate: (d: string) => void

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

  hrReviewFrequency: 'Quarterly',
  setHrReviewFrequency: () => {},

  hrBonus14thBaseYears: 3,
  setHrBonus14thBaseYears: () => {},
  hrBonus14thSteps: [{ years: 3, pct: 60 }, { years: 4, pct: 70 }, { years: 5, pct: 80 }, { years: 6, pct: 90 }, { years: 7, pct: 100 }],
  setHrBonus14thSteps: () => {},

  hrBonusPtMaxCap: 2000000,
  setHrBonusPtMaxCap: () => {},
  hrBonusPtTargetHours: 500,
  setHrBonusPtTargetHours: () => {},
  hrBonusPtMinHours: 100,
  setHrBonusPtMinHours: () => {},

  hrBonusPtMinRating: 2.5,
  setHrBonusPtMinRating: () => {},
  hrBonus14thMinRating: 3.0,
  setHrBonus14thMinRating: () => {},
  hrBonus13thGuaranteedPct: 80,
  setHrBonus13thGuaranteedPct: () => {},
  hrBonus13thPerfPct: 20,
  setHrBonus13thPerfPct: () => {},
  hrBonus13thPerfTiers: [{ min_rating: 3, multiplier_pct: 100 }, { min_rating: 4.8, multiplier_pct: 150 }],
  setHrBonus13thPerfTiers: () => {},

  crmAdvisorCommissionPct: 10,
  setCrmAdvisorCommissionPct: () => {},
  crmCommissionType: 'Acquisition + Maintenance',
  setCrmCommissionType: () => {},
  crmCommissionRules: { acquisition_pct: 10, maintenance_pct: 4 },
  setCrmCommissionRules: () => {},

  crmPartnerRules: { has_commission: true, commission_type: 'Percentage', commission_value: 10, has_discount: false, client_discount_type: 'Percentage', client_discount_value: 0, commission_base: 'Before Discount', details: '', pit_threshold_vnd: 2000000 },
  setCrmPartnerRules: () => {},

  saveAllCrmSettings: () => {},

  financeStartDate: '',
  setFinanceStartDate: () => {},

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

  // HR
  const [hrReviewFrequency, setHrReviewFrequencyState] = useState<string>('Quarterly')
  const [hrBonus14thBaseYears, setHrBonus14thBaseYearsState] = useState<number>(3)
  const [hrBonus14thSteps, setHrBonus14thStepsState] = useState<{ years: number, pct: number }[]>([
    { years: 3, pct: 60 }, { years: 4, pct: 70 }, { years: 5, pct: 80 }, { years: 6, pct: 90 }, { years: 7, pct: 100 }
  ])
  const [hrBonusPtMaxCap, setHrBonusPtMaxCapState] = useState<number>(2000000)
  const [hrBonusPtTargetHours, setHrBonusPtTargetHoursState] = useState<number>(500)
  const [hrBonusPtMinHours, setHrBonusPtMinHoursState] = useState<number>(100)

  const [hrBonusPtMinRating, setHrBonusPtMinRatingState] = useState<number>(2.5)
  const [hrBonus14thMinRating, setHrBonus14thMinRatingState] = useState<number>(3.0)
  const [hrBonus13thGuaranteedPct, setHrBonus13thGuaranteedPctState] = useState<number>(80)
  const [hrBonus13thPerfPct, setHrBonus13thPerfPctState] = useState<number>(20)
  const [hrBonus13thPerfTiers, setHrBonus13thPerfTiersState] = useState<{ min_rating: number, multiplier_pct: number }[]>([
    { min_rating: 3, multiplier_pct: 100 },
    { min_rating: 4.8, multiplier_pct: 150 }
  ])

  // CRM
  const [crmAdvisorCommissionPct, setCrmAdvisorCommissionPctState] = useState<number>(10)
  const [crmCommissionType, setCrmCommissionTypeState] = useState<string>('Acquisition + Maintenance')
  const [crmCommissionRules, setCrmCommissionRulesState] = useState<any>({ acquisition_pct: 10, maintenance_pct: 4 })
  const [crmPartnerRules, setCrmPartnerRulesState] = useState<any>({ has_commission: true, commission_type: 'Percentage', commission_value: 10, has_discount: false, client_discount_type: 'Percentage', client_discount_value: 0, commission_base: 'Before Discount', details: '', pit_threshold_vnd: 2000000 })

  // Go-Live
  const [financeStartDate, setFinanceStartDateState] = useState<string>('')

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
    hrReviewFrequency?: string
    hrBonus14thBaseYears?: number
    hrBonus14thSteps?: { years: number, pct: number }[]
    hrBonusPtMaxCap?: number
    hrBonusPtTargetHours?: number
    hrBonusPtMinHours?: number
    hrBonusPtMinRating?: number
    hrBonus14thMinRating?: number
    hrBonus13thGuaranteedPct?: number
    hrBonus13thPerfPct?: number
    hrBonus13thPerfTiers?: { min_rating: number, multiplier_pct: number }[]
    crmAdvisorCommissionPct?: number
    crmCommissionType?: string
    crmCommissionRules?: any
    crmPartnerRules?: any
    financeStartDate?: string
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

    if ('hrReviewFrequency' in partial) patch.hr_review_frequency = partial.hrReviewFrequency
    if ('hrBonus14thBaseYears' in partial) patch.hr_bonus_14th_base_years = partial.hrBonus14thBaseYears
    if ('hrBonus14thSteps' in partial) patch.hr_bonus_14th_steps = partial.hrBonus14thSteps
    if ('hrBonusPtMaxCap' in partial) patch.hr_bonus_pt_max_cap = partial.hrBonusPtMaxCap
    if ('hrBonusPtTargetHours' in partial) patch.hr_bonus_pt_target_hours = partial.hrBonusPtTargetHours
    if ('hrBonusPtMinHours' in partial) patch.hr_bonus_pt_min_hours = partial.hrBonusPtMinHours
    if ('hrBonusPtMinRating' in partial) patch.hr_bonus_pt_min_rating = partial.hrBonusPtMinRating
    if ('hrBonus14thMinRating' in partial) patch.hr_bonus_14th_min_rating = partial.hrBonus14thMinRating
    if ('hrBonus13thGuaranteedPct' in partial) patch.hr_bonus_13th_guaranteed_pct = partial.hrBonus13thGuaranteedPct
    if ('hrBonus13thPerfPct' in partial) patch.hr_bonus_13th_perf_pct = partial.hrBonus13thPerfPct
    if ('hrBonus13thPerfTiers' in partial) patch.hr_bonus_13th_perf_tiers = partial.hrBonus13thPerfTiers

    if ('crmAdvisorCommissionPct' in partial) patch.crm_advisor_commission_pct = partial.crmAdvisorCommissionPct
    if ('crmCommissionType' in partial) patch.crm_commission_type = partial.crmCommissionType
    if ('crmCommissionRules' in partial) patch.crm_commission_rules = partial.crmCommissionRules
    if ('crmPartnerRules' in partial) patch.crm_partner_rules = partial.crmPartnerRules
    if ('financeStartDate' in partial) patch.finance_start_date = partial.financeStartDate

    const { error } = await supabase.from('app_settings').upsert(patch, { onConflict: 'id' })
    if (error) {
      console.warn('Settings save error', error)
      return
    }

    // 🔔 notifica ALTRI tab
    try { new BroadcastChannel('app-events').postMessage('settings-changed') } catch {}

    // 🔁 bump revision per forzare re-render immediato nel tab corrente
    setRevision(r => r + 1)
  }

  // Lettura unica DB + rispetta LS/override
  async function hydrateFromSources() {
    const { data, error } = await supabase
      .from('app_settings')
      .select(
        'language_code, currency, vat_enabled, vat_rate, default_markup_pct, default_markup_equipment_pct, materials_review_months, csv_require_confirm_refs, materials_exclusive_default, equipment_review_months, equipment_csv_require_confirm_refs, hr_review_frequency, hr_bonus_14th_base_years, hr_bonus_14th_steps, hr_bonus_pt_max_cap, hr_bonus_pt_target_hours, hr_bonus_pt_min_hours, hr_bonus_pt_min_rating, hr_bonus_14th_min_rating, hr_bonus_13th_guaranteed_pct, hr_bonus_13th_perf_pct, hr_bonus_13th_perf_tiers, crm_advisor_commission_pct, crm_commission_type, crm_commission_rules, crm_partner_rules, finance_start_date'
      )
      .eq('id', 'singleton')
      .maybeSingle()
    if (error) console.warn('Settings load error', error)

    const dbLang = data?.language_code === 'vi' ? 'vi' : 'en'
    
    // Respect user's local language selection if present in localStorage or cookies
    let activeLang: Lang = dbLang
    try {
      const match = document.cookie.match(/(?:^|; )app_lang=([^;]*)/)
      const cookieLang = match ? match[1] as Lang : null
      const lsLang = localStorage.getItem('app_lang') as Lang | null
      
      if (lsLang === 'en' || lsLang === 'vi') {
        activeLang = lsLang
      } else if (cookieLang === 'en' || cookieLang === 'vi') {
        activeLang = cookieLang
      }
    } catch {}

    // Applica lingua subito a <html lang> e salva in LS e cookie
    try {
      document.documentElement.lang = activeLang
      localStorage.setItem('app_lang', activeLang)
      document.cookie = `app_lang=${activeLang}; path=/; max-age=31536000; SameSite=Lax`
    } catch {}

    setLanguageState(activeLang)
    const curRaw = (data?.currency as Currency) ?? 'VND'
    const cur: Currency = (['VND', 'USD', 'EUR', 'GBP'] as const).includes(curRaw) ? curRaw : 'VND'
    setCurrencyState(cur)
    setVatEnabledState(toBool(data?.vat_enabled, false))

    const parsedRate = typeof data?.vat_rate === 'number' ? data.vat_rate : Number(data?.vat_rate)
    setVatRateState(Number.isFinite(parsedRate) ? clampPct(parsedRate) : 10)

    const parsedMarkupPct =
      typeof data?.default_markup_pct === 'number' ? data.default_markup_pct : Number(data?.default_markup_pct)
    setDefaultMarkupPctState(Number.isFinite(parsedMarkupPct) ? clampPct(parsedMarkupPct) : 30)

    const parsedCrmPct = typeof data?.crm_advisor_commission_pct === 'number' ? data.crm_advisor_commission_pct : Number(data?.crm_advisor_commission_pct)
    setCrmAdvisorCommissionPctState(Number.isFinite(parsedCrmPct) ? clampPct(parsedCrmPct) : 10)
    setCrmCommissionTypeState(data?.crm_commission_type || 'Acquisition + Maintenance')
    setCrmCommissionRulesState(data?.crm_commission_rules || { acquisition_pct: 10, maintenance_pct: 4 })
    const defaultPartnerRules = { has_commission: true, commission_type: 'Percentage', commission_value: 10, has_discount: false, client_discount_type: 'Percentage', client_discount_value: 0, commission_base: 'Before Discount', details: '', pit_threshold_vnd: 2000000 }
    setCrmPartnerRulesState(data?.crm_partner_rules ? { ...defaultPartnerRules, ...data.crm_partner_rules } : defaultPartnerRules)

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

    const hrFreqDb = data?.hr_review_frequency ? String(data.hr_review_frequency) : undefined
    if (data?.hr_bonus_14th_base_years !== undefined) {
      setHrBonus14thBaseYearsState(Number(data.hr_bonus_14th_base_years))
    }
    if (data?.hr_bonus_14th_steps) {
      const stepsData = data.hr_bonus_14th_steps as any[];
      // Migrate from old number[] format if necessary
      if (stepsData.length > 0 && typeof stepsData[0] === 'number') {
        const base = data.hr_bonus_14th_base_years !== undefined ? Number(data.hr_bonus_14th_base_years) : 3;
        setHrBonus14thStepsState(stepsData.map((val: number, idx: number) => ({ years: base + idx, pct: val })));
      } else {
        setHrBonus14thStepsState(stepsData);
      }
    }

    if (data?.hr_bonus_pt_max_cap !== undefined) setHrBonusPtMaxCapState(Number(data.hr_bonus_pt_max_cap))
    if (data?.hr_bonus_pt_target_hours !== undefined) setHrBonusPtTargetHoursState(Number(data.hr_bonus_pt_target_hours))
    if (data?.hr_bonus_pt_min_hours !== undefined) setHrBonusPtMinHoursState(Number(data.hr_bonus_pt_min_hours))
    if (data?.hr_bonus_pt_min_rating !== undefined) setHrBonusPtMinRatingState(Number(data.hr_bonus_pt_min_rating))
    if (data?.hr_bonus_14th_min_rating !== undefined) setHrBonus14thMinRatingState(Number(data.hr_bonus_14th_min_rating))
    if (data?.hr_bonus_13th_guaranteed_pct !== undefined) setHrBonus13thGuaranteedPctState(Number(data.hr_bonus_13th_guaranteed_pct))
    if (data?.hr_bonus_13th_perf_pct !== undefined) setHrBonus13thPerfPctState(Number(data.hr_bonus_13th_perf_pct))
    if (data?.hr_bonus_13th_perf_tiers !== undefined) setHrBonus13thPerfTiersState(data.hr_bonus_13th_perf_tiers as any)

    if (data?.finance_start_date !== undefined && data?.finance_start_date !== null) {
      setFinanceStartDateState(data.finance_start_date)
    }

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

      setHrReviewFrequencyState(hrFreqDb || 'Quarterly')
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
        if (e?.data === 'data-reset') {
          void reloadSettings(true)
        } else if (e?.data === 'settings-changed') {
          void reloadSettings(false)
        }
        if (e?.data?.type === 'lang' && (e.data.value === 'en' || e.data.value === 'vi')) {
          setLanguageState(e.data.value)
          try { document.documentElement.lang = e.data.value } catch {}
          try { localStorage.setItem('app_lang', e.data.value) } catch {}
        }
      }
    } catch {}

    // Listener diretto su window (stesso tab)
    const onSettingsChanged = () => { void reloadSettings(false) }
    window.addEventListener('settings-changed' as any, onSettingsChanged)

    return () => {
      mounted = false
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('settings-changed' as any, onSettingsChanged)
      try { bc?.close() } catch {}
    }
  }, [])

  // API pubblica per ricaricare tutto dopo un reset o aggiornamento
  const reloadSettings = async (isReset = false) => {
    setHydrated(false)
    if (isReset) {
      clearLocalSettings()
    }
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
      document.cookie = `app_lang=${l}; path=/; max-age=31536000; SameSite=Lax`
      new BroadcastChannel('app-events').postMessage({ type: 'lang', value: l })
    } catch {}
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

  function setHrReviewFrequency(v: string) {
    setHrReviewFrequencyState(v)
    void saveToDb({ hrReviewFrequency: v })
  }

  function setHrBonus14thBaseYears(n: number) {
    setHrBonus14thBaseYearsState(n)
    void saveToDb({ hrBonus14thBaseYears: n })
  }

  function setHrBonus14thSteps(s: { years: number, pct: number }[]) {
    setHrBonus14thStepsState(s)
    void saveToDb({ hrBonus14thSteps: s })
  }

  function setHrBonusPtMaxCap(n: number) {
    setHrBonusPtMaxCapState(n)
    void saveToDb({ hrBonusPtMaxCap: n })
  }

  function setHrBonusPtTargetHours(n: number) {
    setHrBonusPtTargetHoursState(n)
    void saveToDb({ hrBonusPtTargetHours: n })
  }

  function setHrBonusPtMinHours(n: number) {
    setHrBonusPtMinHoursState(n)
    void saveToDb({ hrBonusPtMinHours: n })
  }

  function setHrBonusPtMinRating(n: number) {
    setHrBonusPtMinRatingState(n)
    void saveToDb({ hrBonusPtMinRating: n })
  }

  function setHrBonus14thMinRating(n: number) {
    setHrBonus14thMinRatingState(n)
    void saveToDb({ hrBonus14thMinRating: n })
  }

  function setHrBonus13thGuaranteedPct(n: number) {
    setHrBonus13thGuaranteedPctState(n)
    void saveToDb({ hrBonus13thGuaranteedPct: n })
  }

  function setHrBonus13thPerfPct(n: number) {
    setHrBonus13thPerfPctState(n)
    void saveToDb({ hrBonus13thPerfPct: n })
  }

  function setHrBonus13thPerfTiers(t: { min_rating: number, multiplier_pct: number }[]) {
    setHrBonus13thPerfTiersState(t)
    void saveToDb({ hrBonus13thPerfTiers: t })
  }

  function setCrmAdvisorCommissionPct(p: number) {
    setCrmAdvisorCommissionPctState(p)
    void saveToDb({ crmAdvisorCommissionPct: p })
  }
  function setCrmCommissionType(t: string) {
    setCrmCommissionTypeState(t)
    void saveToDb({ crmCommissionType: t })
  }
  function setCrmCommissionRules(r: any) {
    setCrmCommissionRulesState(r)
    void saveToDb({ crmCommissionRules: r })
  }

  function setCrmPartnerRules(r: any) {
    setCrmPartnerRulesState(r)
    void saveToDb({ crmPartnerRules: r })
  }

  function saveAllCrmSettings(type: string, rules: any, partnerRules: any) {
    setCrmCommissionTypeState(type)
    setCrmCommissionRulesState(rules)
    setCrmPartnerRulesState(partnerRules)
    void saveToDb({
      crmCommissionType: type,
      crmCommissionRules: rules,
      crmPartnerRules: partnerRules
    })
  }

  function setFinanceStartDate(d: string) {
    setFinanceStartDateState(d)
    void saveToDb({ financeStartDate: d })
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

        hrReviewFrequency,
        setHrReviewFrequency,

        hrBonus14thBaseYears,
        setHrBonus14thBaseYears,
        hrBonus14thSteps,
        setHrBonus14thSteps,

        hrBonusPtMaxCap,
        setHrBonusPtMaxCap,
        hrBonusPtTargetHours,
        setHrBonusPtTargetHours,
        hrBonusPtMinHours,
        setHrBonusPtMinHours,

        hrBonusPtMinRating,
        setHrBonusPtMinRating,
        hrBonus14thMinRating,
        setHrBonus14thMinRating,
        hrBonus13thGuaranteedPct,
        setHrBonus13thGuaranteedPct,
        hrBonus13thPerfPct,
        setHrBonus13thPerfPct,
        hrBonus13thPerfTiers,
        setHrBonus13thPerfTiers,

        crmAdvisorCommissionPct,
        setCrmAdvisorCommissionPct,
        crmCommissionType,
        setCrmCommissionType,
        crmCommissionRules,
        setCrmCommissionRules,

        crmPartnerRules,
        setCrmPartnerRules,
        saveAllCrmSettings,

        financeStartDate,
        setFinanceStartDate,

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
