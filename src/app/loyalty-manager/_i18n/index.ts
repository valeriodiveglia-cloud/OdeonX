
import en from './dictionaries/en'
import vi from './dictionaries/vi'

export type LoyaltyManagerDictionary = typeof en

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

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

const dictionaries: Record<string, Partial<LoyaltyManagerDictionary>> = {
    en,
    vi,
}

export function getLoyaltyManagerDictionary(lang: string): LoyaltyManagerDictionary {
    const code = (lang || 'en').toLowerCase()
    const dict = code.startsWith('vi') ? dictionaries.vi : dictionaries.en
    return mergeWithFallback(en, dict)
}
