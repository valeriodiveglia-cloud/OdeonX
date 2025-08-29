'use client';

import Papa from 'papaparse';
import { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUom } from '@/lib/normalizeUom';

export type CsvRow = {
  name: string;
  category: string;
  brand?: string | null;
  supplier: string;
  uom: string;
  package_qty?: string | number | null;
  package_price?: string | number | null;
  unit_cost?: string | number | null;
  notes?: string | null;
};

export type ExistingSets = {
  categories: { id: number; name: string }[];
  suppliers: { id: string; name: string }[];
  uoms: { id: number; name: 'gr'|'ml'|'unit' }[];
};

export type PendingNew = { categories: string[]; suppliers: string[] };
export type ResolveResult = {
  categoryMap: Record<string, number>;
  supplierMap: Record<string, string>;
};

function moneyToNumber(raw: string | number | null | undefined) {
  if (raw == null) return null;
  return Number(String(raw).replace(/\s+/g, '').replace(/,/g, ''));
}

// normalizza chiavi header, rimuove BOM e spazi
function normKey(k: string) {
  return String(k || '')
    .replace(/^\uFEFF/, '')         // ← rimuove BOM
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// mappa tollerante per il tuo template
const headerMap: Record<string, string> = {
  'ingredient': 'name',
  'category': 'category',
  'supplier': 'supplier',
  'brand': 'brand',
  'package qty': 'package_qty',
  'uom': 'uom',
  'package cost': 'package_price',
  'status': '__ignore__',
  'notes': 'notes',
  // alternative già compatibili
  'name': 'name',
  'package_qty': 'package_qty',
  'package_price': 'package_price',
  'unit_cost': 'unit_cost',
};

export async function importMaterialsCsv(
  supabase: SupabaseClient,
  file: File,
  getExisting: () => Promise<ExistingSets>,
  resolveNewValues: (pending: PendingNew, existing: ExistingSets) => Promise<ResolveResult>,
  onProgress?: (pct: number) => void
): Promise<{ inserted: number; updated: number; skipped: number }> {

  const { categories, suppliers, uoms } = await getExisting();

  // 1) Parse CSV con trasformazione header
  const parsed = await new Promise<Papa.ParseResult<Record<string, any>>>((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => headerMap[normKey(h)] ?? normKey(h),
      complete: res => resolve(res),
      error: reject,
    });
  });

  // adatta le righe al nostro schema
  const rows: CsvRow[] = (parsed.data || []).map(r => ({
    name: String(r['name'] ?? '').trim(),
    category: String(r['category'] ?? '').trim(),
    brand: r['brand'] != null ? String(r['brand']).trim() : null,
    supplier: String(r['supplier'] ?? '').trim(),
    uom: String(r['uom'] ?? '').trim(),
    package_qty: r['package_qty'] ?? null,
    package_price: r['package_price'] ?? null,
    unit_cost: r['unit_cost'] ?? null,
    notes: r['notes'] ?? null,
  })).filter(r => r.name || r.category || r.supplier);

  if (!rows.length) {
    throw new Error('CSV appears empty or headers not recognized. Expected columns like: Ingredient, Category, Supplier, Brand, Package QTY, UOM, Package Cost');
  }

  // 2) Nuovi category/supplier
  const uniqLower = (a: string[]) => [...new Set(a.filter(Boolean).map(s => s.trim().toLowerCase()))];
  const csvCats = uniqLower(rows.map(r => r.category || ''));
  const csvSups = uniqLower(rows.map(r => r.supplier || ''));

  const existingCatNames = categories.map(c => c.name.toLowerCase());
  const existingSupNames = suppliers.map(s => s.name.toLowerCase());

  const pending: PendingNew = {
    categories: csvCats.filter(n => n && !existingCatNames.includes(n)),
    suppliers: csvSups.filter(n => n && !existingSupNames.includes(n)),
  };

  const resolved = await resolveNewValues(pending, { categories, suppliers, uoms });

  // 3) Lookup maps
  const catByName = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));
  const supByName = new Map(suppliers.map(s => [s.name.toLowerCase(), s.id]));
  const uomByName = new Map(uoms.map(u => [u.name as string, u.id]));

  Object.entries(resolved.categoryMap).forEach(([k, id]) => catByName.set(k.toLowerCase(), id));
  Object.entries(resolved.supplierMap).forEach(([k, id]) => supByName.set(k.toLowerCase(), id));

  // 4) Upsert
  let done = 0, inserted = 0, updated = 0, skipped = 0;

  for (const r of rows) {
    const name = (r.name || '').trim();
    const brand = (r.brand || '')?.trim() || null;
    const supplierName = (r.supplier || '').trim().toLowerCase();
    const categoryName = (r.category || '').trim().toLowerCase();

    if (!name || !supplierName || !categoryName) {
      skipped++; done++; onProgress?.(Math.round((done / rows.length) * 100)); continue;
    }

    // UOM normalizzato -> id esistente
    const norm = normalizeUom(String(r.uom || 'unit'));
    const uomId = uomByName.get(norm.uom);
    if (!uomId) throw new Error(`Missing UOM in DB for ${norm.uom}. Add 'gr','ml','unit'.`);

    const category_id = catByName.get(categoryName);
    const supplier_id = supByName.get(supplierName);
    if (!category_id || !supplier_id) throw new Error('Category or Supplier unresolved');

    const pkgQtyRaw = r.package_qty != null ? Number(r.package_qty) : null;
    const package_price = moneyToNumber(r.package_price);
    const packaging_size = pkgQtyRaw != null ? pkgQtyRaw * norm.factor : null;

    let unit_cost = moneyToNumber(r.unit_cost);
    if (unit_cost == null && package_price != null && pkgQtyRaw != null && pkgQtyRaw > 0) {
      const denom = pkgQtyRaw * norm.factor;
      unit_cost = denom > 0 ? package_price / denom : null;
    }

    const payload = {
      name,
      brand,
      supplier_id,
      category_id,
      uom_id: uomId,
      packaging_size,
      package_price,
      unit_cost,
      notes: r.notes || null,
      last_update: new Date().toISOString(),
      is_food_drink: true,
      is_default: true,
    };

    const { data: existing, error: selErr } = await supabase
      .from('materials')
      .select('id, name, brand, supplier_id')
      .eq('supplier_id', supplier_id)
      .ilike('name', name)
      .ilike('brand', brand ?? '')
      .maybeSingle();

    if (selErr) throw selErr;

    if (existing) {
      const { error } = await supabase.from('materials').update(payload).eq('id', existing.id);
      if (error) throw error;
      updated++;
    } else {
      const { error } = await supabase.from('materials').insert(payload);
      if (error) throw error;
      inserted++;
    }

    done++;
    onProgress?.(Math.round((done / rows.length) * 100));
  }

  return { inserted, updated, skipped };
}
