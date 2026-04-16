'use client'

import React, { useEffect, useState } from 'react'
import { Users, Target, ArrowUpRight, HandCoins, Activity, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import type { CRMPartner, CRMReferral, CRMPayout } from '@/types/crm'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import Link from 'next/link'

export default function CRMDashboard() {
  const { currency } = useSettings()
  const [partners, setPartners] = useState<CRMPartner[]>([])
  const [referrals, setReferrals] = useState<CRMReferral[]>([])
  const [payouts, setPayouts] = useState<CRMPayout[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      // Check role first
      const { data: user } = await supabase.auth.getUser()
      if (user?.user) {
          const { data } = await supabase.from('app_accounts').select('role').eq('user_id', user.user.id).single()
          if (data?.role === 'staff') {
              window.location.href = '/crm/referrals'
              return
          }
      }

      // For dashboard, we fetch basic summary data
      const [partnersRes, referralsRes, payoutsRes] = await Promise.all([
        supabase.from('crm_partners').select('*').order('created_at', { ascending: false }),
        supabase.from('crm_referrals').select('*'),
        supabase.from('crm_payouts').select('*')
      ])

      if (partnersRes.data) setPartners(partnersRes.data)
      if (referralsRes.data) setReferrals(referralsRes.data)
      if (payoutsRes.data) setPayouts(payoutsRes.data)
      
      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <CircularLoader />
      </div>
    )
  }

  // Calculate metrics
  const activePartners = partners.filter(p => p.status === 'Active').length
  const totalReferrals = referrals.length
  const generatedRevenue = referrals.reduce((sum, r) => sum + (r.revenue_generated || 0), 0)
  const pendingCommissions = payouts.filter(p => p.status === 'Pending').reduce((sum, p) => sum + (p.amount || 0), 0)
  const pendingPayoutsCount = payouts.filter(p => p.status === 'Pending').length

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(val)

  const METRICS = [
    { label: 'Active Partners', value: activePartners.toString(), change: 'Total active', icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Total Referrals', value: totalReferrals.toString(), change: 'All time', icon: Target, color: 'text-green-600', bg: 'bg-green-100' },
    { label: 'Generated Revenue', value: `${formatCurrency(generatedRevenue)} ${currency}`, change: 'All time', icon: Activity, color: 'text-violet-600', bg: 'bg-violet-100' },
    { label: 'Pending Commissions', value: `${formatCurrency(pendingCommissions)} ${currency}`, change: `${pendingPayoutsCount} awaiting approvals`, icon: HandCoins, color: 'text-orange-600', bg: 'bg-orange-100' }
  ]

  const recentPartners = partners.slice(0, 5)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">CRM & Partnerships</h1>
        <p className="text-slate-500 mt-1">Overview of external collaborations and commissions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {METRICS.map((item, i) => (
          <div key={i} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col">
            <div className="flex items-center gap-4 mb-4">
              <div className={`p-3 rounded-xl ${item.bg}`}>
                <item.icon className={`w-6 h-6 ${item.color}`} />
              </div>
              <h3 className="font-medium text-slate-600">{item.label}</h3>
            </div>
            <div className="text-3xl font-bold text-slate-900">{item.value}</div>
            <div className="mt-2 text-sm font-medium text-emerald-600 flex items-center gap-1">
              <ArrowUpRight className="w-4 h-4" />
              {item.change}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Pipeline Activity */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-900">Recent Pipeline Activity</h2>
            <Link href="/crm/partners" className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View Pipeline <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100 min-h-[250px]">
            {recentPartners.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No partners added yet.</div>
            ) : null}
            {recentPartners.map(p => (
              <Link href={`/crm/partners/${p.id}`} key={p.id} className="block hover:bg-slate-50 transition">
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 uppercase">
                      {p.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{p.name}</div>
                      <div className="text-sm text-slate-500">{p.type} • {p.location || 'No location'}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {p.status}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Action Center */}
        <div className="bg-gradient-to-br from-slate-900 to-blue-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
               <CalendarCheck2 className="w-6 h-6 text-blue-300" />
               <h2 className="text-xl font-bold">Today's Action Plan</h2>
            </div>
            <p className="text-blue-200 text-sm mb-6">You have pending items that need your attention.</p>
            
            <div className="space-y-3">
              <div className="p-4 bg-white/10 backdrop-blur rounded-xl border border-white/20">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold">Review Pending Referrals</div>
                    <div className="text-sm text-white/70 mt-1">
                      {referrals.filter(r => r.status === 'Pending').length} referrals need to be validated to calculate commissions.
                    </div>
                  </div>
                  <Link href="/crm/referrals" className="px-3 py-1 bg-white text-slate-900 text-sm font-medium rounded-lg hover:bg-blue-50 transition">
                    Review
                  </Link>
                </div>
              </div>
              <div className="p-4 bg-white/10 backdrop-blur rounded-xl border border-white/20">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold">Review Pending Payouts</div>
                    <div className="text-sm text-white/70 mt-1">
                      {pendingPayoutsCount} payouts are waiting to be paid.
                    </div>
                  </div>
                  <Link href="/crm/commissions" className="px-3 py-1 bg-white text-slate-900 text-sm font-medium rounded-lg hover:bg-blue-50 transition">
                    Details
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CalendarCheck2(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  )
}
