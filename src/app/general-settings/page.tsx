// app/general-settings/page.tsx
'use client'

import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { DailyReportsCard } from './dailyreports'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'

export default function GeneralSettingsIndexPage() {
  const { language } = useSettings()

  return (
    <div className="max-w-7xl mx-auto p-4 text-gray-100">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{t(language, 'GeneralSettingsTitle')}</h1>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"  // <- come nella left nav
            className="h-10 px-3 rounded-lg border border-white/20 text-white hover:bg-white/10 inline-flex items-center gap-2"
            title={t(language, 'GeneralSettingsBackTitle')}
            aria-label={t(language, 'GeneralSettingsBackTitle')}
            prefetch
          >
            <ArrowLeftIcon className="w-5 h-5" />
            <span>{t(language, 'Dashboard')}</span>
          </Link>
        </div>
      </div>

      {/* Card Daily Reports inline nell'index */}
      <div className="space-y-6">
        <DailyReportsCard />
      </div>
    </div>
  )
}
