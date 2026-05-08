'use client'

import React from 'react'
import { Settings } from 'lucide-react'
import Link from 'next/link'

export default function FinanceSettingsPage() {
    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-slate-900">Finance Settings</h1>
            <p className="text-slate-500 mt-1 mb-8">Configure categories, fiscal year, and defaults</p>
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
                    <h3 className="font-semibold text-slate-900 text-lg mb-1">Chart of Accounts</h3>
                    <p className="text-sm text-slate-500 leading-relaxed flex-1">
                        Configure official accounting categories for invoices, payments, and financial reporting.
                    </p>
                </Link>
                
                {/* Future settings placeholder */}
                <div className="bg-white/50 rounded-2xl border border-slate-200 border-dashed p-6 flex flex-col items-center justify-center text-center">
                    <Settings className="w-8 h-8 text-slate-300 mb-3" />
                    <h3 className="font-medium text-slate-400">More settings</h3>
                    <p className="text-xs text-slate-400 mt-1">Coming soon</p>
                </div>
            </div>
        </div>
    )
}
