'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase_shim'
import CircularLoader from '@/components/CircularLoader'
import ChartCard from './_components/ChartCard'
import {
    fetchRevenue,
    fetchTotalCost,
    fetchCashToTake,
    fetchBankTransfers,
    fetchDeposits,
    fetchUnpaid,
    fetchCreditCard
} from './_data/fetchers'

type Branch = {
    id: string
    name: string
}

export default function MonthlyReportsDashboard() {
    const [loading, setLoading] = useState(true)
    const [branches, setBranches] = useState<Branch[]>([])

    // Load branches once
    useEffect(() => {
        async function loadBranches() {
            const { data } = await supabase.from('provider_branches').select('id, name').order('name')
            if (data) {
                setBranches(data)
            }
            setLoading(false)
        }
        loadBranches()
    }, [])

    if (loading) return <div className="flex justify-center p-12"><CircularLoader /></div>

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">Monthly Reports Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <ChartCard
                    title="Revenue"
                    color="#3b82f6" // blue-500
                    branches={branches}
                    fetchData={fetchRevenue}
                />
                <ChartCard
                    title="Total Cost"
                    color="#ef4444" // red-500
                    branches={branches}
                    fetchData={fetchTotalCost}
                />
                <ChartCard
                    title="Cash to Take"
                    color="#10b981" // emerald-500
                    branches={branches}
                    fetchData={fetchCashToTake}
                />
                <ChartCard
                    title="Bank Transfers"
                    color="#8b5cf6" // violet-500
                    branches={branches}
                    fetchData={fetchBankTransfers}
                />
                <ChartCard
                    title="Credit Card"
                    color="#db2777" // pink-600
                    branches={branches}
                    fetchData={fetchCreditCard}
                />
                <ChartCard
                    title="Deposits"
                    color="#f97316" // orange-500
                    branches={branches}
                    fetchData={fetchDeposits}
                />
                <ChartCard
                    title="Unpaid"
                    color="#6b7280" // gray-500
                    branches={branches}
                    fetchData={fetchUnpaid}
                />
            </div>
        </div>
    )
}
