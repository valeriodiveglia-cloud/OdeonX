import React, { useState, useMemo } from 'react'
import { XMarkIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline'
import { type Sup } from '../_data/useCashout'

export function SupplierPicker({
    suppliers,
    onSelect,
    onClose,
    onAddNew,
    t,
}: {
    suppliers: Sup[]
    onSelect: (id: string) => void
    onClose: () => void
    onAddNew: () => void
    t: any
}) {
    const [search, setSearch] = useState('')

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return suppliers.slice(0, 100) // Limit initial view
        return suppliers.filter(s => s.name.toLowerCase().includes(q)).slice(0, 100)
    }, [suppliers, search])

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col max-h-[80vh]">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                    <h3 className="font-bold text-lg text-gray-900">{t.supplierSelect}</h3>
                    <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
                        <XMarkIcon className="w-6 h-6 text-gray-500" />
                    </button>
                </div>

                <div className="p-4 border-b">
                    <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            autoFocus
                            className="w-full pl-10 pr-4 h-10 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                            placeholder="Search supplier..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {filtered.length === 0 && search && (
                        <div className="text-center py-4 text-gray-500">No suppliers found.</div>
                    )}

                    <div className="space-y-1">
                        {filtered.map(s => (
                            <button
                                key={s.id}
                                onClick={() => onSelect(s.id)}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 text-gray-800 font-medium transition-colors"
                            >
                                {s.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-3 border-t bg-gray-50 rounded-b-2xl">
                    <button
                        onClick={onAddNew}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400 transition-colors font-medium"
                    >
                        <PlusIcon className="w-5 h-5" />
                        {t.supplierAddPrefix}
                    </button>
                </div>
            </div>
        </div>
    )
}
