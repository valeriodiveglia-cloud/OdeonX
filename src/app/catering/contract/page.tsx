// src/app/catering/contract/page.tsx
'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import '@/styles/superdoc.css'
import { SuperDoc } from 'superdoc'

import { supabase } from '@/lib/supabase_shim'
import { useEventHeader } from '@/app/catering/_data/useEventHeader'
import { useEventCalc } from '@/app/catering/_state/EventCalcProvider'
import { useSettings } from '@/contexts/SettingsContext'

/* =================== CONFIG =================== */
const TEMPLATE_BUCKET   = 'contract-templates'
const CONTRACTS_BUCKET  = 'contracts'
const DEFAULT_KEY       = 'default'
const CONTRACT_PATH     = (eventId: string) => `events/${eventId}/contract.docx`

/* ===== Provider branch ===== */
type ProviderBranch = {
  id: string
  name: string
  company_name?: string
  address?: string
  tax_code?: string
  phone?: string
  email?: string
  bank?: string
  bank_account_name?: string
  account_number?: string
}

/* ===== Tables ===== */
type TemplateRow = {
  key: string
  label?: string | null
  html?: string | null
  docx_path?: string | null
  updated_at?: string | null
}

/* =================== STYLES =================== */
const styles = `
.ct-wrap{
  --col-gap: 24px;
  --sidebar-w: 420px;
  --nav-safe-left: 84px;
  height: calc(100vh - 16px);
  max-width: min(1500px, 100vw - 48px);
  margin: 0 auto;
  padding: 12px 12px 16px calc(12px + var(--nav-safe-left));
  background: #0b1530;
  border-radius: 14px;
  display: grid;
  grid-template-columns: 1fr var(--sidebar-w);
  grid-template-rows: auto auto minmax(0, 1fr);
  column-gap: var(--col-gap);
  row-gap: 10px;
  overflow: hidden;
}
.ct-actions{
  grid-column: 1 / 3; grid-row: 1 / 2;
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  position: sticky; top: 8px; z-index: 6;
  background: transparent;
}
.ct-title{ display:flex; align-items:center; gap:8px; color:#fff; font-weight:700; font-size:20px }
.ct-sub{ font-weight:500; opacity:.9 }
.tool-btn{
  height: 34px; min-width: 36px; padding: 0 10px; border-radius: 10px;
  border: 1px solid #e5e7eb; background: #fff; color: #0f172a;
  display:inline-flex; align-items:center; justify-content:center;
}
.tool-btn.primary{ background:#2563eb; color:#fff; border-color:#2563eb }
.tool-btn:hover{ background:#f3f4f6 }
.status{ font-size:12px; color:#10b981 }

.ct-toolbar-shell{
  grid-column: 1 / 3; grid-row: 2 / 3;
  align-self: start;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 4px 14px rgba(0,0,0,.08);
  position: sticky; top: 52px; z-index: 5;
  max-width: calc(100% - 12px);
}
#sd-toolbar{ width: 100%; }
#sd-toolbar, #sd-toolbar *{ font-size: 13px !important; }
#sd-toolbar > *{
  display: flex !important; flex-wrap: nowrap !important;
  align-items: center; gap: 8px; min-height: 44px;
  width: 100%; overflow: hidden;
}
#sd-toolbar button, #sd-toolbar .dropdown, #sd-toolbar .select, #sd-toolbar .input{
  height: 32px !important; padding: 0 6px !important; min-width: 0 !important;
}
#sd-toolbar svg{ width: 16px !important; height: 16px !important; }
.ct-icon-only{ font-size: 0 !important; }
.ct-icon-only svg{ width:16px !important; height:16px !important; }

.ct-editor-shell{
  grid-column: 1 / 2; grid-row: 3 / 4;
  height: 100%;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #0b1530;
  overflow: auto;
  padding: 8px;
  display: grid; place-items: start center;
}
#sd-editor{ background: transparent; }
#sd-editor [class*="ruler-top"],
#sd-editor .sd-ruler-top,
#sd-editor .ruler-top{
  position: sticky !important;
  top: 0 !important;
  z-index: 3 !important;
  background: inherit;
}

/* Sidebar */
.ct-sidebar{
  grid-column: 2 / 3; grid-row: 3 / 4;
  height: 100%;
  align-self: stretch;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  overflow: auto;
}
.tool-select{
  height: 34px; width: 100%;
  border-radius: 10px; padding: 0 10px;
  border: 1px solid #e5e7eb; background: #fff; color: #0f172a;
}
.ct-pitem{ display:flex; justify-content:space-between; gap:8px; align-items:center; padding:6px 0; border-bottom:1px dashed #e5e7eb }
.ct-pitem .k{ font-size:13px; font-weight:600 }
.ct-pitem .v{ font-size:12px; color:#64748b }
.tab-btn{
  height: 32px; padding: 0 10px; border-radius: 10px;
  border: 1px solid #e5e7eb; background:#fff; color:#0f172a;
}
.tab-btn[aria-pressed="true"]{ background:#2563eb; color:#fff; border-color:#2563eb }

/* Export menu */
.menu{
  position: absolute; top: 100%; right: 0; margin-top: 6px;
  background:#fff; border:1px solid #e5e7eb; border-radius:10px; box-shadow:0 8px 30px rgba(0,0,0,.12);
  min-width: 160px; overflow:hidden; z-index: 20;
}
.menu button{
  width: 100%; text-align:left; padding:8px 10px; background:#fff; border:none; cursor:pointer;
}
.menu button:hover{ background:#f3f4f6 }
.menu-sep{ height:1px; background:#f1f5f9; margin:4px 0; }

/* token base */
.sd-var{}
.sd-var.sd-missing, .sd-missing{ color: #dc2626 !important; font-weight: 600; }

/* === FORZA LARGHEZZA PAGINA + PRICE A DESTRA === */
#sd-editor table:has(.sd-var[data-var^="docx_totals"]) {
  width: 100% !important;
  max-width: none !important;
  table-layout: fixed !important;
  border-collapse:collapse !important;
}
#sd-editor .sd-var[data-var^="docx_totals"]{
  display:block !important;
  width:100% !important;
  max-width:none !important;
}
#sd-editor .sd-var[data-var^="docx_totals"] table{
  width:100% !important;
  max-width:none !important;
  table-layout:fixed !important;
  border-collapse:collapse !important;
}
#sd-editor .sd-var[data-var^="docx_totals"] colgroup col:first-child{ width:68% !important; }
#sd-editor .sd-var[data-var^="docx_totals"] colgroup col:last-child{ width:32% !important; }
#sd-editor .sd-var[data-var^="docx_totals"] td{
  padding:4px 6px !important;
  border:1px solid #000 !important;
  word-break:break-word !important;
}
#sd-editor .sd-var[data-var^="docx_totals"] td:nth-child(2){
  text-align:right !important;
}

.ct-note{ font-size:12px; color:#9ca3af; margin-top:8px }
`;

/* ==== immutable hosts ==== */
const SDToolbarHost = React.memo(() => <div id="sd-toolbar" />, () => true)
const SDEditorHost  = React.memo(() => <div id="sd-editor" />,  () => true)

/* =================== Paris Summary =================== */
type ParisSummary = {
  pricing?: { totalAfterDiscount?: number | null }
  totals?: { afterDiscounts?: number | null; grandPrice?: number | null; discountsTotal?: number | null }
  payment?: {
    deposit?: { amount_vnd?: number | null; percent?: number | null; due_date?: string | null }
    balance?: { amount_vnd?: number | null; percent?: number | null; due_date?: string | null }
    is_full_payment?: boolean | null
  }
  updatedAt?: number
}
function readParisSummary(eventId: string | null): ParisSummary | null {
  if (!eventId) return null
  try {
    const raw = localStorage.getItem(`paris:summary:${eventId}`)
    return raw ? (JSON.parse(raw) as ParisSummary) : null
  } catch { return null }
}
function useParisSummary(eventId: string | null) {
  const [data, setData] = React.useState<ParisSummary | null>(null)
  React.useEffect(() => { setData(readParisSummary(eventId)) }, [eventId])
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === `paris:summary:${eventId}`) setData(readParisSummary(eventId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [eventId])
  React.useEffect(() => {
    const onParis = (e: Event) => {
      const ce = e as CustomEvent<{ eventId?: string; payload?: ParisSummary }>
      if (ce?.detail?.eventId && ce.detail.eventId !== eventId) return
      if (ce?.detail?.payload) setData(ce.detail.payload)
    }
    window.addEventListener('paris:summary', onParis as EventListener)
    return () => window.removeEventListener('paris:summary', onParis as EventListener)
  }, [eventId])
  return data
}

