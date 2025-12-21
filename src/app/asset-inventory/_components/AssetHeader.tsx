'use client'

import { PlusIcon, Cog6ToothIcon, ClockIcon, BellIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

type Props = {
    onNewAsset: () => void
    onViewLog: () => void
    onViewNotifications: () => void
    notificationCount: number
}

export default function AssetHeader({ onNewAsset, onViewLog, onViewNotifications, notificationCount }: Props) {
    return (
        <div className="flex items-center justify-between mb-8">
            <div>
                <h1 className="text-2xl font-bold text-white">Asset Inventory</h1>
                <p className="text-slate-400 text-sm">Track and manage your fixed assets and smallware</p>
            </div>
            <div className="flex items-center gap-3">
                <button
                    onClick={onViewNotifications}
                    className="relative p-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-all"
                    title="Notifications"
                >
                    <BellIcon className="w-5 h-5" />
                    {notificationCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                            {notificationCount}
                        </span>
                    )}
                </button>
                <button
                    onClick={onViewLog}
                    className="p-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-all"
                    title="Activity Log"
                >
                    <ClockIcon className="w-5 h-5" />
                </button>
                <Link
                    href="/asset-inventory/settings"
                    className="p-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-all"
                    title="Settings"
                >
                    <Cog6ToothIcon className="w-5 h-5" />
                </Link>
                <button
                    onClick={onNewAsset}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-blue-900/20"
                >
                    <PlusIcon className="w-5 h-5" />
                    <span>New Asset</span>
                </button>
            </div>
        </div>
    )
}
