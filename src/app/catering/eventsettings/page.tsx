'use client'

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'

// SuperDoc
import 'superdoc/style.css'
import { SuperDoc } from 'superdoc'

// Supabase
import { supabase } from '@/lib/supabase_shim'

// i18n hook (stesso pattern usato altrove)
import { useECT } from '../_i18n'

/* =================== CONFIG =================== */
const STORAGE_BUCKET = 'contract-templates'
const DEFAULT_KEY    = 'default'
const LS_DOCX_PATH   = 'contractTpl:docx_path'
const LS_HTML_FALL   = 'contractTpl:default'

/* =================== STILI =================== */
const styles = `
.ct-wrap{
  --col-gap:24px; --sidebar-w:420px; --nav-safe-left:84px;
  height:calc(100vh - 16px);
  max-width:min(1500px, 100vw - 48px);
  margin:0 auto; padding:12px 12px 16px calc(12px + var(--nav-safe-left));
  background:#0b1530; border-radius:14px; display:grid;
  grid-template-columns:1fr var(--sidebar-w);
  grid-template-rows:auto auto minmax(0,1fr);
  column-gap:var(--col-gap); row-gap:10px; overflow:hidden;
}
.ct-actions{ grid-column:1/3; grid-row:1/2; display:flex; gap:8px; justify-content:flex-end; align-items:center; position:sticky; top:8px; z-index:6; }
.tool-btn{ height:34px; min-width:36px; padding:0 10px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; color:#0f172a; display:inline-flex; align-items:center; justify-content:center; }
.tool-btn.primary{ background:#2563eb; color:#fff; border-color:#2563eb }
.tool-btn:hover{ background:#f3f4f6 }
.status{ font-size:12px; color:#10b981 }

.ct-toolbar-shell{
  grid-column:1/3; grid-row:2/3; align-self:start; background:#fff; border:1px solid #e5e7eb;
  border-radius:12px; padding:8px; box-shadow:0 4px 14px rgba(0,0,0,.08); position:sticky; top:52px; z-index:5; max-width:calc(100% - 12px);
}
#sd-toolbar{ width:100%; }
#sd-toolbar, #sd-toolbar *{ font-size:13px !important; }
#sd-toolbar > *{ display:flex !important; flex-wrap:nowrap !important; align-items:center; gap:8px; min-height:44px; width:100%; overflow:hidden; }
#sd-toolbar button, #sd-toolbar .dropdown, #sd-toolbar .select, #sd-toolbar .input{ height:32px !important; padding:0 6px !important; min-width:0 !important; }
#sd-toolbar svg{ width:16px !important; height:16px !important; }
.ct-icon-only{ font-size:0 !important; }
.ct-icon-only svg{ width:16px !important; height:16px !important; }

.ct-editor-shell{
  grid-column:1/2; grid-row:3/4; height:100%; border-radius:12px; border:1px solid #e5e7eb;
  background:#0b1530; overflow:auto; padding:8px; display:grid; place-items:start center;
}
#sd-editor{ background:transparent; }
#sd-editor .sd-ruler-top, #sd-editor .ruler-top{ position:sticky !important; top:0 !important; z-index:3 !important; background:inherit; }

.ct-sidebar{
  grid-column:2/3; grid-row:3/4; height:100%; align-self:stretch; background:#f8fafc;
  border:1px solid #e5e7eb; border-radius:12px; padding:12px; overflow:auto;
}
.tool-select{ height:34px; width:100%; border-radius:10px; padding:0 10px; border:1px solid #e5e7eb; background:#fff; color:#0f172a; }
.ct-pitem{ display:flex; justify-content:space-between; gap:8px; align-items:center; padding:6px 0; border-bottom:1px dashed #e5e7eb }
.ct-pitem .k{ font-size:13px; font-weight:600 }
.ct-pitem .v{ font-size:12px; color:#64748b }

.tab-btn{ height:32px; padding:0 10px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; color:#0f172a; }
.tab-btn[aria-pressed="true"]{ background:#2563eb; color:#fff; border-color:#2563eb }
`;

