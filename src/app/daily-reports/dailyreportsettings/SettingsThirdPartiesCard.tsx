// app/daily-reports/dailyreportsettings/SettingsThirdPartiesCard.tsx
'use client'

import { useEffect, useState } from 'react'
import { CreditCardIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline'
import { DailyReportsDictionary } from '../_i18n'
import { useDailyReportSettingsContext } from '../_data/DailyReportSettingsContext'
import Button from '@/components/Button'
import { useSettings } from '@/contexts/SettingsContext'

const MAX_THIRD_PARTIES = 6

/* ===== Stesse icone e colori predefiniti del Cashier Closing ===== */
function getChannelBrandDetails(label: string) {
  const norm = label.toLowerCase()
  const fallbackIcon = (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  )

  if (norm.includes('grab')) {
    return {
      bgIcon: 'bg-emerald-50 text-emerald-600',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M23.129 10.863a2.927 2.927 0 00-2.079-.872c-.57 0-1.141.212-1.455.421-.651.434-1.186.904-2.149 2.148v.894c.817-1.064 1.59-1.903 2.177-2.364.386-.31.933-.501 1.427-.501 1.275 0 2.352 1.077 2.352 2.352v.538c0 .63-.247 1.223-.698 1.668a2.341 2.341 0 01-1.654.685c-1.048 0-1.97-.719-2.22-1.701l-.422.51c.307 1.03 1.417 1.789 2.642 1.789.778 0 1.516-.31 2.079-.872.562-.562.871-1.3.871-2.079v-.538c0-.778-.31-1.517-.871-2.078m-12.8-.274c.406 0 .757.087 1.074.266.149-.186.299-.337.411-.449-.335-.256-.903-.415-1.485-.415-.83 0-1.584.3-2.122.843-.534.54-.83 1.287-.83 2.107v3.489h.598V12.94c0-1.385.968-2.352 2.354-2.352m5.678 5.84v-3.488c0-1.072-.84-1.913-1.913-1.913-.5 0-.976.203-1.343.57a1.895 1.895 0 00-.57 1.343v.538c0 1.037.877 1.913 1.913 1.913.285 0 .671-.07.908-.264v-.631c-.232.187-.57.298-.908.298a1.302 1.302 0 01-1.315-1.316v-.538a1.3 1.3 0 011.315-1.314 1.3 1.3 0 011.316 1.314v3.489zM0 12.596v.193c0 1.036.393 2.003 1.107 2.722a3.759 3.759 0 002.689 1.112c.82 0 1.548-.186 2.162-.551.506-.302.73-.607.75-.635V12.22H3.65v.597H6.11v2.434l-.002.002c-.288.288-.972.77-2.312.77a3.165 3.165 0 01-2.279-.938 3.247 3.247 0 01-.92-2.297v-.193c0-.83.375-1.656 1.026-2.269a3.558 3.558 0 012.442-.967c.847 0 1.438.129 1.913.416v-.67c-.494-.21-1.085-.305-1.913-.305C1.862 8.8 0 10.538 0 12.595m10.329-.968c.226 0 .419.037.571.112.075-.186.151-.339.262-.525-.162-.116-.549-.186-.833-.186-1.09 0-1.913.823-1.913 1.913v3.489h.598V12.94c0-.774.54-1.314 1.315-1.314m-4.351-.702v-.707c-.541-.29-1.131-.419-1.913-.419-.799 0-1.555.293-2.132.824-.577.532-.895 1.233-.895 1.972v.193c0 1.542 1.237 2.796 2.758 2.796 1.237 0 1.745-.405 1.874-.533v-1.794H3.65v.598h1.46v.899l-.005.001c-.187.075-.578.231-1.31.231-.58 0-1.122-.225-1.528-.636a2.203 2.203 0 01-.632-1.562v-.193c0-1.192 1.113-2.198 2.43-2.198.91 0 1.45.147 1.913.528m14.105 1.126c.27-.27.623-.424.967-.424.737 0 1.315.577 1.315 1.314v.538c0 .738-.578 1.316-1.315 1.316-.357 0-.702-.196-.972-.55a2.151 2.151 0 01-.418-1.12l-.484.591c.095.452.33.885.665 1.19.344.313.774.486 1.209.486a1.915 1.915 0 001.913-1.913v-.538c0-.499-.202-.977-.57-1.343a1.896 1.896 0 00-1.343-.57c-.316 0-.818.114-1.417.652l-.002.002c-.16.16-.536.536-.765.804-.384.42-.943 1.054-1.42 1.688v.933c.529-.68.833-1.06 1.33-1.634.445-.519.996-1.15 1.307-1.422m-8.939 1.428c0 .779.31 1.517.872 2.08a2.93 2.93 0 002.078.87c.33 0 .669-.07.908-.188v-.597c-.28.117-.618.188-.908.188-1.274 0-2.352-1.077-2.352-2.353v-.538c0-1.275 1.078-2.352 2.352-2.352a2.34 2.34 0 012.353 2.353v3.488h.598v-3.604a2.979 2.979 0 00-.915-2.006 2.92 2.92 0 00-2.036-.83c-.778 0-1.516.31-2.078.873a2.926 2.926 0 00-.872 2.078zm6.918-2.313c.183-.22.372-.443.596-.631V7.378h-.596zm1.037-.876V7.378h.597V9.88a3.601 3.601 0 00-.597.41" />
        </svg>
      )
    }
  }
  if (norm.includes('shopee')) {
    return {
      bgIcon: 'bg-orange-50 text-orange-600',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M15.9414 17.9633c.229-1.879-.981-3.077-4.1758-4.0969-1.548-.528-2.277-1.22-2.26-2.1719.065-1.056 1.048-1.825 2.352-1.85a5.2898 5.2898 0 0 1 2.8838.89c.116.072.197.06.263-.039.09-.145.315-.494.39-.62.051-.081.061-.187-.068-.281-.185-.1369-.704-.4149-.983-.5319a6.4697 6.4697 0 0 0-2.5118-.514c-1.909.008-3.4129 1.215-3.5389 2.826-.082 1.1629.494 2.1078 1.73 2.8278.262.152 1.6799.716 2.2438.892 1.774.552 2.695 1.5419 2.478 2.6969-.197 1.047-1.299 1.7239-2.818 1.7439-1.2039-.046-2.2878-.537-3.1278-1.19l-.141-.11c-.104-.08-.218-.075-.287.03-.05.077-.376.547-.458.67-.077.108-.035.168.045.234.35.293.817.613 1.134.775a6.7097 6.7097 0 0 0 2.8289.727 4.9048 4.9048 0 0 0 2.0759-.354c1.095-.465 1.8029-1.394 1.9449-2.554zM11.9986 1.4009c-2.068 0-3.7539 1.95-3.8329 4.3899h7.6657c-.08-2.44-1.765-4.3899-3.8328-4.3899zm7.8516 22.5981-.08.001-15.7843-.002c-1.074-.04-1.863-.91-1.971-1.991l-.01-.195L1.298 6.2858a.459.459 0 0 1 .45-.494h4.9748C6.8448 2.568 9.1607 0 11.9996 0c2.8388 0 5.1537 2.5689 5.2757 5.7898h4.9678a.459 4.459 0 0 1 .458.483l-.773 15.5883-.007.131c-.094 1.094-.979 1.9769-2.0709 2.0059z" />
        </svg>
      )
    }
  }
  if (norm.includes('beamin')) {
    return {
      bgIcon: 'bg-cyan-50 text-cyan-600',
      icon: fallbackIcon
    }
  }
  if (norm.includes('gofood') || norm.includes('gojek')) {
    return {
      bgIcon: 'bg-red-50 text-red-600',
      icon: fallbackIcon
    }
  }
  if (norm.includes('loship')) {
    return {
      bgIcon: 'bg-rose-50 text-rose-600',
      icon: fallbackIcon
    }
  }
  return {
    bgIcon: 'bg-slate-50 text-slate-600',
    icon: fallbackIcon
  }
}

