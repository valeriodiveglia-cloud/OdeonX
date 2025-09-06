// src/app/settings/page.tsx
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import SettingsClient, { type AppSettingsUI } from './settings-client'
import { toBool } from '@/lib/normalize' // <-- server-safe

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TBL_APP = 'app_settings'

export default async function SettingsPage() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},   // no-op in RSC
        remove: () => {},// no-op in RSC
      },
    }
  )

  type Row = {
    id: 'singleton'
    restaurant_name: string
    company_name: string
    address: string
    tax_code: string
    phone: string
    email: string
    website: string
    logo_mime: string | null
    logo_data: string | null
    language_code: 'en' | 'vi'
    currency: 'VND' | 'USD' | 'EUR' | 'GBP'
    vat_enabled: boolean | string | number | null
    vat_rate: number | null
    default_markup_equipment_pct: number | null
    default_markup_recipes_pct: number | null
    materials_review_months: number
    csv_require_confirm_refs: boolean | string | number | null
    materials_exclusive_default: boolean | string | number | null
    equipment_review_months: number
    equipment_csv_require_confirm_refs: boolean | string | number | null
    recipes_review_months: number
    recipes_split_mode: 'split' | 'single'
    recipes_tab1_name: string
    recipes_tab2_name: string | null
    updated_at?: string | null
  }

  const DEFAULTS: AppSettingsUI = {
    restaurant_name: '',
    company_name: '',
    address: '',
    tax_code: '',
    phone: '',
    email: '',
    website: '',
    logo_mime: null,
    logo_data: null,
    language_code: 'en',
    currency: 'VND',
    vat_enabled: false,
    vat_rate: 10,
    default_markup_equipment_pct: 30,
    default_markup_recipes_pct: 30,
    materials_review_months: 4,
    csv_require_confirm_refs: true,
    materials_exclusive_default: true,
    equipment_review_months: 4,
    equipment_csv_require_confirm_refs: true,
    recipes_review_months: 4,
    recipes_split_mode: 'split',
    recipes_tab1_name: 'Final',
    recipes_tab2_name: 'Prep',
  }

  const { data, error } = await supabase
    .from<Row>(TBL_APP)
    .select('*')
    .eq('id', 'singleton')
    .maybeSingle()

  const initial: AppSettingsUI = error || !data
    ? DEFAULTS
    : {
        ...DEFAULTS,
        ...data,

        vat_rate:
          data.vat_rate == null
            ? DEFAULTS.vat_rate
            : Math.min(100, Math.max(0, Math.round(data.vat_rate))),
        materials_review_months: Math.min(12, Math.max(0, Math.round(data.materials_review_months))),
        equipment_review_months: Math.min(12, Math.max(0, Math.round(data.equipment_review_months))),
        recipes_review_months: Math.min(12, Math.max(0, Math.round(data.recipes_review_months))),

        vat_enabled: toBool(data.vat_enabled, DEFAULTS.vat_enabled),
        csv_require_confirm_refs: toBool(
          data.csv_require_confirm_refs,
          DEFAULTS.csv_require_confirm_refs
        ),
        materials_exclusive_default: toBool(
          data.materials_exclusive_default,
          DEFAULTS.materials_exclusive_default
        ),
        equipment_csv_require_confirm_refs: toBool(
          data.equipment_csv_require_confirm_refs,
          DEFAULTS.equipment_csv_require_confirm_refs
        ),
      }

  return <SettingsClient initial={initial} />
}