/** ====== Tabella lato app ====== */
type TemplateRow = {
  key: string
  label?: string | null
  html?: string | null
  docx_path?: string | null
  updated_at?: string | null
}

/* =================== PLACEHOLDERS =================== */
const PROFILE_PLACEHOLDERS = [
  { key: 'company.name', label: 'Company name' },
  { key: 'company.address', label: 'Company address' },
  { key: 'company.tax_code', label: 'Company tax code' },
  { key: 'company.phone', label: 'Company phone' },
  { key: 'company.email', label: 'Company email' },
  { key: 'director.name', label: 'Director full name' },
  { key: 'director.position', label: 'Director position' },
  { key: 'bank.name', label: 'Bank name' },
  { key: 'bank.account_name', label: 'Bank account name' },
  { key: 'bank.account_number', label: 'Bank account number' },
  { key: 'invoice.company_name', label: 'Invoice company name' },
  { key: 'invoice.address', label: 'Invoice address' },
  { key: 'invoice.tax_code', label: 'Invoice tax code' },
  { key: 'invoice.email', label: 'Invoice email' },
  { key: 'payment.methods', label: 'Payment methods' },
  { key: 'payment.deposit.percent', label: 'Deposit %' },
  { key: 'payment.late_interest_per_day_pct', label: 'Late interest % per day' },
  { key: 'payment.overtime_rate_per_hour_vnd', label: 'Overtime per hour (global currency symbol)' },
  { key: 'clauses.cancellation_html', label: 'Clause: cancellation (HTML)' },
  { key: 'clauses.liability_html', label: 'Clause: liability (HTML)' },
  { key: 'clauses.force_majeure_html', label: 'Clause: force majeure (HTML)' },
  { key: 'clauses.dispute_resolution_html', label: 'Clause: dispute (HTML)' },
]

const EVENT_PLACEHOLDERS = [
  // EVENT = dati dell’evento (restano quelli dell’evento)
  { key: 'contract.quotation_no', label: 'Quotation no.' },
  { key: 'event.city_date.en', label: 'Event city + date (EN)' },
  { key: 'event.date.en', label: 'Event date (EN)' },
  { key: 'event.title', label: 'Event title' },
  { key: 'event.location', label: 'Event location' },
  { key: 'event.attendees_count', label: 'Attendees' },
  { key: 'event.time.start', label: 'Start time' },
  { key: 'event.time.end', label: 'End time' },
  { key: 'event.time.duration_hours', label: 'Duration (h)' },

  // CONTRACT = timestamp “oggi”
  { key: 'contract.city_date.en', label: 'Contract city + date (EN)' },
  { key: 'contract.date.en', label: 'Contract date (EN)' },

  // resto
  { key: 'client.full_name', label: 'Client full name' },
  { key: 'contract.items_html', label: 'Items (HTML)' },
  { key: 'docx_totals.full_html', label: 'Totals table (HTML)' },
  { key: 'docx_totals.no_costs_html', label: 'Totals no-costs (HTML)' },
  { key: 'pricing.total_vnd', label: 'Total (global currency symbol)' },
  { key: 'payment.deposit.amount_vnd', label: 'Deposit amount (derived)' },
  { key: 'payment.deposit.due_date', label: 'Deposit due date' },
  { key: 'payment.balance.percent', label: 'Balance %' },
  { key: 'payment.balance.amount_vnd', label: 'Balance amount (derived)' },
  { key: 'payment.balance.due_date', label: 'Balance due date' },
  { key: 'signature.client.position', label: 'Signature: client position' },
  { key: 'signature.provider.position', label: 'Signature: provider position' },
  { key: 'signature.client.date', label: 'Signature: client date' },
  { key: 'signature.provider.date', label: 'Signature: provider date' },
]

/* ==== Host “immutabili” ==== */
const SDToolbarHost = React.memo(() => <div id="sd-toolbar" />, () => true)
const SDEditorHost  = React.memo(() => <div id="sd-editor" />,  () => true)

