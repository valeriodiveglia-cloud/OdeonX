'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { DailyReportsCard } from './dailyreports'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
import PageHeader from '@/components/PageHeader'
import Button from '@/components/Button'

export default function GeneralSettingsIndexPage() {
  const { language } = useSettings()
  const [hasCurrent, setHasCurrent] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const handleStateChange = (e: Event) => {
      const customEvent = e as CustomEvent
      if (customEvent.detail) {
        setHasCurrent(!!customEvent.detail.hasCurrent)
        setSaving(!!customEvent.detail.saving)
      }
    }
    window.addEventListener('generalsettings:state-change', handleStateChange)
    return () => window.removeEventListener('generalsettings:state-change', handleStateChange)
  }, [])

  return (
    <div className="max-w-7xl mx-auto p-4 text-gray-100">
      <PageHeader
        title={t(language, 'GeneralSettingsTitle')}
        subtitle={
          language === 'vi'
            ? 'Quản lý các chi nhánh nhà cung cấp và thông tin tài khoản ngân hàng liên kết'
            : 'Manage provider branches and linked bank account details'
        }
        left={
          <Link
            href="/dashboard"
            prefetch
            className="p-2 rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition shrink-0"
            title={t(language, 'GeneralSettingsBackTitle')}
            aria-label={t(language, 'GeneralSettingsBackTitle')}
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
        }
        actions={
          hasCurrent && (
            <Button
              variant="primary"
              onClick={() => window.dispatchEvent(new CustomEvent('generalsettings:trigger-save'))}
              disabled={saving}
              loading={saving}
            >
              {t(language, 'Save')}
            </Button>
          )
        }
      />

      {/* Card Daily Reports inline nell'index */}
      <div className="space-y-6">
        <DailyReportsCard />
      </div>
    </div>
  )
}
