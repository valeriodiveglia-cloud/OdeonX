'use client'

import React, { useEffect, useState, useMemo, Suspense } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'
import CircularLoader from '@/components/CircularLoader'
import { useSearchParams } from 'next/navigation'
import { 
  Check, 
  X, 
  AlertCircle, 
  RefreshCw, 
  Calendar, 
  Search,
  ArrowLeftRight
} from 'lucide-react'
import { WastageSync } from '@/types/storehouse'

function WastageSyncContent() {
  const { language } = useSettings()
  const searchParams = useSearchParams()
  const branchNameUrl = searchParams.get('branchName') || 'all'
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string>('staff')
  const [syncLogs, setSyncLogs] = useState<WastageSync[]>([])
  
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [successMsg, setSuccessMsg] = useState<string>('')

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState<string>(branchNameUrl)

  const isManager = useMemo(() => {
    return role && ['owner', 'admin', 'manager', 'accountant'].includes(role)
  }, [role])

  useEffect(() => {
    async function loadUser() {
      const { data: userRes } = await supabase.auth.getUser()
      if (userRes?.user) {
        const { data: acc } = await supabase
          .from('app_accounts')
          .select('role')
          .eq('user_id', userRes.user.id)
          .single()
        setRole(acc?.role || 'staff')
      }
    }
    loadUser()
  }, [])

  const loadSyncData = async () => {
    try {
      setLoading(true)
      setErrorMsg('')
      
      // Fetch latest 200 wastage entries with their sync logs
      const { data, error } = await supabase
        .from('wastage_entries')
        .select(`
          id,
          date,
          time,
          wtype,
          category_name,
          item_name,
          unit,
          qty,
          total_cost_vnd,
          reason,
          branch_name,
          storehouse_wastage_sync (
            status,
            error_message,
            movement_id,
            last_sync_at
          )
        `)
        .order('date', { ascending: false })
        .order('time', { ascending: false })
        .limit(200)

      if (error) throw error

      const formatted: WastageSync[] = (data || []).map((w: any) => {
        const sync = w.storehouse_wastage_sync?.[0] || null
        
        // Se non c'è traccia di sync ed il tipo è Material o Prep, lo consideriamo 'pending'
        let syncStatus: 'synced' | 'pending' | 'failed' | 'reversed' = 'pending'
        if (sync) {
          syncStatus = sync.status
        } else if (w.wtype !== 'Material' && w.wtype !== 'Prep') {
          // I Dish (piatti) sono ignorati di default
          syncStatus = 'reversed' 
        }

        return {
          wastage_entry_id: w.id,
          status: syncStatus,
          error_message: sync?.error_message || null,
          movement_id: sync?.movement_id || null,
          last_sync_at: sync?.last_sync_at || '',
          date: w.date,
          time: w.time,
          wtype: w.wtype,
          category_name: w.category_name,
          item_name: w.item_name,
          unit: w.unit,
          qty: w.qty,
          total_cost_vnd: w.total_cost_vnd,
          reason: w.reason,
          branch_name: w.branch_name
        }
      })

      setSyncLogs(formatted)
    } catch (err) {
      console.error('Error loading wastage sync logs:', err)
      setErrorMsg('Failed to load sync logs.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSyncData()
  }, [])

  const handleRetrySync = async (log: WastageSync) => {
    if (!isManager) return

    try {
      setLoading(true)
      setErrorMsg('')
      setSuccessMsg('')

      const { data, error } = await supabase
        .rpc('storehouse_retry_sync_wastage', { p_entry_id: log.wastage_entry_id })

      if (error) throw error

      if (data === 'OK') {
        setSuccessMsg(language === 'vi' ? 'Đồng bộ lại thành công!' : 'Sync triggered successfully!')
        // Reload after a small delay to allow trigger execution
        setTimeout(() => {
          loadSyncData()
        }, 800)
      } else {
        setErrorMsg(data || 'Sync failed')
      }
    } catch (err) {
      console.error('Error retrying sync:', err)
      setErrorMsg('Failed to trigger sync retry')
    } finally {
      setLoading(false)
    }
  }

  const handleSyncAllPendingFailed = async () => {
    if (!isManager) return
    const pendingOrFailed = syncLogs.filter(l => l.status === 'failed' || l.status === 'pending')
    if (pendingOrFailed.length === 0) return

    try {
      setLoading(true)
      setErrorMsg('')
      setSuccessMsg('')

      let count = 0
      for (const log of pendingOrFailed) {
        const { data } = await supabase
          .rpc('storehouse_retry_sync_wastage', { p_entry_id: log.wastage_entry_id })
        if (data === 'OK') count++
      }

      setSuccessMsg(
        language === 'vi' 
          ? `Đã kích hoạt đồng bộ lại cho ${count} hao hụt!` 
          : `Triggered sync retry for ${count} wastage records!`
      )
      
      setTimeout(() => {
        loadSyncData()
      }, 1000)
    } catch (err) {
      console.error('Error retrying all syncs:', err)
      setErrorMsg('Error triggering mass sync retry')
    } finally {
      setLoading(false)
    }
  }

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return syncLogs.filter(log => {
      // Search
      const textMatch = searchQuery === '' || 
        log.item_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        log.reason?.toLowerCase().includes(searchQuery.toLowerCase())

      // Status
      const statusMatch = statusFilter === 'all' || log.status === statusFilter

      // Branch
      const branchMatch = branchFilter === 'all' || log.branch_name === branchFilter

      return textMatch && statusMatch && branchMatch
    })
  }, [syncLogs, searchQuery, statusFilter, branchFilter])

  // Unique branches for filters
  const uniqueBranches = useMemo(() => {
    const set = new Set<string>()
    syncLogs.forEach(l => {
      if (l.branch_name) set.add(l.branch_name)
    })
    return Array.from(set)
  }, [syncLogs])

  return (
    <div className="space-y-6 text-slate-100">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {t(language, 'WastageSync')}
          </h1>
          <p className="text-sm text-slate-400">
            Monitoraggio dei consumi di scarto (Wastage) registrati nel Daily Report e sincronizzati in magazzino
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isManager && syncLogs.some(l => l.status === 'failed' || l.status === 'pending') && (
            <button
              onClick={handleSyncAllPendingFailed}
              className="inline-flex items-center gap-1.5 px-4 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4.5 h-4.5" /> Retry All Pending/Failed
            </button>
          )}

          <button
            onClick={loadSyncData}
            className="p-3 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-xl transition-colors cursor-pointer"
            title="Refresh logs"
          >
            <RefreshCw className="w-4.5 h-4.5 text-slate-300" />
          </button>
        </div>
      </div>

      {/* Feedbacks */}
      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-200 text-xs px-4 py-3 rounded-2xl flex items-center gap-2 font-medium">
          <AlertCircle className="w-4.5 h-4.5 text-red-400" /> {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs px-4 py-3 rounded-2xl flex items-center gap-2 font-medium">
          <Check className="w-4.5 h-4.5 text-emerald-400" /> {successMsg}
        </div>
      )}

      {/* Search and filter bar */}
      <div className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-2xl border border-white/10 shadow-sm flex-wrap text-gray-900">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={language === 'vi' ? 'Tìm kiếm nguyên liệu...' : 'Search item name...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full border border-white/10 rounded-xl pl-9 pr-4 h-10 text-xs font-semibold text-slate-200 bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-white/10 rounded-xl px-3 h-10 text-xs font-semibold text-slate-200 bg-slate-800 focus:outline-none"
        >
          <option value="all">{language === 'vi' ? 'Tất cả trạng thái' : 'All Status'}</option>
          <option value="synced">{language === 'vi' ? 'Đã đồng bộ' : 'Synced'}</option>
          <option value="pending">{language === 'vi' ? 'Đang chờ' : 'Pending'}</option>
          <option value="failed">{language === 'vi' ? 'Thất bại' : 'Failed'}</option>
          <option value="reversed">{language === 'vi' ? 'Đã hoàn trả/Đảo ngược' : 'Reversed'}</option>
        </select>

        <select
          value={branchFilter}
          onChange={e => setBranchFilter(e.target.value)}
          className="border border-white/10 rounded-xl px-3 h-10 text-xs font-semibold text-slate-200 bg-slate-800 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={branchNameUrl !== 'all'}
        >
          <option value="all">{language === 'vi' ? 'Tất cả chi nhánh' : 'All Branches'}</option>
          {uniqueBranches.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex h-[200px] w-full items-center justify-center">
          <CircularLoader />
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden text-gray-900">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="py-2.5 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="py-2.5 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Branch</th>
                  <th className="py-2.5 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Wastage Item</th>
                  <th className="py-2.5 px-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Qty</th>
                  <th className="py-2.5 px-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Cost (VND)</th>
                  <th className="py-2.5 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Reason</th>
                  <th className="py-2.5 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Sync State</th>
                  <th className="py-2.5 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-xs text-slate-400 italic font-semibold">
                      No wastage records found for the current filters
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map(log => (
                    <tr key={log.wastage_entry_id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 text-xs text-slate-650 font-medium">
                        {log.date} <span className="text-[10px] text-slate-400 font-mono block">{log.time}</span>
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-gray-800">{log.branch_name}</td>
                      <td className="py-3 px-4 text-xs">
                        <span className="font-bold text-gray-900 block">{log.item_name}</span>
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">Type: {log.wtype} | Cat: {log.category_name || '—'}</span>
                      </td>
                      <td className="py-3 px-4 text-right text-xs font-bold text-gray-900">
                        {log.qty?.toLocaleString()} <span className="text-[10px] text-slate-450 font-medium">{log.unit}</span>
                      </td>
                      <td className="py-3 px-4 text-right text-xs font-bold text-gray-900">
                        {log.total_cost_vnd?.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 font-medium max-w-[200px] truncate" title={log.reason || ''}>
                        {log.reason || '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex flex-col items-center justify-center gap-0.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            log.status === 'synced' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                            log.status === 'failed' ? 'bg-red-50 text-red-600 border-red-100' :
                            log.status === 'reversed' ? 'bg-slate-50 text-slate-650 border-slate-150' :
                            'bg-amber-50 text-amber-600 border-amber-100'
                          }`}>
                            {log.status === 'synced' && 'Synced'}
                            {log.status === 'failed' && 'Failed'}
                            {log.status === 'pending' && 'Pending'}
                            {log.status === 'reversed' && 'Ignored/Reversed'}
                          </span>
                          {log.error_message && (
                            <span className="text-[9px] text-red-500 font-medium max-w-[150px] truncate block" title={log.error_message}>
                              {log.error_message}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isManager && (log.status === 'failed' || log.status === 'pending') && (
                          <button
                            onClick={() => handleRetrySync(log)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px] font-bold border border-blue-100"
                            title="Force sync retry"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> Sync
                          </button>
                        )}
                        {log.status === 'synced' && log.movement_id && (
                          <span className="text-[10px] text-slate-400 font-mono block truncate" title={log.movement_id}>
                            Mov: {log.movement_id.slice(0, 8)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}

export default function WastageSyncPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-transparent">
        <CircularLoader />
      </div>
    }>
      <WastageSyncContent />
    </Suspense>
  )
}
