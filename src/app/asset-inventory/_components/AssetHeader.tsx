'use client'

import { PlusIcon, Cog6ToothIcon, ClockIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

type Props = {
    onNewAsset: () => void
    onViewLog: () => void
    userRole?: string | null
}

export default function AssetHeader({ onNewAsset, onViewLog, userRole }: Props) {
    return (
        <div className="flex items-center justify-between mb-8">
            <div>
                <h1 className="text-2xl font-bold text-white">Asset Inventory</h1>
                <p className="text-slate-400 text-sm">Track and manage your fixed assets and smallware</p>
            </div>
            <div className="flex items-center gap-3">
                <button
                    onClick={onViewLog}
                    className="p-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-all"
                    title="Activity Log"
                >
                    <ClockIcon className="w-5 h-5" />
                </button>
                {userRole && userRole !== 'accountant' && (
                    <Link
                        href="/asset-inventory/settings"
                        className="p-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-all"
                        title="Settings"
                    >
                        <Cog6ToothIcon className="w-5 h-5" />
                    </Link>
                )}
                {userRole && userRole !== 'accountant' && (
                    <button
                        onClick={onNewAsset}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-blue-900/20"
                    >
                        <PlusIcon className="w-5 h-5" />
                        <span>New Asset</span>
                    </button>
                )}
            </div>
        </div>
    )
}
