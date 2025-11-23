// app/daily-reports/dailyreportsettings/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import SettingsInitialInfoCard from './SettingsInitialInfoCard'
import SettingsCashCountCard from './SettingsCashCountCard'
import SettingsCashOutCard from './SettingsCashOut'
import { useDailyReportSettings } from '../_data/useDailyReportSettings'
import { useSettings } from '@/contexts/SettingsContext'
import { drI18n } from '../_i18n'

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-gray-200 bg-white text-gray-900 shadow">{children}</div>
}
function CardHeader({ title, right, after }: { title: string; right?: React.ReactNode; after?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {after}
        </div>
        <div className="flex items-center gap-2">{right}</div>
      </div>
      <div className="mt-3 border-t border-white/15" />
    </div>
  )
}

export default function DailyReportSettingsPage() {
  const [dirtySections, setDirtySections] = useState<Record<string, boolean>>({})
  const savingRef = useRef(false)

  const { loading, error, branchName, refresh } = useDailyReportSettings()
  const { language } = useSettings()
  const t = drI18n(language).dailyreportsettings

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

  const anyDirty = Object.values(dirtySections).some(Boolean)

  function emit(name: string) {
    try {
      window.dispatchEvent(new CustomEvent(name))
    } catch {}
  }

  async function handleSaveAll() {
    if (savingRef.current || loading) return
    savingRef.current = true

    emit('dailysettings:save')
    await new Promise(r => setTimeout(r, 150))

    try {
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
      <CardHeader
        title={t.pageTitle}
        after={
          <div
            className="hidden md:inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-600/15 px-3 py-1 text-xs text-blue-100"
            title={t.branch.tooltip}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                loading ? 'bg-yellow-400' : 'bg-green-400'
              }`}
            />
            <span className="font-medium">{branchName || t.branch.none}</span>
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDefaults}
              disabled={loading}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border border-blue-400/30
                         ${
                           loading
                             ? 'bg-blue-600/10 text-blue-300 cursor-not-allowed'
                             : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25'
                         }`}
              title={t.actions.resetTitle}
            >
              {t.actions.reset}
            </button>
            <button
              type="button"
              onClick={handleReload}
              disabled={loading}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg border border-blue-400/30
                         ${
                           loading
                             ? 'bg-blue-600/10 text-blue-300 cursor-not-allowed'
                             : 'bg-blue-600/15 text-blue-200 hover:bg-blue-600/25'
                         }`}
              title={t.actions.reloadTitle}
            >
              {t.actions.reload}
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={!anyDirty || loading}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg ${
                anyDirty && !loading
                  ? 'bg-blue-600 text-white hover:opacity-80'
                  : 'bg-blue-600/15 text-blue-200 border border-blue-400/30 cursor-not-allowed'
              }`}
              title={t.actions.saveAllTitle}
            >
              {t.actions.saveAll}
            </button>
          </div>
        }
      />

      {error && (
        <div className="mb-3 rounded-xl border border-red-300 bg-red-50 text-red-800 px-3 py-2 text-sm">
          {t.errors.loadFailed}
        </div>
      )}

      <div className="space-y-3">
        <Card>
          <div className="p-3">
            <SettingsInitialInfoCard t={t.initialInfo} />
          </div>
        </Card>
        <Card>
          <div className="p-3">
            <SettingsCashCountCard t={t.cashCount} />
          </div>
        </Card>
        <Card>
          <div className="p-3">
            <SettingsCashOutCard t={t.cashOut} />
          </div>
        </Card>
      </div>
    </div>
  )
}
