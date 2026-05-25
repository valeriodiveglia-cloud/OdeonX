'use client'

import React from 'react'
import { Settings } from 'lucide-react'
import Link from 'next/link'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'

export default function FinanceSettingsPage() {
    const { language } = useSettings()

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-slate-900">{t(language, 'FinanceSettingsTitle')}</h1>
            <p className="text-slate-500 mt-1 mb-8">{t(language, 'FinanceSettingsSubtitle')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Chart of Accounts Card */}
                <Link
                    href="/finance/settings/chart-of-accounts"
                    className="group bg-white rounded-2xl border border-slate-200 p-6 flex flex-col hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
                >
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-blue-100 transition-transform">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
                        </svg>
                    </div>
                    <h3 className="font-semibold text-slate-900 text-lg mb-1">{t(language, 'ChartOfAccounts')}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed flex-1">
                        {t(language, 'ChartOfAccountsDesc')}
                    </p>
                </Link>
                
                {/* Go-Live Settings Card */}
                <Link
                    href="/finance/settings/go-live"
                    className="group bg-white rounded-2xl border border-slate-200 p-6 flex flex-col hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
                >
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-emerald-100 transition-transform">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h3 className="font-semibold text-slate-900 text-lg mb-1">{t(language, 'FinancialGoLive')}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed flex-1">
                        {t(language, 'FinancialGoLiveDesc')}
                    </p>
                </Link>
                
                <Link
                    href="/finance/settings/pnl"
                    className="group bg-white rounded-2xl border border-slate-200 p-6 flex flex-col hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
                >
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-indigo-100 transition-transform">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                        </svg>
                    </div>
                    <h3 className="font-semibold text-slate-900 text-lg mb-1">{t(language, 'PnLSettings')}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed flex-1">
                        {t(language, 'PnLSettingsDesc')}
                    </p>
                </Link>
                
                <Link
                    href="/finance/settings/taxes"
                    className="group bg-white rounded-2xl border border-slate-200 p-6 flex flex-col hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
                >
                    <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-rose-100 transition-transform">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
                        </svg>
                    </div>
                    <h3 className="font-semibold text-slate-900 text-lg mb-1">{t(language, 'TaxesConfiguration')}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed flex-1">
                        {t(language, 'TaxesConfigurationDesc')}
                    </p>
                </Link>

                {/* Revenue Channels Card */}
                <Link
                    href="/finance/settings/revenue-channels"
                    className="group bg-white rounded-2xl border border-slate-200 p-6 flex flex-col hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
                >
                    <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-orange-100 transition-transform">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <h3 className="font-semibold text-slate-900 text-lg mb-1">{t(language, 'PaymentChannels')}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed flex-1">
                        {t(language, 'PaymentChannelsDesc')}
                    </p>
                </Link>
                
                {/* Future settings placeholder */}
                <div className="bg-white/50 rounded-2xl border border-slate-200 border-dashed p-6 flex flex-col items-center justify-center text-center hidden">
                    <Settings className="w-8 h-8 text-slate-300 mb-3" />
                    <h3 className="font-medium text-slate-400">More settings</h3>
                    <p className="text-xs text-slate-400 mt-1">Coming soon</p>
                </div>
            </div>
        </div>
    )
}
