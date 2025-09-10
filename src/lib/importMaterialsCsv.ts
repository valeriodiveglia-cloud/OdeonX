import Papa from 'papaparse'
import type { ParseResult } from 'papaparse'

'use client'

import { SupabaseClient } from '@supabase/supabase-js'
import { normalizeUom } from '@/lib/normalizeUom'

export type CsvRow = {
  name: string
  category: string
  brand?: string | null
  supplier: string
  uom: string
  packaging_size?: string | number | null
  package_price?: string | number | null
  vat_rate_percent?: string | number | null
}

export type ExistingSets = {
  categories: { id: number; name: string }[]
  suppliers: { id: string; name: string }[]
  uoms: { id: number; name: string }[] // lasciamo string: in DB può essere "g", "pz", ecc.
}

export type PendingNew = { categories: string[]; suppliers: string[] }
export type ResolveResult = {
  categoryMap: Record<string, number>
  supplierMap: Record<string, string>
}

function strToNumber(raw: string | number | null | undefined) {
  if (raw == null) return null
  const s = String(raw).replace(/\s+/g, '').replace(/,/g, '')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function normKey(k: string) {
  return String(k || '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const headerMap: Record<string, string> = {
  'name': 'name',
  'ingredient': 'name',
  'category': 'category',
  'brand': 'brand',
  'supplier': 'supplier',
  'uom': 'uom',
  'packaging size': 'packaging_size',
  'packaging_size': 'packaging_size',
  'package cost': 'package_price',
  'package_cost': 'package_price',
  'vat rate (%)': 'vat_rate_percent',
  'vat rate': 'vat_rate_percent',
  'vat_rate_percent': 'vat_rate_percent',

  // vecchi, da ignorare
  'status': '__ignore__',
  'notes': '__ignore__',
  'package qty': '__ignore__',
  'package_qty': '__ignore__',
  'unit cost': '__ignore__',
  'unit_cost': '__ignore__',
}

/** Assicura che nel DB esistano le canoniche 'gr','ml','unit' e
 *  costruisce una mappa tollerante alias→id basata su normalizeUom(nameDB).
 */
async function ensureCanonicalUoms(
  supabase: SupabaseClient,
  existingUoms: { id: number; name: string }[],
) {
  // quali canoniche copriamo già con i nomi esistenti?
  const have = new Set<'gr' | 'ml' | 'unit'>()
  for (const u of existingUoms) {
    const { uom } = normalizeUom(String(u.name))
    have.add(uom)
  }
  const needed = (['gr', 'ml', 'unit'] as const).filter(c => !have.has(c))

  let inserted: { id: number; name: string }[] = []
  if (needed.length) {
    const { data, error } = await supabase
      .from('uom')
      .insert(needed.map(n => ({ name: n })))
      .select('id, name')
    if (error) throw new Error(`Impossibile creare UOM mancanti (${needed.join(', ')}): ${error.message}`)
    inserted = data || []
  }

  const all = [...existingUoms, ...inserted]

  // Mappa “alias” → id, usando normalizeUom anche sui nomi DB
  const uomByAlias = new Map<'gr' | 'ml' | 'unit', number>()
  for (const u of all) {
    const { uom } = normalizeUom(String(u.name))
    // la prima occorrenza vince, ma in pratica tutte le alias di uno stesso gruppo convergono
    if (!uomByAlias.has(uom)) uomByAlias.set(uom, u.id)
  }
  return uomByAlias
}

export async function importMaterialsCsv(
  supabase: SupabaseClient,
  file: File,
  getExisting: () => Promise<ExistingSets>,
  resolveNewValues: (pending: PendingNew, existing: ExistingSets) => Promise<ResolveResult>,
  onProgress?: (pct: number) => void
): Promise<{ inserted: number; updated: number; skipped: number }> {
  const { categories, suppliers, uoms } = await getExisting()

  // parse CSV
  const parsed = await new Promise<ParseResult<CsvRow>>((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => headerMap[normKey(h)] ?? normKey(h),
      complete: (res) => resolve(res),
      error: (err) => reject(err),
    })
  })

  const rows: CsvRow[] = (parsed.data || [])
    .map((r: any) => ({
      name: String(r['name'] ?? '').trim(),
      category: String(r['category'] ?? '').trim(),
      brand: r['brand'] != null ? String(r['brand']).trim() : null,
      supplier: String(r['supplier'] ?? '').trim(),
      uom: String(r['uom'] ?? '').trim(),
      packaging_size: r['packaging_size'] ?? null,
      package_price: r['package_price'] ?? null,
      vat_rate_percent: r['vat_rate_percent'] ?? null,
    }))
    .filter((r) => r.name || r.category || r.supplier)

  if (!rows.length) {
    throw new Error(
      'CSV vuoto o intestazioni non riconosciute. Attese: Name, Category, Brand, Supplier, UOM, Packaging Size, Package Cost, VAT Rate (%)'
    )
  }

  // pending nuovi category/supplier
  const uniqLower = (a: string[]) => [...new Set(a.filter(Boolean).map((s) => s.trim().toLowerCase()))]
  const csvCats = uniqLower(rows.map((r) => r.category || ''))
  const csvSups = uniqLower(rows.map((r) => r.supplier || ''))

  const existingCatNames = categories.map((c) => c.name.toLowerCase())
  const existingSupNames = suppliers.map((s) => s.name.toLowerCase())

  const pending: PendingNew = {
    categories: csvCats.filter((n) => n && !existingCatNames.includes(n)),
    suppliers: csvSups.filter((n) => n && !existingSupNames.includes(n)),
  }

  const resolved = await resolveNewValues(pending, { categories, suppliers, uoms })

  // === UOM: garantisci canoniche e costruisci mappa alias→id ===
  const uomByAlias = await ensureCanonicalUoms(supabase, uoms)

  // lookup maps per category/supplier (inclusi quelli risolti)
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))
  const supByName = new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id]))

  Object.entries(resolved.categoryMap).forEach(([k, id]) => catByName.set(k.toLowerCase(), id))
  Object.entries(resolved.supplierMap).forEach(([k, id]) => supByName.set(k.toLowerCase(), id))

  // upsert
  let done = 0,
    inserted = 0,
    updated = 0,
    skipped = 0

  for (const r of rows) {
    const name = (r.name || '').trim()
    const brand = (r.brand || '')?.trim() || null
    const supplierName = (r.supplier || '').trim().toLowerCase()
    const categoryName = (r.category || '').trim().toLowerCase()

    if (!name || !supplierName || !categoryName) {
      skipped++
      done++
      onProgress?.(Math.round((done / rows.length) * 100))
      continue
    }

    // Normalizza UOM dal CSV e risolvi id canonico. Applica anche il factor al packaging_size.
    const norm = normalizeUom(String(r.uom || 'unit')) // → { uom: 'gr'|'ml'|'unit', factor }
    const uomId = uomByAlias.get(norm.uom)
    if (!uomId) {
      throw new Error(`UOM non trovata o non creabile: ${norm.uom}`)
    }

    const category_id = catByName.get(categoryName)
    const supplier_id = supByName.get(supplierName)
    if (!category_id || !supplier_id) {
      throw new Error(`Category/Supplier non risolti per riga: "${name}"`)
    }

    // Numerici + factor
    const raw_pack_size = strToNumber(r.packaging_size)
    const packaging_size = raw_pack_size != null ? raw_pack_size * norm.factor : null
    const package_price = strToNumber(r.package_price)
    const vat_rate_percent = strToNumber(r.vat_rate_percent)

    let unit_cost: number | null = null
    if (package_price != null && packaging_size != null && packaging_size > 0) {
      unit_cost = package_price / packaging_size
    }

    const payload: any = {
      name,
      brand,
      supplier_id,
      category_id,
      uom_id: uomId,
      packaging_size, // ora nella base-unit corrispondente alla UOM canonica
      package_price,
      unit_cost,
      vat_rate_percent: vat_rate_percent != null ? Math.max(0, Math.min(100, vat_rate_percent)) : null,
      last_update: new Date().toISOString(),
      is_food_drink: true,
      is_default: true,
    }

    // match esistente per supplier+name+brand (case-insensitive); se brand è null usiamo stringa vuota
    const { data: existing, error: selErr } = await supabase
      .from('materials')
      .select('id, name, brand, supplier_id')
      .eq('supplier_id', supplier_id)
      .ilike('name', name)
      .ilike('brand', brand ?? '')
      .maybeSingle()

    if (selErr) throw selErr

    if (existing) {
      const { error } = await supabase.from('materials').update(payload).eq('id', existing.id)
      if (error) throw error
      updated++
    } else {
      const { error } = await supabase.from('materials').insert(payload)
      if (error) throw error
      inserted++
    }

    done++
    onProgress?.(Math.round((done / rows.length) * 100))
  }

  return { inserted, updated, skipped }
}