/* ==== Util ==== */
const DEFAULT_HTML = `
  <h1 style="margin-top:0">Contract template</h1>
  <p>Usa i segnaposto giusti:</p>
  <ul>
    <li><b>Evento</b>: <code>{{event.city_date.en}}</code>, <code>{{event.date.en}}</code></li>
    <li><b>Contratto (oggi)</b>: <code>{{contract.city_date.en}}</code>, <code>{{contract.date.en}}</code></li>
  </ul>
  <hr />
  <p><i>Tip:</i> inserisci i token dalla sidebar a destra.</p>
`.trim()

function errMsg(e: any) {
  try {
    if (!e) return 'Unknown error'
    if (typeof e === 'string') return e
    if ((e as any).message) return String((e as any).message)
    return JSON.stringify(e)
  } catch { return 'Unserializable error' }
}

function iconifyToolbarLabels() {
  const host = document.getElementById('sd-toolbar')
  if (!host) return
  host.querySelectorAll<HTMLElement>('*').forEach(el => {
    const txt = (el.textContent || '').trim()
    if (txt === 'Format text' || txt === 'Editing') {
      Array.from(el.childNodes).forEach(n => { if (n.nodeType === Node.TEXT_NODE) n.textContent = '' })
      el.classList.add('ct-icon-only')
    }
  })
}

