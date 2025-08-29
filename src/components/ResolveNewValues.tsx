// src/components/ResolveNewValues.tsx
'use client'
import { useMemo, useState } from 'react'

export type CsvRow = {
  key: string           // identificatore univoco riga CSV
  name: string
  category_csv?: string | null
  supplier_csv?: string | null
  brand?: string | null
  uom_csv?: string | null
}

type Cat = { id: number; name: string }
type Sup = { id: string; name: string }

export type MaterialLite = {
  id: string
  name: string
  category_id: number | null
  supplier_id: string | null
}

export type RowItem = {
  key: string
  incoming: CsvRow
  current?: MaterialLite | null   // se esiste già, per mostrare “conflict”
}

export type ResolveChoice = {
  // per ogni riga: o seleziono un id esistente, o creo il nuovo nome
  perRow: Record<string, {
    categoryId?: number
    supplierId?: string
    addCategoryName?: string
    addSupplierName?: string
  }>
  // set da creare in batch prima di mappare le righe
  createCategories: string[]
  createSuppliers: string[]
}

export default function ResolveNewValues(props: {
  rows: RowItem[]
  cats: Cat[]
  sups: Sup[]
  onCancel: () => void
  onConfirm: (choice: ResolveChoice) => void
}) {
  const { rows, cats, sups, onCancel, onConfirm } = props

  const catNames = useMemo(() => new Set(cats.map(c => c.name.toLowerCase().trim())), [cats])
  const supNames = useMemo(() => new Set(sups.map(s => s.name.toLowerCase().trim())), [sups])

  const [choice, setChoice] = useState<ResolveChoice>({
    perRow: {},
    createCategories: [],
    createSuppliers: [],
  })

  function setRow<K extends keyof ResolveChoice['perRow'][string]>(rowKey: string, field: K, value: any) {
    setChoice(prev => {
      const prevRow = prev.perRow[rowKey] || {}
      const nextRow = { ...prevRow, [field]: value }

      // se seleziono un id, azzero l’eventuale “add…”, e viceversa
      if (field === 'categoryId' && value) nextRow.addCategoryName = undefined
      if (field === 'supplierId' && value) nextRow.addSupplierName = undefined
      if (field === 'addCategoryName' && value) nextRow.categoryId = undefined
      if (field === 'addSupplierName' && value) nextRow.supplierId = undefined

      return { ...prev, perRow: { ...prev.perRow, [rowKey]: nextRow } }
    })
  }

  function handleAddCategory(rowKey: string, name?: string | null) {
    const n = (name || '').trim()
    if (!n) return
    setRow(rowKey, 'addCategoryName', n)
    setChoice(prev => {
      if (prev.createCategories.includes(n)) return prev
      return { ...prev, createCategories: [...prev.createCategories, n] }
    })
  }

  function handleAddSupplier(rowKey: string, name?: string | null) {
    const n = (name || '').trim()
    if (!n) return
    setRow(rowKey, 'addSupplierName', n)
    setChoice(prev => {
      if (prev.createSuppliers.includes(n)) return prev
      return { ...prev, createSuppliers: [...prev.createSuppliers, n] }
    })
  }

  const canContinue = useMemo(() => {
    for (const r of rows) {
      const sel = choice.perRow[r.key]
      const hasCat = !!(sel?.categoryId || sel?.addCategoryName)
      const hasSup = !!(sel?.supplierId || sel?.addSupplierName)
      if (!hasCat || !hasSup) return false
    }
    return rows.length > 0
  }, [rows, choice.perRow])

  function submit() {
    if (!canContinue) return
    onConfirm(choice)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-6 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-4xl relative max-h-[90vh] overflow-auto">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-3xl text-gray-500 hover:text-gray-700 leading-none"
        >×</button>

        <h2 className="text-2xl font-bold mb-4">Resolve import</h2>

        {/* Blocchi riga per riga, unico posto dove si decide tutto */}
        <div className="space-y-4">
          {rows.map(r => {
            const csvCat = r.incoming.category_csv?.trim() || ''
            const csvSup = r.incoming.supplier_csv?.trim() || ''
            const rowSel = choice.perRow[r.key] || {}

            const catMissing = csvCat && !catNames.has(csvCat.toLowerCase())
            const supMissing = csvSup && !supNames.has(csvSup.toLowerCase())

            return (
              <div key={r.key} className="border rounded-xl p-4">
                <div className="font-semibold mb-2">
                  {r.incoming.name}
                  {r.current ? <span className="text-sm text-gray-500"> · conflict with existing</span> : null}
                </div>

                {/* Category */}
                <div className="mb-3">
                  <label className="block text-sm text-gray-600 mb-1">Category</label>
                  <div className="flex items-center gap-2">
                    <select
                      className="p-2 border rounded-xl text-gray-900"
                      value={rowSel.categoryId ?? ''}
                      onChange={e => setRow(r.key, 'categoryId', e.target.value ? Number(e.target.value) : undefined)}
                    >
                      <option value="">Select existing</option>
                      {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>

                    {catMissing && !rowSel.categoryId && !rowSel.addCategoryName && (
                      <button
                        type="button"
                        className="text-blue-700 text-sm underline"
                        onClick={() => handleAddCategory(r.key, csvCat)}
                      >+ Add “{csvCat}”</button>
                    )}

                    {rowSel.addCategoryName && (
                      <span className="text-xs px-2 py-1 bg-blue-50 border border-blue-200 rounded">
                        Will add “{rowSel.addCategoryName}”
                      </span>
                    )}
                  </div>
                  {csvCat && <div className="text-xs text-gray-500 mt-1">CSV: {csvCat}</div>}
                </div>

                {/* Supplier */}
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Supplier</label>
                  <div className="flex items-center gap-2">
                    <select
                      className="p-2 border rounded-xl text-gray-900"
                      value={rowSel.supplierId ?? ''}
                      onChange={e => setRow(r.key, 'supplierId', e.target.value || undefined)}
                    >
                      <option value="">Select existing</option>
                      {sups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>

                    {supMissing && !rowSel.supplierId && !rowSel.addSupplierName && (
                      <button
                        type="button"
                        className="text-blue-700 text-sm underline"
                        onClick={() => handleAddSupplier(r.key, csvSup)}
                      >+ Add “{csvSup}”</button>
                    )}

                    {rowSel.addSupplierName && (
                      <span className="text-xs px-2 py-1 bg-blue-50 border border-blue-200 rounded">
                        Will add “{rowSel.addSupplierName}”
                      </span>
                    )}
                  </div>
                  {csvSup && <div className="text-xs text-gray-500 mt-1">CSV: {csvSup}</div>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border"
          >Cancel</button>
          <button
            disabled={!canContinue}
            onClick={submit}
            className={`px-4 py-2 rounded-xl text-white ${canContinue ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300 cursor-not-allowed'}`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