/* =================== DOCX TOTALS =================== */
type DocxTotals = { full_html?: string | null; no_costs_html?: string | null; updatedAt?: number }

function readDocxTotals(eventId: string | null): DocxTotals | null {
  if (!eventId) return null
  try {
    const raw = localStorage.getItem(`paris:docxTotals:${eventId}`)
    if (raw) {
      const o = JSON.parse(raw)
      return {
        full_html: o.full_html ?? o.full ?? null,
        no_costs_html: o.no_costs_html ?? o.no_costs ?? o.noCosts ?? null,
        updatedAt: o.updatedAt ?? Date.now(),
      }
    }
  } catch {}
  const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
  return {
    full_html:
      read(`paris:docxTotals:${eventId}:full`) ||
      read(`paris:docxTotals:full:${eventId}`) ||
      read('paris:docxTotals:full'),
    no_costs_html:
      read(`paris:docxTotals:${eventId}:no_costs`) ||
      read(`paris:docxTotals:no_costs:${eventId}`) ||
      read('paris:docxTotals:no_costs'),
    updatedAt: Date.now(),
  }
}
function useDocxTotals(eventId: string | null) {
  const [data, setData] = React.useState<DocxTotals | null>(null)
  React.useEffect(() => { setData(readDocxTotals(eventId)) }, [eventId])
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return
      if (e.key.includes('paris:docxTotals')) setData(readDocxTotals(eventId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [eventId])
  React.useEffect(() => {
    const onTotals = (e: Event) => {
      const ce = e as CustomEvent<{ eventId?: string; payload?: DocxTotals }>
      if (ce?.detail?.eventId && ce.detail.eventId !== eventId) return
      if (ce?.detail?.payload) setData(ce.detail.payload)
    }
    window.addEventListener('paris:docxTotals', onTotals as EventListener)
    return () => window.removeEventListener('paris:docxTotals', onTotals as EventListener)
  }, [eventId])
  return data
}

/* =================== CONTRACT STAMP (freeze at first save/export) =================== */
function readContractStamp(eventId: string | null): number | null {
  if (!eventId) return null
  try {
    const raw = localStorage.getItem(`paris:contractStamp:${eventId}`)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? n : null
  } catch { return null }
}
function ensureContractStamp(eventId: string | null): number | null {
  if (!eventId) return null
  let ts = readContractStamp(eventId)
  if (ts == null) {
    ts = Date.now()
    try { localStorage.setItem(`paris:contractStamp:${eventId}`, String(ts)) } catch {}
    try { window.dispatchEvent(new CustomEvent('paris:contractStamp', { detail: { eventId, ts } })) } catch {}
  }
  return ts
}
function useContractStamp(eventId: string | null) {
  const [ts, setTs] = React.useState<number | null>(() => readContractStamp(eventId))
  React.useEffect(() => { setTs(readContractStamp(eventId)) }, [eventId])
  React.useEffect(() => {
    const onS = (e: StorageEvent) => {
      if (e.key === `paris:contractStamp:${eventId}`) setTs(readContractStamp(eventId))
    }
    window.addEventListener('storage', onS)
    return () => window.removeEventListener('storage', onS)
  }, [eventId])
  React.useEffect(() => {
    const onCE = (e: Event) => {
      const ce = e as CustomEvent<{ eventId?: string; ts?: number }>
      if (ce?.detail?.eventId && ce.detail.eventId !== eventId) return
      if (typeof ce?.detail?.ts === 'number') setTs(ce.detail.ts)
    }
    window.addEventListener('paris:contractStamp', onCE as EventListener)
    return () => window.removeEventListener('paris:contractStamp', onCE as EventListener)
  }, [eventId])
  return ts
}
function setContractStamp(eventId: string | null, ts: number | null) {
  if (!eventId) return
  const k = `paris:contractStamp:${eventId}`
  try {
    if (ts == null) localStorage.removeItem(k)
    else localStorage.setItem(k, String(ts))
    window.dispatchEvent(new CustomEvent('paris:contractStamp', { detail: { eventId, ts: ts ?? undefined } }))
  } catch {}
}
function setContractStampNow(eventId: string | null) {
  if (!eventId) return
  setContractStamp(eventId, Date.now())
}

/* =================== Supabase utils =================== */
async function signedUrl(bucket: string, path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10)
    if (error || !data?.signedUrl) return null
    const cacheBust = (data.signedUrl.includes('?') ? '&' : '?') + 't=' + Date.now()
    return data.signedUrl + cacheBust
  } catch { return null }
}
async function fileExists(bucket: string, folder: string, fileName: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 100 })
    if (error || !data) return false
    return !!data.find(f => f.name === fileName)
  } catch { return false }
}

