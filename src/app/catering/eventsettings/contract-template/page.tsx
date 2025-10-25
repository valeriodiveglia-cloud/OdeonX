// src/app/catering/eventsettings/contract-template/page.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

// SuperDoc (solo JS; gli stili sono in src/styles/superdoc.css)
import { SuperDoc } from 'superdoc'

// Supabase
import { supabase } from '@/lib/supabase_shim'

// i18n
import { useECT } from '@/app/catering/_i18n'

/* =================== CONFIG =================== */
const STORAGE_BUCKET = 'contract-templates'
const DEFAULT_KEY    = 'default'
const LS_DOCX_PATH   = 'contractTpl:docx_path'
const LS_HTML_FALL   = 'contractTpl:default'

/* =================== STILI LOCALI (shell pagina) =================== */
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
.ct-actions .spacer{ flex:1 1 auto } /* per tenere Back a sinistra e i pulsanti a destra */
.tool-btn{ height:34px; min-width:36px; padding:0 10px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; color:#0f172a; display:inline-flex; align-items:center; justify-content:center; gap:8px; text-decoration:none; }
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
  { key: 'contract.quotation_no', label: 'Quotation no.' },
  { key: 'event.city_date.en', label: 'Event city + date (EN)' },
  { key: 'event.date.en', label: 'Event date (EN)' },
  { key: 'event.title', label: 'Event title' },
  { key: 'event.location', label: 'Event location' },
  { key: 'event.attendees_count', label: 'Attendees' },
  { key: 'event.time.start', label: 'Start time' },
  { key: 'event.time.end', label: 'End time' },
  { key: 'event.time.duration_hours', label: 'Duration (h)' },
  { key: 'contract.city_date.en', label: 'Contract city + date (EN)' },
  { key: 'contract.date.en', label: 'Contract date (EN)' },
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

/* ==== Util ==== */
const DEFAULT_HTML = `
  <h1 style="margin-top:0">Contract template</h1>
  <p>Use the right placeholders:</p>
  <ul>
    <li><b>Event</b>: <code>{{event.city_date.en}}</code>, <code>{{event.date.en}}</code></li>
    <li><b>Contract (today)</b>: <code>{{contract.city_date.en}}</code>, <code>{{contract.date.en}}</code></li>
  </ul>
  <hr />
  <p><i>Tip:</i> insert tokens from the sidebar on the right.</p>
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

/** Inserisce HTML nell’editor (fallback sicuro) */
function setEditorHTML(editor: any, html: string) {
  try {
    if (editor?.commands?.insertContent) {
      editor.commands.insertContent(html, { contentType: 'html' })
      return
    }
  } catch {}
  try {
    const host = document.querySelector('#sd-editor [contenteditable="true"]') as HTMLElement | null
    if (host) host.innerHTML = html
  } catch {}
}

/* ==== Reflow dopo font + immagini (logo header) ==== */
function waitEditorImages(): Promise<void> {
  return new Promise((resolve) => {
    const root = document.getElementById('sd-editor')
    if (!root) return resolve()
    const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('.sd-header img, .page-header img, img'))
    const pending = imgs.filter(img => !img.complete)
    if (pending.length === 0) return resolve()
    let left = pending.length
    const done = () => { left -= 1; if (left <= 0) resolve() }
    pending.forEach(img => {
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
    })
  })
}
async function reflowAfterAssets() {
  try { await (document as any).fonts?.ready } catch {}
  await waitEditorImages()
  window.dispatchEvent(new Event('resize'))
  setTimeout(() => window.dispatchEvent(new Event('resize')), 80)
}

/* ==== Backspace guard ==== */
function atBlockStart(sel: Selection): boolean {
  if (!sel.rangeCount) return false
  const r = sel.getRangeAt(0)
  if (!r.collapsed) return false
  let block: HTMLElement | null = null
  let n: Node | null = r.startContainer
  while (n && n.nodeType === Node.TEXT_NODE) n = n.parentElement
  let el = n as HTMLElement | null
  while (el && el !== document.body) {
    const tag = (el.tagName || '').toUpperCase()
    if (['P','DIV','LI','H1','H2','H3','H4','H5','H6','TD','TH'].includes(tag)) { block = el; break }
    el = el.parentElement
  }
  if (!block) return false
  const test = document.createRange()
  try {
    test.setStart(block, 0)
    test.setEnd(r.startContainer, r.startOffset)
    const txt = (test.cloneContents().textContent || '').replace(/\u200B|\s/g, '')
    return txt.length === 0
  } catch { return false }
}

function installBackspaceGuard() {
  const host = document.querySelector('#sd-editor [contenteditable="true"]') as HTMLElement | null
  if (!host) return () => {}
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Backspace') return
    const sel = window.getSelection()
    if (!sel) return
    if (!atBlockStart(sel)) return
    e.preventDefault()
    const r = sel.rangeCount ? sel.getRangeAt(0) : null
    if (!r) return
    const block = (function findBlock(n: Node): HTMLElement | null {
      let el: HTMLElement | null = n.nodeType === Node.ELEMENT_NODE ? (n as HTMLElement) : n.parentElement
      while (el && el !== document.body) {
        const t = el.tagName.toUpperCase()
        if (['P','DIV','LI','H1','H2','H3','H4','H5','H6','TD','TH'].includes(t)) return el
        el = el.parentElement
      }
      return null
    })(r.startContainer)
    if (!block) return
    let firstText: Node | null = block.firstChild
    while (firstText && firstText.nodeType !== Node.TEXT_NODE) firstText = firstText.firstChild
    if (!firstText) {
      firstText = document.createTextNode('\u200B')
      block.insertBefore(firstText, block.firstChild)
    } else {
      const t = firstText as Text
      if (!t.data || t.data[0] !== '\u200B') {
        t.insertData(0, '\u200B')
      }
    }
    const txt = firstText as Text
    const nr = document.createRange()
    nr.setStart(txt, 1)
    nr.collapse(true)
    sel.removeAllRanges()
    sel.addRange(nr)
    document.execCommand?.('delete')
  }
  host.addEventListener('keydown', onKey)
  return () => host.removeEventListener('keydown', onKey)
}

/* ==== Host “immutabili” ==== */
const SDToolbarHost = React.memo(() => <div id="sd-toolbar" />, () => true)
const SDEditorHost  = React.memo(() => <div id="sd-editor" />,  () => true)

/* =================== COMPONENTE =================== */
export default function ContractTemplatePage() {
  const tEC = useECT()

  // Wrapper “libero” per evitare errori di tipi sui key dinamici
  const tLoose = (k: string, fb?: string) => {
    try {
      const v = (tEC as unknown as (kk: string) => string)(k)
      return v ?? fb ?? k
    } catch {
      return fb ?? k
    }
  }

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
    let moToolbar: MutationObserver | null = null
    let watchdog: number | null = null
    let retryTO: number | null = null
    let offBackspace: (() => void) | null = null

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
        dbDocxPath = data?.docx_path || null
        dbHTML     = data?.html || null
      } catch (e) { console.warn('[contract-template] read DB error:', errMsg(e)) }

      let lsDocx: string | null = null
      try { lsDocx = localStorage.getItem(LS_DOCX_PATH) } catch {}
      let lsHTML: string | null = null
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

          // Backspace guard
          offBackspace = installBackspaceGuard()

          // prima ripaginazione soft
          reflowAfterAssets()

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
            setEditorHTML(editorRef.current, html)
          }

          // ripaginazione forte dopo font+immagini (logo)
          reflowAfterAssets()
        },
      }

      const cfg = signedUrl ? { ...baseCfg, document: signedUrl } : baseCfg
      const sd = new SuperDoc(cfg)
      sdRef.current = sd

      // osserva toolbar per "iconify"
      const bar = document.getElementById('sd-toolbar')
      if (bar) {
        moToolbar = new MutationObserver(() => iconifyToolbarLabels())
        moToolbar.observe(bar, { subtree: true, childList: true, characterData: true })
      }
    }

    boot()
    return () => {
      try { moToolbar?.disconnect() } catch {}
      try { sdRef.current?.destroy?.() } catch {}
      sdRef.current = null
      editorRef.current = null
      if (watchdog) window.clearTimeout(watchdog)
      if (retryTO) window.clearTimeout(retryTO)
      try { offBackspace?.() } catch {}
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
        await reflowAfterAssets()
        installBackspaceGuard()
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
          onReady: () => { setSdReady(true); flash('DOCX imported'); iconifyToolbarLabels(); installBackspaceGuard() },
          onEditorCreate: (ev: any) => { editorRef.current = ev?.editor || ev },
        })
        sdRef.current = sd
        await reflowAfterAssets()
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
          {/* Back a sinistra */}
          <Link href="/catering/eventsettings" className="tool-btn" aria-label={tLoose('common.back','Back')}>
            <span aria-hidden>←</span> {tLoose('common.back','Back')}
          </Link>

          {/* Spacer per spingere i bottoni a destra */}
          <div className="spacer" />

          {/* Bottoni azione a destra */}
          <button className="tool-btn" onClick={() => document.getElementById('import-docx-input')?.click()}>
            {tLoose('contractTpl.importDocx','Import DOCX…')}
          </button>
          <input id="import-docx-input" ref={importInputRef} type="file" accept=".docx" style={{display:'none'}} onChange={onImportDocx} />

          <button className="tool-btn primary" onClick={saveTemplate} disabled={!sdReady || saving}>
            {saving ? tLoose('common.saving','Saving…') : tLoose('common.save','Save')}
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
              {tLoose('common.profile','Profile')}
            </button>
            <button
              className="tab-btn"
              aria-pressed={activeTab==='event'}
              onClick={()=>setActiveTab('event')}
            >
              {tLoose('common.event','Event')}
            </button>
          </div>
          <input
            className="tool-select"
            placeholder={tLoose('common.search','Search…')}
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
                  {tLoose('common.insert','Insert')}
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  )
}