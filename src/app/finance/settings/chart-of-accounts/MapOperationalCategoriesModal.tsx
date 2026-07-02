'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { XMarkIcon, CheckIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import type { FinChartOfAccount } from '@/types/finance'
import CircularLoader from '@/components/CircularLoader'
import { COACombobox } from '@/app/finance/components/COACombobox'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'

type MappingModalProps = {
  accounts: FinChartOfAccount[]
  onClose: () => void
}

type BranchData = {
  branchName: string
  categories: string[]
}

type MappingRecord = {
  id?: string
  branch_name: string
  category_name: string
  account_id: string | null
}

export default function MapOperationalCategoriesModal({ accounts, onClose }: MappingModalProps) {
  const { language } = useSettings()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [branchesData, setBranchesData] = useState<BranchData[]>([])
  const [mappings, setMappings] = useState<MappingRecord[]>([])
  const [activeTab, setActiveTab] = useState<string>('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // 1. Fetch all provider branches to ensure none are missed
      const { data: branchRows, error: branchError } = await supabase
        .from('provider_branches')
        .select('name')
        .eq('is_active', true)
        .order('name')
        
      if (branchError) throw branchError

      // 2. Fetch daily report settings to get operational categories per branch
      const { data: settingsData, error: settingsError } = await supabase
        .from('daily_report_settings')
        .select('branch_name, settings')
      
      if (settingsError) throw settingsError

      const parsedBranches: BranchData[] = []
      const allBranchNames = branchRows ? branchRows.map(b => b.name) : []
      
      for (const branchName of allBranchNames) {
        const row = (settingsData || []).find(r => r.branch_name === branchName)
        
        let parsed = row?.settings || {}
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed)
          } catch {
            parsed = {}
          }
        }
        
        let cats: string[] = []
        if (parsed?.cashOut?.categories && Array.isArray(parsed.cashOut.categories)) {
          cats = parsed.cashOut.categories.filter((c: any) => typeof c === 'string' && c.trim() !== '')
        }
        
        // If no categories, provide some defaults as fallback so mapping is still possible
        if (cats.length === 0) {
          cats = ['Petty cash', 'Maintenance', 'Misc']
        }
        
        parsedBranches.push({
          branchName: branchName,
          categories: [...new Set(cats)] // unique
        })
      }

      setBranchesData(parsedBranches)
      if (parsedBranches.length > 0) {
        setActiveTab(parsedBranches[0].branchName)
      }

      // 2. Fetch existing mappings
      const { data: mappingData, error: mappingError } = await supabase
        .from('fin_cashout_category_mapping')
        .select('*')
      
      if (mappingError) throw mappingError

      setMappings(mappingData || [])
    } catch (err: any) {
      console.error('Error fetching data for mapping modal', err)
      alert((language === 'vi' ? 'Lỗi khi tải dữ liệu: ' : 'Error loading data: ') + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleMappingChange = (branchName: string, categoryName: string, accountId: string) => {
    setMappings(prev => {
      const existingIdx = prev.findIndex(m => m.branch_name === branchName && m.category_name === categoryName)
      if (existingIdx >= 0) {
        const next = [...prev]
        next[existingIdx] = { ...next[existingIdx], account_id: accountId || null }
        return next
      } else {
        return [...prev, { branch_name: branchName, category_name: categoryName, account_id: accountId || null }]
      }
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Upsert all modified mappings
      const recordsToUpsert = mappings.filter(m => m.account_id !== null).map(m => ({
        ...(m.id ? { id: m.id } : {}),
        branch_name: m.branch_name,
        category_name: m.category_name,
        account_id: m.account_id
      }))

      if (recordsToUpsert.length > 0) {
        const { error } = await supabase
          .from('fin_cashout_category_mapping')
          .upsert(recordsToUpsert, { onConflict: 'branch_name,category_name' })
        
        if (error) throw error
      }
      
      onClose()
    } catch (err: any) {
      console.error('Error saving mappings', err)
      alert((language === 'vi' ? 'Lỗi khi lưu ánh xạ: ' : 'Error saving mappings: ') + err.message)
    } finally {
      setSaving(false)
    }
  }

  const activeBranchData = branchesData.find(b => b.branchName === activeTab)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <ArrowsRightLeftIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {language === 'vi' ? 'Ánh xạ danh mục hoạt động' : 'Map Operational Categories'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {language === 'vi' ? 'Liên kết các danh mục chi tiền mặt với Hệ thống tài khoản' : 'Link Cashout categories to Chart of Accounts'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex justify-center items-center p-12">
            <CircularLoader />
          </div>
        ) : branchesData.length === 0 ? (
          <div className="flex-1 p-8 text-center text-slate-500">
            {language === 'vi' 
              ? 'Không tìm thấy cài đặt chi nhánh nào. Vui lòng đảm bảo báo cáo hàng ngày đã được cấu hình.' 
              : 'No branch settings found. Please ensure daily reports are configured.'}
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            
            {/* Sidebar Tabs */}
            <div className="md:w-64 border-r border-slate-100 bg-slate-50 flex-shrink-0 overflow-y-auto">
              <div className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {language === 'vi' ? 'Chi nhánh' : 'Branches'}
              </div>
              <ul className="flex flex-col px-2 pb-4 space-y-1">
                {branchesData.map(b => (
                  <li key={b.branchName}>
                    <button
                      onClick={() => setActiveTab(b.branchName)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                        activeTab === b.branchName 
                          ? 'bg-white text-blue-700 shadow-sm border border-slate-200' 
                          : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 border border-transparent'
                      }`}
                    >
                      {b.branchName}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Mappings Form */}
            <div className="flex-1 overflow-y-auto bg-white p-6">
              {activeBranchData && (
                <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">
                    {language === 'vi' ? `Danh mục của ${activeBranchData.branchName}` : `Categories for ${activeBranchData.branchName}`}
                  </h4>
                  
                  {activeBranchData.categories.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">
                      {language === 'vi' ? 'Không tìm thấy danh mục hoạt động nào cho chi nhánh này.' : 'No operational categories found for this branch.'}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {activeBranchData.categories.map(cat => {
                        const currentMapping = mappings.find(m => m.branch_name === activeBranchData.branchName && m.category_name === cat)
                        const accountId = currentMapping?.account_id || ''

                        return (
                          <div key={cat} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition bg-slate-50/50">
                            <div className="sm:w-1/3 flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-800">{cat}</span>
                              {accountId ? (
                                <CheckIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" title="Mapped" />
                              ) : null}
                            </div>
                            <div className="flex-1 min-w-0">
                              <COACombobox
                                coas={accounts}
                                value={accountId}
                                onChange={(id) => handleMappingChange(activeBranchData.branchName, cat, id)}
                                placeholder={language === 'vi' ? 'Chọn tài khoản để ánh xạ...' : 'Select Account to Map...'}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition"
          >
            {t(language, 'Cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="px-5 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition flex items-center justify-center min-w-[120px]"
          >
            {saving ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (language === 'vi' ? 'Lưu ánh xạ' : 'Save Mappings')}
          </button>
        </div>
      </div>
    </div>
  )
}
