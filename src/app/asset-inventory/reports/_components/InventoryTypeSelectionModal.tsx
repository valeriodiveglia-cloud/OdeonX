'use client'

import React from 'react'
import { XMarkIcon, CubeIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline'
import { AssetType } from '../../types'

interface InventoryTypeSelectionModalProps {
    open: boolean
    onClose: () => void
    onSelect: (type: AssetType) => void
}

export default function InventoryTypeSelectionModal({ open, onClose, onSelect }: InventoryTypeSelectionModalProps) {
    if (!open) return null

    const options = [
        {
            id: 'fixed' as AssetType,
            title: 'Fixed Assets',
            description: 'Count appliances, furniture, and heavy equipment.',
            icon: WrenchScrewdriverIcon,
            color: 'blue'
        },
        {
            id: 'smallware' as AssetType,
            title: 'Smallwares',
            description: 'Count kitchen tools, storage containers, and utensils.',
            icon: CubeIcon,
            color: 'indigo'
        }
    ]

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl border border-white/10 flex flex-col">
                {/* Header */}
                <div className="p-5 border-b border-white/10 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white">Start Inventory Count</h2>
                        <p className="text-sm text-slate-400">Select the type of assets you want to count</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <XMarkIcon className="w-6 h-6 text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {options.map((option) => (
                        <button
                            key={option.id}
                            onClick={() => onSelect(option.id)}
                            className="group relative p-6 bg-slate-800/50 hover:bg-slate-800 border border-white/5 hover:border-white/20 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] text-left"
                        >
                            <div className={`w-12 h-12 rounded-xl mb-4 flex items-center justify-center ${option.color === 'blue'
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'bg-indigo-500/10 text-indigo-400'
                                } group-hover:scale-110 transition-transform`}>
                                <option.icon className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">{option.title}</h3>
                            <p className="text-sm text-slate-400 leading-relaxed">
                                {option.description}
                            </p>

                            <div className={`absolute top-4 right-4 w-2 h-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${option.color === 'blue' ? 'bg-blue-500' : 'bg-indigo-500'
                                }`} />
                        </button>
                    ))}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 bg-slate-900/50 rounded-b-2xl">
                    <p className="text-xs text-center text-slate-500">
                        The count will be based on the currently selected branch.
                    </p>
                </div>
            </div>
        </div>
    )
}
