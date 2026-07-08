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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Start Inventory Count</h2>
                        <p className="text-sm text-gray-500 mt-1">Select the type of assets you want to count</p>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-1.5 hover:bg-gray-200/60 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300"
                        aria-label="Close"
                    >
                        <XMarkIcon className="w-5 h-5 text-gray-700" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5 bg-white">
                    {options.map((option) => (
                        <button
                            key={option.id}
                            onClick={() => onSelect(option.id)}
                            className="group relative p-6 bg-gray-50 hover:bg-blue-50/10 border border-gray-200 hover:border-blue-300 rounded-2xl transition-all hover:shadow-md hover:scale-[1.01] active:scale-[0.99] text-left focus:outline-none focus:ring-2 focus:ring-blue-300"
                        >
                            <div className={`w-12 h-12 rounded-xl mb-4 flex items-center justify-center ${option.color === 'blue'
                                ? 'bg-blue-100 text-blue-600'
                                : 'bg-indigo-100 text-indigo-600'
                                } group-hover:scale-110 transition-transform`}>
                                <option.icon className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">{option.title}</h3>
                            <p className="text-sm text-gray-600 leading-relaxed">
                                {option.description}
                            </p>

                            <div className={`absolute top-4 right-4 w-2 h-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${option.color === 'blue' ? 'bg-blue-600' : 'bg-indigo-600'
                                }`} />
                        </button>
                    ))}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/50 text-center">
                    <p className="text-xs text-gray-500">
                        The count will be based on the currently selected branch.
                    </p>
                </div>
            </div>
        </div>
    )
}
