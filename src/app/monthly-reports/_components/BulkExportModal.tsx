'use client'

import React, { useState, useMemo } from 'react'
import {
    ArrowDownTrayIcon,
    XMarkIcon,
    FolderIcon,
    ArchiveBoxIcon,
} from '@heroicons/react/24/outline'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import {
    MODULE_BUILDERS,
    MODULE_LABELS,
    MODULE_FILE_NAMES,
    type ModuleKey,
} from '../_utils/bulkExportUtils'

const ALL_MODULES: ModuleKey[] = [
    'closingList',
    'cashout',
    'bankTransfers',
    'wastageReport',
    'credits',
    'deposits',
    'cashLedger',
]

type Props = {
    open: boolean
    onClose: () => void
}

export default function BulkExportModal({ open, onClose }: Props) {
    const now = new Date()
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const [selected, setSelected] = useState<Set<ModuleKey>>(new Set(ALL_MODULES))
    const [fromMonth, setFromMonth] = useState(defaultMonth)
    const [toMonth, setToMonth] = useState(defaultMonth)
    const [compressed, setCompressed] = useState(true)
    const [exporting, setExporting] = useState(false)
    const [progress, setProgress] = useState('')

    const allSelected = selected.size === ALL_MODULES.length
    const noneSelected = selected.size === 0

    function toggleAll() {
        setSelected(allSelected ? new Set() : new Set(ALL_MODULES))
    }

    function toggle(key: ModuleKey) {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    const months = useMemo(() => {
        const result: { year: number; month: number; label: string; period: string }[] = []
        const [fy, fm] = fromMonth.split('-').map(Number)
        const [ty, tm] = toMonth.split('-').map(Number)
        let y = fy, m = fm - 1
        while (y < ty || (y === ty && m <= tm - 1)) {
            result.push({
                year: y,
                month: m,
                label: new Date(y, m).toLocaleString('default', { month: 'long', year: 'numeric' }),
                period: `${y}-${String(m + 1).padStart(2, '0')}`,
            })
            m++
            if (m > 11) { m = 0; y++ }
        }
        return result
    }, [fromMonth, toMonth])

    const validRange = months.length > 0

    async function handleExport() {
        if (noneSelected || !validRange) return
        setExporting(true)

        try {
            const zip = new JSZip()
            const modules = Array.from(selected)
            let done = 0

            for (const monthObj of months) {
                for (const mod of modules) {
                    setProgress(`Exporting ${MODULE_LABELS[mod]} — ${monthObj.label} (${done + 1}/${months.length * modules.length})`)
                    try {
                        const buf = await MODULE_BUILDERS[mod](monthObj.year, monthObj.month)
                        const fileName = MODULE_FILE_NAMES[mod](monthObj.period)
                        zip.file(fileName, buf)
                    } catch (err) {
                        console.error(`Failed to export ${mod} for ${monthObj.period}:`, err)
                    }
                    done++
                }
            }

            setProgress('Creating archive...')

            const fromLabel = fromMonth
            const toLabel = toMonth
            const folderName = `export-data_${fromLabel}_to_${toLabel}`

            const blob = await zip.generateAsync({
                type: 'blob',
                compression: compressed ? 'DEFLATE' : 'STORE',
                compressionOptions: compressed ? { level: 6 } : undefined,
            })

            saveAs(blob, `${folderName}.zip`)
            onClose()
        } catch (err) {
            console.error('Bulk export failed:', err)
            alert('Export failed. Please try again.')
        } finally {
            setExporting(false)
            setProgress('')
        }
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={exporting ? undefined : onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-xl text-gray-900 overflow-hidden">

                {/* Header */}
                <div className="px-4 md:px-6 pt-4 pb-3 flex items-center justify-between border-b">
                    <div className="text-xl font-bold">Export Data</div>
                    <button
                        onClick={onClose}
                        disabled={exporting}
                        className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                    >
                        <XMarkIcon className="w-7 h-7" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-4 md:px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">

                    {/* Module Selection */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-gray-800">Select reports</span>
                            <button
                                onClick={toggleAll}
                                className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2 transition-colors"
                            >
                                {allSelected ? 'Deselect all' : 'Select all'}
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {ALL_MODULES.map(mod => (
                                <label
                                    key={mod}
                                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${selected.has(mod)
                                        ? 'bg-blue-50 border-blue-300 text-gray-900'
                                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                                        }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.has(mod)}
                                        onChange={() => toggle(mod)}
                                        className="accent-blue-600 w-4 h-4 rounded"
                                    />
                                    <span className="text-sm">{MODULE_LABELS[mod]}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Period */}
                    <div>
                        <span className="text-sm font-semibold text-gray-800 block mb-3">Period</span>
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <label className="text-xs text-gray-500 block mb-1">From</label>
                                <input
                                    type="month"
                                    value={fromMonth}
                                    onChange={e => setFromMonth(e.target.value)}
                                    className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                                />
                            </div>
                            <span className="text-gray-400 mt-4">→</span>
                            <div className="flex-1">
                                <label className="text-xs text-gray-500 block mb-1">To</label>
                                <input
                                    type="month"
                                    value={toMonth}
                                    onChange={e => setToMonth(e.target.value)}
                                    className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                                />
                            </div>
                        </div>
                        {!validRange && (
                            <p className="text-xs text-red-600 mt-2">Invalid range: &quot;From&quot; must be before or equal to &quot;To&quot;.</p>
                        )}
                    </div>

                    {/* Format */}
                    <div>
                        <span className="text-sm font-semibold text-gray-800 block mb-3">Format</span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setCompressed(false)}
                                className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-xl border transition-all ${!compressed
                                    ? 'bg-blue-50 border-blue-300 text-gray-900'
                                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                                    }`}
                            >
                                <FolderIcon className="w-5 h-5" />
                                <div className="text-left">
                                    <div className="text-sm font-medium">Excel files</div>
                                    <div className="text-[11px] opacity-60">Uncompressed folder</div>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setCompressed(true)}
                                className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-xl border transition-all ${compressed
                                    ? 'bg-blue-50 border-blue-300 text-gray-900'
                                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                                    }`}
                            >
                                <ArchiveBoxIcon className="w-5 h-5" />
                                <div className="text-left">
                                    <div className="text-sm font-medium">ZIP archive</div>
                                    <div className="text-[11px] opacity-60">Compressed</div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-4 md:px-6 py-4 border-t flex items-center justify-between gap-3">
                    {exporting ? (
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <svg className="animate-spin w-5 h-5 text-blue-600 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span className="text-sm text-gray-600 truncate">{progress}</span>
                        </div>
                    ) : (
                        <div className="text-sm text-gray-500">
                            {selected.size} report{selected.size !== 1 ? 's' : ''} · {months.length} month{months.length !== 1 ? 's' : ''}
                        </div>
                    )}
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            disabled={exporting}
                            className="px-4 py-2 rounded-lg border hover:opacity-80 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={noneSelected || !validRange || exporting}
                            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:opacity-80 disabled:opacity-50 flex items-center gap-2"
                        >
                            <ArrowDownTrayIcon className="w-4 h-4" />
                            Export
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