/* ===== Card primitives ===== */
function Card(props: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden text-slate-800">
      {props.children}
    </div>
  )
}

function CardHeader(props: { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }>; right?: React.ReactNode }) {
  const Icon = props.icon
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4 bg-slate-50/50 flex-wrap">
      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
        <Icon className="w-5.5 h-5.5" />
      </div>
      <div className="flex-1 min-w-[200px]">
        <h2 className="text-base font-extrabold text-slate-800 tracking-tight leading-none">
          {props.title}
        </h2>
        <span className="text-[11px] text-slate-400 font-bold block mt-1.5 leading-none">
          {props.subtitle}
        </span>
      </div>
      {props.right && <div className="flex items-center gap-2">{props.right}</div>}
    </div>
  )
}

function cleanStr(v: string) {
  return String(v ?? '').trim()
}

function uniqueCaseInsensitive(list: string[], max?: number) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const v = cleanStr(raw)
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
    if (typeof max === 'number' && out.length >= max) break
  }
  return out
}

/* ===== Main ===== */
export default function SettingsThirdPartiesCard({ t }: { t: DailyReportsDictionary['dailyreportsettings']['initialInfo'] }) {
  const { language } = useSettings()
  const {
    settings,
    loading,
    updateDraft,
    refresh,
  } = useDailyReportSettingsContext()

  const serverInitialInfo = settings?.initialInfo
  const [data, setData] = useState<string[]>([])
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [newTPName, setNewTPName] = useState('')
  const [selectedLogo, setSelectedLogo] = useState<string | null>(null)

  // Resetta initialLoadDone all'inizio del caricamento
  useEffect(() => {
    if (loading) {
      setInitialLoadDone(false)
    }
  }, [loading])

  // Sync from server
  useEffect(() => {
    if (loading) return
    const list = serverInitialInfo?.thirdParties && serverInitialInfo.thirdParties.length > 0
      ? uniqueCaseInsensitive(serverInitialInfo.thirdParties, MAX_THIRD_PARTIES)
      : ['Grab Food', 'Shopee Food']

    if (!initialLoadDone) {
      setInitialLoadDone(true)
      setData(list)
    }
  }, [serverInitialInfo, loading, initialLoadDone])

  const syncToContext = (newList: string[], newIcons: Record<string, string>) => {
    const toSave = {
      ...settings?.initialInfo,
      thirdParties: uniqueCaseInsensitive(newList, MAX_THIRD_PARTIES),
      thirdPartiesIcons: newIcons,
    }
    updateDraft('initialInfo', toSave)
    announceDirty(true)
  }

  const announceDirty = (dirty: boolean) => {
    try {
      window.dispatchEvent(new CustomEvent('dailysettings:dirty', { detail: { section: 'initialinfo', dirty } }))
    } catch { }
  }

  const handleResetToDefault = () => {
    const snap = ['Grab Food', 'Shopee Food']
    setData(snap)
    syncToContext(snap, {})
  }

  // Save Bar listeners
  useEffect(() => {
    async function onReload() {
      await refresh()
      setInitialLoadDone(false)
    }
    function onDefaults() {
      handleResetToDefault()
    }

    window.addEventListener('dailysettings:reload', onReload)
    window.addEventListener('dailysettings:reset-to-defaults', onDefaults)
    return () => {
      window.removeEventListener('dailysettings:reload', onReload)
      window.removeEventListener('dailysettings:reset-to-defaults', onDefaults)
    }
  }, [refresh])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      if (event.target?.result) {
        setSelectedLogo(event.target.result as string)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleAddTP = () => {
    const name = newTPName.trim()
    if (!name || data.length >= MAX_THIRD_PARTIES) return
    if (data.map(t => t.toLowerCase()).includes(name.toLowerCase())) {
      setNewTPName('')
      return
    }

    const next = [...data, name]
    const icons = { ...(settings?.initialInfo?.thirdPartiesIcons || {}) }
    if (selectedLogo) {
      icons[name.toLowerCase()] = selectedLogo
    }

    setData(next)
    syncToContext(next, icons)
    setNewTPName('')
    setSelectedLogo(null)
  }

  const handleRemoveTP = (index: number) => {
    const tpName = data[index] || ''
    const msg = language === 'vi'
      ? `Bạn có chắc chắn muốn xóa kênh thanh toán "${tpName}" không?`
      : `Are you sure you want to delete the payment provider "${tpName}"?`
    if (!window.confirm(msg)) return

    const next = data.filter((_, i) => i !== index)
    const icons = { ...(settings?.initialInfo?.thirdPartiesIcons || {}) }
    delete icons[tpName.toLowerCase()]

    setData(next)
    syncToContext(next, icons)
  }

  const renderLogo = (name: string) => {
    const customUrl = settings?.initialInfo?.thirdPartiesIcons?.[name.toLowerCase()]
    if (customUrl) {
      return <img src={customUrl} alt={name} className="w-full h-full object-contain p-1" />
    }

    const brand = getChannelBrandDetails(name)
    return (
      <div className={`w-full h-full flex items-center justify-center ${brand.bgIcon}`}>
        {brand.icon}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader
        title={t.thirdParties.title}
        subtitle={language === 'vi' ? 'Cấu hình các nhãn/kênh thanh toán của bên thứ ba' : 'Configure delivery and third-party payment provider labels'}
        icon={CreditCardIcon}
        right={
          <span className="text-xs text-slate-500 font-bold">
            {t.thirdParties.countLabel
              .replace('{count}', String(data.length))
              .replace('{max}', String(MAX_THIRD_PARTIES))}
          </span>
        }
      />
      <div className="p-6 bg-white space-y-6">
        {/* Form per aggiungere canale e caricare il logo */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 border border-slate-100 bg-slate-50/30 rounded-2xl max-w-xl">
          <input
            id="tp-logo-file"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          
          <div className="flex items-center gap-3">
            <label
              htmlFor="tp-logo-file"
              className="w-14 h-14 rounded-2xl border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all group hover:border-blue-400 shrink-0"
              title="Upload Logo"
            >
              {selectedLogo ? (
                <img src={selectedLogo} alt="Preview" className="w-full h-full object-contain p-1" />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400 group-hover:text-blue-500">
                  <PlusIcon className="w-5 h-5" />
                  <span className="text-[9px] font-extrabold uppercase tracking-wide mt-1">Logo</span>
                </div>
              )}
            </label>
            {selectedLogo && (
              <button
                type="button"
                onClick={() => setSelectedLogo(null)}
                className="text-xs text-red-500 hover:text-red-700 font-bold cursor-pointer"
              >
                {language === 'vi' ? 'Xóa logo' : 'Clear logo'}
              </button>
            )}
          </div>

          <div className="flex-1 w-full flex items-center gap-2">
            <input
              type="text"
              placeholder={t.thirdParties.placeholder}
              value={newTPName}
              onChange={(e) => setNewTPName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddTP()
                }
              }}
              disabled={data.length >= MAX_THIRD_PARTIES}
              className="border border-slate-200 rounded-xl px-3 h-10 w-full bg-white text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all text-sm font-semibold shadow-2xs hover:border-slate-350 disabled:bg-slate-50 disabled:text-slate-450"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddTP}
              disabled={!newTPName.trim() || data.length >= MAX_THIRD_PARTIES}
              className="h-10 px-4 text-xs font-bold shrink-0 shadow-2xs"
            >
              {t.common.add}
            </Button>
          </div>
        </div>

        {/* Griglia premium dei canali configurati */}
        {data.length === 0 ? (
          <div className="text-sm text-slate-450 italic font-medium py-3 text-center bg-slate-50/30 rounded-lg border border-dashed border-slate-200">
            {t.thirdParties.empty}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {data.map((tp, idx) => (
              <div
                key={`tp-card-${idx}`}
                className="flex items-center gap-3 p-3 border border-slate-100 bg-white rounded-2xl shadow-2xs hover:shadow-xs transition-all"
              >
                <div className="w-12 h-12 rounded-xl border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {renderLogo(tp)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-bold text-slate-800 block truncate">{tp}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveTP(idx)}
                  className="p-2 rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors cursor-pointer flex-shrink-0"
                  title={t.common.remove}
                >
                  <TrashIcon className="w-4.5 h-4.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Footer con ripristino default pulito */}
        <div className="border-t border-slate-100 pt-5 flex justify-end">
          <Button
            variant="danger-light"
            size="sm"
            onClick={handleResetToDefault}
            className="text-xs font-bold rounded-xl"
          >
            {language === 'vi' ? 'Mặc định' : 'Default'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
