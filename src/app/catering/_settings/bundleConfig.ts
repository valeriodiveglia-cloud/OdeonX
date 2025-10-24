// src/app/event-calculator/_settings/bundleConfig.ts
/**
 * CHANGELOG 2025-09-25
 * - catKey: normalizzazione forte (lowercase, rimozione accenti, simboli → '-')
 * - catAllowed: confronto su chiave normalizzata (supporta 'Any' e '*')
 * - Tipi invariati; getMarkupX invariato
 */

export type Id = string;

export const ANY = 'Any';
export const MAX_MODS = 5;

/* ---- Types ---- */
export type ModifierSlotCfg = {
  label: string;
  categories: string[]; // allowed categories (può contenere 'Any' o '*', stringhe libere, slug, name_key)
  required?: boolean;
};

export type BundleConfig = {
  label: string;
  maxModifiers: number;             // 0..MAX_MODS
  dishCategories: string[];         // allowed dish categories
  modifierSlots: ModifierSlotCfg[]; // fino a MAX_MODS
  /** Moltiplicatore di markup per il prezzo (es. 1.5 = +50% sul costo). */
  markupX?: number;                 // opzionale: se assente, la UI usa 1
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
};

type ItemWithCategory = { category_name: string | null };

/** Normalizza etichette categoria e configurazioni (equivale a uno slug robusto). */
export function catKey(s?: string | null): string {
  if (!s) return '';
  // rimuove accenti, abbassa, comprime ogni non alfanumerico a '-'
  const noAccents = s.normalize?.('NFD').replace?.(/\p{Diacritic}/gu, '') ?? s;
  return noAccents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ---- Helpers shared by pages ---- */
export function catAllowed(allowed: string[] | undefined, cat: string | null) {
  if (!allowed || allowed.length === 0) return false;

  // normalizzo tutte le stringhe in input
  const allowedKeys = new Set(allowed.map(catKey));
  if (allowedKeys.has(catKey(ANY)) || allowedKeys.has('*')) return true;

  const c = catKey(cat);
  if (!c) return false;

  // match esatto sulla chiave normalizzata (copre sia name che name_key)
  return allowedKeys.has(c);
}

export function dishAllowedByCfg(cfg: BundleConfig, d: ItemWithCategory) {
  return catAllowed(cfg.dishCategories, d.category_name);
}

export function modifierAllowedByCfg(cfg: BundleConfig, slotIndex: number, d: ItemWithCategory) {
  const slot = cfg.modifierSlots?.[slotIndex];
  if (!slot) return false;
  return catAllowed(slot.categories, d.category_name);
}

export function effectiveLimit(cfg?: BundleConfig | null) {
  if (!cfg) return 0;
  const max = Number.isFinite(cfg.maxModifiers) ? cfg.maxModifiers : 0;
  const slots = Array.isArray(cfg.modifierSlots) ? cfg.modifierSlots.length : 0;
  return Math.min(max, slots, MAX_MODS);
}

/** Restituisce il moltiplicatore markup valido. Fallback 1. Supporta anche 'markup' legacy. */
export function getMarkupX(cfg?: BundleConfig | null): number {
  if (!cfg) return 1;
  const raw = (cfg.markupX ?? (cfg as any).markup);
  const x = typeof raw === 'number' && raw > 0 ? raw : 1;
  return x;
}

/* Utility utile a /eventsettings per creare nuove chiavi */
export function slugifyLabel(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `bundle-${Date.now()}`;
}
