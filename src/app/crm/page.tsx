'use client'

import React, { useEffect, useState } from 'react'
import { Users, Target, ArrowUpRight, HandCoins, Activity, ChevronRight, BarChart3, Clock, CheckCircle2, AlertCircle, Wallet } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase_shim'
import type { CRMPartner, CRMReferral, CRMPayout, CRMTask, CRMAgreement } from '@/types/crm'
import CircularLoader from '@/components/CircularLoader'
import { useSettings } from '@/contexts/SettingsContext'
import Link from 'next/link'
import { t } from '@/lib/i18n'

export default function CRMDashboard() {
  const { currency, language } = useSettings()
  const [partners, setPartners] = useState<CRMPartner[]>([])
  const [referrals, setReferrals] = useState<CRMReferral[]>([])
  const [payouts, setPayouts] = useState<CRMPayout[]>([])
  const [tasks, setTasks] = useState<CRMTask[]>([])
  const [agreements, setAgreements] = useState<CRMAgreement[]>([])
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
          if (data?.role === 'sale advisor') {
              window.location.href = '/crm/partners'
              return
          }
      }

      // For dashboard, we fetch basic summary data
      const [partnersRes, referralsRes, payoutsRes, tasksRes, agRes] = await Promise.all([
        supabase.from('crm_partners').select('*').order('created_at', { ascending: false }),
        supabase.from('crm_referrals').select('*'),
        supabase.from('crm_payouts').select('*'),
        supabase.from('crm_tasks').select('*').in('status', ['Pending', 'In Progress']),
        supabase.from('crm_agreements').select('*').eq('status', 'Active')
      ])

      if (partnersRes.data) setPartners(partnersRes.data)
      if (referralsRes.data) setReferrals(referralsRes.data)
      if (payoutsRes.data) setPayouts(payoutsRes.data)
      if (tasksRes.data) setTasks(tasksRes.data)
      if (agRes.data) setAgreements(agRes.data)
      
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
  const activePartners = partners.filter(p => p.pipeline_stage === 'Active').length
  const totalReferrals = referrals.length
  const generatedRevenue = referrals.reduce((sum, r) => sum + (r.revenue_generated || 0), 0)
  const pendingCommissions = payouts.filter(p => p.status === 'Pending').reduce((sum, p) => sum + (p.amount || 0), 0)
  const pendingPayoutsCount = payouts.filter(p => p.status === 'Pending').length
  const pendingReferralsCount = referrals.filter(r => r.status === 'Pending').length
  const totalSalesCommissions = referrals.reduce((sum, r) => sum + (r.advisor_commission_value || 0), 0)
  const totalPartnerCommissions = referrals.reduce((sum, r) => sum + (r.commission_value || 0), 0)

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(val)

  const METRICS = [
    { label: t(language, 'ActivePartners'), value: activePartners.toString(), change: `${agreements.length} ${t(language, 'ActiveAgreements')}`, icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: t(language, 'TotalReferrals'), value: totalReferrals.toString(), change: t(language, 'AllTime'), icon: Target, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { label: t(language, 'GeneratedRevenue'), value: `${currency} ${formatCurrency(generatedRevenue)}`, change: t(language, 'AllTime'), icon: Activity, color: 'text-violet-600', bg: 'bg-violet-100' },
    { label: t(language, 'PartnerComms'), value: `${currency} ${formatCurrency(totalPartnerCommissions)}`, change: t(language, 'TotalPartnerShare'), icon: Wallet, color: 'text-pink-600', bg: 'bg-pink-100' },
    { label: t(language, 'SalesComms'), value: `${currency} ${formatCurrency(totalSalesCommissions)}`, change: t(language, 'TotalAdvisorShare'), icon: BarChart3, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { label: t(language, 'PendingPayouts'), value: `${currency} ${formatCurrency(pendingCommissions)}`, change: `${pendingPayoutsCount} ${t(language, 'AwaitingPayouts')}`, icon: HandCoins, color: 'text-orange-600', bg: 'bg-orange-100' }
  ]

  const recentPartners = partners.slice(0, 5)

  // Pipeline breakdown
  const stages = [
    { name: t(language, 'Leads'), match: 'Leads', color: 'bg-slate-200 text-slate-700' },
    { name: t(language, 'Approached'), match: 'Approached', color: 'bg-blue-100 text-blue-700' },
    { name: t(language, 'WaitingForMaterial'), match: 'Waiting for Material', color: 'bg-amber-100 text-amber-700' },
    { name: t(language, 'WaitingForActivation'), match: 'Waiting for Activation', color: 'bg-orange-100 text-orange-700' },
    { name: t(language, 'Active'), match: 'Active', color: 'bg-emerald-100 text-emerald-700' },
  ]
  const nonArchivedPartners = partners.filter(p => !p.is_deleted && p.pipeline_stage !== 'Rejected' && p.pipeline_stage !== 'Inactive/Paused')

  // Business Trend Data
  const trendDataMap: Record<string, number> = {}
  referrals.forEach(r => {
      if (!r.created_at) return;
      const d = new Date(r.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      trendDataMap[key] = (trendDataMap[key] || 0) + (r.revenue_generated || 0)
  })
  const sortedMonths = Object.keys(trendDataMap).sort()
  const trendData = sortedMonths.map(month => {
      const [year, m] = month.split('-')
      const d = new Date(Number(year), Number(m)-1, 1);
      return {
          name: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
          revenue: trendDataMap[month]
      }
  })

  // Ensure we show at least something if no data
  if (trendData.length === 1) {
    trendData.unshift({ name: t(language, 'Prev'), revenue: 0 })
  } else if (trendData.length === 0) {
    trendData.push({ name: t(language, 'NoData'), revenue: 0 })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 flex flex-col">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t(language, 'CRMDashboardTitle')}</h1>
        <p className="text-slate-500 mt-1">{t(language, 'CRMDashboardDesc')}</p>
      </div>

      {/* Main KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {METRICS.map((item, i) => (
          <div key={i} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col group hover:shadow-md transition">
            <div className="flex items-center gap-4 mb-4">
              <div className={`p-3 rounded-xl transition-transform group-hover:scale-110 ${item.bg}`}>
                <item.icon className={`w-6 h-6 ${item.color}`} />
              </div>
              <h3 className="font-medium text-slate-600">{item.label}</h3>
            </div>
            <div className="text-3xl font-black text-slate-900 truncate" title={item.value}>{item.value}</div>
            <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5" />
              {item.change}
            </div>
          </div>
        ))}
      </div>

      {/* Business Growth Chart */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm shrink-0">
         <h2 className="text-lg font-bold text-slate-900 mb-6">{t(language, 'BusinessGrowthTrend')}</h2>
         <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 12 }} 
                    dy={10}
                />
                <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val}
                    dx={-10}
                />
                <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: '#8b5cf6', fontWeight: 600 }}
                    formatter={(val: number) => [`${currency} ${val.toLocaleString()}`, t(language, 'Revenue')]}
                />
                <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#8b5cf6" 
                    strokeWidth={3} 
                    fillOpacity={1} 
                    fill="url(#colorRev)" 
                />
              </AreaChart>
            </ResponsiveContainer>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Pipeline Breakdown & Recent */}
        <div className="lg:col-span-2 flex flex-col space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 shrink-0">
             <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-slate-900">
                    <BarChart3 className="w-5 h-5 text-indigo-500" />
                    <h2 className="text-lg font-bold">{t(language, 'PipelineSnapshot')}</h2>
                </div>
                <Link href="/crm/partners" className="text-sm font-medium text-blue-600 hover:underline">
                    {t(language, 'ViewCRMBoard')}
                </Link>
             </div>
             <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {stages.map(stage => {
                    const count = nonArchivedPartners.filter(p => p.pipeline_stage === stage.match).length
                    return (
                        <div key={stage.name} className={`p-4 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center ${count > 0 ? 'bg-slate-50' : 'opacity-50'}`}>
                            <div className="text-2xl font-black text-slate-900 mb-1">{count}</div>
                            <div className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full ${stage.color}`}>
                                {stage.name}
                            </div>
                        </div>
                    )
                })}
             </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h2 className="text-lg font-bold text-slate-900">{t(language, 'RecentlyAddedPartners')}</h2>
            </div>
            <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
              {recentPartners.length === 0 ? (
                <div className="p-8 text-center text-slate-500">{t(language, 'NoPartnersAddedYet')}</div>
              ) : null}
              {recentPartners.map(p => (
                <Link href={`/crm/partners/${p.id}`} key={p.id} className="block hover:bg-slate-50 transition">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 uppercase shrink-0">
                        {p.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                        <div className="text-sm text-slate-500 truncate">{p.type ? t(language, p.type) : t(language, 'Company')} • {p.location || t(language, 'NoLocation')}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                        {t(language, p.pipeline_stage.replace(/\/?\s/g, ''))}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Action Center - Tasks & Alerts */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-gradient-to-br from-slate-900 to-blue-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden flex flex-col h-full min-h-[400px]">
            <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay pointer-events-none"></div>
            
            <div className="relative z-10 flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-2 shrink-0">
                 <AlertCircle className="w-6 h-6 text-amber-400" />
                 <h2 className="text-xl font-bold">{t(language, 'ActionCenter')}</h2>
              </div>
              <p className="text-blue-200 text-sm mb-6 shrink-0">{t(language, 'ItemsRequiringAttention')}</p>
              
              <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                {/* Pending Referrals Alert */}
                {pendingReferralsCount > 0 && (
                  <div className="p-4 bg-amber-500/10 backdrop-blur rounded-xl border border-amber-500/20">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="font-semibold text-amber-100 flex items-center gap-2">
                            <Target className="w-4 h-4 text-amber-400" />
                            {t(language, 'PendingReferrals')}
                        </div>
                        <div className="text-sm text-amber-200/70 mt-1 leading-relaxed">
                          {pendingReferralsCount} {t(language, 'PendingReferralsDesc')}
                        </div>
                      </div>
                      <Link href="/crm/referrals" className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-amber-950 text-xs font-bold uppercase tracking-wider rounded-lg transition shrink-0 mt-1">
                        {t(language, 'Review')}
                      </Link>
                    </div>
                  </div>
                )}
                
                {/* Pending Payouts Alert */}
                {pendingPayoutsCount > 0 && (
                  <div className="p-4 bg-orange-500/10 backdrop-blur rounded-xl border border-orange-500/20">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="font-semibold text-orange-100 flex items-center gap-2">
                            <HandCoins className="w-4 h-4 text-orange-400" />
                            {t(language, 'PendingPayouts')}
                        </div>
                        <div className="text-sm text-orange-200/70 mt-1 leading-relaxed">
                          {pendingPayoutsCount} {t(language, 'PendingPayoutsDesc')}
                        </div>
                      </div>
                      <Link href="/crm/commissions" className="px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-orange-950 text-xs font-bold uppercase tracking-wider rounded-lg transition shrink-0 mt-1">
                        {t(language, 'Pay')}
                      </Link>
                    </div>
                  </div>
                )}

                {/* Overdue/Pending Tasks */}
                {tasks.length > 0 && (
                  <div className="p-4 bg-white/5 backdrop-blur rounded-xl border border-white/10">
                    <div className="font-semibold text-white flex items-center gap-2 mb-3">
                        <CheckCircle2 className="w-4 h-4 text-blue-300" />
                        {t(language, 'OpenTasks')} ({tasks.length})
                    </div>
                    <div className="space-y-3">
                        {tasks.slice(0, 5).map(task => (
                            <Link href={`/crm/partners/${task.partner_id}?tab=tasks`} key={task.id} className="block group">
                                <div className="bg-white/5 hover:bg-white/10 p-3 rounded-lg transition border border-white/5">
                                    <div className="flex justify-between items-start">
                                        <div className="font-medium text-sm text-blue-50 group-hover:text-white transition">{task.title}</div>
                                        {task.priority === 'High' && <span className="w-2 h-2 rounded-full bg-red-400 mt-1.5 shrink-0"></span>}
                                    </div>
                                    {task.due_date && (
                                        <div className="flex items-center gap-1 mt-1.5 text-xs text-blue-200/60">
                                            <Clock className="w-3 h-3" />
                                            {new Date(task.due_date).toLocaleDateString()}
                                        </div>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                  </div>
                )}

                {pendingReferralsCount === 0 && pendingPayoutsCount === 0 && tasks.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-8 text-center bg-white/5 rounded-xl border border-white/10 mt-4">
                        <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3 opacity-50" />
                        <div className="text-emerald-100 font-medium">{t(language, 'AllCaughtUp')}</div>
                        <div className="text-sm text-emerald-200/50 mt-1">{t(language, 'NoPendingActions')}</div>
                    </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
