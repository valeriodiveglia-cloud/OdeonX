// app/daily-reports/_i18n/index.ts

import en from './dictionaries/en'
import vi from './dictionaries/vi'

export type DailyReportsDictionary = typeof en

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Merge ricorsivo: usa en come base e sovrascrive solo le chiavi presenti nella lingua scelta.
function mergeWithFallback<T>(base: T, override?: Partial<T>): T {
  if (!override) return base
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) }
  for (const key of Object.keys(override)) {
    const bVal = (base as any)[key]
    const oVal = (override as any)[key]
    if (oVal == null) continue
    if (isPlainObject(bVal) && isPlainObject(oVal)) {
      out[key] = mergeWithFallback(bVal, oVal)
    } else {
      out[key] = oVal
    }
  }
  return out
}

// Mappa lingue disponibili (possono essere parziali, completiamo con en)
const dictionaries: Record<string, Partial<DailyReportsDictionary>> = {
  en,
  vi,
}

// Loader principale
export function getDailyReportsDictionary(lang: string): DailyReportsDictionary {
  const code = (lang || 'en').toLowerCase()

  const dict = code.startsWith('vi') ? dictionaries.vi : dictionaries.en
  return mergeWithFallback(en, dict)
}

// Alias comodo per ottenere il dizionario già pronto
export function drI18n(lang: string): DailyReportsDictionary {
  return getDailyReportsDictionary(lang)
}

export default dictionaries
