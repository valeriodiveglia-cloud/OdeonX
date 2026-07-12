// app/daily-reports/dailyreportsettings/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import SettingsInitialInfoCard from './SettingsInitialInfoCard'
import SettingsCashCountCard from './SettingsCashCountCard'
import SettingsCashOutCard from './SettingsCashOut'
import { useSettings } from '@/contexts/SettingsContext'
import { drI18n } from '../_i18n'
import { DailyReportSettingsProvider, useDailyReportSettingsContext } from '../_data/DailyReportSettingsContext'
import { useBranchUnified } from '../_data/useBranchUnified'
import PageHeader from '@/components/PageHeader'
import Button from '@/components/Button'

export default function DailyReportSettingsPage() {
  return (
    <DailyReportSettingsProvider>
      <DailyReportSettingsContent />
    </DailyReportSettingsProvider>
  )
}

function DailyReportSettingsContent() {
  const [dirtySections, setDirtySections] = useState<Record<string, boolean>>({})
  const savingRef = useRef(false)
  const [activeTab, setActiveTab] = useState<'closing' | 'cashout'>('closing')

  const { loading, error, saveAll, refresh, isDirty: contextDirty } = useDailyReportSettingsContext()
  const { language } = useSettings()
  const { name: branchName } = useBranchUnified()
  const t = drI18n(language).dailyreportsettings

  const textDict = {
    en: {
      tabClosing: 'Cashier & Closing',
      tabCashOut: 'Cash Out',
    },
    vi: {
      tabClosing: 'Thu ngân & Chốt ca',
      tabCashOut: 'Chi tiền',
    }
  }

  const labels = textDict[language === 'vi' ? 'vi' : 'en']

  useEffect(() => {
    const onDirty = (e: Event) => {
      const de = e as CustomEvent<{ section: string; dirty: boolean }>
      setDirtySections(s => ({ ...s, [de.detail.section]: de.detail.dirty }))
    }
    window.addEventListener('dailysettings:dirty', onDirty as EventListener)
    return () => {
      window.removeEventListener('dailysettings:dirty', onDirty as EventListener)
    }
  }, [])

  const anyDirty = Object.values(dirtySections).some(Boolean) || contextDirty

  function emit(name: string) {
    try {
      window.dispatchEvent(new CustomEvent(name))
    } catch { }
  }

  async function handleSaveAll() {
    if (savingRef.current || loading) return
    savingRef.current = true

    // Trigger local updates in cards (they update context draft)
    emit('dailysettings:save')
    await new Promise(r => setTimeout(r, 150))

    try {
      await saveAll()
      await refresh()
      window.dispatchEvent(
        new CustomEvent('dailysettings:saved', { detail: { section: 'all', ok: true } }),
      )
      setDirtySections({})
    } catch {
      window.dispatchEvent(
        new CustomEvent('dailysettings:saved', { detail: { section: 'all', ok: false } }),
      )
    } finally {
      savingRef.current = false
    }
  }

  async function handleReload() {
    await refresh()
    setDirtySections({})
    emit('dailysettings:reload')
  }

  function handleDefaults() {
    emit('dailysettings:reset-to-defaults')
    setDirtySections({ cashcount: true, initialinfo: true, cashout: true })
  }

  return (
    <div className="max-w-7xl mx-auto p-4 text-gray-100">
      <PageHeader
        title={t.pageTitle}
        badgeText={branchName || t.branch.none}
        badgeLoading={loading}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary-dark"
              onClick={handleDefaults}
              disabled={loading}
              title={t.actions.resetTitle}
              className="h-9 px-3 text-xs font-semibold"
            >
              {t.actions.reset}
            </Button>
            <Button
              variant="secondary-dark"
              onClick={handleReload}
              disabled={loading}
              title={t.actions.reloadTitle}
              className="h-9 px-3 text-xs font-semibold"
            >
              {t.actions.reload}
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveAll}
              disabled={!anyDirty || loading}
              title={t.actions.saveAllTitle}
              className="h-9 px-3 text-xs font-semibold"
            >
              {t.actions.saveAll}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-3 rounded-xl border border-red-300 bg-red-50 text-red-800 px-3 py-2 text-sm">
          {t.errors.loadFailed}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800/80 mb-6 gap-6 px-2">
        <button
          type="button"
          onClick={() => setActiveTab('closing')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'closing'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          {labels.tabClosing}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('cashout')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'cashout'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          {labels.tabCashOut}
        </button>
      </div>

      {activeTab === 'closing' ? (
        <div className="space-y-6">
          <SettingsInitialInfoCard t={t.initialInfo} />
          <SettingsCashCountCard t={t.cashCount} />
        </div>
      ) : (
        <div className="space-y-6">
          <SettingsCashOutCard t={t.cashOut} />
        </div>
      )}
    </div>
  )
}