export default function ContractTemplatePage() {
  // i18n
  const _t = useECT() as unknown as (k: string, fb?: string) => string
  const t = useCallback((k: string, fb?: string) => _t(k, fb), [_t])

  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile'|'event'>('profile')
  const [search, setSearch] = useState('')
  const [sdReady, setSdReady] = useState(false)

  const importInputRef = useRef<HTMLInputElement | null>(null)
  const sdRef = useRef<any>(null)
  const editorRef = useRef<any>(null)

  const flash = (m: string, ms = 2000) => { setStatus(m); window.setTimeout(() => setStatus(''), ms) }

  const listForTab = useMemo(
    () => (activeTab === 'profile' ? PROFILE_PLACEHOLDERS : EVENT_PLACEHOLDERS)
      .filter(f => !search.trim()
        || f.label!.toLowerCase().includes(search.toLowerCase())
        || f.key.toLowerCase().includes(search.toLowerCase())),
    [activeTab, search],
  )

  /** ===== Boot SuperDoc ===== */
  const bootTickRef = useRef(0)
  const retryCountRef = useRef(0)
  const [bootTick, setBootTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    let mo: MutationObserver | null = null
    let watchdog: number | null = null
    let retryTO: number | null = null

    const boot = async () => {
      setSdReady(false)
      await new Promise<void>(r => requestAnimationFrame(() => r()))

      // 1) leggi DB + LS
      let dbDocxPath: string | null = null
      let dbHTML: string | null = null
      try {
        const { data } = await supabase
          .from('contract_templates')
          .select('docx_path, html')
          .eq('key', DEFAULT_KEY)
          .limit(1)
          .maybeSingle()
        dbDocxPath = (data as Pick<TemplateRow, 'docx_path' | 'html'> | null)?.docx_path || null
        dbHTML     = (data as Pick<TemplateRow, 'docx_path' | 'html'> | null)?.html || null
      } catch (e) { console.warn('[contract-template] read DB error:', errMsg(e)) }

      let lsDocx = null
      try { lsDocx = localStorage.getItem(LS_DOCX_PATH) } catch {}
      let lsHTML = null
      try { lsHTML = localStorage.getItem(LS_HTML_FALL) } catch {}

      // priorità sorgente
      let signedUrl: string | null = null
      if (dbDocxPath || lsDocx) {
        const path = lsDocx || dbDocxPath!
        try {
          const { data: signed, error } = await supabase
            .storage.from(STORAGE_BUCKET)
            .createSignedUrl(path, 60 * 10)
          if (!error && signed?.signedUrl) {
            signedUrl = signed.signedUrl + ((signed.signedUrl.includes('?') ? '&' : '?') + 't=' + Date.now())
          }
        } catch (e) { console.warn('[contract-template] signed URL error:', errMsg(e)) }
      }

      if (!cancelled && (dbDocxPath || lsDocx) && !signedUrl && !dbHTML && !lsHTML) {
        if (retryCountRef.current < 5) {
          retryCountRef.current += 1
          retryTO = window.setTimeout(() => { if (!cancelled) setBootTick(t => t + 1) }, 800)
        }
      } else {
        retryCountRef.current = 0
      }

      // 2) (re)instanzia editor
      try { sdRef.current?.destroy?.() } catch {}
      editorRef.current = null

      const baseCfg: any = {
        selector: '#sd-editor',
        toolbar:  '#sd-toolbar',
        documentMode: 'editing',
        pagination: true,
        rulers: true,
        modules: { toolbar: { responsiveToContainer: true, hideButtons: false } },
        onReady: () => {
          if (cancelled) return
          setSdReady(true)
          flash('Editor ready')
          iconifyToolbarLabels()

          if (watchdog) window.clearTimeout(watchdog)
          watchdog = window.setTimeout(() => {
            if (!editorRef.current) {
              try {
                const host = document.querySelector('#sd-editor [contenteditable="true"]') as HTMLElement | null
                const html = dbHTML || lsHTML || DEFAULT_HTML
                if (host) host.innerHTML = html
                flash('Loaded (HTML fallback)')
              } catch (e) {
                console.warn('HTML fallback failed:', errMsg(e))
              }
            }
          }, 2000)
        },
        onEditorCreate: (ev: any) => {
          if (cancelled) return
          editorRef.current = ev?.editor || ev
          setSdReady(true)
          if (!signedUrl) {
            const html = dbHTML || lsHTML || DEFAULT_HTML
            try {
              editorRef.current?.commands?.insertContent?.(html, { contentType: 'html' })
              flash('Loaded (HTML)')
            } catch (e) { console.warn('insertContent failed:', errMsg(e)) }
          }
        },
      }

      const cfg = signedUrl ? { ...baseCfg, document: signedUrl } : baseCfg
      const sd = new SuperDoc(cfg)
      sdRef.current = sd

      const bar = document.getElementById('sd-toolbar')
      if (bar) {
        mo = new MutationObserver(() => iconifyToolbarLabels())
        mo.observe(bar, { subtree: true, childList: true, characterData: true })
      }
    }

    boot()
    return () => {
      cancelled = true
      try { mo?.disconnect() } catch {}
      try { sdRef.current?.destroy?.() } catch {}
      sdRef.current = null
      editorRef.current = null
      if (watchdog) window.clearTimeout(watchdog)
      if (retryTO) window.clearTimeout(retryTO)
    }
  }, [bootTick])

  // Rilancia automaticamente il boot quando cambiano i dati di template in LS
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return
      if (e.key === LS_DOCX_PATH || e.key === LS_HTML_FALL) {
        bootTickRef.current += 1
        setBootTick(bootTickRef.current)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /* ===== Actions ===== */
  const insertVar = (key: string) => {
    if (!sdReady || !editorRef.current?.commands) { flash('Editor not ready'); return }
    editorRef.current.commands.insertContent(`{{${key}}}`, { contentType: 'text' })
  }

  const onImportDocx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.currentTarget.value = ''
    if (!f) return
    try {
      setSdReady(false)
      if (typeof sdRef.current?.openDocument === 'function') {
        await sdRef.current.openDocument(f)
        setSdReady(true)
        flash('DOCX imported')
        iconifyToolbarLabels()
      } else {
        try { sdRef.current?.destroy?.() } catch {}
        editorRef.current = null
        await new Promise<void>(r => requestAnimationFrame(() => r()))
        const sd = new SuperDoc({
          selector: '#sd-editor',
          toolbar:  '#sd-toolbar',
          document: f,
          documentMode: 'editing',
          pagination: true,
          rulers: true,
          modules: { toolbar: { responsiveToContainer: true, hideButtons: false } },
          onReady: () => { setSdReady(true); flash('DOCX imported'); iconifyToolbarLabels() },
          onEditorCreate: (ev: any) => { editorRef.current = ev?.editor || ev },
        })
        sdRef.current = sd
      }
    } catch (err) {
      console.error('Import error:', errMsg(err))
      flash('Import failed')
      setSdReady(true)
    }
  }

  const saveTemplate = async () => {
    if (!sdReady) { flash('Editor not ready'); return }
    try {
      setSaving(true)

      const exporter =
        editorRef.current?.exportDocx
          ? () => editorRef.current.exportDocx()
          : (sdRef.current?.exportDocx ? () => sdRef.current.exportDocx() : null)

      if (!exporter) { flash('Export not available'); setSaving(false); return }

      const blob: Blob | undefined = await exporter()
      if (!blob) { flash('DOCX export failed'); setSaving(false); return }

      const path = `templates/${DEFAULT_KEY}.docx`
      const { error: upErr } = await supabase
        .storage.from(STORAGE_BUCKET)
        .upload(path, blob, {
          upsert: true, cacheControl: '0',
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
      if (upErr) {
        console.error('Upload error:', errMsg(upErr))
        flash('Upload failed (saved HTML locally).')
        try { localStorage.setItem(LS_HTML_FALL, editorRef.current?.getHTML?.() || '') } catch {}
        setSaving(false)
        return
      }

      try { localStorage.setItem(LS_DOCX_PATH, path) } catch {}

      try {
        const html: string = editorRef.current?.getHTML?.() || ''
        await supabase
          .from('contract_templates')
          .upsert({
            key: DEFAULT_KEY,
            label: 'Default',
            docx_path: path,
            html,
            updated_at: new Date().toISOString(),
          } as Partial<TemplateRow>)
      } catch (e) { console.warn('DB upsert error:', errMsg(e)) }

      try { localStorage.setItem(LS_HTML_FALL, editorRef.current?.getHTML?.() || '') } catch {}

      flash('Saved')
    } catch (e) {
      console.error('Save exception:', errMsg(e))
      try { localStorage.setItem(LS_HTML_FALL, editorRef.current?.getHTML?.() || '') } catch {}
      flash('Saved locally (fallback).')
    } finally { setSaving(false) }
  }

  /* =================== UI =================== */
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="ct-wrap">
        <div className="ct-actions">
          <button className="tool-btn" onClick={() => document.getElementById('import-docx-input')?.click()}>
            {t('contractTpl.importDocx', 'Import DOCX…')}
          </button>
          <input id="import-docx-input" ref={importInputRef} type="file" accept=".docx" style={{display:'none'}} onChange={onImportDocx} />

          <button className="tool-btn primary" onClick={saveTemplate} disabled={!sdReady || saving}>
            {saving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
          </button>

          <span className="status">{status}</span>
        </div>

        <div className="ct-toolbar-shell">
          <SDToolbarHost />
        </div>

        <div className="ct-editor-shell">
          <SDEditorHost />
        </div>

        <aside className="ct-sidebar">
          <div style={{display:'flex',gap:8,marginBottom:8}}>
            <button
              className="tab-btn"
              aria-pressed={activeTab==='profile'}
              onClick={()=>setActiveTab('profile')}
            >
              {t('contractTpl.profile', 'Profile')}
            </button>
            <button
              className="tab-btn"
              aria-pressed={activeTab==='event'}
              onClick={()=>setActiveTab('event')}
            >
              {t('contractTpl.event', 'Event')}
            </button>
          </div>
          <input
            className="tool-select"
            placeholder="Search…"
            value={search}
            onChange={(e)=>setSearch(e.target.value)}
            style={{marginBottom:8}}
          />
          <div>
            {listForTab.map(item => (
              <div key={item.key} className="ct-pitem">
                <div>
                  <div className="k">{item.label}</div>
                  <div className="v">{item.key}</div>
                </div>
                <button className="tool-btn" onClick={()=>insertVar(item.key)} disabled={!sdReady}>
                  {t('contractTpl.insert', 'Insert')}
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  )
}