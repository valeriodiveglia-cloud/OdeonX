'use client'
import { useMemo } from 'react'
import { useSettings } from '@/contexts/SettingsContext'
import en, { type ECKeys } from './dictionaries/en'
import vi from './dictionaries/vi'
// import it from './dictionaries/it'

const DICTS: Record<string, Record<ECKeys, string>> = { en, vi /*, it*/ }

export function useECT() {
  const { language } = useSettings()
  const dict = useMemo(() => DICTS[language] ?? en, [language])

  return (key: ECKeys, fallback?: string) => {
    const val = dict[key]
    if (process.env.NODE_ENV !== 'production' && val == null) {
      // Avviso solo in dev: ti aiuta a non perdere stringhe
      // eslint-disable-next-line no-console
      console.warn(`[EC i18n] missing key "${key}" for lang "${language}"`)
    }
    return val ?? fallback ?? (en as Record<ECKeys, string>)[key] ?? String(key)
  }
}