/* =================== IMG INLINING (export) =================== */
function toAbsoluteUrl(url: string): string { try { return new URL(url, window.location.origin).toString() } catch { return url } }
async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const c = new AbortController()
  const id = setTimeout(() => c.abort(), ms)
  try { return await fetch(url, { mode: 'cors', credentials: 'omit', signal: c.signal }) }
  finally { clearTimeout(id) }
}
async function urlToDataUrl(url: string): Promise<string> {
  if (!url) throw new Error('empty url')
  if (url.startsWith('data:')) return url
  const abs = toAbsoluteUrl(url)
  const res = await fetchWithTimeout(abs, 8000)
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${abs}`)
  const blob = await res.blob()
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = reject
    fr.readAsDataURL(blob)
  })
}
function getDisplayedSize(img: HTMLImageElement): { w: number; h: number } {
  const cs = getComputedStyle(img)
  const parsePx = (v: string | null | undefined): number | null => {
    if (!v) return null
    const m = /([\d.]+)px/.exec(v || '')
    return m ? Math.max(1, Math.round(Number(m[1]))) : null
  }
  const rect = img.getBoundingClientRect()
  const ww = ((parsePx(cs.width)  ?? rect.width)  || img.naturalWidth  || (img as any).width  || 1)
  const hh = ((parsePx(cs.height) ?? rect.height) || img.naturalHeight || (img as any).height || 1)
  return { w: Math.max(8, Math.round(ww)), h: Math.max(8, Math.round(hh)) }
}
async function reencodeTo(dataUrl: string, type: 'image/png' | 'image/jpeg', quality?: number, w?: number, h?: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const W = Math.max(1, Math.round(w || img.naturalWidth || 1))
      const H = Math.max(1, Math.round(h || img.naturalHeight || 1))
      const canvas = document.createElement('canvas')
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('no canvas ctx')); return }
      if (type === 'image/jpeg') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, W, H)
      } else {
        ctx.clearRect(0, 0, W, H)
      }
      ctx.drawImage(img, 0, 0, W, H)
      try { resolve(canvas.toDataURL(type, quality)) } catch (e) { reject(e) }
    }
    img.onerror = () => reject(new Error('decode error'))
    img.src = dataUrl
  })
}

/* FIX TIPI QUI */
async function waitImagesLoaded(root: HTMLElement | Document, perImageTimeout = 2000): Promise<void> {
  const rootEl: Document | HTMLElement = (root as any).querySelectorAll ? (root as Document | HTMLElement) : document
  const imgs: HTMLImageElement[] = Array.from(rootEl.querySelectorAll('img')) as HTMLImageElement[]
  if (!imgs.length) return
  await Promise.all(
    imgs.map((i) => {
      if (i.complete && i.naturalWidth > 0) return Promise.resolve()
      return new Promise<void>(resolve => {
        let done = false
        const on = () => { if (done) return; done = true; i.removeEventListener('load', on); i.removeEventListener('error', on); resolve() }
        const t = window.setTimeout(() => { on() }, perImageTimeout)
        i.addEventListener('load', () => { clearTimeout(t); on() })
        i.addEventListener('error', () => { clearTimeout(t); on() })
      })
    })
  )
}

function neutralizeAncestors(el: HTMLElement): Array<{ el: HTMLElement; style: string | null }> {
  const changes: Array<{ el: HTMLElement; style: string | null }> = []
  let p: HTMLElement | null = el.parentElement
  let hops = 0
  while (p && hops < 3) {
    const cs = getComputedStyle(p)
    const isBad = cs.display === 'flex' || cs.display === 'grid' || cs.position === 'absolute' || cs.position === 'fixed'
    if (isBad) {
      changes.push({ el: p, style: p.getAttribute('style') })
      p.setAttribute('style', `${p.getAttribute('style') || ''};display:block !important;position:static !important;transform:none !important;filter:none !important;`)
    }
    p = p.parentElement
    hops++
  }
  return changes
}

/* ---------- Nuovi helper generici ---------- */
function makeRunId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`
}
function baseNameFromImg(img: HTMLImageElement): string {
  const fromAttr = img.getAttribute('data-filename') || ''
  const fromAlt  = img.getAttribute('alt') || ''
  const fromSrc  = img.getAttribute('src') || ''
  const pick = fromAttr || fromAlt || fromSrc
  const last = pick.split(/[\\/]/).pop() || ''
  return (last.replace(/\?.*$/,'').replace(/#.*$/,'').replace(/\.(png|jpe?g|webp|gif|svg)$/i,'') || 'image')
}
function uniqueImageName(prefix = 'image') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}.png`
}

/* --------- Inliner TEMPORANEO per export (non modifica gli <img> originali) --------- */
async function inlineEditorImagesStrict(runId = makeRunId()): Promise<() => void> {
  const scope = document.querySelector('#sd-editor') as HTMLElement | null
  const host = scope?.querySelector('.ProseMirror') as HTMLElement | null
  if (!host) return () => {}

  await waitImagesLoaded(host, 2000)

  const imgs = Array.from(host.querySelectorAll<HTMLImageElement>('img'))
  const candidates = imgs.filter(img => (img.currentSrc || img.src))

  type Backup = {
    original: HTMLImageElement
    placeholder: HTMLImageElement
    parent: HTMLElement
    nextSibling: ChildNode | null
    parentFix: Array<{ el: HTMLElement; style: string | null }>
  }
  const backups: Backup[] = []
  let idx = 0

  for (const img of candidates) {
    const origSrc = (img.getAttribute('src') || img.currentSrc || '').trim()
    if (!origSrc) continue

    try {
      const { w, h } = getDisplayedSize(img)
      const base = baseNameFromImg(img).replace(/[^\w.-]/g, '_') || 'image'
      const raw = origSrc.startsWith('data:') ? origSrc : await urlToDataUrl(origSrc)
      const data = await normalizeToPng8(raw, w, h)

      const ph = document.createElement('img')
      ph.setAttribute('src', data)
      ph.setAttribute('width', String(w))
      ph.setAttribute('height', String(h))
      ph.style.display = 'inline-block'
      ph.style.width = `${w}px`
      ph.style.height = `${h}px`
      ph.setAttribute('data-filename', `${base}__tmp__${runId}__${idx++}.png`)
      ph.setAttribute('data-src-original', origSrc)

      const parentFix = neutralizeAncestors(img)

      const parent = img.parentElement as HTMLElement
      const next = img.nextSibling
      parent.insertBefore(ph, next)
      img.style.display = 'none'

      backups.push({ original: img, placeholder: ph, parent, nextSibling: next, parentFix })
    } catch {}
  }

  return () => {
    for (const b of backups) {
      try {
        for (const fix of b.parentFix) {
          if (fix.style == null) fix.el.removeAttribute('style')
          else fix.el.setAttribute('style', fix.style)
        }
        if (b.placeholder.parentNode) b.parent.removeChild(b.placeholder)
        b.original.style.display = ''
        if (b.nextSibling) b.parent.insertBefore(b.original, b.nextSibling)
        else b.parent.appendChild(b.original)
      } catch {}
    }
  }
}

/* ---------- Limiti / normalizzazione PNG ---------- */
const MAX_IMAGE_DIM = 2400
const MIN_IMAGE_DIM = 24
function limitDims(w: number, h: number) {
  if (w <= MAX_IMAGE_DIM && h <= MAX_IMAGE_DIM) return { w, h }
  const s = Math.min(MAX_IMAGE_DIM / w, MAX_IMAGE_DIM / h)
  return { w: Math.max(MIN_IMAGE_DIM, Math.round(w * s)), h: Math.max(MIN_IMAGE_DIM, Math.round(h * s)) }
}
function normalizeToPng8(dataUrl: string, W: number, H: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const { w, h } = limitDims(W, H)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('no ctx'))
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      try { resolve(canvas.toDataURL('image/png')) } catch (e) { reject(e) }
    }
    img.onerror = () => reject(new Error('decode error'))
    img.src = dataUrl
  })
}
async function fetchToDataUrlWithRetry(url: string, tries = 3, timeoutMs = 12000): Promise<string> {
  let lastErr: any = null
  for (let i = 0; i < tries; i++) {
    try {
      const abs = toAbsoluteUrl(url)
      const res = await fetchWithTimeout(abs, 12000)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const fr = new FileReader()
      const data: string = await new Promise((resolve, reject) => {
        fr.onload = () => resolve(String(fr.result))
        fr.onerror = reject
        fr.readAsDataURL(blob)
      })
      return data
    } catch (e) { lastErr = e }
  }
  throw lastErr || new Error('fetch failed')
}

/* --------- PERMANENTE: inlining PNG preservando dimensioni (per Save) --------- */
async function elementToPngDataUrl(img: HTMLImageElement, w?: number, h?: number): Promise<string> {
  const { w: W0, h: H0 } = getDisplayedSize(img)
  const W = Math.max(1, Math.round(w ?? W0))
  const H = Math.max(1, Math.round(h ?? H0))
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas ctx')
  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(img, 0, 0, W, H)
  return canvas.toDataURL('image/png')
}

// --- background blocks no-op ---
async function inlineBackgroundBlocksToImages(root: HTMLElement | Document): Promise<void> { return; }

// --- inline <svg> -> PNG ---
async function inlineInlineSVGs(root: HTMLElement | Document): Promise<void> {
  const scope = (root as any).querySelectorAll ? (root as HTMLElement) : document;
  const svgs = Array.from(scope.querySelectorAll('svg')) as SVGSVGElement[];
  for (const svg of svgs) {
    try {
      const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
      const rect = svg.getBoundingClientRect();
      let w = Number(svg.getAttribute('width')) || (vb ? vb.width : Math.round(rect.width));
      let h = Number(svg.getAttribute('height')) || (vb ? vb.height : Math.round(rect.height));
      if (!w || !h) { w = Math.max(8, Math.round(rect.width) || 24); h = Math.max(8, Math.round(rect.height) || 24); }

      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', String(w));
      clone.setAttribute('height', String(h));
      const xml = new XMLSerializer().serializeToString(clone);
      const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

      const pngDataUrl = await normalizeToPng8(svgDataUrl, w, h);

      const img = document.createElement('img');
      img.src = pngDataUrl;
      img.setAttribute('width', String(w));
      img.setAttribute('height', String(h));
      img.style.width = `${w}px`;
      img.style.height = `${h}px`;
      img.setAttribute('data-filename', uniqueImageName('svg'));

      svg.parentElement?.replaceChild(img, svg);
    } catch {}
  }
}

// inline permanente di tutte le immagini nel documento
async function inlineImagesPermanent(): Promise<{ inlined: number; failed: number }> {
  const scope = document.querySelector('#sd-editor') as HTMLElement | null
  if (!scope) return { inlined: 0, failed: 0 }

  await inlineBackgroundBlocksToImages(scope)
  await inlineInlineSVGs(scope)
  await waitImagesLoaded(scope, 2500)

  const imgs = Array.from(scope.querySelectorAll<HTMLImageElement>('img'))
  let inlined = 0, failed = 0

  for (const img of imgs) {
    try {
      const src = (img.getAttribute('src') || img.currentSrc || '').trim()
      if (!src) continue

      const { w: w0, h: h0 } = getDisplayedSize(img)
      const { w, h } = limitDims(w0, h0)

      let pngData: string
      if (src.startsWith('data:')) {
        pngData = await normalizeToPng8(src, w, h)
      } else if (src.startsWith('blob:')) {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = w; canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('no ctx')
          ctx.clearRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)
          pngData = canvas.toDataURL('image/png')
        } catch {
          const raw = await fetchToDataUrlWithRetry(src, 2, 8000)
          pngData = await normalizeToPng8(raw, w, h)
        }
      } else {
        const raw = await fetchToDataUrlWithRetry(src, 3, 12000)
        pngData = await normalizeToPng8(raw, w, h)
      }

      img.setAttribute('width', String(w))
      img.setAttribute('height', String(h))
      img.style.width = `${w}px`
      img.style.height = `${h}px`

      img.removeAttribute('srcset')
      img.removeAttribute('sizes')

      const base = baseNameFromImg(img) || 'image'
      const uniqueName = uniqueImageName(base)

      img.setAttribute('data-filename', uniqueName)
      if (!img.hasAttribute('data-src-original')) {
        img.setAttribute('data-src-original', src)
      }
      img.setAttribute('src', pngData)

      inlined++
    } catch {
      failed++
    }
  }
  return { inlined, failed }
}

/* ========== NORMALIZZA TOTALS in DOPPIA LINGUA (EN / VI) ========== */
const TOTALS_CANON: Record<string, { label: string; synonyms: string[] }> = {
  bundles:   { label: 'Food Package / Gói',                 synonyms: ['bundles','bundle','food package','food packages','pacchetti','pacchetto','gói','goi'] },
  equipment: { label: 'Equipment / Thiết bị',                synonyms: ['equipment','equipment fee','equipment rental','noleggio attrezzature','thiết bị','thiết bị thuê','thiet bi'] },
  staff:     { label: 'Staff / Nhân sự',                     synonyms: ['staff','personale','nhân sự','nhan su'] },
  transport: { label: 'Transport / Vận chuyển',              synonyms: ['transport','trasporti','vận chuyển','van chuyen'] },
  assets:    { label: 'Company assets / Tài sản công ty',    synonyms: ['company assets','beni aziendali','tài sản công ty','tai san cong ty'] },
  extra_fee: { label: 'Extra fee / Phí bổ sung',             synonyms: ['extra fee','extra','phí bổ sung','phi bo sung'] },
  totals:    { label: 'Totals / Tổng cộng',                  synonyms: ['totals','totale','totali','tổng','tổng cộng','tong','tong cong'] },
  discounts: { label: 'Discounts / Giảm giá',                synonyms: ['discounts','sconti','giảm giá','giam gia'] },
  total_after: { label: 'Total after discounts / Tổng sau giảm giá', synonyms: ['total after discounts','totale dopo sconti','tổng sau giảm giá','tong sau giam gia'] },
}
const HEADER_BI = { section: 'Section / Mục', price: 'Price / Giá' }

function normalizeTotalsHTML(src: string | null): string | null {
  if (!src) return null
  const box = document.createElement('div')
  box.innerHTML = src

  const txt = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ').trim()

  const synToKey: Record<string, string> = {}
  for (const [key, v] of Object.entries(TOTALS_CANON)) {
    v.synonyms.forEach(s => { synToKey[s.toLowerCase()] = key })
  }

  const found: Record<string, string> = {}
  box.querySelectorAll('tr').forEach(tr => {
    const cells = Array.from(tr.children).filter(n => n.tagName === 'TD' || n.tagName === 'TH') as HTMLElement[]
    if (cells.length < 2) return
    const left  = txt(cells[0]).toLowerCase()
    const right = txt(cells[cells.length - 1])
    if (!left || !right) return
    if (/^(section|sezione|costo|cost|prezzo|price)$/i.test(left)) return
    const key = synToKey[left] || null
    if (!key) return
    if (found[key] != null) return
    found[key] = right
  })

  const order = ['bundles','equipment','staff','transport','assets','extra_fee','totals','discounts','total_after']
  const present = order.filter(k => found[k] != null)

  const tbl = document.createElement('table')
  tbl.setAttribute('width','100%')
  tbl.style.width = '100%'
  tbl.style.tableLayout = 'fixed'
  tbl.style.borderCollapse = 'collapse'

  const cg = document.createElement('colgroup')
  const c1 = document.createElement('col'); c1.style.width = '68%'
  const c2 = document.createElement('col'); c2.style.width = '32%'
  cg.append(c1, c2); tbl.appendChild(cg)

  const makeCell = (text: string, right = false, bold = false) => {
    const td = document.createElement('td')
    td.textContent = text
    td.style.padding = '4px 6px'
    td.style.border = '1px solid #000'
    td.style.wordBreak = 'break-word'
    if (right) td.style.textAlign = 'right'
    if (bold) td.style.fontWeight = '600'
    return td
  }

  const tbody = document.createElement('tbody')

  const headTr = document.createElement('tr')
  headTr.append(makeCell(HEADER_BI.section, false, true), makeCell(HEADER_BI.price, true, true))
  tbody.appendChild(headTr)

  present.forEach(k => {
    const bold = (k === 'totals' || k === 'discounts' || k === 'total_after')
    const tr = document.createElement('tr')
    tr.append(makeCell(TOTALS_CANON[k].label, false, bold), makeCell(found[k], true, bold))
    tbody.appendChild(tr)
  })

  tbl.appendChild(tbody)
  const wrap = document.createElement('div')
  wrap.appendChild(tbl)
  return wrap.innerHTML
}

/* ========== Extract numeric total from DOCX totals HTML ========== */
function extractTotalFromDocxTotals(src: string | null): number | null {
  if (!src) return null
  const box = document.createElement('div')
  box.innerHTML = src

  const labelMatchers = [
    /total after discounts/i,
    /grand total/i,
    /totale dopo sconti/i,
    /totale\b/i,
    /tổng sau giảm giá/i,
    /tô?ng\b/i,
    /totals?/i,
  ]

  const candidates: string[] = []
  box.querySelectorAll('tr').forEach(tr => {
    const cells = Array.from(tr.children) as HTMLElement[]
    if (cells.length < 2) return
    const label = (cells[0].textContent || '').trim()
    const value = (cells[cells.length - 1].textContent || '').trim()
    if (labelMatchers.some(rx => rx.test(label))) candidates.push(value)
  })

  if (candidates.length === 0) {
    const trs = Array.from(box.querySelectorAll('tr'))
    if (trs.length) {
      const last = trs[trs.length - 1]
      const cs = Array.from(last.children) as HTMLElement[]
      const v = (cs[cs.length - 1]?.textContent || '').trim()
      if (v) candidates.push(v)
    }
  }

  for (const s of candidates) {
    const n = Number(String(s).replace(/[^\d.+-]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return null
}

/* ========== “Downgrade” TH → TD in tutto l’editor (evita crash export) ========== */
function downgradeTableHeadersInEditor() {
  const host = document.querySelector('#sd-editor .ProseMirror') as HTMLElement | null
  if (!host) return
  const ths = Array.from(host.querySelectorAll('th'))
  ths.forEach(th => {
    const td = document.createElement('td')
    td.innerHTML = th.innerHTML
    const style = th.getAttribute('style')
    if (style) td.setAttribute('style', style)
    if ((th as HTMLElement).style.textAlign) td.style.textAlign = (th as HTMLElement).style.textAlign
    th.parentElement?.replaceChild(td, th)
  })
}

/* =================== PAGE =================== */
export default function ContractPage() {
  const router = useRouter()

  const ec = useEventCalc()
  const eventId = ec?.eventId || (ec as any)?.draftEventId || null
  const { header } = useEventHeader(eventId)
  const paris = useParisSummary(eventId)
  const docxTotals = useDocxTotals(eventId)
  const contractStamp = useContractStamp(eventId)

  const { language, currency } = useSettings()
  const locale = language === 'vi' ? 'vi-VN' : 'en-GB'
  const fmtNum = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const fmtCur = useMemo(() => new Intl.NumberFormat(locale, { style: 'currency', currency }), [locale, currency])
  const fmtDateDDMM = useMemo(() => new Intl.DateTimeFormat('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' }), [])
  const formatMaybeDate = (v: string | null): string | null => {
    if (!v) return null
    const t = Date.parse(v)
    if (!Number.isFinite(t)) return v
    return fmtDateDDMM.format(new Date(t))
  }

  // Traduttore locale SOLO per i pulsanti richiesti
  const t = useCallback(
    (en: string, fb?: string) => {
      if (language === 'vi') {
        const vi: Record<string, string> = {
          'Back': 'Quay lại',
          'Reset': 'Đặt lại',
          'Save': 'Lưu',
          'Saving…': 'Đang lưu…',
          'Export': 'Xuất',
          'Export as DOCX': 'Xuất DOCX',
          'Exporting…': 'Đang xuất…',
          'Profile': 'Hồ sơ',
          'Event': 'Sự kiện',
          'Insert': 'Chèn',
        }
        return vi[en] ?? (fb ?? en)
      }
      return fb ?? en
    },
    [language]
  )

  const [status, setStatus] = useState('')
  const [activeTab, setActiveTab] = useState<'profile'|'event'>('event')
  const [search, setSearch] = useState('')
  const [sdReady, setSdReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)

  const exportBtnRef = useRef<HTMLButtonElement | null>(null)
  const sdRef = useRef<any>(null)
  const editorRef = useRef<any>(null)

  const flash = (m: string) => { setStatus(m); setTimeout(() => setStatus(''), 1800) }
  const errMsg = (e: any) => (typeof e === 'string' ? e : (e?.message ? String(e.message) : (()=>{ try{return JSON.stringify(e)}catch{return 'Unknown error'} })()))

  const listForTab = useMemo(
    () => (activeTab === 'profile' ? PROFILE_PLACEHOLDERS : EVENT_PLACEHOLDERS)
      .filter(f => !search.trim()
        || f.label.toLowerCase().includes(search.toLowerCase())
        || f.key.toLowerCase().includes(search.toLowerCase())),
    [activeTab, search],
  )

  const iconifyToolbarLabels = () => {
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

  /** Provider branches **/
  const [pbById, setPbById] = useState<Record<string, ProviderBranch>>({})
  const [pbByName, setPbByName] = useState<Record<string, ProviderBranch>>({})

  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        const { data, error } = await supabase.from('provider_branches').select('*')
        if (error) throw error
        const byId: Record<string, ProviderBranch> = {}
        const byName: Record<string, ProviderBranch> = {}
        for (const row of data || []) {
          const b: ProviderBranch = {
            id: String(row.id),
            name: row.name ?? '',
            company_name: row.company_name ?? '',
            address: row.address ?? '',
            tax_code: row.tax_code ?? '',
            phone: row.phone ?? '',
            email: row.email ?? '',
            bank: row.bank ?? '',
            bank_account_name: row.bank_account_name ?? '',
            account_number: row.account_number ?? '',
          }
          byId[b.id] = b
          if (b.name) byName[b.name.toLowerCase().trim()] = b
        }
        if (!ignore) { setPbById(byId); setPbByName(byName) }
      } catch (e) {
        console.warn('[contract] provider_branches load error:', errMsg(e))
      }
    })()
    return () => { ignore = true }
  }, [])

  const selectedBranch: ProviderBranch | null = useMemo(() => {
    const idCandidates = [
      (header as any)?.provider_branch_id,
      (header as any)?.branch_provider_id,
      (ec as any)?.provider_branch_id,
    ]
    for (const raw of idCandidates) {
      const id = String(raw || '').trim()
      if (id && pbById[id]) return pbById[id]
    }
    const nameCandidates = [
      (header as any)?.branch_provider,
      (header as any)?.provider_branch,
      (header as any)?.provider,
      (ec as any)?.branch_provider,
      (ec as any)?.provider_branch,
    ]
    for (const raw of nameCandidates) {
      const name = String(raw || '').trim().toLowerCase()
      if (name && pbByName[name]) return pbByName[name]
    }
    return null
  }, [pbById, pbByName, header, ec])

  /** ================= TOKEN ENGINE ================= */
  const varsRef = useRef<Record<string, string | null>>({})

  const hasRawTokens = (root: HTMLElement) => /\{\{[a-zA-Z0-9._-]+\}\}/.test(root.textContent || '')

  const markTokens = (root: HTMLElement) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    let n: Node | null
    while ((n = walker.nextNode())) {
      const t = n as Text
      if (/\{\{[a-zA-Z0-9._-]+\}\}/.test(t.data)) nodes.push(t)
    }
    for (const textNode of nodes) {
      const frag = document.createDocumentFragment()
      const re = /\{\{([a-zA-Z0-9._-]+)\}\}/g
      let last = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(textNode.data))) {
        const before = textNode.data.slice(last, m.index)
        if (before) frag.appendChild(document.createTextNode(before))
        const key = m[1]
        const span = document.createElement('span')
        span.className = 'sd-var'
        span.setAttribute('data-var', key)
        span.textContent = `{{${key}}}`
        frag.appendChild(span)
        last = m.index + m[0].length
      }
      const after = textNode.data.slice(last)
      if (after) frag.appendChild(document.createTextNode(after))
      textNode.parentNode?.replaceChild(frag, textNode)
    }
  }

  const updateTokenValues = (vars: Record<string, string | null>) => {
    const host = document.querySelector('#sd-editor .ProseMirror') as HTMLElement | null
    if (!host) return
    host.querySelectorAll<HTMLElement>('[data-var]').forEach(el => {
      const key = el.getAttribute('data-var') || ''
      const rawVal = Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : null
      const isMissing = rawVal == null || String(rawVal).trim() === ''

      if (key.endsWith('_html') || key.endsWith('.html')) {
        if (isMissing) {
          el.innerHTML = 'missing'
          el.classList.add('sd-missing')
        } else {
          el.innerHTML = String(rawVal ?? '')
          el.classList.remove('sd-missing')
        }
      } else {
        if (isMissing) {
          el.textContent = 'missing'
          el.classList.add('sd-missing')
        } else {
          el.textContent = String(rawVal ?? '')
          el.classList.remove('sd-missing')
        }
      }
    })
  }

  const attachContentObserver = () => {
    const host = document.querySelector('#sd-editor .ProseMirror') as HTMLElement | null
    if (!host) return
    if (hasRawTokens(host)) markTokens(host)
    updateTokenValues(varsRef.current)
    const mo = new MutationObserver(() => {
      if (hasRawTokens(host)) markTokens(host)
      updateTokenValues(varsRef.current)
    })
    mo.observe(host, { childList: true, subtree: true, characterData: true })
  }

  /* ================= HELPERS ================= */
  function getPath(obj: any, path: string) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj)
  }
  function toNumberLoose(v: any): number | null {
    if (v == null) return null
    if (typeof v === 'number' && Number.isFinite(v)) return v
    const n = Number(String(v).replace(/[^\d.+-]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  function fmtPctLabel(p: number | null): string | null {
    if (p == null || !Number.isFinite(Number(p))) return null
    const s = Number(p).toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
    return `${s}%`
  }
  const firstNonEmpty = (arr: (string | null | undefined)[]) => {
    for (const v of arr) {
      const s = String(v ?? '').trim()
      if (s) return s
    }
    return null
  }

  /** ================== VARS FROM EVENT =================== */
  const buildVarsFromEvent = useCallback((): Record<string, string | null> => {
    const h: any = header || {}
    const s1: any = ec || {}

    const sources = [ h, s1, (s1 as any)?.summary, (s1 as any)?.pricing, (s1 as any)?.totals, (h as any)?.pricing, (h as any)?.payment ]

    const getFrom = (paths: string[]): any => {
      for (const src of sources) {
        for (const p of paths) {
          const v = getPath(src, p)
          if (v !== undefined && v !== null && (typeof v === 'string' ? v.trim() !== '' : true)) return v
        }
      }
      return null
    }
    const getStr = (paths: string[]): string | null => {
      const v = getFrom(paths)
      const s = String(v ?? '').trim()
      return s ? s : null
    }

    const title = getStr(['title','event_name'])
    const rawDate = getFrom(['event_date','date','event.date'])
    const dateStr = rawDate ? formatMaybeDate(String(rawDate)) : null
    const city = getStr(['company_city','city']) || ''
    const cityDate = [city || null, dateStr || null].filter(Boolean).join(', ') || null
    const location = getStr(['location','event.location'])

    const stampTs = (contractStamp ?? readContractStamp(eventId)) ?? Date.now()
    const contractDateStr = stampTs ? fmtDateDDMM.format(new Date(stampTs)) : null
    const contractCityDate = [city || null, contractDateStr || null].filter(Boolean).join(', ') || null

    const peopleNum = (() => {
      const n = toNumberLoose(getFrom(['people_count','attendees','event.attendees']))
      return n != null ? n : null
    })()

    const timeHHmm = (v: any) => {
      if (!v) return null
      const t = Date.parse(v); if (!Number.isFinite(t)) return null
      const d = new Date(t)
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    }
    const startHH = timeHHmm(getFrom(['start_at','event.start_at']))
    const endHH   = timeHHmm(getFrom(['end_at','event.end_at']))
    const duration = (() => {
      const sa = getFrom(['start_at','event.start_at'])
      const ea = getFrom(['end_at','event.end_at'])
      if (!sa || !ea) return null
      let h = (new Date(ea).getTime() - new Date(sa).getTime()) / 3_600_000
      if (!Number.isFinite(h)) return null
      if (h < 0) h += 24
      return Math.max(0, Math.round(h * 100) / 100)
    })()

    const after = toNumberLoose(paris?.totals?.afterDiscounts ?? paris?.pricing?.totalAfterDiscount)
    const grand = toNumberLoose(paris?.totals?.grandPrice)
    const total = after ?? grand ?? toNumberLoose(getFrom([
      'pricing.total_vnd', 'pricing.total',
      'totals.grandPrice', 'totals.afterDiscounts'
    ])) ?? extractTotalFromDocxTotals(docxTotals?.full_html ?? docxTotals?.no_costs_html ?? null)

    const ppay: any = paris?.payment || {}

    const depPctFromParis = toNumberLoose(ppay?.deposit?.percent)
    const balPctFromParis = toNumberLoose(ppay?.balance?.percent)
    const depAmtFromParis = toNumberLoose(ppay?.deposit?.amount_vnd)
    const balAmtFromParis = toNumberLoose(ppay?.balance?.amount_vnd)
    const depDueFromParis = (typeof ppay?.deposit?.due_date === 'string' ? ppay?.deposit?.due_date : null)
    const balDueFromParis = (typeof ppay?.balance?.due_date === 'string' ? ppay?.balance?.due_date : null)
    const isFullFromParis = ppay?.is_full_payment === true

    const depositPctRawFallback = (() => {
      const p = toNumberLoose(getFrom([
        'payment.deposit.percent','payment.deposit_percent','deposit_percent','deposit.percent','depositPercent'
      ]))
      if (p == null) return null
      return p > 1 && p <= 100 ? p : (p >= 0 && p <= 1 ? p * 100 : p)
    })()
    const balancePctRawFallback = (() => {
      const b = toNumberLoose(getFrom(['payment.balance.percent','payment.balance_percent','balance_percent']))
      if (b != null) return b
      if (depositPctRawFallback != null) return Math.max(0, 100 - depositPctRawFallback)
      return null
    })()
    const depositAmtRawFallback = toNumberLoose(getFrom(['payment.deposit.amount_vnd','payment.deposit_amount','deposit_amount']))

    const depositPct = depPctFromParis ?? depositPctRawFallback ?? (
      (depAmtFromParis != null && total != null && total > 0)
        ? Math.round((depAmtFromParis / total) * 100)
        : null
    )
    const balancePct = balPctFromParis ?? balancePctRawFallback ?? (
      depositPct != null ? Math.max(0, 100 - depositPct) : null
    )

    let depositAmt = depAmtFromParis
    let balanceAmt = balAmtFromParis

    if (isFullFromParis && total != null) {
      depositAmt = Math.round(total)
      balanceAmt = 0
    } else {
      if (depositAmt == null) {
        if (depositAmtRawFallback != null) depositAmt = depositAmtRawFallback
        else if (total != null && depositPct != null) depositAmt = Math.round((total * depositPct) / 100)
      }
      if (balanceAmt == null && total != null && depositAmt != null) {
        balanceAmt = Math.max(0, Math.round(total - depositAmt))
      }
    }

    const depositDue = depDueFromParis ?? formatMaybeDate(getStr(['payment.deposit.due_date','deposit_due_date']))
    const balanceDue = balDueFromParis ?? formatMaybeDate(getStr(['payment.balance.due_date','balance_due_date']))

    const latePct    = toNumberLoose(getFrom(['payment.late_interest_per_day_pct','late_interest_per_day_pct']))
    const overtime   = toNumberLoose(getFrom(['payment.overtime_rate_per_hour_vnd','overtime_rate_per_hour_vnd','overtimeRatePerHour']))
    const paymentMethods = getStr(['payment.methods','payment_methods'])

    const itemsHTML = getStr(['contract.items_html','items_html','summary.items_html','summary.itemsHtml'])

    const quotationNo =
      getStr(['quotation_no','contract.quotation_no','quote_no']) ||
      String((s1 as any)?.eventId || '').trim() ||
      null

    const pb = selectedBranch
    const pbCompanyName = pb?.company_name || pb?.name || null
    const pbAddress     = pb?.address || null
    const pbTaxCode     = pb?.tax_code || null
    const pbPhone       = pb?.phone || null
    const pbEmail       = pb?.email || null
    const pbBankName    = pb?.bank || null
    const pbBankAccName = pb?.bank_account_name || null
    const pbAccNumber   = pb?.account_number || null

    const companyName = firstNonEmpty([
      getStr(['client.company_name','client.company']),
      getStr(['customer.company_name','customer.company']),
      getStr(['invoice.company_name','billing.company_name']),
      getStr(['company','company.name']),
      getStr(['organisation','organization']),
    ])
    const personName = firstNonEmpty([
      getStr(['client.full_name','client.name']),
      getStr(['customer.name']),
      getStr(['contact_name','host_name','poc_name','poc']),
    ])
    const resolvedClientName = companyName || personName || null

    const vars: Record<string, string | null> = {
      'event.title': title,
      'event.date.en': dateStr,
      'event.city_date.en': cityDate,
      'event.location': location,
      'event.attendees_count': peopleNum != null ? fmtNum.format(peopleNum) : null,
      'event.time.start': startHH,
      'event.time.end': endHH,
      'event.time.duration_hours': duration != null ? String(duration) : null,

      'client.full_name': resolvedClientName,

      'contract.quotation_no': quotationNo,
      'contract.items_html': itemsHTML,

      'contract.date.en': contractDateStr,
      'contract.city_date.en': contractCityDate,

      'pricing.total_vnd': total != null ? fmtCur.format(total) : null,

      'payment.deposit.percent': fmtPctLabel(depositPct),
      'payment.deposit.amount_vnd': depositAmt != null ? fmtCur.format(depositAmt) : null,
      'payment.deposit.due_date': depositDue,
      'payment.balance.percent': fmtPctLabel(balancePct),
      'payment.balance.amount_vnd': balanceAmt != null ? fmtCur.format(balanceAmt) : null,
      'payment.balance.due_date': balanceDue,
      'payment.late_interest_per_day_pct': fmtPctLabel(latePct),
      'payment.overtime_rate_per_hour_vnd': overtime != null ? fmtCur.format(overtime) : null,

      'payment.methods': paymentMethods,

      'company.name': (pbCompanyName ?? getStr(['company','company.name'])) || null,
      'company.address': (pbAddress ?? getStr(['company_address','company.address'])) || null,
      'company.tax_code': (pbTaxCode ?? getStr(['company_tax_code','company.tax_code'])) || null,
      'company.phone': (pbPhone ?? getStr(['contact_phone','company.phone'])) || null,
      'company.email': (pbEmail ?? getStr(['contact_email','company.email'])) || null,
      'director.name': getStr(['company_director','director.name']),
      'director.position': getStr(['director.position','company_director_position','directorPosition']),

      'bank.name': (pbBankName ?? getStr(['bank_name','bank.name'])) || null,
      'bank.account_name': (pbBankAccName ?? getStr(['bank_account_name','bank.account_name'])) || null,
      'bank.account_number': (pbAccNumber ?? getStr(['bank_account_number','bank.account_number'])) || null,

      'invoice.company_name': getStr(['invoice_company_name','invoice.company_name','company','company.name']) || (pbCompanyName ?? null),
      'invoice.address'     : getStr(['invoice_address','invoice.address','company_address','company.address']) || (pbAddress ?? null),
      'invoice.tax_code'    : getStr(['invoice_tax_code','invoice.tax_code','company_tax_code','company.tax_code']) || (pbTaxCode ?? null),
      'invoice.email'       : getStr(['invoice_email','invoice.email','billing_email','contact_email','company.email']) || (pbEmail ?? null),

      'clauses.cancellation_html': null,
      'clauses.liability_html': null,
      'clauses.force_majeure_html': null,
      'clauses.dispute_resolution_html': null,

      'signature.client.position': null,
      'signature.provider.position': null,
      'signature.client.date': null,
      'signature.provider.date': null,

      'docx_totals.full_html': normalizeTotalsHTML(docxTotals?.full_html ?? null),
      'docx_totals.no_costs_html': normalizeTotalsHTML(docxTotals?.no_costs_html ?? null),
    }
    return vars
  }, [header, ec, fmtCur, fmtNum, fmtDateDDMM, paris, selectedBranch, docxTotals, contractStamp, eventId])

  useEffect(() => {
    varsRef.current = buildVarsFromEvent()
    const host = document.querySelector('#sd-editor .ProseMirror') as HTMLElement | null
    if (host) {
      if (hasRawTokens(host)) markTokens(host)
      updateTokenValues(varsRef.current)
    }
  }, [buildVarsFromEvent])

  /** ================== BOOT SUPERDOC =================== */
  useEffect(() => {
    let cancelled = false

    const boot = async () => {
      setSdReady(false)

      let documentSrc: string | File | Blob | null = null
      if (eventId) {
        const folder = `events/${eventId}`
        const exists  = await fileExists(CONTRACTS_BUCKET, folder, 'contract.docx')
        if (exists) {
          const url = await signedUrl(CONTRACTS_BUCKET, CONTRACT_PATH(eventId))
          if (url) documentSrc = url
        }
      }

      let templateHTML: string | null = null
      if (!documentSrc) {
        try {
          const { data } = await supabase
            .from('contract_templates')
            .select('docx_path, html')
            .eq('key', DEFAULT_KEY)
            .limit(1)
            .maybeSingle()

          const row = data as TemplateRow | null

          if (row?.docx_path) {
            const url = await signedUrl(TEMPLATE_BUCKET, row.docx_path)
            if (url) documentSrc = url
          }
          if (!documentSrc && row?.html) {
            templateHTML = row.html
          }
        } catch (e) {
          console.warn('[contract] read template failed:', errMsg(e))
        }
      }

      if (!documentSrc) documentSrc = '/blank.docx'

      try { sdRef.current?.destroy?.() } catch {}
      editorRef.current = null

      const sd = new SuperDoc({
        selector: '#sd-editor',
        toolbar: '#sd-toolbar',
        document: documentSrc,
        documentMode: 'editing',
        pagination: true,
        rulers: true,
        modules: { toolbar: { responsiveToContainer: true, hideButtons: false } },
        onReady: () => {
          if (cancelled) return
          setSdReady(true)
          iconifyToolbarLabels()
          requestAnimationFrame(() => {
            iconifyToolbarLabels()
            attachContentObserver()
            updateTokenValues(varsRef.current)
          })
        },
        onEditorCreate: (ev: any) => {
          if (cancelled) return
          editorRef.current = ev?.editor || ev
          if (documentSrc === '/blank.docx' && templateHTML) {
            try { editorRef.current?.commands?.insertContent(templateHTML, { contentType: 'html' }) } catch {}
          }
          setSdReady(true)
        },
      })
      sdRef.current = sd
    }

    boot()
    return () => {
      try { sdRef.current?.destroy?.() } catch {}
      sdRef.current = null
      editorRef.current = null
    }
  }, [eventId])

  /** ============== EXPORT HELPERS ============== */
  const getExporter = (): { name: string; fn: () => Promise<Blob | undefined> } | null => {
    const ed = editorRef.current
    const sd = sdRef.current
    if (ed?.exportDocx && typeof ed.exportDocx === 'function') return { name: 'editor.exportDocx', fn: ed.exportDocx.bind(ed) }
    if (ed?.commands?.exportDocx && typeof ed.commands.exportDocx === 'function') return { name: 'editor.commands.exportDocx', fn: ed.commands.exportDocx.bind(ed.commands) }
    if (sd?.exportDocx && typeof sd.exportDocx === 'function') return { name: 'superdoc.exportDocx', fn: sd.exportDocx.bind(sd) }
    if (sd?.editor?.exportDocx && typeof sd.editor.exportDocx === 'function') return { name: 'superdoc.editor.exportDocx', fn: sd.editor.exportDocx.bind(sd.editor) }
    if (sd?.getEditor && typeof sd.getEditor === 'function') {
      try {
        const ed2 = sd.getEditor()
        if (ed2?.exportDocx && typeof ed2.exportDocx === 'function') return { name: 'superdoc.getEditor().exportDocx', fn: ed2.exportDocx.bind(ed2) }
      } catch {}
    }
    return null
  }

  const runWithTimeout = async <T,>(p: Promise<T>, ms = 20000): Promise<T> => {
    let to: number
    const timeout = new Promise<never>((_, rej) => { to = window.setTimeout(() => rej(new Error('export timeout')), ms) })
    try { return await Promise.race([p, timeout]) as T }
    finally { window.clearTimeout(to!) }
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      try { URL.revokeObjectURL(url) } catch {}
      try { document.body.removeChild(a) } catch {}
    }, 0)
  }

  /** ================== ACTIONS ================== */
  const insertVar = (key: string) => {
    editorRef.current?.commands?.insertContent(`{{${key}}}`, { contentType: 'text' })
    requestAnimationFrame(() => {
      const host = document.querySelector('#sd-editor .ProseMirror') as HTMLElement | null
      if (host && hasRawTokens(host)) {
        markTokens(host)
        updateTokenValues(varsRef.current)
      }
    })
  }

  const saveContractDocx = async () => {
    if (!sdReady || !editorRef.current) { flash('Editor not ready'); return }
    if (!eventId) { flash('Missing event id'); return }

    ensureContractStamp(eventId)
    varsRef.current = buildVarsFromEvent()
    {
      const host = document.querySelector('#sd-editor .ProseMirror') as HTMLElement | null
      if (host) updateTokenValues(varsRef.current)
    }

    try {
      setSaving(true)
      editorRef.current?.commands?.blur?.()
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

      downgradeTableHeadersInEditor()
      await inlineImagesPermanent()

      const exporter = getExporter()
      if (!exporter) { flash('Exporter not available'); return }

      const blob: Blob | undefined = await runWithTimeout(exporter.fn())
      if (!blob) { flash('DOCX export failed'); return }

      const path = CONTRACT_PATH(String(eventId))
      const { error } = await supabase.storage
        .from(CONTRACTS_BUCKET)
        .upload(path, blob, {
          upsert: true,
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
      if (error) throw error

      flash('Contract saved (DOCX)')
    } catch (e) {
      console.error('[contract] Save DOCX exception:', e)
      flash('Save error')
    } finally {
      setSaving(false)
    }
  }

  const doExportDocx = async () => {
    if (!sdReady) { flash('Editor not ready'); return }
    if (exporting) return
    setExporting(true)

    ensureContractStamp(eventId)
    varsRef.current = buildVarsFromEvent()
    {
      const host = document.querySelector('#sd-editor .ProseMirror') as HTMLElement | null
      if (host) updateTokenValues(varsRef.current)
    }

    try {
      editorRef.current?.commands?.blur?.()
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

      downgradeTableHeadersInEditor()
      const runId = makeRunId()
      const restore = await inlineEditorImagesStrict(runId)

      try {
        const exporter = getExporter()
        if (!exporter) { flash('Exporter not available'); restore(); return }

        const blob = await runWithTimeout(exporter.fn(), 20000)
        if (!blob || blob.size === 0) { flash('DOCX export failed'); restore(); return }

        const fname = `contract_${eventId || 'draft'}.docx`
        downloadBlob(blob, fname)
        flash('DOCX exported')
      } finally {
        restore()
      }
    } catch (e) {
      console.error('Export DOCX exception:', errMsg(e))
      flash('Export error')
    } finally {
      setShowExportMenu(false)
      setExporting(false)
    }
  }

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!showExportMenu) return
      const target = e.target as Node
      if (exportBtnRef.current?.contains(target)) return
      const menu = document.getElementById('export-menu')
      if (menu && menu.contains(target)) return
      setShowExportMenu(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showExportMenu])

  /* =================== UI =================== */
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="ct-wrap">
        <div className="ct-actions">
          <div className="ct-title">
            <span>Service Contract</span>
            <span className="ct-sub">— {(header?.title || header?.event_name) ? String(header?.title || header?.event_name) : ''}</span>
          </div>

          <div style={{ position: 'relative', display:'flex', gap:8, alignItems:'center' }}>
            <button className="tool-btn" onClick={() => router.back()}>
              ← {t('Back', 'Back')}
            </button>

            <button
              className="tool-btn"
              onClick={async () => {
                try {
                  setContractStampNow(eventId)
                  varsRef.current = buildVarsFromEvent()
                  {
                    const host = document.querySelector('#sd-editor .ProseMirror') as HTMLElement | null
                    if (host) updateTokenValues(varsRef.current)
                  }

                  setSdReady(false)
                  let documentSrc: string | File | Blob | null = null
                  let templateHTML: string | null = null
                  try {
                    const { data } = await supabase
                      .from('contract_templates')
                      .select('docx_path, html')
                      .eq('key', DEFAULT_KEY)
                      .limit(1)
                      .maybeSingle()

                    const row = data as TemplateRow | null

                    if (row?.docx_path) {
                      const url = await signedUrl(TEMPLATE_BUCKET, row.docx_path)
                      if (url) documentSrc = url
                    }
                    if (!documentSrc && row?.html) templateHTML = row.html
                  } catch {}

                  try { sdRef.current?.destroy?.() } catch {}
                  editorRef.current = null

                  const sd = new SuperDoc({
                    selector: '#sd-editor',
                    toolbar: '#sd-toolbar',
                    document: documentSrc || '/blank.docx',
                    documentMode: 'editing',
                    pagination: true,
                    rulers: true,
                    modules: { toolbar: { responsiveToContainer: true, hideButtons: false } },
                    onReady: () => {
                      setSdReady(true)
                      iconifyToolbarLabels()
                      requestAnimationFrame(() => { iconifyToolbarLabels(); attachContentObserver(); updateTokenValues(varsRef.current) })
                    },
                    onEditorCreate: (ev: any) => {
                      editorRef.current = ev?.editor || ev
                      if (!documentSrc && templateHTML) {
                        try { editorRef.current?.commands?.insertContent(templateHTML, { contentType: 'html' }) } catch {}
                      }
                    },
                  })
                  sdRef.current = sd
                } catch {
                  flash('Reset error')
                }
              }}
            >
              {t('Reset', 'Reset')}
            </button>

            <button className="tool-btn primary" onClick={saveContractDocx} disabled={!sdReady || saving || !eventId}>
              {saving ? t('Saving…','Saving…') : t('Save','Save')}
            </button>

            <div style={{ position:'relative' }}>
              <button ref={exportBtnRef} className="tool-btn" onClick={() => setShowExportMenu(v => !v)}>
                {t('Export', 'Export')} ▾
              </button>
              {showExportMenu && (
                <div id="export-menu" className="menu" style={{ right: 0 }}>
                  <button onClick={doExportDocx} disabled={!sdReady || exporting}>
                    {exporting ? t('Exporting…','Exporting…') : t('Export as DOCX','Export as DOCX')}
                  </button>
                </div>
              )}
            </div>

            <span className="status">{status}</span>
          </div>
        </div>

        <div className="ct-toolbar-shell">
          <SDToolbarHost />
        </div>

        <div className="ct-editor-shell">
          <SDEditorHost />
        </div>

        <aside className="ct-sidebar">
          <div style={{display:'flex',gap:8,marginBottom:8}}>
            <button className="tab-btn" aria-pressed={activeTab==='profile'} onClick={()=>setActiveTab('profile')}>{t('Profile','Profile')}</button>
            <button className="tab-btn" aria-pressed={activeTab==='event'} onClick={()=>setActiveTab('event')}>{t('Event','Event')}</button>
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
                <button className="tool-btn" onClick={()=>insertVar(item.key)} disabled={!sdReady}>{t('Insert','Insert')}</button>
              </div>
            ))}
          </div>
          <div className="ct-note">Powered by SuperDoc</div>
        </aside>
      </div>
    </>
  )
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
  { key: 'payment.overtime_rate_per_hour_vnd', label: 'Overtime per hour (global currency symbol)'},
  { key: 'clauses.cancellation_html', label: 'Clause: cancellation (HTML)' },
  { key: 'clauses.liability_html', label: 'Clause: liability (HTML)' },
  { key: 'clauses.force_majeure_html', label: 'Clause: force majeure (HTML)' },
  { key: 'clauses.dispute_resolution_html', label: 'Clause: dispute (HTML)' },
]

const EVENT_PLACEHOLDERS = [
  { key: 'contract.quotation_no', label: 'Quotation no.' },
  { key: 'event.city_date.en', label: 'City + date (EN)' },
  { key: 'contract.city_date.en', label: 'Contract city + date (EN)' },
  { key: 'contract.date.en', label: 'Contract date (EN)' },
  { key: 'client.full_name', label: 'Client full name' },
  { key: 'event.title', label: 'Event title' },
  { key: 'event.date.en', label: 'Event date (EN)' },
  { key: 'event.location', label: 'Event location' },
  { key: 'event.attendees_count', label: 'Attendees' },
  { key: 'event.time.start', label: 'Start time' },
  { key: 'event.time.end', label: 'End time' },
  { key: 'event.time.duration_hours', label: 'Duration (h)' },
  { key: 'contract.items_html', label: 'Items (HTML)' },
  { key: 'pricing.total_vnd', label: 'Total (global currency symbol)' },
  { key: 'payment.deposit.amount_vnd', label: 'Deposit amount (derived)'},
  { key: 'payment.deposit.due_date', label: 'Deposit due date' },
  { key: 'payment.balance.percent', label: 'Balance %' },
  { key: 'payment.balance.amount_vnd', label: 'Balance amount (derived)' },
  { key: 'payment.balance.due_date', label: 'Balance due date' },
  { key: 'signature.client.position', label: 'Signature: client position' },
  { key: 'signature.provider.position', label: 'Signature: provider position' },
  { key: 'signature.client.date', label: 'Signature: client date' },
  { key: 'signature.provider.date', label: 'Signature: provider date' },
  { key: 'docx_totals.full_html', label: 'Totals table (HTML)' },
  { key: 'docx_totals.no_costs_html', label: 'Totals no-costs (HTML)' },
]