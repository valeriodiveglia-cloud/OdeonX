'use client'

export type ExportMode =
  | 'summary_full'
  | 'quote_no_costs'
  | 'quote_summary'   // Event Info + Menu (dish - modifiers + qty) + Totals (keep Payment due), no KPI, no costs
  | 'menu_only'
  | 'contract'
  | 'payment_note'    // Event Info + Totals (keep Payment due), no KPI, no costs, NO menu
  | 'liquidation'

type HeaderLike = {
  id?: string | null
  event_id?: string | null
  eventId?: string | null
  title?: string | null
  event_name?: string | null
  event_date?: string | null
}

const STABLE_FONT = 'Arial, Helvetica, sans-serif'

function modeLabel(mode: ExportMode) {
  switch (mode) {
    case 'menu_only': return 'Menu'
    case 'quote_no_costs': return 'Quotation'
    case 'quote_summary': return 'Quotation'
    case 'summary_full': return 'Event Summary'
    case 'contract': return 'Contract'
    case 'payment_note': return 'Note of Payment'
    case 'liquidation': return 'Liquidation'
    default: return 'Export'
  }
}

function sanitizePart(s?: string | null) {
  return (s || '').toString().trim().replace(/[<>:"/\\|?*]+/g, ' ')
}

function buildTitle(header?: HeaderLike | null, mode: ExportMode = 'summary_full', eventId?: string | null) {
  const parts: string[] = []
  parts.push(modeLabel(mode))
  const title = sanitizePart(header?.title || header?.event_name)
  const date = sanitizePart(header?.event_date)
  if (title) parts.push(title)
  if (date) parts.push(date)
  if (eventId) parts.push(`ID ${sanitizePart(eventId)}`)
  return parts.join(' - ')
}

function buildExportCSS(mode: ExportMode) {
  return `
    .no-print, .export-modal { display: none !important; }
    .print-container button[aria-expanded] span:last-child { display: none !important; }
    .print-container button[aria-expanded] { pointer-events: none !important; }
    .print-container { box-shadow: none !important; border: none !important; background: #fff !important; }
    .bg-gray-50 { background: transparent !important; }
    .shadow, .shadow-sm, .shadow-md, .shadow-lg { box-shadow: none !important; }
    td.price-col, th.price-col { text-align: right !important; width: 180px !important; }
    .tabular-nums { font-variant-numeric: tabular-nums; }
    .kpi-budget .kpi-value { white-space: nowrap !important; }

    /* stabilize text */
    .print-container,
    .print-container * {
      font-family: ${STABLE_FONT} !important;
      letter-spacing: 0 !important;
      font-kerning: none !important;
      font-variant-ligatures: none !important;
      font-feature-settings: "kern" 0, "liga" 0, "clig" 0, "calt" 0 !important;
      text-rendering: geometricPrecision !important;
    }
    .print-container h1, .print-container h2, .print-container h3,
    .print-container th, .print-container td,
    .print-container div, .print-container p, .print-container span,
    .print-container .text-xs, .print-container .text-sm,
    .print-container .text-[11px] {
      line-height: 1.35 !important;
    }
    .print-container .break-words {
      word-break: normal !important;
      overflow-wrap: normal !important;
      white-space: normal !important;
    }

    /* QUOTATION (no costs) */
    body[data-export-mode='quote_no_costs'] .print-hide-costs { display: none !important; }
    body[data-export-mode='quote_no_costs'] .markup-flag { display: none !important; }
    body[data-export-mode='quote_no_costs'] .kpi-grid { display: none !important; }
    body[data-export-mode='quote_no_costs'] td.price-col,
    body[data-export-mode='quote_no_costs'] th.price-col { text-align: right !important; }

    /* QUOTATION SUMMARY (no costs, no KPI) */
    body[data-export-mode='quote_summary'] .print-hide-costs { display: none !important; }
    body[data-export-mode='quote_summary'] .markup-flag { display: none !important; }
    body[data-export-mode='quote_summary'] .kpi-grid { display: none !important; }
    body[data-export-mode='quote_summary'] td.price-col,
    body[data-export-mode='quote_summary'] th.price-col { text-align: right !important; }

    /* PAYMENT NOTE (come quote_summary ma senza menu) */
    body[data-export-mode='payment_note'] .print-hide-costs { display: none !important; }
    body[data-export-mode='payment_note'] .markup-flag { display: none !important; }
    body[data-export-mode='payment_note'] .kpi-grid { display: none !important; }

    /* MENU ONLY */
    body[data-export-mode='menu_only'] .print-hide-when-menu { display: none !important; }
    body[data-export-mode='menu_only'] .print-hide-menu-money { display: none !important; }
    body[data-export-mode='menu_only'] .markup-flag { display: none !important; }
    body[data-export-mode='menu_only'] .bundles-subtotal-row { display: none !important; }

    /* placeholders */
    body[data-export-mode='contract'] .print-hide-when-contract { display: none !important; }
    body[data-export-mode='payment_note'] .print-hide-when-payment { display: none !important; }
    body[data-export-mode='liquidation'] .print-hide-when-liquidation { display: none !important; }

    .print-container .px-3.py-2 { padding-top: 6px !important; padding-bottom: 6px !important; }
    .print-container .px-4.py-3 { padding-top: 8px !important; padding-bottom: 8px !important; }
  `.trim()
}

/* colors for html2canvas */
function buildSanitizeColorsCSS() {
  return `
    *::before, *::after, * {
      background-image: none !important;
      color: #111 !important;
      border-color: #E5E7EB !important;
      text-shadow: none !important;
      box-shadow: none !important;
    }
    .print-container { background-color: #ffffff !important; }
    .bg-gray-50 { background-color: #F9FAFB !important; }
  `.trim()
}

function injectExportStyles(mode: ExportMode): HTMLStyleElement {
  const style = document.createElement('style')
  style.setAttribute('data-export-style', '1')
  style.appendChild(document.createTextNode(buildExportCSS(mode)))
  document.head.appendChild(style)
  document.body.setAttribute('data-export-mode', mode)
  return style
}
function removeExportStyles(styleEl: HTMLStyleElement) {
  try { styleEl.remove() } catch {}
  document.body.removeAttribute('data-export-mode')
}

function resolveEventId(header?: HeaderLike | null, pageRoot?: HTMLElement | null): string | null {
  const candidates = [
    header?.event_id, header?.eventId, header?.id,
    pageRoot?.getAttribute?.('data-event-id') || null
  ].filter(Boolean) as string[]
  if (candidates.length) return candidates[0]!
  try {
    return (
      localStorage.getItem('event_current_id') ||
      localStorage.getItem('eventId') ||
      localStorage.getItem('eventcalc.draftEventId')
    )
  } catch { return null }
}

/* Locate the Bundles & Menu section in the live DOM */
function findBundlesSectionRoot(): HTMLElement | null {
  const sections = Array.from(document.querySelectorAll<HTMLElement>('.print-section'))
  for (const sec of sections) {
    const titleSpan = sec.querySelector('button span')
    const title = titleSpan?.textContent?.trim()
    if (title === 'Bundles & Menu') {
      const body = sec.querySelector<HTMLElement>('.p-4')
      if (body) return body
    }
  }
  return null
}

/* Build the "Menu" card (Dish - modifiers + Qty) from the Bundles DOM */
function buildMenuCardFromBundlesDOM(): HTMLElement | null {
  const bundlesRoot = findBundlesSectionRoot()
  if (!bundlesRoot) return null

  const card = document.createElement('div')
  card.className = 'card'
  card.innerHTML = `<div class="hd">Menu</div><div class="bd"></div>`
  const bd = card.querySelector('.bd')!

  const bundleContainers = Array.from(
    bundlesRoot.querySelectorAll<HTMLElement>('div.border.rounded-lg, div.border.rounded-xl')
  )

  let anyRows = false

  bundleContainers.forEach((container, idx) => {
    const hd = container.querySelector<HTMLElement>('.px-3.py-2.bg-gray-50 span')
    const bundleLabel = (hd?.textContent || '').trim() || `Bundle ${idx + 1}`

    const table = container.querySelector<HTMLTableElement>('table')
    if (!table) return

    const rows = Array.from(table.querySelectorAll('tbody tr'))
    const simplifiedRows: Array<{ item: string; qty: string }> = []

    rows.forEach(tr => {
      const cells = tr.querySelectorAll('td')
      if (!cells || cells.length === 0) return

      const dish = (cells[0]?.textContent || '').trim()
      const modsTextRaw = (cells[1]?.textContent || '').trim()
      const mods = modsTextRaw && modsTextRaw !== '–' ? modsTextRaw : ''
      const qty = (cells[2]?.textContent || '').trim()

      if (dish && qty) {
        const itemCombined = mods ? `${dish} - ${mods}` : dish
        simplifiedRows.push({ item: itemCombined, qty })
      }
    })

    if (simplifiedRows.length > 0) {
      anyRows = true

      const h = document.createElement('div')
      h.style.fontWeight = '600'
      h.style.margin = '6px 0 4px'
      h.textContent = bundleLabel
      bd.appendChild(h)

      const t = document.createElement('table')
      t.innerHTML = `
        <thead>
          <tr class="bg-gray-50 text-gray-700">
            <th class="text-left">Menu item</th>
            <th class="text-right" style="width:110px">Qty</th>
          </tr>
        </thead>
        <tbody></tbody>
      `
      const tb = t.querySelector('tbody')!
      simplifiedRows.forEach(({ item, qty }) => {
        const tr = document.createElement('tr')
        const tdItem = document.createElement('td')
        tdItem.textContent = item
        const tdQty = document.createElement('td')
        tdQty.textContent = qty
        tdQty.className = 'text-right tabular-nums'
        tr.appendChild(tdItem)
        tr.appendChild(tdQty)
        tb.appendChild(tr)
      })
      bd.appendChild(t)
    }
  })

  if (!anyRows) return null
  return card
}

/* Costruisce container “summary-like”.
   - quote_summary: includeMenu = true, title "Quotation"
   - payment_note:  includeMenu = false, title "Note of Payment"
   Entrambi: Event Info (Title -> Event ID), Totals (no KPI, costi hidden via CSS) */
function buildQuoteSummaryContainer(
  eventId?: string | null,
  includeMenu: boolean = true,
  docMode: ExportMode = 'quote_summary'
): { node: HTMLElement; cleanup: () => void } {
  const info = document.getElementById('event-info-print-block')
  const totals = document.getElementById('totals-print-block')

  const holder = document.createElement('div')
  holder.id = 'quote-summary-canvas-root'
  holder.style.position = 'fixed'
  holder.style.left = '-10000px'
  holder.style.top = '0'
  holder.style.width = '900px'
  holder.style.padding = '16px'
  holder.style.background = '#ffffff'
  holder.style.zIndex = '999999'
  holder.className = 'print-container'

  const css = document.createElement('style')
  css.textContent = `
    #quote-summary-canvas-root { font-family: ${STABLE_FONT}; }
    #quote-summary-canvas-root .section-title { font-size: 16px; font-weight: 700; margin: 0 0 8px; }
    #quote-summary-canvas-root .card { border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; margin-bottom: 16px; }
    #quote-summary-canvas-root .card .hd { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; background: #f9fafb; font-weight: 600; }
    #quote-summary-canvas-root .card .bd { padding: 12px; }
    #quote-summary-canvas-root table { width: 100%; border-collapse: collapse; table-layout: auto; }
    #quote-summary-canvas-root th, #quote-summary-canvas-root td { padding: 6px 8px; vertical-align: top; }
    #quote-summary-canvas-root td.price-col, #quote-summary-canvas-root th.price-col { text-align: right; }
    #quote-summary-canvas-root .tabular-nums { font-variant-numeric: tabular-nums; }
  `
  holder.appendChild(css)

  const title = document.createElement('div')
  title.className = 'section-title'
  title.textContent = modeLabel(docMode)
  holder.appendChild(title)

  const infoCard = document.createElement('div')
  infoCard.className = 'card'
  infoCard.innerHTML = `<div class="hd">Event Info</div><div class="bd"></div>`
  holder.appendChild(infoCard)
  if (info) {
    const infoClone = info.cloneNode(true) as HTMLElement

    const allDivs = Array.from(infoClone.querySelectorAll('div'))
    const labelEl = allDivs.find(el => el.textContent?.trim() === 'Title')
    if (labelEl) {
      labelEl.textContent = 'Event ID'
      const container = labelEl.parentElement
      const valueEl = container && (container.children[1] as HTMLElement | undefined)
      if (valueEl) valueEl.textContent = eventId || '—'
    }

    infoCard.querySelector('.bd')!.appendChild(infoClone)
  }

  if (includeMenu) {
    const menuCard = buildMenuCardFromBundlesDOM()
    if (menuCard) holder.appendChild(menuCard)
  }

  const totalsCard = document.createElement('div')
  totalsCard.className = 'card'
  totalsCard.innerHTML = `<div class="hd">Totals</div><div class="bd"></div>`
  holder.appendChild(totalsCard)
  if (totals) {
    const tClone = totals.cloneNode(true) as HTMLElement
    tClone.querySelectorAll('.kpi-grid').forEach(el => el.remove())
    tClone.querySelectorAll('table tr').forEach(tr =>
      tr.querySelectorAll('th,td').forEach((c: Element) =>
        (c as HTMLElement).classList.add('tabular-nums')
      )
    )
    // Export-only: rinomina "Bundles" -> "Menu Bundles" nella tabella Totals del container clonato
    tClone.querySelectorAll('table tbody tr td:first-child').forEach((cell) => {
      if (cell.textContent?.trim() === 'Bundles') {
        cell.textContent = 'Menu Bundles'
      }
    })
    totalsCard.querySelector('.bd')!.appendChild(tClone)
  }

  document.body.appendChild(holder)
  const cleanup = () => { try { holder.remove() } catch {} }
  return { node: holder, cleanup }
}

/* --- tagli pagina DOM-aware (no cambio layout) --- */
function collectDomCutCandidates(root: HTMLElement): number[] {
  const rootRect = root.getBoundingClientRect()
  const set = new Set<number>()
  const selectors = [
    'tr', 'thead', 'tbody', 'table',
    '.card', '.section-title', '.print-section',
    '#event-info-print-block', '#totals-print-block',
    '.px-3.py-2', '.px-4.py-3', '.border', '.rounded-lg', '.rounded-xl', '.p-4', '.bd', '.hd'
  ].join(',')
  const elems = Array.from(root.querySelectorAll<HTMLElement>(selectors))
  elems.forEach(el => {
    const r = el.getBoundingClientRect()
    set.add(Math.max(0, Math.round(r.bottom - rootRect.top)))
  })
  set.add(Math.max(0, Math.round(rootRect.height)))
  const arr = Array.from(set)
  arr.sort((a, b) => a - b)
  return arr
}

/* --- chiusura forzata del modale export (senza toccare layout del documento) --- */
function ensureModalClosed() {
  try {
    // prova click su bottoni "close"
    const closeSel = [
      '[data-close]', '[data-dismiss]', '[data-action="close"]',
      '[aria-label="Close"]', '.btn-close', '.close'
    ].join(',')
    document.querySelectorAll<HTMLButtonElement>(closeSel).forEach(btn => {
      if (btn.offsetParent !== null) btn.click()
    })

    // nascondi dialog/backdrop comuni
    const modals = document.querySelectorAll<HTMLElement>(
      '.export-modal, [data-export-modal], [role="dialog"], .modal, .dialog'
    )
    modals.forEach(m => {
      m.style.display = 'none'
      m.removeAttribute('open')
      m.setAttribute('aria-hidden', 'true')
    })
    document.querySelectorAll<HTMLElement>('.modal-backdrop, .export-backdrop, .backdrop, .fixed.inset-0.bg-black, .fixed.inset-0.bg-gray-900\\/50')
      .forEach(b => { b.style.display = 'none' })

    document.body.classList.remove('overflow-hidden', 'modal-open')
    if ((document.body.style as any).overflow !== undefined) {
      document.body.style.overflow = ''
    }
  } catch {}
}

export async function exportSummaryPdf(opts: {
  header?: HeaderLike | null
  mode?: ExportMode
  onBeforePrint?: () => void
  onAfterPrint?: () => void
} = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const { header, mode = 'summary_full', onBeforePrint, onAfterPrint } = opts

  const pageRoot =
    document.getElementById('event-summary-root') ||
    document.querySelector<HTMLElement>('.print-container')
  if (!pageRoot) {
    console.warn('[exportPdf] printable root not found')
    return
  }

  const eventId = resolveEventId(header, pageRoot)

  const summaryCtx =
    mode === 'quote_summary'
      ? buildQuoteSummaryContainer(eventId, true, mode)
      : mode === 'payment_note'
      ? buildQuoteSummaryContainer(eventId, false, mode)
      : null

  const captureRoot: HTMLElement = summaryCtx?.node || pageRoot

  const styleEl = injectExportStyles(mode)
  onBeforePrint?.()

  try {
    const h2cMod = await import('html2canvas')
    const Html2Canvas = (h2cMod as any).default || (h2cMod as any)

    const jsPdfMod: any = await import('jspdf')
    const JsPDFCtor =
      jsPdfMod.jsPDF ||
      (jsPdfMod.default && jsPdfMod.default.jsPDF) ||
      jsPdfMod.default ||
      jsPdfMod
    if (!Html2Canvas || !JsPDFCtor) {
      console.error('[exportPdf] missing html2canvas or jsPDF')
      return
    }

    const domCuts = collectDomCutCandidates(captureRoot)

    const canvas = await Html2Canvas(captureRoot, {
      scale: Math.min(2, window.devicePixelRatio || 1),
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      letterRendering: true,
      removeContainer: true,
      windowWidth: document.documentElement.clientWidth,
      onclone: (clonedDoc: Document) => {
        const styleInClone = clonedDoc.createElement('style')
        styleInClone.textContent = buildExportCSS(mode) + '\n' + buildSanitizeColorsCSS()
        clonedDoc.head.appendChild(styleInClone)

        const cloneRoot =
          clonedDoc.getElementById(captureRoot.id) ||
          clonedDoc.querySelector('.print-container')
        if (cloneRoot instanceof HTMLElement) {
          cloneRoot.style.backgroundColor = '#ffffff'
          cloneRoot.style.fontFamily = STABLE_FONT
          cloneRoot.style.letterSpacing = '0'
          cloneRoot.style.lineHeight = '1.35'
        }

        // Rinomina "Bundles" -> "Menu Bundles" nei Totals quando esporti la pagina intera (no summaryCtx)
        if (!summaryCtx) {
          const totalsBlock = clonedDoc.getElementById('totals-print-block')
          totalsBlock?.querySelectorAll('table tbody tr td:first-child')?.forEach((cell) => {
            if (cell.textContent?.trim() === 'Bundles') {
              cell.textContent = 'Menu Bundles'
            }
          })
        }

        if (mode === 'quote_no_costs' && !summaryCtx) {
          clonedDoc.querySelectorAll('.print-container table').forEach((table) => {
            table.querySelectorAll('tr').forEach((tr) => {
              const cells = tr.querySelectorAll('th,td')
              const last = cells[cells.length - 1] as HTMLElement | undefined
              if (last) last.classList.add('price-col', 'tabular-nums')
            })
          })
        }
      },
    })

    const pdf = new JsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
    pdf.setProperties?.({ title: buildTitle(header, mode, eventId) })

    const margin = 10
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const innerWidth = pageWidth - margin * 2
    const innerHeight = pageHeight - margin * 2

    const imgWidth = innerWidth
    const pxPerMm = canvas.width / imgWidth
    const pageHeightPx = innerHeight * pxPerMm

    const rootWidthDom = captureRoot.getBoundingClientRect().width || captureRoot.offsetWidth || 1
    const domToCanvas = canvas.width / rootWidthDom
    const cutCandidates = domCuts.map(y => Math.max(1, Math.round(y * domToCanvas)))

    const GUARD = Math.round(8 * domToCanvas)
    const MIN_SLICE = Math.round(24 * domToCanvas)

    function findCutY(naiveEnd: number, startY: number): number {
      const target = Math.min(canvas.height, Math.max(startY + MIN_SLICE, naiveEnd - GUARD))
      let best = -1
      for (let i = cutCandidates.length - 1; i >= 0; i--) {
        const c = cutCandidates[i]
        if (c <= target && c >= startY + MIN_SLICE) { best = c; break }
      }
      if (best > 0) return best
      return Math.min(canvas.height, Math.max(startY + MIN_SLICE, naiveEnd))
    }

    let added = false
    let y = 0
    while (y < canvas.height) {
      const naiveEnd = Math.min(canvas.height, y + pageHeightPx)
      const cutY = findCutY(naiveEnd, y)
      const sliceH = Math.max(1, cutY - y)

      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = sliceH
      const ctx = pageCanvas.getContext('2d')!
      ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH)

      const imgData = pageCanvas.toDataURL('image/jpeg', 1.0)
      const sliceHmm = sliceH / pxPerMm
      if (added) pdf.addPage()
      pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, sliceHmm, undefined, 'FAST')

      added = true
      y = cutY
    }

    const filename = `${buildTitle(header, mode, eventId)}.pdf`
    pdf.save(filename)
  } catch (e) {
    console.error('[exportPdf] export failed:', e)
  } finally {
    removeExportStyles(styleEl)
    try { summaryCtx?.cleanup?.() } catch {}
    ensureModalClosed()            // <- chiusura forzata modale/export overlay
    onAfterPrint?.()
  }
}